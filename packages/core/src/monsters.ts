/**
 * Monsters: the island's problems, wearing a face.
 *
 * The Arena diagram is explicit about what these are and are not - "โผล่จาก
 * ข้อมูลจริง ไม่ใช่สัตว์", they come from real data and they are not animals.
 * That is the whole design constraint, and it is the same rule the rest of
 * this codebase runs on: nothing here invents a monster to make a screen
 * livelier. A monster stands somewhere because a measurement or a host says
 * there is a problem there, and when neither does, the place has none and
 * the app says so.
 *
 * WHAT SUMMONS ONE
 *
 * `smog` is summoned by the air reading at that place, and only when the
 * reading is an OBSERVATION - live or daily. An estimate cannot summon a
 * monster, because then the monster would be a picture of our own guess.
 *
 * `plastic` is summoned by a host having opened a clean-up at that place.
 * That is a person with a name saying, on the record, that there is
 * something to pick up here. It is not inferred from crowds or from litter
 * nobody counted.
 *
 * HOW ONE IS CLEANSED
 *
 * By deeds the ledger already holds, not by tapping the monster. A verified
 * quest is worth three; a measured leg on foot is worth one. Both are things
 * that really happened and that something else already checked - the host in
 * the first case, the phone's own two fixes in the second. A check-in is
 * worth NOTHING here: standing next to a problem is not doing anything about
 * it, and paying for it would make the bar a lie.
 *
 * WHAT RESTING DOES NOT MEAN
 *
 * A rested smog monster does not mean the air got better. It means the
 * island did the work the game asked for. The reading that summoned it is
 * carried on the monster so a screen can show both, and `restingChangesThe
 * Reading` is false for exactly this reason. Anything that let a player
 * believe they had fixed an AQI by walking would be the same lie as an
 * invented photograph.
 */

import type { Bilingual } from './types.ts';

export type MonsterKey = 'smog' | 'plastic';

/**
 * The air reading at which smog appears.
 *
 * Fifty-one is the boundary where a published AQI stops being "good" and
 * becomes "moderate". A boundary somebody else set and can be looked up,
 * rather than a number chosen to make a monster appear during a demo. On a
 * clean day no smog stands anywhere, and that is the correct outcome.
 */
export const SMOG_AQI = 51;

/** Deeds needed before a monster rests. Communal: anybody's count. */
export const DEEDS_TO_REST = 5;

/** How long a fully cleansed monster stays away. The diagram's seven days. */
export const REST_DAYS = 7;

/** What each kind of real deed is worth against a monster. */
export const DEED_WEIGHT = {
  /** A host checked this and said it happened. The heaviest thing we have. */
  verifiedQuest: 3,
  /** Two fixes far enough apart, slow enough to be walked. Measured, not claimed. */
  walkedLeg: 1,
} as const;

export type DeedKind = keyof typeof DEED_WEIGHT;

export interface MonsterSpecies {
  key: MonsterKey;
  name: Bilingual;
  /** What it is made of, said in one line. Never "a creature that…". */
  what: Bilingual;
  /** The work that pushes it back, in the reader's language. */
  cleansedBy: Bilingual;
}

export const MONSTERS: Record<MonsterKey, MonsterSpecies> = {
  smog: {
    key: 'smog',
    name: { en: 'Smog', th: 'หมอกควัน' },
    what: {
      en: 'The air reading here today, not an animal.',
      th: 'ค่าอากาศที่วัดได้ที่นี่วันนี้ ไม่ใช่สัตว์',
    },
    cleansedBy: {
      en: 'Walk instead of riding, and finish a green quest here.',
      th: 'เดินแทนการใช้รถ และทำภารกิจสีเขียวที่นี่ให้จบ',
    },
  },
  plastic: {
    key: 'plastic',
    name: { en: 'Plastic bag ghost', th: 'ผีถุงพลาสติก' },
    what: {
      en: 'A clean-up a host has opened here.',
      th: 'งานเก็บขยะที่เจ้าภาพเปิดไว้ที่นี่',
    },
    cleansedBy: {
      en: 'Collect what is here, and let the host check it.',
      th: 'เก็บของที่นี่ แล้วให้เจ้าภาพตรวจ',
    },
  },
};

/** What a place can tell us, all of it already measured or recorded. */
export interface PlaceSignals {
  placeId: string;
  /** Today's air, and how it was come by. Only an observation may summon. */
  aqi: number;
  aqiProvenance: 'live' | 'daily' | 'estimated' | 'stale';
  /** A host has an open clean-up quest at this place. */
  hasOpenCleanup: boolean;
}

/**
 * Which monsters stand at a place, and what summoned each.
 *
 * Returns the reason alongside the monster, because a screen that shows a
 * monster without its number is asking to be believed rather than read.
 */
export function monstersAt(signals: PlaceSignals): {
  key: MonsterKey;
  /** The measurement or record that put it here, for the card to print. */
  because: Bilingual;
}[] {
  const out: { key: MonsterKey; because: Bilingual }[] = [];

  const observed = signals.aqiProvenance === 'live' || signals.aqiProvenance === 'daily';
  if (observed && signals.aqi >= SMOG_AQI) {
    out.push({
      key: 'smog',
      because: {
        en: `Air measured at ${signals.aqi} AQI here, over ${SMOG_AQI}.`,
        th: `วัดอากาศได้ ${signals.aqi} AQI ที่นี่ สูงกว่า ${SMOG_AQI}`,
      },
    });
  }

  if (signals.hasOpenCleanup) {
    out.push({
      key: 'plastic',
      because: {
        en: 'A host has an open clean-up here.',
        th: 'เจ้าภาพเปิดงานเก็บขยะไว้ที่นี่',
      },
    });
  }

  return out;
}

/** A deed the ledger already holds, counted against a place's monsters. */
export interface Deed {
  kind: DeedKind;
  at: string;
}

export interface MonsterState {
  /** Weighted deeds in the window. Communal, not per traveller. */
  progress: number;
  needed: number;
  /** Null while it is still standing. Otherwise when it comes back. */
  restingUntil: string | null;
}

/**
 * How far the island has pushed one monster back.
 *
 * Counted from the deeds themselves rather than from a stored counter, so
 * there is no second place for the number to live and drift. A hidden or
 * withdrawn deed simply stops being counted the next time this runs.
 */
export function monsterState(deeds: readonly Deed[], now: Date): MonsterState {
  const since = new Date(now.getTime() - REST_DAYS * 24 * 3_600_000).toISOString();
  const recent = [...deeds]
    .filter((d) => d.at >= since)
    .sort((a, b) => (a.at < b.at ? -1 : 1));

  let progress = 0;
  let finishedAt: string | null = null;
  for (const deed of recent) {
    progress += DEED_WEIGHT[deed.kind];
    if (progress >= DEEDS_TO_REST && finishedAt === null) finishedAt = deed.at;
  }

  return {
    progress: Math.min(progress, DEEDS_TO_REST),
    needed: DEEDS_TO_REST,
    restingUntil: finishedAt
      ? new Date(new Date(finishedAt).getTime() + REST_DAYS * 24 * 3_600_000).toISOString()
      : null,
  };
}

/**
 * Resting a monster does not move the reading that summoned it.
 *
 * Stated as a value so a screen cannot quietly imply otherwise and so a test
 * can hold it. Walking past a smog monster five times does not clean the air
 * over Chaweng, and an app that let somebody believe it had would be telling
 * the same kind of lie as a photograph of somewhere else.
 */
export const restingChangesTheReading = false;
