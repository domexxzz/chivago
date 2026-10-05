import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { SEED_PLACES } from './seed.ts';
import {
  PLACE_STALLS, isOrderLink, stallSourceFor, stallState, stallsFromShopStatus, type Stall,
} from './stalls.ts';
import { capText } from './text.ts';

const BASE = 'https://sangkon.fly.dev';
const NOW = Date.parse('2026-10-06T12:00:00+07:00');
const ASKED = ['mama-pa-daeng', 'demo'];

const shop = (over: Record<string, unknown> = {}) => ({
  slug: 'mama-pa-daeng', name: 'มาม่าป้าแดง', demo: false, openNow: true, nextOpenAt: null,
  accepting: true, payReady: true, waitMin: 7, url: 'https://elsewhere.example/phish', ...over,
});
const answer = (...shops: unknown[]) => ({ ok: true, data: { shops, missing: [], now: NOW } });
const read = (body: unknown, asked: readonly string[] = ASKED) => stallsFromShopStatus(body, asked, BASE, NOW);

test('every place with stalls is a seeded Food place, and every stall a slug the service could have', () => {
  for (const [id, src] of Object.entries(PLACE_STALLS)) {
    const place = SEED_PLACES.find((p) => p.id === id);
    assert.ok(place, `${id} is a seeded place`);
    assert.equal(place.layer, 'Food', `${id} is on the Food layer`);
    assert.equal(new Set(src.slugs).size, src.slugs.length, `${id} lists each stall once`);
    for (const slug of src.slugs) assert.match(slug, /^[a-z0-9](?:-?[a-z0-9]){2,39}$/);
  }
});

test('a place\'s stalls are its own keys, never the prototype\'s', () => {
  assert.deepEqual(stallSourceFor('rmutt-canteen')?.slugs, ['demo']);
  assert.equal(stallSourceFor('chaweng'), null);
  assert.equal(stallSourceFor('constructor'), null);
  assert.equal(stallSourceFor('__proto__'), null);
});

test('the stalls are read from สั่งก่อน\'s answer, and the order page is always built here', () => {
  const r = stallsFromShopStatus(answer(shop()), ['mama-pa-daeng'], `${BASE}/`, NOW);
  assert.deepEqual(r, {
    stalls: [{
      slug: 'mama-pa-daeng', name: 'มาม่าป้าแดง', example: false, open: true, opensAt: null,
      accepting: true, payReady: true, waitMin: 7, orderUrl: `${BASE}/s/mama-pa-daeng`,
    }],
    missing: [],
    dropped: 0,
  });
  assert.ok(isOrderLink(r!.stalls[0]!.orderUrl));
});

test('only the stalls asked for are read, once each, in the order asked', () => {
  const r = read(answer(
    shop({ slug: 'demo', name: 'บะหมี่หน้าหอ' }),
    shop({ slug: 'other-tenant', name: 'ร้านที่ไม่ได้ขอ' }),
    shop(),
    shop({ name: 'มาม่าป้าแดง ซ้ำ' }),
  ));
  assert.deepEqual(r!.stalls.map((s) => s.slug), ['mama-pa-daeng', 'demo'], 'the order this app set, not the answer\'s');
  assert.equal(r!.stalls[0]!.name, 'มาม่าป้าแดง', 'the first row for a stall is the one read');
  assert.equal(r!.dropped, 2);
  assert.deepEqual(r!.missing, []);
});

test('a closed stall carries when it opens; a row of the wrong shape is dropped and the stall reported missing', () => {
  const opensAt = Date.parse('2026-10-07T06:00:00+07:00');
  const r = read(answer(
    shop({ slug: 'demo', demo: true, openNow: false, nextOpenAt: opensAt, waitMin: null }),
    shop({ slug: '../admin' }),
    shop({ openNow: 'yes' }),
    { slug: 'half' },
    null,
  ));
  assert.equal(r!.stalls.length, 1);
  assert.equal(r!.stalls[0]!.example, true, "the service's demo shop is an example here");
  assert.equal(r!.stalls[0]!.opensAt, '2026-10-06T23:00:00.000Z');
  assert.equal(r!.stalls[0]!.waitMin, null);
  assert.deepEqual(r!.missing, ['mama-pa-daeng']);
  assert.equal(r!.dropped, 4);
});

test('the example label stays on the service\'s example shop whatever the answer says', () => {
  const r = read(answer(shop({ slug: 'demo', demo: false })));
  assert.equal(r!.stalls[0]!.example, true);
});

test('an opening out of range is left unsaid, and one bad row costs only itself', () => {
  const r = read(answer(
    shop({ openNow: false, nextOpenAt: 1e20, waitMin: null }),
    shop({ slug: 'demo', waitMin: 6.6 }),
  ));
  assert.equal(r!.stalls.length, 2, 'a time no Date can hold does not take the other stalls with it');
  assert.equal(r!.stalls[0]!.opensAt, null);
  assert.equal(r!.stalls[1]!.waitMin, 7, 'minutes, rounded');
  assert.equal(read(answer(shop({ openNow: false, waitMin: null, nextOpenAt: NOW + 30 * 86_400_000 })))!.stalls[0]!.opensAt, null,
    'a month out is not an opening a student can plan around');
});

test('a wait that is not minutes or null is not read, so an unreadable wait never calls a stall full', () => {
  for (const waitMin of [undefined, '5', -1, 1e308, Number.NaN]) {
    const r = read(answer(shop({ waitMin })));
    assert.deepEqual(r!.stalls, [], String(waitMin));
    assert.equal(r!.dropped, 1);
  }
  assert.equal(read(answer(shop({ waitMin: null })))!.stalls[0]!.waitMin, null, 'null is an answer: no pick-up time free');
});

test('a name is shown as written: no steering marks, no controls, trimmed, cut between whole characters', () => {
  const steered = read(answer(shop({ name: '  ‮มาม่า\u0007ป้าแดง⁦  ' })));
  assert.equal(steered!.stalls[0]!.name, 'มาม่าป้าแดง');
  const long = read(answer(shop({ name: 'ก้'.repeat(60) })));
  assert.ok(long!.stalls[0]!.name.length <= 80);
  assert.ok(long!.stalls[0]!.name.endsWith('ก้…'), 'a tone mark is never cut off its consonant');
  for (const name of [' ‮ ', '​⁠؜', '﻿ ']) {
    assert.deepEqual(read(answer(shop({ name })))!.stalls, [], `a stall with no name to show is not shown: ${JSON.stringify(name)}`);
  }
  assert.equal(read(answer(shop({ name: 'มาม่า​ป้าแดง' })))!.stalls[0]!.name, 'มาม่า​ป้าแดง',
    'a zero-width space between Thai words is kept');
});

test('an answer that is not a list of shops is not an answer', () => {
  assert.equal(read(null), null);
  assert.equal(read({ ok: false, error: 'down' }), null);
  assert.equal(read({ data: { shops: 'many' } }), null);
  assert.deepEqual(read(answer())!.missing, ASKED, 'an empty list is an answer: nothing asked for was there');
});

test('what a stall can do now: closed, then paused, then not paid-ready, then full, then order', () => {
  const s = (over: Partial<Stall>): Stall => ({
    slug: 'x-stall', name: 'x', example: false, open: true, opensAt: null, accepting: true,
    payReady: true, waitMin: 5, orderUrl: `${BASE}/s/x-stall`, ...over,
  });
  assert.equal(stallState(s({ open: false, accepting: false })), 'closed');
  assert.equal(stallState(s({ accepting: false })), 'paused');
  assert.equal(stallState(s({ payReady: false, waitMin: null })), 'unpaid');
  assert.equal(stallState(s({ waitMin: null })), 'full', 'open and taking orders, but no pick-up time free');
  assert.equal(stallState(s({})), 'order');
});

test('an order link is the service\'s stall page and nothing else', () => {
  assert.ok(isOrderLink('https://sangkon.fly.dev/s/demo'));
  assert.ok(isOrderLink('https://example.org/sangkon/s/mama-pa-daeng'));
  assert.ok(isOrderLink('http://localhost:8793/s/demo'), 'a local สั่งก่อน while developing');
  assert.equal(isOrderLink('http://sangkon.fly.dev/s/demo'), false, 'not over plain http');
  assert.equal(isOrderLink('javascript:alert(1)//s/demo'), false);
  assert.equal(isOrderLink('https://user@evil.example/s/demo'), false);
  assert.equal(isOrderLink('https://sangkon.fly.dev/s/demo?next=https://evil.example'), false);
  assert.equal(isOrderLink('https://sangkon.fly.dev/admin'), false);
});

test('text is cut between whole characters, with a mark where it was cut', () => {
  assert.equal(capText('short', 10), 'short');
  assert.equal(capText('abcdefghij', 5), 'abcd…');
  assert.equal(capText('😀😀😀', 4), '😀…', 'never half an emoji');
});
