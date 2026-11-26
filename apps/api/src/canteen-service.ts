/**
 * The food court's queue, as the people there report it.
 *
 * The sibling of `transit-service.ts`, and for the same reason: when nobody
 * publishes the thing somebody needs to know, record what can be observed and
 * never let it read as a measurement. The wait in minutes stays the stall's
 * own, read from its kitchen in สั่งก่อน (`stalls.ts`); this answers the
 * different question of whether the hall is worth walking to.
 *
 * Only a place that actually has a food court can be reported on. The ids come
 * from `PLACE_STALLS`, which is the seed's own list, so a caller cannot fill
 * the table with places nobody eats at and leave a reading behind that is
 * about nothing.
 */

import { randomUUID } from 'node:crypto';
import {
  REPORT_EVERY_MIN, isQueueLevel, readQueue, stallSourceFor,
  type QueueLevel, type QueueReading, type QueueReport,
} from '@chivago/core';
import { row, rows, type DB } from './db.ts';

/** How far back to read. The core decides what counts as current; this only limits the scan. */
const SCAN_BACK_MIN = 180;

/** Whether this place is one with a food court to queue at. */
export const takesQueueReports = (placeId: string): boolean => stallSourceFor(placeId) !== null;

/** The reports that could still matter for a place, newest first. */
export function queueReports(db: DB, placeId: string, now = new Date()): QueueReport[] {
  const from = new Date(now.getTime() - SCAN_BACK_MIN * 60_000).toISOString();
  return rows<{ place_id: string; level: string; at: string }>(
    db.prepare(
      'SELECT place_id, level, at FROM canteen_queue_reports WHERE place_id = ? AND at >= ? ORDER BY at DESC',
    ).all(placeId, from),
  )
    // A level the app does not know is dropped rather than shown: the CHECK
    // constraint makes this unreachable today, and a future level added to the
    // table must not reach an older client as something it cannot word.
    .filter((r) => isQueueLevel(r.level))
    .map((r) => ({ placeId: r.place_id, level: r.level as QueueLevel, at: r.at }));
}

/** What a place's queue reads as now. */
export const queueFor = (db: DB, placeId: string, now = new Date()): QueueReading =>
  readQueue(queueReports(db, placeId, now), now.getTime());

export type QueueRefusal = 'unknown-place' | 'bad-level' | 'already-reported';

export interface QueueResult {
  recorded: boolean;
  /** Why not, when it was not. */
  because: QueueRefusal | null;
  queue: QueueReading;
}

/**
 * Record what somebody saw.
 *
 * Refuses a second report from the SAME person inside `REPORT_EVERY_MIN`, so
 * one phone cannot become a crowd - the ceiling the bus sightings keep, for
 * the same reason. Reports from different people are all kept, and
 * `readQueue` is what decides whether they agree.
 */
export function reportQueue(
  db: DB,
  args: { userId: string; placeId: string; level: unknown; now?: Date },
): QueueResult {
  const now = args.now ?? new Date();
  const answer = (because: QueueRefusal | null): QueueResult => ({
    recorded: because === null,
    because,
    queue: takesQueueReports(args.placeId) ? queueFor(db, args.placeId, now) : readQueue([], now.getTime()),
  });

  if (!takesQueueReports(args.placeId)) return answer('unknown-place');
  if (!isQueueLevel(args.level)) return answer('bad-level');

  const since = new Date(now.getTime() - REPORT_EVERY_MIN * 60_000).toISOString();
  const again = row<{ id: string }>(
    db.prepare(
      'SELECT id FROM canteen_queue_reports WHERE user_id = ? AND place_id = ? AND at >= ? LIMIT 1',
    ).get(args.userId, args.placeId, since),
  );
  if (again) return answer('already-reported');

  db.prepare(
    'INSERT INTO canteen_queue_reports (id, user_id, place_id, level, at) VALUES (?,?,?,?,?)',
  ).run(randomUUID(), args.userId, args.placeId, args.level, now.toISOString());

  return answer(null);
}
