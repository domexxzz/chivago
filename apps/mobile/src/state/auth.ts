/**
 * Persistent authentication and login state.
 *
 * Keeps track of whether a user has logged into Chivargo on this device.
 * Used at app launch:
 * - If already logged in, the app bypasses the login screen and jumps straight to Home.
 * - If not logged in, the app starts at the Login screen.
 *
 * Like the device key in `api/account.ts`, this persists in SecureStore on
 * device and falls back to localStorage in web browsers.
 */

import * as SecureStore from 'expo-secure-store';

const LOGIN_SLOT = 'chivago.isLoggedIn';

let cachedLoggedIn: boolean | null = null;

export interface AuthStore {
  get(): Promise<boolean>;
  set(val: boolean): Promise<void>;
  clear(): Promise<void>;
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

export function pickAuthStore(
  secure: SecureLike,
  secureAvailable: boolean,
  web: WebLike | undefined,
): AuthStore {
  if (secureAvailable) {
    return {
      get: async () => (await secure.getItemAsync(LOGIN_SLOT)) === 'true',
      set: async (val) => {
        if (val) await secure.setItemAsync(LOGIN_SLOT, 'true');
        else await secure.deleteItemAsync?.(LOGIN_SLOT);
      },
      clear: async () => { await secure.deleteItemAsync?.(LOGIN_SLOT); },
    };
  }
  if (web) {
    return {
      get: async () => web.getItem(LOGIN_SLOT) === 'true',
      set: async (val) => {
        if (val) web.setItem(LOGIN_SLOT, 'true');
        else web.removeItem(LOGIN_SLOT);
      },
      clear: async () => { web.removeItem(LOGIN_SLOT); },
    };
  }
  return {
    get: async () => false,
    set: async () => {},
    clear: async () => {},
  };
}

let store: AuthStore | null = null;

async function currentStore(): Promise<AuthStore> {
  if (store) return store;
  let available = false;
  try {
    const probe = (SecureStore as { isAvailableAsync?: () => Promise<boolean> }).isAvailableAsync;
    available = typeof probe === 'function' ? await probe() : false;
  } catch {
    available = false;
  }
  store = pickAuthStore(
    SecureStore as unknown as SecureLike,
    available,
    typeof localStorage !== 'undefined' ? localStorage : undefined,
  );
  return store;
}

export async function hasLoggedIn(): Promise<boolean> {
  if (cachedLoggedIn !== null) return cachedLoggedIn;
  try {
    cachedLoggedIn = await (await currentStore()).get();
  } catch {
    cachedLoggedIn = false;
  }
  return cachedLoggedIn;
}

export async function setLoggedIn(val: boolean): Promise<void> {
  cachedLoggedIn = val;
  try {
    await (await currentStore()).set(val);
  } catch {
    // Non-fatal if storage fails
  }
}

export async function clearLoggedIn(): Promise<void> {
  cachedLoggedIn = false;
  try {
    await (await currentStore()).clear();
  } catch {
    // Non-fatal
  }
}

/** Test seams. */
export const __setCachedLoggedInForTests = (val: boolean | null): void => {
  cachedLoggedIn = val;
};
export const __setAuthStoreForTests = (next: AuthStore | null): void => {
  store = next;
};
