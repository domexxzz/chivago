import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

import {
  ROUTER, decodePolyline, detourRatio, formatDuration, metresBetween, parseRoute, routeRequestUrl,
} from './index.ts';

/**
 * The road route.
 *
 * No network here. The fixture below is a REAL reply from the FOSSGIS
 * Valhalla server - a one-kilometre walk from Chaweng Beach north-east
 * along the road, captured on 8 September 2026 - so the decoder is held to
 * a shape a router actually sent rather than to one written to satisfy it.
 */

const CHAWENG = { lat: 9.5357, lng: 100.0617 };
const UP_THE_ROAD = { lat: 9.538, lng: 100.064 };

const REPLY = {
  trip: {
    status: 0,
    summary: { length: 0.976, time: 708.719 },
    legs: [{
      shape: 'qy}dQyngz}DxKtJxA`@hBJ`KQjBKrF_@pH~GzOu[hAaEh@{CJyBCo@WoH_@eBm@sCu@uBaD_IoF_MuEqNsAmDgCuIk@mCo@wC}@{JUae@CwD}XaMeJyFuDuBiUsOkUb_@_JvNmVr`@wBzBg@t@sSiNgL}EyDkA}JiB_]qQ{IwF',
    }],
  },
};

describe('asking for a route', () => {
  test('the request carries no key, no token and no account', () => {
    // The whole reason this router was chosen over one with a free tier:
    // "free, and stays free" survives, and there is no secret to rotate
    // before an event.
    const url = routeRequestUrl(CHAWENG, UP_THE_ROAD, 'walk');
    assert.ok(url.startsWith(ROUTER));
    assert.doesNotMatch(url, /key=|token=|access_token|apikey/i);
    assert.match(ROUTER, /^https:\/\//, 'a route request must not travel in the clear');
  });

  test('walking and riding are different questions, and are asked as such', () => {
    // OSRM's public server answers all three profiles with the car graph -
    // a 20 km walk in 22 minutes. Sending the same costing for both would
    // reproduce exactly that lie.
    const walk = routeRequestUrl(CHAWENG, UP_THE_ROAD, 'walk');
    const ride = routeRequestUrl(CHAWENG, UP_THE_ROAD, 'ride');
    assert.match(decodeURIComponent(walk), /"costing":"pedestrian"/);
    assert.match(decodeURIComponent(ride), /"costing":"auto"/);
    assert.notEqual(walk, ride);
  });

  test('the two points go in the order they were given, as lat and lon', () => {
    const body = JSON.parse(decodeURIComponent(routeRequestUrl(CHAWENG, UP_THE_ROAD, 'walk').split('json=')[1]!));
    assert.deepEqual(body.locations, [
      { lat: 9.5357, lon: 100.0617 },
      { lat: 9.538, lon: 100.064 },
    ]);
  });
});

describe('the line that comes back', () => {
  test('six decimal places, not five', () => {
    // Every "decode a Google polyline" snippet assumes five. At five this
    // route lands in the Gulf of Thailand instead of on Chaweng.
    const line = decodePolyline(REPLY.trip.legs[0].shape);
    const [lng, lat] = line[0]!;
    assert.ok(Math.abs(lat - CHAWENG.lat) < 0.002, `first point at ${lat}, not Chaweng`);
    assert.ok(Math.abs(lng - CHAWENG.lng) < 0.002, `first point at ${lng}, not Chaweng`);
    const wrong = decodePolyline(REPLY.trip.legs[0].shape, 5);
    assert.ok(Math.abs(wrong[0]![1] - CHAWENG.lat) > 1, 'five places should be visibly wrong');
  });

  test('it starts where you are and ends where you asked', () => {
    const line = decodePolyline(REPLY.trip.legs[0].shape);
    const first = { lng: line[0]![0], lat: line[0]![1] };
    const last = { lng: line[line.length - 1]![0], lat: line[line.length - 1]![1] };
    assert.ok(metresBetween(first, CHAWENG) < 120, 'the route does not start at the traveller');
    assert.ok(metresBetween(last, UP_THE_ROAD) < 120, 'the route does not end at the place');
  });

  test('a truncated line is a short line, not a thrown error in the middle of a map', () => {
    const half = REPLY.trip.legs[0].shape.slice(0, 40);
    const line = decodePolyline(half);
    assert.ok(line.length > 0 && line.length < decodePolyline(REPLY.trip.legs[0].shape).length);
    assert.deepEqual(decodePolyline(''), []);
  });
});

describe('reading the answer', () => {
  test('a real reply becomes metres, seconds and a line', () => {
    const route = parseRoute(REPLY, 'walk')!;
    assert.equal(route.mode, 'walk');
    // The reply says kilometres because the request asked for kilometres.
    assert.equal(route.metres, 976);
    assert.equal(route.seconds, 709);
    assert.ok(route.line.length > 30, 'a road route is more than a handful of points');
  });

  test('the walking time is a walking time', () => {
    // 976 m in 709 s is 5.0 km/h. This is the assertion that would have
    // caught the OSRM demo server, which answers the same route at 60.
    const route = parseRoute(REPLY, 'walk')!;
    const kmh = (route.metres / 1000) / (route.seconds / 3600);
    assert.ok(kmh > 3 && kmh < 7, `${kmh.toFixed(1)} km/h is not a person walking`);
  });

  test('everything a caller cannot act on differently comes back null', () => {
    assert.equal(parseRoute(undefined, 'walk'), null);
    assert.equal(parseRoute({}, 'walk'), null);
    assert.equal(parseRoute({ trip: { status: 442, status_message: 'No path' } }, 'walk'), null);
    assert.equal(parseRoute({ trip: { status: 0, summary: {}, legs: [] } }, 'walk'), null);
    // A leg with one point is not a line and would draw as nothing.
    assert.equal(parseRoute({ trip: { status: 0, summary: { length: 1, time: 1 }, legs: [{ shape: 'qy}dQyngz}D' }] } }, 'walk'), null);
  });
});

describe('saying it to a person', () => {
  test('a duration is rounded to what a router can actually know', () => {
    // Its seconds are precise and not accurate: it does not know about the
    // songthaew that stops, or the rain.
    assert.equal(formatDuration(709).en, '12 min');
    assert.equal(formatDuration(709).th, '12 นาที');
    assert.equal(formatDuration(1_400).en, '25 min');
    assert.equal(formatDuration(14_965).en, '4 h 10 min');
    assert.equal(formatDuration(14_965).th, '4 ชม. 10 นาที');
    assert.equal(formatDuration(3_600).en, '1 h');
    assert.equal(formatDuration(20).en, '1 min', 'no journey takes zero minutes');
    assert.equal(formatDuration(Number.NaN).en, '');
  });

  test('the road is never shorter than the straight line', () => {
    // Chaweng to Na Muang is 11.2 km across the island and 19.3 by road.
    assert.ok(Math.abs(detourRatio(19_266, 11_224) - 1.72) < 0.01);
    // A ratio under one would mean a shortcut through the earth's crust.
    assert.equal(detourRatio(500, 1_000), 1);
    assert.equal(detourRatio(1_000, 0), 1);
  });
});
