import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

import {
  HATCH_AT_PLACES, LAYERS_WITH_SPECIES, SPECIES, SPECIES_AS_OF,
  collectionSummary, companionsFor, stageFor,
  type HabitatEvidence,
} from './companions.ts';
import type { LayerKey } from './types.ts';

const ev = (layer: LayerKey, placesVisited = 0, questsVerified = 0): HabitatEvidence =>
  ({ layer, placesVisited, questsVerified });

describe('the stage is the evidence, not a purchase', () => {
  test('no evidence means no companion at all, not an empty egg', () => {
    assert.equal(stageFor(ev('Green')), null);
    assert.equal(companionsFor([ev('Green')]).length, 0);
  });

  test('one check-in earns the egg', () => {
    assert.equal(stageFor(ev('Green', 1)), 'egg');
  });

  test('breadth hatches it - a second PLACE, not a second visit', () => {
    // Standing in one spot and checking in twice is one place. The mechanic
    // has to reward covering the habitat, or it rewards loitering.
    assert.equal(stageFor(ev('Green', HATCH_AT_PLACES)), 'hatchling');
    assert.equal(stageFor(ev('Green', HATCH_AT_PLACES - 1)), 'egg');
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
    for (const [places, quests] of [[1, 0], [2, 0], [5, 0], [5, 1], [9, 3]] as const) {
      const stage = stageFor(ev('Green', places, quests))!;
      assert.ok(order[stage] >= previous, `${places}/${quests} went backwards to ${stage}`);
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

  test('the egg says how many more places, and counts down', () => {
    const one = companionsFor([ev('Green', 1)])[0]!;
    assert.match(one.nextStep!.en, new RegExp(String(HATCH_AT_PLACES - 1)));
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
