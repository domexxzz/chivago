/**
 * Getting there.
 *
 * The app already knew, to the metre, how far somebody was standing from a
 * place: it computes the distance on every check-in, against a 250 m fence.
 * But it only ever SAID so when refusing one - "about 400 m away" was an
 * error message. Every other screen showed a place with no hint of whether
 * it was around the corner or across the island, and the one button labelled
 * "Go there" opened another screen inside the app.
 *
 * That is the gap this closes, and it closes only the honest half of it.
 * Turn-by-turn routing on Samui is a data-collection project first (see
 * `docs/10-pitch-gap-audit.md` on Smart Route: the ferry timetables and
 * songthaew stops largely do not exist in machine-readable form). Telling
 * somebody how far away a place is, which way it lies, and handing them off
 * to a map that already has the roads needs no data this repo does not have.
 *
 * WHAT IS NOT SENT. The link carries the DESTINATION only. Google Maps fills
 * in "your location" itself, from the permission the traveller already gave
 * it, so this app never puts a traveller's own position in a URL - the one
 * place a position would be logged by a third party, and cached, and shared
 * by anyone who copies the link. It also makes the link identical for every
 * traveller looking at the same place, which is a good property for a link
 * that can end up in a screenshot.
 */

import type { Bilingual } from './types.ts';
import { metresBetween } from './presence.ts';
import { CHECKIN_RADIUS_M } from './seed.ts';

/**
 * Walking pace for the estimate, km/h.
 *
 * Not `WALK_MAX_KM_H` from `low-carbon.ts`: that is 6, and it is an UPPER
 * BOUND used to reject a songthaew, not a speed anybody keeps. Naismith's
 * rule plans on 5 km/h in temperate hills; this is a tropical island where
 * the walk is at thirty degrees with no pavement for much of it. Quoting a
 * pace nobody achieves would make every estimate optimistic in the one
 * direction that leaves a traveller out in the sun.
 */
export const WALK_KM_H = 4.5;

/**
 * Past this, the link stops suggesting a walk, in metres.
 *
 * Three kilometres is about forty minutes at the pace above. Beyond it, most
 * people take a songthaew whatever the app suggests, and a map that opens in
 * walking mode for a two-hour walk is a map that has to be corrected before
 * it can be used. Under it, walking is a real choice, and it is the one the
 * product pays Trip Points for (`low-carbon.ts`).
 */
export const WALK_SUGGEST_MAX_M = 3_000;

export type CompassPoint = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';

const COMPASS: Record<CompassPoint, Bilingual> = {
  N: { en: 'north', th: 'เหนือ' },
  NE: { en: 'north-east', th: 'ตะวันออกเฉียงเหนือ' },
  E: { en: 'east', th: 'ตะวันออก' },
  SE: { en: 'south-east', th: 'ตะวันออกเฉียงใต้' },
  S: { en: 'south', th: 'ใต้' },
  SW: { en: 'south-west', th: 'ตะวันตกเฉียงใต้' },
  W: { en: 'west', th: 'ตะวันตก' },
  NW: { en: 'north-west', th: 'ตะวันตกเฉียงเหนือ' },
};

const POINTS: CompassPoint[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

export interface LatLng { lat: number; lng: number }

/**
 * Initial bearing from one point to another, in degrees clockwise from north.
 *
 * The great-circle bearing rather than the flat-map one. Over the few
 * kilometres this is used for they agree to well under a degree, but the
 * flat version is wrong near the poles in a way that is invisible until it
 * is not, and this is four lines either way.
 */
export function bearingDegrees(from: LatLng, to: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLng = toRad(to.lng - from.lng);
  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360;
}

/** Eight points, because sixteen is a precision a phone in a pocket does not have. */
export function compassPoint(from: LatLng, to: LatLng): CompassPoint {
  const slice = Math.round(bearingDegrees(from, to) / 45) % 8;
  return POINTS[slice]!;
}

export const compassName = (point: CompassPoint): Bilingual => COMPASS[point];

/**
 * A distance a person can read, from a distance a satellite measured.
 *
 * Rounded to the precision the number deserves rather than the precision it
 * arrives with: consumer GPS is 30-50 m out under trees, so "182 m" claims
 * four times the accuracy the fix has. Ten metres under a kilometre, a tenth
 * of a kilometre under ten, whole kilometres after that.
 */
export function formatDistance(metres: number): Bilingual {
  if (!Number.isFinite(metres) || metres < 0) return { en: '', th: '' };
  if (metres < 1_000) {
    const m = Math.max(10, Math.round(metres / 10) * 10);
    return { en: `${m} m`, th: `${m} ม.` };
  }
  const km = metres / 1_000;
  const shown = km < 10 ? (Math.round(km * 10) / 10).toFixed(1) : String(Math.round(km));
  return { en: `${shown} km`, th: `${shown} กม.` };
}

/** Minutes on foot at `WALK_KM_H`, rounded to the nearest five past ten. */
export function walkMinutes(metres: number): number {
  const raw = (metres / 1_000 / WALK_KM_H) * 60;
  if (raw < 10) return Math.max(1, Math.round(raw));
  return Math.round(raw / 5) * 5;
}

/** Whether to offer the walk, and open the map already in walking mode. */
export const isWalkable = (metres: number): boolean => metres <= WALK_SUGGEST_MAX_M;

/**
 * Inside the check-in fence: there is nothing to navigate, and the check-in
 * button above will work. Said as arrival rather than as a distance, because
 * "250 m away" beside a working check-in button reads like a contradiction.
 */
export const hasArrived = (metres: number): boolean => metres <= CHECKIN_RADIUS_M;

export interface WayThere {
  metres: number;
  distance: Bilingual;
  point: CompassPoint;
  direction: Bilingual;
  /** Minutes on foot. Present whether or not the walk is worth suggesting. */
  minutesOnFoot: number;
  walkable: boolean;
  arrived: boolean;
}

/** Everything a screen needs to say about the gap between two points. */
export function wayThere(from: LatLng, to: LatLng): WayThere {
  const metres = metresBetween(from, to);
  const point = compassPoint(from, to);
  return {
    metres,
    distance: formatDistance(metres),
    point,
    direction: compassName(point),
    minutesOnFoot: walkMinutes(metres),
    walkable: isWalkable(metres),
    arrived: hasArrived(metres),
  };
}

/**
 * A Google Maps directions link for a destination.
 *
 * The `api=1` universal URL, which is the documented, versioned one: it opens
 * the installed app on Android and iOS and the web map everywhere else, so
 * there is no per-platform scheme to keep working and nothing to fall back
 * from. Coordinates rather than a name, because two beaches on this island
 * share a name and a pin does not.
 *
 * No `origin`. See the file header - that is deliberate, not an omission.
 */
export function mapsDirectionsUrl(to: LatLng, opts: { walking?: boolean } = {}): string {
  const dest = `${to.lat.toFixed(6)},${to.lng.toFixed(6)}`;
  const mode = opts.walking ? '&travelmode=walking' : '';
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}${mode}`;
}
