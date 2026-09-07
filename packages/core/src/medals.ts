/**
 * Medals, for going to places.
 *
 * A medal is earned by CHECK-INS - the geofenced kind, inside a place's
 * 250 m fence with the second signal under it (docs/30). Self-issued stamps
 * (docs/29) are recorded, not scored, and they score nothing here either: a
 * medal a traveller could award themselves is a sticker.
 *
 * The rules are data. Every medal names the places it wants, or how many, or
 * which area it wants walked in full, and `medalsFor` is the only arithmetic
 * in the system - so a medal can be added by adding a row, and no screen
 * ever computes progress for itself. Progress is honest: "2 of 3" is two of
 * the three named places, and a medal's date is the check-in that finished
 * it. Nothing here is invented.
 */

import { areaOfProvince, type AreaKey } from './areas.ts';
import type { Bilingual } from './types.ts';
import type { ExploredPlace } from './visits.ts';

/** Which drawing the phone puts on the medal. Named for the thing, not the icon library. */
export type MedalMark = 'footprints' | 'compass' | 'waves' | 'trees' | 'palm' | 'campus' | 'route';

export type MedalRule =
  /** Every place named. */
  | { kind: 'places'; placeIds: readonly string[] }
  /** Any this-many different places. */
  | { kind: 'count'; places: number }
  /** Every place in the area, whatever the seed says that is. */
  | { kind: 'area'; area: AreaKey }
  /** A check-in in this many different areas. */
  | { kind: 'areas'; count: number };

export interface Medal {
  key: string;
  name: Bilingual;
  /** What to do, in one line - the condition, said to the traveller. */
  how: Bilingual;
  mark: MedalMark;
  rule: MedalRule;
}

/**
 * The catalogue. Real places by their seed ids; a typo here is caught by the
 * test that checks every named place exists.
 */
export const MEDALS: readonly Medal[] = [
  {
    key: 'first-steps',
    name: { en: 'First steps', th: 'ก้าวแรก' },
    how: { en: 'Check in at any one place.', th: 'เช็กอินที่ไหนก็ได้ 1 แห่ง' },
    mark: 'footprints',
    rule: { kind: 'count', places: 1 },
  },
  {
    key: 'explorer',
    name: { en: 'Explorer', th: 'นักสำรวจ' },
    how: { en: 'Check in at three different places.', th: 'เช็กอิน 3 แห่งที่ต่างกัน' },
    mark: 'compass',
    rule: { kind: 'count', places: 3 },
  },
  {
    key: 'samui-coast',
    name: { en: 'Samui coast', th: 'ชายฝั่งสมุย' },
    how: { en: 'Chaweng Beach, Lamai Beach and Fisherman’s Village.', th: 'หาดเฉวง หาดละไม และหมู่บ้านชาวประมง' },
    mark: 'waves',
    rule: { kind: 'places', placeIds: ['chaweng', 'lamai', 'fisherman'] },
  },
  {
    key: 'forest-and-water',
    name: { en: 'Forest and water', th: 'ป่าและสายน้ำ' },
    how: { en: 'Na Muang Waterfall and Thong Krut Mangrove.', th: 'น้ำตกหน้าเมืองและป่าชายเลนท้องกรูด' },
    mark: 'trees',
    rule: { kind: 'places', placeIds: ['namuang', 'mangrove'] },
  },
  {
    key: 'all-of-samui',
    name: { en: 'All of Samui', th: 'ทั่วเกาะ' },
    how: { en: 'Every place on Koh Samui.', th: 'ทุกสถานที่บนเกาะสมุย' },
    mark: 'palm',
    rule: { kind: 'area', area: 'samui' },
  },
  {
    key: 'all-of-campus',
    name: { en: 'All of the campus', th: 'ทั่วแคมปัส' },
    how: { en: 'Every place at KU Sriracha.', th: 'ทุกสถานที่ใน มก. ศรีราชา' },
    mark: 'campus',
    rule: { kind: 'area', area: 'ku-sriracha' },
  },
  {
    key: 'hopper',
    name: { en: 'Hopper', th: 'ข้ามพื้นที่' },
    how: { en: 'Check in on the island and at the campus.', th: 'เช็กอินทั้งบนเกาะและที่แคมปัส' },
    mark: 'route',
    rule: { kind: 'areas', count: 2 },
  },
];

/** What progress counts in - places for most medals, areas for the hopper. */
export type MedalUnit = 'places' | 'areas';

export interface MedalState {
  key: string;
  name: Bilingual;
  how: Bilingual;
  mark: MedalMark;
  earned: boolean;
  /** The check-in that finished it. Null until then. */
  earnedAt: string | null;
  progress: { done: number; total: number; unit: MedalUnit };
}

/** The basis, stated on the screen rather than assumed. */
export const MEDALS_BASIS: Bilingual = {
  en: 'Earned by checking in inside a place’s 250 m fence. Self-issued stamps do not count.',
  th: 'ได้จากการเช็กอินในรั้ว 250 ม. ของสถานที่ แสตมป์ที่บันทึกเองไม่นับ',
};

/** As much of a place as a rule needs: which one, and where. */
export interface MedalPlace {
  id: string;
  province: string;
}

interface Outcome {
  done: number;
  total: number;
  earnedAt: string | null;
}

/**
 * Every medal, with where the traveller stands on each.
 *
 * `explored` is what `/explored` says - each place once, with how it was
 * reached. Only `checkin` counts; a stamp is not a visit anyone checked.
 */
export function medalsFor(
  explored: readonly ExploredPlace[],
  places: readonly MedalPlace[],
): MedalState[] {
  const known = new Map(places.map((p) => [p.id, p]));
  const visits = explored
    .filter((e) => e.how === 'checkin' && known.has(e.placeId))
    .sort((a, b) => a.firstAt.localeCompare(b.firstAt));
  const at = new Map(visits.map((v) => [v.placeId, v.firstAt]));

  return MEDALS.map((m) => {
    const o = resolve(m.rule, visits, at, known);
    return {
      key: m.key,
      name: m.name,
      how: m.how,
      mark: m.mark,
      earned: o.earnedAt !== null,
      earnedAt: o.earnedAt,
      progress: { done: o.done, total: o.total, unit: m.rule.kind === 'areas' ? 'areas' : 'places' },
    };
  });
}

function resolve(
  rule: MedalRule,
  visits: readonly ExploredPlace[],
  at: ReadonlyMap<string, string>,
  known: ReadonlyMap<string, MedalPlace>,
): Outcome {
  switch (rule.kind) {
    case 'count': {
      const done = Math.min(visits.length, rule.places);
      // Earliest first, so the date is the visit that made the number.
      return { done, total: rule.places, earnedAt: visits.length >= rule.places ? visits[rule.places - 1]!.firstAt : null };
    }
    case 'places':
      return ofPlaces(rule.placeIds, at);
    case 'area':
      return ofPlaces([...known.values()].filter((p) => areaOfProvince(p.province) === rule.area).map((p) => p.id), at);
    case 'areas': {
      const firstIn = new Map<AreaKey, string>();
      for (const v of visits) {
        const area = areaOfProvince(known.get(v.placeId)!.province);
        if (!firstIn.has(area)) firstIn.set(area, v.firstAt);
      }
      const dates = [...firstIn.values()].sort();
      const done = Math.min(dates.length, rule.count);
      return { done, total: rule.count, earnedAt: dates.length >= rule.count ? dates[rule.count - 1]! : null };
    }
  }
}

/** Named places: how many have a check-in, and the last of those check-ins. */
function ofPlaces(ids: readonly string[], at: ReadonlyMap<string, string>): Outcome {
  const dates = ids.flatMap((id) => (at.has(id) ? [at.get(id)!] : [])).sort();
  const total = ids.length;
  const done = dates.length;
  return { done, total, earnedAt: total > 0 && done === total ? dates[total - 1]! : null };
}

export function medalSummary(medals: readonly MedalState[]): { earned: number; total: number } {
  return { earned: medals.filter((m) => m.earned).length, total: medals.length };
}

/** What `/medals` answers with: every medal, the count, and the basis. */
export interface MedalsView {
  medals: MedalState[];
  earned: number;
  total: number;
  basis: Bilingual;
}

export function medalsView(explored: readonly ExploredPlace[], places: readonly MedalPlace[]): MedalsView {
  const medals = medalsFor(explored, places);
  return { medals, ...medalSummary(medals), basis: MEDALS_BASIS };
}

/**
 * What a check-in just finished: earned now, not earned before. The phone
 * compares two of the server's answers; it never computes a medal itself.
 */
export function newlyEarned(before: readonly MedalState[], after: readonly MedalState[]): MedalState[] {
  const had = new Set(before.filter((m) => m.earned).map((m) => m.key));
  return after.filter((m) => m.earned && !had.has(m.key));
}
