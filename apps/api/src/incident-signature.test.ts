import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

import {
  MIN_SECRET_LENGTH, TIMESTAMP_TOLERANCE_SEC, signatureFor, unixSeconds,
  verifyIncidentSignature,
} from './incident-signature.ts';

/** A secret of a length this code is willing to treat as armed. */
const SECRET = 'a'.repeat(MIN_SECRET_LENGTH);
const BODY = '{"incidentId":"sen-abc12345","kind":"test"}';
const NOW = new Date('2026-11-18T07:02:11Z');

/** A correctly signed request, as Sentiara's sender would build it. */
function signed(body = BODY, at = NOW, secret = SECRET) {
  const timestamp = String(unixSeconds(at));
  return { secret, timestamp, signature: signatureFor(secret, timestamp, body), body, now: at };
}

describe('verifyIncidentSignature', () => {
  test('accepts a request signed with the shared secret', () => {
    assert.deepEqual(verifyIncidentSignature(signed()), { ok: true });
  });

  test('refuses everything when the secret is too short to be a lock', () => {
    const weak = 'short';
    const timestamp = String(unixSeconds(NOW));
    const verdict = verifyIncidentSignature({
      secret: weak,
      timestamp,
      signature: signatureFor(weak, timestamp, BODY),
      body: BODY,
      now: NOW,
    });
    // Correctly signed FOR THAT SECRET and still refused: a four-character
    // secret is not a weak lock, it is no lock.
    assert.deepEqual(verdict, { ok: false, reason: 'unarmed' });
  });

  test('needs both headers', () => {
    const base = signed();
    assert.deepEqual(
      verifyIncidentSignature({ ...base, timestamp: undefined }),
      { ok: false, reason: 'missing_timestamp' },
    );
    assert.deepEqual(
      verifyIncidentSignature({ ...base, signature: undefined }),
      { ok: false, reason: 'missing_signature' },
    );
  });

  test('reads an empty header as a missing one', () => {
    assert.deepEqual(
      verifyIncidentSignature({ ...signed(), timestamp: '' }),
      { ok: false, reason: 'missing_timestamp' },
    );
    assert.deepEqual(
      verifyIncidentSignature({ ...signed(), signature: '' }),
      { ok: false, reason: 'missing_signature' },
    );
  });

  test('refuses a timestamp that is not a plain run of digits', () => {
    for (const timestamp of [' 1763449331 ', '1e9', '0x10', 'now']) {
      assert.deepEqual(
        verifyIncidentSignature({ ...signed(), timestamp }),
        { ok: false, reason: 'malformed_timestamp' },
        `accepted ${JSON.stringify(timestamp)}`,
      );
    }
  });

  test('refuses a signature that does not name the algorithm', () => {
    const base = signed();
    const bare = base.signature.replace('sha256=', '');
    assert.deepEqual(
      verifyIncidentSignature({ ...base, signature: bare }),
      { ok: false, reason: 'malformed_signature' },
    );
  });

  test('refuses a stale timestamp in either direction', () => {
    const base = signed();
    const past = new Date(NOW.getTime() + (TIMESTAMP_TOLERANCE_SEC + 1) * 1000);
    const future = new Date(NOW.getTime() - (TIMESTAMP_TOLERANCE_SEC + 1) * 1000);
    // The signature is still valid; only the clock moved. This is the check
    // that makes signing the timestamp worth anything.
    assert.deepEqual(
      verifyIncidentSignature({ ...base, now: past }),
      { ok: false, reason: 'stale_timestamp' },
    );
    assert.deepEqual(
      verifyIncidentSignature({ ...base, now: future }),
      { ok: false, reason: 'stale_timestamp' },
    );
  });

  test('accepts a timestamp at the edge of the window', () => {
    const edge = new Date(NOW.getTime() + TIMESTAMP_TOLERANCE_SEC * 1000);
    assert.deepEqual(verifyIncidentSignature({ ...signed(), now: edge }), { ok: true });
  });

  test('refuses a body that changed after it was signed', () => {
    const base = signed();
    const tampered = BODY.replace('"kind":"test"', '"kind":"fire"');
    assert.deepEqual(
      verifyIncidentSignature({ ...base, body: tampered }),
      { ok: false, reason: 'wrong_signature' },
    );
  });

  test('refuses a signature made with a different secret', () => {
    const base = signed();
    const theirs = signatureFor('b'.repeat(MIN_SECRET_LENGTH), base.timestamp, BODY);
    assert.deepEqual(
      verifyIncidentSignature({ ...base, signature: theirs }),
      { ok: false, reason: 'wrong_signature' },
    );
  });

  test('binds the signature to the timestamp, not just the body', () => {
    const base = signed();
    // Same body, same secret, a timestamp one second later: a recorded request
    // cannot be re-dated into the window.
    const moved = String(Number(base.timestamp) + 1);
    assert.deepEqual(
      verifyIncidentSignature({ ...base, timestamp: moved }),
      { ok: false, reason: 'wrong_signature' },
    );
  });
});

describe('signatureFor', () => {
  test('is stable, and names its algorithm', () => {
    const first = signatureFor(SECRET, '1763449331', BODY);
    assert.equal(first, signatureFor(SECRET, '1763449331', BODY));
    assert.match(first, /^sha256=[0-9a-f]{64}$/);
  });

  test('changes with the secret, the timestamp and the body', () => {
    const base = signatureFor(SECRET, '1763449331', BODY);
    assert.notEqual(base, signatureFor('b'.repeat(MIN_SECRET_LENGTH), '1763449331', BODY));
    assert.notEqual(base, signatureFor(SECRET, '1763449332', BODY));
    assert.notEqual(base, signatureFor(SECRET, '1763449331', `${BODY} `));
  });
});
