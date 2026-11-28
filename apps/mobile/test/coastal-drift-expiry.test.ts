/**
 * The forecast that was eleven days past a six-hour window.
 *
 * Found on the live site on 28 November 2026: the Map screen's third tab says
 * "พยากรณ์ขยะลอย", and behind it sat the run issued on 17 November with
 * `window: 6` - 279 hours of a six-hour statement about one tide and one
 * wind. Nothing failed and nothing warned, because a stale sidecar parses
 * exactly as well as a fresh one.
 *
 * The published file is the fixture here on purpose: it is the artefact that
 * shipped, and as long as nobody republishes it these tests describe what a
 * traveller actually met.
 */
import { after, afterEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { readFileSync } from 'node:fs';
import { URL, fileURLToPath } from 'node:url';

import { MapScreen } from '../src/screens/MapScreen.tsx';
import { mountScreen, raw, server } from './interact.ts';
import { __setAreaForTests } from '../src/state/area.ts';
import { coastalDriftExpired, parseCoastalDrift } from '../src/components/coastal-drift.ts';

const noop = () => {};

/*
  THE HARNESS SAYS `Platform.OS === 'web'` AND HAS NO `window`.

  Which is why nothing had ever mounted the Map screen on Ko Sichang: the
  island tab is the default there, and `IslandDiorama` subscribes to window
  messages from its WebView on mount. Two no-op listeners are enough to let
  the screen render; the diorama itself is a WebView and is not what these
  tests are about. Removed again after, so the stub cannot follow anything
  else in this process.
*/
const hadWindow = 'window' in globalThis;
if (!hadWindow) {
  (globalThis as { window?: unknown }).window = {
    addEventListener: () => {},
    removeEventListener: () => {},
  };
}
after(() => { if (!hadWindow) delete (globalThis as { window?: unknown }).window; });

const published = JSON.parse(readFileSync(
  fileURLToPath(new URL('../public/islands/koh-sichang.drift.json', import.meta.url)),
  'utf8',
)) as Record<string, unknown>;

const mapProps = {
  layers: { beach: true, wellness: true, food: true, culture: true, nature: true },
  onToggleLayer: noop, onOpenPlace: noop, onOpenQuest: noop, onSeeAllQuests: noop,
  balances: { trip: 320, green: 1240 },
};

/** A real place on the island, so there is something for the map to lose. */
const palace = {
  id: 'sc-palace', name: { en: 'Phra Chudadhuj Palace', th: 'พระจุฑาธุชราชฐาน' },
  short: 'Palace', province: 'TH-20', layer: 'culture',
  lat: 13.14909, lng: 100.818436, healthyScore: 78,
  crowd: 'quiet', signals: [], address: 'Ko Sichang', openNow: true,
};

/** The island, its quests, and whatever drift file this test wants served. */
const routes = (drift: unknown) => ({
  'GET /places': [palace],
  '/quests': { quests: [], progress: {} },
  // A static file, not an API route: no `{ ok, data }` envelope.
  '/islands/koh-sichang.drift.json': raw(drift),
});

/** A run issued just now, so it is inside its own window. */
const fresh = () => ({ ...published, issued: new Date().toISOString() });

let restore: null | (() => void) = null;
afterEach(() => { restore?.(); restore = null; });

const driftTab = async (drift: unknown) => {
  __setAreaForTests('koh-sichang');
  restore = server(routes(drift)).restore;
  const ui = await mountScreen(h(MapScreen, mapProps));
  await ui.press('Wind & current');
  return ui;
};

describe('an expired drift run is not drawn', () => {
  test('the published run is expired, which is the thing being fixed', () => {
    const file = parseCoastalDrift(published);
    assert.ok(file, 'the published sidecar must still parse');
    assert.equal(file.window, 6);
    assert.equal(
      coastalDriftExpired(file, Date.parse('2026-11-28T12:00+07:00')), true,
      'the run found on production was inside its window, so this test proves nothing',
    );
  });

  test('it says the forecast expired, and shows no shoreline', async () => {
    const ui = await driftTab(published);
    const said = ui.text();
    assert.match(said, /This run has expired/, 'nothing told the traveller it was out of date');
    assert.match(said, /hours past its window/, 'it does not say how far out of date');
    assert.doesNotMatch(said, /Tap a numbered point/,
      'it invited a tap on points that are not there');
    assert.match(said, /No run is current for this island/);
    ui.unmount();
  });

  test('the side filter is gone rather than filtering nothing', async () => {
    const ui = await driftTab(published);
    assert.doesNotMatch(ui.text(), /Whole island/, 'a dead control was left on screen');
    ui.unmount();
  });

  /*
    Drift mode hides the places so the shoreline points stand alone. With the
    points gone, hiding them too leaves a blank sea - an empty answer to a
    question nobody asked - so the ordinary map comes back underneath.
  */
  test('the map underneath comes back instead of going blank', async () => {
    const ui = await driftTab(published);
    assert.match(ui.text(), /Phra Chudadhuj Palace/,
      'the places stayed hidden, so the notice sits over a blank sea');
    ui.unmount();
  });

  test('a current run still gets the island to itself', async () => {
    // The other half of the same rule: when there ARE points, the places go,
    // so the shoreline is read without anything else competing for the eye.
    const ui = await driftTab(fresh());
    assert.doesNotMatch(ui.text(), /Phra Chudadhuj Palace/,
      'the places are still on the map under a working forecast');
    ui.unmount();
  });

  test('a run inside its window is still drawn, with its tap invitation', async () => {
    const ui = await driftTab(fresh());
    const said = ui.text();
    assert.match(said, /Tap a numbered point/, 'a current run lost its points');
    assert.match(said, /Whole island/, 'a current run lost its side filter');
    assert.doesNotMatch(said, /This run has expired/);
    ui.unmount();
  });

  test('a run that will not say when it was computed is treated as expired', async () => {
    const ui = await driftTab({ ...published, issued: null });
    const said = ui.text();
    assert.match(said, /This run has expired/);
    // With no `issued` there is no date and no age to print, and it must not
    // invent either.
    assert.doesNotMatch(said, /hours past its window/);
    ui.unmount();
  });
});

/*
  THE TAB PROMISED A QUESTION THE MODEL DOES NOT ANSWER. It was called
  "พยากรณ์ขยะลอย" - a forecast of floating rubbish - while the run's own
  `seeding` field says "uniform offshore grid; no observed debris mass". The
  particles start on an even grid offshore, not from rubbish anybody detected,
  so what it computes is where the current puts floating things ashore.
*/
describe('it is named for what it actually models', () => {
  test('the published run still says it was seeded with no observed debris', () => {
    const file = parseCoastalDrift(published);
    assert.ok(file);
    assert.match(String(file.seeding), /no observed debris mass/,
      'if the seeding changed, the naming below has to be revisited');
  });

  test('nothing on the screen calls it a forecast of rubbish', async () => {
    const ui = await driftTab(fresh());
    const said = ui.text();
    assert.doesNotMatch(said, /debris forecast/i, 'the old promise is back on the screen');
    assert.match(said, /Wind & current/, 'the tab lost its name');
    assert.match(said, /Where the current lands/, 'the heading lost its subject');
    assert.match(said, /wind and current/, 'it no longer says what it is modelling');
    ui.unmount();
  });

  test('it still refuses to be read as a litter count, and says what it is for', async () => {
    const ui = await driftTab(fresh());
    const said = ui.text();
    assert.match(said, /not a report of rubbish seen, and not a count of it/);
    assert.match(said, /worth walking first/, 'it does not say what the model is good for');
    ui.unmount();
  });

  test('an expired run offers no cleanup advice it cannot support', async () => {
    const ui = await driftTab(published);
    assert.doesNotMatch(ui.text(), /worth walking first/,
      'it recommended shorelines from a run that has expired');
    ui.unmount();
  });
});
