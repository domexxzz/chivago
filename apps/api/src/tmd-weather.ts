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
/**
 * The oldest station reading that may stand in for now. The station reports
 * every three hours; an hour on top allows for TMD publishing late. Past
 * that, the island's model forecast says more about now than the last report.
 */
export const TMD_OBSERVATION_MAX_AGE_MS = 4 * 3_600_000;

/** TMD's NWP forecasts are read by tmd.ts, the one client for that quota. */

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

/**
 * TMD legacy feeds stamp local ICT as MM/DD/YYYY HH:mm:ss. An ISO stamp
 * without an offset is ICT too: parsed bare it would be read on the server's
 * clock, which on Cloudflare is UTC, seven hours off.
 */
export function parseTmdTime(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  const local = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(raw);
  const normalized = local
    ? `${local[3]}-${local[1]!.padStart(2, '0')}-${local[2]!.padStart(2, '0')}T${local[4]!.padStart(2, '0')}:${local[5]}:${local[6] ?? '00'}+07:00`
    : /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(raw) ? `${raw}+07:00` : raw;
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
  if (observedAt === null || observedAt > now + 5 * 60_000 || observedAt < now - TMD_OBSERVATION_MAX_AGE_MS) return null;

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
