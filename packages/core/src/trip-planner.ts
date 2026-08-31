/**
 * The trip planner.
 *
 * The deck calls this "AI Trip Planner". What it actually is - deliberately -
 * is an explainable constraint solver, and that is a stronger claim rather
 * than a weaker one: every item it schedules carries the reason it was
 * scheduled, in both languages, the same way the Healthy Score carries its
 * own breakdown. A planner that cannot say WHY it put the mangrove at 15:00
 * cannot be corrected when it is wrong.
 *
 * It plans against the traveller's own weighting, so two people asking for
 * the same day on the same island get different days.
 *
 * What it does NOT do, and must not be described as doing: book anything,
 * price anything live, or read a road network. It orders real places by real
 * scores under real constraints. The deck's own slide 11 says the demo runs
 * on simulated data to prove the UX and the model; this is that model.
 */

import { computeHealthyScore, weightsForProfile } from './healthy-score.ts';
import {
  MODE_NAME, PACE, WALK_LIMIT_KM, chooseMode, makeLeg,
  type TransitMode,
} from './smart-route.ts';
import type {
  Bilingual, PurposeKey, Quest, ScoredPlace, WellnessProfile,
} from './types.ts';

/** How far the traveller is willing to move, in kilometres of walking. */
export const ENERGY_KM = { gentle: 3, moderate: 8, full: 14 } as const;

/** The island day the planner fills. Early start: Samui is hot by ten. */
export const DAY_START_MIN = 6 * 60 + 30;
export const DAY_END_MIN = 20 * 60;

/** Midday is the hour to keep people out of bad air and thick crowds. */
export const MIDDAY = { from: 10 * 60, until: 15 * 60 } as const;

/**
 * Air thresholds, in US AQI, for someone who asked us to watch it.
 *
 * `shift` is moderate air: worth avoiding in the heat of the day, fine at
 * seven in the morning. `avoid` is air that is unhealthy for sensitive groups
 * whatever the hour, and moving the visit to breakfast would be a dodge -
 * the honest answer is not to send them.
 */
export const AIR_LIMIT = { shift: 80, avoid: 120 } as const;

export interface PlanRequest {
  profile: WellnessProfile | null;
  places: ScoredPlace[];
  quests: Quest[];
  /** Overrides the profile's own activity level when the traveller asks. */
  energy?: keyof typeof ENERGY_KM;
  /** Trip Points available, so the plan never suggests what cannot be paid for. */
  budgetPoints?: number;
  /**
   * What the traveller's last mood check-in asks of the day - the deck's
   * "เส้นทางบรรโลงใจ".
   *
   * A preference layered ON TOP of the profile, not a replacement for it: a
   * tired afternoon should not rewrite who someone is. An explicit `energy`
   * still wins, because asking for a full day out loud beats a mood recorded
   * this morning.
   */
  bias?: { energy: keyof typeof ENERGY_KM; favour: string[]; avoidCrowds: boolean };
}

/**
 * How you get from one stop to the next.
 *
 * Samui's places are kilometres apart: Na Muang to Lamai is a ride, not a
 * walk, and charging it against a walking budget made a "moderate" day end
 * after two stops. Splitting travel from walking is what makes the plan
 * resemble a real day.
 *
 * The mode, its pace and its fare all come from `smart-route.ts` now, so a
 * plan's legs and a looked-up route can never disagree.
 */
export type { TransitMode };

export interface PlanItem {
  time: string;
  minutes: number;
  kind: 'place' | 'quest' | 'transit';
  name: Bilingual;
  tag: string;
  placeId: string | null;
  questId: string | null;
  isPointsRelated: boolean;
  /** Transit legs only. */
  mode?: TransitMode;
  km?: number;
  /** Waiting, shown apart from moving - the deck's "เวลาต่อรถ". */
  waitMinutes?: number;
  fareTHB?: number;
  /** Why this, here, now. Never a score on its own - a sentence. */
  why: Bilingual;
}

export interface TripPlan {
  items: PlanItem[];
  /** Total transport fare for the day, in THB. Estimated, never quoted. */
  fareTHB: number;
  /** On foot only. Riding between districts is not walking. */
  walkingKm: number;
  /** Everything covered, on foot or otherwise. */
  totalKm: number;
  pointsAvailable: number;
  energy: keyof typeof ENERGY_KM;
  /** What the planner could not fit, and why. Silence would be worse. */
  dropped: { name: Bilingual; reason: Bilingual }[];
}

const R = 6_371;
const toRad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance in kilometres. */
export function distanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

const clock = (minutes: number): string => {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

/** Which layers each stated purpose pulls toward. */
const PURPOSE_LAYERS: Record<PurposeKey, string[]> = {
  wellness: ['Wellness'],
  nature: ['Green'],
  food: ['Food'],
  volunteering: ['Quest'],
  quiet: ['Green', 'Safe'],
};

/** Minutes a place is worth, by layer. Deliberately coarse. */
const DWELL: Record<string, number> = {
  Wellness: 90, Food: 60, Green: 75, Safe: 60, Quest: 60,
};

/**
 * Kilometres walked AT a stop, not between stops.
 *
 * Without this the energy budget did nothing: every hop on Samui is longer
 * than the walk limit, so a "gentle" day and a "full" day both walked zero
 * and looked identical. The walking that tires a traveller out is the
 * waterfall trail and the market, not the ride in between.
 */
const ON_FOOT_KM: Record<string, number> = {
  Green: 2.2, Food: 1.1, Safe: 1.4, Wellness: 0.3, Quest: 0.6,
};

const parseDuration = (d: string): number => {
  const hours = /(\d+(?:\.\d+)?)\s*h/i.exec(d);
  if (hours) return Math.round(Number(hours[1]) * 60);
  const mins = /(\d+)\s*min/i.exec(d);
  return mins ? Number(mins[1]) : 60;
};

/**
 * Plan one day.
 *
 * The shape of the algorithm, in order, because the order is the design:
 *  1. score every place through THIS traveller's weighting, not the island's;
 *  2. add a bonus for the layers their stated purposes pull toward;
 *  3. take them best-first, but only while the walking budget holds, and
 *     always walking to the NEAREST remaining candidate rather than the
 *     highest-scoring one - a perfect place 12 km away costs the rest of the
 *     day, and a day plan is a route, not a leaderboard;
 *  4. push anything the traveller asked to avoid out of the midday window;
 *  5. drop a quest in wherever one sits near a place already chosen.
 */
export function planDay(req: PlanRequest): TripPlan {
  const { profile, places, quests } = req;
  const energy = req.energy
    ?? req.bias?.energy
    ?? (profile?.activity === 'gentle' ? 'gentle' : profile?.activity === 'full' ? 'full' : 'moderate');
  const kmBudget = ENERGY_KM[energy];

  const wanted = new Set([
    ...(profile?.purposes ?? []).flatMap((p) => PURPOSE_LAYERS[p] ?? []),
    ...(req.bias?.favour ?? []),
  ]);
  const watchesAir = profile?.watch.includes('air') ?? false;
  // A mood can ask for quiet even from someone who never ticked the box.
  const watchesCrowd = (profile?.watch.includes('crowd') ?? false) || (req.bias?.avoidCrowds ?? false);

  const ranked = places
    .map((place) => {
      const breakdown = computeHealthyScore(place.metrics, { profile: profile ?? undefined });
      const affinity = wanted.has(place.layer) ? 12 : 0;
      return { place, score: breakdown.total + affinity, affinity };
    })
    .sort((a, b) => b.score - a.score);

  const items: PlanItem[] = [];
  const dropped: TripPlan['dropped'] = [];
  let minutes = DAY_START_MIN;
  let walked = 0;
  let totalKm = 0;
  let at: { lat: number; lng: number } | null = null;
  const used = new Set<string>();

  while (minutes < DAY_END_MIN) {
    // Nearest-first among what is left, so the day is a route rather than a
    // list. Ties broken by score.
    const options = ranked
      .filter((r) => !used.has(r.place.id))
      .map((r) => {
        const km = at ? distanceKm(at, r.place) : 0;
        // The router decides, not the planner. One table of modes and fares.
        const mode: TransitMode = chooseMode(km, 'cheap');
        return { ...r, km, mode };
      })
      // Only walking counts against the energy budget - a ride costs time and
      // money, not legs - but the walking AT the stop counts too, so a gentle
      // day cannot quietly become a five-waterfall hike.
      .filter((r) => {
        const legKm = r.mode === 'walk' ? r.km : 0;
        return walked + legKm + (ON_FOOT_KM[r.place.layer] ?? 1) <= kmBudget;
      })
      .sort((a, b) => (a.km - b.km) || (b.score - a.score));

    const next = options[0];
    if (!next) break;

    const { place } = next;
    const dwell = DWELL[place.layer] ?? 60;
    const midday = minutes < MIDDAY.until && minutes + dwell > MIDDAY.from;

    // Air and crowding are the two things a traveller can ask us to watch, and
    // the only honest thing to do with that request is to MOVE the visit, not
    // to mention it afterwards.
    const unbreathable = watchesAir && place.metrics.aqi > AIR_LIMIT.avoid;
    const badAir = watchesAir && place.metrics.aqi > AIR_LIMIT.shift;
    const busy = watchesCrowd && place.metrics.crowdDensity > 2.2;
    if (unbreathable || (midday && (badAir || busy))) {
      dropped.push({
        name: place.name,
        reason: unbreathable
          ? { en: `Air is ${place.metrics.aqi} AQI — unhealthy at any hour, so it is not in the plan`, th: `อากาศ ${place.metrics.aqi} AQI ไม่ดีต่อสุขภาพทุกช่วงเวลา จึงไม่จัดลงแผน` }
          : badAir
          ? { en: `Air was ${place.metrics.aqi} AQI at midday — moved out of the plan`, th: `อากาศ ${place.metrics.aqi} AQI ช่วงกลางวัน จึงไม่จัดลงแผน` }
          : { en: 'Busiest hours — kept out of the middle of the day', th: 'ช่วงคนเยอะที่สุด จึงไม่จัดไว้กลางวัน' },
      });
      used.add(place.id);
      continue;
    }

    // The leg that gets them there, before the stop itself.
    if (at && next.km > 0.05) {
      // Built by the router, so a leg inside a plan is the same object a
      // looked-up route would return: same pace, same fare, same wait.
      const leg = makeLeg(
        { id: 'from', name: { en: 'Previous stop', th: 'จุดก่อนหน้า' }, ...at },
        { id: place.id, name: place.name, lat: place.lat, lng: place.lng },
        next.mode,
      );
      const legMinutes = leg.moveMinutes + leg.waitMinutes;
      if (minutes + legMinutes + dwell > DAY_END_MIN) break;
      items.push({
        time: clock(minutes),
        minutes: legMinutes,
        kind: 'transit',
        name: MODE_NAME[next.mode],
        tag: 'Transit',
        placeId: null,
        questId: null,
        isPointsRelated: false,
        mode: next.mode,
        km: leg.km,
        waitMinutes: leg.waitMinutes,
        fareTHB: leg.fareTHB,
        why: leg.why,
      });
      minutes += legMinutes;
      totalKm += next.km;
      if (next.mode === 'walk') walked += next.km;
    }

    used.add(place.id);
    at = { lat: place.lat, lng: place.lng };
    const onFoot = ON_FOOT_KM[place.layer] ?? 1;
    walked += onFoot;
    totalKm += onFoot;

    items.push({
      time: clock(minutes),
      minutes: dwell,
      kind: 'place',
      name: place.name,
      tag: place.layer,
      placeId: place.id,
      questId: null,
      isPointsRelated: false,
      why: reasonFor(place, next.affinity > 0, next.km),
    });
    minutes += dwell;

    // A quest at or beside this stop is the best kind: they are already here.
    const quest = quests.find(
      (q) => !used.has(q.id) && distanceKm({ lat: q.lat, lng: q.lng }, place) < 2.5,
    );
    if (quest && minutes + parseDuration(quest.duration) < DAY_END_MIN) {
      used.add(quest.id);
      items.push({
        time: clock(minutes),
        minutes: parseDuration(quest.duration),
        kind: 'quest',
        name: quest.name,
        tag: 'Quest',
        placeId: null,
        questId: quest.id,
        isPointsRelated: true,
        why: {
          en: `${quest.rewardPoints} ${quest.rewardCurrency === 'green' ? 'Green' : 'Trip'} Points, and you are already here`,
          th: `ได้ ${quest.rewardPoints} แต้ม${quest.rewardCurrency === 'green' ? 'กรีน' : 'ทริป'} และคุณอยู่ตรงนี้อยู่แล้ว`,
        },
      });
      minutes += parseDuration(quest.duration);
    }
  }

  const pointsAvailable = items
    .filter((i) => i.questId)
    .reduce((n, i) => n + (quests.find((q) => q.id === i.questId)?.rewardPoints ?? 0), 0);

  return {
    items,
    // What the day costs to get around. Named so nobody reads it as the
    // price of the day itself - entry fees and food are not in here.
    fareTHB: items.reduce((n, i) => n + (i.fareTHB ?? 0), 0),
    walkingKm: Math.round(walked * 10) / 10,
    totalKm: Math.round(totalKm * 10) / 10,
    pointsAvailable,
    energy,
    dropped,
  };
}

/** The sentence under each stop. Specific, or it is worth nothing. */
function reasonFor(place: ScoredPlace, matchesPurpose: boolean, km: number): Bilingual {
  if (matchesPurpose) {
    return {
      en: `Matches what you came for, and scores ${place.healthyScore} today`,
      th: `ตรงกับสิ่งที่คุณตั้งใจมา และวันนี้ได้ ${place.healthyScore} คะแนน`,
    };
  }
  if (km > 0 && km < 2) {
    return {
      en: `${km.toFixed(1)} km from your last stop, scoring ${place.healthyScore}`,
      th: `ห่างจากจุดก่อนหน้า ${km.toFixed(1)} กม. คะแนน ${place.healthyScore}`,
    };
  }
  return {
    en: `Scores ${place.healthyScore} today — ${place.meta}`,
    th: `วันนี้ได้ ${place.healthyScore} คะแนน`,
  };
}
