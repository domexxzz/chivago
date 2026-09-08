import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

import {
  CHECKIN_RADIUS_M, WALK_KM_H, WALK_SUGGEST_MAX_M,
  bearingDegrees, compassPoint, formatDistance, hasArrived, isWalkable,
  mapsDirectionsUrl, metresBetween, nearestFirst, walkMinutes, wayThere,
} from './index.ts';
import { SEED_PLACES } from './seed.ts';

/**
 * Getting there.
 *
 * The rules a person would otherwise have to check by standing in five
 * places on Koh Samui with a phone.
 */

const CHAWENG = { lat: 9.5357, lng: 100.0617 };

describe('which way, and how far', () => {
  test('north is 0, east is 90, and the compass agrees with the bearing', () => {
    // A degree of latitude is ~111 km; a tenth of one is far enough that
    // rounding cannot flip the answer and short enough to stay on the island.
    const north = { lat: CHAWENG.lat + 0.1, lng: CHAWENG.lng };
    const east = { lat: CHAWENG.lat, lng: CHAWENG.lng + 0.1 };
    const south = { lat: CHAWENG.lat - 0.1, lng: CHAWENG.lng };
    const west = { lat: CHAWENG.lat, lng: CHAWENG.lng - 0.1 };
    assert.ok(Math.abs(bearingDegrees(CHAWENG, north) - 0) < 1);
    assert.ok(Math.abs(bearingDegrees(CHAWENG, east) - 90) < 1);
    assert.ok(Math.abs(bearingDegrees(CHAWENG, south) - 180) < 1);
    assert.ok(Math.abs(bearingDegrees(CHAWENG, west) - 270) < 1);
    assert.equal(compassPoint(CHAWENG, north), 'N');
    assert.equal(compassPoint(CHAWENG, east), 'E');
    assert.equal(compassPoint(CHAWENG, south), 'S');
    assert.equal(compassPoint(CHAWENG, west), 'W');
    assert.equal(compassPoint(CHAWENG, { lat: CHAWENG.lat + 0.1, lng: CHAWENG.lng + 0.1 }), 'NE');
    assert.equal(compassPoint(CHAWENG, { lat: CHAWENG.lat - 0.1, lng: CHAWENG.lng - 0.1 }), 'SW');
  });

  test('a distance is rounded to the precision a phone GPS actually has', () => {
    // Consumer GPS is 30-50 m out under trees. "182 m" claims four times the
    // accuracy of the fix it came from.
    assert.equal(formatDistance(182).en, '180 m');
    assert.equal(formatDistance(182).th, '180 ม.');
    assert.equal(formatDistance(1_437).en, '1.4 km');
    assert.equal(formatDistance(11_820).en, '12 km');
    // Never "0 m": standing on the pin still reads as a distance, not a bug.
    assert.equal(formatDistance(3).en, '10 m');
    // Nothing to say about a distance that is not a number.
    assert.equal(formatDistance(Number.NaN).en, '');
    assert.equal(formatDistance(-5).en, '');
  });

  test('both languages are filled in, always', () => {
    for (const m of [0, 12, 240, 999, 1_000, 4_500, 87_000]) {
      const d = formatDistance(m);
      if (m < 0) continue;
      assert.ok(d.en.length > 0 && d.th.length > 0, `${m} m has no bilingual form`);
      assert.notEqual(d.en, d.th, `${m} m was not translated`);
    }
  });
});

describe('the walk', () => {
  test('the estimate uses a pace people keep, not the one the leg detector rejects', () => {
    // low-carbon.ts uses 6 km/h as an UPPER BOUND to reject a songthaew.
    // Quoting it here would make every estimate optimistic in the one
    // direction that leaves somebody out in the tropical sun.
    assert.ok(WALK_KM_H < 6, 'the estimate must be slower than the leg detector ceiling');
    // A kilometre at 4.5 km/h is 13.3 min, rounded to the nearest five.
    assert.equal(walkMinutes(1_000), 15);
    assert.equal(walkMinutes(3_000), 40);
    // Under ten minutes, five-minute buckets are useless: say the minute.
    assert.equal(walkMinutes(300), 4);
    assert.ok(walkMinutes(10) >= 1, 'no walk takes zero minutes');
  });

  test('a walk is suggested up to about forty minutes and not beyond', () => {
    assert.ok(isWalkable(WALK_SUGGEST_MAX_M));
    assert.ok(!isWalkable(WALK_SUGGEST_MAX_M + 1));
    assert.ok(walkMinutes(WALK_SUGGEST_MAX_M) <= 45, 'the longest suggested walk is under an hour');
    // Chaweng to Na Muang is a real island trip and is not a walk.
    const naMuang = SEED_PLACES.find((p) => p.id === 'namuang')!;
    assert.ok(!wayThere(CHAWENG, naMuang).walkable, 'the waterfall is not a walk from Chaweng');
  });
});

describe('arrival is not a distance', () => {
  test('inside the check-in fence reads as arrival', () => {
    // Otherwise the screen says "250 m away" directly above a check-in
    // button that works, which reads as a contradiction.
    assert.ok(hasArrived(0));
    assert.ok(hasArrived(CHECKIN_RADIUS_M));
    assert.ok(!hasArrived(CHECKIN_RADIUS_M + 1));
    const chaweng = SEED_PLACES.find((p) => p.id === 'chaweng')!;
    assert.ok(wayThere(chaweng, chaweng).arrived);
  });
});

describe('nearest first', () => {
  const at = (id: string, lat: number, lng: number) => ({ id, lat, lng });

  test('it orders by distance from where you are standing', () => {
    const far = at('far', 9.60, 100.15);
    const near = at('near', 9.5360, 100.0620);
    const mid = at('mid', 9.55, 100.08);
    assert.deepEqual(
      nearestFirst([far, mid, near], CHAWENG).map((p) => p.id),
      ['near', 'mid', 'far'],
    );
  });

  test('the caller keeps its own order, and its own array', () => {
    // A row that silently reorders itself is bad enough without also
    // reordering the array the caller still holds.
    const served = [at('a', 9.60, 100.15), at('b', 9.5360, 100.0620)];
    const sorted = nearestFirst(served, CHAWENG);
    assert.deepEqual(served.map((p) => p.id), ['a', 'b'], 'the input was mutated');
    assert.notEqual(sorted, served, 'the same array came back');
  });

  test('no position means the server order, untouched', () => {
    // The server meant something by its order. Without a position there is
    // nothing better to say, so nothing is said.
    const served = [at('a', 9.60, 100.15), at('b', 9.5360, 100.0620)];
    assert.deepEqual(nearestFirst(served, null).map((p) => p.id), ['a', 'b']);
  });

  test('two places the same distance away keep the order the server sent', () => {
    // Stable, so a tie is broken by whatever the server meant and not by an
    // accident of the sort.
    const east = at('east', CHAWENG.lat, CHAWENG.lng + 0.02);
    const west = at('west', CHAWENG.lat, CHAWENG.lng - 0.02);
    assert.deepEqual(nearestFirst([east, west], CHAWENG).map((p) => p.id), ['east', 'west']);
    assert.deepEqual(nearestFirst([west, east], CHAWENG).map((p) => p.id), ['west', 'east']);
  });

  test('the real island, from Chaweng', () => {
    const samui = SEED_PLACES.filter((p) => p.province === 'TH-84');
    const order = nearestFirst(samui, CHAWENG);
    assert.equal(order[0]!.id, 'chaweng', 'the beach you are standing on is not first');
    const metres = order.map((p) => metresBetween(CHAWENG, p));
    for (let i = 1; i < metres.length; i += 1) {
      assert.ok(metres[i]! >= metres[i - 1]!, `${order[i]!.id} is nearer than the one before it`);
    }
  });
});

describe('the link to the map', () => {
  test('it carries the destination and nothing about the traveller', () => {
    // The whole privacy property of this feature: Google fills in "your
    // location" from the permission it already has, so this app never puts a
    // traveller's position in a URL that gets logged, cached and screenshot.
    const url = mapsDirectionsUrl({ lat: 9.5357, lng: 100.0617 });
    assert.match(url, /^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&/);
    assert.match(url, /destination=9\.535700%2C100\.061700/);
    assert.doesNotMatch(url, /origin/, 'the traveller\'s own position must never be in the URL');
    assert.doesNotMatch(url, /travelmode/, 'no mode is forced unless the caller asks');
  });

  test('walking mode only when the caller says the walk is plausible', () => {
    assert.match(mapsDirectionsUrl(CHAWENG, { walking: true }), /&travelmode=walking$/);
    assert.doesNotMatch(mapsDirectionsUrl(CHAWENG, { walking: false }), /travelmode/);
  });

  test('every seeded place produces a usable link', () => {
    for (const place of SEED_PLACES) {
      const url = new URL(mapsDirectionsUrl(place));
      const dest = url.searchParams.get('destination')!;
      const [lat, lng] = dest.split(',').map(Number) as [number, number];
      assert.ok(Math.abs(lat - place.lat) < 1e-5, `${place.id} lost its latitude`);
      assert.ok(Math.abs(lng - place.lng) < 1e-5, `${place.id} lost its longitude`);
    }
  });
});
