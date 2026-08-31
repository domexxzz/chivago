/**
 * The Wellness Engine: mood check-in, Chiva Balance, and the route a mood asks for.
 *
 * The one distinction that must never blur:
 *
 *   Healthy Score is a property of a PLACE   - air, crowding, safety, walkability.
 *   Chiva Balance is a property of the TRIP  - how this traveller's days are going.
 *
 * Both are explainable, and Balance carries something the place score does not
 * need: a `source` on every component, because one of them is self-reported and
 * four are measured from what actually happened. A wellbeing number that mixes
 * the two without saying which is which is a number nobody should trust.
 *
 * What this is NOT, and must never be presented as: a health assessment. It
 * reads mood as a travel preference - a tired traveller gets a gentler day -
 * and nothing here diagnoses anything or gives medical advice.
 */

import type { Bilingual } from './types.ts';

/**
 * Four moods, in plain travel language.
 *
 * Deliberately not a 1-10 scale: a number invites averaging, and an averaged
 * mood is meaningless. Deliberately not clinical words either - this is an
 * app for planning a day out.
 */
export type MoodKey = 'drained' | 'tense' | 'steady' | 'bright';

export const MOODS: Record<MoodKey, { label: Bilingual; asks: Bilingual }> = {
  drained: {
    label: { en: 'Drained', th: 'หมดแรง' },
    asks: { en: 'A short, quiet day', th: 'วันสั้นๆ เงียบๆ' },
  },
  tense: {
    label: { en: 'Tense', th: 'เครียด' },
    asks: { en: 'Green space, away from crowds', th: 'พื้นที่สีเขียว เลี่ยงที่คนเยอะ' },
  },
  steady: {
    label: { en: 'Steady', th: 'ปกติดี' },
    asks: { en: 'The day you planned', th: 'ตามแผนที่วางไว้' },
  },
  bright: {
    label: { en: 'Bright', th: 'สดชื่น' },
    asks: { en: 'Room for more', th: 'ไหวมากกว่านี้' },
  },
};

export const MOOD_KEYS = Object.keys(MOODS) as MoodKey[];
export const isMoodKey = (v: string): v is MoodKey => v in MOODS;

export interface MoodCheckin {
  /** ISO instant. */
  at: string;
  mood: MoodKey;
  /** Optional, and never interpreted - stored so a person can read it back. */
  note: string | null;
}

/** Where a component's number came from. Shown, never hidden. */
export type BalanceSource = 'measured' | 'self-reported';

export interface BalanceComponent {
  key: 'rest' | 'movement' | 'nature' | 'air' | 'quiet';
  label: Bilingual;
  /** The raw value, formatted for a human. */
  display: string;
  /** 0-100. */
  subScore: number;
  weight: number;
  source: BalanceSource;
}

export interface ChivaBalance {
  /** 0-100, or null when there is not enough of a trip to say anything. */
  total: number | null;
  components: BalanceComponent[];
  /** Days of activity the number is built from. */
  days: number;
  /** Why it is null, when it is. Never leave that unexplained. */
  note: Bilingual | null;
}

/** What the engine needs to know about the trip so far. */
export interface BalanceInput {
  moods: MoodCheckin[];
  /** One entry per place visited, in visit order. */
  visits: {
    at: string;
    layer: string;
    aqi: number;
    crowdDensity: number;
  }[];
  /** Kilometres walked, per day of the trip. */
  walkedKmPerDay: number[];
}

/** A trip shorter than this cannot say anything about balance. */
export const MIN_VISITS_FOR_BALANCE = 3;

const MOOD_VALUE: Record<MoodKey, number> = {
  drained: 20, tense: 45, steady: 75, bright: 95,
};

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const mean = (xs: number[]) => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);

/** Green space, as the layers name it. */
const RESTORATIVE = new Set(['Green', 'Wellness']);

/**
 * Movement scores as a BAND, not a ladder.
 *
 * Zero walking is not a good trip and neither is twenty kilometres a day. The
 * peak sits at a comfortable island day; both ends fall away. A metric that
 * rewarded distance without limit would push a tired traveller to walk more,
 * which is the opposite of what this engine is for.
 */
export function movementSubScore(kmPerDay: number): number {
  const ideal = 6;
  const spread = 5;
  return Math.round(100 * Math.exp(-((kmPerDay - ideal) ** 2) / (2 * spread ** 2)));
}

/**
 * Compute Chiva Balance.
 *
 * Returns null rather than a number when the trip is too short. A balance
 * score built from one afternoon is a guess wearing a number's clothes, and
 * the traveller has no way to know that unless we say so.
 */
export function chivaBalance(input: BalanceInput): ChivaBalance {
  const { moods, visits, walkedKmPerDay } = input;
  const days = walkedKmPerDay.length;

  if (visits.length < MIN_VISITS_FOR_BALANCE) {
    return {
      total: null,
      components: [],
      days,
      note: {
        en: `Not enough of the trip yet — ${visits.length} of ${MIN_VISITS_FOR_BALANCE} places visited`,
        th: `ข้อมูลยังไม่พอ — ไปมาแล้ว ${visits.length} จาก ${MIN_VISITS_FOR_BALANCE} แห่ง`,
      },
    };
  }

  // Recent moods weigh more: how someone felt on day one says little about
  // day five. The most recent five are all that is read.
  const recent = [...moods].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 5);
  const restScore = recent.length === 0 ? 60 : Math.round(mean(recent.map((m) => MOOD_VALUE[m.mood])));

  const kmPerDay = days === 0 ? 0 : mean(walkedKmPerDay);
  const natureShare = visits.filter((v) => RESTORATIVE.has(v.layer)).length / visits.length;
  const meanAqi = mean(visits.map((v) => v.aqi));
  const meanCrowd = mean(visits.map((v) => v.crowdDensity));

  const components: BalanceComponent[] = [
    {
      key: 'rest',
      label: { en: 'How you have felt', th: 'ความรู้สึกของคุณ' },
      display: recent.length === 0
        ? 'No check-ins yet'
        : `${recent.length} check-in${recent.length === 1 ? '' : 's'}`,
      subScore: restScore,
      weight: 0.3,
      source: 'self-reported',
    },
    {
      key: 'movement',
      label: { en: 'Movement', th: 'การเคลื่อนไหว' },
      display: `${kmPerDay.toFixed(1)} km a day`,
      subScore: movementSubScore(kmPerDay),
      weight: 0.2,
      source: 'measured',
    },
    {
      key: 'nature',
      label: { en: 'Time in green space', th: 'เวลาในพื้นที่สีเขียว' },
      display: `${Math.round(natureShare * 100)}% of your stops`,
      subScore: Math.round(clamp(natureShare * 180, 0, 100)),
      weight: 0.2,
      source: 'measured',
    },
    {
      key: 'air',
      label: { en: 'Air you have breathed', th: 'อากาศที่คุณหายใจ' },
      display: `${Math.round(meanAqi)} AQI average`,
      subScore: Math.round(clamp(100 - (meanAqi - 20) * 1.1, 0, 100)),
      weight: 0.15,
      source: 'measured',
    },
    {
      key: 'quiet',
      label: { en: 'Quiet', th: 'ความสงบ' },
      display: `${meanCrowd.toFixed(1)} people / 100 m²`,
      subScore: Math.round(clamp(100 - (meanCrowd - 0.5) * 28, 0, 100)),
      weight: 0.15,
      source: 'measured',
    },
  ];

  const total = Math.round(
    components.reduce((n, c) => n + c.subScore * c.weight, 0),
  );

  return { total: clamp(total, 0, 100), components, days, note: null };
}

/**
 * What a mood asks of the day - the deck's "เส้นทางบรรโลงใจ".
 *
 * A preference, not a prescription: it changes how far the plan sends someone
 * and what it favours, and it never removes their ability to ask for
 * something else.
 */
export function routeBiasFor(mood: MoodKey): {
  energy: 'gentle' | 'moderate' | 'full';
  favour: string[];
  avoidCrowds: boolean;
} {
  switch (mood) {
    case 'drained': return { energy: 'gentle', favour: ['Wellness', 'Green'], avoidCrowds: true };
    case 'tense': return { energy: 'gentle', favour: ['Green'], avoidCrowds: true };
    case 'bright': return { energy: 'full', favour: [], avoidCrowds: false };
    case 'steady':
    default: return { energy: 'moderate', favour: [], avoidCrowds: false };
  }
}
