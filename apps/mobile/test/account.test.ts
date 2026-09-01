import { strict as assert } from 'node:assert';
import { test, describe, beforeEach } from 'node:test';

import {
  __setCachedKeyForTests, adoptKey, deviceKey, ensureAccount, forgetKey,
} from '../src/api/account.ts';

/**
 * The phone's credential.
 *
 * The keychain is stubbed to a no-op in this harness (`test/stubs/native.mjs`),
 * so what these prove is the LOGIC around it: that a failed registration
 * leaves the app usable, that a key is never fetched twice, and that the
 * in-memory copy every request reads is written through on both paths.
 */

const okRegister = (deviceKeyValue = 'chvg_dev_abc') => {
  let calls = 0;
  return {
    calls: () => calls,
    register: async () => {
      calls += 1;
      return { ok: true as const, data: { userId: 'u_1', deviceKey: deviceKeyValue } };
    },
  };
};

beforeEach(() => { __setCachedKeyForTests(null); });

describe('a phone gets a key once', () => {
  test('the first run registers and keeps the key', async () => {
    const api = okRegister();
    const res = await ensureAccount(api, { label: 'iPhone' });
    assert.equal(res.registered, true);
    assert.equal(res.key, 'chvg_dev_abc');
    assert.equal(deviceKey(), 'chvg_dev_abc', 'the request header would have gone out empty');
    assert.equal(api.calls(), 1);
  });

  test('the key is in memory the moment ensureAccount resolves', async () => {
    // Every API call reads it synchronously out of a header. If the write to
    // the keychain were awaited before caching, the first few requests after
    // launch would go out unauthenticated.
    const api = okRegister();
    assert.equal(deviceKey(), null);
    await ensureAccount(api);
    assert.equal(deviceKey(), 'chvg_dev_abc');
  });
});

describe('being offline on the very first launch', () => {
  test('a failed registration does not crash and does not fake a key', async () => {
    // Somebody opening the app on a beach with no signal should get the app,
    // not a sign-in wall they never asked for.
    const api = { register: async () => ({ ok: false as const, error: 'offline' }) };
    const res = await ensureAccount(api);
    assert.equal(res.key, null);
    assert.equal(res.registered, false);
    assert.equal(deviceKey(), null, 'a placeholder key would authenticate as nobody');
  });

  test('it tries again next launch rather than giving up', async () => {
    const failing = { register: async () => ({ ok: false as const, error: 'offline' }) };
    await ensureAccount(failing);

    const working = okRegister('chvg_dev_second');
    const res = await ensureAccount(working);
    assert.equal(res.registered, true);
    assert.equal(deviceKey(), 'chvg_dev_second');
  });
});

describe('moving the account to this phone', () => {
  test('adopting a claimed key replaces whatever was here', async () => {
    await ensureAccount(okRegister('chvg_dev_old'));
    await adoptKey('chvg_dev_claimed');
    assert.equal(deviceKey(), 'chvg_dev_claimed');
  });

  test('forgetting the key signs the phone out', async () => {
    await ensureAccount(okRegister());
    await forgetKey();
    assert.equal(deviceKey(), null);
  });
});
