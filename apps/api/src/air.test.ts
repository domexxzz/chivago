import { strict as assert } from 'node:assert';
import { X509Certificate } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { rootCertificates } from 'node:tls';
import { test, describe, beforeEach } from 'node:test';

import { openTestDb, type DB } from './db.ts';
import {
  AIR_RESOLUTION_KM, CROSS_CHECK_TOLERANCE, STATION_MISS_TTL_MS, getAir, gridKey,
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
    const cells = new Set(SEED_PLACES.filter((p) => p.province === 'TH-84').map((p) => gridKey(p.lat, p.lng)));
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

describe('a ground station within reach', () => {
  // The Si Racha campus has station o61 300 m away (docs/43). Measured
  // beats modelled, and says so; a station that does not answer falls back
  // to the model, labelled as the model.
  const station = { id: 'o61', name: 'Laem Chabang Municipal Stadium (PCD o61)', lat: 13.11923, lng: 100.91855, distanceKm: 0.3 };
  const model = (): AirReading => reading({ aqi: 61, source: 'Open-Meteo · Copernicus CAMS' });

  test('the station is the reading, and the source says it was measured', async () => {
    let asked = 0;
    const out = await getAir(db, 13.12197, 100.91925, 22, {
      fetchLive: async () => model(),
      fetchGround: async () => null,
      fetchStation: async (id) => { asked += 1; assert.equal(id, 'o61'); return { aqi: 22, pm25: 13.4, observedAt: '2026-09-05T15:00:00.000Z' }; },
    }, station);
    assert.equal(out.aqi, 22);
    assert.equal(out.pm25, 13.4);
    assert.equal(out.provenance, 'live');
    assert.match(out.source, /Air4Thai/);
    assert.match(out.source, /ground station/);
    assert.match(out.source, /0\.3 km/);
    assert.equal(asked, 1);
    const kept = db.prepare('SELECT aqi FROM air_history WHERE grid_key = ?').all(gridKey(13.12197, 100.91925)) as unknown as { aqi: number }[];
    assert.deepEqual(kept.map((r) => r.aqi), [22], 'the measured hour is in the place history');
  });

  test('one feed, however many places on the campus', async () => {
    let asked = 0;
    const sources = {
      fetchLive: async () => model(),
      fetchGround: async () => null,
      fetchStation: async () => { asked += 1; return { aqi: 22, pm25: 13.4, observedAt: '2026-09-05T15:00:00.000Z' }; },
    };
    await getAir(db, 13.12197, 100.91925, 22, sources, station);
    const second = await getAir(db, 13.11800, 100.92075, 22, sources, station);
    assert.equal(asked, 1, 'the whole-country feed is one request per TTL');
    assert.match(second.source, /cached/);
  });

  test('a station that does not answer leaves the model, labelled as the model', async () => {
    const out = await getAir(db, 13.12197, 100.91925, 22, {
      fetchLive: async () => model(),
      fetchGround: async () => null,
      fetchStation: async () => null,
    }, station);
    assert.equal(out.aqi, 61);
    assert.match(out.source, /Open-Meteo/);
    assert.doesNotMatch(out.source, /ground station/);
  });

  test('the island asks no station at all', async () => {
    let asked = 0;
    await getAir(db, 9.5357, 100.0617, 42, {
      fetchLive: async () => model(),
      fetchGround: async () => null,
      fetchStation: async () => { asked += 1; return null; },
    }, null);
    assert.equal(asked, 0);
  });
});

describe('a station miss is short-lived', () => {
  const station = { id: 'o61', name: 'Laem Chabang Municipal Stadium (PCD o61)', lat: 13.11923, lng: 100.91855, distanceKm: 0.3 };
  const model = (): AirReading => reading({ aqi: 61, source: 'Open-Meteo · Copernicus CAMS' });

  test('a miss older than its TTL is asked again, a fresh one is not', async () => {
    let asked = 0;
    const sources = {
      fetchLive: async () => model(),
      fetchGround: async () => null,
      fetchStation: async () => { asked += 1; return asked === 1 ? null : { aqi: 22, pm25: 13.4, observedAt: '2026-09-05T15:00:00.000Z' }; },
    };
    assert.match((await getAir(db, 13.12197, 100.91925, 22, sources, station)).source, /Open-Meteo/);
    assert.match((await getAir(db, 13.12197, 100.91925, 22, sources, station)).source, /Open-Meteo/, 'a fresh miss is believed');
    assert.equal(asked, 1);
    // Age the miss past its TTL, and the station is asked again.
    db.prepare("UPDATE air_cache SET fetched_at = ? WHERE grid_key = 'station:o61'")
      .run(new Date(Date.now() - STATION_MISS_TTL_MS - 1000).toISOString());
    const out = await getAir(db, 13.12197, 100.91925, 22, sources, station);
    assert.equal(asked, 2);
    assert.match(out.source, /ground station/);
  });
});

describe('the Air4Thai chain, bundled', () => {
  // The feed's server forgets its own intermediates (air.ts). The two links
  // bundled here have to be the right ones, and the trust has to end at a
  // root Node already ships - checked without touching the network.
  test('the intermediate is signed by the cross-signed root, and that by ISRG Root X1', () => {
    const yr1 = new X509Certificate(readFileSync(new URL('../certs/lets-encrypt-yr1.pem', import.meta.url)));
    const rootYr = new X509Certificate(readFileSync(new URL('../certs/isrg-root-yr-by-x1.pem', import.meta.url)));
    assert.match(yr1.subject, /CN=YR1/);
    assert.equal(yr1.issuer, rootYr.subject, 'YR1 must be signed by Root YR');
    assert.ok(yr1.checkIssued(rootYr), 'YR1 is not actually issued by the bundled Root YR');
    assert.match(rootYr.issuer, /ISRG Root X1/, 'the cross-sign must come from ISRG Root X1');
    const x1 = rootCertificates.map((pem) => new X509Certificate(pem)).find((c) => /ISRG Root X1/.test(c.subject));
    assert.ok(x1, 'Node no longer ships ISRG Root X1');
    assert.ok(rootYr.checkIssued(x1!), 'the cross-signed root is not issued by the X1 Node ships');
    assert.ok(new Date(yr1.validTo) > new Date(), 'the bundled intermediate has expired');
  });
});
