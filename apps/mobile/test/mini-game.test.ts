import { strict as assert } from 'node:assert';
import { test, describe, afterEach } from 'node:test';
import { createElement as h } from 'react';

import { MiniGameScreen } from '../src/screens/MiniGameScreen.tsx';
import { mountScreen } from './interact.ts';
import { __setLocaleForTests } from '../src/i18n/locale.ts';

/**
 * The frame around a mini-game.
 *
 * The game itself is a document and this harness has no browser to put it in,
 * so `react-native-webview` is stubbed down to an empty view. What is left to
 * test is everything the APP is responsible for: that a route naming a game
 * nobody has any more says so instead of showing a blank rectangle, and that
 * somebody reading the app in English is told the game is in Thai before they
 * open it rather than after.
 *
 * The page's own rules - no network, no medals, no balances - are held by
 * `src/games/mini-games.test.ts`, which can read the document directly.
 */

let restore: (() => void) | null = null;
afterEach(() => { restore?.(); restore = null; __setLocaleForTests('en'); });

describe('a mini-game opens inside the app', () => {
  test('a game that is no longer in the catalogue says so', async () => {
    // A pushed route outliving its entry is the ordinary case here: an old
    // link, or a game withdrawn in a release. A blank screen with a back
    // arrow is indistinguishable from one that failed to load.
    const ui = await mountScreen(h(MiniGameScreen, { gameKey: 'no-such-game', onBack: () => {} }));
    assert.match(ui.text(), /not here any more/);
    ui.unmount();
  });

  test('an empty key is the same thing, not a crash', async () => {
    // What the host passes when nothing was chosen.
    const ui = await mountScreen(h(MiniGameScreen, { gameKey: '', onBack: () => {} }));
    assert.match(ui.text(), /not here any more/);
    ui.unmount();
  });

  test('an English reader is told the game is Thai before opening it', async () => {
    __setLocaleForTests('en');
    const ui = await mountScreen(h(MiniGameScreen, { gameKey: 'waste-sort', onBack: () => {} }));
    assert.match(ui.text(), /This game is in Thai only/);
    ui.unmount();
  });

  test('a Thai reader is not told anything, because there is nothing to say', async () => {
    __setLocaleForTests('th');
    const ui = await mountScreen(h(MiniGameScreen, { gameKey: 'waste-sort', onBack: () => {} }));
    const said = ui.text();
    assert.ok(!said.includes('เกมนี้เป็นภาษาไทย'), 'the language note showed to a Thai reader');
    // And the frame is still there: the header, with its way back.
    assert.match(said, /มินิเกม/);
    ui.unmount();
  });
});
