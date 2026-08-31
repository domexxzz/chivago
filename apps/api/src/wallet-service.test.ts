import { strict as assert } from 'node:assert';
import { test, describe, beforeEach } from 'node:test';

import { openTestDb, type DB } from './db.ts';
import {
  applyMovement,
  awardQuestReward,
  ensureWallet,
  getBalances,
  getExp,
  getLedger,
  getWallet,
  InsufficientPoints,
  reverseMovement,
  spendOnVoucher,
} from './wallet-service.ts';

let db: DB;
const USER = 'u1';

beforeEach(() => {
  db = openTestDb();
  db.prepare('INSERT INTO users (id, display_name, created_at) VALUES (?, ?, ?)').run(
    USER,
    'John',
    new Date().toISOString(),
  );
  ensureWallet(db, USER);
  // Seeded through the ledger, like every other movement. A balance with no
  // ledger row is exactly what applyMovement exists to prevent.
  applyMovement(db, {
    userId: USER, label: 'Opening', host: 'Test', amount: 1240,
    currency: 'green', kind: 'adjustment', sourceRef: 'test:opening',
  });
});

/**
 * The ledger without the fixture's opening grant.
 *
 * The opening balance is a real movement now, so it writes a real row. These
 * tests are about what the code under test added, not about the fixture.
 */
const movements = (user = USER) =>
  getLedger(db, user).filter((e) => !e.sourceRef.startsWith('test:opening'));
describe('balance and ledger stay in step', () => {
  test('a credit moves the balance and writes exactly one ledger row', () => {
    const r = applyMovement(db, {
      userId: USER, label: 'Beach Cleanup', host: 'Samui Municipality',
      amount: 150, currency: 'green', kind: 'quest_reward',
      sourceRef: 'quest:q1:user:u1',
    });
    assert.equal(r.applied, true);
    assert.equal(r.balances.green, 1390);
    assert.equal(getBalances(db, USER).green, 1390);
    assert.equal(movements().length, 1);
  });

  test('a debit moves the balance down', () => {
    applyMovement(db, {
      userId: USER, label: 'Cold brew', host: 'Sabeinglae Coffee',
      amount: -180, currency: 'green', kind: 'redemption', sourceRef: 'voucher:v1',
    });
    assert.equal(getBalances(db, USER).green, 1060);
  });

  test('a debit larger than the balance is refused and changes nothing', () => {
    assert.throws(
      () => applyMovement(db, {
        userId: USER, label: 'Longtail trip', host: 'Thong Krut Boat Co-op',
        amount: -5000, currency: 'green', kind: 'redemption', sourceRef: 'voucher:v2',
      }),
      InsufficientPoints,
    );
    assert.equal(getBalances(db, USER).green, 1240, 'balance untouched');
    assert.equal(movements().length, 0, 'no orphan ledger row');
  });
});

describe('idempotency', () => {
  test('the same sourceRef never pays twice', () => {
    const args = {
      userId: USER, questId: 'q1', questName: 'Beach Cleanup',
      host: 'Samui Municipality', points: 150, currency: 'green' as const,
    };
    const first = awardQuestReward(db, args);
    const second = awardQuestReward(db, args);
    const third = awardQuestReward(db, args);

    assert.equal(first.applied, true);
    assert.equal(second.applied, false);
    assert.equal(third.applied, false);
    assert.equal(getBalances(db, USER).green, 1390, 'paid exactly once');
    assert.equal(movements().length, 1);
  });

  test('a duplicate returns the original entry rather than erroring', () => {
    const args = {
      userId: USER, questId: 'q1', questName: 'Beach Cleanup',
      host: 'Samui Municipality', points: 150, currency: 'green' as const,
    };
    const first = awardQuestReward(db, args);
    const dupe = awardQuestReward(db, args);
    assert.equal(dupe.entry!.id, first.entry!.id);
  });

  test('different quests are separate awards', () => {
    awardQuestReward(db, { userId: USER, questId: 'q1', questName: 'A', host: 'H', points: 150, currency: 'green' });
    awardQuestReward(db, { userId: USER, questId: 'q2', questName: 'B', host: 'H', points: 400, currency: 'green' });
    assert.equal(getBalances(db, USER).green, 1790);
  });

  test('two users earn the same quest independently', () => {
    db.prepare('INSERT INTO users (id, display_name, created_at) VALUES (?, ?, ?)').run(
      'u2', 'Mai', new Date().toISOString());
    ensureWallet(db, 'u2');
    awardQuestReward(db, { userId: USER, questId: 'q1', questName: 'A', host: 'H', points: 150, currency: 'green' });
    awardQuestReward(db, { userId: 'u2', questId: 'q1', questName: 'A', host: 'H', points: 150, currency: 'green' });
    assert.equal(getBalances(db, USER).green, 1390);
    assert.equal(getBalances(db, 'u2').green, 150);
  });
});

describe('redemptions', () => {
  test('spending is repeatable across vouchers but safe to retry per voucher', () => {
    const buy = (voucherId: string) =>
      spendOnVoucher(db, {
        userId: USER, voucherId, offerName: 'Cold brew + banana bread',
        merchant: 'Sabeinglae Coffee', costPoints: 180, currency: 'green' as const,
      });
    buy('v1');
    buy('v2');
    buy('v1'); // retry of the first request
    assert.equal(getBalances(db, USER).green, 1240 - 360, 'two coffees, not three');
  });

  test('the ledger names the merchant, not the platform', () => {
    spendOnVoucher(db, {
      userId: USER, voucherId: 'v1', offerName: 'Cold brew',
      merchant: 'Sabeinglae Coffee', costPoints: 180, currency: 'green',
    });
    assert.equal(getLedger(db, USER)[0]!.host, 'Sabeinglae Coffee');
  });

  test('a positive cost is always treated as a debit', () => {
    spendOnVoucher(db, {
      userId: USER, voucherId: 'v9', offerName: 'X', merchant: 'M',
      costPoints: 180, currency: 'green',
    });
    assert.equal(getLedger(db, USER)[0]!.amount, -180);
  });
});

describe('reversals', () => {
  test('a reversal offsets the original without deleting it', () => {
    spendOnVoucher(db, {
      userId: USER, voucherId: 'v1', offerName: 'Cold brew',
      merchant: 'Sabeinglae Coffee', costPoints: 180, currency: 'green',
    });
    assert.equal(getBalances(db, USER).green, 1060);

    reverseMovement(db, {
      userId: USER, originalSourceRef: 'voucher:v1', reason: 'merchant closed',
    });
    assert.equal(getBalances(db, USER).green, 1240, 'refunded');
    assert.equal(movements().length, 2, 'ledger is append-only');
  });

  test('reversing twice does not double-refund', () => {
    spendOnVoucher(db, {
      userId: USER, voucherId: 'v1', offerName: 'X', merchant: 'M',
      costPoints: 180, currency: 'green',
    });
    const args = { userId: USER, originalSourceRef: 'voucher:v1', reason: 'closed' };
    reverseMovement(db, args);
    const second = reverseMovement(db, args);
    assert.equal(second.applied, false);
    assert.equal(getBalances(db, USER).green, 1240);
  });

  test('reversing something that never happened is an error, not a silent credit', () => {
    assert.throws(
      () => reverseMovement(db, { userId: USER, originalSourceRef: 'voucher:nope', reason: 'x' }),
      /nothing to reverse/,
    );
    assert.equal(getBalances(db, USER).green, 1240);
  });
});

describe('wallet payload', () => {
  test('reports both purses separately', () => {
    const w = getWallet(db, USER);
    assert.equal(w.balances.green, 1240);
    assert.equal(w.balances.trip, 0, 'the opening grant was Green only');
  });

  test('progression comes from EXP, not from the balance', () => {
    const before = getWallet(db, USER);
    spendOnVoucher(db, {
      userId: USER, voucherId: 'spend-1', offerName: 'Cold brew',
      merchant: 'Sabeinglae Coffee', costPoints: 1000, currency: 'green',
    });
    const after = getWallet(db, USER);

    // THE invariant. Spending must never demote: a level that falls when you
    // buy a coffee teaches people not to spend, which kills the marketplace
    // the whole economy exists to feed.
    assert.equal(after.balances.green, 240, 'balance fell');
    assert.equal(after.progression.exp, before.progression.exp, 'EXP did not');
    assert.equal(after.progression.level, before.progression.level);
    assert.equal(after.progression.rank.key, before.progression.rank.key);
  });

  test('a brand new wallet is coherent, not empty-crashing', () => {
    db.prepare('INSERT INTO users (id, display_name, created_at) VALUES (?, ?, ?)').run(
      'fresh', 'New', new Date().toISOString());
    ensureWallet(db, 'fresh');
    const w = getWallet(db, 'fresh');
    assert.deepEqual(w.balances, { trip: 0, green: 0 });
    assert.equal(w.progression.level, 1);
    assert.equal(w.progression.rank.label.en, 'Newcomer');
    assert.equal(w.progression.ladder.length, 5);
    assert.deepEqual(w.ledger, []);
  });
});

describe('EXP', () => {
  test('a credit grants EXP equal to the points', () => {
    const before = getExp(db, USER);
    awardQuestReward(db, {
      userId: USER, questId: 'q1', questName: 'Beach Cleanup',
      host: 'Samui Municipality', points: 150, currency: 'green',
    });
    assert.equal(getExp(db, USER), before + 150);
  });

  test('a debit grants none - spending is not progress lost', () => {
    const before = getExp(db, USER);
    spendOnVoucher(db, {
      userId: USER, voucherId: 'v1', offerName: 'Cold brew',
      merchant: 'Sabeinglae Coffee', costPoints: 180, currency: 'green',
    });
    assert.equal(getExp(db, USER), before, 'EXP unchanged by a purchase');
    assert.equal(getLedger(db, USER)[0]!.exp, 0);
  });

  test('reversing an award takes back the EXP it granted', () => {
    const before = getExp(db, USER);
    awardQuestReward(db, {
      userId: USER, questId: 'q1', questName: 'Beach Cleanup',
      host: 'Samui Municipality', points: 150, currency: 'green',
    });
    assert.equal(getExp(db, USER), before + 150);

    // The ONE case where EXP moves down. A host who approved by mistake must
    // not leave behind a rank nobody earned.
    reverseMovement(db, {
      userId: USER, originalSourceRef: `quest:q1:user:${USER}`, reason: 'approved in error',
    });
    assert.equal(getExp(db, USER), before, 'EXP unwound with the award');
    assert.equal(getBalances(db, USER).green, 1240, 'points unwound too');
  });

  test('reversing a PURCHASE does not invent EXP', () => {
    spendOnVoucher(db, {
      userId: USER, voucherId: 'v1', offerName: 'Cold brew',
      merchant: 'Sabeinglae Coffee', costPoints: 180, currency: 'green',
    });
    const afterSpend = getExp(db, USER);
    reverseMovement(db, {
      userId: USER, originalSourceRef: 'voucher:v1', reason: 'merchant closed',
    });
    // The purchase granted 0 EXP, so refunding it must grant 0 back - not
    // -0, and certainly not +180.
    assert.equal(getExp(db, USER), afterSpend);
    assert.equal(getBalances(db, USER).green, 1240);
  });
});

describe('the two purses are separate', () => {
  test('a Green award never moves the Trip balance', () => {
    awardQuestReward(db, {
      userId: USER, questId: 'q1', questName: 'Beach Cleanup',
      host: 'Samui Municipality', points: 150, currency: 'green',
    });
    assert.deepEqual(getBalances(db, USER), { trip: 0, green: 1390 });
  });

  test('a full Green balance cannot pay a Trip price', () => {
    // 1,240 Green in the wallet, and a 100-point Trip offer is still refused.
    // Without this, host-verified work would be worth no more than a walk.
    assert.throws(
      () => spendOnVoucher(db, {
        userId: USER, voucherId: 'v-trip', offerName: 'Food trail',
        merchant: 'Traders', costPoints: 100, currency: 'trip',
      }),
      InsufficientPoints,
    );
    assert.deepEqual(getBalances(db, USER), { trip: 0, green: 1240 });
  });

  test('the refusal names which purse was short', () => {
    try {
      spendOnVoucher(db, {
        userId: USER, voucherId: 'v-trip', offerName: 'Food trail',
        merchant: 'Traders', costPoints: 100, currency: 'trip',
      });
      assert.fail('should have thrown');
    } catch (err) {
      assert.ok(err instanceof InsufficientPoints);
      assert.equal(err.currency, 'trip');
      assert.equal(err.balance, 0, 'the TRIP balance, not the green one');
      assert.equal(err.required, 100);
    }
  });
});
