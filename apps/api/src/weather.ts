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
  NO_WEATHER, areaByKey, isAreaKey, marineFromOpenMeteo, weatherFromOpenMeteo,
  type AreaKey, type AreaWeather,
} from '@chivago/core';
import {
  readKohSichangObservation, readTmdNwp, readTmdWarnings, tmdNwpUrl,
  tmdObservationUrl, tmdWarningUrl, type TmdConfig,
} from './tmd-weather.ts';

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
/** Station lists and warning narratives are larger than two Open-Meteo current readings. */
const MAX_TMD_BODY_BYTES = 512 * 1024;

export interface WeatherOptions {
  now?: number;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** Tests may inject credentials; null explicitly disables TMD. */
  tmd?: TmdConfig | null;
}

const cache = new Map<string, { at: number; value: AreaWeather }>();
const failedAt = new Map<string, number>();
const inFlight = new Map<string, Promise<AreaWeather>>();

/** Tests start from nothing. */
export function __resetWeather(): void {
  cache.clear();
  failedAt.clear();
  inFlight.clear();
}

const SOURCE = 'Open-Meteo · forecast and marine';

const tmdFromEnvironment = (): TmdConfig => ({
  uid: process.env.TMD_API_UID,
  apiKey: process.env.TMD_API_KEY,
  nwpToken: process.env.TMD_NWP_TOKEN,
});

/** The answer's text, refused past the cap: the stream is cancelled, not drained. */
async function readCapped(res: Response, maxBytes = MAX_BODY_BYTES): Promise<string> {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return text + decoder.decode();
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new Error(`answer over ${maxBytes} bytes`);
    }
    text += decoder.decode(value, { stream: true });
  }
}

/** Fetch with a hard timeout and a size cap. A forecast must never hang or swamp a screen. */
async function fetchJson(
  url: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
  headers: Record<string, string> = {},
  maxBytes = MAX_BODY_BYTES,
): Promise<unknown> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    // No redirects: the answer comes from the service this app was set to ask, or not at all.
    // 'manual', never 'error': workerd refuses 'error' and throws before the request leaves.
    // A 3xx comes back with ok === false, so the throw below still refuses it.
    const res = await fetchImpl(url, {
      signal: ctl.signal,
      redirect: 'manual',
      headers: { accept: 'application/json', ...headers },
    });
    if (!res.ok) throw new Error(`upstream ${res.status}`);
    return JSON.parse(await readCapped(res, maxBytes));
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
    ? { ...hit.value, provenance: 'stale', officialAlertStatus: 'unavailable', officialAlerts: [] }
    : { ...NO_WEATHER, source: SOURCE });
  if (now - (failedAt.get(area) ?? -Infinity) < RETRY_AFTER_MS) return stale();

  const pending = inFlight.get(area);
  if (pending) return pending;

  const run = (async (): Promise<AreaWeather> => {
    const { lat, lng } = areaByKey(area).center;
    const impl = opts.fetchImpl ?? fetch;
    const timeout = opts.timeoutMs ?? TIMEOUT_MS;
    const tmd = opts.tmd === undefined ? tmdFromEnvironment() : opts.tmd ?? {};
    const useTmd = area === 'koh-sichang';
    const observationUrl = useTmd ? tmdObservationUrl(tmd) : null;
    const warningUrl = useTmd ? tmdWarningUrl(tmd) : null;
    const nwpUrl = useTmd && tmd.nwpToken?.trim() ? tmdNwpUrl(lat, lng, now) : null;
    try {
      const [forecast, marine, observationPayload, nwpPayload, warningResult] = await Promise.all([
        fetchJson(forecastUrl(lat, lng), impl, timeout).catch(() => null),
        fetchJson(marineUrl(lat, lng), impl, timeout).catch(() => null),
        observationUrl
          ? fetchJson(observationUrl, impl, timeout, {}, MAX_TMD_BODY_BYTES).catch(() => null)
          : Promise.resolve(null),
        nwpUrl
          ? fetchJson(nwpUrl, impl, timeout, { authorization: `Bearer ${tmd.nwpToken!.trim()}` }, MAX_TMD_BODY_BYTES).catch(() => null)
          : Promise.resolve(null),
        warningUrl
          ? fetchJson(warningUrl, impl, timeout, {}, MAX_TMD_BODY_BYTES)
            .then((payload) => ({ ok: true as const, payload }))
            .catch(() => ({ ok: false as const, payload: null }))
          : Promise.resolve({ ok: false as const, payload: null }),
      ]);
      const openMeteo = weatherFromOpenMeteo(forecast, marine, TZ_OFFSET, now);
      const tmdAir = readKohSichangObservation(observationPayload, now) ?? readTmdNwp(nwpPayload, now);
      if (!openMeteo && !tmdAir) throw new Error('not a weather answer');
      const sea = marineFromOpenMeteo(marine);
      const alerts = warningResult.ok ? readTmdWarnings(warningResult.payload) : [];
      const value: AreaWeather = {
        provenance: 'live',
        observedAt: new Date(tmdAir?.observedAt ?? openMeteo?.observedAt ?? now).toISOString(),
        source: tmdAir ? `${tmdAir.source} · คลื่น Open-Meteo Marine` : SOURCE,
        provider: tmdAir?.provider ?? 'open-meteo',
        readingKind: tmdAir?.kind ?? 'forecast',
        officialAlertStatus: warningResult.ok ? (alerts.length ? 'active' : 'none') : 'unavailable',
        officialAlerts: alerts,
        ...sea,
        tempC: tmdAir?.tempC ?? openMeteo?.figures.tempC ?? null,
        rainMm: tmdAir?.rainMm ?? openMeteo?.figures.rainMm ?? null,
        windKn: tmdAir?.windKn ?? openMeteo?.figures.windKn ?? null,
        windDirectionDeg: tmdAir?.windDirectionDeg ?? openMeteo?.figures.windDirectionDeg ?? null,
        relativeHumidityPct: tmdAir?.relativeHumidityPct ?? openMeteo?.figures.relativeHumidityPct ?? null,
        // The staffed station does not publish a WMO present-weather code in
        // this feed, so the icon may still use the model condition.
        weatherCode: openMeteo?.figures.weatherCode ?? null,
      };
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
