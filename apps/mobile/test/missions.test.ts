import { strict as assert } from 'node:assert';
import { test, describe, afterEach } from 'node:test';
import { createElement as h } from 'react';

import { RANKED_BY } from '@chivago/core';
import { MissionsScreen } from '../src/screens/MissionsScreen.tsx';
import { mountScreen, server, offline } from './interact.ts';
import * as fx from './fixtures.ts';

/**
 * Missions, and the leaderboard that is the most dangerous thing in the app.
 *
 * The board ranks HOSTS on approvals, not travellers on points, and every
 * test below is about a way the obvious version would have lied: counting a
 * self-verified currency, counting the platform's own opening grant, drawing
 * a podium for one person, or hiding the host nobody has visited yet.
 */

const noop = () => {};
const props = { onOpen: noop, onOpenMarket: noop };

const standing = (over: Record<string, unknown> = {}) => ({
  hosts: [
    { hostId: 'busy', name: 'Samui Green Foundation', type: 'ngo', verified: 4, pending: 1, questsPosted: 2, greenIssued: 1600 },
    { hostId: 'quiet', name: 'Ocean Lab', type: 'hotel', verified: 0, pending: 0, questsPosted: 1, greenIssued: 0 },
  ],
  you: { userId: 'demo-user', displayName: 'Demo Traveller', greenVerified: 610, missionsVerified: 3 },
  participants: 1,
  rankedBy: RANKED_BY,
  ...over,
});

const routes = (over: Record<string, unknown> = {}) => ({
  '/quests': { quests: [fx.quest()], progress: {} },
  '/standing': standing(),
  '/offers': [fx.offer({ id: 'o1', costPoints: 180, currency: 'trip' })],
  '/wallet': { balances: { green: 610, trip: 340 }, progression: null, ledger: [] },
  ...over,
});

let restore: (() => void) | null = null;
afterEach(() => { restore?.(); restore = null; });

describe('the board says what it ranked on', () => {
  test('the basis is printed, not assumed', async () => {
    // A leaderboard whose basis is unstated is read as "points", which is the
    // one reading this board must prevent.
    const s = server(routes()); restore = s.restore;
    const ui = await mountScreen(h(MissionsScreen, props));
    assert.match(ui.text(), /Ranked by verified approvals only/);
    assert.match(ui.text(), /Self-reported points are not counted/);
    ui.unmount();
  });

  test('one traveller is stated as not a ranking', async () => {
    const s = server(routes()); restore = s.restore;
    const ui = await mountScreen(h(MissionsScreen, props));
    assert.match(ui.text(), /no traveller ranking yet/);
    ui.unmount();
  });

  test('nobody at all reads differently from one person', async () => {
    const s = server(routes({ '/standing': standing({ participants: 0, you: null }) }));
    restore = s.restore;
    const ui = await mountScreen(h(MissionsScreen, props));
    assert.match(ui.text(), /Nobody has verified points yet/);
    ui.unmount();
  });

  test('with enough participants the disclaimer goes away', async () => {
    const s = server(routes({ '/standing': standing({ participants: 7 }) }));
    restore = s.restore;
    const ui = await mountScreen(h(MissionsScreen, props));
    assert.doesNotMatch(ui.text(), /no traveller ranking/);
    ui.unmount();
  });
});

describe('the hosts are the board', () => {
  test('a host with approvals shows them, in order', async () => {
    const s = server(routes()); restore = s.restore;
    const ui = await mountScreen(h(MissionsScreen, props));
    const said = ui.text();
    assert.ok(
      said.indexOf('Samui Green Foundation') < said.indexOf('Ocean Lab'),
      'the host who has approved nothing came first',
    );
    assert.match(said, /1,600 G/);
    ui.unmount();
  });

  test('a host nobody has visited is waiting, not losing', async () => {
    // They put a mission on the island and no traveller has done it. The
    // useful thing to say is that they need people sent to them.
    const s = server(routes()); restore = s.restore;
    const ui = await mountScreen(h(MissionsScreen, props));
    assert.match(ui.text(), /waiting for a first submission/);
    ui.unmount();
  });

  test('your own record is a record and not a position', async () => {
    const s = server(routes()); restore = s.restore;
    const ui = await mountScreen(h(MissionsScreen, props));
    const said = ui.text();
    assert.match(said, /3 missions verified/);
    assert.match(said, /610 G earned/);
    assert.doesNotMatch(said, /you are #|rank \d|#1/i, 'it gave a position in a field of one');
    ui.unmount();
  });
});

describe('what the points buy', () => {
  test('an offer is priced in the currency it really takes', async () => {
    const s = server(routes()); restore = s.restore;
    const ui = await mountScreen(h(MissionsScreen, props));
    assert.match(ui.text(), /180 T/);
    ui.unmount();
  });

  test('an unaffordable reward says how far short, not just no', async () => {
    // "480 more" is a number somebody can act on. A padlock only says no.
    const s = server(routes({
      '/offers': [fx.offer({ id: 'o5', costPoints: 1200, currency: 'green' })],
      '/wallet': { balances: { green: 610, trip: 340 }, progression: null, ledger: [] },
    }));
    restore = s.restore;
    const ui = await mountScreen(h(MissionsScreen, props));
    assert.match(ui.text(), /590 more/);
    ui.unmount();
  });

  test('a Green-priced reward is not made affordable by self-reported points', async () => {
    // 1,200 Green needed; the traveller holds 100 Green and 9,000 Trip. If
    // affordability read a combined total this would show as buyable, and the
    // two currencies would have collapsed into one at the till.
    const s = server(routes({
      '/offers': [fx.offer({ id: 'o5', costPoints: 1200, currency: 'green' })],
      '/wallet': { balances: { green: 100, trip: 9000 }, progression: null, ledger: [] },
    }));
    restore = s.restore;
    const ui = await mountScreen(h(MissionsScreen, props));
    assert.match(ui.text(), /1,100 more/, 'trip points were counted towards a green price');
    ui.unmount();
  });

  test('sold out or empty is said, not padded', async () => {
    const s = server(routes({ '/offers': [] })); restore = s.restore;
    const ui = await mountScreen(h(MissionsScreen, props));
    assert.match(ui.text(), /No partner rewards are available/);
    ui.unmount();
  });
});

describe('the sections fail apart', () => {
  test('a dead standing does not take the mission list with it', async () => {
    const s = server(routes({ '/standing': offline() })); restore = s.restore;
    const ui = await mountScreen(h(MissionsScreen, props));
    const said = ui.text();
    assert.match(said, /Beach Cleanup/, 'the quest list vanished with the leaderboard');
    assert.match(said, /Cold brew/, 'the rewards vanished with the leaderboard');
    ui.unmount();
  });

  test('a dead wallet still shows prices, just not the shortfall', async () => {
    const s = server(routes({ '/wallet': offline() })); restore = s.restore;
    const ui = await mountScreen(h(MissionsScreen, props));
    const said = ui.text();
    assert.match(said, /180 T/, 'the price disappeared because the balance did');
    assert.doesNotMatch(said, /more$/m, 'it guessed a shortfall without knowing the balance');
    ui.unmount();
  });
});
