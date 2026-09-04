/**
 * The live crowd, in words.
 *
 * "3 travellers checked in here in the last hour" is a fact the island
 * produced; "moderately busy" would be an opinion drawn from it. The line
 * says the number and where it came from, and at zero says zero - an
 * unvisited beach is not a "quiet" one, it is one nobody counted at.
 */

import type { Bilingual, LiveCrowd } from './types.ts';

export const CROWD_WINDOW_MINUTES = 60;

export function crowdLine(crowd: LiveCrowd): Bilingual {
  const n = crowd.checkinsLastHour;
  if (n === 0) {
    return {
      en: 'No ChivaGo traveller has checked in here in the last hour.',
      th: 'ยังไม่มีนักเดินทาง ChivaGo เช็กอินที่นี่ในชั่วโมงที่ผ่านมา',
    };
  }
  return {
    en: `${n} ChivaGo traveller${n === 1 ? '' : 's'} checked in here in the last hour.`,
    th: `นักเดินทาง ChivaGo เช็กอินที่นี่ ${n} คนในชั่วโมงที่ผ่านมา`,
  };
}

/** Where the number came from, said under it. */
export const CROWD_SOURCE: Bilingual = {
  en: 'Counted from geofenced check-ins, not estimated.',
  th: 'นับจากการเช็กอินในรัศมีจริง ไม่ใช่ประมาณการ',
};
