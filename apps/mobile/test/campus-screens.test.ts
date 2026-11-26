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
import { SeaAndSkyCard } from '../src/components/SeaAndSky.tsx';
import { BuildingsScreen } from '../src/screens/BuildingsScreen.tsx';
import { SamuiMap } from '../src/components/SamuiMap.tsx';
import { areaWords } from '../src/i18n/area-words.ts';
import { mountScreen, server } from './interact.ts';
import * as fx from './fixtures.ts';
import { __setAreaForTests } from '../src/state/area.ts';
import { AREAS } from '@chivago/core';

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

describe('the weather card inland', () => {
  /*
    Found on 26 November 2026 on the deployed app at RMUTT, after the fixes
    above: the card was still headed "Today's weather & sea", advised checking
    notices before sea travel, offered ferry status, and named a marine model
    in its source line - on a university forty kilometres from the coast.

    Every assertion here is on the words a reader sees, because that is where
    the bug was: the figures were right all along.
  */
  const reading = {
    provenance: 'live', observedAt: '2026-11-26T08:00:00.000Z',
    waveHeightM: null, wavePeriodS: null, tempC: 30.5, rainMm: 0, windKn: 1.6, weatherCode: 3,
  };
  /** What the server sends when it has no reading at all: island-worded, and no provider. */
  const noProvider = { ...reading, source: 'Open-Meteo · forecast and marine' };
  const atSea = /\bseas?\b|ferry|marine|navigation|เดินเรือ|ทะเล|คลื่น|เรือ/i;

  const cardFor = async (area: string, weather: unknown) => {
    restore = server({ [`/areas/${area}/weather`]: weather }).restore;
    const ui = await mountScreen(h(SeaAndSkyCard, { area: area as Parameters<typeof areaWords>[0]['key'] }));
    return ui;
  };

  for (const campus of AREAS.filter((a) => a.university)) {
    test(`${campus.key} is told nothing about the sea, a ferry or a marine model`, async () => {
      const ui = await cardFor(campus.key, { ...noProvider, provider: 'open-meteo', tmdCheck: 'agrees' });
      const said = ui.text();
      assert.match(said, /Today’s weather/, 'the card still has to name itself');
      assert.match(said, /30\.5/, "the reading is the feed's own");
      assert.match(said, /Weather alerts/, 'a weather warning still has to reach a campus');
      assert.match(said, /checked against TMD/, 'the cross-check still has to be named');
      assert.doesNotMatch(said, atSea, `${campus.key} is being addressed as a coast`);
      ui.unmount();
    });
  }

  test('a measured reading on a campus is not hung with a warning about sea travel', async () => {
    const ui = await cardFor('rmutt', { ...reading, source: 'x', provider: 'tmd-nwp', readingKind: 'observation' });
    const said = ui.text();
    assert.match(said, /Land conditions are observed by TMD\./);
    assert.match(said, /Thai Meteorological Department · location NWP/);
    assert.doesNotMatch(said, atSea);
    ui.unmount();
  });

  test('a quiet warning list on a campus mentions no ferry', async () => {
    const ui = await cardFor('rmutt', { ...reading, source: 'x', provider: 'open-meteo', officialAlertStatus: 'none' });
    const said = ui.text();
    assert.match(said, /No active TMD warning\./);
    assert.doesNotMatch(said, atSea);
    ui.unmount();
  });

  test('with no provider a campus does not borrow the island wording the server sent', async () => {
    const ui = await cardFor('rmutt', noProvider);
    const said = ui.text();
    assert.match(said, /Read from Open-Meteo\./);
    assert.doesNotMatch(said, atSea, "the server's own source line reached a campus");
    ui.unmount();
  });

  describe('and the island keeps every word of it', () => {
    test('the sea, the ferries, the marine model and the navigation warning', async () => {
      const ui = await cardFor('koh-sichang', {
        ...reading, source: 'Open-Meteo · forecast and marine', provider: 'open-meteo', tmdCheck: 'agrees',
        waveHeightM: 0.2, wavePeriodS: 4.4, officialAlertStatus: 'none',
      });
      const said = ui.text();
      assert.match(said, /Today’s weather & sea/);
      assert.match(said, /Alerts & ferry status/);
      assert.match(said, /Ferry status is not connected\./);
      assert.match(said, /Waves 0\.2 m/);
      assert.match(said, /before travelling by sea/, 'the island lost its navigation warning');
      assert.match(said, /weather forecast and marine model/, 'the island lost the marine model in its source');
      ui.unmount();
    });

    test('a measured reading keeps the sea-travel warning and the marine suffix', async () => {
      const ui = await cardFor('samui', { ...reading, source: 'x', provider: 'tmd-nwp', readingKind: 'observation' });
      const said = ui.text();
      assert.match(said, /Check official notices before sea travel\./);
      assert.match(said, /waves: Open-Meteo Marine/);
      ui.unmount();
    });
  });
});

describe('the campus directory', () => {
  /*
    The gap this closes: RMUTT had five seeded places on 1.23 km2 and not one
    faculty, so a student looking for คณะพยาบาลศาสตร์ found nothing at all.
  */
  const open = async () => {
    restore = server(routes([])).restore;
    return mountScreen(h(BuildingsScreen, { onBack: noop, onShowOnMap: noop }));
  };

  test('opens on every mapped building of the campus', async () => {
    __setAreaForTests('rmutt');
    const ui = await open();
    const said = ui.text();
    assert.match(said, /Faculty of Nursing/);
    assert.match(said, /Faculty of Engineering/);
    assert.match(said, /Student residence 1/);
    // The unnamed are listed as what they are, never with a name invented.
    assert.match(said, /Car park with no name on the map/);
    ui.unmount();
  });

  test('says plainly that it has no floor and no room', async () => {
    __setAreaForTests('rmutt');
    const ui = await open();
    assert.match(ui.text(), /A floor and a room number are not in OpenStreetMap/);
    // And when it was read, so the age of the reading is on screen.
    assert.match(ui.text(), /Read from OpenStreetMap on 2026-11-26/);
    ui.unmount();
  });

  test('every row carries the feature it was read from', async () => {
    __setAreaForTests('rmutt');
    const ui = await open();
    assert.match(ui.text(), /OpenStreetMap way 544939376/, 'a row that cannot be checked is a claim');
    ui.unmount();
  });

  test('typing narrows it, and the search box drives the list', async () => {
    __setAreaForTests('rmutt');
    const ui = await open();
    await ui.type('พยาบาล', /Search buildings/);
    const said = ui.text();
    assert.match(said, /Faculty of Nursing/);
    assert.doesNotMatch(said, /Student residence/, 'the search did not narrow anything');
    assert.match(said, /1 found/);
    ui.unmount();
  });

  test('an island is not offered a campus directory', async () => {
    __setAreaForTests('koh-sichang');
    const ui = await open();
    assert.match(ui.text(), /No building on this campus is mapped yet/);
    ui.unmount();
  });
});
describe('the building asked for, reaching the map', () => {
  /*
    FOUND ON THE LIVE SITE, within the hour the directory shipped: "See on the
    map" switched to the Map tab and drew nothing at all.

    The tab OPENS on the inline map, and only the expanded one had been given
    the buildings - while the fair's lots, which this was modelled on, are
    given to both. So the directory's one action did nothing unless somebody
    first thought to tap Expand, which is the kind of failure that reads as
    the button being dead.

    These assert the PROPS rather than a marker on purpose: the browser's
    MapLibre map needs a `document` this harness does not have, so no pin can
    be counted here (`map-pins.test.ts` says the same of itself). What can be
    held is that every map of the campus is told what to draw - which is the
    half that was wrong.
  */
  const campusMaps = async (extra: Record<string, unknown> = {}) => {
    restore = server(routes([])).restore;
    const ui = await mountScreen(h(MapScreen, { ...mapProps, ...extra }));
    return { ui, maps: ui.root.findAllByType(SamuiMap).map((n) => n.props as Record<string, any>) };
  };

  test('the map the tab opens on is given the buildings and the one asked for', async () => {
    __setAreaForTests('rmutt');
    const { ui, maps } = await campusMaps({ buildingFocus: { id: 'rmutt-nursing' } });
    // interactive={false} is the inline map: the one the Map tab shows first.
    const inline = maps.filter((p) => p.interactive !== true);
    assert.ok(inline.length > 0, 'the Map tab rendered no inline map to check');
    for (const p of inline) {
      assert.ok(p.buildings?.length, 'the map the tab opens on was given no buildings to draw');
      assert.equal(p.buildingFocus?.id, 'rmutt-nursing', 'it was not told which one was asked for');
    }
    ui.unmount();
  });

  /*
    The focus must not cross a campus. `buildingById` is a lookup over every
    campus at once, so a building asked for on one and then an area chip
    tapped to another would otherwise leave the second campus's map flying to
    a faculty seventy kilometres away - the island-pier mistake, again.
  */
  /*
    The flight needs the map that can fly. The inline map cannot be panned and
    does not fly for a focus, so a building shown there is named and no nearer;
    the expanded one is interactive, and its own back button is the way out -
    which also lets go of the building, because an ask left lying around opens
    this map full screen at somebody who has moved on.
  */
  test('asking for a building opens the map full screen', async () => {
    __setAreaForTests('rmutt');
    const { ui, maps } = await campusMaps({ buildingFocus: { id: 'rmutt-nursing' } });
    assert.ok(
      maps.some((p) => p.interactive === true),
      'the big map stayed shut, so nothing flew anywhere',
    );
    ui.unmount();
  });

  test('with no building asked for, it stays shut', async () => {
    __setAreaForTests('rmutt');
    const { ui, maps } = await campusMaps();
    assert.ok(maps.length > 0, 'no map rendered at all');
    assert.ok(
      !maps.some((p) => p.interactive === true),
      'the map opened full screen on its own',
    );
    ui.unmount();
  });

  test('closing it lets go of the building, so it does not reopen later', async () => {
    __setAreaForTests('rmutt');
    let letGo = 0;
    const { ui } = await campusMaps({
      buildingFocus: { id: 'rmutt-nursing' }, onClearBuilding: () => { letGo += 1; },
    });
    await ui.press('Back to map');
    assert.equal(letGo, 1, 'the ask outlived the map it was for');
    ui.unmount();
  });

  test('a building is not pointed at from an area it is not on', async () => {
    for (const [area, focus] of [
      ['ku-sriracha', { id: 'rmutt-nursing' }],
      ['samui', null],
    ] as const) {
      __setAreaForTests(area);
      const { ui, maps } = await campusMaps({ buildingFocus: focus });
      assert.ok(maps.length > 0, `${area} rendered no map`);
      for (const p of maps) {
        assert.equal(p.buildings, null, `${area} was handed campus buildings`);
        assert.equal(p.buildingFocus, null, `${area} was told to point at one`);
      }
      ui.unmount();
      restore?.(); restore = null;
    }
  });
});
