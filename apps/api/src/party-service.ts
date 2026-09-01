/**
 * Parties, read out of the same ledger everything else reads.
 *
 * No points table, no shared wallet, no transfer. A party's totals are its
 * members' own figures added up on read — the sixth time this codebase has
 * declined to keep a second record of a fact the ledger already holds.
 *
 * Green is counted from `quest_reward` rows only, exactly as the standing
 * counts it. Summing every positive green row would put the pilot's 1,240
 * opening balance into every member's contribution, and a party of four would
 * open at 4,960 "earned" before anybody had done anything.
 */

import { randomBytes, randomInt } from 'node:crypto';
import { row, rows, type DB } from './db.ts';
import { hashToken } from './account-service.ts';
import { MAX_PARTY_SIZE, type JoinFailure, type PartyMember } from '@chivago/core';

/** Same alphabet as a link code: read off one screen, typed into another. */
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const CODE_LENGTH = 6;

export class PartyRefused extends Error {
  readonly reason: JoinFailure;
  constructor(reason: JoinFailure) {
    super(`Party join refused: ${reason}`);
    this.name = 'PartyRefused';
    this.reason = reason;
  }
}

/** Six characters. Shorter than a device link code, and it does far less. */
export function generatePartyCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

export const normalisePartyCode = (raw: string): string =>
  raw.replace(/[\s-]/g, '').toUpperCase();

export interface PartyRow { id: string; name: string; createdBy: string; createdAt: string }

/** The active party this traveller is in, or null. At most one at a time. */
export function activePartyFor(db: DB, userId: string): PartyRow | null {
  const found = row<{ id: string; name: string; created_by: string; created_at: string }>(
    db.prepare(
      `SELECT p.id, p.name, p.created_by, p.created_at
       FROM parties p
       JOIN party_members m ON m.party_id = p.id
       WHERE m.user_id = ? AND m.left_at IS NULL AND p.disbanded_at IS NULL
       ORDER BY m.joined_at DESC LIMIT 1`,
    ).get(userId),
  );
  return found
    ? { id: found.id, name: found.name, createdBy: found.created_by, createdAt: found.created_at }
    : null;
}

/**
 * Start one, and join it.
 *
 * Leaves whatever party they were in first: somebody is travelling with one
 * group at a time, and being silently in two would make "who am I with" a
 * question with two answers.
 */
export function createParty(
  db: DB, userId: string, name: string, now = new Date(),
): { party: PartyRow; code: string } {
  leaveParty(db, userId, now);

  const id = `pty_${randomBytes(6).toString('base64url')}`;
  const code = generatePartyCode();
  const iso = now.toISOString();

  db.prepare(
    'INSERT INTO parties (id, name, code_hash, created_by, created_at) VALUES (?,?,?,?,?)',
  ).run(id, name.trim() || 'Our trip', hashToken(code), userId, iso);
  db.prepare('INSERT INTO party_members (party_id, user_id, joined_at) VALUES (?,?,?)')
    .run(id, userId, iso);

  return { party: { id, name, createdBy: userId, createdAt: iso }, code };
}

/**
 * Join by code.
 *
 * FULL is checked against members who have not left, so a group that lost
 * somebody has room again — the alternative counts departed members forever
 * and quietly shrinks the party over a fortnight.
 */
export function joinParty(
  db: DB, userId: string, rawCode: string, now = new Date(),
): PartyRow {
  const code = normalisePartyCode(rawCode);
  const found = row<{ id: string; name: string; created_by: string; created_at: string; disbanded_at: string | null }>(
    db.prepare('SELECT id, name, created_by, created_at, disbanded_at FROM parties WHERE code_hash = ?')
      .get(hashToken(code)),
  );
  if (!found) throw new PartyRefused('unknown');
  if (found.disbanded_at !== null) throw new PartyRefused('disbanded');

  const already = row<{ left_at: string | null }>(
    db.prepare('SELECT left_at FROM party_members WHERE party_id = ? AND user_id = ?')
      .get(found.id, userId),
  );
  if (already && already.left_at === null) throw new PartyRefused('already-in');

  const size = (db.prepare(
    'SELECT COUNT(*) AS n FROM party_members WHERE party_id = ? AND left_at IS NULL',
  ).get(found.id) as { n: number }).n;
  if (size >= MAX_PARTY_SIZE) throw new PartyRefused('full');

  leaveParty(db, userId, now);
  const iso = now.toISOString();
  if (already) {
    // Rejoining. The original joined_at is overwritten on purpose: they are in
    // it from now, and pretending otherwise would date their membership to a
    // trip they had already left.
    db.prepare('UPDATE party_members SET left_at = NULL, joined_at = ? WHERE party_id = ? AND user_id = ?')
      .run(iso, found.id, userId);
  } else {
    db.prepare('INSERT INTO party_members (party_id, user_id, joined_at) VALUES (?,?,?)')
      .run(found.id, userId, iso);
  }

  return { id: found.id, name: found.name, createdBy: found.created_by, createdAt: found.created_at };
}

/**
 * Leave. Returns how many memberships ended, which is 0 or 1.
 *
 * The party survives its founder leaving. A group that dissolves when one
 * person steps out would strand everybody else's shared progress on a row
 * nobody can reach.
 */
export function leaveParty(db: DB, userId: string, now = new Date()): number {
  const res = db.prepare(
    'UPDATE party_members SET left_at = ? WHERE user_id = ? AND left_at IS NULL',
  ).run(now.toISOString(), userId);
  return Number(res.changes ?? 0);
}

/**
 * Everyone currently in the party, with what each of them has earned.
 *
 * One query per fact rather than a join per member: the counts come from the
 * same expressions the standing uses, so a member's contribution here and
 * their row on the host board can never disagree.
 */
export function membersOf(db: DB, partyId: string, asking: string): PartyMember[] {
  const people = rows<{ user_id: string; display_name: string }>(
    db.prepare(
      `SELECT u.id AS user_id, u.display_name AS display_name
       FROM party_members m
       JOIN users u ON u.id = m.user_id
       WHERE m.party_id = ? AND m.left_at IS NULL
       ORDER BY m.joined_at`,
    ).all(partyId),
  );
  if (people.length === 0) return [];

  const holes = people.map(() => '?').join(',');
  const ids = people.map((p) => p.user_id);

  const earned = new Map(
    rows<{ user_id: string; green: number; missions: number }>(
      db.prepare(
        `SELECT user_id,
                COALESCE(SUM(CASE WHEN currency = 'green' AND amount > 0
                                   AND kind = 'quest_reward' THEN amount ELSE 0 END), 0) AS green,
                COUNT(DISTINCT CASE WHEN kind = 'quest_reward' AND currency = 'green'
                                    THEN source_ref END) AS missions
         FROM ledger WHERE user_id IN (${holes}) GROUP BY user_id`,
      ).all(...ids),
    ).map((r) => [r.user_id, r]),
  );

  // Provinces per member, through the place they checked in at — the same
  // route the passport takes, so the two cannot drift.
  const provinces = new Map<string, string[]>();
  for (const r of rows<{ user_id: string; province: string }>(
    db.prepare(
      `SELECT DISTINCT l.user_id AS user_id, p.province AS province
       FROM ledger l
       JOIN places p ON p.id = substr(l.source_ref, 9, instr(substr(l.source_ref, 9), ':') - 1)
       WHERE l.user_id IN (${holes}) AND l.kind = 'checkin' AND p.province IS NOT NULL`,
    ).all(...ids),
  )) {
    provinces.set(r.user_id, [...(provinces.get(r.user_id) ?? []), r.province]);
  }

  return people.map((p) => ({
    userId: p.user_id,
    displayName: p.display_name,
    missionsVerified: earned.get(p.user_id)?.missions ?? 0,
    greenEarned: earned.get(p.user_id)?.green ?? 0,
    provinces: provinces.get(p.user_id) ?? [],
    you: p.user_id === asking,
  }));
}

/** Only the person who started it may disband it. */
export function disbandParty(db: DB, userId: string, partyId: string, now = new Date()): boolean {
  const res = db.prepare(
    'UPDATE parties SET disbanded_at = ? WHERE id = ? AND created_by = ? AND disbanded_at IS NULL',
  ).run(now.toISOString(), partyId, userId);
  return Number(res.changes ?? 0) > 0;
}
