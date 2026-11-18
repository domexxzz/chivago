/**
 * The sea and the sky above an area, from Open-Meteo.
 *
 * WHY THIS FILE EXISTS. The app carried a marine card whose figures were
 * written into the JSX: "waves 1.2 - 2.0 m, wind 10-20 kts", beside invented
 * scores and a quest pinned to a spot it does not have. Nothing fetched them
 * and nothing could refresh them. On the day they were replaced, the real
 * reading off this feed was 0.1 m and 3 knots - a card a person might read
 * before taking a boat out was wrong by more than ten times. So: every figure
 * below is read from a service, carries the moment it was read, and is null
 * when it was not read. None of them is estimated here.
 *
 * TWO SERVICES, ONE READING. Open-Meteo answers the air (temperature, rain,
 * wind, the WMO code) from its forecast API and the sea (wave height and
 * period) from its marine one. They are asked together and read together,
 * and either may be missing without taking the other down: on a campus in
 * Pathum Thani the marine API answers `null` for a wave, which is the truth
 * and is shown as "no sea here" rather than as a nought.
 *
 * The same provider already serves the air quality this app shows (air.ts).
 */

import type { Bilingual, Provenance } from './types.ts';

/** The conditions a reader can ask for. `port` is deliberately NOT here - see `WEATHER_CATEGORIES`. */
export type WeatherCategoryKey = 'waves' | 'temp' | 'weather' | 'rain';

export type WeatherReadingKind = 'observation' | 'forecast';
export type WeatherProvider = 'tmd-station' | 'tmd-nwp' | 'open-meteo';

export interface OfficialWeatherAlert {
  /** Raw official title. TMD warnings are authoritative Thai source text. */
  title: string;
  headline: string | null;
  announcedAt: string | null;
  effectiveFrom: string | null;
  effectiveUntil: string | null;
  url: string | null;
  source: 'TMD';
}

/**
 * The categories, in the order they are offered.
 *
 * There is no `port` tab. The design had one, and the app has no ferry or
 * harbour feed of any kind - a tab that cannot answer is worse than a tab
 * that is not there, because the first looks like a service that is broken.
 * Add it when something real can fill it.
 */
export const WEATHER_CATEGORIES: readonly WeatherCategoryKey[] = ['waves', 'temp', 'weather', 'rain'];

/** One reading of an area's sea and sky. Every figure is null when it was not read. */
export interface AreaWeather {
  /** 'live' when the feed answered just now; 'stale' for the last reading, or for none. */
  provenance: Extract<Provenance, 'live' | 'stale'>;
  /** When the figures were read (ISO), or null when they never were. */
  observedAt: string | null;
  source: string;
  /** Structured provider identity lets each client localise attribution safely. */
  provider?: WeatherProvider;
  /** Whether the air figures came from an instrument reading or a model. */
  readingKind?: WeatherReadingKind;
  /** Official-warning availability is separate from the weather feed. */
  officialAlertStatus?: 'active' | 'none' | 'unavailable';
  officialAlerts?: OfficialWeatherAlert[];
  /** Metres. Null inland, where the marine feed has no sea to report. */
  waveHeightM: number | null;
  /** Seconds between crests. Null with no sea, or when the feed omitted it. */
  wavePeriodS: number | null;
  tempC: number | null;
  /** Millimetres in the last interval. */
  rainMm: number | null;
  /** Knots. */
  windKn: number | null;
  /** Direction the wind comes from, in degrees. */
  windDirectionDeg?: number | null;
  relativeHumidityPct?: number | null;
  /** WMO present-weather code, 0-99. */
  weatherCode: number | null;
}

/** Nothing read. Not a zero anywhere: a figure nobody gave is absent, not nought. */
export const NO_WEATHER: AreaWeather = {
  provenance: 'stale', observedAt: null, source: '',
  readingKind: 'forecast', officialAlertStatus: 'unavailable', officialAlerts: [],
  waveHeightM: null, wavePeriodS: null, tempC: null, rainMm: null, windKn: null,
  windDirectionDeg: null, relativeHumidityPct: null, weatherCode: null,
};

/**
 * Whether a category has anything to show.
 *
 * Drives which tabs appear: inland there is no sea, so the waves tab is not
 * offered at all rather than offered and empty.
 */
export function hasCategory(w: AreaWeather, key: WeatherCategoryKey): boolean {
  switch (key) {
    case 'waves': return w.waveHeightM !== null;
    case 'temp': return w.tempC !== null;
    case 'rain': return w.rainMm !== null;
    case 'weather': return w.weatherCode !== null;
  }
}

/** The categories this reading can actually fill, in the order above. */
export const categoriesFor = (w: AreaWeather): WeatherCategoryKey[] =>
  WEATHER_CATEGORIES.filter((k) => hasCategory(w, k));

/*
  Ranges. A figure outside one is refused rather than clamped: a clamped
  reading is a number nobody gave. The bounds are generous on purpose - they
  are here to catch a feed that changed shape or units, not to second-guess
  the weather.
*/
const WAVE_MAX_M = 30;
const PERIOD_MAX_S = 30;
const TEMP_MIN_C = -50;
const TEMP_MAX_C = 60;
const RAIN_MAX_MM = 500;
const WIND_MAX_KN = 250;
const WMO_MAX = 99;

/** A finite number inside its range, or null. Absent, text and NaN all read as "not given". */
function num(raw: unknown, min: number, max: number): number | null {
  return typeof raw === 'number' && Number.isFinite(raw) && raw >= min && raw <= max ? raw : null;
}

/** How far back a reading may be stamped and still describe now. Open-Meteo steps every 15 minutes. */
const OBSERVED_MAX_AGE_MS = 3 * 3_600_000;

/**
 * The `current.time` of an Open-Meteo answer, as epoch ms, or null.
 *
 * It arrives as local wall time with no offset ("2026-10-24T22:45") because
 * the request names a timezone, so the offset used to read it must be the one
 * that was asked for. A stamp from the future, or older than a few hours, is
 * not used: the caller falls back to the moment it asked.
 */
export function readObservedAt(raw: unknown, offset: string, now: number): number | null {
  if (typeof raw !== 'string') return null;
  const at = Date.parse(/[Z+]|-\d\d:\d\d$/.test(raw) ? raw : `${raw}:00${offset}`);
  if (!Number.isFinite(at)) return null;
  return at <= now + 60_000 && at > now - OBSERVED_MAX_AGE_MS ? at : null;
}

export interface WeatherRead {
  /** Everything but provenance, source and the ISO stamp - the service adds those. */
  figures: Omit<AreaWeather, 'provenance' | 'observedAt' | 'source'>;
  observedAt: number | null;
}

export type MarineWeatherFigures = Pick<AreaWeather, 'waveHeightM' | 'wavePeriodS'>;

/** Read only the marine half, so a trusted station can supply the air half. */
export function marineFromOpenMeteo(marine: unknown): MarineWeatherFigures {
  const sea = (marine as { current?: unknown } | null)?.current;
  const s = typeof sea === 'object' && sea !== null ? sea as Record<string, unknown> : {};
  return {
    waveHeightM: num(s.wave_height, 0, WAVE_MAX_M),
    wavePeriodS: num(s.wave_period, 0, PERIOD_MAX_S),
  };
}

/**
 * One reading out of Open-Meteo's two answers, or null when the air answer is
 * not one at all.
 *
 * `marine` may be null, or may carry nulls: inland there is no sea, and that
 * is an answer. The air answer is what decides whether there is a reading -
 * without it there is nothing to show but a wave height, which on its own
 * says nothing about whether to go outside.
 */
export function weatherFromOpenMeteo(
  forecast: unknown, marine: unknown, offset: string, now: number,
): WeatherRead | null {
  const air = (forecast as { current?: unknown } | null)?.current;
  if (typeof air !== 'object' || air === null) return null;
  const a = air as Record<string, unknown>;

  const tempC = num(a.temperature_2m, TEMP_MIN_C, TEMP_MAX_C);
  const rainMm = num(a.precipitation, 0, RAIN_MAX_MM);
  const windKn = num(a.wind_speed_10m, 0, WIND_MAX_KN);
  const codeRaw = num(a.weather_code, 0, WMO_MAX);
  const weatherCode = codeRaw === null || !Number.isInteger(codeRaw) ? null : codeRaw;
  // Not one figure could be read: the answer changed shape, and that is a
  // failure rather than a reading of four nulls.
  if (tempC === null && rainMm === null && windKn === null && weatherCode === null) return null;

  const sea = marineFromOpenMeteo(marine);

  return {
    figures: {
      ...sea,
      tempC, rainMm, windKn, windDirectionDeg: null, relativeHumidityPct: null, weatherCode,
    },
    observedAt: readObservedAt(a.time, offset, now),
  };
}

/**
 * What a WMO present-weather code means, in both languages.
 *
 * Grouped, not enumerated to all 99: the groups are what the code's own
 * table defines, and a band a reader can act on beats a precision the number
 * does not carry. An unknown code says nothing rather than guessing "clear".
 */
export function weatherDescription(code: number | null): Bilingual | null {
  if (code === null || !Number.isInteger(code) || code < 0 || code > WMO_MAX) return null;
  if (code === 0) return { en: 'Clear', th: 'ท้องฟ้าแจ่มใส', zh: '晴' };
  if (code <= 2) return { en: 'Partly cloudy', th: 'มีเมฆบางส่วน', zh: '多云间晴' };
  if (code === 3) return { en: 'Overcast', th: 'เมฆมาก', zh: '阴' };
  if (code <= 48) return { en: 'Fog', th: 'หมอก', zh: '雾' };
  if (code <= 57) return { en: 'Drizzle', th: 'ฝนปรอย', zh: '毛毛雨' };
  if (code <= 67) return { en: 'Rain', th: 'ฝนตก', zh: '雨' };
  if (code <= 77) return { en: 'Snow', th: 'หิมะ', zh: '雪' };
  if (code <= 82) return { en: 'Rain showers', th: 'ฝนตกเป็นช่วง', zh: '阵雨' };
  if (code <= 86) return { en: 'Snow showers', th: 'หิมะตกเป็นช่วง', zh: '阵雪' };
  return { en: 'Thunderstorm', th: 'พายุฝนฟ้าคะนอง', zh: '雷阵雨' };
}
