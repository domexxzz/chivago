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

import { CHECKIN_RADIUS_M, CHECKIN_TRIP_POINTS, islandDateKey } from '@chivago/core';
import type { Balances } from '@chivago/core';
import { row, type DB } from './db.ts';
import { distanceMetres, OutsideGeofence } from './quest-service.ts';
import { awardCheckin } from './wallet-service.ts';

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
  args: { userId: string; placeId: string; lat: number; lng: number; now?: Date },
): CheckinResult | null {
  const place = row<{ id: string; name_en: string; lat: number; lng: number }>(
    db.prepare('SELECT id, name_en, lat, lng FROM places WHERE id = ?').get(args.placeId),
  );
  if (!place) return null;

  const distanceM = distanceMetres(
    { lat: place.lat, lng: place.lng },
    { lat: args.lat, lng: args.lng },
  );
  if (distanceM > CHECKIN_RADIUS_M) {
    throw new OutsideGeofence(distanceM, CHECKIN_RADIUS_M);
  }

  const now = args.now ?? new Date();
  const movement = awardCheckin(db, {
    userId: args.userId,
    placeId: place.id,
    placeName: place.name_en,
    points: CHECKIN_TRIP_POINTS,
    dayKey: islandDateKey(now),
    occurredAt: now.toISOString(),
  });

  return {
    placeId: place.id,
    placeName: place.name_en,
    awarded: movement.applied,
    pointsAwarded: movement.applied ? CHECKIN_TRIP_POINTS : 0,
    balances: movement.balances,
    exp: movement.exp,
    distanceM: Math.round(distanceM),
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
