/**
 * Seed content for the Koh Samui pilot.
 *
 * Lifted from the prototype's PLACES / QUESTS / OFFERS constants. The handoff
 * calls these "seed content, not schema - but realistic and worth keeping for
 * the first build so the demo stays presentable".
 *
 * TWO THINGS ARE REAL AND MUST NOT BE INVENTED AWAY:
 *  - Coordinates. Every lat/lng below is the actual location on Koh Samui, so
 *    the map, the geofences and the per-coordinate air lookup all work against
 *    real geography from day one.
 *  - The Healthy Scores. The prototype hard-codes 74/91/82/88/79 and every
 *    stakeholder has signed those off. Rather than fake them, the metrics here
 *    are calibrated so the real formula in healthy-score.ts reproduces each one
 *    within a point. See healthy-score.test.ts for the guard.
 *
 * crowdDensity and safetyIndex are the two synthetic figures: the design gives
 * a word ("High") and a phrase ("Patrolled") but no number. Both are replaced
 * by live feeds in production - see docs/02-architecture.md.
 */

import type { Offer, Place, Quest, QuestHost, AirStation } from './types.ts';
import type { TransitRoute } from './transit.ts';
import { metresBetween } from './presence.ts';

// ---------------------------------------------------------------------------
// Hosts
// ---------------------------------------------------------------------------

export const SEED_HOSTS: Record<string, QuestHost> = {
  municipality: { id: 'h-samui-muni', name: 'Samui Municipality', type: 'municipality' },
  greenFoundation: { id: 'h-samui-green', name: 'Samui Green Foundation (NGO)', type: 'ngo' },
  oceanLab: { id: 'h-ocean-lab', name: 'Ocean Lab · Hotel partner', type: 'hotel' },
  platform: { id: 'h-chivago', name: 'ChivarGo', type: 'platform' },
  community: { id: 'h-fisherman-village', name: "Fisherman's Village Traders", type: 'community' },
  // The team, as a host, on the Si Racha campus: the named reviewer on
  // stage when the campus is the venue. Its own record, so its statement
  // and its queue never mix with the platform's island quests.
  kuTeam: { id: 'h-ku-chivago', name: 'ChivarGo team · KU Sriracha', type: 'community' },
  // The same again on the Thanyaburi campus. A separate record, for the same
  // reason kuTeam is one: a host is the party vouching for the work, and two
  // campuses are two parties even when the same people staff both.
  rmuttTeam: { id: 'h-rmutt-chivago', name: 'ChivarGo team · RMUTT Thanyaburi', type: 'community' },
  // A separate review queue and statement for the Bangkhen campus.
  kuBangkhen: { id: 'h-ku-bangkhen-chivago', name: 'ChivarGo Team · KU Bangkhen', type: 'community' },
  // The team on Koh Sichang, for the field trial. Not the municipality: the
  // municipality has not agreed to vouch for anything yet, and a host is the
  // party vouching for the work.
  sichangTeam: { id: 'h-sichang-chivago', name: 'ChivarGo team · Koh Sichang', type: 'community' },
};

// ---------------------------------------------------------------------------
// Places
// ---------------------------------------------------------------------------

/**
 * Air4Thai station o61, สนามกีฬาเทศบาลแหลมฉบัง (Laem Chabang Municipal
 * Stadium), 300 m from the centre of the Si Racha campus - read from the
 * feed on 2026-09-05. The first ground station within reach of any place
 * in the app; Samui's nearest is 87 km away and can only cross-check.
 */
export const KU_STATION = {
  id: 'o61',
  name: 'Laem Chabang Municipal Stadium (PCD o61)',
  lat: 13.11923,
  lng: 100.91855,
} as const;

/**
 * Air4Thai station bkp73t, มหาวิทยาลัยเกษตรศาสตร์ - a Bangkok Metropolitan
 * Administration sensor on the Phahon Yothin roadside at the Kasetsart
 * intersection, read from the feed on 2026-10-22. 0.2 km from the
 * auditorium and 1.5 km from the far side of the campus, the 60th Park.
 *
 * ROADSIDE, AND THE NAME SAYS SO. It stands at one of the busiest junctions
 * in the north of the city, so on most days it will read worse than the air
 * under the trees in the middle of campus. That is the direction to be wrong
 * in for a wellness score, and the source line carries the word so nobody
 * reads it as a courtyard measurement.
 */
export const KU_BANGKHEN_STATION = {
  id: 'bkp73t',
  name: 'Kasetsart University intersection, roadside (BMA bkp73t)',
  lat: 13.839923,
  lng: 100.575632,
} as const;

/** A station, with how far it is from a place - to one decimal, as a sign would say it. */
const stationFor = (station: Omit<AirStation, 'distanceKm'>) => (lat: number, lng: number): AirStation => ({
  ...station,
  distanceKm: Math.round(metresBetween({ lat, lng }, station) / 100) / 10,
});
const kuStation = stationFor(KU_STATION);
const bangkhenStation = stationFor(KU_BANGKHEN_STATION);

export const SEED_PLACES: Place[] = [
  {
    id: 'chaweng',
    name: { en: 'Chaweng Beach', th: 'หาดเฉวง', zh: '查汶海滩' },
    short: 'Chaweng',
    layer: 'Safe',
    // Ko Samui is in Surat Thani.
    province: 'TH-84',
    lat: 9.5357,
    lng: 100.0617,
    meta: 'Beach · Crowded now · Air good',
    blurb: {
      en: 'Long white-sand bay. Busiest between 10:00-15:00 — the north end stays quiet and has the cleanest water reading this week.',
      th: 'อ่าวทรายขาว ช่วงสายถึงบ่ายคนเยอะ ปลายหาดฝั่งเหนือเงียบกว่า',
      zh: '绵长的白沙海湾。10:00-15:00 之间最热闹——北端依旧安静，本周的水质读数也最干净。',
    },
    tags: ['Beach', 'Walking route', 'Safe area', 'Quest here'],
    // Wikimedia Commons. Public domain, so attribution is not legally
    // required - given anyway, because a photograph nobody is credited for is
    // a photograph nobody can be asked about.
    photo: {
      url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/df/Chaweng_Beach_on_Ko_Samui.JPG/1280px-Chaweng_Beach_on_Ko_Samui.JPG',
      credit: 'Wipkinger (Wikivoyage)',
      licence: 'Public domain',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Chaweng_Beach_on_Ko_Samui.JPG',
    },
    metrics: { aqi: 42, crowdDensity: 3.0, safetyIndex: 6.77, walkability: 8.1 },
  },
  {
    id: 'namuang',
    name: { en: 'Na Muang Waterfall', th: 'น้ำตกหน้าเมือง', zh: '那蒙瀑布' },
    short: 'Na Muang',
    layer: 'Green',
    // Ko Samui is in Surat Thani.
    province: 'TH-84',
    lat: 9.4611,
    lng: 99.9908,
    meta: 'Green space · Quiet · Air excellent',
    blurb: {
      en: 'Two-tier waterfall inside protected forest. Highest Healthy Score on the island — low crowd, excellent air, 1.2 km shaded walk from the car park.',
      th: 'น้ำตกสองชั้นในเขตป่าอนุรักษ์ คะแนนสุขภาวะสูงสุดของเกาะ',
      zh: '保护林中的两级瀑布。全岛健康评分最高——人少、空气极佳，从停车场走 1.2 km 林荫路即到。',
    },
    tags: ['Green space', 'Hidden gem', 'Walking route', 'Air excellent'],
    // Wikimedia Commons. CC BY-SA 4.0 - attribution is MANDATORY and the
    // licence string must be exact; BY-SA 4.0 is not BY 4.0.
    photo: {
      url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/68/Namuang_waterfall_2.jpg/1280px-Namuang_waterfall_2.jpg',
      credit: 'Koudkeu',
      licence: 'CC BY-SA 4.0',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Namuang_waterfall_2.jpg',
    },
    metrics: { aqi: 18, crowdDensity: 0.4, safetyIndex: 8.85, walkability: 6.9 },
  },
  {
    id: 'fisherman',
    name: { en: "Fisherman's Village", th: 'หมู่บ้านชาวประมง', zh: '渔人村' },
    short: "Fisherman's",
    layer: 'Food',
    // Ko Samui is in Surat Thani.
    province: 'TH-84',
    lat: 9.5573,
    lng: 100.0596,
    meta: 'Healthy food · Local · Evening',
    blurb: {
      en: 'Bophut old town. Twelve verified merchants accept Green Points; Friday walking street from 17:00.',
      th: 'ย่านเก่าบ่อผุด ร้านค้าที่รับแต้มสีเขียว 12 ร้าน',
      zh: '波普老城。12 家已验证商家接受绿色积分；周五 17:00 起有步行街。',
    },
    tags: ['Healthy food', 'Local experience', 'Marketplace', 'Safe area'],
    // Wikimedia Commons. CC BY-SA 3.0 - a different version from Na Muang's,
    // and stored as its own string rather than rounded to "CC BY-SA".
    photo: {
      url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c0/Pier_in_Bophut_village_in_Ko_Samui.jpg/1280px-Pier_in_Bophut_village_in_Ko_Samui.jpg',
      credit: 'Ruta Badina',
      licence: 'CC BY-SA 3.0',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Pier_in_Bophut_village_in_Ko_Samui.jpg',
    },
    metrics: { aqi: 31, crowdDensity: 1.4, safetyIndex: 6.33, walkability: 9.0 },
  },
  {
    id: 'lamai',
    name: { en: 'Lamai Beach', th: 'หาดละไม', zh: '拉迈海滩' },
    short: 'Lamai',
    layer: 'Wellness',
    // Ko Samui is in Surat Thani.
    province: 'TH-84',
    lat: 9.4693,
    lng: 100.0446,
    meta: 'Wellness · South end · Quiet',
    blurb: {
      en: 'The south end of Lamai, away from the strip. Calm water, shade by mid-afternoon, and the quietest stretch of sand on this coast.',
      th: 'ปลายหาดละไมฝั่งใต้ ห่างจากย่านร้านค้า น้ำนิ่ง มีร่มเงาช่วงบ่าย และเป็นช่วงที่เงียบที่สุดของชายฝั่งนี้',
      zh: '拉迈南端，远离热闹的店铺街。水面平静，午后有荫，是这段海岸最安静的一片沙滩。',
    },
    tags: ['Wellness', 'Quiet', 'Swimming'],
    /*
      This slot used to be "Lamai Yoga Shala" - a plausible-sounding business
      with no photograph, because Commons has nothing of it and a business is
      not a landmark. The note here read: substituting a picture of Lamai Beach
      would be a photograph of somewhere else with this place's name under it.
      That was right, and it left the choice between an unphotographable name
      and a dishonest image.
      The third option was to name the place that the photograph actually
      shows. Same coast, same coordinates, same role in the app - and now the
      picture and the name agree, which is the standard the other four already
      met.
    */
    photo: {
      url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d2/Lamai_Beach.jpg/1280px-Lamai_Beach.jpg',
      credit: 'Koudkeu',
      licence: 'CC BY-SA 4.0',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Lamai_Beach.jpg',
    },
    metrics: { aqi: 24, crowdDensity: 0.5, safetyIndex: 7.39, walkability: 7.4 },
  },
  {
    id: 'mangrove',
    name: { en: 'Thong Krut Mangrove', th: 'ป่าชายเลนท้องกรูด', zh: '通卡鲁红树林' },
    short: 'Thong Krut',
    layer: 'Quest',
    // Ko Samui is in Surat Thani.
    province: 'TH-84',
    lat: 9.4179,
    lng: 99.9433,
    meta: 'Restoration site · Quest active',
    blurb: {
      en: 'Community-managed mangrove nursery on the south shore. Active planting quest most weekends.',
      th: 'แปลงเพาะกล้าป่าชายเลนโดยชุมชนทางใต้ของเกาะ',
      zh: '岛南岸由社区管理的红树林苗圃。多数周末都有正在进行的种植任务。',
    },
    tags: ['Green space', 'Quest here', 'Community'],
    // No photograph. Commons has no imagery of the Thong Krut mangrove, and
    // the nearest thing - Ang Thong Marine Park - is a different place
    // forty kilometres away.
    photo: null,
    metrics: { aqi: 20, crowdDensity: 0.3, safetyIndex: 5.13, walkability: 5.2 },
  },
  /*
    Kasetsart University, Si Racha campus - Chon Buri, TH-20.

    Five places read from OpenStreetMap on 2026-09-05 (the campus outline is
    way 1408248543; the library, the park, the viewpoint park, the sports
    centre and the shops are all mapped features with these coordinates).
    Every one carries station o61, 300 m from the campus centre: the first
    places in the app whose air is measured on the ground.

    The other metrics are the team's estimates pending a survey, exactly as
    Samui's were; `aqi` is the station's AQI on the day the seed was written
    and is overwritten live. No photograph: Commons had none of the campus,
    only faculty logos, and the team's own photographs - used with permission
    - are owed before any of these gets one.
  */
  {
    id: 'ku-library',
    name: { en: '10th Anniversary Memorial Library', th: 'หอสมุดอนุสรณ์ 10 ปี', zh: '十周年纪念图书馆' },
    short: 'Library',
    layer: 'Safe',
    province: 'TH-20',
    lat: 13.12197,
    lng: 100.91925,
    meta: 'Library · Indoor · Air measured 300 m away',
    blurb: {
      en: 'The campus library. Quiet floors and cool air; the calmest indoor stop on the map.',
      th: 'หอสมุดของวิทยาเขต ชั้นเงียบ อากาศเย็น จุดพักในร่มที่สงบที่สุดบนแผนที่',
      zh: '校园图书馆。楼层安静、空气凉爽，是地图上最平静的室内落脚点。',
    },
    tags: ['Library', 'Indoor', 'Quiet'],
    photo: {
      url: '/media/places/ku-library.jpg',
      credit: "ChivarGo team · KU Sriracha",
      licence: "Team photograph",
      sourceUrl: 'https://github.com/domexxzz/chivago/tree/main/apps/mobile/public/media/places',
    },
    metrics: { aqi: 22, crowdDensity: 1.8, safetyIndex: 6.6, walkability: 7.4 },
    airStation: kuStation(13.12197, 100.91925),
  },
  {
    id: 'ku-park',
    name: { en: 'Campus park and lake', th: 'สวนและบึงในมหาวิทยาลัย', zh: '校园公园与湖' },
    short: 'Park',
    layer: 'Green',
    province: 'TH-20',
    lat: 13.12154,
    lng: 100.91812,
    meta: 'Park · Lakeside · Shade',
    blurb: {
      en: 'The park by the campus lake, with the sports fields beside it. Shade, water, and a loop worth walking.',
      th: 'สวนริมบึงของวิทยาเขต ติดสนามกีฬา มีร่มเงา น้ำ และทางเดินวนรอบ',
      zh: '校园湖畔的公园，旁边就是运动场。有树荫、有水，还有一圈值得走的环道。',
    },
    tags: ['Green space', 'Walking route', 'Lake'],
    photo: {
      url: '/media/places/ku-park.jpg',
      credit: "ChivarGo team · KU Sriracha",
      licence: "Team photograph",
      sourceUrl: 'https://github.com/domexxzz/chivago/tree/main/apps/mobile/public/media/places',
    },
    metrics: { aqi: 22, crowdDensity: 0.6, safetyIndex: 6.0, walkability: 7.0 },
    airStation: kuStation(13.12154, 100.91812),
  },
  {
    id: 'ku-viewpoint',
    name: { en: 'Sapandao viewpoint', th: 'จุดชมวิวสะพานดาว', zh: '沙潘道观景点' },
    short: 'Sapandao',
    layer: 'Quest',
    province: 'TH-20',
    lat: 13.12189,
    lng: 100.92055,
    meta: 'Viewpoint park · Quest site',
    blurb: {
      en: 'The viewpoint park at the heart of the campus. Where the campus quests meet.',
      th: 'สวนจุดชมวิวกลางวิทยาเขต จุดนัดพบของภารกิจในแคมปัส',
      zh: '校园中心的观景公园，校园任务在这里汇合。',
    },
    tags: ['Viewpoint', 'Quest here', 'Green space'],
    photo: {
      url: '/media/places/ku-viewpoint.jpg',
      credit: "ChivarGo team · KU Sriracha",
      licence: "Team photograph",
      sourceUrl: 'https://github.com/domexxzz/chivago/tree/main/apps/mobile/public/media/places',
    },
    metrics: { aqi: 22, crowdDensity: 0.4, safetyIndex: 6.0, walkability: 6.8 },
    airStation: kuStation(13.12189, 100.92055),
  },
  {
    id: 'ku-sports',
    name: { en: 'Sports centre and fields', th: 'ศูนย์กีฬาและสนาม', zh: '体育中心与球场' },
    short: 'Sports',
    layer: 'Wellness',
    province: 'TH-20',
    lat: 13.12009,
    lng: 100.91802,
    meta: 'Sports · Three pitches · Pool in building 20',
    blurb: {
      en: 'The sports centre with three pitches beside it, and the pool in building 20 a short walk north. The place to move.',
      th: 'ศูนย์กีฬาที่มีสนามสามสนามข้างกัน และสระว่ายน้ำในอาคาร 20 เดินไปทางเหนือไม่ไกล ที่สำหรับออกกำลัง',
      zh: '体育中心旁有三片球场，往北走几步是 20 号楼里的游泳池。想动起来就来这里。',
    },
    tags: ['Exercise', 'Pitch', 'Pool'],
    photo: {
      url: '/media/places/ku-sports.jpg',
      credit: "ChivarGo team · KU Sriracha",
      licence: "Team photograph",
      sourceUrl: 'https://github.com/domexxzz/chivago/tree/main/apps/mobile/public/media/places',
    },
    metrics: { aqi: 22, crowdDensity: 1.4, safetyIndex: 6.2, walkability: 7.0 },
    airStation: kuStation(13.12009, 100.91802),
  },
  {
    id: 'ku-shops',
    name: { en: 'Shop row by building 25', th: 'แถวร้านค้าหน้าอาคาร 25', zh: '25 号楼前的商铺街' },
    short: 'Shop row',
    layer: 'Food',
    province: 'TH-20',
    lat: 13.1180,
    lng: 100.92075,
    meta: 'Cafés · Convenience store',
    blurb: {
      en: 'Two cafés and a convenience store at the south end of the campus, where the walkways meet.',
      th: 'คาเฟ่สองร้านและร้านสะดวกซื้อทางใต้ของวิทยาเขต ตรงที่ทางเดินมาบรรจบกัน',
      zh: '校园南端的两家咖啡馆和一间便利店，就在步道交会处。',
    },
    tags: ['Café', 'Convenience', 'Meeting point'],
    photo: {
      url: '/media/places/ku-shops.jpg',
      credit: "ChivarGo team · KU Sriracha",
      licence: "Team photograph",
      sourceUrl: 'https://github.com/domexxzz/chivago/tree/main/apps/mobile/public/media/places',
    },
    metrics: { aqi: 22, crowdDensity: 2.6, safetyIndex: 6.6, walkability: 7.6 },
    airStation: kuStation(13.1180, 100.92075),
  },
  {
    /*
      The hackathon venue, added on the evening of 8 September when the
      organisers moved the event here from the library.

      The coordinates are the destination of the Google Maps link in that
      announcement: 13.1234148 / 100.9183455, which puts it 188 m from the
      library, 210 m from the park and 466 m from the ground station.
      Nothing here is guessed from the building's name.

      The photograph is the team's own, sent the night the venue moved.
    */
    id: 'ku-building13',
    name: { en: 'Building 13, Physical Education', th: 'อาคาร 13 พลศึกษา', zh: '13 号楼 体育馆' },
    short: 'Building 13',
    layer: 'Wellness',
    province: 'TH-20',
    lat: 13.1234148,
    lng: 100.9183455,
    meta: 'Sports hall · By Gate 1',
    blurb: {
      en: 'The physical education hall by Gate 1, and the venue for the Sriracha Hackathon 2026 after the move from the library.',
      th: 'อาคารพลศึกษาใกล้ประตู 1 และเป็นสถานที่จัดงาน Sriracha Hackathon 2026 หลังย้ายมาจากห้องสมุด',
      zh: '1 号门旁的体育馆，活动从图书馆改到这里后，成为 Sriracha Hackathon 2026 的举办场地。',
    },
    tags: ['Indoor', 'Event venue', 'By Gate 1'],
    /*
      The entrance, photographed by the team.

      The building says its own name in the picture, in both scripts, which
      is the cheapest proof there is that the file matches the place it is
      filed under. One person stands on the steps at a distance where no
      face is legible, so the README's rule about faces holds.
    */
    photo: {
      url: '/media/places/ku-building13.jpg',
      credit: 'ChivarGo team · KU Sriracha',
      licence: 'Team photograph',
      sourceUrl: 'https://github.com/domexxzz/chivago/tree/main/apps/mobile/public/media/places',
    },
    /*
      Air is the real reading from station o61, like every other campus
      place. The other three are the pilot's CONVENTION for an indoor
      campus hall, set beside its neighbours rather than measured: nobody
      has counted heads in this building or walked its paths with a
      clipboard. The app labels a score built from these as estimated, and
      that label is doing real work here.
    */
    metrics: { aqi: 22, crowdDensity: 1.6, safetyIndex: 6.4, walkability: 7.2 },
    airStation: kuStation(13.1234148, 100.9183455),
  },

  /*
    ---------------------------------------------------------------------
    RMUTT Thanyaburi - Pathum Thani (TH-13)
    ---------------------------------------------------------------------

    The third area, and the second campus. Read from OpenStreetMap on
    2026-09-14: the grounds are way 910034983 (amenity=university) and every
    place below is a mapped feature inside that outline, named here by its
    OSM way id so the claim can be checked rather than believed.

    One place per layer, so every companion can hatch here too.

    NO GROUND STATION, AND THAT IS THE HONEST ANSWER. The nearest Air4Thai
    station to this campus is 20t, at Bangkok University's Rangsit campus,
    and it is 13.1 km away - read from the feed on 2026-09-14, and still the
    nearest of 173 stations when it was read again on 2026-10-22. Si Racha's is
    300 m, which is why its places carry theirs and say so. Thirteen
    kilometres cannot speak for a courtyard, so these places carry none, the
    ~11 km model is what there is, and the app labels it as the model.

    Which means the `aqi` below is not a reading. It is ONE figure for all
    five - they stand within 700 m of each other, and five different numbers
    would be a precision nobody measured - and it is overwritten on read.
    crowdDensity, safetyIndex and walkability are the same kind of thing:
    the pilot's convention for a campus, set by the KIND of place rather
    than by a survey. A test holds every one of them below the accent-pin
    threshold, so an estimate never earns the colour that means measured.

    No photographs. The rule is that every photograph carries a real credit
    and a licence; nobody on the team has been here with a camera yet, so
    the cards say so in words rather than borrowing somebody else's picture.
  */
  {
    // OSM way 545463029, amenity=library, named วิทยบริการ.
    id: 'rmutt-library',
    name: { en: 'Academic resources library', th: 'วิทยบริการ', zh: '学术资源图书馆' },
    short: 'Library',
    layer: 'Safe',
    province: 'TH-13',
    lat: 14.034289,
    lng: 100.7255474,
    meta: 'Library · Indoor · Air modelled, not measured',
    blurb: {
      en: 'The campus library. Indoor, quiet, and the calmest place to sit down on this map.',
      th: 'หอสมุดของวิทยาเขต ในร่ม เงียบ และเป็นจุดนั่งพักที่สงบที่สุดบนแผนที่นี้',
      zh: '校园图书馆。室内、安静，是这张地图上最平静的落座处。',
    },
    tags: ['Library', 'Indoor', 'Quiet'],
    photo: null,
    metrics: { aqi: 38, crowdDensity: 1.7, safetyIndex: 6.5, walkability: 7.0 },
  },
  {
    // OSM way 543836133, leisure=park, named สวนราชมงคล.
    id: 'rmutt-park',
    name: { en: 'Rajamangala Park', th: 'สวนราชมงคล', zh: '拉查蒙空公园' },
    short: 'Park',
    layer: 'Green',
    province: 'TH-13',
    lat: 14.0333879,
    lng: 100.7251362,
    meta: 'Park · Shade · Walking route',
    blurb: {
      en: 'The campus park, a hundred metres from the library door. Shade, paths, and somewhere to walk that is not a car park.',
      th: 'สวนของวิทยาเขต ห่างจากประตูหอสมุดร้อยเมตร มีร่มเงา ทางเดิน และที่เดินเล่นที่ไม่ใช่ลานจอดรถ',
      zh: '校园公园，离图书馆门口一百米。有树荫、有小径，还有一处不是停车场的地方可以走走。',
    },
    tags: ['Green space', 'Shade', 'Walking route'],
    photo: null,
    metrics: { aqi: 38, crowdDensity: 1.1, safetyIndex: 6.5, walkability: 7.6 },
  },
  {
    // OSM way 547540111, amenity=food_court, named โรงอาหารกลาง.
    id: 'rmutt-canteen',
    name: { en: 'Central food court', th: 'โรงอาหารกลาง', zh: '中央食堂' },
    short: 'Food court',
    layer: 'Food',
    province: 'TH-13',
    lat: 14.0355634,
    lng: 100.7243854,
    meta: 'Food court · Busiest at midday',
    blurb: {
      en: 'The central food court. The one place on campus where everybody turns up at the same hour.',
      th: 'โรงอาหารกลาง จุดเดียวในวิทยาเขตที่ทุกคนมาพร้อมกันในชั่วโมงเดียว',
      zh: '中央食堂。校园里唯一一个所有人都在同一个钟点出现的地方。',
    },
    tags: ['Food court', 'Student prices', 'Busy at noon'],
    photo: null,
    metrics: { aqi: 38, crowdDensity: 3.4, safetyIndex: 6.4, walkability: 7.2 },
  },
  {
    /*
      OSM way 545215395, leisure=stadium, and UNNAMED in OpenStreetMap.

      So the name here describes what the feature is; it is not a proper name
      claimed for it. If the campus calls it something, that name replaces
      this one - it is not ours to invent.
    */
    id: 'rmutt-stadium',
    name: { en: 'Campus stadium', th: 'สนามกีฬาในมหาวิทยาลัย', zh: '校园体育场' },
    short: 'Stadium',
    layer: 'Wellness',
    province: 'TH-13',
    lat: 14.0350303,
    lng: 100.7229052,
    meta: 'Stadium · Outdoor · West side',
    blurb: {
      en: 'The stadium on the west side of the campus, with the pitches around it.',
      th: 'สนามกีฬาฝั่งตะวันตกของวิทยาเขต มีสนามซ้อมล้อมอยู่โดยรอบ',
      zh: '校园西侧的体育场，四周环绕着训练场。',
    },
    tags: ['Sport', 'Outdoor', 'Open early'],
    photo: null,
    metrics: { aqi: 38, crowdDensity: 1.4, safetyIndex: 6.3, walkability: 6.8 },
  },
  {
    // OSM way 543836130, leisure=park, named น้ำพุราชมงคล.
    id: 'rmutt-fountain',
    name: { en: 'Rajamangala fountain', th: 'น้ำพุราชมงคล', zh: '拉查蒙空喷泉' },
    short: 'Fountain',
    layer: 'Quest',
    province: 'TH-13',
    lat: 14.0353053,
    lng: 100.729345,
    meta: 'Landmark · East side · 695 m from the stadium',
    blurb: {
      en: 'The fountain on the east side, and the far end of the longest walk between two places on this campus.',
      th: 'น้ำพุฝั่งตะวันออก และเป็นปลายทางของเส้นทางเดินที่ยาวที่สุดระหว่างสองจุดในวิทยาเขตนี้',
      zh: '东侧的喷泉，也是这座校园里两地之间最长那段步行路线的另一端。',
    },
    tags: ['Landmark', 'Open space', 'Meeting point'],
    photo: null,
    metrics: { aqi: 38, crowdDensity: 1.5, safetyIndex: 6.4, walkability: 7.4 },
  },
  /*
    แบดมินตัน@สินธานี - a private court off campus, in the same province, so
    it lists under RMUTT and sits about 2.5 km south of the campus map's frame.

    NOT A MAPPED FEATURE. The court is not in OpenStreetMap. The position is
    the one home.co.th publishes for the Synthanee Grand View estate on
    Rangsit-Nakhon Nayok Road, Khlong 5 (read 2026-10-21), which the owner
    named as where the court is. It is the estate, not the court door: replace
    it with a pin dropped on the building before check-in is promised there.
    Hours and court count are the booking system's own (its config.ts).
  */
  {
    id: 'sinthani-badminton',
    name: { en: 'Badminton@Sinthani', th: 'แบดมินตัน@สินธานี', zh: '羽毛球@信他尼' },
    short: 'Badminton',
    layer: 'Wellness',
    province: 'TH-13',
    lat: 14.0134018,
    lng: 100.7206586,
    meta: 'Badminton · Indoor · Book online · Air modelled, not measured',
    blurb: {
      en: 'Indoor badminton courts, open daily 09:00-23:00. Book a court and pay by PromptPay on the venue\'s own page before you go.',
      th: 'สนามแบดมินตันในร่ม เปิดทุกวัน 09:00-23:00 จองสนามและจ่ายผ่านพร้อมเพย์ได้ที่เว็บของสนามก่อนไป',
      zh: '室内羽毛球场，每天 09:00-23:00 开放。出发前在场馆自己的页面上订场并用 PromptPay 付款。',
    },
    tags: ['Sport', 'Badminton', 'Indoor', 'Booking'],
    // The venue's own logo, served from the venue's own booking site. NOT a
    // photograph of the courts - none has been licensed, and the coordinates
    // are still the housing estate rather than the door. It is marked
    // `kind: 'logo'` so the screen credits it as a logo and fits it whole
    // instead of cropping the venue's name off its own mark.
    photo: {
      url: 'https://badminton-booking-ihw1.onrender.com/brand/sinthani-logo.png',
      credit: 'แบดมินตัน@สินธานี',
      licence: 'Used with permission',
      sourceUrl: 'https://badminton-booking-ihw1.onrender.com/',
      kind: 'logo',
      // Sampled from the logo's own corners (#2c492a top, #31512c bottom), so
      // the frame around it is the green it already sits on.
      backdrop: '#2C492A',
    },
    metrics: { aqi: 38, crowdDensity: 2.0, safetyIndex: 6.2, walkability: 5.0 },
    bookingUrl: 'https://badminton-booking-ihw1.onrender.com/',
  },
  /*
    KU Bangkhen, Bangkok (TH-10). Each position is the centre of its named
    OpenStreetMap feature, read through Overpass on 2026-09-28. Every place
    carries Air4Thai bkp73t (KU_BANGKHEN_STATION), 0.2 to 1.5 km away, so the
    reading is measured and says how far away and that it is roadside. The
    one shared AQI below is the fallback for when the feed is down, NOT five
    measurements. The non-air metrics are campus-place estimates, not survey results. No
    photographs have been licensed or supplied, so every photo is null.
  */
  {
    // OSM way 589727993: อาคารช่วงเกษตรศิลปการ, the university library building.
    id: 'ku-bk-library',
    name: { en: 'Kasetsart University Library', th: 'สำนักหอสมุด มก. (อาคารช่วงเกษตรศิลปการ)', zh: '泰国农业大学图书馆' },
    short: 'Library', layer: 'Safe', province: 'TH-10',
    lat: 13.8476433, lng: 100.5718353,
    meta: 'Library · Indoor · Air measured 1 km away, roadside',
    blurb: {
      en: 'The university library building, a quiet indoor stop near the centre of campus.',
      th: 'อาคารสำนักหอสมุดกลางวิทยาเขต จุดพักในร่มสำหรับอ่านหนังสือ',
      zh: '大学图书馆大楼，校园中心附近一处安静的室内落脚点。',
    },
    tags: ['Library', 'Indoor', 'Quiet'], photo: null,
    metrics: { aqi: 38, crowdDensity: 1.7, safetyIndex: 6.5, walkability: 7.0 },
    airStation: bangkhenStation(13.8476433, 100.5718353),
  },
  {
    // OSM way 259496906: สวน 60 ปี มหาวิทยาลัยเกษตรศาสตร์.
    id: 'ku-bk-park',
    name: { en: 'KU 60th Anniversary Park', th: 'สวน 60 ปี มหาวิทยาลัยเกษตรศาสตร์', zh: '农业大学六十周年公园' },
    short: '60th Park', layer: 'Green', province: 'TH-10',
    lat: 13.8498175, lng: 100.5661669,
    meta: 'Campus park · Outdoor · Air measured 1.5 km away, roadside',
    blurb: {
      en: 'The mapped 60th Anniversary Park beside the sports facilities.',
      th: 'สวน 60 ปีที่มีในแผนที่ อยู่ใกล้พื้นที่กีฬา',
      zh: '地图上标注的六十周年公园，紧邻体育设施。',
    },
    tags: ['Green space', 'Walking route'], photo: null,
    metrics: { aqi: 38, crowdDensity: 1.1, safetyIndex: 6.5, walkability: 7.4 },
    airStation: bangkhenStation(13.8498175, 100.5661669),
  },
  {
    // OSM way 259685345: หอประชุมใหญ่; the Three Founders monument is nearby.
    id: 'ku-bk-auditorium',
    name: { en: 'Kasetsart Grand Auditorium', th: 'หอประชุมใหญ่ มก.', zh: '农业大学大礼堂' },
    short: 'Auditorium', layer: 'Quest', province: 'TH-10',
    lat: 13.8413167, lng: 100.5747727,
    meta: 'Auditorium · Campus landmark',
    blurb: {
      en: 'The mapped main auditorium, near the Three Founders monument.',
      th: 'หอประชุมใหญ่ที่มีในแผนที่ อยู่ใกล้อนุสาวรีย์สามบูรพาจารย์',
      zh: '地图上标注的主礼堂，靠近三位创校者纪念碑。',
    },
    tags: ['Landmark', 'Meeting point'], photo: null,
    metrics: { aqi: 38, crowdDensity: 1.5, safetyIndex: 6.4, walkability: 7.2 },
    airStation: bangkhenStation(13.8413167, 100.5747727),
  },
  {
    // OSM way 1313552698: สนามกีฬาสนามอินทรีย์จันทรสถิตย์.
    id: 'ku-bk-stadium',
    name: { en: 'Insee Chantarasatit Stadium', th: 'สนามอินทรีจันทรสถิตย์', zh: '因西·詹塔拉沙提体育场' },
    short: 'Stadium', layer: 'Wellness', province: 'TH-10',
    lat: 13.8471882, lng: 100.5657358,
    meta: 'Stadium · Outdoor · Air measured 1.3 km away, roadside',
    blurb: {
      en: 'The mapped university stadium and athletics ground.',
      th: 'สนามกีฬาและลู่วิ่งของมหาวิทยาลัยที่มีในแผนที่',
      zh: '地图上标注的大学体育场与田径场。',
    },
    tags: ['Sport', 'Outdoor'], photo: null,
    metrics: { aqi: 38, crowdDensity: 1.4, safetyIndex: 6.3, walkability: 6.8 },
    airStation: bangkhenStation(13.8471882, 100.5657358),
  },
  {
    // OSM way 389998960: โรงอาหารกลาง 1, alt_name บาร์ใหม่.
    id: 'ku-bk-canteen',
    name: { en: 'Central Canteen 1 (Bar Mai)', th: 'โรงอาหารกลาง 1 (บาร์ใหม่)', zh: '中央食堂 1（巴迈）' },
    short: 'Canteen', layer: 'Food', province: 'TH-10',
    lat: 13.8488140, lng: 100.5673153,
    meta: 'Food court · Central campus',
    blurb: {
      en: 'The mapped central food court, also called Bar Mai.',
      th: 'โรงอาหารกลางที่มีในแผนที่ หรือที่เรียกว่าบาร์ใหม่',
      zh: '地图上标注的中央食堂，也叫巴迈。',
    },
    tags: ['Food court', 'Campus'], photo: null,
    metrics: { aqi: 38, crowdDensity: 3.4, safetyIndex: 6.4, walkability: 7.2 },
    airStation: bangkhenStation(13.8488140, 100.5673153),
  },
  /*
    Koh Sichang, Chon Buri (TH-20). Each position is the centre of its
    OpenStreetMap feature, read through Overpass. The nearest Air4Thai
    station is at Laem Chabang, twelve kilometres across the water, so no
    place claims it: the air is modelled, and says so. The non-air metrics
    are the team's estimates before any survey, and no business is named:
    the food place is the shop row by the pier, not one shop that never
    agreed to be on a map.

    Five of the six features are named in OSM and wear the team's own
    photographs. The sixth, the museum, is mapped `tourism=aquarium` with no
    name at all and wears a Creative Commons photograph of its signboard;
    its entry below says how it was identified.
  */
  {
    // OSM way 40354093: ท่าเรือเกาะสีชัง (ท่าล่าง), where the Si Racha ferry lands.
    id: 'sc-pier',
    name: { en: 'Tha Lang pier', th: 'ท่าเรือเกาะสีชัง (ท่าล่าง)', zh: '塔朗码头' },
    short: 'Pier', layer: 'Quest', province: 'TH-20',
    lat: 13.161443, lng: 100.810441,
    meta: 'Ferry pier · Outdoor · Air modelled',
    blurb: {
      en: 'Where the ferry from Si Racha lands, and where nearly every day trip starts and ends.',
      th: 'ท่าเรือที่เรือจากศรีราชาเทียบ จุดเริ่มและจุดจบของการเที่ยวแบบเช้าไปเย็นกลับเกือบทุกทริป',
      zh: '从是拉差来的渡轮在此靠岸，几乎每一趟一日游都从这里开始、在这里结束。',
    },
    tags: ['Pier', 'Ferry'],
    photo: {
      url: '/media/places/sc-pier.jpg',
      credit: 'ChivarGo team · Koh Sichang',
      licence: 'Team photograph · used with permission',
      sourceUrl: 'https://github.com/domexxzz/chivago/tree/main/apps/mobile/public/media/places',
    },
    metrics: { aqi: 40, crowdDensity: 4.0, safetyIndex: 6.0, walkability: 6.0 },
  },
  {
    // OSM way 412192327: Ko Sichang Hospital.
    id: 'sc-hospital',
    name: { en: 'Ko Sichang Hospital', th: 'โรงพยาบาลเกาะสีชัง', zh: '锡昌岛医院' },
    short: 'Hospital', layer: 'Safe', province: 'TH-20',
    lat: 13.163311, lng: 100.807704,
    meta: 'Hospital · Air modelled',
    blurb: {
      en: 'The island\'s hospital, a short walk up from the pier.',
      th: 'โรงพยาบาลประจำเกาะ เดินจากท่าเรือไม่ไกล',
      zh: '岛上的医院，从码头往上走一小段就到。',
    },
    tags: ['Hospital', 'Help'],
    photo: {
      url: '/media/places/sc-hospital.jpg',
      credit: 'ChivarGo team · Koh Sichang',
      licence: 'Team photograph · used with permission',
      sourceUrl: 'https://github.com/domexxzz/chivago/tree/main/apps/mobile/public/media/places',
    },
    metrics: { aqi: 40, crowdDensity: 1.5, safetyIndex: 6.5, walkability: 6.0 },
  },
  {
    // OSM way 242270752: หาดถ้ำพัง, the island's swimming beach.
    id: 'sc-thamphang',
    name: { en: 'Tham Phang Beach', th: 'หาดถ้ำพัง', zh: '探蓬海滩' },
    short: 'Tham Phang', layer: 'Green', province: 'TH-20',
    lat: 13.1454, lng: 100.806835,
    meta: 'Beach · Outdoor · Air modelled',
    blurb: {
      en: 'The beach on the west coast, and the one the island\'s litter reaches first.',
      th: 'หาดฝั่งตะวันตกของเกาะ และเป็นที่ที่ขยะไปถึงก่อน',
      zh: '岛西岸的海滩，也是岛上垃圾最先漂到的一处。',
    },
    tags: ['Beach', 'Swimming'],
    photo: {
      url: '/media/places/sc-thamphang.jpg',
      credit: 'ChivarGo team · Koh Sichang',
      licence: 'Team photograph · used with permission',
      sourceUrl: 'https://github.com/domexxzz/chivago/tree/main/apps/mobile/public/media/places',
    },
    metrics: { aqi: 40, crowdDensity: 2.5, safetyIndex: 5.8, walkability: 5.0 },
  },
  {
    // OSM way 40443539: พระจุฑาธุชราชฐาน, the summer palace of King Rama V.
    id: 'sc-palace',
    name: { en: 'Phra Chudadhuj Palace', th: 'พระจุฑาธุชราชฐาน', zh: '朱他突王宫' },
    short: 'Palace', layer: 'Wellness', province: 'TH-20',
    lat: 13.14909, lng: 100.818436,
    meta: 'Palace grounds · Outdoor · Air modelled',
    blurb: {
      en: 'The summer palace built under King Rama V, its gardens and mansions by the sea.',
      th: 'พระราชวังฤดูร้อนที่สร้างในสมัยรัชกาลที่ 5 มีสวนและพระตำหนักริมทะเล',
      zh: '拉玛五世时期兴建的夏宫，园林与殿舍临海而立。',
    },
    tags: ['History', 'Garden', 'Walking'],
    photo: {
      url: '/media/places/sc-palace.jpg',
      credit: 'ChivarGo team · Koh Sichang',
      licence: 'Team photograph · used with permission',
      sourceUrl: 'https://github.com/domexxzz/chivago/tree/main/apps/mobile/public/media/places',
    },
    metrics: { aqi: 40, crowdDensity: 3.0, safetyIndex: 6.5, walkability: 7.0 },
  },
  {
    /*
      The building OpenStreetMap maps as an aquarium, named at last.

      This place was carried as "Chulalongkorn marine station", put here from
      local knowledge, with a blurb that admitted nobody had confirmed it at
      the door. A photograph settled it: the Commons file
      `Sea Research Center - panoramio.jpg`, geotagged 33 m from this point,
      shows the signboard - ชลทัศนสถาน - and Chulalongkorn's own site lists
      Cholatassathan as its museum of the sea and the nature of the Sichang
      islands. A marine museum is also why OSM tagged the building an
      aquarium. The uploader's file name is the one thing here that is wrong,
      and trusting it instead of the sign would have put a research station's
      name on a museum.

      The id keeps its old spelling on purpose: check-ins in the ledger point
      at it, and renaming a place must not cost somebody their visit.

      The door is still unvisited, and the blurb still says so.
    */
    id: 'sc-marinestation',
    name: { en: 'Cholatassathan Museum', th: 'พิพิธภัณฑ์ชลทัศนสถาน', zh: '乔拉塔沙坦博物馆' },
    short: 'Cholatassathan', layer: 'Green', province: 'TH-20',
    lat: 13.1521963, lng: 100.8147057,
    meta: 'Museum · Sea and island nature · Air modelled',
    blurb: {
      en: 'Chulalongkorn\'s museum of the sea and the nature of the Sichang islands. Identified from a photograph of the signboard taken 33 m from this point; nobody has confirmed it at the door yet.',
      th: 'พิพิธภัณฑ์ของจุฬาฯ ว่าด้วยท้องทะเลและธรรมชาติของหมู่เกาะสีชัง ระบุชื่อจากรูปป้ายที่ถ่ายห่างจากจุดนี้ 33 เมตร ยังไม่มีใครไปยืนยันที่หน้าอาคาร',
      zh: '朱拉隆功大学关于海洋与锡昌群岛自然的博物馆。依据在距此点 33 米处拍摄的招牌照片识别；还没有人到门口确认过。',
    },
    tags: ['Museum', 'Sea life', 'Learning'],
    photo: {
      // Served from our own origin like every other island photograph: the
      // copy is the 1280px rendering of the Commons original, and CC BY-SA
      // allows the redistribution as long as the credit travels with it,
      // which it does - the place screen prints it under the picture.
      url: '/media/places/sc-marinestation.jpg',
      credit: 'ekeidar (Panoramio)',
      licence: 'CC BY-SA 3.0',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Sea_Research_Center_-_panoramio.jpg',
    },
    metrics: { aqi: 40, crowdDensity: 1.5, safetyIndex: 6.5, walkability: 6.0 },
  },
  {
    // OSM way 412192126 and the restaurants mapped round it: the shop row
    // between the pier and the town, by its position, not by a shop's name.
    id: 'sc-shops',
    name: { en: 'Shop row by Tha Lang pier', th: 'ย่านร้านค้าหน้าท่าล่าง', zh: '塔朗码头旁的商铺街' },
    short: 'Shop row', layer: 'Food', province: 'TH-20',
    lat: 13.160059, lng: 100.809817,
    meta: 'Shops and food · Air modelled',
    blurb: {
      en: 'The shops and eating places on the road up from the pier.',
      th: 'ร้านค้าและร้านอาหารริมถนนขึ้นจากท่าเรือ',
      zh: '从码头往上那条路上的店铺和餐馆。',
    },
    tags: ['Food', 'Shops'],
    photo: {
      url: '/media/places/sc-shops.jpg',
      credit: 'ChivarGo team · Koh Sichang',
      licence: 'Team photograph · used with permission',
      sourceUrl: 'https://github.com/domexxzz/chivago/tree/main/apps/mobile/public/media/places',
    },
    metrics: { aqi: 40, crowdDensity: 3.5, safetyIndex: 6.0, walkability: 6.5 },
  },
];

/**
 * Public transport that really serves an area.
 *
 * ONE ROUTE, AND THAT IS THE WHOLE LIST. Read from OpenStreetMap on
 * 2026-09-15: relations 14144070 and 14144071 are the two directions of route
 * 538 (1-24E), operated by smart bus, whose terminus is the Thanyaburi
 * campus. The four stops are the mapped `highway=bus_stop` nodes at the
 * campus edge, three of which are unnamed in OpenStreetMap and are left
 * unnamed here.
 *
 * The far end of route 538 is a hospital thirty kilometres away in Bangkok.
 * Those stops are real too and are not here: a student asking how to leave
 * campus needs the stop at the gate, and ninety of them would bury it.
 *
 * NO CAMPUS SHUTTLE. The university's own service is published nowhere this
 * app can read, so there is no `kind: 'campus'` route below and the screen
 * says so in words. A line drawn along the roads because the roads look right
 * would be believed, and somebody would stand at a stop that is not a stop.
 *
 * Nothing here carries a timetable, because nobody publishes one. See
 * `headwayFrom` in transit.ts for what the app says instead.
 */
export const SEED_TRANSIT: TransitRoute[] = [
  {
    id: 'smartbus-538',
    kind: 'public',
    ref: '538 (1-24E)',
    name: {
      en: '538 (1-24E) RMUTT - Priest Hospital',
      th: '538 (1-24E) ม.เทคโนโลยีราชมงคลธัญบุรี - โรงพยาบาลสงฆ์',
      zh: '538 (1-24E) 拉查蒙空理工大学探武里校区 - 僧侣医院',
    },
    operator: 'smart bus',
    colour: 'navy',
    source: 'OpenStreetMap relations 14144070 and 14144071, read 2026-09-15',
    schedule: 'unpublished',
    stops: [
      {
        id: 'rmutt-gate3',
        name: { en: 'Rajamangala Gate 3 (Soi Phon)', th: 'ราชมงคล ประตู 3 (ซอยพร)', zh: '拉查蒙空 3 号门（蓬巷）' },
        lat: 14.0356229,
        lng: 100.7320651,
        osm: 'node 11265006936',
      },
      // Named on neither side of the road in OpenStreetMap. The position was
      // surveyed; the name was not, so the app does not supply one.
      { id: 'rmutt-gate3-opposite', name: null, lat: 14.035649, lng: 100.7319028, osm: 'node 11534778321' },
      { id: 'rmutt-south-east', name: null, lat: 14.0315712, lng: 100.7321438, osm: 'node 11534778327' },
      { id: 'rmutt-south-west', name: null, lat: 14.0315695, lng: 100.7320199, osm: 'node 11534778328' },
    ],
  },
];

/**
 * The safety phrase shown in the place metric grid. Data, not derived from
 * safetyIndex - the phrase describes the KIND of coverage, the index rates it.
 */
export const SAFETY_PHRASES: Record<string, { en: string; th: string; zh?: string }> = {
  chaweng: { en: 'Patrolled', th: 'มีสายตรวจ', zh: '有巡逻' },
  namuang: { en: 'Ranger post', th: 'มีจุดเจ้าหน้าที่', zh: '设有护林员站' },
  fisherman: { en: 'Verified zone', th: 'เขตตรวจสอบแล้ว', zh: '已验证区域' },
  lamai: { en: 'Verified zone', th: 'เขตตรวจสอบแล้ว', zh: '已验证区域' },
  mangrove: { en: 'Guide required', th: 'ต้องมีไกด์', zh: '须有向导' },
  /*
    Ko Sichang. "Island municipality" and nothing more: it is a small
    municipality with its own district office, water police and clinic,
    which is a fact about how the place is administered rather than a claim
    about patrols, lighting or hours that nobody has checked. The same
    restraint the campus phrases were written with - see below - and for
    the same reason, because this phrase sits under a score.
  */
  // The campus: a university's grounds, with its own security. Not a claim
  // of hours or patrols nobody has confirmed.
  'ku-library': { en: 'Campus grounds', th: 'ในเขตมหาวิทยาลัย', zh: '校园' },
  'ku-park': { en: 'Campus grounds', th: 'ในเขตมหาวิทยาลัย', zh: '校园' },
  'ku-viewpoint': { en: 'Campus grounds', th: 'ในเขตมหาวิทยาลัย', zh: '校园' },
  'ku-sports': { en: 'Campus grounds', th: 'ในเขตมหาวิทยาลัย', zh: '校园' },
  'ku-shops': { en: 'Campus grounds', th: 'ในเขตมหาวิทยาลัย', zh: '校园' },
  'ku-building13': { en: 'Campus grounds', th: 'ในเขตมหาวิทยาลัย', zh: '校园' },
  // Thanyaburi, the same phrase for the same reason: a university's grounds
  // have their own security, and nobody has confirmed hours or patrols.
  'rmutt-library': { en: 'Campus grounds', th: 'ในเขตมหาวิทยาลัย', zh: '校园' },
  'rmutt-park': { en: 'Campus grounds', th: 'ในเขตมหาวิทยาลัย', zh: '校园' },
  'rmutt-canteen': { en: 'Campus grounds', th: 'ในเขตมหาวิทยาลัย', zh: '校园' },
  'rmutt-stadium': { en: 'Campus grounds', th: 'ในเขตมหาวิทยาลัย', zh: '校园' },
  'rmutt-fountain': { en: 'Campus grounds', th: 'ในเขตมหาวิทยาลัย', zh: '校园' },
  // A private venue inside a housing estate: staffed while open, nothing more claimed.
  'sinthani-badminton': { en: 'Staffed venue', th: 'สนามมีเจ้าหน้าที่', zh: '场馆有工作人员' },
  'ku-bk-library': { en: 'Campus grounds', th: 'ในเขตมหาวิทยาลัย', zh: '校园' },
  'ku-bk-park': { en: 'Campus grounds', th: 'ในเขตมหาวิทยาลัย', zh: '校园' },
  'ku-bk-auditorium': { en: 'Campus grounds', th: 'ในเขตมหาวิทยาลัย', zh: '校园' },
  'ku-bk-stadium': { en: 'Campus grounds', th: 'ในเขตมหาวิทยาลัย', zh: '校园' },
  'ku-bk-canteen': { en: 'Campus grounds', th: 'ในเขตมหาวิทยาลัย', zh: '校园' },
  'sc-pier': { en: 'Busy at ferry times', th: 'คนพลุกพล่านช่วงเรือเข้าออก', zh: '渡轮进出时人多' },
  'sc-hospital': { en: 'Staffed hospital', th: 'โรงพยาบาลมีเจ้าหน้าที่', zh: '医院有工作人员' },
  'sc-thamphang': { en: 'No lifeguard claimed', th: 'ไม่ได้ยืนยันว่ามีไลฟ์การ์ด', zh: '未声明有救生员' },
  'sc-palace': { en: 'Staffed grounds', th: 'มีเจ้าหน้าที่ดูแล', zh: '园区有工作人员' },
  'sc-shops': { en: 'Town street', th: 'ถนนในตัวเมือง', zh: '镇上的街道' },
  'sc-marinestation': { en: 'Access not confirmed', th: 'ยังไม่ยืนยันว่าเข้าได้', zh: '尚未确认可否进入' },
};

// ---------------------------------------------------------------------------
// Quests
// ---------------------------------------------------------------------------

export const SEED_QUESTS: Quest[] = [
  {
    id: 'q1',
    esgPillar: 'environmental',
    code: 'BC-04',
    name: { en: 'Beach Cleanup', th: 'เก็บขยะชายหาด', zh: '海滩清洁' },
    where: { en: 'Chaweng Beach', th: 'หาดเฉวง', zh: '查汶海滩' },
    duration: { en: '45 min', th: '45 นาที', zh: '45 分钟' },
    rewardPoints: 150,
    rewardCurrency: 'green',
    host: SEED_HOSTS.municipality!,
    kind: 'today',
    lat: 9.5357,
    lng: 100.0617,
    geofenceRadiusM: 80,
  },
  {
    id: 'q2',
    esgPillar: 'environmental',
    code: 'MG-11',
    name: { en: 'Mangrove Planting', th: 'ปลูกป่าชายเลน', zh: '种植红树林' },
    where: { en: 'Thong Krut', th: 'ท้องกรูด', zh: '通卡鲁' },
    duration: { en: '2 hr', th: '2 ชั่วโมง', zh: '2 小时' },
    rewardPoints: 400,
    rewardCurrency: 'green',
    host: SEED_HOSTS.greenFoundation!,
    kind: 'weekend',
    lat: 9.4179,
    lng: 99.9433,
    geofenceRadiusM: 120,
  },
  {
    id: 'q3',
    esgPillar: 'environmental',
    code: 'CR-02',
    name: { en: 'Coral Nursery Check', th: 'ตรวจแปลงปะการัง', zh: '珊瑚苗圃检查' },
    where: { en: 'Taling Ngam', th: 'ตลิ่งงาม', zh: '塔灵岸' },
    duration: { en: '90 min', th: '90 นาที', zh: '90 分钟' },
    rewardPoints: 300,
    rewardCurrency: 'green',
    host: SEED_HOSTS.oceanLab!,
    kind: 'weekend',
    lat: 9.4478,
    lng: 99.9294,
    geofenceRadiusM: 120,
  },
  {
    id: 'q4',
    esgPillar: 'environmental',
    code: 'WK-01',
    name: { en: 'Walk, don’t ride', th: 'เดินแทนการใช้รถ', zh: '用走的，别骑车' },
    where: { en: 'Island-wide', th: 'ทั่วทั้งเกาะ', zh: '全岛' },
    duration: { en: 'Daily', th: 'ทุกวัน', zh: '每天' },
    rewardPoints: 60,
    rewardCurrency: 'green',
    host: SEED_HOSTS.platform!,
    kind: 'today',
    // Island centre. This quest has no single site, so the geofence spans Samui
    // and arrival is satisfied by the pedometer rather than a location check.
    lat: 9.512,
    lng: 100.0136,
    geofenceRadiusM: 12000,
  },
  {
    id: 'q5',
    esgPillar: 'social',
    code: 'FD-07',
    name: { en: 'Fisherman’s Village food trail', th: 'เส้นทางอาหารหมู่บ้านชาวประมง', zh: '渔人村美食路线' },
    where: { en: 'Bophut', th: 'บ่อผุด', zh: '波普' },
    duration: { en: '90 min', th: '90 นาที', zh: '90 分钟' },
    rewardPoints: 120,
    // Trip, not Green. Eating well is not an environmental claim and must
    // never reach the Impact Ledger.
    rewardCurrency: 'trip',
    host: SEED_HOSTS.community!,
    kind: 'today',
    lat: 9.5589,
    lng: 100.0672,
    geofenceRadiusM: 100,
  },
  {
    id: 'q6',
    code: 'TP-03',
    name: { en: 'Big Buddha morning walk', th: 'เดินเช้าพระใหญ่', zh: '大佛晨间漫步' },
    where: { en: 'Bang Rak', th: 'บางรัก', zh: '邦腊' },
    duration: { en: '45 min', th: '45 นาที', zh: '45 分钟' },
    rewardPoints: 80,
    rewardCurrency: 'trip',
    host: SEED_HOSTS.platform!,
    kind: 'today',
    lat: 9.5581,
    lng: 100.0631,
    geofenceRadiusM: 80,
  },
  /*
    The campus quests, hosted by the team itself - the named host on stage
    when the campus is the venue. Fences at campus size (docs/30).
  */
  {
    id: 'q7',
    esgPillar: 'environmental',
    code: 'KU-01',
    name: { en: 'Campus clean-up at Sapandao', th: 'เก็บขยะรอบจุดชมวิวสะพานดาว', zh: '沙潘道校园清洁' },
    where: { en: 'Sapandao viewpoint, KU Sriracha', th: 'จุดชมวิวสะพานดาว มก. ศรีราชา', zh: '沙潘道观景点，农业大学是拉差校区' },
    duration: { en: '45 min', th: '45 นาที', zh: '45 分钟' },
    rewardPoints: 120,
    rewardCurrency: 'green',
    host: SEED_HOSTS.kuTeam!,
    kind: 'today',
    lat: 13.12189,
    lng: 100.92055,
    geofenceRadiusM: 100,
  },
  {
    id: 'q8',
    code: 'KU-02',
    name: { en: 'Lake loop on foot', th: 'เดินวนรอบบึง', zh: '步行绕湖一圈' },
    where: { en: 'Campus park, KU Sriracha', th: 'สวนในมหาวิทยาลัย มก. ศรีราชา', zh: '校园公园，农业大学是拉差校区' },
    duration: { en: '30 min', th: '30 นาที', zh: '30 分钟' },
    rewardPoints: 60,
    rewardCurrency: 'trip',
    host: SEED_HOSTS.kuTeam!,
    kind: 'today',
    lat: 13.12154,
    lng: 100.91812,
    geofenceRadiusM: 120,
  },
  {
    // A campus walk, not a claim that an environmental clean-up is operating.
    id: 'q-ku-bk-walk',
    code: 'BK-01',
    name: { en: 'Three Founders campus walk', th: 'เดินชมสามบูรพาจารย์', zh: '三位创校者校园漫步' },
    where: { en: 'Grand Auditorium, KU Bangkhen', th: 'หอประชุมใหญ่ มก. บางเขน', zh: '大礼堂，农业大学挽坑校区' },
    duration: { en: '30 min', th: '30 นาที', zh: '30 分钟' },
    rewardPoints: 60, rewardCurrency: 'trip',
    host: SEED_HOSTS.kuBangkhen!, kind: 'today',
    lat: 13.8413167, lng: 100.5747727, geofenceRadiusM: 100,
  },
  /*
    Koh Sichang's two waste quests, for the field trial of the Spark Hack
    proposal (docs/68). SAMPLES, and named so: the team hosts and verifies
    them itself, because no shop or the municipality has agreed to yet. The
    Data Pack says the island's bottleneck is waste reaching the incinerator
    unsorted, so the first asks a day-tripper to bring theirs sorted to the
    pier before the boat home.
  */
  {
    id: 'q-sc-dropoff',
    esgPillar: 'environmental',
    code: 'SC-01',
    name: { en: 'Bring your waste back sorted (sample)', th: 'นำขยะที่แยกแล้วมาส่งที่ท่าเรือ (ตัวอย่าง)', zh: '把分类好的垃圾带回来（示例）' },
    where: { en: 'Tha Lang pier, Koh Sichang', th: 'ท่าเรือท่าล่าง เกาะสีชัง', zh: '塔朗码头，锡昌岛' },
    duration: { en: '15 min', th: '15 นาที', zh: '15 分钟' },
    rewardPoints: 60, rewardCurrency: 'green',
    host: SEED_HOSTS.sichangTeam!, kind: 'today',
    lat: 13.161443, lng: 100.810441, geofenceRadiusM: 120,
  },
  {
    id: 'q-sc-beach',
    esgPillar: 'environmental',
    code: 'SC-02',
    name: { en: 'Tham Phang beach clean-up (sample)', th: 'เก็บขยะหาดถ้ำพัง (ตัวอย่าง)', zh: '探蓬海滩清洁（示例）' },
    where: { en: 'Tham Phang Beach, Koh Sichang', th: 'หาดถ้ำพัง เกาะสีชัง', zh: '探蓬海滩，锡昌岛' },
    duration: { en: '45 min', th: '45 นาที', zh: '45 分钟' },
    rewardPoints: 120, rewardCurrency: 'green',
    host: SEED_HOSTS.sichangTeam!, kind: 'today',
    lat: 13.1454, lng: 100.806835, geofenceRadiusM: 120,
  },
  /*
    Five Koh Sichang pilot briefs from the 12 Nov 2026 field-trial pack.

    They award EXP only. `rewardPoints` therefore stays zero: turning EXP
    into Trip or Green Points would create a payment the pilot pack never
    promised. The normal verified quest workflow handles their GPS arrival,
    evidence upload and Koh Sichang host review before releasing EXP.
  */
  {
    id: 'q-sg-explorer',
    code: 'SG-01',
    name: { en: 'Sichang Explorer', th: 'นักสำรวจเกาะสีชัง', zh: '锡昌岛探索家' },
    where: { en: 'Koh Sichang', th: 'เกาะสีชัง', zh: '锡昌岛' },
    duration: { en: 'Pilot schedule', th: 'ตามรอบทดลอง', zh: '试运行时段' },
    rewardPoints: 0, rewardExp: 150, rewardCurrency: 'trip',
    host: SEED_HOSTS.sichangTeam!, kind: 'today',
    lat: 13.14909, lng: 100.818436, geofenceRadiusM: 120,
  },
  {
    id: 'q-sg-secret-recipe',
    code: 'SG-02',
    name: { en: 'Secret Recipe', th: 'ตามล่ารสชาติสีชัง', zh: '锡昌风味寻味' },
    where: { en: 'Tha Lang shop row, Koh Sichang', th: 'ย่านร้านค้าหน้าท่าล่าง เกาะสีชัง', zh: '锡昌岛塔朗码头商铺街' },
    duration: { en: 'Pilot schedule', th: 'ตามรอบทดลอง', zh: '试运行时段' },
    rewardPoints: 0, rewardExp: 150, rewardCurrency: 'trip',
    host: SEED_HOSTS.sichangTeam!, kind: 'today',
    lat: 13.160059, lng: 100.809817, geofenceRadiusM: 120,
  },
  {
    id: 'q-sg-trash-hero',
    code: 'SG-03',
    name: { en: 'Trash Hero', th: 'ฮีโร่พิทักษ์เกาะ', zh: '岛屿守护英雄' },
    where: { en: 'Supervised activity, Koh Sichang', th: 'กิจกรรมที่มีผู้ดูแล เกาะสีชัง', zh: '锡昌岛有监督活动' },
    duration: { en: 'Pilot schedule', th: 'ตามรอบกิจกรรม', zh: '按活动时段' },
    rewardPoints: 0, rewardExp: 200, rewardCurrency: 'trip',
    host: SEED_HOSTS.sichangTeam!, kind: 'weekend',
    lat: 13.1454, lng: 100.806835, geofenceRadiusM: 120,
  },
  {
    id: 'q-sg-local-treasure',
    code: 'SG-04',
    name: { en: 'Local Treasure', th: 'ตามล่าของดีสีชัง', zh: '锡昌好物寻宝' },
    where: { en: 'Local shops, Koh Sichang', th: 'ร้านค้าท้องถิ่น เกาะสีชัง', zh: '锡昌岛本地商店' },
    duration: { en: 'Pilot schedule', th: 'ตามรอบทดลอง', zh: '试运行时段' },
    rewardPoints: 0, rewardExp: 150, rewardCurrency: 'trip',
    host: SEED_HOSTS.sichangTeam!, kind: 'today',
    lat: 13.160059, lng: 100.809817, geofenceRadiusM: 120,
  },
  {
    id: 'q-sg-green-journey',
    code: 'SG-05',
    name: { en: 'Green Journey', th: 'เที่ยวเกาะอย่างใส่ใจ', zh: '绿色环岛之旅' },
    where: { en: 'Verified route, Koh Sichang', th: 'เส้นทางที่ตรวจสอบแล้ว เกาะสีชัง', zh: '锡昌岛已核验路线' },
    duration: { en: 'Pilot schedule', th: 'ตามรอบทดลอง', zh: '试运行时段' },
    rewardPoints: 0, rewardExp: 150, rewardCurrency: 'trip',
    host: SEED_HOSTS.sichangTeam!, kind: 'weekend',
    lat: 13.161443, lng: 100.810441, geofenceRadiusM: 120,
  },
];

/**
 * Quests currently published in ChivarGo.
 *
 * `SEED_QUESTS` remains the historical content catalogue because completed
 * progress and ledger rows can still refer to an older quest. New clients,
 * API reads and fresh database seeds publish only the five verified Koh
 * Sichang field-trial quests. Keeping that boundary in one exported value
 * prevents a stale database or the offline demo from bringing retired quests
 * back into the UI.
 */
export const ACTIVE_QUEST_CODES = ['SG-01', 'SG-02', 'SG-03', 'SG-04', 'SG-05'] as const;

export function isActiveQuestCode(code: string): boolean {
  return (ACTIVE_QUEST_CODES as readonly string[]).includes(code.toUpperCase());
}

export const ACTIVE_QUESTS: Quest[] = SEED_QUESTS.filter((quest) => isActiveQuestCode(quest.code));

// ---------------------------------------------------------------------------
// Marketplace
// ---------------------------------------------------------------------------

/*
  Every one of these is unpriced, and that is a decision rather than a gap
  waiting to be filled in.

  `valueTHB` is what the MERCHANT says the offer is worth, and nobody has
  asked these six. Six plausible figures typed in here would be fabricated
  prices attached to named, real businesses on Samui - the same move this
  file already refuses for a photograph with no credit and a venue with no
  consent. `communityValue` reports them as unpriced and counts them, which
  is the true answer until somebody rings the shop.
*/
export const SEED_OFFERS: Offer[] = [
  {
    id: 'o1',
    category: 'Café',
    name: 'Cold brew + banana bread',
    merchant: 'Sabeinglae Coffee, Bophut',
    merchantShort: 'Sabeinglae Coffee',
    costPoints: 180,
    valueTHB: null,
    currency: 'trip',
    imageUrl: null,
    available: true,
  },
  {
    id: 'o2',
    category: 'Healthy food',
    name: 'Southern Thai wellness set',
    merchant: 'Baan Yai Kitchen, Maenam',
    merchantShort: 'Baan Yai Kitchen',
    costPoints: 350,
    valueTHB: null,
    currency: 'trip',
    imageUrl: null,
    available: true,
  },
  {
    id: 'o3',
    category: 'Wellness',
    name: 'Sunrise yoga drop-in',
    // Was "Lamai Yoga Shala", which is the name this seed used for a PLACE
    // until that place was replaced by Lamai Beach for being unphotographable.
    // Leaving it here sold vouchers for a venue the same file calls fictional.
    // Follows the house pattern the other merchants already use: name, then
    // the district it trades in.
    merchant: 'Baan Yoga, Lamai',
    merchantShort: 'Baan Yoga',
    costPoints: 500,
    valueTHB: null,
    currency: 'trip',
    imageUrl: null,
    available: true,
  },
  {
    id: 'o4',
    category: 'Hotel',
    name: 'Late checkout, 16:00',
    merchant: 'Anantara partner hotels',
    merchantShort: 'Anantara',
    costPoints: 800,
    valueTHB: null,
    currency: 'trip',
    imageUrl: null,
    available: true,
  },
  {
    id: 'o5',
    category: 'Local experience',
    name: 'Longtail trip to Koh Taen',
    merchant: 'Thong Krut Boat Co-op',
    merchantShort: 'Thong Krut Boat Co-op',
    costPoints: 1200,
    valueTHB: null,
    currency: 'green',
    imageUrl: null,
    available: true,
  },
  {
    id: 'o6',
    category: 'Marine',
    name: 'Reef-safe snorkel set, half day',
    merchant: 'Ocean Lab · Taling Ngam',
    merchantShort: 'Ocean Lab',
    costPoints: 600,
    valueTHB: null,
    currency: 'green',
    imageUrl: null,
    available: true,
  },
  {
    id: 'o7',
    example: true,
    // Unpriced until the merchant says what it is worth.
    valueTHB: null,
    category: 'Café',
    name: 'Organic Coconut Cold Foam Latte',
    merchant: "Coco Tam's Beach Café, Fisherman's Village",
    merchantShort: "Coco Tam's Café",
    costPoints: 120,
    currency: 'trip',
    imageUrl: null,
    available: true,
  },
  {
    id: 'o8',
    example: true,
    // Unpriced until the merchant says what it is worth.
    valueTHB: null,
    category: 'Healthy food',
    name: 'Organic Acai & Fresh Mango Bowl',
    merchant: 'Greenlight Café & Bar, Fisherman’s Village',
    merchantShort: 'Greenlight Café',
    costPoints: 150,
    currency: 'trip',
    imageUrl: null,
    available: true,
  },
  {
    id: 'o9',
    example: true,
    // Unpriced until the merchant says what it is worth.
    valueTHB: null,
    category: 'Wellness',
    name: 'Herbal Steam & Aromatherapy Massage (60 min)',
    merchant: 'Tamarind Springs Forest Spa, Lamai',
    merchantShort: 'Tamarind Springs Spa',
    costPoints: 450,
    currency: 'trip',
    imageUrl: null,
    available: true,
  },
  {
    id: 'o10',
    example: true,
    // Unpriced until the merchant says what it is worth.
    valueTHB: null,
    category: 'Marine',
    name: 'Sunset Stand-Up Paddleboard (SUP) 1 hr',
    merchant: 'Silver Beach Water Sports, Lamai',
    merchantShort: 'Silver Beach Sports',
    costPoints: 220,
    currency: 'trip',
    imageUrl: null,
    available: true,
  },
  {
    id: 'o11',
    example: true,
    // Unpriced until the merchant says what it is worth.
    valueTHB: null,
    category: 'Local experience',
    name: 'Samui Coconut Shell Crafting Workshop',
    merchant: 'Lipa Noi Artisan Heritage Centre',
    merchantShort: 'Lipa Noi Artisans',
    costPoints: 300,
    currency: 'green',
    imageUrl: null,
    available: true,
  },
  {
    id: 'o12',
    example: true,
    // Unpriced until the merchant says what it is worth.
    valueTHB: null,
    category: 'Eco & Green',
    name: 'Upcycled Ocean Plastic Beach Tote Bag',
    merchant: 'Trash Hero Koh Samui Co-op',
    merchantShort: 'Trash Hero Co-op',
    costPoints: 250,
    currency: 'green',
    imageUrl: null,
    available: true,
  },
  {
    id: 'o13',
    example: true,
    // Unpriced until the merchant says what it is worth.
    valueTHB: null,
    category: 'Healthy food',
    name: 'Wild Coral Bay Seafood Curry & Organic Rice',
    merchant: 'Bang Por Beach Seafood Shack',
    merchantShort: 'Bang Por Seafood',
    costPoints: 380,
    currency: 'trip',
    imageUrl: null,
    available: true,
  },
  {
    id: 'o14',
    example: true,
    // Unpriced until the merchant says what it is worth.
    valueTHB: null,
    category: 'Hotel',
    name: 'Sunset Beach Club Day Pass & Mocktail',
    merchant: 'W Koh Samui Resort lounge',
    merchantShort: 'W Koh Samui',
    costPoints: 750,
    currency: 'trip',
    imageUrl: null,
    available: true,
  },
  {
    id: 'o15',
    example: true,
    // Unpriced until the merchant says what it is worth.
    valueTHB: null,
    category: 'Local experience',
    name: 'Permaculture Farm Tour & Honey Tasting',
    merchant: 'Samui Eco-Farm, Namuang Hills',
    merchantShort: 'Samui Eco-Farm',
    costPoints: 500,
    currency: 'green',
    imageUrl: null,
    available: true,
  },
  {
    id: 'o16',
    example: true,
    // Unpriced until the merchant says what it is worth.
    valueTHB: null,
    category: 'Marine',
    name: 'Coral Restoration Guided Snorkel Trip',
    merchant: 'Koh Tao Coral Sanctuary Volunteers',
    merchantShort: 'Coral Sanctuary',
    costPoints: 850,
    currency: 'green',
    imageUrl: null,
    available: true,
  },
];

// ---------------------------------------------------------------------------
// Wallet tiers
// ---------------------------------------------------------------------------

/**
 * A place check-in.
 *
 * The only Trip Point source that needs no host and no photo, so it needs a
 * different guard: presence, then a rate limit. The radius is generous
 * because a place is a beach or a market, not a point, and consumer GPS is
 * routinely 30-50 m out under tree cover.
 */
export const CHECKIN_RADIUS_M = 250;

/*
  Quest sites are narrower - 80 to 120 m, set per quest above - because a
  site is a point and a place is not. Ingress interacts at 40 m; a beach
  clean 'arrived at' from a cafe four streets back is what 250 m allowed.
  The only quest wider than 120 m is the one whose site is the island.
  `presence.test.ts` in core holds the seed to this.
*/

/** Trip Points per check-in. Small on purpose - presence is weak evidence. */
export const CHECKIN_TRIP_POINTS = 20;

/**
 * Trip Points for a review, paid once per place.
 *
 * Worth more than a check-in because writing something the next traveller can
 * use is worth more than turning up. Paid on the FIRST review of a place only
 * - editing must not be an income stream.
 */
export const REVIEW_TRIP_POINTS = 40;

/** Hard cap. A review is a paragraph, not an essay, and not a payload. */
export const REVIEW_MAX_BODY = 600;

/**
 * Words needed to earn.
 *
 * You may rate without writing - a bare star is still signal, and demanding
 * prose would just produce padding. But the points are for helping the next
 * traveller, and a lone star does not.
 */
export const REVIEW_MIN_BODY_FOR_POINTS = 40;

/** Koh Samui, island centre. Used as the default map camera target. */
export const SAMUI_CENTRE = { lat: 9.512, lng: 100.0136 } as const;

/** Bounding box covering the whole island, for GET /places?bbox=. */
export const SAMUI_BBOX = {
  minLat: 9.38,
  maxLat: 9.61,
  minLng: 99.9,
  maxLng: 100.1,
} as const;
