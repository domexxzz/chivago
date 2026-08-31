import { strict as assert } from 'node:assert';
import { test, describe, beforeEach } from 'node:test';

import { openTestDb, type DB } from './db.ts';
import { activeAlert, fireAlert } from './sos-service.ts';
import {
  hasGoneQuiet, isUsable, recordPositions, SILENCE_WARNING_SECONDS,
  summarise, trail, USABLE_ACCURACY_M, type PositionFix,
} from './position-service.ts';

let db: DB;
let alertId: string;
let firedAt: number;

const CHAWENG = { lat: 9.5357, lng: 100.0617 };

/**
 * Seconds AFTER the alert fired.
 *
 * Forward, not backward: firing already stamps a position, and the service
 * deliberately refuses to move the pin to a fix older than the one it holds.
 * A test that timestamps its fixtures before the alert existed is testing the
 * guard, not the recording.
 */
const at = (secondsAfter: number) => new Date(firedAt + secondsAfter * 1000).toISOString();

beforeEach(() => {
  db = openTestDb();
  db.prepare('INSERT INTO users (id, display_name, created_at) VALUES (?,?,?)').run(
    'u1', 'John', new Date().toISOString());
  const alert = fireAlert(db, { userId: 'u1', ...CHAWENG, locationLabel: 'Chaweng' });
  alertId = alert.id;
  firedAt = new Date(alert.firedAt).getTime();
});

const fix = (over: Partial<PositionFix> = {}): PositionFix => ({
  ...CHAWENG, recordedAt: at(0), ...over,
});

describe('recording', () => {
  test('a single fix lands on the trail and moves the alert', () => {
    const r = recordPositions(db, alertId, [fix({ lat: 9.5400, recordedAt: at(300) })]);
    assert.equal(r.recorded, 1);
    assert.equal(trail(db, alertId).length, 1);
    assert.equal(activeAlert(db, 'u1')!.lat, 9.5400);
  });

  test('a batch is accepted — a phone flushing an offline queue', () => {
    const r = recordPositions(db, alertId, [
      fix({ lat: 9.5360, recordedAt: at(60), source: 'queued' }),
      fix({ lat: 9.5370, recordedAt: at(120), source: 'queued' }),
      fix({ lat: 9.5380, recordedAt: at(180), source: 'queued' }),
    ]);
    assert.equal(r.recorded, 3);
    assert.equal(trail(db, alertId).length, 3);
  });

  test('a re-sent queue is harmless', () => {
    // A device that flushes, loses the response, and flushes again.
    const batch = [
      fix({ lat: 9.5360, recordedAt: at(60) }),
      fix({ lat: 9.5370, recordedAt: at(120) }),
    ];
    recordPositions(db, alertId, batch);
    const second = recordPositions(db, alertId, batch);
    assert.equal(second.recorded, 0);
    assert.equal(second.duplicates, 2);
    assert.equal(trail(db, alertId).length, 2);
  });

  test('the trail reads oldest-first whatever order it arrived in', () => {
    recordPositions(db, alertId, [
      fix({ lat: 9.5380, recordedAt: at(240) }),
      fix({ lat: 9.5360, recordedAt: at(60) }),
      fix({ lat: 9.5370, recordedAt: at(120) }),
    ]);
    const lats = trail(db, alertId).map((p) => p.lat);
    assert.deepEqual(lats, [9.5360, 9.5370, 9.5380]);
  });

  test('an empty batch is a no-op, not an error', () => {
    const r = recordPositions(db, alertId, []);
    assert.equal(r.recorded, 0);
    assert.equal(r.latest, null);
  });

  test('the source is preserved so a late point is not read as current', () => {
    recordPositions(db, alertId, [fix({ recordedAt: at(60), source: 'queued' })]);
    assert.equal(trail(db, alertId)[0]!.source, 'queued');
  });
});

describe('a bad fix must not move the pin', () => {
  test('a 2 km fix is stored but does not become the displayed position', () => {
    // At 2 km accuracy the "position" is a neighbourhood. Drawing it as a point
    // invites a searcher to trust it.
    recordPositions(db, alertId, [fix({ lat: 9.5400, recordedAt: at(60), accuracyM: 12 })]);
    recordPositions(db, alertId, [fix({ lat: 9.4000, recordedAt: at(120), accuracyM: 2000 })]);

    assert.equal(activeAlert(db, 'u1')!.lat, 9.5400, 'the accurate fix must still be the pin');
    assert.equal(trail(db, alertId).length, 2, 'but nothing is silently discarded');
  });

  test('the usability threshold is explicit', () => {
    assert.equal(isUsable({ accuracyM: USABLE_ACCURACY_M }), true);
    assert.equal(isUsable({ accuracyM: USABLE_ACCURACY_M + 1 }), false);
    assert.equal(isUsable({ accuracyM: null }), true, 'unknown accuracy is not disqualifying');
    assert.equal(isUsable({}), true);
  });

  test('a late queued point does not drag the pin backwards in time', () => {
    // The classic bug: a twenty-minute-old fix arrives after a fresh one and
    // teleports the searcher to where the person used to be.
    recordPositions(db, alertId, [fix({ lat: 9.5400, recordedAt: at(300) })]);
    recordPositions(db, alertId, [fix({ lat: 9.5300, recordedAt: at(60), source: 'queued' })]);

    const alert = activeAlert(db, 'u1')!;
    assert.equal(alert.lat, 9.5400, 'the newer fix must win');
    assert.equal(trail(db, alertId).length, 2, 'the old one still joins the trail');
  });
});

describe('the trail tells a searcher which way they went', () => {
  test('per-leg distance is computed', () => {
    recordPositions(db, alertId, [
      fix({ lat: 9.5357, recordedAt: at(60) }),
      // ~110 m north.
      fix({ lat: 9.5367, recordedAt: at(120) }),
      fix({ lat: 9.5377, recordedAt: at(180) }),
    ]);
    const points = trail(db, alertId);
    assert.equal(points[0]!.movedM, null, 'the first point has no previous');
    assert.ok(points[1]!.movedM! > 90 && points[1]!.movedM! < 130, `got ${points[1]!.movedM}`);
  });

  test('summary separates distance travelled from net displacement', () => {
    // Someone who walked out and came back has travelled far and moved nowhere.
    // A searcher needs both numbers.
    recordPositions(db, alertId, [
      fix({ lat: 9.5357, recordedAt: at(60) }),
      fix({ lat: 9.5397, recordedAt: at(120) }),
      fix({ lat: 9.5357, recordedAt: at(180) }),
    ]);
    const s = summarise(db, alertId);
    assert.ok(s.travelledM > 800, `travelled ${s.travelledM}`);
    assert.ok(s.netDisplacementM < 50, `displaced ${s.netDisplacementM}`);
    assert.equal(s.movingAwayFromStart, false);
  });

  test('a steady walk registers as moving away', () => {
    recordPositions(db, alertId, [
      fix({ lat: 9.5357, recordedAt: at(60) }),
      fix({ lat: 9.5397, recordedAt: at(180) }),
    ]);
    const s = summarise(db, alertId);
    assert.equal(s.movingAwayFromStart, true);
    assert.ok(s.netDisplacementM > 400);
  });

  test('GPS jitter while standing still is not "moving"', () => {
    // ~10 m of wobble. Reporting that as movement sends a searcher chasing noise.
    recordPositions(db, alertId, [
      fix({ lat: 9.53570, recordedAt: at(60) }),
      fix({ lat: 9.53578, recordedAt: at(120) }),
      fix({ lat: 9.53565, recordedAt: at(180) }),
    ]);
    assert.equal(summarise(db, alertId).movingAwayFromStart, false);
  });

  test('an empty trail summarises without crashing', () => {
    const s = summarise(db, alertId);
    assert.equal(s.points, 0);
    assert.equal(s.silentForSeconds, null);
    assert.equal(s.lastSource, null);
  });
});

describe('going quiet is reported, not hidden', () => {
  test('a fresh trail is not quiet', () => {
    recordPositions(db, alertId, [fix({ recordedAt: new Date().toISOString() })]);
    const s = summarise(db, alertId);
    assert.ok(s.silentForSeconds! < 10);
    assert.equal(hasGoneQuiet(s), false);
  });

  test('a stale trail IS flagged — a dead battery must not look like a live pin', () => {
    // The most dangerous failure on the desk: a confident dot for a phone that
    // stopped transmitting ten minutes ago.
    recordPositions(db, alertId, [
      fix({ recordedAt: new Date(Date.now() - (SILENCE_WARNING_SECONDS + 120) * 1000).toISOString() }),
    ]);
    const s = summarise(db, alertId);
    assert.ok(s.silentForSeconds! > SILENCE_WARNING_SECONDS);
    assert.equal(hasGoneQuiet(s), true);
  });

  test('no trail at all is not "quiet" — there is nothing to be quiet about', () => {
    assert.equal(hasGoneQuiet(summarise(db, alertId)), false);
  });

  test('the last source is reported so background sparseness is explicable', () => {
    recordPositions(db, alertId, [
      fix({ recordedAt: at(60), source: 'foreground' }),
      fix({ recordedAt: at(120), source: 'background' }),
    ]);
    assert.equal(summarise(db, alertId).lastSource, 'background');
  });
});

describe('the trail belongs to the alert', () => {
  test('cancelling the user removes their positions', () => {
    recordPositions(db, alertId, [fix({ recordedAt: at(60) })]);
    db.prepare('DELETE FROM users WHERE id = ?').run('u1');
    const n = db.prepare('SELECT COUNT(*) n FROM sos_positions').get() as unknown as { n: number };
    assert.equal(n.n, 0, 'PDPA erasure must take the movement history too');
  });
});

describe('a bad fix must not pollute the movement maths', () => {
  test('an inaccurate fix is kept in the trail but excluded from distance', () => {
    // Found on the live desk: a rejected 2 km-accuracy fix 19 km away turned a
    // 400 m walk into "20139 m travelled", which would send a searcher to the
    // wrong side of the island.
    recordPositions(db, alertId, [
      fix({ lat: 9.5357, recordedAt: at(60), accuracyM: 10 }),
      fix({ lat: 9.5367, recordedAt: at(120), accuracyM: 10 }),
      fix({ lat: 9.4100, lng: 99.9400, recordedAt: at(150), accuracyM: 2000 }),
      fix({ lat: 9.5377, recordedAt: at(180), accuracyM: 10 }),
    ]);

    const points = trail(db, alertId);
    assert.equal(points.length, 4, 'nothing is discarded');
    assert.equal(points[2]!.movedM, null, 'the bad fix contributes no leg');

    const s = summarise(db, alertId);
    assert.ok(s.travelledM < 500, `travelled read ${s.travelledM} m`);
    assert.ok(s.netDisplacementM < 500, `displacement read ${s.netDisplacementM} m`);
  });

  test('a trail of only poor fixes still reports something', () => {
    // Better a rough number than a confident zero.
    recordPositions(db, alertId, [
      fix({ lat: 9.5357, recordedAt: at(60), accuracyM: 1500 }),
      fix({ lat: 9.5457, recordedAt: at(120), accuracyM: 1500 }),
    ]);
    assert.ok(summarise(db, alertId).netDisplacementM > 500);
  });
});

describe('clock skew', () => {
  test('a fix stamped in the future never reads as negative seconds', () => {
    // Found on the live desk as "last fix -176s ago". A skewed device clock is
    // ordinary, and a negative age would also keep hasGoneQuiet() false forever.
    recordPositions(db, alertId, [
      fix({ recordedAt: new Date(Date.now() + 300_000).toISOString() }),
    ]);
    const s = summarise(db, alertId);
    assert.ok(s.silentForSeconds !== null && s.silentForSeconds >= 0, `got ${s.silentForSeconds}`);
    assert.equal(hasGoneQuiet(s), false);
  });
});
