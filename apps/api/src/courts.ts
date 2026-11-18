/**
 * How many courts are free at a place you book before you go, live from the
 * venue's own booking system (docs/65 is the same shape for food stalls).
 *
 * The same discipline as the stalls feed (stalls.ts), for the same reasons: a
 * hard timeout, so a slow booking service never hangs a place screen; a short
 * cache, because a court count is minutes-coarse and everyone opening the
 * venue at six needs one upstream request, not fifty; and when the service
 * does not answer, the last figures it gave are served and SAID to be old -
 * for a few minutes, never passed off as live, and never invented when there
 * are none.
 *
 * ChivarGo takes no booking and moves no money. แบดมินตัน@สินธานี's own site
 * does, and its `/api/court-status` answers one aggregate number: free, total,
 * open or shut, and when it counted. Nothing about a booker is asked for or
 * returned, so this can be read without anyone's permission but the venue's.
 *
 * The cache is in memory, not in SQLite: a court count is worth half a minute,
 * it is nobody's record, and a LiteFS replica could not write it anyway.
 */

import {
  NO_COURTS, courtSourceFor, courtsFromCourtStatus, isCourtStatusLink,
  type CourtSource, type PlaceCourts,
} from '@chivago/core';

const DEFAULT_BOOKING_URL = 'https://badminton-booking-ihw1.onrender.com';

/**
 * The service a setting names, or null when it is not one to call: no
 * credentials, query or fragment, and a base the status route can be built on -
 * https, or http on this machine for a booking system run locally.
 */
export function courtsBase(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.username || u.password || u.search || u.hash) return null;
  const base = `${u.origin}${u.pathname}`.replace(/\/+$/, '');
  return isCourtStatusLink(`${base}/api/court-status`) ? base : null;
}

/**
 * Where the booking system runs: one service for every place with courts, for
 * now. A setting that is not a service to call turns the counts off and says
 * so once, here, instead of failing every venue screen that asks.
 */
export const BOOKING_URL = courtsBase(process.env.CHIVAGO_BADMINTON_URL ?? DEFAULT_BOOKING_URL);
if (BOOKING_URL === null) console.warn('[courts] CHIVAGO_BADMINTON_URL is not an https service URL; the court counts are off');

/** How long an answer is reused. The service's own cache-control says the same. */
export const COURTS_TTL_MS = 30_000;
/** After a failure, how long to answer from memory before asking again. */
export const RETRY_AFTER_MS = 15_000;
/** The oldest figures served while the service does not answer. Older than this, a count says nothing. */
export const STALE_MAX_MS = 10 * 60_000;
/**
 * Given up on after this. The venue's site sleeps when idle on some Render
 * plans and can take a minute to wake; a place screen must not wait for it.
 * A cold service reads as unreachable, which is said plainly and truthfully.
 */
const TIMEOUT_MS = 4000;
/** The answer is one small object. Anything far bigger is not one. */
const MAX_BODY_BYTES = 8 * 1024;

export interface CourtsOptions {
  now?: number;
  fetchImpl?: typeof fetch;
  /** The service as a setting would name it, checked like one. */
  base?: string;
  timeoutMs?: number;
}

const cache = new Map<string, { at: number; value: PlaceCourts }>();
const failedAt = new Map<string, number>();
const inFlight = new Map<string, Promise<PlaceCourts>>();

/** Tests start from nothing. */
export function __resetCourts(): void {
  cache.clear();
  failedAt.clear();
  inFlight.clear();
}

const sourceFor = (base: string) => `${new URL(base).host} · the venue's own booking system`;

const nothingKnown = (src: CourtSource, base: string | null): PlaceCourts => ({
  provider: src.provider, provenance: 'stale', observedAt: null, source: base ? sourceFor(base) : '', count: null,
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

/** Fetch with a hard timeout and a size cap. A booking service must never hang or swamp a place screen. */
async function fetchJson(url: string, fetchImpl: typeof fetch, timeoutMs: number): Promise<unknown> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    // No redirects: the answer comes from the service this app was set to ask, or not at all.
    // 'manual', never 'error': workerd refuses 'error' and throws before the request leaves.
    // A 3xx comes back with ok === false, so the throw below still refuses it.
    const res = await fetchImpl(url, { signal: ctl.signal, redirect: 'manual', headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`upstream ${res.status}`);
    return JSON.parse(await readCapped(res));
  } finally {
    clearTimeout(timer);
  }
}

/**
 * How many courts are free at a place. Never throws: a place without a court
 * service, or a service that is down, is an answer too.
 */
export async function getCourts(placeId: string, opts: CourtsOptions = {}): Promise<PlaceCourts> {
  const src = courtSourceFor(placeId);
  if (!src) return NO_COURTS;
  const base = opts.base === undefined ? BOOKING_URL : courtsBase(opts.base);
  if (base === null) return nothingKnown(src, null);
  const now = opts.now ?? Date.now();
  const hit = cache.get(placeId);
  if (hit && now - hit.at < COURTS_TTL_MS) return hit.value;

  // The last figures, said to be old while they are minutes old - or none, said to be none.
  const stale = (): PlaceCourts => (hit && now - hit.at < STALE_MAX_MS
    ? { ...hit.value, provenance: 'stale' }
    : nothingKnown(src, base));
  if (now - (failedAt.get(placeId) ?? -Infinity) < RETRY_AFTER_MS) return stale();

  // Six o'clock: many screens open at once, and they share one request.
  const pending = inFlight.get(placeId);
  if (pending) return pending;
  const run = (async (): Promise<PlaceCourts> => {
    try {
      const body = await fetchJson(`${base}/api/court-status`, opts.fetchImpl ?? fetch, opts.timeoutMs ?? TIMEOUT_MS);
      const read = courtsFromCourtStatus(body, now);
      // Not a court-status answer, or one that did not add up: the last good figures stand.
      if (!read) throw new Error('not a court-status answer');
      const value: PlaceCourts = {
        provider: src.provider,
        provenance: 'live',
        // The service's own reading time when it gave one - that is when the
        // courts were actually counted, and a slow hop should not hide it.
        observedAt: new Date(read.observedAt ?? now).toISOString(),
        source: sourceFor(base),
        count: read.count,
      };
      cache.set(placeId, { at: now, value });
      failedAt.delete(placeId);
      return value;
    } catch (e) {
      failedAt.set(placeId, now);
      console.warn(`[courts] ${placeId}: ${e instanceof Error ? e.message : String(e)}`);
      return stale();
    } finally {
      inFlight.delete(placeId);
    }
  })();
  inFlight.set(placeId, run);
  return run;
}
