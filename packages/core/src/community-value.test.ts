import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

import { communityValue, type RedeemableVoucher } from './community-value.ts';
import { SEED_OFFERS } from './seed.ts';

/**
 * The S-pillar figure a partner asks for first — and the three things it is
 * not.
 *
 * Every assertion here is really about a boundary. The arithmetic is a sum.
 */

const v = (over: Partial<RedeemableVoucher> = {}): RedeemableVoucher =>
  ({ valueTHB: 120, redeemedAt: '2026-06-15T04:00:00.000Z', ...over });

describe('only a voucher somebody scanned bought anything', () => {
  test('redeemed vouchers are summed at their face value', () => {
    const c = communityValue([v(), v({ valueTHB: 80 })]);
    assert.equal(c.redeemedTHB, 200);
    assert.equal(c.priced, 2);
  });

  test('an issued voucher nobody used is counted apart, not summed', () => {
    // It is sitting in a phone. It bought nobody an afternoon.
    const c = communityValue([v(), v({ redeemedAt: null })]);
    assert.equal(c.redeemedTHB, 120);
    assert.equal(c.unredeemed, 1);
  });

  test('an unpriced redemption is counted and is in no total', () => {
    // THE RULE. Folding it in at zero would turn a gap in the record into a
    // claim that the coffee was worth nothing.
    const c = communityValue([v(), v({ valueTHB: null })]);
    assert.equal(c.redeemedTHB, 120);
    assert.deepEqual([c.priced, c.unpriced], [1, 1]);
  });

  test('an unpriced voucher nobody redeemed is unredeemed, not unpriced', () => {
    // Unpriced counts REDEMPTIONS missing a price. A voucher that was never
    // scanned has a different problem, and mixing them would overstate how
    // much of the record is incomplete.
    const c = communityValue([v({ valueTHB: null, redeemedAt: null })]);
    assert.deepEqual([c.unpriced, c.unredeemed], [0, 1]);
  });

  test('nothing at all is zero with nothing missing', () => {
    const c = communityValue([]);
    assert.deepEqual([c.redeemedTHB, c.priced, c.unpriced, c.unredeemed], [0, 0, 0, 0]);
  });
});

describe('the total says what it is not', () => {
  test('it names all three things it is not, every time', () => {
    const said = communityValue([v()]).boundary;
    assert.match(said.en, /Not what the traveller spent/);
    assert.match(said.en, /not the merchant’s revenue/);
    assert.match(said.en, /would not have happened anyway/);
    assert.match(said.th, /ไม่ใช่ยอดที่นักเดินทางจ่ายจริง/);
  });

  test('and says how many redemptions it could not price', () => {
    const said = communityValue([v(), v({ valueTHB: null }), v({ valueTHB: null })]).boundary;
    assert.match(said.en, /2 redemptions had no price/);
    assert.match(said.th, /อีก 2 รายการ/);
  });

  test('one of them is singular, because a report is read by a person', () => {
    assert.match(communityValue([v({ valueTHB: null })]).boundary.en, /1 redemption had no price/);
  });
});

describe('the seed does not invent prices for real shops', () => {
  test('every seeded offer is unpriced, and that is the decision', () => {
    // These are named businesses on Samui. Six plausible figures typed into
    // the seed would be fabricated prices attached to real merchants - the
    // same move this file refuses for a photograph with no credit. The true
    // answer is unpriced until somebody rings the shop.
    assert.ok(SEED_OFFERS.length > 0);
    for (const o of SEED_OFFERS) {
      assert.equal(o.valueTHB, null, `${o.merchant} was given a price nobody asked them for`);
    }
  });
});
