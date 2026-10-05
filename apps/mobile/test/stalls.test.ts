/**
 * Order ahead at the RMUTT food court (docs/65): the stalls card on the place
 * screen, what it says for each state a stall can be in, and that its button
 * goes to the stall's order page in สั่งก่อน.
 */
import { describe, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { Linking } from 'react-native';
import { NO_STALLS, islandDateKey, isOrderLink, type PlaceStalls, type Stall } from '@chivago/core';
import { mountScreen, offline, server } from './interact.ts';
import { __setLocaleForTests } from '../src/i18n/locale.ts';
import { place } from './fixtures.ts';
import { PlaceScreen } from '../src/screens/PlaceScreen.tsx';
import { StallsCard } from '../src/components/Stalls.tsx';
import { demoStalls } from '../src/demo/stalls.ts';

const noop = () => {};
const ORDER = 'https://sangkon.fly.dev/s/demo';
const DAY = 86_400_000;

const stall = (over: Partial<Stall> = {}): Stall => ({
  slug: 'demo', name: 'บะหมี่หน้าหอ (ร้านตัวอย่าง)', example: true, open: true, opensAt: null,
  accepting: true, payReady: true, waitMin: 5, orderUrl: ORDER, ...over,
});

const answer = (over: Partial<PlaceStalls> = {}): PlaceStalls => ({
  provider: 'sangkon', provenance: 'live', observedAt: '2026-10-06T05:00:00.000Z',
  source: 'สั่งก่อน · sangkon.fly.dev', stalls: [stall()], ...over,
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
    const { ui, done } = await card(answer({ provenance: 'stale' }));
    try {
      assert.match(ui.text(), /Could not reach the stalls just now · as of 12:00/);
      assert.match(ui.text(), /บะหมี่หน้าหอ/, 'the stall is still named and linked');
      assert.doesNotMatch(ui.text(), /Ready in about/, 'an old wait is a promise nobody made');
      assert.ok(ui.labels().includes('See the menu'));
      assert.ok(!ui.labels().includes('Order ahead'));
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
      } finally { down.done(); }
    }
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
