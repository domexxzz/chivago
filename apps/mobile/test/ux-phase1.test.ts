import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { createElement as h } from 'react';
import { act } from 'react-test-renderer';
import { ComposeSheet } from '../src/screens/PlaceReviews.tsx';
import { ShopProfileScreen } from '../src/screens/ShopProfileScreen.tsx';
import { api } from '../src/api/client.ts';
import { useNav, type Nav } from '../src/state/store.tsx';
import { mountScreen, server, refuses, offline, settle } from './interact.ts';

const shop = { id: 's1', name: 'Guide A', category: 'ไกด์นำเที่ยว', areaKey: 'samui', description: '', address: '', lat: null, lng: null, phone: '', email: '', openingHours: '', amenities: [], active: true, rating: 5, reviewCount: 1, coverUrl: null, guideProfilePhotoUrl: null, owner: false, serviceType: 'guide', guideLanguages: [], guideSkills: [], guideTourStyles: [], guideLineId: '', guideStatus: 'pending', images: [] };
const review = { id: 'r1', author: 'Visitor', rating: 5, body: 'Good', mine: false, createdAt: '2026-01-01', updatedAt: '2026-01-01', photoUrl: null, ownerReply: null };
const routes = { 'GET /shops/s1': shop, 'GET /shops/s1/reviews': { reviews: [review], nextCursor: null }, 'GET /shops/s1/reviews/mine': { review: null } };

test('report failure retains reason and form; success confirms receipt', async () => {
  let accepted = false;
  const net = server({ ...routes, 'POST /shops/s1/reviews/r1/reports': () => accepted ? { reported: true } : refuses('DOWN', 'Please retry') });
  const ui = await mountScreen(h(ShopProfileScreen, { shopId: 's1', onBack() {}, onEdit() {} }));
  try {
    await ui.pressText('Report inappropriate review');
    await ui.type('Spam report', /Reason for report/);
    await ui.pressText('Submit report');
    assert.match(ui.text(), /Please retry/);
    assert.ok(ui.root.findAll((n) => n.props.value === 'Spam report').length);
    accepted = true;
    await ui.pressText('Submit report');
    assert.match(ui.text(), /Report received/);
    assert.equal(ui.root.findAll((n) => n.props.value === 'Spam report').length, 0);
  } finally { ui.unmount(); net.restore(); }
});

test('review network failure retains draft and allows retry', async () => {
  const net = server({ ...routes, 'PUT /shops/s1/reviews/mine': offline() });
  const ui = await mountScreen(h(ShopProfileScreen, { shopId: 's1', onBack() {}, onEdit() {} }));
  try {
    await ui.type('My experience', /Share your experience/);
    await ui.pressText('Submit review');
    assert.ok(ui.root.findAll((n) => n.props.value === 'My experience').length);
    assert.match(ui.text(), /Excellent/);
    await ui.pressText('Submit review');
    assert.equal(net.calls.filter((c) => c.method === 'PUT').length, 2);
  } finally { ui.unmount(); net.restore(); }
});

test('guest guide CTA uses guide context', async () => {
  const net = server(routes);
  const ui = await mountScreen(h(ShopProfileScreen, { shopId: 's1', guest: true, onBack() {}, onEdit() {} }));
  try { assert.match(ui.text(), /Review this guide/); assert.doesNotMatch(ui.text(), /Submit review/); }
  finally { ui.unmount(); net.restore(); }
});

test('auth return restores detail params and removes login/register from back stack', async () => {
  let nav!: Nav;
  function Harness() { nav = useNav('home'); return null; }
  const ui = await mountScreen(h(Harness));
  try {
    act(() => nav.push('shop', { shopId: 's1' }));
    act(() => nav.push('login'));
    act(() => nav.push('register'));
    act(() => { assert.equal(nav.returnAfterAuth(), true); });
    assert.equal(nav.screen, 'shop'); assert.equal(nav.shopId, 's1'); assert.deepEqual(nav.stack, ['home']);
    act(() => nav.pop()); assert.equal(nav.screen, 'home');
  } finally { ui.unmount(); }
});

test('rapid review submissions issue only one request', async () => {
  const net = server(routes);
  const original = api.saveShopReview;
  let calls = 0;
  let finish!: (value: Awaited<ReturnType<typeof api.saveShopReview>>) => void;
  api.saveShopReview = async () => { calls++; return await new Promise((resolve) => { finish = resolve; }); };
  const ui = await mountScreen(h(ShopProfileScreen, { shopId: 's1', onBack() {}, onEdit() {} }));
  try {
    await ui.pressText('Submit review');
    await ui.pressText('Saving…');
    assert.equal(calls, 1);
    await act(async () => { finish({ ok: false, error: 'Retry', code: 'DOWN' }); });
  } finally { ui.unmount(); api.saveShopReview = original; net.restore(); }
});

test('deleting a review requires confirmation and cancel sends no request', async () => {
  const net = server({ ...routes, 'GET /shops/s1/reviews/mine': { review: { ...review, mine: true } }, 'DELETE /shops/s1/reviews/mine': {} });
  const ui = await mountScreen(h(ShopProfileScreen, { shopId: 's1', onBack() {}, onEdit() {} }));
  try {
    await ui.pressText('Delete my review');
    assert.equal(net.calls.filter((c) => c.method === 'DELETE').length, 0);
    await ui.pressText('Cancel');
    assert.equal(net.calls.filter((c) => c.method === 'DELETE').length, 0);
    await ui.pressText('Delete my review');
    await ui.pressText('Confirm delete');
    assert.equal(net.calls.filter((c) => c.method === 'DELETE').length, 1);
  } finally { ui.unmount(); net.restore(); }
});

test('place review failure keeps the composer open and preserves text', async () => {
  const net = server({ 'POST /places/chaweng/reviews': refuses('DOWN', 'Please retry') });
  let closed = 0;
  const ui = await mountScreen(h(ComposeSheet, { placeId: 'chaweng', existing: null, visible: true, canReview: true, storiesOpen: false, busy: false, onPickMedia: async () => null, onPostStory: async () => true, onClose() {}, onSaved() { closed++; }, onWithdrawn() {} }));
  try {
    await ui.press(/5 out of 5/);
    await ui.type('Keep these words');
    await ui.press(/^Post$/);
    assert.equal(closed, 0);
    assert.match(ui.text(), /Please retry/);
    assert.ok(ui.root.findAll((n) => n.props.value === 'Keep these words').length);
  } finally { ui.unmount(); net.restore(); }
});
