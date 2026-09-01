/**
 * Emergency numbers for Koh Samui.
 *
 * The most consequential data in this application. A wrong number here does
 * not degrade an experience - it delays an ambulance. Three rules follow, and
 * none are negotiable:
 *
 *  1. EVERY entry carries the URL it came from and the date it was read.
 *     Emergency numbers change, and a number nobody can trace is a number
 *     nobody can re-check.
 *  2. NOTHING here was recalled from memory. Every local number was read from
 *     the Koh Samui City Municipality's own emergency page on the date below.
 *  3. A source being official is not the same as a source being right. That
 *     municipality page lists "สายด่วนตำรวจท่องเที่ยว 1699", which is wrong:
 *     the Tourist Police line is 1155, and 1699 is the number people already
 *     misdial when they mean 1669. It is deliberately absent, and
 *     `nearMissOf` below exists so it cannot be added back by accident.
 */

import type { Bilingual } from './types.ts';

/** When every number below was last read from its source. */
export const EMERGENCY_AS_OF = '2026-09-01';

export const SOURCES = {
  municipality: 'https://kohsamuicity.go.th/tel_emergency',
  touristPolice: 'https://www.facebook.com/1155TPB/',
} as const;

/** National lines answer anywhere in Thailand; island ones are on Samui. */
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
export const SAMUI_EMERGENCY: EmergencyNumber[] = [
  {
    key: 'ems',
    name: { en: 'Medical emergency', th: 'สายด่วนศูนย์แพทย์ฉุกเฉิน' },
    dial: '1669',
    printed: '1669',
    scope: 'national',
    at: null,
    sourceUrl: SOURCES.municipality,
  },
  {
    key: 'police',
    name: { en: 'Police', th: 'สายด่วนแจ้งเหตุด่วนเหตุร้าย' },
    dial: '191',
    printed: '191',
    scope: 'national',
    at: null,
    sourceUrl: SOURCES.municipality,
  },
  {
    key: 'fire',
    name: { en: 'Fire and disaster', th: 'สายด่วนแจ้งเหตุเพลิงไหม้/สาธารณภัย' },
    dial: '199',
    printed: '199',
    scope: 'national',
    at: null,
    sourceUrl: SOURCES.municipality,
  },
  {
    // NOT from the municipality page, which prints 1699 under this label and
    // is wrong. Sourced from the Tourist Police Bureau's own channel.
    key: 'tourist-police',
    name: { en: 'Tourist Police', th: 'สายด่วนตำรวจท่องเที่ยว' },
    dial: '1155',
    printed: '1155',
    scope: 'national',
    at: null,
    sourceUrl: SOURCES.touristPolice,
  },
  {
    key: 'samui-hospital',
    name: { en: 'Koh Samui Hospital', th: 'โรงพยาบาลเกาะสมุย' },
    dial: '077913200',
    printed: '0-7791-3200',
    scope: 'island',
    at: { lat: 9.5121, lng: 100.0608 },
    sourceUrl: SOURCES.municipality,
  },
  {
    key: 'samui-police-station',
    name: { en: 'Koh Samui Police Station', th: 'สถานีตำรวจภูธรเกาะสมุย' },
    dial: '077420506',
    printed: '0-7742-0506',
    scope: 'island',
    at: { lat: 9.5333, lng: 99.9333 },
    sourceUrl: SOURCES.municipality,
  },
  {
    key: 'bophut-police-station',
    name: { en: 'Bophut Police Station', th: 'สถานีตำรวจบ่อผุด' },
    dial: '077414567',
    printed: '0-7741-4567',
    scope: 'island',
    at: { lat: 9.5573, lng: 100.0596 },
    sourceUrl: SOURCES.municipality,
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
  const national = SAMUI_EMERGENCY
    .filter((e) => e.scope === 'national')
    .map((e) => ({ ...e, km: null }));
  const island = SAMUI_EMERGENCY
    .filter((e) => e.scope === 'island')
    .map((e) => ({
      ...e,
      km: position && e.at ? Math.round(kmBetween(position, e.at) * 10) / 10 : null,
    }))
    .sort((a, b) => (a.km ?? Infinity) - (b.km ?? Infinity));
  return [...national, ...island];
}
