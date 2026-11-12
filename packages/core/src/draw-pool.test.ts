import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';

import { ROLL_POOL } from './costumes.ts';
import {
  MYTHIC_PITY, RARE_PITY, RARITIES, SPIRITS, drawSpirit, spiritsOfRarity,
  type PityState,
} from './spirits.ts';
import {
  COSTUME_RARITY, POOL, POOL_COUNT, POOL_VERSION, PULL_COST, PULL_CURRENCY,
  TEN_PULL_COST, TEN_PULL_SIZE, drawItem, itemFor, itemKey, itemsOfRarity, pullCost,
} from './draw-pool.ts';

const none: PityState = { sinceMythic: 0, sinceRare: 0 };

describe('the box holds decoration and nothing that certifies', () => {
  test('every entry is a spirit or a costume, and there are no others', () => {
    assert.equal(POOL.length, SPIRITS.length + ROLL_POOL.length);
    for (const entry of POOL) {
      assert.ok(entry.kind === 'spirit' || entry.kind === 'costume', `${itemKey(entry)} is neither`);
    }
  });

  test('nothing in the box carries a code, a binomial or a basis', () => {
    // Those three fields mark a thing that makes a claim: a province code, a
    // species' scientific name, where a mascot was drawn from. Rolling for
    // one of those would be handing out evidence.
    for (const entry of POOL) {
      const row = entry.kind === 'spirit' ? entry.spirit : entry.costume;
      for (const field of ['code', 'scientific', 'basis'] as const) {
        assert.ok(!(field in row), `${itemKey(entry)} carries ${field}`);
      }
    }
  });

  test('no companion, mascot or medal is reachable through a key collision', () => {
    const keys = POOL.map(itemKey);
    assert.equal(new Set(keys).size, keys.length, 'two entries share a key');
  });

  test('a pull can never be paid for with Green Points', () => {
    // The ESG currency. A figure an auditor is asked to trust cannot also be
    // spendable on a game; see the header of draw-pool.ts.
    assert.equal(PULL_CURRENCY, 'trip');
  });
});

describe('the rarities, and where the costumes sit in them', () => {
  test('every rolled costume has a rarity and none of them is mythic', () => {
    for (const costume of ROLL_POOL) {
      const rarity = COSTUME_RARITY[costume.key];
      assert.ok(rarity, `${costume.key} has no rarity`);
      assert.notEqual(rarity, 'mythic', `${costume.key} dilutes the rarest band`);
    }
  });

  test('the counts add up to the whole box', () => {
    assert.equal(
      RARITIES.reduce((n, r) => n + POOL_COUNT[r], 0),
      POOL.length,
    );
  });

  test('spirits keep their index inside a rarity, costumes come after', () => {
    for (const rarity of RARITIES) {
      const widened = itemsOfRarity(rarity);
      const spirits = spiritsOfRarity(rarity);
      spirits.forEach((spirit, index) => {
        const at = widened[index]!;
        assert.equal(at.kind, 'spirit');
        assert.equal(itemKey(at), spirit.key, `${rarity} index ${index} moved`);
      });
      for (const entry of widened.slice(spirits.length)) {
        assert.equal(entry.kind, 'costume', `${rarity} put a spirit after the costumes`);
      }
    }
  });
});

describe('an old receipt still recomputes to what it said', () => {
  test('version 1 draws the spirits alone, exactly as drawSpirit did', () => {
    // The promise `docs/68` makes is that a stranger with a receipt can
    // recheck it. Adding to the box would silently break every receipt
    // written before it if the version were not carried on the row.
    for (let nonce = 0; nonce < 400; nonce += 1) {
      const roll = (nonce * 977) % 10_000;
      const pick = (nonce * 65_537) % 4_294_967_296;
      const pity: PityState = { sinceMythic: nonce % 29, sinceRare: nonce % 9 };

      const then = drawSpirit(roll, pick, pity);
      const now = drawItem(roll, pick, pity, 1);

      assert.equal(now.rarity, then.rarity);
      assert.equal(now.byPity, then.byPity);
      assert.equal(now.item.kind, 'spirit');
      assert.equal(itemKey(now.item), then.spirit.key, `nonce ${nonce} recomputed differently`);
    }
  });

  test('a key is looked up within its own pool version', () => {
    assert.equal(itemFor('refill-flask', 1), undefined, 'a costume was not in the box at version 1');
    assert.equal(itemFor('refill-flask', 2)?.kind, 'costume');
    assert.equal(itemFor(SPIRITS[0]!.key, 1)?.kind, 'spirit');
  });
});

describe('the floors still hold, and they still hold over the wider pool', () => {
  test('a mythic is guaranteed on the pity pull, whatever the roll says', () => {
    const drawn = drawItem(0, 0, { sinceMythic: MYTHIC_PITY - 1, sinceRare: 0 });
    assert.equal(drawn.rarity, 'mythic');
    assert.equal(drawn.byPity, 'mythic');
    assert.equal(drawn.item.kind, 'spirit', 'the mythic band holds no costumes');
  });

  test('the rare floor guarantees rare OR BETTER, never clamping a mythic down', () => {
    const highRoll = 9_999; // mythic band
    const drawn = drawItem(highRoll, 0, { sinceMythic: 0, sinceRare: RARE_PITY - 1 });
    assert.equal(drawn.rarity, 'mythic');
    assert.equal(drawn.byPity, null, 'a mythic on a rare floor is not a pity rare');
  });

  test('no run of pulls ever goes longer than the published floors', () => {
    let pity = none;
    let sinceMythic = 0;
    let sinceRare = 0;
    for (let nonce = 1; nonce <= 5_000; nonce += 1) {
      const roll = (nonce * 7_919) % 10_000;
      const drawn = drawItem(roll, nonce * 31, pity);
      sinceMythic = drawn.rarity === 'mythic' ? 0 : sinceMythic + 1;
      sinceRare = drawn.rarity === 'mythic' || drawn.rarity === 'rare' ? 0 : sinceRare + 1;
      assert.ok(sinceMythic < MYTHIC_PITY, `went ${sinceMythic} without a mythic`);
      assert.ok(sinceRare < RARE_PITY, `went ${sinceRare} without a rare`);
      pity = {
        sinceMythic: drawn.rarity === 'mythic' ? 0 : pity.sinceMythic + 1,
        sinceRare: drawn.rarity === 'mythic' || drawn.rarity === 'rare' ? 0 : pity.sinceRare + 1,
      };
    }
  });

  test('both kinds actually come out of the box over a long run', () => {
    const seen = new Set<string>();
    let pity = none;
    for (let nonce = 1; nonce <= 20_000; nonce += 1) {
      const drawn = drawItem((nonce * 7_919) % 10_000, nonce * 2_654_435_761 % 4_294_967_296, pity);
      seen.add(itemKey(drawn.item));
      pity = {
        sinceMythic: drawn.rarity === 'mythic' ? 0 : pity.sinceMythic + 1,
        sinceRare: drawn.rarity === 'mythic' || drawn.rarity === 'rare' ? 0 : pity.sinceRare + 1,
      };
    }
    for (const entry of POOL) {
      assert.ok(seen.has(itemKey(entry)), `${itemKey(entry)} never came out`);
    }
  });
});

describe('what a pull costs', () => {
  test('ten is cheaper than ten ones, and the discount is the published one', () => {
    assert.equal(pullCost(1), PULL_COST);
    assert.equal(pullCost(TEN_PULL_SIZE), TEN_PULL_COST);
    assert.ok(TEN_PULL_COST < PULL_COST * TEN_PULL_SIZE);
  });

  test('a nonsense count costs nothing rather than something negative', () => {
    assert.equal(pullCost(0), 0);
    assert.equal(pullCost(-5), 0);
  });

  test('the pool version shipped is the widened one', () => {
    assert.equal(POOL_VERSION, 2);
  });
});
