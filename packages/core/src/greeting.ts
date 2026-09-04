/**
 * The time of day, on the island.
 *
 * A greeting is the smallest thing on the Home screen and the easiest to get
 * quietly wrong: the traveller's phone is very often not on Bangkok time. Two
 * people looking at the same screen from the same beach — one phone still on
 * Berlin — would otherwise read "Good morning" and "Good evening".
 *
 * This is the third thing in the codebase to need island time (check-in
 * idempotency and the price forecast were the others), so it reads ISLAND_TZ
 * from the same place rather than declaring its own.
 *
 * A pure function of a Date, not a `new Date()` read inside a component, so
 * the boundaries and the midnight wrap can actually be tested.
 */

import { ISLAND_TZ } from './wallet.ts';
import type { Bilingual } from './types.ts';

/** Hour on the island, 0–23, whatever the phone's own clock says. */
export const islandHour = (at: Date): number =>
  Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: ISLAND_TZ,
      hour: '2-digit',
      hour12: false,
    }).format(at),
  ) % 24; // en-GB gives "24" for midnight in some ICU builds.

export type DayPart = 'morning' | 'afternoon' | 'evening' | 'night';

/**
 * Four parts, with the night bucket WRAPPING past midnight rather than
 * starting the day at 00:00. Somebody looking at this screen at 2am is still
 * having last night, not an early morning.
 */
export const dayPart = (at: Date): DayPart => {
  const h = islandHour(at);
  if (h >= 5 && h <= 11) return 'morning';
  if (h >= 12 && h <= 15) return 'afternoon';
  if (h >= 16 && h <= 18) return 'evening';
  return 'night';
};

/**
 * NOTE: the Thai here still needs a native reader, like the rest of the copy.
 * Time-of-day greetings are understood in Thai but are less common in speech
 * than a plain สวัสดี — a native speaker may well cut all four of these down
 * to one. The English deliberately reuses "Good evening" for two parts rather
 * than saying "Good night", which in English reads as a goodbye.
 */
const GREETINGS: Record<DayPart, Bilingual> = {
  morning: { en: 'Good morning', th: 'สวัสดีตอนเช้า' },
  afternoon: { en: 'Good afternoon', th: 'สวัสดีตอนบ่าย' },
  evening: { en: 'Good evening', th: 'สวัสดีตอนเย็น' },
  night: { en: 'Good evening', th: 'สวัสดีตอนค่ำ' }, // thai: intentional - see above
};

export const greetingFor = (at: Date): Bilingual => GREETINGS[dayPart(at)];
