/**
 * This phone's credential.
 *
 * The key goes in the KEYCHAIN, not in AsyncStorage. It is the only thing
 * standing between a stolen phone and somebody's wallet, mood history and
 * emergency contacts, and AsyncStorage is a plain file that anything on a
 * rooted device can read. `expo-secure-store` was already a dependency for the
 * background-location identity, so this is the same store, one key along.
 *
 * There is no password to forget and no email to hand over. A traveller who
 * changes phone reads eight characters off the old one; a traveller who loses
 * the phone loses the account, which is the honest trade for collecting no
 * recovery data — and is why `linkCode` exists before anybody needs it.
 */

import * as SecureStore from 'expo-secure-store';

const KEY_SLOT = 'chivago.deviceKey';

/**
 * Held in memory as well as the keychain.
 *
 * `SecureStore` is async and every API call needs the key synchronously in a
 * header, so it is read once at start-up and kept. A cache that could go stale
 * would be a bug; this one cannot, because nothing changes the key except the
 * two functions below, and both write through.
 */
let cached: string | null = null;

/** The key, or null before `ensureAccount` has run. Never throws. */
export const deviceKey = (): string | null => cached;

/**
 * The key, read from the keychain if memory does not have it.
 *
 * For code that runs OUTSIDE the app's JS context: the background location
 * task can be started by the OS after the app was killed, in a fresh runtime
 * where `cached` is null even though the phone has a key. Reading it fresh is
 * the difference between a position update the server accepts and a 401 on
 * every fix during an emergency. Never throws.
 */
export async function loadDeviceKey(): Promise<string | null> {
  if (cached) return cached;
  const stored = await read();
  if (stored) cached = stored;
  return cached;
}

/** Where the key lives on this platform. */
export interface KeyStore {
  get(): Promise<string | null>;
  set(key: string): Promise<void>;
  remove(): Promise<void>;
}

interface SecureLike {
  getItemAsync(k: string): Promise<string | null>;
  setItemAsync(k: string, v: string): Promise<void>;
  deleteItemAsync?(k: string): Promise<void>;
}

interface WebLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

/**
 * Pick a store by whether the keychain is actually THERE, not by what the
 * wrapper exports.
 *
 * Running the app in a browser, every reload registered a new account. The
 * database held two anonymous travellers after one refresh, and a judge
 * refreshing eleven times would have hit the registration rate limit and been
 * locked out of the demo. `expo-secure-store` ships `ExpoSecureStore.web.js`
 * whose entire body is `export default {}`.
 *
 * The first fix tested `typeof secure.getItemAsync === 'function'` and did
 * nothing at all, because the wrapper the app imports exports a real
 * `getItemAsync` on every platform; it is the NATIVE module underneath that is
 * empty, so the call threw inside the function and the catch below swallowed
 * it as before. The library's own `isAvailableAsync()` is literally
 * `!!ExpoSecureStore.getValueWithKeyAsync` - the question actually being
 * asked - so `secureAvailable` is that answer, resolved once, and the choice
 * is made from it.
 *
 * SECURITY, stated: `localStorage` is readable by any script on the origin,
 * which the keychain is not. On a phone the keychain is what runs; the web
 * fallback exists for the browser demo, where the alternative was an account
 * per reload.
 */
export function pickStore(
  secure: SecureLike,
  secureAvailable: boolean,
  web: WebLike | undefined,
): KeyStore {
  if (secureAvailable) {
    return {
      get: () => secure.getItemAsync(KEY_SLOT),
      set: (key) => secure.setItemAsync(KEY_SLOT, key),
      remove: async () => { await secure.deleteItemAsync?.(KEY_SLOT); },
    };
  }
  if (web) {
    return {
      get: async () => web.getItem(KEY_SLOT),
      set: async (key) => { web.setItem(KEY_SLOT, key); },
      remove: async () => { web.removeItem(KEY_SLOT); },
    };
  }
  // Nowhere to keep it. The app still runs; the account lasts one session.
  return { get: async () => null, set: async () => {}, remove: async () => {} };
}

/**
 * Resolved on first use rather than at import, because the only honest probe
 * for the keychain is async. Every caller below is already async, so nothing
 * waits that was not waiting already.
 */
let store: KeyStore | null = null;

async function currentStore(): Promise<KeyStore> {
  if (store) return store;
  let available = false;
  try {
    const probe = (SecureStore as { isAvailableAsync?: () => Promise<boolean> }).isAvailableAsync;
    available = typeof probe === 'function' ? await probe() : false;
  } catch {
    available = false;
  }
  store = pickStore(
    SecureStore as unknown as SecureLike,
    available,
    typeof localStorage !== 'undefined' ? localStorage : undefined,
  );
  return store;
}

async function read(): Promise<string | null> {
  try {
    return await (await currentStore()).get();
  } catch {
    // A store that will not open is not a reason to crash on launch. The app
    // falls back to being signed out, which is a state it already handles.
    return null;
  }
}

async function write(key: string): Promise<void> {
  cached = key;
  try {
    await (await currentStore()).set(key);
  } catch {
    // The key still works for this session; it just will not survive a
    // restart. Better than refusing to start.
  }
}

export interface AccountApi {
  register: (body: { label?: string; locale?: string }) => Promise<
    { ok: true; data: { userId: string; deviceKey: string } } | { ok: false; error: string }
  >;
}

/**
 * Make sure this phone has a key, registering once if it does not.
 *
 * Returns whether it had to register, because a first run is worth telling the
 * traveller about ("this is your account, here is how to move it") and a
 * hundredth is not.
 */
export async function ensureAccount(
  api: AccountApi, opts: { label?: string; locale?: string } = {},
): Promise<{ key: string | null; registered: boolean }> {
  const existing = await read();
  if (existing) {
    cached = existing;
    return { key: existing, registered: false };
  }

  const res = await api.register({ label: opts.label, locale: opts.locale });
  if (!res.ok) {
    // Offline on first launch. The app still runs — it simply has no account
    // yet, and will try again next time rather than blocking the traveller at
    // a sign-in wall they never asked for.
    return { key: null, registered: false };
  }
  await write(res.data.deviceKey);
  return { key: res.data.deviceKey, registered: true };
}

/** Adopt the key a claim handed back, so this phone is now the linked account. */
export async function adoptKey(key: string): Promise<void> {
  await write(key);
}

/** Forget this phone's key. Used after revoking it from another device. */
export async function forgetKey(): Promise<void> {
  cached = null;
  try {
    await (await currentStore()).remove();
  } catch { /* nothing to forget */ }
}

/** Test seams. Never called by the app. */
export const __setCachedKeyForTests = (key: string | null): void => { cached = key; };
export const __setStoreForTests = (next: KeyStore): void => { store = next; };
