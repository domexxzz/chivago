import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

import {
  EMERGENCY_AS_OF, KOH_SICHANG_EMERGENCY, PROTECTED_LINES,
  emergencyNear, kmBetween, nearMissOf,
} from './emergency.ts';

const KOH_SICHANG_HOSPITAL = { lat: 13.1631992, lng: 100.8076481 };
const THAM_PHANG = { lat: 13.1454, lng: 100.806835 };

describe('every number can be traced back', () => {
  test('each one names its source and the date it was read', () => {
    // A number nobody can trace is a number nobody can re-check, and these
    // change. This is the same discipline the fares and the photo credits
    // carry, applied to the data where being wrong costs the most.
    assert.match(EMERGENCY_AS_OF, /^\d{4}-\d{2}-\d{2}$/);
    for (const e of KOH_SICHANG_EMERGENCY) {
      assert.match(e.sourceUrl, /^https:\/\//, `${e.key} has no source`);
      assert.ok(e.name.th.length > 3, `${e.key} has no Thai name`);
      assert.ok(e.name.en.length > 3, `${e.key} has no English name`);
    }
  });

  test('the dialled form is digits only, and matches what the source printed', () => {
    // `tel:` takes the dial string. A dash in it is a call that does not connect.
    for (const e of KOH_SICHANG_EMERGENCY) {
      assert.match(e.dial, /^\d+$/, `${e.key} dial is not digits: ${e.dial}`);
      assert.equal(e.dial, e.printed.replace(/\D/g, ''), `${e.key} dial and printed disagree`);
    }
  });

  test('national hotlines have no invented position', () => {
    for (const e of KOH_SICHANG_EMERGENCY) {
      if (e.scope === 'national') assert.equal(e.at, null, `${e.key} is national and should not have one`);
    }
  });

  test('no two entries share a key', () => {
    const keys = KOH_SICHANG_EMERGENCY.map((e) => e.key);
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
    assert.equal(nearMissOf('0887504872'), null);
    assert.equal(nearMissOf('0 3821 6218'), null);
  });

  test('NOTHING in the shipped directory is a near miss', () => {
    // The guard is worthless if it is not run against the real table. If
    // somebody adds 1699 in a future edit, this is what stops it.
    for (const e of KOH_SICHANG_EMERGENCY) {
      const clash = nearMissOf(e.dial);
      assert.equal(clash, null, `${e.key} (${e.dial}) is one slip from ${clash}`);
    }
  });
});

describe('the nearest station is the one that can come', () => {
  test('national lines lead, whatever is nearest', () => {
    // However close a police box is, 1669 is still what sends an ambulance.
    const list = emergencyNear(THAM_PHANG);
    const firstIsland = list.findIndex((e) => e.scope === 'island');
    assert.ok(list.slice(0, firstIsland).every((e) => e.scope === 'national'));
    assert.equal(list[0]!.dial, '1669');
  });

  test('island entries are ordered by distance from where you are', () => {
    const list = emergencyNear(THAM_PHANG).filter((e) => e.scope === 'island');
    const km = list.map((e) => e.km).filter((distance): distance is number => distance !== null);
    assert.deepEqual([...km].sort((a, b) => a - b), km, 'island stations came back out of order');
    assert.equal(list.at(-1)!.km, null, 'a responder without a published coordinate should sort last');
  });

  test('a published coordinate yields a real distance and an unpublished one does not', () => {
    const local = emergencyNear(THAM_PHANG).filter((e) => e.scope === 'island');
    assert.ok(local.find((e) => e.key === 'koh-sichang-hospital-er')!.km! > 0);
    assert.equal(local.find((e) => e.key === 'koh-sichang-police-station')!.km, null);
  });

  test('with no position, everything is still listed and nothing claims a distance', () => {
    const list = emergencyNear(null);
    assert.equal(list.length, KOH_SICHANG_EMERGENCY.length);
    assert.ok(list.every((e) => e.km === null), 'a distance was invented without a position');
  });

  test('the hospital and Tham Phang are a plausible distance apart on Koh Sichang', () => {
    const across = kmBetween(KOH_SICHANG_HOSPITAL, THAM_PHANG);
    assert.ok(across > 1 && across < 5, `${across} km across Koh Sichang is not credible`);
  });
});
