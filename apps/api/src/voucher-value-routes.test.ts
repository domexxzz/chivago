import { strict as assert } from 'node:assert';
import { test, describe, before } from 'node:test';

import { communityValue } from '@chivago/core';

/**
 * A voucher carries a price, and it carries the one it was issued at.
 *
 * `community-value.ts` in core proves what the figure means and refuses. This
 * proves the wiring: the value is snapshot at issue, an unpriced offer stays
 * unpriced rather than becoming zero, and repricing an offer does not reprice
 * a voucher already in somebody's phone.
 */

delete process.env.CHIVAGO_OPEN_IDENTITY;
process.env.CHIVAGO_DB = ':memory:';

const { app, db } = await import('./server.ts');

type Body = { ok: boolean; data?: any; code?: string };
const json = async (res: Response) => (await res.json()) as Body;
const post = (path: string, body: unknown, key?: string) =>
  app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(key ? { 'x-chivago-device-key': key } : {}) },
    body: JSON.stringify(body ?? {}),
  });
const get = (path: string, key: string) =>
  app.request(path, { headers: { 'x-chivago-device-key': key } });

let ana: string;

const offer = (id: string, valueTHB: number | null, costPoints = 10) =>
  db.prepare(
    `INSERT OR REPLACE INTO offers
       (id, category, name, merchant, merchant_short, cost_points, value_thb, currency, available)
     VALUES (?,?,?,?,?,?,?,'trip',1)`,
  ).run(id, 'Café', `Offer ${id}`, `Merchant ${id}`, `M${id}`, costPoints, valueTHB);

before(async () => {
  ana = (await json(await post('/devices', { displayName: 'Ana', label: 'Ana' }))).data.deviceKey;
  // Points to spend. The redemption debits before it writes the voucher.
  db.prepare("UPDATE wallets SET trip_points = 5000 WHERE user_id = (SELECT id FROM users LIMIT 1)").run();
});

describe('a voucher keeps the price it was issued at', () => {
  test('a priced offer puts its baht value on the voucher', async () => {
    offer('o-priced', 120);
    const res = await json(await post('/offers/o-priced/redeem', {}, ana));
    assert.equal(res.ok, true, JSON.stringify(res));
    assert.equal(res.data.voucher.valueTHB, 120);

    const row = db.prepare("SELECT value_thb AS v FROM vouchers WHERE offer_id = 'o-priced'")
      .get() as unknown as { v: number | null };
    assert.equal(row.v, 120, 'the value never reached the row');
  });

  test('AN UNPRICED OFFER STAYS UNPRICED, IT DOES NOT BECOME ZERO', async () => {
    // Null and 0 are different answers. A zero would be summed as "worth
    // nothing", turning a gap in the record into a claim about the offer.
    offer('o-unpriced', null);
    const res = await json(await post('/offers/o-unpriced/redeem', {}, ana));
    assert.equal(res.data.voucher.valueTHB, null);

    const row = db.prepare("SELECT value_thb AS v FROM vouchers WHERE offer_id = 'o-unpriced'")
      .get() as unknown as { v: number | null };
    assert.equal(row.v, null, 'an unpriced offer was recorded as worth nothing');
  });

  test('repricing the offer does not reprice a voucher already issued', async () => {
    // The lesson `org_sponsorships.received_thb` learned a week ago, applied
    // before it could bite: a merchant raising a price next year must not
    // rewrite what was handed out last year.
    offer('o-moves', 100);
    await post('/offers/o-moves/redeem', {}, ana);
    db.prepare("UPDATE offers SET value_thb = 999 WHERE id = 'o-moves'").run();

    const row = db.prepare("SELECT value_thb AS v FROM vouchers WHERE offer_id = 'o-moves'")
      .get() as unknown as { v: number };
    assert.equal(row.v, 100, 'a voucher in somebody’s phone was repriced');
  });

  test('the list endpoint answers in baht too', async () => {
    const res = await json(await get('/vouchers', ana));
    // The endpoint answers with the array itself, not an object around it.
    const priced = res.data.find((v: { offerId: string }) => v.offerId === 'o-priced');
    assert.equal(priced.valueTHB, 120);
    const unpriced = res.data.find((v: { offerId: string }) => v.offerId === 'o-unpriced');
    assert.equal(unpriced.valueTHB, null);
  });
});

describe('what the rows add up to', () => {
  test('nothing is redeemed yet, so nothing reached a merchant', () => {
    // Issued is not redeemed. Every voucher above is sitting in a phone.
    const vouchers = db.prepare('SELECT value_thb AS valueTHB, redeemed_at AS redeemedAt FROM vouchers')
      .all() as unknown as { valueTHB: number | null; redeemedAt: string | null }[];
    const c = communityValue(vouchers);
    assert.equal(c.redeemedTHB, 0);
    assert.equal(c.unredeemed, vouchers.length);
  });

  test('scanning one counts it, and the unpriced one is counted apart', () => {
    db.prepare(
      "UPDATE vouchers SET status = 'redeemed', redeemed_at = ? WHERE offer_id IN ('o-priced','o-unpriced')",
    ).run(new Date().toISOString());

    const vouchers = db.prepare('SELECT value_thb AS valueTHB, redeemed_at AS redeemedAt FROM vouchers')
      .all() as unknown as { valueTHB: number | null; redeemedAt: string | null }[];
    const c = communityValue(vouchers);
    assert.equal(c.redeemedTHB, 120, 'the unpriced redemption was folded in at zero');
    assert.deepEqual([c.priced, c.unpriced], [1, 1]);
    assert.match(c.boundary.en, /1 redemption had no price/);
  });
});
