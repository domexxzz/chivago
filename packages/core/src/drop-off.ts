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
  /** `HH:MM-HH:MM`, the same shape `shopOpenNow` already parses. */
  hours: string;
  /**
   * Where the coordinate came from, in a form somebody can be asked about:
   * an OSM way id, or the operator's own name and the date they gave it.
   */
  source: string;
}

/**
 * Live drop-off points.
 *
 * Empty until a shop or the municipality agrees to one. Adding the first is
 * one object: the layer, the distance line, the quest and the empty-state
 * message all read from here and need no further change.
 */
export const DROP_OFF_POINTS: readonly DropOffPoint[] = [];

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
 * What it pays, and why it pays in green.
 *
 * The seeded Koh Sichang quests pay 90 green for thirty minutes and 120 for
 * forty-five - three and 2.7 green a minute. Forty-five for fifteen minutes
 * sits inside that band rather than inventing a new rate for this one.
 *
 * It pays GREEN rather than trip because the work is environmental, and it
 * pays at all - unlike a check-in - because the quest flow does not release
 * anything until a named host has approved the submission. That is rung
 * three on the evidence ladder. A photograph alone is rung two and would not
 * be enough to pay an environmental point, which is the rule the whole
 * reporting side depends on.
 */
export const DROP_OFF_QUEST_GREEN = 45;

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
    rewardPoints: DROP_OFF_QUEST_GREEN,
    rewardCurrency: 'green',
    host: point.host,
    kind: 'today',
    lat: point.lat,
    lng: point.lng,
    geofenceRadiusM: QUEST_RADIUS_MAX_M,
  };
}

/** Every drop-off quest there is, which is none until a point exists. */
export const dropOffQuests = (
  points: readonly DropOffPoint[] = DROP_OFF_POINTS,
): Quest[] => points.map(dropOffQuest);
