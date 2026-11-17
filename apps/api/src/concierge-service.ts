/** The complete hybrid concierge pipeline: context -> NLU -> data -> prose. */

import {
  KOH_SICHANG_EMERGENCY,
  answer,
  areaByKey,
  classifyTravel,
  crowdLabel,
  inArea,
  localise,
  mergeConversationContext,
  quickRepliesFor,
  weatherDescription,
  type AreaKey,
  type ConciergeChatData,
  type ConciergeEvidence,
  type ConversationContext,
  type PlaceRecommendationSet,
  type TripRecommendation,
  type Reply,
  type ScoredPlace,
  type TravelAnalysis,
  type TravelLocation,
} from '@chivago/core';
import type { DB } from './db.ts';
import { transact } from './db.ts';
import { listScoredPlaces } from './repo.ts';
import {
  isAccommodation, isTourismAttraction, matchesRecommendationCategory, recommendPlaces, recommendationDistanceKm,
} from './place-recommendation.ts';
import { getWeather } from './weather.ts';
import {
  conversationFor, recentConversationMessages, saveConversationTurn,
} from './concierge-context.ts';
import {
  GroqError, analyzeWithGroq, generateWithGroq, type GroqConciergeConfig,
} from './groq-concierge.ts';

export interface ConciergeRequest {
  userId: string;
  message: string;
  area: AreaKey;
  conversationId: string | null;
  location: TravelLocation | null;
}

export interface ConciergeDeps {
  groq: GroqConciergeConfig;
  fetchImpl?: typeof fetch;
  now?: Date;
}

const distanceKm = recommendationDistanceKm;

const AREA_ALIASES: readonly { key: AreaKey; aliases: readonly string[] }[] = [
  { key: 'koh-sichang', aliases: ['เกาะสีชัง', 'เกาะสีชาง', 'koh sichang', 'ko sichang', '锡昌岛'] },
  { key: 'samui', aliases: ['เกาะสมุย', 'koh samui', 'ko samui', 'samui', '苏梅岛'] },
  { key: 'ku-sriracha', aliases: ['มก. ศรีราชา', 'มก ศรีราชา', 'ku sriracha', 'เกษตรศรีราชา', '是拉差校区'] },
  { key: 'ku-bangkhen', aliases: ['มก. บางเขน', 'มก บางเขน', 'ku bangkhen', 'เกษตรบางเขน', '邦肯校区'] },
  { key: 'rmutt', aliases: ['มทร.ธัญบุรี', 'มทร ธัญบุรี', 'rmutt', 'ราชมงคลธัญบุรี'] },
];

const areaMentionedIn = (message: string): AreaKey | null => {
  const text = message.toLowerCase();
  return AREA_ALIASES.find((entry) => entry.aliases.some((alias) => text.includes(alias)))?.key ?? null;
};

const requestedCountIn = (message: string): number | null => {
  const match = message.match(/(?:ขอ|เอา|เพิ่ม|อีก|show|more|เพิ่มอีก)\s*(\d{1,2})\s*(?:ที่|แห่ง|places?)?/i)
    ?? message.match(/(\d{1,2})\s*(?:ที่|แห่ง|places?)/i);
  if (!match) return null;
  const count = Number(match[1]);
  return Number.isInteger(count) ? Math.max(1, Math.min(10, count)) : null;
};

const orderTripStops = (places: ScoredPlace[], origin: TravelLocation | null): ScoredPlace[] => {
  if (places.length < 2) return places;
  const remaining = [...places];
  const ordered: ScoredPlace[] = [];
  let at: TravelLocation = origin ?? { lat: remaining[0]!.lat, lng: remaining[0]!.lng, accuracyM: null };
  while (remaining.length) {
    remaining.sort((a, b) => distanceKm(at, a) - distanceKm(at, b) || a.id.localeCompare(b.id));
    const next = remaining.shift()!;
    ordered.push(next);
    at = { lat: next.lat, lng: next.lng, accuracyM: null };
  }
  return ordered;
};

const placeNamedIn = (message: string, places: ScoredPlace[], modelName: string | null): ScoredPlace | null => {
  const needle = message.toLowerCase();
  if (modelName) {
    const exact = places.find((place) => [place.name.en, place.name.th, place.name.zh]
      .some((name) => typeof name === 'string' && name.toLowerCase() === modelName.toLowerCase()));
    if (exact) return exact;
  }
  return places.find((place) => [place.name.en, place.name.th, place.name.zh]
    .some((name) => typeof name === 'string' && name.length >= 4 && needle.includes(name.toLowerCase()))) ?? null;
};

const trustedActions = (analysis: TravelAnalysis): string[] => ({
  TOURISM: ['search_places'], WEATHER: ['get_weather'], CROWD: ['get_crowd_information'],
  RESTAURANT: ['search_places'], ACCOMMODATION: ['search_places'],
  TRIP_PLANNING: ['retrieve_places', 'open_trip_planner'],
  NAVIGATION: ['retrieve_selected_destination', 'open_router'], GENERAL: [],
  SAFETY: ['retrieve_verified_emergency_information'],
})[analysis.intent];

const localNotice = (lang: TravelAnalysis['language'], configured: boolean): string => {
  if (lang === 'th') return configured
    ? 'Groq ตอบไม่สำเร็จในครั้งนี้ จึงแสดงคำตอบจากข้อมูลจริงและกฎของ ChivaGo แทน'
    : 'ยังไม่ได้ตั้งค่า Groq API จึงใช้ข้อมูลจริงและกฎของ ChivaGo ในการตอบ';
  if (lang === 'zh') return configured
    ? 'Groq 本次无法响应，已改用 ChivaGo 的真实数据与规则。'
    : '尚未配置 Groq API，当前使用 ChivaGo 的真实数据与规则。';
  return configured
    ? 'Groq could not answer this time, so ChivaGo is showing a verified rules-based answer.'
    : 'Groq is not configured, so ChivaGo is using its verified rules-based answer.';
};

const mappedIntent = (analysis: TravelAnalysis): Reply['intent'] => ({
  SAFETY: 'emergency', NAVIGATION: 'route', TRIP_PLANNING: 'plan',
  TOURISM: 'recommend', WEATHER: 'recommend', CROWD: 'recommend',
  RESTAURANT: 'recommend', ACCOMMODATION: 'recommend', GENERAL: 'unknown',
})[analysis.intent] as Reply['intent'];

const textFor = (
  analysis: TravelAnalysis,
  places: ScoredPlace[],
  weather: Awaited<ReturnType<typeof getWeather>> | null,
  context: ConversationContext,
): string => {
  const lang = analysis.language;
  const name = places[0] ? localise(places[0].name, lang) : null;
  const list = places.slice(0, 3).map((place) => localise(place.name, lang)).join(lang === 'zh' ? '、' : ', ');
  const noPlaces = lang === 'th' ? 'ยังไม่พบสถานที่จริงในพื้นที่นี้ที่ตรงกับคำขอ' : lang === 'zh' ? '该区域暂未找到符合条件的真实地点。' : 'No verified place in this area matches that request yet.';
  /*
    ASKING FOR MORE AND GETTING NOTHING IS NOT THE SAME AS FINDING NOTHING.

    After a page of results, "ขอเพิ่มอีก" that excludes everything already
    shown leaves an empty set - and answering it with "nothing here matches"
    tells the traveller the island is empty, when what happened is that they
    reached the end of it. Ko Sichang has one stay and seven places; the end
    arrives quickly and has to sound like the end.
  */
  const nothingMore = lang === 'th' ? 'หมดแล้วครับ พื้นที่นี้ไม่มีที่อื่นนอกจากที่แสดงไปแล้ว'
    : lang === 'zh' ? '就这些了，这个区域没有已显示之外的地点。'
      : 'That is all of them - this area has nothing beyond what was already shown.';
  const empty = analysis.entities.showMore ? nothingMore : noPlaces;

  switch (analysis.intent) {
    case 'WEATHER': {
      if (analysis.entities.time === 'tomorrow' || analysis.entities.time === 'weekend') {
        return lang === 'th' ? 'ตอนนี้ ChivaGo มีเฉพาะข้อมูลอากาศปัจจุบัน ยังไม่มีพยากรณ์ของวันที่ถาม จึงไม่ขอเดาสภาพอากาศให้ครับ'
          : lang === 'zh' ? 'ChivaGo 目前只有实时天气，没有该日期的预报，因此不会猜测。'
            : 'ChivaGo currently has current conditions only, not a forecast for that date, so I will not guess.';
      }
      if (!weather || weather.observedAt === null) return lang === 'th' ? 'ตอนนี้ยังอ่านข้อมูลอากาศจากแหล่งข้อมูลไม่ได้ ลองใหม่อีกครั้งได้ครับ' : lang === 'zh' ? '目前无法读取天气来源，请稍后重试。' : 'Weather data is unavailable right now. Please try again.';
      const condition = weatherDescription(weather.weatherCode);
      const pieces = [
        weather.tempC === null ? null : `${weather.tempC.toFixed(1)}°C`,
        condition ? localise(condition, lang) : null,
        weather.rainMm === null ? null : (lang === 'th' ? `ฝน ${weather.rainMm.toFixed(1)} มม.` : lang === 'zh' ? `降雨 ${weather.rainMm.toFixed(1)} 毫米` : `rain ${weather.rainMm.toFixed(1)} mm`),
      ].filter(Boolean).join(' · ');
      return lang === 'th' ? `ข้อมูลล่าสุดจาก Open-Meteo: ${pieces}` : lang === 'zh' ? `Open-Meteo 最新数据：${pieces}` : `Latest Open-Meteo reading: ${pieces}`;
    }
    case 'CROWD':
      if (!places.length) return empty;
      return lang === 'th' ? `${name} มีค่าประเมินความหนาแน่นต่ำสุดในตัวเลือกนี้ ข้อมูลเช็กอินหนึ่งชั่วโมงล่าสุดแสดงบนการ์ด และไม่ใช่จำนวนคนทั้งหมดในสถานที่`
        : lang === 'zh' ? `${name} 在这些选项中的估算密度最低。卡片显示最近一小时的签到数，并不代表现场总人数。`
          : `${name} has the lowest estimated density in this set. The card shows last-hour ChivaGo check-ins, not the total number of people there.`;
    case 'NAVIGATION':
      if (!name) return lang === 'th' ? 'ต้องการไปสถานที่ไหนครับ เลือกหนึ่งสถานที่จากผลก่อนหน้าแล้วถามว่า “ไปยังไง” ได้เลย' : lang === 'zh' ? '你想去哪里？请先从之前的结果中选择一个地点。' : 'Which place do you want to reach? Choose one from the previous results first.';
      return lang === 'th' ? `พร้อมเปิดระบบนำทางไป ${name} เส้นทางจริงจะคำนวณโดยระบบ Routing ของ ChivaGo จากจุดเริ่มต้นที่คุณเลือก`
        : lang === 'zh' ? `可以打开前往 ${name} 的导航。实际路线将由 ChivaGo 路由系统从你选择的起点计算。`
          : `I can open navigation to ${name}. ChivaGo's routing system will calculate the real route from your chosen starting point.`;
    case 'TRIP_PLANNING':
      return places.length ? (lang === 'th' ? `เริ่มแผนจาก ${list} ได้ครับ เปิดตัวจัดทริปเพื่อเรียงจุดและคำนวณการเดินทางจากข้อมูลจริง` : lang === 'zh' ? `可以从 ${list} 开始规划。打开行程规划器以使用真实数据排序并计算路程。` : `A plan can start with ${list}. Open the trip planner to order stops and calculate travel from real data.`) : empty;
    case 'RESTAURANT':
      return places.length ? (lang === 'th' ? `เจอตัวเลือกอาหารจากฐานข้อมูล ChivaGo: ${list}` : lang === 'zh' ? `在 ChivaGo 数据库中找到：${list}` : `I found these food options in ChivaGo: ${list}`) : empty;
    case 'ACCOMMODATION':
      return places.length ? (lang === 'th' ? `พบที่พักจากข้อมูล ChivaGo: ${list} แต่ยังยืนยันห้องว่างหรือราคาปัจจุบันไม่ได้` : lang === 'zh' ? `ChivaGo 中找到住宿：${list}，但无法确认实时房态或价格。` : `ChivaGo has these stays: ${list}. Live room availability and current prices are not verified.`) : empty;
    case 'TOURISM':
      return places.length ? (lang === 'th' ? `มีตัวเลือกที่ตรงกับสิ่งที่ถามครับ: ${list}` : lang === 'zh' ? `这些地点符合你的要求：${list}` : `These places match what you asked for: ${list}`) : empty;
    case 'GENERAL':
      if (context.currentIntent) return lang === 'th' ? 'ผมช่วยค้นหาที่เที่ยว ร้านอาหาร ที่พัก อากาศ ความหนาแน่น วางแผนทริป และเปิดระบบนำทางจากข้อมูลจริงของ ChivaGo ได้ครับ' : lang === 'zh' ? '我可以使用 ChivaGo 的真实数据查找景点、餐厅、住宿、天气、人流、规划行程并打开导航。' : 'I can use verified ChivaGo data to find places, food, stays, weather, crowd information, plan a trip, and open navigation.';
      return lang === 'th' ? 'สวัสดีครับ อยากเที่ยวแบบไหน หรืออยากเช็กอากาศ ร้านอาหาร และสถานที่ใกล้ตัวก็บอกได้เลย' : lang === 'zh' ? '你好！想怎样旅行？也可以询问天气、餐厅或附近地点。' : 'Hello! Tell me what kind of trip you want, or ask about weather, food, and nearby places.';
    case 'SAFETY':
      return '';
  }
};

const suggestionFor = (place: ScoredPlace, location: TravelLocation | null, lang: TravelAnalysis['language']): Reply['suggestions'][number] => {
  const estimated = crowdLabel(place.metrics.crowdDensity);
  const because = {
    en: `${estimated.en} (survey estimate) · ${place.crowd?.checkinsLastHour ?? 0} ChivaGo check-ins in the last hour`,
    th: `${estimated.th} (ค่าประเมินจากการสำรวจ) · เช็กอิน ChivaGo ${place.crowd?.checkinsLastHour ?? 0} ครั้งในชั่วโมงล่าสุด`,
    zh: `${estimated.zh ?? estimated.en}（调查估算）· 最近一小时 ${place.crowd?.checkinsLastHour ?? 0} 次 ChivaGo 签到`,
  };
  return {
    placeId: place.id, name: place.name, because,
    photoUrl: place.photo?.url ?? null,
    distanceKm: location ? Number(distanceKm(location, place).toFixed(1)) : null,
    crowd: {
      checkinsLastHour: place.crowd?.checkinsLastHour ?? 0,
      estimateLabel: estimated,
      provenance: 'live-checkins-plus-estimate',
    },
  };
};

export async function processConcierge(
  db: DB,
  request: ConciergeRequest,
  deps: ConciergeDeps,
): Promise<ConciergeChatData> {
  const now = deps.now ?? new Date();
  const conversation = conversationFor(db, request.userId, request.area, request.conversationId, request.message, now);
  const recent = recentConversationMessages(db, conversation.id, 8);
  let analysis = classifyTravel(request.message, conversation.context);
  let groqFailed: GroqError | null = null;
  const mentionedArea = areaMentionedIn(request.message);
  const deterministicPlaceOperation = mentionedArea !== null || analysis.entities.showMore
    || analysis.entities.closest || analysis.intent === 'CROWD';

  // Emergencies never wait for a model. Clear high-confidence rules also save
  // latency and rate-limit budget; Groq handles ambiguity and follow-ups.
  if (analysis.intent !== 'SAFETY' && !deterministicPlaceOperation && deps.groq.enabled && analysis.confidence < 0.86) {
    try {
      analysis = await analyzeWithGroq(request.message, conversation.context, recent, deps.groq, deps.fetchImpl);
    } catch (error) {
      groqFailed = error instanceof GroqError ? error : new GroqError('Groq analysis failed');
      console.warn(`[concierge] Groq analysis unavailable: ${groqFailed.message}`);
    }
  }
  analysis = { ...analysis, requiredActions: trustedActions(analysis) };

  const effectiveAreaKey = mentionedArea ?? conversation.context.selectedArea ?? request.area;
  const area = areaByKey(effectiveAreaKey);
  const allPlaces = (await listScoredPlaces(db, request.userId)).filter((place) => inArea(area, place));
  const named = placeNamedIn(request.message, allPlaces, analysis.entities.placeName);
  if (named) {
    // The destination is accepted only after resolving it against ChivaGo's
    // database; neither the client nor the model can create a place here.
    analysis = { ...analysis, entities: { ...analysis.entities, placeName: named.name.en } };
  }
  const priorIds = conversation.context.lastSearchResults;
  const priorPlaces = priorIds.map((id) => allPlaces.find((place) => place.id === id)).filter((p): p is ScoredPlace => Boolean(p));
  const comparePriorResults = !analysis.entities.showMore
    && (analysis.entities.closest || analysis.intent === 'CROWD' || analysis.intent === 'NAVIGATION');
  let pool = analysis.contextReference !== 'none' && priorPlaces.length && comparePriorResults ? priorPlaces : allPlaces;

  if (analysis.intent === 'RESTAURANT') pool = pool.filter((place) => place.layer === 'Food');
  if (analysis.intent === 'ACCOMMODATION') pool = pool.filter(isAccommodation);
  if ((analysis.intent === 'TOURISM' || analysis.intent === 'TRIP_PLANNING') && !analysis.entities.showMore) {
    pool = pool.filter((place) => isTourismAttraction(place) && matchesRecommendationCategory(place, analysis.entities.category));
  }
  if (analysis.intent === 'CROWD' && !(analysis.contextReference !== 'none' && priorPlaces.length)) {
    pool = pool.filter(isTourismAttraction);
  }
  if (analysis.entities.indoor) pool = pool.filter((place) => /indoor|ในร่ม|อาคาร|museum|พิพิธภัณฑ์/i.test([place.meta, place.blurb.en, place.blurb.th, ...place.tags].join(' ')));
  if (named) pool = [named];

  const location = request.location ?? conversation.context.currentLocation;
  pool = [...pool].sort((a, b) => {
    if (analysis.intent === 'CROWD' || analysis.entities.quiet) return a.metrics.crowdDensity - b.metrics.crowdDensity;
    if ((analysis.entities.nearMe || analysis.intent === 'NAVIGATION') && location) return distanceKm(location, a) - distanceKm(location, b);
    return b.healthyScore - a.healthyScore;
  });

  const recommendationIntent = analysis.intent === 'TOURISM' || analysis.intent === 'CROWD' || analysis.intent === 'RESTAURANT'
    || analysis.intent === 'ACCOMMODATION' || analysis.intent === 'TRIP_PLANNING';
  let recommendations: PlaceRecommendationSet | null = null;
  let tripRecommendation: TripRecommendation | null = null;
  let selected: ScoredPlace[];
  if (recommendationIntent) {
    const ranked = recommendPlaces({
      places: pool, analysis, context: conversation.context, location, now,
      pageSize: analysis.entities.closest ? 1 : requestedCountIn(request.message) ?? 3,
      allowPreviouslyRecommended: Boolean(named || analysis.entities.closest || !analysis.entities.showMore),
    });
    recommendations = ranked.set;
    selected = ranked.selected;
    if (analysis.intent === 'TRIP_PLANNING' && selected.length) {
      selected = orderTripStops(selected, location);
      tripRecommendation = {
        title: { en: 'AI trip recommendation', th: 'ทริปแนะนำจาก AI', zh: 'AI 行程推荐' },
        durationLabel: {
          en: `Half-day · ${selected.length} ${selected.length === 1 ? 'place' : 'places'}`,
          th: `ครึ่งวัน · ${selected.length} สถานที่`,
          zh: `半日 · ${selected.length} 个地点`,
        },
        stops: selected.map((place, index) => ({
          order: index + 1,
          placeId: place.id,
          name: place.name,
          coordinates: { lat: place.lat, lng: place.lng },
        })),
        routeStatus: 'calculate-on-map',
        limitation: {
          en: 'Stops are ordered by geographic proximity. ChivaGo Routing calculates the actual route when you open the map.',
          th: 'ลำดับจุดตามความใกล้ทางภูมิศาสตร์ ระบบ Routing ของ ChivaGo จะคำนวณเส้นทางจริงเมื่อเปิดแผนที่',
          zh: '站点按地理距离排序；打开地图后由 ChivaGo 路由系统计算实际路线。',
        },
      };
    }
  } else {
    selected = pool.slice(0, 3);
  }
  if (analysis.intent === 'WEATHER' || analysis.intent === 'GENERAL' || analysis.intent === 'SAFETY') selected = [];
  let destination = named?.id ?? conversation.context.selectedDestination;
  // A crowd comparison names one clear lead (the quietest result), so a
  // following “ไปยังไง” has an unambiguous destination to resolve.
  if (analysis.intent === 'CROWD' && selected[0]) destination = selected[0].id;
  if (analysis.entities.closest && selected[0]) destination = selected[0].id;
  if (recommendationIntent && selected.length === 1) destination = selected[0]!.id;
  if (analysis.intent === 'NAVIGATION' && !destination && priorPlaces.length === 1) destination = priorPlaces[0]!.id;
  if (analysis.intent === 'NAVIGATION' && destination) {
    const target = allPlaces.find((place) => place.id === destination);
    selected = target ? [target] : [];
  }

  const shouldReadWeather = analysis.intent === 'WEATHER';
  const weather = shouldReadWeather ? await getWeather(effectiveAreaKey, deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}) : null;
  const evidence: ConciergeEvidence[] = [];
  if (selected.length) evidence.push({ kind: 'places', label: 'ChivaGo places', source: 'ChivaGo database', fetchedAt: now.toISOString(), validity: 'recent' });
  if (analysis.intent === 'CROWD' && selected.length) evidence.push({ kind: 'crowd', label: 'Crowd information', source: 'Last-hour ChivaGo check-ins + labelled survey estimate (not a live headcount)', fetchedAt: now.toISOString(), validity: 'estimated' });
  if (weather) evidence.push({
    kind: 'weather', label: 'Weather', source: weather.source, fetchedAt: weather.observedAt,
    validity: weather.observedAt === null ? 'unavailable'
      : weather.provenance === 'live' ? 'live'
        : weather.provenance === 'stale' ? 'stale' : 'estimated',
  });
  if (analysis.intent === 'NAVIGATION') evidence.push({ kind: 'routing', label: 'Route', source: destination ? 'Calculated when ChivaGo router opens' : 'Destination not selected', fetchedAt: null, validity: destination ? 'recent' : 'unavailable' });

  let nextContext = mergeConversationContext(conversation.context, analysis, {
    location: request.location,
    resultPlaceIds: selected.map((place) => place.id),
    selectedDestination: destination,
    selectedArea: effectiveAreaKey,
  });

  let reply: Reply;
  if (analysis.intent === 'SAFETY') {
    reply = answer(request.message, { places: allPlaces, quests: [] });
    if (reply.intent !== 'emergency') {
      reply = {
        intent: 'emergency', lang: analysis.language, suggestions: [], action: 'safety',
        dial: KOH_SICHANG_EMERGENCY.filter((item) => item.scope === 'national').map((item) => ({ name: item.name, printed: item.printed, dial: item.dial })),
        text: analysis.language === 'th' ? 'หากเป็นเหตุฉุกเฉิน โทร 1669 สำหรับรถพยาบาล หรือ 1155 ตำรวจท่องเที่ยว และเปิดหน้าความปลอดภัยเพื่อแชร์ตำแหน่ง'
          : analysis.language === 'zh' ? '如遇紧急情况，请拨打 1669 叫救护车或 1155 联系旅游警察，并打开安全页分享位置。'
            : 'For an emergency call 1669 for an ambulance or 1155 for Tourist Police, and open Safety to share your location.',
      };
    }
  } else {
    const oldReading = answer(request.message, { places: allPlaces, quests: [] });
    const preserveOld = oldReading.intent === 'currency' || oldReading.intent === 'price';
    reply = preserveOld ? oldReading : {
      intent: mappedIntent(analysis), lang: analysis.language,
      text: textFor(analysis, selected, weather, nextContext),
      suggestions: selected.map((place) => suggestionFor(place, location, analysis.language)),
      dial: [],
      action: analysis.intent === 'NAVIGATION' && destination ? 'route'
        : analysis.intent === 'TRIP_PLANNING' ? 'plan'
          : null,
    };
  }

  const facts = {
    dataStatus: evidence,
    resultCount: selected.length,
    places: selected.map((place) => ({
      id: place.id, name: place.name, layer: place.layer,
      ...(recommendationIntent ? {} : { healthyScore: place.healthyScore }),
      crowdEstimate: { densityPer100m2: place.metrics.crowdDensity, provenance: 'estimated survey' },
      chivagoCheckinsLastHour: place.crowd?.checkinsLastHour ?? 0,
      air: place.readings?.aqi ?? { value: place.metrics.aqi, provenance: 'estimated', observedAt: now.toISOString(), source: 'place fallback' },
      distanceKm: location ? Number(distanceKm(location, place).toFixed(1)) : null,
      bookingUrlAvailable: Boolean(place.bookingUrl),
    })),
    weather: weather ? {
      ...weather,
      limitation: analysis.entities.time === 'tomorrow' || analysis.entities.time === 'weekend' ? 'Current-only; no forecast for requested date' : null,
    } : null,
    navigation: analysis.intent === 'NAVIGATION' ? { destinationId: destination, routeNotCalculatedUntilRouterOpens: true } : null,
    recommendations: recommendations ? {
      title: recommendations.title,
      hasMore: recommendations.hasMore,
      limitations: recommendations.limitations,
      items: recommendations.items.map((item) => ({
        placeId: item.placeId,
        name: item.name,
        category: item.category,
        description: item.description,
        coordinates: item.coordinates,
        distanceKm: item.distanceKm,
        rating: item.rating,
        openingStatus: item.openingStatus,
        source: item.source,
        reason: item.reason,
        verificationStatus: item.verificationStatus,
        score: item.score,
      })),
    } : null,
    tripRecommendation,
    appCapabilities: ['verified place search', 'current Open-Meteo conditions', 'last-hour ChivaGo check-in counts', 'estimated crowd density with label', 'trip planner', 'routing screen'],
    fallbackText: reply.text,
  };

  let source: ConciergeChatData['source'] = 'rules';
  if (analysis.intent !== 'SAFETY' && deps.groq.enabled && !groqFailed) {
    try {
      reply = { ...reply, text: await generateWithGroq(request.message, analysis, nextContext.conversationSummary, facts, reply.text, deps.groq, deps.fetchImpl) };
      source = 'groq';
    } catch (error) {
      groqFailed = error instanceof GroqError ? error : new GroqError('Groq response generation failed');
      console.warn(`[concierge] Groq response unavailable: ${groqFailed.message}`);
    }
  }

  const aiNotice = analysis.intent === 'SAFETY' ? null : source === 'groq' ? null : localNotice(analysis.language, deps.groq.enabled);
  transact(db, () => saveConversationTurn(db, conversation, request.message, reply.text, nextContext, now));

  return {
    conversationId: conversation.id,
    reply,
    source,
    model: source === 'groq' ? deps.groq.model : null,
    analysis,
    quickReplies: quickRepliesFor(analysis.intent, analysis.language),
    weather,
    evidence,
    aiNotice,
    retryable: Boolean(groqFailed?.retryable),
    recommendations,
    tripRecommendation,
  };
}
