/**
 * scrypt, and the few primitives around it, without `node:crypto`.
 *
 * WHY. `node:crypto`'s `scryptSync` does not exist on Cloudflare Workers,
 * whose WebCrypto offers PBKDF2 and not scrypt. That was recorded as the
 * blocker that would force the password hash to change - and changing it
 * invalidates every existing password unless a rehash-on-next-login path is
 * written first.
 *
 * IT DOES NOT HAVE TO CHANGE. A pure-JavaScript scrypt computes the SAME
 * DIGEST, byte for byte, because scrypt is a specification and not an
 * implementation detail. `scrypt.test.ts` holds the proof in three parts:
 * hashes produced by the OLD `node:crypto` path, checked in as fixed vectors;
 * agreement with `node:crypto` on fresh random input; and RFC 7914 vectors 2
 * and 3 asserted against THIS implementation directly, so that a bug common
 * to both implementations would still be caught. Vector 3 uses exactly the
 * parameters pinned below.
 *
 * So no password is invalidated, no rehash path is needed, and every row in
 * `user_accounts.password_hash` and `hosts.api_key_hash` keeps verifying.
 *
 * THE COST, stated plainly: about 51ms per derivation against `node:crypto`'s
 * 37ms on the same machine - one implementation on both runtimes, rather than
 * a tested path on Node and an untested one on Workers. It is paid per login,
 * not per request.
 *
 * Nothing here imports `node:crypto`, `Buffer`, or anything else absent from
 * Workers. `crypto.getRandomValues` is a global on both runtimes.
 */

import { scrypt } from '@noble/hashes/scrypt.js';

/**
 * scrypt parameters, pinned.
 *
 * These are node's own defaults for N/r/p, written down rather than inherited.
 * They were already pinned identically in `user-account-service.ts` and
 * `host-auth.ts`; they live here once so the two cannot drift, because if they
 * drift every hash written by one stops verifying under the other.
 *
 * `maxmem` is gone: it was a guard on node's native implementation, which
 * refused to allocate past a ceiling. It was never part of the algorithm and
 * does not affect the digest.
 */
export const SCRYPT = { N: 16_384, r: 8, p: 1 } as const;

export const KEY_LEN = 32;
export const SALT_LEN = 16;

const UTF8 = new TextEncoder();

/**
 * Derive a key from a secret and a salt.
 *
 * The secret is encoded as UTF-8, which is what `node:crypto` does with a
 * string, so a Thai password hashes to the same bytes it always did.
 */
export const deriveKey = (secret: string, salt: Uint8Array): Uint8Array =>
  scrypt(UTF8.encode(secret), salt, { ...SCRYPT, dkLen: KEY_LEN });

/** A fresh salt. */
export const randomSalt = (): Uint8Array => crypto.getRandomValues(new Uint8Array(SALT_LEN));

export const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

/**
 * Strict hex decode. Returns null unless the input is exactly
 * `expectedBytes` worth of valid hex.
 *
 * STRICTNESS IS A SECURITY PROPERTY, not tidiness. `Buffer.from(s, 'hex')`
 * silently DROPS invalid characters and truncates at the first bad pair, so
 * "zz" decodes to a zero-length buffer rather than failing - and comparing two
 * empty buffers in constant time returns TRUE, which authenticated every key
 * against a corrupt row. That bug is the reason this function exists; see the
 * note over `verifyApiKey` in `host-auth.ts`.
 */
export function fromHex(value: string, expectedBytes: number): Uint8Array | null {
  if (value.length !== expectedBytes * 2) return null;
  if (!/^[0-9a-f]+$/i.test(value)) return null;
  const out = new Uint8Array(expectedBytes);
  for (let i = 0; i < expectedBytes; i += 1) {
    out[i] = Number.parseInt(value.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/**
 * Constant-time comparison, replacing `timingSafeEqual`.
 *
 * Unequal lengths return false immediately - that much is already public, since
 * the hash length is fixed and written in this file. For equal lengths every
 * byte is read and the differences accumulated with OR, so the work does not
 * depend on WHERE the first difference is. No early return inside the loop:
 * that is the whole point, and an `if (a[i] !== b[i]) return false` here would
 * leak the position of the first wrong byte through timing.
 *
 * TWO EMPTY INPUTS ARE NOT EQUAL. Nothing compares zero bytes deliberately,
 * and `timingSafeEqual(empty, empty)` returning TRUE is precisely how a
 * corrupt stored hash once authenticated every key. `parseHash` already makes
 * that unreachable by pinning both lengths, so this is the second lock on the
 * same door - but this function is exported, and the next caller should not
 * have to rediscover the lesson to be safe.
 */
export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length === 0 || b.length === 0) return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

/**
 * The stored format: `scrypt$<salt-hex>$<hash-hex>`.
 *
 * Self-describing on purpose. The algorithm name travels with the value, so a
 * future re-tuning can add a second prefix and leave existing rows verifying
 * under the old one.
 */
export const formatHash = (salt: Uint8Array, key: Uint8Array): string =>
  `scrypt$${toHex(salt)}$${toHex(key)}`;

/** Hash a secret for storage. */
export function hashSecret(secret: string): string {
  const salt = randomSalt();
  return formatHash(salt, deriveKey(secret, salt));
}

/** A stored hash, taken apart and length-checked. `null` if it is not usable. */
export function parseHash(stored: string | null): { salt: Uint8Array; expected: Uint8Array } | null {
  if (!stored) return null;
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return null;
  const salt = fromHex(parts[1]!, SALT_LEN);
  const expected = fromHex(parts[2]!, KEY_LEN);
  if (!salt || !expected) return null;
  return { salt, expected };
}
