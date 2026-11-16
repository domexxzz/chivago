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

const includesAny = (text: string, values: readonly string[]): boolean => values.some((value) => text.includes(value));

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
          : includesAny(text, ['คาเฟ่', 'cafe', 'coffee', '咖啡'])
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
    quiet: includesAny(text, ['เงียบ', 'คนน้อย', 'คนไม่เยอะ', 'คนไม่แน่น', 'ไม่แออัด', 'quiet', 'not crowded', 'not busy', 'peaceful', '安静', '人少', '不拥挤']),
    indoor: includesAny(text, ['ในร่ม', 'indoor', '室内']),
    nearMe: includesAny(text, ['ใกล้ฉัน', 'แถวนี้', 'near me', 'nearby', '附近']),
    familyFriendly: includesAny(text, ['เด็ก', 'ครอบครัว', 'family-friendly', 'family friendly', 'children', 'kids', '亲子', '儿童', '家庭']),
    showMore: includesAny(text, ['เพิ่มเติม', 'ที่อื่นอีก', 'ดูเพิ่ม', 'ดูสถานที่เพิ่ม', 'เอาอีก', 'ขออีก', 'show more', 'more places', 'anything else', '其他', '更多'])
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
export function classifyTravel(input: string, previous: ConversationContext | null = null): TravelAnalysis {
  const language = detectLang(input);
  const text = input.trim().toLowerCase();
  const entities = entitiesFor(input);
  const shortFollowUp = text.length <= 28 && previous?.currentIntent !== null;

  let intent: TravelIntent = 'GENERAL';
  let confidence = 0.45;
  let sentiment: TravelAnalysis['sentiment'] = 'neutral';
  let inheritedIntent = false;

  if (includesAny(text, ['ช่วยด้วย', 'ฉุกเฉิน', 'อุบัติเหตุ', 'จมน้ำ', 'บาดเจ็บ', 'เลือดออก', 'โรงพยาบาล', 'ตำรวจ', 'sos', 'emergency', 'ambulance', 'drowning', 'injured', 'hospital', 'police', '救命', '紧急', '医院', '警察'])) {
    intent = 'SAFETY'; confidence = 0.99; sentiment = 'concerned';
  } else if (includesAny(text, ['ฝน', 'อากาศ', 'พยากรณ์', 'ร้อน', 'weather', 'rain', 'forecast', 'temperature', '天气', '下雨', '气温'])) {
    intent = 'WEATHER'; confidence = 0.94;
  } else if (includesAny(text, ['คนเยอะ', 'คนน้อย', 'คนไม่เยอะ', 'คนไม่แน่น', 'แออัด', 'ความหนาแน่น', 'crowd', 'crowded', 'not crowded', 'not busy', 'busy', '人多', '人少', '拥挤', '不拥挤'])) {
    intent = 'CROWD'; confidence = 0.94;
  } else if (includesAny(text, ['ร้านอาหาร', 'คาเฟ่', 'ของกิน', 'หิว', 'restaurant', 'cafe', 'food', 'eat', '餐厅', '咖啡', '美食'])) {
    intent = 'RESTAURANT'; confidence = 0.93;
  } else if (includesAny(text, ['ที่พัก', 'โรงแรม', 'รีสอร์ต', 'โฮมสเตย์', 'accommodation', 'hotel', 'resort', 'homestay', '住宿', '酒店'])) {
    intent = 'ACCOMMODATION'; confidence = 0.94;
  } else if (includesAny(text, ['ไปยังไง', 'เดินทางไป', 'นำทาง', 'เส้นทาง', 'พาไป', 'how to get', 'directions', 'navigate', 'route', 'take me there', '怎么去', '导航', '路线', '带我去'])) {
    intent = 'NAVIGATION'; confidence = 0.95;
  } else if (includesAny(text, ['วางแผน', 'จัดทริป', 'แพลน', 'itinerary', 'plan my', 'plan a trip', '行程', '计划'])) {
    intent = 'TRIP_PLANNING'; confidence = 0.94;
  } else if (entities.category !== null || entities.familyFriendly || includesAny(text, ['ที่เที่ยว', 'เที่ยวไหนดี', 'ไปไหนดี', 'แนะนำที่', 'เที่ยว', 'places to visit', 'where should', 'recommend', 'attraction', '景点', '去哪'])) {
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
