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
 * Worth asserting: every habitat is on the screen whether found or not, an
 * egg keeps its secret, the big card names a real next step, and neither
 * balance reaches a screen that wears the game surface.
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

const opened: { companion: Companion | null; mascots: number; medals: number; passport: number; party: number } = {
  companion: null, mascots: 0, medals: 0, passport: 0, party: 0,
};
const props = {
  onOpenCompanion: (c: Companion) => { opened.companion = c; },
  onOpenMascots: () => { opened.mascots += 1; },
  onOpenMedals: () => { opened.medals += 1; },
  onOpenPassport: () => { opened.passport += 1; },
  onOpenParty: () => { opened.party += 1; },
};

let restore: (() => void) | null = null;
afterEach(() => {
  restore?.(); restore = null;
  Object.assign(opened, { companion: null, mascots: 0, medals: 0, passport: 0, party: 0 });
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
  test('every habitat is a tile before anything is found, and no egg names its animal', async () => {
    const s = server({ 'GET /companions': reply([]), 'GET /wallet': fx.wallet() }); restore = s.restore;
    const ui = await mountScreen(h(GameScreen, props));
    const said = ui.text();

    for (const species of Object.values(SPECIES)) {
      assert.ok(said.includes(species.eggName.en), `no tile for ${species.eggName.en}`);
      assert.ok(!said.includes(species.name.en), `the egg gave away ${species.name.en}`);
    }
    assert.match(said, /A companion arrives on your second day/);
    ui.unmount();
  });

  test('a found companion is a tile you can open, and the big card names its step', async () => {
    const turtle = companion('Safe', 'hatchling', 'Finish one quest a host verifies on this beach');
    const s = server({ 'GET /companions': reply([turtle]), 'GET /wallet': fx.wallet() }); restore = s.restore;
    const ui = await mountScreen(h(GameScreen, props));

    assert.match(ui.text(), /Finish one quest a host verifies on this beach/);
    await ui.press(/^Green sea turtle, Hatchling/);
    assert.equal(opened.companion?.species.key, 'green-turtle');
    ui.unmount();
  });

  test('the doors and the seventy-seven go where they say', async () => {
    const s = server({ 'GET /companions': reply([]), 'GET /wallet': fx.wallet() }); restore = s.restore;
    const ui = await mountScreen(h(GameScreen, props));
    await ui.press('Medals');
    await ui.press('Passport');
    await ui.press('Travelling with');
    await ui.press('The seventy-seven province emblems');
    assert.deepEqual(
      [opened.medals, opened.passport, opened.party, opened.mascots],
      [1, 1, 1, 1],
    );
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
    assert.match(said, /HABITATS/);
    assert.ok(!said.includes('Something broke'));
    ui.unmount();
  });
});
