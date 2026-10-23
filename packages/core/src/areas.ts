/**
 * Areas: the places on the map that are one map.
 *
 * Koh Samui was the whole product for its first sixty commits, and the code
 * said so - one bounding box, one island silhouette, one greeting. The
 * second area is Kasetsart University's Si Racha campus in Chon Buri: a
 * third of a square kilometre of buildings and footpaths, drawn from
 * OpenStreetMap, with a Pollution Control Department station 300 m from its
 * centre - the first place in the app where the air is measured on the
 * ground rather than modelled for an 11 km cell.
 *
 * An area is NOT a province. A province is the passport's unit and a
 * traveller "visits" one; an area is what a screen frames at once. Samui is
 * a slice of Surat Thani, the campus a speck of Chon Buri. Places carry a
 * province; the area is derived from it, so nothing has to be told twice.
 */

import type { Bilingual } from './types.ts';
import { CAMPUS_LEG_MIN_M, LEG_MIN_M, SMALL_ISLAND_LEG_MIN_M } from './low-carbon.ts';
import { SAMUI_BBOX } from './seed.ts';

export type AreaKey = 'samui' | 'ku-sriracha' | 'rmutt' | 'ku-bangkhen' | 'sichang';

export interface Bbox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

export interface Area {
  key: AreaKey;
  name: Bilingual;
  /** ISO 3166-2:TH code of the province the area lies in. */
  province: string;
  center: { lat: number; lng: number };
  bbox: Bbox;
  /**
   * Which map draws it. `island` is the terrain hero and the SVG silhouette;
   * `campus` is buildings and paths at street zoom - flat, because it is.
   */
  map: 'island' | 'campus';
  /**
   * How far apart two check-ins must be before the ledger calls the journey
   * between them a walk.
   *
   * Here rather than as one constant because the rule is "far enough apart to
   * have been a real journey", and a real journey on an island is not the same
   * distance as a real journey across a campus. See `CAMPUS_LEG_MIN_M`.
   */
  legMinM: number;
}

/**
 * The campus outline in OpenStreetMap (way 1408248543, 56 nodes, 0.33 km²),
 * as its bounding box, read on 2026-09-05.
 */
export const KU_SRIRACHA_BBOX: Bbox = {
  minLat: 13.1150,
  maxLat: 13.1260,
  minLng: 100.9173,
  maxLng: 100.9237,
};

/**
 * RMUTT Thanyaburi's grounds in OpenStreetMap (way 910034983, tagged
 * `amenity=university`, read on 2026-09-14) as its bounding box.
 *
 * 1,087 x 1,129 m, about 1.23 km2 - three and a half times the Si Racha
 * campus, and 1,567 m corner to corner.
 */
export const RMUTT_BBOX: Bbox = {
  minLat: 14.0306756,
  maxLat: 14.0404377,
  minLng: 100.7211162,
  maxLng: 100.7315743,
};

/**
 * Ko Sichang, measured rather than looked up.
 *
 * Flood-filled from a seed at 13.155 N, 100.806 E over the same terrarium
 * tiles the hero is drawn from, at zoom 14 - 9.3 m a sample - taking every
 * pixel above one metre. 6.36 km north to south, 2.53 km east to west, and
 * 187.8 m at the summit, which OpenStreetMap names เขาพระจุลจอมเกล้า.
 *
 * It is a STEEPER island than Samui, not a flatter one: 188 m over 6.4 km
 * is about one in thirty-four against Samui's 635 m over 25 km, one in
 * thirty-nine. The island exaggeration is right here and the campus's would
 * be wrong - which is the opposite of what "a small island" suggests, and
 * the reason this box was measured instead of assumed. See docs/67.
 */
export const SICHANG_BBOX: Bbox = {
  minLat: 13.1243,
  maxLat: 13.1818,
  minLng: 100.7975,
  maxLng: 100.8208,
};

/** Bangkhen's campus frame, supplied by the onboarding brief and checked against mapped landmarks. */
export const KU_BANGKHEN_BBOX: Bbox = {
  minLat: 13.8400,
  maxLat: 13.8580,
  minLng: 100.5620,
  maxLng: 100.5820,
};

export const AREAS: Area[] = [
  {
    key: 'samui',
    name: { en: 'Koh Samui', th: 'เกาะสมุย' },
    province: 'TH-84',
    center: {
      lat: (SAMUI_BBOX.minLat + SAMUI_BBOX.maxLat) / 2,
      lng: (SAMUI_BBOX.minLng + SAMUI_BBOX.maxLng) / 2,
    },
    bbox: SAMUI_BBOX,
    map: 'island',
    legMinM: LEG_MIN_M,
  },
  {
    key: 'ku-sriracha',
    name: { en: 'KU Sriracha', th: 'มก. ศรีราชา' },
    province: 'TH-20',
    // The centre of the outline, which is also where the campus's own
    // OpenStreetMap node sits.
    center: { lat: 13.1205, lng: 100.9205 },
    bbox: KU_SRIRACHA_BBOX,
    map: 'campus',
    legMinM: CAMPUS_LEG_MIN_M,
  },
  {
    key: 'rmutt',
    name: { en: 'RMUTT', th: 'มทร.ธัญบุรี' },
    province: 'TH-13',
    // The centre of the OpenStreetMap outline of way 910034983.
    center: { lat: 14.03556, lng: 100.72635 },
    bbox: RMUTT_BBOX,
    map: 'campus',
    legMinM: CAMPUS_LEG_MIN_M,
  },
  {
    key: 'sichang',
    name: { en: 'Ko Sichang', th: 'เกาะสีชัง' },
    // Chon Buri, which KU Sriracha is also in - see `areaOf` below.
    province: 'TH-20',
    center: {
      lat: (SICHANG_BBOX.minLat + SICHANG_BBOX.maxLat) / 2,
      lng: (SICHANG_BBOX.minLng + SICHANG_BBOX.maxLng) / 2,
    },
    bbox: SICHANG_BBOX,
    map: 'island',
    legMinM: SMALL_ISLAND_LEG_MIN_M,
  },
  {
    key: 'ku-bangkhen',
    name: { en: 'KU Bangkhen', th: 'มก. บางเขน' },
    province: 'TH-10',
    center: { lat: 13.8476, lng: 100.5724 },
    bbox: KU_BANGKHEN_BBOX,
    map: 'campus',
    legMinM: CAMPUS_LEG_MIN_M,
  },
];

export const DEFAULT_AREA: AreaKey = 'samui';

export const isAreaKey = (v: unknown): v is AreaKey =>
  typeof v === 'string' && AREAS.some((a) => a.key === v);

export const areaByKey = (key: AreaKey): Area => AREAS.find((a) => a.key === key)!;

/**
 * The area a place belongs to, from its province. A province with no area
 * of its own is Samui's problem only in the sense that the map has to draw
 * something; a place in a listed province is a data error the seed test
 * catches before it gets here.
 */
export const areaOfProvince = (province: string): AreaKey =>
  AREAS.find((a) => a.province === province)?.key ?? DEFAULT_AREA;

/**
 * The area a PLACE belongs to.
 *
 * A province was enough while no two areas shared one, and `areaOfProvince`
 * is still what the passport wants - that counts provinces, and a province
 * is a province. It stopped being enough the day Ko Sichang arrived: it is
 * in Chon Buri, and so is the Si Racha campus, and `find` returns whichever
 * is written first in the array. Every Sichang place would have filed
 * itself under the campus - on Home, on the map, in the concierge, in the
 * medals, in the stories - and a university would have shown an island's
 * beaches.
 *
 * So geography decides, because an area IS a geography: the frame a screen
 * draws at once. The province stays as the fallback, which keeps every
 * existing place answering exactly as it did before this function existed -
 * including a place in a province with no area of its own.
 *
 * The boxes have to stay disjoint for this to mean anything. The two in
 * Chon Buri are six kilometres apart (Sichang ends at 100.8208 E, the
 * campus begins at 100.9173 E), which is wider than `MARGIN_DEG` either
 * side, and `areas.test.ts` holds them apart.
 */
export const areaOf = (
  place: { lat: number; lng: number; province?: string | null },
): AreaKey =>
  AREAS.find((a) => inArea(a, place))?.key ?? areaOfProvince(place.province ?? '');

/** Slack around the box, so a quest whose site is the road outside still belongs. */
const MARGIN_DEG = 0.02;

/** Whether a coordinate falls inside the area's frame. */
export const inArea = (area: Area, at: { lat: number; lng: number }): boolean =>
  at.lat >= area.bbox.minLat - MARGIN_DEG && at.lat <= area.bbox.maxLat + MARGIN_DEG
  && at.lng >= area.bbox.minLng - MARGIN_DEG && at.lng <= area.bbox.maxLng + MARGIN_DEG;

/** The area whose centre is closest. A rough equirectangular distance is plenty at 400 km apart. */
export function nearestArea(lat: number, lng: number): Area {
  let best = AREAS[0]!;
  let bestD = Infinity;
  for (const a of AREAS) {
    const d = (a.center.lat - lat) ** 2 + ((a.center.lng - lng) * Math.cos((lat * Math.PI) / 180)) ** 2;
    if (d < bestD) { bestD = d; best = a; }
  }
  return best;
}
