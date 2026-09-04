import { strict as assert } from 'node:assert';
import { test, describe, beforeEach } from 'node:test';

import { openTestDb, type DB } from './db.ts';
import { airHistoryFor, checkinsLastHour } from './crowd-service.ts';
import { gridKey } from './air.ts';

/**
 * The island counting itself: two figures read from records that already
 * existed, held to counting only what was recorded.
 */

let db: DB;
const NOW = new Date('2026-09-05T05:00:00.000Z');

function user(id: string): void {
  db.prepare('INSERT INTO users (id, display_name, created_at) VALUES (?,?,?)').run(id, id, NOW.toISOString());
}
function checkin(userId: string, placeId: string, at: Date): void {
  db.prepare(
    `INSERT INTO ledger (id, user_id, label, occurred_at, host, amount, kind, currency, exp, source_ref)
     VALUES (?, ?, 'Check-in', ?, 'island', 10, 'checkin', 'trip', 0, ?)`,
  ).run(`l-${userId}-${placeId}-${at.getTime()}`, userId, at.toISOString(), `checkin:${placeId}:user:${userId}:${at.toISOString().slice(0, 10)}`);
}

beforeEach(() => {
  db = openTestDb();
  user('a'); user('b'); user('c');
});

describe('who is there now', () => {
  test('counts distinct travellers inside the hour, per place, and zero where nobody is', () => {
    checkin('a', 'chaweng', new Date(NOW.getTime() - 10 * 60_000));
    checkin('b', 'chaweng', new Date(NOW.getTime() - 50 * 60_000));
    checkin('c', 'lamai', new Date(NOW.getTime() - 5 * 60_000));
    const counts = checkinsLastHour(db, ['chaweng', 'lamai', 'namuang'], NOW);
    assert.equal(counts.get('chaweng')!.checkinsLastHour, 2);
    assert.equal(counts.get('lamai')!.checkinsLastHour, 1);
    assert.equal(counts.get('namuang')!.checkinsLastHour, 0, 'a place nobody counted at is zero, and present');
    assert.equal(counts.get('chaweng')!.windowMinutes, 60);
  });

  test('an hour and a minute ago is not now', () => {
    checkin('a', 'chaweng', new Date(NOW.getTime() - 61 * 60_000));
    assert.equal(checkinsLastHour(db, ['chaweng'], NOW).get('chaweng')!.checkinsLastHour, 0);
  });

  test('a check-in from the future is not counted either', () => {
    // The demo reset once wrote check-ins two hours ahead of the clock.
    checkin('a', 'chaweng', new Date(NOW.getTime() + 60_000));
    assert.equal(checkinsLastHour(db, ['chaweng'], NOW).get('chaweng')!.checkinsLastHour, 0);
  });
});

describe('what the air has been', () => {
  const key = gridKey(9.53, 100.06);
  const sample = (at: string, aqi: number) =>
    db.prepare('INSERT OR IGNORE INTO air_history (grid_key, observed_at, aqi, pm25, fetched_at) VALUES (?, ?, ?, NULL, ?)')
      .run(key, at, aqi, at);

  test('nothing recorded is an empty history with no start, not thirty days of zeros', () => {
    const h = airHistoryFor(db, 9.53, 100.06, NOW);
    assert.equal(h.since, null);
    assert.deepEqual(h.days, []);
  });

  test('samples group by the island day, with min, max, mean and count', () => {
    // 23:30 UTC on the 3rd is 06:30 on the 4th in Bangkok.
    sample('2026-09-03T23:30:00.000Z', 40);
    sample('2026-09-04T02:00:00.000Z', 60);
    sample('2026-09-04T09:00:00.000Z', 50);
    sample('2026-09-05T01:00:00.000Z', 30);
    const h = airHistoryFor(db, 9.53, 100.06, NOW);
    assert.equal(h.since, '2026-09-03T23:30:00.000Z');
    assert.deepEqual(h.days, [
      { day: '2026-09-04', min: 40, max: 60, avg: 50, samples: 3 },
      { day: '2026-09-05', min: 30, max: 30, avg: 30, samples: 1 },
    ]);
  });

  test('the same observation hour written twice is one sample', () => {
    sample('2026-09-05T01:00:00.000Z', 30);
    sample('2026-09-05T01:00:00.000Z', 99);
    const h = airHistoryFor(db, 9.53, 100.06, NOW);
    assert.equal(h.days[0]!.samples, 1);
    assert.equal(h.days[0]!.avg, 30, 'the first record stands');
  });

  test('only the last thirty days are returned; the start date still reaches further back', () => {
    sample('2026-07-01T01:00:00.000Z', 80);
    sample('2026-09-05T01:00:00.000Z', 30);
    const h = airHistoryFor(db, 9.53, 100.06, NOW);
    assert.equal(h.days.length, 1);
    assert.equal(h.since, '2026-07-01T01:00:00.000Z');
  });
});
