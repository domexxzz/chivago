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
      en: 'No ChivarGo traveller has checked in here in the last hour.',
      th: 'ยังไม่มีนักเดินทาง ChivarGo เช็กอินที่นี่ในชั่วโมงที่ผ่านมา',
      zh: '过去一小时内没有 ChivarGo 旅行者在这里签到。',
    };
  }
  return {
    en: `${n} ChivarGo traveller${n === 1 ? '' : 's'} checked in here in the last hour.`,
    th: `นักเดินทาง ChivarGo เช็กอินที่นี่ ${n} คนในชั่วโมงที่ผ่านมา`,
    zh: `过去一小时内有 ${n} 位 ChivarGo 旅行者在这里签到。`,
  };
}

/** Where the number came from, said under it. */
export const CROWD_SOURCE: Bilingual = {
  en: 'Counted from geofenced check-ins, not estimated.',
  th: 'นับจากการเช็กอินในรัศมีจริง ไม่ใช่ประมาณการ',
  zh: '依据地理围栏内的签到统计，不是估算。',
};

/**
 * The same line when the fence has been opened for this deployment.
 *
 * The count is still real - these are rows somebody's phone wrote - but the
 * word GEOFENCED is what makes the sentence worth printing, and it stops
 * being true the moment the server stops checking. Saying it anyway would be
 * the one kind of lie this product cannot tell.
 */
export const CROWD_SOURCE_UNFENCED: Bilingual = {
  en: 'Counted from check-ins. This server is NOT checking where anyone is.',
  th: 'นับจากการเช็กอิน แต่เซิร์ฟเวอร์นี้ไม่ได้ตรวจว่าใครอยู่ที่ไหน',
  zh: '依据签到统计。本服务器不会核查任何人身在何处。',
};

/** Which of the two to print, given how the server is configured. */
export const crowdSource = (fenceOff: boolean): Bilingual =>
  (fenceOff ? CROWD_SOURCE_UNFENCED : CROWD_SOURCE);
