/**
 * The map drops to the drawn island when there is no network, and says so.
 *
 * The 3D terrain map is MapLibre over tiles fetched one by one from
 * openfreemap and an S3 elevation bucket. With no network those requests
 * cannot be answered, so the map that was built to be the hero of this
 * screen is the one thing on it guaranteed to show nothing - while the drawn
 * SVG island needs no network at all and still carries the pins and the
 * traveller's own dot.
 *
 * WHAT THIS HOLDS. The harness has no `document`, so `SamuiMap` never loads
 * MapLibre here and the component swap itself cannot be observed. What can
 * be observed, and is what the traveller actually reads, is the line the
 * screen prints about which map they are looking at.
 *
 * The case below is the one the first implementation missed: the API is
 * reachable in this test, so the cache fallback never fires and no "offline
 * stamp" is set. Only the device's own network state says anything is wrong.
 * Before `state/online.ts` this rendered the terrain map over tiles that
 * would never arrive.
 *
 * Every mount unmounts in a `finally`. MapScreen keeps a 60-second interval
 * for the shop list, so a tree left mounted by a failed assertion holds node
 * open and the run hangs with no result instead of printing the failure.
 */

import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';

import { createElement as h } from 'react';

import { mountScreen, offline, server } from './interact.ts';
import * as fx from './fixtures.ts';
import { MapScreen } from '../src/screens/MapScreen.tsx';
import { __setAreaForTests } from '../src/state/area.ts';

const noop = () => {};
const routes = () => ({ '/places': [fx.place({ layer: 'Safe' })] });
const mapProps = {
  layers: { Green: true, Wellness: true, Food: true, Safe: true, Quest: true },
  onToggleLayer: noop, onPlanDay: noop, onOpenPlace: noop, onOpenQuest: noop, onSeeAllQuests: noop,
  onAskConcierge: noop, onOpenWallet: noop,
  balances: { green: 120, trip: 340 },
};

/**
 * Only `onLine` is replaced, never the whole `navigator`: react-native-web
 * reads `product` and `userAgent` off the same object to decide how to
 * render, and swapping it out breaks the renderer rather than the network.
 */
function withOnLine(value: boolean | undefined, run: () => Promise<void>): Promise<void> {
  const had = typeof navigator !== 'undefined'
    && Object.getOwnPropertyDescriptor(navigator, 'onLine');
  if (typeof navigator !== 'undefined') {
    if (value === undefined) delete (navigator as { onLine?: unknown }).onLine;
    else Object.defineProperty(navigator, 'onLine', { value, configurable: true, writable: true });
  }
  const restore = () => {
    if (typeof navigator === 'undefined') return;
    if (had) Object.defineProperty(navigator, 'onLine', had);
    else delete (navigator as { onLine?: unknown }).onLine;
  };
  return run().then(restore, (error: unknown) => { restore(); throw error; });
}

let restore = noop;
afterEach(() => { restore(); restore = noop; __setAreaForTests('samui'); });

describe('the map when the device says it has no network', () => {
  test('WITH NO SIGNAL IT SAYS WHERE THE MAP IS COMING FROM, AND WHERE IT STOPS', async () => {
    /*
      This used to assert "2D offline map", from when losing the network
      swapped the real map for the drawn island. It does not any more: the
      same map stays up and serves itself from saved tiles. What a traveller
      needs warning about is therefore no longer the map's KIND but its
      EDGES - an area nobody opened while connected was never saved, and
      will be blank however far they drag.
    */
    __setAreaForTests('samui');
    const s = server(routes()); restore = s.restore;
    await withOnLine(false, async () => {
      const ui = await mountScreen(h(MapScreen, mapProps));
      try {
        const said = ui.text();
        assert.match(said, /saved tiles/, 'it must say the map is coming from what was saved');
        assert.match(said, /only areas you have opened/, 'and where that stops');
        assert.doesNotMatch(said, /2D offline map/, 'the map is no longer swapped for a drawing');
        // The header line used to keep saying "Online · latest API response"
        // directly above that, because the fetch HAD succeeded before the
        // signal went. Two lines, one moment, opposite claims.
        assert.doesNotMatch(said, /Online · latest API response/, 'it must not call itself online with no network');
        assert.match(said, /No network/, 'and it must say what is actually wrong');
      } finally { ui.unmount(); }
    });
  });

  test('WITH SIGNAL NOTHING CHANGES — IT DOES NOT CLAIM TO BE OFFLINE', async () => {
    // The whole point of the optimism in `isOnline`: online behaviour is
    // byte-for-byte what it was, and the fallback line never appears.
    __setAreaForTests('samui');
    const s = server(routes()); restore = s.restore;
    await withOnLine(true, async () => {
      const ui = await mountScreen(h(MapScreen, mapProps));
      try {
        const said = ui.text();
        assert.doesNotMatch(said, /saved tiles/, 'an online map must not say it is serving saved tiles');
        assert.doesNotMatch(said, /Using cached data/, 'nor claim the data is stale');
      } finally { ui.unmount(); }
    });
  });

  test('A BROWSER THAT NEVER ANSWERS IS TREATED AS ONLINE', async () => {
    // Being wrong this way leaves the app exactly as it was. Being wrong the
    // other way hides the terrain map from somebody who could see it.
    __setAreaForTests('samui');
    const s = server(routes()); restore = s.restore;
    await withOnLine(undefined, async () => {
      const ui = await mountScreen(h(MapScreen, mapProps));
      try {
        assert.doesNotMatch(ui.text(), /saved tiles/, 'an unanswered question is not a "no"');
      } finally { ui.unmount(); }
    });
  });

  test('AN AREA NEVER SAVED SAYS SO, INSTEAD OF OFFERING A RETRY THAT CANNOT WORK', async () => {
    /*
      The shop list is cached per area, and only for an area opened WITH a
      connection. Reaching a new area offline leaves the fallback with no
      snapshot, so the request fails for real - and the screen used to print
      "Could not load businesses. Try again." in red, directly under a banner
      saying the rest of the page came from cache. One situation, described
      twice, and the only action offered was a retry with no network to use.
    */
    __setAreaForTests('samui');
    const s = server({ '/places': [fx.place({ layer: 'Safe' })], '/shops?area=samui': offline() });
    restore = s.restore;
    await withOnLine(false, async () => {
      const ui = await mountScreen(h(MapScreen, mapProps));
      try {
        const said = ui.text();
        assert.doesNotMatch(said, /Try again/, 'offline, a retry is not an action anyone can take');
        assert.match(said, /No saved businesses for this area/, 'it must say what is actually missing');
        assert.match(said, /Open it once with a connection/, 'and what would fix it');
      } finally { ui.unmount(); }
    });
  });

  test('ONLINE, THE RETRY IS STILL THERE — A REAL FAILURE IS STILL A FAILURE', async () => {
    __setAreaForTests('samui');
    const s = server({ '/places': [fx.place({ layer: 'Safe' })], '/shops?area=samui': offline() });
    restore = s.restore;
    await withOnLine(true, async () => {
      const ui = await mountScreen(h(MapScreen, mapProps));
      try {
        assert.match(ui.text(), /Could not load businesses. Try again./, 'with a network, retrying is the right offer');
      } finally { ui.unmount(); }
    });
  });
});
