/**
 * Order ahead at the RMUTT food court (docs/65): the stalls card on the place
 * screen, what it says for each state a stall can be in, and that its button
 * goes to the stall's order page in สั่งก่อน.
 */
import { describe, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { Linking } from 'react-native';
import { act } from 'react-test-renderer';
import { NO_STALLS, islandDateKey, isOrderLink, type PlaceStalls, type Stall } from '@chivago/core';
import { mountScreen, offline, server, settle } from './interact.ts';
import { __setLocaleForTests } from '../src/i18n/locale.ts';
import { place } from './fixtures.ts';
import { PlaceScreen } from '../src/screens/PlaceScreen.tsx';
import { LIVE_FOR_MS, StallsCard } from '../src/components/Stalls.tsx';
import { HomeScreen } from '../src/screens/HomeScreen.tsx';
import { __setAreaForTests } from '../src/state/area.ts';
import { demoStalls } from '../src/demo/stalls.ts';

const noop = () => {};
const ORDER = 'https://sangkon.fly.dev/s/demo';
const DAY = 86_400_000;

const stall = (over: Partial<Stall> = {}): Stall => ({
  slug: 'demo', name: 'บะหมี่หน้าหอ (ร้านตัวอย่าง)', example: true, open: true, opensAt: null,
  accepting: true, payReady: true, waitMin: 5, orderUrl: ORDER, ...over,
});

/** A live answer read just now, unless told otherwise. */
const answer = (over: Partial<PlaceStalls> = {}): PlaceStalls => ({
  provider: 'sangkon', provenance: 'live', observedAt: new Date().toISOString(),
  source: 'สั่งก่อน · sangkon.fly.dev', stalls: [stall()], ...over,
});
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
/** "12:00" on the island's clock, as the card writes it. */
const islandClock = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', {
  hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Bangkok',
});

/** `hh:mm` on the island, `days` from today: an opening time that reads the same whatever day the test runs. */
const islandAt = (days: number, hhmm: string) =>
  new Date(`${islandDateKey(new Date(Date.now() + days * DAY))}T${hhmm}:00+07:00`).toISOString();

/** The card alone, answered with this. */
async function card(reply: unknown) {
  const net = server({ 'GET /places/rmutt-canteen/stalls': reply });
  const ui = await mountScreen(h(StallsCard, { placeId: 'rmutt-canteen' }));
  return { ui, done: () => { ui.unmount(); net.restore(); } };
}

describe('order ahead at the food court', () => {
  test('the food court\'s place screen asks for its stalls and shows the wait', async () => {
    __setLocaleForTests('en');
    const canteen = place({
      id: 'rmutt-canteen', name: { en: 'Central food court', th: 'โรงอาหารกลาง' }, layer: 'Food',
    });
    const net = server({
      'GET /places/rmutt-canteen': canteen,
      'GET /places/rmutt-canteen/stalls': answer(),
      'GET /checkins/today': [],
      'GET /visits/self': { places: [], remainingThisYear: 10 },
      'GET /places/rmutt-canteen/reviews': { reviews: [], mine: null, canReview: false, reported: [] },
      'GET /places/rmutt-canteen/history': { since: null, days: [] },
      'GET /places/rmutt-canteen/stories': { open: false, stories: [] },
      'GET /medals': { medals: [], earned: 0, total: 0, basis: { en: 'x', th: 'x' } },
    });
    try {
      const ui = await mountScreen(h(PlaceScreen, {
        placeId: 'rmutt-canteen', onBack: noop, onAddToTrip: noop, onSafePath: noop, onToast: noop, onPointsChanged: noop,
      }));
      assert.deepEqual(net.missing, []);
      assert.ok(net.calls.some((c) => c.path === '/places/rmutt-canteen/stalls'));
      const said = ui.text();
      assert.match(said, /Order ahead/);
      assert.match(said, /บะหมี่หน้าหอ/);
      assert.match(said, /Ready in about 5 min/);
      assert.match(said, /Example · not a stall in this food court/, 'a stand-in is never passed off as a stall here');
      assert.match(said, /straight to the stall/, 'where the order and the money go, said on the card');
      ui.unmount();
    } finally { net.restore(); }
  });

  test('the button opens the stall\'s order page', async () => {
    __setLocaleForTests('en');
    const opened = mock.method(Linking, 'openURL', async () => true);
    const { ui, done } = await card(answer());
    try {
      await ui.pressText('Order ahead');
      assert.deepEqual(opened.mock.calls.map((c) => c.arguments[0]), [ORDER]);
    } finally { done(); opened.mock.restore(); }
  });

  test('a closed stall says when it opens - later today, tomorrow, or which day - and still shows its menu', async () => {
    __setLocaleForTests('th');
    const tomorrow = await card(answer({ stalls: [stall({ open: false, opensAt: islandAt(1, '06:00'), waitMin: null })] }));
    try {
      assert.match(tomorrow.ui.text(), /ปิดอยู่ · เปิดพรุ่งนี้ 06:00/, 'on the island\'s clock');
      assert.ok(tomorrow.ui.labels().includes('ดูเมนู'));
      assert.doesNotMatch(tomorrow.ui.text(), /รอประมาณ/);
    } finally { tomorrow.done(); }

    __setLocaleForTests('en');
    const today = await card(answer({ stalls: [stall({ open: false, opensAt: islandAt(0, '23:30'), waitMin: null })] }));
    try {
      assert.match(today.ui.text(), /Closed · opens 23:30/);
    } finally { today.done(); }

    const later = await card(answer({ stalls: [stall({ open: false, opensAt: islandAt(3, '06:00'), waitMin: null })] }));
    try {
      assert.match(later.ui.text(), /Closed · opens [A-Z][a-z]{2} \d{1,2} [A-Z][a-z]{2,3}, 06:00/, 'a day further out is named');
    } finally { later.done(); }
  });

  test('a stall that cannot take an order now says why, and offers its menu rather than an order', async () => {
    __setLocaleForTests('en');
    for (const [over, line] of [
      [{ waitMin: null }, /No pick-up time free right now/],
      [{ accepting: false, waitMin: null }, /Not taking orders ahead right now/],
      [{ payReady: false }, /Payment is not set up yet/],
    ] as const) {
      const { ui, done } = await card(answer({ stalls: [stall(over)] }));
      try {
        assert.match(ui.text(), line);
        assert.ok(ui.labels().includes('See the menu'));
        assert.ok(!ui.labels().includes('Order ahead'), 'no order button for a stall that cannot take one');
      } finally { done(); }
    }
  });

  test('figures the service did not just give are dated, and no status is claimed from them', async () => {
    __setLocaleForTests('en');
    const { ui, done } = await card(answer({ provenance: 'stale', observedAt: '2026-10-06T05:00:00.000Z' }));
    try {
      assert.match(ui.text(), /Could not reach the stalls just now · as of 12:00/);
      assert.match(ui.text(), /บะหมี่หน้าหอ/, 'the stall is still named and linked');
      assert.doesNotMatch(ui.text(), /Ready in about/, 'an old wait is a promise nobody made');
      assert.ok(ui.labels().includes('See the menu'));
      assert.ok(!ui.labels().includes('Order ahead'));
      assert.ok(ui.labels().includes('Check again'));
    } finally { done(); }
  });

  test('a live wait left on screen is dated by itself, with no request made, and can be looked at again', async () => {
    __setLocaleForTests('en');
    assert.equal(LIVE_FOR_MS, 120_000, 'two minutes on a phone; shortened below so the test need not wait');
    const read = ago(30_000);
    let calls = 0;
    const net = server({
      'GET /places/rmutt-canteen/stalls': () => {
        calls += 1;
        return calls === 1 ? answer({ observedAt: read }) : answer({ stalls: [stall({ waitMin: 4 })] });
      },
    });
    const ui = await mountScreen(h(StallsCard, { placeId: 'rmutt-canteen', liveForMs: 300 }));
    try {
      assert.match(ui.text(), /Ready in about 5 min/, 'fresh when it arrives, though read half a minute before');
      await act(async () => { await new Promise((r) => setTimeout(r, 700)); });
      assert.match(ui.text(), new RegExp(`Waits as of ${islandClock(read)}`), 'dated by when the service read it');
      assert.doesNotMatch(ui.text(), /Ready in about/);
      assert.ok(!ui.labels().includes('Order ahead'));
      assert.equal(calls, 1, 'the screen is never refreshed behind the student\'s back');
      await ui.pressText('Check again');
      await settle();
      assert.equal(calls, 2);
      assert.match(ui.text(), /Ready in about 4 min/);
      assert.ok(ui.labels().includes('Order ahead'));
    } finally { ui.unmount(); net.restore(); }
  });

  test('a phone whose clock is wrong still sees a wait that just arrived', async () => {
    __setLocaleForTests('en');
    // The phone thinks it is ten minutes later than the service does.
    const { ui, done } = await card(answer({ observedAt: ago(10 * 60_000) }));
    try {
      assert.match(ui.text(), /Ready in about 5 min/);
      assert.doesNotMatch(ui.text(), /Waits as of/);
    } finally { done(); }
  });

  test('none to list says which: none take orders ahead, or they could not be reached', async () => {
    __setLocaleForTests('en');
    const none = await card(answer({ stalls: [] }));
    try {
      assert.match(none.ui.text(), /No stall here is taking orders ahead right now/);
      assert.doesNotMatch(none.ui.text(), /Try again/, 'trying again will not add a stall');
    } finally { none.done(); }

    for (const reply of [answer({ provenance: 'stale', observedAt: null, stalls: [] }), offline()]) {
      const down = await card(reply);
      try {
        assert.match(down.ui.text(), /Could not reach the stalls just now\. Try again in a minute/);
        assert.doesNotMatch(down.ui.text(), /Ready in about/);
        assert.ok(down.ui.labels().includes('Check again'));
      } finally { down.done(); }
    }
  });

  test('a failed look can be tried again from the card', async () => {
    __setLocaleForTests('en');
    let calls = 0;
    const { ui, done } = await card(() => { calls += 1; return calls === 1 ? offline() : answer(); });
    try {
      assert.match(ui.text(), /Could not reach the stalls just now/);
      await ui.pressText('Check again');
      await settle();
      assert.match(ui.text(), /Ready in about 5 min/);
      assert.doesNotMatch(ui.text(), /Could not reach/);
    } finally { done(); }
  });

  test('a link the app would not open gets no button', async () => {
    __setLocaleForTests('en');
    const { ui, done } = await card(answer({ stalls: [stall({ orderUrl: 'https://evil.example/login?next=/s/demo' })] }));
    try {
      assert.match(ui.text(), /บะหมี่หน้าหอ/);
      assert.ok(!ui.labels().includes('Order ahead'));
      assert.ok(!ui.labels().includes('See the menu'));
    } finally { done(); }
  });
});

describe('order ahead on Home', () => {
  const homeProps = {
    onOpenMap: noop, onOpenQuests: noop, onOpenQuest: noop, onOpenWallet: noop,
    onOpenPassport: noop, onOpenImpact: noop, onOpenConcierge: noop, onOpenSafety: noop,
    onOpenParty: noop, onOpenProfile: noop, now: new Date('2026-10-06T05:00:00Z'),
  };
  const canteen = () => place({
    id: 'rmutt-canteen', name: { en: 'Central food court', th: 'โรงอาหารกลาง' }, layer: 'Food',
    province: 'TH-13', lat: 14.0355634, lng: 100.7243854,
  });

  test('at a campus with a food court that takes orders, ordering is the first thing under the header', async () => {
    __setLocaleForTests('en');
    __setAreaForTests('rmutt');
    const net = server({ '/places': [canteen()], 'GET /places/rmutt-canteen/stalls': answer() });
    try {
      const ui = await mountScreen(h(HomeScreen, homeProps));
      const said = ui.text();
      assert.match(said, /Order food ahead · Central food court/, 'which food court, said on the card');
      assert.match(said, /Ready in about 5 min/);
      assert.ok(ui.labels().includes('Order ahead'));
      assert.ok(said.indexOf('Where to go today?') < said.indexOf('Order food ahead'), 'under the header');
      assert.ok(said.indexOf('Order food ahead') < said.indexOf('Average score across'), 'above the area\'s conditions');
      ui.unmount();
    } finally { net.restore(); __setAreaForTests('samui'); }
  });

  test('the card does not wait for the places list: it is there when /places is down', async () => {
    __setLocaleForTests('en');
    __setAreaForTests('rmutt');
    const net = server({ '/places': offline(), 'GET /places/rmutt-canteen/stalls': answer() });
    try {
      const ui = await mountScreen(h(HomeScreen, homeProps));
      assert.match(ui.text(), /Order food ahead · Central food court/);
      assert.match(ui.text(), /Ready in about 5 min/);
      ui.unmount();
    } finally { net.restore(); __setAreaForTests('samui'); }
  });

  test('on the island, with no food court that takes orders, Home is unchanged and asks for no stalls', async () => {
    __setLocaleForTests('en');
    __setAreaForTests('samui');
    const net = server({ '/places': [place({ province: 'TH-84' }), canteen()] });
    try {
      const ui = await mountScreen(h(HomeScreen, homeProps));
      assert.ok(!net.calls.some((c) => c.path.endsWith('/stalls')));
      assert.doesNotMatch(ui.text(), /Order food ahead/);
      ui.unmount();
    } finally { net.restore(); }
  });
});

describe('order ahead in the static demo', () => {
  test('the demo names the stalls, claims no status, and links the real สั่งก่อน', async () => {
    const demo = demoStalls('rmutt-canteen');
    assert.equal(demo.provenance, 'stale');
    assert.equal(demo.observedAt, null);
    assert.ok(demo.stalls.length > 0);
    for (const s of demo.stalls) {
      assert.notEqual(s.name, s.slug, `${s.slug} has a name in DEMO_STALL_NAMES`);
      assert.equal(s.waitMin, null, 'no wait is replayed as if it were now');
      assert.ok(isOrderLink(s.orderUrl));
    }
    assert.deepEqual(demoStalls('chaweng'), NO_STALLS);
    assert.deepEqual(demoStalls('constructor'), NO_STALLS);

    __setLocaleForTests('en');
    const { ui, done } = await card(demo);
    try {
      assert.match(ui.text(), /Live status is not read here/);
      assert.match(ui.text(), /Example · not a stall in this food court/);
      assert.ok(ui.labels().includes('See the menu'));
    } finally { done(); }
  });
});
