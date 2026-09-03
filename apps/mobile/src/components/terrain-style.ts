/**
 * The web hero, as data: what the map is drawn with and where the camera sits.
 *
 * Kept apart from `TerrainMap.tsx` on purpose. That file imports `maplibre-gl`
 * and its stylesheet, neither of which the node test harness can load. This
 * one imports a type and the design tokens, so the rules the hero is drawn
 * under are things a test can hold it to:
 *
 *   - no layer wears the verified green. On this screen green means "a named
 *     host checked it". The island IS green - it is a jungle - but its greens
 *     are olive, held twenty-five degrees of hue from the evidence emerald,
 *     so a forest can be a forest without spending that meaning on trees;
 *   - the land is the background and the sea is drawn over it, because
 *     OpenMapTiles has no land polygon and getting this backwards renders the
 *     whole island as water;
 *   - no tile URL carries a key, so there is nothing here to leak and no bill
 *     that grows with the pitch going well;
 *   - the light is the island's. The same clock that lights a companion's
 *     room (`island-clock.ts`) sets the sun on the hillshade, the colour of
 *     the sea and the sky, and whether the quest marks glow.
 *
 * THE MAP IS A PLACE, NOT A DIAGRAM. The first hero was seven layers in the
 * app's own tokens: a pale island, a blue sea at half strength, nothing
 * saturated but a measured place. Honest, and flat. This one colours the land
 * by its real height - sand at the shore, lowland groves, jungle, the misty
 * top of Khao Pom - shades it by the real sun, and draws the ferry lines as
 * the dotted routes of a chart. Every colour is still a number here, and the
 * coastline, the mountain and the roads are still OpenStreetMap's and the
 * elevation model's. It is the same island; it is lit.
 */

import type { StyleSpecification } from 'maplibre-gl';
import { SAMUI_BBOX, type QuestProgress } from '@chivago/core';
import { color } from '../theme/index.ts';
import { dayArc, mix } from './island-clock.ts';

/**
 * Elevation, as Terrarium-encoded PNG, from the AWS Open Data terrain tiles.
 *
 * `encoding: 'terrarium'` is not optional and not a default - MapLibre assumes
 * Mapbox encoding, and the two disagree silently. Declaring the wrong one does
 * not error; it renders a plausible landscape with the wrong heights, which is
 * the worst failure available here. Decoding the tile over Samui gives −6 m
 * to 628 m; Khao Pom, the summit, is about 635 m. It is the real mountain.
 */
export const TERRAIN_TILES = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';

/** OpenStreetMap vector tiles from OpenFreeMap: no key, no registration, no request limit. */
export const OPENFREEMAP = 'https://tiles.openfreemap.org/planet';

/** The island's bounding box in the shape MapLibre wants it. */
export const SAMUI_BOUNDS: [[number, number], [number, number]] = [
  [SAMUI_BBOX.minLng, SAMUI_BBOX.minLat],
  [SAMUI_BBOX.maxLng, SAMUI_BBOX.maxLat],
];

// ---------------------------------------------------------------------------
// The palette, by the hour
// ---------------------------------------------------------------------------

/**
 * Every colour the map is painted in, for one hour of the island's day.
 *
 * The land stops are by height in metres. Samui is sand at the shore, coconut
 * groves and villages to about forty metres, jungle above that, and the top
 * of Khao Pom, at 635 m, sits in cloud most afternoons - which is what the
 * pale `peak` is.
 */
export interface MapPalette {
  night: boolean;
  /** Bathymetry, where the elevation model has any: the deep, and the reef flat. */
  deep: string;
  shallow: string;
  sand: string;
  lowland: string;
  jungle: string;
  forest: string;
  highland: string;
  peak: string;
  sea: string;
  /** What the shore's canopy and the mangrove wetland are tinted with. */
  canopy: string;
  wetland: string;
  /** Hillshade. */
  highlight: string;
  shadow: string;
  /** Degrees clockwise from north that the light comes from. */
  illumination: number;
  sky: string;
  horizon: string;
  fog: string;
  /** Roads as trails, and the sea routes. */
  trail: string;
  trailEdge: string;
  route: string;
  stream: string;
  building: string;
  /** Labels. */
  ink: string;
  halo: string;
}

const NOON: Omit<MapPalette, 'night' | 'illumination'> = {
  deep: '#0d5a8a',
  shallow: '#5ecfd6',
  sand: '#f0e2b6',
  lowland: '#8fbf55',
  jungle: '#5f9a3e',
  forest: '#3f7d35',
  highland: '#6f9660',
  peak: '#cfd3bf',
  sea: '#0f6f9f',
  canopy: '#4f8a34',
  wetland: '#6f9a66',
  highlight: '#fff3cc',
  shadow: '#2f2b62',
  sky: '#5aaaef',
  horizon: '#e6f2fb',
  fog: '#cfe5f6',
  trail: '#e9d7ad',
  trailEdge: '#6f4f2f',
  route: '#fff6df',
  stream: '#7fdbe0',
  building: '#f2e4c8',
  ink: '#2a1e0f',
  halo: '#f9efd6',
};

/**
 * The warm end of the day: sky peach, sea steel, sand apricot, long violet
 * shadows, and everything the low sun touches gilded. Strong on purpose:
 * the first pass was subtle enough that half past five looked like one
 * o'clock, and a golden hour nobody can see is a palette nobody needed.
 */
const GOLDEN: Partial<Omit<MapPalette, 'night' | 'illumination'>> = {
  sand: '#f5c47e',
  lowland: '#bfae52',
  jungle: '#8a8a3c',
  forest: '#66702f',
  highland: '#9a8a55',
  peak: '#f0c49c',
  sea: '#3e6a86',
  deep: '#2c4c6e',
  shallow: '#8fb8b8',
  highlight: '#ffb44a',
  shadow: '#4a2260',
  sky: '#f0a060',
  horizon: '#ffd39a',
  fog: '#f2c290',
  trail: '#f0c98e',
  route: '#ffe2b0',
  building: '#f8d09a',
  halo: '#f6dcae',
};

/**
 * Night. Not a cellar: the same bright tropical moon the companion room has.
 * The greens go to olive-slate, the sea to ink, the sky to the deep blue a
 * beach actually has at nine in the evening, and the labels invert.
 */
const NIGHT: Omit<MapPalette, 'night' | 'illumination'> = {
  deep: '#08203a',
  shallow: '#1d5a72',
  sand: '#7a766b',
  lowland: '#445a38',
  jungle: '#33482c',
  forest: '#243520',
  highland: '#3b4a3a',
  peak: '#6e7a82',
  sea: '#0b2b4c',
  canopy: '#2c4025',
  wetland: '#3f4a34',
  highlight: '#9fb0d6',
  shadow: '#070b1c',
  sky: '#0f1a38',
  horizon: '#2c3f6e',
  fog: '#1a2848',
  trail: '#8c8474',
  trailEdge: '#2a2418',
  route: '#b9c4d8',
  stream: '#4c8ea0',
  building: '#5a5a66',
  ink: '#ece5d2',
  halo: '#151d34',
};

/** The sun's bearing for the hillshade: east at dawn, south at noon, west at dusk; the moon from the north-west. */
function illuminationFor(hour: number): number {
  const { day } = dayArc(hour);
  if (!day) return 315;
  const h = ((hour % 24) + 24) % 24;
  return 90 + ((h - 6) / 12.5) * 180;
}

/** The palette for an hour of the island's day, 0–24 (wrapping). */
export function paletteFor(hour: number): MapPalette {
  const { day, arc, golden } = dayArc(hour);
  const illumination = illuminationFor(hour);
  if (!day) return { ...NIGHT, night: true, illumination };
  const out = { ...NOON } as Record<string, string>;
  // The warmth comes in faster than the arc goes down: by the time the sun
  // is a third of the way to the horizon the light is already gold.
  const gild = Math.min(1, golden * 1.6);
  for (const [key, warm] of Object.entries(GOLDEN)) {
    out[key] = mix(NOON[key as keyof typeof NOON], warm!, gild);
  }
  // The first and last half hour blend from the night palette, so dawn is a
  // sky getting light and not a switch being thrown.
  const dusk = Math.max(0, 1 - arc * 8);
  for (const key of Object.keys(out)) {
    out[key] = mix(out[key]!, NIGHT[key as keyof typeof NIGHT], dusk * 0.7);
  }
  return { ...(out as unknown as Omit<MapPalette, 'night' | 'illumination'>), night: false, illumination };
}

/** The land colours in a palette - the ones a test holds apart from the evidence green. */
export const landColours = (p: MapPalette): string[] => [
  p.sand, p.lowland, p.jungle, p.forest, p.highland, p.peak, p.canopy, p.wetland,
];

// ---------------------------------------------------------------------------
// The style
// ---------------------------------------------------------------------------

/**
 * The English name, or the Latin one, or whatever there is.
 *
 * `to-string` is not decoration. `slice` below insists on knowing it has a
 * string, and a bare `get` is a value of unknown type; without the coercion
 * the style fails validation, the layer is dropped, and the hero renders
 * with no names at all.
 */
const ENGLISH_NAME = ['to-string', ['coalesce', ['get', 'name:en'], ['get', 'name:latin'], ['get', 'name']]];

/** That name without its "Baan"/"Ban" - village - prefix. */
const PLACE_NAME = ['case',
  ['==', ['slice', ENGLISH_NAME, 0, 5], 'Baan '], ['slice', ENGLISH_NAME, 5],
  ['==', ['slice', ENGLISH_NAME, 0, 4], 'Ban '], ['slice', ENGLISH_NAME, 4],
  ENGLISH_NAME,
];

const dem = {
  type: 'raster-dem' as const,
  tiles: [TERRAIN_TILES],
  tileSize: 256,
  maxzoom: 13,
  encoding: 'terrarium' as const,
};

/**
 * The style, written here rather than pulled from a hosted one.
 *
 * A hosted style is a hundred layers of somebody else's colour scheme, and it
 * would make the hero look like every other map. This is fourteen layers in
 * a palette the island's clock chooses - and the only thing on the screen
 * that wears the evidence green is a place somebody measured.
 */
export function chivagoStyle(hour = 12): StyleSpecification {
  const p = paletteFor(hour);
  return {
    version: 8,
    // A font the OpenFreeMap glyph server actually has. A missing font stack
    // is a silent no-label map.
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sources: {
      osm: { type: 'vector', url: OPENFREEMAP },
      /*
        The same elevation twice, under two names. The 3D mesh and the
        hillshade each want the tiles; giving them one shared source makes
        MapLibre warn that rendering quality suffers, and the browser cache
        makes the second copy free.
      */
      terrain: {
        ...dem,
        attribution:
          '<a href="https://registry.opendata.aws/terrain-tiles/">Terrain Tiles</a> · '
          + '<a href="https://openfreemap.org/">OpenFreeMap</a> · '
          + '<a href="https://www.openstreetmap.org/copyright">© OpenStreetMap</a>',
      },
      relief: dem,
    },
    /*
      The sky and the fog. At this pitch the far edge of the frame is Ko
      Pha-ngan, twelve kilometres off, and without fog it renders as crisply
      as the beach in front of the camera. Blending the distance toward the
      horizon colour is what makes the near island read as near - and makes
      the far one read as somewhere to go.
    */
    sky: {
      'sky-color': p.sky,
      'horizon-color': p.horizon,
      'fog-color': p.fog,
      'fog-ground-blend': 0.5,
      'horizon-fog-blend': 0.75,
      'sky-horizon-blend': 0.65,
      'atmosphere-blend': 0.85,
    },
    // The sun, for the buildings' faces: from the same bearing as the hillshade.
    light: {
      anchor: 'map',
      position: [1.5, p.illumination, p.night ? 65 : 45],
      color: p.highlight,
      intensity: p.night ? 0.25 : 0.45,
    },
    layers: [
      /*
        THE BACKGROUND IS THE LAND. OpenMapTiles has no land polygon - the
        world is land by default and `water` is painted over it. Getting this
        backwards renders the entire island as sea, which is exactly what the
        first version did: a pale blue rectangle with five pins floating on it.
      */
      { id: 'land', type: 'background', paint: { 'background-color': p.lowland } },
      /*
        The land, coloured by its height. Sand to four metres, the coconut
        plain to forty, jungle, the high forest, and the cloud on the top of
        Khao Pom. Below zero the elevation model carries a little bathymetry,
        and the reef flat off the beaches reads as the pale water it is.
      */
      {
        id: 'relief', type: 'color-relief', source: 'relief',
        paint: {
          'color-relief-color': ['interpolate', ['linear'], ['elevation'],
            -40, p.deep,
            -4, p.shallow,
            0, p.sand,
            5, p.sand,
            45, p.lowland,
            160, p.jungle,
            330, p.forest,
            500, p.highland,
            640, p.peak,
          ],
        },
      },
      /*
        Land cover from OpenStreetMap, as a tint over the relief: the canopy
        where a wood is mapped, the mangrove wetland at Thong Krut, and the
        beaches where the survey drew them - finer than the elevation model's
        four-metre shore.
      */
      {
        id: 'wood', type: 'fill', source: 'osm', 'source-layer': 'landcover',
        filter: ['==', ['get', 'class'], 'wood'],
        paint: { 'fill-color': p.canopy, 'fill-opacity': 0.42 },
      },
      {
        id: 'wetland', type: 'fill', source: 'osm', 'source-layer': 'landcover',
        filter: ['==', ['get', 'class'], 'wetland'],
        paint: { 'fill-color': p.wetland, 'fill-opacity': 0.6 },
      },
      {
        id: 'beach', type: 'fill', source: 'osm', 'source-layer': 'landcover',
        filter: ['==', ['get', 'class'], 'sand'],
        paint: { 'fill-color': p.sand, 'fill-opacity': 0.9 },
      },
      /*
        Hillshade is what makes the mountain read at a glance. Without it a
        tilted terrain mesh in one flat colour looks like a crumpled sheet;
        with it, the ridge running down the middle of Samui is legible before
        the camera moves. Lit from where the sun actually is at this hour,
        anchored to the map so the shadows stay on the same side of the ridge
        however the camera turns. It sits BELOW the water so that the
        elevation model's coastline, which is coarser than OpenStreetMap's,
        cannot shade the sea.
      */
      {
        id: 'hillshade', type: 'hillshade', source: 'relief',
        paint: {
          'hillshade-method': 'igor',
          'hillshade-illumination-direction': p.illumination,
          'hillshade-illumination-anchor': 'map',
          'hillshade-shadow-color': p.shadow,
          'hillshade-highlight-color': p.highlight,
          'hillshade-exaggeration': p.night ? 0.55 : 0.7,
        },
      },
      {
        id: 'sea', type: 'fill', source: 'osm', 'source-layer': 'water',
        // Not quite opaque: the reef flat in the relief shows through as
        // shallows along the beaches.
        paint: { 'fill-color': p.sea, 'fill-opacity': 0.8 },
      },
      // The streams that come off the mountain - Na Muang is a waterfall.
      {
        id: 'streams', type: 'line', source: 'osm', 'source-layer': 'waterway',
        minzoom: 11,
        paint: {
          'line-color': p.stream, 'line-opacity': 0.8,
          'line-width': ['interpolate', ['linear'], ['zoom'], 11, 0.6, 14, 1.8],
        },
      },
      /*
        The ferry lines to Pha-ngan and the mainland, drawn as the dotted
        routes on a chart: the island's threads to the world, and nobody's
        idea of a road across the sea.
      */
      {
        id: 'ferry', type: 'line', source: 'osm', 'source-layer': 'transportation',
        filter: ['==', ['get', 'class'], 'ferry'],
        layout: { 'line-cap': 'round' },
        paint: {
          'line-color': p.route, 'line-opacity': 0.75, 'line-width': 2,
          'line-dasharray': [0.1, 2.4],
        },
      },
      // Roads as trails: a dark edge under a sand-coloured line.
      {
        id: 'roads-edge', type: 'line', source: 'osm', 'source-layer': 'transportation',
        filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary', 'secondary']]],
        paint: {
          'line-color': p.trailEdge, 'line-opacity': 0.55,
          'line-width': ['interpolate', ['linear'], ['zoom'], 9, 1.6, 14, 4.6],
        },
      },
      {
        id: 'roads', type: 'line', source: 'osm', 'source-layer': 'transportation',
        filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary', 'secondary']]],
        paint: {
          'line-color': p.trail, 'line-opacity': 0.95,
          'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.7, 14, 2.6],
        },
      },
      /*
        Buildings, standing up, once the camera is close enough for a house
        to be a house. At the hero zoom Chaweng is a texture; two pinches in
        it is a town, and the town has walls the sun lights from the same
        side as the mountain.
      */
      {
        id: 'buildings', type: 'fill-extrusion', source: 'osm', 'source-layer': 'building',
        minzoom: 12.5,
        paint: {
          'fill-extrusion-color': p.building,
          'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 5],
          'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
          'fill-extrusion-opacity': 0.9,
        },
      },
      /*
        Place names in Latin script, because the rest of the screen leads in
        English with Thai beneath and a map that leads in Thai would read as a
        different product.

        Every named place on Samui is a `village` in OpenStreetMap - Nathon,
        the port and district seat, included - so there is no "towns only"
        shortcut to a quiet hero. Three rules do it instead. Only places with
        an English name are shown. Places whose English name is "Moo N",
        administrative village number N, are not: nobody calls a beach that.
        And the "Baan" - village - that OpenStreetMap prefixes to most of the
        rest is dropped, so the map calls Chaweng what the pin calls it and
        what everybody on the island calls it. Collisions are settled by
        OpenStreetMap's own rank, most important first.
      */
      {
        id: 'place-labels', type: 'symbol', source: 'osm', 'source-layer': 'place',
        filter: ['all',
          ['in', ['get', 'class'], ['literal', ['town', 'village']]],
          ['has', 'name:en'],
          ['!=', ['slice', ['to-string', ['get', 'name:en']], 0, 4], 'Moo '],
        ],
        layout: {
          'text-field': PLACE_NAME,
          'text-font': ['Noto Sans Bold'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 9, 9.5, 14, 13],
          'text-transform': 'uppercase',
          'text-letter-spacing': 0.18,
          'text-padding': 10,
          'symbol-sort-key': ['coalesce', ['get', 'rank'], 99],
        },
        paint: {
          'text-color': p.ink,
          'text-halo-color': p.halo,
          'text-halo-width': 1.6,
          'text-opacity': 0.92,
        },
      },
    ],
  } as StyleSpecification;
}

// ---------------------------------------------------------------------------
// The camera
// ---------------------------------------------------------------------------

/**
 * The pose, relative to the zoom that fits the island flat.
 *
 * Every number here was chosen by looking, then written down. The frame is
 * fitted to the island's bounding box with the camera flat, which is the one
 * thing that scales honestly with the width of the screen; then the camera
 * is lifted to MapLibre's steepest pitch, zoomed in a little over half a
 * level - a tilted view needs more zoom to fill the same frame - and its
 * centre moved a fiftieth of a degree south, so the near shore sits low in
 * the frame and Pha-ngan keeps the top.
 */
export const HERO = {
  pitch: 60,
  bearing: -18,
  zoomAboveFlat: 0.55,
  latBelowMiddle: 0.02,
  fitPadding: { top: 60, bottom: 8, left: 16, right: 16 },
  /**
   * The one animated moment. Long enough that the mountain visibly rises,
   * short enough that a traveller who came for the list is not kept waiting.
   */
  introMs: 2600,
  /**
   * How much taller than the truth the mountain stands. Samui is 25 km
   * across and 635 m high, so at true scale Khao Pom is a bump. Doubled it
   * is a mountain, which is what it is to walk up; and it is stated here,
   * not hidden in a renderer.
   */
  exaggeration: 2.0,
} as const;

/**
 * After the intro, the camera keeps turning - slowly, for a while, and only
 * until the first touch. A view that drifts is a place; a view that stops
 * dead is a screenshot. It is not essential: someone who asked their system
 * for less motion gets the settled frame and nothing moves.
 */
export const DRIFT = {
  degrees: 16,
  ms: 45_000,
} as const;

export interface Pose {
  zoom: number;
  pitch: number;
  bearing: number;
  center: [number, number];
}

/** Where the camera settles, given the zoom that fits the island flat. */
export function heroPose(flatZoom: number): Pose {
  return {
    zoom: flatZoom + HERO.zoomAboveFlat,
    pitch: HERO.pitch,
    bearing: HERO.bearing,
    center: [
      (SAMUI_BBOX.minLng + SAMUI_BBOX.maxLng) / 2,
      (SAMUI_BBOX.minLat + SAMUI_BBOX.maxLat) / 2 - HERO.latBelowMiddle,
    ],
  };
}

/**
 * Where the intro starts: lower, flatter, and turned a little further, so
 * the settle is a rise and a swing rather than a zoom.
 */
export function introPose(settled: Pose): Pose {
  return { ...settled, zoom: settled.zoom - 0.5, pitch: 32, bearing: settled.bearing - 12 };
}

/** Cubic ease-out: fast off the mark, gentle into place. */
export const settleEasing = (t: number): number => 1 - (1 - t) ** 3;

// ---------------------------------------------------------------------------
// The marks
// ---------------------------------------------------------------------------

/**
 * What a quest's mark on the map says about where this person is with it.
 *
 *   open    - nobody has joined it, or the host sent the last proof back:
 *             an X on the chart, the treasure still there;
 *   active  - joined, arrived, or waiting on the host: the X with the app's
 *             blue ring, yours in progress;
 *   done    - the host verified it. The ONLY state that wears the evidence
 *             green, because it is the only one a host vouched for.
 */
export type QuestMark = 'open' | 'active' | 'done';

export function questMark(progress: QuestProgress | undefined | null): QuestMark {
  if (!progress) return 'open';
  if (progress.stage === 'complete') return 'done';
  if (progress.rejectedAt) return 'open';
  return 'active';
}

/**
 * A quest often sits ON a place - the beach cleanup is at Chaweng - and its
 * mark would sit under the place's chip. The mark is pushed a little to the
 * right and down, in screen pixels, so the X and the chip read as two things
 * at one spot rather than one thing with a strange shadow.
 */
export const QUEST_MARK_OFFSET: [number, number] = [18, 10];

/** Marks this close together, in metres, are one spot and are fanned out. */
export const QUEST_CROWD_M = 600;

/** How far apart, in CSS pixels, marks at one spot are fanned. */
export const QUEST_FAN_PX = 62;

/**
 * Screen offsets for every quest, so that three quests at Chaweng beach are
 * three X's in a row and not one X with two hidden under it. Quests that
 * share a spot are fanned left and right of the standard offset, in the
 * order they arrive; a quest on its own keeps the standard offset.
 */
export function questOffsets(
  quests: readonly { id: string; lat: number; lng: number }[],
): Map<string, [number, number]> {
  const out = new Map<string, [number, number]>();
  const groups: { id: string; lat: number; lng: number }[][] = [];
  for (const q of quests) {
    const group = groups.find((g) => metresBetween(g[0]!, q) < QUEST_CROWD_M);
    if (group) group.push(q); else groups.push([q]);
  }
  for (const group of groups) {
    group.forEach((q, i) => {
      out.set(q.id, [QUEST_MARK_OFFSET[0] + (i - (group.length - 1) / 2) * QUEST_FAN_PX, QUEST_MARK_OFFSET[1]]);
    });
  }
  return out;
}

/**
 * Real geography collides. Chaweng and Fisherman's Village are 2.4 km apart
 * on the same coast, and at the hero zoom on a phone - tilted, so north-south
 * distance is halved on screen - their pins sit on top of each other.
 *
 * Pins closer than this are pushed apart along the screen's vertical: the
 * northern one up, the southern one down, half a pin each. The push is in
 * screen pixels, so zooming in separates them naturally and the nudge fades
 * into insignificance rather than compounding.
 */
export const CROWD_M = 4000;

/** Half a pin, in CSS pixels. */
export const PIN_NUDGE_PX = 16;

/** Metres between two points, flat-earth: fine to a few kilometres at this latitude. */
function metresBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const m = 111_320;
  const dy = (a.lat - b.lat) * m;
  const dx = (a.lng - b.lng) * m * Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180));
  return Math.hypot(dx, dy);
}

/** Screen-pixel offsets, by place id, for pins that would otherwise overlap. */
export function crowdOffsets(
  places: readonly { id: string; lat: number; lng: number }[],
): Map<string, [number, number]> {
  const out = new Map<string, [number, number]>();
  for (let i = 0; i < places.length; i += 1) {
    for (let j = i + 1; j < places.length; j += 1) {
      const a = places[i]!;
      const b = places[j]!;
      if (metresBetween(a, b) >= CROWD_M) continue;
      const [north, south] = a.lat >= b.lat ? [a, b] : [b, a];
      out.set(north.id, [0, -PIN_NUDGE_PX]);
      out.set(south.id, [0, PIN_NUDGE_PX]);
    }
  }
  return out;
}
