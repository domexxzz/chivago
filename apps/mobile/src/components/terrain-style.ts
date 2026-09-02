/**
 * The web hero, as data: what the map is drawn with and where the camera sits.
 *
 * Kept apart from `TerrainMap.tsx` on purpose. That file imports `maplibre-gl`
 * and its stylesheet, neither of which the node test harness can load. This
 * one imports a type and the design tokens, so the rules the hero is drawn
 * under are things a test can hold it to:
 *
 *   - no layer wears the verified green. On this screen green means "a named
 *     host checked it", and a forest painted the same colour would spend that
 *     meaning on trees;
 *   - the land is the background and the sea is drawn over it, because
 *     OpenMapTiles has no land polygon and getting this backwards renders the
 *     whole island as water;
 *   - no tile URL carries a key, so there is nothing here to leak and no bill
 *     that grows with the pitch going well.
 */

import type { StyleSpecification } from 'maplibre-gl';
import { SAMUI_BBOX } from '@chivago/core';
import { color } from '../theme/index.ts';

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
 * would make the hero look like every other map. This is nine layers in
 * ChivaGo's own tokens. The sea is the same blue as every button in the app
 * at less than half strength, the land is the surface colour, the mountain is
 * shaded in the brand's deep blue - and the only saturated thing on the
 * screen is a place somebody measured.
 */
export function chivagoStyle(): StyleSpecification {
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
      Fog. At this pitch the far edge of the frame is Ko Pha-ngan, twelve
      kilometres off, and without fog it renders as crisply as the beach in
      front of the camera. Blending the distance toward the app's own ground
      colour is what makes the near island read as near.
    */
    sky: {
      'sky-color': color.bg,
      'horizon-color': color.surface,
      'fog-color': color.brandSoft,
      'fog-ground-blend': 0.55,
      'horizon-fog-blend': 0.8,
      'sky-horizon-blend': 0.7,
    },
    layers: [
      /*
        THE BACKGROUND IS THE LAND. OpenMapTiles has no land polygon - the
        world is land by default and `water` is painted over it. Getting this
        backwards renders the entire island as sea, which is exactly what the
        first version did: a pale blue rectangle with five pins floating on it.
      */
      { id: 'land', type: 'background', paint: { 'background-color': color.neutral100 } },
      /*
        Forest, in a neutral rather than a green. Samui's interior is wooded
        and the shade makes the coastal plain read as a plain; but green on
        this screen is reserved for a score a host verified, and a jungle
        painted the same colour would spend that meaning on trees.
      */
      {
        id: 'wood', type: 'fill', source: 'osm', 'source-layer': 'landcover',
        filter: ['==', ['get', 'class'], 'wood'],
        paint: { 'fill-color': color.neutral300, 'fill-opacity': 0.6 },
      },
      /*
        Hillshade is what makes the mountain read at a glance. Without it a
        tilted terrain mesh in one flat colour looks like a crumpled sheet;
        with it, the ridge running down the middle of Samui is legible before
        the camera moves. It sits BELOW the water so that the elevation
        model's coastline, which is coarser than OpenStreetMap's, cannot shade
        the sea.
      */
      {
        id: 'hillshade', type: 'hillshade', source: 'relief',
        paint: {
          'hillshade-shadow-color': color.brandDeep,
          'hillshade-highlight-color': color.surface,
          'hillshade-accent-color': color.neutral400,
          'hillshade-exaggeration': 0.45,
        },
      },
      {
        id: 'sea', type: 'fill', source: 'osm', 'source-layer': 'water',
        paint: { 'fill-color': color.brand, 'fill-opacity': 0.42 },
      },
      // The ferry lines to Pha-ngan and the mainland: the island's threads
      // to the world, dashed so nobody reads them as roads across the sea.
      {
        id: 'ferry', type: 'line', source: 'osm', 'source-layer': 'transportation',
        filter: ['==', ['get', 'class'], 'ferry'],
        paint: {
          'line-color': color.brand, 'line-opacity': 0.55, 'line-width': 1.2,
          'line-dasharray': [1.5, 2.5],
        },
      },
      {
        id: 'roads', type: 'line', source: 'osm', 'source-layer': 'transportation',
        filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary', 'secondary']]],
        paint: {
          'line-color': color.neutral400, 'line-opacity': 0.9,
          'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.6, 14, 2.6],
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
          'text-font': ['Noto Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 9, 9, 14, 12.5],
          'text-transform': 'uppercase',
          'text-letter-spacing': 0.1,
          'text-padding': 10,
          'symbol-sort-key': ['coalesce', ['get', 'rank'], 99],
        },
        paint: {
          'text-color': color.neutral700,
          'text-halo-color': color.neutral100,
          'text-halo-width': 1.2,
        },
      },
    ],
  } as StyleSpecification;
}

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
