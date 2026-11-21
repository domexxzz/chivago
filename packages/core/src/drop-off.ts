/**
 * Drop-off points: where somebody hands over waste they have already sorted.
 *
 * WHY THIS IS NOT A `Place`. A place can be checked in at for
 * `CHECKIN_TRIP_POINTS`, reviewed, photographed and counted towards the
 * passport. A bin should be none of those. Making drop-off points places
 * would pay twenty Trip Points to anybody who walks past a bin carrying
 * nothing, which is the opposite of the behaviour this exists to encourage,
 * and it would put a bin in the record of where somebody has been.
 *
 * WHY THIS IS NOT A SHOP EITHER. A shop is a commercial listing with hours,
 * a phone number, a rating and an owner who can reply to reviews. A drop-off
 * point run by the municipality at a pier has none of that, and a shop that
 * also accepts sorted waste is one shop and one drop-off point, not one row
 * pretending to be both.
 *
 * WHY THE LIST BELOW IS EMPTY, AND WHY THAT IS THE POINT. No shop on Koh
 * Sichang has agreed to be a drop-off point yet. Seeding a coordinate for a
 * bin nobody has confirmed would put a pin on a map that a traveller would
 * walk forty minutes to reach, and finding nothing there is worse than never
 * having been told - they will not open the app again. `companions.ts` makes
 * the same argument about a mechanic that cannot complete: it is a promise on
 * screen with nothing behind it.
 *
 * So the layer ships working and empty, the screen says so in words the way
 * `board.ts` says an empty board is empty, and one entry below turns it on
 * the day a shop says yes. `source` is required for the same reason every
 * seeded place carries an OSM way id or the property's own name and date:
 * a coordinate nobody can be asked about is a coordinate nobody can correct.
 */

import { QUEST_RADIUS_MAX_M, metresBetween } from './presence.ts';
import type { Bilingual, Quest, QuestHost } from './types.ts';

/**
 * What a point will take, as the person standing in front of it needs it.
 *
 * This is the whole of SDG 12.8 in one field. The second-largest reason
 * people put the wrong thing in a bin is not that they do not care, it is
 * that nobody told them at the moment they had to decide, and a label on the
 * bin is read by somebody who has already walked there.
 */
export type Accepts = 'plastic' | 'glass' | 'can' | 'paper' | 'general';

export const ACCEPTS_LABEL: Record<Accepts, Bilingual> = {
  plastic: { en: 'Plastic bottles', th: 'ขวดพลาสติก', zh: '塑料瓶' },
  glass: { en: 'Glass', th: 'ขวดแก้ว', zh: '玻璃' },
  can: { en: 'Cans', th: 'กระป๋อง', zh: '易拉罐' },
  paper: { en: 'Paper and card', th: 'กระดาษและกล่อง', zh: '纸和纸板' },
  general: { en: 'General waste', th: 'ขยะทั่วไป', zh: '一般垃圾' },
};

export interface DropOffPoint {
  /** Stable id. Prefix `do-` so a ledger row is never mistaken for a place. */
  id: string;
  name: Bilingual;
  /** Named the way somebody standing at the pier would say it. */
  where: Bilingual;
  lat: number;
  lng: number;
  /**
   * Who signs for what is handed over, by name.
   *
   * Required, and there is no anonymous option. A drop-off nobody stands
   * behind produces evidence at rung two - a photograph - and the whole
   * reason this layer exists is to reach rung three. See `evidence-level.ts`.
   */
  host: QuestHost;
  accepts: Accepts[];
  /**
   * `HH:MM-HH:MM`, the same shape `shopOpenNow` already parses.
   *
   * Null on a pilot point: nobody has agreed opening hours for a bin that is
   * still a proposal, and printing a guess sends somebody to a closed one.
   */
  hours: string | null;
  /**
   * Where the coordinate came from, in a form somebody can be asked about:
   * an OSM way id, or the operator's own name and the date they gave it.
   */
  source: string;
  /**
   * A proposed pilot point the municipality has not yet agreed to.
   *
   * WHY A PILOT POINT IS ON THE LIST AT ALL. The Koh Sichang pilot budgets
   * four sorting bins, and the place they go is part of what the team takes
   * to the municipality. Showing them, marked as proposals, lets a traveller
   * see the plan and find the way to the spot. Every pilot point sits on a
   * coordinate the map already trusts (an OSM-mapped pier, beach or palace),
   * so the walk ends somewhere real even before a bin is there.
   *
   * WHAT A PILOT POINT DOES NOT DO. It pays nothing and has no quest: a
   * quest releases points only when a named host signs for what is handed
   * in, and nobody signs for a bin that is still a proposal. The screen says
   * "pilot, awaiting the municipality" in place of hours and a signer.
   * Removing the flag, once a host agrees, is what turns the quest on.
   */
  pilot?: true;
}

/** Who proposes the pilot points until the municipality takes them on. */
const SICHANG_TEAM: QuestHost = { id: 'h-sichang-chivago', name: 'ChivarGo team · Koh Sichang', type: 'community' };

/** What every pilot sorting bin is planned to take. */
const PILOT_ACCEPTS: Accepts[] = ['plastic', 'can', 'glass', 'general'];

/**
 * Drop-off points.
 *
 * Today every entry is a pilot point (see `pilot` above): the four sorting
 * bins the Koh Sichang pilot budgets, each on a coordinate copied from a
 * place `seed.ts` already maps from OSM. None of them pays or has a quest
 * until a host agrees. Adding a confirmed point is one object without the
 * flag: the layer, the distance line and the quest read from here.
 */
export const DROP_OFF_POINTS: readonly DropOffPoint[] = [
  {
    id: 'do-sc-pier',
    name: { en: 'Pilot drop-off: Tha Lang pier', th: 'จุดนำร่อง: ท่าเรือท่าล่าง', zh: '试点投放点：塔朗码头' },
    where: { en: 'By the Si Racha ferry landing', th: 'ข้างท่าเรือที่เรือจากศรีราชาเข้าเทียบ', zh: '是拉差渡轮停靠处旁' },
    lat: 13.161443,
    lng: 100.810441,
    host: SICHANG_TEAM,
    accepts: PILOT_ACCEPTS,
    hours: null,
    source: 'Proposed pilot spot at OSM way 40354093 (sc-pier in seed.ts); not yet agreed with the Ko Sichang municipality',
    pilot: true,
  },
  {
    id: 'do-sc-shops',
    name: { en: 'Pilot drop-off: shop row', th: 'จุดนำร่อง: ย่านร้านค้าหน้าท่าล่าง', zh: '试点投放点：码头商铺街' },
    where: { en: 'In the shop row facing Tha Lang pier', th: 'ย่านร้านค้าหน้าท่าล่าง', zh: '塔朗码头对面的商铺街' },
    lat: 13.160059,
    lng: 100.809817,
    host: SICHANG_TEAM,
    accepts: PILOT_ACCEPTS,
    hours: null,
    source: 'Proposed pilot spot at OSM way 412192126 (sc-shops in seed.ts); not yet agreed with the Ko Sichang municipality',
    pilot: true,
  },
  {
    id: 'do-sc-palace',
    name: { en: 'Pilot drop-off: Phra Chudadhuj Palace', th: 'จุดนำร่อง: พระจุฑาธุชราชฐาน', zh: '试点投放点：朱他突王宫' },
    where: { en: 'At the palace grounds', th: 'บริเวณพระจุฑาธุชราชฐาน', zh: '王宫园区' },
    lat: 13.14909,
    lng: 100.818436,
    host: SICHANG_TEAM,
    accepts: PILOT_ACCEPTS,
    hours: null,
    source: 'Proposed pilot spot at OSM way 40443539 (sc-palace in seed.ts); not yet agreed with the Ko Sichang municipality',
    pilot: true,
  },
  {
    id: 'do-sc-thamphang',
    name: { en: 'Pilot drop-off: Tham Phang Beach', th: 'จุดนำร่อง: หาดถ้ำพัง', zh: '试点投放点：探蓬海滩' },
    where: { en: 'At the swimming beach, Ao Atsadang', th: 'หาดถ้ำพัง (อ่าวอัษฎางค์)', zh: '阿萨当湾游泳海滩' },
    lat: 13.1454,
    lng: 100.806835,
    host: SICHANG_TEAM,
    accepts: PILOT_ACCEPTS,
    hours: null,
    source: 'Proposed pilot spot at OSM way 242270752 (sc-thamphang in seed.ts); not yet agreed with the Ko Sichang municipality',
    pilot: true,
  },
];

/** Metres from a position to a point. Re-exported shape so callers need one import. */
export const metresToDropOff = (
  from: { lat: number; lng: number },
  point: DropOffPoint,
): number => metresBetween(from, point);

/**
 * How a distance is said to somebody holding a bottle.
 *
 * Metres under a kilometre, because "0.2 km" is a number a person has to
 * convert before they can decide whether to walk it. Rounded to ten metres:
 * a phone under tree cover does not know the last digit, and printing it
 * claims an accuracy the fix does not have.
 */
export function dropOffDistanceLabel(metres: number): Bilingual {
  // Rounded FIRST, then the unit is chosen. Deciding the unit on the raw
  // figure printed "1000 m" for 999, which is a kilometre spelled the long way.
  const m = Math.max(10, Math.round(metres / 10) * 10);
  if (m < 1_000) return { en: `${m} m`, th: `${m} ม.`, zh: `${m} 米` };
  const km = (m / 1_000).toFixed(1);
  return { en: `${km} km`, th: `${km} กม.`, zh: `${km} 公里` };
}

/**
 * Points nearest first.
 *
 * Returns a new array; the seeded one is readonly and shared. With no
 * position there is no nearest, and the caller gets the list unsorted rather
 * than an order invented from nothing.
 */
export function dropOffsNearest(
  from: { lat: number; lng: number } | null,
  points: readonly DropOffPoint[] = DROP_OFF_POINTS,
): DropOffPoint[] {
  const list = [...points];
  if (!from) return list;
  return list.sort((a, b) => metresBetween(from, a) - metresBetween(from, b));
}

// ---------------------------------------------------------------------------
// The quest performed at a drop-off point
// ---------------------------------------------------------------------------

/**
 * Fifteen minutes, and the reason it is not longer.
 *
 * The existing Koh Sichang quests run thirty and forty-five minutes, which
 * suits somebody who came for the day on their own transport. The boat tours
 * stop at a place for five to seven minutes, so a forty-five minute quest is
 * not a thing those travellers decline - it is a thing they cannot physically
 * do. Fifteen is the shortest span that still covers walking to a point,
 * handing something over and a host looking at it.
 */
export const DROP_OFF_QUEST_MINUTES = 15;

/**
 * What it pays, and why it pays in TRIP rather than green.
 *
 * THE FIRST VERSION OF THIS PAID GREEN, AND THAT WAS A LOOP THAT DID NOT
 * CLOSE. Green reads as the obvious currency for environmental work, and it
 * is wrong here for one reason that only shows up at the counter:
 * `shop-reward-service.ts` writes every island offer with `currency: 'trip'`
 * and its test says so in its name - "a reward is always priced in Trip
 * Points, whatever currency is asked for". So a traveller who handed in
 * sorted waste earned points that no shop on the island could take, and the
 * promise this whole feature is built on - hand it in, get something you can
 * use before the four o'clock boat - was not true.
 *
 * WHAT IT COSTS TO SWITCH, SAID PLAINLY. Green is the unit the environmental
 * side of a report is denominated in, and paying trip means this activity no
 * longer adds to that total. It loses nothing that matters, because the
 * figures a report actually carries are `verified_submissions`, `weight_kg`
 * and `distinct_participants` (see `kpi.ts`) - counts and kilograms, not a
 * points balance - and `esgPillar` below still files this under
 * environmental. The pillar describes the WORK. The currency only decides
 * what the person can spend afterwards, and those are different questions.
 *
 * THE RATE. On the trip scale a check-in is 20, a low-carbon leg is 30 and a
 * written review is 40 (`seed.ts`). Forty-five sits just above the review:
 * carrying sorted waste to a point and waiting for a named host to look at
 * it is more than typing forty characters, and a point below a gacha pull's
 * 100 means two hand-ins buy one roll rather than one.
 *
 * It pays at all - unlike a check-in - because the quest flow releases
 * nothing until a named host has approved the submission. That is rung three
 * on the evidence ladder; a photograph alone is rung two.
 */
export const DROP_OFF_QUEST_TRIP = 45;

/**
 * The quest for one drop-off point.
 *
 * DERIVED, never seeded separately. A hand-written quest list beside a
 * hand-written point list is two records of the same fact that drift the
 * first time a point moves, and a quest whose fence sits where a bin used to
 * be fails a traveller standing at the bin. No points means no quests, which
 * is the honest state today.
 *
 * `code` is positional (`DO-01`) rather than stored, for the same reason:
 * one list, one order, nothing to keep in step.
 */
export function dropOffQuest(point: DropOffPoint, index: number): Quest {
  return {
    id: `q-${point.id}`,
    esgPillar: 'environmental',
    code: `DO-${String(index + 1).padStart(2, '0')}`,
    name: {
      en: 'Hand in sorted waste',
      th: 'ส่งขยะที่แยกแล้ว',
      zh: '交付已分类垃圾',
    },
    where: point.where,
    // The English is the machine-readable one: the ESG volunteer-hours figure
    // parses minutes out of it, so it stays `15 min` in digits and English.
    duration: {
      en: `${DROP_OFF_QUEST_MINUTES} min`,
      th: `${DROP_OFF_QUEST_MINUTES} นาที`,
      zh: `${DROP_OFF_QUEST_MINUTES} 分钟`,
    },
    rewardPoints: DROP_OFF_QUEST_TRIP,
    // Trip, because an island shop cannot accept anything else. See above.
    rewardCurrency: 'trip',
    host: point.host,
    kind: 'today',
    lat: point.lat,
    lng: point.lng,
    geofenceRadiusM: QUEST_RADIUS_MAX_M,
  };
}

/**
 * Every drop-off quest there is: one per CONFIRMED point.
 *
 * Pilot points are left out, because nobody has agreed to sign for what is
 * handed in there, and a quest no host can approve is a promise of points
 * that never arrive. The code stays positional over the confirmed points.
 */
export const dropOffQuests = (
  points: readonly DropOffPoint[] = DROP_OFF_POINTS,
): Quest[] => points.filter((point) => !point.pilot).map(dropOffQuest);
