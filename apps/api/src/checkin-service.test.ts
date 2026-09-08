import { strict as assert } from 'node:assert';
import { test, describe, beforeEach } from 'node:test';

import { CHECKIN_TRIP_POINTS, LOW_CARBON_TRIP_POINTS } from '@chivago/core';
import { openTestDb, type DB } from './db.ts';
import { getBalances, getExp, getLedger } from './wallet-service.ts';
import { OutsideGeofence } from './quest-service.ts';
import { checkedInToday, checkIn } from './checkin-service.ts';
import { FixTooCoarse, ImpossibleTravel, MockedLocation } from './presence-service.ts';

let db: DB;
const USER = 'u1';
const PLACE = 'chaweng';
/** Chaweng Beach, the real coordinates. */
const SITE = { lat: 9.5357, lng: 100.0617 };
/** Na Muang waterfall - 12 km away, well outside any check-in radius. */
const FAR = { lat: 9.4442, lng: 99.9711 };

beforeEach(() => {
  db = openTestDb();
  const now = new Date().toISOString();
  db.prepare('INSERT INTO users (id, display_name, created_at) VALUES (?,?,?)')
    .run(USER, 'John', now);
  db.prepare(
    `INSERT INTO places (id, name_en, name_th, short, layer, lat, lng, meta,
       blurb_en, blurb_th, tags, safety_label_en, safety_label_th,
       crowd_density, aqi, safety_index, walkability)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(PLACE, 'Chaweng Beach', 'หาดเฉวง', 'Chaweng', 'Green', SITE.lat, SITE.lng,
        'Beach', 'x', 'x', '[]', 'Patrolled', 'มีสายตรวจ', 2.4, 42, 7.2, 8.1);
});

describe('presence', () => {
  test('checking in at the place awards Trip Points', () => {
    const r = checkIn(db, { userId: USER, placeId: PLACE, ...SITE })!;
    assert.equal(r.awarded, true);
    assert.equal(r.pointsAwarded, CHECKIN_TRIP_POINTS);
    assert.equal(r.balances.trip, CHECKIN_TRIP_POINTS);
  });

  test('checking in from the other side of the island is refused', () => {
    assert.throws(
      () => checkIn(db, { userId: USER, placeId: PLACE, ...FAR }),
      OutsideGeofence,
    );
    assert.equal(getBalances(db, USER).trip, 0, 'nothing paid');
  });

  test('a refusal names the distance so the UI can explain it', () => {
    try {
      checkIn(db, { userId: USER, placeId: PLACE, ...FAR });
      assert.fail('should have thrown');
    } catch (err) {
      assert.ok(err instanceof OutsideGeofence);
      assert.ok(err.distanceM > 1000, `got ${err.distanceM} m`);
    }
  });

  test('a place that does not exist is null, not a crash', () => {
    assert.equal(checkIn(db, { userId: USER, placeId: 'nowhere', ...SITE }), null);
  });
});

describe('the second signal', () => {
  test('a simulated fix is refused, and nothing is paid', () => {
    assert.throws(() => checkIn(db, { userId: USER, placeId: PLACE, ...SITE, mocked: true }), MockedLocation);
    assert.equal(getBalances(db, USER).trip, 0);
  });

  test('a fix too coarse to be inside the fence is refused', () => {
    assert.throws(() => checkIn(db, { userId: USER, placeId: PLACE, ...SITE, accuracyM: 800 }), FixTooCoarse);
  });

  test('two check-ins across the island in the same minute is teleporting', () => {
    db.prepare(
      `INSERT INTO places (id, name_en, name_th, short, layer, lat, lng, meta,
         blurb_en, blurb_th, tags, safety_label_en, safety_label_th,
         crowd_density, aqi, safety_index, walkability)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run('thongkrut', 'Thong Krut', 'x', 'TK', 'Green', 9.4179, 99.9433, 'Mangrove', 'x', 'x', '[]',
          'Quiet', 'x', 1, 30, 7, 6);
    const t0 = new Date('2026-10-14T03:00:00Z');
    checkIn(db, { userId: USER, placeId: PLACE, ...SITE, now: t0 });
    assert.throws(
      () => checkIn(db, { userId: USER, placeId: 'thongkrut', lat: 9.4179, lng: 99.9433, now: new Date(t0.getTime() + 30_000) }),
      ImpossibleTravel,
    );
    // Half an hour later it is a scooter ride, and it pays.
    const r = checkIn(db, { userId: USER, placeId: 'thongkrut', lat: 9.4179, lng: 99.9433, now: new Date(t0.getTime() + 30 * 60_000) })!;
    assert.equal(r.awarded, true);
  });
});

describe('rate limiting', () => {
  test('a second check-in the same day pays nothing', () => {
    const first = checkIn(db, { userId: USER, placeId: PLACE, ...SITE })!;
    const second = checkIn(db, { userId: USER, placeId: PLACE, ...SITE })!;

    assert.equal(first.awarded, true);
    // Not an error. Coming back to a beach you like is the behaviour the
    // product wants; only the second payout is refused.
    assert.equal(second.awarded, false);
    assert.equal(second.pointsAwarded, 0);
    assert.equal(getBalances(db, USER).trip, CHECKIN_TRIP_POINTS, 'paid once');
    assert.equal(getLedger(db, USER).length, 1);
  });

  test('the day boundary is the ISLAND day, not the device day', () => {
    // 22:00 UTC on the 13th is already 05:00 on the 14th in Bangkok. A device
    // clock set to Europe would otherwise buy a second free check-in in the
    // middle of the Samui afternoon.
    const lateUtc = new Date('2026-10-13T22:00:00Z');
    const nextMorning = new Date('2026-10-14T02:00:00Z');
    assert.equal(checkIn(db, { userId: USER, placeId: PLACE, ...SITE, now: lateUtc })!.awarded, true);
    assert.equal(
      checkIn(db, { userId: USER, placeId: PLACE, ...SITE, now: nextMorning })!.awarded,
      false,
      'same island day',
    );
  });

  test('tomorrow is a fresh check-in', () => {
    const today = new Date('2026-10-14T02:00:00Z');
    const tomorrow = new Date('2026-10-15T02:00:00Z');
    checkIn(db, { userId: USER, placeId: PLACE, ...SITE, now: today });
    const again = checkIn(db, { userId: USER, placeId: PLACE, ...SITE, now: tomorrow })!;
    assert.equal(again.awarded, true);
    assert.equal(getBalances(db, USER).trip, CHECKIN_TRIP_POINTS * 2);
  });
});

describe('evidence', () => {
  test('a check-in never touches Green Points', () => {
    checkIn(db, { userId: USER, placeId: PLACE, ...SITE });
    const balances = getBalances(db, USER);
    // THE separation. Green is what a host vouched for; nobody vouched for
    // this beyond the phone's own claim to be standing somewhere. Letting it
    // reach Green would put self-reported presence into the total an ESG
    // auditor is asked to trust.
    assert.equal(balances.green, 0);
    assert.equal(balances.trip, CHECKIN_TRIP_POINTS);
    assert.equal(getLedger(db, USER)[0]!.currency, 'trip');
  });

  test('the ledger names the check-in as self-verified, not as a host', () => {
    checkIn(db, { userId: USER, placeId: PLACE, ...SITE });
    const entry = getLedger(db, USER)[0]!;
    assert.equal(entry.kind, 'checkin');
    assert.match(entry.host, /self check-in/i);
    assert.doesNotMatch(entry.host, /Municipality|Foundation|Ocean Lab/);
  });

  test('a check-in earns EXP like any other credit', () => {
    checkIn(db, { userId: USER, placeId: PLACE, ...SITE });
    assert.equal(getExp(db, USER), CHECKIN_TRIP_POINTS);
  });
});

describe('what the app asks on return', () => {
  test('reports the places already checked in today', () => {
    assert.deepEqual(checkedInToday(db, USER), []);
    checkIn(db, { userId: USER, placeId: PLACE, ...SITE });
    assert.deepEqual(checkedInToday(db, USER), [PLACE]);
  });

  test('one user does not see another user check-ins', () => {
    db.prepare('INSERT INTO users (id, display_name, created_at) VALUES (?,?,?)')
      .run('u2', 'Other', new Date().toISOString());
    checkIn(db, { userId: USER, placeId: PLACE, ...SITE });
    assert.deepEqual(checkedInToday(db, 'u2'), []);
  });
});

describe('the leg on foot', () => {
  const addFisherman = () => db.prepare(
    `INSERT INTO places (id, name_en, name_th, short, layer, lat, lng, meta,
       blurb_en, blurb_th, tags, safety_label_en, safety_label_th,
       crowd_density, aqi, safety_index, walkability)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run('fisherman', "Fisherman's Village", 'x', 'FV', 'Food', 9.5573, 100.0449, 'Market', 'x', 'x', '[]', 'Busy', 'x', 3, 40, 7, 8);
  const FV = { lat: 9.5573, lng: 100.0449 };
  const t0 = new Date('2026-10-14T03:00:00Z');

  test('two check-ins a walk apart pay the check-in and the leg, as Trip Points, once', () => {
    addFisherman();
    const first = checkIn(db, { userId: USER, placeId: PLACE, ...SITE, now: t0 })!;
    assert.equal(first.walk, null, 'the first check-in of the day closes no leg');
    const second = checkIn(db, { userId: USER, placeId: 'fisherman', ...FV, now: new Date(t0.getTime() + 100 * 60_000) })!;
    assert.ok(second.walk, 'a hundred minutes for 2.4 km is a walk');
    assert.equal(second.walk!.fromPlaceId, PLACE);
    assert.equal(second.walk!.points, LOW_CARBON_TRIP_POINTS);
    assert.equal(getBalances(db, USER).trip, CHECKIN_TRIP_POINTS * 2 + LOW_CARBON_TRIP_POINTS);
    assert.equal(getBalances(db, USER).green, 0, 'a measured leg is not a host verification');
    const walkRows = getLedger(db, USER).filter((e) => e.kind === 'walk');
    assert.equal(walkRows.length, 1);
    assert.match(walkRows[0]!.label, /Walked · Chaweng Beach → Fisherman's Village/);
    assert.match(walkRows[0]!.host, /measured leg/);
  });

  test('the same distance in ten minutes was a vehicle, and pays only the check-in', () => {
    addFisherman();
    checkIn(db, { userId: USER, placeId: PLACE, ...SITE, now: t0 });
    const second = checkIn(db, { userId: USER, placeId: 'fisherman', ...FV, now: new Date(t0.getTime() + 10 * 60_000) })!;
    assert.equal(second.walk, null);
    assert.equal(getBalances(db, USER).trip, CHECKIN_TRIP_POINTS * 2);
  });

  test('a second check-in at the same beach closes no leg and pays nothing more', () => {
    addFisherman();
    checkIn(db, { userId: USER, placeId: PLACE, ...SITE, now: t0 });
    checkIn(db, { userId: USER, placeId: 'fisherman', ...FV, now: new Date(t0.getTime() + 100 * 60_000) });
    const again = checkIn(db, { userId: USER, placeId: 'fisherman', ...FV, now: new Date(t0.getTime() + 200 * 60_000) })!;
    assert.equal(again.awarded, false);
    assert.equal(again.walk, null);
    assert.equal(getBalances(db, USER).trip, CHECKIN_TRIP_POINTS * 2 + LOW_CARBON_TRIP_POINTS);
  });
});

/**
 * The switch that opens the fence.
 *
 * `CHIVAGO_FENCE_OFF=1` exists so the flows can be exercised without faking a
 * GPS fix on every device. What these hold is the shape of the bargain: the
 * distance check and the second signal BOTH stop, because half a check is
 * only a refusal that reads as a bug; the switch is off unless the
 * environment says otherwise; and the app is told, so it can say so. The last
 * one is the reason the switch is allowed to exist at all - see fence.ts.
 */
describe('the fence, and the switch that opens it', () => {
  const withFenceOff = <T>(run: () => T): T => {
    const before = process.env.CHIVAGO_FENCE_OFF;
    process.env.CHIVAGO_FENCE_OFF = '1';
    try { return run(); } finally {
      if (before === undefined) delete process.env.CHIVAGO_FENCE_OFF;
      else process.env.CHIVAGO_FENCE_OFF = before;
    }
  };

  test('closed by default: twelve kilometres away is refused', () => {
    assert.throws(() => checkIn(db, { userId: USER, placeId: PLACE, ...FAR }), OutsideGeofence);
  });

  test('open: the same check-in from twelve kilometres away is taken', () => {
    const result = withFenceOff(() => checkIn(db, { userId: USER, placeId: PLACE, ...FAR }));
    assert.equal(result?.awarded, true);
    assert.equal(result?.pointsAwarded, CHECKIN_TRIP_POINTS);
  });

  test('open: the second signal stops too, or it only refuses honest testers', () => {
    // A fix the OS called fake, one too coarse to place anyone, and a jump
    // no vehicle could make. All three are judgements about a POSITION, and
    // there is no position being judged any more.
    withFenceOff(() => {
      assert.ok(checkIn(db, { userId: USER, placeId: PLACE, ...FAR, mocked: true, accuracyM: 5 })?.awarded);
    });
    const second = 'u-far';
    db.prepare('INSERT INTO users (id, display_name, created_at) VALUES (?,?,?)')
      .run(second, 'Far', new Date().toISOString());
    withFenceOff(() => {
      assert.ok(checkIn(db, { userId: second, placeId: PLACE, ...FAR, accuracyM: 9_000 })?.awarded);
    });
  });

  test('open does not mean free: still once per place per island day', () => {
    withFenceOff(() => {
      assert.equal(checkIn(db, { userId: USER, placeId: PLACE, ...FAR })?.awarded, true);
      const again = checkIn(db, { userId: USER, placeId: PLACE, ...FAR });
      assert.equal(again?.awarded, false);
      assert.equal(again?.pointsAwarded, 0);
    });
  });

  test('open pays Trip Points and never Green, exactly as before', () => {
    withFenceOff(() => { checkIn(db, { userId: USER, placeId: PLACE, ...FAR }); });
    const balances = getBalances(db, USER);
    assert.equal(balances.green, 0, 'no fence must never mean a Green Point');
    assert.equal(balances.trip, CHECKIN_TRIP_POINTS);
  });

  test('the switch closes again when the variable goes', () => {
    withFenceOff(() => { /* opened and shut inside */ });
    assert.throws(() => checkIn(db, { userId: USER, placeId: PLACE, ...FAR }), OutsideGeofence);
  });
});
