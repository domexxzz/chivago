/**
 * Pure language understanding and context rules for the hybrid concierge.
 *
 * The server may replace a low-confidence reading with a validated Groq
 * reading, but emergency detection and the high-confidence paths stay local.
 * Keeping these functions pure gives the offline build a useful fallback and
 * makes follow-up behaviour testable without a network or an API key.
 */

import { detectLang } from './concierge.ts';
import type { Reply } from './concierge.ts';
import type { Lang } from './localise.ts';
import type { AreaWeather } from './weather.ts';
import type { AreaKey } from './areas.ts';

export type TravelIntent =
  | 'TOURISM'
  | 'WEATHER'
  | 'CROWD'
  | 'RESTAURANT'
  | 'ACCOMMODATION'
  | 'TRIP_PLANNING'
  | 'NAVIGATION'
  | 'GENERAL'
  | 'SAFETY';

export type TravelTime = 'now' | 'today' | 'tomorrow' | 'weekend' | null;
export type TravelMode = 'walk' | 'drive' | null;

export interface TravelEntities {
  category: string | null;
  placeName: string | null;
  time: TravelTime;
  budgetBaht: number | null;
  travelMode: TravelMode;
  quiet: boolean;
  indoor: boolean;
  nearMe: boolean;
  /** Only true when the traveller explicitly asks for child/family suitability. */
  familyFriendly: boolean;
  /** A continuation request that must exclude every result already shown. */
  showMore: boolean;
  /** Prefer the nearest verified coordinate when a location is available. */
  closest: boolean;
}

export interface TravelAnalysis {
  intent: TravelIntent;
  confidence: number;
  language: Lang;
  entities: TravelEntities;
  contextReference: 'none' | 'previous_search' | 'selected_destination';
  requiredActions: string[];
  needsClarification: boolean;
  sentiment: 'positive' | 'neutral' | 'concerned';
}

export interface TravelLocation {
  lat: number;
  lng: number;
  accuracyM: number | null;
}

export interface ConversationContext {
  currentIntent: TravelIntent | null;
  previousIntent: TravelIntent | null;
  currentLocation: TravelLocation | null;
  selectedDestination: string | null;
  /** The named map area being discussed, independent of the screen currently open. */
  selectedArea: AreaKey | null;
  selectedPlaces: string[];
  travelDate: TravelTime;
  travelTime: string | null;
  budget: number | null;
  preferredCategories: string[];
  travelMode: TravelMode;
  language: Lang;
  lastSearchResults: string[];
  conversationSummary: string;
}

export interface ConciergeEvidence {
  kind: 'places' | 'weather' | 'crowd' | 'routing';
  label: string;
  source: string;
  fetchedAt: string | null;
  validity: 'live' | 'recent' | 'stale' | 'estimated' | 'unavailable';
}

export interface RecommendationScoreComponent {
  key: 'preference' | 'distance' | 'reviews' | 'popularity' | 'diversity' | 'freshness';
  /** Null means the source data was unavailable and its weight was redistributed. */
  score: number | null;
  configuredWeight: number;
  appliedWeight: number;
}

export interface PlaceRecommendation {
  placeId: string;
  name: import('./types.ts').Bilingual;
  category: import('./types.ts').Bilingual;
  description: import('./types.ts').Bilingual;
  image: import('./types.ts').PlacePhoto | null;
  coordinates: { lat: number; lng: number };
  distanceKm: number | null;
  rating: { average: number; reviewCount: number } | null;
  /** ChivaGo has no reliable opening-hours source for place records yet. */
  openingStatus: null;
  source: {
    name: 'ChivaGo database';
    fetchedAt: string;
    lastUpdatedAt: string | null;
  };
  reason: import('./types.ts').Bilingual;
  verificationStatus: 'partially-verified' | 'source-documented';
  score: number;
  scoreBreakdown: RecommendationScoreComponent[];
}

export interface PlaceRecommendationSet {
  title: import('./types.ts').Bilingual;
  items: PlaceRecommendation[];
  hasMore: boolean;
  limitations: import('./types.ts').Bilingual[];
}

export interface TripRecommendation {
  title: import('./types.ts').Bilingual;
  /** A product-sized half-day suggestion, not a claimed routing duration. */
  durationLabel: import('./types.ts').Bilingual;
  stops: {
    order: number;
    placeId: string;
    name: import('./types.ts').Bilingual;
    coordinates: { lat: number; lng: number };
  }[];
  /** The existing ChivaGo router remains the only source of an actual route. */
  routeStatus: 'calculate-on-map';
  limitation: import('./types.ts').Bilingual;
}

/** The typed payload shared by the API and all three clients. */
export interface ConciergeChatData {
  conversationId: string;
  reply: Reply;
  source: 'groq' | 'rules';
  model: string | null;
  analysis: TravelAnalysis;
  quickReplies: string[];
  weather: AreaWeather | null;
  evidence: ConciergeEvidence[];
  /** Visible when the LLM was configured but unavailable; never hidden by a fake AI answer. */
  aiNotice: string | null;
  retryable: boolean;
  /** Present for place-search turns; factual fields are produced only by the backend. */
  recommendations: PlaceRecommendationSet | null;
  /** Present only for multi-stop trip requests. */
  tripRecommendation?: TripRecommendation | null;
}

export const emptyConversationContext = (lang: Lang = 'th'): ConversationContext => ({
  currentIntent: null,
  previousIntent: null,
  currentLocation: null,
  selectedDestination: null,
  selectedArea: null,
  selectedPlaces: [],
  travelDate: null,
  travelTime: null,
  budget: null,
  preferredCategories: [],
  travelMode: null,
  language: lang,
  lastSearchResults: [],
  conversationSummary: '',
});

/**
 * Does the text contain this keyword, as a word?
 *
 * WHY THIS IS NOT `text.includes(value)`
 *
 * It was, and the three letters of `eat` sat inside "wh-eat-her", "gr-eat",
 * "th-eat-er", "s-eat-s" and "def-eat". So "a great beach" classified as
 * RESTAURANT - at confidence 0.93, which is above the 0.86 threshold that
 * decides whether to ask Groq for a second reading. The classifier was not
 * merely wrong, it was too sure of itself to be corrected.
 *
 * Thai and Chinese are matched as substrings because neither writes spaces
 * between words: ในประโยคไทย "ร้านอาหาร" ไม่มีช่องว่างคั่น, so a boundary
 * rule there would match nothing. Latin keywords get boundaries, which is
 * the only script in these lists that has them to check.
 */
const LATIN_KEYWORD = /^[a-z0-9][a-z0-9 '\-.]*$/;
const boundaryCache = new Map<string, RegExp>();

const matchesKeyword = (text: string, value: string): boolean => {
  if (!LATIN_KEYWORD.test(value)) return text.includes(value);
  let pattern = boundaryCache.get(value);
  if (!pattern) {
    const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    pattern = new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`, 'i');
    boundaryCache.set(value, pattern);
  }
  if (pattern.test(text)) return true;
  return nearMiss(text, value);
};

/**
 * One typo away from the keyword.
 *
 * "resturant near me" and "wheather tomorrow" are both a single dropped or
 * doubled letter from a word in these lists, and both classified as GENERAL.
 * That is not a disaster - GENERAL scores 0.45, under the 0.86 threshold, so
 * Groq is asked for a second reading - but it spends a model call on a
 * question the lists already knew, and it fails outright when Groq is off.
 *
 * Only long keywords are eligible. At six characters a single edit is a
 * distinctive match; at three it is not, and "eat"/"beat"/"heat" would be
 * neighbours of each other. Keywords containing a space are skipped because
 * the comparison is per word.
 */
const TYPO_FLOOR = 6;

const nearMiss = (text: string, value: string): boolean => {
  if (value.length < TYPO_FLOOR || value.includes(' ')) return false;
  for (const token of text.toLowerCase().match(/[a-z]{3,}/g) ?? []) {
    if (Math.abs(token.length - value.length) <= 1 && editDistanceWithin1(token, value)) return true;
  }
  return false;
};

/** True when `a` and `b` are at most one insertion, deletion or substitution apart. */
const editDistanceWithin1 = (a: string, b: string): boolean => {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (long.length - short.length > 1) return false;
  let i = 0;
  let j = 0;
  let budget = 1;
  while (i < short.length && j < long.length) {
    if (short[i] === long[j]) { i += 1; j += 1; continue; }
    if (budget === 0) return false;
    budget -= 1;
    if (short.length === long.length) { i += 1; j += 1; } else { j += 1; }
  }
  // Whatever is left over must fit in the remaining budget.
  return (short.length - i) + (long.length - j) <= budget;
};

const includesAny = (text: string, values: readonly string[]): boolean =>
  values.some((value) => matchesKeyword(text, value));

const entitiesFor = (input: string): TravelEntities => {
  const text = input.toLowerCase();
  const money = text.match(/(?:งบ(?:ไม่เกิน)?|budget|under|ไม่เกิน|ประมาณ|预算)\s*([\d,]{2,9})/i)?.[1]
    ?? text.match(/([\d,]{2,9})\s*(?:บาท|baht|泰铢)/i)?.[1];
  const time: TravelTime = includesAny(text, ['พรุ่งนี้', 'tomorrow', '明天'])
    ? 'tomorrow'
    : includesAny(text, ['สุดสัปดาห์', 'weekend', '周末'])
      ? 'weekend'
      : includesAny(text, ['วันนี้', 'today', '今天'])
        ? 'today'
        : includesAny(text, ['ตอนนี้', 'now', '现在']) ? 'now' : null;
  const category = includesAny(text, ['น้ำตก', 'waterfall', '瀑布'])
    ? 'waterfall'
    : includesAny(text, ['วัด', 'temple', '寺庙'])
      ? 'temple'
      : includesAny(text, ['ธรรมชาติ', 'nature', 'green', '自然'])
        ? 'nature'
        : includesAny(text, ['ทะเล', 'หาด', 'beach', 'sea', '海滩'])
          ? 'beach'
          : includesAny(text, ['คาเฟ่', 'กาแฟ', 'cafe', 'coffee', '咖啡'])
            ? 'cafe'
            : includesAny(text, ['อาหาร', 'restaurant', 'food', 'ร้าน', '餐厅', '美食'])
              ? 'food'
              : includesAny(text, ['โรงแรม', 'รีสอร์ต', 'โฮมสเตย์', 'hotel', 'resort', 'homestay', '酒店'])
                ? 'accommodation' : null;

  return {
    category,
    // A place name must be resolved against the database. Guessing one here
    // would make a spelling fragment become a destination that does not exist.
    placeName: null,
    time,
    budgetBaht: money ? Number(money.replaceAll(',', '')) : null,
    travelMode: includesAny(text, ['เดินเท้า', 'เดินไป', 'walk', '步行'])
      ? 'walk'
      : includesAny(text, ['ขับรถ', 'รถยนต์', 'drive', '开车']) ? 'drive' : null,
    // "ชิล" and "chill" are how a traveller asks for somewhere unhurried. They
    // were not here, so the one phrase the specification names by name -
    // "มีที่เที่ยวชิล ๆ มั้ย" - reached the ranking with no preference at all.
    quiet: includesAny(text, ['เงียบ', 'สงบ', 'ชิล', 'คนน้อย', 'คนไม่เยอะ', 'คนไม่แน่น', 'ไม่แออัด', 'quiet', 'chill', 'not crowded', 'not busy', 'peaceful', 'relaxed', '安静', '人少', '不拥挤']),
    indoor: includesAny(text, ['ในร่ม', 'indoor', '室内']),
    nearMe: includesAny(text, ['ใกล้ฉัน', 'แถวนี้', 'near me', 'nearby', '附近']),
    familyFriendly: includesAny(text, ['เด็ก', 'ครอบครัว', 'family-friendly', 'family friendly', 'children', 'kids', '亲子', '儿童', '家庭']),
    /*
      MEASURED 17 November, three natural phrasings in a row that did not
      count as "more": "แล้วที่อื่นล่ะ", "ขอเพิ่มอีก", "มีอีกไหม". The list held
      only "ที่อื่นอีก", "ขออีก" and "เพิ่มเติม", so pagination never engaged
      and the same three places came back for as long as anybody kept asking.

      A false positive on a FIRST message costs nothing: with no previous
      search there is nothing to exclude.
    */
    showMore: includesAny(text, [
      'เพิ่มเติม', 'ที่อื่น', 'อื่นอีก', 'อย่างอื่น', 'ดูเพิ่ม', 'ดูสถานที่เพิ่ม', 'ขอเพิ่ม', 'เพิ่มอีก',
      'เอาอีก', 'ขออีก', 'มีอีก', 'อีกไหม', 'อีกมั้ย', 'ที่เหลือ',
      'show more', 'more places', 'more options', 'other places', 'anything else', 'what else',
      '其他', '更多', '还有', '别的',
    ])
      || /อีก\s*\d{1,2}\s*(?:ที่|แห่ง)?/i.test(text),
    closest: includesAny(text, ['ใกล้ที่สุด', 'อันไหนใกล้', 'closest', 'nearest', '最近']),
  };
};

const actionFor = (intent: TravelIntent): string[] => ({
  TOURISM: ['search_places'],
  WEATHER: ['get_weather'],
  CROWD: ['get_crowd_information'],
  RESTAURANT: ['search_places'],
  ACCOMMODATION: ['search_places'],
  TRIP_PLANNING: ['retrieve_places', 'open_trip_planner'],
  NAVIGATION: ['retrieve_selected_destination', 'open_router'],
  GENERAL: [],
  SAFETY: ['retrieve_verified_emergency_information'],
})[intent];

/** Fast, deterministic first pass. Groq is used only below the confidence threshold. */
/*
  THE KEYWORD LISTS.

  Lifted out of the if/else they used to sit inside, because the chain now
  reads several of them before it decides rather than stopping at the first
  hit. They are also wider than they were: the first set covered the way a
  specification writes a request, and travellers type "หิว", "นอนไหนดี" and
  "any chill spots?" instead. Every one of those classified as GENERAL.

  Latin entries are matched on word boundaries, Thai and Chinese as
  substrings - see `matchesKeyword` for why that difference has to exist.
*/
const SAFETY_WORDS = ['ช่วยด้วย', 'ฉุกเฉิน', 'อุบัติเหตุ', 'จมน้ำ', 'บาดเจ็บ', 'เลือดออก', 'โรงพยาบาล', 'ตำรวจ', 'sos', 'emergency', 'ambulance', 'drowning', 'injured', 'hospital', 'police', '救命', '紧急', '医院', '警察'];

const WEATHER_WORDS = ['ฝน', 'อากาศ', 'พยากรณ์', 'ร้อน', 'weather', 'rain', 'forecast', 'temperature', '天气', '下雨', '气温'];

const CROWD_WORDS = ['คนเยอะ', 'คนน้อย', 'คนไม่เยอะ', 'คนไม่แน่น', 'แออัด', 'ความหนาแน่น', 'crowd', 'crowded', 'not crowded', 'not busy', 'busy', '人多', '人少', '拥挤', '不拥挤'];

const NAVIGATION_WORDS = ['ไปยังไง', 'เดินทางไป', 'นำทาง', 'เส้นทาง', 'พาไป', 'how to get', 'directions', 'navigate', 'route', 'take me there', '怎么去', '导航', '路线', '带我去'];

const TRIP_WORDS = ['วางแผน', 'จัดทริป', 'แพลน', 'itinerary', 'plan my', 'plan a trip', '行程', '计划'];

const RESTAURANT_WORDS = [
  'ร้านอาหาร', 'คาเฟ่', 'กาแฟ', 'ของกิน', 'หิว', 'กินข้าว', 'ที่กิน', 'อยากกิน', 'หาอะไรกิน',
  'restaurant', 'cafe', 'food', 'eat', 'hungry', 'breakfast', 'lunch', 'dinner', 'brunch',
  '餐厅', '咖啡', '美食', '吃饭', '饿',
];

const ACCOMMODATION_WORDS = [
  'ที่พัก', 'โรงแรม', 'รีสอร์ต', 'โฮมสเตย์', 'นอนไหน', 'ที่นอน', 'พักที่ไหน',
  'accommodation', 'hotel', 'resort', 'homestay', 'where to stay', 'place to stay', 'somewhere to stay',
  '住宿', '酒店', '住哪',
];

const TOURISM_WORDS = [
  'ที่เที่ยว', 'เที่ยวไหนดี', 'ไปไหนดี', 'แนะนำที่', 'เที่ยว', 'ที่ไหนดี', 'มุมสงบ', 'ชิล',
  'พระอาทิตย์ตก', 'พระอาทิตย์ขึ้น', 'จุดชมวิว', 'วิวสวย',
  'places to visit', 'place to visit', 'where should', 'recommend', 'attraction', 'sightseeing',
  'things to do', 'what to do', 'to do here', 'chill', 'spots', 'spot', 'somewhere quiet',
  'viewpoint', 'sunset', 'sunrise',
  '景点', '去哪', '日落', '观景',
];

export function classifyTravel(input: string, previous: ConversationContext | null = null): TravelAnalysis {
  const language = detectLang(input);
  const text = input.trim().toLowerCase();
  const entities = entitiesFor(input);
  const shortFollowUp = text.length <= 28 && previous?.currentIntent !== null;

  let intent: TravelIntent = 'GENERAL';
  let confidence = 0.45;
  let sentiment: TravelAnalysis['sentiment'] = 'neutral';
  let inheritedIntent = false;

  const asksWeather = includesAny(text, WEATHER_WORDS);
  const asksCrowd = includesAny(text, CROWD_WORDS);
  /*
    THE CATEGORY DECIDES WHICH SEARCH, NOT JUST WHICH FILTER.

    `asksPlaces` used to be true for ANY extracted category, so a question
    whose category was `food` went to TOURISM and came back with attractions.
    It showed up on a misspelling - "ร้านอาหานแนะนำ" misses the restaurant
    keyword but still extracts `food` from ร้าน - and it was wrong at 0.90,
    above the threshold, so nothing downstream would have questioned it.
  */
  const foodCategory = entities.category === 'food' || entities.category === 'cafe';
  const stayCategory = entities.category === 'accommodation';
  const asksFood = foodCategory || includesAny(text, RESTAURANT_WORDS);
  const asksStay = stayCategory || includesAny(text, ACCOMMODATION_WORDS);
  const asksPlaces = (entities.category !== null && !foodCategory && !stayCategory)
    || entities.familyFriendly
    || includesAny(text, TOURISM_WORDS);

  /*
    A PLACE WORD DECIDES THE QUESTION; WEATHER AND CROWD QUALIFY IT.

    This was an ordered if/else, so the first list to match won outright.
    "ร้านกาแฟเงียบๆ ตอนฝนตก" is a request for a quiet cafe, with the rain as
    the reason - and it classified as WEATHER, so the traveller got a forecast
    and no cafes. "ที่เที่ยวคนไม่เยอะ" went to CROWD for the same reason: a
    crowd comparison of nothing, because no search had been run.

    Both words are real signals, but they are ADJECTIVES on a place search far
    more often than they are the search itself. So they only take the question
    when nothing else is being asked for; otherwise `entities.quiet` carries
    the preference into the ranking, which is where it was always meant to go.
  */
  const placeSearch = asksFood || asksStay || asksPlaces;

  if (includesAny(text, SAFETY_WORDS)) {
    intent = 'SAFETY'; confidence = 0.99; sentiment = 'concerned';
  } else if (includesAny(text, NAVIGATION_WORDS)) {
    intent = 'NAVIGATION'; confidence = 0.95;
  } else if (includesAny(text, TRIP_WORDS)) {
    intent = 'TRIP_PLANNING'; confidence = 0.94;
  } else if (asksWeather && !placeSearch) {
    intent = 'WEATHER'; confidence = 0.94;
  } else if (asksCrowd && !placeSearch) {
    intent = 'CROWD'; confidence = 0.94;
  } else if (asksFood) {
    intent = 'RESTAURANT'; confidence = 0.93;
  } else if (asksStay) {
    intent = 'ACCOMMODATION'; confidence = 0.94;
  } else if (asksPlaces) {
    intent = 'TOURISM'; confidence = entities.category ? 0.9 : 0.82;
  } else if (includesAny(text, ['สวัสดี', 'ขอบคุณ', 'ทำอะไรได้', 'hello', 'thanks', 'what can you do', '你好', '谢谢'])
      || /(?:^|\s)hi(?:[!,.?\s]|$)/i.test(text)) {
    intent = 'GENERAL'; confidence = 0.95;
  } else if ((shortFollowUp || entities.showMore || entities.closest) && previous?.currentIntent) {
    // "More" after a crowd comparison continues the underlying place search,
    // not the comparison operation itself. Otherwise only the three compared
    // records are searched and pagination can never advance.
    intent = entities.showMore && previous.currentIntent === 'CROWD'
      ? (previous.previousIntent === 'TOURISM' || previous.previousIntent === 'RESTAURANT' || previous.previousIntent === 'ACCOMMODATION'
        ? previous.previousIntent
        : 'TOURISM')
      : previous.currentIntent;
    confidence = 0.72;
    inheritedIntent = true;
  }

  const contextReference = intent === 'NAVIGATION' && previous?.selectedDestination
    ? 'selected_destination'
    : (inheritedIntent || intent === 'CROWD') && (previous?.lastSearchResults.length ?? 0) > 0
      ? 'previous_search'
      : 'none';

  const needsClarification = intent === 'NAVIGATION'
    && !previous?.selectedDestination
    && (previous?.lastSearchResults.length ?? 0) !== 1;

  return {
    intent, confidence, language, entities, contextReference,
    requiredActions: actionFor(intent), needsClarification, sentiment,
  };
}

export function mergeConversationContext(
  previous: ConversationContext,
  analysis: TravelAnalysis,
  update: { location?: TravelLocation | null; resultPlaceIds?: string[]; selectedDestination?: string | null; selectedArea?: AreaKey | null } = {},
): ConversationContext {
  const results = update.resultPlaceIds ?? [];
  const categories = analysis.entities.category
    ? [...new Set([...previous.preferredCategories, analysis.entities.category])].slice(-6)
    : previous.preferredCategories;
  return {
    ...previous,
    previousIntent: previous.currentIntent,
    currentIntent: analysis.intent,
    currentLocation: update.location ?? previous.currentLocation,
    selectedDestination: update.selectedDestination ?? previous.selectedDestination,
    selectedArea: update.selectedArea ?? previous.selectedArea,
    selectedPlaces: results.length > 0
      ? [...new Set([...previous.selectedPlaces, ...results])].slice(-50)
      : previous.selectedPlaces,
    travelDate: analysis.entities.time ?? previous.travelDate,
    budget: analysis.entities.budgetBaht ?? previous.budget,
    preferredCategories: categories,
    travelMode: analysis.entities.travelMode ?? previous.travelMode,
    language: analysis.language,
    lastSearchResults: results.length > 0 ? results : previous.lastSearchResults,
  };
}

export function quickRepliesFor(intent: TravelIntent, lang: Lang): string[] {
  const values: Record<TravelIntent, Record<Lang, string[]>> = {
    TOURISM: { th: ['ดูสถานที่เพิ่ม', 'คนเยอะไหม', 'เดินทางอย่างไร'], en: ['Show more places', 'Is it crowded?', 'How do I get there?'], zh: ['查看更多地点', '人多吗？', '怎么去？'] },
    RESTAURANT: { th: ['เปิดอยู่ไหม', 'เดินทางอย่างไร', 'มีร้านอื่นใกล้ ๆ ไหม'], en: ['Is it open?', 'How do I get there?', 'Other places nearby?'], zh: ['营业吗？', '怎么去？', '附近还有别家吗？'] },
    ACCOMMODATION: { th: ['ใกล้ที่เที่ยวไหม', 'เดินทางอย่างไร'], en: ['Is it near attractions?', 'How do I get there?'], zh: ['离景点近吗？', '怎么去？'] },
    WEATHER: { th: ['พรุ่งนี้เป็นอย่างไร', 'ถ้าฝนตกควรไปไหน', 'มีสถานที่ในร่มไหม'], en: ['What about tomorrow?', 'Where if it rains?', 'Any indoor places?'], zh: ['明天呢？', '下雨去哪？', '有室内地点吗？'] },
    CROWD: { th: ['ที่ไหนคนน้อยกว่า', 'เดินทางอย่างไร'], en: ['Which is quieter?', 'How do I get there?'], zh: ['哪里人更少？', '怎么去？'] },
    TRIP_PLANNING: { th: ['ปรับแผนเที่ยว', 'ลดงบประมาณ', 'เริ่มนำทาง'], en: ['Adjust the plan', 'Lower the budget', 'Start navigation'], zh: ['调整行程', '降低预算', '开始导航'] },
    NAVIGATION: { th: ['เปิดแผนที่', 'เลือกจุดเริ่มต้น'], en: ['Open the map', 'Choose a starting point'], zh: ['打开地图', '选择起点'] },
    GENERAL: { th: ['แนะนำที่เที่ยว', 'วันนี้ฝนตกไหม', 'หาร้านอาหาร'], en: ['Recommend a place', 'Will it rain today?', 'Find food'], zh: ['推荐景点', '今天下雨吗？', '找餐厅'] },
    SAFETY: { th: [], en: [], zh: [] },
  };
  return values[intent][lang];
}
