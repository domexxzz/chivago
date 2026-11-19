/**
 * A second opinion on the sky, from the Thai Meteorological Department.
 *
 * Every figure on the weather card comes from Open-Meteo (weather.ts), a
 * global model. TMD runs its own forecast over Thailand at 2 km, and its NWP
 * API answers it for any point. This file asks it the same question for the
 * same hour and compares: when the two agree the reading stays `live` and
 * says it was checked; when they disagree by more than the tolerances below,
 * the reading is downgraded to `estimated`, exactly as air.ts downgrades an
 * air reading that its ground station contradicts. The figures shown are
 * still Open-Meteo's. Only how far they are trusted changes.
 *
 * A CROSS-CHECK THAT FAILS DEGRADES NOTHING. No token, a refused token, a
 * spent quota, a slow server: each leaves the reading exactly as Open-Meteo
 * gave it, without the "checked" note. It never blocks the card.
 *
 * UNLIKE AIR4THAI, THIS NEEDS NO SIDECAR. Measured 19 November 2026: a
 * request from workerd to data.tmd.go.th completes its TLS handshake and is
 * answered 401 (no token sent), so the server sends a chain Cloudflare's TLS
 * can build. See air4thai.ts for the other kind of government server.
 *
 * THE TOKEN is `TMD_NWP_TOKEN`, a JWT from data.tmd.go.th that expires a year
 * after it is issued. When it does, every request is a 401, the warning in
 * weather.ts says so, and the card quietly stops saying "checked".
 */

import type { AreaWeather } from '@chivago/core';

export const TMD_HOURLY_API = 'https://data.tmd.go.th/nwpapi/v1/forecast/location/hourly/at';

/**
 * Only what is compared. The API counts every field of every hour against
 * the account's quota, so asking for one hour of two fields is the cheapest
 * question that can still disagree.
 */
const FIELDS = 'tc,ws10m';

/** m/s to knots. TMD's own docs say "x 1.94"; this is the exact factor. */
const KN_PER_MS = 1.943844;

/**
 * Further apart than this and the two are not describing the same afternoon.
 *
 * Open-Meteo's figure is for the current quarter hour and TMD's for the top
 * of the hour, so some gap is expected. Four degrees is beyond what an hour
 * does to the air on a coast.
 */
export const TMD_TEMP_TOLERANCE_C = 4;

/** Ten knots is the gap between a calm crossing and one worth thinking about. */
export const TMD_WIND_TOLERANCE_KN = 10;

/** Thailand has no daylight saving: the TMD clock is always UTC+7. */
const BANGKOK_OFFSET_MS = 7 * 3_600_000;

export interface TmdForecast {
  tempC: number | null;
  windKn: number | null;
  /** The hour the forecast is for, as TMD wrote it. */
  time: string | null;
}

/**
 * The Thai-clock hour that contains `now`, as TMD writes the start of it:
 * `2026-10-24T22`. A forecast is for one hour, so this is also what decides
 * whether a cached one still describes now.
 */
export function tmdHour(now: number): string {
  return new Date(now + BANGKOK_OFFSET_MS).toISOString().slice(0, 13);
}

/** The forecast for the hour that contains `now`, on the Thai clock. */
export function tmdForecastUrl(lat: number, lng: number, now: number): string {
  const hour = tmdHour(now);
  const params = new URLSearchParams({
    lat: lat.toFixed(4),
    lon: lng.toFixed(4),
    fields: FIELDS,
    date: hour.slice(0, 10),
    hour: String(Number(hour.slice(11, 13))),
    duration: '1',
  });
  return `${TMD_HOURLY_API}?${params.toString()}`;
}

/**
 * Whether an answer is for the hour that was asked. An answer that names
 * another hour is compared with nothing: midnight against mid-afternoon
 * would "disagree" about every afternoon there is. One that names no hour is
 * taken as answering the question it was asked.
 */
export const answersHour = (forecast: TmdForecast, hour: string): boolean =>
  forecast.time === null || forecast.time.startsWith(hour);

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * The first hour of an answer, or null when it is not one.
 *
 * The list's key is read in every spelling the service has used: its own
 * example for a point answers `WeatherForcasts`, its example for a province
 * `WeatherForecast`. A reading with neither figure is no reading.
 */
export function readTmdForecast(raw: unknown): TmdForecast | null {
  if (!raw || typeof raw !== 'object') return null;
  const body = raw as Record<string, unknown>;
  const list = body.WeatherForecasts ?? body.WeatherForcasts ?? body.WeatherForecast;
  if (!Array.isArray(list)) return null;
  const forecasts = (list[0] as { forecasts?: unknown } | undefined)?.forecasts;
  if (!Array.isArray(forecasts)) return null;
  const hour = forecasts[0] as { time?: unknown; data?: Record<string, unknown> } | undefined;
  if (!hour?.data || typeof hour.data !== 'object') return null;
  const tempC = num(hour.data.tc);
  const ms = num(hour.data.ws10m);
  const windKn = ms === null ? null : Math.round(ms * KN_PER_MS * 100) / 100;
  if (tempC === null && windKn === null) return null;
  return { tempC, windKn, time: typeof hour.time === 'string' ? hour.time : null };
}

const fmt = (n: number) => String(Math.round(n * 10) / 10);

/**
 * Open-Meteo's reading, with its standing decided by TMD's.
 *
 * Only figures both sides have are compared. When none are, nothing was
 * checked and the reading is returned untouched, so the "checked" note never
 * appears without a comparison behind it.
 */
export function crossCheckWeather(reading: AreaWeather, tmd: TmdForecast | null): AreaWeather {
  if (!tmd) return reading;
  const gaps: string[] = [];
  let compared = false;
  if (reading.tempC !== null && tmd.tempC !== null) {
    compared = true;
    if (Math.abs(reading.tempC - tmd.tempC) > TMD_TEMP_TOLERANCE_C) {
      gaps.push(`${fmt(reading.tempC)}°C vs ${fmt(tmd.tempC)}°C`);
    }
  }
  if (reading.windKn !== null && tmd.windKn !== null) {
    compared = true;
    if (Math.abs(reading.windKn - tmd.windKn) > TMD_WIND_TOLERANCE_KN) {
      gaps.push(`wind ${fmt(reading.windKn)} vs ${fmt(tmd.windKn)} kn`);
    }
  }
  if (!compared) return reading;
  if (gaps.length === 0) return { ...reading, source: `${reading.source} · checked against TMD` };
  return {
    ...reading,
    provenance: 'estimated',
    source: `${reading.source} (differs from TMD forecast: ${gaps.join(', ')})`,
  };
}
