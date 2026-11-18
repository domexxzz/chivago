/**
 * The lock on the one door ChivarGo opens to another system.
 *
 * READ THIS BEFORE CHANGING ANYTHING HERE.
 *
 * Every other write to this platform comes from a person's phone, holding a
 * token in `device_keys` that belongs to a row in `users`. A camera incident
 * has no person behind it, so none of that applies: the caller is a machine on
 * Ko Sichang and the only thing that distinguishes it from anyone else on the
 * internet is a shared secret neither side ever transmits.
 *
 * The scheme is Sentiara's, recorded in docs/sentiara-integration-questions.md
 * answer 3, and it is deliberately boring:
 *
 *   X-Sentiara-Timestamp: <unix seconds>
 *   X-Sentiara-Signature: sha256=<hex of HMAC(secret, "<timestamp>." + raw body)>
 *
 * Three properties are load-bearing, and each one is a mistake somebody has
 * made in production before:
 *
 *  1. THE TIMESTAMP IS INSIDE THE SIGNED STRING. Sign only the body and a
 *     recorded request can be replayed forever, because the replay is
 *     byte-identical and therefore correctly signed.
 *  2. THE TIMESTAMP IS CHECKED AGAINST A WINDOW. Signing it proves it was not
 *     edited; it does not prove it is recent. Without the window, property 1
 *     buys nothing.
 *  3. THE RAW BODY IS SIGNED, NOT THE PARSED OBJECT. `JSON.parse` followed by
 *     `JSON.stringify` reorders keys, drops insignificant whitespace and
 *     rewrites number formatting, so a signature computed over a re-serialised
 *     body fails for honest callers and, worse, invites someone to "fix" it by
 *     checking the signature more loosely. Callers hand us the exact bytes.
 *
 * Nothing here touches the database or Hono, so it is tested as plain
 * arithmetic over strings - see `incident-signature.test.ts`.
 */

import { createHmac } from 'node:crypto';

import { constantTimeEqual } from './scrypt.ts';

/**
 * Shortest secret this code will treat as armed, in characters.
 *
 * Sentiara's sender applies the same floor on its side, which is the point:
 * a deployment where somebody set the secret to `test` is not a deployment
 * with a weak lock, it is a deployment with no lock, and it should behave
 * exactly like one that was never configured rather than quietly accepting
 * anything that guesses four characters.
 */
export const MIN_SECRET_LENGTH = 24;

/**
 * How far a timestamp may sit from our clock, in seconds.
 *
 * Five minutes, as agreed in answer 3. It has to absorb genuine clock drift on
 * a box behind NAT on an island, and it is the entire replay window, so it
 * cannot be generous "just in case".
 */
export const TIMESTAMP_TOLERANCE_SEC = 300;

/** Prefix Sentiara puts on the signature header, naming the algorithm. */
const SIGNATURE_PREFIX = 'sha256=';

/**
 * Why a request was refused.
 *
 * Kept as a machine-readable reason rather than a sentence because the route
 * logs it and the reply does NOT: telling an unauthenticated caller which of
 * these it tripped tells an attacker whether the secret was right and only the
 * clock was wrong, which is a free oracle. The operator sees the detail in the
 * log; the caller sees one 401.
 */
export type SignatureRefusal =
  | 'unarmed'
  | 'missing_timestamp'
  | 'missing_signature'
  | 'malformed_timestamp'
  | 'malformed_signature'
  | 'stale_timestamp'
  | 'wrong_signature';

export type SignatureVerdict = { ok: true } | { ok: false; reason: SignatureRefusal };

/**
 * The hex HMAC for a body, in the header's own format.
 *
 * Used to verify what arrives and to sign what we send back on
 * `/v1/incidents/outcome`, which is the same construction with our own header
 * names. One function for both directions means the two can never drift into
 * disagreeing about what is signed.
 */
export function signatureFor(secret: string, timestamp: string, body: string): string {
  const mac = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  return `${SIGNATURE_PREFIX}${mac}`;
}

/** Whole seconds since the epoch, the unit both sides put in the header. */
export const unixSeconds = (at: Date = new Date()): number => Math.floor(at.getTime() / 1000);

/**
 * Decide whether a request really came from the holder of the secret.
 *
 * Returns a verdict instead of throwing: refusing a request is an expected
 * outcome on a public endpoint, not an exception, and the route has to log the
 * reason while replying with none of it.
 */
export function verifyIncidentSignature(input: {
  secret: string;
  timestamp: string | undefined;
  signature: string | undefined;
  /** The exact bytes of the request body, as text. Never re-serialised. */
  body: string;
  now?: Date;
}): SignatureVerdict {
  const { secret, timestamp, signature, body } = input;

  if (secret.length < MIN_SECRET_LENGTH) return { ok: false, reason: 'unarmed' };
  if (!timestamp) return { ok: false, reason: 'missing_timestamp' };
  if (!signature) return { ok: false, reason: 'missing_signature' };

  // `Number()` accepts '', ' 12 ', '1e3' and '0x10'; a header that is not a
  // plain run of digits is not a timestamp we are willing to guess at.
  if (!/^\d{1,15}$/.test(timestamp)) return { ok: false, reason: 'malformed_timestamp' };
  if (!signature.startsWith(SIGNATURE_PREFIX)) return { ok: false, reason: 'malformed_signature' };

  const skew = Math.abs(unixSeconds(input.now) - Number(timestamp));
  if (skew > TIMESTAMP_TOLERANCE_SEC) return { ok: false, reason: 'stale_timestamp' };

  const utf8 = new TextEncoder();
  const expected = utf8.encode(signatureFor(secret, timestamp, body));
  const offered = utf8.encode(signature);
  if (!constantTimeEqual(expected, offered)) return { ok: false, reason: 'wrong_signature' };

  return { ok: true };
}
