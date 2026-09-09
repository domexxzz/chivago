/**
 * Stories on a place: the row, the door, the viewer.
 *
 * What these hold: a closed door says when it opens rather than showing a
 * button that fails; an open door offers the camera; a tapped poster opens
 * the viewer on that story with its caption; a sent story is counted as
 * pending and never shown as if it were approved.
 */
import { describe, test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';

import { act } from 'react-test-renderer';

import { mountScreen, refuses, server, settle } from './interact.ts';
import { control, resetControl } from './stubs/native.mjs';
import * as fx from './fixtures.ts';
import { StoriesBlock } from '../src/components/Stories.tsx';
import { PlaceScreen } from '../src/screens/PlaceScreen.tsx';
import { MapScreen } from '../src/screens/MapScreen.tsx';
import { SamuiMap } from '../src/components/SamuiMap.tsx';
import { __setAreaForTests } from '../src/state/area.ts';

const noop = () => {};

const story = (over: Partial<Parameters<typeof StoriesBlock>[0]['stories'][number]> = {}) => ({
  id: 's1', placeId: 'chaweng', kind: 'video' as const, caption: 'low tide, nobody about', status: 'approved' as const,
  createdAt: '2026-09-11T02:00:00.000Z', expiresAt: '2026-09-18T02:00:00.000Z', durationS: 8,
  media: '/stories/s1/media', poster: '/stories/s1/poster', ...over,
});

describe('the door', () => {
  test('shut: says when it opens, offers no button', async () => {
    const ui = await mountScreen(h(StoriesBlock, { open: false, stories: [], pending: 0 }));
    assert.match(ui.text(), /Stories open at the event/);
    assert.match(ui.text(), /No stories here yet/);
    assert.doesNotMatch(ui.text(), /Tell a story/);
    ui.unmount();
  });

  /*
    The camera moved. It used to be this block's own button, beside the
    reviews block's own button, which asked somebody to decide which KIND of
    thing they were leaving before they had said anything. Stars, words and a
    clip are one sheet now (ComposeSheet), so an open door here means the
    block simply stops saying the door is shut.
  */
  test('open: the block stops saying the door is shut, and offers no button of its own', async () => {
    const ui = await mountScreen(h(StoriesBlock, { open: true, stories: [], pending: 0 }));
    assert.doesNotMatch(ui.text(), /Stories open at the event/);
    assert.doesNotMatch(ui.text(), /Tell a story/);
    ui.unmount();
  });

  test('a sent story is pending, counted, and not in the row', async () => {
    const ui = await mountScreen(h(StoriesBlock, { open: true, stories: [], pending: 1 }));
    assert.match(ui.text(), /Sent\. It shows once the team has looked at it · 1/);
    assert.match(ui.text(), /No stories here yet/);
    ui.unmount();
  });
});

describe('the viewer', () => {
  test('a tapped poster opens that story, with its caption and its place in the row', async () => {
    const ui = await mountScreen(h(StoriesBlock, {
      open: false, stories: [story(), story({ id: 's2', caption: 'the 7-11 queue', durationS: 4, media: '/stories/s2/media', poster: '/stories/s2/poster' })],
      pending: 0, busy: false, onTell: noop,
    }));
    assert.doesNotMatch(ui.text(), /low tide, nobody about/, 'captions live in the viewer, not the row');
    await ui.pressText(/^4 s$/);
    assert.match(ui.text(), /the 7-11 queue/);
    assert.match(ui.text(), /2 \/ 2/);
    ui.unmount();
  });
});

describe('the place screen carries the block', () => {
  test('it asks for the place’s stories and shows the door’s state', async () => {
    const net = server({
      'GET /places/chaweng': fx.place(),
      'GET /checkins/today': [],
      'GET /visits/self': { places: [], remainingThisYear: 10 },
      'GET /places/chaweng/reviews': { reviews: [], mine: null, canReview: false, reported: [] },
      'GET /places/chaweng/history': { since: null, days: [] },
      'GET /places/chaweng/stories': { open: false, stories: [story()] },
    });
    try {
      const ui = await mountScreen(h(PlaceScreen, {
        placeId: 'chaweng', onBack: noop, onAddToTrip: noop, onSafePath: noop, onToast: noop, onPointsChanged: noop,
      }));
      await settle();
      assert.ok(net.calls.some((c) => c.path === '/places/chaweng/stories'), 'the stories were never asked for');
      assert.match(ui.text(), /Stories open at the event/);
      assert.match(ui.text(), /8 s/, 'the approved story is in the row');
      ui.unmount();
    } finally { net.restore(); }
  });
});

describe('the notice at the door', () => {
  /*
    The notice travelled with the camera into ComposeSheet, which is the
    moment before the picker opens - where docs/46 wants it, and now the
    only place a clip can be attached from. The block itself consents to
    nothing because it asks for nothing.
  */
  test('the notice is with the camera, in the sheet, not in this block', async () => {
    const ui = await mountScreen(h(StoriesBlock, { open: true, stories: [], pending: 0 }));
    assert.doesNotMatch(ui.text(), /happy to be filmed/);
    ui.unmount();
  });

  test('a shut door still says when it opens', async () => {
    const ui = await mountScreen(h(StoriesBlock, { open: false, stories: [], pending: 0 }));
    assert.match(ui.text(), /Stories open at the event/);
    ui.unmount();
  });
});

describe('what the phone is told when the server says no', () => {
  // Two refusals a person can act on from where they stand get the app's
  // own words in their language; the first version showed the server's
  // English sentence for every refusal.
  const routes = (reply: unknown) => ({
    'GET /places/chaweng': fx.place(),
    'GET /checkins/today': [],
    'GET /visits/self': { places: [], remainingThisYear: 10 },
    'GET /places/chaweng/reviews': { reviews: [], mine: null, canReview: false, reported: [] },
    'GET /places/chaweng/history': { since: null, days: [] },
    'GET /places/chaweng/stories': { open: true, stories: [] },
    'POST /places/chaweng/stories': reply,
  });
  // The web picker's asset: a Blob under `file`, which is how the browser
  // hands the phone's camera roll to a page at the pitch.
  const photo = {
    canceled: false,
    assets: [{
      uri: 'blob:IMG_0001', type: 'image', fileName: 'IMG_0001.HEIC', mimeType: 'image/heic',
      file: new Blob([new Uint8Array([0, 0, 0, 0x18])], { type: 'image/heic' }),
    }],
  };

  const tell = async (reply: unknown) => {
    const net = server(routes(reply));
    const toasts: string[] = [];
    control.camera = photo as typeof control.camera;
    try {
      const ui = await mountScreen(h(PlaceScreen, {
        placeId: 'chaweng', onBack: noop, onAddToTrip: noop, onSafePath: noop, onToast: (m: string) => { toasts.push(m); }, onPointsChanged: noop,
      }));
      // Through the one sheet now: open it, attach a clip, then post.
      await ui.pressText(/Leave something here/);
      await settle();
      await ui.pressText(/Add a photo or a clip/);
      await settle();
      await ui.pressText(/^Post$/);
      await settle();
      ui.unmount();
      assert.ok(net.calls.some((c) => c.method === 'POST' && c.path === '/places/chaweng/stories'), 'the story was never sent');
      return toasts;
    } finally { net.restore(); resetControl(); }
  };

  test('an iPhone HEIC the server could not convert: what to change in Settings, in the app’s words', async () => {
    const toasts = await tell(refuses('STORY_HEIC', 'That file could not be used as a story: an iPhone HEIC photograph could not be converted here.'));
    assert.equal(toasts.length, 1);
    assert.match(toasts[0]!, /Most Compatible/);
    assert.doesNotMatch(toasts[0]!, /could not be used as a story/, 'the server’s sentence, not the app’s');
  });

  test('too large: the limit and the remedy', async () => {
    const toasts = await tell(refuses('STORY_TOO_LARGE', 'A story must be under 25 MB. Ten seconds is plenty.'));
    assert.match(toasts[0]!, /over 25 MB/);
  });

  test('any other refusal still carries the server’s reason', async () => {
    const toasts = await tell(refuses('STORY_QUOTA', 'That is 3 stories today already. Tomorrow is another day.'));
    assert.match(toasts[0]!, /3 stories today/);
  });
});

/**
 * The poster on the pin.
 *
 * A gold ring said a place HAD a story and never showed one, which on a map
 * is most of the point: the photograph somebody took at that beach is the
 * thing worth looking at, and an outline is a footnote about it.
 *
 * The map itself needs a browser and a GPU, so what is held here is the
 * decision that feeds it - which poster each pin wears, and that a place
 * with several wears its newest.
 */
describe('which poster a pin wears', () => {
  const areaStory = (over: Record<string, unknown> = {}) => ({
    ...story(), placeId: 'chaweng', placeName: { en: 'Chaweng Beach', th: 'หาดเฉวง' }, ...over,
  });

  /** The same reduction MapScreen does, kept honest here. */
  const posters = (stories: { placeId: string; poster: string }[]) => {
    const out = new Map<string, string>();
    for (const s of stories) if (!out.has(s.placeId)) out.set(s.placeId, s.poster);
    return out;
  };

  test('a place with no story wears none', () => {
    assert.equal(posters([]).get('chaweng'), undefined);
  });

  test('a place with one wears it', () => {
    const map = posters([areaStory({ poster: '/stories/s1/poster' })]);
    assert.equal(map.get('chaweng'), '/stories/s1/poster');
  });

  test('a place with several wears its newest, because the feed is newest first', () => {
    const map = posters([
      areaStory({ id: 's-new', poster: '/stories/s-new/poster' }),
      areaStory({ id: 's-old', poster: '/stories/s-old/poster' }),
    ]);
    assert.equal(map.get('chaweng'), '/stories/s-new/poster');
  });

  test('two places each keep their own', () => {
    const map = posters([
      areaStory({ poster: '/stories/a/poster' }),
      areaStory({ placeId: 'lamai', poster: '/stories/b/poster' }),
    ]);
    assert.equal(map.get('chaweng'), '/stories/a/poster');
    assert.equal(map.get('lamai'), '/stories/b/poster');
  });
});

/**
 * The bar at the foot of the map.
 *
 * The journey sketch has posting start on the map, not two screens in, and
 * that raises the one question a place screen never has to answer: WHICH
 * place is this clip for. The bar answers it on its own face, before the
 * camera opens, by naming the nearest pin - so nobody finds out where their
 * moment landed from a toast afterwards.
 *
 * With no position there is no nearest, and the bar says to turn location on
 * rather than picking a place on somebody's behalf.
 */
describe('adding a moment from the map', () => {
  const mapProps = {
    layers: { Green: true, Wellness: true, Food: true, Safe: true, Quest: true },
    onToggleLayer: noop, onPlanDay: noop, onOpenPlace: noop, onOpenQuest: noop,
    onSeeAllQuests: noop, onAskConcierge: noop, onOpenWallet: noop, onToast: noop,
    balances: { green: 120, trip: 340 },
  };

  // The camera's answer on the web: a Blob under `file`, which is how a
  // browser hands the phone's roll to a page at the pitch.
  const clip = {
    canceled: false,
    assets: [{
      uri: 'blob:IMG_0002', type: 'image', fileName: 'IMG_0002.jpg', mimeType: 'image/jpeg',
      file: new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], { type: 'image/jpeg' }),
    }],
  };

  const routes = (over: Record<string, unknown> = {}) => ({
    'GET /places': [fx.place({ layer: 'Safe' })],
    '/quests?filter=today': { quests: [], progress: {} },
    '/explored': { places: [] },
    'GET /areas/samui/stories': { stories: [] },
    'POST /places/chaweng/stories': { id: 's9', status: 'approved' },
    ...over,
  });

  let restore: (() => void) | null = null;
  afterEach(() => { restore?.(); restore = null; resetControl(); __setAreaForTests('samui'); });

  test('it names the place the clip will land on', async () => {
    __setAreaForTests('samui');
    const net = server(routes()); restore = net.restore;
    const ui = await mountScreen(h(MapScreen, mapProps));
    assert.match(ui.text(), /Add your moment at Chaweng Beach/);
    ui.unmount();
  });

  test('with no position it asks for location instead of guessing a place', async () => {
    // Guessing would be the worst outcome: a clip filed at a beach the
    // person is not standing on is a false record, not a small mistake.
    __setAreaForTests('samui');
    control.permission = { granted: false, status: 'denied' };
    const net = server(routes()); restore = net.restore;
    const ui = await mountScreen(h(MapScreen, mapProps));
    assert.match(ui.text(), /Turn on location to post from the map/);
    assert.doesNotMatch(ui.text(), /Add your moment/);

    // And the press does nothing, which is the guard rather than the greyed
    // pixels: the harness calls onPress the way a race would.
    await ui.pressText(/Turn on location/);
    await settle();
    assert.equal(net.calls.filter((c) => c.method === 'POST').length, 0, 'a clip was posted with no place to post it to');
    ui.unmount();
  });

  test('a press films, posts to the nearest place, thanks them, and re-asks the board', async () => {
    __setAreaForTests('samui');
    control.camera = clip as typeof control.camera;
    const toasts: string[] = [];
    const net = server(routes()); restore = net.restore;
    const ui = await mountScreen(h(MapScreen, { ...mapProps, onToast: (m: string) => { toasts.push(m); } }));

    const before = net.calls.filter((c) => c.path === '/areas/samui/stories').length;
    await ui.pressText(/Add your moment at Chaweng Beach/);
    await settle();

    assert.ok(
      net.calls.some((c) => c.method === 'POST' && c.path === '/places/chaweng/stories'),
      'the clip never went to the nearest place',
    );
    assert.deepEqual(toasts, ['Thank you. Your clip is up on the board.']);
    assert.ok(
      net.calls.filter((c) => c.path === '/areas/samui/stories').length > before,
      'the board was not re-asked, so the new poster would not appear on the pin',
    );
    ui.unmount();
  });

  test('a cancelled camera posts nothing and says nothing', async () => {
    // Somebody who changed their mind does not need telling that they did.
    __setAreaForTests('samui');
    const toasts: string[] = [];
    const net = server(routes()); restore = net.restore;
    const ui = await mountScreen(h(MapScreen, { ...mapProps, onToast: (m: string) => { toasts.push(m); } }));
    await ui.pressText(/Add your moment/);
    await settle();
    assert.equal(net.calls.filter((c) => c.method === 'POST').length, 0);
    assert.deepEqual(toasts, []);
    ui.unmount();
  });

  test('a refusal carries the server’s own sentence, not a thank-you', async () => {
    __setAreaForTests('samui');
    control.camera = clip as typeof control.camera;
    const toasts: string[] = [];
    const net = server(routes({
      'POST /places/chaweng/stories': refuses('STORY_QUOTA', 'That is 3 stories today already. Tomorrow is another day.'),
    }));
    restore = net.restore;
    const ui = await mountScreen(h(MapScreen, { ...mapProps, onToast: (m: string) => { toasts.push(m); } }));
    await ui.pressText(/Add your moment/);
    await settle();
    assert.equal(toasts.length, 1);
    assert.match(toasts[0]!, /3 stories today/);
    assert.doesNotMatch(toasts[0]!, /Thank you/, 'a refused clip was thanked for');
    ui.unmount();
  });

  test('with nothing on the map there is no bar, because there is nowhere for a clip to land', async () => {
    __setAreaForTests('samui');
    const off = { Green: false, Wellness: false, Food: false, Safe: false, Quest: false };
    const net = server(routes()); restore = net.restore;
    const ui = await mountScreen(h(MapScreen, { ...mapProps, layers: off }));
    assert.doesNotMatch(ui.text(), /Add your moment/);
    assert.doesNotMatch(ui.text(), /Turn on location to post/);
    ui.unmount();
  });
});

/**
 * The poster ON the drawn pin, which is the map a phone actually gets.
 *
 * The web map has worn its posters since the 9th; the hand-drawn island -
 * native, and the fallback on `?map=drawn` - still showed only a gold ring,
 * so half the audience at the pitch would see the feature and half would
 * not. What is held here is the pin's own door: a place with a story gets a
 * second control, and it opens the clip rather than the place.
 *
 * Mounted as the map alone, not through MapScreen. The drawn island renders
 * nothing until it has a width, and node's window is 0 x 0 - so the layout
 * event a browser would send is sent by hand.
 */
describe('the drawn map wears its posters too', () => {
  const chaweng = fx.place();

  /** Give the map a phone's width, the way a real layout pass would. */
  const withWidth = async (ui: Awaited<ReturnType<typeof mountScreen>>, width = 390) => {
    const node = ui.root.findAll((n) => typeof n.props.onLayout === 'function', { deep: true })[0];
    assert.ok(node, 'the map has no layout to answer');
    await act(async () => { node.props.onLayout({ nativeEvent: { layout: { width } } }); });
  };

  const mapProps = (over: Record<string, unknown> = {}) => ({
    places: [chaweng], onSelect: noop, height: 344,
    tales: new Map([['chaweng', '/stories/s1/poster']]),
    onOpenStory: noop,
    ...over,
  });

  test('a place with a story gets a poster on its pin', async () => {
    const ui = await mountScreen(h(SamuiMap, mapProps()));
    await withWidth(ui);
    assert.ok(ui.find('Stories: Chaweng Beach'), 'the pin wears no poster');
    ui.unmount();
  });

  test('a place with none gets none, rather than an empty frame', async () => {
    const ui = await mountScreen(h(SamuiMap, mapProps({ tales: new Map() })));
    await withWidth(ui);
    assert.equal(ui.find('Stories: Chaweng Beach'), undefined);
    // The pin itself is still there; it is the photograph that is absent.
    assert.ok(ui.find(/Chaweng Beach, Healthy Score/), 'the pin went with the poster');
    ui.unmount();
  });

  test('the poster opens the clip; the chip beside it opens the place', async () => {
    // Two doors on one pin, and they must not be the same door: a tap on a
    // photograph that dropped somebody on a place screen would lose the
    // thing they tapped.
    let openedStory: string | null = null;
    let openedPlace: string | null = null;
    const ui = await mountScreen(h(SamuiMap, mapProps({
      onOpenStory: (id: string) => { openedStory = id; },
      onSelect: (p: { id: string }) => { openedPlace = p.id; },
    })));
    await withWidth(ui);

    await ui.press('Stories: Chaweng Beach');
    assert.equal(openedStory, 'chaweng');
    assert.equal(openedPlace, null, 'the poster opened the place instead of the story');

    await ui.press(/Chaweng Beach, Healthy Score/);
    assert.equal(openedPlace, 'chaweng');
    ui.unmount();
  });

  test('the poster it wears is the one the screen handed it', async () => {
    // The path matters: a bubble showing some other place's photograph is
    // worse than no bubble, because it reads as a record of being here.
    const ui = await mountScreen(h(SamuiMap, mapProps()));
    await withWidth(ui);
    const bubble = ui.find('Stories: Chaweng Beach')!;
    const image = bubble.findAll((n) => typeof n.props.source?.uri === 'string', { deep: true })[0];
    assert.ok(image, 'the bubble has no image in it');
    assert.match(image.props.source.uri as string, /\/stories\/s1\/poster$/);
    ui.unmount();
  });

  test('a map with no story handler draws no bubbles at all', async () => {
    // The place screen mounts this map too, and there a poster that opened
    // nothing would be a photograph you cannot tap.
    const ui = await mountScreen(h(SamuiMap, mapProps({ onOpenStory: undefined })));
    await withWidth(ui);
    assert.equal(ui.find('Stories: Chaweng Beach'), undefined);
    ui.unmount();
  });
});
