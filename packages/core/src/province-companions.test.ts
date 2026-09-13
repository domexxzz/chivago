import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

import { PROVINCES } from './provinces.ts';
import {
  SEALED_EGG, bondOf, provinceCollection, provinceCompanions, provinceLevelFor, provinceNextStep,
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

describe('the province creature is the province, not the habitat', () => {
  // The bug this suite exists for: until 13 September 2026 the file's own
  // header promised "going to Chonburi and going to Chiang Mai are different
  // things to collect" and the code gave both of them the same macaque.
  const green = (code: string) => ({ code, layer: 'Green' as const, visitDays: 1, questsVerified: 0 });
  const at = (code: string) => provinceCompanions([green(code)]).find((c) => c.province.code === code)!;

  test('two provinces earned the same way are two different creatures', () => {
    const chonburi = at('TH-20');
    const suratthani = at('TH-84');
    assert.equal(chonburi.species!.key, suratthani.species!.key, 'same habitat, so the same animal lives there');
    assert.notEqual(chonburi.mascot.key, suratthani.mascot.key, 'but the provinces must not share an emblem');
  });

  test('all seventy-seven carry an emblem, including the sealed ones', () => {
    const all = provinceCompanions([]);
    assert.equal(all.length, 77);
    assert.equal(all.filter((c) => c.mascot).length, 77, 'a province with no emblem is a blank card');
    assert.equal(new Set(all.map((c) => c.mascot.key)).size, 77, 'two provinces share an emblem');
    // The species stays withheld. The emblem is public; what lives there is not.
    assert.deepEqual([...new Set(all.map((c) => c.species))], [null]);
  });

  test('a sealed province shows its emblem and no progress at all', () => {
    const sealed = provinceCompanions([]).find((c) => c.state === 'sealed')!;
    assert.equal(sealed.bond, 'unopened');
    assert.equal(sealed.level, 0);
    assert.ok(sealed.mascot.name.th.length > 0);
  });
});

describe('the bond is the same rung in the emblem’s words', () => {
  test('every state maps to exactly one bond, and no two states share one', () => {
    const states = ['sealed', 'unclaimed', 'egg', 'hatchling', 'grown'] as const;
    const bonds = states.map(bondOf);
    assert.deepEqual(bonds, ['unopened', 'unmet', 'met', 'known', 'vouched']);
    assert.equal(new Set(bonds).size, states.length, 'a bond that covers two rungs hides one of them');
  });

  test('no rung is ever named for a body, because a durian has none', () => {
    // 'egg', 'hatchling' and 'grown' are life-cycle words and must not reach
    // a province card. If somebody widens MascotBond, this is what fails.
    for (const state of ['sealed', 'unclaimed', 'egg', 'hatchling', 'grown'] as const) {
      assert.doesNotMatch(bondOf(state), /egg|hatch|grown|adult|born/);
    }
  });

  test('the bond always agrees with the state it came from', () => {
    const rows = provinceCompanions([
      { code: 'TH-20', layer: 'Green', visitDays: 2, questsVerified: 1 },
      { code: 'TH-84', layer: 'Food', visitDays: 1, questsVerified: 0 },
    ]);
    for (const c of rows) assert.equal(c.bond, bondOf(c.state), `${c.province.code} drifted`);
  });
});

describe('a province level reads back to the evidence under it', () => {
  test('a day is a day and a verified quest is three', () => {
    assert.equal(provinceLevelFor({ visitDays: 0, questsVerified: 0 }), 0);
    assert.equal(provinceLevelFor({ visitDays: 4, questsVerified: 0 }), 4);
    assert.equal(provinceLevelFor({ visitDays: 0, questsVerified: 2 }), 6);
    assert.equal(provinceLevelFor({ visitDays: 2, questsVerified: 1 }), 5);
  });

  test('one verified quest outranks a long weekend, which is what the ladder says', () => {
    // `strongest` sorts verified above any number of days; a level that let
    // three days of check-ins beat an approval would contradict the row it
    // sits on.
    assert.ok(provinceLevelFor({ visitDays: 0, questsVerified: 1 }) >= provinceLevelFor({ visitDays: 3, questsVerified: 0 }));
  });

  test('a province nobody has been to has no level, and sealed ones never gain one', () => {
    const all = provinceCompanions([]);
    assert.deepEqual([...new Set(all.map((c) => c.level))], [0]);
  });

  test('the level is carried on the row, computed from that row’s own evidence', () => {
    const c = provinceCompanions([{ code: 'TH-20', layer: 'Green', visitDays: 3, questsVerified: 1 }])
      .find((x) => x.province.code === 'TH-20')!;
    assert.equal(c.level, 6);
    assert.equal(c.level, provinceLevelFor(c), 'the row and the function disagree');
  });
});
