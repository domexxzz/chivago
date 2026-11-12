import { strict as assert } from 'node:assert';
import { test, describe, afterEach } from 'node:test';
import { createElement as h } from 'react';

import { SPECIES, type Companion, type CompanionStage, type LayerKey } from '@chivago/core';
import { GameScreen, nextUp } from '../src/screens/GameScreen.tsx';
import { mountScreen, server, refuses } from './interact.ts';
import * as fx from './fixtures.ts';

/**
 * The game lobby.
 *
 * Worth asserting: the big card names a real next step, the lobby doors work,
 * and neither balance reaches a screen that wears the game surface. The visual
 * collection itself now lives in My Backpack and has its own component tests.
 */

const companion = (layer: LayerKey, stage: CompanionStage, step: string | null = null): Companion => ({
  species: SPECIES[layer],
  stage,
  evidence: { layer, visitDays: 2, questsVerified: stage === 'grown' ? 1 : 0, walkedLegs: 0 } as never,
  nextStep: step === null ? null : { en: step, th: step },
});

const reply = (companions: Companion[]) => ({
  companions,
  summary: {
    found: companions.length,
    total: 5,
    grown: companions.filter((c) => c.stage === 'grown').length,
  },
  speciesAsOf: '2026-09-08',
});

const opened: {
  companion: Companion | null; mascots: number;
  party: number; wallet: number; fashion: number;
} = {
  companion: null, mascots: 0, party: 0, wallet: 0, fashion: 0,
};
const props = {
  onOpenCompanion: (c: Companion) => { opened.companion = c; },
  onOpenMascots: () => { opened.mascots += 1; },
  onOpenParty: () => { opened.party += 1; },
  onOpenWallet: () => { opened.wallet += 1; },
  onOpenFashion: () => { opened.fashion += 1; },
};

let restore: (() => void) | null = null;
afterEach(() => {
  restore?.(); restore = null;
  Object.assign(opened, { companion: null, mascots: 0, party: 0, wallet: 0, fashion: 0 });
});

describe('nextUp picks the companion with a step left', () => {
  test('a hatchling before an egg, because it is nearer to growing', () => {
    const egg = companion('Safe', 'egg', 'Spend a second day here');
    const hatchling = companion('Food', 'hatchling', 'Finish a verified quest here');
    assert.equal(nextUp([egg, hatchling]), hatchling);
  });

  test('nothing when nothing is waiting', () => {
    assert.equal(nextUp([]), null);
    assert.equal(nextUp([companion('Safe', 'grown')]), null);
  });
});

describe('the lobby', () => {
  test('the big card names its real next step and opens the companion', async () => {
    const turtle = companion('Safe', 'hatchling', 'Finish one quest a host verifies on this beach');
    const s = server({ 'GET /companions': reply([turtle]), 'GET /wallet': fx.wallet() }); restore = s.restore;
    const ui = await mountScreen(h(GameScreen, props));

    assert.match(ui.text(), /Finish one quest a host verifies on this beach/);
    await ui.press(/^Next up: Green sea turtle/);
    assert.equal(opened.companion?.species.key, 'green-turtle');
    ui.unmount();
  });

  test('the social door stays here while medals and passport move to Profile', async () => {
    const s = server({ 'GET /companions': reply([]), 'GET /wallet': fx.wallet() }); restore = s.restore;
    const ui = await mountScreen(h(GameScreen, props));
    await ui.press('Travelling with');
    assert.equal(opened.party, 1);
    assert.doesNotMatch(ui.text(), /Medals|Digital passport/);
    ui.unmount();
  });

  test('the header opens My Backpack, Mascot and Fashion', async () => {
    const s = server({ 'GET /companions': reply([]), 'GET /wallet': fx.wallet() }); restore = s.restore;
    const ui = await mountScreen(h(GameScreen, props));

    await ui.press('My Backpack');
    await ui.press('Mascot');
    await ui.press('Fashion');
    assert.deepEqual([opened.wallet, opened.mascots, opened.fashion], [1, 1, 1]);
    ui.unmount();
  });
});

describe('the level is here and the balances are not', () => {
  test('the level chip shows, and neither Green nor Trip balance does', async () => {
    // The wallet is read for its progression alone. The fixture's balances are
    // 1,240 Green and 320 Trip; on a game surface either would look like a score.
    const s = server({ 'GET /companions': reply([]), 'GET /wallet': fx.wallet() }); restore = s.restore;
    const ui = await mountScreen(h(GameScreen, props));
    const said = ui.text();

    assert.match(said, /Level \d+/);
    assert.ok(!said.includes('1,240') && !said.includes('1240'), 'the Green balance reached the game screen');
    assert.ok(!/\b320\b/.test(said), 'the Trip balance reached the game screen');
    ui.unmount();
  });

  test('a wallet that fails costs the chip, not the screen', async () => {
    const s = server({
      'GET /companions': reply([companion('Food', 'egg', 'Spend a second day here')]),
      'GET /wallet': refuses('INTERNAL', 'Something broke'),
    }); restore = s.restore;
    const ui = await mountScreen(h(GameScreen, props));
    const said = ui.text();

    assert.ok(!/Level \d+/.test(said));
    assert.match(said, /Collect & collections/);
    assert.ok(!said.includes('Something broke'));
    ui.unmount();
  });
});
