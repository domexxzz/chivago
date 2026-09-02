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
import { isRejectionReasonKey, rejectionMessage, type QuestCounts, type ProofPhoto, type Balances, type Currency, type QuestProgress, type QuestStage,
  type RejectionReasonKey } from '@chivago/core';
import { awardQuestReward, getBalances } from './wallet-service.ts';
import { enqueue } from './notification-service.ts';

export class InvalidTransition extends Error {
  constructor(from: QuestStage | null, to: QuestStage) {
    super(`invalid quest transition: ${from ?? 'none'} -> ${to}`);
    this.name = 'InvalidTransition';
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
              rejected_at, rejection_reason, rejection_reason_key
       FROM quest_progress WHERE user_id = ? AND quest_id = ?`,
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
                rejected_at, rejection_reason, rejection_reason_key
         FROM quest_progress WHERE user_id = ?`,
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
  position: { lat: number; lng: number },
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
  if (distance > quest.geofence_radius_m) {
    throw new OutsideGeofence(distance, quest.geofence_radius_m);
  }

  db.prepare(
    `UPDATE quest_progress SET stage = 'arrived', arrived_at = ?
     WHERE user_id = ? AND quest_id = ?`,
  ).run(new Date().toISOString(), userId, questId);
  return getProgress(db, userId, questId)!;
}

export interface ProofInput {
  photos: ProofPhoto[];
  weightKg: number | null;
}

/**
 * Submit proof and hand it to the host queue.
 *
 * Moves straight through `proof_submitted` into `host_verification`: from the
 * user's point of view submitting IS entering review, and holding a separate
 * intermediate state would only create a screen nobody can act on.
 */
export function submitProof(
  db: DB,
  userId: string,
  questId: string,
  input: ProofInput,
): { progress: QuestProgress; proofId: string } {
  const progress = getProgress(db, userId, questId);
  if (!progress || !ALLOWED[progress.stage].includes('proof_submitted')) {
    throw new InvalidTransition(progress?.stage ?? null, 'proof_submitted');
  }
  if (input.photos.length === 0) {
    throw new Error('proof requires at least one photo');
  }

  const now = new Date().toISOString();
  const proofId = randomUUID();

  return transact(db, () => {
    db.prepare(
      `INSERT INTO proofs (id, user_id, quest_id, photos, weight_kg, submitted_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(proofId, userId, questId, JSON.stringify(input.photos), input.weightKg, now);

    db.prepare(
      `UPDATE quest_progress
       SET stage = 'host_verification', proof_submitted_at = ?,
           rejected_at = NULL, rejection_reason = NULL, rejection_reason_key = NULL
       WHERE user_id = ? AND quest_id = ?`,
    ).run(now, userId, questId);

    return { progress: getProgress(db, userId, questId)!, proofId };
  });
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
      // arrival still stands - they were there.
      db.prepare(
        `UPDATE quest_progress SET stage = 'arrived', rejected_at = ?,
           rejection_reason = ?, rejection_reason_key = ?
         WHERE user_id = ? AND quest_id = ?`,
      ).run(now, args.reviewNote ?? null, args.reasonKey ?? null, args.userId, args.questId);

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
