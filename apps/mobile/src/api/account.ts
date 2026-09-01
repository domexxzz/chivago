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

async function read(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(KEY_SLOT);
  } catch {
    // A keychain that will not open is not a reason to crash on launch. The
    // app falls back to being signed out, which is a state it already handles.
    return null;
  }
}

async function write(key: string): Promise<void> {
  cached = key;
  try {
    await SecureStore.setItemAsync(KEY_SLOT, key);
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
    await SecureStore.deleteItemAsync(KEY_SLOT);
  } catch { /* nothing to forget */ }
}

/** Test seam. Never called by the app. */
export const __setCachedKeyForTests = (key: string | null): void => { cached = key; };
