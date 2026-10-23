import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

import { RARITIES, SPIRITS, type SpiritRarity } from '@chivago/core';
import { MascotMark } from '../src/components/MascotMark.tsx';
import { SpiritCardView } from '../src/screens/SummonScreen.tsx';
import type { SpiritCard } from '../src/api/client.ts';
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
