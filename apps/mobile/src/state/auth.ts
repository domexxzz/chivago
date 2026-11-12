/**
 * Persistent authentication and login state.
 *
 * Keeps track of whether a user has logged into ChivarGo on this device.
 * Used at app launch:
 * - If already logged in, the app bypasses the login screen and jumps straight to Home.
 * - If not logged in, the app starts at the Login screen.
 *
 * Like the device key in `api/account.ts`, this persists in SecureStore on
 * device and falls back to localStorage in web browsers.
 */

import * as SecureStore from 'expo-secure-store';

const LOGIN_SLOT = 'chivago.isLoggedIn';
/**
 * Guest mode: a visitor who chose to look around without an account.
 *
 * Its own slot rather than a third value in the login slot, so a phone that
 * was signed in before guest mode existed reads exactly as it did. The device
 * key in `api/account.ts` is registered either way, so the public screens
 * work for a guest; what guest mode changes is only which screens the app
 * offers and that it does not start at the login wall again.
 */
export const GUEST_SLOT = 'chivago.isGuest';

let cachedLoggedIn: boolean | null = null;
let cachedGuest: boolean | null = null;

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
  slot: string = LOGIN_SLOT,
): AuthStore {
  if (secureAvailable) {
    return {
      get: async () => (await secure.getItemAsync(slot)) === 'true',
      set: async (val) => {
        if (val) await secure.setItemAsync(slot, 'true');
        else await secure.deleteItemAsync?.(slot);
      },
      clear: async () => { await secure.deleteItemAsync?.(slot); },
    };
  }
  if (web) {
    return {
      get: async () => web.getItem(slot) === 'true',
      set: async (val) => {
        if (val) web.setItem(slot, 'true');
        else web.removeItem(slot);
      },
      clear: async () => { web.removeItem(slot); },
    };
  }
  return {
    get: async () => false,
    set: async () => {},
    clear: async () => {},
  };
}

let store: AuthStore | null = null;
let guestStore: AuthStore | null = null;

async function secureAvailable(): Promise<boolean> {
  try {
    const probe = (SecureStore as { isAvailableAsync?: () => Promise<boolean> }).isAvailableAsync;
    return typeof probe === 'function' ? await probe() : false;
  } catch {
    return false;
  }
}

async function storeFor(slot: string): Promise<AuthStore> {
  return pickAuthStore(
    SecureStore as unknown as SecureLike,
    await secureAvailable(),
    typeof localStorage !== 'undefined' ? localStorage : undefined,
    slot,
  );
}

async function currentStore(): Promise<AuthStore> {
  if (!store) store = await storeFor(LOGIN_SLOT);
  return store;
}

async function currentGuestStore(): Promise<AuthStore> {
  if (!guestStore) guestStore = await storeFor(GUEST_SLOT);
  return guestStore;
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
  // A member is not a guest: signing in or registering ends guest mode.
  if (val) await clearGuest();
}

export async function isGuest(): Promise<boolean> {
  if (cachedGuest !== null) return cachedGuest;
  try {
    cachedGuest = await (await currentGuestStore()).get();
  } catch {
    cachedGuest = false;
  }
  return cachedGuest;
}

export async function setGuest(val: boolean): Promise<void> {
  cachedGuest = val;
  try {
    await (await currentGuestStore()).set(val);
  } catch {
    // Non-fatal: guest mode just lasts this session.
  }
}

export async function clearGuest(): Promise<void> {
  cachedGuest = false;
  try {
    await (await currentGuestStore()).clear();
  } catch {
    // Non-fatal
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
export const __setCachedGuestForTests = (val: boolean | null): void => {
  cachedGuest = val;
};
export const __setGuestStoreForTests = (next: AuthStore | null): void => {
  guestStore = next;
};
