import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

import { PROVINCES } from './provinces.ts';
import {
  SEALED_EGG, provinceCollection, provinceCompanions, provinceNextStep,
  type ProvinceEvidence,
} from './province-companions.ts';

/** Surat Thani (Samui) and Chon Buri are the only two open provinces. */
const SAMUI = 'TH-84';
const CHONBURI = 'TH-20';
/** Nong Khai — listed, real, and not opened. */
const CLOSED = 'TH-43';

const ev = (over: Partial<ProvinceEvidence> = {}): ProvinceEvidence => ({
  code: SAMUI, layer: 'Safe', visitDays: 0, questsVerified: 0, ...over,
});

const at = (code: string, evidence: ProvinceEvidence[] = []) =>
  provinceCompanions(evidence).find((c) => c.province.code === code)!;

describe('a province nobody has surveyed has no animal in it', () => {
  test('a listed province is sealed and names no species', () => {
    // The whole point. Inventing seventy-five animals would have been easier
    // and would have been seventy-five claims nobody could check.
    const c = at(CLOSED);
    assert.equal(c.state, 'sealed');
    assert.equal(c.species, null);
    assert.equal(provinceNextStep(c), SEALED_EGG);
    assert.match(SEALED_EGG.th, /[฀-๿]/);
  });

  test('a sealed province stays sealed even if evidence turns up against it', () => {
    // Data can be wrong; a province opens when it is opened, not because a
    // check-in row appeared. Promoting it quietly would let bad data mint a
    // creature nobody could explain.
    const c = at(CLOSED, [ev({ code: CLOSED, visitDays: 9, questsVerified: 4 })]);
    assert.equal(c.state, 'sealed');
    assert.equal(c.species, null);
    assert.equal(c.visitDays, 0, 'a sealed province reported progress it cannot have');
  });

  test('exactly two provinces are not sealed today, and 75 are', () => {
    const all = provinceCompanions([]);
    const sealed = all.filter((c) => c.state === 'sealed');
    assert.equal(all.length, 77);
    assert.equal(sealed.length, 75);
    assert.deepEqual(
      all.filter((c) => c.state !== 'sealed').map((c) => c.province.code).sort(),
      [CHONBURI, SAMUI].sort(),
    );
  });
});

describe('the ladder is the one the rest of the app runs on', () => {
  test('an open province you have not been to is unclaimed, not sealed', () => {
    // Two different sentences: "nobody can have this yet" and "you have not
    // been". Collapsing them would blame the traveller for our own backlog.
    const c = at(SAMUI);
    assert.equal(c.state, 'unclaimed');
    assert.equal(c.species, null);
    assert.match(provinceNextStep(c)!.en, /Check in anywhere in Surat Thani/);
  });

  test('one check-in is an egg, a second day hatches it', () => {
    assert.equal(at(SAMUI, [ev({ visitDays: 1 })]).state, 'egg');
    assert.equal(at(SAMUI, [ev({ visitDays: 2 })]).state, 'hatchling');
  });

  test('only a host-verified quest grows it', () => {
    // Self-verified presence, however much of it, never reaches grown.
    assert.equal(at(SAMUI, [ev({ visitDays: 40 })]).state, 'hatchling');
    assert.equal(at(SAMUI, [ev({ visitDays: 1, questsVerified: 1 })]).state, 'grown');
    assert.equal(provinceNextStep(at(SAMUI, [ev({ visitDays: 1, questsVerified: 1 })])), null);
  });

  test('the species comes from the habitat with the strongest evidence there', () => {
    // The animal is a record of what they did in that province, not a prize
    // the app picked. A verified Green quest outranks four beach days.
    const c = at(SAMUI, [
      ev({ layer: 'Safe', visitDays: 4 }),
      ev({ layer: 'Green', visitDays: 1, questsVerified: 1 }),
    ]);
    assert.equal(c.state, 'grown');
    assert.equal(c.species!.layer, 'Green');
  });

  test('the same evidence always yields the same animal', () => {
    // A creature that changed species between two refreshes would be a bug
    // nobody could reproduce, so the tie-break is total.
    const rows = [ev({ layer: 'Safe', visitDays: 3 }), ev({ layer: 'Green', visitDays: 3 })];
    const a = at(SAMUI, rows).species!.key;
    const b = at(SAMUI, [...rows].reverse()).species!.key;
    assert.equal(a, b);
  });

  test('evidence in one province does not hatch another province’s egg', () => {
    const all = provinceCompanions([ev({ code: SAMUI, visitDays: 2 })]);
    assert.equal(all.find((c) => c.province.code === SAMUI)!.state, 'hatchling');
    assert.equal(all.find((c) => c.province.code === CHONBURI)!.state, 'unclaimed');
  });
});

describe('the collection is counted against the country', () => {
  test('the denominator is 77 and never the two we opened', () => {
    // "1 of 2" would flatter the app and lie about the size of the thing
    // being collected — the passport's decision, for the passport's reason.
    const c = provinceCollection(provinceCompanions([ev({ visitDays: 1 })]));
    assert.equal(c.total, 77);
    assert.equal(c.total, PROVINCES.length);
    assert.equal(c.found, 1);
    assert.equal(c.unclaimed, 1);
    assert.equal(c.sealed, 75);
  });

  test('a sealed egg is not "found"', () => {
    // Counting the 75 as owned would put the collection at 75/77 on the day
    // somebody installs the app, which is the most flattering possible lie.
    const c = provinceCollection(provinceCompanions([]));
    assert.equal(c.found, 0);
    assert.equal(c.grown, 0);
  });

  test('every state is accounted for exactly once', () => {
    const all = provinceCompanions([
      ev({ code: SAMUI, visitDays: 1, questsVerified: 1 }),
      ev({ code: CHONBURI, visitDays: 1 }),
    ]);
    const c = provinceCollection(all);
    assert.equal(c.found + c.unclaimed + c.sealed, 77);
    assert.equal(c.grown, 1);
  });
});
