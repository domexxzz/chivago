/**
 * Invitations, read and written without ever storing where anybody is.
 *
 * Every query below is keyed on a PLACE and a WINDOW. There is no position in
 * the schema, none in the arguments, and none in what goes back to a client —
 * see the header of `party-invites.ts` in core for why that is the whole
 * feature rather than a detail of it.
 *
 * Two things this service deliberately does not do.
 *
 *   NO STATE COLUMN. Open, full, closed and expired are computed by
 *   `inviteState` from the clock, the accepted count and `closed_at`. So an
 *   invitation nobody swept is still expired when somebody reads it, and a
 *   cron job that never runs cannot leave a lie on the map.
 *
 *   NO SECOND LEDGER. The party's `missionsVerified` on a listing is read
 *   through `membersOf`, the same expression the host standing uses, so a
 *   figure shown to a stranger and a figure shown on the public board cannot
 *   disagree.
 */

import { randomBytes } from 'node:crypto';
import {
  MAX_PARTY_SIZE, inviteState, requestRefusal, spacesLeft, spacesRefusal,
  summarise, windowRefusal,
  type InviteListing, type PartyInvite, type PostFailure, type RequestFailure,
  type RequestOutcome,
} from '@chivago/core';
import { row, rows, type DB } from './db.ts';
import { notReversed } from './ledger-sql.ts';
import { activePartyFor, joinPartyById, membersOf } from './party-service.ts';

export class InviteRefused extends Error {
  readonly reason: PostFailure | RequestFailure;
  constructor(reason: PostFailure | RequestFailure) {
    super(`Invitation refused: ${reason}`);
    this.name = 'InviteRefused';
    this.reason = reason;
  }
}

type InviteRow = {
  id: string; party_id: string; place_id: string; from_at: string; until_at: string;
  spaces: number; note: string | null; closed_at: string | null; accepted: number;
};

const toInvite = (r: InviteRow): PartyInvite => ({
  id: r.id,
  partyId: r.party_id,
  placeId: r.place_id,
  from: r.from_at,
  until: r.until_at,
  spacesOffered: r.spaces,
  accepted: r.accepted,
  note: r.note,
  closedAt: r.closed_at,
});

/** The accepted count is a COUNT, not a column, for the same reason the state is not one. */
const SELECT_INVITE = `
  SELECT i.id, i.party_id, i.place_id, i.from_at, i.until_at, i.spaces, i.note, i.closed_at,
         (SELECT COUNT(*) FROM invite_requests r
           WHERE r.invite_id = i.id AND r.outcome = 'accepted') AS accepted
  FROM party_invites i`;

export function inviteById(db: DB, inviteId: string): PartyInvite | null {
  const found = row<InviteRow>(db.prepare(`${SELECT_INVITE} WHERE i.id = ?`).get(inviteId));
  return found ? toInvite(found) : null;
}

/** Live members, so a party that lost somebody has room to offer again. */
function partySize(db: DB, partyId: string): number {
  return (db.prepare(
    'SELECT COUNT(*) AS n FROM party_members WHERE party_id = ? AND left_at IS NULL',
  ).get(partyId) as { n: number }).n;
}

/** The invitation this party currently has up, if any. One at a time. */
export function openInviteFor(db: DB, partyId: string, now = new Date()): PartyInvite | null {
  const found = rows<InviteRow>(
    db.prepare(`${SELECT_INVITE} WHERE i.party_id = ? ORDER BY i.created_at DESC LIMIT 5`).all(partyId),
  ).map(toInvite);
  return found.find((i) => inviteState(i, now) !== 'expired' && i.closedAt === null) ?? null;
}

export interface PostInput {
  placeId: string;
  from: string;
  until: string;
  spaces: number;
  note?: string | null;
}

/**
 * Post one.
 *
 * Every refusal is decided in core and only carried out here, so the sentence
 * a traveller reads and the rule the server enforced are the same object.
 */
export function postInvite(
  db: DB, userId: string, input: PostInput, now = new Date(),
): PartyInvite {
  const party = activePartyFor(db, userId);
  if (party === null) throw new InviteRefused('no-party');

  if (openInviteFor(db, party.id, now) !== null) throw new InviteRefused('already-posted');

  const size = partySize(db, party.id);
  const spaces = spacesRefusal(input.spaces, size);
  if (spaces !== null) throw new InviteRefused(spaces);

  const window = windowRefusal(input.from, input.until, now);
  if (window !== null) throw new InviteRefused(window);

  const place = row<{ id: string }>(
    db.prepare('SELECT id FROM places WHERE id = ?').get(input.placeId),
  );
  // A place that is not on the island cannot be met at. Reported as a window
  // problem would be a lie, so it reuses the same refusal a bad form field gets.
  if (!place) throw new InviteRefused('spaces');

  const id = `inv_${randomBytes(6).toString('base64url')}`;
  // A note is trimmed and capped rather than rejected: somebody writing too
  // much has said something, and losing it to a validation error helps nobody.
  const note = (input.note ?? '').trim().slice(0, 140) || null;

  db.prepare(
    `INSERT INTO party_invites (id, party_id, place_id, from_at, until_at, spaces, note, created_by, created_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
  ).run(id, party.id, input.placeId, input.from, input.until, input.spaces, note, userId, now.toISOString());

  return {
    id, partyId: party.id, placeId: input.placeId,
    from: input.from, until: input.until,
    spacesOffered: input.spaces, accepted: 0, note, closedAt: null,
  };
}

/**
 * Close it early. Anybody in the party may, not only whoever posted it.
 *
 * The party is the unit that made the offer, so the party is the unit that can
 * withdraw it — waiting for one person to come back online to stop strangers
 * arriving is the wrong failure mode.
 */
export function closeInvite(db: DB, userId: string, inviteId: string, now = new Date()): boolean {
  const party = activePartyFor(db, userId);
  if (party === null) return false;
  const res = db.prepare(
    'UPDATE party_invites SET closed_at = ? WHERE id = ? AND party_id = ? AND closed_at IS NULL',
  ).run(now.toISOString(), inviteId, party.id);
  return res.changes > 0;
}

/**
 * How many open invitations each place has, for the pins.
 *
 * Returns a count and nothing else. A pin is allowed to say that somebody is
 * asking; it is not allowed to say who, and a shape with room for one name
 * would eventually hold eight.
 */
export function openInviteCounts(
  db: DB, placeIds: readonly string[], now = new Date(),
): Map<string, number> {
  const counts = new Map<string, number>(placeIds.map((id) => [id, 0]));
  if (placeIds.length === 0) return counts;

  const holes = placeIds.map(() => '?').join(',');
  for (const r of rows<InviteRow>(
    db.prepare(`${SELECT_INVITE} WHERE i.place_id IN (${holes}) AND i.until_at > ?`)
      .all(...placeIds, now.toISOString()),
  )) {
    const invite = toInvite(r);
    if (inviteState(invite, now) !== 'open') continue;
    counts.set(invite.placeId, (counts.get(invite.placeId) ?? 0) + 1);
  }
  return counts;
}

/**
 * The open invitations at one place, as a stranger may see them.
 *
 * `InviteListing` is the privacy surface and this is the only function that
 * builds one. Everything it knows that is not in that type stays here.
 */
export function listingsAt(
  db: DB, placeId: string, askerUserId: string | null, now = new Date(),
): InviteListing[] {
  const asking = askerUserId === null ? null : activePartyFor(db, askerUserId);

  const found = rows<InviteRow>(
    db.prepare(`${SELECT_INVITE} WHERE i.place_id = ? AND i.until_at > ? ORDER BY i.from_at`)
      .all(placeId, now.toISOString()),
  ).map(toInvite).filter((i) => inviteState(i, now) === 'open');

  return found.map((invite) => {
    const party = row<{ name: string }>(
      db.prepare('SELECT name FROM parties WHERE id = ?').get(invite.partyId),
    );
    const summary = summarise(membersOf(db, invite.partyId, askerUserId ?? ''));
    return {
      id: invite.id,
      placeId: invite.placeId,
      from: invite.from,
      until: invite.until,
      spacesLeft: spacesLeft(invite),
      note: invite.note,
      state: inviteState(invite, now),
      partyName: party?.name ?? 'A party',
      missionsVerified: summary.missionsVerified,
      yours: asking !== null && asking.id === invite.partyId,
    };
  });
}

/** Whether this person already has a live request against this invitation. */
function hasAsked(db: DB, inviteId: string, userId: string): boolean {
  const found = row<{ outcome: string }>(
    db.prepare('SELECT outcome FROM invite_requests WHERE invite_id = ? AND user_id = ?')
      .get(inviteId, userId),
  );
  return found?.outcome === 'waiting';
}

/**
 * Ask to come along.
 *
 * Writes a request and nothing else — being accepted is a separate decision a
 * human in the party makes, which is the point. An invitation that joined
 * people automatically would be a door, and a door is not something a small
 * group of travellers should have to guard.
 */
export function requestJoin(db: DB, userId: string, inviteId: string, now = new Date()): void {
  const invite = inviteById(db, inviteId);
  const party = activePartyFor(db, userId);

  const refusal = requestRefusal(invite, now, {
    partyId: party?.id ?? null,
    alreadyAsked: hasAsked(db, inviteId, userId),
  });
  if (refusal !== null) throw new InviteRefused(refusal);

  // A previous 'declined' or 'withdrawn' row is replaced rather than blocking
  // forever: people change their minds, and a party that said no once has the
  // same no available the second time.
  db.prepare(
    `INSERT INTO invite_requests (invite_id, user_id, asked_at, outcome)
     VALUES (?,?,?,'waiting')
     ON CONFLICT (invite_id, user_id)
     DO UPDATE SET outcome = 'waiting', asked_at = excluded.asked_at, decided_at = NULL`,
  ).run(inviteId, userId, now.toISOString());
}

/** Take it back. Only ever touches the asker's own row. */
export function withdrawRequest(db: DB, userId: string, inviteId: string, now = new Date()): boolean {
  const res = db.prepare(
    `UPDATE invite_requests SET outcome = 'withdrawn', decided_at = ?
     WHERE invite_id = ? AND user_id = ? AND outcome = 'waiting'`,
  ).run(now.toISOString(), inviteId, userId);
  return res.changes > 0;
}

export interface PendingRequest {
  inviteId: string;
  userId: string;
  displayName: string;
  /** Host-verified missions. The same figure the listing shows for a party. */
  missionsVerified: number;
  askedAt: string;
}

/**
 * What the party has to answer.
 *
 * Carries the asker's chosen name and their verified count, and nothing else.
 * The party is deciding whether to spend a day with somebody, not auditing
 * them — and the asker has not agreed to be audited.
 */
export function pendingFor(db: DB, userId: string, now = new Date()): PendingRequest[] {
  const party = activePartyFor(db, userId);
  if (party === null) return [];

  return rows<{ invite_id: string; user_id: string; display_name: string; asked_at: string; missions: number }>(
    db.prepare(
      `SELECT r.invite_id, r.user_id, u.display_name, r.asked_at,
              -- Work a host withdrew is not work. The party is about to
              -- decide on a stranger with this number and nothing else, so it
              -- is the last figure that should still be counting a quest the
              -- system itself stopped believing.
              (SELECT COUNT(DISTINCT CASE WHEN l.kind = 'quest_reward' AND l.currency = 'green'
                                          THEN l.source_ref END)
                 FROM ledger l
                WHERE l.user_id = r.user_id AND ${notReversed('l')}) AS missions
       FROM invite_requests r
       JOIN party_invites i ON i.id = r.invite_id
       JOIN users u ON u.id = r.user_id
       WHERE i.party_id = ? AND r.outcome = 'waiting' AND i.until_at > ?
       ORDER BY r.asked_at`,
    ).all(party.id, now.toISOString()),
  ).map((r) => ({
    inviteId: r.invite_id,
    userId: r.user_id,
    displayName: r.display_name,
    missionsVerified: r.missions,
    askedAt: r.asked_at,
  }));
}

/**
 * Say yes or no.
 *
 * Accepting joins them through `joinPartyById`, which runs the same checks a
 * code join does — so a party that filled up between the ask and the answer
 * refuses here exactly as it would have there, rather than growing to nine.
 */
export function decideRequest(
  db: DB, deciderId: string, inviteId: string, askerId: string, accept: boolean, now = new Date(),
): RequestOutcome {
  const party = activePartyFor(db, deciderId);
  if (party === null) throw new InviteRefused('no-party');

  const invite = inviteById(db, inviteId);
  if (invite === null || invite.partyId !== party.id) throw new InviteRefused('unknown');

  const waiting = row<{ outcome: string }>(
    db.prepare('SELECT outcome FROM invite_requests WHERE invite_id = ? AND user_id = ?')
      .get(inviteId, askerId),
  );
  if (waiting?.outcome !== 'waiting') throw new InviteRefused('unknown');

  if (!accept) {
    db.prepare(
      `UPDATE invite_requests SET outcome = 'declined', decided_at = ?
       WHERE invite_id = ? AND user_id = ?`,
    ).run(now.toISOString(), inviteId, askerId);
    return 'declined';
  }

  const state = inviteState(invite, now);
  if (state === 'expired') throw new InviteRefused('expired');
  if (state === 'closed') throw new InviteRefused('closed');
  if (state === 'full') throw new InviteRefused('full');
  if (partySize(db, party.id) >= MAX_PARTY_SIZE) throw new InviteRefused('full');

  joinPartyById(db, askerId, party.id, now);
  db.prepare(
    `UPDATE invite_requests SET outcome = 'accepted', decided_at = ?
     WHERE invite_id = ? AND user_id = ?`,
  ).run(now.toISOString(), inviteId, askerId);
  return 'accepted';
}

export interface MyRequest {
  inviteId: string;
  placeId: string;
  from: string;
  until: string;
  outcome: RequestOutcome;
  askedAt: string;
}

/** What this traveller has asked for, so a screen can say what became of it. */
export function requestsBy(db: DB, userId: string): MyRequest[] {
  return rows<{ invite_id: string; place_id: string; from_at: string; until_at: string; outcome: string; asked_at: string }>(
    db.prepare(
      `SELECT r.invite_id, i.place_id, i.from_at, i.until_at, r.outcome, r.asked_at
       FROM invite_requests r
       JOIN party_invites i ON i.id = r.invite_id
       WHERE r.user_id = ? ORDER BY r.asked_at DESC LIMIT 50`,
    ).all(userId),
  ).map((r) => ({
    inviteId: r.invite_id,
    placeId: r.place_id,
    from: r.from_at,
    until: r.until_at,
    outcome: r.outcome as RequestOutcome,
    askedAt: r.asked_at,
  }));
}
