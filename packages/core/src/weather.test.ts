import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  NO_WEATHER, WEATHER_CATEGORIES, categoriesFor, hasCategory, readObservedAt,
  weatherDescription, weatherFromOpenMeteo, type AreaWeather,
} from './weather.ts';

const OFFSET = '+07:00';
const NOW = Date.parse('2026-10-24T22:45:00+07:00');

const air = (over: Record<string, unknown> = {}) => ({
  current: {
    time: '2026-10-24T22:45', interval: 900,
    temperature_2m: 24.4, precipitation: 0, wind_speed_10m: 3, weather_code: 3, ...over,
  },
});
const sea = (over: Record<string, unknown> = {}) => ({
  current: { time: '2026-10-24T22:45', wave_height: 0.1, wave_direction: 254, wave_period: 2.35, ...over },
});
// No default parameters: a test that passes `undefined` on purpose must get
// `undefined`, not quietly fall back to a good answer.
const readBoth = (f: unknown, m: unknown) => weatherFromOpenMeteo(f, m, OFFSET, NOW);
const read = (f: unknown) => readBoth(f, sea());

const weather = (over: Partial<AreaWeather> = {}): AreaWeather => ({ ...NO_WEATHER, ...over });

test('the reading is the service\'s own figures, with the moment it read them', () => {
  const r = readBoth(air(), sea());
  assert.ok(r);
  assert.deepEqual(r.figures, {
    waveHeightM: 0.1, wavePeriodS: 2.35, tempC: 24.4, rainMm: 0, windKn: 3, weatherCode: 3,
  });
  assert.equal(r.observedAt, NOW);
});

test('inland there is no sea, and that is an answer - not a nought', () => {
  // Open-Meteo answers null for a wave over Pathum Thani. Shown as "no sea
  // here", never as a flat calm.
  const r = readBoth(air(), sea({ wave_height: null, wave_period: null }));
  assert.equal(r?.figures.waveHeightM, null);
  assert.equal(r?.figures.wavePeriodS, null);
  assert.equal(r?.figures.tempC, 24.4, 'the sky is still read');
});

test('the sea answer may be missing entirely without taking the sky down', () => {
  for (const m of [null, undefined, {}, 'nope', { current: null }]) {
    const r = readBoth(air(), m);
    assert.equal(r?.figures.waveHeightM, null, String(m));
    assert.equal(r?.figures.tempC, 24.4, String(m));
  }
});

test('a body that is not a forecast answer is refused', () => {
  for (const f of [null, undefined, 'busy', 42, [], {}, { current: null }, { current: 'x' }]) {
    assert.equal(read(f), null, JSON.stringify(f) ?? 'undefined');
  }
});

test('an answer where not one figure reads is a failure, not a reading of nulls', () => {
  // The shape changed: four renamed fields would otherwise pass as "read, all absent".
  assert.equal(read({ current: { time: '2026-10-24T22:45', temp: 24, rain: 0 } }), null);
});

test('a figure out of range is refused whole, never clamped into shape', () => {
  for (const bad of [-1, 31, 'x', null, NaN, Infinity]) {
    assert.equal(readBoth(air(), sea({ wave_height: bad }))?.figures.waveHeightM, null, `wave ${String(bad)}`);
  }
  for (const bad of [-51, 61, '24', NaN]) {
    assert.equal(read(air({ temperature_2m: bad }))?.figures.tempC, null, `temp ${String(bad)}`);
  }
  assert.equal(read(air({ wind_speed_10m: -1 }))?.figures.windKn, null);
  assert.equal(read(air({ precipitation: 501 }))?.figures.rainMm, null);
  // A real nought is kept - it is a figure the service gave.
  assert.equal(read(air({ precipitation: 0 }))?.figures.rainMm, 0);
  assert.equal(read(air({ wind_speed_10m: 0 }))?.figures.windKn, 0);
});

test('a WMO code must be a whole number in range', () => {
  assert.equal(read(air({ weather_code: 3 }))?.figures.weatherCode, 3);
  for (const bad of [3.5, -1, 100, '3', null]) {
    assert.equal(read(air({ weather_code: bad }))?.figures.weatherCode, null, String(bad));
  }
});

test('the local stamp is read against the offset that was asked for', () => {
  assert.equal(readObservedAt('2026-10-24T22:45', OFFSET, NOW), NOW);
  // An explicit offset is respected rather than having one appended.
  assert.equal(readObservedAt('2026-10-24T15:45:00Z', OFFSET, NOW), NOW);
});

test('a stamp from the future or from hours ago is not used', () => {
  for (const bad of ['2026-10-25T06:00', '2026-10-24T10:00', 'later', '', '2026-13-45T99:99']) {
    assert.equal(readObservedAt(bad, OFFSET, NOW), null, bad);
  }
  assert.equal(readObservedAt(undefined, OFFSET, NOW), null);
  // The reading still stands; only its stamp is missing, and the caller dates it itself.
  assert.equal(read(air({ time: 'later' }))?.observedAt, null);
});

test('only the categories a reading can fill are offered', () => {
  const coastal = weather({ waveHeightM: 0.1, tempC: 24, rainMm: 0, weatherCode: 3 });
  assert.deepEqual(categoriesFor(coastal), ['waves', 'temp', 'weather', 'rain']);
  // Inland: the waves tab is not offered at all, rather than offered and empty.
  const inland = weather({ waveHeightM: null, tempC: 24, rainMm: 0, weatherCode: 3 });
  assert.deepEqual(categoriesFor(inland), ['temp', 'weather', 'rain']);
  assert.deepEqual(categoriesFor(NO_WEATHER), [], 'nothing read offers nothing');
  assert.equal(hasCategory(coastal, 'waves'), true);
  assert.equal(hasCategory(inland, 'waves'), false);
});

test('there is no port tab, because there is no harbour feed to fill one', () => {
  assert.equal(WEATHER_CATEGORIES.includes('port' as never), false);
  assert.deepEqual([...WEATHER_CATEGORIES], ['waves', 'temp', 'weather', 'rain']);
});

test('nothing read claims nothing at all', () => {
  assert.equal(NO_WEATHER.provenance, 'stale');
  assert.equal(NO_WEATHER.observedAt, null);
  for (const v of [NO_WEATHER.waveHeightM, NO_WEATHER.tempC, NO_WEATHER.rainMm, NO_WEATHER.windKn]) {
    assert.equal(v, null, 'absent, never nought');
  }
});

test('a weather code is described in both languages, and an unknown one says nothing', () => {
  assert.deepEqual(weatherDescription(0), { en: 'Clear', th: 'ท้องฟ้าแจ่มใส' });
  assert.equal(weatherDescription(3)?.en, 'Overcast');
  assert.equal(weatherDescription(61)?.en, 'Rain');
  assert.equal(weatherDescription(95)?.en, 'Thunderstorm');
  for (const bad of [null, -1, 100, 3.5]) assert.equal(weatherDescription(bad as number), null, String(bad));
  // Every code in range is describable; none falls through to undefined.
  for (let c = 0; c <= 99; c += 1) assert.ok(weatherDescription(c), `code ${c}`);
});
