/**
 * Where a building is on a campus - the question the five seeded places could
 * not answer.
 *
 * RMUTT is 1,087 x 1,129 m and the seed gives it a library, a park, a food
 * court, a stadium and a fountain: one place per layer, chosen so a companion
 * can hatch on each, not chosen because somebody has to go there. A student
 * looking for the Faculty of Nursing found nothing.
 *
 * Read from OpenStreetMap inside `RMUTT_BBOX` on 26 November 2026 (181
 * features, 80 of them named). Every entry below cites the way or node it came
 * from, so any of them can be checked, and nothing here was placed by hand.
 *
 * LIKE `fair.ts`, AND FOR THE SAME REASON: this is static data bundled with the
 * app, and a building is NOT a place. None of these appear in `/places`, in an
 * area's score, or on Home's place cards. They are a directory and a set of
 * map pins. The five seeded places stay the one source for themselves - the
 * library and the food court are deliberately absent here, so nothing is
 * described in two places that can drift apart.
 *
 * WHAT THIS CANNOT DO. OpenStreetMap has no floor and no room for any of these
 * buildings, so "which floor is ST-1203 on" is unanswerable until the
 * university hands over its floor plans (docs/80, item B2). A guess at a floor
 * would be believed, and somebody would climb to the wrong one.
 *
 * WHAT WAS LEFT OUT, and why - each of these is mapped, and none of them is
 * listed:
 *
 *   - Thirteen polygons named only "faculty of engineering", which are the
 *     faculty's separate buildings carrying the faculty's name rather than
 *     their own. Listing thirteen identical rows helps nobody, so the faculty
 *     is listed once, at the polygon OpenStreetMap itself marks as its main
 *     building (way 544939291, "คณะวิศวกรรมศาสตร์ (อาคารหลัก)").
 *   - `way 544939391`, named only "faculty of arts" in English. RMUTT has both
 *     คณะศิลปศาสตร์ and คณะศิลปกรรมศาสตร์ and that name does not say which,
 *     so naming it would be a guess at which faculty a student walks to.
 *   - `way 544939386`, "Central Building", and `way 1215834195`, "Rajamangala
 *     Thanya Buri Conservation Hall": no Thai name is mapped and neither has a
 *     Thai name this side can source.
 *   - About thirty polygons named หอพักอาจารย์ and หอพักเจ้าหน้าที่ - staff
 *     housing. Identical names, and not somewhere a student is directed.
 *
 * Any of them becomes listable the moment the university confirms a name.
 */

import { areaByKey, inArea, type AreaKey } from './areas.ts';
import { SEED_PLACES } from './seed.ts';
import type { Localised, Place } from './types.ts';

/** The day the features below were read from OpenStreetMap. */
export const BUILDINGS_READ_ON = '2026-11-26';

/**
 * What the thing is, which is all this side knows about it.
 *
 * Not a layer: `Layer` is the island's five (Green, Wellness, Food, Safe,
 * Quest) and a lecture hall is none of them. Forcing a faculty into one would
 * put it in the area score, where a building nobody measured would move a
 * number somebody reads.
 */
export type BuildingKind = 'faculty' | 'office' | 'hall' | 'residence' | 'parking' | 'toilets';

export interface CampusBuilding {
  id: string;
  area: AreaKey;
  kind: BuildingKind;
  /**
   * Null where the feature really is unnamed in OpenStreetMap - every car park
   * on this campus, and every toilet. The screen says so in words; it does not
   * invent a name, the same rule `TransitStop` follows for an unnamed stop.
   */
  name: Localised | null;
  lat: number;
  lng: number;
  /** The OpenStreetMap feature, so the position can be checked against the map. */
  osm: string;
  /**
   * Extra words somebody might type for it - an abbreviation, a former name, a
   * what-is-inside. Searched, never shown.
   */
  find?: string;
}

/*
  RMUTT, read on 26 November 2026. Positions are the centre of each polygon,
  or the node itself.

  The faculties come first because they are what a timetable names. The Thai
  name is OpenStreetMap's own where it has one; where the feature is mapped in
  English alone, it is listed only when that English names exactly one RMUTT
  faculty (Nursing, Liberal Arts, Home Economics Technology, Mass Communication
  Technology) - see the header for the two it does not.
*/
const RMUTT_BUILDINGS: readonly CampusBuilding[] = [
  {
    id: 'rmutt-eng',
    area: 'rmutt', kind: 'faculty',
    name: { en: 'Faculty of Engineering (Main Building)', th: 'คณะวิศวกรรมศาสตร์ (อาคารหลัก)', zh: '工程学院（主楼）' },
    lat: 14.0368811, lng: 100.7262043, osm: 'way 544939291',
    find: 'engineering วิศวะ วิศวกรรม eng',
  },
  {
    id: 'rmutt-business',
    area: 'rmutt', kind: 'faculty',
    name: { en: 'Faculty of Business Administration', th: 'คณะบริหารธุรกิจ', zh: '商学院' },
    lat: 14.036734, lng: 100.7291772, osm: 'way 544939364',
    find: 'business บริหาร บธ',
  },
  {
    id: 'rmutt-business-inter',
    area: 'rmutt', kind: 'faculty',
    name: {
      en: 'Faculty of Business Administration (International Program)',
      th: 'คณะบริหารธุรกิจ (โปรแกรมนานาชาติ)',
      zh: '商学院（国际专业）',
    },
    lat: 14.0366431, lng: 100.7287724, osm: 'way 544939361',
    find: 'business international นานาชาติ inter',
  },
  {
    id: 'rmutt-nursing',
    area: 'rmutt', kind: 'faculty',
    name: { en: 'Faculty of Nursing', th: 'คณะพยาบาลศาสตร์', zh: '护理学院' },
    lat: 14.0363672, lng: 100.7280049, osm: 'way 544939376',
    find: 'nursing พยาบาล',
  },
  {
    id: 'rmutt-education',
    area: 'rmutt', kind: 'faculty',
    // Mapped twice under the same name; way 544939380 is the other.
    name: { en: 'Faculty of Education', th: 'คณะศึกษาศาสตร์', zh: '教育学院' },
    lat: 14.0364546, lng: 100.7273304, osm: 'way 544939378',
    find: 'education ศึกษาศาสตร์ ครู',
  },
  {
    id: 'rmutt-liberal-arts',
    area: 'rmutt', kind: 'faculty',
    name: { en: 'Faculty of Liberal Arts (Central Building)', th: 'คณะศิลปศาสตร์ (อาคารกลาง)', zh: '文学院（中心楼）' },
    lat: 14.0364196, lng: 100.7267345, osm: 'way 544939383',
    find: 'liberal arts ศิลปศาสตร์ ภาษา',
  },
  {
    id: 'rmutt-home-economics',
    area: 'rmutt', kind: 'faculty',
    name: {
      en: 'Faculty of Home Economics Technology',
      th: 'คณะเทคโนโลยีคหกรรมศาสตร์',
      zh: '家政技术学院',
    },
    lat: 14.0373588, lng: 100.728787, osm: 'way 544939412',
    find: 'home economics คหกรรม',
  },
  {
    id: 'rmutt-mass-comm',
    area: 'rmutt', kind: 'faculty',
    name: {
      en: 'Faculty of Mass Communication Technology',
      th: 'คณะเทคโนโลยีสื่อสารมวลชน',
      zh: '大众传播技术学院',
    },
    lat: 14.0395205, lng: 100.7261564, osm: 'way 636643656',
    find: 'mass communication สื่อสารมวลชน นิเทศ',
  },

  {
    id: 'rmutt-rectorate',
    area: 'rmutt', kind: 'office',
    name: { en: "Dean's Office Building", th: 'อาคารอธิการบดี', zh: '校长办公楼' },
    lat: 14.0339964, lng: 100.7294399, osm: 'way 547540112',
    find: 'rector dean อธิการ สำนักงาน',
  },
  {
    id: 'rmutt-student-development',
    area: 'rmutt', kind: 'office',
    name: { en: 'Student Development Division', th: 'กองพัฒนานักศึกษา', zh: '学生发展处' },
    lat: 14.0363144, lng: 100.7244447, osm: 'way 549289944',
    find: 'student development กองพัฒนา กิจกรรม ทุน',
  },
  {
    id: 'rmutt-auditorium',
    area: 'rmutt', kind: 'hall',
    name: { en: 'Auditorium', th: 'หอประชุม', zh: '礼堂' },
    lat: 14.0392486, lng: 100.7289942, osm: 'way 544771658',
    find: 'auditorium หอประชุม ปฐมนิเทศ รับปริญญา',
  },

  // Student residences. Mapped in English and numbered; the Thai is the number
  // in Thai words for the same building, not a name claimed for it.
  {
    id: 'rmutt-residence-1',
    area: 'rmutt', kind: 'residence',
    name: { en: 'Student residence 1', th: 'หอพักนักศึกษา 1', zh: '学生宿舍 1' },
    lat: 14.033240, lng: 100.722341, osm: 'way 547541957', find: 'dorm หอพัก หอ',
  },
  {
    id: 'rmutt-residence-2',
    area: 'rmutt', kind: 'residence',
    name: { en: 'Student residence 2', th: 'หอพักนักศึกษา 2', zh: '学生宿舍 2' },
    lat: 14.033061, lng: 100.722905, osm: 'way 547541959', find: 'dorm หอพัก หอ',
  },
  {
    id: 'rmutt-residence-3',
    area: 'rmutt', kind: 'residence',
    name: { en: 'Student residence 3', th: 'หอพักนักศึกษา 3', zh: '学生宿舍 3' },
    lat: 14.032735, lng: 100.723223, osm: 'way 547541960', find: 'dorm หอพัก หอ',
  },
  {
    id: 'rmutt-residence-4',
    area: 'rmutt', kind: 'residence',
    name: { en: 'Student residence 4', th: 'หอพักนักศึกษา 4', zh: '学生宿舍 4' },
    lat: 14.032184, lng: 100.723213, osm: 'way 547541961', find: 'dorm หอพัก หอ',
  },
  {
    id: 'rmutt-residence-5',
    area: 'rmutt', kind: 'residence',
    name: { en: 'Student residence 5', th: 'หอพักนักศึกษา 5', zh: '学生宿舍 5' },
    lat: 14.031828, lng: 100.722895, osm: 'way 547541962', find: 'dorm หอพัก หอ',
  },

  /*
    Car parks. Eight are mapped and NOT ONE carries a name, a capacity or an
    access tag, so this says where they are and nothing else. How many spaces
    are free is a question no feed answers yet (docs/80, items C1 and C2) and
    it is not estimated here: a car park reported as having room, that has
    none, costs somebody a lap of a campus a kilometre across.

    SEVEN, not the eight the query returned. `way 611029486` has its centre
    about fifteen metres east of the university's own outline, and nothing in
    OpenStreetMap says whether that polygon is the campus's car park by the
    east gate or the neighbouring property's. A test holds every entry inside
    the frame, and it caught this one. It goes back in when somebody confirms
    whose it is.
  */
  { id: 'rmutt-parking-1', area: 'rmutt', kind: 'parking', name: null, lat: 14.0390878, lng: 100.7287926, osm: 'way 544772765' },
  { id: 'rmutt-parking-2', area: 'rmutt', kind: 'parking', name: null, lat: 14.0318988, lng: 100.7269471, osm: 'way 547541955' },
  { id: 'rmutt-parking-3', area: 'rmutt', kind: 'parking', name: null, lat: 14.0333402, lng: 100.7294101, osm: 'way 549287172' },
  { id: 'rmutt-parking-4', area: 'rmutt', kind: 'parking', name: null, lat: 14.0333540, lng: 100.7304964, osm: 'way 549287174' },
  { id: 'rmutt-parking-5', area: 'rmutt', kind: 'parking', name: null, lat: 14.0351636, lng: 100.7254665, osm: 'way 598835644' },
  { id: 'rmutt-parking-6', area: 'rmutt', kind: 'parking', name: null, lat: 14.0355780, lng: 100.7258964, osm: 'way 598835645' },
  { id: 'rmutt-parking-7', area: 'rmutt', kind: 'parking', name: null, lat: 14.0365260, lng: 100.7280030, osm: 'way 598835646' },

  // Toilets, mapped as nodes and unnamed.
  { id: 'rmutt-toilets-1', area: 'rmutt', kind: 'toilets', name: null, lat: 14.0353726, lng: 100.7273896, osm: 'node 5263028900' },
  { id: 'rmutt-toilets-2', area: 'rmutt', kind: 'toilets', name: null, lat: 14.0351631, lng: 100.7273896, osm: 'node 5263028901' },
  { id: 'rmutt-toilets-3', area: 'rmutt', kind: 'toilets', name: null, lat: 14.0359918, lng: 100.7246005, osm: 'node 5306044438' },
];

export const CAMPUS_BUILDINGS: readonly CampusBuilding[] = RMUTT_BUILDINGS;

/** The buildings mapped in an area, in the order listed. */
export const buildingsIn = (area: AreaKey): CampusBuilding[] =>
  CAMPUS_BUILDINGS.filter((b) => b.area === area);

/** A building by id. Searches a list, so no prototype key can answer. */
export const buildingById = (id: string): CampusBuilding | null =>
  CAMPUS_BUILDINGS.find((b) => b.id === id) ?? null;

/** What an unnamed kind is called, for a screen that has no name to show. */
export const UNNAMED_KIND: Readonly<Record<BuildingKind, Localised>> = {
  faculty: { en: 'Faculty building', th: 'อาคารคณะ', zh: '学院楼' },
  office: { en: 'Office', th: 'สำนักงาน', zh: '办公室' },
  hall: { en: 'Hall', th: 'หอประชุม', zh: '礼堂' },
  residence: { en: 'Student residence', th: 'หอพักนักศึกษา', zh: '学生宿舍' },
  parking: { en: 'Car park with no name on the map', th: 'ลานจอดรถที่ยังไม่มีชื่อบนแผนที่', zh: '地图上尚无名称的停车场' },
  toilets: { en: 'Toilets', th: 'ห้องน้ำ', zh: '卫生间' },
};

/** The words a search looks through for one building, lower-cased. */
const haystack = (b: CampusBuilding): string => [
  b.name?.en ?? '', b.name?.th ?? '', b.name?.zh ?? '',
  UNNAMED_KIND[b.kind].en, UNNAMED_KIND[b.kind].th, UNNAMED_KIND[b.kind].zh,
  b.find ?? '',
].join(' ').toLowerCase();

/**
 * Buildings matching what somebody typed, best first.
 *
 * Every word has to match something, as the fair's lot search does: typing
 * "คณะ พยาบาล" must not return every faculty on the campus. An empty query is
 * the whole list in the order above, which is how the directory opens.
 */
export function findBuildings(area: AreaKey, query: string): CampusBuilding[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const all = buildingsIn(area);
  if (words.length === 0) return all;
  // A name beating an alias keeps "หอ" on the residences rather than on
  // whatever happens to mention them. See rankBy.
  return rankBy(all, words, (b) => (b.name?.th ?? '').toLowerCase() + ' ' + (b.name?.en ?? '').toLowerCase(), haystack);
}

/*
  THE CAMPUS'S OWN PLACES, offered by the directory beside its buildings.

  A place is still not a building - the header's rule stands, and the test
  below holds it: the library, the food court, the park, the stadium and the
  fountain are described ONCE, in the seed, where they have a score, a blurb
  and a check-in. Describing them again here would be two copies to drift.

  What that rule did NOT mean, and was read as meaning, is that the directory
  should not FIND them. A student typed "หอสมุด" into the campus's own "where
  is it" box and got nothing at all - on a campus whose library is the single
  most looked-for building on it. The directory is the place you go when you do
  not know where something is; what it holds and what it can find are two
  different questions.

  So they are searched, and offered first, and a tap opens the PLACE rather
  than dropping a pin: the place screen is the better answer and the pin is
  already on it.
*/

/** The seeded places standing on this campus. Empty for anywhere that is not one. */
export function campusPlacesIn(area: AreaKey): Place[] {
  const here = areaByKey(area);
  if (here.university !== true) return [];
  return SEED_PLACES.filter((p) => inArea(here, p));
}

/*
  WHAT PEOPLE CALL THESE PLACES, which is not always what the seed calls them.

  The library is seeded as วิทยบริการ, its own formal name and the one on the
  building. Nobody walking across campus says it: they say หอสมุด, and typing
  that into the directory found nothing while the building stood two hundred
  metres away. Buildings have `find` for exactly this; a place's name belongs
  to the seed, so its spare words live here, with the search that needs them.

  Only where the common name differs from the seeded one. A place whose name
  people actually use needs no entry.
*/
const PLACE_ALIASES: Readonly<Record<string, string>> = {
  'rmutt-library': 'หอสมุด ห้องสมุด สำนักวิทยบริการ arit library',
  'rmutt-canteen': 'โรงอาหาร ศูนย์อาหาร โรงอาหารกลาง canteen food court',
  'rmutt-stadium': 'สนามกีฬา สนามฟุตบอล ลู่วิ่ง stadium sports',
  'rmutt-park': 'สวน สวนสาธารณะ park',
  'rmutt-fountain': 'น้ำพุ fountain',
};

/** The words a search looks through for one place, lower-cased. */
const placeHaystack = (p: Place): string => [
  p.name.en, p.name.th, p.name.zh ?? '', p.short ?? '', (p.tags ?? []).join(' '),
  PLACE_ALIASES[p.id] ?? '',
].join(' ').toLowerCase();

/**
 * Places on this campus matching what somebody typed, best first.
 *
 * The same word rules as `findBuildings` - every word has to match something,
 * a name beats an alias - so "หอสมุด" and "หอ สมุด" behave the same way here as
 * they do there, and an empty query is the whole short list.
 */
export function findCampusPlaces(area: AreaKey, query: string): Place[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const all = campusPlacesIn(area);
  if (words.length === 0) return all;
  return rankBy(all, words, (p) => (p.name.th + ' ' + p.name.en).toLowerCase(), placeHaystack);
}

/**
 * Score a list against every word, drop anything a word misses, best first.
 *
 * Shared by the buildings and the places so the two halves of one search box
 * cannot rank by different rules - which is the sort of difference nobody sees
 * and everybody feels.
 */
function rankBy<T>(all: readonly T[], words: string[], nameOf: (x: T) => string, hayOf: (x: T) => string): T[] {
  const scored: { x: T; score: number; i: number }[] = [];
  all.forEach((x, i) => {
    const name = nameOf(x);
    const hay = hayOf(x);
    let total = 0;
    for (const w of words) {
      const s = name.startsWith(w) ? 100 : name.includes(w) ? 80 : hay.includes(w) ? 50 : 0;
      if (s === 0) return;
      total += s;
    }
    scored.push({ x, score: total, i });
  });
  return scored.sort((a, b) => b.score - a.score || a.i - b.i).map((s) => s.x);
}
