/**
 * The low-carbon leg: Trip Points for getting between two places on foot.
 *
 * The deck promised Green Points for "low-carbon travel". They are not paid
 * here, and on purpose: green means a host verified it, and nobody verified
 * this - the phone did. What the phone CAN say is that two geofenced
 * check-ins on the same island day are far enough apart to have been a real
 * journey and close enough in time that only a walk fits. That is a
 * measured leg, and a measured leg pays the self-verified currency, at the
 * rate of a check-in and a half.
 *
 * The bounds are deliberately walking, not cycling: a songthaew in Chaweng
 * traffic does fifteen kilometres an hour too, and a rule that could not
 * tell a bicycle from a bus would be paying for the bus.
 */

import { metresBetween } from './presence.ts';

export const LOW_CARBON_TRIP_POINTS = 30;
/** Slower than this between the two check-ins and it was a walk. Brisk is 6. */
export const WALK_MAX_KM_H = 6;
/**
 * Shorter than this and it is the same beach, not a journey.
 *
 * The ISLAND's figure, and the default. It is a distance standing in for a
 * rule - far enough apart to have been a real journey - and that rule means
 * different distances in different places, so each area carries its own
 * (`Area.legMinM` in areas.ts).
 */
export const LEG_MIN_M = 800;

/**
 * The same rule at campus scale.
 *
 * Eight hundred metres was measured against Chaweng and Lamai. On a
 * university campus it is longer than the campus: the two furthest places at
 * KU Sriracha are 656 m apart, and at RMUTT Thanyaburi 695 m. With the
 * island's figure, NO walk on either campus could ever qualify - the ledger
 * would never pay a leg, the egg that hatches on a walked leg would never
 * hatch, and the mechanic would sit on screen with nothing behind it.
 *
 * A hundred and fifty metres is the shortest gap that is still somewhere
 * else rather than the next room. The speed cap does the rest of the work
 * the distance used to do alone: nobody rides two hundred metres across a
 * campus, so a leg that short which also took long enough to walk, was
 * walked.
 */
export const CAMPUS_LEG_MIN_M = 150;
/** Longer than this and the phone cannot say what happened in between. */
export const LEG_MAX_MIN = 240;

export type LegVerdict = 'ok' | 'same-place' | 'too-short' | 'too-fast' | 'too-long' | 'out-of-order';

export interface Leg {
  metres: number;
  minutes: number;
  kmPerHour: number;
  qualifies: boolean;
  verdict: LegVerdict;
}

export function lowCarbonLeg(
  from: { placeId: string; lat: number; lng: number; at: Date },
  to: { placeId: string; lat: number; lng: number; at: Date },
  /** The area's own floor. Defaults to the island's, so old callers are unchanged. */
  minMetres: number = LEG_MIN_M,
): Leg {
  const metres = Math.round(metresBetween(from, to));
  const minutes = (to.at.getTime() - from.at.getTime()) / 60_000;
  const kmPerHour = minutes > 0 ? (metres / 1000) / (minutes / 60) : Infinity;
  const base = { metres, minutes: Math.round(minutes), kmPerHour: Number.isFinite(kmPerHour) ? Math.round(kmPerHour * 10) / 10 : Infinity };
  const say = (verdict: LegVerdict): Leg => ({ ...base, qualifies: verdict === 'ok', verdict });
  if (minutes <= 0) return say('out-of-order');
  if (from.placeId === to.placeId) return say('same-place');
  if (metres < minMetres) return say('too-short');
  if (minutes > LEG_MAX_MIN) return say('too-long');
  if (kmPerHour > WALK_MAX_KM_H) return say('too-fast');
  return say('ok');
}
