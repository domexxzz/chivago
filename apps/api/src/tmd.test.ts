import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';
import type { AreaWeather } from '@chivago/core';
import {
  TMD_TEMP_TOLERANCE_C, TMD_WIND_TOLERANCE_KN, answersHour, crossCheckWeather, readTmdForecast,
  tmdForecastUrl, tmdHour,
} from './tmd.ts';

/**
 * The Thai Meteorological Department's forecast, as a second opinion on
 * Open-Meteo's (tmd.ts). Pure functions only: the request itself is tested
 * through getWeather in weather.test.ts.
 */

const T0 = Date.parse('2026-10-24T22:45:00+07:00');

const reading = (over: Partial<AreaWeather> = {}): AreaWeather => ({
  provenance: 'live',
  observedAt: new Date(T0).toISOString(),
  source: 'Open-Meteo · forecast and marine',
  waveHeightM: 0.1, wavePeriodS: 2.4, tempC: 27, rainMm: 0, windKn: 6, weatherCode: 3,
  ...over,
});

const answer = (data: Record<string, unknown>, key = 'WeatherForecasts') => ({
  [key]: [{ location: { lat: 13.15, lon: 100.81 }, forecasts: [{ time: '2026-10-24T22:00:00+07:00', data }] }],
});

describe('tmdForecastUrl', () => {
  test('asks for this hour on the Thai clock, at the area, for the fields that are compared', () => {
    const url = new URL(tmdForecastUrl(13.1533, 100.8167, T0));
    assert.equal(url.origin + url.pathname, 'https://data.tmd.go.th/nwpapi/v1/forecast/location/hourly/at');
    assert.equal(url.searchParams.get('lat'), '13.1533');
    assert.equal(url.searchParams.get('lon'), '100.8167');
    assert.equal(url.searchParams.get('date'), '2026-10-24');
    assert.equal(url.searchParams.get('hour'), '22');
    assert.equal(url.searchParams.get('duration'), '1', 'one hour: every field of every hour is a datapoint on the quota');
    assert.equal(url.searchParams.get('fields'), 'tc,ws10m');
  });

  test('just after midnight in Bangkok it is already the next day there, though not in UTC', () => {
    const url = new URL(tmdForecastUrl(13, 100, Date.parse('2026-10-25T00:30:00+07:00')));
    assert.equal(url.searchParams.get('date'), '2026-10-25');
    assert.equal(url.searchParams.get('hour'), '0');
  });
});

describe('readTmdForecast', () => {
  test('reads temperature, and wind converted from metres per second to knots', () => {
    const r = readTmdForecast(answer({ tc: 26.5, ws10m: 5 }));
    assert.equal(r?.tempC, 26.5);
    assert.ok(Math.abs((r?.windKn ?? 0) - 9.72) < 0.01, `5 m/s is 9.72 kn, got ${r?.windKn}`);
    assert.equal(r?.time, '2026-10-24T22:00:00+07:00');
  });

  test('accepts the key as the service actually spells it in its own example, "WeatherForcasts"', () => {
    assert.equal(readTmdForecast(answer({ tc: 26 }, 'WeatherForcasts'))?.tempC, 26);
  });

  test('a field that is missing or not a number is null, not nought', () => {
    const r = readTmdForecast(answer({ tc: 'n/a' }));
    assert.equal(r, null, 'nothing comparable is no reading at all');
    const windOnly = readTmdForecast(answer({ ws10m: 2 }));
    assert.equal(windOnly?.tempC, null);
  });

  test('anything that is not a forecast answer is null', () => {
    for (const raw of [null, 'x', {}, { WeatherForecasts: [] }, { WeatherForecasts: [{ forecasts: [] }] }]) {
      assert.equal(readTmdForecast(raw), null);
    }
  });
});

describe('the hour', () => {
  test('is the Thai-clock hour, in the form TMD stamps its forecasts with', () => {
    assert.equal(tmdHour(T0), '2026-10-24T22');
    assert.equal(tmdHour(Date.parse('2026-10-24T17:30:00Z')), '2026-10-25T00');
  });

  test('an answer stamped with that hour answers it; another hour does not; no stamp is taken on trust', () => {
    const at = (time: string | null) => ({ tempC: 25, windKn: 3, time });
    assert.equal(answersHour(at('2026-10-24T22:00:00+07:00'), '2026-10-24T22'), true);
    assert.equal(answersHour(at('2026-10-24T08:00:00+07:00'), '2026-10-24T22'), false);
    assert.equal(answersHour(at(null), '2026-10-24T22'), true);
  });
});

describe('crossCheckWeather', () => {
  test('when the two agree the reading stays live and says it was checked', () => {
    const r = crossCheckWeather(reading(), { tempC: 27 + TMD_TEMP_TOLERANCE_C, windKn: 6, time: null });
    assert.equal(r.provenance, 'live');
    assert.match(r.source, /checked against TMD/);
  });

  test('a temperature further apart than the tolerance makes the reading estimated, and says by how much', () => {
    const r = crossCheckWeather(reading({ tempC: 32 }), { tempC: 27, windKn: 6, time: null });
    assert.equal(r.provenance, 'estimated');
    assert.match(r.source, /differs from TMD/);
    assert.match(r.source, /32/);
    assert.match(r.source, /27/);
    assert.equal(r.tempC, 32, 'the figure shown is still Open-Meteo\'s - only its standing changes');
  });

  test('so does a wind further apart than the tolerance', () => {
    const r = crossCheckWeather(reading({ windKn: 4 }), { tempC: 27, windKn: 4 + TMD_WIND_TOLERANCE_KN + 1, time: null });
    assert.equal(r.provenance, 'estimated');
  });

  test('no second opinion changes nothing', () => {
    const live = reading();
    assert.deepEqual(crossCheckWeather(live, null), live);
  });

  test('a figure either side lacks is not compared', () => {
    const r = crossCheckWeather(reading({ tempC: null }), { tempC: 40, windKn: null, time: null });
    assert.equal(r.provenance, 'live');
    assert.doesNotMatch(r.source, /checked against TMD/, 'nothing was actually compared');
  });
});
