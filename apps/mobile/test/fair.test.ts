/**
 * A fair's market, lot by lot (docs/66): the directory screen, its card on
 * Home, and the lot handed to the Map tab.
 *
 * Outside a browser the campus has no map, so the map's side is read from the
 * banner; the MapLibre dots and the flight are checked by hand in Chrome.
 */
import { afterEach, describe, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { Linking } from 'react-native';
import type { Fair, FairLot } from '@chivago/core';
import { mountScreen, server } from './interact.ts';
import * as fx from './fixtures.ts';
import { __setLocaleForTests } from '../src/i18n/locale.ts';
import { __setAreaForTests } from '../src/state/area.ts';
import { FairScreen } from '../src/screens/FairScreen.tsx';
import { HomeScreen } from '../src/screens/HomeScreen.tsx';
import { MapScreen } from '../src/screens/MapScreen.tsx';

const noop = () => {};
let restore: (() => void) | null = null;
afterEach(() => { restore?.(); restore = null; __setAreaForTests('samui'); __setLocaleForTests('en'); });

describe('the fair directory', () => {
  test('it says what it is, that the plan is an example, and lists every stall', async () => {
    __setLocaleForTests('en');
    __setAreaForTests('rmutt');
    const ui = await mountScreen(h(FairScreen, { onBack: noop, onShowOnMap: noop }));
    const said = ui.text();
    assert.match(said, /RMUTT agricultural fair/);
    assert.match(said, /Example plan · not the organiser's plan yet/, 'no published plan: the screen says so first');
    assert.match(said, /Dates to be announced/);
    assert.match(said, /35 stalls in 40 lots/);
    ui.unmount();
  });

  test('typing what a stall sells finds it, and a lot number finds the lot however it is typed', async () => {
    __setLocaleForTests('en');
    __setAreaForTests('rmutt');
    const ui = await mountScreen(h(FairScreen, { onBack: noop, onShowOnMap: noop }));
    await ui.type('ทุเรียน');
    assert.match(ui.text(), /1 found/);
    assert.match(ui.text(), /กล้าไม้ผล/);
    assert.match(ui.text(), /Lot A01/);
    await ui.type('a5');
    assert.match(ui.text(), /Lot A05/);
    assert.match(ui.text(), /ปุ๋ยและดินปลูก/);
    await ui.type('ไม่มีของแบบนี้แน่นอน');
    assert.match(ui.text(), /Nothing for "ไม่มีของแบบนี้แน่นอน"/);
    ui.unmount();
  });

  test('a zone chip narrows the list to that part of the fair', async () => {
    __setLocaleForTests('en');
    __setAreaForTests('rmutt');
    const ui = await mountScreen(h(FairScreen, { onBack: noop, onShowOnMap: noop }));
    await ui.pressText(/C · Food and drinks/);
    const said = ui.text();
    assert.match(said, /ไก่ย่างส้มตำ/);
    assert.doesNotMatch(said, /กล้าไม้ผล/, 'a plant stall is not in the food zone');
    ui.unmount();
  });

  test('"Show on the map" hands the lot over, and a stall that takes orders opens สั่งก่อน', async () => {
    __setLocaleForTests('en');
    __setAreaForTests('rmutt');
    const shown: [Fair, FairLot][] = [];
    const opened = mock.method(Linking, 'openURL', async () => true);
    const ui = await mountScreen(h(FairScreen, { onBack: noop, onShowOnMap: (f: Fair, l: FairLot) => { shown.push([f, l]); } }));
    try {
      await ui.type('มาม่า');
      await ui.pressText('Show on the map');
      assert.deepEqual(shown.map(([f, l]) => [f.id, l.code]), [['rmutt-agri-fair', 'C09']]);
      await ui.pressText('Order ahead');
      assert.deepEqual(opened.mock.calls.map((c) => c.arguments[0]), ['https://sangkon.fly.dev/s/demo']);
    } finally { ui.unmount(); opened.mock.restore(); }
  });
});

describe('the fair on Home', () => {
  const homeProps = {
    onOpenMap: noop, onOpenQuests: noop, onOpenQuest: noop, onOpenWallet: noop,
    onOpenPassport: noop, onOpenImpact: noop, onOpenConcierge: noop, onOpenSafety: noop,
    onOpenParty: noop, onOpenProfile: noop, now: new Date('2026-10-06T05:00:00Z'),
  };

  test('at RMUTT the fair is a card at the top, one tap from its directory', async () => {
    __setLocaleForTests('en');
    __setAreaForTests('rmutt');
    let opened = 0;
    const s = server({ '/places': [], 'GET /places/rmutt-canteen/stalls': { provider: 'sangkon', provenance: 'live', observedAt: new Date().toISOString(), source: 'x', stalls: [] } });
    restore = s.restore;
    const ui = await mountScreen(h(HomeScreen, { ...homeProps, onOpenFair: () => { opened += 1; } }));
    const said = ui.text();
    assert.match(said, /RMUTT agricultural fair/);
    assert.ok(said.indexOf('RMUTT agricultural fair') < said.indexOf('Order food ahead'), 'first under the header');
    await ui.press(/RMUTT agricultural fair/);
    assert.equal(opened, 1);
    ui.unmount();
  });

  test('on the island there is no fair, and no card', async () => {
    __setLocaleForTests('en');
    __setAreaForTests('samui');
    const s = server({ '/places': [fx.place({ province: 'TH-84' })] });
    restore = s.restore;
    const ui = await mountScreen(h(HomeScreen, { ...homeProps, onOpenFair: noop }));
    assert.doesNotMatch(ui.text(), /agricultural fair/);
    ui.unmount();
  });
});

describe('the lot on the Map tab', () => {
  const mapProps = {
    layers: { Green: true, Wellness: true, Food: true, Safe: true, Quest: true },
    onToggleLayer: noop, onPlanDay: noop, onOpenPlace: noop, onOpenQuest: noop, onSeeAllQuests: noop,
    onAskConcierge: noop, onOpenWallet: noop, onToast: noop,
    balances: { green: 0, trip: 0 },
  };

  test('the lot asked for is named above the map, and closing it gives the map back', async () => {
    __setLocaleForTests('en');
    __setAreaForTests('rmutt');
    let closed = 0;
    const s = server({ '/places': [] });
    restore = s.restore;
    const ui = await mountScreen(h(MapScreen, {
      ...mapProps, fairFocus: { fairId: 'rmutt-agri-fair', code: 'A05' }, onClearFair: () => { closed += 1; },
    }));
    assert.match(ui.text(), /Lot A05 · ปุ๋ยและดินปลูก/);
    assert.match(ui.text(), /Every lot of the fair is on the map/);
    await ui.press('Close');
    assert.equal(closed, 1);
    ui.unmount();
  });

  test('without a lot asked for, the campus map offers the fair\'s directory', async () => {
    __setLocaleForTests('en');
    __setAreaForTests('rmutt');
    let opened = 0;
    const s = server({ '/places': [] });
    restore = s.restore;
    const ui = await mountScreen(h(MapScreen, { ...mapProps, onOpenFair: () => { opened += 1; } }));
    await ui.pressText(/Find stalls and lots/);
    assert.equal(opened, 1);
    assert.doesNotMatch(ui.text(), /Lot A05/);
    ui.unmount();
  });
});
