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
    const ui = await mountScreen(h(StoriesBlock, { open: false, stories: [], pending: 0, busy: false, onTell: noop }));
    assert.match(ui.text(), /Stories open at the event/);
    assert.match(ui.text(), /No stories here yet/);
    assert.doesNotMatch(ui.text(), /Tell a story/);
    ui.unmount();
  });

  test('open: offers the camera, and a press asks for it', async () => {
    let asked = 0;
    const ui = await mountScreen(h(StoriesBlock, { open: true, stories: [], pending: 0, busy: false, onTell: () => { asked += 1; } }));
    await ui.pressText(/Tell a story here/);
    assert.equal(asked, 1);
    ui.unmount();
  });

  test('a sent story is pending, counted, and not in the row', async () => {
    const ui = await mountScreen(h(StoriesBlock, { open: true, stories: [], pending: 1, busy: false, onTell: noop }));
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
  test('an open door says what happens to the clip before offering the camera', async () => {
    const ui = await mountScreen(h(StoriesBlock, { open: true, stories: [], pending: 0, busy: false, onTell: noop }));
    assert.match(ui.text(), /stays in the app for 7 days/);
    assert.match(ui.text(), /happy to be filmed/);
    ui.unmount();
  });

  test('a shut door has no notice, because there is nothing to consent to', async () => {
    const ui = await mountScreen(h(StoriesBlock, { open: false, stories: [], pending: 0, busy: false, onTell: noop }));
    assert.doesNotMatch(ui.text(), /7 days/);
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
      await ui.pressText(/Tell a story here/);
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
