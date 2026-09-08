/**
 * The quest state machine. Server-owned, per (user, quest).
 *
 * joined -> arrived -> proof_submitted -> host_verification -> complete
 *
 * The client may REQUEST a transition; only this module decides whether it
 * happened. Two transitions are gated by real-world evidence:
 *
 *  - `arrived` requires the device to be inside the quest geofence. The
 *    prototype has an "I'm at the site" button that trusts the tap.
 *  - `complete` is reachable ONLY from the host verification callback, never
 *    from a client request. That is what makes the points award trustworthy.
 *
 * The design has no rejection path. Real host review rejects submissions, so
 * `host_verification -> proof_submitted` exists with a reason attached.
 */

import { randomUUID } from 'node:crypto';
import { rows, transact, type DB } from './db.ts';
import { isRejectionReasonKey, rejectionMessage, QUEST_MIN_DWELL_MIN, type Fix, type QuestCounts, type ProofPhoto, type Balances, type Currency, type QuestProgress, type QuestStage,
  type RejectionReasonKey } from '@chivago/core';
import { assertPresence, recordFix } from './presence-service.ts';
import { fenceOff } from './fence.ts';
import { activePartyFor } from './party-service.ts';
import { awardQuestReward, getBalances } from './wallet-service.ts';
import { enqueue } from './notification-service.ts';

export class InvalidTransition extends Error {
  constructor(from: QuestStage | null, to: QuestStage) {
    super(`invalid quest transition: ${from ?? 'none'} -> ${to}`);
    this.name = 'InvalidTransition';
  }
}

/**
 * Proof filed too soon after arriving. Turf calls the missing thing
 * 'staying'; a photograph from the road is what it prices out.
 */
export class TooSoonAfterArrival extends Error {
  minutesSinceArrival: number;
  constructor(minutes: number) {
    super(`Proof came ${Math.max(0, Math.round(minutes))} min after arriving; give it at least ${QUEST_MIN_DWELL_MIN}.`);
    this.name = 'TooSoonAfterArrival';
    this.minutesSinceArrival = minutes;
  }
}

export class OutsideGeofence extends Error {
  distanceM: number;
  radiusM: number;
  constructor(distanceM: number, radiusM: number) {
    super(`outside geofence: ${Math.round(distanceM)}m from site (radius ${radiusM}m)`);
    this.name = 'OutsideGeofence';
    this.distanceM = distanceM;
    this.radiusM = radiusM;
  }
}

/**
 * Great-circle distance in metres (haversine).
 * Used for the arrival geofence, so it must be exact enough at 250 m - a
 * flat-earth approximation drifts too much near the poles to be worth the
 * saved cycles, and this runs a handful of times per user per day.
 */
export function distanceMetres(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Which stages may legally follow which. */
const ALLOWED: Record<QuestStage, QuestStage[]> = {
  joined: ['arrived'],
  arrived: ['proof_submitted'],
  proof_submitted: ['host_verification'],
  // Approval completes. A rejection moves the user back to `arrived` (see
  // resolveVerification), and it is from THERE that they resubmit - so there
  // is no path from verification straight back to a new submission. There
  // used to be, and it let one volunteer file proof after proof against a
  // quest already in the host's queue: a pile of pending rows for one piece
  // of work, all but one of them orphaned the moment any was decided.
  host_verification: ['complete'],
  complete: [],
};

interface ProgressRow {
  stage: string;
  joined_at: string | null;
  arrived_at: string | null;
  proof_submitted_at: string | null;
  verified_at: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  rejection_reason_key: string | null;
  weight_kg: number | null;
}

/**
 * Build the bilingual rejection message the app shows.
 * An unknown key degrades to the free-text note rather than crashing a quest
 * screen - a stale key from an older release must not brick the app.
 */
const toRejection = (r: ProgressRow) =>
  rejectionMessage(
    isRejectionReasonKey(r.rejection_reason_key) ? r.rejection_reason_key : null,
    r.rejection_reason,
  );

export function getProgress(db: DB, userId: string, questId: string): QuestProgress | null {
  const row = db
    .prepare(
      `SELECT stage, joined_at, arrived_at, proof_submitted_at, verified_at,
              rejected_at, rejection_reason, rejection_reason_key,
              (SELECT p.weight_kg FROM proofs p
                WHERE p.user_id = qp.user_id AND p.quest_id = qp.quest_id AND p.approved = 1
                ORDER BY p.reviewed_at DESC LIMIT 1) AS weight_kg
       FROM quest_progress qp WHERE qp.user_id = ? AND qp.quest_id = ?`,
    )
    .get(userId, questId) as unknown as ProgressRow | undefined;
  if (!row) return null;
  return {
    questId,
    userId,
    stage: row.stage as QuestStage,
    joinedAt: row.joined_at,
    arrivedAt: row.arrived_at,
    proofSubmittedAt: row.proof_submitted_at,
    verifiedAt: row.verified_at,
    weightKg: row.weight_kg ?? null,
    rejectedAt: row.rejected_at,
    rejectionReason: toRejection(row),
  };
}

/** Progress for every quest the user has touched, keyed by quest id. */
export function getAllProgress(db: DB, userId: string): Record<string, QuestProgress> {
  const list = rows<ProgressRow & { quest_id: string }>(
    db
      .prepare(
        `SELECT quest_id, stage, joined_at, arrived_at, proof_submitted_at, verified_at,
                rejected_at, rejection_reason, rejection_reason_key,
              (SELECT p.weight_kg FROM proofs p
                WHERE p.user_id = qp.user_id AND p.quest_id = qp.quest_id AND p.approved = 1
                ORDER BY p.reviewed_at DESC LIMIT 1) AS weight_kg
         FROM quest_progress qp WHERE qp.user_id = ?`,
      )
      .all(userId),
  );

  const out: Record<string, QuestProgress> = {};
  for (const r of list) {
    out[r.quest_id] = {
      questId: r.quest_id,
      userId,
      stage: r.stage as QuestStage,
      joinedAt: r.joined_at,
      arrivedAt: r.arrived_at,
      proofSubmittedAt: r.proof_submitted_at,
      verifiedAt: r.verified_at,
      weightKg: r.weight_kg ?? null,
      rejectedAt: r.rejected_at,
      rejectionReason: toRejection(r),
    };
  }
  return out;
}

/** Join a quest. Idempotent - re-joining an in-flight quest returns it unchanged. */
/**
 * What each funded quest actually produced.
 *
 * Counted from `quest_progress`, which records the timestamp of every stage
 * transition — so `verified` here is the same fact a host clicked Approve on,
 * not a status somebody set. The four counts are independent columns rather
 * than a derived stage, because a traveller who joined, arrived and was then
 * rejected has to appear in three of them and not vanish from the first two.
 */
export function questCountsFor(db: DB, questIds: string[]): QuestCounts[] {
  if (questIds.length === 0) return [];
  const holes = questIds.map(() => '?').join(',');
  const found = rows<{
    quest_id: string; joined: number; arrived: number; verified: number; rejected: number;
  }>(
    db.prepare(
      `SELECT quest_id,
              COUNT(joined_at)   AS joined,
              COUNT(arrived_at)  AS arrived,
              COUNT(verified_at) AS verified,
              COUNT(rejected_at) AS rejected
       FROM quest_progress
       WHERE quest_id IN (${holes})
       GROUP BY quest_id`,
    ).all(...questIds),
  );

  // Green Points issued for the quest, read from the ledger rather than from
  // the quest's advertised reward: a reward can be edited, a ledger row cannot.
  const points = new Map(
    rows<{ quest_id: string; total: number }>(
      db.prepare(
        `SELECT substr(l.source_ref, 7, instr(substr(l.source_ref, 7), ':') - 1) AS quest_id,
                SUM(l.amount) AS total
         FROM ledger l
         WHERE l.kind = 'quest_reward' AND l.currency = 'green'
         GROUP BY quest_id`,
      ).all(),
    ).map((r) => [r.quest_id, r.total]),
  );

  return questIds.map((id) => {
    const r = found.find((f) => f.quest_id === id);
    return {
      questId: id,
      joined: r?.joined ?? 0,
      arrived: r?.arrived ?? 0,
      verified: r?.verified ?? 0,
      rejected: r?.rejected ?? 0,
      greenPointsIssued: points.get(id) ?? 0,
    };
  });
}

export function joinQuest(db: DB, userId: string, questId: string): QuestProgress {
  const existing = getProgress(db, userId, questId);
  if (existing) return existing;

  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO quest_progress (user_id, quest_id, stage, joined_at) VALUES (?, ?, 'joined', ?)`,
  ).run(userId, questId, now);
  return getProgress(db, userId, questId)!;
}

interface QuestGeo {
  lat: number;
  lng: number;
  geofence_radius_m: number;
}

/**
 * Mark arrival. Verified against the quest geofence rather than trusting the
 * tap, because arrival is what makes the later proof credible.
 */
export function arriveAtQuest(
  db: DB,
  userId: string,
  questId: string,
  position: Fix,
  now = new Date(),
): QuestProgress {
  const progress = getProgress(db, userId, questId);
  if (!progress || !ALLOWED[progress.stage].includes('arrived')) {
    throw new InvalidTransition(progress?.stage ?? null, 'arrived');
  }

  const quest = db
    .prepare('SELECT lat, lng, geofence_radius_m FROM quests WHERE id = ?')
    .get(questId) as unknown as QuestGeo | undefined;
  if (!quest) throw new Error(`unknown quest: ${questId}`);

  const distance = distanceMetres(position, { lat: quest.lat, lng: quest.lng });
  // Unless this deployment has opened the fence on purpose. See fence.ts.
  if (!fenceOff() && distance > quest.geofence_radius_m) {
    throw new OutsideGeofence(distance, quest.geofence_radius_m);
  }
  // The second signal, after the fence. See packages/core/src/presence.ts.
  if (!fenceOff()) assertPresence(db, { userId, fix: position, radiusM: quest.geofence_radius_m, now });

  db.prepare(
    `UPDATE quest_progress SET stage = 'arrived', arrived_at = ?
     WHERE user_id = ? AND quest_id = ?`,
  ).run(now.toISOString(), userId, questId);
  recordFix(db, userId, position, now);
  return getProgress(db, userId, questId)!;
}

export interface ProofInput {
  photos: ProofPhoto[];
  weightKg: number | null;
  /**
   * Where the volunteer is NOW, at submission. Arrival proved they got
   * there; this proves they were still there when the work was done. The
   * route requires it; the service accepts its absence for tests and for a
   * client that already uploaded out of band, and enforces the dwell time
   * regardless, because that needs only the clock.
   */
  position?: Fix | null;
}

/**
 * Submit proof and hand it to the host queue.
 *
 * Moves straight through `proof_submitted` into `host_verification`: from the
 * user's point of view submitting IS entering review, and holding a separate
 * intermediate state would only create a screen nobody can act on.
 */
/**
 * How recently a party member's last fix must be, and it must be inside the
 * fence, for them to count as present on a proof another member submits.
 * Thirty minutes: the dwell is ten, and a phone in a pocket reports less
 * often than that.
 */
export const PARTY_PRESENCE_MIN = 30;

export interface PartyPresence { userId: string; displayName: string }

/**
 * The submitter's party members who are here too: an active party, a last
 * fix inside this quest's fence, taken within PARTY_PRESENCE_MIN of now,
 * and not already through this quest. The phone's word, twice over - the
 * host still decides, once, for all of them.
 */
export function partyPresentAt(db: DB, userId: string, questId: string, at = new Date()): PartyPresence[] {
  const party = activePartyFor(db, userId);
  if (!party) return [];
  const quest = db.prepare('SELECT lat, lng, geofence_radius_m FROM quests WHERE id = ?').get(questId) as unknown as QuestGeo | undefined;
  if (!quest) return [];
  const since = new Date(at.getTime() - PARTY_PRESENCE_MIN * 60_000).toISOString();
  const members = db.prepare(
    `SELECT m.user_id AS user_id, u.display_name AS display_name, f.lat, f.lng, f.at
     FROM party_members m
     JOIN users u ON u.id = m.user_id
     JOIN last_fix f ON f.user_id = m.user_id
     WHERE m.party_id = ? AND m.left_at IS NULL AND m.user_id != ? AND f.at >= ? AND f.at <= ?`,
  ).all(party.id, userId, since, at.toISOString()) as unknown as { user_id: string; display_name: string; lat: number; lng: number; at: string }[];
  return members
    .filter((m) => distanceMetres(m, { lat: quest.lat, lng: quest.lng }) <= quest.geofence_radius_m)
    .filter((m) => getProgress(db, m.user_id, questId)?.stage !== 'complete')
    .map((m) => ({ userId: m.user_id, displayName: m.display_name }));
}

export function submitProof(
  db: DB,
  userId: string,
  questId: string,
  input: ProofInput,
  at = new Date(),
): { progress: QuestProgress; proofId: string; partyPresent: PartyPresence[] } {
  const progress = getProgress(db, userId, questId);
  if (!progress || !ALLOWED[progress.stage].includes('proof_submitted')) {
    throw new InvalidTransition(progress?.stage ?? null, 'proof_submitted');
  }
  if (input.photos.length === 0) {
    throw new Error('proof requires at least one photo');
  }

  // Dwell: needs only the clock, so it is enforced whether or not a position
  // came with the proof.
  const arrivedAt = progress.arrivedAt ? Date.parse(progress.arrivedAt) : Number.NaN;
  const minutesSinceArrival = (at.getTime() - arrivedAt) / 60_000;
  if (!Number.isFinite(minutesSinceArrival) || minutesSinceArrival < QUEST_MIN_DWELL_MIN) {
    throw new TooSoonAfterArrival(minutesSinceArrival);
  }

  // A second in-fence sample, when the client sent one.
  if (input.position) {
    const quest = db
      .prepare('SELECT lat, lng, geofence_radius_m FROM quests WHERE id = ?')
      .get(questId) as unknown as QuestGeo | undefined;
    if (!quest) throw new Error(`unknown quest: ${questId}`);
    const distance = distanceMetres(input.position, { lat: quest.lat, lng: quest.lng });
    if (!fenceOff()) {
      if (distance > quest.geofence_radius_m) throw new OutsideGeofence(distance, quest.geofence_radius_m);
      assertPresence(db, { userId, fix: input.position, radiusM: quest.geofence_radius_m, now: at });
    }
  }

  const now = at.toISOString();
  const proofId = randomUUID();

  return transact(db, () => {
    if (input.position) recordFix(db, userId, input.position, at);
    // The party, present: in the fence, recently, and not already done.
    const present = partyPresentAt(db, userId, questId, at);
    db.prepare(
      `INSERT INTO proofs (id, user_id, quest_id, photos, weight_kg, submitted_at, party_present)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(proofId, userId, questId, JSON.stringify(input.photos), input.weightKg, now,
          present.length > 0 ? JSON.stringify(present.map((m) => m.userId)) : null);

    db.prepare(
      `UPDATE quest_progress
       SET stage = 'host_verification', proof_submitted_at = ?,
           rejected_at = NULL, rejection_reason = NULL, rejection_reason_key = NULL
       WHERE user_id = ? AND quest_id = ?`,
    ).run(now, userId, questId);

    // Each present member rides this proof: joined and arrived if they had
    // not, and waiting on the same host with the submitter.
    for (const m of present) {
      db.prepare(
        `INSERT INTO quest_progress (user_id, quest_id, stage, joined_at, arrived_at, proof_submitted_at)
         VALUES (?, ?, 'host_verification', ?, ?, ?)
         ON CONFLICT(user_id, quest_id) DO UPDATE SET
           stage = 'host_verification',
           arrived_at = COALESCE(quest_progress.arrived_at, excluded.arrived_at),
           proof_submitted_at = excluded.proof_submitted_at,
           rejected_at = NULL, rejection_reason = NULL, rejection_reason_key = NULL`,
      ).run(m.userId, questId, now, now, now);
    }
    return { progress: getProgress(db, userId, questId)!, proofId, partyPresent: present };
  });
}

/** Who rode a proof. */
function partyOnProof(db: DB, proofId: string): string[] {
  const found = db.prepare('SELECT party_present FROM proofs WHERE id = ?').get(proofId) as unknown as { party_present: string | null } | undefined;
  if (!found?.party_present) return [];
  try { return JSON.parse(found.party_present) as string[]; } catch { return []; }
}

export interface VerificationResult {
  progress: QuestProgress;
  /** Null when the host rejected, or when the award was already settled. */
  pointsAwarded: number | null;
  /** Which currency was paid. Null when the proof was rejected. */
  currency: Currency | null;
  balances: Balances;
}

/**
 * The host's decision. THE ONLY PATH TO `complete`, and the only place points
 * are ever awarded.
 *
 * Called by the host console or its webhook - never by the mobile client. The
 * award is idempotent on (quest, user), so a retried callback pays once.
 */
export function resolveVerification(
  db: DB,
  args: {
    userId: string;
    questId: string;
    proofId: string;
    approved: boolean;
    /** Preset reason KEY, translated per reader. Not a sentence. */
    reasonKey?: RejectionReasonKey | null;
    /** Named person who decided. Written to the audit trail. */
    reviewedBy?: string | null;
    /** The reviewer's free-text note. Shown as typed, never translated. */
    reviewNote?: string | null;
  },
): VerificationResult {
  const progress = getProgress(db, args.userId, args.questId);
  if (!progress || progress.stage !== 'host_verification') {
    throw new InvalidTransition(progress?.stage ?? null, args.approved ? 'complete' : 'proof_submitted');
  }

  const quest = db
    .prepare(
      `SELECT q.name_en, q.reward_points, q.reward_currency, h.name AS host_name
       FROM quests q JOIN hosts h ON h.id = q.host_id WHERE q.id = ?`,
    )
    .get(args.questId) as
    | { name_en: string; reward_points: number; reward_currency: string; host_name: string }
    | undefined;
  if (!quest) throw new Error(`unknown quest: ${args.questId}`);

  const now = new Date().toISOString();

  if (!args.approved) {
    transact(db, () => {
      db.prepare(
        `UPDATE proofs SET reviewed_at = ?, approved = 0, reviewed_by = ?,
           review_note = ?, reason_key = ? WHERE id = ?`,
      ).run(now, args.reviewedBy ?? null, args.reviewNote ?? null, args.reasonKey ?? null, args.proofId);
      // Back to proof_submitted so the user can retake and resubmit. Their
      // arrival still stands - they were there. The party that rode this
      // proof goes back with them: one proof, one decision.
      for (const uid of [args.userId, ...partyOnProof(db, args.proofId)]) {
        db.prepare(
          `UPDATE quest_progress SET stage = 'arrived', rejected_at = ?,
             rejection_reason = ?, rejection_reason_key = ?
           WHERE user_id = ? AND quest_id = ? AND stage = 'host_verification'`,
        ).run(now, args.reviewNote ?? null, args.reasonKey ?? null, uid, args.questId);
      }

      // In the SAME transaction as the state change. If the decision is
      // recorded, the volunteer is guaranteed to be told - sending happens
      // afterwards and can fail without losing the news.
      enqueue(db, {
        userId: args.userId,
        kind: 'quest_rejected',
        params: { host: quest.host_name, quest: quest.name_en },
        data: { screen: 'quest', questId: args.questId },
        dedupeKey: `quest-rejected:${args.proofId}`,
      });
    });
    return {
      progress: getProgress(db, args.userId, args.questId)!,
      pointsAwarded: null,
      currency: null,
      // The real balances, not zero. A rejection changes nothing about what
      // the volunteer already holds, and telling them it did would read as
      // a punishment on top of the refusal.
      balances: getBalances(db, args.userId),
    };
  }

  const movement = transact(db, () => {
    db.prepare(
      `UPDATE proofs SET reviewed_at = ?, approved = 1, reviewed_by = ?,
         review_note = ?, reason_key = NULL WHERE id = ?`,
    ).run(now, args.reviewedBy ?? null, args.reviewNote ?? null, args.proofId);
    db.prepare(
      `UPDATE quest_progress SET stage = 'complete', verified_at = ?
       WHERE user_id = ? AND quest_id = ?`,
    ).run(now, args.userId, args.questId);

    const result = awardQuestReward(db, {
      userId: args.userId,
      questId: args.questId,
      questName: quest.name_en,
      host: quest.host_name,
      points: quest.reward_points,
      // From the QUEST, never from the caller. Whether work counts as
      // environmental is a property of what was posted and verified.
      currency: quest.reward_currency as Currency,
    });
    // The party that was there: the same approval, the same award each,
    // idempotent by source_ref like the submitter's. Told the same way.
    for (const uid of partyOnProof(db, args.proofId)) {
      const theirs = getProgress(db, uid, args.questId);
      if (!theirs || theirs.stage !== 'host_verification') continue;
      db.prepare(`UPDATE quest_progress SET stage = 'complete', verified_at = ? WHERE user_id = ? AND quest_id = ?`)
        .run(now, uid, args.questId);
      awardQuestReward(db, {
        userId: uid, questId: args.questId, questName: quest.name_en, host: quest.host_name,
        points: quest.reward_points, currency: quest.reward_currency as Currency,
      });
      enqueue(db, {
        userId: uid,
        kind: 'quest_approved',
        params: { host: quest.host_name, quest: quest.name_en, points: quest.reward_points },
        data: { screen: 'wallet', questId: args.questId },
        dedupeKey: `quest-approved:${args.questId}:${uid}`,
      });
    }

    // Recorded with the award, not after it. A user who is paid but never told
    // is the exact failure this feature exists to prevent, and only one
    // transaction can guarantee they happen together.
    enqueue(db, {
      userId: args.userId,
      kind: 'quest_approved',
      params: {
        host: quest.host_name,
        quest: quest.name_en,
        points: quest.reward_points,
      },
      data: { screen: 'wallet', questId: args.questId },
      dedupeKey: `quest-approved:${args.questId}:${args.userId}`,
    });

    return result;
  });

  return {
    progress: getProgress(db, args.userId, args.questId)!,
    pointsAwarded: movement.applied ? quest.reward_points : null,
    currency: quest.reward_currency as Currency,
    balances: movement.balances,
  };
}
