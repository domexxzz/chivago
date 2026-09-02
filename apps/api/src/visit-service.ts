/**
 * Self-issued visits - recorded, not scored.
 *
 * The verified path is `checkin-service.ts`: a geofence agreed, a ledger row
 * was written, points moved. This is the other half, for when it did not
 * agree - and it deliberately touches none of those things. No ledger row, so
 * no points and no companion evidence; no `visited_at` a review could be
 * unlocked from. The passport reads it as a separate list and draws it as a
 * separate kind of stamp. See `packages/core/src/visits.ts` for why.
 */

import { randomUUID } from 'node:crypto';
import {
  SELF_VISITS_PER_YEAR, selfVisitYearKey, type SelfVisitResult, type SelfVisitSummary,
} from '@chivago/core';
import { row, rows, type DB } from './db.ts';

export class SelfVisitQuotaReached extends Error {
  constructor(year: string) {
    super(`All ${SELF_VISITS_PER_YEAR} self-issued stamps for ${year} are used`);
    this.name = 'SelfVisitQuotaReached';
  }
}

const usedIn = (db: DB, userId: string, year: string): number =>
  row<{ n: number }>(
    db.prepare('SELECT COUNT(*) AS n FROM self_visits WHERE user_id = ? AND year_key = ?')
      .get(userId, year),
  )?.n ?? 0;

/**
 * Stamp a place on the traveller's word.
 *
 * Returns null for a place that does not exist, `recorded: false` for one
 * they already stamped this way - a second claim on the same beach is a
 * duplicate, not a second visit - and throws only when the year's quota is
 * spent, because that is the one thing here worth refusing.
 */
export function recordSelfVisit(
  db: DB,
  args: { userId: string; placeId: string; now?: Date },
): SelfVisitResult | null {
  const place = row<{ id: string }>(
    db.prepare('SELECT id FROM places WHERE id = ?').get(args.placeId),
  );
  if (!place) return null;

  const now = args.now ?? new Date();
  const year = selfVisitYearKey(now);
  const used = usedIn(db, args.userId, year);
  const remaining = Math.max(0, SELF_VISITS_PER_YEAR - used);

  const already = row<{ id: string }>(
    db.prepare('SELECT id FROM self_visits WHERE user_id = ? AND place_id = ?')
      .get(args.userId, args.placeId),
  );
  if (already) return { placeId: place.id, recorded: false, remainingThisYear: remaining };

  if (remaining === 0) throw new SelfVisitQuotaReached(year);

  db.prepare(
    `INSERT INTO self_visits (id, user_id, place_id, visited_at, year_key, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(randomUUID(), args.userId, place.id, now.toISOString(), year, now.toISOString());

  return { placeId: place.id, recorded: true, remainingThisYear: remaining - 1 };
}

/** The traveller's self-issued stamps, and how many more the year allows. */
export function selfVisitsFor(db: DB, userId: string, now = new Date()): SelfVisitSummary {
  const places = rows<{ place_id: string }>(
    db.prepare('SELECT place_id FROM self_visits WHERE user_id = ? ORDER BY visited_at')
      .all(userId),
  ).map((r) => r.place_id);
  const used = usedIn(db, userId, selfVisitYearKey(now));
  return { places, remainingThisYear: Math.max(0, SELF_VISITS_PER_YEAR - used) };
}

/**
 * Provinces the traveller SAYS they have been to, through the place they
 * stamped. Kept apart from `visitedProvincesFor`, which reads the ledger:
 * the passport draws the two differently, and merging them here would let a
 * self-issued stamp look like a geofenced one downstream.
 */
export function selfReportedProvincesFor(db: DB, userId: string): string[] {
  return rows<{ province: string }>(
    db.prepare(
      `SELECT DISTINCT p.province AS province
       FROM self_visits v JOIN places p ON p.id = v.place_id
       WHERE v.user_id = ? AND p.province IS NOT NULL`,
    ).all(userId),
  ).map((r) => r.province);
}
