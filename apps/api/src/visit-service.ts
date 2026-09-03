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
  SELF_VISITS_PER_YEAR, selfVisitYearKey, type Explored, type SelfVisitResult, type SelfVisitSummary,
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

/**
 * Every place this traveller has been to, earliest first, for the map.
 *
 * The check-ins come from the ledger - the same rows the passport and the
 * companions read, through the same `source_ref` shape - and the stamps from
 * `self_visits`. A place with both is reported once, as the check-in: the
 * verified fact wins, and the map is not a second passport.
 */
export function exploredFor(db: DB, userId: string): Explored {
  const checkins = rows<{ place_id: string; first_at: string }>(
    db.prepare(
      `SELECT substr(l.source_ref, 9, instr(substr(l.source_ref, 9), ':') - 1) AS place_id,
              MIN(l.occurred_at) AS first_at
       FROM ledger l
       WHERE l.user_id = ? AND l.kind = 'checkin'
       GROUP BY place_id`,
    ).all(userId),
  );
  const stamps = rows<{ place_id: string; visited_at: string }>(
    db.prepare(
      `SELECT place_id, MIN(visited_at) AS visited_at FROM self_visits
       WHERE user_id = ? GROUP BY place_id`,
    ).all(userId),
  );
  const byPlace = new Map<string, Explored['places'][number]>();
  for (const s of stamps) byPlace.set(s.place_id, { placeId: s.place_id, firstAt: s.visited_at, how: 'self' });
  for (const c of checkins) byPlace.set(c.place_id, { placeId: c.place_id, firstAt: c.first_at, how: 'checkin' });
  const places = [...byPlace.values()].sort((a, b) => a.firstAt.localeCompare(b.firstAt));
  return { places };
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
