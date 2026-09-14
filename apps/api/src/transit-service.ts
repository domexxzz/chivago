/**
 * The bus, as far as this server can honestly know it.
 *
 * The routes themselves are content, not state: they come from the seed,
 * which took them from OpenStreetMap and says so. Nothing here writes a
 * route, and nothing invents one - see `packages/core/src/transit.ts` for why
 * the university's own shuttle is absent rather than guessed at.
 *
 * What IS state is the sightings: riders reporting that they saw one, because
 * nobody publishes a timetable. This records them and reads back what today's
 * reports can support, which is a good deal less than a schedule.
 */

import { randomUUID } from 'node:crypto';
import {
  AREAS, SAME_VEHICLE_MIN, SEED_TRANSIT, headwayFrom, inArea, isAreaKey, areaByKey,
  type AreaKey, type Headway, type Sighting, type TransitRoute,
} from '@chivago/core';
import { row, rows, type DB } from './db.ts';

/** A route with what riders have said about it today. */
export interface RouteWithHeadway extends TransitRoute {
  headway: Headway;
}

/**
 * The routes that serve an area.
 *
 * A route belongs to an area when one of its stops is inside it. Route 538's
 * far terminus is a hospital in Bangkok, and the same route is correctly
 * listed for the campus because four of its stops stand at the gate.
 */
export function routesForArea(db: DB, key: AreaKey, now = new Date()): RouteWithHeadway[] {
  const area = areaByKey(key);
  return SEED_TRANSIT
    .filter((route) => route.stops.some((stop) => inArea(area, stop)))
    .map((route) => ({
      ...route,
      stops: route.stops.filter((stop) => inArea(area, stop)),
      headway: headwayFrom(sightingsToday(db, route.id, now), now),
    }));
}

/** Today's reports for one route, oldest first. */
export function sightingsToday(db: DB, routeId: string, now = new Date()): Sighting[] {
  // A day either side, then `headwayFrom` decides what counts as today - it
  // owns the island-day rule and must not be second-guessed in SQL.
  const from = new Date(now.getTime() - 36 * 3_600_000).toISOString();
  return rows<{ route_id: string; stop_id: string; at: string }>(
    db.prepare(
      'SELECT route_id, stop_id, at FROM transit_sightings WHERE route_id = ? AND at >= ? ORDER BY at ASC',
    ).all(routeId, from),
  ).map((r) => ({ routeId: r.route_id, stopId: r.stop_id, at: r.at }));
}

export type SightingRefusal = 'unknown-route' | 'unknown-stop' | 'already-reported';

export interface SightingResult {
  recorded: boolean;
  /** Why not, when it was not. */
  because: SightingRefusal | null;
  headway: Headway;
}

/**
 * Record that a rider saw a vehicle.
 *
 * Refuses an id that is not in the seed. The whole value of this signal is
 * that it is about a real route at a real stop; accepting whatever a client
 * sends would let one caller fill the table with routes nobody runs, and the
 * median would then be measuring nothing.
 *
 * Refuses a second report from the SAME rider inside the same-vehicle window,
 * which is a double-tap rather than a second bus. Reports from DIFFERENT
 * riders are all kept - five people seeing one bus is a fact worth having,
 * and `headwayFrom` already knows they saw one bus between them.
 */
export function reportSighting(
  db: DB,
  args: { userId: string; routeId: string; stopId: string; now?: Date },
): SightingResult {
  const now = args.now ?? new Date();
  const route = SEED_TRANSIT.find((r) => r.id === args.routeId);
  const answer = (because: SightingRefusal | null): SightingResult => ({
    recorded: because === null,
    because,
    headway: headwayFrom(route ? sightingsToday(db, route.id, now) : [], now),
  });

  if (!route) return answer('unknown-route');
  if (!route.stops.some((s) => s.id === args.stopId)) return answer('unknown-stop');

  const since = new Date(now.getTime() - SAME_VEHICLE_MIN * 60_000).toISOString();
  const again = row<{ id: string }>(
    db.prepare(
      'SELECT id FROM transit_sightings WHERE user_id = ? AND route_id = ? AND at >= ? LIMIT 1',
    ).get(args.userId, args.routeId, since),
  );
  if (again) return answer('already-reported');

  db.prepare(
    'INSERT INTO transit_sightings (id, user_id, route_id, stop_id, at) VALUES (?,?,?,?,?)',
  ).run(randomUUID(), args.userId, args.routeId, args.stopId, now.toISOString());

  return answer(null);
}

/** Every area key that has at least one route, for whoever needs the list. */
export const areasWithTransit = (): AreaKey[] =>
  AREAS.filter((a) => SEED_TRANSIT.some((r) => r.stops.some((s) => inArea(a, s))))
    .map((a) => a.key)
    .filter(isAreaKey);
