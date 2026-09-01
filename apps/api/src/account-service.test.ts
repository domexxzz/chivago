import { strict as assert } from 'node:assert';
import { test, describe, beforeEach } from 'node:test';

import { openTestDb, type DB } from './db.ts';
import {
  LINK_CODE_TTL_MS, LinkCodeRefused,
  claimLinkCode, devicesFor, generateDeviceKey, generateLinkCode, hashToken,
  issueLinkCode, normaliseCode, registerDevice, resolveDevice, revokeDevice,
} from './account-service.ts';

let db: DB;
const T0 = new Date('2026-09-02T00:00:00.000Z');
const later = (ms: number) => new Date(T0.getTime() + ms);

beforeEach(() => { db = openTestDb(); });

describe('a device proves who it is, rather than claiming it', () => {
  test('registering issues a key that resolves back to its own user', () => {
    const { userId, deviceKey } = registerDevice(db, { now: T0 });
    assert.equal(resolveDevice(db, deviceKey, T0), userId);
  });

  test('two devices registered separately are two different people', () => {
    // The thing that was impossible before: the header identified whoever it
    // said, so there was only ever one person who could not be impersonated.
    const a = registerDevice(db, { now: T0 });
    const b = registerDevice(db, { now: T0 });
    assert.notEqual(a.userId, b.userId);
    assert.notEqual(a.deviceKey, b.deviceKey);
    assert.equal(resolveDevice(db, b.deviceKey, T0), b.userId);
  });

  test('a key nobody issued resolves to nobody', () => {
    registerDevice(db, { now: T0 });
    assert.equal(resolveDevice(db, 'chvg_dev_notarealkeyatall', T0), null);
    assert.equal(resolveDevice(db, undefined, T0), null);
    assert.equal(resolveDevice(db, '', T0), null);
  });

  test('a user id is not a key, however plausible it looks', () => {
    // The whole attack: send the victim's identifier and be them. It is not a
    // key, it does not carry the prefix, and it resolves to nothing.
    const { userId } = registerDevice(db, { now: T0 });
    assert.equal(resolveDevice(db, userId, T0), null);
    assert.equal(resolveDevice(db, 'demo-user', T0), null);
  });

  test('the key is stored only as a hash', () => {
    // A leaked backup must not contain working credentials.
    const { deviceKey } = registerDevice(db, { now: T0 });
    const stored = db.prepare('SELECT key_hash FROM device_keys').all() as { key_hash: string }[];
    assert.equal(stored.length, 1);
    assert.notEqual(stored[0]!.key_hash, deviceKey);
    assert.equal(stored[0]!.key_hash, hashToken(deviceKey));
    assert.match(stored[0]!.key_hash, /^[0-9a-f]{64}$/);
  });

  test('keys are unique across many registrations', () => {
    const keys = new Set(Array.from({ length: 200 }, () => generateDeviceKey()));
    assert.equal(keys.size, 200);
  });

  test('a revoked device is refused like an unknown one', () => {
    const { userId, deviceKey } = registerDevice(db, { label: 'Old phone', now: T0 });
    assert.equal(resolveDevice(db, deviceKey, T0), userId);
    assert.equal(revokeDevice(db, userId, 'Old phone', T0), 1);
    assert.equal(resolveDevice(db, deviceKey, T0), null);
  });

  test('revoking keeps the row, so “removed on the 3rd” stays answerable', () => {
    const { userId } = registerDevice(db, { label: 'Old phone', now: T0 });
    revokeDevice(db, userId, 'Old phone', T0);
    const n = db.prepare('SELECT COUNT(*) c FROM device_keys').get() as { c: number };
    assert.equal(n.c, 1, 'the device was deleted rather than revoked');
  });

  test('one person cannot revoke another person’s phone', () => {
    const a = registerDevice(db, { label: 'Phone', now: T0 });
    const b = registerDevice(db, { label: 'Phone', now: T0 });
    assert.equal(revokeDevice(db, b.userId, 'Phone', T0), 1);
    assert.equal(resolveDevice(db, a.deviceKey, T0), a.userId, 'the wrong phone was revoked');
  });
});

describe('a second phone joins the account, and does not become a new person', () => {
  test('claiming a code puts the SAME user on the new device', () => {
    // The point of the feature: the traveller keeps the points, the passport
    // and the companions they already earned.
    const first = registerDevice(db, { now: T0 });
    const code = issueLinkCode(db, first.userId, T0);
    const second = claimLinkCode(db, code, { now: later(60_000) });

    assert.equal(second.userId, first.userId);
    assert.notEqual(second.deviceKey, first.deviceKey, 'both phones share one key');
    assert.equal(resolveDevice(db, first.deviceKey, T0), first.userId, 'the old phone was logged out');
    assert.equal(resolveDevice(db, second.deviceKey, T0), first.userId);
  });

  test('a code is single use', () => {
    const { userId } = registerDevice(db, { now: T0 });
    const code = issueLinkCode(db, userId, T0);
    claimLinkCode(db, code, { now: later(1000) });

    assert.throws(
      () => claimLinkCode(db, code, { now: later(2000) }),
      (e: unknown) => e instanceof LinkCodeRefused && e.reason === 'used',
    );
  });

  test('a replayed code reads as used, not as expired', () => {
    // Different events. "Somebody already used this" is worth noticing;
    // "this is stale" is routine, and collapsing them hides the first.
    const { userId } = registerDevice(db, { now: T0 });
    const code = issueLinkCode(db, userId, T0);
    claimLinkCode(db, code, { now: later(1000) });

    const long = later(LINK_CODE_TTL_MS + 60_000);
    assert.throws(
      () => claimLinkCode(db, code, { now: long }),
      (e: unknown) => e instanceof LinkCodeRefused && e.reason === 'used',
    );
  });

  test('a code expires', () => {
    const { userId } = registerDevice(db, { now: T0 });
    const code = issueLinkCode(db, userId, T0);
    assert.throws(
      () => claimLinkCode(db, code, { now: later(LINK_CODE_TTL_MS + 1) }),
      (e: unknown) => e instanceof LinkCodeRefused && e.reason === 'expired',
    );
  });

  test('a code is dead exactly at its expiry, not a moment after', () => {
    const { userId } = registerDevice(db, { now: T0 });
    const code = issueLinkCode(db, userId, T0);
    assert.throws(() => claimLinkCode(db, code, { now: later(LINK_CODE_TTL_MS) }));
    const fresh = issueLinkCode(db, userId, T0);
    assert.doesNotThrow(() => claimLinkCode(db, fresh, { now: later(LINK_CODE_TTL_MS - 1) }));
  });

  test('issuing a new code kills the old one', () => {
    // Otherwise every tap of the button adds another live credential, and the
    // guessable keyspace grows with somebody's impatience.
    const { userId } = registerDevice(db, { now: T0 });
    const first = issueLinkCode(db, userId, T0);
    const second = issueLinkCode(db, userId, later(1000));

    assert.notEqual(first, second);
    assert.throws(
      () => claimLinkCode(db, first, { now: later(2000) }),
      (e: unknown) => e instanceof LinkCodeRefused && e.reason === 'unknown',
    );
    assert.equal(claimLinkCode(db, second, { now: later(2000) }).userId, userId);
  });

  test('an invented code joins nothing', () => {
    registerDevice(db, { now: T0 });
    assert.throws(
      () => claimLinkCode(db, 'AAAAAAAA', { now: T0 }),
      (e: unknown) => e instanceof LinkCodeRefused && e.reason === 'unknown',
    );
    assert.equal(
      (db.prepare('SELECT COUNT(*) c FROM device_keys').get() as { c: number }).c, 1,
      'a failed claim still issued a device key',
    );
  });

  test('the code is stored only as a hash', () => {
    const { userId } = registerDevice(db, { now: T0 });
    const code = issueLinkCode(db, userId, T0);
    const stored = db.prepare('SELECT code_hash FROM link_codes').all() as { code_hash: string }[];
    assert.notEqual(stored[0]!.code_hash, code);
    assert.equal(stored[0]!.code_hash, hashToken(code));
  });
});

describe('the code is meant to be read off a screen by a human', () => {
  test('it never contains a character that looks like another one', () => {
    // 0/O and 1/I/L are how a link code becomes a support ticket.
    for (let i = 0; i < 300; i += 1) {
      assert.doesNotMatch(generateLinkCode(), /[01OIL]/);
    }
  });

  test('it is eight characters', () => {
    assert.equal(generateLinkCode().length, 8);
  });

  test('typing it in lower case, or with a space or dash, still works', () => {
    const { userId } = registerDevice(db, { now: T0 });
    const code = issueLinkCode(db, userId, T0);
    const messy = `${code.slice(0, 4).toLowerCase()} - ${code.slice(4).toLowerCase()}`;
    assert.equal(normaliseCode(messy), code);
    assert.equal(claimLinkCode(db, messy, { now: later(1000) }).userId, userId);
  });

  test('the alphabet is not biased towards its first letters', () => {
    // randomBytes % 31 would make the first few symbols measurably likelier,
    // because 256 does not divide 31. This is the cheap check that it doesn't.
    const seen = new Map<string, number>();
    for (let i = 0; i < 4000; i += 1) {
      for (const ch of generateLinkCode()) seen.set(ch, (seen.get(ch) ?? 0) + 1);
    }
    const counts = [...seen.values()];
    const expected = (4000 * 8) / 31;
    assert.equal(seen.size, 31, 'some symbols never appeared at all');
    assert.ok(
      Math.max(...counts) < expected * 1.35 && Math.min(...counts) > expected * 0.65,
      `symbol distribution is lopsided: ${Math.min(...counts)}..${Math.max(...counts)} around ${expected.toFixed(0)}`,
    );
  });
});

describe('the device list', () => {
  test('it names the phone you are holding', () => {
    const first = registerDevice(db, { label: 'iPhone', now: T0 });
    const code = issueLinkCode(db, first.userId, T0);
    claimLinkCode(db, code, { label: 'iPad', now: later(1000) });

    const list = devicesFor(db, first.userId, first.deviceKey);
    assert.equal(list.length, 2);
    assert.equal(list.find((d) => d.label === 'iPhone')!.current, true);
    assert.equal(list.find((d) => d.label === 'iPad')!.current, false);
  });

  test('it never returns a key, because none is recoverable', () => {
    const { userId, deviceKey } = registerDevice(db, { label: 'iPhone', now: T0 });
    const serialised = JSON.stringify(devicesFor(db, userId, deviceKey));
    assert.doesNotMatch(serialised, /chvg_dev_/, 'a device key was handed back out');
    assert.doesNotMatch(serialised, new RegExp(hashToken(deviceKey)), 'the stored hash leaked');
  });

  test('a revoked phone leaves the list', () => {
    const { userId, deviceKey } = registerDevice(db, { label: 'Old', now: T0 });
    revokeDevice(db, userId, 'Old', T0);
    assert.deepEqual(devicesFor(db, userId, deviceKey), []);
  });

  test('one account never sees another account’s devices', () => {
    const a = registerDevice(db, { label: 'A phone', now: T0 });
    registerDevice(db, { label: 'B phone', now: T0 });
    const list = devicesFor(db, a.userId, a.deviceKey);
    assert.deepEqual(list.map((d) => d.label), ['A phone']);
  });
});
