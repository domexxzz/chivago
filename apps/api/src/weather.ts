/**
 * The sea and the sky above an area, live from Open-Meteo (weather.ts in core).
 *
 * The same discipline as the stalls and the courts (stalls.ts, courts.ts): a
 * hard timeout, so a slow forecast never hangs a screen; a short cache,
 * because the feed itself only steps every fifteen minutes and everyone
 * opening Home at once needs one upstream request, not fifty; and when the
 * service does not answer, the last figures are served and SAID to be old -
 * never passed off as live, and never invented when there are none.
 *
 * WHAT THIS REPLACED. A card with "waves 1.2 - 2.0 m, wind 10-20 kts" written
 * into the JSX. The first real reading off this feed was 0.1 m and 3 knots.
 * Nobody should plan a crossing on a number that came out of a design file.
 *
 * The cache is in memory, not in SQLite: a forecast is worth a few minutes,
 * it is nobody's record, and a LiteFS replica could not write it anyway.
 */

import {
  NO_WEATHER, areaByKey, isAreaKey, weatherFromOpenMeteo, type AreaKey, type AreaWeather,
} from '@chivago/core';
import {
  answersHour, crossCheckWeather, readTmdForecast, tmdForecastUrl, tmdHour, type TmdForecast,
} from './tmd.ts';

const FORECAST_API = 'https://api.open-meteo.com/v1/forecast';
const MARINE_API = 'https://marine-api.open-meteo.com/v1/marine';
/** The islands and the campuses are all on this clock, and the feed is asked in it. */
const TZ = 'Asia/Bangkok';
const TZ_OFFSET = '+07:00';

/** How long an answer is reused. Open-Meteo steps every fifteen minutes; this is well inside that. */
export const WEATHER_TTL_MS = 5 * 60_000;
/** After a failure, how long to answer from memory before asking again. */
export const RETRY_AFTER_MS = 60_000;
/** The oldest figures served while the service does not answer. Older than this, a forecast says nothing about now. */
export const STALE_MAX_MS = 3 * 3_600_000;
const TIMEOUT_MS = 4000;
/** Two small current-readings. An answer far bigger is not one. */
const MAX_BODY_BYTES = 32 * 1024;

export interface WeatherOptions {
  now?: number;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** The TMD NWP token. Defaults to `TMD_NWP_TOKEN`; without one there is no cross-check. */
  tmdToken?: string;
}

/**
 * How long TMD's forecast for an area is reused.
 *
 * Longer than Open-Meteo's, on purpose: TMD's answer is for a whole hour, and
 * every field of every request counts against the token's quota.
 */
export const TMD_TTL_MS = 30 * 60_000;
/** After TMD fails - a 401 from an expired token, a 429 - how long before it is asked again. */
export const TMD_RETRY_AFTER_MS = 10 * 60_000;
/** The most TMD may add to a reading's wait. A slow second opinion is no opinion. */
const TMD_TIMEOUT_MS = 2500;

const cache = new Map<string, { at: number; value: AreaWeather }>();
const failedAt = new Map<string, number>();
const inFlight = new Map<string, Promise<AreaWeather>>();
const tmdCache = new Map<string, { at: number; hour: string; value: TmdForecast | null }>();

/** Tests start from nothing. */
export function __resetWeather(): void {
  cache.clear();
  failedAt.clear();
  inFlight.clear();
  tmdCache.clear();
}

/**
 * TMD's forecast for the area's hour, or null. Never throws.
 *
 * A forecast is reused only within its own hour: at 14:05 the 13:00 forecast
 * is not about now, however recently it was fetched. A failure is remembered
 * as null for TMD_RETRY_AFTER_MS, so an expired token is one warning every
 * ten minutes rather than one per screen.
 */
async function getTmdForecast(
  area: AreaKey, lat: number, lng: number, now: number,
  token: string, impl: typeof fetch, timeout: number,
): Promise<TmdForecast | null> {
  const hour = tmdHour(now);
  const hit = tmdCache.get(area);
  if (hit && !hit.value && now - hit.at < TMD_RETRY_AFTER_MS) return null;
  if (hit?.value && hit.hour === hour && now - hit.at < TMD_TTL_MS) return hit.value;
  try {
    const value = readTmdForecast(await fetchJson(tmdForecastUrl(lat, lng, now), impl, timeout, {
      authorization: `Bearer ${token}`,
    }));
    if (!value) throw new Error('not a forecast answer');
    if (!answersHour(value, hour)) throw new Error(`answered for ${value.time}, not ${hour}:00`);
    tmdCache.set(area, { at: now, hour, value });
    return value;
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e);
    const hint = why === 'upstream 401' ? ' - TMD_NWP_TOKEN was refused; it may have expired' : '';
    console.warn(`[weather] TMD cross-check ${area}: ${why}${hint}`);
    tmdCache.set(area, { at: now, hour, value: null });
    return null;
  }
}

const SOURCE = 'Open-Meteo · forecast and marine';

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

/** Fetch with a hard timeout and a size cap. A forecast must never hang or swamp a screen. */
async function fetchJson(
  url: string, fetchImpl: typeof fetch, timeoutMs: number, headers: Record<string, string> = {},
): Promise<unknown> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    // No redirects: the answer comes from the service this app was set to ask, or not at all.
    // 'manual', never 'error': workerd refuses 'error' and throws before the request leaves.
    // A 3xx comes back with ok === false, so the throw below still refuses it.
    const res = await fetchImpl(url, { signal: ctl.signal, redirect: 'manual', headers: { accept: 'application/json', ...headers } });
    if (!res.ok) throw new Error(`upstream ${res.status}`);
    return JSON.parse(await readCapped(res));
  } finally {
    clearTimeout(timer);
  }
}

const q = (n: number) => encodeURIComponent(n.toFixed(4));

export const forecastUrl = (lat: number, lng: number): string =>
  `${FORECAST_API}?latitude=${q(lat)}&longitude=${q(lng)}`
  + '&current=temperature_2m,precipitation,wind_speed_10m,weather_code'
  + `&wind_speed_unit=kn&timezone=${encodeURIComponent(TZ)}`;

export const marineUrl = (lat: number, lng: number): string =>
  `${MARINE_API}?latitude=${q(lat)}&longitude=${q(lng)}`
  + `&current=wave_height,wave_period&timezone=${encodeURIComponent(TZ)}`;

/**
 * The sea and sky above an area. Never throws: a service that is down is an
 * answer too, and it says so.
 *
 * The marine answer is allowed to fail on its own. Inland it has no sea to
 * report anyway, and a wave that could not be read must not take the
 * temperature down with it.
 */
export async function getWeather(area: AreaKey, opts: WeatherOptions = {}): Promise<AreaWeather> {
  if (!isAreaKey(area)) return NO_WEATHER;
  const now = opts.now ?? Date.now();
  const hit = cache.get(area);
  if (hit && now - hit.at < WEATHER_TTL_MS) return hit.value;

  // The last figures, said to be old while they are hours old - or none, said to be none.
  const stale = (): AreaWeather => (hit && now - hit.at < STALE_MAX_MS
    ? { ...hit.value, provenance: 'stale' }
    : { ...NO_WEATHER, source: SOURCE });
  if (now - (failedAt.get(area) ?? -Infinity) < RETRY_AFTER_MS) return stale();

  const pending = inFlight.get(area);
  if (pending) return pending;

  const run = (async (): Promise<AreaWeather> => {
    const { lat, lng } = areaByKey(area).center;
    const impl = opts.fetchImpl ?? fetch;
    const timeout = opts.timeoutMs ?? TIMEOUT_MS;
    // Trimmed: `wrangler secret put` on Windows hands the value over with its line ending.
    const tmdToken = (opts.tmdToken ?? process.env.TMD_NWP_TOKEN ?? '').trim();
    try {
      const [forecast, marine, tmd] = await Promise.all([
        fetchJson(forecastUrl(lat, lng), impl, timeout),
        // The sea may fail by itself; the sky is what decides there is a reading.
        fetchJson(marineUrl(lat, lng), impl, timeout).catch(() => null),
        // So may the second opinion, and it never throws: see tmd.ts.
        // On a shorter leash than Open-Meteo: the card waits for it, and it only decides a label.
        tmdToken ? getTmdForecast(area, lat, lng, now, tmdToken, impl, Math.min(timeout, TMD_TIMEOUT_MS)) : null,
      ]);
      const read = weatherFromOpenMeteo(forecast, marine, TZ_OFFSET, now);
      if (!read) throw new Error('not a forecast answer');
      const value: AreaWeather = crossCheckWeather({
        provenance: 'live',
        // The feed's own step time when it gave a usable one - that is when
        // the figures describe, and a slow hop should not hide it.
        observedAt: new Date(read.observedAt ?? now).toISOString(),
        source: SOURCE,
        ...read.figures,
      }, tmd);
      cache.set(area, { at: now, value });
      failedAt.delete(area);
      return value;
    } catch (e) {
      failedAt.set(area, now);
      console.warn(`[weather] ${area}: ${e instanceof Error ? e.message : String(e)}`);
      return stale();
    } finally {
      inFlight.delete(area);
    }
  })();
  inFlight.set(area, run);
  return run;
}
