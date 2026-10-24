import { strict as assert } from 'node:assert';
import { beforeEach, describe, it } from 'node:test';

import {
  __setAuthStoreForTests,
  __setCachedLoggedInForTests,
  clearLoggedIn,
  hasLoggedIn,
  pickAuthStore,
  setLoggedIn,
} from '../src/state/auth.ts';

describe('auth state and login persistence', () => {
  beforeEach(() => {
    __setCachedLoggedInForTests(null);
    __setAuthStoreForTests(null);
  });

  it('defaults to not logged in when nothing stored', async () => {
    const s = pickAuthStore(
      { getItemAsync: async () => null, setItemAsync: async () => {} },
      false,
      undefined,
    );
    __setAuthStoreForTests(s);

    assert.equal(await hasLoggedIn(), false);
  });

  it('persists logged in state in SecureStore', async () => {
    const memory = new Map<string, string>();
    const secure = {
      getItemAsync: async (k: string) => memory.get(k) ?? null,
      setItemAsync: async (k: string, v: string) => { memory.set(k, v); },
      deleteItemAsync: async (k: string) => { memory.delete(k); },
    };
    const s = pickAuthStore(secure, true, undefined);
    __setAuthStoreForTests(s);

    assert.equal(await hasLoggedIn(), false);
    await setLoggedIn(true);
    assert.equal(await hasLoggedIn(), true);
    assert.equal(memory.get('chivago.isLoggedIn'), 'true');

    // Reset memory cache to prove it reads through from store
    __setCachedLoggedInForTests(null);
    assert.equal(await hasLoggedIn(), true);

    await clearLoggedIn();
    assert.equal(await hasLoggedIn(), false);
    assert.equal(memory.get('chivago.isLoggedIn'), undefined);
  });

  it('persists logged in state in localStorage fallback', async () => {
    const memory = new Map<string, string>();
    const web = {
      getItem: (k: string) => memory.get(k) ?? null,
      setItem: (k: string, v: string) => { memory.set(k, v); },
      removeItem: (k: string) => { memory.delete(k); },
    };
    const s = pickAuthStore(
      { getItemAsync: async () => null, setItemAsync: async () => {} },
      false,
      web,
    );
    __setAuthStoreForTests(s);

    assert.equal(await hasLoggedIn(), false);
    await setLoggedIn(true);
    assert.equal(await hasLoggedIn(), true);
    assert.equal(memory.get('chivago.isLoggedIn'), 'true');

    __setCachedLoggedInForTests(null);
    assert.equal(await hasLoggedIn(), true);

    await clearLoggedIn();
    assert.equal(await hasLoggedIn(), false);
  });
});
