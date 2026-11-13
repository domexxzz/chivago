/**
 * How a route looks while it is being followed, written once for both maps.
 *
 * The browser runs MapLibre GL JS directly and the phone runs the same
 * library inside a WebView, and the two cannot share a component - one is
 * React DOM, the other is a string of HTML. What they CAN share is this: the
 * layer specifications, the GeoJSON shapes and the camera arithmetic, all of
 * which are plain data and plain functions. The phone's page is handed these
 * as JSON and applies them generically; the browser applies the same objects
 * to a live map. A change to the route's colour or the camera's pitch
 * reaches both, because there is only one of them.
 *
 * That is the same bargain `chivagoStyle()` already strikes for the island
 * itself (see `WebTerrainMap.tsx`), extended to the part of the map that
 * moves.
 *
 * WHY THE ROUTE IS FOUR LAYERS AND NOT ONE. A navigation line has to stay
 * legible over pale sand, dark forest, a satellite sheet and its own
 * shadow - so there is a dark CASING under everything, the part already
 * travelled drawn back in grey, the part still to come in the bright
 * turquoise that means "this is your road", and the junctions marked on top.
 * Four cheap line layers cost less than one clever one and can be read at a
 * glance on a bike.
 */

import type { NavFix, NavProgress } from '@chivago/core';
import { followPitch, followZoom } from '@chivago/core';

/** The source and layer ids, prefixed so nothing in the island's style collides. */
export const NAV = {
  routeSource: 'cg-nav-route',
  travelledSource: 'cg-nav-travelled',
  pointsSource: 'cg-nav-points',
  meSource: 'cg-nav-me',
  casing: 'cg-nav-route-casing',
  active: 'cg-nav-route-active',
  travelled: 'cg-nav-route-travelled',
  maneuvers: 'cg-nav-maneuvers',
  destination: 'cg-nav-destination',
  accuracy: 'cg-nav-accuracy',
} as const;

/**
 * Where the navigation layers go in the island's stack.
 *
 * Under the place labels, over everything else. A route drawn over the
 * labels hides the name of the road it is on, which is the one piece of
 * information a traveller cross-checks it against; a route drawn under the
 * buildings disappears into a town.
 */
export const NAV_BEFORE = 'place-labels';

const CYAN = '#15C8D8';
const CASING = '#07243A';
const DONE = '#9FB4C4';
const GOLD = '#E0A42B';

/** Empty sources, added once; everything after that is `setData`. */
export const navigationSources = (): Record<string, { type: 'geojson'; data: unknown }> => ({
  [NAV.routeSource]: { type: 'geojson', data: emptyLine() },
  [NAV.travelledSource]: { type: 'geojson', data: emptyLine() },
  [NAV.pointsSource]: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
  [NAV.meSource]: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
});

/**
 * The accuracy ring's radius, in pixels, as an exact function of zoom.
 *
 * A circle layer's radius is in PIXELS and a GPS error is in METRES, and the
 * conversion depends on the zoom - which is why this is an expression rather
 * than a number. Two stops are enough and are exact, not approximate: a
 * web-mercator pixel halves with every zoom level, so an exponential
 * interpolation of base 2 through two points passes through every one in
 * between.
 *
 * The ring exists to stop the arrow lying. A tight arrow on a map claims to
 * be standing somewhere it might be fifty metres from, which is the same
 * overclaim `formatDistance` refuses when it rounds 182 m to 180.
 */
export function accuracyRadius(metres: number, lat: number): unknown {
  const perPixel = (zoom: number) => (156_543.033_92 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
  const at = (zoom: number) => Math.max(0, metres / perPixel(zoom));
  return ['interpolate', ['exponential', 2], ['zoom'], 10, at(10), 20, at(20)];
}

/**
 * Below this the ring is not drawn at all.
 *
 * Twenty-five metres is about as good as a phone gets outdoors, and a ring
 * that is always on screen is a ring nobody reads. It appearing means
 * something: the dot has become a guess.
 */
export const ACCURACY_RING_FROM_M = 25;

/**
 * The layers, in draw order.
 *
 * Widths are zoom expressions rather than constants: navigation sits between
 * zoom 15 and 18, and a line four pixels wide at 18 is a thread at 15. The
 * casing is always four pixels wider than what it carries, which is what
 * gives the route an edge instead of a glow - a glow over a satellite sheet
 * reads as fog.
 */
export const navigationLayers = (): Record<string, unknown>[] => [
  {
    /*
      How unsure the phone is, drawn as ground rather than as a number.

      Under the route, because it is context and the road is instruction.
      Its radius is set per fix (see `accuracyRadius`); it starts at zero,
      which draws nothing, so a map with no fix yet has no ring on it.
    */
    id: NAV.accuracy,
    type: 'circle',
    source: NAV.meSource,
    paint: {
      'circle-radius': 0,
      'circle-color': '#1565C0',
      'circle-opacity': 0.12,
      'circle-stroke-color': '#1565C0',
      'circle-stroke-opacity': 0.3,
      'circle-stroke-width': 1,
    },
  },
  {
    id: NAV.casing,
    type: 'line',
    source: NAV.routeSource,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': CASING,
      'line-opacity': 0.9,
      'line-width': ['interpolate', ['linear'], ['zoom'], 13, 6, 16, 11, 18, 17],
    },
  },
  {
    /*
      The road already behind the traveller.

      Drawn, not hidden. Taking it away leaves the dot at the end of a line
      that appears to start underneath it, and the first question anybody
      asks of a navigation screen is "am I on the right road" - which is
      answered by seeing the road you came in on. It is grey and thin: the
      past is context, not instruction.
    */
    id: NAV.travelled,
    type: 'line',
    source: NAV.travelledSource,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': DONE,
      'line-opacity': 0.75,
      'line-width': ['interpolate', ['linear'], ['zoom'], 13, 3, 16, 6, 18, 9],
    },
  },
  {
    id: NAV.active,
    type: 'line',
    source: NAV.routeSource,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': CYAN,
      'line-width': ['interpolate', ['linear'], ['zoom'], 13, 3.5, 16, 7, 18, 12],
    },
  },
  {
    /*
      A dot at every junction the route turns at.

      Small, and only where the road actually changes direction - the start
      and the arrival are drawn by their own marks. It is the cheapest
      possible answer to "is THIS the turning", which a line alone cannot
      give on a street with three side roads in fifty metres.
    */
    id: NAV.maneuvers,
    type: 'circle',
    source: NAV.pointsSource,
    filter: ['==', ['get', 'kind'], 'maneuver'],
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 14, 2.5, 17, 5],
      'circle-color': '#FFFFFF',
      'circle-stroke-color': CASING,
      'circle-stroke-width': 1.5,
      'circle-opacity': 0.95,
    },
  },
  {
    id: NAV.destination,
    type: 'circle',
    source: NAV.pointsSource,
    filter: ['==', ['get', 'kind'], 'destination'],
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 6, 17, 11],
      'circle-color': GOLD,
      'circle-stroke-color': '#FFFFFF',
      'circle-stroke-width': 3,
    },
  },
];

const emptyLine = () => ({
  type: 'Feature',
  properties: {},
  geometry: { type: 'LineString', coordinates: [] as [number, number][] },
});

export const lineFeature = (coordinates: readonly (readonly [number, number])[]) => ({
  type: 'Feature',
  properties: {},
  geometry: { type: 'LineString', coordinates },
});

/** The junctions and the pin, as one collection, so one `setData` moves both. */
export const pointsFeature = (
  maneuvers: readonly { lat: number; lng: number }[],
  destination: { lat: number; lng: number } | null,
) => ({
  type: 'FeatureCollection',
  features: [
    ...maneuvers.map((point) => ({
      type: 'Feature',
      properties: { kind: 'maneuver' },
      geometry: { type: 'Point', coordinates: [point.lng, point.lat] },
    })),
    ...(destination ? [{
      type: 'Feature',
      properties: { kind: 'destination' },
      geometry: { type: 'Point', coordinates: [destination.lng, destination.lat] },
    }] : []),
  ],
});

/**
 * The traveller's own mark: an arrow, not a dot.
 *
 * A dot says where somebody is; an arrow says which way they are facing,
 * which is the half of the question a navigator exists to answer. Drawn as
 * an HTML marker rather than a symbol layer so it can be ROTATED
 * independently of the map - a symbol layer's icon rotates with the camera,
 * and a camera that is itself following the heading would leave the arrow
 * permanently pointing up whatever the traveller did.
 *
 * The white edge is not decoration: the arrow sits on a turquoise line over
 * a green island, and without it the blue disappears into both.
 */
export const USER_ARROW_SVG = `<svg viewBox="0 0 40 40" width="40" height="40" aria-hidden="true">`
  + `<path d="M20 4 L33 33 L20 26 L7 33 Z" fill="#1565C0" stroke="#FFFFFF" stroke-width="3.2" stroke-linejoin="round"/>`
  + `</svg>`;

export interface NavCamera {
  centre: [number, number];
  bearing: number;
  zoom: number;
  pitch: number;
}

/**
 * Where the camera should be, for one fix.
 *
 * The centre is the SNAPPED point, not the raw fix: a traveller forty metres
 * off a road because of a bad fix should not have the whole map pulled forty
 * metres off the road with them. The raw fix is where the arrow is drawn,
 * which is how the two stay honest - the arrow visibly leaves the line when
 * the phone is unsure, and the map stays put.
 *
 * Zoom from speed and pitch from the distance to the next turn, both from
 * `@chivago/core`, so a test can assert the choice without a map.
 */
export function navigationCamera(progress: NavProgress | null, fix: NavFix | null): NavCamera | null {
  if (!progress && !fix) return null;
  const centre: [number, number] = progress
    ? [progress.snapped.lng, progress.snapped.lat]
    : [fix!.lng, fix!.lat];
  return {
    centre,
    bearing: progress?.bearingDeg ?? 0,
    zoom: followZoom(progress?.speedMps ?? fix?.speedMps ?? 0),
    pitch: followPitch(progress?.toNextM ?? Infinity),
  };
}

/**
 * Where to put the camera's centre on the screen.
 *
 * The traveller belongs in the LOWER THIRD, because the useful half of a
 * navigation view is the road ahead. The padding is what moves them there,
 * and it has to clear the banner at the top and the trip panel at the
 * bottom or the arrow ends up underneath one of them.
 */
export const navigationPadding = (
  width: number, height: number, top: number, bottom: number,
): { top: number; bottom: number; left: number; right: number } => ({
  // A third of the remaining height, on top of whatever the banner occupies:
  // MapLibre centres on the middle of the padded box, so a bigger top
  // padding pushes the centre down.
  top: Math.round(top + Math.max(0, height - top - bottom) * 0.42),
  bottom: Math.round(bottom),
  left: Math.round(Math.min(40, width * 0.08)),
  right: Math.round(Math.min(40, width * 0.08)),
});

/** The box that holds the whole route, for the overview. */
export function routeBounds(
  line: readonly (readonly [number, number])[],
): [[number, number], [number, number]] | null {
  if (line.length === 0) return null;
  let minLng = Infinity; let minLat = Infinity; let maxLng = -Infinity; let maxLat = -Infinity;
  for (const [lng, lat] of line) {
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
    if (lng < minLng) minLng = lng;
    if (lat < minLat) minLat = lat;
    if (lng > maxLng) maxLng = lng;
    if (lat > maxLat) maxLat = lat;
  }
  if (!Number.isFinite(minLng) || !Number.isFinite(minLat)) return null;
  return [[minLng, minLat], [maxLng, maxLat]];
}
