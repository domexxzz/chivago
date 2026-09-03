import { strict as assert } from 'node:assert';
import { test, describe, beforeEach } from 'node:test';

import { SELF_VISITS_PER_YEAR } from '@chivago/core';
import { openTestDb, type DB } from './db.ts';
import { getBalances } from './wallet-service.ts';
import { hasVisited } from './place-review-service.ts';
import { visitedProvincesFor } from './wellness-service.ts';
import {
  SelfVisitQuotaReached, exploredFor, recordSelfVisit, selfReportedProvincesFor, selfVisitsFor,
} from './visit-service.ts';

/**
 * Recorded, not scored.
 *
 * What these prove is the boundary: a self-issued stamp reaches the passport
 * and nothing else. If one of these ever fails in the direction of "it paid",
 * self-reported presence has leaked into the currency an auditor is asked to
 * trust, and that is the whole design gone.
 */

let db: DB;
const USER = 'u1';
const PLACE = 'chaweng';

function addPlace(id: string, province: string | null = 'TH-84'): void {
  db.prepare(
    `INSERT INTO places (id, name_en, name_th, short, layer, province, lat, lng, meta,
       blurb_en, blurb_th, tags, safety_label_en, safety_label_th,
       crowd_density, aqi, safety_index, walkability)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(id, id, id, id, 'Green', province, 9.5, 100.0, 'Beach', 'x', 'x', '[]',
        'Patrolled', 'มีสายตรวจ', 2.4, 42, 7.2, 8.1);
}

beforeEach(() => {
  db = openTestDb();
  db.prepare('INSERT INTO users (id, display_name, created_at) VALUES (?,?,?)')
    .run(USER, 'John', new Date().toISOString());
  addPlace(PLACE);
});

describe('a stamp on the traveller\'s word', () => {
  test('is recorded, and the passport sees it as self-reported, not as visited', () => {
    const r = recordSelfVisit(db, { userId: USER, placeId: PLACE })!;
    assert.equal(r.recorded, true);
    assert.equal(r.remainingThisYear, SELF_VISITS_PER_YEAR - 1);

    assert.deepEqual(selfReportedProvincesFor(db, USER), ['TH-84']);
    assert.deepEqual(visitedProvincesFor(db, USER), [], 'a self-issued stamp must never read as a geofenced one');
  });

  test('pays nothing and writes no ledger row', () => {
    recordSelfVisit(db, { userId: USER, placeId: PLACE });
    assert.equal(getBalances(db, USER).trip, 0);
    assert.equal(getBalances(db, USER).green, 0);
    const n = db.prepare('SELECT COUNT(*) AS n FROM ledger WHERE user_id = ?').get(USER) as { n: number };
    assert.equal(n.n, 0, 'self-reported presence reached the ledger');
  });

  test('does not unlock a review', () => {
    // The review gate reads the ledger, and this never wrote to it. Standing
    // at a place is the precondition for an opinion about it; saying you
    // stood there is not.
    recordSelfVisit(db, { userId: USER, placeId: PLACE });
    assert.equal(hasVisited(db, USER, PLACE), false);
  });

  test('the same place twice is a duplicate, not a second stamp', () => {
    recordSelfVisit(db, { userId: USER, placeId: PLACE });
    const again = recordSelfVisit(db, { userId: USER, placeId: PLACE })!;
    assert.equal(again.recorded, false);
    assert.equal(again.remainingThisYear, SELF_VISITS_PER_YEAR - 1, 'a duplicate must not cost quota');
    assert.deepEqual(selfVisitsFor(db, USER).places, [PLACE]);
  });

  test('a place that does not exist gets nothing, not a stamp for nowhere', () => {
    assert.equal(recordSelfVisit(db, { userId: USER, placeId: 'atlantis' }), null);
  });
});

describe('the quota', () => {
  test('runs out after the year\'s allowance, and comes back with the island\'s new year', () => {
    const in2026 = new Date('2026-06-01T05:00:00Z');
    for (let i = 0; i < SELF_VISITS_PER_YEAR; i += 1) {
      addPlace(`p${i}`);
      assert.equal(recordSelfVisit(db, { userId: USER, placeId: `p${i}`, now: in2026 })!.recorded, true);
    }
    assert.equal(selfVisitsFor(db, USER, in2026).remainingThisYear, 0);

    addPlace('one-too-many');
    assert.throws(
      () => recordSelfVisit(db, { userId: USER, placeId: 'one-too-many', now: in2026 }),
      SelfVisitQuotaReached,
    );

    // 23:30 UTC on New Year's Eve is already New Year's morning on the island.
    const islandNewYear = new Date('2026-12-31T23:30:00Z');
    assert.equal(selfVisitsFor(db, USER, islandNewYear).remainingThisYear, SELF_VISITS_PER_YEAR);
    assert.equal(recordSelfVisit(db, { userId: USER, placeId: 'one-too-many', now: islandNewYear })!.recorded, true);
  });

  test('is per traveller: somebody else\'s stamps do not use mine', () => {
    db.prepare('INSERT INTO users (id, display_name, created_at) VALUES (?,?,?)')
      .run('u2', 'Ana', new Date().toISOString());
    recordSelfVisit(db, { userId: 'u2', placeId: PLACE });
    assert.equal(selfVisitsFor(db, USER).remainingThisYear, SELF_VISITS_PER_YEAR);
  });
});

describe('where the traveller has been, for the map', () => {
  const checkinRow = (placeId: string, day: string, at: string) =>
    db.prepare(
      `INSERT INTO ledger (id, user_id, label, occurred_at, host, amount, kind, currency, exp, source_ref)
       VALUES (?, ?, 'Check-in', ?, 'island', 10, 'checkin', 'trip', 0, ?)`,
    ).run(`l-${placeId}-${day}`, USER, at, `checkin:${placeId}:user:${USER}:${day}`);

  test('nothing explored is an empty list, not an error', () => {
    assert.deepEqual(exploredFor(db, USER), { places: [] });
  });

  test('a check-in explores its place, dated to the first one, however many times they came back', () => {
    addPlace('lamai');
    checkinRow(PLACE, '2026-09-02', '2026-09-02T03:00:00.000Z');
    checkinRow(PLACE, '2026-09-01', '2026-09-01T03:00:00.000Z');
    checkinRow('lamai', '2026-09-03', '2026-09-03T03:00:00.000Z');
    assert.deepEqual(exploredFor(db, USER), { places: [
      { placeId: PLACE, firstAt: '2026-09-01T03:00:00.000Z', how: 'checkin' },
      { placeId: 'lamai', firstAt: '2026-09-03T03:00:00.000Z', how: 'checkin' },
    ] });
  });

  test('a self-issued stamp explores too, and says so; a check-in at the same place wins', () => {
    addPlace('lamai');
    recordSelfVisit(db, { userId: USER, placeId: 'lamai', now: new Date('2026-08-30T02:00:00Z') });
    recordSelfVisit(db, { userId: USER, placeId: PLACE, now: new Date('2026-08-31T02:00:00Z') });
    checkinRow(PLACE, '2026-09-01', '2026-09-01T03:00:00.000Z');
    const { places } = exploredFor(db, USER);
    assert.deepEqual(places.map((p) => [p.placeId, p.how]), [['lamai', 'self'], [PLACE, 'checkin']]);
  });

  test("another traveller's visits are not this one's map", () => {
    db.prepare('INSERT INTO users (id, display_name, created_at) VALUES (?,?,?)')
      .run('u2', 'Ann', new Date().toISOString());
    db.prepare(
      `INSERT INTO ledger (id, user_id, label, occurred_at, host, amount, kind, currency, exp, source_ref)
       VALUES ('l-x', 'u2', 'Check-in', '2026-09-01T03:00:00.000Z', 'island', 10, 'checkin', 'trip', 0, ?)`,
    ).run(`checkin:${PLACE}:user:u2:2026-09-01`);
    assert.deepEqual(exploredFor(db, USER).places, []);
  });
});
