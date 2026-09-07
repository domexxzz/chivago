/**
 * The campus on Home.
 *
 * Two areas, one screen. The API answers with every place; Home frames the
 * one chosen - by the chip, or by the QR code's `?area=`. A judge at the
 * campus who sees Chaweng Beach in "Conditions" has been shown the wrong
 * island, and that is what these hold shut.
 */
import { describe, test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';

import { HomeScreen } from '../src/screens/HomeScreen.tsx';
import { MapScreen } from '../src/screens/MapScreen.tsx';
import { mountScreen, server } from './interact.ts';
import * as fx from './fixtures.ts';
import { __setAreaForTests } from '../src/state/area.ts';

const noop = () => {};
const props = {
  onOpenMap: noop, onOpenQuests: noop, onOpenQuest: noop, onOpenWallet: noop,
  onOpenPassport: noop, onOpenImpact: noop, onOpenConcierge: noop, onOpenSafety: noop,
  onOpenParty: noop, onOpenProfile: noop,
  now: new Date('2026-09-02T02:00:00Z'),
};

const campusPark = () => fx.place({
  id: 'ku-park',
  name: { en: 'Campus park and lake', th: 'สวนและบึงในมหาวิทยาลัย' },
  short: 'Park',
  // A real layer: the Map tab shows a place only through its layer's chip,
  // and the fixture's default is a name no chip has.
  layer: 'Green',
  province: 'TH-20',
  lat: 13.12154,
  lng: 100.91812,
});

const routes = () => ({
  '/places': [fx.place({ layer: 'Safe' }), campusPark()],
  '/quests?filter=today': {
    quests: [
      fx.quest(),
      fx.quest({
        id: 'q7', code: 'KU-01',
        name: { en: 'Campus clean-up at Sapandao', th: 'เก็บขยะรอบจุดชมวิวสะพานดาว' },
        where: { en: 'Sapandao viewpoint, KU Sriracha', th: 'จุดชมวิวสะพานดาว มก. ศรีราชา' },
        host: { id: 'h-ku-chivago', name: 'ChivaGo team · KU Sriracha', type: 'community' },
        lat: 13.12189, lng: 100.92055,
      }),
    ],
    progress: {},
  },
  '/wallet': { balances: { green: 120, trip: 340 }, progression: null, ledger: [] },
  '/passport': { visited: ['TH-84'] },
  '/companions': { companions: [], summary: { found: 2, total: 5, grown: 1 }, speciesAsOf: '2026-09-01' },
});

let restore: (() => void) | null = null;
afterEach(() => { restore?.(); restore = null; __setAreaForTests('samui'); });

describe('Home frames one area', () => {
  test('on the island it shows the island, and not the campus', async () => {
    __setAreaForTests('samui');
    const s = server(routes()); restore = s.restore;
    const ui = await mountScreen(h(HomeScreen, props));
    const said = ui.text();
    assert.match(said, /Koh Samui/);
    assert.match(said, /Chaweng/);
    assert.doesNotMatch(said, /Campus park/, 'a campus place on the island screen');
    assert.doesNotMatch(said, /Campus clean-up/, 'a campus quest on the island screen');
    ui.unmount();
  });

  test('on the campus it shows the campus, and not the island', async () => {
    __setAreaForTests('ku-sriracha');
    const s = server(routes()); restore = s.restore;
    const ui = await mountScreen(h(HomeScreen, props));
    const said = ui.text();
    assert.match(said, /KU Sriracha/);
    assert.match(said, /Campus park/);
    assert.match(said, /Campus clean-up/);
    assert.doesNotMatch(said, /Chaweng/, 'an island place on the campus screen');
    assert.match(said, /1 measured place/, 'the average is of the campus only');
    ui.unmount();
  });

  test('the chip changes the area', async () => {
    __setAreaForTests('samui');
    const s = server(routes()); restore = s.restore;
    const ui = await mountScreen(h(HomeScreen, props));
    await ui.pressText(/KU Sriracha/);
    assert.match(ui.text(), /Campus park/);
    assert.doesNotMatch(ui.text(), /Chaweng/);
    ui.unmount();
  });
});

/*
  The Map tab. The one screen where the area is a frame in the literal
  sense: the web map is built with the area's box as the edge it cannot
  scroll past. A chip that changed the pins but left the frame on the island
  was what the screenshot of 7 September showed - "KU Sriracha" in the
  header over a map of Samui.

  Outside a browser the campus is its list (docs/43), which is what these
  read; the MapLibre frame itself is checked by hand in Chrome, because
  nothing here has a GL context.
*/
const mapProps = {
  layers: { Green: true, Wellness: true, Food: true, Safe: true, Quest: true },
  onToggleLayer: noop, onPlanDay: noop, onOpenPlace: noop, onOpenQuest: noop, onSeeAllQuests: noop,
  onAskConcierge: noop, onOpenWallet: noop,
  balances: { green: 120, trip: 340 },
};

describe('the Map tab frames one area', () => {
  test('on the campus it shows the campus places, and not the island’s', async () => {
    __setAreaForTests('ku-sriracha');
    const s = server(routes()); restore = s.restore;
    const ui = await mountScreen(h(MapScreen, mapProps));
    const said = ui.text();
    assert.match(said, /KU Sriracha/, 'the header names the campus');
    assert.match(said, /Campus park/, 'the campus place is on the map');
    assert.match(said, /Campus clean-up/, 'the campus quest is in the rail');
    assert.doesNotMatch(said, /Chaweng/, 'an island place on the campus map');
    assert.doesNotMatch(said, /No places/, 'five places are here; nothing is empty');
    ui.unmount();
  });

  test('the chip on the map changes the area, header, places and quests together', async () => {
    __setAreaForTests('samui');
    const s = server(routes()); restore = s.restore;
    const ui = await mountScreen(h(MapScreen, mapProps));
    assert.match(ui.text(), /Koh Samui/);
    assert.match(ui.text(), /Beach clean-up|Beach Cleanup/i, 'an island quest before the switch');
    await ui.pressText(/KU Sriracha/);
    const said = ui.text();
    assert.match(said, /KU Sriracha/);
    assert.match(said, /Campus park/);
    assert.match(said, /Campus clean-up/);
    assert.doesNotMatch(said, /Chaweng/);
    assert.doesNotMatch(said, /No places/);
    ui.unmount();
  });

  test('an area the API has no places in says so, instead of blaming the layers', async () => {
    // The old message read "No places match the active layers" with every
    // layer on, which sent people to the chips to fix a list that was
    // simply empty.
    __setAreaForTests('ku-sriracha');
    const s = server({ ...routes(), '/places': [fx.place()] }); restore = s.restore;
    const ui = await mountScreen(h(MapScreen, mapProps));
    assert.match(ui.text(), /No places in this area yet/);
    assert.doesNotMatch(ui.text(), /active layers/);
    ui.unmount();
  });

  test('every layer off is the layers’ doing, and says so', async () => {
    __setAreaForTests('ku-sriracha');
    const s = server(routes()); restore = s.restore;
    const off = { Green: false, Wellness: false, Food: false, Safe: false, Quest: false };
    const ui = await mountScreen(h(MapScreen, { ...mapProps, layers: off }));
    assert.match(ui.text(), /No places match the active layers/);
    ui.unmount();
  });
});
