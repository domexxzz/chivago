/**
 * Which area the screens frame: the island, or the campus.
 *
 * Resolved once at start-up in this order - the page URL (`?area=ku-sriracha`
 * is what a QR code at the campus carries), then the stored choice, then the
 * default - and changed by the chip on Home or the map. Kept the way the
 * language is kept, in the keychain on a phone and localStorage in a
 * browser, for the same reason: there is no other persistent store here.
 */

import React from 'react';
import * as SecureStore from 'expo-secure-store';
import { DEFAULT_AREA, areaByKey, isAreaKey, type Area, type AreaKey } from '@chivago/core';

const SLOT = 'chivago.area';

let current: AreaKey = DEFAULT_AREA;
const listeners = new Set<() => void>();

/** The area named in the page URL, on the web. Null anywhere else, or when it is not one we have. */
export function areaFromUrl(search?: string): AreaKey | null {
  try {
    const query = search ?? (typeof window !== 'undefined' ? window.location?.search : undefined);
    if (!query) return null;
    const v = new URLSearchParams(query).get('area');
    return isAreaKey(v) ? v : null;
  } catch {
    return null;
  }
}

/**
 * The place named in the page URL - `?place=ku-park` on a QR code at a pin.
 * Shaped like one of ours or ignored; an unknown id opens a place screen
 * that says so, which is better than a guess.
 */
export function placeFromUrl(search?: string): string | null {
  try {
    const query = search ?? (typeof window !== 'undefined' ? window.location?.search : undefined);
    if (!query) return null;
    const v = new URLSearchParams(query).get('place');
    return v && /^[a-z0-9-]{1,40}$/.test(v) ? v : null;
  } catch {
    return null;
  }
}

async function readSlot(slot: string): Promise<string | null> {
  try {
    if (await SecureStore.isAvailableAsync()) return await SecureStore.getItemAsync(slot);
  } catch { /* fall through to the browser */ }
  try {
    if (typeof localStorage !== 'undefined') return localStorage.getItem(slot);
  } catch { /* nowhere to read from */ }
  return null;
}

async function writeSlot(slot: string, value: string): Promise<void> {
  try {
    if (await SecureStore.isAvailableAsync()) { await SecureStore.setItemAsync(slot, value); return; }
  } catch { /* fall through */ }
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(slot, value);
  } catch { /* the choice lasts this session */ }
}

async function readStored(): Promise<AreaKey | null> {
  const v = await readSlot(SLOT);
  return isAreaKey(v) ? v : null;
}

const persist = (key: AreaKey): Promise<void> => writeSlot(SLOT, key);

/*
  The event token (docs/46). A QR code in the room carries `?event=`; the
  door on the day checks it. Kept beside the area, sent with every story,
  and worthless a week later when the door is shut - so keeping it is safe.
*/
const EVENT_SLOT = 'chivago.event';
let event: string | null = null;

/** The token named in the page URL, in the shape a token has, or nothing. */
export function eventFromUrl(search?: string): string | null {
  try {
    const query = search ?? (typeof window !== 'undefined' ? window.location?.search : undefined);
    if (!query) return null;
    const v = new URLSearchParams(query).get('event');
    return v && /^[A-Za-z0-9_-]{8,64}$/.test(v) ? v : null;
  } catch {
    return null;
  }
}

export const getEvent = (): string | null => event;

/** Tests only. */
export function __setEventForTests(token: string | null): void { event = token; }

const announce = () => { listeners.forEach((l) => l()); };

/** Resolve the area once at start-up: the URL, else the stored choice, else the default. */
export async function loadArea(): Promise<AreaKey> {
  const fromUrl = areaFromUrl();
  current = fromUrl ?? (await readStored()) ?? DEFAULT_AREA;
  const token = eventFromUrl();
  event = token ?? (await readSlot(EVENT_SLOT));
  if (token) void writeSlot(EVENT_SLOT, token);
  // A QR code is a choice too; remember it so a reload without the query keeps the campus.
  if (fromUrl) void persist(fromUrl);
  announce();
  return current;
}

export const getArea = (): AreaKey => current;

/** Change area. Persists, then tells every subscriber. */
export function setArea(next: AreaKey): void {
  if (next === current) return;
  current = next;
  void persist(next);
  announce();
}

/** The current area, re-rendering the caller when it changes. */
export function useArea(): Area {
  const [, force] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => {
    listeners.add(force);
    return () => { listeners.delete(force); };
  }, []);
  return areaByKey(current);
}

/** Tests only: set the area without touching storage. */
export function __setAreaForTests(key: AreaKey): void {
  current = key;
  announce();
}
