/**
 * Courts you book before you go, and how many are free right now - the first
 * is แบดมินตัน@สินธานี, the indoor badminton venue south of RMUTT.
 *
 * ChivarGo takes no booking and moves no money. The venue's own booking site
 * does: the courts, the hours, the PromptPay payment, the double-booking
 * guarantee. This app shows how many courts its system says are free, so a
 * student can tell whether the trip is worth making before tapping through.
 *
 * Every figure here is the booking system's own count, read from its
 * `/api/court-status`. Nothing is estimated on this side, and nothing says who
 * booked what - the service answers one aggregate number and that is all this
 * can hold.
 */

import type { AreaKey } from './areas.ts';
import type { Bilingual, Provenance } from './types.ts';

/** Where a place's courts are booked. */
export interface CourtSource {
  provider: 'badminton-booking';
  /**
   * The place's area and name, as seeded (a test holds them to the seed), so a
   * screen can name the venue before - and without - the places list arriving.
   */
  area: AreaKey;
  name: Bilingual;
}

/**
 * Places whose courts are booked through a service that reports availability.
 * A static map, like PLACE_STALLS: no migration, and the seed stays the one
 * source of places.
 */
export const PLACE_COURTS: Readonly<Record<string, CourtSource>> = {
  'sinthani-badminton': {
    provider: 'badminton-booking',
    area: 'rmutt',
    name: { en: 'Badminton@Sinthani', th: 'แบดมินตัน@สินธานี', zh: '羽毛球@信他尼' },
  },
};

/** A place's court service, or null. Object.hasOwn, never a bare lookup: `constructor` is not a place. */
export function courtSourceFor(placeId: string): CourtSource | null {
  return Object.hasOwn(PLACE_COURTS, placeId) ? PLACE_COURTS[placeId]! : null;
}

/** The places in an area whose courts report availability, in the order listed here. */
export function courtPlacesIn(area: AreaKey): { placeId: string; source: CourtSource }[] {
  return Object.entries(PLACE_COURTS)
    .filter(([, source]) => source.area === area)
    .map(([placeId, source]) => ({ placeId, source }));
}

/** One reading of a venue's floor. */
export interface CourtCount {
  /** Courts the venue has in use. */
  total: number;
  /** Free right now, as the booking system counted them. Never above `total`. */
  free: number;
  /** Open against the venue's own hours, as its system says - not worked out here. */
  openNow: boolean;
  /** When it opens next (ISO), if it is shut now and said when. */
  opensAt: string | null;
}

export interface PlaceCourts {
  provider: CourtSource['provider'] | null;
  /**
   * 'live' when the service answered within the last half minute. 'stale' when
   * it did not: the last figures it gave, a few minutes old at most and dated
   * by `observedAt`, or none at all. A build that does not read the service
   * (the static demo) answers 'stale' with no count: it is not known there.
   */
  provenance: Extract<Provenance, 'live' | 'stale'>;
  /** When the figures were read (ISO), or null when they never were. */
  observedAt: string | null;
  source: string;
  /**
   * The count, or null when none is known. Null, never a zero: "no court is
   * free" and "we could not look" are different answers, and a screen must be
   * able to tell them apart rather than show a confident nought.
   */
  count: CourtCount | null;
}

/** What the venue can offer right now, in the order someone deciding whether to go needs it. */
export type CourtState = 'free' | 'full' | 'closed';

export function courtState(c: CourtCount): CourtState {
  if (!c.openNow) return 'closed';
  return c.free > 0 ? 'free' : 'full';
}

/**
 * A link the app may ask for a court count: https, or http on this machine for
 * a booking system run locally, ending at the status route. The API builds
 * these from its own setting and checks them before asking.
 */
const COURT_STATUS_LINK = /^(?:https:\/\/[a-z0-9.-]+|http:\/\/(?:localhost|127\.0\.0\.1))(?::\d{1,5})?(?:\/[a-z0-9._~-]+)*\/api\/court-status$/;
export const isCourtStatusLink = (url: string): boolean => COURT_STATUS_LINK.test(url);

/** More courts than any one venue of this kind has. A figure above this is not a count. */
const COURTS_MAX = 64;
/** An opening more than a fortnight out is not one anybody can plan around. */
const OPENS_WITHIN_MS = 14 * 86_400_000;

/** What one court-status answer said. */
export interface CourtStatusRead {
  count: CourtCount;
  /** When the service says it read the figures, or null when it did not say usably. */
  observedAt: number | null;
}

/** A whole count within range, or null. */
function readCount(raw: unknown, max: number): number | null {
  return typeof raw === 'number' && Number.isInteger(raw) && raw >= 0 && raw <= max ? raw : null;
}

/**
 * The court count out of the booking system's `GET /api/court-status` answer,
 * or null when the body is not such an answer at all.
 *
 * Every field is checked rather than guessed at, and a reading that does not
 * add up is refused whole: `free` above `total` is not clamped, because a
 * clamped count is a figure nobody gave. Times arrive as epoch milliseconds
 * and leave as ISO instants, like every other time this API sends.
 */
export function courtsFromCourtStatus(body: unknown, now: number): CourtStatusRead | null {
  const data = (body as { data?: unknown } | null)?.data;
  if (typeof data !== 'object' || data === null) return null;
  const d = data as Record<string, unknown>;
  const courts = d.courts;
  if (typeof courts !== 'object' || courts === null) return null;
  const c = courts as Record<string, unknown>;

  const total = readCount(c.total, COURTS_MAX);
  if (total === null) return null;
  const free = readCount(c.free, total);
  if (free === null) return null;
  if (typeof d.openNow !== 'boolean') return null;

  // An opening out of range is left unsaid: the venue is shut, and when it
  // opens is not known. Better unsaid than a time nobody can rely on.
  const next = d.nextOpenAt;
  const opensAt = typeof next === 'number' && next >= now - 60_000 && next <= now + OPENS_WITHIN_MS
    ? new Date(next).toISOString()
    : null;

  // When the service read the figures. A stamp from the future, or from
  // further back than the caller would serve anyway, is not used: the caller
  // falls back to the moment it asked.
  const stamp = d.observedAt;
  const observedAt = typeof stamp === 'number' && stamp > now - OPENS_WITHIN_MS && stamp <= now + 60_000
    ? stamp
    : null;

  return { count: { total, free, openNow: d.openNow, opensAt: d.openNow ? null : opensAt }, observedAt };
}

/** The answer for a place whose courts are not booked through a service like this. */
export const NO_COURTS: PlaceCourts = {
  provider: null, provenance: 'stale', observedAt: null, source: '', count: null,
};
