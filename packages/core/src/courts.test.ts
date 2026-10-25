import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { areaOfPlace } from './areas.ts';
import { isBookingLink } from './booking.ts';
import {
  PLACE_COURTS, courtPlacesIn, courtSourceFor, courtState, courtsFromCourtStatus, isCourtStatusLink,
  type CourtCount,
} from './courts.ts';
import { SEED_PLACES } from './seed.ts';

const NOW = Date.parse('2026-10-24T18:30:00+07:00');

const answer = (over: Record<string, unknown> = {}, courts: Record<string, unknown> = {}) => ({
  ok: true,
  data: {
    courts: { total: 4, free: 2, busy: 2, ...courts },
    openNow: true,
    nextOpenAt: null,
    observedAt: NOW,
    ...over,
  },
});
const read = (body: unknown, now = NOW) => courtsFromCourtStatus(body, now);

test('every place with courts is a seeded place, named and placed as seeded, and books through a real link', () => {
  for (const [id, src] of Object.entries(PLACE_COURTS)) {
    const place = SEED_PLACES.find((p) => p.id === id);
    assert.ok(place, `${id} is a seeded place`);
    assert.equal(src.area, areaOfPlace(place), `${id} is in the area its coordinates say`);
    assert.deepEqual(src.name, place.name, `${id} is called what the seed calls it`);
    // A court count is only worth showing beside a way to book one.
    assert.ok(isBookingLink(place.bookingUrl), `${id} has a booking link of its own`);
  }
});

test('an area\'s venues with court counts are found without the places list', () => {
  assert.deepEqual(courtPlacesIn('rmutt').map((c) => c.placeId), ['sinthani-badminton']);
  assert.deepEqual(courtPlacesIn('samui'), []);
});

test('a place\'s court service is its own key, never the prototype\'s', () => {
  assert.equal(courtSourceFor('sinthani-badminton')?.provider, 'badminton-booking');
  assert.equal(courtSourceFor('chaweng'), null);
  for (const id of ['constructor', '__proto__', 'toString', '']) assert.equal(courtSourceFor(id), null, id);
});

test('what the venue can offer is read off the count, never guessed', () => {
  const c = (over: Partial<CourtCount>): CourtCount => ({ total: 4, free: 2, openNow: true, opensAt: null, ...over });
  assert.equal(courtState(c({})), 'free');
  assert.equal(courtState(c({ free: 0 })), 'full');
  // Shut is shut, whatever the count says: a free court at midnight is not one you can play on.
  assert.equal(courtState(c({ openNow: false })), 'closed');
  assert.equal(courtState(c({ openNow: false, free: 0 })), 'closed');
});

test('the count comes off the service\'s answer, with the time it read it', () => {
  const r = read(answer());
  assert.ok(r);
  assert.deepEqual(r.count, { total: 4, free: 2, openNow: true, opensAt: null });
  assert.equal(r.observedAt, NOW);
});

test('a shut venue carries when it opens; an open one carries none', () => {
  const opens = NOW + 10 * 3_600_000;
  const shut = read(answer({ openNow: false, nextOpenAt: opens }));
  assert.equal(shut?.count.openNow, false);
  assert.equal(shut?.count.opensAt, new Date(opens).toISOString());
  // An opening time alongside "open now" is not shown: it would contradict the state.
  const open = read(answer({ openNow: true, nextOpenAt: opens }));
  assert.equal(open?.count.opensAt, null);
});

test('an opening time out of range is left unsaid rather than shown', () => {
  for (const next of [NOW - 3_600_000, NOW + 30 * 86_400_000, 'soon', null]) {
    const r = read(answer({ openNow: false, nextOpenAt: next }));
    assert.equal(r?.count.openNow, false, String(next));
    assert.equal(r?.count.opensAt, null, String(next));
  }
});

test('a body that is not a court-status answer is refused, not read around', () => {
  for (const body of [
    null, undefined, 'busy', 42, [], {}, { ok: true },
    { data: null }, { data: 'nope' }, { data: {} }, { data: { courts: null } },
    { data: { courts: [] , openNow: true } },
    answer({ openNow: undefined }),
    answer({ openNow: 'yes' }),
  ]) {
    assert.equal(read(body), null, JSON.stringify(body) ?? 'undefined');
  }
});

test('a count that does not add up is refused whole, never clamped into shape', () => {
  // free above total would be clamped to a figure nobody gave.
  assert.equal(read(answer({}, { free: 5, total: 4 })), null);
  for (const bad of [-1, 1.5, '2', null, undefined, NaN, Infinity, 65]) {
    assert.equal(read(answer({}, { total: bad })), null, `total ${String(bad)}`);
    assert.equal(read(answer({}, { free: bad })), null, `free ${String(bad)}`);
  }
});

test('a venue with no court free is a count, not a missing answer', () => {
  const r = read(answer({}, { free: 0 }));
  assert.deepEqual(r?.count, { total: 4, free: 0, openNow: true, opensAt: null });
  assert.equal(courtState(r!.count), 'full');
});

test('a venue with no courts at all still reads, and is not called free', () => {
  const r = read(answer({}, { total: 0, free: 0 }));
  assert.deepEqual(r?.count, { total: 0, free: 0, openNow: true, opensAt: null });
  assert.equal(courtState(r!.count), 'full');
});

test('a reading time the service did not give usably is not invented', () => {
  for (const stamp of [undefined, null, 'now', NOW + 120_000, NOW - 20 * 86_400_000]) {
    const r = read(answer({ observedAt: stamp }));
    assert.ok(r, String(stamp));
    assert.equal(r.observedAt, null, String(stamp));
  }
  // A stamp a moment old is the truth of when the courts were counted, so it is kept.
  assert.equal(read(answer({ observedAt: NOW - 2000 }))?.observedAt, NOW - 2000);
});

test('only an https status route, or a local one, may be asked for a count', () => {
  for (const good of [
    'https://badminton-booking-ihw1.onrender.com/api/court-status',
    'http://localhost:3000/api/court-status',
    'http://127.0.0.1:3000/api/court-status',
    'https://example.org/booking/api/court-status',
  ]) {
    assert.ok(isCourtStatusLink(good), good);
  }
  for (const bad of [
    '', 'badminton-booking-ihw1.onrender.com/api/court-status',
    'http://badminton-booking-ihw1.onrender.com/api/court-status',
    'https://user:pw@example.org/api/court-status',
    'https://example.org/api/court-status?all=1',
    'https://example.org/api/court-status#x',
    'https://example.org/api/bookings',
    'javascript:alert(1)/api/court-status',
    'https://example.org/api/court-status/extra',
  ]) {
    assert.equal(isCourtStatusLink(bad), false, bad);
  }
});
