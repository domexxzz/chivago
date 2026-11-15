import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

import {
  COURT_LABEL, DUST_FROM_DUPLICATE, DUST_TO_FORGE, MYTHIC_PITY, RARE_PITY, RARITIES, RARITY_LABEL,
  RARITY_EFFECTIVE_PERCENT, RARITY_EFFECTIVE_WEIGHT, RARITY_PERCENT, RARITY_WEIGHT, SPIRITS,
  SPIRIT_COUNT, WEIGHT_TOTAL, advancePity, drawSpirit, effectiveWeights,
  rarityFromRoll, spiritFor, spiritSignature, spiritsOfRarity, type PityState, type SpiritRarity,
} from './spirits.ts';
import { MASCOTS } from './mascots.ts';
import { SPECIES } from './companions.ts';

const NO_PITY: PityState = { sinceMythic: 0, sinceRare: 0 };

describe('twenty-four different creatures', () => {
  test('keys, names and signatures are unique', () => {
    const keys = SPIRITS.map((s) => s.key);
    assert.equal(new Set(keys).size, keys.length, 'two spirits share a key');
    const names = SPIRITS.map((s) => s.name.en.toLowerCase());
    assert.equal(new Set(names).size, names.length, 'two spirits share a name');
    const seen = new Map<string, string>();
    for (const s of SPIRITS) {
      const sig = spiritSignature(s);
      assert.ok(!seen.has(sig), `${s.key} is the same creature as ${seen.get(sig)} (${sig})`);
      seen.set(sig, s.key);
    }
  });

  test('every spirit is bilingual, and the Thai side is Thai', () => {
    for (const s of SPIRITS) {
      for (const b of [s.name, s.creature, s.lore]) {
        assert.ok(b.en.trim() && b.th.trim(), `${s.key} is missing a language`);
        assert.match(b.th, /[฀-๿]/, `${s.key}: the Thai side is not Thai`);
      }
    }
    for (const label of [...Object.values(COURT_LABEL), ...Object.values(RARITY_LABEL)]) {
      assert.ok(label.en.trim() && label.th.trim());
    }
  });

  test('every rarity has a pool, and no pool is empty', () => {
    assert.equal(SPIRIT_COUNT, 24);
    for (const r of RARITIES) assert.ok(spiritsOfRarity(r).length > 0, `${r} has nobody in it`);
    assert.equal(
      RARITIES.reduce((n, r) => n + spiritsOfRarity(r).length, 0), SPIRIT_COUNT,
      'a spirit has a rarity outside the list',
    );
  });

  test('every court is used', () => {
    for (const court of Object.keys(COURT_LABEL)) {
      assert.ok(SPIRITS.some((s) => s.court === court), `the ${court} court is empty`);
    }
  });

  /*
    The rule `mascots.ts` holds itself to, held here for the same reason:
    green means a host verified something, and an invented creature has
    verified nothing.
  */
  test('no spirit wears the evidence green', () => {
    const evidence = ['#25874c', '#1f7a44', '#175c33', '#0e3d21', '#3faa6d'];
    for (const s of SPIRITS) {
      for (const [part, hex] of Object.entries(s.form.colours)) {
        assert.match(hex, /^#[0-9a-f]{6}$/i, `${s.key}.${part} is not a hex colour`);
        assert.ok(!evidence.includes(hex.toLowerCase()), `${s.key}.${part} wears the evidence green`);
      }
    }
  });
});

describe('a spirit is a third thing, and does not stand in for the other two', () => {
  /*
    The failure this guards against is not a collision in a map - it is a
    traveller reading an invented creature as a claim. A spirit that shared
    a key with a provincial emblem or a Samui species would do exactly that
    the first time either list was rendered from a key.
  */
  test('no spirit key collides with a mascot or a species', () => {
    const mascotKeys = new Set(MASCOTS.map((m) => m.key));
    const speciesKeys = new Set(Object.values(SPECIES).map((s) => s.key));
    for (const s of SPIRITS) {
      assert.ok(!mascotKeys.has(s.key), `${s.key} collides with a provincial mascot`);
      assert.ok(!speciesKeys.has(s.key), `${s.key} collides with a Samui species`);
    }
  });

  test('no spirit claims a province or a scientific name', () => {
    for (const s of SPIRITS) {
      assert.ok(!('code' in s), `${s.key} carries a province code`);
      assert.ok(!('scientific' in s), `${s.key} carries a scientific name`);
      assert.ok(!('basis' in s), `${s.key} claims a basis - that word belongs to the emblems`);
    }
  });
});

describe('the published table', () => {
  test('the weights sum to the total, exactly, in integers', () => {
    const sum = RARITIES.reduce((n, r) => n + RARITY_WEIGHT[r], 0);
    assert.equal(sum, WEIGHT_TOTAL);
    for (const r of RARITIES) assert.ok(Number.isInteger(RARITY_WEIGHT[r]), `${r} is not an integer weight`);
    assert.equal(RARITIES.reduce((n, r) => n + RARITY_PERCENT[r], 0), 100);
  });

  test('every roll in range lands somewhere, and the bands are in order', () => {
    const counts: Record<SpiritRarity, number> = { common: 0, uncommon: 0, rare: 0, mythic: 0 };
    for (let roll = 0; roll < WEIGHT_TOTAL; roll += 1) counts[rarityFromRoll(roll)] += 1;
    for (const r of RARITIES) {
      assert.equal(counts[r], RARITY_WEIGHT[r], `${r} does not get the share the table says`);
    }
  });

  test('the boundaries are where the table says, not one off', () => {
    assert.equal(rarityFromRoll(0), 'common');
    assert.equal(rarityFromRoll(5_625), 'common');
    assert.equal(rarityFromRoll(5_626), 'uncommon');
    assert.equal(rarityFromRoll(8_157), 'uncommon');
    assert.equal(rarityFromRoll(8_158), 'rare');
    assert.equal(rarityFromRoll(9_498), 'rare');
    assert.equal(rarityFromRoll(9_499), 'mythic');
    assert.equal(rarityFromRoll(9_999), 'mythic');
  });

  /*
    The reason this block exists at all: the roll band was published as "the
    rates" for a while, and it is not what anybody experiences. These tests
    are the ones that have to be deleted to put a false number back on the
    screen.
  */
  test('the effective table is a table: integers, in ten-thousandths, summing to the total', () => {
    const sum = RARITIES.reduce((n, r) => n + RARITY_EFFECTIVE_WEIGHT[r], 0);
    assert.equal(sum, WEIGHT_TOTAL, 'the effective shares do not add up to the whole');
    for (const r of RARITIES) {
      assert.ok(Number.isInteger(RARITY_EFFECTIVE_WEIGHT[r]), `${r} is not an integer share`);
      assert.equal(RARITY_EFFECTIVE_PERCENT[r], RARITY_EFFECTIVE_WEIGHT[r] / 100);
    }
  });

  test('the floors lift the top of the table, and the published numbers say so', () => {
    // Every one of these would have been a lie on the old screen.
    assert.ok(
      RARITY_EFFECTIVE_WEIGHT.mythic > RARITY_WEIGHT.mythic,
      'a floor that guarantees a mythic cannot leave the mythic rate where the roll band put it',
    );
    assert.ok(RARITY_EFFECTIVE_WEIGHT.rare > RARITY_WEIGHT.rare);
    assert.ok(RARITY_EFFECTIVE_WEIGHT.common < RARITY_WEIGHT.common);
    assert.ok(RARITY_EFFECTIVE_WEIGHT.uncommon < RARITY_WEIGHT.uncommon);
  });

  test('the effective table is what the draw actually does, not a second opinion about it', () => {
    /*
      The table is arrived at by walking a mythic cycle on paper. This walks
      it with `drawSpirit` itself instead, half a million summons of it, so
      the two derivations have to agree or one of them is wrong.

      Seeded xorshift rather than `Math.random`: a test that can fail on a
      Tuesday teaches people to re-run tests instead of reading them. Same
      sequence every time, on every machine.
    */
    const DRAWS = 500_000;
    let bits = 0x5eed1e55;
    const nextRoll = (): number => {
      bits ^= bits << 13; bits >>>= 0;
      bits ^= bits >>> 17;
      bits ^= bits << 5; bits >>>= 0;
      return bits % WEIGHT_TOTAL;
    };

    const seen: Record<SpiritRarity, number> = { common: 0, uncommon: 0, rare: 0, mythic: 0 };
    let pity: PityState = { sinceMythic: 0, sinceRare: 0 };
    for (let i = 0; i < DRAWS; i += 1) {
      const draw = drawSpirit(nextRoll(), 0, pity);
      seen[draw.rarity] += 1;
      pity = advancePity(pity, draw.rarity);
    }
    for (const r of RARITIES) {
      const walked = (seen[r] / DRAWS) * 100;
      assert.ok(
        Math.abs(walked - RARITY_EFFECTIVE_PERCENT[r]) < 0.5,
        `${r}: the published effective rate is ${RARITY_EFFECTIVE_PERCENT[r]}%, the draw gives ${walked.toFixed(2)}%`,
      );
      // And the roll band is NOT what comes out, which is the whole point.
      if (r === 'mythic' || r === 'rare') {
        assert.ok(
          walked - RARITY_PERCENT[r] > 1,
          `${r}: the draw matches the roll band, so the floors are not doing what the table says`,
        );
      }
    }
  });

  test('exactly one mythic comes out of every cycle, which is what makes the arithmetic sound', () => {
    // `effectiveWeights` divides one cycle's yield by one cycle's length. If
    // a cycle could end without a mythic, or with two, that division is
    // meaningless - so this is the invariant underneath the whole table.
    let pity: PityState = { sinceMythic: 0, sinceRare: 0 };
    for (let cycle = 0; cycle < 200; cycle += 1) {
      let length = 0;
      let mythics = 0;
      do {
        const draw = drawSpirit((cycle * 977 + length * 31) % WEIGHT_TOTAL, 0, pity);
        if (draw.rarity === 'mythic') mythics += 1;
        pity = advancePity(pity, draw.rarity);
        length += 1;
        assert.ok(length <= MYTHIC_PITY, 'a cycle ran past the mythic floor');
      } while (mythics === 0);
      assert.equal(mythics, 1, 'a cycle ended with something other than exactly one mythic');
    }
  });

  test('the table is computed from the weights, not typed in beside them', () => {
    assert.deepEqual(effectiveWeights(), RARITY_EFFECTIVE_WEIGHT);
  });

  test('dust is worth more for a rarer duplicate, and forging costs more than one duplicate returns', () => {
    for (const r of RARITIES) {
      assert.ok(DUST_FROM_DUPLICATE[r] > 0);
      assert.ok(
        DUST_TO_FORGE[r] > DUST_FROM_DUPLICATE[r],
        `${r}: forging one costs less than a duplicate of one returns, which is a dust printer`,
      );
    }
  });
});

describe('the floors', () => {
  test('a mythic arrives by the thirtieth summon at the latest, whatever the rolls say', () => {
    let pity = NO_PITY;
    let mythicAt: number | null = null;
    for (let n = 1; n <= MYTHIC_PITY; n += 1) {
      // Roll 0 every time: the worst possible luck, forever.
      const d = drawSpirit(0, 0, pity);
      if (d.rarity === 'mythic' && mythicAt === null) mythicAt = n;
      pity = advancePity(pity, d.rarity);
    }
    assert.equal(mythicAt, MYTHIC_PITY, `a mythic should be guaranteed on summon ${MYTHIC_PITY}`);
  });

  test('a rare arrives by the tenth, and says it was the floor', () => {
    let pity = NO_PITY;
    let last = drawSpirit(0, 0, pity);
    for (let n = 1; n < RARE_PITY; n += 1) {
      assert.equal(last.rarity, 'common', `summon ${n} should still be common on roll 0`);
      pity = advancePity(pity, last.rarity);
      last = drawSpirit(0, 0, pity);
    }
    assert.equal(last.rarity, 'rare');
    assert.equal(last.byPity, 'rare');
  });

  test('the rare floor is a floor, not a ceiling: a mythic rolled on the same summon stands', () => {
    const pity: PityState = { sinceMythic: 3, sinceRare: RARE_PITY - 1 };
    const d = drawSpirit(9_900, 0, pity);
    assert.equal(d.rarity, 'mythic');
    assert.equal(d.byPity, null, 'the roll earned it, so the receipt must not credit the floor');
  });

  test('a mythic resets both counters; a rare resets only its own', () => {
    const start: PityState = { sinceMythic: 12, sinceRare: 4 };
    assert.deepEqual(advancePity(start, 'mythic'), { sinceMythic: 0, sinceRare: 0 });
    assert.deepEqual(advancePity(start, 'rare'), { sinceMythic: 13, sinceRare: 0 });
    assert.deepEqual(advancePity(start, 'common'), { sinceMythic: 13, sinceRare: 5 });
  });
});

describe('the draw itself', () => {
  test('the same inputs always give the same spirit - a receipt can be rechecked', () => {
    for (const [roll, pick] of [[42, 7], [6_001, 3], [8_750, 11], [9_999, 0]] as const) {
      const a = drawSpirit(roll, pick, NO_PITY);
      const b = drawSpirit(roll, pick, NO_PITY);
      assert.equal(a.spirit.key, b.spirit.key);
      assert.equal(a.rarity, b.rarity);
    }
  });

  test('the whole pool is reachable, so no spirit is decoration', () => {
    const reached = new Set<string>();
    for (let roll = 0; roll < WEIGHT_TOTAL; roll += 97) {
      for (let pick = 0; pick < 32; pick += 1) reached.add(drawSpirit(roll, pick, NO_PITY).spirit.key);
    }
    for (const s of SPIRITS) assert.ok(reached.has(s.key), `${s.key} can never be drawn`);
  });

  test('the drawn spirit always matches the drawn rarity', () => {
    for (let roll = 0; roll < WEIGHT_TOTAL; roll += 13) {
      const d = drawSpirit(roll, roll * 7, NO_PITY);
      assert.equal(d.spirit.rarity, d.rarity, `roll ${roll} drew a ${d.spirit.rarity} as a ${d.rarity}`);
    }
  });

  test('a huge pick index is still a real spirit', () => {
    const d = drawSpirit(0, 0xffff_ffff, NO_PITY);
    assert.ok(spiritFor(d.spirit.key), 'the pick ran off the end of the pool');
  });
});
