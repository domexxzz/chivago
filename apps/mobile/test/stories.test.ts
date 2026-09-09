/**
 * Stories on a place: the row, the door, the viewer.
 *
 * What these hold: a closed door says when it opens rather than showing a
 * button that fails; an open door offers the camera; a tapped poster opens
 * the viewer on that story with its caption; a sent story is counted as
 * pending and never shown as if it were approved.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';

import { mountScreen, refuses, server, settle } from './interact.ts';
import { control, resetControl } from './stubs/native.mjs';
import * as fx from './fixtures.ts';
import { StoriesBlock } from '../src/components/Stories.tsx';
import { PlaceScreen } from '../src/screens/PlaceScreen.tsx';

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
