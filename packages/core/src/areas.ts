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
import { CAMPUS_LEG_MIN_M, LEG_MIN_M } from './low-carbon.ts';
import { SAMUI_BBOX } from './seed.ts';

export type AreaKey = 'samui' | 'ku-sriracha' | 'rmutt' | 'ku-bangkhen' | 'koh-sichang';

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

/** Bangkhen's campus frame, supplied by the onboarding brief and checked against mapped landmarks. */
export const KU_BANGKHEN_BBOX: Bbox = {
  minLat: 13.8400,
  maxLat: 13.8580,
  minLng: 100.5620,
  maxLng: 100.5820,
};

/**
 * Koh Sichang's main island, from its outermost mapped capes and piers in
 * OpenStreetMap (relation 13094563 and the features on it, read on
 * 2026-10-23): Laem Ngu and Tha Yai Thim to the south, Laem Sichang to the
 * north, Laem Khao Khat to the west, the Ko Kham Yai pier to the east.
 *
 * About 6 x 2.8 km. Twelve kilometres of sea west of the Si Racha campus,
 * in the same province - which is why a place's area is read from where it
 * stands, not only from its province (`areaOfPlace`).
 */
export const KOH_SICHANG_BBOX: Bbox = {
  minLat: 13.1250,
  maxLat: 13.1800,
  minLng: 100.7970,
  maxLng: 100.8230,
};

/**
 * Whether a coordinate is on the Koh Sichang map that ChivarGo can route.
 *
 * This deliberately does not use `inArea`: that helper includes a generous
 * content margin so a quest just outside a frame still belongs to the right
 * area. A navigation-provider decision cannot use that margin, otherwise a
 * mainland destination near Si Racha could be sent to the island-only map.
 */
export const isOnKohSichang = (at: { lat: number; lng: number }): boolean =>
  at.lat >= KOH_SICHANG_BBOX.minLat && at.lat <= KOH_SICHANG_BBOX.maxLat
  && at.lng >= KOH_SICHANG_BBOX.minLng && at.lng <= KOH_SICHANG_BBOX.maxLng;

/** The one routing-provider policy shared by every navigation entry point. */
export const navigationProviderFor = (destination: { lat: number; lng: number }): 'chivago' | 'google' =>
  isOnKohSichang(destination) ? 'chivago' : 'google';

export const AREAS: Area[] = [
  {
    key: 'samui',
    name: { en: 'Koh Samui', th: 'เกาะสมุย', zh: '苏梅岛' },
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
    name: { en: 'KU Sriracha', th: 'มก. ศรีราชา', zh: 'KU 是拉差校区' },
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
    name: { en: 'RMUTT', th: 'มทร.ธัญบุรี', zh: 'RMUTT 校区' },
    province: 'TH-13',
    // The centre of the OpenStreetMap outline of way 910034983.
    center: { lat: 14.03556, lng: 100.72635 },
    bbox: RMUTT_BBOX,
    map: 'campus',
    legMinM: CAMPUS_LEG_MIN_M,
  },
  {
    key: 'ku-bangkhen',
    name: { en: 'KU Bangkhen', th: 'มก. บางเขน', zh: 'KU 邦肯校区' },
    province: 'TH-10',
    center: { lat: 13.8476, lng: 100.5724 },
    bbox: KU_BANGKHEN_BBOX,
    map: 'campus',
    legMinM: CAMPUS_LEG_MIN_M,
  },
  {
    // After KU Sriracha: a Chon Buri place on neither frame stays with the
    // campus, as it did before the island opened.
    key: 'koh-sichang',
    name: { en: 'Koh Sichang', th: 'เกาะสีชัง', zh: '锡昌岛' },
    province: 'TH-20',
    // The town node in OpenStreetMap (node 487180518), by Tha Lang pier.
    center: { lat: 13.1599, lng: 100.8096 },
    bbox: KOH_SICHANG_BBOX,
    // Streets and paths, not the terrain hero: the island silhouette in this
    // app is Samui's, and would put the pier somewhere in the Gulf.
    map: 'campus',
    // A walking island: the pier to the palace is 1.6 km, to Tham Phang 1.8 km.
    legMinM: CAMPUS_LEG_MIN_M,
  },
];

/**
 * Where somebody lands who has not chosen, and the fallback when a place
 * cannot be placed in any area.
 *
 * Koh Sichang, because that is the pilot: the area the quests, the hosts and
 * the pitch are about. It was Samui until 7 November 2026, which meant the
 * app opened on the wrong island for anyone arriving without a stored choice
 * or an `?area=` in the URL - including a projector at a pitch about Sichang.
 *
 * This is the default and not an override: a stored choice and `?area=` both
 * still win (`loadArea` in apps/mobile/src/state/area.ts), so a browser that
 * has already been switched to Samui stays on Samui. To be certain of the
 * area on a machine that has been used before, open `?area=koh-sichang`,
 * which sets it and persists it.
 */
export const DEFAULT_AREA: AreaKey = 'koh-sichang';

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
 * The area a place belongs to. A province with one area is `areaOfProvince`;
 * Chon Buri has two, so the place goes to the one whose frame it stands in,
 * and a place on neither frame stays with the province's first area.
 */
export const areaOfPlace = (p: { province?: string | null; lat: number; lng: number }): AreaKey => {
  const ofProvince = AREAS.filter((a) => a.province === p.province);
  return (ofProvince.find((a) => inArea(a, p)) ?? ofProvince[0])?.key ?? DEFAULT_AREA;
};

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
