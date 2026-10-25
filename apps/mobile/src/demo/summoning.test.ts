import { strict as assert } from 'node:assert';
import { createHash, createHmac } from 'node:crypto';
import { test, describe } from 'node:test';

import {
  DUST_FROM_DUPLICATE, MYTHIC_PITY, RARE_PITY, RARITIES, RARITY_EFFECTIVE_PERCENT,
  RARITY_PERCENT, RARITY_WEIGHT, SPIRITS,
  WEIGHT_TOTAL, advancePity, drawSpirit,
} from '@chivago/core';

import { charmsFrom, commitmentOf, createSummoning, rollFor, type LedgerRow } from './summoning.ts';

/**
 * The demo's summoning is the one part of the demo that makes a claim about
 * fairness, so these hold the claim rather than the screen.
 *
 * Two things in particular. The TABLE has to be core's, because a demo that
 * printed its own copy of the odds would be a second rate table nobody
 * maintains - and the first thing to drift would be the number a judge reads
 * out loud. And the MECHANISM has to be the one the comments say it is:
 * `rollFor` is recomputed here with `node:crypto`, independently of the
 * WebCrypto path the module takes, so a demo that quietly rolled on something
 * cheaper than HMAC-SHA256 fails rather than passes quietly.
 */

/** A ledger shaped the way the capture and `credit` both write one. */
const quest = (id: string): LedgerRow => ({ kind: 'quest_reward', sourceRef: `quest:${id}:user:demo-user` });
const checkin = (place: string, day: string): LedgerRow =>
  ({ kind: 'checkin', sourceRef: `checkin:${place}:user:demo-user:${day}` });

/** What the captured wallet actually holds: four verified quests, five days. */
const CAPTURED: readonly LedgerRow[] = [
  quest('q1'), quest('q2'), quest('q4'), quest('q5'),
  checkin('chaweng', '2026-10-19'),
  checkin('lamai', '2026-10-20'), checkin('fisherman', '2026-10-20'),
  checkin('namuang', '2026-10-21'),
  checkin('chaweng', '2026-10-22'),
  checkin('fisherman', '2026-10-23'),
  { kind: 'walk', sourceRef: 'walk:chaweng:fisherman:user:demo-user:2026-10-23' },
  { kind: 'adjustment', sourceRef: 'opening:trip:demo-user' },
];

const ledgerOf = (rows: readonly LedgerRow[]) => () => rows;

describe('the charms a demo visitor has are counted, not seeded', () => {
  test('the capture earns nine: one for each verified quest and one for each DAY with a check-in', () => {
    const charms = charmsFrom(CAPTURED, 0);

    assert.equal(charms.verifiedQuests, 4);
    assert.equal(charms.checkinDays, 5, 'two check-ins on the 20th are one day, not two');
    assert.equal(charms.earned, 9);
    assert.equal(charms.available, 9);
  });

  test('the island day comes off the source ref, so an evening check-in is not worth two charms', () => {
    // The same place, the same island day, written hours apart. The real
    // service refuses to re-derive the day from a UTC timestamp for exactly
    // this case, and so does this.
    const sameDay = [checkin('lamai', '2026-10-20'), checkin('lamai', '2026-10-20')];

    assert.equal(charmsFrom(sameDay, 0).checkinDays, 1);
  });

  test('a row nobody earns a charm for is counted for nothing', () => {
    const notCharms = [
      { kind: 'walk', sourceRef: 'walk:a:b:user:demo-user:2026-10-20' },
      { kind: 'review', sourceRef: 'demo:4' },
      { kind: 'redemption', sourceRef: 'demo:5' },
    ];

    assert.equal(charmsFrom(notCharms, 0).earned, 0);
  });

  test('what has been spent is taken off, and a visitor is never shown a negative charm', () => {
    assert.equal(charmsFrom(CAPTURED, 4).available, 5);
    assert.equal(charmsFrom(CAPTURED, 99).available, 0);
  });
});

describe('the published mechanism is the one the comments claim', () => {
  test('THE COMMITMENT IS SHA-256 OF THE SEED HEX, the same string the server hashes', async () => {
    const seed = 'a'.repeat(64);

    // `commitmentOf` on the server is `createHash('sha256').update(seed, 'utf8')`.
    // Over the raw 32 bytes it would be a different digest of the same seed.
    assert.equal(await commitmentOf(seed), createHash('sha256').update(seed, 'utf8').digest('hex'));
  });

  test('THE ROLL IS HMAC-SHA256 over the seed bytes, read off the first eight digest bytes', async () => {
    const seed = '9f'.repeat(32);

    for (const nonce of [1, 2, 7, 30]) {
      const digest = createHmac('sha256', Buffer.from(seed, 'hex'))
        .update(`demo-user:${nonce}`, 'utf8').digest('hex');

      assert.deepEqual(await rollFor(seed, 'demo-user', nonce), {
        roll: parseInt(digest.slice(0, 8), 16) % WEIGHT_TOTAL,
        pick: parseInt(digest.slice(8, 16), 16),
      });
    }
  });

  test('the traveller is part of the message, so two people do not share a roll', async () => {
    const seed = '31'.repeat(32);

    assert.notDeepEqual(await rollFor(seed, 'demo-user', 1), await rollFor(seed, 'somebody-else', 1));
  });
});

describe('the demo summoning answers the screen', () => {
  test('the odds it prints are CORE\'S, not a copy of them', async () => {
    const s = await createSummoning(ledgerOf(CAPTURED)).state();

    /*
      `rates` is the EFFECTIVE table - the one with the floors in it, which is
      what the server serves and what the panel prints under "odds". This
      asserted `RARITY_PERCENT` when it was written, and that passed until
      #134 landed in the same window and moved what the field means. Holding
      both names now, so the demo cannot drift back to printing a rate no
      player meets.
    */
    assert.deepEqual(s.rules.rates, RARITY_EFFECTIVE_PERCENT);
    assert.deepEqual(s.rules.rollBand, RARITY_PERCENT);
    assert.notDeepEqual(s.rules.rates, s.rules.rollBand, 'the demo is printing the pre-floor band as its odds');
    assert.ok(s.rules.rates.mythic > s.rules.rollBand.mythic);
    assert.ok(s.rules.epochHours > 0, 'the screen prints this in the sentence about the seed');
    assert.deepEqual(s.rules.weights, RARITY_WEIGHT);
    assert.equal(s.rules.weightTotal, WEIGHT_TOTAL);
    assert.deepEqual(s.rules.pity, { mythic: MYTHIC_PITY, rare: RARE_PITY });
    assert.deepEqual(s.rules.dustFromDuplicate, DUST_FROM_DUPLICATE);
    assert.equal(s.total, SPIRITS.length);
  });

  test('every rarity is accounted for, which is what the byRarity cast rests on', async () => {
    const s = await createSummoning(ledgerOf(CAPTURED)).state();

    assert.deepEqual(Object.keys(s.byRarity).sort(), [...RARITIES].sort());
    assert.equal(
      RARITIES.reduce((n, r) => n + s.byRarity[r].total, 0), SPIRITS.length,
      'the four bands between them have to hold all twenty-four',
    );
  });

  test('the round is open, so it publishes a commitment and withholds the seed', async () => {
    const s = await createSummoning(ledgerOf(CAPTURED)).state();

    assert.match(s.epoch.commitment, /^[0-9a-f]{64}$/);
    assert.equal(s.epoch.seed, null, 'an open round hands out no seed, here or on the server');
    assert.equal(s.epoch.closedAt, null);
  });

  test('the commitment is fixed once, before any roll, and does not move when one is made', async () => {
    const summoning = createSummoning(ledgerOf(CAPTURED));
    const before = (await summoning.state()).epoch;

    const pulled = await summoning.pull();
    assert.ok(pulled.ok);
    const after = (await summoning.state()).epoch;

    assert.equal(after.commitment, before.commitment);
    assert.equal(after.id, before.id);
  });

  test('a summon returns a real spirit and spends exactly one charm', async () => {
    const summoning = createSummoning(ledgerOf(CAPTURED));

    const pulled = await summoning.pull();

    assert.ok(pulled.ok);
    assert.ok(SPIRITS.some((s) => s.key === pulled.value.spirit.key), 'the drawn key is one of the twenty-four');
    assert.equal(pulled.value.charms.spent, 1);
    assert.equal(pulled.value.charms.available, 8);
  });

  test('NOTHING OF VALUE COMES BACK: no points, no currency, no voucher, no EXP', async () => {
    const pulled = await createSummoning(ledgerOf(CAPTURED)).pull();

    assert.ok(pulled.ok);
    const keys = Object.keys(pulled.value).join(' ').toLowerCase();
    for (const forbidden of ['point', 'currency', 'voucher', 'exp', 'balance', 'amount']) {
      assert.ok(!keys.includes(forbidden), `a summon's outcome carries "${forbidden}"`);
    }
  });

  test('the recorded numbers are the numbers that produced the recorded spirit', async () => {
    const summoning = createSummoning(ledgerOf(CAPTURED));

    // Every receipt, rechecked the way `verifySummon` rechecks one: the roll
    // and the pick on the receipt, run back through core's own draw, have to
    // give the spirit that was handed over.
    for (let i = 0; i < 9; i += 1) assert.ok((await summoning.pull()).ok);

    const receipts = [...summoning.history()].reverse();
    let pity = { sinceMythic: 0, sinceRare: 0 };
    for (const r of receipts) {
      // Both numbers, on every row: a null pair is what a FORGE leaves, and
      // the demo has no forge, so a null here would mean a receipt that
      // nobody could recompute from.
      assert.ok(r.receipt.roll !== null && r.receipt.pick !== null,
        `summon ${r.receipt.nonce} kept no numbers`);

      const redrawn = drawSpirit(r.receipt.roll, r.receipt.pick, pity);
      assert.equal(redrawn.spirit.key, r.spiritKey, `summon ${r.receipt.nonce} does not recompute`);
      assert.equal(redrawn.rarity, r.rarity);
      assert.equal(redrawn.byPity, r.byPity);
      pity = advancePity(pity, redrawn.rarity);
    }
  });

  test('the nonce counts up by one and the history reads newest first', async () => {
    const summoning = createSummoning(ledgerOf(CAPTURED));
    for (let i = 0; i < 3; i += 1) await summoning.pull();

    assert.deepEqual(summoning.history().map((r) => r.receipt.nonce), [3, 2, 1]);
    assert.deepEqual(summoning.history(2).map((r) => r.receipt.nonce), [3, 2]);
  });

  test('a duplicate becomes stardust at the published rate, and a first meeting becomes none', async () => {
    const summoning = createSummoning(ledgerOf([...CAPTURED, ...Array.from({ length: 21 }, (_, i) => checkin('x', `2026-09-${String(i + 1).padStart(2, '0')}`))]));

    let dust = 0;
    for (let i = 0; i < 30; i += 1) {
      const pulled = await summoning.pull();
      assert.ok(pulled.ok);
      const { duplicate, rarity, dustGained } = pulled.value;
      assert.equal(dustGained, duplicate ? DUST_FROM_DUPLICATE[rarity] : 0);
      dust += dustGained;
      assert.equal(pulled.value.dust, dust, 'stardust on hand is the sum of what the duplicates gave');
    }
  });

  test('THE PUBLISHED FLOORS FIRE: a rare inside ten summons and a mythic inside thirty', async () => {
    const charms = Array.from({ length: 40 }, (_, i) => checkin('x', `2026-08-${String(i + 1).padStart(2, '0')}`));
    const summoning = createSummoning(ledgerOf(charms));

    const rarities: string[] = [];
    for (let i = 0; i < MYTHIC_PITY; i += 1) {
      const pulled = await summoning.pull();
      assert.ok(pulled.ok);
      rarities.push(pulled.value.rarity);
    }

    const firstRare = rarities.findIndex((r) => r === 'rare' || r === 'mythic');
    assert.ok(firstRare >= 0 && firstRare < RARE_PITY,
      `the rare floor is ${RARE_PITY} and the first rare was at ${firstRare + 1}`);
    assert.ok(rarities.includes('mythic'),
      `the mythic floor is ${MYTHIC_PITY} and ${MYTHIC_PITY} summons produced none`);
  });

  test('it runs out of charms in the server\'s own words rather than rolling on', async () => {
    const summoning = createSummoning(ledgerOf([quest('q1')]));

    assert.ok((await summoning.pull()).ok);
    const refused = await summoning.pull();

    assert.equal(refused.ok, false);
    assert.ok(!refused.ok);
    assert.equal(refused.code, 'NO_CHARMS');
    assert.match(refused.error, /host-verified quest/);
  });
});

describe('the field guide shows a collection filling up, not a finished one', () => {
  test('every spirit is listed, and an unmet one is a silhouette: rarity and court, no name', async () => {
    const guide = createSummoning(ledgerOf(CAPTURED)).collection();

    assert.equal(guide.length, SPIRITS.length);
    for (const card of guide) {
      assert.equal(card.held, 0);
      assert.ok(card.rarity && card.court, 'a silhouette still says what it is and where it is from');
      assert.ok(!('name' in card), `${card.key} is named before anybody has met it`);
      assert.ok(!('lore' in card) && !('form' in card));
    }
  });

  test('the one that was met is named, drawn, and counted in the totals', async () => {
    const summoning = createSummoning(ledgerOf(CAPTURED));
    const pulled = await summoning.pull();
    assert.ok(pulled.ok);
    const { spirit } = pulled.value;

    const card = summoning.collection().find((c) => c.key === spirit.key)!;
    const state = await summoning.state();

    assert.equal(card.held, 1);
    assert.ok('name' in card && 'creature' in card && 'lore' in card && 'form' in card);
    assert.equal(state.collected, 1);
    assert.equal(state.byRarity[spirit.rarity].held, 1);
  });
});
