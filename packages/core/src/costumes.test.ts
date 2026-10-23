import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

import {
  COSTUMES, ROLL_POOL, ROLLS_PER_VERIFIED_QUEST,
  costumeCollection, costumesCertifyNothing, costumesFor, nextCostumeStep,
  costumeAtPlace, rollsEarned, wearing,
} from './costumes.ts';
import { MASCOTS, mascotFor, type Mascot } from './mascots.ts';
import { SEED_PLACES } from './seed.ts';

const SAEN = mascotFor('TH-20')!;

/** The same mascot with the three slots a costume may touch blanked out. */
const withoutCosmetics = (m: Mascot) => ({
  ...m,
  prop: null,
  crest: 'none' as const,
  colours: { ...m.colours, accent: '' },
});

/**
 * The whole module rests on one claim: a costume certifies nothing. These
 * hold that claim from both ends - the costume cannot be bought, and it
 * cannot change anything a screen reads as evidence.
 */
describe('why rolling for one of these is allowed at all', () => {
  test('the invariant is stated in the code, not just the comments', () => {
    assert.equal(costumesCertifyNothing, true);
  });

  test('a costume only ever changes how a mascot LOOKS - all 77, all costumes', () => {
    // The real blast-radius proof, and it has to be stated as a SUBTRACTION
    // rather than a list of fields to check: blank the three cosmetic slots on
    // both sides and every other field must be deep-equal. Spot-checking
    // `code` and `basis` by name would not have noticed a costume that
    // quietly moved `ears`, `shape` or the body colour.
    for (const m of MASCOTS) {
      for (const costume of COSTUMES) {
        assert.deepEqual(
          withoutCosmetics(wearing(m, costume)),
          withoutCosmetics(m),
          `${costume.key} changed something non-cosmetic on ${m.key}`,
        );
      }
    }
  });

  test('MASCOTS is still the full seventy-seven the test above claims to cover', () => {
    assert.equal(MASCOTS.length, 77);
  });

  test('dressing a mascot never mutates the one in MASCOTS, for any costume', () => {
    const before = structuredClone(MASCOTS);
    for (const m of MASCOTS) for (const c of COSTUMES) wearing(m, c);
    assert.deepEqual(MASCOTS, before);
  });

  test('a dressed mascot shares no object with the one in MASCOTS', () => {
    // A shallow spread would hand back the very Bilingual objects in MASCOTS,
    // and one write to `dressed.name.en` would rewrite the province's emblem
    // for every screen in the process.
    for (const c of [null, ...COSTUMES]) {
      const dressed = wearing(SAEN, c);
      assert.notEqual(dressed, SAEN);
      assert.notEqual(dressed.name, SAEN.name);
      assert.notEqual(dressed.creature, SAEN.creature);
      assert.notEqual(dressed.why, SAEN.why);
      assert.notEqual(dressed.colours, SAEN.colours);
    }
  });

  test('wearing nothing gives the mascot back unchanged', () => {
    assert.deepEqual(wearing(SAEN, null), SAEN);
  });

  test('every costume says what it is drawn from, in both languages', () => {
    for (const c of COSTUMES) {
      assert.ok(c.why.en.length > 0, c.key + ' has no English basis');
      assert.ok(c.why.th.length > 0, c.key + ' has no Thai basis');
      assert.ok(c.name.th.length > 0, c.key + ' has no Thai name');
    }
  });

  test('no two costumes share a key', () => {
    assert.equal(new Set(COSTUMES.map((c) => c.key)).size, COSTUMES.length);
  });

  test('a costume changes at least one slot, or it is not a costume', () => {
    for (const c of COSTUMES) {
      const slots = [c.wears.prop, c.wears.crest, c.wears.accent].filter((s) => s !== undefined);
      assert.ok(slots.length > 0, c.key + ' wears nothing');
    }
  });
});

describe('what a roll costs', () => {
  test('a verified quest earns a roll', () => {
    assert.equal(rollsEarned(1), ROLLS_PER_VERIFIED_QUEST);
    assert.equal(rollsEarned(4), 4 * ROLLS_PER_VERIFIED_QUEST);
  });

  test('no deed, no roll - there is no free first pull', () => {
    // The free opening pull is the hook every gacha opens with. It is also
    // the one thing that would make this a slot machine rather than a
    // receipt: a costume nobody worked for cost nothing AND certifies
    // nothing, which is a prize the app handed out.
    assert.equal(rollsEarned(0), 0);
  });

  test('CostumeInput has no field a check-in or a payment could arrive in', () => {
    // Standing next to a problem is not doing anything about it - the same
    // rule monsters.ts applies to its deeds. Asserting that an input of zero
    // quests yields nothing proves nothing about check-ins, because there is
    // nowhere to put one; THAT is the property worth holding, so hold it on
    // the shape of the input rather than on one value.
    // An object LITERAL, so excess property checking applies - handing
    // `costumesFor` a variable would compile happily and prove nothing.
    assert.deepEqual(
      costumesFor({
        travellerKey: 'u1',
        questsVerified: 0,
        // @ts-expect-error - a check-in, a day and a currency are not inputs here.
        visitDays: 99,
        checkIns: 99,
        coins: 99,
      }),
      [],
    );
  });

  test('a nonsense count earns nothing instead of propagating', () => {
    for (const bad of [NaN, -1, -Infinity]) assert.equal(rollsEarned(bad), 0);
    assert.equal(rollsEarned(Infinity), 0);
    assert.deepEqual(costumesFor({ travellerKey: 'u1', questsVerified: NaN }), []);
  });

  test('a fractional count does not round up into a free roll', () => {
    assert.equal(rollsEarned(0.9), 0);
    assert.equal(rollsEarned(1.9), 1);
  });
});

describe('the draw', () => {
  test('the same traveller and the same deeds always give the same costumes', () => {
    // Derived, never stored - the same decision companionsFor makes. A roll
    // decided at tap time would have to be written down, and a second record
    // of a fact eventually disagrees with the first.
    const once = costumesFor({ travellerKey: 'u1', questsVerified: 3 });
    const twice = costumesFor({ travellerKey: 'u1', questsVerified: 3 });
    assert.deepEqual(once, twice);
  });

  test('a new roll never changes an old one, for any traveller at any step', () => {
    // Append-only, for the reason progression.ts gives about EXP: a
    // collection that can shift under its owner teaches them not to use it.
    // Checked across 500 keys and every step, because one key and one step
    // would pass even if the draw depended on the total.
    for (let k = 0; k < 500; k++) {
      const travellerKey = `u${k}`;
      let previous: string[] = [];
      for (let n = 0; n <= ROLL_POOL.length + 1; n++) {
        const now = costumesFor({ travellerKey, questsVerified: n }).map((a) => a.costume.key);
        assert.deepEqual(now.slice(0, previous.length), previous, `${travellerKey} at ${n}`);
        previous = now;
      }
    }
  });

  test('different travellers get different orders', () => {
    const a = costumesFor({ travellerKey: 'u1', questsVerified: 2 }).map((x) => x.costume.key);
    const b = costumesFor({ travellerKey: 'zz9', questsVerified: 2 }).map((x) => x.costume.key);
    assert.notDeepEqual(a, b);
  });

  test('a roll is never a duplicate, so no deed is ever wasted', () => {
    // Drawn without replacement. The duplicate is how a gacha extracts a
    // second payment for the same item; here the payment was a verified
    // quest, and charging twice for one costume would be charging twice for
    // real work.
    for (let k = 0; k < 500; k++) {
      const keys = costumesFor({ travellerKey: `u${k}`, questsVerified: ROLL_POOL.length })
        .map((a) => a.costume.key);
      assert.equal(new Set(keys).size, keys.length, `u${k} drew a duplicate`);
      assert.equal(keys.length, ROLL_POOL.length);
    }
  });

  test('the set completes in exactly as many deeds as it has costumes', () => {
    // No pity timer, because there is nothing to pity: the last costume is
    // guaranteed on the last deed rather than sitting behind a probability.
    const done = costumesFor({ travellerKey: 'u7', questsVerified: ROLL_POOL.length });
    assert.deepEqual(
      [...done.map((a) => a.costume.key)].sort(),
      [...ROLL_POOL.map((c) => c.key)].sort(),
    );
  });

  test('deeds past the end of the pool award nothing extra', () => {
    const over = costumesFor({ travellerKey: 'u7', questsVerified: ROLL_POOL.length + 20 });
    assert.equal(over.filter((a) => a.from === 'roll').length, ROLL_POOL.length);
  });

  test('a rolled award carries which deed number drew it', () => {
    const two = costumesFor({ travellerKey: 'u1', questsVerified: 2 });
    assert.deepEqual(two.map((a) => a.ordinal), [1, 2]);
  });
});

describe('the costumes a place grants, which are not rolled', () => {
  test('a place costume needs that place verified, not a roll', () => {
    const none = costumesFor({ travellerKey: 'u1', questsVerified: 50 });
    assert.equal(none.some((a) => a.from === 'place'), false);
  });

  test('verifying the place grants exactly its own costume', () => {
    const awarded = costumesFor({
      travellerKey: 'u1', questsVerified: 0, placesVerified: ['sc-palace'],
    });
    assert.deepEqual(awarded.map((a) => a.costume.placeId), ['sc-palace']);
    assert.deepEqual(awarded.map((a) => a.from), ['place']);
  });

  test('every place costume points at a place id', () => {
    for (const c of COSTUMES.filter((x) => x.source === 'place')) {
      assert.ok(c.placeId, c.key + ' is a place costume with no place');
    }
  });

  test('a rolled costume never claims a place', () => {
    for (const c of ROLL_POOL) assert.equal(c.placeId, undefined);
  });

  test('an unknown place id grants nothing and does not throw', () => {
    assert.deepEqual(
      costumesFor({ travellerKey: 'u1', questsVerified: 0, placesVerified: ['nope'] }),
      [],
    );
  });

  test('the two pools do not overlap', () => {
    const rolled = new Set(ROLL_POOL.map((c) => c.key));
    for (const c of COSTUMES.filter((x) => x.source === 'place')) {
      assert.equal(rolled.has(c.key), false, c.key + ' is in both pools');
    }
  });
});

describe('the collection, counted', () => {
  test('the denominator is every costume, not the ones reachable today', () => {
    // The same decision provinceCollection makes about 77 provinces: "2 of 2"
    // flatters the app and lies about the size of the thing being collected.
    const summary = costumeCollection(costumesFor({ travellerKey: 'u1', questsVerified: 1 }));
    assert.equal(summary.total, COSTUMES.length);
    assert.equal(summary.held, 1);
  });

  test('it splits what was rolled from what a place granted', () => {
    const summary = costumeCollection(costumesFor({
      travellerKey: 'u1', questsVerified: 2, placesVerified: ['sc-palace'],
    }));
    assert.equal(summary.rolled, 2);
    assert.equal(summary.fromPlaces, 1);
    assert.equal(summary.held, 3);
  });

  test('an empty collection counts zero and still knows the total', () => {
    const summary = costumeCollection([]);
    assert.equal(summary.held, 0);
    assert.equal(summary.total, COSTUMES.length);
  });
});

describe('what to do next', () => {
  test('somebody with no deeds is told the deed, never the odds', () => {
    const step = nextCostumeStep({ travellerKey: 'u1', questsVerified: 0 })!;
    assert.ok(step.th.length > 0);
    assert.doesNotMatch(step.en, /%|chance|odds|rate/i);
    assert.doesNotMatch(step.th, /%|โอกาส|อัตรา/);
  });

  test('a full collection has nothing left to say', () => {
    const placeIds = COSTUMES.filter((c) => c.source === 'place').map((c) => c.placeId!);
    const step = nextCostumeStep({
      travellerKey: 'u1', questsVerified: ROLL_POOL.length, placesVerified: placeIds,
    });
    assert.equal(step, null);
  });

  test('no step anywhere offers to sell a roll', () => {
    for (const quests of [0, 1, 3]) {
      const step = nextCostumeStep({ travellerKey: 'u1', questsVerified: quests });
      if (step) {
        assert.doesNotMatch(step.en, /buy|purchase|coin|gem|pay/i);
        assert.doesNotMatch(step.th, /ซื้อ|จ่าย|เพชร|เหรียญ/);
      }
    }
  });
});

describe('it fits the mascots that already exist', () => {
  test('every costume can be worn by all seventy-seven without error', () => {
    for (const m of MASCOTS) {
      for (const c of COSTUMES) {
        assert.equal(wearing(m, c).code, m.code);
      }
    }
  });

  test('a costume prop replaces the prop the mascot came with', () => {
    const withProp = COSTUMES.find((c) => c.wears.prop)!;
    assert.equal(wearing(SAEN, withProp).prop, withProp.wears.prop);
  });

  test('slots a costume leaves alone keep the value the mascot came with', () => {
    const propOnly = COSTUMES.find((c) => c.wears.prop && !c.wears.crest)!;
    assert.equal(wearing(SAEN, propOnly).crest, SAEN.crest);
  });
});

describe('the draw is not just stable, it is unbiased', () => {
  /**
   * The suite that was missing, and the reason it was missing matters: the
   * first roll of a biased draw looks perfect. Raw FNV-1a gave a clean 16.7%
   * on roll one while producing only 120 of the 720 possible orderings, and
   * `assert.notDeepEqual` on two hand-picked keys passed throughout.
   *
   * So the properties to hold are about the SHAPE of the whole distribution,
   * which is where a weak hash shows up.
   */
  const KEYS = 5_000;
  const orders: string[] = [];
  for (let k = 0; k < KEYS; k++) {
    orders.push(
      costumesFor({ travellerKey: `user-${k}`, questsVerified: ROLL_POOL.length })
        .map((a) => a.costume.key)
        .join('|'),
    );
  }

  test('most of the possible orderings actually occur', () => {
    // 6! = 720. Raw FNV-1a reached 120 of them; a mixed hash reaches all 720
    // given enough keys, and well over 700 at this sample size.
    assert.ok(new Set(orders).size > 700, `only ${new Set(orders).size} of 720 orderings`);
  });

  test('every costume is the LAST one drawn about equally often', () => {
    // The slot a weak hash skews hardest, because by then the modulus is 2.
    // Raw FNV-1a put two costumes last 26.7% of the time and one 8.4%.
    const expected = KEYS / ROLL_POOL.length;
    const tolerance = 4 * Math.sqrt(expected);
    for (const costume of ROLL_POOL) {
      const count = orders.filter((o) => o.endsWith(costume.key)).length;
      assert.ok(
        Math.abs(count - expected) < tolerance,
        `${costume.key} came last ${count} times, expected about ${expected}`,
      );
    }
  });

  test('no two roll positions are locked to each other', () => {
    // Raw FNV-1a tied roll 1 to roll 5, because only the ':i' suffix varies
    // between them and a decimal digit's low bit alternates with i. Six
    // first picks by five possible fifth picks is 30 combinations, and ALL of
    // them have to be reachable - the threshold is 30 and not "most", because
    // raw FNV-1a reaches 21, which "most" would have waved through.
    const pairs = new Set(
      orders.map((o) => {
        const picks = o.split('|');
        return picks[0]! + '>' + picks[4]!;
      }),
    );
    assert.equal(pairs.size, 30, `only ${pairs.size} of 30 first/fifth pairings are reachable`);
  });
});

describe('the draw is pinned, because changing it would reshuffle everybody', () => {
  /**
   * Golden vectors. Nothing else in the suite fails when the hash or the pool
   * order changes - every other property (no duplicates, append-only, full
   * set) holds just as well for a DIFFERENT draw. So without these, swapping
   * the hash would pass the whole file while silently reshuffling every
   * collection that already exists, which is exactly what the append-only
   * promise forbids.
   *
   * If one of these fails, the question is not "update the expected value".
   * It is "who already owns these costumes".
   */
  const PINNED: Record<string, readonly string[]> = {
    u1: ['field-notebook', 'refill-flask', 'tide-crest', 'deck-scarf', 'sorting-basket', 'sun-umbrella'],
    u7: ['sun-umbrella', 'refill-flask', 'deck-scarf', 'field-notebook', 'sorting-basket', 'tide-crest'],
    zz9: ['sun-umbrella', 'field-notebook', 'tide-crest', 'sorting-basket', 'refill-flask', 'deck-scarf'],
  };

  for (const [travellerKey, expected] of Object.entries(PINNED)) {
    test(`${travellerKey} draws the same six, in the same order, as the day this shipped`, () => {
      const keys = costumesFor({ travellerKey, questsVerified: ROLL_POOL.length })
        .map((a) => a.costume.key);
      assert.deepEqual(keys, expected);
    });
  }

  test('the pool is still the six these vectors were computed from', () => {
    assert.deepEqual(
      ROLL_POOL.map((c) => c.key),
      ['refill-flask', 'sorting-basket', 'sun-umbrella', 'deck-scarf', 'field-notebook', 'tide-crest'],
    );
  });

  test('a decomposed traveller key is the same person as a composed one', () => {
    const composed = 'ก้';
    const decomposed = composed.normalize('NFD');
    assert.deepEqual(
      costumesFor({ travellerKey: composed, questsVerified: 3 }).map((a) => a.costume.key),
      costumesFor({ travellerKey: decomposed, questsVerified: 3 }).map((a) => a.costume.key),
    );
  });
});

describe('the place costumes point at places that exist', () => {
  /**
   * `costumesFor` ignores an unknown place id on purpose, so a renamed seed
   * place would silently stop granting its costume and no screen would say
   * anything. These are the tests that turn that silence into a failure.
   */
  const placeCostumes = COSTUMES.filter((c) => c.source === 'place');
  const seedIds = new Set(SEED_PLACES.map((p) => p.id));

  test('every place costume names a place that is really in the seed', () => {
    for (const c of placeCostumes) {
      assert.ok(c.placeId, `${c.key} has no place`);
      assert.ok(seedIds.has(c.placeId!), `${c.key} points at missing place ${c.placeId}`);
    }
  });

  test('every one of them is on Koh Sichang', () => {
    for (const c of placeCostumes) {
      const place = SEED_PLACES.find((p) => p.id === c.placeId)!;
      assert.equal(place.province, 'TH-20', `${c.key} is not in Chon Buri`);
      assert.match(c.placeId!, /^sc-/, `${c.key} is not a Koh Sichang place`);
    }
  });

  test('no two place costumes claim the same place', () => {
    // BY_PLACE is a Map, so a duplicate would silently drop one of them.
    const ids = placeCostumes.map((c) => c.placeId);
    assert.equal(new Set(ids).size, ids.length);
  });

  test('the hospital grants nothing, and that is deliberate', () => {
    // It is on the map so somebody in trouble can find it. Making it a
    // collectible would be the wrong invitation.
    assert.ok(seedIds.has('sc-hospital'));
    assert.equal(costumeAtPlace('sc-hospital'), null);
  });

  test('costumeAtPlace agrees with the rows', () => {
    for (const c of placeCostumes) assert.equal(costumeAtPlace(c.placeId!)?.key, c.key);
    assert.equal(costumeAtPlace('sc-pier')?.key, 'pier-boat');
  });
});

describe('a costume cannot take a body part off', () => {
  const ANATOMICAL = ['wings', 'tusks', 'trunk'];

  test('the mascots that wear their own anatomy keep it', () => {
    // Both renderers draw wings, tusks and a trunk as the creature rather
    // than as something it holds, so overwriting the slot would remove a wing
    // from an emblem - which is not "changing how it looks".
    const anatomical = MASCOTS.filter((m) => m.prop && ANATOMICAL.includes(m.prop));
    assert.ok(anatomical.length > 0, 'no mascot carries anatomy any more - retire this test');

    for (const m of anatomical) {
      for (const c of COSTUMES) {
        assert.equal(wearing(m, c).prop, m.prop, `${c.key} stripped ${m.key} of its ${m.prop}`);
      }
    }
  });

  test('every other mascot does take the costume prop', () => {
    const ordinary = MASCOTS.find((m) => !m.prop || !ANATOMICAL.includes(m.prop))!;
    const withProp = COSTUMES.find((c) => c.wears.prop)!;
    assert.equal(wearing(ordinary, withProp).prop, withProp.wears.prop);
  });
});

describe('the cosmetic slots each actually apply', () => {
  test('an accent costume replaces colours.accent and nothing else in colours', () => {
    const accented = COSTUMES.find((c) => c.wears.accent)!;
    const dressed = wearing(SAEN, accented);
    assert.equal(dressed.colours.accent, accented.wears.accent);
    assert.equal(dressed.colours.body, SAEN.colours.body);
    assert.equal(dressed.colours.belly, SAEN.colours.belly);
    assert.equal(dressed.colours.feature, SAEN.colours.feature);
  });

  test('a crest costume replaces the crest', () => {
    const crested = COSTUMES.find((c) => c.wears.crest)!;
    assert.equal(wearing(SAEN, crested).crest, crested.wears.crest);
  });

  test('a costume that sets no accent leaves the accent the mascot came with', () => {
    const plain = COSTUMES.find((c) => !c.wears.accent)!;
    assert.equal(wearing(SAEN, plain).colours.accent, SAEN.colours.accent);
  });

  test('the rows are frozen, so a caller cannot edit the catalogue', () => {
    assert.throws(() => {
      // @ts-expect-error - readonly by type; frozen at runtime as well.
      COSTUMES[0]!.wears.prop = 'rocket';
    });
  });
});

describe('what to do next, through every branch', () => {
  test('it counts the costume you are working towards', () => {
    assert.match(nextCostumeStep({ travellerKey: 'u1', questsVerified: 0 })!.en, /1 of 6/);
    assert.match(nextCostumeStep({ travellerKey: 'u1', questsVerified: 3 })!.en, /4 of 6/);
    assert.match(nextCostumeStep({ travellerKey: 'u1', questsVerified: 3 })!.th, /4 จาก 6/);
  });

  test('with the pool finished it switches to the named places', () => {
    const step = nextCostumeStep({ travellerKey: 'u1', questsVerified: ROLL_POOL.length })!;
    assert.ok(step);
    assert.match(step.en, /place/i);
  });

  test('with the pool finished and one place left it still has something to say', () => {
    const all = COSTUMES.filter((c) => c.source === 'place').map((c) => c.placeId!);
    const step = nextCostumeStep({
      travellerKey: 'u1',
      questsVerified: ROLL_POOL.length,
      placesVerified: all.slice(1),
    });
    assert.notEqual(step, null);
  });

  test('a nonsense count asks for a quest, not for a place', () => {
    // The NaN bug: `left > 0` was false for NaN, so somebody with no verified
    // quests was told to go and finish a place costume.
    const step = nextCostumeStep({ travellerKey: 'u1', questsVerified: NaN })!;
    assert.match(step.en, /1 of 6/);
  });
});
