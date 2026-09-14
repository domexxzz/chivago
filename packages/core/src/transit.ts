/**
 * Getting to the campus, and around it.
 *
 * The plan's first phase asks for "the shuttle route". Two things were true
 * when it was looked for on 2026-09-15, and the difference between them is
 * the whole design of this file:
 *
 *   - A PUBLIC service really does serve the campus, and is mapped. Route 538
 *     (1-24E), operated by smart bus, has its terminus at RMUTT Thanyaburi,
 *     and four stops stand at the campus edge. That is checkable, so it is
 *     here.
 *   - The UNIVERSITY'S OWN shuttle is published nowhere. Not in OpenStreetMap,
 *     not in any feed this app can read. So there is no campus route in the
 *     seed, and `campusRoutesIn` returns an empty list, and the screen says
 *     so in words.
 *
 * An empty list is the honest answer and a drawn line would not be. A route
 * invented from the shape of the roads would be believed - somebody would
 * stand at a stop that is not a stop - and the first thing the app would have
 * taught its users is that it makes things up.
 *
 * AND NOBODY PUBLISHES A TIMETABLE. Not the university, and not the operator
 * in any form this app can fetch. Rather than leave the useful question
 * unanswered, this measures what it cannot be told: riders report that they
 * saw one, and the app says how long ago and how far apart the reports have
 * been. That is an OBSERVATION, never a schedule, and `sayHeadway` is careful
 * to word it as one - the same rule the rest of the app runs on (docs/29).
 */

import type { Bilingual } from './types.ts';
import { islandDateKey } from './wallet.ts';

// ---------------------------------------------------------------------------
// What a route is
// ---------------------------------------------------------------------------

/**
 * Who runs it.
 *
 * `public` is a service that exists whether or not this app does - a city bus
 * line with an operator and a route number. `campus` is the university's own,
 * which is the one the plan wants and the one nobody has published.
 */
export type RouteKind = 'public' | 'campus';

export interface TransitStop {
  id: string;
  /**
   * Null when the stop really is unnamed where it was read from.
   *
   * Three of the four at this campus are. Giving them names would be inventing
   * landmarks, so the app says "unnamed stop" and places it by its position,
   * which is the part that was actually surveyed.
   */
  name: Bilingual | null;
  lat: number;
  lng: number;
  /** The OpenStreetMap node, so the position can be checked rather than believed. */
  osm: string;
}

export interface TransitRoute {
  id: string;
  kind: RouteKind;
  /** The number on the front of the vehicle. Null for a service without one. */
  ref: string | null;
  name: Bilingual;
  /** Who runs it, as the map records it. Null when unrecorded. */
  operator: string | null;
  /** The line's own colour, where it has one. */
  colour: string | null;
  /**
   * The stops of this route THAT ARE IN THIS AREA.
   *
   * Route 538 runs thirty kilometres to a hospital in Bangkok. A student
   * asking how to get off campus needs the stop at the gate, not all ninety
   * of them, and a list that long would bury the one that matters.
   */
  stops: TransitStop[];
  /** Where this came from, named, so a reader can go and check it. */
  source: string;
  /**
   * NOBODY HAS PUBLISHED ONE.
   *
   * The field exists, and has exactly one possible value, so that the absence
   * of a timetable is a stated fact rather than a gap somebody might fill by
   * accident. The day a real one arrives, this type has to be widened on
   * purpose - which is a conversation, not a commit nobody notices.
   */
  schedule: 'unpublished';
}

/** The routes in an area that anybody can ride today. */
export const publicRoutesIn = (routes: TransitRoute[]): TransitRoute[] =>
  routes.filter((r) => r.kind === 'public');

/** The university's own. Empty until the university publishes one. */
export const campusRoutesIn = (routes: TransitRoute[]): TransitRoute[] =>
  routes.filter((r) => r.kind === 'campus');

// ---------------------------------------------------------------------------
// When is the next one
// ---------------------------------------------------------------------------

/** One rider saying they saw a vehicle of this route at this stop. */
export interface Sighting {
  routeId: string;
  stopId: string;
  at: string;
}

export interface Headway {
  /** Whole minutes since the most recent report. Null when there are none. */
  lastSeenMinAgo: number | null;
  /**
   * Median gap between today's reports, in whole minutes. Null below three
   * reports, because one gap is not a pattern and calling it one would turn
   * a coincidence into a promise.
   */
  typicalGapMin: number | null;
  /** How many reports today. Shown, so nobody reads three as a survey. */
  reports: number;
  /**
   * How many separate vehicles those reports describe.
   *
   * Lower than `reports` whenever several riders saw the same one. This is
   * the number the median is built from, and the number that decides whether
   * there is enough to state one at all.
   */
  vehicles: number;
}

/** At least this many separate vehicles before a median is worth stating. */
export const REPORTS_FOR_A_PATTERN = 3;

/**
 * Reports closer together than this are the same vehicle.
 *
 * Without this the whole measurement inverts under the thing it most wants:
 * popularity. Five riders at one stop tapping as the same bus pulls in are
 * five reports seconds apart, and the median gap between them is zero - so
 * the busier the route got, the more confidently the app would say a bus
 * comes every nought minutes.
 *
 * Four minutes is longer than a crowd takes to react and shorter than any
 * plausible headway, so it separates two buses without merging them.
 */
export const SAME_VEHICLE_MIN = 4;

const minutesBetween = (a: Date, b: Date): number =>
  Math.abs(b.getTime() - a.getTime()) / 60_000;

const median = (ns: number[]): number => {
  const s = [...ns].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
};

/**
 * What can honestly be said about the next vehicle, from reports alone.
 *
 * Today's reports only. Yesterday's service tells you nothing about whether
 * one is coming now, and a gap measured across the overnight break would be
 * eleven hours and would be nonsense.
 */
export function headwayFrom(sightings: Sighting[], now: Date = new Date()): Headway {
  const today = islandDateKey(now);
  const times = sightings
    .map((s) => new Date(s.at))
    .filter((d) => !Number.isNaN(d.getTime()) && islandDateKey(d) === today && d.getTime() <= now.getTime())
    .sort((a, b) => a.getTime() - b.getTime());

  if (times.length === 0) return { lastSeenMinAgo: null, typicalGapMin: null, reports: 0, vehicles: 0 };

  // Collapse each crowd of reports into the one vehicle it saw, then measure
  // between vehicles. See SAME_VEHICLE_MIN.
  const vehicles: Date[] = [];
  for (const t of times) {
    const prev = vehicles[vehicles.length - 1];
    if (!prev || minutesBetween(prev, t) >= SAME_VEHICLE_MIN) vehicles.push(t);
  }

  const last = times[times.length - 1]!;
  const gaps = vehicles.slice(1).map((t, i) => minutesBetween(vehicles[i]!, t));
  return {
    lastSeenMinAgo: Math.floor(minutesBetween(last, now)),
    typicalGapMin: vehicles.length >= REPORTS_FOR_A_PATTERN ? Math.round(median(gaps)) : null,
    reports: times.length,
    vehicles: vehicles.length,
  };
}

/**
 * The sentence to put on screen.
 *
 * Every branch says WHO knows it. "Riders reported" is not "the timetable
 * says", and the wording keeps that difference visible even when the number
 * is a good one - especially then, because a confident number is exactly when
 * a reader stops asking where it came from.
 */
export function sayHeadway(h: Headway): Bilingual {
  if (h.reports === 0) {
    return {
      en: 'Nobody has reported one today. Tap when you see one.',
      th: 'วันนี้ยังไม่มีใครแจ้งว่าเห็นรถ เห็นเมื่อไหร่กดแจ้งได้เลย',
    };
  }
  const ago = h.lastSeenMinAgo ?? 0;
  const seen = {
    en: ago === 0 ? 'A rider reported one just now' : `A rider reported one ${ago} min ago`,
    th: ago === 0 ? 'มีคนแจ้งว่าเพิ่งเห็นรถเมื่อกี้' : `มีคนแจ้งว่าเห็นรถเมื่อ ${ago} นาทีที่แล้ว`,
  };
  if (h.typicalGapMin === null) {
    return {
      en: `${seen.en}. Too few reports to say how often it runs.`,
      th: `${seen.th} · ยังแจ้งกันน้อยเกินกว่าจะบอกได้ว่ามาถี่แค่ไหน`,
    };
  }
  return {
    en: `${seen.en}. Reports today came about every ${h.typicalGapMin} min - that is what riders saw, not a timetable.`,
    th: `${seen.th} · วันนี้คนแจ้งห่างกันราว ${h.typicalGapMin} นาที เป็นสิ่งที่คนเห็น ไม่ใช่ตารางเดินรถ`,
  };
}

/** What the screen says where the university's own shuttle would go. */
export const NO_CAMPUS_ROUTE: Bilingual = {
  en: 'The university has not published a shuttle route yet, so there is none to show.',
  th: 'มหาวิทยาลัยยังไม่ได้เผยแพร่เส้นทางรถภายใน จึงยังไม่มีเส้นทางให้แสดง',
};
