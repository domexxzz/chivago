/**
 * Smart Route - the deck's "รถ–เรือ–วิน–เดิน เห็นครบทุกทอดพร้อมเวลาต่อรถ".
 *
 * Every leg of a journey across Koh Samui, with the wait between legs shown
 * as its own line rather than folded into the travel time. The wait is the
 * part travellers get wrong: a twelve-minute songthaew ride is not a
 * twelve-minute journey when the songthaew comes every eight.
 *
 * WHAT THIS KNOWS: the island is a ring. One road runs round it, the
 * songthaews run that road, motorbike taxis go anywhere, and the islands off
 * the south coast are reachable only by boat from a pier.
 *
 * WHAT THIS DOES NOT KNOW, and must never be presented as knowing: a road
 * network, live vehicle positions, traffic, or today's fares. Distances are
 * straight lines multiplied by a road factor; fares are typical rates written
 * down as constants carrying the date they were true. The deck's own roadmap
 * puts real GPS and partner pricing in the NEXT column, and this is the model
 * that proves the UX until then.
 */

import type { Bilingual } from './types.ts';

/**
 * How you get from one place to the next.
 *
 * Owned here rather than by the day planner, because the planner's legs are
 * built by this router: one table of paces and fares, so a songthaew cannot
 * cost one thing inside a plan and another inside a route.
 */
export type TransitMode = 'walk' | 'songthaew' | 'moto' | 'boat';

export interface Waypoint {
  id: string;
  name: Bilingual;
  lat: number;
  lng: number;
  /** Reachable only by boat, so a pier leg is forced on the way in and out. */
  island?: boolean;
}

export interface RouteLeg {
  mode: TransitMode;
  from: Waypoint;
  to: Waypoint;
  km: number;
  /** Time actually moving. */
  moveMinutes: number;
  /**
   * Time waiting to start this leg - the deck's "เวลาต่อรถ".
   *
   * Kept separate from `moveMinutes` on purpose. Folding them together hides
   * the thing that makes a plan wrong.
   */
  waitMinutes: number;
  fareTHB: number;
  why: Bilingual;
}

export interface RouteOption {
  key: 'fastest' | 'cheapest';
  label: Bilingual;
  legs: RouteLeg[];
  totalMinutes: number;
  totalTHB: number;
  /** Times you change vehicle. Zero is worth saying out loud. */
  transfers: number;
}

export interface SmartRoute {
  from: Waypoint;
  to: Waypoint;
  /** Never empty: a journey with no options is a bug, not an answer. */
  options: RouteOption[];
  /** What the estimate cannot see. Shown, never buried. */
  caveat: Bilingual;
}

/**
 * Straight line to road distance.
 *
 * Samui's ring road does not cut through the middle, so two points on
 * opposite coasts are further apart by road than by sight. A fitted constant,
 * not a measurement, and named so it reads as one.
 */
export const ROAD_FACTOR = 1.35;

/** Boats go straight; the sea has no ring road. */
export const SEA_FACTOR = 1.05;

/**
 * Typical rates. NOT live pricing.
 *
 * Dated so nobody mistakes a constant for a quote. Songthaew fares on Samui
 * are per-hop and negotiated; these are what a traveller who does not haggle
 * actually pays.
 */
export const FARES = {
  asOf: '2026-09-01',
  walk: { base: 0, perKm: 0 },
  songthaew: { base: 50, perKm: 3 },
  moto: { base: 30, perKm: 12 },
  /** Shared longtail, per head. A private charter is several times this. */
  boat: { base: 400, perKm: 0 },
} as const;

/** Minutes moving per kilometre, and the typical wait before you are moving. */
export const PACE: Record<TransitMode, { minPerKm: number; wait: number }> = {
  walk: { minPerKm: 13, wait: 0 },
  songthaew: { minPerKm: 2.6, wait: 8 },
  moto: { minPerKm: 2.0, wait: 4 },
  boat: { minPerKm: 3.2, wait: 15 },
};

export const MODE_NAME: Record<TransitMode, Bilingual> = {
  walk: { en: 'Walk', th: 'เดิน' },
  songthaew: { en: 'Songthaew', th: 'สองแถว' },
  moto: { en: 'Motorbike taxi', th: 'วินมอเตอร์ไซค์' },
  boat: { en: 'Longtail boat', th: 'เรือหางยาว' },
};

/** Anything under this is walked, whatever else is on offer. */
export const WALK_LIMIT_KM = 1.2;
/** Above this a motorbike taxi stops being a hop and starts being a journey. */
export const MOTO_LIMIT_KM = 8;

const R = 6_371;
const toRad = (d: number) => (d * Math.PI) / 180;

export function straightLineKm(a: Waypoint, b: Waypoint): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

const round = (n: number, dp = 1) => Math.round(n * 10 ** dp) / 10 ** dp;

function reasonForLeg(mode: TransitMode, km: number): Bilingual {
  switch (mode) {
    case 'walk':
      return { en: `${km} km on foot`, th: `เดิน ${km} กม.` };
    case 'moto':
      return {
        en: `${km} km — fastest, one passenger, no luggage`,
        th: `${km} กม. เร็วที่สุด นั่งได้คนเดียว ไม่มีที่เก็บสัมภาระ`,
      };
    case 'songthaew':
      return {
        en: `${km} km on the ring road — cheapest, stops on request`,
        th: `${km} กม. ทางถนนรอบเกาะ ถูกที่สุด จอดตามจุด`,
      };
    case 'boat':
    default:
      return {
        en: `${km} km by sea — the only way across`,
        th: `${km} กม. ทางทะเล ทางเดียวที่ข้ามได้`,
      };
  }
}

/** Build one leg, timed and priced from the constants above. */
export function makeLeg(from: Waypoint, to: Waypoint, mode: TransitMode): RouteLeg {
  const factor = mode === 'boat' ? SEA_FACTOR : ROAD_FACTOR;
  const km = round(straightLineKm(from, to) * factor);
  const pace = PACE[mode];
  const fare = FARES[mode];
  return {
    mode,
    from,
    to,
    km,
    moveMinutes: Math.max(1, Math.round(km * pace.minPerKm)),
    waitMinutes: km === 0 ? 0 : pace.wait,
    fareTHB: km === 0 ? 0 : Math.round(fare.base + fare.perKm * km),
    why: reasonForLeg(mode, km),
  };
}

/**
 * The mode a land segment should use.
 *
 * `prefer` breaks the tie in the middle band, where both a motorbike taxi and
 * a songthaew are reasonable and the traveller is choosing between time and
 * money. Short walks and long hauls are not a choice.
 */
export function chooseMode(km: number, prefer: 'fast' | 'cheap'): TransitMode {
  if (km <= WALK_LIMIT_KM) return 'walk';
  if (km > MOTO_LIMIT_KM) return 'songthaew';
  return prefer === 'fast' ? 'moto' : 'songthaew';
}

const totalOf = (legs: RouteLeg[]) => ({
  totalMinutes: legs.reduce((n, l) => n + l.moveMinutes + l.waitMinutes, 0),
  totalTHB: legs.reduce((n, l) => n + l.fareTHB, 0),
  // Walking between two rides is not a transfer you wait for; changing
  // vehicle is. Counting walks would make every route look worse than it is.
  transfers: Math.max(0, legs.filter((l) => l.mode !== 'walk').length - 1),
});

/**
 * Plan a journey, leg by leg.
 *
 * An island endpoint forces the boat: the land part runs to the nearest pier,
 * then the crossing. A pier that is not supplied is a routing failure and is
 * reported as such rather than silently routed over water.
 */
export function smartRoute(
  from: Waypoint,
  to: Waypoint,
  piers: Waypoint[] = [],
): SmartRoute {
  const build = (prefer: 'fast' | 'cheap'): RouteLeg[] => {
    const legs: RouteLeg[] = [];
    const crossing = from.island === true || to.island === true;

    if (!crossing) {
      const km = straightLineKm(from, to) * ROAD_FACTOR;
      legs.push(makeLeg(from, to, chooseMode(km, prefer)));
      return legs;
    }

    // One end is offshore. Route through the pier nearest the mainland end.
    const mainland = from.island === true ? to : from;
    const offshore = from.island === true ? from : to;
    const pier = [...piers].sort(
      (a, b) => straightLineKm(mainland, a) - straightLineKm(mainland, b),
    )[0];
    if (!pier) return [];

    const toPierKm = straightLineKm(mainland, pier) * ROAD_FACTOR;
    if (from.island === true) {
      legs.push(makeLeg(offshore, pier, 'boat'));
      if (toPierKm > 0.05) legs.push(makeLeg(pier, mainland, chooseMode(toPierKm, prefer)));
    } else {
      if (toPierKm > 0.05) legs.push(makeLeg(mainland, pier, chooseMode(toPierKm, prefer)));
      legs.push(makeLeg(pier, offshore, 'boat'));
    }
    return legs;
  };

  const fast = build('fast');
  const cheap = build('cheap');

  const option = (key: 'fastest' | 'cheapest', legs: RouteLeg[]): RouteOption => ({
    key,
    label: key === 'fastest'
      ? { en: 'Fastest', th: 'เร็วที่สุด' }
      : { en: 'Cheapest', th: 'ถูกที่สุด' },
    legs,
    ...totalOf(legs),
  });

  const options: RouteOption[] = [];
  if (fast.length > 0) options.push(option('fastest', fast));
  // Only offer the cheaper route when it is actually different AND actually
  // cheaper. Two identical cards is worse than one honest one.
  if (cheap.length > 0) {
    const cheapTotal = totalOf(cheap);
    const fastTotal = totalOf(fast);
    if (fast.length === 0 || cheapTotal.totalTHB < fastTotal.totalTHB) {
      options.push(option('cheapest', cheap));
    }
  }

  return {
    from,
    to,
    options,
    caveat: options.length === 0
      ? {
        en: 'No route: that crossing needs a pier and none was found',
        th: 'ไม่มีเส้นทาง การข้ามนี้ต้องผ่านท่าเรือ แต่ไม่พบท่าเรือ',
      }
      : {
        en: `Estimated from distance and typical fares as of ${FARES.asOf}. Not live pricing, and no traffic.`,
        th: `ประมาณจากระยะทางและค่าโดยสารทั่วไป ณ ${FARES.asOf} ไม่ใช่ราคาจริงตามเวลา และไม่รวมสภาพจราจร`,
      },
  };
}
