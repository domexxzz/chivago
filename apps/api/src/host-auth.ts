/**
 * Host authentication and scoping.
 *
 * THE RULE THIS FILE EXISTS TO ENFORCE:
 * a host may only see and decide submissions for quests it posted.
 *
 * The previous single `CHIVAGO_HOST_SECRET` let any holder approve anything.
 * The host is the party vouching for the work - Samui Municipality's name goes
 * on the ledger entry - so cross-host approval is not a permissions oversight,
 * it breaks the trust model the whole points economy rests on.
 */

import { randomBytes } from 'node:crypto';
import { rows, row, type DB } from './db.ts';
import { constantTimeEqual, deriveKey, hashSecret, parseHash } from './scrypt.ts';

/**
 * The check could not be performed - as distinct from the key being wrong.
 *
 * Access is denied either way, but a caller that cannot tell them apart tells
 * a legitimate host their key is bad when the truth is that the machine ran
 * out of memory for a moment. That sends someone to rotate a working key.
 */
export class KeyCheckUnavailable extends Error {
  constructor(cause: unknown) {
    super('Could not verify the key');
    this.cause = cause;
  }
}

/**
 * Hash an API key for storage.
 * Format: `scrypt$<salt-hex>$<hash-hex>`, so the parameters travel with the
 * value and a future re-tuning does not invalidate existing rows.
 *
 * The parameters, the derivation and the strict hex decode moved to
 * `scrypt.ts`, which computes the same digest without `node:crypto`. Existing
 * `api_key_hash` rows keep verifying.
 */
export function hashApiKey(key: string): string {
  return hashSecret(key);
}

/**
 * Verify a key against a stored hash, in constant time.
 *
 * Returns false rather than throwing on a malformed stored value: a corrupt row
 * must fail closed, not crash the login route for everyone.
 *
 * FAILING CLOSED IS THE POINT. An earlier version decoded the stored hex
 * loosely, so a truncated or garbled `api_key_hash` produced an empty expected
 * buffer - and `timingSafeEqual(empty, empty)` is true, which authenticated
 * EVERY key against that row. Both lengths are now pinned before any
 * comparison happens.
 */
export function verifyApiKey(key: string, stored: string | null): boolean {
  // `parseHash` length-checks both halves with a STRICT hex decode before any
  // comparison happens, which is what pins the lengths referred to above.
  const parsed = parseHash(stored);
  if (!parsed) return false;

  let actual: Uint8Array;
  try {
    actual = deriveKey(key, parsed.salt);
  } catch (err) {
    // NOT a wrong key. Deriving the hash failed - out of memory, a bad
    // parameter - and reporting that as "wrong key" is a lie that costs
    // somebody a key rotation.
    throw new KeyCheckUnavailable(err);
  }
  return constantTimeEqual(actual, parsed.expected);
}

/**
 * Generate a host API key.
 *
 * Prefixed so a leaked key is greppable in logs and recognisable in a support
 * ticket, and grouped so a human can read it aloud down a phone line - which is
 * how a key actually reaches a municipal office.
 */
export function generateApiKey(): string {
  const raw = randomBytes(20).toString('base64url').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return `chv_${raw.slice(0, 5)}-${raw.slice(5, 10)}-${raw.slice(10, 15)}-${raw.slice(15, 20)}`;
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

/**
 * Eight hours - one working day. Long enough that a reviewer working through a
 * weekend backlog is not logged out mid-queue, short enough that a shared
 * office machine does not stay authenticated overnight.
 */
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

export const SESSION_COOKIE = 'chivago_host';

export interface HostSession {
  token: string;
  hostId: string;
  hostName: string;
  reviewer: string | null;
  /**
   * 'host' reviews its own quest proofs. 'moderator' can also take reviews
   * down. Separate because reviews are about PLACES, which no host owns -
   * see migrations.ts.
   */
  role: 'host' | 'moderator' | 'admin';
  /**
   * What kind of organisation signed in. `operator` is the one that matters
   * to the console: a business answering travellers' questions, whose login
   * reaches its listings and nothing else.
   */
  hostType: string;
  expiresAt: string;
}

/** Exchange a valid API key for a session. Returns null if the key is unknown. */
export function login(
  db: DB,
  apiKey: string,
  reviewer: string | null,
  username: string | null = null,
  now = new Date(),
): HostSession | null {
  const candidates = rows<{
    id: string; name: string; role: string; type: string; api_key_hash: string | null; console_username: string | null;
  }>(
    db.prepare('SELECT id, name, role, type, api_key_hash, console_username FROM hosts WHERE api_key_hash IS NOT NULL')
      .all(),
  );

  // Every candidate is checked even after a match, so response time does not
  // reveal which host a key belongs to or how far down the table it sat.
  let matched: { id: string; name: string; role: string; type: string } | null = null;
  for (const host of candidates) {
    const usernameMatches = username === null
      ? host.role !== 'admin'
      : host.console_username?.toLocaleLowerCase('en-US') === username.toLocaleLowerCase('en-US');
    if (verifyApiKey(apiKey, host.api_key_hash) && usernameMatches && !matched) {
      matched = { id: host.id, name: host.name, role: host.role, type: host.type };
    }
  }
  if (!matched) return null;

  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS).toISOString();
  db.prepare(
    'INSERT INTO host_sessions (token, host_id, created_at, expires_at, reviewer) VALUES (?,?,?,?,?)',
  ).run(token, matched.id, now.toISOString(), expiresAt, reviewer);

  return {
    token, hostId: matched.id, hostName: matched.name,
    role: matched.role === 'admin' ? 'admin' : matched.role === 'moderator' ? 'moderator' : 'host',
    hostType: matched.type,
    reviewer, expiresAt,
  };
}

/** Resolve a session token. Returns null if unknown or expired. */
export function resolveSession(
  db: DB,
  token: string | undefined,
  now = new Date(),
): HostSession | null {
  if (!token) return null;
  const found = row<{
    token: string; host_id: string; expires_at: string; reviewer: string | null;
    name: string; role: string; type: string;
  }>(
    db
      .prepare(
        `SELECT s.token, s.host_id, s.expires_at, s.reviewer, h.name, h.role, h.type
         FROM host_sessions s JOIN hosts h ON h.id = s.host_id
         WHERE s.token = ?`,
      )
      .get(token),
  );
  if (!found) return null;
  if (new Date(found.expires_at) <= now) {
    db.prepare('DELETE FROM host_sessions WHERE token = ?').run(token);
    return null;
  }
  return {
    token: found.token,
    hostId: found.host_id,
    hostName: found.name,
    role: found.role === 'admin' ? 'admin' : found.role === 'moderator' ? 'moderator' : 'host',
    // Read on every request, not frozen into the session at sign-in: a host
    // re-typed as an operator loses the rest of the console at once.
    hostType: found.type,
    reviewer: found.reviewer,
    expiresAt: found.expires_at,
  };
}

export function logout(db: DB, token: string | undefined): void {
  if (token) db.prepare('DELETE FROM host_sessions WHERE token = ?').run(token);
}

/** Drop expired sessions. Called opportunistically on login. */
export function pruneSessions(db: DB, now = new Date()): number {
  const count = () => row<{ n: number }>(db.prepare('SELECT COUNT(*) n FROM host_sessions').get())!.n;
  const before = count();
  db.prepare('DELETE FROM host_sessions WHERE expires_at <= ?').run(now.toISOString());
  return before - count();
}

/**
 * Does this host own this quest?
 * Every console query and every decision goes through this.
 */
export function hostOwnsQuest(db: DB, hostId: string, questId: string): boolean {
  return (
    row<{ n: number }>(
      db.prepare('SELECT COUNT(*) n FROM quests WHERE id = ? AND host_id = ?').get(questId, hostId),
    )?.n === 1
  );
}

/** Parse a cookie header for one value. */
export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) {
      const raw = rest.join('=');
      // A malformed percent-escape is a bad cookie, not a server error. The
      // raw value cannot match any session token, so the request is simply
      // signed out - which is the right answer to a cookie nobody set.
      try { return decodeURIComponent(raw); } catch { return raw; }
    }
  }
  return undefined;
}
