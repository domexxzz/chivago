/**
 * Watching the moderators.
 *
 * The first version compared everybody against one fixed number, which fails in
 * both directions at once:
 *
 *  - A moderator who genuinely handles twenty a day trips it every single day.
 *    A flag that is always on is a flag nobody reads.
 *  - A moderator whose normal is two, who suddenly does twelve, never trips it.
 *    That is the case actually worth catching.
 *
 * So the comparison is against their OWN normal, with three deliberate
 * concessions to how little data a pilot has:
 *
 *  1. A baseline needs enough days behind it. A ratio from three data points is
 *     noise in the costume of statistics.
 *  2. The baseline is a MEDIAN, not a mean. One legitimate bulk-cleanup day
 *     would otherwise raise the average enough to hide everything after it.
 *  3. A spike needs an absolute floor as well as a multiple, so somebody whose
 *     normal is half a day is not flagged for doing two.
 *
 * Hides made through an APPROVED BATCH are excluded from the volume rules.
 * They were reviewed by a second human, and if using the safe path made you
 * look worse here than acting alone, nobody would use it. They still count
 * toward the overturn rate: if a batch was wrong, that is precisely what
 * should surface.
 *
 * And the signal that matters most is not volume at all. Volume says a
 * moderator is BUSY; reversals say they are WRONG. Somebody quietly getting a
 * third of their calls overturned never trips a volume rule.
 *
 * Every flag carries its reason. A warning that cannot explain itself is an
 * accusation, and the person reading it needs to know whether it means "unusual
 * for them" or "a lot in absolute terms" before they act on it.
 */

import {
  WATCH_ABSOLUTE, WATCH_BASELINE_DAYS, WATCH_MIN_BASELINE_DAYS,
  WATCH_OVERTURN_MIN, WATCH_OVERTURN_RATE, WATCH_RECENT_HOURS,
  WATCH_SPIKE_FLOOR, WATCH_SPIKE_MULTIPLE,
} from '@chivago/core';
import { rows, type DB } from './db.ts';

/**
 * Why a moderator is flagged. `no_baseline` is not a suspicion - it says we
 * have nothing to compare against, which is itself a reason to look.
 */
export type WatchReason = 'spike' | 'absolute' | 'no_baseline' | 'overturned';

export interface ModeratorWatch {
  moderator: string;
  /** Take-downs in the recent window. */
  recentHides: number;
  /** Their own median take-downs per ACTIVE day over the baseline period. */
  baselineMedian: number;
  /** Days in the baseline period on which they did anything at all. */
  baselineDays: number;
  /** Take-downs later reversed, all time. */
  overturned: number;
  /** Take-downs all time, the denominator for the rate. */
  totalHides: number;
  /** Zero when there are too few take-downs to divide by. */
  overturnRate: number;
  reasons: WatchReason[];
}

const median = (values: number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2;
};

export function moderatorWatch(db: DB, now = new Date()): ModeratorWatch[] {
  const recentFrom = new Date(now.getTime() - WATCH_RECENT_HOURS * 3_600_000).toISOString();
  const baselineFrom = new Date(
    now.getTime() - (WATCH_BASELINE_DAYS * 24 + WATCH_RECENT_HOURS) * 3_600_000,
  ).toISOString();

  // Recent take-downs.
  const recent = new Map<string, number>();
  for (const r of rows<{ moderator: string; n: number }>(
    db
      .prepare(
        `SELECT moderator, COUNT(*) AS n FROM moderation_log
         WHERE action = 'hide' AND batch_id IS NULL AND acted_at >= ?
         GROUP BY moderator`,
      )
      .all(recentFrom),
  )) recent.set(r.moderator, r.n);

  // Baseline: take-downs per day, EXCLUDING the recent window, so a spike does
  // not raise the very number it is being compared against.
  const perDay = new Map<string, number[]>();
  for (const r of rows<{ moderator: string; day: string; n: number }>(
    db
      .prepare(
        `SELECT moderator, substr(acted_at, 1, 10) AS day, COUNT(*) AS n
         FROM moderation_log
         WHERE action = 'hide' AND batch_id IS NULL
           AND acted_at >= ? AND acted_at < ?
         GROUP BY moderator, day`,
      )
      .all(baselineFrom, recentFrom),
  )) {
    const list = perDay.get(r.moderator) ?? [];
    list.push(r.n);
    perDay.set(r.moderator, list);
  }

  // Overturns: a take-down followed by a restore of the same review. The
  // restore may be by anyone - what is being measured is whether this
  // moderator's calls stand, not who reversed them.
  //
  // "Followed by" is decided by time, with the log's own insertion order as
  // the tiebreak. Timestamps here are milliseconds, and a batch approval
  // stamps every hide with one clock while a restore stamps its own, so a
  // restore landing in the same millisecond as the hide it reverses was
  // invisible to a strict `>` - an intermittent test failure under load, and
  // in production a wrong call that never counted against anyone.
  const overturned = new Map<string, number>();
  for (const r of rows<{ moderator: string; n: number }>(
    db
      .prepare(
        `SELECT h.moderator, COUNT(DISTINCT h.review_id) AS n
         FROM moderation_log h
         WHERE h.action = 'hide'
           AND EXISTS (SELECT 1 FROM moderation_log rr
                       WHERE rr.review_id = h.review_id
                         AND rr.action = 'restore'
                         AND (rr.acted_at > h.acted_at
                              OR (rr.acted_at = h.acted_at AND rr.rowid > h.rowid)))
         GROUP BY h.moderator`,
      )
      .all(),
  )) overturned.set(r.moderator, r.n);

  const totals = new Map<string, number>();
  for (const r of rows<{ moderator: string; n: number }>(
    db
      .prepare(
        `SELECT moderator, COUNT(DISTINCT review_id) AS n FROM moderation_log
         WHERE action = 'hide' GROUP BY moderator`,
      )
      .all(),
  )) totals.set(r.moderator, r.n);

  const names = new Set([
    ...recent.keys(), ...perDay.keys(), ...overturned.keys(), ...totals.keys(),
  ]);

  return [...names]
    .map((moderator) => {
      const recentHides = recent.get(moderator) ?? 0;
      const days = perDay.get(moderator) ?? [];
      const baselineMedian = median(days);
      const totalHides = totals.get(moderator) ?? 0;
      const overturns = overturned.get(moderator) ?? 0;
      const overturnRate = totalHides > 0 ? overturns / totalHides : 0;

      const reasons: WatchReason[] = [];
      const hasBaseline = days.length >= WATCH_MIN_BASELINE_DAYS;

      if (hasBaseline
        && recentHides >= WATCH_SPIKE_FLOOR
        && recentHides >= baselineMedian * WATCH_SPIKE_MULTIPLE) {
        reasons.push('spike');
      }
      if (!hasBaseline && recentHides >= WATCH_ABSOLUTE) reasons.push('no_baseline');
      // A backstop, not a duplicate: somebody whose normal is already very high
      // never spikes, and a lot is still a lot.
      if (hasBaseline && recentHides >= WATCH_ABSOLUTE) reasons.push('absolute');
      if (totalHides >= WATCH_OVERTURN_MIN && overturnRate >= WATCH_OVERTURN_RATE) {
        reasons.push('overturned');
      }

      return {
        moderator, recentHides, baselineMedian, baselineDays: days.length,
        overturned: overturns, totalHides, overturnRate, reasons,
      };
    })
    // Flagged first, then busiest. Anyone worth a look is at the top rather
    // than alphabetically buried.
    .sort((a, b) =>
      Number(b.reasons.length > 0) - Number(a.reasons.length > 0)
      || b.recentHides - a.recentHides
      || a.moderator.localeCompare(b.moderator));
}

export const flaggedModerators = (db: DB, now = new Date()): ModeratorWatch[] =>
  moderatorWatch(db, now).filter((m) => m.reasons.length > 0);
