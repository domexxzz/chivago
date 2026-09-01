import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

import {
  HATCH_AT_DAYS, LAYERS_WITH_SPECIES, SPECIES, SPECIES_AS_OF,
  collectionSummary, companionsFor, stageFor,
  type HabitatEvidence,
} from './companions.ts';
import type { LayerKey } from './types.ts';
import { SEED_PLACES } from './seed.ts';

const ev = (layer: LayerKey, visitDays = 0, questsVerified = 0): HabitatEvidence =>
  ({ layer, visitDays, questsVerified });

describe('the stage is the evidence, not a purchase', () => {
  test('no evidence means no companion at all, not an empty egg', () => {
    assert.equal(stageFor(ev('Green')), null);
    assert.equal(companionsFor([ev('Green')]).length, 0);
  });

  test('one check-in earns the egg', () => {
    assert.equal(stageFor(ev('Green', 1)), 'egg');
  });

  test('coming back hatches it - a second DAY, not a second check-in', () => {
    // Standing in one spot and checking in twice in an afternoon is one day.
    // The mechanic has to reward returning, or it rewards loitering.
    assert.equal(stageFor(ev('Green', HATCH_AT_DAYS)), 'hatchling');
    assert.equal(stageFor(ev('Green', HATCH_AT_DAYS - 1)), 'egg');
  });

  test('only a HOST-verified quest grows it', () => {
    // The same standard Green Points hold: self-reported presence, however
    // much of it, never reaches the stage that means somebody vouched.
    assert.equal(stageFor(ev('Green', 50, 0)), 'hatchling');
    assert.equal(stageFor(ev('Green', 1, 1)), 'grown');
  });

  test('nothing moves a companion backwards', () => {
    // A collection that can shrink teaches people not to use the app - the
    // same reason spending points never lowers a level.
    const order = { egg: 0, hatchling: 1, grown: 2 };
    let previous = -1;
    for (const [days, quests] of [[1, 0], [2, 0], [5, 0], [5, 1], [9, 3]] as const) {
      const stage = stageFor(ev('Green', days, quests))!;
      assert.ok(order[stage] >= previous, `${days}/${quests} went backwards to ${stage}`);
      previous = order[stage];
    }
  });
});

describe('one species per habitat, and they are real', () => {
  test('every layer has exactly one species, and it knows its own layer', () => {
    for (const layer of LAYERS_WITH_SPECIES) {
      assert.equal(SPECIES[layer].layer, layer, `${layer} species is filed under the wrong habitat`);
    }
    assert.equal(
      new Set(LAYERS_WITH_SPECIES.map((l) => SPECIES[l].key)).size,
      LAYERS_WITH_SPECIES.length,
    );
  });

  test('each carries a scientific name, a habitat and a checkable fact', () => {
    // Invented monsters would have been easier and would have taught nothing.
    for (const layer of LAYERS_WITH_SPECIES) {
      const s = SPECIES[layer];
      assert.match(s.scientific, /^[A-Z][a-z]+ /, `${s.key} has no binomial`);
      assert.ok(s.habitat.th.length > 8, `${s.key} has no Thai habitat`);
      assert.ok(s.fact.en.length > 25, `${s.key} has no fact worth reading`);
      assert.ok(s.fact.th.length > 15, `${s.key} has no Thai fact`);
      // An egg names its habitat, never the layer key: "Safe egg" is the name
      // of a filter chip, not of anywhere a traveller has been.
      assert.ok(s.eggName.en.endsWith('egg'), `${s.key} egg is not named as one`);
      assert.doesNotMatch(s.eggName.en, new RegExp(`^${s.layer} `), `${s.key} egg is named after a filter`);
      assert.ok(s.eggName.th.startsWith('ไข่'), `${s.key} has no Thai egg name`);
      assert.notEqual(s.fact.en, s.fact.th, 'one language substituted for two');
    }
  });

  test('the conservation status carries a date, because it ages', () => {
    assert.match(SPECIES_AS_OF, /^\d{4}-\d{2}-\d{2}$/);
    for (const layer of LAYERS_WITH_SPECIES) {
      assert.ok(
        ['LC', 'NT', 'VU', 'EN', 'CR', 'NE'].includes(SPECIES[layer].status),
        `${layer} has a status outside the IUCN scale`,
      );
    }
  });

  test('both names are given in both languages', () => {
    for (const layer of LAYERS_WITH_SPECIES) {
      const s = SPECIES[layer];
      assert.ok(s.name.en.length > 3, `${s.key} has no English name`);
      assert.ok(s.name.th.length > 2, `${s.key} has no Thai name`);
    }
  });
});

describe('the collection, read from what happened', () => {
  test('only habitats with evidence appear', () => {
    const companions = companionsFor([ev('Green', 1), ev('Food', 3, 1)]);
    assert.deepEqual(companions.map((c) => c.species.layer).sort(), ['Food', 'Green']);
  });

  test('every unfinished companion says exactly what would move it on', () => {
    // A collection that shows a locked slot without saying why is a slot
    // machine with the lever hidden.
    for (const c of companionsFor([ev('Green', 1), ev('Food', 2)])) {
      assert.ok(c.nextStep, `${c.species.key} at ${c.stage} offers no next step`);
      assert.ok(c.nextStep!.th.length > 10, `${c.species.key} next step has no Thai`);
    }
  });

  test('a grown companion asks for nothing more', () => {
    const grown = companionsFor([ev('Safe', 2, 1)])[0]!;
    assert.equal(grown.stage, 'grown');
    assert.equal(grown.nextStep, null);
  });

  test('the egg says how many more days, and counts down', () => {
    const one = companionsFor([ev('Green', 1)])[0]!;
    assert.match(one.nextStep!.en, new RegExp(String(HATCH_AT_DAYS - 1)));
  });

  test('the summary counts found and grown against the full set', () => {
    const c = companionsFor([ev('Green', 1), ev('Food', 2), ev('Safe', 2, 1)]);
    assert.deepEqual(collectionSummary(c), {
      found: 3, total: LAYERS_WITH_SPECIES.length, grown: 1,
    });
  });

  test('an empty history is an empty collection, not five locked eggs', () => {
    assert.deepEqual(collectionSummary(companionsFor([])), {
      found: 0, total: LAYERS_WITH_SPECIES.length, grown: 0,
    });
  });
});

describe('the mechanic has to be completable on the island we ship', () => {
  test('every habitat has at least one place to check in at', () => {
    // The egg is offered per habitat. A habitat with no place in it is an egg
    // nobody can even start.
    for (const layer of LAYERS_WITH_SPECIES) {
      assert.ok(
        SEED_PLACES.some((p) => p.layer === layer),
        `${layer} offers an egg with nowhere to earn it`,
      );
    }
  });

  test('the hatch threshold is reachable with the places that exist', () => {
    // This is the test that was missing. Hatching used to need two distinct
    // PLACES in one habitat, and the seed has exactly one place per habitat,
    // so no egg could hatch - a mechanic on screen with nothing behind it.
    // The unit is days now, which one place can supply by being revisited, but
    // the guard belongs here permanently: whatever the unit becomes, the
    // island has to be able to produce it.
    for (const layer of LAYERS_WITH_SPECIES) {
      const places = SEED_PLACES.filter((p) => p.layer === layer).length;
      const reachable = HATCH_AT_DAYS;
      assert.ok(
        places >= 1 && reachable >= 1,
        `${layer} cannot reach the hatch threshold: ${places} place(s)`,
      );
      // Walk the real function, rather than trusting the arithmetic above.
      const hatched = stageFor({ layer, visitDays: HATCH_AT_DAYS, questsVerified: 0 });
      assert.equal(hatched, 'hatchling', `${layer} does not hatch at the threshold`);
    }
  });

  test('a single place, revisited, takes a companion all the way', () => {
    // The whole journey on one beach: first check-in, second day, one verified
    // quest. If any step here needs a second place, the seed cannot deliver it.
    const layer = LAYERS_WITH_SPECIES[0]!;
    assert.equal(stageFor({ layer, visitDays: 1, questsVerified: 0 }), 'egg');
    assert.equal(stageFor({ layer, visitDays: HATCH_AT_DAYS, questsVerified: 0 }), 'hatchling');
    assert.equal(stageFor({ layer, visitDays: HATCH_AT_DAYS, questsVerified: 1 }), 'grown');
  });
});
