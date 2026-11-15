/**
 * The route that is being followed, kept where an outage cannot reach it.
 *
 * WHAT OFFLINE ACTUALLY COSTS A NAVIGATOR, and what it does not. Losing the
 * network means the ROUTER cannot be asked again - no new route, no reroute
 * after a wrong turn. It does not mean the navigator stops working, because
 * nothing else in it needs a network: the GPS is a radio receiver, the
 * matching and the distances are arithmetic, and the map's tiles are already
 * in the WebView's own IndexedDB cache (see `WebTerrainMap.tsx`).
 *
 * So the one thing worth saving is the route itself - the line, the turns,
 * and where it was going - and this file saves exactly that, through the
 * storage adapter the rest of the app already uses. A phone that loses
 * signal mid-trip keeps navigating. A phone whose app is killed at a traffic
 * light comes back to the same trip rather than to a blank map.
 *
 * WHAT IS NOT SAVED, and will not be: the traveller's position, their track,
 * or anything about where they have been. The saved record is the route the
 * ROUTER returned and the place that was asked for, which is the same record
 * for anybody who asked for the same place. Progress along it is recomputed
 * from the live GPS on restore, and lives only in memory.
 */

import type { Localised, NavRoute, RouteMode } from '@chivago/core';
import { offlineStorage } from '../offline/storage.ts';

const SLOT = 'chivago.navigation.session';

/** The schema version, so a shape change cannot be read as the old shape. */
const VERSION = 1;

export interface NavDestination {
  /** The place's id, when it has one: the arrival screen opens it. */
  id: string | null;
  name: Localised;
  lat: number;
  lng: number;
}

export interface NavSession {
  destination: NavDestination;
  mode: RouteMode;
  route: NavRoute;
  /** When the route was fetched, so a stale one is not followed next week. */
  savedAt: number;
}

/**
 * How long a saved route is worth restoring.
 *
 * Six hours. A route is a claim about roads, and roads do not change in an
 * afternoon - but a traveller who opens the app the next morning is starting
 * a new day, not resuming yesterday's walk, and restoring them into a trip
 * they have forgotten asking for is worse than restoring nothing.
 */
export const SESSION_GOOD_FOR_MS = 6 * 60 * 60 * 1_000;

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Read a stored record back, or null.
 *
 * Validates rather than trusts. The store is the phone's own disk, but a
 * half-written record from an app killed mid-write, or a record left by an
 * older version of this file, both arrive here looking like JSON - and an
 * invalid route reaches MapLibre as a line of `undefined`, where it is a
 * crash a long way from its cause.
 */
export function parseSession(raw: string | null, now: number): NavSession | null {
  if (!raw) return null;
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return null; }
  if (!body || typeof body !== 'object') return null;
  const record = body as { version?: number; session?: unknown };
  if (record.version !== VERSION) return null;

  const session = record.session as Partial<NavSession> | undefined;
  if (!session) return null;
  const { destination, route, mode, savedAt } = session;
  if (!destination || !route || (mode !== 'walk' && mode !== 'ride')) return null;
  if (!isNumber(savedAt) || now - savedAt > SESSION_GOOD_FOR_MS) return null;
  if (!isNumber(destination.lat) || !isNumber(destination.lng)) return null;
  if (!destination.name || typeof destination.name !== 'object') return null;
  if (!Array.isArray(route.line) || route.line.length < 2) return null;
  if (!route.line.every((p) => Array.isArray(p) && p.length === 2 && isNumber(p[0]) && isNumber(p[1]))) return null;
  if (!Array.isArray(route.maneuvers)) return null;
  if (!isNumber(route.metres) || !isNumber(route.seconds)) return null;

  return {
    destination: {
      id: typeof destination.id === 'string' ? destination.id : null,
      name: destination.name,
      lat: destination.lat,
      lng: destination.lng,
    },
    mode,
    route: { ...route, mode } as NavRoute,
    savedAt,
  };
}

/**
 * Keep this route for the trip.
 *
 * Failures are swallowed: a phone with a full disk should still navigate,
 * and the only thing lost is the ability to resume after a kill. Nothing on
 * screen depends on this having worked.
 */
export async function saveSession(session: Omit<NavSession, 'savedAt'>, now = Date.now()): Promise<void> {
  try {
    const store = await offlineStorage();
    await store.set(SLOT, JSON.stringify({ version: VERSION, session: { ...session, savedAt: now } }));
  } catch {
    // Nothing to tell the traveller: the trip in front of them is unaffected.
  }
}

export async function loadSession(now = Date.now()): Promise<NavSession | null> {
  try {
    const store = await offlineStorage();
    return parseSession(await store.get(SLOT), now);
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  try {
    const store = await offlineStorage();
    await store.delete(SLOT);
  } catch {
    // An un-cleared session expires on its own; see SESSION_GOOD_FOR_MS.
  }
}
