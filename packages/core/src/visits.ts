/**
 * Recorded, not scored.
 *
 * A check-in is a claim of presence the phone makes and a geofence agrees
 * with. When the two disagree - GPS under tree cover, a dead battery, a
 * permission the traveller declined, a beach they walked before installing
 * the app - the old answer was to refuse everything: no points, no stamp, no
 * review, and a red message. Every sensor failure became a rebuke to somebody
 * who was really there.
 *
 * SummitLynx solves this by splitting the two things a check-in was doing.
 * A visit can always be RECORDED; only a verified one is SCORED. YAMASTA, the
 * Japanese mountain stamp rally, adds the other half: a traveller may issue
 * themselves a stamp for a place the app did not catch them at, a limited
 * number of times a year, on their honour.
 *
 * So: a self-issued visit goes in the passport, marked as what it is. It pays
 * nothing, hatches nothing, and unlocks no review - those still rest on the
 * ledger row a geofence wrote. The quota is the only guard it needs, because
 * there is nothing on the other side of it worth gaming.
 */

import { islandDateKey } from './wallet.ts';

/**
 * Self-issued stamps per traveller per year.
 *
 * Ten is YAMASTA's number and it is about right: enough to cover the two or
 * three places a phone genuinely misses on a fortnight's trip, too few to
 * forge a passport with. One per place, ever - the second claim on the same
 * beach is not a second visit, it is a duplicate.
 */
export const SELF_VISITS_PER_YEAR = 10;

/**
 * The year a self-issued visit counts against - the ISLAND's year, for the
 * same reason a check-in's day is the island's day: a phone still on a
 * European clock must not get a fresh quota an hour early on New Year's Eve.
 */
export const selfVisitYearKey = (d: Date): string => islandDateKey(d).slice(0, 4);

export interface SelfVisit {
  placeId: string;
  /**
   * When the stamp was issued - server time, not a date the traveller typed.
   * A self-reported WHERE is the concession this feature makes; a
   * self-reported WHEN would let a passport be back-dated from a sofa, and
   * nothing reads this field for anything but "recorded on".
   */
  visitedAt: string;
}

export interface SelfVisitResult {
  placeId: string;
  /** False when this place already carried a self-issued stamp. Nothing changed. */
  recorded: boolean;
  /** Stamps the traveller may still issue themselves this island-year. */
  remainingThisYear: number;
}

/**
 * Where this traveller has BEEN, for the map to lift its mist from.
 *
 * Derived, never stored: a place is explored because the ledger holds a
 * geofenced check-in there, or because the traveller stamped it themselves.
 * The two are kept apart in `how` for the same reason the passport keeps
 * them apart - the map may draw them alike, but nothing downstream should
 * be able to mistake one for the other.
 */
export interface ExploredPlace {
  placeId: string;
  /** The earliest visit of the kind named by `how`. */
  firstAt: string;
  how: 'checkin' | 'self';
}

export interface Explored {
  /** Each place once. A place with both a check-in and a stamp is `checkin`. */
  places: ExploredPlace[];
}

/** What the passport is told, beside the verified list. */
export interface SelfVisitSummary {
  /** Place ids with a self-issued stamp. */
  places: string[];
  remainingThisYear: number;
}
