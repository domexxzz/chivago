import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

import { COSTUMES, MASCOTS, wearing, type Mascot } from '@chivago/core';

import { buildMascot } from './mascot-rig.ts';

/**
 * That a costume is actually VISIBLE in three dimensions.
 *
 * `costumes.ts` in core proves a costume changes only `prop`, `crest` and
 * `colours.accent`, and nothing there can prove the renderer then draws it -
 * so this is the other half, and it exists because of a misreading worth
 * recording.
 *
 * `head()` adds a prop to the head only when it is in a list of nine
 * head-worn ones; `bodyProp()` returns a prop only when it is NOT in that
 * same list, and every body builder calls it. The two conditions are
 * complementary halves of one dispatch, so EVERY prop is drawn - the list
 * decides whether it sits on the head or stands beside the creature. Read on
 * its own, the list looks exactly like a whitelist that silently drops
 * `pot`, `basket`, `book` and `boat`, which is what it was first taken for.
 *
 * These tests make the real behaviour fail loudly if it ever changes, so the
 * next reader does not have to re-derive it from two functions four lines
 * apart.
 */

const nodes = (m: Mascot): number => {
  let n = 0;
  buildMascot(m, 'grown').root.traverse(() => n++);
  return n;
};

/** A mascot carrying no prop of its own, so any prop in the rig is the costume's. */
const bare = MASCOTS.find((m) => m.prop === null)!;

describe('a costume prop reaches the scene graph', () => {
  test('there is a mascot with no prop of its own to dress', () => {
    assert.ok(bare, 'every mascot now carries a prop - this suite needs a new baseline');
    assert.equal(bare.prop, null);
  });

  test('every costume prop adds geometry, head-worn or body-standing', () => {
    // The assertion that would have caught a real whitelist: if `pot`,
    // `basket`, `book` or `boat` were dropped, dressing would add nothing
    // and the count would not move.
    const undressed = nodes(bare);
    for (const costume of COSTUMES) {
      if (!costume.wears.prop) continue;
      assert.ok(
        nodes(wearing(bare, costume)) > undressed,
        `${costume.key} (${costume.wears.prop}) drew nothing on ${bare.key}`,
      );
    }
  });

  test('the four props that looked dropped are the ones that stand with the body', () => {
    // Named explicitly, because these are the four the head list omits.
    const undressed = nodes(bare);
    for (const prop of ['pot', 'basket', 'book', 'boat'] as const) {
      const costume = COSTUMES.find((c) => c.wears.prop === prop);
      if (!costume) continue;
      assert.ok(nodes(wearing(bare, costume)) > undressed, `${prop} drew nothing`);
    }
  });

  test('a head-worn costume prop also adds geometry', () => {
    const undressed = nodes(bare);
    for (const prop of ['umbrella', 'scarf', 'lantern'] as const) {
      const costume = COSTUMES.find((c) => c.wears.prop === prop);
      if (!costume) continue;
      assert.ok(nodes(wearing(bare, costume)) > undressed, `${prop} drew nothing`);
    }
  });
});

describe('dressing never breaks a rig', () => {
  test('all seventy-seven build dressed in every costume', () => {
    for (const m of MASCOTS) {
      for (const costume of COSTUMES) {
        const rig = buildMascot(wearing(m, costume), 'grown');
        assert.ok(rig.root, `${m.key} in ${costume.key} built no root`);
        assert.ok(rig.lids.length > 0, `${m.key} in ${costume.key} lost its eyelids`);
      }
    }
  });

  test('a costume cannot take an elephant trunk or tusks away', () => {
    /**
     * The trunk and the tusks come from `m.key.includes('elephant')`, not
     * from the prop slot, so a costume cannot reach them.
     *
     * Counting nodes against the UNDRESSED elephant does not show this and
     * was the first thing tried: Chiang Mai's own prop is its Bo Sang
     * umbrella, a two-object group, so swapping it for a one-object pot drops
     * the total and the test failed while the trunk was still there. The
     * measurement has to isolate the branch instead - build the same dressed
     * creature with a key that does NOT summon it, and the difference is
     * exactly that anatomy.
     */
    for (const elephant of MASCOTS.filter((m) => m.key.includes('elephant'))) {
      for (const costume of COSTUMES) {
        const dressed = wearing(elephant, costume);
        const withoutTheBranch = { ...dressed, key: 'a-plain-beast' };
        assert.ok(
          nodes(dressed) > nodes(withoutTheBranch),
          `${costume.key} cost ${elephant.key} its trunk and tusks`,
        );
      }
    }
  });

  test('the three mascots whose prop IS their anatomy keep it', () => {
    // Only `wings` occurs as a mascot's own prop - the dragonfly, the
    // butterfly and the bee. `tusks` and `trunk` appear nowhere in the data.
    const winged = MASCOTS.filter((m) => m.prop === 'wings');
    assert.equal(winged.length, 3);
    for (const m of winged) {
      for (const costume of COSTUMES) assert.equal(wearing(m, costume).prop, 'wings');
    }
  });

  test('a costume DOES replace an emblem prop, which is recorded here on purpose', () => {
    // Chiang Mai's `why` line reads "the white elephant on the provincial
    // seal, under a Bo Sang umbrella", and the umbrella is in the prop slot.
    // A costume therefore covers part of the emblem the mascot is drawn from.
    // That is the current behaviour, deliberately pinned rather than left
    // implicit, because it is a product decision and not an accident: 49 of
    // the 77 carry no prop at all, so the alternative - costumes that fill
    // only an empty slot - would leave 28 mascots unable to wear most of the
    // set.
    const chiangmai = MASCOTS.find((m) => m.key === 'chiangmai-elephant')!;
    assert.equal(chiangmai.prop, 'umbrella');
    assert.match(chiangmai.why.en, /umbrella/i);

    const pot = COSTUMES.find((c) => c.wears.prop === 'pot')!;
    assert.equal(wearing(chiangmai, pot).prop, 'pot');
  });
});
