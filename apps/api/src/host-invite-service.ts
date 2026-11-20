/**
 * One-time invitations for the people who verify quests.
 *
 * The verifier of a quest is whoever is responsible for the place it sends
 * people to: the municipality for the beach clean-up, the restaurant for the
 * food trail. Handing each of them a console key by hand does not scale, and
 * letting anybody sign up as a verifier would let anybody approve their own
 * work - the one thing the impact figures cannot survive.
 *
 * So the trust decision stays with the operator and only the delivery is
 * automatic. The operator names the place and its quests once
 * (POST /internal/invites); the place receives a link, opens it, types the
 * reviewer's name, and the system creates its host, hands it the quests and
 * signs it in. The key is shown on THEIR screen, once.
 *
 * THE LINK IS THE CREDENTIAL until it is used, so: only its SHA-256 is kept,
 * it works once (the claim is a single conditional UPDATE, so two clicks
 * cannot both succeed), and it expires after seven days. A link that reached
 * the wrong person is undone by issuing the host a new key.
 */

import { createHash, randomBytes } from 'node:crypto';
import { row, rows, transact, type DB } from './db.ts';
import { addHost, type HostType } from './add-host.ts';

/** How long an invitation can be accepted. */
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Who may be invited to VERIFY. `operator` is a marketplace account the
 * console deliberately keeps out of the review queue, and `platform` is us.
 */
export const VERIFIER_TYPES = ['municipality', 'ngo', 'hotel', 'community'] as const;
export type VerifierType = (typeof VERIFIER_TYPES)[number];
const isVerifierType = (v: unknown): v is VerifierType => (VERIFIER_TYPES as readonly unknown[]).includes(v);

export class HostInviteRefused extends Error {
  readonly code: 'BAD_INPUT' | 'HOST_EXISTS' | 'NO_SUCH_QUEST' | 'NOT_OPEN';
  constructor(code: 'BAD_INPUT' | 'HOST_EXISTS' | 'NO_SUCH_QUEST' | 'NOT_OPEN', message: string) {
    super(message);
    this.code = code;
  }
}

const hashToken = (token: string): string => createHash('sha256').update(token, 'utf8').digest('hex');

export interface InviteInput {
  hostId: string;
  name: string;
  type: unknown;
  questIds: unknown;
}

/** Create an invitation. Returns the token, which is never stored. */
export function createInvite(db: DB, input: InviteInput, now = new Date()): { token: string; expiresAt: string } {
  const hostId = input.hostId.trim();
  const name = input.name.trim();
  if (!/^h-[a-z0-9-]{2,60}$/.test(hostId)) throw new HostInviteRefused('BAD_INPUT', 'hostId must look like h-<letters-and-digits>');
  if (!name || name.length > 120) throw new HostInviteRefused('BAD_INPUT', 'a name of 1-120 characters is required');
  if (!isVerifierType(input.type)) {
    throw new HostInviteRefused('BAD_INPUT', `type must be one of ${VERIFIER_TYPES.join(', ')}`);
  }
  const questIds = Array.isArray(input.questIds) ? input.questIds.filter((q): q is string => typeof q === 'string') : [];
  if (questIds.length === 0 || questIds.length > 20) throw new HostInviteRefused('BAD_INPUT', 'name 1-20 quests to verify');
  if (row(db.prepare('SELECT 1 FROM hosts WHERE id = ?').get(hostId))) {
    throw new HostInviteRefused('HOST_EXISTS', 'that host already exists');
  }
  const open = row(db.prepare(
    'SELECT 1 FROM host_invites WHERE host_id = ? AND used_at IS NULL AND expires_at > ?',
  ).get(hostId, now.toISOString()));
  if (open) throw new HostInviteRefused('HOST_EXISTS', 'an open invitation for that host already exists');
  for (const q of questIds) {
    if (!row(db.prepare('SELECT 1 FROM quests WHERE id = ?').get(q))) throw new HostInviteRefused('NO_SUCH_QUEST', `no quest ${q}`);
  }
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(now.getTime() + INVITE_TTL_MS).toISOString();
  db.prepare(
    `INSERT INTO host_invites (token_hash, host_id, host_name, host_type, quest_ids, created_at, expires_at)
     VALUES (?,?,?,?,?,?,?)`,
  ).run(hashToken(token), hostId, name, input.type, JSON.stringify(questIds), now.toISOString(), expiresAt);
  return { token, expiresAt };
}

export interface OpenInvite {
  state: 'open';
  hostName: string;
  quests: { id: string; nameEn: string; nameTh: string | null }[];
  expiresAt: string;
}
export type InviteView = OpenInvite | { state: 'used' | 'expired' | 'unknown' };

interface InviteRow {
  host_id: string; host_name: string; host_type: string; quest_ids: string;
  expires_at: string; used_at: string | null;
}

/** What the person who opened the link may see. */
export function readInvite(db: DB, token: string, now = new Date()): InviteView {
  const invite = row<InviteRow>(db.prepare('SELECT * FROM host_invites WHERE token_hash = ?').get(hashToken(token)));
  if (!invite) return { state: 'unknown' };
  if (invite.used_at) return { state: 'used' };
  if (invite.expires_at <= now.toISOString()) return { state: 'expired' };
  const ids = JSON.parse(invite.quest_ids) as string[];
  const quests = rows<{ id: string; name_en: string; name_th: string | null }>(
    db.prepare(`SELECT id, name_en, name_th FROM quests WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids),
  ).map((q) => ({ id: q.id, nameEn: q.name_en, nameTh: q.name_th }));
  return { state: 'open', hostName: invite.host_name, quests, expiresAt: invite.expires_at };
}

/**
 * Claim the invitation: create the host, hand it the quests, answer its key.
 * The claim and the creation are one transaction, so a second click, or a
 * failure half way, leaves no host without its quests and no used link
 * without its host.
 */
export function acceptInvite(db: DB, token: string, reviewer: string, now = new Date()): { hostId: string; key: string } {
  if (!reviewer.trim()) throw new HostInviteRefused('BAD_INPUT', 'the reviewer name is required');
  return transact(db, () => {
    const claimed = db.prepare(
      `UPDATE host_invites SET used_at = ?, used_by = ?
        WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?`,
    ).run(now.toISOString(), reviewer.trim().slice(0, 80), hashToken(token), now.toISOString());
    if (Number(claimed.changes) !== 1) throw new HostInviteRefused('NOT_OPEN', 'this invitation is used, expired or unknown');
    const invite = row<InviteRow>(db.prepare('SELECT * FROM host_invites WHERE token_hash = ?').get(hashToken(token)))!;
    const made = addHost(db, { id: invite.host_id, name: invite.host_name, type: invite.host_type as HostType, now });
    if (!made.key) throw new HostInviteRefused('HOST_EXISTS', 'that host already exists');
    const ids = JSON.parse(invite.quest_ids) as string[];
    db.prepare(`UPDATE quests SET host_id = ? WHERE id IN (${ids.map(() => '?').join(',')})`).run(invite.host_id, ...ids);
    return { hostId: invite.host_id, key: made.key };
  });
}
