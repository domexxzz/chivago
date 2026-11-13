/**
 * A road route, drawn on the app's own map.
 *
 * `wayfinding.ts` answers *how far and which way* with arithmetic the app
 * can do by itself, and hands the roads to Google. This answers *by which
 * roads*, inside the app, and to do that it has to ask somebody who holds a
 * road graph. That is a real dependency and the file says so plainly.
 *
 * WHO ANSWERS, AND WHY THEM. Valhalla on the FOSSGIS demo server, which the
 * OSM community runs for the OSM community. No key, no token, no account -
 * so `terrain-style.test.ts`'s "free, and stays free" rule survives intact,
 * and there is no secret to rotate before an event. It was chosen over the
 * OSRM demo server for one measurable reason: OSRM's public instance serves
 * ONLY the car graph, and its `/foot/` and `/bike/` paths return the car
 * answer unchanged - Chaweng to Na Muang comes back as a 20 km walk taking
 * 22 minutes. Valhalla answers 249 minutes for the same walk, which is
 * 4.6 km/h, which is a person. An app that pays Trip Points for walking
 * cannot ship a walking time that is really a driving time.
 *
 * WHAT THIS COSTS SOMEBODY ELSE. It is a community server given away for
 * free, with no promise of uptime and no published rate limit. So:
 *
 *   - every caller treats a failure as normal and draws the straight line
 *     instead. Nothing in the app breaks when this service is down, and a
 *     demo given on a bad day still has a map with a direction on it;
 *   - the route is asked for once per destination, not per frame;
 *   - if this ever carries real traffic it moves to a routing server this
 *     project runs, and that is a cost decision, not an engineering one.
 */

import type { Bilingual } from './types.ts';
// The same two numbers `wayfinding.ts` measures the straight line between.
// One definition, so a route and a distance can never disagree about which
// field is which.
import type { LatLng } from './wayfinding.ts';

export type { LatLng };

export const ROUTER = 'https://valhalla1.openstreetmap.de/route';

/**
 * How the traveller means to get there.
 *
 * Two, not five. The island's real modes are feet, a moto and a songthaew,
 * and the last two follow the same roads at roughly the same speed - a
 * separate "songthaew" line would be the car answer with a different label
 * on it, which is the exact dishonesty this file rejected OSRM for.
 */
export type RouteMode = 'walk' | 'ride';

/** Valhalla's own name for each. `auto` covers the moto and the songthaew. */
const COSTING: Record<RouteMode, string> = { walk: 'pedestrian', ride: 'auto' };

export interface Route {
  mode: RouteMode;
  /** Along the road, in metres. Longer than the straight line, always. */
  metres: number;
  seconds: number;
  /** The line to draw, in GeoJSON order: [lng, lat]. */
  line: [number, number][];
}

/**
 * The request, as a URL.
 *
 * A GET with the query in `json`, which is Valhalla's documented shape and
 * keeps this a plain fetch with no body to get wrong. `shape_format` is not
 * asked for: the default encoded polyline is a tenth the size of GeoJSON
 * over a road route, and decoding it is the twenty lines below.
 */
export function routeRequestUrl(from: LatLng, to: LatLng, mode: RouteMode, base = ROUTER): string {
  const body = {
    locations: [
      { lat: from.lat, lon: from.lng },
      { lat: to.lat, lon: to.lng },
    ],
    costing: COSTING[mode],
    directions_options: { units: 'kilometers' },
  };
  return `${base}?json=${encodeURIComponent(JSON.stringify(body))}`;
}

/**
 * Google's polyline algorithm, at Valhalla's precision.
 *
 * Six decimal places, not the five every "decode a Google polyline" snippet
 * assumes - at five the line lands a hundred metres into the sea. The
 * precision is an argument rather than a constant so the test can say that
 * out loud.
 *
 * Returns what it managed to read. A truncated string gives a short line,
 * which draws as a short line; it does not throw in the middle of a map.
 */
export function decodePolyline(encoded: string, precision = 6): [number, number][] {
  const factor = 10 ** precision;
  const out: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte = 0;
    do {
      byte = encoded.charCodeAt(index) - 63;
      index += 1;
      if (!Number.isFinite(byte) || byte < 0) return out;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);
    shift = 0;
    result = 0;
    if (index >= encoded.length) return out;
    do {
      byte = encoded.charCodeAt(index) - 63;
      index += 1;
      if (!Number.isFinite(byte) || byte < 0) return out;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);
    out.push([lng / factor, lat / factor]);
  }
  return out;
}

/** What a Valhalla answer looks like, in the parts this reads. */
interface ValhallaReply {
  trip?: {
    status?: number;
    summary?: { length?: number; time?: number };
    legs?: { shape?: string }[];
  };
}

/**
 * The answer, or null.
 *
 * Null for every shape of failure a caller cannot act on differently: no
 * route between the two points, a body that is not the reply this expects, a
 * leg with no geometry. The caller draws the straight line either way, so
 * one return covers them all.
 *
 * `length` arrives in kilometres because the request asked for kilometres;
 * everything in this codebase measures in metres, so it is converted here
 * rather than at each call site, where one of them would forget.
 */
export function parseRoute(body: unknown, mode: RouteMode): Route | null {
  const trip = (body as ValhallaReply)?.trip;
  if (!trip || (trip.status !== undefined && trip.status !== 0)) return null;
  const km = trip.summary?.length;
  const seconds = trip.summary?.time;
  if (!Number.isFinite(km) || !Number.isFinite(seconds)) return null;
  const line = (trip.legs ?? []).flatMap((leg) => (leg.shape ? decodePolyline(leg.shape) : []));
  // A route with one point is not a line, and would draw as nothing.
  if (line.length < 2) return null;
  return { mode, metres: Math.round((km as number) * 1000), seconds: Math.round(seconds as number), line };
}

/**
 * Why the router said no.
 *
 * A refusal is not a failure to be swallowed: each of these has a DIFFERENT
 * thing the traveller can do about it, and collapsing them into "no route"
 * throws away the only useful half of the answer.
 *
 *   - `too-far`     the distance exceeds what this costing will plan. The
 *                   traveller can switch mode, and the app can say so.
 *   - `no-path`     the graph has no way through at all. On an island this
 *                   is the ordinary answer for a car: the road stops at the
 *                   water and the ferry is not a routable edge.
 *   - `unreachable` one of the two points is not near any road.
 *   - `unknown`     anything else, including a body that is not Valhalla's.
 */
export type RouteRefusal = 'too-far' | 'no-path' | 'unreachable' | 'unknown';

/**
 * The distance each costing will plan for, in metres, as the FOSSGIS server
 * actually enforces it.
 *
 * MEASURED, NOT GUESSED. Asked on 13 November 2026 for a 220 km trip:
 * pedestrian answered `"Path distance exceeds the max distance limit:
 * 100000 meters"` and bicycle `"...150000 meters"`. The car has no distance
 * limit worth modelling here - it refuses for other reasons first - so it
 * is not pre-checked at all.
 */
export const ROUTE_MAX_M: Record<RouteMode, number> = {
  walk: 100_000,
  ride: Infinity,
};

/**
 * Whether the router would refuse this on distance alone.
 *
 * Checked against the STRAIGHT LINE, which is never longer than the road,
 * so a true here means the road certainly exceeds the limit too. It exists
 * to stop the app asking somebody's free community server a question whose
 * answer is arithmetic - a browser log showed three identical 400s for one
 * 220 km walk, which is three requests nobody should have had to serve.
 */
export const beyondRouter = (mode: RouteMode, straightMetres: number): boolean =>
  Number.isFinite(straightMetres) && straightMetres > ROUTE_MAX_M[mode];

interface ValhallaError { error_code?: number; error?: string }

/**
 * Read the refusal out of an error body.
 *
 * Valhalla's own numeric codes, which are stable and documented: 154 is the
 * distance limit, 442 is no path, 171 and 172 are a location with no road
 * near it. Everything else is `unknown`, which the app words as plainly as
 * it words a server being down - because to a traveller they are the same
 * afternoon.
 */
export function routeRefusal(body: unknown): RouteRefusal {
  const code = (body as ValhallaError)?.error_code;
  if (code === 154) return 'too-far';
  if (code === 442) return 'no-path';
  if (code === 171 || code === 172) return 'unreachable';
  return 'unknown';
}

/**
 * A duration a person reads, from one a router returned.
 *
 * Rounded to five minutes past the first quarter hour: a router's seconds
 * are precise and not accurate - it does not know about the songthaew that
 * stops, or the rain. Under fifteen minutes the minute still means
 * something, so it is kept.
 */
export function formatDuration(seconds: number): Bilingual {
  if (!Number.isFinite(seconds) || seconds < 0) return { en: '', th: '', zh: '' };
  const raw = seconds / 60;
  const mins = raw < 15 ? Math.max(1, Math.round(raw)) : Math.round(raw / 5) * 5;
  if (mins < 60) return { en: `${mins} min`, th: `${mins} นาที`, zh: `${mins} 分钟` };
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (m === 0) return { en: `${h} h`, th: `${h} ชม.`, zh: `${h} 小时` };
  return { en: `${h} h ${m} min`, th: `${h} ชม. ${m} นาที`, zh: `${h} 小时 ${m} 分钟` };
}

/**
 * How much longer the road is than the straight line.
 *
 * Shown because it is the honest answer to "why does the app say 1.5 km and
 * the route say 2.4" - the first is across the bay and the second is round
 * it. A ratio under one would mean the router found a shortcut through the
 * earth's crust, so it is clamped rather than shown.
 */
export const detourRatio = (routeMetres: number, straightMetres: number): number =>
  (straightMetres > 0 ? Math.max(1, routeMetres / straightMetres) : 1);
