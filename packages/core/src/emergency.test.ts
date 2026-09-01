import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

import {
  EMERGENCY_AS_OF, PROTECTED_LINES, SAMUI_EMERGENCY,
  emergencyNear, kmBetween, nearMissOf,
} from './emergency.ts';

const CHAWENG = { lat: 9.5357, lng: 100.0617 };
const THONG_KRUT = { lat: 9.4179, lng: 99.9433 };

describe('every number can be traced back', () => {
  test('each one names its source and the date it was read', () => {
    // A number nobody can trace is a number nobody can re-check, and these
    // change. This is the same discipline the fares and the photo credits
    // carry, applied to the data where being wrong costs the most.
    assert.match(EMERGENCY_AS_OF, /^\d{4}-\d{2}-\d{2}$/);
    for (const e of SAMUI_EMERGENCY) {
      assert.match(e.sourceUrl, /^https:\/\//, `${e.key} has no source`);
      assert.ok(e.name.th.length > 3, `${e.key} has no Thai name`);
      assert.ok(e.name.en.length > 3, `${e.key} has no English name`);
    }
  });

  test('the dialled form is digits only, and matches what the source printed', () => {
    // `tel:` takes the dial string. A dash in it is a call that does not connect.
    for (const e of SAMUI_EMERGENCY) {
      assert.match(e.dial, /^\d+$/, `${e.key} dial is not digits: ${e.dial}`);
      assert.equal(e.dial, e.printed.replace(/\D/g, ''), `${e.key} dial and printed disagree`);
    }
  });

  test('an island number has a position; a national hotline does not', () => {
    for (const e of SAMUI_EMERGENCY) {
      if (e.scope === 'island') assert.ok(e.at, `${e.key} is on the island but has no position`);
      else assert.equal(e.at, null, `${e.key} is national and should not have one`);
    }
  });

  test('no two entries share a key', () => {
    const keys = SAMUI_EMERGENCY.map((e) => e.key);
    assert.equal(new Set(keys).size, keys.length);
  });
});

describe('a misdial can never get into the directory', () => {
  test('1699 is caught as a near miss of 1669', () => {
    // The municipality's own page prints 1699 under "tourist police". It is
    // one transposed pair from the ambulance line, and NIEM have had to warn
    // people about dialling it. This is the case that made the guard exist.
    assert.equal(nearMissOf('1699'), '1669');
  });

  test('one substituted digit is caught too', () => {
    assert.equal(nearMissOf('1668'), '1669');
    assert.equal(nearMissOf('192'), '191');
    assert.equal(nearMissOf('1156'), '1155');
  });

  test('the real lines are not flagged against themselves', () => {
    for (const line of PROTECTED_LINES) assert.equal(nearMissOf(line), null, line);
  });

  test('an ordinary local number is not flagged', () => {
    assert.equal(nearMissOf('077913200'), null);
    assert.equal(nearMissOf('0-7742-0506'), null);
  });

  test('NOTHING in the shipped directory is a near miss', () => {
    // The guard is worthless if it is not run against the real table. If
    // somebody adds 1699 in a future edit, this is what stops it.
    for (const e of SAMUI_EMERGENCY) {
      const clash = nearMissOf(e.dial);
      assert.equal(clash, null, `${e.key} (${e.dial}) is one slip from ${clash}`);
    }
  });
});

describe('the nearest station is the one that can come', () => {
  test('national lines lead, whatever is nearest', () => {
    // However close a police box is, 1669 is still what sends an ambulance.
    const list = emergencyNear(CHAWENG);
    const firstIsland = list.findIndex((e) => e.scope === 'island');
    assert.ok(list.slice(0, firstIsland).every((e) => e.scope === 'national'));
    assert.equal(list[0]!.dial, '1669');
  });

  test('island entries are ordered by distance from where you are', () => {
    const list = emergencyNear(CHAWENG).filter((e) => e.scope === 'island');
    const km = list.map((e) => e.km!);
    assert.deepEqual([...km].sort((a, b) => a - b), km, 'island stations came back out of order');
  });

  test('standing somewhere else changes which station is first', () => {
    // The whole point. A directory that names the same station wherever you
    // are is a directory that did not need your position.
    const atChaweng = emergencyNear(CHAWENG).filter((e) => e.scope === 'island')[0]!;
    const atThongKrut = emergencyNear(THONG_KRUT).filter((e) => e.scope === 'island')[0]!;
    assert.notEqual(atChaweng.key, atThongKrut.key);
  });

  test('with no position, everything is still listed and nothing claims a distance', () => {
    const list = emergencyNear(null);
    assert.equal(list.length, SAMUI_EMERGENCY.length);
    assert.ok(list.every((e) => e.km === null), 'a distance was invented without a position');
  });

  test('the distances are plausible for an island 25 km across', () => {
    const across = kmBetween(CHAWENG, THONG_KRUT);
    assert.ok(across > 5 && across < 40, `${across} km across Samui is not credible`);
  });
});
