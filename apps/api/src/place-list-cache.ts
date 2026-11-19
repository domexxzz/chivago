/**
 * The half of the place list that is the same for everybody, kept a minute.
 *
 * Measured 20 November 2026: the place list was the slowest read in the app,
 * about 360 requests a second on one process against 980 for the community
 * figures, and half of each call was reading the air over every place. The
 * place rows and their air readings do not depend on who is asking, so they
 * are built once and reused. Everything personal or live - the score for
 * this traveller's profile, who checked in this hour, the reviews - is still
 * read on every request by `listScoredPlaces` in repo.ts.
 *
 * A MINUTE IS THE MOST A CHANGE CAN HIDE. Air readings step hourly, so a
 * minute costs nothing there. A place edited by something that does not
 * call `invalidatePlaceList` shows within the minute; every writer the live
 * server has (the admin console, opening an area, refreshing photographs or
 * text, the Ko Sichang bootstrap) calls it, so in practice a change shows on
 * the next request. Migrations and the seed CLIs run before any read.
 *
 * ONE CACHE PER DATABASE HANDLE, in a WeakMap: tests open a database each,
 * and one test's places must never answer for another's.
 *
 * ONE BUILD AT A TIME. A miss while another request is already building
 * waits for that build instead of starting its own, so a crowd arriving at
 * the moment the minute runs out costs one read of the air, not fifty.
 */

import type { DB } from './db.ts';

/** How long the shared half of the place list is reused. */
export const PLACE_LIST_TTL_MS = 60_000;

interface Entry {
  at: number;
  value: Promise<unknown>;
}

const entries = new WeakMap<object, Entry>();

/** Forget this database's cached place list; the next read rebuilds it. */
export function invalidatePlaceList(db: DB): void {
  entries.delete(db as object);
}

/**
 * The cached value for this database, built by `build` when there is none
 * or it is a minute old. A build that fails is not kept, so the next request
 * tries again instead of inheriting the failure for a minute.
 */
export function cachedPlaceList<T>(db: DB, now: number, build: () => Promise<T>): Promise<T> {
  const key = db as object;
  const hit = entries.get(key);
  if (hit && now - hit.at < PLACE_LIST_TTL_MS && now >= hit.at) return hit.value as Promise<T>;
  const value = build();
  const entry: Entry = { at: now, value };
  entries.set(key, entry);
  value.catch(() => {
    if (entries.get(key) === entry) entries.delete(key);
  });
  return value;
}
