/**
 * The review queue behind the host console.
 *
 * Every query here is scoped by host_id. A reviewer at Samui Municipality must
 * never see, let alone decide, a submission for Ocean Lab's coral quest.
 *
 * The console's job is not to display a photo - it is to let a reviewer decide
 * quickly and correctly. So each item carries the checks a human would
 * otherwise have to do by eye, and each is presented as a SIGNAL, never a
 * verdict: the host decides, the software only shows its work.
 */

import {
  assistToCheck, isRejectionReasonKey, type Assist, type RejectionReasonKey,
} from '@chivago/core';
import { assistStateFor } from './assist-service.ts';
import { distanceMetres } from './quest-service.ts';
import { row, rows, type DB } from './db.ts';

/** The design promises "verified by host within 24h". */
export const SLA_HOURS = 24;

export type CheckStatus = 'pass' | 'warn' | 'fail' | 'unknown';

/**
 * A check result.
 *
 * Carries a KEY plus the numbers, never a finished sentence. This service used
 * to format English prose, which meant a Thai reviewer got Thai labels above
 * English explanations - and the explanation is the part they actually read.
 * Rendering belongs in the view, where the locale is known.
 */
export interface ReviewCheck {
  key: string;
  status: CheckStatus;
  /** i18n key for the explanation. */
  detailKey: string;
  /** Values interpolated into the explanation. */
  params: Record<string, string | number>;
}

export interface ReviewPhoto {
  id: string;
  url: string;
  lat: number | null;
  lng: number | null;
  takenAt: string | null;
  /** Metres from the quest site, when the photo carries a geotag. */
  distanceM: number | null;
  /**
   * True when the location above was read out of the file by the server
   * rather than taken from what the app said (photo-forensics.ts).
   */
  locationFromFile: boolean;
}

export interface ReviewItem {
  proofId: string;
  questId: string;
  questCode: string;
  questName: string;
  /** The quest's Thai name and place, when it has them; the console picks by locale. */
  questNameTh: string | null;
  questWhereTh: string | null;
  questWhere: string;
  rewardPoints: number;
  rewardCurrency: 'trip' | 'green';
  /** EXP the approval grants: reward_exp, or the points when it has none (quest-service.ts). */
  rewardExp: number;
  geofenceRadiusM: number;
  userId: string;
  submittedAt: string;
  weightKg: number | null;
  photos: ReviewPhoto[];
  checks: ReviewCheck[];
  /** Hours waiting. Drives the SLA badge. */
  waitingHours: number;
  overdue: boolean;
  /** Prior rejections for this user across all of THIS host's quests. */
  priorRejections: number;
  priorApprovals: number;
  arrivedAt: string | null;
  /** Party members who were in the fence when this was taken. Approving pays them too. */
  partyPresent: string[];
  /**
   * The AI's opinion, when it has one (docs/64). Read through this item, so
   * it inherits the host scoping every query here has.
   */
  assist: Assist | null;
}

interface ProofRow {
  id: string; user_id: string; quest_id: string; weight_kg: number | null;
  submitted_at: string; quest_code: string; quest_name: string; quest_where: string;
  quest_name_th: string | null; quest_where_th: string | null;
  reward_currency: string; reward_exp: number | null;
  reward_points: number; geofence_radius_m: number; quest_lat: number; quest_lng: number;
  arrived_at: string | null; party_present: string | null;
}

const PROOF_SELECT = `
  SELECT p.id, p.user_id, p.quest_id, p.weight_kg, p.submitted_at, p.party_present,
         q.code AS quest_code, q.name_en AS quest_name, q.where_label AS quest_where,
         q.name_th AS quest_name_th, q.where_label_th AS quest_where_th,
         q.reward_currency, q.reward_exp,
         q.reward_points, q.geofence_radius_m, q.lat AS quest_lat, q.lng AS quest_lng,
         qp.arrived_at
  FROM proofs p
  JOIN quests q ON q.id = p.quest_id
  LEFT JOIN quest_progress qp ON qp.quest_id = p.quest_id AND qp.user_id = p.user_id`;

const hoursBetween = (from: string, to: Date): number =>
  (to.getTime() - new Date(from).getTime()) / 3_600_000;

/**
 * Build the geotag check.
 *
 * This is the single most useful thing the console does. A photo whose EXIF
 * location is 11 km from the beach is not proof of a beach cleanup, and no
 * reviewer should have to work that out from a map.
 *
 * Absent geotags are `unknown`, never `fail` - plenty of phones strip EXIF, and
 * penalising a volunteer for their privacy settings would be both unfair and a
 * good way to lose volunteers.
 */
function geotagCheck(photos: ReviewPhoto[], radiusM: number): ReviewCheck {
  const located = photos.filter((p) => p.distanceM !== null);
  if (located.length === 0) {
    return { key: 'geotag', status: 'unknown', detailKey: 'geotagNone', params: {} };
  }
  const worst = Math.round(Math.max(...located.map((p) => p.distanceM!)));
  if (worst <= radiusM) {
    return {
      key: 'geotag', status: 'pass', detailKey: 'geotagPass',
      params: { radius: radiusM, worst },
    };
  }
  // Just outside the fence is ordinary GPS drift near buildings or tree cover.
  const drift = worst <= radiusM * 2;
  return {
    key: 'geotag',
    status: drift ? 'warn' : 'fail',
    detailKey: drift ? 'geotagWarn' : 'geotagFail',
    params: { radius: radiusM, worst },
  };
}

/**
 * Did the photos get taken after the volunteer checked in?
 * A photo timestamped before arrival is a photo from somewhere else, or from a
 * previous day.
 */
function timingCheck(photos: ReviewPhoto[], arrivedAt: string | null): ReviewCheck {
  const timed = photos.filter((p) => p.takenAt);
  if (!arrivedAt || timed.length === 0) {
    return { key: 'timing', status: 'unknown', detailKey: 'timingNone', params: {} };
  }
  const arrival = new Date(arrivedAt).getTime();
  const earliest = Math.min(...timed.map((p) => new Date(p.takenAt!).getTime()));
  const minutesBefore = Math.round((arrival - earliest) / 60_000);

  if (minutesBefore <= 5) {
    return { key: 'timing', status: 'pass', detailKey: 'timingPass', params: {} };
  }
  return {
    key: 'timing',
    status: minutesBefore <= 60 ? 'warn' : 'fail',
    detailKey: 'timingBefore',
    params: { minutes: minutesBefore },
  };
}

/** Is the claimed weight plausible for the duration? Advisory only. */
function weightCheck(weightKg: number | null): ReviewCheck {
  if (weightKg === null) {
    return { key: 'weight', status: 'unknown', detailKey: 'weightNone', params: {} };
  }
  if (weightKg <= 0) {
    return { key: 'weight', status: 'fail', detailKey: 'weightInvalid', params: {} };
  }
  if (weightKg > 100) {
    return { key: 'weight', status: 'warn', detailKey: 'weightHigh', params: { kg: weightKg } };
  }
  return { key: 'weight', status: 'pass', detailKey: 'weightOk', params: { kg: weightKg } };
}

/**
 * One proof's photo rows, both halves: what the app said, and what the server
 * read out of the file.
 */
interface PhotoRow {
  id: string; lat: number | null; lng: number | null; taken_at: string | null;
  exif_lat: number | null; exif_lng: number | null; exif_taken_at: string | null;
  sha256: string | null;
}

const photoRows = (db: DB, proofId: string): PhotoRow[] => rows<PhotoRow>(
  db.prepare(
    `SELECT id, lat, lng, taken_at, exif_lat, exif_lng, exif_taken_at, sha256
       FROM proof_files WHERE proof_id = ? ORDER BY uploaded_at`,
  ).all(proofId),
);

/**
 * Photos for one proof, with distance from the quest site computed.
 *
 * THE FILE OUTRANKS THE CLAIM. Where the server could read a location or an
 * instant out of the bytes, that is what the checks below see; the client's
 * `meta` is the fallback for the stripped files that are most of them
 * (photo-forensics.ts). Rows written before the fingerprint landed carry no
 * EXIF columns, so they fall back and behave exactly as they always did.
 *
 * `exif_taken_at` is only ever set when the file also recorded the offset
 * that makes it a real instant - a zone-less wall clock would fail a
 * traveller whose camera is still on their own country's time.
 */
function photosFor(
  db: DB,
  rawPhotos: PhotoRow[],
  site: { lat: number; lng: number },
): ReviewPhoto[] {
  return rawPhotos.map((f) => {
    const fromFile = f.exif_lat !== null && f.exif_lng !== null;
    const lat = fromFile ? f.exif_lat : f.lat;
    const lng = fromFile ? f.exif_lng : f.lng;
    return {
      id: f.id,
      url: `/console/photo/${f.id}`,
      lat,
      lng,
      takenAt: f.exif_taken_at ?? f.taken_at,
      locationFromFile: fromFile,
      distanceM:
        lat !== null && lng !== null
          ? distanceMetres({ lat, lng }, site)
          : null,
    };
  });
}

/**
 * Has this photograph been handed in before?
 *
 * Two ways one picture is recognised again, and neither is something the
 * phone can talk its way out of:
 *
 *   - THE SAME BYTES. A SHA-256 the server computed over the file it stored.
 *     The literal case of "ถ่ายรูปขยะกองเดิมส่งซ้ำ": the same file, sent twice.
 *   - THE SAME SHUTTER. One camera cannot record two photographs at the same
 *     instant, so the same body and the same EXIF moment is one original that
 *     has been re-saved, cropped or filtered between submissions.
 *
 * SCOPED TO THIS HOST, deliberately, and this is a real limit rather than an
 * oversight. `historyFor` below explains why nothing here crosses hosts: a
 * cross-host lookup would be a quiet way to build a reputation file nobody
 * agreed to. The cost is that the same photograph sent to two different
 * hosts is not caught, and that is the owner's call to change, not this
 * function's.
 *
 * A match is a SIGNAL. There are honest reasons for one - a host re-opening
 * a submission, a volunteer resending after a rejection - so the reviewer is
 * told what was found and when, and decides.
 */
function reuseCheck(
  db: DB, hostId: string, proofId: string, rawPhotos: PhotoRow[],
): ReviewCheck {
  // Nothing was fingerprinted: every row here predates photo-forensics.ts.
  if (!rawPhotos.some((f) => f.sha256)) {
    return { key: 'reuse', status: 'unknown', detailKey: 'reuseUnknown', params: {} };
  }
  const matches = rows<{ other_proof: string; other_at: string; identical: number }>(
    db.prepare(
      `SELECT other.proof_id AS other_proof, p2.submitted_at AS other_at,
              CASE WHEN other.sha256 = mine.sha256 THEN 1 ELSE 0 END AS identical
         FROM proof_files mine
         JOIN proof_files other
           ON other.id <> mine.id
          AND (
            (mine.sha256 IS NOT NULL AND other.sha256 = mine.sha256)
            OR (mine.camera IS NOT NULL AND mine.exif_moment IS NOT NULL
                AND other.camera = mine.camera AND other.exif_moment = mine.exif_moment)
          )
         JOIN proofs p2 ON p2.id = other.proof_id
         JOIN quests q2 ON q2.id = p2.quest_id
        WHERE mine.proof_id = ? AND q2.host_id = ?
        ORDER BY p2.submitted_at`,
    ).all(proofId, hostId),
  );

  const elsewhere = matches.filter((m) => m.other_proof !== proofId);
  if (elsewhere.length > 0) {
    const first = elsewhere[0]!;
    return {
      key: 'reuse',
      status: 'fail',
      detailKey: first.identical ? 'reuseSameFile' : 'reuseSameShutter',
      params: { when: first.other_at.slice(0, 10), count: elsewhere.length },
    };
  }
  if (matches.length > 0) {
    return { key: 'reuse', status: 'warn', detailKey: 'reuseInThisProof', params: {} };
  }
  return { key: 'reuse', status: 'pass', detailKey: 'reuseNone', params: {} };
}

/**
 * Does the file back up what the app said about it?
 *
 * The app reads EXIF on the device and sends it alongside the upload, because
 * re-encoding there strips it. That is the only way to get it off most
 * phones, and it is also a JSON field a tampered client writes freely. When
 * the uploaded file turns out to have kept its own GPS, the two can be put
 * side by side - and they should agree, because they started as the same
 * reading.
 *
 * Unknown when the file kept nothing, which is the ordinary case and must
 * never read as a finding.
 */
const META_TOLERANCE_M = 100;

function sourceCheck(rawPhotos: PhotoRow[]): ReviewCheck {
  const withFile = rawPhotos.filter((f) => f.exif_lat !== null && f.exif_lng !== null);
  if (withFile.length === 0) {
    return { key: 'source', status: 'unknown', detailKey: 'sourceNone', params: {} };
  }
  const gaps = withFile
    .filter((f) => f.lat !== null && f.lng !== null)
    .map((f) => distanceMetres(
      { lat: f.exif_lat!, lng: f.exif_lng! },
      { lat: f.lat!, lng: f.lng! },
    ));
  const worst = gaps.length ? Math.round(Math.max(...gaps)) : 0;
  if (worst > META_TOLERANCE_M) {
    return {
      key: 'source', status: 'fail', detailKey: 'sourceMismatch', params: { metres: worst },
    };
  }
  return {
    key: 'source', status: 'pass', detailKey: 'sourceConfirmed', params: { count: withFile.length },
  };
}

/**
 * This volunteer's history WITH THIS HOST.
 *
 * Deliberately scoped to the host rather than global: a reviewer at Samui
 * Municipality has no business seeing someone's record with a hotel partner,
 * and a cross-host reputation number would be a quiet way to build a
 * blocklist nobody agreed to.
 */
function historyFor(db: DB, hostId: string, userId: string, excludeProofId: string) {
  const r = row<{ approvals: number; rejections: number }>(
    db
      .prepare(
        `SELECT
           SUM(CASE WHEN p.approved = 1 THEN 1 ELSE 0 END) AS approvals,
           SUM(CASE WHEN p.approved = 0 THEN 1 ELSE 0 END) AS rejections
         FROM proofs p
         JOIN quests q ON q.id = p.quest_id
         WHERE q.host_id = ? AND p.user_id = ? AND p.id != ? AND p.reviewed_at IS NOT NULL`,
      )
      .get(hostId, userId, excludeProofId),
  );
  return { priorApprovals: r?.approvals ?? 0, priorRejections: r?.rejections ?? 0 };
}

function toReviewItem(db: DB, hostId: string, p: ProofRow, now: Date): ReviewItem {
  const site = { lat: p.quest_lat, lng: p.quest_lng };
  const rawPhotos = photoRows(db, p.id);
  const photos = photosFor(db, rawPhotos, site);
  const history = historyFor(db, hostId, p.user_id, p.id);
  const waitingHours = hoursBetween(p.submitted_at, now);
  let partyIds: string[] = [];
  try { partyIds = p.party_present ? (JSON.parse(p.party_present) as string[]) : []; } catch { partyIds = []; }
  const partyPresent = partyIds.length === 0 ? [] : rows<{ display_name: string }>(
    db.prepare(`SELECT display_name FROM users WHERE id IN (${partyIds.map(() => '?').join(',')})`).all(...partyIds),
  ).map((r) => r.display_name);
  const assistState = assistStateFor(db, p.id) ?? { status: 'off' as const };

  return {
    partyPresent,
    assist: assistState.status === 'done' ? assistState.assist : null,
    proofId: p.id,
    questId: p.quest_id,
    questCode: p.quest_code,
    questName: p.quest_name,
    questNameTh: p.quest_name_th,
    questWhereTh: p.quest_where_th,
    questWhere: p.quest_where,
    rewardPoints: p.reward_points,
    rewardCurrency: p.reward_currency === 'trip' ? 'trip' : 'green',
    rewardExp: p.reward_exp ?? p.reward_points,
    geofenceRadiusM: p.geofence_radius_m,
    userId: p.user_id,
    submittedAt: p.submitted_at,
    weightKg: p.weight_kg,
    photos,
    checks: [
      geotagCheck(photos, p.geofence_radius_m),
      timingCheck(photos, p.arrived_at),
      // Read off the bytes, not off the phone. Both of these are new signals
      // rather than replacements: the two above still answer the questions a
      // reviewer asks first.
      reuseCheck(db, hostId, p.id, rawPhotos),
      sourceCheck(rawPhotos),
      weightCheck(p.weight_kg),
      assistToCheck(assistState),
    ],
    waitingHours,
    overdue: waitingHours > SLA_HOURS,
    ...history,
    arrivedAt: p.arrived_at,
  };
}

/**
 * The pending queue for one host.
 *
 * Ordered oldest-first: the design promises review within 24 hours, so the
 * submission closest to breaching that is the one a reviewer should open next.
 * Sorting newest-first would quietly starve the oldest item forever.
 */
export function pendingQueue(db: DB, hostId: string, now = new Date()): ReviewItem[] {
  const list = rows<ProofRow>(
    db
      .prepare(
        `${PROOF_SELECT}
         WHERE q.host_id = ? AND p.reviewed_at IS NULL
         ORDER BY p.submitted_at ASC`,
      )
      .all(hostId),
  );
  return list.map((p) => toReviewItem(db, hostId, p, now));
}

/** One submission, or null if it does not exist OR belongs to another host. */
export function reviewItem(
  db: DB,
  hostId: string,
  proofId: string,
  now = new Date(),
): ReviewItem | null {
  const found = row<ProofRow>(
    db.prepare(`${PROOF_SELECT} WHERE p.id = ? AND q.host_id = ?`).get(proofId, hostId),
  );
  return found ? toReviewItem(db, hostId, found, now) : null;
}

export interface DecidedItem {
  proofId: string;
  questName: string;
  userId: string;
  approved: boolean;
  reviewedAt: string;
  reviewedBy: string | null;
  reviewNote: string | null;
  /** Preset reason KEY, rendered in whichever language the reviewer is using. */
  reasonKey: RejectionReasonKey | null;
  rewardPoints: number;
  questNameTh: string | null;
  rewardCurrency: 'trip' | 'green';
  rewardExp: number;
}

/** Recently decided submissions - the audit trail, visible to the host. */
export function recentDecisions(db: DB, hostId: string, limit = 30): DecidedItem[] {
  return rows<{
    id: string; quest_name: string; user_id: string; approved: number;
    reviewed_at: string; reviewed_by: string | null; review_note: string | null;
    reason_key: string | null; reward_points: number;
    quest_name_th: string | null; reward_currency: string; reward_exp: number | null;
  }>(
    db
      .prepare(
        `SELECT p.id, q.name_en AS quest_name, p.user_id, p.approved, p.reviewed_at,
                p.reviewed_by, p.review_note, p.reason_key, q.reward_points,
                q.name_th AS quest_name_th, q.reward_currency, q.reward_exp
         FROM proofs p JOIN quests q ON q.id = p.quest_id
         WHERE q.host_id = ? AND p.reviewed_at IS NOT NULL
         ORDER BY p.reviewed_at DESC LIMIT ?`,
      )
      .all(hostId, limit),
  ).map((r) => ({
    proofId: r.id,
    questName: r.quest_name,
    userId: r.user_id,
    approved: r.approved === 1,
    reviewedAt: r.reviewed_at,
    reviewedBy: r.reviewed_by,
    reviewNote: r.review_note,
    reasonKey: isRejectionReasonKey(r.reason_key) ? r.reason_key : null,
    rewardPoints: r.reward_points,
    questNameTh: r.quest_name_th,
    rewardCurrency: r.reward_currency === 'trip' ? 'trip' : 'green',
    rewardExp: r.reward_exp ?? r.reward_points,
  }));
}

/** Queue counters for the console header. */
export function queueStats(db: DB, hostId: string, now = new Date()) {
  const queue = pendingQueue(db, hostId, now);
  return {
    pending: queue.length,
    overdue: queue.filter((i) => i.overdue).length,
    oldestHours: queue.length > 0 ? Math.floor(queue[0]!.waitingHours) : 0,
  };
}
