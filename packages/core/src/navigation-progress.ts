/**
 * Where on the route the traveller actually is.
 *
 * Everything a navigator says out loud - "turn left in 120 m", "14 minutes
 * left", "you have gone the wrong way" - is a claim about a GPS fix measured
 * against a polyline, and every one of those claims is wrong in a different
 * way if the measurement is done naively. This file is the measurement, and
 * it is written as plain functions over plain data so that each wrong answer
 * can be reproduced in a test rather than discovered on a motorbike.
 *
 * FOUR THINGS A NAIVE VERSION GETS WRONG, and what is done about each.
 *
 *   1. NEAREST POINT ON THE WHOLE LINE. A route that crosses itself, loops
 *      back along the same valley, or runs beside the road it will return
 *      on - all of which Samui's ring road does - has two points equally
 *      near the traveller, and the global nearest flips between them. The
 *      fix: search only a WINDOW of the route around where the traveller
 *      already was (`MATCH_BACK_M` behind, `MATCH_FORWARD_M` ahead), and
 *      leave the window only when the whole line offers something decisively
 *      better (`MATCH_JUMP_GAIN_M). A fix that jumps across town still gets
 *      found; a parallel road forty metres away does not steal the match.
 *
 *   2. PROGRESS THAT GOES BACKWARDS. It must, sometimes - somebody who walks
 *      back for a forgotten bag has genuinely gone backwards - so this does
 *      NOT latch progress forward. The window is what makes jitter harmless:
 *      a fix thirty metres sideways projects onto nearly the same point
 *      along the line, so the along-track number barely moves.
 *
 *   3. A BAD FIX TAKEN AS SERIOUSLY AS A GOOD ONE. Under tree cover a phone
 *      reports a position it is fifty metres unsure of. The dot still moves -
 *      hiding it would be worse - but an UNCONFIDENT fix is not allowed to
 *      count towards going off route or towards arriving, which are the two
 *      conclusions that cost a traveller something when they are wrong.
 *
 *   4. A CAMERA THAT SPINS. GPS heading is noise at walking pace and absent
 *      when standing still, and 359 degrees to 1 degree is a two-degree turn
 *      that arithmetic reads as 358. Both are handled below, in
 *      `angleDelta` and `cameraBearing`.
 *
 * NO STATE IS HELD HERE. `advance` takes the previous answer and returns the
 * next one; the hook that owns the watcher owns the state. That is what lets
 * a test drive a hundred fixes through a route in a millisecond.
 */

import type { LatLng } from './wayfinding.ts';
import { bearingDegrees } from './wayfinding.ts';
import { metresBetween } from './presence.ts';
import type { NavRoute } from './navigation.ts';

/**
 * One position from the device, with everything the OS said about it.
 *
 * Nullable fields are nullable because they genuinely arrive missing: a
 * phone standing still reports no heading, a browser reports no speed, and
 * an indoor fix sometimes reports no accuracy. Every one of those is a
 * normal Tuesday and none of them is an error.
 */
export interface NavFix {
  lat: number;
  lng: number;
  /** The fix's own error radius in metres, as the OS reported it, or null. */
  accuracyM: number | null;
  /** Course over ground, degrees clockwise from north, or null. */
  headingDeg: number | null;
  speedMps: number | null;
  /** Milliseconds since the epoch, as the OS stamped it. */
  timestamp: number;
}

/**
 * The numbers that decide when the app says something.
 *
 * All of them are arguments rather than constants in the code below,
 * because every one is a field-testing decision and not a mathematical
 * truth. The defaults are the starting point this ships with; the type is
 * exported so a screen, or a test, can say exactly which one it is moving.
 */
export interface NavTuning {
  /** Above this error radius a fix moves the dot and decides nothing else. */
  trustAccuracyM: number;
  /** Behind and ahead of the last match, the stretch of route searched. */
  matchBackM: number;
  matchForwardM: number;
  /** How much nearer the whole line must be before the window is abandoned. */
  matchJumpGainM: number;
  /** Perpendicular distance from the road that counts as off it. */
  offRouteM: number;
  /** Consecutive confident fixes off the road before it is believed. */
  offRouteFixes: number;
  /** Within this of the destination, and arrival is possible. */
  arriveM: number;
  /** A poor fix widens the circle, but never past this. */
  arriveMaxM: number;
  /** Consecutive confident fixes inside the circle before arrival is called. */
  arriveFixes: number;
  /** Route remaining at which the road itself has run out. */
  endOfRouteM: number;
  /** Below this speed the device's heading is noise, not a direction. */
  headingMinSpeedMps: number;
  /** The camera's turn rate. A faster one reads as a flick, not a turn. */
  maxTurnDegPerSec: number;
}

export const NAV_TUNING: NavTuning = {
  trustAccuracyM: 50,
  matchBackM: 150,
  matchForwardM: 500,
  matchJumpGainM: 25,
  // Between 40 and 60 m is the band this was asked to sit in. Forty-five
  // clears a dual carriageway's far side and a car park's width while still
  // catching a missed turn within a block.
  offRouteM: 45,
  offRouteFixes: 3,
  arriveM: 30,
  arriveMaxM: 60,
  arriveFixes: 2,
  endOfRouteM: 15,
  headingMinSpeedMps: 0.8,
  maxTurnDegPerSec: 120,
};

/** Metres per degree of latitude. Good to a tenth of a percent anywhere. */
const M_PER_DEG = 111_320;

/**
 * The route measured once, so a hundred fixes do not measure it a hundred
 * times.
 *
 * `cumulative[i]` is the distance along the line to `line[i]`, so the
 * distance between any two points on the route is a subtraction rather than
 * a loop. On a 20 km drive the line is nine hundred points; doing this per
 * fix is the difference between a map that follows and a map that stutters.
 */
export interface RouteMetrics {
  cumulative: number[];
  totalM: number;
}

export function routeMetrics(line: readonly (readonly [number, number])[]): RouteMetrics {
  const cumulative = new Array<number>(line.length);
  let run = 0;
  for (let i = 0; i < line.length; i += 1) {
    if (i > 0) {
      const a = line[i - 1]!;
      const b = line[i]!;
      run += metresBetween({ lat: a[1], lng: a[0] }, { lat: b[1], lng: b[0] });
    }
    cumulative[i] = run;
  }
  return { cumulative, totalM: run };
}

/**
 * The nearest point of one segment, and how far off it the fix is.
 *
 * A local flat projection, not a great circle. Over a segment a few tens of
 * metres long the curvature of the earth is smaller than the GPS error, and
 * the flat version is the one that can be solved in closed form - which is
 * what makes a windowed search over a few hundred segments free.
 *
 * `t` is where along the segment the foot of the perpendicular fell, clamped
 * into [0, 1] so a fix beyond either end snaps to that end rather than to a
 * point on the segment's infinite extension.
 */
export function nearestOnSegment(
  fix: LatLng,
  a: readonly [number, number],
  b: readonly [number, number],
): { point: LatLng; t: number; metres: number } {
  const cos = Math.cos((fix.lat * Math.PI) / 180);
  const x = (lng: number) => lng * M_PER_DEG * cos;
  const y = (lat: number) => lat * M_PER_DEG;

  const ax = x(a[0]); const ay = y(a[1]);
  const bx = x(b[0]); const by = y(b[1]);
  const px = x(fix.lng); const py = y(fix.lat);

  const dx = bx - ax; const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  const point: LatLng = {
    lng: a[0] + (b[0] - a[0]) * t,
    lat: a[1] + (b[1] - a[1]) * t,
  };
  return { point, t, metres: metresBetween(fix, point) };
}

export interface RouteMatch {
  /** The segment matched: `line[index]` to `line[index + 1]`. */
  index: number;
  t: number;
  snapped: LatLng;
  /** Perpendicular distance from the fix to the road, in metres. */
  offRouteM: number;
  /** Distance along the route to the snapped point. */
  travelledM: number;
}

/** The nearest point of a stretch of the line, searched segment by segment. */
function searchRange(
  line: readonly (readonly [number, number])[],
  cumulative: readonly number[],
  fix: LatLng,
  first: number,
  last: number,
): RouteMatch | null {
  let best: RouteMatch | null = null;
  for (let i = Math.max(0, first); i <= Math.min(last, line.length - 2); i += 1) {
    const a = line[i]!;
    const b = line[i + 1]!;
    const hit = nearestOnSegment(fix, a, b);
    if (best === null || hit.metres < best.offRouteM) {
      const segment = (cumulative[i + 1] ?? 0) - (cumulative[i] ?? 0);
      best = {
        index: i,
        t: hit.t,
        snapped: hit.point,
        offRouteM: hit.metres,
        travelledM: (cumulative[i] ?? 0) + segment * hit.t,
      };
    }
  }
  return best;
}

/** The first index at or before a given distance along the route. */
function indexAt(cumulative: readonly number[], metres: number): number {
  // Binary search: on a nine-hundred-point drive a linear scan per fix is
  // the one place this file would show up in a profile.
  let lo = 0;
  let hi = cumulative.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((cumulative[mid] ?? 0) <= metres) lo = mid; else hi = mid - 1;
  }
  return lo;
}

/**
 * Where the fix sits on the route.
 *
 * `from` is the distance along the route the traveller was last known to be
 * at, and it is the whole reason this is reliable. Pass null - on the first
 * fix of a session, or after a reroute - and the whole line is searched,
 * which is right exactly once.
 */
export function matchToRoute(
  line: readonly (readonly [number, number])[],
  metrics: RouteMetrics,
  fix: LatLng,
  from: number | null,
  tuning: NavTuning = NAV_TUNING,
): RouteMatch | null {
  if (line.length < 2) return null;
  const { cumulative } = metrics;
  if (from === null) return searchRange(line, cumulative, fix, 0, line.length - 2);

  const first = indexAt(cumulative, from - tuning.matchBackM);
  const last = indexAt(cumulative, from + tuning.matchForwardM);
  const windowed = searchRange(line, cumulative, fix, first, last);
  // Inside the window and near the road: the ordinary case, and the one that
  // must not be second-guessed, or a route that doubles back will steal the
  // match from the stretch the traveller is actually on.
  if (windowed && windowed.offRouteM <= tuning.offRouteM) return windowed;

  const global = searchRange(line, cumulative, fix, 0, line.length - 2);
  if (!global) return windowed;
  if (!windowed) return global;
  // The whole line only wins when it wins clearly. A metre or two better is
  // noise; `matchJumpGainM` better is a phone that has jumped, or a
  // traveller who has rejoined the route somewhere else entirely.
  return global.offRouteM + tuning.matchJumpGainM < windowed.offRouteM ? global : windowed;
}

/**
 * The shortest way round a circle, in degrees, signed.
 *
 * The one piece of arithmetic every compass gets wrong once: from 359 to 1
 * is +2, not -358, and a camera driven by the subtraction spins all the way
 * round the wrong way every time a traveller crosses north.
 */
export const angleDelta = (from: number, to: number): number =>
  ((((to - from) % 360) + 540) % 360) - 180;

/** A step of at most `maxStepDeg` from one bearing towards another. */
export function approachAngle(from: number, to: number, maxStepDeg: number): number {
  const delta = angleDelta(from, to);
  const step = Math.max(-maxStepDeg, Math.min(maxStepDeg, delta));
  return (((from + step) % 360) + 360) % 360;
}

/** The direction the road runs at a point on it, or null at a degenerate one. */
export function routeBearingAt(
  line: readonly (readonly [number, number])[],
  index: number,
): number | null {
  const a = line[Math.max(0, Math.min(index, line.length - 2))];
  const b = line[Math.max(1, Math.min(index + 1, line.length - 1))];
  if (!a || !b) return null;
  if (a[0] === b[0] && a[1] === b[1]) return null;
  return bearingDegrees({ lat: a[1], lng: a[0] }, { lat: b[1], lng: b[0] });
}

/**
 * Which way the camera should look.
 *
 * Three sources in order of trust, and the order is the point:
 *
 *   - the DEVICE's course, but only while moving. Below walking pace a GPS
 *     heading is the direction between two noisy fixes a metre apart, which
 *     is a random number, and a phone in a pocket at a traffic light would
 *     spin the map all the way round.
 *   - the ROAD's direction at the matched point. A traveller stopped on a
 *     road is still facing along it, and this is the answer that keeps the
 *     map still instead of guessing.
 *   - the previous bearing, when there is no route and nothing is moving.
 *
 * Whatever is chosen, the camera only ever TURNS TOWARDS it, at a limited
 * rate. That is what makes the difference between a map that follows a
 * motorbike round a bend and a map that snaps.
 */
export function cameraBearing(
  previous: number | null,
  fix: NavFix,
  routeBearing: number | null,
  elapsedMs: number,
  tuning: NavTuning = NAV_TUNING,
): number {
  const moving = (fix.speedMps ?? 0) >= tuning.headingMinSpeedMps;
  const device = fix.headingDeg;
  const usable = moving && device !== null && Number.isFinite(device) && device >= 0
    ? ((device % 360) + 360) % 360
    : null;
  const target = usable ?? routeBearing ?? previous;
  if (target === null) return 0;
  if (previous === null) return target;
  // A gap of nothing (two fixes in the same millisecond) still gets a step,
  // or the camera would freeze whenever the OS batched two updates.
  const seconds = Math.max(0.05, Math.min(5, elapsedMs / 1000));
  return approachAngle(previous, target, tuning.maxTurnDegPerSec * seconds);
}

/**
 * Everything the screen needs to say, for one fix.
 *
 * `offRoute` and `arrived` are CONCLUSIONS, already debounced: the streaks
 * that produce them are carried here so the caller never has to keep a
 * counter of its own, and so a test can assert on the streak rather than on
 * what happened to be rendered.
 */
export interface NavProgress {
  /** Where on the line the traveller was put, and how far off it they were. */
  index: number;
  snapped: LatLng;
  offRouteM: number;
  travelledM: number;
  remainingM: number;
  remainingSeconds: number;
  fraction: number;
  /** The maneuver being travelled along now. */
  onManeuver: number;
  /** The one to announce. The last maneuver announces itself. */
  nextManeuver: number;
  /** Metres to the next maneuver's junction. */
  toNextM: number;
  /** Straight-line metres to the destination, which is not the same thing. */
  toDestinationM: number;
  bearingDeg: number;
  speedMps: number;
  /** False when the fix was too uncertain to draw conclusions from. */
  confident: boolean;
  offRouteStreak: number;
  arrivedStreak: number;
  offRoute: boolean;
  arrived: boolean;
  at: number;
}

/** Which maneuver a distance along the route falls inside. */
function maneuverAt(route: NavRoute, cumulative: readonly number[], travelledM: number): number {
  if (route.maneuvers.length === 0) return -1;
  let found = 0;
  for (let i = 0; i < route.maneuvers.length; i += 1) {
    const begin = cumulative[route.maneuvers[i]!.beginIndex] ?? 0;
    // A tolerance, because the snapped point sits a hair before the junction
    // for most of the approach and exactly on it for one fix.
    if (begin <= travelledM + 0.5) found = i; else break;
  }
  return found;
}

/**
 * How long the rest of the road takes, from the router's own per-maneuver
 * times rather than from an average speed.
 *
 * The difference is not academic: a route that is half village lane and half
 * ring road has no average, and prorating the total by distance would
 * promise a ten-minute arrival to somebody with a hill in front of them. The
 * current maneuver is prorated by how much of IT is left, which is the only
 * part that needs an assumption, and it is the shortest part.
 *
 * Falls back to the whole-route ratio when there are no maneuvers, because a
 * route that came back without instructions still has a total.
 */
function remainingSecondsOf(
  route: NavRoute,
  cumulative: readonly number[],
  travelledM: number,
  remainingM: number,
  onManeuver: number,
): number {
  if (onManeuver < 0 || route.maneuvers.length === 0) {
    const total = cumulative[cumulative.length - 1] ?? 0;
    return total > 0 ? route.seconds * (remainingM / total) : 0;
  }
  const current = route.maneuvers[onManeuver]!;
  const begin = cumulative[current.beginIndex] ?? 0;
  const end = cumulative[current.endIndex] ?? begin;
  const span = Math.max(0, end - begin);
  const leftHere = Math.max(0, Math.min(span, end - travelledM));
  let seconds = span > 0 ? current.seconds * (leftHere / span) : 0;
  for (let i = onManeuver + 1; i < route.maneuvers.length; i += 1) {
    seconds += route.maneuvers[i]!.seconds;
  }
  return seconds;
}

/**
 * The next answer, from the last one and a fix.
 *
 * Returns null only when there is no route to measure against, which is a
 * caller's bug rather than a runtime condition; every other kind of bad
 * input - a NaN coordinate, a fix from the far side of the island, a route
 * of two identical points - produces a usable answer with `confident` or the
 * streaks telling the caller what it is worth.
 */
export function advance(
  route: NavRoute,
  metrics: RouteMetrics,
  previous: NavProgress | null,
  fix: NavFix,
  destination: LatLng,
  tuning: NavTuning = NAV_TUNING,
): NavProgress | null {
  if (route.line.length < 2) return null;
  if (!Number.isFinite(fix.lat) || !Number.isFinite(fix.lng)) return previous;

  const { cumulative } = metrics;
  const match = matchToRoute(route.line, metrics, fix, previous?.travelledM ?? null, tuning)
    // A line with two identical points has no segment to match; treat the
    // traveller as standing at its start rather than failing the whole fix.
    ?? { index: 0, t: 0, snapped: { lat: route.line[0]![1], lng: route.line[0]![0] }, offRouteM: 0, travelledM: 0 };

  const total = metrics.totalM;
  const travelledM = Math.max(0, Math.min(total, match.travelledM));
  const remainingM = Math.max(0, total - travelledM);
  const onManeuver = maneuverAt(route, cumulative, travelledM);
  const lastManeuver = route.maneuvers.length - 1;
  const nextManeuver = onManeuver < 0 ? -1 : Math.min(onManeuver + 1, lastManeuver);
  const toNextM = nextManeuver < 0
    ? remainingM
    : Math.max(0, (cumulative[route.maneuvers[nextManeuver]!.beginIndex] ?? total) - travelledM);

  const toDestinationM = metresBetween(fix, destination);
  const accuracy = fix.accuracyM;
  const confident = accuracy === null || !Number.isFinite(accuracy) || accuracy <= tuning.trustAccuracyM;

  /*
    THE ARRIVAL CIRCLE GROWS WITH THE DOUBT, up to a point.

    A fix the phone is forty metres unsure of cannot tell a traveller
    standing in the hotel lobby from one still on the road outside, so
    insisting on thirty metres would leave them driving past. Widening it to
    the error radius says arrived when the phone cannot prove otherwise -
    but it is capped, because beyond sixty metres the circle covers the
    neighbours and "you have arrived" stops meaning anything.
  */
  const circle = Math.min(
    tuning.arriveMaxM,
    Math.max(tuning.arriveM, confident && accuracy !== null ? accuracy : 0),
  );
  // The road running out counts as arriving even when the pin is across a
  // car park: the route ends where the router could get to, and standing at
  // its end having been told nothing is the failure this prevents.
  const atDestination = toDestinationM <= circle || remainingM <= tuning.endOfRouteM;
  const arrivedStreak = confident && atDestination ? (previous?.arrivedStreak ?? 0) + 1 : 0;

  const offRouteNow = confident && match.offRouteM > tuning.offRouteM;
  const offRouteStreak = offRouteNow ? (previous?.offRouteStreak ?? 0) + 1 : 0;

  const elapsed = previous ? Math.max(0, fix.timestamp - previous.at) : 0;
  const bearingDeg = cameraBearing(
    previous?.bearingDeg ?? null,
    fix,
    routeBearingAt(route.line, match.index),
    elapsed,
    tuning,
  );
  const speed = Number.isFinite(fix.speedMps ?? NaN) ? Math.max(0, fix.speedMps!) : null;
  // A light smoothing only: the number drives the camera's zoom, and a zoom
  // that tracks every GPS speed sample breathes in and out at a red light.
  const speedMps = speed === null
    ? (previous?.speedMps ?? 0)
    : previous ? previous.speedMps * 0.6 + speed * 0.4 : speed;

  return {
    index: match.index,
    snapped: match.snapped,
    offRouteM: match.offRouteM,
    travelledM,
    remainingM,
    remainingSeconds: remainingSecondsOf(route, cumulative, travelledM, remainingM, onManeuver),
    fraction: total > 0 ? travelledM / total : 0,
    onManeuver,
    nextManeuver,
    toNextM,
    toDestinationM,
    bearingDeg,
    speedMps,
    confident,
    offRouteStreak,
    arrivedStreak,
    offRoute: offRouteStreak >= tuning.offRouteFixes,
    arrived: arrivedStreak >= tuning.arriveFixes,
    at: fix.timestamp,
  };
}

/**
 * The part of the route already walked, for drawing it differently.
 *
 * Returned as its own line rather than as an index, because that is what a
 * GeoJSON source takes, and because the snapped point has to be ADDED to it:
 * cutting at the last whole vertex would leave the travelled line lagging up
 * to a hundred metres behind the dot on a straight stretch of ring road.
 *
 * Two points minimum or nothing at all. A one-point LineString is not a line
 * and MapLibre draws it as nothing, which is the right outcome but an
 * alarming one to debug.
 */
export function travelledLine(
  line: readonly (readonly [number, number])[],
  progress: NavProgress | null,
): [number, number][] {
  if (!progress || line.length < 2) return [];
  const out: [number, number][] = [];
  for (let i = 0; i <= progress.index && i < line.length; i += 1) {
    const point = line[i]!;
    out.push([point[0], point[1]]);
  }
  out.push([progress.snapped.lng, progress.snapped.lat]);
  return out.length >= 2 ? out : [];
}

/** The part still to come, from the snapped point onwards. */
export function remainingLine(
  line: readonly (readonly [number, number])[],
  progress: NavProgress | null,
): [number, number][] {
  if (line.length < 2) return [];
  if (!progress) return line.map((p) => [p[0], p[1]]);
  const out: [number, number][] = [[progress.snapped.lng, progress.snapped.lat]];
  for (let i = progress.index + 1; i < line.length; i += 1) {
    const point = line[i]!;
    out.push([point[0], point[1]]);
  }
  return out.length >= 2 ? out : [];
}

/**
 * How close the camera should sit, from how fast the traveller is moving.
 *
 * A walker needs the next junction and the one after it; somebody on a moto
 * at fifty needs three hundred metres of road ahead or the turn arrives
 * before the banner does. The numbers are zoom levels, which are
 * logarithmic, so the whole useful range is less than two of them.
 */
export function followZoom(speedMps: number): number {
  if (!Number.isFinite(speedMps) || speedMps <= 1.5) return 17.6;
  if (speedMps <= 4) return 17.2;
  if (speedMps <= 9) return 16.6;
  if (speedMps <= 16) return 16.1;
  return 15.6;
}

/**
 * How steep. Flatter when a turn is close, so the junction is not hidden
 * behind the horizon the pitch creates.
 */
export function followPitch(toNextM: number): number {
  if (!Number.isFinite(toNextM)) return 52;
  if (toNextM < 60) return 42;
  if (toNextM < 140) return 47;
  return 52;
}
