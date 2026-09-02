import { strict as assert } from 'node:assert';
import { test, describe, beforeEach } from 'node:test';

import {
  __setCachedKeyForTests, __setStoreForTests, adoptKey, deviceKey, ensureAccount, forgetKey,
  pickStore,
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

describe('where the key is kept', () => {
  test('the keychain is used when the probe says it is there', async () => {
    const seen: Record<string, string> = {};
    const s = pickStore({
      getItemAsync: async (k: string) => seen[k] ?? null,
      setItemAsync: async (k: string, v: string) => { seen[k] = v; },
      deleteItemAsync: async (k: string) => { delete seen[k]; },
    }, true, undefined);
    await s.set('chvg_dev_secure');
    assert.equal(await s.get(), 'chvg_dev_secure');
    await s.remove();
    assert.equal(await s.get(), null);
  });

  test('on web the wrapper still exports functions that throw, and localStorage takes over', async () => {
    // The trap the first fix fell into. On web the wrapper the app imports
    // exports a real `getItemAsync` - it is the native module underneath that
    // is `export default {}`, so the function exists and throws when called.
    // A store chosen by `typeof fn === 'function'` picked the keychain, the
    // throw was swallowed, and every browser reload registered a new account.
    // The probe, not the presence of the function, decides.
    const throwing = {
      getItemAsync: async () => { throw new TypeError('getValueWithKeyAsync is not a function'); },
      setItemAsync: async () => { throw new TypeError('setValueWithKeyAsync is not a function'); },
    };
    const web = new Map<string, string>();
    const s = pickStore(throwing, false, {
      getItem: (k) => web.get(k) ?? null,
      setItem: (k, v) => { web.set(k, v); },
      removeItem: (k) => { web.delete(k); },
    });
    await s.set('chvg_dev_web');
    assert.equal(await s.get(), 'chvg_dev_web', 'the key did not survive into localStorage');
    await s.remove();
    assert.equal(await s.get(), null);
  });

  test('with nowhere to keep it the app still runs, one session at a time', async () => {
    const s = pickStore({ getItemAsync: async () => null, setItemAsync: async () => {} }, false, undefined);
    await s.set('chvg_dev_nowhere');
    assert.equal(await s.get(), null);
  });
});

describe('a request never leaves without a key that exists', () => {
  test('after a reload, the first fetch reads the key from storage before sending', async () => {
    // The reload case: memory is empty, storage is not. The old client read
    // memory synchronously, sent nothing, and was refused - once per hook that
    // fetches on mount, on every cold start.
    __setCachedKeyForTests(null);
    __setStoreForTests({
      get: async () => 'chvg_dev_fromstorage',
      set: async () => {},
      remove: async () => {},
    });

    const headersSeen: Record<string, string>[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      headersSeen.push({ ...(init?.headers as Record<string, string>) });
      return { ok: true, status: 200, json: async () => ({ ok: true, data: { userId: 'u', devices: [] } }) } as Response;
    }) as typeof fetch;

    try {
      const { api } = await import('../src/api/client.ts');
      await api.account();
    } finally {
      globalThis.fetch = original;
      __setStoreForTests(pickStore({ getItemAsync: async () => null, setItemAsync: async () => {} }, false, undefined));
    }

    assert.equal(headersSeen.length, 1);
    assert.equal(
      headersSeen[0]!['x-chivago-device-key'],
      'chvg_dev_fromstorage',
      'the request went out before the key was read',
    );
  });
});
