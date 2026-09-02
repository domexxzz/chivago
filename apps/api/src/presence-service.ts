/**
 * The second signal on the geofence - see packages/core/src/presence.ts for
 * why each check exists. This is the stateful half: the last fix the server
 * accepted from each traveller, so the next one can be judged against it.
 *
 * Every refusal here is a domain error mapped in http.ts, and every one of
 * them lands the traveller on the "recorded, not scored" path in the app
 * rather than a dead end.
 */

import {
  MAX_TRAVEL_KM_PER_MIN, fixIsUsable, impliedKmPerMin, type Fix,
} from '@chivago/core';
import { row, type DB } from './db.ts';

export class MockedLocation extends Error {
  constructor() {
    super('This position looks simulated. Turn off mock locations and try again.');
    this.name = 'MockedLocation';
  }
}

export class FixTooCoarse extends Error {
  accuracyM: number;
  radiusM: number;
  constructor(accuracyM: number, radiusM: number) {
    super(`Your position is only accurate to about ${Math.round(accuracyM)} m, wider than the ${radiusM} m site. Move into the open and try again.`);
    this.name = 'FixTooCoarse';
    this.accuracyM = accuracyM;
    this.radiusM = radiusM;
  }
}

export class ImpossibleTravel extends Error {
  kmPerMin: number;
  sinceMinutes: number;
  constructor(kmPerMin: number, sinceMinutes: number) {
    super(`That is ${Math.round(kmPerMin)} km a minute since your last check-in ${Math.max(1, Math.round(sinceMinutes))} min ago. Nothing on the island moves that fast.`);
    this.name = 'ImpossibleTravel';
    this.kmPerMin = kmPerMin;
    this.sinceMinutes = sinceMinutes;
  }
}

interface LastFix { lat: number; lng: number; at: string }

const lastFix = (db: DB, userId: string): LastFix | undefined =>
  row<LastFix>(db.prepare('SELECT lat, lng, at FROM last_fix WHERE user_id = ?').get(userId));

/**
 * Judge a fix. Throws the first thing wrong with it, cheapest first: the OS
 * said it is fake; it is too coarse to be inside the fence; it is too far
 * from the last one for the time that has passed.
 *
 * Does NOT check the fence itself - the caller owns the radius and the
 * distance, and wants to say "too far" before anything here.
 */
export function assertPresence(
  db: DB,
  args: { userId: string; fix: Fix; radiusM: number; now?: Date },
): void {
  const now = args.now ?? new Date();
  if (args.fix.mocked === true) throw new MockedLocation();
  if (!fixIsUsable(args.fix.accuracyM, args.radiusM)) {
    throw new FixTooCoarse(args.fix.accuracyM as number, args.radiusM);
  }
  const prev = lastFix(db, args.userId);
  // A fix OLDER than the last one known is left unjudged. A live client is
  // always judged at server time, so only a backfilled history - the demo's
  // five days, written newest last - can produce it, and a backfill is not
  // travel. Judging it read as teleporting backwards in time.
  if (prev && now.getTime() >= new Date(prev.at).getTime()) {
    const elapsedMs = now.getTime() - new Date(prev.at).getTime();
    const v = impliedKmPerMin(prev, args.fix, elapsedMs);
    if (v > MAX_TRAVEL_KM_PER_MIN) throw new ImpossibleTravel(v, elapsedMs / 60_000);
  }
}

/** Remember an accepted fix, so the next one can be judged against it. */
export function recordFix(db: DB, userId: string, fix: Fix, now = new Date()): void {
  db.prepare(
    `INSERT INTO last_fix (user_id, lat, lng, at) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET lat = excluded.lat, lng = excluded.lng, at = excluded.at
     WHERE excluded.at >= last_fix.at`,
  ).run(userId, fix.lat, fix.lng, now.toISOString());
}
