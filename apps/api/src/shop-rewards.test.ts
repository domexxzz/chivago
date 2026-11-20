/**
 * Points spent at a shop on the island, checked by the shop.
 *
 * Three parties and one rule each:
 *
 *   - the OWNER of a shop puts rewards on it, priced in Trip Points, and is
 *     the only account that can mark one of its vouchers used;
 *   - a TRAVELLER redeems through the same market every other offer uses, and
 *     gets a code and a QR;
 *   - NOBODY ELSE can mark a voucher used. Before this, `POST
 *     /vouchers/:code/redeem` answered any device key at all, so a traveller
 *     could tick their own voucher off without going near the shop.
 *
 * There is no chance anywhere in it: a deed earns the points and the points
 * buy a named thing at a named price. That is why this, and not the box, is
 * where a shop's coupons live (docs/68).
 */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

process.env.CHIVAGO_DB = ':memory:';
// This file registers two dozen accounts; the per-hour door limit is tested in account-routes.test.ts.
process.env.CHIVAGO_REGISTRATIONS_PER_HOUR = '0';
const { app, db } = await import('./server-node.ts');
const { applyMovement } = await import('./wallet-service.ts');

const parse = async (res: Response): Promise<any> => res.json();

let serial = 300;
const register = async (accountType: 'operator' | 'traveller') => {
  serial += 1;
  const suffix = String(serial);
  const res = await app.request('/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      fullName: `Reward ${suffix}`,
      email: `reward${suffix}@example.com`,
      phone: `0830000${suffix.padStart(3, '0')}`,
      password: 'password123',
      accountType,
      businessName: accountType === 'operator' ? `Reward Shop ${suffix}` : undefined,
    }),
  });
  const body = await parse(res);
  assert.equal(res.status, 200, JSON.stringify(body));
  return { key: { 'x-chivago-device-key': body.data.deviceKey as string }, userId: body.data.userId as string };
};

const request = (path: string, method: string, key: Record<string, string>, body?: unknown) =>
  app.request(path, {
    method,
    headers: { ...key, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const makeShop = async (owner: Record<string, string>, name: string) => {
  const created = await parse(await request('/shops', 'POST', owner, {
    name, category: 'ร้านอาหาร', areaKey: 'koh-sichang', description: 'rewards',
    address: 'Tha Lang', lat: 13.1599, lng: 100.8096, phone: '0811111111',
    email: 'rewards@example.com', openingHours: '09:00-18:00', amenities: [], active: true,
  }));
  assert.equal(created.ok, true, JSON.stringify(created));
  return created.data.id as string;
};

const fundTrip = (userId: string, amount: number) => applyMovement(db, {
  userId, label: 'Walked for a test', host: 'test', amount, currency: 'trip', kind: 'walk',
  sourceRef: `test-walk:${userId}:${amount}:${serial}`,
});

const reward = { name: 'Iced coffee', costPoints: 120, valueTHB: 45 };

async function setUp() {
  const owner = await register('operator');
  const traveller = await register('traveller');
  const shopId = await makeShop(owner.key, `Pier Cafe ${serial}`);
  const created = await parse(await request(`/shops/${shopId}/rewards`, 'POST', owner.key, reward));
  assert.equal(created.ok, true, JSON.stringify(created));
  return { owner, traveller, shopId, offerId: created.data.id as string };
}

async function redeemAsTraveller(traveller: { key: Record<string, string>; userId: string }, offerId: string) {
  fundTrip(traveller.userId, 500);
  const res = await parse(await request(`/offers/${offerId}/redeem`, 'POST', traveller.key));
  assert.equal(res.ok, true, JSON.stringify(res));
  return res.data.voucher as { code: string; status: string; merchant: string };
}

test('an owner puts a reward on their shop, priced in Trip Points, and the market lists it', async () => {
  const { traveller, shopId, offerId } = await setUp();
  const offers = await parse(await request('/offers', 'GET', traveller.key));
  const listed = offers.data.find((o: any) => o.id === offerId);
  assert.ok(listed, 'the shop reward is not in the market');
  assert.equal(listed.currency, 'trip');
  assert.equal(listed.costPoints, reward.costPoints);
  assert.equal(listed.valueTHB, reward.valueTHB);
  assert.equal(listed.shopId, shopId);
  assert.ok(!listed.example, 'a real shop reward is not an example');

  const onShop = await parse(await request(`/shops/${shopId}/rewards`, 'GET', traveller.key));
  assert.deepEqual(onShop.data.map((r: any) => r.id), [offerId]);
});

test('a reward is always priced in Trip Points, whatever currency is asked for', async () => {
  const owner = await register('operator');
  const shopId = await makeShop(owner.key, 'Green Ask');
  const res = await parse(await request(`/shops/${shopId}/rewards`, 'POST', owner.key, { ...reward, currency: 'green' }));
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.equal(res.data.currency, 'trip');
});

test('only the owner can put a reward on a shop', async () => {
  const { shopId, traveller } = await setUp();
  const stranger = await register('operator');
  const byStranger = await request(`/shops/${shopId}/rewards`, 'POST', stranger.key, reward);
  assert.equal(byStranger.status, 403);
  const byTraveller = await request(`/shops/${shopId}/rewards`, 'POST', traveller.key, reward);
  assert.equal(byTraveller.status, 403);
});

test('a reward with no name, or a price outside the published range, is refused', async () => {
  const owner = await register('operator');
  const shopId = await makeShop(owner.key, 'Bad Prices');
  for (const bad of [
    { ...reward, name: ' ' },
    { ...reward, costPoints: 10 },
    { ...reward, costPoints: 1_000_000 },
    { ...reward, costPoints: 12.5 },
    { ...reward, valueTHB: -5 },
  ]) {
    const res = await request(`/shops/${shopId}/rewards`, 'POST', owner.key, bad);
    const body = await parse(res);
    assert.equal(res.status, 400, JSON.stringify(bad));
    assert.equal(body.code, 'INVALID_REWARD');
  }
});

test('a shop holds a bounded number of rewards', async () => {
  const owner = await register('operator');
  const shopId = await makeShop(owner.key, 'Many Rewards');
  const { SHOP_REWARD_LIMIT } = await import('./shop-reward-service.ts');
  for (let i = 0; i < SHOP_REWARD_LIMIT; i += 1) {
    const ok = await parse(await request(`/shops/${shopId}/rewards`, 'POST', owner.key, { ...reward, name: `Reward ${i}` }));
    assert.equal(ok.ok, true, JSON.stringify(ok));
  }
  const over = await parse(await request(`/shops/${shopId}/rewards`, 'POST', owner.key, reward));
  assert.equal(over.code, 'REWARD_LIMIT');
});

test('the owner checks a code, sees what it is for and nothing about who holds it, then marks it used', async () => {
  const { owner, traveller, shopId, offerId } = await setUp();
  const voucher = await redeemAsTraveller(traveller, offerId);

  const preview = await parse(await request(`/shops/${shopId}/vouchers/${voucher.code}`, 'GET', owner.key));
  assert.equal(preview.ok, true, JSON.stringify(preview));
  assert.equal(preview.data.status, 'active');
  assert.equal(preview.data.rewardName, reward.name);
  assert.equal(preview.data.valueTHB, reward.valueTHB);
  const flat = JSON.stringify(preview.data);
  assert.ok(!flat.includes(traveller.userId), 'the preview names the traveller');
  assert.ok(!/reward\d+@example\.com|Reward \d{3}"/.test(flat), 'the preview carries personal details');

  const used = await parse(await request(`/shops/${shopId}/vouchers/${voucher.code}/redeem`, 'POST', owner.key));
  assert.equal(used.ok, true, JSON.stringify(used));
  assert.equal(used.data.alreadyRedeemed, false);
  assert.equal(used.data.status, 'redeemed');

  const again = await parse(await request(`/shops/${shopId}/vouchers/${voucher.code}/redeem`, 'POST', owner.key));
  assert.equal(again.data.alreadyRedeemed, true, 'scanning twice should be harmless');

  const mine = await parse(await request('/vouchers', 'GET', traveller.key));
  assert.equal(mine.data.find((v: any) => v.code === voucher.code).status, 'redeemed');
});

test('a code typed in lower case, with spaces, or pasted from the QR is still found', async () => {
  const { owner, traveller, shopId, offerId } = await setUp();
  const voucher = await redeemAsTraveller(traveller, offerId);
  for (const typed of [voucher.code.toLowerCase(), ` ${voucher.code} `]) {
    const res = await parse(await request(`/shops/${shopId}/vouchers/${encodeURIComponent(typed)}`, 'GET', owner.key));
    assert.equal(res.ok, true, `${JSON.stringify(typed)}: ${JSON.stringify(res)}`);
  }
});

test('another shop cannot see or use this shop\'s voucher', async () => {
  const { traveller, offerId } = await setUp();
  const voucher = await redeemAsTraveller(traveller, offerId);
  const other = await register('operator');
  const otherShop = await makeShop(other.key, 'Other Shop');
  assert.equal((await request(`/shops/${otherShop}/vouchers/${voucher.code}`, 'GET', other.key)).status, 404);
  assert.equal((await request(`/shops/${otherShop}/vouchers/${voucher.code}/redeem`, 'POST', other.key)).status, 404);
});

test('an expired voucher is refused at the counter', async () => {
  const { owner, traveller, shopId, offerId } = await setUp();
  const voucher = await redeemAsTraveller(traveller, offerId);
  db.prepare('UPDATE vouchers SET expires_at = ? WHERE code = ?').run('2020-01-01T00:00:00.000Z', voucher.code);
  const res = await request(`/shops/${shopId}/vouchers/${voucher.code}/redeem`, 'POST', owner.key);
  assert.equal(res.status, 410);
  assert.equal((await parse(res)).code, 'EXPIRED');
});

test('a traveller can no longer mark their own voucher used', async () => {
  const { traveller, offerId } = await setUp();
  const voucher = await redeemAsTraveller(traveller, offerId);
  const res = await request(`/vouchers/${voucher.code}/redeem`, 'POST', traveller.key);
  assert.equal(res.status, 403);
  const row = db.prepare('SELECT status FROM vouchers WHERE code = ?').get(voucher.code) as { status: string };
  assert.equal(row.status, 'active');
});

test('a reward the owner switches off leaves the market and cannot be redeemed, but the owner still sees it', async () => {
  const { owner, traveller, shopId, offerId } = await setUp();
  const off = await parse(await request(`/shops/${shopId}/rewards/${offerId}`, 'PUT', owner.key, { ...reward, available: false }));
  assert.equal(off.ok, true, JSON.stringify(off));

  const offers = await parse(await request('/offers', 'GET', traveller.key));
  assert.ok(!offers.data.some((o: any) => o.id === offerId), 'a switched-off reward is still listed');
  fundTrip(traveller.userId, 500);
  const refused = await parse(await request(`/offers/${offerId}/redeem`, 'POST', traveller.key));
  assert.equal(refused.code, 'UNAVAILABLE');

  const ownerView = await parse(await request(`/shops/${shopId}/rewards`, 'GET', owner.key));
  assert.equal(ownerView.data[0].available, false);
  const publicView = await parse(await request(`/shops/${shopId}/rewards`, 'GET', traveller.key));
  assert.equal(publicView.data.length, 0);
});

test('a shop taken offline takes its rewards with it', async () => {
  const { owner, traveller, shopId, offerId } = await setUp();
  db.prepare('UPDATE local_shops SET active = 0 WHERE id = ?').run(shopId);
  const offers = await parse(await request('/offers', 'GET', traveller.key));
  assert.ok(!offers.data.some((o: any) => o.id === offerId));
  fundTrip(traveller.userId, 500);
  assert.equal((await parse(await request(`/offers/${offerId}/redeem`, 'POST', traveller.key))).code, 'UNAVAILABLE');
  assert.equal((await parse(await request(`/shops/${shopId}/rewards`, 'GET', owner.key))).data.length, 1);
});

test('an owner cannot edit a reward that belongs to another shop', async () => {
  const { offerId } = await setUp();
  const other = await register('operator');
  const otherShop = await makeShop(other.key, 'Not Yours');
  const res = await request(`/shops/${otherShop}/rewards/${offerId}`, 'PUT', other.key, { ...reward, costPoints: 50 });
  assert.equal(res.status, 404);
});
