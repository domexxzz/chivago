/**
 * Gentle steps: what the app offers somebody who said they are not coping.
 *
 * THE RULE THIS FILE EXISTS TO ENFORCE: a gentle step pays nothing.
 *
 * Not a small amount. Nothing. There is no points field on `GentleStep` and
 * no route that could award one, because the moment resting earns currency
 * three things happen at once and all of them are bad:
 *
 *   - the app is paying people to report being drained, so the mood history
 *     stops being a record of how anybody feels and starts being a record of
 *     what pays;
 *   - the cheapest steps get farmed, which is the opposite of the behaviour
 *     they exist to encourage;
 *   - and a traveller who is genuinely struggling is handed a scoreboard,
 *     which is the single thing every piece of advice on this subject says
 *     not to do.
 *
 * The same reasoning rules out a streak, a completion percentage, a
 * leaderboard and a badge. Nothing here is counted across people, and the
 * only record kept is the mood check-in that was already being kept.
 *
 * WHAT THIS IS NOT. It is not therapy, triage, screening or advice. It does
 * not ask what is wrong, it does not score an answer, and it does not decide
 * that anybody is unwell - it reads the one word they already chose on the
 * mood check-in and offers small, ordinary things a person can do in ten
 * minutes. `SUPPORT_LINE` below is the part that matters most, and it is
 * shown with every set rather than saved for a worst case the app has no way
 * to detect.
 */

import { MOODS, type MoodKey } from './wellness.ts';
import type { Bilingual } from './types.ts';

/**
 * Which moods open the gentle set.
 *
 * `steady` and `bright` do not. Offering a tired person's list to somebody
 * who said they feel fine reads as the app deciding it knows better, and the
 * check-in is the only signal here - there is no inference on top of it.
 */
export const GENTLE_MOODS: MoodKey[] = ['drained', 'tense'];

export const needsGentle = (mood: MoodKey): boolean => GENTLE_MOODS.includes(mood);

/**
 * What a step asks of the person doing it.
 *
 * `outside` matters because the recharge suggestion below only makes sense
 * for steps that involve going somewhere, and a drained person should not be
 * told to walk anywhere as the first thing they read.
 */
export interface GentleStep {
  key: string;
  /** Two or three words. Read on a day when reading is hard. */
  title: Bilingual;
  /** One sentence, plain, no instruction to feel anything. */
  detail: Bilingual;
  /** Roughly how long, in minutes. Small on purpose; nothing here is a project. */
  minutes: number;
  /** True if it means leaving the room. */
  outside: boolean;
}

/**
 * The steps, per mood.
 *
 * Ordered smallest first, deliberately: the first line somebody reads should
 * be one they can already do. Every one of them is something a person can
 * finish alone, indoors if they need to, with no equipment and nobody
 * watching - which rules out most of what a wellness feature usually
 * suggests.
 */
const STEPS: Record<MoodKey, GentleStep[]> = {
  drained: [
    {
      key: 'sit',
      title: { en: 'Sit down somewhere', th: 'หาที่นั่งลง' },
      detail: {
        en: 'Anywhere out of the sun. Nothing else has to happen for the next few minutes.',
        th: 'ที่ไหนก็ได้ที่พ้นแดด อีกไม่กี่นาทีข้างหน้าไม่ต้องมีอะไรเกิดขึ้น',
      },
      minutes: 5,
      outside: false,
    },
    {
      key: 'water',
      title: { en: 'Drink some water', th: 'ดื่มน้ำ' },
      detail: {
        en: 'Heat and a long day do most of what people blame on themselves.',
        th: 'อากาศร้อนกับวันที่ยาว ทำให้เหนื่อยได้มากกว่าที่หลายคนคิด',
      },
      minutes: 2,
      outside: false,
    },
    {
      key: 'one-good-thing',
      title: { en: 'Write one good thing', th: 'เขียนเรื่องดีหนึ่งอย่าง' },
      detail: {
        en: 'One line about today. It does not have to be a big one, and nobody sees it.',
        th: 'หนึ่งบรรทัดเกี่ยวกับวันนี้ ไม่ต้องเป็นเรื่องใหญ่ และไม่มีใครเห็น',
      },
      minutes: 3,
      outside: false,
    },
    {
      key: 'short-walk',
      title: { en: 'Walk to the end of the road', th: 'เดินไปสุดถนน' },
      detail: {
        en: 'There and back. Not for the steps, and it does not count towards anything.',
        th: 'ไปแล้วกลับ ไม่ใช่เพื่อนับก้าว และไม่ถูกนับรวมกับอะไรทั้งนั้น',
      },
      minutes: 10,
      outside: true,
    },
  ],
  tense: [
    {
      key: 'breathe',
      title: { en: 'Breathe out slowly, six times', th: 'หายใจออกช้าๆ หกครั้ง' },
      detail: {
        en: 'Longer out than in. That is the whole instruction.',
        th: 'ให้หายใจออกยาวกว่าหายใจเข้า เท่านี้ทั้งหมด',
      },
      minutes: 2,
      outside: false,
    },
    {
      key: 'put-it-down',
      title: { en: 'Put the phone down', th: 'วางโทรศัพท์' },
      detail: {
        en: 'Face down, out of reach, for as long as you can stand. This app included.',
        th: 'คว่ำหน้าจอ วางให้พ้นมือ นานเท่าที่ไหว รวมถึงแอปนี้ด้วย',
      },
      minutes: 15,
      outside: false,
    },
    {
      key: 'listen',
      title: { en: 'Listen to what is around you', th: 'ฟังเสียงรอบตัว' },
      detail: {
        en: 'Name three sounds without doing anything about them.',
        th: 'บอกชื่อเสียงที่ได้ยินสามอย่าง โดยไม่ต้องทำอะไรกับมัน',
      },
      minutes: 5,
      outside: false,
    },
    {
      key: 'green-space',
      title: { en: 'Go where it is quieter', th: 'ไปที่ที่เงียบกว่านี้' },
      detail: {
        en: 'Somewhere with trees and fewer people. The app can name the nearest one it has actually measured.',
        th: 'ที่ที่มีต้นไม้และคนน้อยกว่า แอปบอกที่ใกล้ที่สุดที่วัดค่าจริงไว้ได้',
      },
      minutes: 20,
      outside: true,
    },
  ],
  steady: [],
  bright: [],
};

/** The steps for a mood. Empty for the two moods that do not open the set. */
export const gentleStepsFor = (mood: MoodKey): GentleStep[] => STEPS[mood];

/** What the check-in already said this mood asks of the day. Reused, never re-worded. */
export const gentleAsks = (mood: MoodKey): Bilingual => MOODS[mood].asks;

/**
 * The line that goes under every set.
 *
 * Shown always, not held back for a state the app thinks is bad enough. This
 * product cannot tell how anybody is doing from four words on a check-in, and
 * a support line that only appears once software has decided you qualify is a
 * support line most people never see.
 *
 * 1323 is the Department of Mental Health's line, free and around the clock.
 * It is stated as what it is, without a claim about waiting times this
 * project has not measured.
 */
export const SUPPORT_LINE = {
  dial: '1323',
  name: {
    en: 'Department of Mental Health helpline',
    th: 'สายด่วนสุขภาพจิต กรมสุขภาพจิต',
  },
  note: {
    en: 'Free, any hour. You do not have to be in a crisis to call it.',
    th: 'โทรฟรี ตลอด 24 ชั่วโมง ไม่ต้องรอให้เรื่องหนักถึงโทรได้',
  },
  /** Where the number came from, and when it was last read. Same discipline as emergency.ts. */
  source: 'https://dmh.go.th',
  checkedOn: '2026-09-13',
} as const;

/**
 * The place to suggest for a step that means going somewhere.
 *
 * Chosen from places the app has ALREADY measured, on the two figures it
 * actually holds - how crowded it is now and what the air is - and it returns
 * null rather than a second-best when nothing measured qualifies. A wellness
 * feature that invents a calm place is sending somebody who is struggling to
 * a car park on the strength of a guess.
 *
 * `layer` is preferred but not required: Green and Wellness are the two
 * habitats whose places are open ground, and a quiet beach is still better
 * than nothing when neither is near.
 */
export interface RechargeCandidate {
  id: string;
  name: Bilingual;
  layer: string;
  /** People seen in the last hour, from the crowd count. Lower is better here. */
  crowd: number;
  /** AQI at the place. Lower is better; over 50 disqualifies. */
  aqi: number | null;
  /** Metres from the traveller, when the phone said where it is. */
  metresAway: number | null;
}

/** Air at or over this stops a place being somewhere to go and breathe. */
export const RECHARGE_MAX_AQI = 50;

/**
 * The quietest measured place with air worth breathing, nearest first among
 * equals. Null when nothing measured qualifies, which is a real answer.
 */
export function rechargeFrom(candidates: RechargeCandidate[]): RechargeCandidate | null {
  const usable = candidates.filter((c) => c.aqi !== null && c.aqi < RECHARGE_MAX_AQI);
  if (usable.length === 0) return null;
  const open = usable.filter((c) => c.layer === 'Green' || c.layer === 'Wellness');
  const pool = open.length > 0 ? open : usable;
  return [...pool].sort(
    (a, b) =>
      a.crowd - b.crowd
      || (a.metresAway ?? Number.MAX_SAFE_INTEGER) - (b.metresAway ?? Number.MAX_SAFE_INTEGER)
      || a.id.localeCompare(b.id),
  )[0]!;
}
