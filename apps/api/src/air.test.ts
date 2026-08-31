import { strict as assert } from 'node:assert';
import { test, describe, beforeEach } from 'node:test';

import { openTestDb, type DB } from './db.ts';
import {
  AIR_RESOLUTION_KM, CROSS_CHECK_TOLERANCE, getAir, gridKey,
  NEAREST_GROUND_STATION, reconcile, toInstant, type AirReading,
} from './air.ts';
import { SEED_PLACES } from '@chivago/core';

let db: DB;
beforeEach(() => { db = openTestDb(); });

const reading = (over: Partial<AirReading> = {}): AirReading => ({
  aqi: 38, pm25: 5.2, provenance: 'live',
  source: 'Open-Meteo · Copernicus CAMS', observedAt: '2026-08-31T01:00:00Z', ...over,
});

describe('grid key matches the model resolution', () => {
  test('snaps to 0.1 degrees, roughly the CAMS cell size', () => {
    assert.equal(gridKey(9.5357, 100.0617), '9.5,100.1');
    assert.equal(AIR_RESOLUTION_KM, 11);
  });

  test('points inside one cell share a cache entry instead of fanning out', () => {
    // A map pan of a few hundred metres must not fire a new upstream request.
    assert.equal(gridKey(9.5357, 100.0617), gridKey(9.5390, 100.0650));
  });

  test('snapping means adjacent places can straddle a cell boundary', () => {
    // Chaweng (9.5357 -> 9.5) and Fisherman's Village (9.5573 -> 9.6) are only
    // 2.4 km apart but land either side of a grid line. That is inherent to
    // grid snapping and is harmless: both still get a valid reading for their
    // own cell. Asserted so nobody "fixes" it into a finer grid that would
    // fabricate resolution the model does not have.
    assert.notEqual(gridKey(9.5357, 100.0617), gridKey(9.5573, 100.0596));
  });

  test('the whole island collapses to a handful of cells', () => {
    const cells = new Set(SEED_PLACES.map((p) => gridKey(p.lat, p.lng)));
    assert.ok(cells.size <= 4, `expected <= 4 model cells, got ${cells.size}`);
  });
});

describe('ground cross-check', () => {
  test('an agreeing ground station leaves the reading live', () => {
    const out = reconcile(reading({ aqi: 38 }), 40);
    assert.equal(out.provenance, 'live');
  });

  test('a wildly disagreeing station downgrades the reading to estimated', () => {
    const out = reconcile(reading({ aqi: 38 }), 38 + CROSS_CHECK_TOLERANCE + 1);
    assert.equal(out.provenance, 'estimated');
    assert.match(out.source, /diverges/);
  });

  test('no ground reading is not treated as disagreement', () => {
    assert.equal(reconcile(reading(), null).provenance, 'live');
  });

  test('the nearest official station is on the mainland, far from the island', () => {
    // Documents WHY the model is primary: Thailand has no Samui station.
    assert.ok(NEAREST_GROUND_STATION.approxDistanceKm > 50);
    assert.equal(NEAREST_GROUND_STATION.id, '42t');
  });
});

describe('getAir never throws', () => {
  test('falls back to the seeded baseline when every source fails', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (() => Promise.reject(new Error('offline'))) as typeof fetch;
    try {
      const out = await getAir(db, 9.5357, 100.0617, 42);
      assert.equal(out.aqi, 42, 'used the fallback');
      assert.equal(out.provenance, 'stale', 'and said so');
    } finally {
      globalThis.fetch = original;
    }
  });

  test('a cached reading beats a failing upstream', async () => {
    db.prepare('INSERT INTO air_cache (grid_key, aqi, pm25, fetched_at) VALUES (?,?,?,?)').run(
      gridKey(9.5357, 100.0617), 33, 6.0, new Date().toISOString());

    const original = globalThis.fetch;
    globalThis.fetch = (() => Promise.reject(new Error('offline'))) as typeof fetch;
    try {
      const out = await getAir(db, 9.5357, 100.0617, 42);
      assert.equal(out.aqi, 33, 'served the cache, not the baseline');
    } finally {
      globalThis.fetch = original;
    }
  });

  test('an expired cache entry is still served, but marked stale', async () => {
    const old = new Date(Date.now() - 4 * 3600_000).toISOString();
    db.prepare('INSERT INTO air_cache (grid_key, aqi, pm25, fetched_at) VALUES (?,?,?,?)').run(
      gridKey(9.5357, 100.0617), 33, 6.0, old);

    const original = globalThis.fetch;
    globalThis.fetch = (() => Promise.reject(new Error('offline'))) as typeof fetch;
    try {
      const out = await getAir(db, 9.5357, 100.0617, 42);
      assert.equal(out.aqi, 33);
      assert.equal(out.provenance, 'stale');
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe('upstream timestamps become real instants', () => {
  test('a Bangkok-local reading is converted, not passed through', () => {
    // Open-Meteo answers a timezone=Asia/Bangkok request in LOCAL time with no
    // offset and no seconds. Passing it through as ISO-8601 put every air
    // reading seven hours out, and observedAt is what the staleness weighting
    // reads - a fresh reading presenting as half a day old, or the reverse.
    assert.equal(toInstant('2026-08-31T19:00'), '2026-08-31T12:00:00.000Z');
  });

  test('an instant that is already one is left alone', () => {
    assert.equal(toInstant('2026-08-31T12:00:00.000Z'), '2026-08-31T12:00:00.000Z');
    assert.equal(toInstant('2026-08-31T19:00+07:00'), '2026-08-31T12:00:00.000Z');
  });

  test('every output is a full ISO instant', () => {
    // A single malformed value throws away an entire response in a strict
    // decoder, and Swift decodes dates strictly.
    for (const input of ['2026-08-31T19:00', '2026-08-31T00:00', undefined, 'nonsense']) {
      assert.match(toInstant(input), /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/, String(input));
    }
  });

  test('nonsense falls back to now rather than propagating', () => {
    const before = Date.now();
    const out = new Date(toInstant('not a date')).getTime();
    assert.ok(out >= before - 1000 && out <= Date.now() + 1000);
  });
});
