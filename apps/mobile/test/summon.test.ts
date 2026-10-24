import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

import {
  DUST_FROM_DUPLICATE, DUST_TO_FORGE, MYTHIC_PITY, RARE_PITY, RARITIES,
  RARITY_EFFECTIVE_PERCENT, RARITY_EFFECTIVE_WEIGHT, RARITY_PERCENT, RARITY_WEIGHT,
  SPIRITS, WEIGHT_TOTAL, type SpiritRarity,
} from '@chivago/core';
import { MascotMark } from '../src/components/MascotMark.tsx';
import { RulesPanel, SpiritCardView } from '../src/screens/SummonScreen.tsx';
import type { SpiritCard, SummonState } from '../src/api/client.ts';
import { h, html, labels } from './render.ts';

/**
 * Twenty-four invented creatures, drawn by the mascots' own renderer - and
 * a card that gives nothing away before it has been met.
 */

const card = (over: Partial<SpiritCard> = {}): SpiritCard => ({
  key: SPIRITS[0]!.key,
  court: SPIRITS[0]!.court,
  rarity: SPIRITS[0]!.rarity,
  held: 0,
  ...over,
});

const met = (key: string): SpiritCard => {
  const s = SPIRITS.find((x) => x.key === key)!;
  return { key: s.key, court: s.court, rarity: s.rarity, held: 1, name: s.name, creature: s.creature, lore: s.lore, form: s.form };
};

describe('every spirit has a mark', () => {
  test('all twenty-four draw through the mascot renderer', () => {
    for (const s of SPIRITS) {
      let out = '';
      assert.doesNotThrow(() => { out = html(h(MascotMark, { mascot: s.form })); }, `${s.key} threw`);
      assert.ok(out.length > 200, `${s.key} drew nothing`);
    }
  });
});

describe('a card says nothing before it has been met', () => {
  /*
    The province mascots show everything, because an emblem is printed on a
    seal and hiding it would hide nothing. A spirit is invented, so its name
    and its line are the only thing a first meeting has - and a guide that
    listed them all would spend that before anybody played.
  */
  test('an unmet card carries no name, no creature and no lore', () => {
    const out = html(h(SpiritCardView, { card: card({ held: 0 }) }));
    const s = SPIRITS[0]!;
    assert.ok(!out.includes(s.name.en), 'an unmet spirit was named');
    assert.ok(!out.includes(s.creature.en), 'an unmet spirit named what it is');
    assert.ok(!out.includes(s.lore.en), 'an unmet spirit printed its line');
    assert.ok(out.includes('???'), 'an unmet card should read as a gap in the shelf');
  });

  test('an unmet card still says its rarity and its court, because those are published', () => {
    const spoken = labels(h(SpiritCardView, { card: card({ held: 0, rarity: 'mythic', court: 'dusk' }) })).join(' ');
    assert.match(spoken, /Not yet met/i);
    assert.match(spoken, /Mythic/i);
    assert.match(spoken, /Dusk/i);
  });

  test('a met card carries the name and the creature', () => {
    const s = SPIRITS[0]!;
    const out = html(h(SpiritCardView, { card: met(s.key) }));
    assert.ok(out.includes(s.name.en), 'a met spirit is still hidden');
    assert.ok(out.includes(s.creature.en));
  });

  test('every rarity draws a card without throwing', () => {
    for (const rarity of RARITIES as readonly SpiritRarity[]) {
      const one = SPIRITS.find((s) => s.rarity === rarity)!;
      assert.doesNotThrow(() => html(h(SpiritCardView, { card: met(one.key) })), `${rarity} threw`);
      assert.doesNotThrow(() => html(h(SpiritCardView, { card: card({ rarity, held: 0 }) })), `unmet ${rarity} threw`);
    }
  });
});

describe('the odds the screen prints are the odds a player meets', () => {
  /*
    The panel used to print the ROLL BAND under the word "odds" - 3% mythic,
    against about 5% once the floors are counted (docs/68). The server now
    sends both, `rates` being the one a player meets, and this holds the
    screen to printing that one.

    Rendered, not inspected: the number has to reach the text a thumb is
    held over, and a test that read `rules.rates` straight back would have
    passed on the old screen too.
  */
  const rules = (): SummonState['rules'] => ({
    rates: RARITY_EFFECTIVE_PERCENT,
    effectiveWeights: RARITY_EFFECTIVE_WEIGHT,
    rollBand: RARITY_PERCENT,
    weights: RARITY_WEIGHT,
    weightTotal: WEIGHT_TOTAL,
    pity: { mythic: MYTHIC_PITY, rare: RARE_PITY },
    dustFromDuplicate: DUST_FROM_DUPLICATE,
    dustToForge: DUST_TO_FORGE,
    charmsFrom: { verifiedQuest: 1, checkinDay: 1 },
    epochHours: 24,
    notice: { en: 'x', th: 'x' },
  });

  test('every rarity shows its effective rate, floors included', () => {
    const out = html(h(RulesPanel, { rules: rules() }));
    for (const r of RARITIES) {
      assert.ok(
        out.includes(`${RARITY_EFFECTIVE_PERCENT[r]}%`),
        `${r}: the panel does not print its effective rate (${RARITY_EFFECTIVE_PERCENT[r]}%)`,
      );
    }
    assert.ok(out.includes('5.01%'), 'the mythic rate on screen is not the one a player meets');
    assert.ok(/floors included/i.test(out), 'the heading does not say the floors are in the table');
  });

  test('the roll band is printed too, and labelled as one roll', () => {
    const out = html(h(RulesPanel, { rules: rules() }));
    assert.ok(/One roll on its own/i.test(out), 'the roll band is not named on the screen');
    for (const r of RARITIES) {
      assert.ok(out.includes(`${RARITY_PERCENT[r]}%`), `${r}: the roll band is missing from the panel`);
    }
  });

  test('a mythic reads higher than its roll band, which is the whole correction', () => {
    const out = html(h(RulesPanel, { rules: rules() }));
    const shown = out.match(/(\d+(?:\.\d+)?)%/g) ?? [];
    assert.ok(shown.includes('5.01%') && shown.includes('3%'), `both mythic numbers should be on screen: ${shown.join(' ')}`);
    assert.ok(
      RARITY_EFFECTIVE_PERCENT.mythic > RARITY_PERCENT.mythic,
      'if these are ever equal the floors stopped working, not the screen',
    );
  });
});
