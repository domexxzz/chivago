import { strict as assert } from 'node:assert';
import { beforeEach, describe, test } from 'node:test';
import {
  COASTAL_RETRY_MS, COASTAL_STALE_MAX_MS, COASTAL_TTL_MS,
  __resetCoastalIntelligence, coastalCurrentUrl, getCoastalIntelligence,
} from './coastal-intelligence.ts';

const T0 = Date.parse('2026-11-18T18:20:00+07:00');
const current = (over: Record<string, unknown> = {}) => ({
  current: {
    time: '2026-11-18T18:15',
    ocean_current_velocity: 0.8,
    ocean_current_direction: 225,
    ...over,
  },
});

function fake(reply: unknown | Error) {
  let calls = 0;
  const fetchImpl = (async () => {
    calls += 1;
    if (reply instanceof Error) throw reply;
    return new Response(JSON.stringify(reply), { status: 200 });
  }) as typeof fetch;
  return { fetchImpl, calls: () => calls };
}

describe('Ko Sichang coastal intelligence', () => {
  beforeEach(() => __resetCoastalIntelligence());

  test('serves a live current with honest research metadata and real checkpoints', async () => {
    const service = fake(current());
    const result = await getCoastalIntelligence({ now: T0, fetchImpl: service.fetchImpl });
    assert.equal(result.status, 'live');
    assert.equal(result.current.speedKmh, 0.8);
    assert.equal(result.current.directionDeg, 225);
    assert.equal(result.current.directionLabel?.en, 'Southwest');
    assert.equal(result.model.calibrated, false);
    assert.equal(result.model.resolutionKm, 9);
    assert.equal(result.zones.length, 3);
    assert.deepEqual(result.zones.map((zone) => zone.segmentId), [8, 15, 27]);
    assert.equal(service.calls(), 1);
  });

  test('caches a reading, labels a recent fallback stale, then stops serving old figures', async () => {
    const live = fake(current());
    await getCoastalIntelligence({ now: T0, fetchImpl: live.fetchImpl });
    assert.equal((await getCoastalIntelligence({ now: T0 + COASTAL_TTL_MS - 1, fetchImpl: live.fetchImpl })).status, 'live');
    assert.equal(live.calls(), 1);

    const down = fake(new Error('offline'));
    const stale = await getCoastalIntelligence({ now: T0 + COASTAL_TTL_MS, fetchImpl: down.fetchImpl });
    assert.equal(stale.status, 'stale');
    assert.equal(stale.current.speedKmh, 0.8);
    const unavailable = await getCoastalIntelligence({ now: T0 + COASTAL_STALE_MAX_MS, fetchImpl: down.fetchImpl });
    assert.equal(unavailable.status, 'unavailable');
    assert.equal(unavailable.current.speedKmh, null);
  });

  test('invalid and unavailable upstream data never becomes a zero or a debris claim', async () => {
    for (const answer of [
      current({ ocean_current_velocity: null }),
      current({ ocean_current_direction: 900 }),
      {},
    ]) {
      __resetCoastalIntelligence();
      const result = await getCoastalIntelligence({ now: T0, fetchImpl: fake(answer).fetchImpl });
      assert.equal(result.status, 'unavailable');
      assert.equal(result.current.speedKmh, null);
      assert.match(result.model.notice.en, /not a calibrated debris probability/i);
    }
  });

  test('does not hammer a failed provider during the retry window', async () => {
    const down = fake(new Error('timeout'));
    await getCoastalIntelligence({ now: T0, fetchImpl: down.fetchImpl });
    await getCoastalIntelligence({ now: T0 + COASTAL_RETRY_MS - 1, fetchImpl: down.fetchImpl });
    assert.equal(down.calls(), 1);
  });

  test('asks only the fixed Ko Sichang cell and named current model', () => {
    const url = coastalCurrentUrl();
    assert.match(url, /latitude=13\.1599&longitude=100\.8096/);
    assert.match(url, /ocean_current_velocity,ocean_current_direction/);
    assert.match(url, /models=meteofrance_currents/);
    assert.ok(url.startsWith('https://marine-api.open-meteo.com/'));
  });
});
