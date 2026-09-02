/**
 * Traveller reviews, gated on a verified check-in.
 *
 * The deck's answer to fake reviews is "verified by a real check-in". That is
 * not a badge applied to some reviews - it is the precondition for one existing
 * at all. `mustHaveVisited` runs before anything is written, so there is no
 * unverified review in the table to distinguish from a verified one, and the
 * app can make a claim about the whole list rather than decorating rows.
 *
 * What that buys, concretely: writing a review about Chaweng requires having
 * been inside a 250 m circle around Chaweng, on a day, with the server holding
 * the ledger row that proves it. A review farm would need to physically visit.
 *
 * What it does NOT buy, and we should not pretend otherwise: a person who was
 * genuinely there can still write something false, paid, or malicious. This
 * raises the cost of fake reviews; it does not make them impossible. That is
 * why `hidden_at` exists.
 *
 * Not host review of quest proof - that is review-service.ts. Different job,
 * different actors.
 */

import { randomUUID } from 'node:crypto';
import {
  REVIEW_MAX_BODY, REVIEW_MIN_BODY_FOR_POINTS, REVIEW_TRIP_POINTS,
  isModerationReasonKey, isReportReasonKey,
  REPORT_LIMIT_PER_WINDOW, REPORT_MAX_NOTE, REPORT_WINDOW_MINUTES,
  APPEAL_MAX_MESSAGE, TAKEDOWN_LIMIT_PER_WINDOW, TAKEDOWN_WINDOW_MINUTES,
  type ModerationReasonKey, type PlaceReview, type ReportOutcome,
  type ReportReasonKey, type ReviewSummary,
} from '@chivago/core';
import { row, rows, transact, type DB } from './db.ts';
import { applyMovement } from './wallet-service.ts';
import { enqueue } from './notification-service.ts';

/** Thrown when someone tries to review a place they have never checked in at. */
export class NeverVisited extends Error {
  placeId: string;
  constructor(placeId: string) {
    super(`no check-in recorded for ${placeId}`);
    this.name = 'NeverVisited';
    this.placeId = placeId;
  }
}

/** Thrown when the rating is not a whole 1-5. */
export class InvalidRating extends Error {
  constructor(given: unknown) {
    super(`rating must be a whole number 1-5, got ${String(given)}`);
    this.name = 'InvalidRating';
  }
}

interface ReviewRow {
  id: string;
  place_id: string;
  user_id: string;
  display_name: string;
  rating: number;
  body: string | null;
  language: string;
  visited_at: string;
  created_at: string;
  updated_at: string | null;
}

const SELECT = `
  SELECT r.id, r.place_id, r.user_id, u.display_name, r.rating, r.body,
         r.language, r.visited_at, r.created_at, r.updated_at
  FROM place_reviews r JOIN users u ON u.id = r.user_id`;

const toReview = (r: ReviewRow): PlaceReview => ({
  id: r.id,
  placeId: r.place_id,
  authorId: r.user_id,
  authorName: r.display_name,
  rating: r.rating,
  body: r.body,
  language: r.language,
  visitedAt: r.visited_at,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

/**
 * The earliest check-in this user made at this place, or null.
 *
 * Read from the LEDGER rather than a separate visits table: the check-in award
 * already is the durable record of presence, and a second source of truth for
 * "were they there" is a second thing that can disagree.
 */
export function firstVisitAt(db: DB, userId: string, placeId: string): string | null {
  const prefix = `checkin:${placeId}:user:${userId}:`;
  const found = row<{ occurred_at: string }>(
    db
      .prepare(
        `SELECT occurred_at FROM ledger
         WHERE user_id = ? AND kind = 'checkin' AND source_ref LIKE ? || '%'
         ORDER BY occurred_at ASC LIMIT 1`,
      )
      .get(userId, prefix),
  );
  return found?.occurred_at ?? null;
}

export const hasVisited = (db: DB, userId: string, placeId: string): boolean =>
  firstVisitAt(db, userId, placeId) !== null;

export interface WriteReviewInput {
  userId: string;
  placeId: string;
  rating: number;
  body?: string | null;
  /** Defaults to the user's stored locale. */
  language?: string;
  now?: Date;
}

export interface WriteReviewResult {
  review: PlaceReview;
  /** False when this edited an existing review. */
  created: boolean;
  /** Trip Points paid. Zero on an edit, and zero on a rating with no words. */
  pointsAwarded: number;
}

/**
 * Write or update a review.
 *
 * Paid ONCE per place, on the first review, and only when there are words in
 * it. Editing must not be an income stream, and the points are for helping the
 * next traveller - which a lone star does not.
 *
 * The `source_ref` carries only the place and the user, deliberately: it is the
 * same key whether this is the first write or the fortieth edit, so the ledger
 * refuses a second payment without anything here having to remember.
 */
export function writeReview(db: DB, input: WriteReviewInput): WriteReviewResult {
  const { userId, placeId } = input;

  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
    throw new InvalidRating(input.rating);
  }

  const visitedAt = firstVisitAt(db, userId, placeId);
  if (!visitedAt) throw new NeverVisited(placeId);

  const body = (input.body ?? '').trim().slice(0, REVIEW_MAX_BODY) || null;
  const now = (input.now ?? new Date()).toISOString();

  return transact(db, () => {
    const existing = row<{ id: string }>(
      db.prepare('SELECT id FROM place_reviews WHERE place_id = ? AND user_id = ?')
        .get(placeId, userId),
    );

    if (existing) {
      db.prepare(
        `UPDATE place_reviews SET rating = ?, body = ?, updated_at = ?,
           language = COALESCE(?, language)
         WHERE id = ?`,
      ).run(input.rating, body, now, input.language ?? null, existing.id);
    } else {
      const locale = row<{ locale: string }>(
        db.prepare('SELECT locale FROM users WHERE id = ?').get(userId),
      )?.locale ?? 'en';
      db.prepare(
        `INSERT INTO place_reviews
           (id, place_id, user_id, rating, body, language, visited_at, created_at)
         VALUES (?,?,?,?,?,?,?,?)`,
      ).run(randomUUID(), placeId, userId, input.rating, body,
            input.language ?? locale, visitedAt, now);
    }

    let pointsAwarded = 0;
    if (body !== null && body.length >= REVIEW_MIN_BODY_FOR_POINTS) {
      const placeName = row<{ name_en: string }>(
        db.prepare('SELECT name_en FROM places WHERE id = ?').get(placeId),
      )?.name_en ?? placeId;
      const movement = applyMovement(db, {
        userId,
        label: `Review · ${placeName}`,
        subject: placeName,
        // Self-verified, like the check-in it depends on. Naming a host here
        // would put a municipality's name against something nobody reviewed.
        host: 'ChivaGo · verified visit',
        amount: REVIEW_TRIP_POINTS,
        currency: 'trip',
        kind: 'review',
        sourceRef: `review:${placeId}:user:${userId}`,
        occurredAt: now,
      });
      if (movement.applied) pointsAwarded = REVIEW_TRIP_POINTS;
    }

    const saved = row<ReviewRow>(
      db.prepare(`${SELECT} WHERE r.place_id = ? AND r.user_id = ?`).get(placeId, userId),
    )!;
    return { review: toReview(saved), created: !existing, pointsAwarded };
  });
}

/** Visible reviews for a place, newest first. Hidden rows never leave here. */
export function reviewsFor(db: DB, placeId: string, limit = 50): PlaceReview[] {
  return rows<ReviewRow>(
    db
      .prepare(
        `${SELECT} WHERE r.place_id = ? AND r.hidden_at IS NULL
         ORDER BY r.created_at DESC, r.rowid DESC LIMIT ?`,
      )
      .all(placeId, limit),
  ).map(toReview);
}

/** This user's own review of a place, so the app can offer edit instead of write. */
export function myReview(db: DB, userId: string, placeId: string): PlaceReview | null {
  const found = row<ReviewRow>(
    db.prepare(`${SELECT} WHERE r.place_id = ? AND r.user_id = ?`).get(placeId, userId),
  );
  return found ? toReview(found) : null;
}

/**
 * Withdraw your own review.
 *
 * A real removal, not a hide: this is the author taking back their own words,
 * which under PDPA they are entitled to do. The Trip Points already paid are
 * NOT clawed back - they were earned for a visit that really happened, and
 * taking them back would make withdrawing feel like a penalty.
 */
export function withdrawReview(db: DB, userId: string, placeId: string): boolean {
  const result = db
    .prepare('DELETE FROM place_reviews WHERE place_id = ? AND user_id = ?')
    .run(placeId, userId);
  return Number(result.changes) > 0;
}

/**
 * Rating roll-ups for a set of places, in ONE query.
 *
 * The place list is scored per user and already fans out to the air feed; an
 * additional query per place would turn a map pan into forty round trips.
 *
 * A place with no reviews gets `average: null`, never zero. Zero is a rating,
 * and rendering "0.0" for somewhere nobody has been yet would be a claim we
 * have no basis for.
 */
export function summariesFor(db: DB, placeIds: string[]): Map<string, ReviewSummary> {
  const empty = (): ReviewSummary => ({
    count: 0,
    average: null,
    distribution: [0, 0, 0, 0, 0],
  });

  const out = new Map<string, ReviewSummary>();
  for (const id of placeIds) out.set(id, empty());
  if (placeIds.length === 0) return out;

  const counted = rows<{ place_id: string; rating: number; n: number }>(
    db
      .prepare(
        `SELECT place_id, rating, COUNT(*) AS n
         FROM place_reviews
         WHERE hidden_at IS NULL AND place_id IN (${placeIds.map(() => '?').join(',')})
         GROUP BY place_id, rating`,
      )
      .all(...placeIds),
  );

  for (const r of counted) {
    const summary = out.get(r.place_id);
    if (!summary) continue;
    summary.distribution[r.rating - 1] = r.n;
    summary.count += r.n;
  }

  for (const summary of out.values()) {
    if (summary.count === 0) continue;
    const total = summary.distribution.reduce((acc, n, i) => acc + n * (i + 1), 0);
    summary.average = Math.round((total / summary.count) * 10) / 10;
  }

  return out;
}

/** One place's roll-up. */
export const summaryFor = (db: DB, placeId: string): ReviewSummary =>
  summariesFor(db, [placeId]).get(placeId)!;

// ---------------------------------------------------------------------------
// Moderation
//
// Gated on a ROLE, not on host scoping. See migrations.ts for why: reviews are
// about places, which no host owns, and letting any console holder hide any
// review would let a hotel partner bury a bad review of a rival's beach.
// ---------------------------------------------------------------------------

export interface ModerationItem extends PlaceReview {
  placeName: string;
  hiddenAt: string | null;
  hiddenBy: string | null;
  hiddenReasonKey: ModerationReasonKey | null;
  /** The operator's own note. Never shown to the author. */
  hiddenNote: string | null;
  /** Open reports from readers. Empty is the normal case. */
  reports: ReviewReport[];
  /** An open appeal from the author, if they answered the take-down. */
  appeal: Appeal | null;
}

interface ModerationRow extends ReviewRow {
  place_name: string;
  hidden_at: string | null;
  hidden_by: string | null;
  hidden_reason_key: string | null;
  hidden_reason: string | null;
}

const MODERATION_SELECT = `
  SELECT r.id, r.place_id, r.user_id, u.display_name, r.rating, r.body,
         r.language, r.visited_at, r.created_at, r.updated_at,
         p.name_en AS place_name,
         r.hidden_at, r.hidden_by, r.hidden_reason_key, r.hidden_reason
  FROM place_reviews r
  JOIN users u ON u.id = r.user_id
  JOIN places p ON p.id = r.place_id`;

const toModerationItem = (r: ModerationRow): ModerationItem => ({
  ...toReview(r),
  placeName: r.place_name,
  hiddenAt: r.hidden_at,
  hiddenBy: r.hidden_by,
  hiddenReasonKey: isModerationReasonKey(r.hidden_reason_key) ? r.hidden_reason_key : null,
  hiddenNote: r.hidden_reason,
  reports: [],
  appeal: null,
});

export type ModerationFilter =
  | 'appeals' | 'reported' | 'low' | 'visible' | 'hidden' | 'all';

/**
 * The moderation queue.
 *
 * `low` (one and two stars) is the default lens, not because a low rating is
 * suspect - most are honest and useful - but because it is where the abuse,
 * the naming of staff and the unverifiable accusations concentrate. A
 * moderator reading every five-star review in order would never reach them.
 */
export function moderationQueue(
  db: DB,
  filter: ModerationFilter = 'reported',
  limit = 100,
): ModerationItem[] {
  const where = {
    // The author answering a decision WE made. That outranks a reader
    // flagging somebody else, which outranks every automatic lens below.
    appeals: `EXISTS (SELECT 1 FROM review_appeals a
                      WHERE a.review_id = r.id AND a.resolved_at IS NULL)`,
    // A human flagged it. That outranks every automatic lens below.
    reported: `EXISTS (SELECT 1 FROM review_reports rr
                       WHERE rr.review_id = r.id AND rr.resolved_at IS NULL)`,
    low: 'r.rating <= 2 AND r.hidden_at IS NULL',
    visible: 'r.hidden_at IS NULL',
    hidden: 'r.hidden_at IS NOT NULL',
    all: '1 = 1',
  }[filter];

  const items = rows<ModerationRow>(
    db
      .prepare(
        `${MODERATION_SELECT} WHERE ${where}
         ORDER BY r.created_at DESC, r.rowid DESC LIMIT ?`,
      )
      .all(limit),
  ).map(toModerationItem);

  return attachReports(db, items);
}

/**
 * Attach open reports in ONE query.
 *
 * Per-item lookups would be a hundred round trips on a full desk, and the
 * reports are the whole reason the moderator is looking at these rows.
 */
function attachReports(db: DB, items: ModerationItem[]): ModerationItem[] {
  if (items.length === 0) return items;
  const found = rows<ReportRow>(
    db
      .prepare(
        `SELECT * FROM review_reports
         WHERE resolved_at IS NULL
           AND review_id IN (${items.map(() => '?').join(',')})
         ORDER BY created_at ASC`,
      )
      .all(...items.map((i) => i.id)),
  );
  const byReview = new Map<string, ReviewReport[]>();
  // One record per reporter, not per report: the same reader may have flagged
  // several rows on this page.
  const records = new Map<string, ReporterRecord>();
  for (const r of found) {
    if (!records.has(r.reporter_id)) {
      records.set(r.reporter_id, reporterRecord(db, r.reporter_id));
    }
    const list = byReview.get(r.review_id) ?? [];
    list.push({ ...toReport(r), record: records.get(r.reporter_id)! });
    byReview.set(r.review_id, list);
  }
  return items.map((i) => ({
    ...i,
    reports: byReview.get(i.id) ?? [],
    appeal: openAppeal(db, i.id),
  }));
}

export function moderationCounts(db: DB): Record<ModerationFilter, number> {
  const appeals = appealCount(db);
  const reported = row<{ n: number }>(
    db
      .prepare(
        `SELECT COUNT(DISTINCT review_id) AS n FROM review_reports
         WHERE resolved_at IS NULL`,
      )
      .get(),
  )?.n ?? 0;
  // `all` is a SQL keyword, so it cannot be a bare column alias. Named
  // `total` in the query and mapped back on the way out.
  const c = row<{ total: number; visible: number; hidden: number; low: number }>(
    db
      .prepare(
        `SELECT COUNT(*) AS total,
                SUM(CASE WHEN hidden_at IS NULL THEN 1 ELSE 0 END) AS visible,
                SUM(CASE WHEN hidden_at IS NOT NULL THEN 1 ELSE 0 END) AS hidden,
                SUM(CASE WHEN rating <= 2 AND hidden_at IS NULL THEN 1 ELSE 0 END) AS low
         FROM place_reviews`,
      )
      .get(),
  ) ?? { total: 0, visible: 0, hidden: 0, low: 0 };
  return {
    appeals,
    reported,
    all: c.total ?? 0, visible: c.visible ?? 0, hidden: c.hidden ?? 0, low: c.low ?? 0,
  };
}

export const moderationItem = (db: DB, id: string): ModerationItem | null => {
  const found = row<ModerationRow>(db.prepare(`${MODERATION_SELECT} WHERE r.id = ?`).get(id));
  return found ? attachReports(db, [toModerationItem(found)])[0]! : null;
};

/**
 * Take a review down.
 *
 * The keyed reason is REQUIRED. Removing what someone wrote without recording
 * why is unaccountable in exactly the way the proof queue is not, and the
 * author is owed the reason in their own language - which a free-text note
 * typed by a Thai moderator cannot give a German traveller.
 *
 * The author is notified in the SAME transaction as the hide. If the decision
 * is recorded, they are guaranteed to be told; sending happens afterwards and
 * can fail without the news being lost.
 *
 * Points are NOT clawed back. They were paid for a visit that really happened,
 * and the visit is not what was wrong with the review. A deliberate clawback is
 * still possible through `reverseMovement`, which leaves its own ledger row.
 */
export function hideReview(
  db: DB,
  args: {
    reviewId: string;
    reasonKey: ModerationReasonKey;
    moderator: string;
    note?: string | null;
    /**
     * Set when this hide is part of an APPROVED batch.
     *
     * Skips the per-moderator rate limit, which is the entire purpose of the
     * batch mechanism: the cap contains one account acting alone, and this
     * one has been reviewed by a second person. Stamped on the log row so the
     * audit page can show it was authorised rather than taken unilaterally.
     */
    batchId?: string;
    now?: Date;
  },
): ModerationItem | null {
  if (!isModerationReasonKey(args.reasonKey)) return null;
  const item = moderationItem(db, args.reviewId);
  if (!item) return null;
  // Already down: nothing to do, and in particular no second "your review
  // was removed" to the author, no second log row, no second allowance
  // spent. A batch that overlaps a unilateral take-down used to re-hide and
  // re-notify, and the docstring on batches claimed it skipped them.
  if (item.hiddenAt) return item;

  const at = args.now ?? new Date();
  // Checked BEFORE the transaction: a refusal must leave no trace, and a
  // moderator who has hit the cap needs to see it as a limit rather than as a
  // silent failure.
  if (
    args.batchId === undefined
    && takedownsInWindow(db, args.moderator, at) >= TAKEDOWN_LIMIT_PER_WINDOW
  ) {
    throw new TakedownRateLimited(TAKEDOWN_WINDOW_MINUTES);
  }

  const now = at.toISOString();
  return transact(db, () => {
    db.prepare(
      `UPDATE place_reviews
       SET hidden_at = ?, hidden_by = ?, hidden_reason_key = ?, hidden_reason = ?
       WHERE id = ?`,
    ).run(now, args.moderator, args.reasonKey, args.note?.trim().slice(0, 500) || null,
          args.reviewId);

    enqueue(db, {
      userId: item.authorId,
      kind: 'review_hidden',
      // A KEY plus its parameters, never a rendered sentence: the moderator
      // decides in Thai and the author may read only English.
      params: { place: item.placeName, reason: args.reasonKey },
      data: { screen: 'place', placeId: item.placeId },
      dedupeKey: `review-hidden:${args.reviewId}:${now}`,
    });

    // Acting on a review closes what people reported about it. Without this
    // the desk would show the same handled row for ever, and a real new
    // report would be lost in the backlog of ones already dealt with.
    resolveReports(db, args.reviewId, args.moderator, 'removed', at);

    logAction(db, {
      action: 'hide',
      reviewId: args.reviewId,
      placeId: item.placeId,
      moderator: args.moderator,
      reasonKey: args.reasonKey,
      note: args.note ?? null,
      batchId: args.batchId ?? null,
      actedAt: now,
    });

    return moderationItem(db, args.reviewId);
  });
}

/**
 * Put a review back.
 *
 * Clears the whole moderation record rather than keeping a "was hidden" flag:
 * a review that has been restored was, as far as the platform is concerned,
 * never validly removed, and leaving a mark on it would follow the author
 * around for a decision that was reversed.
 */
export function restoreReview(
  db: DB, reviewId: string, moderator = '', now = new Date(),
): ModerationItem | null {
  // ONE transaction, like the take-down it reverses. Five writes that must
  // agree - the review, the author's notification, the reports, the appeal,
  // the log - used to run unbracketed, so a failure halfway left a review
  // published with its reports still open and no log of who put it back.
  return transact(db, () => {
    const changed = db
      .prepare(
        `UPDATE place_reviews
         SET hidden_at = NULL, hidden_by = NULL, hidden_reason_key = NULL, hidden_reason = NULL
         WHERE id = ? AND hidden_at IS NOT NULL`,
      )
      .run(reviewId);
    if (Number(changed.changes) === 0) return null;

    const at = now.toISOString();

    // The other half of review_hidden. Telling someone their words were
    // removed and never telling them they are back is the wrong way round:
    // the bad news travels and the good news does not.
    const item = moderationItem(db, reviewId);
    if (item) {
      enqueue(db, {
        userId: item.authorId,
        kind: 'review_restored',
        params: { place: item.placeName },
        data: { screen: 'place', placeId: item.placeId },
        dedupeKey: `review-restored:${reviewId}:${at}`,
        now,
      });
    }

    // Putting it back is also a decision about the reports. Leaving them
    // open would send the same review round the queue again tomorrow.
    // 'kept' from the reporter's point of view: whatever they flagged is
    // published again, and that is the answer they need.
    resolveReports(db, reviewId, moderator, 'kept', now);

    // An open appeal asked for precisely this. Leaving it open would put the
    // review back and still show it in the appeal queue tomorrow.
    db.prepare(
      `UPDATE review_appeals SET outcome = 'upheld', resolved_at = ?, resolved_by = ?
       WHERE review_id = ? AND resolved_at IS NULL`,
    ).run(at, moderator, reviewId);

    logAction(db, {
      action: 'restore',
      reviewId,
      placeId: item?.placeId ?? null,
      moderator,
      actedAt: at,
    });

    return moderationItem(db, reviewId);
  });
}

/**
 * "Looked at it, it is fine."
 *
 * The third outcome, and the one a desk without it quietly loses: a moderator
 * who cannot dismiss a report can only hide or ignore, and ignoring means the
 * row sits at the top of the queue for ever until somebody hides it to make it
 * go away.
 */
export function dismissReports(db: DB, reviewId: string, moderator: string): number {
  const item = moderationItem(db, reviewId);
  const n = resolveReports(db, reviewId, moderator, 'kept');
  logAction(db, {
    action: 'dismiss',
    reviewId,
    placeId: item?.placeId ?? null,
    moderator,
    actedAt: new Date().toISOString(),
  });
  return n;
}

// ---------------------------------------------------------------------------
// Reports
//
// A report is a SIGNAL, never an action. No count in here hides anything: the
// only thing that takes a review down is a moderator pressing a button and
// recording a reason. Without that rule, twenty coordinated reports would be a
// censorship tool, and the first business to work that out would use it.
// ---------------------------------------------------------------------------

export class AlreadyReported extends Error {
  constructor() {
    super('this reader has already reported this review');
    this.name = 'AlreadyReported';
  }
}

/**
 * Thrown when a reader has filed too many reports too fast.
 *
 * One-per-review already stops repeat-flagging a single target. This is the
 * other axis: one account reporting a hundred different reviews in a minute is
 * the cheapest denial-of-service a review desk has.
 */
export class ReportRateLimited extends Error {
  retryAfterMinutes: number;
  constructor(retryAfterMinutes: number) {
    super(`too many reports; retry in ${retryAfterMinutes} min`);
    this.name = 'ReportRateLimited';
    this.retryAfterMinutes = retryAfterMinutes;
  }
}

/** Thrown when someone tries to report their own review. Withdraw it instead. */
export class CannotReportOwn extends Error {
  constructor() {
    super('a review cannot be reported by its own author');
    this.name = 'CannotReportOwn';
  }
}

export interface ReviewReport {
  id: string;
  reviewId: string;
  reporterId: string;
  reasonKey: ReportReasonKey;
  note: string | null;
  createdAt: string;
  resolvedAt: string | null;
  /** Filled only on the moderator's desk. Aggregate counts, never a name. */
  record?: ReporterRecord;
}

interface ReportRow {
  id: string;
  review_id: string;
  reporter_id: string;
  reason_key: string;
  note: string | null;
  created_at: string;
  resolved_at: string | null;
}

const toReport = (r: ReportRow): ReviewReport => ({
  id: r.id,
  reviewId: r.review_id,
  reporterId: r.reporter_id,
  reasonKey: r.reason_key as ReportReasonKey,
  note: r.note,
  createdAt: r.created_at,
  resolvedAt: r.resolved_at,
});

/**
 * Report a review.
 *
 * Open to ANY reader, checked in or not. Requiring a visit would mean the
 * person most likely to spot a review naming their child - a local reading it -
 * is the one person who cannot say so.
 */
export function reportReview(
  db: DB,
  args: {
    reviewId: string;
    reporterId: string;
    reasonKey: ReportReasonKey;
    note?: string | null;
    now?: Date;
  },
): ReviewReport | null {
  if (!isReportReasonKey(args.reasonKey)) return null;

  const review = row<{ user_id: string }>(
    db.prepare('SELECT user_id FROM place_reviews WHERE id = ?').get(args.reviewId),
  );
  if (!review) return null;
  if (review.user_id === args.reporterId) throw new CannotReportOwn();

  const existing = row<ReportRow>(
    db
      .prepare('SELECT * FROM review_reports WHERE review_id = ? AND reporter_id = ?')
      .get(args.reviewId, args.reporterId),
  );
  if (existing) throw new AlreadyReported();

  const windowStart = new Date(
    (args.now ?? new Date()).getTime() - REPORT_WINDOW_MINUTES * 60_000,
  ).toISOString();
  const recent = row<{ n: number }>(
    db
      .prepare(
        'SELECT COUNT(*) AS n FROM review_reports WHERE reporter_id = ? AND created_at >= ?',
      )
      .get(args.reporterId, windowStart),
  )?.n ?? 0;
  if (recent >= REPORT_LIMIT_PER_WINDOW) throw new ReportRateLimited(REPORT_WINDOW_MINUTES);

  const id = randomUUID();
  const now = (args.now ?? new Date()).toISOString();
  db.prepare(
    `INSERT INTO review_reports (id, review_id, reporter_id, reason_key, note, created_at)
     VALUES (?,?,?,?,?,?)`,
  ).run(id, args.reviewId, args.reporterId, args.reasonKey,
        args.note?.trim().slice(0, REPORT_MAX_NOTE) || null, now);

  return {
    id, reviewId: args.reviewId, reporterId: args.reporterId,
    reasonKey: args.reasonKey, note: args.note?.trim().slice(0, REPORT_MAX_NOTE) || null,
    createdAt: now, resolvedAt: null,
  };
}

/**
 * A reporter's track record, for the desk.
 *
 * Aggregate only - counts, never a name or a history of what they flagged.
 * A moderator weighing a report needs to know whether this reader is usually
 * right, and a reader whose reports are always dismissed is itself a signal.
 * Anything more identifying would be surveillance dressed as moderation.
 */
export interface ReporterRecord {
  /** Reports filed, all time. */
  filed: number;
  /** Of the RESOLVED ones, how many led to a take-down. */
  upheld: number;
  /** Resolved and left published. */
  dismissed: number;
}

export function reporterRecord(db: DB, reporterId: string): ReporterRecord {
  const r = row<{ filed: number; upheld: number; dismissed: number }>(
    db
      .prepare(
        `SELECT COUNT(*) AS filed,
                SUM(CASE WHEN outcome = 'removed' THEN 1 ELSE 0 END) AS upheld,
                SUM(CASE WHEN outcome = 'kept' THEN 1 ELSE 0 END) AS dismissed
         FROM review_reports WHERE reporter_id = ?`,
      )
      .get(reporterId),
  ) ?? { filed: 0, upheld: 0, dismissed: 0 };
  return { filed: r.filed ?? 0, upheld: r.upheld ?? 0, dismissed: r.dismissed ?? 0 };
}

/** Open reports against one review, oldest first - the queue order. */
export const reportsFor = (db: DB, reviewId: string): ReviewReport[] =>
  rows<ReportRow>(
    db
      .prepare(
        `SELECT * FROM review_reports
         WHERE review_id = ? AND resolved_at IS NULL ORDER BY created_at ASC`,
      )
      .all(reviewId),
  ).map(toReport);

/** Reviews this reader has already reported, so the app can say so. */
export const reportedByReader = (db: DB, readerId: string, placeId: string): string[] =>
  rows<{ review_id: string }>(
    db
      .prepare(
        `SELECT rr.review_id FROM review_reports rr
         JOIN place_reviews r ON r.id = rr.review_id
         WHERE rr.reporter_id = ? AND r.place_id = ?`,
      )
      .all(readerId, placeId),
  ).map((r) => r.review_id);

/**
 * Close the open reports on a review.
 *
 * Called when a moderator acts - hide, restore, or an explicit "looked at it,
 * it is fine". Resolving is what empties the lens; without it the desk would
 * show the same handled review for ever.
 */
export function resolveReports(
  db: DB,
  reviewId: string,
  moderator: string,
  outcome: ReportOutcome,
  now = new Date(),
): number {
  // Who to tell, read BEFORE the update - afterwards they are no longer open.
  const reporters = rows<{ reporter_id: string }>(
    db
      .prepare(
        'SELECT reporter_id FROM review_reports WHERE review_id = ? AND resolved_at IS NULL',
      )
      .all(reviewId),
  ).map((r) => r.reporter_id);
  if (reporters.length === 0) return 0;

  const placeName = row<{ name_en: string }>(
    db
      .prepare(
        `SELECT p.name_en FROM place_reviews r JOIN places p ON p.id = r.place_id
         WHERE r.id = ?`,
      )
      .get(reviewId),
  )?.name_en ?? 'a place';

  const stamp = now.toISOString();
  const result = db
    .prepare(
      `UPDATE review_reports SET resolved_at = ?, resolved_by = ?, outcome = ?
       WHERE review_id = ? AND resolved_at IS NULL`,
    )
    .run(stamp, moderator, outcome, reviewId);

  // Everyone who spoke up hears back. A reporter who is never told anything
  // concludes nobody looked, and stops reporting the one that matters.
  for (const reporterId of reporters) {
    enqueue(db, {
      userId: reporterId,
      kind: 'report_reviewed',
      params: { place: placeName, outcome },
      data: { screen: 'place' },
      dedupeKey: `report-reviewed:${reviewId}:${reporterId}:${stamp}`,
    });
  }

  return Number(result.changes);
}

// ---------------------------------------------------------------------------
// Audit log
//
// Append-only, and NOT derivable from the review rows. `restoreReview` clears
// hidden_at and hidden_by on purpose, so no scar follows an author around after
// a decision was reversed - but that also erases the record that a moderator
// ever acted. Both are wanted: the review carries no mark, the operator record
// is complete. Only a separate log gives you both.
// ---------------------------------------------------------------------------

export type ModerationAction = 'hide' | 'restore' | 'dismiss' | 'appeal_declined';

export interface LogEntry {
  id: string;
  action: ModerationAction;
  reviewId: string;
  placeId: string | null;
  moderator: string;
  reasonKey: string | null;
  note: string | null;
  /** Set when this was part of an approved batch. */
  batchId: string | null;
  actedAt: string;
}

interface LogRow {
  id: string;
  action: string;
  review_id: string;
  place_id: string | null;
  moderator: string;
  reason_key: string | null;
  note: string | null;
  batch_id: string | null;
  acted_at: string;
}

const toLogEntry = (r: LogRow): LogEntry => ({
  id: r.id,
  action: r.action as ModerationAction,
  reviewId: r.review_id,
  placeId: r.place_id,
  moderator: r.moderator,
  reasonKey: r.reason_key,
  note: r.note,
  batchId: r.batch_id,
  actedAt: r.acted_at,
});

function logAction(
  db: DB,
  entry: {
    action: ModerationAction;
    reviewId: string;
    placeId?: string | null;
    moderator: string;
    reasonKey?: string | null;
    note?: string | null;
    batchId?: string | null;
    actedAt: string;
  },
): void {
  db.prepare(
    `INSERT INTO moderation_log
       (id, action, review_id, place_id, moderator, reason_key, note, batch_id, acted_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
  ).run(randomUUID(), entry.action, entry.reviewId, entry.placeId ?? null,
        entry.moderator, entry.reasonKey ?? null, entry.note ?? null,
        entry.batchId ?? null, entry.actedAt);
}

/** The log, newest first. Never filtered by review state - that is the point. */
export const moderationLog = (db: DB, limit = 200): LogEntry[] =>
  rows<LogRow>(
    db
      .prepare(
        `SELECT * FROM moderation_log ORDER BY acted_at DESC, rowid DESC LIMIT ?`,
      )
      .all(limit),
  ).map(toLogEntry);

/**
 * Take-downs this moderator has made in the rolling window.
 *
 * Only UNILATERAL `hide` counts.
 *
 * Restoring and dismissing put things back or leave them alone, and rate
 * limiting the safe actions would push a moderator toward the dangerous one.
 *
 * Hides from an approved batch are excluded for the same reason. The cap
 * exists to contain ONE account acting alone; a batch was agreed by two. Left
 * in, approving a batch of thirty would silently disarm that moderator for
 * the rest of the hour - punishing the safe path, which is how a safe path
 * stops being used.
 */
export function takedownsInWindow(db: DB, moderator: string, now = new Date()): number {
  const since = new Date(now.getTime() - TAKEDOWN_WINDOW_MINUTES * 60_000).toISOString();
  return row<{ n: number }>(
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM moderation_log
         WHERE action = 'hide' AND batch_id IS NULL
           AND moderator = ? AND acted_at >= ?`,
      )
      .get(moderator, since),
  )?.n ?? 0;
}

/** Thrown when a moderator has taken down too much, too fast. */
export class TakedownRateLimited extends Error {
  retryAfterMinutes: number;
  constructor(retryAfterMinutes: number) {
    super(`take-down limit reached; retry in ${retryAfterMinutes} min`);
    this.name = 'TakedownRateLimited';
    this.retryAfterMinutes = retryAfterMinutes;
  }
}

// ---------------------------------------------------------------------------
// Appeals
//
// Without this the accountability runs one way: we tell the author their words
// came down, and they have no way to answer. An appeal is the answer.
// ---------------------------------------------------------------------------

export class NotYourReview extends Error {
  constructor() {
    super('only the author may appeal');
    this.name = 'NotYourReview';
  }
}

export class NothingToAppeal extends Error {
  constructor() {
    super('this review is not taken down');
    this.name = 'NothingToAppeal';
  }
}

export class AppealAlreadyOpen extends Error {
  constructor() {
    super('an appeal on this review is already waiting');
    this.name = 'AppealAlreadyOpen';
  }
}

export interface Appeal {
  id: string;
  reviewId: string;
  authorId: string;
  message: string;
  createdAt: string;
  outcome: 'upheld' | 'declined' | null;
  resolvedAt: string | null;
}

interface AppealRow {
  id: string;
  review_id: string;
  author_id: string;
  message: string;
  created_at: string;
  outcome: string | null;
  resolved_at: string | null;
}

const toAppeal = (r: AppealRow): Appeal => ({
  id: r.id,
  reviewId: r.review_id,
  authorId: r.author_id,
  message: r.message,
  createdAt: r.created_at,
  outcome: r.outcome === 'upheld' || r.outcome === 'declined' ? r.outcome : null,
  resolvedAt: r.resolved_at,
});

/**
 * Appeal a take-down.
 *
 * Only the author, only while the review is actually hidden, and only one open
 * at a time. The message is free text and stays as typed: a person defending
 * their own words cannot be made to pick from a list.
 */
export function appealTakedown(
  db: DB,
  args: { reviewId: string; authorId: string; message: string; now?: Date },
): Appeal {
  const review = row<{ user_id: string; hidden_at: string | null }>(
    db.prepare('SELECT user_id, hidden_at FROM place_reviews WHERE id = ?').get(args.reviewId),
  );
  if (!review) throw new NothingToAppeal();
  if (review.user_id !== args.authorId) throw new NotYourReview();
  if (!review.hidden_at) throw new NothingToAppeal();

  const open = row<AppealRow>(
    db
      .prepare('SELECT * FROM review_appeals WHERE review_id = ? AND resolved_at IS NULL')
      .get(args.reviewId),
  );
  if (open) throw new AppealAlreadyOpen();

  const id = randomUUID();
  const now = (args.now ?? new Date()).toISOString();
  const message = args.message.trim().slice(0, APPEAL_MAX_MESSAGE);
  db.prepare(
    `INSERT INTO review_appeals (id, review_id, author_id, message, created_at)
     VALUES (?,?,?,?,?)`,
  ).run(id, args.reviewId, args.authorId, message, now);

  return {
    id, reviewId: args.reviewId, authorId: args.authorId, message,
    createdAt: now, outcome: null, resolvedAt: null,
  };
}

/** The open appeal on a review, if any. */
export const openAppeal = (db: DB, reviewId: string): Appeal | null => {
  const found = row<AppealRow>(
    db
      .prepare('SELECT * FROM review_appeals WHERE review_id = ? AND resolved_at IS NULL')
      .get(reviewId),
  );
  return found ? toAppeal(found) : null;
};

/** The author's own latest appeal, so the app can show its state. */
export const latestAppeal = (db: DB, reviewId: string, authorId: string): Appeal | null => {
  const found = row<AppealRow>(
    db
      .prepare(
        `SELECT * FROM review_appeals WHERE review_id = ? AND author_id = ?
         ORDER BY created_at DESC LIMIT 1`,
      )
      .get(reviewId, authorId),
  );
  return found ? toAppeal(found) : null;
};

/**
 * Refuse an appeal.
 *
 * The author is told. We told them it came down; if they answer and we say no,
 * they are owed that too — silence after an appeal is worse than the original
 * take-down, because it says the answer was never going to be read.
 *
 * Upholding an appeal is just `restoreReview`, which already notifies and logs.
 * There is no separate "uphold" path on purpose: two routes that both restore
 * would be two chances to forget one of them.
 */
export function declineAppeal(
  db: DB,
  args: { reviewId: string; moderator: string; now?: Date },
): Appeal | null {
  const appeal = openAppeal(db, args.reviewId);
  if (!appeal) return null;
  const item = moderationItem(db, args.reviewId);
  const now = (args.now ?? new Date()).toISOString();

  return transact(db, () => {
    db.prepare(
      `UPDATE review_appeals SET outcome = 'declined', resolved_at = ?, resolved_by = ?
       WHERE id = ?`,
    ).run(now, args.moderator, appeal.id);

    enqueue(db, {
      userId: appeal.authorId,
      kind: 'appeal_declined',
      params: { place: item?.placeName ?? 'a place' },
      data: { screen: 'place', placeId: item?.placeId ?? '' },
      dedupeKey: `appeal-declined:${appeal.id}`,
    });

    logAction(db, {
      action: 'appeal_declined',
      reviewId: args.reviewId,
      placeId: item?.placeId ?? null,
      moderator: args.moderator,
      actedAt: now,
    });

    return { ...appeal, outcome: 'declined' as const, resolvedAt: now };
  });
}

/** Reviews with an appeal waiting. The desk's most urgent lens. */
export function appealQueue(db: DB, limit = 100): ModerationItem[] {
  const items = rows<ModerationRow>(
    db
      .prepare(
        `${MODERATION_SELECT}
         WHERE EXISTS (SELECT 1 FROM review_appeals a
                       WHERE a.review_id = r.id AND a.resolved_at IS NULL)
         ORDER BY r.hidden_at ASC LIMIT ?`,
      )
      .all(limit),
  ).map(toModerationItem);
  return attachReports(db, items);
}

export const appealCount = (db: DB): number =>
  row<{ n: number }>(
    db.prepare('SELECT COUNT(*) AS n FROM review_appeals WHERE resolved_at IS NULL').get(),
  )?.n ?? 0;

/**
 * The author's own view of their review, including whether it was taken down.
 *
 * `myReview` deliberately does not filter hidden rows - an author must be able
 * to see their own words. This adds why it is not public and what they can do
 * about it, which is the difference between a review that vanished and one they
 * were told about.
 */
export interface MyReviewState {
  review: PlaceReview;
  hiddenAt: string | null;
  hiddenReasonKey: ModerationReasonKey | null;
  appeal: Appeal | null;
}

export function myReviewState(
  db: DB,
  userId: string,
  placeId: string,
): MyReviewState | null {
  const found = row<ModerationRow>(
    db.prepare(`${MODERATION_SELECT} WHERE r.place_id = ? AND r.user_id = ?`)
      .get(placeId, userId),
  );
  if (!found) return null;
  const item = toModerationItem(found);
  return {
    review: toReview(found),
    hiddenAt: item.hiddenAt,
    hiddenReasonKey: item.hiddenReasonKey,
    appeal: latestAppeal(db, item.id, userId),
  };
}

export interface LogFilter {
  moderator?: string;
  action?: ModerationAction;
}

/** The log, filtered. Fine to skip at pilot volume; useless to lack at scale. */
export function filteredLog(db: DB, filter: LogFilter = {}, limit = 200): LogEntry[] {
  const clauses: string[] = [];
  const args: string[] = [];
  if (filter.moderator) { clauses.push('moderator = ?'); args.push(filter.moderator); }
  if (filter.action) { clauses.push('action = ?'); args.push(filter.action); }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  return rows<LogRow>(
    db
      .prepare(`SELECT * FROM moderation_log ${where} ORDER BY acted_at DESC, rowid DESC LIMIT ?`)
      .all(...args, limit),
  ).map(toLogEntry);
}
