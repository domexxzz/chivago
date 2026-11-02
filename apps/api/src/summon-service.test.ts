import { strict as assert } from 'node:assert';
import { test, describe, beforeEach } from 'node:test';

import { openTestDb, type DB } from './db-node.ts';
import {
  AlreadyHave, EPOCH_HOURS, NoCharms, NotEnoughDust, UnknownSpirit, charmsFor, closeEpoch,
  collectionFor, commitmentOf, currentEpoch, dustFor, forge, heldBy, historyFor, pityFor,
  publicEpoch, publishedRules, rollFor, rotateEpochs, summon, summonState, verifySummon,
} from './summon-service.ts';
import {
  DUST_FROM_DUPLICATE, DUST_TO_FORGE, MYTHIC_PITY, RARITIES, RARITY_EFFECTIVE_PERCENT,
  RARITY_PERCENT, SPIRITS, spiritFor,
} from '@chivago/core';

let db: DB;
const T = new Date('2026-10-23T03:00:00.000Z');
const later = (min: number) => new Date(T.getTime() + min * 60_000);

/** A ledger row of the shape wallet-service writes, with no wallet behind it. */
function ledger(
  userId: string, kind: string, sourceRef: string, at = T, amount = 20, currency: 'trip' | 'green' = 'trip',
): void {
  db.prepare(
    `INSERT INTO ledger (id, user_id, label, occurred_at, host, amount, kind, currency, exp, source_ref)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
  ).run(`l-${sourceRef}`, userId, kind, at.toISOString(), 'x', amount, kind, currency, amount, sourceRef);
}

const checkinOn = (userId: string, place: string, day: string) =>
  ledger(userId, 'checkin', `checkin:${place}:user:${userId}:${day}`);
const verifiedQuest = (userId: string, n: number) =>
  ledger(userId, 'quest_reward', `quest:q${n}:user:${userId}`, T, 50, 'green');

/** Charms enough for n summons, from n distinct days. */
function giveCharms(userId: string, n: number): void {
  for (let i = 0; i < n; i += 1) checkinOn(userId, 'chaweng', `2026-09-${String(i + 1).padStart(2, '0')}`);
}

/*
  A FIXED EPOCH, so a roll is the same roll on every run.

  `currentEpoch` opens one with `randomBytes(32)` when there is none, which
  is right in production and wrong in a test file: every assertion about
  WHICH spirit came out was then a different assertion each run. It passed
  for a day and then failed on a run where a summon happened to re-draw a
  spirit the test had already forged. A flaky test is worse than no test, so
  the epoch is pinned here and the randomness is tested where it belongs -
  in `rollFor`, which is pure.
*/
const SEED = '7f3c91a2b4d6e805'.repeat(4);

beforeEach(() => {
  db = openTestDb();
  for (const u of ['ana', 'bo']) {
    db.prepare('INSERT INTO users (id, display_name, created_at) VALUES (?,?,?)').run(u, u, T.toISOString());
  }
  db.prepare('INSERT INTO summon_epochs (id, commitment, seed, opened_at, closed_at) VALUES (?,?,?,?,NULL)')
    .run('epoch-fixed', commitmentOf(SEED), SEED, T.toISOString());
});

describe('a charm is earned, never bought', () => {
  test('a new traveller has none, and a summon is refused rather than sold', () => {
    assert.equal(charmsFor(db, 'ana').available, 0);
    assert.throws(() => summon(db, 'ana', T), NoCharms);
  });

  test('a host-verified quest is one charm; a day with check-ins is one charm', () => {
    verifiedQuest('ana', 1);
    verifiedQuest('ana', 2);
    checkinOn('ana', 'chaweng', '2026-10-21');
    checkinOn('ana', 'namuang', '2026-10-21');
    checkinOn('ana', 'chaweng', '2026-10-22');
    const c = charmsFor(db, 'ana');
    assert.equal(c.verifiedQuests, 2);
    assert.equal(c.checkinDays, 2, 'two places on one day is one day');
    assert.equal(c.earned, 4);
    assert.equal(c.available, 4);
  });

  /*
    The day comes off the source_ref, which `awardCheckin` wrote in ISLAND
    time. Deriving it from occurred_at would split a single Samui evening
    across two UTC days and hand out a second charm for it.
  */
  test('two check-ins in one island evening are one charm even across UTC midnight', () => {
    ledger('ana', 'checkin', 'checkin:chaweng:user:ana:2026-10-22', new Date('2026-10-22T16:30:00.000Z'));
    ledger('ana', 'checkin', 'checkin:namuang:user:ana:2026-10-22', new Date('2026-10-22T18:30:00.000Z'));
    assert.equal(charmsFor(db, 'ana').checkinDays, 1);
  });

  test('a reversed deed stops paying for a charm', () => {
    verifiedQuest('ana', 1);
    assert.equal(charmsFor(db, 'ana').earned, 1);
    ledger('ana', 'adjustment', 'reversal:quest:q1:user:ana', T, -50, 'green');
    assert.equal(charmsFor(db, 'ana').earned, 0, 'a clawed-back quest still bought a summon');
  });

  test('a summon spends exactly one charm', () => {
    giveCharms('ana', 3);
    summon(db, 'ana', T);
    assert.equal(charmsFor(db, 'ana').available, 2);
    summon(db, 'ana', later(1));
    summon(db, 'ana', later(2));
    assert.equal(charmsFor(db, 'ana').available, 0);
    assert.throws(() => summon(db, 'ana', later(3)), NoCharms);
  });

  test('one traveller\'s charms are not another\'s', () => {
    giveCharms('ana', 2);
    assert.equal(charmsFor(db, 'bo').available, 0);
    assert.throws(() => summon(db, 'bo', T), NoCharms);
  });
});

/*
  THE RULE THE WHOLE MECHANIC RESTS ON.

  docs/58 lists "a drop table, or any reward decided by a roll" as something
  that would move this product under the Gambling Act in one commit. What
  keeps this on the right side of that line is that the roll decides WHICH
  PICTURE, and nothing else. If a later change makes a summon pay, grant or
  unlock anything, these are the tests that have to be deleted to do it -
  which is the point of writing them.
*/
describe('a summon yields a spirit and NOTHING else', () => {
  test('no wallet, no ledger row, no voucher, no EXP', () => {
    giveCharms('ana', 1);
    const before = {
      wallets: count('wallets'), ledger: count('ledger'), vouchers: count('vouchers'),
    };
    summon(db, 'ana', T);
    assert.equal(count('wallets'), before.wallets, 'a summon touched the wallets table');
    assert.equal(count('ledger'), before.ledger, 'a summon wrote to the ledger');
    assert.equal(count('vouchers'), before.vouchers, 'a summon issued a voucher');
  });

  test('the result carries no currency, points, value or prize of any kind', () => {
    giveCharms('ana', 1);
    const result = summon(db, 'ana', T) as unknown as Record<string, unknown>;
    for (const forbidden of ['balances', 'points', 'green', 'trip', 'exp', 'voucher', 'offer', 'thb', 'valueTHB', 'prize', 'reward']) {
      assert.ok(!(forbidden in result), `a summon result carries '${forbidden}'`);
    }
    const flat = JSON.stringify(result).toLowerCase();
    for (const word of ['voucher', 'prize', 'cash', 'discount']) {
      assert.ok(!flat.includes(word), `the word '${word}' reached a summon result`);
    }
  });

  test('the notice served with the rates says so, in both languages', () => {
    const { notice } = publishedRules();
    assert.match(notice.en, /never money/i);
    assert.match(notice.en, /no points, no vouchers, no prizes/i);
    assert.match(notice.th, /[฀-๿]/);
  });

  /*
    `rates` is the field the app prints under the word "odds". It used to be
    the roll band, which is not what a player meets: the floors lift rare and
    mythic a long way above it. This test is the one that has to be deleted to
    put the old number back on the screen.
  */
  test('the rates served are the ones a player meets, not the roll band', () => {
    const rules = publishedRules();
    assert.deepEqual(rules.rates, RARITY_EFFECTIVE_PERCENT);
    assert.notDeepEqual(rules.rates, RARITY_PERCENT, 'the published rate is the pre-floor band again');
    assert.ok(rules.rates.mythic > RARITY_PERCENT.mythic);
    assert.ok(rules.rates.rare > RARITY_PERCENT.rare);
  });

  test('the roll band is still published, because a verifier needs it', () => {
    const rules = publishedRules();
    assert.deepEqual(rules.rollBand, RARITY_PERCENT);
    assert.equal(RARITIES.reduce((n, r) => n + rules.rollBand[r], 0), 100);
    assert.equal(RARITIES.reduce((n, r) => n + rules.effectiveWeights[r], 0), rules.weightTotal);
  });

  test('the rules say when the seed behind them is published', () => {
    assert.equal(publishedRules().epochHours, EPOCH_HOURS);
    assert.ok(EPOCH_HOURS > 0, 'an epoch that never closes is a commitment nobody can check');
  });
});

describe('the commit-reveal', () => {
  test('an epoch publishes a commitment before any roll, and withholds the seed until it closes', () => {
    const e = currentEpoch(db, T);
    assert.equal(commitmentOf(e.seed!), e.commitment);
    assert.equal(publicEpoch(e).seed, null, 'the seed is out while the epoch is still live');
    const closed = closeEpoch(db, e.id, later(60))!;
    assert.equal(publicEpoch(closed).seed, e.seed);
  });

  test('the same epoch is reused until it is closed, then a new one opens', () => {
    const first = currentEpoch(db, T);
    assert.equal(currentEpoch(db, later(1)).id, first.id);
    closeEpoch(db, first.id, later(2));
    const second = currentEpoch(db, later(3));
    assert.notEqual(second.id, first.id);
    assert.notEqual(second.commitment, first.commitment);
  });

  /*
    The rotation. `closeEpoch` existed and was tested from the beginning, and
    NOTHING IN THE RUNNING PRODUCT CALLED IT - so no seed was ever published,
    `verifySummon` answered "still open" forever, and the commit-reveal was a
    promise the server could not keep. These tests are about the calling, not
    the closing.
  */
  const hours = (n: number) => new Date(T.getTime() + n * 3_600_000);

  test('an epoch younger than the window is left alone', () => {
    const live = currentEpoch(db, T);
    assert.deepEqual(rotateEpochs(db, hours(EPOCH_HOURS - 1)), [], 'a live epoch was closed early');
    assert.equal(publicEpoch(currentEpoch(db, hours(EPOCH_HOURS - 1))).seed, null);
    assert.equal(currentEpoch(db, hours(EPOCH_HOURS - 1)).id, live.id);
  });

  test('once the window is up the epoch closes and its seed is published', () => {
    const live = currentEpoch(db, T);
    const closed = rotateEpochs(db, hours(EPOCH_HOURS));
    assert.equal(closed.length, 1);
    assert.equal(closed[0]!.id, live.id);
    assert.equal(publicEpoch(closed[0]!).seed, live.seed, 'the seed is still withheld after closing');
    assert.equal(commitmentOf(closed[0]!.seed!), live.commitment, 'the published seed is not the one committed to');
  });

  test('rotating is idempotent, and the next summon opens a fresh epoch', () => {
    const first = currentEpoch(db, T);
    rotateEpochs(db, hours(EPOCH_HOURS));
    assert.deepEqual(rotateEpochs(db, hours(EPOCH_HOURS + 1)), [], 'a closed epoch was closed twice');
    const second = currentEpoch(db, hours(EPOCH_HOURS + 1));
    assert.notEqual(second.id, first.id);
    assert.notEqual(second.commitment, first.commitment);
    assert.equal(second.closedAt, null);
  });

  test('a summon rotates before it reads the epoch, so no roll uses a published seed', () => {
    giveCharms('ana', 2);
    const first = summon(db, 'ana', T);
    // A day later: the epoch the first summon used is now past the window.
    const second = summon(db, 'ana', hours(EPOCH_HOURS + 1));
    assert.notEqual(second.receipt.epochId, first.receipt.epochId, 'the second roll reused a stale epoch');

    const stale = verifySummon(db, first.id);
    assert.ok(stale.checkable, 'the first summon is still unverifiable after its epoch aged out');
    assert.ok(stale.matches, stale.detail);

    const fresh = verifySummon(db, second.id);
    assert.equal(fresh.checkable, false, "the live epoch's seed is out while rolls are still being made");
  });

  test('a day of rolls all become checkable together, by anybody holding a receipt', () => {
    giveCharms('ana', 3);
    const made = [summon(db, 'ana', T), summon(db, 'ana', hours(1)), summon(db, 'ana', hours(2))];
    for (const s of made) assert.equal(verifySummon(db, s.id).checkable, false);
    rotateEpochs(db, hours(EPOCH_HOURS));
    for (const s of made) {
      const v = verifySummon(db, s.id);
      assert.ok(v.checkable, `${s.id} is not checkable once the seed is out`);
      assert.ok(v.matches, v.detail);
    }
  });

  test('a roll is a pure function of the seed, the traveller and the nonce', () => {
    const a = rollFor('a'.repeat(64), 'ana', 1);
    const b = rollFor('a'.repeat(64), 'ana', 1);
    assert.deepEqual(a, b);
    assert.notDeepEqual(a, rollFor('a'.repeat(64), 'ana', 2), 'the nonce does not move the roll');
    assert.notDeepEqual(a, rollFor('a'.repeat(64), 'bo', 1), 'two travellers share one roll');
    assert.notDeepEqual(a, rollFor('b'.repeat(64), 'ana', 1), 'the seed does not move the roll');
    assert.ok(a.roll >= 0 && a.roll < 10_000);
  });

  test('a summon can be rechecked once the seed is out, and not before', () => {
    giveCharms('ana', 1);
    const s = summon(db, 'ana', T);
    const live = verifySummon(db, s.id);
    assert.equal(live.found, true);
    assert.equal(live.checkable, false, 'an open epoch must not claim to be checkable');

    closeEpoch(db, s.receipt.epochId, later(60));
    const checked = verifySummon(db, s.id);
    assert.equal(checked.checkable, true);
    assert.equal(checked.matches, true, checked.detail);
  });

  test('a row edited after the fact fails the recheck', () => {
    giveCharms('ana', 1);
    const s = summon(db, 'ana', T);
    closeEpoch(db, s.receipt.epochId, later(60));
    // Somebody upgrades their own pull in the database.
    const mythic = SPIRITS.find((x) => x.rarity === 'mythic')!;
    db.prepare("UPDATE summons SET spirit_key = ?, rarity = 'mythic', by_pity = NULL WHERE id = ?")
      .run(mythic.key, s.id);
    const checked = verifySummon(db, s.id);
    assert.equal(checked.matches, false, 'an edited row passed verification');
  });

  test('a seed that does not match its commitment is caught, not trusted', () => {
    giveCharms('ana', 1);
    const s = summon(db, 'ana', T);
    closeEpoch(db, s.receipt.epochId, later(60));
    db.prepare('UPDATE summon_epochs SET seed = ? WHERE id = ?').run('f'.repeat(64), s.receipt.epochId);
    const checked = verifySummon(db, s.id);
    assert.equal(checked.matches, false);
    assert.match(checked.detail, /commitment/i);
  });

  test('an unknown id is answered, not thrown', () => {
    const v = verifySummon(db, 'no-such-summon');
    assert.equal(v.found, false);
    assert.equal(v.matches, null);
  });
});

describe('what a traveller ends up with', () => {
  test('the first of a spirit is kept; a second becomes stardust', () => {
    giveCharms('ana', 40);
    let firstDuplicate: ReturnType<typeof summon> | null = null;
    for (let i = 0; i < 40 && firstDuplicate === null; i += 1) {
      const s = summon(db, 'ana', later(i));
      if (s.duplicate) firstDuplicate = s;
    }
    assert.ok(firstDuplicate, 'forty summons of twenty-four spirits produced no duplicate at all');
    assert.equal(firstDuplicate!.dustGained, DUST_FROM_DUPLICATE[firstDuplicate!.rarity]);
    assert.ok(dustFor(db, 'ana') >= firstDuplicate!.dustGained);
  });

  test('the floor fires by the thirtieth summon, and the receipt says it was the floor', () => {
    giveCharms('ana', MYTHIC_PITY);
    let sawMythic = false;
    for (let i = 0; i < MYTHIC_PITY; i += 1) {
      const s = summon(db, 'ana', later(i));
      if (s.rarity === 'mythic') sawMythic = true;
    }
    assert.ok(sawMythic, `no mythic in ${MYTHIC_PITY} summons - the floor did not fire`);
    assert.equal(pityFor(db, 'ana').sinceMythic < MYTHIC_PITY, true);
  });

  test('the collection hides what has not been met, and shows what has', () => {
    giveCharms('ana', 1);
    const got = summon(db, 'ana', T);
    const list = collectionFor(db, 'ana');
    assert.equal(list.length, SPIRITS.length);
    const met = list.find((s) => s.key === got.spirit.key)!;
    assert.equal(met.held, 1);
    assert.ok('name' in met && 'lore' in met, 'a met spirit still has no name');
    const unmet = list.find((s) => s.held === 0)!;
    assert.ok(!('name' in unmet), 'an unmet spirit is named before it is met');
    assert.ok(unmet.rarity && unmet.court, 'an unmet spirit should still show its rarity and court');
  });

  test('the state counts the collection honestly', () => {
    giveCharms('ana', 2);
    summon(db, 'ana', T);
    const state = summonState(db, 'ana', later(1));
    assert.equal(state.total, SPIRITS.length);
    assert.equal(state.collected, heldBy(db, 'ana').size);
    assert.equal(state.charms.available, 1);
    assert.equal(state.rules.weightTotal, 10_000);
  });

  test('history returns the receipts, newest first', () => {
    giveCharms('ana', 2);
    const one = summon(db, 'ana', T);
    const two = summon(db, 'ana', later(5));
    const h = historyFor(db, 'ana');
    assert.equal(h.length, 2);
    assert.equal(h[0]!.id, two.id);
    assert.equal(h[1]!.id, one.id);
    assert.equal(h[0]!.receipt.nonce, 2);
  });
});

describe('the door with no luck in it', () => {
  test('a forge is refused without the stardust, and the message says how much is needed', () => {
    const target = SPIRITS.find((s) => s.rarity === 'common')!;
    assert.throws(() => forge(db, 'ana', target.key, T), (e: unknown) => {
      assert.ok(e instanceof NotEnoughDust);
      assert.equal(e.need, DUST_TO_FORGE.common);
      return true;
    });
  });

  test('with the stardust, a chosen spirit arrives with no roll at all', () => {
    const target = SPIRITS.find((s) => s.rarity === 'rare')!;
    dust('ana', DUST_TO_FORGE.rare);
    const got = forge(db, 'ana', target.key, T);
    assert.equal(got.spirit.key, target.key);
    assert.equal(got.receipt.nonce, 0, 'a forge consumed a roll nonce');
    assert.equal(dustFor(db, 'ana'), 0);
    assert.ok(heldBy(db, 'ana').has(target.key));
    assert.equal(verifySummon(db, got.id).checkable, false, 'a forge claims to be a verifiable roll');
  });

  test('a forge does not spend a charm, and a summon never takes stardust away', () => {
    const target = SPIRITS.find((s) => s.rarity === 'common')!;
    giveCharms('ana', 1);
    dust('ana', DUST_TO_FORGE.common);
    forge(db, 'ana', target.key, T);
    assert.equal(charmsFor(db, 'ana').available, 1, 'a forge spent a charm');

    const before = dustFor(db, 'ana');
    const got = summon(db, 'ana', later(1));
    const after = dustFor(db, 'ana');
    /*
      Not `=== before`. A summon that re-draws something already held turns
      it into stardust, so the honest invariant is that a summon never takes
      stardust AWAY - the two currencies do not cross. The first version of
      this asserted equality and passed only while the random epoch seed
      happened not to re-draw the forged spirit.
    */
    assert.ok(after >= before, 'a summon spent stardust');
    assert.equal(after - before, got.dustGained, 'the dust that moved is the dust the receipt named');
  });

  test('forging something already held is refused', () => {
    const target = SPIRITS.find((s) => s.rarity === 'common')!;
    dust('ana', DUST_TO_FORGE.common * 3);
    forge(db, 'ana', target.key, T);
    assert.throws(() => forge(db, 'ana', target.key, later(1)), AlreadyHave);
  });

  test('an unknown key is refused before anything is spent', () => {
    dust('ana', 500);
    assert.throws(() => forge(db, 'ana', 'chiangmai-elephant', T), UnknownSpirit);
    assert.equal(dustFor(db, 'ana'), 500);
  });

  test('every spirit in the roster can be forged, so nothing is behind luck alone', () => {
    for (const s of SPIRITS) {
      assert.ok(DUST_TO_FORGE[s.rarity] > 0, `${s.key} has no price`);
      assert.ok(spiritFor(s.key), `${s.key} is not resolvable by key`);
    }
  });
});

// ---------------------------------------------------------------------------

function count(table: string): number {
  return (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as unknown as { n: number }).n;
}

/**
 * Put stardust on an account without rolling for it.
 *
 * Written as a duplicate row because that is the only way dust is ever
 * created: a test that inserted a balance would be testing a column this
 * service does not have.
 */
function dust(userId: string, amount: number): void {
  const epoch = currentEpoch(db, T);
  db.prepare(
    `INSERT INTO summons (id, user_id, epoch_id, source, nonce, roll, pick, spirit_key, rarity,
       by_pity, duplicate, dust, created_at)
     VALUES (?,?,?,'forge',NULL,NULL,NULL,?,?,NULL,0,?,?)`,
  ).run(`dust-${userId}-${amount}`, userId, epoch.id, '__test_dust__', 'common', amount, T.toISOString());
}
