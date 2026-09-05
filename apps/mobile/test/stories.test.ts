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

import { mountScreen, server, settle } from './interact.ts';
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
