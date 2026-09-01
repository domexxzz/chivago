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

import type { Offer, Place, Quest, QuestHost } from './types.ts';

// ---------------------------------------------------------------------------
// Hosts
// ---------------------------------------------------------------------------

export const SEED_HOSTS: Record<string, QuestHost> = {
  municipality: { id: 'h-samui-muni', name: 'Samui Municipality', type: 'municipality' },
  greenFoundation: { id: 'h-samui-green', name: 'Samui Green Foundation (NGO)', type: 'ngo' },
  oceanLab: { id: 'h-ocean-lab', name: 'Ocean Lab · Hotel partner', type: 'hotel' },
  platform: { id: 'h-chivago', name: 'ChivaGo', type: 'platform' },
  community: { id: 'h-fisherman-village', name: "Fisherman's Village Traders", type: 'community' },
};

// ---------------------------------------------------------------------------
// Places
// ---------------------------------------------------------------------------

export const SEED_PLACES: Place[] = [
  {
    id: 'chaweng',
    name: { en: 'Chaweng Beach', th: 'หาดเฉวง' },
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
    name: { en: 'Na Muang Waterfall', th: 'น้ำตกหน้าเมือง' },
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
    name: { en: "Fisherman's Village", th: 'หมู่บ้านชาวประมง' },
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
    name: { en: 'Lamai Beach', th: 'หาดละไม' },
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
    name: { en: 'Thong Krut Mangrove', th: 'ป่าชายเลนท้องกรูด' },
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
    },
    tags: ['Green space', 'Quest here', 'Community'],
    // No photograph. Commons has no imagery of the Thong Krut mangrove, and
    // the nearest thing - Ang Thong Marine Park - is a different place
    // forty kilometres away.
    photo: null,
    metrics: { aqi: 20, crowdDensity: 0.3, safetyIndex: 5.13, walkability: 5.2 },
  },
];

/**
 * The safety phrase shown in the place metric grid. Data, not derived from
 * safetyIndex - the phrase describes the KIND of coverage, the index rates it.
 */
export const SAFETY_PHRASES: Record<string, { en: string; th: string }> = {
  chaweng: { en: 'Patrolled', th: 'มีสายตรวจ' },
  namuang: { en: 'Ranger post', th: 'มีจุดเจ้าหน้าที่' },
  fisherman: { en: 'Verified zone', th: 'เขตตรวจสอบแล้ว' },
  lamai: { en: 'Verified zone', th: 'เขตตรวจสอบแล้ว' },
  mangrove: { en: 'Guide required', th: 'ต้องมีไกด์' },
};

// ---------------------------------------------------------------------------
// Quests
// ---------------------------------------------------------------------------

export const SEED_QUESTS: Quest[] = [
  {
    id: 'q1',
    esgPillar: 'environmental',
    code: 'BC-04',
    name: { en: 'Beach Cleanup', th: 'เก็บขยะชายหาด' },
    where: 'Chaweng Beach',
    duration: '45 min',
    rewardPoints: 150,
    rewardCurrency: 'green',
    host: SEED_HOSTS.municipality!,
    kind: 'today',
    lat: 9.5357,
    lng: 100.0617,
    geofenceRadiusM: 250,
  },
  {
    id: 'q2',
    esgPillar: 'environmental',
    code: 'MG-11',
    name: { en: 'Mangrove Planting', th: 'ปลูกป่าชายเลน' },
    where: 'Thong Krut',
    duration: '2 hr',
    rewardPoints: 400,
    rewardCurrency: 'green',
    host: SEED_HOSTS.greenFoundation!,
    kind: 'weekend',
    lat: 9.4179,
    lng: 99.9433,
    geofenceRadiusM: 300,
  },
  {
    id: 'q3',
    esgPillar: 'environmental',
    code: 'CR-02',
    name: { en: 'Coral Nursery Check', th: 'ตรวจแปลงปะการัง' },
    where: 'Taling Ngam',
    duration: '90 min',
    rewardPoints: 300,
    rewardCurrency: 'green',
    host: SEED_HOSTS.oceanLab!,
    kind: 'weekend',
    lat: 9.4478,
    lng: 99.9294,
    geofenceRadiusM: 400,
  },
  {
    id: 'q4',
    esgPillar: 'environmental',
    code: 'WK-01',
    name: { en: 'Walk, don’t ride', th: 'เดินแทนการใช้รถ' },
    where: 'Island-wide',
    duration: 'Daily',
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
    name: { en: 'Fisherman’s Village food trail', th: 'เส้นทางอาหารหมู่บ้านชาวประมง' },
    where: 'Bophut',
    duration: '90 min',
    rewardPoints: 120,
    // Trip, not Green. Eating well is not an environmental claim and must
    // never reach the Impact Ledger.
    rewardCurrency: 'trip',
    host: SEED_HOSTS.community!,
    kind: 'today',
    lat: 9.5589,
    lng: 100.0672,
    geofenceRadiusM: 350,
  },
  {
    id: 'q6',
    code: 'TP-03',
    name: { en: 'Big Buddha morning walk', th: 'เดินเช้าพระใหญ่' },
    where: 'Bang Rak',
    duration: '45 min',
    rewardPoints: 80,
    rewardCurrency: 'trip',
    host: SEED_HOSTS.platform!,
    kind: 'today',
    lat: 9.5581,
    lng: 100.0631,
    geofenceRadiusM: 300,
  },
];

// ---------------------------------------------------------------------------
// Marketplace
// ---------------------------------------------------------------------------

export const SEED_OFFERS: Offer[] = [
  {
    id: 'o1',
    category: 'Café',
    name: 'Cold brew + banana bread',
    merchant: 'Sabeinglae Coffee, Bophut',
    merchantShort: 'Sabeinglae Coffee',
    costPoints: 180,
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
