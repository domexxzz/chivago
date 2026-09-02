/**
 * One language at a time.
 *
 * The app used to print every line twice - English, then Thai as a caption
 * underneath - on the theory that a bilingual product should look bilingual.
 * At phone width that doubled every screen: a wallet update was five lines
 * saying one thing, and a mission card four. So the app now speaks ONE
 * language, chosen from the phone's locale and changeable on the Account
 * screen, and every string that has both is read through `t()`.
 *
 * The exception is written down, not implied: anything an emergency responder
 * might read off a traveller's phone stays in both languages regardless -
 * the SOS banner, the Safety screen, the emergency numbers. A Thai medic
 * reading an English tourist's screen is exactly the moment the caption was
 * for. Those sites opt in with `<Thai always>` and `<Button bilingual>`.
 *
 * `t()` is a plain function, not a hook, because it is called from hundreds of
 * sites including helpers that are not components. A change of language
 * re-renders from the root (see `useLocale`), which reaches every one of them:
 * nothing in this app is memoised against its parent.
 */

import React from 'react';
import * as SecureStore from 'expo-secure-store';
import type { Bilingual } from '@chivago/core';

export type Locale = 'en' | 'th';

export const LOCALES: readonly Locale[] = ['en', 'th'] as const;

/** The language's own name for itself. Never translated: "ไทย" is how a Thai speaker finds Thai. */
export const LOCALE_NAMES: Record<Locale, string> = { en: 'English', th: 'ไทย' };

const SLOT = 'chivago.locale';

let current: Locale = 'en';
const listeners = new Set<() => void>();

export const getLocale = (): Locale => current;

/** Subscribe to changes. Returns the unsubscribe. Shaped for `useSyncExternalStore`. */
export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/**
 * The string for the current language.
 *
 * Falls back to the other language rather than to nothing: a Thai string that
 * has not been written yet shows the English, which is wrong in a way a
 * reader can act on, where a blank is wrong in a way they cannot see.
 */
export function t(value: Bilingual | null | undefined): string {
  if (!value) return '';
  return current === 'th' ? (value.th || value.en) : (value.en || value.th);
}

export const isLocale = (v: unknown): v is Locale => v === 'en' || v === 'th';

/**
 * What the phone speaks, reduced to the two languages the app has.
 *
 * Reads `Intl` rather than a native module because it is the one answer
 * available on every platform this runs on - Hermes ships it - and because a
 * traveller who set their phone to Thai has already told us what they want.
 */
export function deviceLocale(
  tags: readonly string[] = [
    ...(typeof navigator !== 'undefined' && navigator.languages ? navigator.languages : []),
    ...(typeof navigator !== 'undefined' && navigator.language ? [navigator.language] : []),
    Intl.DateTimeFormat().resolvedOptions().locale,
  ],
): Locale {
  for (const tag of tags) {
    if (typeof tag === 'string' && /^th(-|$)/i.test(tag)) return 'th';
    if (typeof tag === 'string' && /^en(-|$)/i.test(tag)) return 'en';
  }
  return 'en';
}

/*
  Where the choice is kept.

  The keychain on a phone, localStorage in a browser: the same split the
  device key makes in `api/account.ts`, and for the same reason - there is no
  other persistent store in this app. A language preference in a keychain is
  odd but harmless; a traveller who has to re-choose English on every launch
  of a Thai phone is a bug.
*/
async function readStored(): Promise<Locale | null> {
  try {
    if (await SecureStore.isAvailableAsync()) {
      const v = await SecureStore.getItemAsync(SLOT);
      return isLocale(v) ? v : null;
    }
  } catch { /* fall through to the browser */ }
  try {
    if (typeof localStorage !== 'undefined') {
      const v = localStorage.getItem(SLOT);
      return isLocale(v) ? v : null;
    }
  } catch { /* nowhere to read from */ }
  return null;
}

async function persist(locale: Locale): Promise<void> {
  try {
    if (await SecureStore.isAvailableAsync()) { await SecureStore.setItemAsync(SLOT, locale); return; }
  } catch { /* fall through */ }
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(SLOT, locale);
  } catch { /* the choice lasts this session */ }
}

/** Resolve the language once at start-up: the stored choice, else the phone's. */
export async function loadLocale(): Promise<Locale> {
  const stored = await readStored();
  current = stored ?? deviceLocale();
  listeners.forEach((l) => l());
  return current;
}

/** Change language. Persists, then tells every subscriber. */
export function setLocale(next: Locale): void {
  if (next === current) return;
  current = next;
  void persist(next);
  listeners.forEach((l) => l());
}

/** The current language, as React state. Whoever calls this re-renders on change. */
export function useLocale(): Locale {
  return React.useSyncExternalStore(subscribe, getLocale, getLocale);
}

/** Test seam. Sets the language without touching storage or listeners. */
export const __setLocaleForTests = (locale: Locale): void => { current = locale; };
