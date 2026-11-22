/**
 * The navigator, from the state machine up to the screen.
 *
 * The arithmetic - matching a fix to a road, deciding somebody has gone the
 * wrong way, when the camera turns - is tested in `packages/core`, against
 * routes built to break it. What is left for this file is everything that
 * only exists once the pieces are wired together, and it is mostly ORDERING:
 *
 *   - a route reply that arrives after the traveller pressed Stop;
 *   - a reroute storm against somebody else's free server;
 *   - a GPS watcher left running after the screen has gone;
 *   - a document reloaded on every fix, which is invisible on a screenshot
 *     and is the single difference between a navigator and a slideshow.
 *
 * Plus the one thing a screen test is uniquely good for: that the right
 * sentence appears, in the right language, in each state.
 */

import { describe, test, afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { act } from 'react-test-renderer';

import { NavigateScreen } from '../src/screens/NavigateScreen.tsx';
import { ShopProfileScreen } from '../src/screens/ShopProfileScreen.tsx';
import { WayBanner } from '../src/components/WayBanner.tsx';
import { NavigationMap } from '../src/components/NavigationMap.tsx';
import { IDLE, REROUTE_COOLDOWN_MS, isFollowing, run, step } from '../src/navigation/machine.ts';
import { SESSION_GOOD_FOR_MS, parseSession } from '../src/navigation/session.ts';
import { parseMapEvent, validateCommand } from '../src/components/navigation-bridge.ts';
import {
  ACCURACY_RING_FROM_M, accuracyRadius, navigationCamera, navigationLayers, navigationPadding,
  navigationSources, pointsFeature, routeBounds,
} from '../src/components/navigation-layers.ts';
import { mount, mountScreen, server, settle } from './interact.ts';
import { control, resetControl } from './stubs/native.mjs';
import { resetWebView, sources } from './stubs/webview.mjs';
import { __setLocaleForTests } from '../src/i18n/locale.ts';
import { setOfflineStorageForTests } from '../src/offline/storage.ts';
import * as fx from './fixtures.ts';
import { parseNavRoute } from '@chivago/core';

const noop = () => {};

/**
 * The traveller, standing at the start of the road below.
 *
 * On it, deliberately. A fix off the route is a different test (there is one
 * in `packages/core`), and starting one here would have every screen test
 * arrive at its destination before it had drawn a turn.
 */
const WHERE = { latitude: 9.5, longitude: 100.0, accuracy: 9, heading: 90, speed: 1.4 };

/**
 * A reply in the shape the FOSSGIS server really sends - numeric maneuver
 * codes, kilometres, Thai street names - trimmed to three turns.
 *
 * The polyline is a straight kilometre east of the fix above, generated for
 * this test, so the distances a test asserts on are distances it can count.
 */
const SHAPE = '_uybQ_oov}D?o}@?o}@?o}@?o}@';

const REPLY = {
  trip: {
    status: 0,
    summary: { length: 0.44, time: 320 },
    legs: [{
      shape: SHAPE,
      maneuvers: [
        { type: 1, street_names: ['ถนนพังบัว'], length: 0.22, time: 160, begin_shape_index: 0, end_shape_index: 2, bearing_after: 90 },
        { type: 15, street_names: ['ซอยหาดเฉวง 4'], length: 0.22, time: 160, begin_shape_index: 2, end_shape_index: 4, bearing_after: 0 },
        { type: 4, length: 0, time: 0, begin_shape_index: 4, end_shape_index: 4 },
      ],
    }],
  },
};

const DESTINATION = {
  id: 'chaweng',
  name: { en: 'Chaweng Beach', th: 'หาดเฉวง', zh: '查汶海滩' },
  lat: 9.5,
  lng: 100.004,
};

/**
 * The router is not this app's API and does not speak its envelope, so the
 * harness server cannot answer for it. This wraps whatever fetch is
 * installed and answers the router's own URL raw, recording what was asked.
 */
function router(reply: unknown | 'fails'): { asked: string[]; restore: () => void } {
  const asked: string[] = [];
  const inner = globalThis.fetch;
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = typeof input === 'string' ? input : String(input);
    if (url.includes('valhalla')) {
      asked.push(url);
      if (reply === 'fails') throw new Error('the router is having an afternoon');
      return new Response(JSON.stringify(reply), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    // The app's own `/config`, answered the way a fenced server answers it.
    // The screen asks it before reading the GPS (server-config.ts
    // `locationOff`); in the app the root has asked it long before a
    // navigator opens, and left to the real network here it is a
    // connection to nowhere that the screen would wait out.
    if (url.endsWith('/config')) {
      return new Response(JSON.stringify({ ok: true, data: { fenceOff: false, storiesAutoApprove: false, aiAssist: true } }), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    }
    return inner(input as string, init);
  }) as typeof fetch;
  return { asked, restore: () => { globalThis.fetch = inner; } };
}

/** A storage adapter that lives in a Map, so a test can read what was kept. */
function memoryStore() {
  const slots = new Map<string, string>();
  setOfflineStorageForTests({
    get: async (key) => slots.get(key) ?? null,
    set: async (key, value) => { slots.set(key, value); },
    delete: async (key) => { slots.delete(key); },
    keys: async () => [...slots.keys()],
  });
  return slots;
}

/*
  FIXES ARE STAMPED NOW, not in 1970.

  The watcher drops a position measured more than a minute before it
  started, because Android's fused provider answers instantly with the LAST
  KNOWN location and that can be hours old and kilometres away. A fixture
  stamped `1_000` is 1 January 1970 and is correctly refused - which is why
  every timestamp here is an offset from `now`.
*/
const now = () => Date.now();
beforeEach(() => { resetControl(); resetWebView(); control.position = { coords: WHERE, timestamp: now() }; });
afterEach(() => { resetControl(); __setLocaleForTests('en'); setOfflineStorageForTests(null); });

// ---------------------------------------------------------------------------

describe('the states a trip can be in', () => {
  const started = run([{ type: 'preview' }, { type: 'start' }, { type: 'located' }]);

  test('a destination, a start and a fix lead to asking the router', () => {
    assert.equal(started.status, 'routing');
  });

  test('a route makes it ready, and the first measured fix makes it navigating', () => {
    const ready = step(started, { type: 'routed', ticket: started.ticket, ok: true });
    assert.equal(ready.status, 'ready');
    assert.equal(step(ready, { type: 'fix' }).status, 'navigating');
  });

  test('a reply to a question nobody is waiting for any more is dropped', () => {
    // The traveller changed their mind: a new destination took the next
    // ticket, and the old request is still in flight.
    const elsewhere = step(started, { type: 'preview' });
    const late = step(elsewhere, { type: 'routed', ticket: started.ticket, ok: true });
    assert.equal(late.status, 'preview', 'the stale reply must not start a trip');
  });

  test('a reply arriving after Stop cannot reopen the trip', () => {
    const stopped = step(started, { type: 'stop' });
    const late = step(stopped, { type: 'routed', ticket: started.ticket, ok: true });
    assert.equal(late.status, 'ended');
  });

  test('a wrong turn asks for a new route once, not once a second', () => {
    const going = run([{ type: 'routed', ticket: started.ticket, ok: true }, { type: 'fix' }], started);
    const first = step(going, { type: 'off-route', now: 100_000 });
    assert.equal(first.status, 'rerouting');

    // Back on the road, then off it again a second later: inside the cooldown.
    const back = run([{ type: 'routed', ticket: first.ticket, ok: true }], first);
    assert.equal(back.status, 'navigating');
    const tooSoon = step(back, { type: 'off-route', now: 101_000 });
    assert.equal(tooSoon.status, 'navigating', 'the cooldown must hold');
    assert.equal(tooSoon.ticket, back.ticket, 'and nothing may be asked for');

    const later = step(back, { type: 'off-route', now: 100_000 + REROUTE_COOLDOWN_MS + 1 });
    assert.equal(later.status, 'rerouting');
  });

  test('a reroute that fails keeps the old route and says so', () => {
    const going = run([{ type: 'routed', ticket: started.ticket, ok: true }, { type: 'fix' }], started);
    const asking = step(going, { type: 'off-route', now: 1 });
    const failed = step(asking, { type: 'routed', ticket: asking.ticket, ok: false });
    // Still navigating: the old line is still a road. What it has lost is
    // its claim to start where the traveller is, and that is said in words.
    assert.equal(failed.status, 'navigating');
    assert.equal(failed.rerouteFailed, true);
  });

  test('the first route failing is the one failure with nothing to draw', () => {
    const failed = step(started, { type: 'routed', ticket: started.ticket, ok: false });
    assert.equal(failed.status, 'failed');
    assert.equal(failed.failure, 'no-route');
  });

  test('panning hands the camera over; re-centring takes it back', () => {
    const going = run([{ type: 'routed', ticket: started.ticket, ok: true }, { type: 'fix' }], started);
    const panned = step(going, { type: 'panned' });
    assert.equal(panned.status, 'overview');
    // The camera is theirs, but the trip has not stopped.
    assert.equal(isFollowing(panned.status), true);
    assert.equal(step(panned, { type: 'recentre' }).status, 'navigating');
  });

  test('a pan in the middle of a reroute does not lose the reroute', () => {
    const going = run([{ type: 'routed', ticket: started.ticket, ok: true }, { type: 'fix' }], started);
    const asking = step(going, { type: 'off-route', now: 1 });
    assert.equal(step(asking, { type: 'panned' }).status, 'rerouting');
  });

  test('a lost signal is recovered by the next fix', () => {
    const going = run([{ type: 'routed', ticket: started.ticket, ok: true }, { type: 'fix' }], started);
    const lost = step(going, { type: 'gps-lost' });
    assert.equal(lost.status, 'gps-lost');
    assert.equal(step(lost, { type: 'fix' }).status, 'navigating');
  });

  test('an event that makes no sense where it arrives changes nothing', () => {
    // A fix one tick after Stop, which is the ordinary case rather than an
    // error, and must not be one at the call site.
    const stopped = step(started, { type: 'stop' });
    assert.equal(step(stopped, { type: 'fix' }), stopped);
    assert.equal(step(IDLE, { type: 'recentre' }), IDLE);
    assert.equal(step(IDLE, { type: 'arrived' }), IDLE);
  });

  test('starting again after arriving is a fresh trip, not the old one', () => {
    const arrived = run([
      { type: 'routed', ticket: started.ticket, ok: true }, { type: 'fix' }, { type: 'arrived' },
    ], started);
    const again = step(arrived, { type: 'start' });
    assert.equal(again.status, 'acquiring-location');
    assert.equal(again.rerouteFailed, false);
    assert.ok(again.ticket > arrived.ticket);
  });
});

// ---------------------------------------------------------------------------

describe('the route kept for the rest of the trip', () => {
  const route = parseNavRoute(REPLY, 'walk')!;
  const good = { destination: DESTINATION, mode: 'walk' as const, route, savedAt: 1_000 };

  const stored = (session: unknown, version = 1) => JSON.stringify({ version, session });

  test('a record written by this version reads back whole', () => {
    const back = parseSession(stored(good), 1_500);
    assert.ok(back);
    assert.equal(back.route.line.length, route.line.length);
    assert.equal(back.destination.id, 'chaweng');
    assert.equal(back.mode, 'walk');
  });

  test('a record from another version is not read at all', () => {
    assert.equal(parseSession(stored(good, 2), 1_500), null);
  });

  test('yesterday’s route is not restored into today’s walk', () => {
    assert.equal(parseSession(stored(good), 1_000 + SESSION_GOOD_FOR_MS + 1), null);
    assert.ok(parseSession(stored(good), 1_000 + SESSION_GOOD_FOR_MS - 1));
  });

  test('a half-written record is refused rather than drawn', () => {
    assert.equal(parseSession('{"version":1,"sess', 1_500), null);
    assert.equal(parseSession(stored({ ...good, route: { ...route, line: [[1, 2]] } }), 1_500), null);
    assert.equal(parseSession(stored({ ...good, route: { ...route, line: [[1, 'x'], [2, 3]] } }), 1_500), null);
    assert.equal(parseSession(stored({ ...good, destination: { ...DESTINATION, lat: NaN } }), 1_500), null);
    assert.equal(parseSession(stored({ ...good, mode: 'teleport' }), 1_500), null);
    assert.equal(parseSession(null, 1_500), null);
  });

  test('nothing about where the traveller has been is in the record', () => {
    const raw = stored(good);
    // The saved shape is the ROUTE and the PLACE - the same record for
    // anybody who asked for the same place. No position, no track.
    assert.ok(!raw.includes('accuracyM'));
    assert.ok(!raw.includes('speedMps'));
    assert.ok(!raw.includes('heading'));
  });
});

// ---------------------------------------------------------------------------

describe('what may cross into the map’s document, and back', () => {
  test('an event the map did not send is not an event', () => {
    assert.equal(parseMapEvent('not json'), null);
    assert.equal(parseMapEvent(''), null);
    assert.equal(parseMapEvent(null), null);
    assert.equal(parseMapEvent(JSON.stringify({ type: 'EVAL', code: 'fetch("/")' })), null);
    assert.deepEqual(parseMapEvent(JSON.stringify({ type: 'MAP_READY' })), { type: 'MAP_READY' });
  });

  test('a tapped map coordinate crosses the bridge only when it is valid', () => {
    assert.deepEqual(
      parseMapEvent(JSON.stringify({ type: 'MAP_PRESS', lat: 13.15123, lng: 100.80876 })),
      { type: 'MAP_PRESS', lat: 13.15123, lng: 100.80876 },
    );
    assert.equal(parseMapEvent(JSON.stringify({ type: 'MAP_PRESS', lat: 100, lng: 100.8 })), null);
    assert.equal(parseMapEvent(JSON.stringify({ type: 'MAP_PRESS', lat: 13.15, lng: '100.8' })), null);
  });

  test('an error code is truncated rather than trusted', () => {
    const long = JSON.stringify({ type: 'MAP_ERROR', code: 'x'.repeat(5_000) });
    const event = parseMapEvent(long);
    assert.equal(event, null, 'a message that large is not one of ours');
    const sane = parseMapEvent(JSON.stringify({ type: 'MAP_ERROR', code: 'y'.repeat(900) }));
    assert.ok(sane && sane.type === 'MAP_ERROR' && sane.code.length === 200);
  });

  test('a command with a coordinate that is not a coordinate is refused', () => {
    assert.equal(validateCommand({ type: 'SET_ROUTE', remaining: [[1, 'x']], travelled: [] }), null);
    assert.equal(validateCommand({ type: 'SET_ROUTE', remaining: 'all of it', travelled: [] }), null);
    assert.equal(validateCommand({ type: 'UPDATE_POSITION', lng: 100, lat: NaN, bearing: 0 }), null);
    assert.equal(validateCommand({ type: 'CAMERA', centre: [1, 2], bearing: 0, zoom: 17, pitch: 50 }), null);
    assert.deepEqual(validateCommand({ type: 'ZOOM', delta: 1 }), { type: 'ZOOM', delta: 1 });
    assert.deepEqual(validateCommand({ type: 'ZOOM', delta: -1 }), { type: 'ZOOM', delta: -1 });
    assert.equal(validateCommand({ type: 'ZOOM', delta: 2 }), null);
    assert.equal(validateCommand({ type: 'NOT_A_COMMAND' }), null);
    assert.equal(validateCommand(null), null);
  });

  test('the commands the navigator actually sends all validate', () => {
    assert.ok(validateCommand({ type: 'SET_ROUTE', remaining: [[100, 9]], travelled: [], points: null }));
    assert.ok(validateCommand({ type: 'UPDATE_POSITION', lng: 100, lat: 9, bearing: 12, accuracyM: 8 }));
    assert.ok(validateCommand({
      type: 'CAMERA', centre: [100, 9], bearing: 12, zoom: 17, pitch: 50, duration: 900,
      padding: { top: 1, bottom: 2, left: 3, right: 4 },
    }));
    assert.ok(validateCommand({
      type: 'FIT', bounds: [[100, 9], [101, 10]], padding: { top: 1, bottom: 2, left: 3, right: 4 },
    }));
    assert.ok(validateCommand({ type: 'CLEAR_ROUTE' }));
  });
});

// ---------------------------------------------------------------------------

describe('the layers and the camera, as data', () => {
  test('every layer points at a source that exists', () => {
    const sourceIds = new Set(Object.keys(navigationSources()));
    for (const layer of navigationLayers()) {
      assert.ok(sourceIds.has(layer.source as string), `${String(layer.id)} has no source`);
    }
  });

  test('no two layers share an id, and none collides with the island’s', () => {
    const ids = navigationLayers().map((l) => String(l.id));
    assert.equal(new Set(ids).size, ids.length);
    for (const id of ids) assert.ok(id.startsWith('cg-nav-'), id);
  });

  test('the traveller sits in the lower part of the frame, not the middle', () => {
    const padding = navigationPadding(390, 844, 96, 150);
    // MapLibre centres on the middle of the padded box, so a bigger top
    // padding is what pushes the arrow down the screen.
    assert.ok(padding.top > padding.bottom);
    assert.ok(padding.left >= 0 && padding.right >= 0);
  });

  test('the camera reads the snapped point, not the raw fix', () => {
    const fix = { lat: 9.6, lng: 100.6, accuracyM: 40, headingDeg: null, speedMps: 3, timestamp: 1 };
    const progress = {
      index: 0, snapped: { lat: 9.5, lng: 100.5 }, offRouteM: 40, travelledM: 0, remainingM: 100,
      remainingSeconds: 60, fraction: 0, onManeuver: 0, nextManeuver: 1, toNextM: 50,
      toDestinationM: 100, bearingDeg: 123, speedMps: 3, confident: true,
      offRouteStreak: 0, arrivedStreak: 0, offRoute: false, arrived: false, at: 1,
    };
    const camera = navigationCamera(progress, fix);
    assert.ok(camera);
    // A bad fix must not drag the whole map off the road with it.
    assert.deepEqual(camera.centre, [100.5, 9.5]);
    assert.equal(camera.bearing, 123);
  });

  test('with no fix at all there is no camera to move', () => {
    assert.equal(navigationCamera(null, null), null);
  });

  test('the accuracy ring halves with every zoom level, exactly', () => {
    const expression = accuracyRadius(50, 9.5) as [string, unknown, unknown, number, number, number, number];
    const atTen = expression[4];
    const atTwenty = expression[6];
    assert.ok(atTen > 0 && atTwenty > atTen);
    assert.ok(Math.abs(atTwenty / atTen - 2 ** 10) < 1e-6);
  });

  test('a good fix draws no ring at all', () => {
    assert.ok(ACCURACY_RING_FROM_M > 10, 'a ring on every fix is a ring nobody reads');
  });

  test('the overview frames the whole route, and nothing when there is none', () => {
    assert.deepEqual(routeBounds([[100, 9], [101, 10], [100.5, 8]]), [[100, 8], [101, 10]]);
    assert.equal(routeBounds([]), null);
    assert.equal(routeBounds([[NaN, NaN]]), null);
  });

  test('the junctions and clearly different A/B endpoint pins travel as one collection', () => {
    const points = pointsFeature(
      [{ lat: 9, lng: 100 }],
      { lat: 8, lng: 99 },
      { lat: 7, lng: 98 },
    ) as {
      features: { properties: { kind: string } }[];
    };
    assert.equal(points.features.length, 3);
    assert.deepEqual(points.features.map((f) => f.properties.kind), ['maneuver', 'origin', 'destination']);
    const layerIds = navigationLayers().map((layer) => layer.id);
    assert.ok(layerIds.includes('cg-nav-origin'));
    assert.ok(layerIds.includes('cg-nav-origin-label'));
    assert.ok(layerIds.includes('cg-nav-destination'));
    assert.ok(layerIds.includes('cg-nav-destination-label'));
  });
});

// ---------------------------------------------------------------------------

describe('the screen, before setting off', () => {
  test('it names the place and says how far along the road and how long', async () => {
    const net = router(REPLY);
    try {
      const ui = await mountScreen(h(NavigateScreen, { destination: DESTINATION, onBack: noop }));
      const said = ui.text();
      assert.match(said, /Chaweng Beach/);
      // 440 m of road, rounded the way this app rounds a measured distance.
      assert.match(said, /440 m/);
      assert.match(said, /Start/);
      ui.unmount();
    } finally { net.restore(); }
  });

  test('the Google Maps handoff is still offered, and still carries no position', async () => {
    const net = router(REPLY);
    try {
      const ui = await mountScreen(h(NavigateScreen, { destination: DESTINATION, onBack: noop }));
      assert.match(ui.text(), /Google Maps/);
      ui.unmount();
    } finally { net.restore(); }
  });

  test('with no destination it says so rather than opening an empty navigator', async () => {
    const ui = await mountScreen(h(NavigateScreen, { destination: null, onBack: noop }));
    assert.match(ui.text(), /No route to this place/);
    ui.unmount();
  });

  test('before Start, nothing has been asked of the GPS watcher', async () => {
    const net = router(REPLY);
    try {
      const ui = await mountScreen(h(NavigateScreen, { destination: DESTINATION, onBack: noop }));
      // The preview takes one fix through `useHere`; the navigator's own
      // watcher - the expensive one - is not running.
      assert.equal(control.watching, 0, 'the tight watcher must wait for Start');
      ui.unmount();
    } finally { net.restore(); }
  });

  test('current GPS is the default start, and a Koh Sichang place can replace it', async () => {
    const destination = {
      id: 'sichang-destination',
      name: { en: 'Khao Yai Shrine', th: 'ศาลเจ้าพ่อเขาใหญ่', zh: '大山神庙' },
      lat: 13.1618,
      lng: 100.8072,
    };
    const chosen = {
      id: 'sichang-palace',
      name: { en: 'Chudhadhuj Palace', th: 'พระจุฑาธุชราชฐาน', zh: '朱达图宫' },
      province: 'TH-20',
      lat: 13.1508,
      lng: 100.8088,
    };
    control.position = {
      coords: { latitude: 13.1599, longitude: 100.8096, accuracy: 8, heading: 0, speed: 0 },
      timestamp: now(),
    };
    const app = server({ '/places': [chosen] });
    const net = router(REPLY);
    try {
      const ui = await mountScreen(h(NavigateScreen, { destination, onBack: noop }));
      assert.match(ui.text(), /My current location/, 'GPS is named as the default start');

      await ui.press('Choose starting point');
      assert.match(ui.text(), /Chudhadhuj Palace/);
      await ui.pressText('Chudhadhuj Palace');
      assert.match(ui.text(), /STARTING POINT Chudhadhuj Palace/);

      const starts = net.asked.map((url) => {
        const body = JSON.parse(decodeURIComponent(url.split('json=')[1]!)) as {
          locations: { lat: number; lon: number }[];
        };
        return body.locations[0]!;
      });
      assert.ok(
        starts.some((point) => point.lat === chosen.lat && point.lon === chosen.lng),
        'the preview route begins at the selected place',
      );
      ui.unmount();
    } finally {
      net.restore();
      app.restore();
    }
  });

  test('a traveller can tap an island coordinate for A while B stays the named destination', async () => {
    const destination = {
      id: 'sichang-destination',
      name: { en: 'Khao Yai Shrine', th: 'ศาลเจ้าพ่อเขาใหญ่', zh: '大山神庙' },
      lat: 13.1618,
      lng: 100.8072,
    };
    const app = server({ '/places': [] });
    const net = router(REPLY);
    try {
      const ui = await mountScreen(h(NavigateScreen, { destination, onBack: noop }));
      assert.match(ui.text(), /STARTING POINT My current location/);
      assert.match(ui.text(), /DESTINATION Khao Yai Shrine/);
      assert.ok(ui.labels().includes('Zoom in'));
      assert.ok(ui.labels().includes('Zoom out'));

      await ui.press('Choose starting point');
      assert.match(ui.text(), /Pick a point on the map/);
      await ui.pressText('Pick a point on the map');
      assert.match(ui.text(), /Tap your starting point/);

      const map = ui.root.findByType(NavigationMap);
      await act(async () => {
        map.props.onPressCoordinate({ lat: 13.25, lng: 100.95 });
      });
      assert.match(ui.text(), /Choose a point on Koh Sichang/);
      await act(async () => {
        map.props.onPressCoordinate({ lat: 13.1508, lng: 100.8088 });
      });
      assert.match(ui.text(), /STARTING POINT Map point · 13\.15080, 100\.80880/);
      assert.match(ui.text(), /DESTINATION Khao Yai Shrine/);

      const starts = net.asked.map((url) => {
        const body = JSON.parse(decodeURIComponent(url.split('json=')[1]!)) as {
          locations: { lat: number; lon: number }[];
        };
        return body.locations[0]!;
      });
      assert.ok(starts.some((point) => point.lat === 13.1508 && point.lon === 100.8088));
      ui.unmount();
    } finally {
      net.restore();
      app.restore();
    }
  });
});

// ---------------------------------------------------------------------------

describe('the screen, following', () => {
  /** Mount, press Start, and let the route land. */
  async function going(locale: 'en' | 'th' | 'zh' = 'en') {
    __setLocaleForTests(locale);
    const ui = await mountScreen(h(NavigateScreen, { destination: DESTINATION, onBack: noop }));
    await ui.pressText(/Start|เริ่มนำทาง|开始导航/);
    return ui;
  }

  test('the banner carries the turn, its distance and the road it is on', async () => {
    const net = router(REPLY);
    const store = memoryStore();
    try {
      const ui = await going();
      const said = ui.text();
      // The second maneuver is a left turn onto a named soi, 220 m along.
      assert.match(said, /Turn left/);
      assert.match(said, /220 m/);
      assert.match(said, /ซอยหาดเฉวง 4/);
      // And the trip panel underneath it.
      assert.match(said, /Stop/);
      assert.match(said, /Overview/);
      assert.ok(store.size > 0, 'the route is kept for the rest of the trip');
      ui.unmount();
    } finally { net.restore(); }
  });

  test('it says it in Thai', async () => {
    const net = router(REPLY);
    memoryStore();
    try {
      const ui = await going('th');
      const said = ui.text();
      assert.match(said, /เลี้ยวซ้าย/);
      assert.match(said, /220 ม\./);
      assert.match(said, /หยุด/);
      // Nothing English has leaked into the instruction.
      assert.ok(!/Turn left/.test(said));
      ui.unmount();
    } finally { net.restore(); }
  });

  test('and in Chinese', async () => {
    const net = router(REPLY);
    memoryStore();
    try {
      const ui = await going('zh');
      const said = ui.text();
      assert.match(said, /向左转/);
      assert.match(said, /220 米/);
      assert.match(said, /结束/);
      assert.ok(!/Turn left/.test(said));
      ui.unmount();
    } finally { net.restore(); }
  });

  /*
    ANDROID ANSWERS INSTANTLY, WITH YESTERDAY'S POSITION.

    The fused location provider delivers the LAST KNOWN fix the moment it is
    asked, before the radio has found anything - and that can be where the
    phone was when it was last outdoors. Taken as the opening fix of a trip
    it routes the traveller from somewhere they are not, and the route looks
    perfectly plausible until the first junction.
  */
  test('a cached position from before the trip is not where the traveller is', async () => {
    const net = router(REPLY);
    memoryStore();
    try {
      control.position = { coords: WHERE, timestamp: Date.now() - 10 * 60 * 1_000 };
      const ui = await mountScreen(h(NavigateScreen, { destination: DESTINATION, onBack: noop }));
      await ui.pressText(/Start/);
      // Still waiting: a ten-minute-old fix does not start a trip.
      assert.match(ui.text(), /Waiting for GPS/);
      assert.ok(!/Turn left/.test(ui.text()), 'nothing may be routed from a stale fix');
      ui.unmount();
    } finally { net.restore(); }
  });

  test('a fix that arrives out of order does not walk the arrow backwards', async () => {
    const net = router(REPLY);
    memoryStore();
    try {
      const ui = await going();
      const atStart = ui.text();
      const base = Date.now();
      // Three hundred and thirty metres along a four-hundred-metre road.
      control.emit?.({ coords: { ...WHERE, longitude: 100.003 }, timestamp: base + 3_000 });
      await settle();
      const ahead = ui.text();
      assert.notEqual(ahead, atStart, 'a fresh fix must move the trip on');

      // A straggler from earlier in the trip, delivered late. Platforms do
      // this, and a navigator that accepts one walks the arrow back down
      // the road it has already travelled.
      control.emit?.({ coords: { ...WHERE, longitude: 100.0005 }, timestamp: base + 1_000 });
      await settle();
      assert.equal(ui.text(), ahead, 'an older fix must change nothing at all');
      ui.unmount();
    } finally { net.restore(); }
  });

  test('the tight watcher runs while following and stops when the screen goes', async () => {
    const net = router(REPLY);
    memoryStore();
    try {
      const ui = await going();
      assert.equal(control.watching, 1, 'exactly one watcher, not one per fix');
      ui.unmount();
      assert.equal(control.watching, 0, 'a watcher left running is a radio left on');
    } finally { net.restore(); }
  });

  test('A FIX DOES NOT RELOAD THE DOCUMENT', async () => {
    const net = router(REPLY);
    memoryStore();
    try {
      const ui = await going();
      const first = sources[sources.length - 1];
      assert.ok(first && typeof first.html === 'string', 'the map was given a document');

      // Four more fixes, a hundred metres apart along the road.
      for (let i = 1; i <= 4; i += 1) {
        control.emit?.({
          coords: { ...WHERE, longitude: 100.0 + i * 0.001 },
          timestamp: now() + i * 1_000,
        });
        await settle();
      }

      const last = sources[sources.length - 1];
      assert.equal(last.html, first.html, 'the html must be the same string, not merely equal');
      assert.equal(last.baseUrl, first.baseUrl);
    } finally { net.restore(); }
  });

  /*
    ONE MEASUREMENT PER FIX.

    Found in a browser run, and it broke two things at once. The effect that
    measures progress is keyed on the navigator's STATUS as well as on the
    fix, because it has to start measuring the moment a route arrives - so
    every status change re-ran it with a fix that had already been counted.
    That re-dispatched `fix`, which turned `gps-lost` straight back into
    `navigating` once a second (the screen sat in total silence showing a
    live banner), and it counted each bad fix twice, so three fixes off the
    road became six and the reroute fired at two.

    Two fixes off the road must not be a wrong turn. The threshold is three.
  */
  test('two fixes off the road are not a wrong turn, however often the screen re-renders', async () => {
    const net = router(REPLY);
    memoryStore();
    try {
      const ui = await going();
      const asked = net.asked.length;
      // Due north of a route that runs due east: a long way off it.
      for (let i = 1; i <= 2; i += 1) {
        control.emit?.({
          coords: { ...WHERE, latitude: 9.5 + 0.002, longitude: 100.0 + i * 0.0005 },
          timestamp: now() + i * 1_000,
        });
        await settle();
      }
      /*
        The router is the witness, not the banner: a reroute that succeeds is
        back to `navigating` by the time a test can read the screen, so the
        durable evidence of one is that somebody's free server was asked.
      */
      assert.equal(net.asked.length, asked, 'two fixes off the road must not ask for a new route');

      control.emit?.({
        coords: { ...WHERE, latitude: 9.5 + 0.002, longitude: 100.0015 },
        timestamp: now() + 5_000,
      });
      await settle();
      assert.equal(net.asked.length, asked + 1, 'the third one is a wrong turn, and is asked about once');
      ui.unmount();
    } finally { net.restore(); }
  });

  test('one route is asked for, not one per fix', async () => {
    const net = router(REPLY);
    memoryStore();
    try {
      const ui = await going();
      for (let i = 1; i <= 4; i += 1) {
        control.emit?.({ coords: { ...WHERE, longitude: 100.0 + i * 0.0005 }, timestamp: now() + i * 1_000 });
        await settle();
      }
      // The preview asked once and the navigator asked once. Four fixes
      // added nothing, which is the whole bargain with a free server.
      assert.ok(net.asked.length <= 2, `asked ${net.asked.length} times`);
      ui.unmount();
    } finally { net.restore(); }
  });
});

// ---------------------------------------------------------------------------

describe('the screen, when something is wrong', () => {
  test('a refused permission names the thing to change', async () => {
    control.permission = { granted: false, status: 'denied' };
    const net = router(REPLY);
    try {
      const ui = await mountScreen(h(NavigateScreen, { destination: DESTINATION, onBack: noop }));
      await ui.pressText(/Start/);
      assert.match(ui.text(), /location|settings/i);
      ui.unmount();
    } finally { net.restore(); }
  });

  test('a router that says nothing costs the turns, not the screen', async () => {
    const net = router('fails');
    memoryStore();
    try {
      const ui = await mountScreen(h(NavigateScreen, { destination: DESTINATION, onBack: noop }));
      await ui.pressText(/Start/);
      const said = ui.text();
      // Still a screen with a place on it and a way out, not a blank map.
      assert.match(said, /Chaweng Beach|No route/);
      ui.unmount();
    } finally { net.restore(); }
  });

  test('offline with a saved route for this place follows it rather than failing', async () => {
    const store = memoryStore();
    const route = parseNavRoute(REPLY, 'walk')!;
    store.set('chivago.navigation.session', JSON.stringify({
      version: 1,
      session: { destination: DESTINATION, mode: 'walk', route, savedAt: Date.now() },
    }));
    const net = router('fails');
    try {
      const ui = await mountScreen(h(NavigateScreen, { destination: DESTINATION, onBack: noop }));
      await ui.pressText(/Start/);
      const said = ui.text();
      assert.match(said, /Turn left/, 'the saved route still carries its turns');
      ui.unmount();
    } finally { net.restore(); }
  });

  test('a saved route to somewhere else is never drawn for this place', async () => {
    const store = memoryStore();
    const route = parseNavRoute(REPLY, 'walk')!;
    store.set('chivago.navigation.session', JSON.stringify({
      version: 1,
      session: {
        // Two kilometres away: a different trip, however similar the shape.
        destination: { ...DESTINATION, id: 'lamai', lat: 9.46, lng: 100.04 },
        mode: 'walk', route, savedAt: Date.now(),
      },
    }));
    const net = router('fails');
    try {
      const ui = await mountScreen(h(NavigateScreen, { destination: DESTINATION, onBack: noop }));
      await ui.pressText(/Start/);
      assert.ok(!/Turn left/.test(ui.text()), 'another place’s route is not this place’s route');
      ui.unmount();
    } finally { net.restore(); }
  });
});

// ---------------------------------------------------------------------------

describe('the way in, from the map', () => {
  const place = fx.place();
  const route = parseNavRoute(REPLY, 'walk')!;

  test('the way banner offers to navigate, and says which place', () => {
    let asked = 0;
    const ui = mount(h(WayBanner, {
      place, route, loading: false, failed: false, haveHere: true,
      mode: 'walk' as const, onMode: noop, onClear: noop, onNavigate: () => { asked += 1; },
    }));
    assert.match(ui.text(), /Chaweng Beach/);
    assert.ok(ui.labels().includes('Start'));
    void ui.press('Start').then(() => { assert.equal(asked, 1); });
    ui.unmount();
  });

  test('without the navigator the banner is still a complete banner', () => {
    const ui = mount(h(WayBanner, {
      place, route, loading: false, failed: false, haveHere: true,
      mode: 'walk' as const, onMode: noop, onClear: noop,
    }));
    assert.match(ui.text(), /Chaweng Beach/);
    assert.ok(!ui.labels().includes('Start'));
    ui.unmount();
  });
});


// ---------------------------------------------------------------------------

describe('a trip the router will not plan', () => {
  /*
    FROM A BROWSER LOG, NOT IMAGINED.

    A traveller in Nakhon Ratchasima opened a shop on Ko Sichang - 220 km
    away - and the app sent the pedestrian router the same doomed request
    THREE times, collecting three 400s from a free community server:

      "Path distance exceeds the max distance limit: 100000 meters"

    and showed them "no road route right now", which sounds like the server
    is down and says nothing about the thing they could actually change.
  */
  const FAR = {
    id: 'sichang-shop',
    name: { en: 'Ta Ta Restaurant', th: 'ร้านอาหารตาต้า', zh: '塔塔餐厅' },
    lat: 13.163311,
    lng: 100.807704,
  };

  test('a 220 km walk is refused without troubling the router at all', async () => {
    const net = router(REPLY);
    memoryStore();
    try {
      // The stub stands the traveller on Samui; the shop is on Ko Sichang.
      const ui = await mountScreen(h(NavigateScreen, { destination: FAR, onBack: noop }));
      await ui.pressText(/Start/);
      assert.equal(net.asked.length, 0, 'not one request may go out for a walk this long');
      assert.match(ui.text(), /Too far/);
      ui.unmount();
    } finally { net.restore(); }
  });

  test('and the button offered is the one that might work', async () => {
    const net = router(REPLY);
    memoryStore();
    try {
      const ui = await mountScreen(h(NavigateScreen, { destination: FAR, onBack: noop }));
      await ui.pressText(/Start/);
      // Not "Retry", which would ask the same impossible question again.
      assert.ok(ui.labels().includes('By road') || /By road/.test(ui.text()));
      ui.unmount();
    } finally { net.restore(); }
  });

  test('the way banner says which refusal it was, not just that one happened', () => {
    const place = fx.place();
    const tooFar = mount(h(WayBanner, {
      place, route: null, loading: false, failed: true, refusal: 'too-far' as const,
      haveHere: true, mode: 'walk' as const, onMode: noop, onClear: noop,
    }));
    assert.match(tooFar.text(), /Too far for this mode/);
    tooFar.unmount();

    // An island: the road stops at the water, and no retry changes that.
    const noPath = mount(h(WayBanner, {
      place, route: null, loading: false, failed: true, refusal: 'no-path' as const,
      haveHere: true, mode: 'ride' as const, onMode: noop, onClear: noop,
    }));
    assert.match(noPath.text(), /No road goes all the way|by boat/);
    noPath.unmount();
  });

  test('with no reason given it still says the honest old thing', () => {
    const ui = mount(h(WayBanner, {
      place: fx.place(), route: null, loading: false, failed: true,
      haveHere: true, mode: 'walk' as const, onMode: noop, onClear: noop,
    }));
    assert.match(ui.text(), /dashed line is the direction/);
    ui.unmount();
  });
});

// ---------------------------------------------------------------------------

describe('the way in, from a business', () => {
  /*
    A pinned business on Ko Sichang, in the shape the shops API really
    returns - a plain name rather than a localised one, and a nullable
    coordinate, both of which the navigator has to cope with.
  */
  const shop = {
    id: 's1', name: 'ร้านอาหารตาต้า', category: 'ร้านอาหาร', areaKey: 'sichang',
    description: '', address: 'หกฟหกฟหกฟ', lat: 13.16117, lng: 100.80886,
    phone: '09999999', email: 'milk4ta@example.com', openingHours: '', amenities: ['เยอะแยะ'],
    active: true, rating: 0, reviewCount: 0, coverUrl: null, guideProfilePhotoUrl: null,
    owner: false, serviceType: 'shop', guideLanguages: [], guideSkills: [], guideTourStyles: [],
    guideLineId: '', guideStatus: 'approved', images: [],
  };
  const routes = {
    'GET /shops/s1': shop,
    'GET /shops/s1/reviews': { reviews: [], nextCursor: null },
    'GET /shops/s1/reviews/mine': { review: null },
  };

  test('"นำทาง" opens the app’s own navigator, with the shop as the destination', async () => {
    const net = server(routes);
    const asked: unknown[] = [];
    const ui = await mountScreen(h(ShopProfileScreen, {
      shopId: 's1', onBack: noop, onEdit: noop,
      onNavigate: (destination: unknown) => { asked.push(destination); },
    }));
    try {
      await ui.press('Get directions');
      assert.equal(asked.length, 1, 'the button must reach the navigator, not a browser');
      assert.deepEqual(asked[0], {
        id: 's1', name: 'ร้านอาหารตาต้า', lat: 13.16117, lng: 100.80886,
      });
    } finally { ui.unmount(); net.restore(); }
  });

  test('the Google Maps handoff is still there, underneath', async () => {
    const net = server(routes);
    const ui = await mountScreen(h(ShopProfileScreen, {
      shopId: 's1', onBack: noop, onEdit: noop, onNavigate: noop,
    }));
    try {
      assert.ok(ui.labels().includes('Open in Google Maps'));
    } finally { ui.unmount(); net.restore(); }
  });

  test('without a navigator the button is the handoff, exactly as it was', async () => {
    const net = server(routes);
    const ui = await mountScreen(h(ShopProfileScreen, { shopId: 's1', onBack: noop, onEdit: noop }));
    try {
      assert.ok(ui.labels().includes('Get directions'));
      // No second control: the one button still leaves for Google Maps.
      assert.ok(!ui.labels().includes('Open in Google Maps'));
    } finally { ui.unmount(); net.restore(); }
  });

  test('a business with no coordinate offers no navigation at all', async () => {
    const net = server({ ...routes, 'GET /shops/s1': { ...shop, lat: null, lng: null } });
    const ui = await mountScreen(h(ShopProfileScreen, {
      shopId: 's1', onBack: noop, onEdit: noop, onNavigate: noop,
    }));
    try {
      // Nowhere to navigate to is not a button that does nothing.
      assert.ok(!ui.labels().includes('Get directions'));
    } finally { ui.unmount(); net.restore(); }
  });
});
