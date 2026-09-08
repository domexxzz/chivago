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
 * A duration a person reads, from one a router returned.
 *
 * Rounded to five minutes past the first quarter hour: a router's seconds
 * are precise and not accurate - it does not know about the songthaew that
 * stops, or the rain. Under fifteen minutes the minute still means
 * something, so it is kept.
 */
export function formatDuration(seconds: number): Bilingual {
  if (!Number.isFinite(seconds) || seconds < 0) return { en: '', th: '' };
  const raw = seconds / 60;
  const mins = raw < 15 ? Math.max(1, Math.round(raw)) : Math.round(raw / 5) * 5;
  if (mins < 60) return { en: `${mins} min`, th: `${mins} นาที` };
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (m === 0) return { en: `${h} h`, th: `${h} ชม.` };
  return { en: `${h} h ${m} min`, th: `${h} ชม. ${m} นาที` };
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
