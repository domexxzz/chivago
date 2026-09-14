/**
 * Finding somebody to go with.
 *
 * A party has always been joinable by a six-character code, which means you
 * could only join one if somebody already knew you well enough to read it out.
 * That is a fine way to travel with friends and no way at all to meet anyone.
 *
 * THE RULE THIS FILE EXISTS TO ENFORCE: an invitation is posted at a PLACE,
 * never at a person.
 *
 * The obvious build is the wrong one, and it is the one every social map
 * ships: pins that are people, drawn where those people currently are. Three
 * things are wrong with it here.
 *
 *   A check-in is consent to be COUNTED, not to be FOUND. `crowd.ts` already
 *   says "3 travellers checked in here in the last hour" and that is the
 *   entire truth a stranger is entitled to. Turning the same rows into five
 *   dots a stranger can walk towards is a different product with a different
 *   consent behind it, and nobody gave that one.
 *
 *   This app is used outdoors, on an island, by tourists and by people young
 *   enough that we have not yet established how young. A map that resolves to
 *   a person standing somewhere is a stalking tool, and it is one we would
 *   have built on purpose.
 *
 *   `wayfinding.ts` decided this already. Its header says the link it hands
 *   out "carries the DESTINATION only" — no origin, no traveller. Pins that
 *   are people would quietly reverse that, in a file that never mentions it.
 *
 * So the unit of the pin is a place. A party says where it is going, when,
 * and how many it can still take; everybody else sees the place, the window
 * and the spaces. Nobody's position is transmitted, at any point, to anybody.
 *
 * The happy accident is that this is also the only version that can be
 * TRUSTED. A pin drawn from a self-reported position is worth nothing — a
 * spoofed fix puts you anywhere. The count attached to a place comes from
 * geofenced check-ins that survived the four checks in `presence.ts`. We give
 * up a feature that could not have been honest and keep one that can.
 *
 * NOTHING HERE TOUCHES THE PARTY RULES. Joining still goes through the same
 * code `party-service.ts` already issues, an accepted request is just a
 * shortcut to reading it out loud, and points are still never shared.
 */

import type { Bilingual } from './types.ts';
import { MAX_PARTY_SIZE } from './party.ts';

/**
 * Twenty-four hours.
 *
 * An invitation is a plan, and a plan more than a day out is a wish. The hard
 * reason is staler than that: an invitation nobody closed is a lie on a map,
 * and the longer it can live the more of the map is lies. Expiry is derived
 * from the window on every read, so an invitation cannot outlive its own
 * sentence even if a cleanup job never runs.
 */
export const INVITE_MAX_HOURS = 24;

/** Shortest useful window. Below this the invitation expires while it is being written. */
export const INVITE_MIN_MINUTES = 15;

/**
 * The most an invitation can ask for.
 *
 * One short of the party limit, because the party already contains at least
 * the person posting it. `spacesOffered` is bounded again at write time by
 * the party's actual size.
 */
export const INVITE_MAX_SPACES = MAX_PARTY_SIZE - 1;

/** How long a request waits before it stops meaning anything. */
export const REQUEST_STALE_HOURS = INVITE_MAX_HOURS;

/**
 * What an invitation is doing right now.
 *
 * Derived on read, never stored. A stored state is a second record of a fact
 * the clock and the accepted count already hold, and it is the record that
 * goes wrong — the seventh time this codebase has declined to keep one.
 */
export type InviteState = 'open' | 'full' | 'closed' | 'expired';

export const INVITE_STATE_LABEL: Record<InviteState, Bilingual> = {
  open: { en: 'Looking for people', th: 'กำลังหาคนไปด้วย' },
  full: { en: 'No spaces left', th: 'เต็มแล้ว' },
  closed: { en: 'Closed by the party', th: 'ปาร์ตี้ปิดรับแล้ว' },
  expired: { en: 'The time has passed', th: 'เลยเวลาไปแล้ว' },
};

/** An invitation as the party that posted it holds it. */
export interface PartyInvite {
  id: string;
  partyId: string;
  /** The place it is posted at. Never a coordinate of a person. */
  placeId: string;
  /** ISO 8601. When the party means to be there. */
  from: string;
  /** ISO 8601. After this the invitation is expired, whatever else is true. */
  until: string;
  /** How many the party said it could still take, when it posted. */
  spacesOffered: number;
  /** Requests accepted so far. Spaces left is offered minus this. */
  accepted: number;
  /** A short line from the party. Optional, and never required to be filled. */
  note: string | null;
  /** Set when the party closed it early. */
  closedAt: string | null;
}

export const spacesLeft = (invite: PartyInvite): number =>
  Math.max(0, invite.spacesOffered - invite.accepted);

/**
 * Which of the four states an invitation is in, in the order that matters.
 *
 * Closed beats expired beats full: a party that shut its invitation should be
 * told it is shut, not that it ran out of time, and an invitation whose window
 * has passed is over whether or not anybody took the last space.
 */
export function inviteState(invite: PartyInvite, now: Date): InviteState {
  if (invite.closedAt !== null) return 'closed';
  if (Date.parse(invite.until) <= now.getTime()) return 'expired';
  if (spacesLeft(invite) === 0) return 'full';
  return 'open';
}

export const inviteIsOpen = (invite: PartyInvite, now: Date): boolean =>
  inviteState(invite, now) === 'open';

/**
 * One invitation as a STRANGER sees it.
 *
 * This type is the privacy surface of the whole feature, and its shape is the
 * argument. What a person scrolling a map is entitled to know is where a group
 * is going, when, how many it can take, and enough about it to decide whether
 * to ask. That is all that is here.
 *
 * There is deliberately nowhere to put a position, a balance, a real name, a
 * route, a last-seen time, or a member list. `PartyMember` refuses a balance
 * for the same reason and says so; this refuses more, because the audience is
 * wider — a party member chose their party, and a stranger chose nothing.
 */
export interface InviteListing {
  id: string;
  placeId: string;
  from: string;
  until: string;
  spacesLeft: number;
  note: string | null;
  state: InviteState;
  /** The party's chosen name. Not any member's name. */
  partyName: string;
  /**
   * Missions this party has had verified between them.
   *
   * The one figure worth showing a stranger, and the same one the public host
   * standing already ranks on: it is work a named host signed off, so it
   * cannot be inflated by self-reporting. It is a property of the GROUP, never
   * attributed to a member.
   */
  missionsVerified: number;
  /** True for an invitation posted by the party the reader is already in. */
  yours: boolean;
}

/**
 * Carried with every listing, on the screen rather than in a help page.
 *
 * "Can people see where I am" is the first question anybody sensible asks
 * about a feature like this, and the answer is the whole design.
 */
export const INVITE_DOES_NOT: Bilingual[] = [
  {
    en: 'Show anybody where you are. Invitations are posted at a place, never at a person.',
    th: 'ไม่บอกใครว่าคุณอยู่ที่ไหน ประกาศผูกกับสถานที่ ไม่ได้ผูกกับตัวคน',
  },
  {
    en: 'Show your balance, your real name, or anywhere you have been.',
    th: 'ไม่แสดงยอดแต้ม ชื่อจริง หรือที่ที่คุณเคยไป',
  },
  {
    en: 'Share points. Joining a party has never done that and still does not.',
    th: 'ไม่แชร์แต้ม การเข้าปาร์ตี้ไม่เคยทำแบบนั้น และตอนนี้ก็ยังไม่ทำ',
  },
];

/** Why posting an invitation was refused. */
export type PostFailure =
  | 'no-party' | 'not-yours' | 'party-full' | 'already-posted'
  | 'window-too-short' | 'window-too-long' | 'window-past' | 'spaces';

export const POST_REFUSAL: Record<PostFailure, Bilingual> = {
  'no-party': {
    en: 'Start or join a party first — an invitation comes from a group, even a group of one.',
    th: 'สร้างหรือเข้าปาร์ตี้ก่อน ประกาศมาจากกลุ่ม แม้จะเป็นกลุ่มคนเดียวก็ตาม',
  },
  'not-yours': {
    en: 'Only somebody in the party can post for it.',
    th: 'เฉพาะคนในปาร์ตี้เท่านั้นที่ประกาศแทนได้',
  },
  'party-full': {
    en: `This party is already ${MAX_PARTY_SIZE} people, so there is no space to offer.`,
    th: `ปาร์ตี้นี้ครบ ${MAX_PARTY_SIZE} คนแล้ว จึงไม่มีที่ว่างให้ประกาศ`,
  },
  'already-posted': {
    en: 'This party already has an invitation up. Close that one first.',
    th: 'ปาร์ตี้นี้มีประกาศค้างอยู่แล้ว ปิดอันเดิมก่อน',
  },
  'window-too-short': {
    en: `Give it at least ${INVITE_MIN_MINUTES} minutes — anything shorter expires while people are reading it.`,
    th: `ตั้งเวลาอย่างน้อย ${INVITE_MIN_MINUTES} นาที สั้นกว่านั้นจะหมดอายุตั้งแต่คนยังอ่านไม่จบ`,
  },
  'window-too-long': {
    en: `${INVITE_MAX_HOURS} hours is the longest an invitation can stay up.`,
    th: `ประกาศอยู่ได้นานที่สุด ${INVITE_MAX_HOURS} ชั่วโมง`,
  },
  'window-past': {
    en: 'That time has already passed.',
    th: 'เวลานั้นผ่านไปแล้ว',
  },
  spaces: {
    en: `Offer between 1 and ${INVITE_MAX_SPACES} spaces.`,
    th: `เปิดรับได้ตั้งแต่ 1 ถึง ${INVITE_MAX_SPACES} คน`,
  },
};

/** Why asking to join was refused. */
export type RequestFailure =
  | 'unknown' | 'closed' | 'expired' | 'full'
  | 'own-party' | 'already-asked' | 'in-a-party';

export const REQUEST_REFUSAL: Record<RequestFailure, Bilingual> = {
  unknown: {
    en: 'That invitation is no longer there.',
    th: 'ประกาศนี้ไม่อยู่แล้ว',
  },
  closed: {
    en: 'The party closed this invitation.',
    th: 'ปาร์ตี้ปิดรับประกาศนี้แล้ว',
  },
  expired: {
    en: 'The time on this invitation has passed.',
    th: 'เลยเวลาของประกาศนี้แล้ว',
  },
  full: {
    en: 'Somebody took the last space.',
    th: 'มีคนรับที่สุดท้ายไปแล้ว',
  },
  'own-party': {
    en: 'This is your own party.',
    th: 'นี่คือปาร์ตี้ของคุณเอง',
  },
  'already-asked': {
    en: 'You have already asked. The party will see it.',
    th: 'คุณขอไปแล้ว ปาร์ตี้จะเห็นคำขอ',
  },
  'in-a-party': {
    en: 'Leave your current party first.',
    th: 'ออกจากปาร์ตี้ปัจจุบันก่อน',
  },
};

/**
 * What became of somebody's request.
 *
 * `withdrawn` is the asker changing their mind and `declined` is the party
 * saying no; they are separated because the sentence a person reads about
 * their own request should not be the one written for somebody else's refusal.
 */
export type RequestOutcome = 'waiting' | 'accepted' | 'declined' | 'withdrawn';

export const REQUEST_OUTCOME_LABEL: Record<RequestOutcome, Bilingual> = {
  waiting: { en: 'Waiting for the party', th: 'รอปาร์ตี้ตอบ' },
  accepted: { en: 'They said yes', th: 'ปาร์ตี้รับแล้ว' },
  declined: { en: 'They said no', th: 'ปาร์ตี้ไม่รับ' },
  withdrawn: { en: 'You took this back', th: 'คุณถอนคำขอแล้ว' },
};

/**
 * Whether this window is one an invitation may carry.
 *
 * Pure and total: it returns the reason rather than a boolean, because every
 * refusal above needs a different sentence and a boolean would throw the
 * reason away at exactly the moment it is needed.
 */
export function windowRefusal(
  from: string, until: string, now: Date,
): PostFailure | null {
  const start = Date.parse(from);
  const end = Date.parse(until);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 'window-past';
  if (end <= now.getTime()) return 'window-past';
  if (end - start < INVITE_MIN_MINUTES * 60_000) return 'window-too-short';
  if (end - now.getTime() > INVITE_MAX_HOURS * 3_600_000) return 'window-too-long';
  return null;
}

/** Whether this many spaces may be offered by a party of this size. */
export function spacesRefusal(spaces: number, partySize: number): PostFailure | null {
  if (partySize >= MAX_PARTY_SIZE) return 'party-full';
  if (!Number.isInteger(spaces) || spaces < 1) return 'spaces';
  if (spaces > INVITE_MAX_SPACES) return 'spaces';
  if (spaces > MAX_PARTY_SIZE - partySize) return 'spaces';
  return null;
}

/**
 * Why a request cannot be made, or null.
 *
 * Ordered so the reader learns the most useful thing first: that it is their
 * own party beats that it is full, because "you are already in this" answers
 * the question and "somebody took the last space" would send them looking for
 * another one.
 */
export function requestRefusal(
  invite: PartyInvite | null,
  now: Date,
  asker: { partyId: string | null; alreadyAsked: boolean },
): RequestFailure | null {
  if (invite === null) return 'unknown';
  if (asker.partyId !== null && asker.partyId === invite.partyId) return 'own-party';
  if (asker.partyId !== null) return 'in-a-party';
  if (asker.alreadyAsked) return 'already-asked';

  const state = inviteState(invite, now);
  if (state === 'closed') return 'closed';
  if (state === 'expired') return 'expired';
  if (state === 'full') return 'full';
  return null;
}

/**
 * How many minutes are left, for a screen that wants to say so.
 *
 * Returns null rather than a negative number once the window has passed: a
 * count of minutes is a thing you act on, and "−40 minutes left" is not.
 */
export function minutesLeft(invite: PartyInvite, now: Date): number | null {
  const ms = Date.parse(invite.until) - now.getTime();
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return Math.ceil(ms / 60_000);
}

/**
 * One line for a place pin, in the two kinds of fact it may carry.
 *
 * The crowd count and the invitation count come from different places and mean
 * different things, so they are said separately and never added. The count of
 * people is history the island produced; the count of invitations is a plan
 * somebody typed. Summing them would produce a number with no referent.
 */
export function pinLine(invitesOpen: number, checkinsLastHour: number): Bilingual {
  const parts: Bilingual[] = [];
  if (checkinsLastHour > 0) {
    parts.push({
      en: `${checkinsLastHour} checked in in the last hour`,
      th: `เช็กอินในชั่วโมงที่ผ่านมา ${checkinsLastHour} คน`,
    });
  }
  if (invitesOpen > 0) {
    parts.push({
      en: `${invitesOpen} ${invitesOpen === 1 ? 'party is' : 'parties are'} looking for people`,
      th: `มี ${invitesOpen} ปาร์ตี้กำลังหาคน`,
    });
  }
  if (parts.length === 0) {
    return {
      en: 'Nobody has checked in here in the last hour, and no party is asking.',
      th: 'ยังไม่มีใครเช็กอินที่นี่ในชั่วโมงที่ผ่านมา และยังไม่มีปาร์ตี้ประกาศหาคน',
    };
  }
  return {
    en: parts.map((p) => p.en).join(' · '),
    th: parts.map((p) => p.th).join(' · '),
  };
}
