/**
 * Whole screens, from mount to loaded.
 *
 * The render tests take a component and give it data. These take a SCREEN,
 * give it a network, and let it fetch — which is the only way to reach the
 * three states a screen actually has on a phone: still loading, loaded, and
 * the server said no. The first and third were previously untested anywhere.
 *
 * Every one of these routes real requests through `src/api/client.ts`, so the
 * path a screen asks for is asserted rather than assumed.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';

import { mountScreen, offline, refuses, server, settle } from './interact.ts';
import { offer, quest, wallet } from './fixtures.ts';

import { WalletScreen } from '../src/screens/WalletScreen.tsx';
import { MissionsScreen } from '../src/screens/MissionsScreen.tsx';
import { MarketScreen } from '../src/screens/MarketScreen.tsx';
import { ImpactScreen } from '../src/screens/ImpactScreen.tsx';
import { MapScreen } from '../src/screens/MapScreen.tsx';

const noop = () => {};

const walletProps = {
  onOpenMarket: noop, refreshKey: 0, notifications: [], unread: 0,
  onMarkRead: noop, onMarkAllRead: noop, onOpenQuest: noop,
};

describe('the wallet screen, fetching its own wallet', () => {
  test('it asks for /wallet and shows both purses once it arrives', async () => {
    const net = server({
      'GET /wallet': wallet(),
      'GET /companions': { companions: [], summary: { found: 0, total: 5, grown: 0 }, speciesAsOf: '2026-09-01' },
    });
    try {
      const ui = await mountScreen(h(WalletScreen, walletProps));
      // Two fetches: the purse and the companion collection.
      assert.deepEqual(
        net.calls.map((c) => `${c.method} ${c.path}`).sort(),
        ['GET /companions', 'GET /wallet'],
      );
      assert.deepEqual(net.missing, [], 'the screen fetched something untabled');

      const said = ui.text();
      assert.match(said, /1,240/, 'the green balance should be on screen');
      assert.match(said, /320/, 'the trip balance should be on screen');
      assert.doesNotMatch(said, /Loading/i, 'the loading state should be gone');
      ui.unmount();
    } finally { net.restore(); }
  });

  test('before the wallet arrives it is loading, not empty', async () => {
    // No settle: this is the frame a traveller sees on a slow beach signal.
    const net = server({ 'GET /wallet': wallet() });
    try {
      const { mount } = await import('./interact.ts');
      const ui = mount(h(WalletScreen, walletProps));
      assert.match(ui.text(), /Loading/i, 'a fetching screen must say it is fetching');
      await settle();
      ui.unmount();
    } finally { net.restore(); }
  });

  test('a server that refuses shows the reason and offers a retry', async () => {
    const net = server({ 'GET /wallet': refuses('WALLET_LOCKED', 'Your wallet is being repaired.') });
    try {
      const ui = await mountScreen(h(WalletScreen, walletProps));
      assert.match(ui.text(), /Your wallet is being repaired\./);
      assert.ok(ui.find(/retry/i), 'a failed screen must offer a way out');
      ui.unmount();
    } finally { net.restore(); }
  });

  test('retry fetches again, and a server that recovers shows the wallet', async () => {
    let attempt = 0;
    const net = server({
      'GET /wallet': () => (attempt++ === 0
        ? refuses('BUSY', 'Try again in a moment.')
        : wallet()),
    });
    try {
      const ui = await mountScreen(h(WalletScreen, walletProps));
      assert.match(ui.text(), /Try again in a moment\./);

      await ui.press(/retry/i);
      await settle();

      assert.equal(
        net.calls.filter((c) => c.path === '/wallet').length, 2,
        'retry should have refetched the wallet',
      );
      assert.match(ui.text(), /1,240/, 'the recovered wallet should render');
      assert.doesNotMatch(ui.text(), /Try again in a moment\./);
      ui.unmount();
    } finally { net.restore(); }
  });

  test('a dead connection says offline, and never leaks a stack trace', async () => {
    const net = server({ 'GET /wallet': offline() });
    try {
      const ui = await mountScreen(h(WalletScreen, walletProps));
      const said = ui.text();
      assert.match(said, /offline/i, 'the traveller should be told the connection is the problem');
      assert.doesNotMatch(said, /fetch failed|Error:|at .*\.ts:/, 'no raw error text on screen');
      ui.unmount();
    } finally { net.restore(); }
  });
});

describe('the quests screen, fetching its list', () => {
  const listed = (quests: unknown[]) => ({ quests, progress: {} });

  test('every quest that arrives is on screen', async () => {
    const net = server({
      'GET /quests': listed([
        quest({ id: 'q1', name: { en: 'Beach Cleanup', th: 'เก็บขยะชายหาด' } }),
        quest({ id: 'q2', name: { en: 'Coral Nursery', th: 'อนุบาลปะการัง' } }),
      ]),
    });
    try {
      const ui = await mountScreen(h(MissionsScreen, { onOpen: noop, onOpenMarket: noop }));
      const said = ui.text();
      assert.match(said, /Beach Cleanup/);
      assert.match(said, /Coral Nursery/);
      assert.doesNotMatch(said, /Loading/i);
      ui.unmount();
    } finally { net.restore(); }
  });

  test('an empty island says so rather than showing a blank page', async () => {
    const net = server({ 'GET /quests': listed([]) });
    try {
      const ui = await mountScreen(h(MissionsScreen, { onOpen: noop, onOpenMarket: noop }));
      assert.doesNotMatch(ui.text(), /Loading/i);
      assert.ok(ui.text().length > 40, 'an empty list must still explain itself');
      ui.unmount();
    } finally { net.restore(); }
  });

  test('switching the filter reads the list already fetched, not the network', async () => {
    // The screen fetches ALL quests once and filters locally, so the "All"
    // count stays honest. A refetch here would be the regression.
    const net = server({
      'GET /quests': listed([
        quest({ id: 'q1', kind: 'today', name: { en: 'Beach Cleanup', th: 'ก' } }),
        quest({ id: 'q2', kind: 'weekend', name: { en: 'Coral Nursery', th: 'ข' } }),
      ]),
    });
    try {
      const ui = await mountScreen(h(MissionsScreen, { onOpen: noop, onOpenMarket: noop }));
      assert.match(ui.text(), /Beach Cleanup/);
      assert.doesNotMatch(ui.text(), /Coral Nursery/, 'a weekend quest is not today');

      // The tabs carry no accessibilityLabel - they are named by the word
      // inside them, which is what a screen reader would announce.
      await ui.pressText(/weekend/i);

      assert.match(ui.text(), /Coral Nursery/);
      // Count THIS call, not every call the screen makes. Missions also loads
      // the standing, the offers and the purse, and a bare total would go up
      // whenever a section was added — measuring the wrong thing and failing
      // for the wrong reason, which is what it did.
      const questCalls = net.calls.filter((c) => c.path.startsWith('/quests'));
      assert.equal(questCalls.length, 1, 'filtering must not re-fetch the quest list');
      ui.unmount();
    } finally { net.restore(); }
  });
});

describe('the marketplace, which needs two fetches to be usable', () => {
  const voucher = {
    id: 'v1', offerId: 'o1', userId: 'demo-user', merchant: 'Sabeinglae Coffee',
    code: 'CHV-7Q2X', costPoints: 180, issuedAt: '2026-08-31T04:00:00.000Z',
    expiresAt: '2026-09-07T04:00:00.000Z', redeemedAt: null, status: 'active' as const,
  };

  test('the offers and the purse arrive together', async () => {
    const net = server({
      'GET /offers': [offer({ id: 'o1', name: 'Cold brew + banana bread' })],
      'GET /wallet': wallet(),
    });
    try {
      const ui = await mountScreen(h(MarketScreen, {
        onBack: noop, onToast: noop, onPointsChanged: noop, refreshKey: 0,
      }));
      const asked = net.calls.map((c) => c.path).sort();
      assert.deepEqual(asked, ['/offers', '/wallet']);

      const said = ui.text();
      assert.match(said, /Cold brew \+ banana bread/, 'the offer should be listed');
      assert.match(said, /320/, 'the trip purse pays for this one');
      assert.match(said, /1,240|1240/, 'the green purse is shown too');
      ui.unmount();
    } finally { net.restore(); }
  });

  test('redeeming spends, issues a voucher, and tells the rest of the app', async () => {
    let toasted = '';
    let pointsChanged = 0;
    const net = server({
      'GET /offers': [offer({ id: 'o1', costPoints: 180, currency: 'trip' })],
      'GET /wallet': wallet(),
      'POST /offers/o1/redeem': { voucher, balances: { trip: 140, green: 1240 } },
    });
    try {
      const ui = await mountScreen(h(MarketScreen, {
        onBack: noop,
        onToast: (m: string) => { toasted = m; },
        onPointsChanged: () => { pointsChanged += 1; },
        refreshKey: 0,
      }));

      await ui.press(/^Redeem /);
      await settle();

      const posted = net.calls.find((c) => c.method === 'POST');
      assert.ok(posted, 'redeeming must reach the server');
      assert.equal(posted.path, '/offers/o1/redeem');

      assert.equal(pointsChanged, 1, 'the wallet elsewhere must be told to refresh');
      assert.match(toasted, /Sabeinglae Coffee/, 'the toast should name the merchant');
      assert.match(ui.text(), /CHV-7Q2X/, 'the voucher code is what the merchant scans');
      ui.unmount();
    } finally { net.restore(); }
  });

  test('an offer you cannot afford says how short you are, and spends nothing', async () => {
    let toasted = '';
    const net = server({
      'GET /offers': [offer({ id: 'o1', costPoints: 500, currency: 'trip' })],
      'GET /wallet': wallet({ balances: { trip: 320, green: 1240 } }),
    });
    try {
      const ui = await mountScreen(h(MarketScreen, {
        onBack: noop, onToast: (m: string) => { toasted = m; },
        onPointsChanged: noop, refreshKey: 0,
      }));

      await ui.press(/^Redeem /);
      await settle();

      assert.match(toasted, /180/, '500 minus 320 is the number that matters');
      assert.match(toasted, /Trip Points/, 'with two purses it must say WHICH is short');
      assert.equal(net.calls.filter((c) => c.method === 'POST').length, 0, 'nothing was spent');
      ui.unmount();
    } finally { net.restore(); }
  });

  test('a redemption the server refuses leaves no voucher on screen', async () => {
    let toasted = '';
    const net = server({
      'GET /offers': [offer({ id: 'o1', costPoints: 180, currency: 'trip' })],
      'GET /wallet': wallet(),
      'POST /offers/o1/redeem': refuses('SOLD_OUT', 'That offer just sold out.'),
    });
    try {
      const ui = await mountScreen(h(MarketScreen, {
        onBack: noop, onToast: (m: string) => { toasted = m; },
        onPointsChanged: noop, refreshKey: 0,
      }));

      await ui.press(/^Redeem /);
      await settle();

      assert.equal(toasted, 'That offer just sold out.');
      assert.doesNotMatch(ui.text(), /CHV-/, 'a refused redemption must not show a code');
      ui.unmount();
    } finally { net.restore(); }
  });
});

describe('the impact screen, which fetches twice independently', () => {
  const mine = [
    { key: 'waste', label: { en: 'Waste collected', th: 'ขยะที่เก็บได้' }, value: 12, unit: 'kg' },
    { key: 'hours', label: { en: 'Volunteer hours', th: 'ชั่วโมงอาสา' }, value: 6, unit: 'h' },
  ];
  const community = {
    year: 2026,
    metrics: [
      { key: 'waste', label: { en: 'Waste collected', th: 'ขยะที่เก็บได้' }, actual: 8400, target: 12000, unit: 'kg' },
    ],
  };

  test('both halves arrive and both are shown', async () => {
    const net = server({ 'GET /impact/me': mine, 'GET /impact/community': community });
    try {
      const ui = await mountScreen(h(ImpactScreen, { onToast: noop, refreshKey: 0 }));
      const said = ui.text();
      assert.match(said, /12 kg/, 'the traveller\'s own figure');
      assert.match(said, /8,400|8400/, 'the community total');
      assert.match(said, /2026/, 'the year the community total covers');
      ui.unmount();
    } finally { net.restore(); }
  });

  test('when the personal half fails, the community half still shows', async () => {
    const net = server({
      'GET /impact/me': refuses('NO_DATA', 'We could not read your activity.'),
      'GET /impact/community': community,
    });
    try {
      const ui = await mountScreen(h(ImpactScreen, { onToast: noop, refreshKey: 0 }));
      const said = ui.text();
      assert.match(said, /We could not read your activity\./);
      assert.match(said, /8,400|8400/, 'one half failing must not hide the other');
      ui.unmount();
    } finally { net.restore(); }
  });

  test('when the community half fails, it says so instead of vanishing', async () => {
    // A block that silently disappears reads as "Samui has done nothing this
    // year", which is a worse lie than an error message.
    const net = server({
      'GET /impact/me': mine,
      'GET /impact/community': refuses('ESG_DOWN', 'Community totals are unavailable.'),
    });
    try {
      const ui = await mountScreen(h(ImpactScreen, { onToast: noop, refreshKey: 0 }));
      const said = ui.text();
      assert.match(said, /12 kg/, 'the personal half is fine and should render');
      assert.match(
        said,
        /Community totals are unavailable\./,
        'a failed community fetch must be visible, not silent',
      );
      ui.unmount();
    } finally { net.restore(); }
  });

  test('offline shows the offline wording, not two different errors', async () => {
    const net = server({ 'GET /impact/me': offline(), 'GET /impact/community': offline() });
    try {
      const ui = await mountScreen(h(ImpactScreen, { onToast: noop, refreshKey: 0 }));
      assert.match(ui.text(), /offline/i);
      ui.unmount();
    } finally { net.restore(); }
  });
});

describe('the map, whose two fetches fail independently', () => {
  const place = {
    id: 'chaweng', name: { en: 'Chaweng Beach', th: 'หาดเฉวง' }, short: 'Chaweng',
    layer: 'beach', lat: 9.5357, lng: 100.0617, healthyScore: 82,
    crowd: 'moderate', signals: [], address: 'Chaweng', openNow: true,
  };
  const mapProps = {
    layers: { beach: true, wellness: true, food: true, culture: true, nature: true },
    onToggleLayer: noop, onOpenPlace: noop, onOpenQuest: noop, onSeeAllQuests: noop,
    balances: { trip: 320, green: 1240 },
  };

  test('places and today\'s quests both arrive', async () => {
    const net = server({
      'GET /places': [place],
      '/quests': { quests: [quest({ name: { en: 'Beach Cleanup', th: 'ก' } })], progress: {} },
    });
    try {
      const ui = await mountScreen(h(MapScreen, mapProps));

      // In map mode the place names live inside the SVG, which the test
      // renderer stubs out - so the honest proof the fetch landed is the
      // header average, which is COMPUTED from the places that arrived.
      assert.match(ui.text(), /82/, 'the header average comes from the fetched place');
      assert.match(ui.text(), /Beach Cleanup/, 'the quest strip filled in');

      // The list view puts the same places into readable text.
      await ui.press('Switch to list view');
      assert.match(ui.text(), /Chaweng Beach/, 'the feed lists the place by name');
      ui.unmount();
    } finally { net.restore(); }
  });

  test('quests failing does not read as "nothing on today"', async () => {
    // The strip used to render its heading over an empty space. A traveller
    // cannot tell that apart from an island with no quests.
    const net = server({
      'GET /places': [place],
      '/quests': refuses('QUESTS_DOWN', 'Today\'s quests are unavailable.'),
    });
    try {
      const ui = await mountScreen(h(MapScreen, mapProps));
      const said = ui.text();
      assert.match(said, /Healthy Score/, 'the map itself is fine');
      assert.match(said, /Today's quests are unavailable\./, 'the strip must say why it is empty');
      ui.unmount();
    } finally { net.restore(); }
  });

  test('places failing still leaves the quest strip usable', async () => {
    const net = server({
      'GET /places': refuses('PLACES_DOWN', 'The map is unavailable.'),
      '/quests': { quests: [quest({ name: { en: 'Beach Cleanup', th: 'ก' } })], progress: {} },
    });
    try {
      const ui = await mountScreen(h(MapScreen, mapProps));
      const said = ui.text();
      assert.match(said, /The map is unavailable\./);
      assert.match(said, /Beach Cleanup/, 'one failure must not take the whole screen down');
      ui.unmount();
    } finally { net.restore(); }
  });
});
