import { strict as assert } from 'node:assert';
import { test, describe, beforeEach } from 'node:test';

import { openTestDb, type DB } from './db.ts';
import {
  FixTooCoarse, ImpossibleTravel, MockedLocation, assertPresence, recordFix,
} from './presence-service.ts';

let db: DB;
const USER = 'u1';
const chaweng = { lat: 9.5357, lng: 100.0617 };
const thongKrut = { lat: 9.4179, lng: 99.9433 };
const T = new Date('2026-10-14T03:00:00Z');
const later = (min: number) => new Date(T.getTime() + min * 60_000);

beforeEach(() => {
  db = openTestDb();
  db.prepare('INSERT INTO users (id, display_name, created_at) VALUES (?,?,?)')
    .run(USER, 'John', T.toISOString());
});

describe('the second signal', () => {
  test('a fix the OS flagged as simulated is refused before anything else', () => {
    assert.throws(
      () => assertPresence(db, { userId: USER, fix: { ...chaweng, mocked: true, accuracyM: 5 }, radiusM: 250, now: T }),
      MockedLocation,
    );
  });

  test('a fix wider than the fence is refused, and says both numbers', () => {
    // The ACSAC 2013 hole, closed: claiming to be imprecise no longer helps.
    try {
      assertPresence(db, { userId: USER, fix: { ...chaweng, accuracyM: 900 }, radiusM: 250, now: T });
      assert.fail('should have thrown');
    } catch (e) {
      assert.ok(e instanceof FixTooCoarse);
      assert.equal(e.accuracyM, 900);
      assert.equal(e.radiusM, 250);
      assert.match(e.message, /900 m/);
    }
  });

  test('an honest fix passes, with or without a stated accuracy', () => {
    assertPresence(db, { userId: USER, fix: { ...chaweng, accuracyM: 30 }, radiusM: 250, now: T });
    assertPresence(db, { userId: USER, fix: chaweng, radiusM: 250, now: T });
  });

  test('two fixes across the island half a minute apart is teleporting', () => {
    recordFix(db, USER, chaweng, T);
    assert.throws(
      () => assertPresence(db, { userId: USER, fix: thongKrut, radiusM: 250, now: later(0.5) }),
      ImpossibleTravel,
    );
  });

  test('the same trip by scooter, half an hour later, is fine', () => {
    recordFix(db, USER, chaweng, T);
    assertPresence(db, { userId: USER, fix: thongKrut, radiusM: 250, now: later(30) });
  });

  test('the first fix ever has nothing to be judged against', () => {
    assertPresence(db, { userId: USER, fix: thongKrut, radiusM: 250, now: T });
  });

  test('a fix older than the last one known is neither judged nor remembered', () => {
    // A backfilled history, written newest last, is not travel. The demo's
    // five days are exactly this, and the check read them as teleporting
    // backwards in time until it learned to look at the clock.
    recordFix(db, USER, thongKrut, later(60));
    assertPresence(db, { userId: USER, fix: chaweng, radiusM: 250, now: T });
    recordFix(db, USER, chaweng, T);
    const kept = db.prepare('SELECT at FROM last_fix WHERE user_id = ?').get(USER) as { at: string };
    assert.equal(kept.at, later(60).toISOString(), 'the newer fix must stay the last one known');
  });

  test('a recorded fix replaces the last, so an old one cannot haunt a new day', () => {
    recordFix(db, USER, chaweng, T);
    recordFix(db, USER, thongKrut, later(40));
    // From Thong Krut back to Chaweng an hour after THAT is a normal ride.
    assertPresence(db, { userId: USER, fix: chaweng, radiusM: 250, now: later(100) });
  });
});
