/**
 * Live air quality, per coordinate.
 *
 * THE PROBLEM THIS SOLVES
 * The design shows a different AQI for every place (18 at the waterfall, 42 at
 * Chaweng). Thailand's official network, Air4Thai (Pollution Control
 * Department), has NO monitoring station on Koh Samui. The nearest is station
 * 42t at Makham Tia, Surat Thani - about 87 km away across open water. Reading
 * one mainland station and presenting it as five different island readings
 * would be fabrication.
 *
 * THE FIX
 * Primary source is Open-Meteo's air-quality endpoint, which serves the
 * Copernicus CAMS global model at roughly 11 km resolution, free and without an
 * API key. It genuinely varies by coordinate, covers the island, and returns a
 * US AQI directly.
 *
 * Air4Thai is kept as a CROSS-CHECK, not a source: if the modelled value and
 * the nearest ground station diverge badly, the reading is downgraded to
 * `estimated` so the Healthy Score weights it lower rather than trusting it.
 *
 * LONGER TERM
 * The honest answer for a wellness product making air claims is ground truth on
 * the island. Two or three low-cost PM2.5 sensors (Chaweng, Lamai, Na Muang)
 * would cost less than a month of ad spend and would let ChivaGo publish real
 * readings. Flagged in docs/04-open-questions.md.
 */

import type { DB } from './db.ts';

export interface AirReading {
  aqi: number;
  pm25: number | null;
  /** 'live' when fresh from the model, 'estimated' when cross-check failed. */
  provenance: 'live' | 'estimated' | 'stale';
  source: string;
  observedAt: string;
}

const OPEN_METEO = 'https://air-quality-api.open-meteo.com/v1/air-quality';

const AIR4THAI = 'https://air4thai.pcd.go.th/services/getNewAQI_JSON.php';

/** Nearest official ground station to Koh Samui. Cross-check only. */
export const NEAREST_GROUND_STATION = {
  id: '42t',
  name: 'Environment Agency Section 14, Surat Thani',
  lat: 9.126017,
  lng: 99.325145,
  approxDistanceKm: 87,
} as const;

/**
 * Open-Meteo's `time`, as a real instant.
 *
 * The request asks for `timezone=Asia/Bangkok`, so the answer comes back as
 * LOCAL Bangkok time with no offset marker and no seconds: "2026-08-31T19:00".
 * That was passed straight through as if it were ISO-8601 UTC, which is wrong
 * twice over.
 *
 * It is seven hours out - 19:00 Bangkok is 12:00 UTC - and `observedAt` is
 * what the staleness weighting reads, so a fresh reading could present as
 * half a day old or the reverse. And it is AMBIGUOUS: a client parsing it as
 * device-local gets a different instant on every phone.
 *
 * Found by writing a second client. Swift decodes dates strictly, and one
 * malformed value throws the whole response away.
 *
 * Bangkok is UTC+7 all year with no daylight saving, so the conversion is a
 * subtraction rather than a timezone library.
 */
export function toInstant(local: string | undefined): string {
  if (!local) return new Date().toISOString();
  // Already a proper instant: leave it alone.
  if (local.endsWith('Z') || /[+-]\d\d:?\d\d$/.test(local)) {
    return new Date(local).toISOString();
  }
  const parsed = new Date(`${local}Z`);
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString();
  return new Date(parsed.getTime() - 7 * 3_600_000).toISOString();
}

/** How long a cached reading stays fresh. The model updates hourly. */
const TTL_MS = 30 * 60 * 1000;

/**
 * Cache key, snapped to the model's OWN resolution.
 *
 * CAMS is a ~11 km global model, so 0.1 degrees (~11 km) is the finest grid
 * that carries real information. Caching at 0.01 degrees, as an earlier version
 * did, invents 100 distinct cache entries per model cell and fires 100 upstream
 * requests to get the same number back.
 *
 * MEASURED CONSEQUENCE, and it matters for the product: Koh Samui is roughly
 * 25 km across, so the whole island falls inside one to four CAMS cells. All
 * five seed places currently return the SAME AQI. The design shows 18 at the
 * waterfall and 42 at Chaweng - that variation is not resolvable from any
 * global model, and presenting it as if it were would be fabrication.
 * See docs/04-open-questions.md: ground sensors are the honest fix.
 */
export const gridKey = (lat: number, lng: number): string =>
  `${lat.toFixed(1)},${lng.toFixed(1)}`;

/**
 * Air is reported for a MODEL CELL, not a point. Said out loud in the source
 * string so the "How is this calculated?" sheet cannot imply more precision
 * than the data has.
 */
export const AIR_RESOLUTION_KM = 11;

/** Fetch with a hard timeout. An air feed must never hang a map request. */
async function fetchJson(url: string, timeoutMs = 4000): Promise<unknown> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctl.signal });
    if (!res.ok) throw new Error(`upstream ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

interface OpenMeteoResponse {
  current?: { time?: string; us_aqi?: number; pm2_5?: number };
}

/** One coordinate, straight from the model. Throws on failure. */
export async function fetchLiveAir(lat: number, lng: number): Promise<AirReading> {
  const url =
    `${OPEN_METEO}?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}` +
    `&current=pm2_5,us_aqi&timezone=Asia%2FBangkok`;
  const body = (await fetchJson(url)) as OpenMeteoResponse;
  const aqi = body.current?.us_aqi;
  if (typeof aqi !== 'number' || !Number.isFinite(aqi)) {
    throw new Error('air: upstream returned no usable AQI');
  }
  return {
    aqi,
    pm25: typeof body.current?.pm2_5 === 'number' ? body.current.pm2_5 : null,
    provenance: 'live',
    source: `Open-Meteo · Copernicus CAMS (~${AIR_RESOLUTION_KM} km area reading)`,
    observedAt: toInstant(body.current?.time),
  };
}

interface Air4ThaiStation {
  stationID?: string;
  AQILast?: { AQI?: { aqi?: string } };
}

/**
 * The nearest official ground reading, used only to sanity-check the model.
 * Returns null on any failure - a cross-check that fails must degrade the
 * confidence of the primary reading, never block it.
 */
export async function fetchGroundCrossCheck(): Promise<number | null> {
  try {
    const body = (await fetchJson(AIR4THAI, 6000)) as { stations?: Air4ThaiStation[] };
    const station = body.stations?.find((s) => s.stationID === NEAREST_GROUND_STATION.id);
    const raw = station?.AQILast?.AQI?.aqi;
    const aqi = raw === undefined ? NaN : Number(raw);
    // Air4Thai reports -1 for an offline sensor. Treat that as no reading.
    return Number.isFinite(aqi) && aqi >= 0 ? aqi : null;
  } catch {
    return null;
  }
}

/**
 * If the model and the nearest ground station disagree by more than this, we
 * stop calling the reading "live". 40 AQI points is roughly a full EPA category
 * - beyond that the two are telling different stories and neither should be
 * presented as fact.
 */
export const CROSS_CHECK_TOLERANCE = 40;

export function reconcile(model: AirReading, ground: number | null): AirReading {
  if (ground === null) return model;
  if (Math.abs(model.aqi - ground) <= CROSS_CHECK_TOLERANCE) return model;
  return {
    ...model,
    provenance: 'estimated',
    source: `${model.source} (diverges from ${NEAREST_GROUND_STATION.name})`,
  };
}

function readCache(db: DB, key: string): AirReading | null {
  const row = db
    .prepare('SELECT aqi, pm25, fetched_at FROM air_cache WHERE grid_key = ?')
    .get(key) as { aqi: number; pm25: number | null; fetched_at: string } | undefined;
  if (!row) return null;
  const age = Date.now() - new Date(row.fetched_at).getTime();
  return {
    aqi: row.aqi,
    pm25: row.pm25,
    // A cached reading past its TTL is still worth showing - it is the last
    // thing we actually knew - but it is labelled stale so the score
    // downweights it instead of pretending it is current.
    provenance: age <= TTL_MS ? 'live' : 'stale',
    source: `Open-Meteo · Copernicus CAMS (~${AIR_RESOLUTION_KM} km area reading, cached)`,
    observedAt: row.fetched_at,
  };
}

function writeCache(db: DB, key: string, reading: AirReading): void {
  db.prepare(
    `INSERT INTO air_cache (grid_key, aqi, pm25, fetched_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(grid_key) DO UPDATE SET aqi = excluded.aqi, pm25 = excluded.pm25,
       fetched_at = excluded.fetched_at`,
  ).run(key, reading.aqi, reading.pm25, reading.observedAt);
}

/**
 * The function the routes actually call.
 *
 * Never throws. Air is a nice-to-have on a map screen and a hard dependency on
 * nothing: if every source fails, the caller gets `fallbackAqi` (the seeded
 * baseline) marked `stale`, and the Healthy Score weights it down accordingly.
 */
export async function getAir(
  db: DB,
  lat: number,
  lng: number,
  fallbackAqi: number,
): Promise<AirReading> {
  const key = gridKey(lat, lng);
  const cached = readCache(db, key);
  if (cached && cached.provenance === 'live') return cached;

  try {
    const live = await fetchLiveAir(lat, lng);
    writeCache(db, key, live);
    return live;
  } catch {
    if (cached) return cached;
    return {
      aqi: fallbackAqi,
      pm25: null,
      provenance: 'stale',
      source: 'Seeded baseline — live feed unavailable',
      observedAt: new Date().toISOString(),
    };
  }
}
