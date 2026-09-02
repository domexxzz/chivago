import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

import {
  MAX_TRAVEL_KM_PER_MIN, QUEST_MIN_DWELL_MIN, QUEST_RADIUS_MAX_M,
  fixIsUsable, impliedKmPerMin, metresBetween,
} from './presence.ts';
import { CHECKIN_RADIUS_M, SEED_QUESTS } from './seed.ts';

const chaweng = { lat: 9.5357, lng: 100.0617 };
const thongKrut = { lat: 9.4179, lng: 99.9433 };

describe('a fix that cannot place you inside the fence', () => {
  test('is refused when its error circle is wider than the fence', () => {
    // The ACSAC 2013 hole: claim to be imprecise and the tolerance lets you in.
    assert.equal(fixIsUsable(900, 250), false);
    assert.equal(fixIsUsable(251, 250), false);
  });

  test('is fine when the fence contains the error circle', () => {
    assert.equal(fixIsUsable(40, 250), true);
    assert.equal(fixIsUsable(250, 250), true);
  });

  test('an unknown accuracy is allowed, so older phones are not locked out', () => {
    assert.equal(fixIsUsable(null, 250), true);
    assert.equal(fixIsUsable(undefined, 250), true);
    assert.equal(fixIsUsable(Number.NaN, 250), true);
  });
});

describe('the speed two fixes imply', () => {
  test('a scooter across the island is nowhere near the cap', () => {
    // ~19 km in 30 minutes.
    const v = impliedKmPerMin(chaweng, thongKrut, 30 * 60_000);
    assert.ok(v > 0.5 && v < 1, `${v} km/min`);
    assert.ok(v < MAX_TRAVEL_KM_PER_MIN);
  });

  test('the same two places thirty seconds apart is teleporting', () => {
    assert.ok(impliedKmPerMin(chaweng, thongKrut, 30_000) > MAX_TRAVEL_KM_PER_MIN);
  });

  test('two places in the same instant is infinite, and a duplicate fix is zero', () => {
    assert.equal(impliedKmPerMin(chaweng, thongKrut, 0), Number.POSITIVE_INFINITY);
    assert.equal(impliedKmPerMin(chaweng, chaweng, 0), 0);
    assert.equal(impliedKmPerMin(chaweng, { lat: chaweng.lat + 0.0002, lng: chaweng.lng }, 0), 0, 'GPS jitter is not travel');
    // 200 m in half a second, as seen live: jitter between two taps, not a teleport.
    assert.equal(impliedKmPerMin(chaweng, { lat: chaweng.lat + 0.0018, lng: chaweng.lng }, 500), 0);
  });

  test('the cap is an airliner, not a ferry', () => {
    assert.ok(MAX_TRAVEL_KM_PER_MIN >= 10 && MAX_TRAVEL_KM_PER_MIN <= 16);
  });

  test('the haversine is sane at island scale', () => {
    const m = metresBetween(chaweng, thongKrut);
    assert.ok(m > 18_000 && m < 20_500, `${m} m`);
  });
});

describe('what the seed promises about its own fences', () => {
  test('every quest site is a point, except the one whose site is the island', () => {
    for (const q of SEED_QUESTS) {
      const isIsland = q.where.en === 'Island-wide';
      assert.ok(
        isIsland || q.geofenceRadiusM <= QUEST_RADIUS_MAX_M,
        `${q.code} arrives at ${q.geofenceRadiusM} m; a site is a point`,
      );
    }
  });

  test('a check-in fence is wider than any quest site, because a place is not a point', () => {
    assert.ok(CHECKIN_RADIUS_M > QUEST_RADIUS_MAX_M);
  });

  test('the dwell floor sits below the shortest quest', () => {
    // '45 min' / '2 hr' / 'Daily' -> minutes, or nothing.
    const minutes = (d: string): number => {
      const m = /^(\d+)\s*(min|hr)/.exec(d);
      return m ? Number(m[1]) * (m[2] === 'hr' ? 60 : 1) : Number.NaN;
    };
    const shortest = Math.min(...SEED_QUESTS.map((q) => minutes(q.duration.en)).filter(Number.isFinite));
    assert.ok(QUEST_MIN_DWELL_MIN < shortest, `${QUEST_MIN_DWELL_MIN} vs ${shortest} min`);
  });
});
