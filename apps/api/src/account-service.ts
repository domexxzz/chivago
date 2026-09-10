/**
 * Who the caller actually is.
 *
 * THE HOLE THIS FILE CLOSES: `userId()` read `x-chivago-user` and believed it.
 * Any caller could send `x-chivago-user: demo-user` and read that person's
 * wallet, ledger, mood history, emergency contacts and SOS log. With one user
 * in the database that was theoretical. It stops being theoretical on the day
 * a second person exists, which is the day accounts land — so authentication
 * has to arrive with them and not after.
 *
 * NO PASSWORD AND NO EMAIL. The safest credential is the one never collected:
 * under PDPA, personal data you do not hold cannot leak, and a tourist should
 * not need a Thai phone number to keep their own points. A device proves
 * itself with a random token it was handed once, and a person moves their
 * account to a new phone by reading eight characters off the old one.
 *
 * SHA-256, NOT SCRYPT, and that is a deliberate difference from `host-auth.ts`
 * next door. scrypt is slow on purpose because a human-chosen password has
 * perhaps 30 bits of entropy and must be made expensive to guess. These tokens
 * are 256 random bits; no hashing speed brings them within reach of guessing,
 * and paying scrypt's 16 MB on every single API call would be buying nothing.
 * Hashing at all is so a leaked backup holds no usable keys.
 */

import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { isPrimary } from './primary.ts';
import { row, type DB } from './db.ts';

/** Prefixed so a leaked key is greppable in a log and obvious in a paste. */
const KEY_PREFIX = 'chvg_dev_';

/**
 * The alphabet a link code is read aloud from.
 *
 * No 0/O, no 1/I/L: the code travels between two phones by somebody reading it
 * out or squinting at it, and a character pair that cannot be told apart is a
 * support ticket. 32 symbols, 8 characters, 40 bits.
 */
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const CODE_LENGTH = 8;

/**
 * Ten minutes.
 *
 * Long enough to walk to the other phone and type it, short enough that the
 * window in which a guess could land is small. Guessing is already infeasible
 * — one outstanding code per user against 31^8 — but a credential with no
 * expiry is a credential somebody screenshots and forgets.
 */
export const LINK_CODE_TTL_MS = 10 * 60 * 1000;

export class UnknownDevice extends Error {
  constructor() { super('This device is not registered'); this.name = 'UnknownDevice'; }
}

/** Why a link code could not be claimed. Distinct, because they read differently. */
export type LinkFailure = 'unknown' | 'expired' | 'used';

export class LinkCodeRefused extends Error {
  /** Written out rather than a parameter property: node's strip-only TypeScript
   *  cannot compile those, and this file has to run under `node --test`. */
  readonly reason: LinkFailure;
  constructor(reason: LinkFailure) {
    super(`Link code refused: ${reason}`);
    this.name = 'LinkCodeRefused';
    this.reason = reason;
  }
}

export const hashToken = (token: string): string =>
  createHash('sha256').update(token, 'utf8').digest('hex');

/** 256 bits, base64url, prefixed. */
export function generateDeviceKey(): string {
  return `${KEY_PREFIX}${randomBytes(32).toString('base64url')}`;
}

/**
 * A readable one-time code.
 *
 * `randomInt` rather than `randomBytes` modulo the alphabet length: 256 does
 * not divide 31, so the modulo would make the first few letters measurably
 * likelier than the last few. It would still be hard to guess and it would
 * still be a bias somebody could exploit, and the unbiased version costs
 * nothing.
 */
export function generateLinkCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

/** Codes are typed by a human, so accept lower case and stray spaces. */
export const normaliseCode = (raw: string): string =>
  raw.replace(/[\s-]/g, '').toUpperCase();

export interface RegisteredDevice {
  userId: string;
  /** Returned ONCE. Only its hash is stored; nothing can recover it later. */
  deviceKey: string;
}

/**
 * A new person on a new device.
 *
 * The user row and the device row are written together: a device that
 * registered but whose user failed to insert would authenticate as nobody, and
 * a user with no device could never be reached again.
 */
export function registerDevice(
  db: DB, opts: { displayName?: string; label?: string; locale?: string; now?: Date } = {},
): RegisteredDevice {
  const now = (opts.now ?? new Date()).toISOString();
  const userId = `u_${randomBytes(9).toString('base64url')}`;
  const deviceKey = generateDeviceKey();

  db.prepare('INSERT INTO users (id, display_name, locale, created_at) VALUES (?,?,?,?)')
    .run(userId, opts.displayName ?? 'Traveller', opts.locale ?? 'en', now);
  db.prepare(
    'INSERT INTO device_keys (key_hash, user_id, label, created_at, last_seen_at) VALUES (?,?,?,?,?)',
  ).run(hashToken(deviceKey), userId, opts.label ?? null, now, now);

  return { userId, deviceKey };
}

/**
 * Which user this key belongs to, or null.
 *
 * Null rather than a throw, because "no key" and "a key I do not know" reach
 * the same answer at the edge — refuse — and the caller decides the wording.
 * A revoked device is treated exactly like an unknown one.
 */
export function resolveDevice(db: DB, key: string | undefined, now = new Date()): string | null {
  if (!key || !key.startsWith(KEY_PREFIX)) return null;

  const found = row<{ user_id: string; revoked_at: string | null }>(
    db.prepare('SELECT user_id, revoked_at FROM device_keys WHERE key_hash = ?')
      .get(hashToken(key)),
  );
  if (!found || found.revoked_at !== null) return null;

  /*
    Last seen is best-effort telemetry for "which of my phones is this", and
    the line above has always said so — but it was not best-effort in the
    code: the write threw and the request 500ed with it.

    Under LiteFS that is not hypothetical. EVERY authenticated GET comes
    through here, and a replica cannot write, so the whole signed-in surface
    answered `disk I/O error` on whichever machine was not primary. Measured
    on the staging app: two reads in six.

    So it is skipped where it cannot work, and swallowed where it merely
    fails. A missing timestamp on a device list is worth nothing next to a
    read that works.
  */
  if (isPrimary()) {
    try {
      db.prepare('UPDATE device_keys SET last_seen_at = ? WHERE key_hash = ?')
        .run(now.toISOString(), hashToken(key));
    } catch (e) {
      console.warn('[chivago] last-seen not recorded:', (e as Error).message);
    }
  }
  return found.user_id;
}

/**
 * A code that puts this account on another phone.
 *
 * ONE OUTSTANDING CODE PER USER. Issuing a second invalidates the first, which
 * is both what somebody expects when they tap the button again and the thing
 * that keeps the guessable keyspace at one code per person rather than one per
 * tap.
 */
export function issueLinkCode(db: DB, userId: string, now = new Date()): string {
  db.prepare('DELETE FROM link_codes WHERE user_id = ? AND claimed_at IS NULL').run(userId);

  const code = generateLinkCode();
  db.prepare(
    'INSERT INTO link_codes (code_hash, user_id, created_at, expires_at) VALUES (?,?,?,?)',
  ).run(
    hashToken(code), userId, now.toISOString(),
    new Date(now.getTime() + LINK_CODE_TTL_MS).toISOString(),
  );
  return code;
}

/**
 * Join this device to the account that issued the code.
 *
 * Order matters: USED is checked before EXPIRED. A replayed code is a
 * different event from a stale one — the first may mean somebody else already
 * used it — and reporting "expired" for a code that was claimed would hide
 * exactly the case worth noticing.
 *
 * No new user is created. That is the whole point: the traveller keeps the
 * points, the passport and the companions they already earned.
 */
export function claimLinkCode(
  db: DB, rawCode: string, opts: { label?: string; now?: Date } = {},
): RegisteredDevice {
  const now = opts.now ?? new Date();
  const code = normaliseCode(rawCode);

  const found = row<{ user_id: string; expires_at: string; claimed_at: string | null }>(
    db.prepare('SELECT user_id, expires_at, claimed_at FROM link_codes WHERE code_hash = ?')
      .get(hashToken(code)),
  );
  if (!found) throw new LinkCodeRefused('unknown');
  if (found.claimed_at !== null) throw new LinkCodeRefused('used');
  if (new Date(found.expires_at).getTime() <= now.getTime()) {
    throw new LinkCodeRefused('expired');
  }

  const deviceKey = generateDeviceKey();
  const iso = now.toISOString();
  db.prepare('UPDATE link_codes SET claimed_at = ? WHERE code_hash = ?').run(iso, hashToken(code));
  db.prepare(
    'INSERT INTO device_keys (key_hash, user_id, label, created_at, last_seen_at) VALUES (?,?,?,?,?)',
  ).run(hashToken(deviceKey), found.user_id, opts.label ?? null, iso, iso);

  return { userId: found.user_id, deviceKey };
}

export interface DeviceRow {
  label: string | null;
  createdAt: string;
  lastSeenAt: string | null;
  /** True for the device asking. A list where you cannot tell is unusable. */
  current: boolean;
}

/** The phones on this account. Never the keys — those exist once and are gone. */
export function devicesFor(db: DB, userId: string, currentKey?: string): DeviceRow[] {
  const currentHash = currentKey ? hashToken(currentKey) : null;
  return (db.prepare(
    `SELECT key_hash, label, created_at, last_seen_at
     FROM device_keys WHERE user_id = ? AND revoked_at IS NULL
     ORDER BY created_at`,
  ).all(userId) as { key_hash: string; label: string | null; created_at: string; last_seen_at: string | null }[])
    .map((d) => ({
      label: d.label,
      createdAt: d.created_at,
      lastSeenAt: d.last_seen_at,
      current: currentHash !== null && safeEqualHex(d.key_hash, currentHash),
    }));
}

/**
 * Constant-time compare of two hex digests.
 *
 * `===` would leak, through timing, how many leading characters two hashes
 * share. It cannot matter here — both sides are already public-ish digests of
 * things the caller holds — but a codebase that compares secrets with `===`
 * in one place teaches the next person that it is fine.
 */
function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}

/**
 * Stop trusting a phone that is no longer yours.
 *
 * Revoked, not deleted, so "this phone was removed on the 3rd" stays
 * answerable — and a caller cannot use revocation to quietly erase that a
 * device ever existed.
 */
export function revokeDevice(db: DB, userId: string, label: string, now = new Date()): number {
  const res = db.prepare(
    'UPDATE device_keys SET revoked_at = ? WHERE user_id = ? AND label = ? AND revoked_at IS NULL',
  ).run(now.toISOString(), userId, label);
  return Number(res.changes ?? 0);
}
