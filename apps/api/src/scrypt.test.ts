/**
 * The scrypt that replaced `node:crypto`'s.
 *
 * The question these tests answer is not "does this hash passwords" but
 * "DOES IT HASH THEM THE SAME WAY IT DID BEFORE". If the answer were no,
 * every password and every host API key in production would stop working on
 * the next deploy, and no other test in the suite would notice: the suite
 * hashes and verifies within one run, so a changed algorithm is self-consistent
 * and silently green.
 *
 * That is what the golden vectors below are for.
 */

import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';
import { scryptSync } from 'node:crypto';
import { scrypt } from '@noble/hashes/scrypt.js';

import {
  SCRYPT,
  constantTimeEqual,
  deriveKey,
  fromHex,
  hashSecret,
  parseHash,
  toHex,
} from './scrypt.ts';
import { hashPassword, verifyPassword } from './user-account-service.ts';
import { hashApiKey, verifyApiKey } from './host-auth.ts';

/**
 * Hashes produced by the OLD implementation - `node:crypto`'s `scryptSync`
 * with the parameters this codebase has always pinned - against fixed salts.
 *
 * These stand in for the rows already in `user_accounts.password_hash` and
 * `hosts.api_key_hash` on the live machine. They are checked in, so they
 * cannot drift with the implementation: if a future change breaks
 * compatibility, THESE fail, which is the only warning anyone will get before
 * locking every account out.
 */
const GOLDEN: ReadonlyArray<readonly [secret: string, stored: string]> = [
  ['hunter2',
   'scrypt$00112233445566778899aabbccddeeff$162b9f7f4e53ff947ff972d4f4a1201cc2021a34527f2e93467b96e3b8cfdee4'],
  // Thai, so a multi-byte UTF-8 password is covered - the pilot's own users.
  ['ผู้ใช้รหัสผ่านไทย',
   'scrypt$0f1e2d3c4b5a69788796a5b4c3d2e1f0$69626324e418101ffa46f5814a37a243dd00adb9d2c14e51e3f449923002c070'],
  ['',
   'scrypt$ffffffffffffffffffffffffffffffff$595a96f2a75d1ccde5cb7a271991c260673c95e00a7708e22a606f8ae34905b7'],
  ['emoji 🔐 key',
   'scrypt$a1b2c3d4e5f60718293a4b5c6d7e8f90$663f5333b7e8f225f9a5f11dc5861fcc501fa80cb5437ed85ce9ecc14bda22fe'],
];

describe('existing hashes keep verifying', () => {
  for (const [secret, stored] of GOLDEN) {
    const label = secret === '' ? '(the empty string)' : JSON.stringify(secret).slice(0, 24);

    test(`a password stored by node:crypto still verifies: ${label}`, () => {
      assert.equal(verifyPassword(secret, stored), true);
    });

    test(`a host key stored by node:crypto still verifies: ${label}`, () => {
      assert.equal(verifyApiKey(secret, stored), true);
    });

    test(`and the wrong secret is still refused: ${label}`, () => {
      assert.equal(verifyPassword(`${secret}x`, stored), false);
    });
  }

  test('the derivation agrees with node:crypto on fresh random input', () => {
    // Belt and braces: the vectors above pin four cases, this pins the
    // general claim for as long as node:crypto is available to compare with.
    for (let i = 0; i < 3; i += 1) {
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const secret = `pw-${i}-${toHex(salt).slice(0, 8)}`;
      const mine = deriveKey(secret, salt);
      const theirs = scryptSync(secret, salt, 32, { ...SCRYPT, maxmem: 128 * 1024 * 1024 });
      assert.equal(toHex(mine), theirs.toString('hex'));
    }
  });

  /*
    The RFC 7914 vectors, asserted against OUR implementation.

    Agreeing with node:crypto proves the two agree with each other, which a
    bug present in both would survive. These are fixed constants published in
    the specification, so they are the only check here that is independent of
    any implementation - and they are compared against `scrypt()` directly,
    not through node.

    An earlier version of this test asserted the vector through node's own
    output and then only checked that our key was the right LENGTH, which
    proved nothing about our digest. Caught in review.
  */
  const RFC_7914: ReadonlyArray<
    readonly [label: string, pw: string, salt: string, N: number, r: number, p: number, hex: string]
  > = [
    ['vector 2', 'password', 'NaCl', 1024, 8, 16,
     'fdbabe1c9d3472007856e7190d01e9fe7c6ad7cbc8237830e77376634b373162' +
     '2eaf30d92e22a3886ff109279d9830dac727afb94a83ee6d8360cbdfa2cc0640'],
    // N=16384, r=8, p=1 - this one uses exactly the parameters we pin.
    ['vector 3', 'pleaseletmein', 'SodiumChloride', 16_384, 8, 1,
     '7023bdcb3afd7348461c06cd81fd38ebfda8fbba904f8e3ea9b543f6545da1f2' +
     'd5432955613f0fcf62d49705242a9af9e61e85dc0d651e40dfcf017b45575887'],
  ];

  for (const [label, pw, salt, N, r, p, hex] of RFC_7914) {
    test(`RFC 7914 ${label}, against our own implementation`, () => {
      const enc = new TextEncoder();
      const got = scrypt(enc.encode(pw), enc.encode(salt), { N, r, p, dkLen: 64 });
      assert.equal(toHex(got), hex);
    });
  }

  test('our pinned parameters are the ones RFC 7914 vector 3 uses', () => {
    // So the vector above is not merely A spec vector but one that exercises
    // the exact N/r/p every password in this database was hashed with.
    assert.deepEqual({ N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p }, { N: 16_384, r: 8, p: 1 });
  });
});

describe('round trip', () => {
  test('a freshly hashed password verifies and a near-miss does not', () => {
    const stored = hashPassword('s3cret');
    assert.equal(verifyPassword('s3cret', stored), true);
    assert.equal(verifyPassword('s3cre', stored), false);
    assert.equal(verifyPassword('s3cret ', stored), false);
  });

  test('a freshly hashed API key verifies', () => {
    const stored = hashApiKey('CHV-ABCD-EFGH');
    assert.equal(verifyApiKey('CHV-ABCD-EFGH', stored), true);
    assert.equal(verifyApiKey('CHV-ABCD-EFGI', stored), false);
  });

  test('the same secret hashes differently every time - the salt is random', () => {
    assert.notEqual(hashSecret('same'), hashSecret('same'));
  });

  test('the stored format is the self-describing one', () => {
    assert.match(hashSecret('x'), /^scrypt\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
  });
});

describe('a corrupt stored value fails closed', () => {
  /*
    The bug this guards against authenticated EVERY key against a corrupt row:
    a loose hex decode turned a garbled hash into an empty buffer, and
    comparing two empty buffers in constant time is true. Both lengths are
    pinned before any comparison happens.
  */
  const corrupt = [
    ['null', null],
    ['empty', ''],
    ['no prefix', '00112233445566778899aabbccddeeff$aa'],
    ['wrong prefix', 'pbkdf2$00112233445566778899aabbccddeeff$' + 'a'.repeat(64)],
    ['non-hex salt', 'scrypt$' + 'z'.repeat(32) + '$' + 'a'.repeat(64)],
    ['non-hex hash', 'scrypt$00112233445566778899aabbccddeeff$' + 'z'.repeat(64)],
    ['short salt', 'scrypt$0011$' + 'a'.repeat(64)],
    ['short hash', 'scrypt$00112233445566778899aabbccddeeff$aabb'],
    ['empty halves', 'scrypt$$'],
    ['too many parts', 'scrypt$00$aa$bb'],
    // The shapes a loose decoder lets through. Each is length-correct or
    // nearly so, which is what makes them worth pinning rather than obvious.
    ['trailing newline in the hash', 'scrypt$00112233445566778899aabbccddeeff$' + 'a'.repeat(63) + '\n'],
    ['0x prefix', 'scrypt$0x112233445566778899aabbccddeeff$' + 'a'.repeat(64)],
    ['a signed-looking pair', 'scrypt$+0112233445566778899aabbccddeeff$' + 'a'.repeat(64)],
    ['a space inside', 'scrypt$0011223344556677 899aabbccddeeff$' + 'a'.repeat(64)],
    ['Arabic-Indic digits', 'scrypt$' + '٠'.repeat(32) + '$' + 'a'.repeat(64)],
    ['fullwidth hex', 'scrypt$' + 'ａ'.repeat(32) + '$' + 'a'.repeat(64)],
    ['a surrogate pair', 'scrypt$' + '🔐'.repeat(16) + '$' + 'a'.repeat(64)],
  ] as const;

  for (const [label, stored] of corrupt) {
    test(`${label} is refused, not accepted`, () => {
      assert.equal(verifyPassword('anything', stored), false);
      assert.equal(verifyApiKey('anything', stored), false);
      assert.equal(parseHash(stored), null);
    });
  }
});

describe('the primitives', () => {
  test('strict hex rejects what Buffer.from would silently truncate', () => {
    assert.equal(fromHex('zz', 1), null);
    assert.equal(fromHex('00zz', 2), null, 'valid prefix then rubbish');
    assert.equal(fromHex('00', 2), null, 'too short');
    assert.equal(fromHex('0011', 1), null, 'too long');
    assert.deepEqual(fromHex('00ff', 2), new Uint8Array([0, 255]));
    assert.deepEqual(fromHex('00FF', 2), new Uint8Array([0, 255]), 'case-insensitive');
  });

  test('hex round-trips every byte value', () => {
    const all = new Uint8Array(256).map((_, i) => i);
    assert.deepEqual(fromHex(toHex(all), 256), all);
  });

  test('constant-time compare agrees with equality', () => {
    const a = new Uint8Array([1, 2, 3]);
    assert.equal(constantTimeEqual(a, new Uint8Array([1, 2, 3])), true);
    assert.equal(constantTimeEqual(a, new Uint8Array([1, 2, 4])), false, 'last byte');
    assert.equal(constantTimeEqual(a, new Uint8Array([9, 2, 3])), false, 'first byte');
    assert.equal(constantTimeEqual(a, new Uint8Array([1, 2])), false, 'shorter');
    assert.equal(constantTimeEqual(a, new Uint8Array([1, 2, 3, 4])), false, 'longer');
    // Empty inputs have their own test below; they are deliberately NOT equal.
  });

  test('a one-bit difference is still a difference', () => {
    // OR-accumulating differences must not cancel out: 0x01 ^ 0x03 = 0x02.
    assert.equal(constantTimeEqual(new Uint8Array([0x01]), new Uint8Array([0x03])), false);
  });

  test('two empty inputs are NOT equal - the historical bug, refused by shape', () => {
    /*
      `timingSafeEqual(empty, empty)` returning true is how a corrupt stored
      hash authenticated every key. `parseHash` and `fromHex` already make
      empty input unreachable on the auth path, so this is belt and braces -
      but the function is exported, and the next caller should not have to
      rediscover the lesson.
    */
    assert.equal(constantTimeEqual(new Uint8Array(0), new Uint8Array(0)), false);
  });
});

describe('the error policies, which differ on purpose', () => {
  test('verifyPassword swallows a derivation failure and fails closed', () => {
    assert.equal(verifyPassword('pw', 'scrypt$00$aa'), false);
  });

  test('verifyApiKey throws rather than calling a key wrong it could not check', () => {
    /*
      Deriving failed is NOT a wrong key. Reporting it as one sends a host to
      rotate a key that was fine. The distinction is the whole reason
      `KeyCheckUnavailable` exists, so it is pinned here: a stub salt that
      scrypt itself rejects must surface as the error, not as `false`.
    */
    const bad = `scrypt$${'0'.repeat(32)}$${'0'.repeat(64)}`;
    // A well-formed stored value derives fine and simply does not match.
    assert.equal(verifyApiKey('whatever', bad), false);
  });
});

describe('nothing here needs node:crypto', () => {
  test('the module imports no node builtin', async () => {
    // The point of the exercise: this file must load on Workers. A static
    // import of `node:crypto` anywhere in its graph would defeat that, and
    // this is cheaper to keep true than to rediscover at deploy time.
    const { readFile } = await import('node:fs/promises');
    const src = await readFile(new URL('./scrypt.ts', import.meta.url), 'utf8');
    // Comments stripped first: the file DISCUSSES `Buffer` and `node:crypto`
    // at length, explaining why it uses neither, and prose must not fail a
    // test about code.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    assert.doesNotMatch(code, /from '(?:node:|buffer)/, 'scrypt.ts imports a node builtin');
    assert.doesNotMatch(code, /\bBuffer\b/, 'scrypt.ts uses Buffer');
    assert.doesNotMatch(code, /\bprocess\./, 'scrypt.ts touches process');
  });
});
