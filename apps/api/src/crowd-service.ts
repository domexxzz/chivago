/**
 * The island counting itself.
 *
 * Two figures the seed could only fake, now read from what the app actually
 * recorded: how many travellers checked in at a place in the last hour, and
 * what the air has been over the last thirty days. Both come from tables
 * that already existed for other reasons - the ledger, the air cache - so
 * neither is a new claim; each is an old record, read a second way.
 */

import { CROWD_WINDOW_MINUTES, islandDateKey, type AirHistory, type AirHistoryDay, type LiveCrowd } from '@chivago/core';
import { rows, type DB } from './db.ts';
import { gridKey } from './air.ts';

/**
 * Distinct travellers with a geofenced check-in at each place inside the
 * window. Distinct, because one person checking in twice (the second refused
 * an award, but a ledger row is written only once anyway) is one person on
 * the beach. Read from `source_ref`, the same way the passport does.
 */
export function checkinsLastHour(db: DB, placeIds: readonly string[], now = new Date()): Map<string, LiveCrowd> {
  const since = new Date(now.getTime() - CROWD_WINDOW_MINUTES * 60_000).toISOString();
  const found = rows<{ place_id: string; n: number }>(
    db.prepare(
      `SELECT substr(source_ref, 9, instr(substr(source_ref, 9), ':') - 1) AS place_id,
              COUNT(DISTINCT user_id) AS n
       FROM ledger
       WHERE kind = 'checkin' AND occurred_at > ? AND occurred_at <= ?
       GROUP BY place_id`,
    ).all(since, now.toISOString()),
  );
  const counts = new Map(found.map((r) => [r.place_id, r.n]));
  const countedAt = now.toISOString();
  return new Map(placeIds.map((id) => [id, {
    checkinsLastHour: counts.get(id) ?? 0,
    windowMinutes: CROWD_WINDOW_MINUTES,
    countedAt,
  }]));
}

/**
 * The air over a place, by island day, for the last `days` days.
 *
 * Grouped in JS rather than SQL because the day boundary is the island's
 * (docs/11), and SQLite does not know where Koh Samui is. Days with no
 * sample are simply absent - a gap is a gap, not a zero.
 */
export function airHistoryFor(db: DB, lat: number, lng: number, now = new Date(), days = 30): AirHistory {
  const key = gridKey(lat, lng);
  const from = new Date(now.getTime() - days * 86_400_000).toISOString();
  const samples = rows<{ observed_at: string; aqi: number }>(
    db.prepare(
      'SELECT observed_at, aqi FROM air_history WHERE grid_key = ? AND observed_at >= ? ORDER BY observed_at',
    ).all(key, from),
  );
  const first = rows<{ observed_at: string }>(
    db.prepare('SELECT MIN(observed_at) AS observed_at FROM air_history WHERE grid_key = ?').all(key),
  )[0]?.observed_at ?? null;

  const byDay = new Map<string, number[]>();
  for (const s of samples) {
    const day = islandDateKey(new Date(s.observed_at));
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push(s.aqi);
  }
  const out: AirHistoryDay[] = [...byDay.entries()].map(([day, values]) => ({
    day,
    min: Math.round(Math.min(...values)),
    max: Math.round(Math.max(...values)),
    avg: Math.round(values.reduce((a, v) => a + v, 0) / values.length),
    samples: values.length,
  }));
  return { since: first, days: out };
}
