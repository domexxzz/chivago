/**
 * Price Forecast - the deck's "พยากรณ์ช่วงราคาที่พัก-เดินทาง แยกธรรมดา/เทศกาล".
 *
 * This is the most dangerous feature in the app to get wrong, because people
 * budget against it. Three rules hold it honest, and none are negotiable:
 *
 *  1. It returns a BAND, never a price. The deck says "ช่วงราคา" and it means
 *     it: a single number reads as a quote, and we have nothing to quote from.
 *  2. Every band names the things that moved it - the season, the holiday, the
 *     weekend - with the size of each effect. A forecast nobody can argue with
 *     is a forecast nobody can correct.
 *  3. Confidence FALLS with the horizon, and the best available level is
 *     "indicative". There is deliberately no "firm": firm needs partner
 *     inventory, which the deck's own roadmap puts in the NEXT column.
 *
 * WHAT THIS IS NOT: a quote, a booking, or a promise. It is a seasonality
 * model over published typical rates, and it says so on every response.
 */

import { ISLAND_TZ } from './wallet.ts';
import type { Bilingual } from './types.ts';

export type PriceCategory = 'stay' | 'ferry' | 'flight' | 'scooter';

/**
 * Confidence, and why nothing ranks above `indicative`.
 *
 * `indicative`  - inside two weeks, where seasonality is most of the answer.
 * `rough`       - out to three months.
 * `speculative` - beyond that, where a band is barely better than a guess and
 *                 should be read as "come back nearer the time".
 */
export type Confidence = 'indicative' | 'rough' | 'speculative';

export interface PriceBand {
  low: number;
  typical: number;
  high: number;
  currency: 'THB';
}

/** One thing that moved the band, and by how much. */
export interface PriceDriver {
  label: Bilingual;
  /** Multiplier applied. 1.4 means "this added 40%". */
  effect: number;
}

export interface PriceForecast {
  category: PriceCategory;
  /** Island-local date, `YYYY-MM-DD`. */
  date: string;
  band: PriceBand;
  /** True when a holiday or festival is driving the price, not just the season. */
  isFestival: boolean;
  drivers: PriceDriver[];
  confidence: Confidence;
  caveat: Bilingual;
}

/**
 * Typical off-peak rates, in THB. NOT quotes.
 *
 * `stay` is a mid-range double per night, `ferry` a one-way Donsak crossing,
 * `flight` a one-way Bangkok hop, `scooter` a day's hire. Dated so a constant
 * is never mistaken for live pricing.
 */
export const BASELINE = {
  asOf: '2026-09-01',
  stay: 1400,
  ferry: 400,
  flight: 2200,
  scooter: 250,
} as const;

/**
 * Koh Samui's seasons, by month.
 *
 * Not the mainland's. Samui sits in the Gulf and takes the northeast monsoon,
 * so it is wettest in Oct-Dec while Phuket is dry, and driest Feb-Apr. Prices
 * follow the weather and the northern-hemisphere holidays together.
 */
export const SEASON_BY_MONTH: Record<number, { key: string; label: Bilingual; effect: number }> = {
  1: { key: 'peak', label: { en: 'Peak season', th: 'ฤดูท่องเที่ยวสูงสุด' }, effect: 1.55 },
  2: { key: 'high', label: { en: 'High season', th: 'ฤดูท่องเที่ยว' }, effect: 1.35 },
  3: { key: 'high', label: { en: 'High season', th: 'ฤดูท่องเที่ยว' }, effect: 1.3 },
  4: { key: 'shoulder', label: { en: 'Shoulder season', th: 'ช่วงคาบเกี่ยว' }, effect: 1.15 },
  5: { key: 'low', label: { en: 'Low season', th: 'นอกฤดู' }, effect: 0.9 },
  6: { key: 'low', label: { en: 'Low season', th: 'นอกฤดู' }, effect: 0.9 },
  7: { key: 'high', label: { en: 'European summer', th: 'ช่วงปิดเทอมยุโรป' }, effect: 1.3 },
  8: { key: 'high', label: { en: 'European summer', th: 'ช่วงปิดเทอมยุโรป' }, effect: 1.3 },
  9: { key: 'low', label: { en: 'Low season', th: 'นอกฤดู' }, effect: 0.85 },
  10: { key: 'low', label: { en: 'Monsoon approaching', th: 'ใกล้ฤดูฝน' }, effect: 0.8 },
  11: { key: 'low', label: { en: 'Wettest month', th: 'เดือนฝนชุกที่สุด' }, effect: 0.75 },
  12: { key: 'peak', label: { en: 'Peak season', th: 'ฤดูท่องเที่ยวสูงสุด' }, effect: 1.5 },
};

/**
 * Dated events that move prices beyond the season - the deck's "เทศกาล".
 *
 * `MM-DD`, inclusive of both ends, and a window may wrap the new year.
 * Recurring every year, which is why no year is stored.
 */
export const FESTIVALS: { from: string; to: string; label: Bilingual; effect: number }[] = [
  { from: '12-28', to: '01-03', label: { en: 'New Year', th: 'ปีใหม่' }, effect: 1.7 },
  { from: '04-11', to: '04-17', label: { en: 'Songkran', th: 'สงกรานต์' }, effect: 1.45 },
  { from: '02-08', to: '02-14', label: { en: 'Chinese New Year', th: 'ตรุษจีน' }, effect: 1.3 },
  { from: '11-14', to: '11-16', label: { en: 'Loy Krathong', th: 'ลอยกระทง' }, effect: 1.2 },
];

/** Weekends cost more everywhere, and Samui is no exception. */
export const WEEKEND_EFFECT = 1.12;

/** How wide the band is, by confidence. Less certainty, wider band. */
export const SPREAD: Record<Confidence, number> = {
  indicative: 0.18,
  rough: 0.3,
  speculative: 0.45,
};

const DAY_MS = 86_400_000;

/** Island-local `YYYY-MM-DD` for a date. */
export const islandDay = (d: Date): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: ISLAND_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);

/** Does `MM-DD` fall inside a window that may wrap the new year? */
export function withinWindow(md: string, from: string, to: string): boolean {
  return from <= to ? md >= from && md <= to : md >= from || md <= to;
}

/**
 * Confidence from how far out the date is.
 *
 * Never returns anything better than `indicative`: without partner inventory
 * there is no such thing as a firm price here, and inventing a confident tier
 * would be the single most misleading thing this file could do.
 */
export function confidenceFor(daysAhead: number): Confidence {
  if (daysAhead <= 14) return 'indicative';
  if (daysAhead <= 90) return 'rough';
  return 'speculative';
}

const round50 = (n: number) => Math.round(n / 50) * 50;

/**
 * Forecast a band for one category on one date.
 *
 * `now` is passed rather than read, so the result is a pure function of its
 * inputs: the same request on the same day always produces the same band,
 * which is what makes it testable and what stops a refresh moving the price.
 */
export function forecastPrice(
  category: PriceCategory,
  date: string,
  now: Date,
): PriceForecast {
  const [, monthStr, dayStr] = date.split('-');
  const month = Number(monthStr);
  const md = `${monthStr}-${dayStr}`;

  const season = SEASON_BY_MONTH[month] ?? SEASON_BY_MONTH[9]!;
  const drivers: PriceDriver[] = [{ label: season.label, effect: season.effect }];

  const festival = FESTIVALS.find((f) => withinWindow(md, f.from, f.to));
  if (festival) drivers.push({ label: festival.label, effect: festival.effect });

  // Day of week in island time, not the caller's.
  const weekday = new Date(`${date}T12:00:00+07:00`).getUTCDay();
  if (weekday === 5 || weekday === 6) {
    drivers.push({ label: { en: 'Weekend', th: 'สุดสัปดาห์' }, effect: WEEKEND_EFFECT });
  }

  // A scooter is hired from a shop that does not care what week it is.
  const applicable = category === 'scooter' ? drivers.slice(0, 1) : drivers;
  const multiplier = applicable.reduce((n, d) => n * d.effect, 1);
  const typical = BASELINE[category] * multiplier;

  const daysAhead = Math.round(
    (new Date(`${date}T12:00:00+07:00`).getTime() - now.getTime()) / DAY_MS,
  );
  const confidence = confidenceFor(Math.max(0, daysAhead));
  const spread = SPREAD[confidence];

  return {
    category,
    date,
    band: {
      low: round50(typical * (1 - spread)),
      typical: round50(typical),
      high: round50(typical * (1 + spread)),
      currency: 'THB',
    },
    isFestival: festival !== undefined,
    drivers: applicable,
    confidence,
    caveat: {
      en: `A range, not a quote. Modelled from season and typical rates as of ${BASELINE.asOf}; no partner inventory yet.`,
      th: `เป็นช่วงราคา ไม่ใช่ราคาจอง คำนวณจากฤดูกาลและค่าเฉลี่ย ณ ${BASELINE.asOf} ยังไม่ได้เชื่อมราคาจริงจากพาร์ตเนอร์`,
    },
  };
}

export interface MonthOutlook {
  /** `YYYY-MM`. */
  month: string;
  label: Bilingual;
  band: PriceBand;
  /** True when a festival falls in this month. */
  hasFestival: boolean;
  confidence: Confidence;
}

/**
 * The months ahead, so somebody can see WHEN to come rather than only what
 * today costs.
 *
 * The headline is an ORDINARY day in that month - season effect only, no
 * festival and no weekend. That is the deck's "แยกธรรมดา/เทศกาล" taken
 * literally, and it fixes a real fault: sampling the 15th put Loy Krathong
 * inside November's headline, which inflated the cheapest month on the island
 * by 20% and hid it from anyone scanning the column.
 *
 * Festivals are not dropped, only separated: `hasFestival` still marks the
 * month so nobody books into one unknowingly.
 */
export function outlookAhead(
  category: PriceCategory,
  now: Date,
  months = 6,
): MonthOutlook[] {
  const out: MonthOutlook[] = [];
  const [y0, m0] = islandDay(now).split('-').map(Number);

  for (let i = 0; i < months; i += 1) {
    const d = new Date(Date.UTC(y0!, m0! - 1 + i, 15, 5, 0, 0));
    const day = islandDay(d);
    const month = day.slice(0, 7);
    const mm = month.split('-')[1]!;

    // An ordinary day: the season alone, priced at the month's own horizon.
    const season = SEASON_BY_MONTH[Number(mm)]!;
    const daysAhead = Math.max(0, Math.round(
      (new Date(`${day}T12:00:00+07:00`).getTime() - now.getTime()) / DAY_MS,
    ));
    const confidence = confidenceFor(daysAhead);
    const spread = SPREAD[confidence];
    const typical = BASELINE[category] * season.effect;

    out.push({
      month,
      label: season.label,
      band: {
        low: round50(typical * (1 - spread)),
        typical: round50(typical),
        high: round50(typical * (1 + spread)),
        currency: 'THB',
      },
      hasFestival: FESTIVALS.some((fest) => fest.from.startsWith(mm) || fest.to.startsWith(mm)),
      confidence,
    });
  }
  return out;
}

/** The cheapest month in an outlook. Null when the outlook is empty. */
export function cheapestMonth(outlook: MonthOutlook[]): MonthOutlook | null {
  return outlook.reduce<MonthOutlook | null>(
    (best, m) => (best === null || m.band.typical < best.band.typical ? m : best),
    null,
  );
}
