/**
 * A university, on the screens written for an island.
 *
 * Found on 26 November 2026 by opening the deployed app at RMUTT: Quests
 * offered Ko Sichang's five, the points card was headed "Today's Waves & Wind"
 * with two figures typed into the source, and the copy kept saying island.
 */
import { afterEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { act } from 'react-test-renderer';

import { MapScreen } from '../src/screens/MapScreen.tsx';
import { MissionsScreen } from '../src/screens/MissionsScreen.tsx';
import { mountScreen, server } from './interact.ts';
import * as fx from './fixtures.ts';
import { __setAreaForTests } from '../src/state/area.ts';

const noop = () => {};
const sichang = fx.quest({
  id: 'sg-1', code: 'SG-01', lat: 13.15, lng: 100.81,
  name: { en: 'Sichang Explorer', th: 'นักสำรวจเกาะสีชัง', zh: '锡昌岛探索家' },
});
const onCampus = fx.quest({
  id: 'rm-1', code: 'RM-01', lat: 14.0343, lng: 100.7255,
  name: { en: 'Library walk', th: 'เดินไปหอสมุด', zh: '步行去图书馆' },
});
const routes = (quests: unknown[]) => ({
  '/quests': { quests, progress: {} },
  '/standing': { hosts: [], you: { userId: 'u', displayName: 'U', greenVerified: 0, missionsVerified: 0 }, participants: 1, rankedBy: 'verified' },
  '/offers': [],
  '/places': [fx.place({ id: 'rmutt-library', province: 'TH-13', lat: 14.034289, lng: 100.7255474 })],
  '/shops': [],
  '/wallet': { balances: { green: 610, trip: 340 }, progression: null, ledger: [] },
});

let restore: (() => void) | null = null;
afterEach(() => { restore?.(); restore = null; __setAreaForTests('samui'); });

const mapProps = {
  layers: { Green: true, Wellness: true, Food: true, Safe: true, Quest: true },
  onToggleLayer: noop, onPlanDay: noop, onOpenPlace: noop, onOpenQuest: noop, onSeeAllQuests: noop,
  onAskConcierge: noop, onOpenWallet: noop,
  balances: { green: 120, trip: 340 },
};

const missions = { onOpen: noop, onOpenMarket: noop };

describe('Quests at RMUTT', () => {
  test("does not offer another place's quests", async () => {
    __setAreaForTests('rmutt');
    restore = server(routes([sichang])).restore;
    const ui = await mountScreen(h(MissionsScreen, missions));
    assert.doesNotMatch(ui.text(), /Sichang/);
    assert.match(ui.text(), /RMUTT has no quests yet/);
    ui.unmount();
  });

  test("shows the campus's own as soon as it has one", async () => {
    __setAreaForTests('rmutt');
    restore = server(routes([sichang, onCampus])).restore;
    const ui = await mountScreen(h(MissionsScreen, missions));
    assert.match(ui.text(), /Library walk/);
    assert.doesNotMatch(ui.text(), /Sichang Explorer/);
    assert.doesNotMatch(ui.text(), /island/i);
    ui.unmount();
  });

  test('follows the area when it changes while the screen is open', async () => {
    __setAreaForTests('koh-sichang');
    restore = server(routes([sichang, onCampus])).restore;
    const ui = await mountScreen(h(MissionsScreen, missions));
    assert.match(ui.text(), /Sichang Explorer/);
    await act(async () => { __setAreaForTests('rmutt'); });
    assert.match(ui.text(), /Library walk/);
    assert.doesNotMatch(ui.text(), /Sichang Explorer/);
    await act(async () => { __setAreaForTests('koh-sichang'); });
    assert.match(ui.text(), /Sichang Explorer/);
    ui.unmount();
  });

  test("the Games tab has no Ko Sichang story on a campus, and keeps it on the island", async () => {
    for (const [area, shown] of [['rmutt', false], ['koh-sichang', true]] as const) {
      __setAreaForTests(area);
      restore = server(routes([sichang])).restore;
      const ui = await mountScreen(h(MissionsScreen, missions));
      await ui.press('Games');
      assert.equal(/Adventure on Koh Sichang/.test(ui.text()), shown, area);
      ui.unmount();
      restore(); restore = null;
    }
  });

  test('Ko Sichang still opens on its own five', async () => {
    __setAreaForTests('koh-sichang');
    restore = server(routes([sichang, onCampus])).restore;
    const ui = await mountScreen(h(MissionsScreen, missions));
    assert.match(ui.text(), /Sichang Explorer/);
    ui.unmount();
  });
});

describe('the points card on the map', () => {
  test('is about points, and holds no figure nobody measured', async () => {
    __setAreaForTests('rmutt');
    restore = server(routes([])).restore;
    const ui = await mountScreen(h(MapScreen, mapProps));
    assert.doesNotMatch(ui.text(), /Waves & Wind|1,240 m|320 km/);
    ui.unmount();
  });

  test('lists no pier from an island seventy kilometres away', async () => {
    __setAreaForTests('rmutt');
    restore = server(routes([])).restore;
    const ui = await mountScreen(h(MapScreen, mapProps));
    assert.match(ui.text(), /Drop-off points[\s\S]*No drop-off point in this area yet/);
    assert.doesNotMatch(ui.text(), /Tha Lang|ท่าล่าง/);
    ui.unmount();
  });
});
