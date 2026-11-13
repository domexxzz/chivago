/**
 * The traveller's box, as a screen.
 *
 * Every test here is about a NUMBER OR A NAME THE SCREEN PRINTS, because
 * that is where this screen can lie. A box that showed a price it does not
 * charge, a rate it does not meet, or a creature nobody has drawn would be
 * doing the thing `docs/68` spent a legal argument staying on the far side
 * of — and none of it would fail a typecheck.
 *
 * What the screen LOOKS like is not tested, and should not be. What it
 * SAYS is.
 */

import { strict as assert } from 'node:assert';
import { afterEach, describe, test } from 'node:test';
import { createElement as h } from 'react';

import {
  MYTHIC_PITY, POOL, PULL_COST, RARE_PITY, RARITIES,
  RARITY_EFFECTIVE_PERCENT, RARITY_PERCENT, ROLL_POOL, SPIRITS, TEN_PULL_COST, TEN_PULL_SIZE,
} from '@chivago/core';

import { SummonScreen } from '../src/screens/SummonScreen.tsx';
import { mountScreen, server } from './interact.ts';

const noop = () => {};

const state = (over: Record<string, unknown> = {}) => ({
  charms: { verifiedQuests: 2, checkinDays: 1, earned: 3, spent: 0, available: 3 },
  tripPoints: 1_200,
  price: { one: PULL_COST, ten: TEN_PULL_COST, tenSize: TEN_PULL_SIZE, currency: 'trip' },
  dust: 24,
  pity: { sinceMythic: 7, sinceRare: 2 },
  collected: 3,
  total: POOL.length,
  byRarity: Object.fromEntries(RARITIES.map((r) => [r, { held: 0, total: 1 }])),
  poolByRarity: Object.fromEntries(RARITIES.map((r) => [r, 1])),
  epoch: {
    id: 'e1', commitment: 'ab'.repeat(32), openedAt: '2026-11-12T00:00:00.000Z',
    closedAt: null, seed: null,
  },
  rules: {
    rates: RARITY_EFFECTIVE_PERCENT,
    effectiveWeights: Object.fromEntries(RARITIES.map((r) => [r, 2_500])),
    rollBand: RARITY_PERCENT,
    weights: Object.fromEntries(RARITIES.map((r) => [r, 2_500])),
    weightTotal: 10_000,
    pity: { mythic: MYTHIC_PITY, rare: RARE_PITY },
    dustFromDuplicate: Object.fromEntries(RARITIES.map((r) => [r, 5])),
    dustToForge: Object.fromEntries(RARITIES.map((r) => [r, 50])),
    charmsFrom: { verifiedQuest: 1, checkinDay: 1 },
    epochHours: 24,
    notice: { en: 'Nothing here is bought.', th: 'ไม่มีการซื้อ', zh: '这里不买卖。' },
  },
  ...over,
});

/** The guide as the server sends it: spirits silhouetted, fashion named. */
const collection = (over: { heldSpirit?: string } = {}) => ({
  spirits: SPIRITS.map((s) => (s.key === over.heldSpirit
    ? { key: s.key, court: s.court, rarity: s.rarity, held: 1, name: s.name, creature: s.creature, lore: s.lore, form: s.form }
    : { key: s.key, court: s.court, rarity: s.rarity, held: 0 })),
  fashion: ROLL_POOL.map((c) => ({
    key: c.key, rarity: 'common', held: 0, name: c.name, why: c.why,
  })),
});

const routes = (over: Record<string, unknown> = {}) => server({
  'GET /summon': state(),
  'GET /summon/collection': collection(),
  'GET /summon/history': { summons: [] },
  ...over,
});

let restore: (() => void) | null = null;
afterEach(() => { restore?.(); restore = null; });

describe('the price on each button is the server’s, never the screen’s arithmetic', () => {
  test('both buttons print their own published price', async () => {
    const net = routes();
    restore = net.restore;
    const ui = await mountScreen(h(SummonScreen, { onBack: noop }));
    const said = ui.labels().join(' | ');

    assert.match(said, new RegExp(`${PULL_COST} Trip Points`), 'the one-pull price is missing');
    assert.match(said, new RegExp(`${TEN_PULL_COST} Trip Points`), 'the ten-pull price is missing');
    ui.unmount();
  });

  test('the ten is the published ten-price, not ten times the one-price', async () => {
    // The whole reason the price comes down from the server: a screen doing
    // its own multiplication prints a total the server would refuse.
    const net = routes();
    restore = net.restore;
    const ui = await mountScreen(h(SummonScreen, { onBack: noop }));
    const said = ui.labels().join(' | ');

    assert.ok(TEN_PULL_COST < PULL_COST * TEN_PULL_SIZE);
    assert.doesNotMatch(said, new RegExp(`${PULL_COST * TEN_PULL_SIZE} Trip Points`));
    ui.unmount();
  });

  test('a pull sends the count it offered, and the ten sends ten', async () => {
    const net = routes({
      'POST /summon': { results: [], cost: TEN_PULL_COST, tripPoints: 300, dust: 24, pity: { sinceMythic: 0, sinceRare: 0 } },
    });
    restore = net.restore;
    const ui = await mountScreen(h(SummonScreen, { onBack: noop }));

    await ui.press(new RegExp(`^Pull ${TEN_PULL_SIZE}, `));
    const posted = net.calls.filter((c) => c.method === 'POST' && c.path === '/summon');
    assert.equal(posted.length, 1);
    assert.deepEqual(posted[0]!.body, { pulls: TEN_PULL_SIZE });
    ui.unmount();
  });
});

describe('a button nobody can afford says so, in words', () => {
  test('too few points disables both and announces why', async () => {
    const net = routes({ 'GET /summon': state({ tripPoints: 0 }) });
    restore = net.restore;
    const ui = await mountScreen(h(SummonScreen, { onBack: noop }));

    const one = ui.find(/^Pull once, /);
    assert.ok(one, 'the one-pull button is gone');
    assert.equal(one!.props.accessibilityState?.disabled, true);
    assert.match(
      ui.labels().join(' | '),
      /Not enough Trip Points yet/,
      'the refusal is carried by colour alone',
    );
    ui.unmount();
  });

  test('enough for one but not ten leaves exactly one of them open', async () => {
    const net = routes({ 'GET /summon': state({ tripPoints: PULL_COST }) });
    restore = net.restore;
    const ui = await mountScreen(h(SummonScreen, { onBack: noop }));

    assert.equal(ui.find(/^Pull once, /)?.props.accessibilityState?.disabled, false);
    assert.equal(ui.find(new RegExp(`^Pull ${TEN_PULL_SIZE}, `))?.props.accessibilityState?.disabled, true);
    ui.unmount();
  });
});

describe('what the box shows of itself', () => {
  test('Mascot and Fashion are real preview tabs, not decorative labels', async () => {
    const net = routes();
    restore = net.restore;
    const ui = await mountScreen(h(SummonScreen, { onBack: noop }));

    assert.equal(ui.find(/^Mascot reward preview$/)?.props.accessibilityState?.selected, true);
    assert.equal(ui.find(/^Fashion reward preview$/)?.props.accessibilityState?.selected, false);
    await ui.press(/^Fashion reward preview$/);
    assert.equal(ui.find(/^Mascot reward preview$/)?.props.accessibilityState?.selected, false);
    assert.equal(ui.find(/^Fashion reward preview$/)?.props.accessibilityState?.selected, true);
    ui.unmount();
  });

  test('an unmet spirit is never named in the featured panel', async () => {
    // The rule `collectionFor` keeps, and the featured grid is the panel
    // most tempted to break it: a named mythic nobody owns is a near-miss.
    const net = routes();
    restore = net.restore;
    const ui = await mountScreen(h(SummonScreen, { onBack: noop }));
    const said = `${ui.text()} | ${ui.labels().join(' | ')}`;

    for (const spirit of SPIRITS) {
      // Whole words, and only names long enough to be a name: one spirit is
      // called "No", and a substring search for it matches the word "Nothing"
      // in the screen's own copy.
      if (spirit.name.en.length < 4) continue;
      assert.doesNotMatch(
        said,
        new RegExp(`\\b${spirit.name.en.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`),
        `the box named ${spirit.name.en} before it was met`,
      );
    }
    assert.match(said, /Not yet met/, 'an unmet entry should say that it is unmet');
    ui.unmount();
  });

  test('a spirit that HAS been met is named, and its court is not the only thing said', async () => {
    const mythic = SPIRITS.find((s) => s.rarity === 'mythic')!;
    const net = routes({ 'GET /summon/collection': collection({ heldSpirit: mythic.key }) });
    restore = net.restore;
    const ui = await mountScreen(h(SummonScreen, { onBack: noop }));

    assert.ok(ui.text().includes(mythic.name.en), 'a met spirit is still hidden');
    ui.unmount();
  });

  test('the fashion is in the box too, by name', async () => {
    // The owner asked for one box holding both. A featured panel showing
    // only spirits would make the box look like it still held one thing.
    const net = routes();
    restore = net.restore;
    const ui = await mountScreen(h(SummonScreen, { onBack: noop }));
    const said = ui.text();

    assert.ok(
      ROLL_POOL.some((c) => said.includes(c.name.en)),
      'no costume is shown in the box',
    );
    ui.unmount();
  });
});

describe('the rates and the floor are the published ones', () => {
  test('every rarity prints the EFFECTIVE rate, not the roll band', async () => {
    const net = routes();
    restore = net.restore;
    const ui = await mountScreen(h(SummonScreen, { onBack: noop }));
    const said = ui.text();

    for (const rarity of RARITIES) {
      assert.ok(
        said.includes(`${RARITY_EFFECTIVE_PERCENT[rarity]}%`),
        `${rarity} does not print its effective rate`,
      );
    }
    // The correction docs/68 made: a mythic is met more often than its band.
    assert.ok(RARITY_EFFECTIVE_PERCENT.mythic > RARITY_PERCENT.mythic);
    ui.unmount();
  });

  test('the floor counts down from the real pity state', async () => {
    const net = routes({ 'GET /summon': state({ pity: { sinceMythic: 25, sinceRare: 6 } }) });
    restore = net.restore;
    const ui = await mountScreen(h(SummonScreen, { onBack: noop }));
    const said = `${ui.text()} | ${ui.labels().join(' | ')}`;

    assert.ok(said.includes(String(RARE_PITY - 6)), 'the rare floor is not counting down');
    assert.ok(said.includes(String(MYTHIC_PITY - 25)), 'the mythic floor is not counting down');
    ui.unmount();
  });

  test('the screen says money cannot buy a pull, and nor can Green Points', async () => {
    const net = routes();
    restore = net.restore;
    const ui = await mountScreen(h(SummonScreen, { onBack: noop }));
    const said = ui.text();

    assert.match(said, /Never with money/i);
    assert.match(said, /never with Green Points/i);
    ui.unmount();
  });
});
