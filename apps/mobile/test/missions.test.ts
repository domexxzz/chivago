import { strict as assert } from 'node:assert';
import { test, describe, afterEach } from 'node:test';
import { createElement as h } from 'react';

import { RANKED_BY } from '@chivago/core';
import { GAME_ICON, MissionsScreen } from '../src/screens/MissionsScreen.tsx';
import { mountScreen, server, offline } from './interact.ts';
import { MINI_GAMES } from '../src/games/index.ts';
import * as fx from './fixtures.ts';

/**
 * Missions, and the leaderboard that is the most dangerous thing in the app.
 *
 * The board ranks HOSTS on approvals, not travellers on points, and every
 * test below is about a way the obvious version would have lied: counting a
 * self-verified currency, counting the platform's own opening grant, drawing
 * a podium for one person, or hiding the host nobody has visited yet.
 */

const opened = { game: '' };
const noop = () => {};
const props = {
  onOpen: noop,
  onOpenMarket: noop,
  onOpenGame: (key: string) => { opened.game = key; },
};

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

/** Ko Sichang, where a quest called a Sichang quest actually is. */
const SICHANG = { lat: 13.15, lng: 100.81 };

const sichangQuest = () => fx.quest({
  id: 'sg-1',
  code: 'SG-01',
  ...SICHANG,
  name: { en: 'Sichang Explorer', th: 'นักสำรวจเกาะสีชัง', zh: '锡昌岛探索家' },
  where: { en: 'Koh Sichang', th: 'เกาะสีชัง', zh: '锡昌岛' },
  rewardPoints: 0,
  rewardExp: 150,
  rewardCurrency: 'trip',
});

const routes = (over: Record<string, unknown> = {}) => ({
  '/quests': { quests: [sichangQuest()], progress: {} },
  '/standing': standing(),
  '/offers': [fx.offer({ id: 'o1', costPoints: 180, currency: 'trip' })],
  '/wallet': { balances: { green: 610, trip: 340 }, progression: null, ledger: [] },
  ...over,
});

let restore: (() => void) | null = null;
afterEach(() => { restore?.(); restore = null; opened.game = ''; });

describe('Game&Quest navigation', () => {
  test('starts with quests and keeps their filters inside the Quests section', async () => {
    const s = server(routes()); restore = s.restore;
    const ui = await mountScreen(h(MissionsScreen, props));

    assert.match(ui.text(), /Game&Quest/);
    assert.match(ui.text(), /Sichang Explorer/);
    assert.match(ui.text(), /Today/);
    ui.unmount();
  });

  test('the Games button replaces quests with the bundled game and opens it', async () => {
    const s = server(routes()); restore = s.restore;
    const ui = await mountScreen(h(MissionsScreen, props));

    await ui.press('Games');
    assert.match(ui.text(), /Sort it right/);
    assert.doesNotMatch(ui.text(), /Sichang Explorer/);
    assert.doesNotMatch(ui.text(), /Today/);
    await ui.press('Sort it right');
    assert.equal(opened.game, 'waste-sort');
    ui.unmount();
  });

  test('Games remain available when quest data fails', async () => {
    const s = server(routes({ '/quests': offline() })); restore = s.restore;
    const ui = await mountScreen(h(MissionsScreen, props));

    await ui.press('Games');
    assert.match(ui.text(), /Sort it right/);
    ui.unmount();
  });

  test('the Koh Sichang feature opens exactly the five pilot quests with EXP rewards', async () => {
    const sichang = [
      ['SG-01', 'Sichang Explorer', 150],
      ['SG-02', 'Secret Recipe', 150],
      ['SG-03', 'Trash Hero', 200],
      ['SG-04', 'Local Treasure', 150],
      ['SG-05', 'Green Journey', 150],
    ].map(([code, name, rewardExp], index) => fx.quest({
      id: `sg-${index + 1}`,
      code: String(code),
      ...SICHANG,
      name: { en: String(name), th: String(name), zh: String(name) },
      rewardPoints: 0,
      rewardExp: Number(rewardExp),
      rewardCurrency: 'trip',
    }));
    const s = server(routes({ '/quests': { quests: [fx.quest(), ...sichang], progress: {} } }));
    restore = s.restore;
    const ui = await mountScreen(h(MissionsScreen, props));

    assert.match(ui.text(), /Koh Sichang/);
    assert.match(ui.text(), /5 quests · up to 800 XP/);
    await ui.press('Koh Sichang');
    const said = ui.text();
    assert.match(said, /Sichang Explorer/);
    assert.match(said, /Green Journey/);
    assert.match(said, /\+200 XP/);
    assert.doesNotMatch(said, /Beach Cleanup/);
    ui.unmount();
  });
});

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
    assert.match(said, /Sichang Explorer/, 'the quest list vanished with the leaderboard');
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

describe('what MISSIONS shows when the API and the release disagree', () => {
  /*
    On 14 November 2026 the pilot database published SC-01..SC-05 and this
    screen filtered the response by an allow-list of SG-01..SG-05. Both halves
    were doing what they were told, the API answered correctly, and the demo
    island's missions page came up EMPTY.

    The rule now excludes what is retired instead of allow-listing what is
    active, so the two stores merely disagreeing can no longer blank the
    screen. These are the tests that would have caught it.
  */

  const liveQuest = (code: string, name: string) => fx.quest({
    id: code.toLowerCase(),
    code,
    ...SICHANG,
    name: { en: name, th: name, zh: name },
    where: { en: 'Koh Sichang', th: 'เกาะสีชัง', zh: '锡昌岛' },
  });

  test('A QUEST CODE THIS RELEASE HAS NEVER SEEN IS STILL SHOWN', async () => {
    const s = server(routes({
      '/quests': { quests: [liveQuest('SC-01', 'Sichang Explorer')], progress: {} },
    }));
    restore = s.restore;
    const ui = await mountScreen(h(MissionsScreen, props));

    assert.match(ui.text(), /Sichang Explorer/, 'the server published it; the screen must show it');
    ui.unmount();
  });

  test('a retired quest is still kept off the screen', async () => {
    const s = server(routes({
      '/quests': {
        quests: [liveQuest('X-SC-02', 'Retired Beach Clean-up'), liveQuest('SC-01', 'Sichang Explorer')],
        progress: {},
      },
    }));
    restore = s.restore;
    const ui = await mountScreen(h(MissionsScreen, props));

    assert.doesNotMatch(ui.text(), /Retired Beach/, 'a retired quest leaked back onto the screen');
    assert.match(ui.text(), /Sichang Explorer/);
    ui.unmount();
  });

  test('the whole published list survives, whatever the codes are', async () => {
    const s = server(routes({
      '/quests': {
        quests: [
          liveQuest('SC-01', 'Explorer'), liveQuest('SC-02', 'Recipe'),
          liveQuest('SC-03', 'Trash Hero'), liveQuest('SC-04', 'Treasure'),
          liveQuest('SC-05', 'Green Journey'),
        ],
        progress: {},
      },
    }));
    restore = s.restore;
    const ui = await mountScreen(h(MissionsScreen, props));

    for (const name of ['Explorer', 'Recipe', 'Trash Hero', 'Treasure', 'Green Journey']) {
      assert.match(ui.text(), new RegExp(name), `${name} was dropped`);
    }
    ui.unmount();
  });
});

describe('the Games list', () => {
  /*
    Every card used to show the waste game's badge, including the cooking
    game's, because one `source` was hardcoded and the second game arrived
    after the card was written. A card is a promise about what you are about
    to open, so a card wearing another game's face is a small lie on the way in.
  */

  test('THE COOKING GAME CARD WEARS THE COOKING GAME LOGO', async () => {
    /*
      Asserted on what is rendered, not on the map it reads from - the bug was
      a card that ignored the map entirely, so a test of the map alone would
      have stayed green through all of it.
    */
    const s = server(routes()); restore = s.restore;
    const ui = await mountScreen(h(MissionsScreen, props));
    await ui.press('Games');

    const pictures = ui.root
      .findAll((n: { props: Record<string, unknown> }) => typeof n.props.source === 'string', { deep: true })
      .map((n: { props: Record<string, unknown> }) => String(n.props.source));

    assert.ok(
      pictures.includes('game-secret-recipe-logo.png'),
      `the cooking game's card is not showing its logo; the Games list drew ${pictures.join(', ') || 'no pictures'}`,
    );
    /*
      And the waste game's badge appears once, not once per card. That count
      is the bug itself: with one hardcoded `source` it was drawn twice and
      the cooking game's logo not at all.
    */
    assert.equal(
      pictures.filter((p) => p === 'trash-hero-logo.png').length, 1,
      `the waste game's badge was drawn ${pictures.filter((p) => p === 'trash-hero-logo.png').length} times`,
    );
    ui.unmount();
  });

  test('the icon map knows every game and invents none', () => {
    const keys = new Set(MINI_GAMES.map((g) => g.key));
    for (const key of Object.keys(GAME_ICON)) {
      assert.ok(keys.has(key as never), `${key} has an icon but is not a game`);
    }
  });

  test('both games are on the Games list, each under its own name', async () => {
    const s = server(routes()); restore = s.restore;
    const ui = await mountScreen(h(MissionsScreen, props));

    await ui.press('Games');
    assert.match(ui.text(), /Sort it right/);
    assert.match(ui.text(), /เชฟชังชัง|ChangChang/);
    ui.unmount();
  });
});
