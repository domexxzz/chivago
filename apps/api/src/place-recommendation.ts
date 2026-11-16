/**
 * Deterministic recommendation ranking over real ChivaGo place records.
 *
 * Groq never participates in selection or factual fields. Missing signals are
 * removed from the denominator instead of being represented as a misleading
 * zero, and the configured weight is redistributed over the signals that are
 * actually present for that record.
 */

import {
  type Bilingual,
  type ConversationContext,
  type PlaceRecommendation,
  type PlaceRecommendationSet,
  type RecommendationScoreComponent,
  type ScoredPlace,
  type TravelAnalysis,
  type TravelLocation,
} from '@chivago/core';

export const RECOMMENDATION_WEIGHTS = {
  preference: 35,
  distance: 20,
  reviews: 15,
  popularity: 10,
  diversity: 10,
  freshness: 10,
} as const;

type ScoreKey = keyof typeof RECOMMENDATION_WEIGHTS;
type Weights = Record<ScoreKey, number>;

export interface RecommendationInput {
  places: ScoredPlace[];
  analysis: TravelAnalysis;
  context: ConversationContext;
  location: TravelLocation | null;
  now: Date;
  pageSize?: number;
  /** Named destinations are explicit and may be shown again. */
  allowPreviouslyRecommended?: boolean;
}

export interface RecommendationOutput {
  selected: ScoredPlace[];
  set: PlaceRecommendationSet;
}

const clamp = (n: number): number => Math.max(0, Math.min(100, n));
const rad = (n: number): number => n * Math.PI / 180;
export const recommendationDistanceKm = (a: TravelLocation, b: { lat: number; lng: number }): number => {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6_371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
};

const haystack = (place: ScoredPlace): string => [
  place.name.en, place.name.th, place.name.zh ?? '', place.meta,
  place.blurb.en, place.blurb.th, place.blurb.zh ?? '', ...place.tags,
].join(' ').toLowerCase();

export const isAccommodation = (place: ScoredPlace): boolean => (
  /(hotel|resort|homestay|hostel|cottage|ที่พัก|โรงแรม|รีสอร์ต|โฮมสเตย์|住宿|酒店)/i.test(haystack(place))
);

/**
 * A tourism result must be somewhere a traveller can intentionally visit.
 * Operational map records (hospital, pier, transport, generic shop rows)
 * remain searchable by their own intents, but never enter attraction lists.
 */
export const isTourismAttraction = (place: ScoredPlace): boolean => {
  const hay = haystack(place);
  if (isAccommodation(place)) return false;
  if (/(hospital|clinic|ambulance|emergency|police|help|pier|ferry|airport|bus stop|toilet|shop row|generic shops|private property|โรงพยาบาล|คลินิก|ฉุกเฉิน|ตำรวจ|ท่าเรือ|เรือเฟอร์รี่|ป้ายรถ|ห้องน้ำ|ย่านร้านค้า|พื้นที่ส่วนบุคคล|医院|诊所|紧急|警察|码头|渡轮|公交站|厕所|商铺街|私人场所)/i.test(hay)) return false;
  if (/(beach|waterfall|temple|viewpoint|museum|palace|park|garden|nature|forest|trail|aquarium|heritage|history|culture|walking|swimming|cafe|market|หาด|ชายหาด|น้ำตก|วัด|จุดชมวิว|พิพิธภัณฑ์|พระราชวัง|อุทยาน|สวน|ธรรมชาติ|ป่า|เส้นทาง|ประวัติศาสตร์|วัฒนธรรม|เดินเล่น|ว่ายน้ำ|คาเฟ่|ตลาด|海滩|瀑布|寺庙|观景|博物馆|宫殿|公园|花园|自然|森林|步道|历史|文化|咖啡|市场)/i.test(hay)) return true;
  return place.layer === 'Green' || place.layer === 'Wellness';
};

export const matchesRecommendationCategory = (place: ScoredPlace, category: string | null): boolean => {
  if (!category) return true;
  const hay = haystack(place);
  if (category === 'nature') return /(nature|forest|waterfall|beach|garden|park|mangrove|sea life|walking|swimming|ธรรมชาติ|ป่า|น้ำตก|หาด|สวน|ป่าชายเลน|สัตว์ทะเล|เดินเล่น|ว่ายน้ำ|自然|森林|瀑布|海滩|花园|公园|红树林|海洋生物)/i.test(hay);
  if (category === 'beach') return /(beach|sand|swim|หาด|ชายหาด|ว่ายน้ำ|海滩|沙滩)/i.test(hay);
  if (category === 'food' || category === 'cafe') return place.layer === 'Food' || /(food|cafe|coffee|restaurant|อาหาร|คาเฟ่|ร้าน|餐厅|咖啡)/i.test(hay);
  if (category === 'accommodation') return isAccommodation(place);
  return hay.includes(category.toLowerCase());
};

const isIndoor = (place: ScoredPlace): boolean => /(indoor|museum|building|ในร่ม|อาคาร|พิพิธภัณฑ์|室内|博物馆)/i.test(haystack(place));
const isFamilyVerified = (place: ScoredPlace): boolean => /(family-friendly|family friendly|children|kids|เด็ก|ครอบครัว|亲子|儿童|家庭)/i.test(haystack(place));
const isValidRecord = (place: ScoredPlace): boolean => Boolean(
  place.id.trim()
  && place.name.en.trim()
  && Number.isFinite(place.lat) && place.lat >= -90 && place.lat <= 90
  && Number.isFinite(place.lng) && place.lng >= -180 && place.lng <= 180
);

/** Human POI taxonomy. Gameplay layers are deliberately not exposed as categories. */
const categoryFor = (place: ScoredPlace): Bilingual => {
  const hay = haystack(place);
  if (/(museum|พิพิธภัณฑ์|博物馆)/i.test(hay)) return { en: 'Museum', th: 'พิพิธภัณฑ์', zh: '博物馆' };
  if (/(palace|heritage|history|culture|พระราชวัง|ประวัติศาสตร์|วัฒนธรรม|宫殿|历史|文化)/i.test(hay)) return { en: 'Culture', th: 'วัฒนธรรม', zh: '文化' };
  if (/(waterfall|น้ำตก|瀑布)/i.test(hay)) return { en: 'Waterfall', th: 'น้ำตก', zh: '瀑布' };
  if (/(beach|sand|swim|หาด|ชายหาด|ว่ายน้ำ|海滩|沙滩)/i.test(hay)) return { en: 'Beach', th: 'ชายหาด', zh: '海滩' };
  if (/(temple|วัด|寺庙)/i.test(hay)) return { en: 'Temple', th: 'วัด', zh: '寺庙' };
  if (/(viewpoint|จุดชมวิว|观景)/i.test(hay)) return { en: 'Viewpoint', th: 'จุดชมวิว', zh: '观景点' };
  if (/(forest|mangrove|nature|garden|park|ป่า|ธรรมชาติ|สวน|自然|森林|花园|公园)/i.test(hay)) return { en: 'Nature', th: 'ธรรมชาติ', zh: '自然' };
  if (place.layer === 'Food') return { en: 'Food', th: 'อาหาร', zh: '美食' };
  return { en: 'Attraction', th: 'สถานที่ท่องเที่ยว', zh: '景点' };
};

const adjustedWeights = (analysis: TravelAnalysis): Weights => {
  const weights: Weights = { ...RECOMMENDATION_WEIGHTS };
  // “Which one is closest?” is a factual comparison, not a blended taste
  // question. Once a permitted location exists, distance must decide it.
  if (analysis.entities.closest) return { preference: 0, distance: 100, reviews: 0, popularity: 0, diversity: 0, freshness: 0 };
  if (analysis.intent === 'CROWD' || analysis.entities.quiet) return { preference: 80, distance: 0, reviews: 0, popularity: 0, diversity: 20, freshness: 0 };
  if (analysis.entities.nearMe) return { preference: 25, distance: 35, reviews: 15, popularity: 10, diversity: 5, freshness: 10 };
  if (analysis.entities.category || analysis.entities.familyFriendly) return { preference: 45, distance: 15, reviews: 15, popularity: 5, diversity: 10, freshness: 10 };
  return weights;
};

const lastUpdatedAt = (place: ScoredPlace): string | null => {
  const values = Object.values(place.readings ?? {})
    .filter((reading) => reading && !/(seeded survey|place fallback)/i.test(reading.source))
    .map((reading) => reading?.observedAt)
    .filter((value): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value)));
  if (values.length === 0) return null;
  return values.sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;
};

const freshnessScore = (place: ScoredPlace, now: Date): number | null => {
  const updated = lastUpdatedAt(place);
  const sourcedPhoto = Boolean(place.photo?.sourceUrl && place.photo.credit && place.photo.licence);
  if (!updated) return sourcedPhoto ? 70 : null;
  const ageDays = Math.max(0, (now.getTime() - Date.parse(updated)) / 86_400_000);
  const ageScore = ageDays <= 1 ? 100 : ageDays <= 7 ? 85 : ageDays <= 30 ? 65 : 35;
  return Math.round(ageScore * 0.75 + (sourcedPhoto ? 25 : 10));
};

const titleFor = (analysis: TravelAnalysis): Bilingual => {
  if (analysis.entities.showMore) return { en: 'More verified places', th: 'สถานที่จริงเพิ่มเติม', zh: '更多已核实地点' };
  if (analysis.entities.nearMe || analysis.entities.closest) return { en: 'Places ranked for your location', th: 'สถานที่เรียงตามตำแหน่งของคุณ', zh: '按你的位置排序的地点' };
  if (analysis.entities.category) return { en: `Recommended ${analysis.entities.category} places`, th: `สถานที่แนะนำหมวด ${analysis.entities.category}`, zh: `${analysis.entities.category} 类推荐地点` };
  return { en: 'Recommended places', th: 'สถานที่แนะนำ', zh: '推荐地点' };
};

const reasonFor = (
  place: ScoredPlace,
  analysis: TravelAnalysis,
  distance: number | null,
): Bilingual => {
  if (analysis.intent === 'CROWD' || analysis.entities.quiet) {
    const estimate = place.metrics.crowdDensity.toFixed(1);
    const checkins = place.crowd?.checkinsLastHour ?? 0;
    return {
      en: `Survey estimate ${estimate} people/100 m² · ${checkins} ChivaGo check-ins in the last hour`,
      th: `ค่าประเมินจากการสำรวจ ${estimate} คน/100 ตร.ม. · เช็กอิน ChivaGo ${checkins} ครั้งในชั่วโมงล่าสุด`,
      zh: `调查估算每 100 平方米 ${estimate} 人 · 最近一小时 ${checkins} 次 ChivaGo 签到`,
    };
  }
  if ((analysis.entities.nearMe || analysis.entities.closest) && distance !== null) return {
    en: `${distance.toFixed(1)} km from the permitted location`,
    th: `ห่างจากตำแหน่งที่อนุญาต ${distance.toFixed(1)} กม.`,
    zh: `距已授权位置 ${distance.toFixed(1)} 公里`,
  };
  if (analysis.entities.category) return {
    en: `Matches ${analysis.entities.category} in the ChivaGo record`,
    th: `ตรงกับหมวด ${analysis.entities.category} ในข้อมูล ChivaGo`,
    zh: `符合 ChivaGo 记录中的 ${analysis.entities.category} 类别`,
  };
  if (place.reviews.average !== null) return {
    en: `${place.reviews.average.toFixed(1)}/5 from ${place.reviews.count} verified-visit reviews`,
    th: `${place.reviews.average.toFixed(1)}/5 จากรีวิวผู้เคยเช็กอิน ${place.reviews.count} รีวิว`,
    zh: `${place.reviews.count} 条到访评价，评分 ${place.reviews.average.toFixed(1)}/5`,
  };
  return {
    en: 'Selected to balance the recommendation categories',
    th: 'คัดเลือกเพื่อให้รายการแนะนำมีความหลากหลาย',
    zh: '为平衡推荐类别而选出',
  };
};

interface Candidate {
  place: ScoredPlace;
  distance: number | null;
  signals: Omit<Record<ScoreKey, number | null>, 'diversity'>;
}

const scoreCandidate = (
  candidate: Candidate,
  diversity: number,
  weights: Weights,
): { total: number; breakdown: RecommendationScoreComponent[] } => {
  const scores: Record<ScoreKey, number | null> = { ...candidate.signals, diversity };
  const availableWeight = (Object.keys(scores) as ScoreKey[])
    .reduce((total, key) => total + (scores[key] === null ? 0 : weights[key]), 0);
  const breakdown = (Object.keys(scores) as ScoreKey[]).map((key) => ({
    key,
    score: scores[key] === null ? null : Math.round(scores[key]!),
    configuredWeight: weights[key],
    appliedWeight: scores[key] === null || availableWeight === 0 ? 0 : Number((weights[key] / availableWeight).toFixed(4)),
  }));
  const total = breakdown.reduce((sum, part) => sum + (part.score ?? 0) * part.appliedWeight, 0);
  return { total: Math.round(clamp(total)), breakdown };
};

export function recommendPlaces(input: RecommendationInput): RecommendationOutput {
  const { analysis, context, location, now } = input;
  const category = analysis.entities.category
    ?? (analysis.entities.showMore ? context.preferredCategories.at(-1) ?? null : null);
  const pageSize = Math.max(1, Math.min(10, input.pageSize ?? 3));
  const limitations: Bilingual[] = [];
  let eligible = input.places.filter(isValidRecord);

  if (analysis.intent === 'RESTAURANT') eligible = eligible.filter((place) => place.layer === 'Food');
  if (analysis.intent === 'ACCOMMODATION') eligible = eligible.filter(isAccommodation);
  if (analysis.intent === 'TOURISM' || analysis.intent === 'TRIP_PLANNING') {
    eligible = eligible.filter((place) => isTourismAttraction(place) && matchesRecommendationCategory(place, category));
  }
  if (analysis.entities.indoor) eligible = eligible.filter(isIndoor);
  if (analysis.entities.familyFriendly) {
    eligible = eligible.filter(isFamilyVerified);
    limitations.push({
      en: 'Only places explicitly tagged for families or children can be included.',
      th: 'แสดงเฉพาะสถานที่ที่มีข้อมูลระบุชัดว่าเหมาะกับครอบครัวหรือเด็ก',
      zh: '仅包含明确标注适合家庭或儿童的地点。',
    });
  }
  if (analysis.entities.budgetBaht !== null || context.budget !== null) limitations.push({
    en: 'ChivaGo place records do not yet contain verified admission prices, so budget was not used as a filter.',
    th: 'ข้อมูลสถานที่ยังไม่มีค่าเข้าชมที่ยืนยันได้ จึงยังไม่ใช้ตัวกรองงบประมาณ',
    zh: 'ChivaGo 地点记录尚无经核实的门票价格，因此未按预算筛选。',
  });
  if ((analysis.entities.nearMe || analysis.entities.closest) && !location) limitations.push({
    en: 'Location permission is unavailable, so distance was not used for ranking.',
    th: 'ไม่ได้รับตำแหน่ง จึงยังไม่ใช้ระยะทางในการจัดอันดับ',
    zh: '未获得位置权限，因此排序未使用距离。',
  });
  if (analysis.entities.quiet) limitations.push({
    en: 'Crowd density is a labelled survey estimate; last-hour check-ins are shown separately.',
    th: 'ความหนาแน่นเป็นค่าประเมินจากการสำรวจ ส่วนเช็กอินหนึ่งชั่วโมงล่าสุดแสดงแยกต่างหาก',
    zh: '人流密度是标注的调查估算值；最近一小时签到数会单独显示。',
  });

  // Refining the current results (nature, quiet, family, nearest) is allowed
  // to re-rank records already shown. Only an explicit pagination request
  // excludes the accumulated history.
  const excluded = input.allowPreviouslyRecommended || !analysis.entities.showMore
    ? new Set<string>()
    : new Set(context.selectedPlaces);
  eligible = eligible.filter((place) => !excluded.has(place.id));

  const distances = location ? eligible.map((place) => recommendationDistanceKm(location, place)) : [];
  const maxDistance = distances.length ? Math.max(...distances) : 0;
  const maxReviewCount = Math.max(0, ...eligible.map((place) => place.reviews.count));
  const maxCheckins = Math.max(0, ...eligible.map((place) => place.crowd?.checkinsLastHour ?? 0));
  const minCrowd = Math.min(...eligible.map((place) => place.metrics.crowdDensity));
  const maxCrowd = Math.max(...eligible.map((place) => place.metrics.crowdDensity));
  const weights = adjustedWeights(analysis);
  const crowdRequested = analysis.intent === 'CROWD' || analysis.entities.quiet;
  const preferenceRequested = Boolean(category || analysis.entities.familyFriendly || crowdRequested || analysis.intent === 'RESTAURANT' || analysis.intent === 'ACCOMMODATION');

  const candidates: Candidate[] = eligible.map((place, index) => {
    const distance = location ? distances[index]! : null;
    const reviewPopularity = maxReviewCount > 0 ? Math.log1p(place.reviews.count) / Math.log1p(maxReviewCount) * 100 : null;
    const checkinPopularity = maxCheckins > 0 ? Math.log1p(place.crowd?.checkinsLastHour ?? 0) / Math.log1p(maxCheckins) * 100 : null;
    const popularityParts = [reviewPopularity, checkinPopularity].filter((value): value is number => value !== null);
    return {
      place,
      distance,
      signals: {
        preference: crowdRequested
          ? (maxCrowd === minCrowd ? 100 : clamp(100 * (1 - (place.metrics.crowdDensity - minCrowd) / (maxCrowd - minCrowd))))
          : preferenceRequested ? 100 : 70,
        distance: distance === null ? null : maxDistance === 0 ? 100 : clamp(100 * (1 - distance / maxDistance)),
        reviews: place.reviews.average === null ? null : clamp(place.reviews.average / 5 * 100),
        popularity: popularityParts.length ? popularityParts.reduce((sum, value) => sum + value, 0) / popularityParts.length : null,
        freshness: freshnessScore(place, now),
      },
    };
  });

  const chosen: { candidate: Candidate; total: number; breakdown: RecommendationScoreComponent[] }[] = [];
  const remaining = [...candidates];
  while (chosen.length < pageSize && remaining.length > 0) {
    const ranked = remaining.map((candidate) => {
      const sameLayer = chosen.filter((item) => item.candidate.place.layer === candidate.place.layer).length;
      const diversity = chosen.length === 0 ? 100 : sameLayer === 0 ? 100 : Math.max(10, 55 - sameLayer * 20);
      return { candidate, ...scoreCandidate(candidate, diversity, weights) };
    }).sort((a, b) => b.total - a.total
      || (b.candidate.place.reviews.average ?? -1) - (a.candidate.place.reviews.average ?? -1)
      || a.candidate.place.id.localeCompare(b.candidate.place.id));
    const best = ranked[0]!;
    chosen.push(best);
    remaining.splice(remaining.indexOf(best.candidate), 1);
  }

  const items: PlaceRecommendation[] = chosen.map(({ candidate, total, breakdown }) => {
    const { place, distance } = candidate;
    const updated = lastUpdatedAt(place);
    const sourced = Boolean(
      place.photo?.sourceUrl
      && place.readings?.aqi?.source
      && !/place fallback/i.test(place.readings.aqi.source),
    );
    return {
      placeId: place.id,
      name: place.name,
      category: categoryFor(place),
      description: place.blurb,
      image: place.photo,
      coordinates: { lat: place.lat, lng: place.lng },
      distanceKm: distance === null ? null : Number(distance.toFixed(1)),
      rating: place.reviews.average === null ? null : { average: place.reviews.average, reviewCount: place.reviews.count },
      openingStatus: null,
      source: { name: 'ChivaGo database', fetchedAt: now.toISOString(), lastUpdatedAt: updated },
      reason: reasonFor(place, analysis, distance),
      verificationStatus: sourced ? 'source-documented' : 'partially-verified',
      score: total,
      scoreBreakdown: breakdown,
    };
  });

  return {
    selected: chosen.map((item) => item.candidate.place),
    set: { title: titleFor(analysis), items, hasMore: remaining.length > 0, limitations },
  };
}
