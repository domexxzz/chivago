/**
 * The way there, on the app's own map.
 *
 * The line itself is drawn by MapLibre and cannot be rendered here (see the
 * note in `campus.test.ts`), so what these hold is everything around it: the
 * banner that turns a line into a claim, the mode the router is asked for,
 * and - the one that matters most - that a router which says nothing costs
 * the traveller the road and not the map.
 */

import { describe, test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';

import { MapScreen } from '../src/screens/MapScreen.tsx';
import { WayBanner } from '../src/components/WayBanner.tsx';
import { mountScreen, server } from './interact.ts';
import { control, resetControl } from './stubs/native.mjs';
import * as fx from './fixtures.ts';
import { __setAreaForTests } from '../src/state/area.ts';
import { parseRoute } from '@chivago/core';

const noop = () => {};

/** A real one-kilometre walk, as the FOSSGIS server actually replied. */
const REPLY = {
  trip: {
    status: 0,
    summary: { length: 0.976, time: 708.719 },
    legs: [{
      shape: 'qy}dQyngz}DxKtJxA`@hBJ`KQjBKrF_@pH~GzOu[hAaEh@{CJyBCo@WoH_@eBm@sCu@uBaD_IoF_MuEqNsAmDgCuIk@mCo@wC}@{JUae@CwD}XaMeJyFuDuBiUsOkUb_@_JvNmVr`@wBzBg@t@sSiNgL}EyDkA}JiB_]qQ{IwF',
    }],
  },
};

const ROUTE = parseRoute(REPLY, 'walk')!;

/**
 * The router is not our API and does not speak our envelope, so the harness
 * server cannot answer for it. This wraps whatever fetch is installed and
 * answers the router's own URL raw, recording what was asked.
 */
function router(reply: unknown | 'fails'): { asked: string[]; restore: () => void } {
  const asked: string[] = [];
  const inner = globalThis.fetch;
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = typeof input === 'string' ? input : String(input);
    if (url.includes('valhalla')) {
      asked.push(url);
      if (reply === 'fails') throw new Error('router is having an afternoon');
      return new Response(JSON.stringify(reply), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return inner(input as string, init);
  }) as typeof fetch;
  return { asked, restore: () => { globalThis.fetch = inner; } };
}

const routes = () => ({
  '/places': [fx.place({ layer: 'Safe' })],
  '/quests?filter=today': { quests: [fx.quest()], progress: {} },
  '/explored': { places: [] },
  '/areas/samui/stories': { stories: [] },
});

const mapProps = {
  layers: { Green: true, Wellness: true, Food: true, Safe: true, Quest: true },
  onToggleLayer: noop, onPlanDay: noop, onOpenPlace: noop, onOpenQuest: noop, onSeeAllQuests: noop,
  onAskConcierge: noop, onOpenWallet: noop,
  balances: { green: 120, trip: 340 },
};

let restore: (() => void) | null = null;
afterEach(() => { restore?.(); restore = null; resetControl(); __setAreaForTests('samui'); });

describe('the banner over the route', () => {
  const props = (over = {}) => ({
    place: fx.place(), route: ROUTE, loading: false, failed: false, haveHere: true,
    mode: 'walk' as const, onMode: noop, onClear: noop, ...over,
  });

  test('it names the place and says how far along the road and how long', async () => {
    const ui = await mountScreen(h(WayBanner, props()));
    const said = ui.text();
    assert.match(said, /Way to Chaweng Beach/);
    // 976 m and 709 s, rounded the way each is rounded.
    assert.match(said, /980 m/, 'the road distance is missing');
    assert.match(said, /12 min/, 'the duration is missing');
    ui.unmount();
  });

  test('both modes are offered, and walking is the one this product pays for', async () => {
    const ui = await mountScreen(h(WayBanner, props()));
    const labels = ui.labels();
    assert.ok(labels.includes('On foot'));
    assert.ok(labels.includes('By road'));
    ui.unmount();
  });

  test('no route says the dashed line is a bearing, not a road', async () => {
    // A dashed line across a bay that somebody reads as a road is how a
    // traveller ends up in the sea.
    const ui = await mountScreen(h(WayBanner, props({ route: null, failed: true })));
    assert.match(ui.text(), /the direction, not a road/i);
    assert.doesNotMatch(ui.text(), /min/, 'a duration was shown with no route to time');
    ui.unmount();
  });

  test('while it is being asked for, it says so rather than showing nothing', async () => {
    const ui = await mountScreen(h(WayBanner, props({ route: null, loading: true })));
    assert.match(ui.text(), /Finding the way/i);
    ui.unmount();
  });

  test('with no position there is nothing to route from, and it says that instead', async () => {
    const ui = await mountScreen(h(WayBanner, props({ route: null, haveHere: false, failed: true })));
    assert.match(ui.text(), /needs your location/i);
    ui.unmount();
  });

  test('it can be cleared', async () => {
    let cleared = 0;
    const ui = await mountScreen(h(WayBanner, props({ onClear: () => { cleared += 1; } })));
    await ui.press('Clear the route');
    assert.equal(cleared, 1);
    ui.unmount();
  });
});

describe('the map screen asks for the way', () => {
  test('a destination asks the router, on foot, from where the traveller is', async () => {
    __setAreaForTests('samui');
    const s = server(routes());
    const r = router(REPLY);
    restore = () => { r.restore(); s.restore(); };
    const ui = await mountScreen(h(MapScreen, { ...mapProps, wayTo: fx.place(), onClearWay: noop }));

    assert.equal(r.asked.length, 1, 'the router was not asked exactly once');
    const body = JSON.parse(decodeURIComponent(r.asked[0]!.split('json=')[1]!));
    assert.equal(body.costing, 'pedestrian', 'walking is the default, because walking is what pays');
    // The stub stands on Chaweng; the destination is the Chaweng fixture.
    assert.equal(body.locations[0].lat, 9.5357);
    assert.equal(body.locations[1].lat, 9.5357);
    assert.match(ui.text(), /Way to Chaweng Beach/);
    ui.unmount();
  });

  test('no destination asks nothing at all', async () => {
    // The map is the map. A screen that routed on mount would be asking a
    // free community server a question nobody posed.
    __setAreaForTests('samui');
    const s = server(routes());
    const r = router(REPLY);
    restore = () => { r.restore(); s.restore(); };
    const ui = await mountScreen(h(MapScreen, mapProps));
    assert.deepEqual(r.asked, []);
    assert.doesNotMatch(ui.text(), /Way to/);
    ui.unmount();
  });

  test('a router that says nothing costs the road, not the map', async () => {
    // The whole reason this dependency is allowed to exist: it is allowed
    // to fail. The pins, the mist and the traveller are untouched.
    __setAreaForTests('samui');
    const s = server(routes());
    const r = router('fails');
    restore = () => { r.restore(); s.restore(); };
    const ui = await mountScreen(h(MapScreen, { ...mapProps, wayTo: fx.place(), onClearWay: noop }));
    const said = ui.text();
    assert.equal(r.asked.length, 1);
    assert.match(said, /the direction, not a road/i);
    assert.match(said, /Chaweng/, 'the map itself is unaffected');
    ui.unmount();
  });

  test('with no location permission the router is never asked', async () => {
    // There is nothing to route from, and asking anyway would be a request
    // sent to somebody else's server for an answer that cannot be used.
    __setAreaForTests('samui');
    control.permission = { granted: false, status: 'denied' };
    const s = server(routes());
    const r = router(REPLY);
    restore = () => { r.restore(); s.restore(); };
    const ui = await mountScreen(h(MapScreen, { ...mapProps, wayTo: fx.place(), onClearWay: noop }));
    assert.deepEqual(r.asked, []);
    assert.match(ui.text(), /Way to Chaweng Beach/, 'the banner still names the destination');
    ui.unmount();
  });
});
