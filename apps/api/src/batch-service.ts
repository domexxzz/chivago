/**
 * Bulk take-down, with a second approver.
 *
 * The per-moderator cap (30 an hour) contains a compromised account, and makes
 * a genuine spam wave of a hundred reviews take four hours to clear. This is
 * the way out that does not simply raise the cap: one moderator proposes, a
 * DIFFERENT one approves, and the batch then executes without the individual
 * limit.
 *
 * WHAT THIS IS NOT. It is a procedural control, not a cryptographic one. Two
 * console keys and two invented names would defeat it. What it buys is a speed
 * bump and an audit trail with two names on it — worth saying plainly rather
 * than dressing up as security.
 *
 * The incentive detail that matters most: hides made through an approved batch
 * do NOT count toward the moderator watch's volume rules. They were reviewed by
 * a second human, and if using the safe path made you look worse on the watch
 * than acting alone, nobody would use it. They DO still count toward the
 * overturn rate — if a batch was wrong, that is precisely what should surface.
 */

import { randomUUID } from 'node:crypto';
import { BATCH_EXPIRY_HOURS, BATCH_MAX_REVIEWS, isModerationReasonKey } from '@chivago/core';
import type { ModerationReasonKey } from '@chivago/core';
import { row, rows, transact, type DB } from './db.ts';
import { hideReview, type ModerationItem } from './place-review-service.ts';

export class BatchTooLarge extends Error {
  constructor(size: number) {
    super(`a batch may hold at most ${BATCH_MAX_REVIEWS} reviews, got ${size}`);
    this.name = 'BatchTooLarge';
  }
}

export class BatchEmpty extends Error {
  constructor() {
    super('a batch needs at least one review');
    this.name = 'BatchEmpty';
  }
}

/** Thrown when the approver is the proposer. The whole point is two people. */
export class SameApprover extends Error {
  constructor() {
    super('a batch must be approved by somebody other than its proposer');
    this.name = 'SameApprover';
  }
}

export type BatchStatus = 'pending' | 'approved' | 'cancelled' | 'expired';

export interface ReviewBatch {
  id: string;
  reasonKey: ModerationReasonKey;
  note: string | null;
  reviewIds: string[];
  proposedBy: string;
  proposedAt: string;
  expiresAt: string;
  approvedBy: string | null;
  approvedAt: string | null;
  executedAt: string | null;
  status: BatchStatus;
  /** Counted after execution, never assumed. Null until then. */
  hiddenCount: number | null;
}

interface BatchRow {
  id: string;
  reason_key: string;
  note: string | null;
  review_ids: string;
  proposed_by: string;
  proposed_at: string;
  expires_at: string;
  approved_by: string | null;
  approved_at: string | null;
  executed_at: string | null;
  status: string;
  hidden_count: number | null;
}

const toBatch = (r: BatchRow, now: Date): ReviewBatch => ({
  id: r.id,
  reasonKey: r.reason_key as ModerationReasonKey,
  note: r.note,
  reviewIds: JSON.parse(r.review_ids) as string[],
  proposedBy: r.proposed_by,
  proposedAt: r.proposed_at,
  expiresAt: r.expires_at,
  approvedBy: r.approved_by,
  approvedAt: r.approved_at,
  executedAt: r.executed_at,
  // Expiry is derived on read rather than swept. A proposal that lapsed at 3am
  // is expired at 3am, not whenever a ticker next happened to look.
  status:
    r.status === 'pending' && r.expires_at <= now.toISOString()
      ? 'expired'
      : (r.status as BatchStatus),
  hiddenCount: r.hidden_count,
});

/**
 * Propose a batch.
 *
 * The review ids are frozen here. Resolving them at approval time instead would
 * let the set drift between what was agreed and what was executed, which is the
 * one thing an approval must not allow.
 */
export function proposeBatch(
  db: DB,
  args: {
    reviewIds: string[];
    reasonKey: ModerationReasonKey;
    note?: string | null;
    proposedBy: string;
    now?: Date;
  },
): ReviewBatch {
  if (!isModerationReasonKey(args.reasonKey)) throw new BatchEmpty();
  const ids = [...new Set(args.reviewIds)].filter((id) => id.length > 0);
  if (ids.length === 0) throw new BatchEmpty();
  if (ids.length > BATCH_MAX_REVIEWS) throw new BatchTooLarge(ids.length);

  const now = args.now ?? new Date();
  const id = randomUUID();
  const proposedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + BATCH_EXPIRY_HOURS * 3_600_000).toISOString();

  db.prepare(
    `INSERT INTO review_batches
       (id, reason_key, note, review_ids, proposed_by, proposed_at, expires_at)
     VALUES (?,?,?,?,?,?,?)`,
  ).run(id, args.reasonKey, args.note?.trim().slice(0, 500) || null,
        JSON.stringify(ids), args.proposedBy, proposedAt, expiresAt);

  return {
    id, reasonKey: args.reasonKey, note: args.note?.trim().slice(0, 500) || null,
    reviewIds: ids, proposedBy: args.proposedBy, proposedAt, expiresAt,
    approvedBy: null, approvedAt: null, executedAt: null,
    status: 'pending', hiddenCount: null,
  };
}

export const getBatch = (db: DB, id: string, now = new Date()): ReviewBatch | null => {
  const found = row<BatchRow>(db.prepare('SELECT * FROM review_batches WHERE id = ?').get(id));
  return found ? toBatch(found, now) : null;
};

/** Proposals still awaiting a second pair of eyes. Expired ones are excluded. */
export const pendingBatches = (db: DB, now = new Date()): ReviewBatch[] =>
  rows<BatchRow>(
    db
      .prepare("SELECT * FROM review_batches WHERE status = 'pending' ORDER BY proposed_at ASC")
      .all(),
  )
    .map((r) => toBatch(r, now))
    .filter((b) => b.status === 'pending');

export const recentBatches = (db: DB, limit = 20, now = new Date()): ReviewBatch[] =>
  rows<BatchRow>(
    db.prepare('SELECT * FROM review_batches ORDER BY proposed_at DESC LIMIT ?').all(limit),
  ).map((r) => toBatch(r, now));

/** Withdraw a proposal. Anybody with the desk may; it removes power, never adds. */
export function cancelBatch(db: DB, id: string, now = new Date()): ReviewBatch | null {
  const batch = getBatch(db, id, now);
  if (!batch || batch.status !== 'pending') return null;
  db.prepare("UPDATE review_batches SET status = 'cancelled' WHERE id = ?").run(id);
  return getBatch(db, id, now);
}

export interface BatchResult {
  batch: ReviewBatch;
  /** Reviews actually taken down. Counted, never assumed. */
  hidden: number;
  /**
   * Ids in the proposal that were no longer there to hide — withdrawn by their
   * author, or already down. Reported rather than hidden, because "we removed
   * 200" when it was 197 is a small lie that erodes the record.
   */
  skipped: string[];
}

/**
 * Approve a batch and execute it.
 *
 * The approver MUST be somebody other than the proposer. That check is on the
 * reviewer name, which two console keys and two invented names would defeat —
 * it is a speed bump and an audit trail, not an authentication boundary, and
 * pretending otherwise would be the dangerous version of this feature.
 *
 * Executed inside one transaction: a half-applied batch is worse than none,
 * because nobody can tell from the outside which half.
 */
export function approveBatch(
  db: DB,
  args: { batchId: string; approver: string; now?: Date },
): BatchResult | null {
  const now = args.now ?? new Date();
  const batch = getBatch(db, args.batchId, now);
  if (!batch || batch.status !== 'pending') return null;
  if (batch.proposedBy === args.approver) throw new SameApprover();

  const stamp = now.toISOString();

  return transact(db, () => {
    const skipped: string[] = [];
    let hidden = 0;

    for (const reviewId of batch.reviewIds) {
      const result: ModerationItem | null = hideReview(db, {
        reviewId,
        reasonKey: batch.reasonKey,
        // Attributed to the PROPOSER: they made the judgement. The approver
        // authorised it, and is recorded on the batch rather than on every row.
        moderator: batch.proposedBy,
        note: batch.note,
        batchId: batch.id,
        now,
      });
      if (result === null) skipped.push(reviewId);
      else hidden += 1;
    }

    db.prepare(
      `UPDATE review_batches
       SET status = 'approved', approved_by = ?, approved_at = ?, executed_at = ?,
           hidden_count = ?
       WHERE id = ?`,
    ).run(args.approver, stamp, stamp, hidden, batch.id);

    return { batch: getBatch(db, batch.id, now)!, hidden, skipped };
  });
}

/** Just enough of a review for an approver to see what they are agreeing to. */
export interface BatchPreviewRow {
  id: string;
  placeName: string;
  rating: number;
  body: string | null;
}

/** Reviews in a proposal, for the approver to look at before agreeing. */
export function previewBatch(
  db: DB,
  batch: ReviewBatch,
  limit: number,
): BatchPreviewRow[] {
  if (batch.reviewIds.length === 0) return [];
  const ids = batch.reviewIds.slice(0, limit);
  return rows<{ id: string; place_name: string; rating: number; body: string | null }>(
    db
      .prepare(
        `SELECT r.id, p.name_en AS place_name, r.rating, r.body
         FROM place_reviews r JOIN places p ON p.id = r.place_id
         WHERE r.id IN (${ids.map(() => '?').join(',')})`,
      )
      .all(...ids),
  ).map((r) => ({
    id: r.id, placeName: r.place_name, rating: r.rating, body: r.body,
  }));
}
