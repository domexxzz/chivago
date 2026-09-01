/**
 * Travelling together.
 *
 * THE RULE THIS FILE EXISTS TO ENFORCE: a party never shares points.
 *
 * The obvious build is the wrong one. Four friends join a party, one of them
 * plants mangroves, and all four collect Green Points — which would put three
 * host-verified awards in the ledger for work three people did not do. Green
 * means "a named host checked this"; the moment it can arrive by standing next
 * to somebody who earned it, it means nothing, and every number downstream —
 * the sponsor's report, the host standing, the impact page — is quietly
 * inflated by the size of people's friend groups.
 *
 * The ledger already refuses it in its own way: an award is keyed
 * `quest:<questId>:user:<userId>`, one per person per quest. Sharing would
 * mean writing rows for people who were never verified.
 *
 * So a party is a VIEW, not a source. Each member earns their own points from
 * their own verified work, and the party shows the sum. Nothing is
 * redistributed, and `PartyMember` below has nowhere to put a balance — the
 * same structural refusal `SponsorOutcome` makes about reach and
 * `TravellerStanding` makes about self-verified points.
 *
 * SOLO, DUO AND PARTY are one thing counted. A duo is a party of two; solo is
 * a party of one, which is what everybody starts as. Modelling three separate
 * concepts would mean three sets of rules that drift apart.
 */

import type { Bilingual } from './types.ts';

/**
 * Eight.
 *
 * A travel group, not a guild: two cars or one long-tail boat. It also bounds
 * how many people a single join code can let in before somebody notices.
 */
export const MAX_PARTY_SIZE = 8;

export type PartyKind = 'solo' | 'duo' | 'party';

export const partyKind = (members: number): PartyKind =>
  (members <= 1 ? 'solo' : members === 2 ? 'duo' : 'party');

export const PARTY_KIND_LABEL: Record<PartyKind, Bilingual> = {
  solo: { en: 'On your own', th: 'เที่ยวคนเดียว' },
  duo: { en: 'The two of you', th: 'ไปกันสองคน' },
  party: { en: 'Travelling together', th: 'ไปกันเป็นกลุ่ม' },
};

/**
 * One member, as the rest of the party may see them.
 *
 * There is deliberately no `balance` field. What somebody has EARNED is an
 * achievement and is already the basis of the public host standing; what they
 * currently HOLD is a financial fact that also reveals what they have spent,
 * and joining a travel group is not consent to show your friends your wallet.
 */
export interface PartyMember {
  userId: string;
  displayName: string;
  /** Host-verified missions. The only claim worth aggregating. */
  missionsVerified: number;
  /** Green earned through those missions. Never the wallet balance. */
  greenEarned: number;
  /** Provinces this member has evidence in. */
  provinces: string[];
  /** True for the member asking, so a list of names is navigable. */
  you: boolean;
}

export interface PartySummary {
  kind: PartyKind;
  size: number;
  members: PartyMember[];
  /** The SUM of what members separately earned. Not a redistribution. */
  missionsVerified: number;
  greenEarned: number;
  /**
   * Provinces the party has reached BETWEEN them, counted once each.
   *
   * The one number that is genuinely more than the sum of its parts, and the
   * only real reason to travel as a group in this app: four people who each
   * went to one province have covered four, and if two went to the same one
   * they have covered three. A plain sum would double-count the shared trip
   * and quietly reward staying together over splitting up.
   */
  provincesTogether: number;
}

/**
 * What a party does NOT do, carried with every summary.
 *
 * On the screen rather than in a help page, because "do we all get the points"
 * is the first question anybody asks and the answer is the whole design.
 */
export const PARTY_DOES_NOT: Bilingual[] = [
  {
    en: 'Share points. Everyone earns their own from work a host verified for them.',
    th: 'ไม่แชร์แต้ม ทุกคนได้แต้มจากงานที่ผู้จัดตรวจให้ตัวเอง',
  },
  {
    en: 'Show anybody your balance, or what you have spent.',
    th: 'ไม่แสดงยอดคงเหลือหรือประวัติการใช้แต้มให้ใครเห็น',
  },
  {
    en: 'Move your companions or stamps to anyone else.',
    th: 'ไม่ย้ายเพื่อนร่วมทางหรือแสตมป์ไปให้คนอื่น',
  },
];

/**
 * Roll a party's members up into what the group has done.
 *
 * Pure, and derived on every read. A stored party total would be a second
 * record of facts the ledger already holds — the mistake this codebase has
 * declined five times now (visits, companions, provinces, passport stamps and
 * the standing all read through, never beside).
 */
export function summarise(members: PartyMember[]): PartySummary {
  const provinces = new Set<string>();
  for (const m of members) for (const code of m.provinces) provinces.add(code);

  return {
    kind: partyKind(members.length),
    size: members.length,
    members,
    missionsVerified: members.reduce((n, m) => n + m.missionsVerified, 0),
    greenEarned: members.reduce((n, m) => n + m.greenEarned, 0),
    provincesTogether: provinces.size,
  };
}

/** Why a join was refused. Each needs a different sentence. */
export type JoinFailure = 'unknown' | 'full' | 'already-in' | 'disbanded';

export const JOIN_REFUSAL: Record<JoinFailure, Bilingual> = {
  unknown: {
    en: 'No party is using that code. Check the characters and try again.',
    th: 'ไม่มีกลุ่มที่ใช้รหัสนี้ ลองตรวจตัวอักษรอีกครั้ง',
  },
  full: {
    en: `That party is full — ${MAX_PARTY_SIZE} people is the most it can hold.`,
    th: `กลุ่มนี้เต็มแล้ว รับได้มากสุด ${MAX_PARTY_SIZE} คน`,
  },
  'already-in': {
    en: 'You are already in this party.',
    th: 'คุณอยู่ในกลุ่มนี้อยู่แล้ว',
  },
  disbanded: {
    en: 'That party has been disbanded.',
    th: 'กลุ่มนี้ถูกยุบไปแล้ว',
  },
};

/**
 * What the party could still cover, phrased as an invitation rather than a gap.
 *
 * Null once the group has been everywhere that is open — there is no nagging
 * state, because a party that has done everything available has not failed at
 * anything.
 */
export function nextTogether(
  summary: PartySummary, openProvinces: number,
): Bilingual | null {
  const left = openProvinces - summary.provincesTogether;
  if (left <= 0) return null;
  return {
    en: `${left} open province${left === 1 ? '' : 's'} nobody in this group has reached yet`,
    th: `ยังเหลืออีก ${left} จังหวัดที่เปิดแล้ว และยังไม่มีใครในกลุ่มไปถึง`,
  };
}
