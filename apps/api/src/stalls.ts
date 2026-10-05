/**
 * The stalls at a place that take orders ahead, live from สั่งก่อน (docs/65).
 *
 * The same discipline as the air feed (air.ts): a hard timeout, so a slow
 * ordering service never hangs a place screen; a short cache, because a wait
 * is minutes-coarse and fifty students opening the food court at noon need
 * one upstream request, not fifty; and when the service does not answer, the
 * last figures it gave are served and SAID to be old - for a few minutes, never
 * passed off as live, and never invented when there are none.
 *
 * The cache is in memory, not in SQLite: a wait is worth half a minute, it is
 * nobody's record, and a LiteFS replica could not write it anyway.
 */

import {
  NO_STALLS, isOrderLink, stallSourceFor, stallsFromShopStatus, type PlaceStalls, type StallSource,
} from '@chivago/core';

const DEFAULT_SANGKON_URL = 'https://sangkon.fly.dev';

/**
 * The service a setting names, or null when it is not one to call: no
 * credentials, query or fragment, and a base the app's order links can be
 * built on - https, or http on this machine for a local สั่งก่อน.
 */
export function sangkonBase(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.username || u.password || u.search || u.hash) return null;
  const base = `${u.origin}${u.pathname}`.replace(/\/+$/, '');
  return isOrderLink(`${base}/s/stall`) ? base : null;
}

/**
 * Where สั่งก่อน runs: one service for every place with stalls, for now. A
 * setting that is not a service to call turns the stalls off and says so
 * once, here, instead of failing every food court screen that asks.
 */
export const SANGKON_URL = sangkonBase(process.env.CHIVAGO_SANGKON_URL ?? DEFAULT_SANGKON_URL);
if (SANGKON_URL === null) console.warn('[stalls] CHIVAGO_SANGKON_URL is not an https service URL; the stalls are off');

/** How long an answer is reused. สั่งก่อน's own response says the same. */
export const STALLS_TTL_MS = 30_000;
/** After a failure, how long to answer from memory before asking again. */
export const RETRY_AFTER_MS = 15_000;
/** The oldest figures served while the service does not answer. Older than this, a wait says nothing. */
export const STALE_MAX_MS = 10 * 60_000;
const TIMEOUT_MS = 4000;
/** สั่งก่อน answers thirty stalls in about ten kilobytes. An answer far bigger is not one. */
const MAX_BODY_BYTES = 64 * 1024;

export interface StallsOptions {
  now?: number;
  fetchImpl?: typeof fetch;
  /** The service as a setting would name it, checked like one. */
  base?: string;
  timeoutMs?: number;
}

const cache = new Map<string, { at: number; value: PlaceStalls }>();
const failedAt = new Map<string, number>();
const inFlight = new Map<string, Promise<PlaceStalls>>();
/** The stalls last reported missing, per place. */
const missingSaid = new Map<string, string>();

/** Tests start from nothing. */
export function __resetStalls(): void {
  cache.clear();
  failedAt.clear();
  inFlight.clear();
  missingSaid.clear();
}

const sourceFor = (base: string) => `สั่งก่อน · ${new URL(base).host} · each stall's own kitchen queue`;

const nothingKnown = (src: StallSource, base: string | null): PlaceStalls => ({
  provider: src.provider, provenance: 'stale', observedAt: null, source: base ? sourceFor(base) : '', stalls: [],
});

/** The answer's text, refused past the cap: the stream is cancelled, not drained. */
async function readCapped(res: Response): Promise<string> {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return text + decoder.decode();
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new Error(`answer over ${MAX_BODY_BYTES} bytes`);
    }
    text += decoder.decode(value, { stream: true });
  }
}

/** Fetch with a hard timeout and a size cap. An ordering service must never hang or swamp a place screen. */
async function fetchJson(url: string, fetchImpl: typeof fetch, timeoutMs: number): Promise<unknown> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    // No redirects: the answer comes from the service this app was set to ask, or not at all.
    const res = await fetchImpl(url, { signal: ctl.signal, redirect: 'error', headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`upstream ${res.status}`);
    return JSON.parse(await readCapped(res));
  } finally {
    clearTimeout(timer);
  }
}

/** A configured stall the service did not report, said when the list changes rather than on every refresh. */
function sayMissing(placeId: string, missing: readonly string[]): void {
  const key = missing.join(',');
  if (key === (missingSaid.get(placeId) ?? '')) return;
  missingSaid.set(placeId, key);
  if (key) console.warn(`[stalls] ${placeId}: not in สั่งก่อน's answer: ${key}`);
}

/** The stalls at a place. Never throws: a place without stalls, or a service that is down, is an answer too. */
export async function getStalls(placeId: string, opts: StallsOptions = {}): Promise<PlaceStalls> {
  const src = stallSourceFor(placeId);
  if (!src) return NO_STALLS;
  const base = opts.base === undefined ? SANGKON_URL : sangkonBase(opts.base);
  if (base === null) return nothingKnown(src, null);
  const now = opts.now ?? Date.now();
  const hit = cache.get(placeId);
  if (hit && now - hit.at < STALLS_TTL_MS) return hit.value;

  // The last figures, said to be old while they are minutes old - or none, said to be none.
  const stale = (): PlaceStalls => (hit && now - hit.at < STALE_MAX_MS
    ? { ...hit.value, provenance: 'stale' }
    : nothingKnown(src, base));
  if (now - (failedAt.get(placeId) ?? -Infinity) < RETRY_AFTER_MS) return stale();

  // Noon: many screens open at once, and they share one request.
  const pending = inFlight.get(placeId);
  if (pending) return pending;
  const run = (async (): Promise<PlaceStalls> => {
    try {
      const slugs = src.slugs.map(encodeURIComponent).join(',');
      const body = await fetchJson(`${base}/api/shop-status?slugs=${slugs}`, opts.fetchImpl ?? fetch, opts.timeoutMs ?? TIMEOUT_MS);
      const read = stallsFromShopStatus(body, src.slugs, base, now);
      if (!read) throw new Error('not a shop-status answer');
      // Rows came back and not one could be read: the answer changed shape. The last good figures stand.
      if (read.stalls.length === 0 && read.dropped > 0) throw new Error(`no readable stall in ${read.dropped} rows`);
      sayMissing(placeId, read.missing);
      const value: PlaceStalls = {
        provider: src.provider,
        provenance: 'live',
        observedAt: new Date(now).toISOString(),
        source: sourceFor(base),
        stalls: read.stalls,
      };
      cache.set(placeId, { at: now, value });
      failedAt.delete(placeId);
      return value;
    } catch (e) {
      failedAt.set(placeId, now);
      console.warn(`[stalls] ${placeId}: ${e instanceof Error ? e.message : String(e)}`);
      return stale();
    } finally {
      inFlight.delete(placeId);
    }
  })();
  inFlight.set(placeId, run);
  return run;
}
