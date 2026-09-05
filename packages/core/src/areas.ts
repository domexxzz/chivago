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
import { SAMUI_BBOX } from './seed.ts';

export type AreaKey = 'samui' | 'ku-sriracha';

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
