/**
 * Who is actually doing the work.
 *
 * The design asks for a leaderboard, and a leaderboard is the most dangerous
 * thing that could be added to this product. Two problems, both fatal if
 * ignored:
 *
 * ONE — RANKING BY POINTS PAYS PEOPLE TO LIE. There are two currencies and
 * they differ by evidence: Green is host-verified, Trip is self-verified. A
 * table ranked on the sum of both is a table that rewards self-reporting,
 * because that is the half nobody checks. So `greenVerified` is the only
 * rankable figure here, and the types below have nowhere to put a trip
 * balance — the same structural refusal `SponsorOutcome` uses against `reach`.
 *
 * TWO — A LEADERBOARD NEEDS OTHER PEOPLE. One traveller is not a ranking, it
 * is a mirror. `isRankable` exists so the screen says so instead of drawing a
 * podium with one step and implying a crowd that is not there.
 *
 * The host table has neither problem: five hosts have posted real quests and
 * approved real submissions, and what is ranked is approvals — work somebody
 * did — not points somebody claimed.
 */

import type { Bilingual, HostType } from './types.ts';

/**
 * A host's record.
 *
 * `verified` is the count of submissions this host APPROVED. It is the number
 * that costs a host something to produce — they had to look at a photograph
 * and decide — which is exactly why it is the one worth ranking.
 */
export interface HostStanding {
  hostId: string;
  name: string;
  type: HostType;
  /** Submissions approved. The ranked figure. */
  verified: number;
  /** Submissions that arrived and have not been decided yet. */
  pending: number;
  questsPosted: number;
  /** Green Points issued through this host's approvals. */
  greenIssued: number;
}

/**
 * A traveller's record. There is deliberately no `tripPoints` field.
 *
 * Adding one would be filled in within a week by whoever wanted the table to
 * look busier, and the moment a self-verified figure enters a ranking the
 * ranking stops meaning anything.
 */
export interface TravellerStanding {
  userId: string;
  displayName: string;
  /** Host-verified points. The ONLY rankable figure a traveller has. */
  greenVerified: number;
  missionsVerified: number;
}

/** Below this, a table is not a ranking and should not be drawn as one. */
export const MIN_FOR_RANKING = 2;

export const isRankable = (participants: number): boolean =>
  participants >= MIN_FOR_RANKING;

/**
 * What the ranking is on, stated on the screen rather than assumed.
 *
 * A leaderboard whose basis is unstated is one the reader will assume is
 * "points", which is the reading this one most needs to prevent.
 */
export const RANKED_BY: Bilingual = {
  en: 'Ranked by verified approvals only. Self-reported points are not counted.',
  th: 'จัดอันดับจากงานที่ตรวจแล้วเท่านั้น แต้มที่บันทึกเองไม่ถูกนับ',
};

/**
 * Hosts, most verified work first.
 *
 * Ties break on Green issued, then on name — so the order is total and stable.
 * An unstable sort would reshuffle the table on every refresh and make a host
 * appear to move when nothing had happened.
 */
export function rankHosts(hosts: HostStanding[]): HostStanding[] {
  return [...hosts].sort(
    (a, b) =>
      b.verified - a.verified
      || b.greenIssued - a.greenIssued
      || a.name.localeCompare(b.name),
  );
}

/**
 * Travellers, most verified points first.
 *
 * Same total ordering, and the input carries no self-verified figure to sort
 * on even if a caller wanted to.
 */
export function rankTravellers(travellers: TravellerStanding[]): TravellerStanding[] {
  return [...travellers].sort(
    (a, b) =>
      b.greenVerified - a.greenVerified
      || b.missionsVerified - a.missionsVerified
      || a.displayName.localeCompare(b.displayName),
  );
}

export interface Standing {
  hosts: HostStanding[];
  travellers: TravellerStanding[];
  /**
   * How many travellers hold ANY verified points.
   *
   * Not the number of registered accounts: somebody who signed up and has
   * verified nothing is not a participant in this, and counting them would
   * inflate the only number that decides whether a ranking is honest.
   */
  participants: number;
  rankedBy: Bilingual;
}

/** Assemble, rank, and carry the basis with the result rather than beside it. */
export function standingFrom(
  hosts: HostStanding[], travellers: TravellerStanding[],
): Standing {
  const ranked = rankTravellers(travellers);
  return {
    hosts: rankHosts(hosts),
    travellers: ranked,
    participants: ranked.filter((t) => t.greenVerified > 0).length,
    rankedBy: RANKED_BY,
  };
}
