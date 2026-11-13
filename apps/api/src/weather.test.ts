import { strict as assert } from 'node:assert';
import { before, beforeEach, describe, test } from 'node:test';
import { areaByKey, isAreaKey } from '@chivago/core';
import {
  RETRY_AFTER_MS, STALE_MAX_MS, WEATHER_TTL_MS, __resetWeather, forecastUrl, getWeather, marineUrl,
} from './weather.ts';

/**
 * The sea and sky above an area, as Open-Meteo reports them (weather.ts).
 *
 * The real service is never called: `fetch` is a stand-in that counts.
 */
delete process.env.CHIVAGO_OPEN_IDENTITY;
process.env.CHIVAGO_DB = ':memory:';

const T0 = Date.parse('2026-10-24T22:45:00+07:00');

const air = (over: Record<string, unknown> = {}) => ({
  current: { time: '2026-10-24T22:45', temperature_2m: 24.4, precipitation: 0, wind_speed_10m: 3, weather_code: 3, ...over },
});
const sea = (over: Record<string, unknown> = {}) => ({
  current: { time: '2026-10-24T22:45', wave_height: 0.1, wave_period: 2.35, ...over },
});

/** A fake Open-Meteo: answers per host, or fails, and counts the asks. */
function fakeService(reply: (url: string) => unknown | Error) {
  const asked: string[] = [];
  const inits: (RequestInit | undefined)[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    asked.push(String(url));
    inits.push(init);
    const r = reply(String(url));
    if (r instanceof Error) throw r;
    if (r instanceof Response) return r;
    return new Response(JSON.stringify(r), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return { asked, inits, fetchImpl };
}

const bothOk = (u: string) => (u.includes('marine-api') ? sea() : air());
const ask = (fetchImpl: typeof fetch, now = T0, area = 'samui' as const) =>
  getWeather(area, { now, fetchImpl });

describe('getWeather', () => {
  beforeEach(() => __resetWeather());

  test('the sea and the sky come live from Open-Meteo, in one reading', async () => {
    const svc = fakeService(bothOk);
    const r = await ask(svc.fetchImpl);
    assert.equal(r.provenance, 'live');
    assert.equal(r.observedAt, new Date(T0).toISOString());
    assert.equal(r.waveHeightM, 0.1);
    assert.equal(r.tempC, 24.4);
    assert.equal(r.windKn, 3);
    assert.equal(r.weatherCode, 3);
    assert.equal(svc.asked.length, 2, 'the sky and the sea are two services');
    assert.ok(svc.inits[0]?.redirect === 'error', 'a redirect is not followed to another host');
  });

  test('it asks for the area\'s own centre, in knots and on the island clock', async () => {
    const svc = fakeService(bothOk);
    await ask(svc.fetchImpl);
    const forecast = svc.asked.find((u) => !u.includes('marine-api'))!;
    // The area's OWN centre, read from core rather than copied into this test.
    const { lat, lng } = areaByKey('samui').center;
    assert.ok(forecast.includes(`latitude=${lat.toFixed(4)}`), `Samui's own centre (${lat.toFixed(4)})`);
    assert.ok(forecast.includes(`longitude=${lng.toFixed(4)}`));
    assert.match(forecast, /wind_speed_unit=kn/);
    assert.match(forecast, /timezone=Asia%2FBangkok/);
    assert.ok(svc.asked.some((u) => u.includes('marine-api')));
  });

  test('inland the sea is null and the sky still reads - never a flat calm', async () => {
    // Open-Meteo answers null for a wave over Pathum Thani.
    const svc = fakeService((u) => (u.includes('marine-api') ? sea({ wave_height: null, wave_period: null }) : air()));
    const r = await getWeather('rmutt', { now: T0, fetchImpl: svc.fetchImpl });
    assert.equal(r.provenance, 'live');
    assert.equal(r.waveHeightM, null, 'no sea here, said as absent');
    assert.equal(r.tempC, 24.4);
  });

  test('the sea failing does not take the sky down with it', async () => {
    const svc = fakeService((u) => (u.includes('marine-api') ? new Error('marine down') : air()));
    const r = await ask(svc.fetchImpl);
    assert.equal(r.provenance, 'live');
    assert.equal(r.waveHeightM, null);
    assert.equal(r.tempC, 24.4);
  });

  test('the sky failing is a failure: a wave alone says nothing about going outside', async () => {
    const svc = fakeService((u) => (u.includes('marine-api') ? sea() : new Error('forecast down')));
    const r = await ask(svc.fetchImpl);
    assert.equal(r.provenance, 'stale');
    assert.equal(r.tempC, null);
    assert.equal(r.waveHeightM, null);
  });

  test('a few minutes of answers come from one request, then it asks again', async () => {
    let temp = 24.4;
    const svc = fakeService((u) => (u.includes('marine-api') ? sea() : air({ temperature_2m: temp })));
    await ask(svc.fetchImpl);
    temp = 31;
    const cached = await ask(svc.fetchImpl, T0 + WEATHER_TTL_MS - 1);
    assert.equal(cached.tempC, 24.4);
    assert.equal(svc.asked.length, 2, 'still the first pair');
    const fresh = await ask(svc.fetchImpl, T0 + WEATHER_TTL_MS);
    assert.equal(fresh.tempC, 31);
  });

  test('screens opening at the same moment share one reading', async () => {
    const svc = fakeService(bothOk);
    const all = await Promise.all(Array.from({ length: 5 }, () => ask(svc.fetchImpl)));
    assert.equal(svc.asked.length, 2, 'one pair of requests, not five');
    assert.ok(all.every((r) => r.provenance === 'live'));
  });

  test('each area is read on its own, and cached on its own', async () => {
    const svc = fakeService(bothOk);
    await ask(svc.fetchImpl, T0, 'samui');
    await getWeather('koh-sichang', { now: T0, fetchImpl: svc.fetchImpl });
    assert.equal(svc.asked.length, 4, 'two areas, two pairs');
  });

  test('when Open-Meteo does not answer, the last figures are served and called stale', async () => {
    let down = false;
    const svc = fakeService((u) => (down ? new Error('ECONNREFUSED') : bothOk(u)));
    await ask(svc.fetchImpl);
    down = true;
    const r = await ask(svc.fetchImpl, T0 + WEATHER_TTL_MS);
    assert.equal(r.provenance, 'stale');
    assert.equal(r.observedAt, new Date(T0).toISOString(), 'when the figures are from, said plainly');
    assert.equal(r.tempC, 24.4);
  });

  test('figures hours old are not served at all', async () => {
    let down = false;
    const svc = fakeService((u) => (down ? new Error('timed out') : bothOk(u)));
    await ask(svc.fetchImpl);
    down = true;
    const r = await ask(svc.fetchImpl, T0 + STALE_MAX_MS);
    assert.equal(r.provenance, 'stale');
    assert.equal(r.observedAt, null);
    assert.equal(r.tempC, null, 'a forecast from this morning says nothing about now');
  });

  test('with nothing known and the service down, nothing is claimed - never a nought', async () => {
    const svc = fakeService(() => new Error('timed out'));
    const r = await ask(svc.fetchImpl);
    assert.equal(r.provenance, 'stale');
    assert.equal(r.observedAt, null);
    for (const v of [r.tempC, r.waveHeightM, r.rainMm, r.windKn]) assert.equal(v, null);
    // And it does not hammer a service that is down.
    await ask(svc.fetchImpl, T0 + 1000);
    assert.equal(svc.asked.length, 2, 'still only the first pair');
  });

  test('after the retry window it asks again, and a service that is back is live again', async () => {
    let down = true;
    const svc = fakeService((u) => (down ? new Error('timed out') : bothOk(u)));
    await ask(svc.fetchImpl);
    down = false;
    assert.equal((await ask(svc.fetchImpl, T0 + RETRY_AFTER_MS - 1)).provenance, 'stale');
    assert.equal((await ask(svc.fetchImpl, T0 + RETRY_AFTER_MS)).provenance, 'live');
  });

  test('an error status, a non-JSON answer and one that is not a forecast are all failures', async () => {
    for (const reply of [
      () => new Response('busy', { status: 503 }),
      () => new Response('<html>down</html>', { status: 200 }),
      () => ({ error: true, reason: 'bad latitude' }),
    ]) {
      __resetWeather();
      const r = await ask(fakeService(reply).fetchImpl);
      assert.equal(r.provenance, 'stale');
      assert.equal(r.tempC, null);
    }
  });

  test('an answer bigger than any real one is refused, not read', async () => {
    const huge = JSON.stringify({ current: { temperature_2m: 24, pad: 'x'.repeat(40_000) } });
    assert.ok(huge.length > 32 * 1024);
    const r = await ask(fakeService(() => new Response(huge, { status: 200 })).fetchImpl);
    assert.equal(r.provenance, 'stale');
    assert.equal(r.tempC, null);
  });

  test('a service that never answers is given up on, not waited for', async () => {
    const hanging = ((_u: string | URL | Request, init?: RequestInit) => new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
    })) as typeof fetch;
    const r = await getWeather('samui', { now: T0, fetchImpl: hanging, timeoutMs: 20 });
    assert.equal(r.provenance, 'stale');
    assert.equal(r.tempC, null);
  });

  test('an area the app does not have asks nobody', async () => {
    const svc = fakeService(bothOk);
    for (const bad of ['nowhere', 'constructor', '__proto__', '']) {
      const r = await getWeather(bad as never, { now: T0, fetchImpl: svc.fetchImpl });
      assert.equal(r.observedAt, null, bad);
      assert.equal(r.tempC, null);
    }
    assert.equal(svc.asked.length, 0);
  });
});

describe('the urls asked for', () => {
  test('coordinates are fixed to four places, so a pan does not make a new cache key upstream', () => {
    assert.match(forecastUrl(9.51204321, 100.01362), /latitude=9\.5120&longitude=100\.0136/);
    assert.match(marineUrl(9.51204321, 100.01362), /latitude=9\.5120/);
  });

  test('the marine url asks only for what is read', () => {
    const u = marineUrl(9.512, 100.0136);
    assert.match(u, /current=wave_height,wave_period/);
    assert.ok(u.startsWith('https://marine-api.open-meteo.com/'));
  });

  test('every area the app has is an area key, and nothing else is', () => {
    for (const k of ['samui', 'rmutt', 'koh-sichang', 'ku-bangkhen', 'ku-sriracha']) assert.ok(isAreaKey(k), k);
    for (const k of ['', 'nowhere', 'constructor', '__proto__']) assert.equal(isAreaKey(k), false, k);
  });
});

describe('GET /areas/:key/weather', () => {
  let app: { request: (path: string, init?: RequestInit) => Response | Promise<Response> };
  const realFetch = globalThis.fetch;

  before(async () => {
    app = (await import('./server-node.ts')).app;
  });

  test('answers an area\'s sea and sky', async () => {
    __resetWeather();
    globalThis.fetch = (async (u: string | URL | Request) => new Response(
      JSON.stringify(bothOk(String(u))), { status: 200 },
    )) as typeof fetch;
    try {
      const res = await app.request('/areas/samui/weather');
      assert.equal(res.status, 200);
      const body = await res.json() as { data: { provenance: string; waveHeightM: number; tempC: number } };
      assert.equal(body.data.provenance, 'live');
      assert.equal(body.data.waveHeightM, 0.1);
      assert.equal(body.data.tempC, 24.4);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  test('is readable by the Expo web app on another local origin', async () => {
    __resetWeather();
    globalThis.fetch = (async (u: string | URL | Request) => new Response(
      JSON.stringify(bothOk(String(u))), { status: 200 },
    )) as typeof fetch;
    try {
      const res = await app.request('/areas/koh-sichang/weather', {
        headers: { origin: 'http://localhost:8081' },
      });
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('access-control-allow-origin'), '*');
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  test('an area the app does not have is a 404', async () => {
    const res = await app.request('/areas/nowhere/weather');
    assert.equal(res.status, 404);
  });
});
