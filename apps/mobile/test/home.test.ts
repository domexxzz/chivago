import { strict as assert } from 'node:assert';
import { test, describe, afterEach } from 'node:test';
import { createElement as h } from 'react';

import {
  HomeScreen, islandAverage, questOrder, weakestProvenance,
} from '../src/screens/HomeScreen.tsx';
import { mountScreen, server, offline } from './interact.ts';
import { control, resetControl } from './stubs/native.mjs';
import * as fx from './fixtures.ts';

/**
 * Home.
 *
 * The screen a judge opens first and the screen a lost traveller opens at 2am,
 * which are different jobs with the same answer: say what is true, then say
 * what can be done about it.
 *
 * The three exported functions below are the ones that could quietly start
 * lying — an average that hides a stale reading, a "recommendation" with no
 * basis, a zero where a missing number should be.
 */

const noop = () => {};
const props = {
  onOpenMap: noop, onOpenQuests: noop, onOpenQuest: noop, onOpenWallet: noop,
  onOpenPassport: noop, onOpenImpact: noop, onOpenConcierge: noop, onOpenSafety: noop,
  onOpenProfile: noop,
  // Fixed, so the greeting is a fact about this test and not about the clock.
  now: new Date('2026-09-02T02:00:00Z'), // 09:00 on the island
};

/** Everything Home fetches on mount. Override one key per test. */
const routes = (over: Record<string, unknown> = {}) => ({
  '/places': [fx.place()],
  '/quests?filter=today': { quests: [fx.quest()], progress: {} },
  '/wallet': { balances: { green: 120, trip: 340 }, progression: null, ledger: [] },
  '/passport': { visited: ['TH-84'] },
  '/companions': { companions: [], summary: { found: 2, total: 5, grown: 1 }, speciesAsOf: '2026-09-01' },
  ...over,
});

let restore: (() => void) | null = null;
afterEach(() => { restore?.(); restore = null; });

describe('the average does not launder its worst input', () => {
  test('it is the mean of the measured scores', () => {
    assert.equal(islandAverage([fx.place({ healthyScore: 80 }), fx.place({ healthyScore: 90 })]), 85);
  });

  test('no places is null, never zero', () => {
    // Zero would render as a catastrophic island. "We have not measured
    // anything" and "everything measured badly" are different sentences.
    assert.equal(islandAverage([]), null);
  });

  test('a summary is only as fresh as its stalest component', () => {
    // The fixture is live+daily, so it reports daily. One estimated reading
    // anywhere in the set drags the whole label down, which is the point: an
    // average labelled "Live" that contains an estimate is the average
    // borrowing credibility from its best member.
    assert.equal(weakestProvenance([fx.place()]), 'daily');

    const stale = fx.place({
      breakdown: {
        ...fx.place().breakdown,
        components: [{
          key: 'aqi', label: { en: 'Air quality', th: 'คุณภาพอากาศ' },
          display: '42 AQI', subScore: 88, weight: 1, provenance: 'stale',
        }],
      },
    });
    assert.equal(weakestProvenance([fx.place(), stale]), 'stale');
  });

  test('an empty set is live rather than throwing', () => {
    assert.equal(weakestProvenance([]), 'live');
  });
});

describe('the quest order claims nothing it cannot support', () => {
  const a = fx.quest({ id: 'a' });
  const b = fx.quest({ id: 'b' });
  const c = fx.quest({ id: 'c' });

  test('a quest already under way comes first', () => {
    const order = questOrder([a, b, c], { c: fx.progress({ questId: 'c', stage: 'arrived' }) });
    assert.deepEqual(order.map((q) => q.id), ['c', 'a', 'b']);
  });

  test('a finished quest is not "under way" and does not jump the queue', () => {
    const order = questOrder([a, b], { b: fx.progress({ questId: 'b', stage: 'complete' }) });
    assert.deepEqual(order.map((q) => q.id), ['a', 'b']);
  });

  test('with no progress at all the server order is left alone', () => {
    // Deliberately NOT sorted by reward. Ranking by payout would be the app
    // recommending whatever it most wants done and calling it a suggestion.
    assert.deepEqual(questOrder([a, b, c], {}).map((q) => q.id), ['a', 'b', 'c']);
  });
});

describe('what Home says', () => {
  test('it leads with the measured condition and names its provenance', async () => {
    const s = server(routes()); restore = s.restore;
    const ui = await mountScreen(h(HomeScreen, props));
    const said = ui.text();

    assert.match(said, /82/, 'the island score is missing');
    assert.match(said, /Updated daily/, 'the provenance is not stated');
    assert.match(said, /1 measured place/, 'it did not say how many places it averaged');
    ui.unmount();
  });

  test('a place with no photograph says so, and wears its habitat rather than a grey box', async () => {
    const s = server(routes({ '/places': [fx.place({ photo: null })] })); restore = s.restore;
    const ui = await mountScreen(h(HomeScreen, props));
    assert.ok(ui.labels().includes('Chaweng Beach, no photograph yet'), 'the card announces the missing photograph');
    ui.unmount();
  });

  test('a card carries how far away the place is, not just how good it is', async () => {
    // The row is scanned to choose WHERE to go, so the distance belongs on
    // the card and not only on the screen you reach by tapping one.
    const s = server(routes()); restore = s.restore;
    try {
      control.position = { coords: { latitude: 9.5262, longitude: 100.0518, accuracy: 12 } };
      const ui = await mountScreen(h(HomeScreen, props));
      assert.match(ui.text(), /1\.5 km/, 'the card shows no distance');
      // And a screen reader gets the same fact, with the direction.
      assert.ok(
        ui.labels().some((l) => /Chaweng Beach.*1\.5 km north-east of you/i.test(l)),
        'the distance is not spoken',
      );
      ui.unmount();
    } finally { resetControl(); }
  });

  test('standing on the place, the card says Here rather than a distance', async () => {
    // The default stub position IS Chaweng. "250 m" on a card for the beach
    // you are standing on is a worse answer than the word.
    const s = server(routes()); restore = s.restore;
    try {
      const ui = await mountScreen(h(HomeScreen, props));
      const said = ui.text();
      assert.match(said, /Here/);
      assert.doesNotMatch(said, /\d+ m\b/, 'a distance was shown from inside the fence');
      ui.unmount();
    } finally { resetControl(); }
  });

  test('with no location permission the cards simply carry no distance', async () => {
    // No dialog, no empty chip, no "unknown". The row is complete without it.
    const s = server(routes()); restore = s.restore;
    try {
      control.permission = { granted: false, status: 'denied' };
      const ui = await mountScreen(h(HomeScreen, props));
      const said = ui.text();
      assert.match(said, /Chaweng Beach/, 'the card is still there');
      // Asserted on the spoken label, not on the word "km": the card's own
      // meta line is "Beach · 2.1 km of sand", which is the collision that
      // put the distance in a chip on the photograph rather than under the
      // name in the first place.
      assert.match(said, /2\.1 km of sand/, 'the meta line is the one that owns "km" here');
      assert.ok(
        !ui.labels().some((l) => /of you|You're here/.test(l)),
        'a distance was spoken with no position',
      );
      ui.unmount();
    } finally { resetControl(); }
  });

  test('the profile is one tap from the top of Home', async () => {
    let opened = 0;
    const s = server(routes()); restore = s.restore;
    const ui = await mountScreen(h(HomeScreen, { ...props, onOpenProfile: () => { opened += 1; } }));
    await ui.press('Profile');
    assert.equal(opened, 1, 'the button at the top right opens the profile');
    ui.unmount();
  });

  test('the greeting follows island time, not the phone', async () => {
    const s = server(routes()); restore = s.restore;
    // 02:00 UTC is 09:00 on Samui: morning, on a phone that thinks it is night.
    const ui = await mountScreen(h(HomeScreen, props));
    assert.match(ui.text(), /Good morning/);
    ui.unmount();
  });

  test('a Trip reward on the Home card is not green either', async () => {
    const s = server(routes({
      '/quests?filter=today': { quests: [fx.quest({ rewardCurrency: 'trip', rewardPoints: 60 })], progress: {} },
    }));
    restore = s.restore;
    const ui = await mountScreen(h(HomeScreen, props));
    assert.match(ui.text(), /\+60 T/);
    ui.unmount();
  });

  test('the host who will approve it is named on the card', async () => {
    // A mission with an anonymous verifier is a task list. The name is the
    // reason the reward means anything, so it is on the card and not only
    // inside the detail screen.
    const s = server(routes()); restore = s.restore;
    const ui = await mountScreen(h(HomeScreen, props));
    assert.match(ui.text(), /Samui Municipality/);
    ui.unmount();
  });

  test('a completed mission is not offered again as something to do', async () => {
    // The demo account had finished all four of today's, and Home listed them
    // under "Today" — an invitation to repeat work that cannot be repeated.
    const s = server(routes({
      '/quests?filter=today': {
        quests: [fx.quest({ id: 'done' })],
        progress: { done: fx.progress({ questId: 'done', stage: 'complete' }) },
      },
    }));
    restore = s.restore;
    const ui = await mountScreen(h(HomeScreen, props));
    const said = ui.text();
    assert.doesNotMatch(said, /\+150 G/, 'a finished quest is still being offered');
    assert.match(said, /All 1 of today’s missions are done/);
    ui.unmount();
  });

  test('finishing everything and there being nothing are different days', async () => {
    // Praise for an empty schedule the traveller had no part in is the kind of
    // hollow encouragement that teaches people to ignore the app's messages.
    const s = server(routes({ '/quests?filter=today': { quests: [], progress: {} } }));
    restore = s.restore;
    const ui = await mountScreen(h(HomeScreen, props));
    assert.doesNotMatch(ui.text(), /are done/, 'it congratulated somebody for doing nothing');
    ui.unmount();
  });

  test('no missions today is said plainly, not padded', async () => {
    const s = server(routes({ '/quests?filter=today': { quests: [], progress: {} } }));
    restore = s.restore;
    const ui = await mountScreen(h(HomeScreen, props));
    const said = ui.text();
    assert.match(said, /No missions running today/);
    assert.doesNotMatch(said, /\+\d+ [GT]/, 'it invented a reward to fill the space');
    ui.unmount();
  });

  test('the two purses are labelled by what separates them', async () => {
    // This is the screen where somebody first learns there are two currencies.
    // If it shows two numbers and no reason, the distinction is decoration.
    const s = server(routes()); restore = s.restore;
    const ui = await mountScreen(h(HomeScreen, props));
    const said = ui.text();
    assert.match(said, /120/); assert.match(said, /340/);
    assert.match(said, /verified/i, 'the green purse does not say what makes it green');
    assert.match(said, /self/i, 'the trip purse does not say it is self-reported');
    ui.unmount();
  });

  test('the passport counts against 77, not against what we opened', async () => {
    const s = server(routes()); restore = s.restore;
    const ui = await mountScreen(h(HomeScreen, props));
    assert.match(ui.text(), /\/ 77/, 'the denominator flattered the app');
    ui.unmount();
  });
});

describe('one endpoint dying does not take the screen with it', () => {
  test('places is down, and everything else still renders', async () => {
    // The worst screen in the app to lose, because it is the one somebody
    // opens when they are lost. Five independent loads, five independent
    // failures.
    const s = server(routes({ '/places': offline() })); restore = s.restore;
    const ui = await mountScreen(h(HomeScreen, props));
    const said = ui.text();

    assert.match(said, /Conditions are unavailable/, 'it did not admit the conditions failed');
    assert.match(said, /Beach Cleanup/, 'a dead /places took the quests with it');
    assert.match(said, /120/, 'a dead /places took the wallet with it');
    ui.unmount();
  });

  test('a missing figure shows as an em dash and never as zero', async () => {
    const s = server(routes({ '/wallet': offline() })); restore = s.restore;
    const ui = await mountScreen(h(HomeScreen, props));
    const said = ui.text();

    assert.match(said, /—/, 'the unknown balance was not marked unknown');
    assert.doesNotMatch(said, /\b0\b\s*G/, 'an unknown balance rendered as zero points');
    assert.match(said, /shown as —, not as zero/, 'it did not explain the dashes');
    ui.unmount();
  });
});
