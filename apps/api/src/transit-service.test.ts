import { strict as assert } from 'node:assert';
import { test, describe, beforeEach } from 'node:test';

import { SAME_VEHICLE_MIN, SEED_TRANSIT } from '@chivago/core';
import { openTestDb, type DB } from './db.ts';
import { reportSighting, routesForArea, sightingsToday } from './transit-service.ts';

/**
 * The bus, measured rather than scheduled.
 *
 * Nobody publishes a timetable for the services reaching either campus, so
 * the app asks riders and reports what they said. Two things must hold or the
 * signal is worthless: only real routes and real stops may be reported, and
 * a crowd at one bus must not read as a bus every few seconds.
 */
let db: DB;
const ROUTE = 'smartbus-538';
const STOP = 'rmutt-gate3';

const addUser = (id: string): void => {
  db.prepare('INSERT INTO users (id, display_name, locale, created_at) VALUES (?,?,?,?)')
    .run(id, id, 'en', new Date().toISOString());
};

beforeEach(() => {
  db = openTestDb();
  addUser('rider-a');
  addUser('rider-b');
});

describe('which routes serve which area', () => {
  test('the campus has the route whose terminus it is', () => {
    const routes = routesForArea(db, 'rmutt');
    assert.equal(routes.length, 1);
    assert.equal(routes[0]!.id, ROUTE);
    assert.equal(routes[0]!.operator, 'smart bus');
    assert.equal(routes[0]!.stops.length, 4, 'all four campus-edge stops');
  });

  test('the island has none, and says none rather than borrowing the campus one', () => {
    assert.deepEqual(routesForArea(db, 'samui'), []);
    assert.deepEqual(routesForArea(db, 'ku-sriracha'), []);
  });

  test('a route arrives with what riders said, not with a timetable', () => {
    const [route] = routesForArea(db, 'rmutt');
    assert.equal(route!.schedule, 'unpublished');
    assert.deepEqual(route!.headway, { lastSeenMinAgo: null, typicalGapMin: null, reports: 0, vehicles: 0 });
  });

  test('every stop returned for an area is really in it', () => {
    // The guard against route 538's Bangkok end leaking into a campus list.
    const seeded = SEED_TRANSIT.find((r) => r.id === ROUTE)!;
    const shown = routesForArea(db, 'rmutt')[0]!.stops.map((s) => s.id);
    assert.deepEqual(shown.sort(), seeded.stops.map((s) => s.id).sort());
  });
});

describe('a rider reports one', () => {
  test('it is recorded, and the answer already carries the new headway', () => {
    const out = reportSighting(db, { userId: 'rider-a', routeId: ROUTE, stopId: STOP });
    assert.equal(out.recorded, true);
    assert.equal(out.because, null);
    assert.equal(out.headway.reports, 1);
    assert.equal(out.headway.lastSeenMinAgo, 0);
    assert.equal(sightingsToday(db, ROUTE).length, 1);
  });

  test('a route nobody runs is refused, so the median measures something real', () => {
    const out = reportSighting(db, { userId: 'rider-a', routeId: 'made-up-line', stopId: STOP });
    assert.equal(out.recorded, false);
    assert.equal(out.because, 'unknown-route');
    assert.equal(sightingsToday(db, 'made-up-line').length, 0);
  });

  test('a stop that is not on that route is refused too', () => {
    const out = reportSighting(db, { userId: 'rider-a', routeId: ROUTE, stopId: 'chaweng' });
    assert.equal(out.recorded, false);
    assert.equal(out.because, 'unknown-stop');
    assert.equal(sightingsToday(db, ROUTE).length, 0);
  });

  test('the same rider pressing twice is a double-tap, not a second bus', () => {
    const now = new Date('2026-09-15T10:00:00+07:00');
    reportSighting(db, { userId: 'rider-a', routeId: ROUTE, stopId: STOP, now });
    const again = reportSighting(db, {
      userId: 'rider-a', routeId: ROUTE, stopId: STOP,
      now: new Date(now.getTime() + 30_000),
    });
    assert.equal(again.recorded, false);
    assert.equal(again.because, 'already-reported');
    assert.equal(sightingsToday(db, ROUTE, now).length, 1);
  });

  test('the same rider an hour later is a second bus, and is kept', () => {
    const now = new Date('2026-09-15T10:00:00+07:00');
    const later = new Date(now.getTime() + 60 * 60_000);
    reportSighting(db, { userId: 'rider-a', routeId: ROUTE, stopId: STOP, now });
    const out = reportSighting(db, { userId: 'rider-a', routeId: ROUTE, stopId: STOP, now: later });
    assert.equal(out.recorded, true);
    assert.equal(out.headway.reports, 2);
    assert.equal(out.headway.vehicles, 2);
  });

  test('two riders at one bus are both kept, and still count as one bus', () => {
    // Both reports are facts and neither is discarded; the arithmetic that
    // knows they saw one vehicle lives in core, not in a rule that throws
    // somebody's report away.
    const now = new Date('2026-09-15T10:00:00+07:00');
    reportSighting(db, { userId: 'rider-a', routeId: ROUTE, stopId: STOP, now });
    const out = reportSighting(db, {
      userId: 'rider-b', routeId: ROUTE, stopId: STOP,
      now: new Date(now.getTime() + 20_000),
    });
    assert.equal(out.recorded, true);
    assert.equal(out.headway.reports, 2);
    assert.equal(out.headway.vehicles, 1);
    assert.equal(out.headway.typicalGapMin, null);
    assert.ok(SAME_VEHICLE_MIN >= 1);
  });
});

describe('a sighting belongs to the person who made it', () => {
  test('deleting the account takes the reports with it', () => {
    // `DELETE /profile` is one delete on `users` and leans entirely on the
    // foreign keys. A table without ON DELETE CASCADE leaves rows behind
    // after the account is gone, which is a PDPA defect that looks like
    // nothing at all until somebody audits it.
    reportSighting(db, { userId: 'rider-a', routeId: ROUTE, stopId: STOP });
    assert.equal(sightingsToday(db, ROUTE).length, 1);
    db.prepare('DELETE FROM users WHERE id = ?').run('rider-a');
    assert.equal(sightingsToday(db, ROUTE).length, 0, 'a deleted account left its reports behind');
  });
});
