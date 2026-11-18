/**
 * Small, defensive adapters for the Thai Meteorological Department feeds.
 *
 * Credentials are server-only. Nothing in this module is imported by Expo,
 * and no credential is ever copied into an API response or an error message.
 */

import type { OfficialWeatherAlert, WeatherProvider } from '@chivago/core';

export const KOH_SICHANG_WMO = '48460';
export const TMD_OBSERVATION_API = 'https://data.tmd.go.th/api/Weather3HoursBySynop/V2/';
export const TMD_WARNING_API = 'https://data.tmd.go.th/api/WeatherWarningNews/v2/';
export const TMD_NWP_API = 'https://data.tmd.go.th/nwpapi/v1/forecast/location/hourly/at';

export interface TmdConfig {
  uid?: string;
  apiKey?: string;
  nwpToken?: string;
}

export interface TmdAirReading {
  observedAt: number;
  tempC: number | null;
  rainMm: number | null;
  windKn: number | null;
  windDirectionDeg: number | null;
  relativeHumidityPct: number | null;
  kind: 'observation' | 'forecast';
  provider: WeatherProvider;
  source: string;
}

type JsonObject = Record<string, unknown>;

const object = (value: unknown): JsonObject | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? value as JsonObject : null;

const finite = (value: unknown, min: number, max: number): number | null => {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null;
};

/** TMD legacy feeds stamp local ICT as MM/DD/YYYY HH:mm:ss. */
export function parseTmdTime(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  const local = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(raw);
  const normalized = local
    ? `${local[3]}-${local[1]!.padStart(2, '0')}-${local[2]!.padStart(2, '0')}T${local[4]!.padStart(2, '0')}:${local[5]}:${local[6] ?? '00'}+07:00`
    : raw;
  const time = Date.parse(normalized);
  return Number.isFinite(time) ? time : null;
}

function stationsFrom(payload: unknown): unknown[] {
  const root = object(payload);
  const stations = object(root?.Stations)?.Station;
  return Array.isArray(stations) ? stations : stations ? [stations] : [];
}

/** Read the on-island staffed station only; never substitute a distant station silently. */
export function readKohSichangObservation(payload: unknown, now: number): TmdAirReading | null {
  const station = stationsFrom(payload)
    .map(object)
    .find((row) => String(row?.WmoStationNumber ?? '').trim() === KOH_SICHANG_WMO
      || String(row?.StationNameEnglish ?? '').toLowerCase().includes('sichang')
      || String(row?.StationNameThai ?? '').includes('สีชัง'));
  if (!station) return null;
  const observation = object(station.Observation);
  const observedAt = parseTmdTime(observation?.DateTime);
  // A 3-hour station reading remains useful between reporting slots. A future
  // stamp or an old/stuck feed must never replace current model data.
  if (observedAt === null || observedAt > now + 5 * 60_000 || observedAt < now - 8 * 3_600_000) return null;

  const tempC = finite(observation?.AirTemperature, -50, 60);
  const rainMm = finite(observation?.Rainfall, 0, 500);
  const windKmh = finite(observation?.WindSpeed, 0, 500);
  const windDirectionDeg = finite(observation?.WindDirection, 0, 360);
  const relativeHumidityPct = finite(observation?.RelativeHumidity, 0, 100);
  if ([tempC, rainMm, windKmh, windDirectionDeg, relativeHumidityPct].every((value) => value === null)) return null;

  return {
    observedAt,
    tempC,
    rainMm,
    windKn: windKmh === null ? null : windKmh / 1.852,
    windDirectionDeg,
    relativeHumidityPct,
    kind: 'observation',
    provider: 'tmd-station',
    source: 'กรมอุตุนิยมวิทยา · สถานีเกาะสีชัง (WMO 48460)',
  };
}

/** The NWP docs have used several root spellings; find a documented forecasts list defensively. */
function forecastRows(payload: unknown, depth = 0): JsonObject[] {
  if (depth > 4) return [];
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const found = forecastRows(item, depth + 1);
      if (found.length) return found;
    }
    return [];
  }
  const row = object(payload);
  if (!row) return [];
  if (Array.isArray(row.forecasts)) return row.forecasts.map(object).filter((item): item is JsonObject => item !== null);
  for (const value of Object.values(row)) {
    const found = forecastRows(value, depth + 1);
    if (found.length) return found;
  }
  return [];
}

export function readTmdNwp(payload: unknown, now: number): TmdAirReading | null {
  const candidates = forecastRows(payload)
    .map((row) => ({ row, at: parseTmdTime(row.time) }))
    .filter((item): item is { row: JsonObject; at: number } => item.at !== null)
    .sort((a, b) => Math.abs(a.at - now) - Math.abs(b.at - now));
  const picked = candidates[0];
  if (!picked || Math.abs(picked.at - now) > 3 * 3_600_000) return null;
  const data = object(picked.row.data);
  if (!data) return null;
  const tempC = finite(data.tc, -50, 60);
  const rainMm = finite(data.rain, 0, 500);
  const windMs = finite(data.ws10m, 0, 150);
  const windDirectionDeg = finite(data.wd10m, 0, 360);
  const relativeHumidityPct = finite(data.rh, 0, 100);
  if ([tempC, rainMm, windMs, windDirectionDeg, relativeHumidityPct].every((value) => value === null)) return null;
  return {
    observedAt: picked.at,
    tempC,
    rainMm,
    windKn: windMs === null ? null : windMs * 1.943844,
    windDirectionDeg,
    relativeHumidityPct,
    kind: 'forecast',
    provider: 'tmd-nwp',
    source: 'กรมอุตุนิยมวิทยา · แบบจำลอง NWP ตามพิกัด',
  };
}

function warningObjects(payload: unknown, depth = 0, result: JsonObject[] = []): JsonObject[] {
  if (depth > 5 || result.length >= 20) return result;
  if (Array.isArray(payload)) {
    for (const item of payload) warningObjects(item, depth + 1, result);
    return result;
  }
  const row = object(payload);
  if (!row) return result;
  if (typeof row.TitleThai === 'string' || typeof row.HeadlineThai === 'string') result.push(row);
  else for (const value of Object.values(row)) warningObjects(value, depth + 1, result);
  return result;
}

function safeTmdUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && (url.hostname === 'tmd.go.th' || url.hostname.endsWith('.tmd.go.th'))
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

export function readTmdWarnings(payload: unknown): OfficialWeatherAlert[] {
  const seen = new Set<string>();
  const alerts: OfficialWeatherAlert[] = [];
  for (const row of warningObjects(payload)) {
    const title = String(row.TitleThai ?? row.HeadlineThai ?? '').trim();
    if (!title) continue;
    const issue = String(row.IssueNo ?? '').trim();
    const key = `${issue}:${title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const headline = String(row.HeadlineThai ?? '').trim();
    const iso = (value: unknown) => {
      const parsed = parseTmdTime(value);
      return parsed === null ? null : new Date(parsed).toISOString();
    };
    alerts.push({
      title,
      headline: headline && headline !== title ? headline : null,
      announcedAt: iso(row.AnnounceDate),
      effectiveFrom: iso(row.EffectStartDate),
      effectiveUntil: iso(row.EffectEndDate),
      url: safeTmdUrl(row.WebUrlThai),
      source: 'TMD',
    });
  }
  return alerts.slice(0, 5);
}

export function tmdObservationUrl(config: TmdConfig): string | null {
  if (!config.uid?.trim() || !config.apiKey?.trim()) return null;
  const query = new URLSearchParams({ uid: config.uid.trim(), ukey: config.apiKey.trim(), format: 'json' });
  return `${TMD_OBSERVATION_API}?${query}`;
}

export function tmdWarningUrl(config: TmdConfig): string | null {
  if (!config.uid?.trim() || !config.apiKey?.trim()) return null;
  const query = new URLSearchParams({ uid: config.uid.trim(), ukey: config.apiKey.trim(), format: 'json' });
  return `${TMD_WARNING_API}?${query}`;
}

export function tmdNwpUrl(lat: number, lng: number, now: number): string {
  // Convert to ICT without depending on the server's own timezone.
  const local = new Date(now + 7 * 3_600_000).toISOString();
  const query = new URLSearchParams({
    lat: lat.toFixed(4), lon: lng.toFixed(4), date: local.slice(0, 10),
    hour: String(Number(local.slice(11, 13))), duration: '1', fields: 'tc,rh,rain,ws10m,wd10m,cond',
  });
  return `${TMD_NWP_API}?${query}`;
}
