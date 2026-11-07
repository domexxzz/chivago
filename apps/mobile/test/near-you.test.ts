/**
 * What the map says to somebody who does not know where they are.
 *
 * The drawn island is a traced coastline: no roads, no scale, no north. The
 * only number on it was each pin's Healthy Score, which answers a question
 * about air and quiet - not the one a lost traveller is asking. These hold
 * the answer to theirs: which way, how far, and can I walk it.
 */

import { describe, test, afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';

import { MapScreen } from '../src/screens/MapScreen.tsx';
import { mountScreen, server } from './interact.ts';
import * as fx from './fixtures.ts';
import { __setAreaForTests } from '../src/state/area.ts';
import { control, resetControl } from './stubs/native.mjs';

const noop = () => {};
const mapProps = {
  layers: { Green: true, Wellness: true, Food: true, Safe: true, Quest: true },
  onToggleLayer: noop, onPlanDay: noop, onOpenPlace: noop, onOpenQuest: noop, onSeeAllQuests: noop,
  onAskConcierge: noop, onOpenWallet: noop,
  balances: { green: 120, trip: 340 },
};

// Chaweng is the fixture place; these sit east and far north of it.
const CHAWENG = { lat: 9.5357, lng: 100.0629 };
const routes = () => ({
  '/places': [
    fx.place({ id: 'chaweng', layer: 'Safe', name: { en: 'Chaweng Beach', th: 'หาดเฉวง', zh: '查汶海滩' }, ...CHAWENG }),
    fx.place({ id: 'lamai', layer: 'Green', name: { en: 'Lamai', th: 'ละไม', zh: '拉迈' }, lat: 9.4700, lng: 100.0400 }),
  ],
});

let restore = noop;
// Before as well as after: the afterEach put the area back for the NEXT test,
// which left the first test in the file running on DEFAULT_AREA. That was
// Samui, so it happened to match these fixtures, until the default moved to
// Koh Sichang and the first test started failing on its own.
beforeEach(() => { __setAreaForTests('samui'); });
afterEach(() => { restore(); restore = noop; resetControl(); __setAreaForTests('samui'); });

describe('the map tells a lost traveller which way to walk', () => {
  test('STANDING NEXT TO A PLACE, IT SAYS HOW FAR AND WHICH WAY', async () => {
    __setAreaForTests('samui');
    // A few hundred metres west of Chaweng: close enough that a walk is real.
    control.position = { coords: { latitude: 9.5357, longitude: 100.0590, accuracy: 12 } };
    const s = server(routes()); restore = s.restore;
    const ui = await mountScreen(h(MapScreen, mapProps));
    try {
      const said = ui.text();
      assert.match(said, /Nearest to you/, 'the rows are ordered by the question being asked');
      // "430 m east of you" - the distance and the compass point together.
      assert.match(said, /\d+\s?(m|km)\s+\w+\s+of you/, 'a distance and a direction, not just a score');
      assert.match(said, /on foot/, 'and whether it can be walked');
    } finally { ui.unmount(); }
  });

  test('WITH NO POSITION IT SAYS SO, AND NEVER INVENTS A DISTANCE', async () => {
    /*
      The honest state, and the common one: `here.ts` is explicit that only a
      check-in asks for location, so most of the time the map has none. A
      guessed distance is worse than no distance - somebody acts on it.
    */
    __setAreaForTests('samui');
    control.permission = { granted: false, status: 'denied' };
    control.position = null;
    const s = server(routes()); restore = s.restore;
    const ui = await mountScreen(h(MapScreen, mapProps));
    try {
      const said = ui.text();
      assert.match(said, /Distance needs your location/, 'it says what is missing');
      assert.doesNotMatch(said, /of you/, 'and states no direction it cannot know');
      assert.doesNotMatch(said, /on foot/, 'nor a walk it cannot time');
      assert.match(said, /Chaweng Beach/, 'the places are still listed and still tappable');
    } finally { ui.unmount(); }
  });

  test('THE SCORE IS STILL THERE — IT IS JUST NO LONGER THE ONLY THING', async () => {
    __setAreaForTests('samui');
    control.position = { coords: { latitude: 9.5357, longitude: 100.0590, accuracy: 12 } };
    const s = server(routes()); restore = s.restore;
    const ui = await mountScreen(h(MapScreen, mapProps));
    try {
      // Why this app exists, kept beside the wayfinding rather than replaced
      // by it: the map now answers two questions instead of one.
      assert.match(ui.text(), /Chaweng Beach/, 'the place is named');
      assert.match(ui.text(), /\b\d{2}\b/, 'and its score is still on the row');
    } finally { ui.unmount(); }
  });
});
