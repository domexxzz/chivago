/**
 * Emergency numbers for Koh Sichang.
 *
 * The most consequential data in this application. A wrong number here does
 * not degrade an experience - it delays an ambulance. Three rules follow, and
 * none are negotiable:
 *
 *  1. EVERY entry carries the URL it came from and the date it was read.
 *     Emergency numbers change, and a number nobody can trace is a number
 *     nobody can re-check.
 *  2. NOTHING here was recalled from memory. Local numbers come from the
 *     hospital and police station's own sites; national lines come from the
 *     Thai government's public emergency-number directory.
 *  3. A source being official is not enough on its own. `nearMissOf` below
 *     protects the four national lines from a transposition or typo.
 */

import type { Bilingual } from './types.ts';

/** When every number below was last read from its source. */
export const EMERGENCY_AS_OF = '2026-11-13';

export const SOURCES = {
  national: 'https://info.go.th/emergency-number',
  touristPolice: 'https://www.touristpolice.go.th/',
  hospital: 'https://kschospital.go.th/',
  policeStation: 'https://kosichang.chonburi.police.go.th/contact/',
} as const;

/** National lines answer anywhere in Thailand; island ones are on Koh Sichang. */
export type EmergencyScope = 'national' | 'island';

export interface EmergencyNumber {
  key: string;
  name: Bilingual;
  /** Digits only, as dialled. `tel:` takes this. */
  dial: string;
  /** As printed by the source, so a reader can match it against the page. */
  printed: string;
  scope: EmergencyScope;
  /** Where it is, when it has a location. Null for a national hotline. */
  at: { lat: number; lng: number } | null;
  sourceUrl: string;
}

/**
 * The numbers.
 *
 * National lines lead because they answer anywhere and are what somebody in
 * trouble should reach for first. The island entries exist so the app can
 * name and dial the nearest actual station rather than leaving somebody to
 * search for one.
 */
export const KOH_SICHANG_EMERGENCY: EmergencyNumber[] = [
  {
    key: 'ems',
    name: { en: 'Medical emergency', th: 'สายด่วนศูนย์แพทย์ฉุกเฉิน', zh: '医疗急救' },
    dial: '1669',
    printed: '1669',
    scope: 'national',
    at: null,
    sourceUrl: SOURCES.national,
  },
  {
    key: 'police',
    name: { en: 'Police', th: 'สายด่วนแจ้งเหตุด่วนเหตุร้าย', zh: '警察' },
    dial: '191',
    printed: '191',
    scope: 'national',
    at: null,
    sourceUrl: SOURCES.national,
  },
  {
    key: 'fire',
    name: { en: 'Fire and disaster', th: 'สายด่วนแจ้งเหตุเพลิงไหม้/สาธารณภัย', zh: '火灾与灾害' },
    dial: '199',
    printed: '199',
    scope: 'national',
    at: null,
    sourceUrl: SOURCES.national,
  },
  {
    key: 'tourist-police',
    name: { en: 'Tourist Police', th: 'สายด่วนตำรวจท่องเที่ยว', zh: '旅游警察' },
    dial: '1155',
    printed: '1155',
    scope: 'national',
    at: null,
    sourceUrl: SOURCES.touristPolice,
  },
  {
    key: 'koh-sichang-hospital-er',
    name: { en: 'Koh Sichang Hospital emergency room', th: 'ห้องฉุกเฉิน โรงพยาบาลเกาะสีชัง', zh: '锡昌岛医院急诊室' },
    dial: '0887504872',
    printed: '088-7504872',
    scope: 'island',
    at: { lat: 13.1631992, lng: 100.8076481 },
    sourceUrl: SOURCES.hospital,
  },
  {
    key: 'koh-sichang-police-station',
    name: { en: 'Koh Sichang Police Station', th: 'สถานีตำรวจภูธรเกาะสีชัง', zh: '锡昌岛警察局' },
    dial: '038216218',
    printed: '0 3821 6218',
    scope: 'island',
    // The official contact page publishes an address but no coordinates. Do
    // not invent a map point merely to display a distance.
    at: null,
    sourceUrl: SOURCES.policeStation,
  },
];

/**
 * Numbers that are one slip away from an emergency line.
 *
 * 1699 differs from 1669 by one transposed pair, and NIEM - who run 1669 -
 * have had to publish warnings about people dialling it. A directory that
 * printed 1699 would be handing somebody the misdial at the moment they can
 * least afford it, which is why this is enforced rather than remembered.
 */
export const PROTECTED_LINES = ['1669', '191', '199', '1155'] as const;

/** The protected line `dial` is a near miss of, or null when it is safe. */
export function nearMissOf(dial: string): string | null {
  const digits = dial.replace(/\D/g, '');
  // A real line is never a misdial, even of another real line: 191 and 199
  // are one digit apart and both send help. Membership has to be settled
  // before any comparison, or the guard rejects the directory it protects.
  if ((PROTECTED_LINES as readonly string[]).includes(digits)) return null;

  for (const line of PROTECTED_LINES) {
    if (digits.length !== line.length) continue;
    let diff = 0;
    for (let i = 0; i < line.length; i += 1) if (digits[i] !== line[i]) diff += 1;
    // One substituted digit, or one adjacent pair swapped.
    if (diff === 1) return line;
    if (diff === 2) {
      for (let i = 0; i < line.length - 1; i += 1) {
        const swapped = line.slice(0, i) + line[i + 1] + line[i] + line.slice(i + 2);
        if (swapped === digits) return line;
      }
    }
  }
  return null;
}

const R = 6371;
const toRad = (d: number) => (d * Math.PI) / 180;

/** Kilometres between two points. */
export function kmBetween(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * The numbers to show, nearest station first.
 *
 * National lines never move and always lead: whatever is nearest, 1669 is
 * still what sends an ambulance. Island entries are then ordered by distance,
 * so the station named is the one that can actually come.
 */
export function emergencyNear(
  position: { lat: number; lng: number } | null,
): (EmergencyNumber & { km: number | null })[] {
  const national = KOH_SICHANG_EMERGENCY
    .filter((e) => e.scope === 'national')
    .map((e) => ({ ...e, km: null }));
  const island = KOH_SICHANG_EMERGENCY
    .filter((e) => e.scope === 'island')
    .map((e) => ({
      ...e,
      km: position && e.at ? Math.round(kmBetween(position, e.at) * 10) / 10 : null,
    }))
    .sort((a, b) => (a.km ?? Infinity) - (b.km ?? Infinity));
  return [...national, ...island];
}
