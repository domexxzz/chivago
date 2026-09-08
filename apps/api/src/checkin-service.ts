/**
 * Place check-ins - the Trip Point earn.
 *
 * This is the one earn in the system with no host and no photo behind it, so
 * it needs a different guard than a quest: presence, then a rate limit.
 *
 *  - PRESENCE. The same geofence check the quest flow uses, at a wider radius,
 *    because a place is a beach or a market rather than a point and consumer
 *    GPS is routinely 30-50 m out under tree cover.
 *  - ONCE PER PLACE PER DAY, in ISLAND time. Without that, standing on Chaweng
 *    and tapping repeatedly is a points printer, and the currency is worthless
 *    within a week.
 *
 * What this deliberately does NOT do is award Green Points. Nobody verified
 * anything here beyond the phone's own claim to be somewhere, and self-reported
 * presence must never reach the currency an ESG auditor is asked to trust.
 */

import { CHECKIN_RADIUS_M, CHECKIN_TRIP_POINTS, LOW_CARBON_TRIP_POINTS, islandDateKey, lowCarbonLeg } from '@chivago/core';
import type { Balances, Fix } from '@chivago/core';
import { row, type DB } from './db.ts';
import { distanceMetres, OutsideGeofence } from './quest-service.ts';
import { awardCheckin, awardWalk } from './wallet-service.ts';
import { assertPresence, recordFix } from './presence-service.ts';
import { fenceOff } from './fence.ts';

export interface CheckinResult {
  placeId: string;
  placeName: string;
  /** False when this place was already checked in today. Nothing was awarded. */
  awarded: boolean;
  pointsAwarded: number;
  balances: Balances;
  exp: number;
  /** Metres from the place centre when the check-in was accepted. */
  distanceM: number;
  /**
   * The leg on foot this check-in closed, if the previous check-in today was
   * far enough away and long enough ago that only a walk fits. Null when
   * there was no previous check-in, or the leg did not qualify, or it was
   * already paid.
   */
  walk: { fromPlaceId: string; fromPlaceName: string; metres: number; minutes: number; points: number } | null;
}

/** The most recent earlier check-in today, with its place. */
function previousCheckinToday(
  db: DB, userId: string, dayKey: string, before: Date,
): { placeId: string; name: string; lat: number; lng: number; at: Date } | null {
  const found = row<{ source_ref: string; occurred_at: string }>(
    db.prepare(
      `SELECT source_ref, occurred_at FROM ledger
       WHERE user_id = ? AND kind = 'checkin' AND occurred_at < ? AND source_ref LIKE ?
       ORDER BY occurred_at DESC LIMIT 1`,
    ).get(userId, before.toISOString(), `checkin:%:user:${userId}:${dayKey}`),
  );
  if (!found) return null;
  const placeId = found.source_ref.slice('checkin:'.length, found.source_ref.indexOf(':user:'));
  const place = row<{ id: string; name_en: string; lat: number; lng: number }>(
    db.prepare('SELECT id, name_en, lat, lng FROM places WHERE id = ?').get(placeId),
  );
  if (!place) return null;
  return { placeId: place.id, name: place.name_en, lat: place.lat, lng: place.lng, at: new Date(found.occurred_at) };
}

/**
 * Record a check-in.
 *
 * Throws OutsideGeofence when the caller is not there. Returns `awarded: false`
 * - not an error - when they are there but have already checked in today: a
 * second visit is normal behaviour, not a mistake, and the app should say so
 * warmly rather than red.
 */
export function checkIn(
  db: DB,
  args: { userId: string; placeId: string; now?: Date } & Fix,
): CheckinResult | null {
  const place = row<{ id: string; name_en: string; lat: number; lng: number }>(
    db.prepare('SELECT id, name_en, lat, lng FROM places WHERE id = ?').get(args.placeId),
  );
  if (!place) return null;

  const distanceM = distanceMetres(
    { lat: place.lat, lng: place.lng },
    { lat: args.lat, lng: args.lng },
  );
  // The fence, unless this deployment has deliberately opened it. See
  // fence.ts: while it is open the app is required to say so on screen.
  if (!fenceOff() && distanceM > CHECKIN_RADIUS_M) {
    throw new OutsideGeofence(distanceM, CHECKIN_RADIUS_M);
  }

  const now = args.now ?? new Date();
  // The second signal: mocked, too coarse, or too fast since the last fix.
  // After the fence, so 'too far' is still the first thing an honest
  // traveller hears. See packages/core/src/presence.ts.
  const fix: Fix = { lat: args.lat, lng: args.lng, accuracyM: args.accuracyM, mocked: args.mocked };
  // With no fence there is no position worth judging, and the travel check
  // would refuse an honest tester who moved 450 km between two taps.
  if (!fenceOff()) assertPresence(db, { userId: args.userId, fix, radiusM: CHECKIN_RADIUS_M, now });

  const movement = awardCheckin(db, {
    userId: args.userId,
    placeId: place.id,
    placeName: place.name_en,
    points: CHECKIN_TRIP_POINTS,
    dayKey: islandDateKey(now),
    occurredAt: now.toISOString(),
  });
  recordFix(db, args.userId, fix, now);

  // The leg that brought them here. Only on a fresh check-in: a second
  // check-in at the same beach closes no journey.
  let walk: CheckinResult['walk'] = null;
  let balances = movement.balances;
  let exp = movement.exp;
  if (movement.applied) {
    const dayKey = islandDateKey(now);
    const prev = previousCheckinToday(db, args.userId, dayKey, now);
    if (prev) {
      const leg = lowCarbonLeg(
        { placeId: prev.placeId, lat: prev.lat, lng: prev.lng, at: prev.at },
        { placeId: place.id, lat: place.lat, lng: place.lng, at: now },
      );
      if (leg.qualifies) {
        const paid = awardWalk(db, {
          userId: args.userId, fromId: prev.placeId, fromName: prev.name, toId: place.id, toName: place.name_en,
          points: LOW_CARBON_TRIP_POINTS, dayKey, occurredAt: now.toISOString(),
        });
        if (paid.applied) {
          walk = { fromPlaceId: prev.placeId, fromPlaceName: prev.name, metres: leg.metres, minutes: leg.minutes, points: LOW_CARBON_TRIP_POINTS };
          balances = paid.balances;
          exp = paid.exp;
        }
      }
    }
  }

  return {
    placeId: place.id,
    placeName: place.name_en,
    awarded: movement.applied,
    pointsAwarded: movement.applied ? CHECKIN_TRIP_POINTS : 0,
    balances,
    exp,
    distanceM: Math.round(distanceM),
    walk,
  };
}

/** Places this user has already checked in at today, so the UI can say so. */
export function checkedInToday(db: DB, userId: string, now = new Date()): string[] {
  const prefix = `checkin:`;
  const suffix = `:user:${userId}:${islandDateKey(now)}`;
  const found = db
    .prepare("SELECT source_ref FROM ledger WHERE user_id = ? AND kind = 'checkin'")
    .all(userId) as unknown as { source_ref: string }[];
  return found
    .filter((r) => r.source_ref.startsWith(prefix) && r.source_ref.endsWith(suffix))
    .map((r) => r.source_ref.slice(prefix.length, r.source_ref.length - suffix.length));
}
