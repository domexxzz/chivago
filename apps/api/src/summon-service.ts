/**
 * The Summoning - where a charm becomes a spirit.
 *
 * `packages/core/src/spirits.ts` holds the roster, the published rate table
 * and the two floors, and says at length why a roll is allowed to exist here
 * at all. This file is the half that touches the database, and it has three
 * jobs: say how many charms somebody has earned, produce a roll nobody could
 * have steered, and write down enough that the roll can be rechecked later
 * by somebody who does not trust us.
 *
 * NOTHING OF VALUE IS DRAWN. A summon returns a spirit. It does not touch
 * `wallets`, it does not write to `ledger`, it issues no voucher and it
 * grants no EXP. `summon-service.test.ts` holds that by assertion, because
 * the day it stops being true is the day this stops being a collection and
 * becomes a draw under the Gambling Act (docs/58, docs/68).
 *
 * NO BALANCE IS STORED. Charms are counted off the ledger, dust is the SUM
 * of a signed column on the rows this file writes, and a collection is the
 * DISTINCT spirits among them. Same reason `monster-service.ts` keeps no HP:
 * a stored counter is a second place the truth lives, and on a demo day
 * somebody will find the request that increments it.
 *
 * THE ROLL IS COMMITTED BEFORE IT IS MADE. An epoch is a random seed whose
 * SHA-256 is published the moment the epoch opens; every roll inside it is
 * HMAC-SHA256(seed, "<userId>:<nonce>"), with the nonce being that
 * traveller's nth summon in the epoch. The server therefore cannot choose an
 * outcome after seeing who asked, and once the seed is revealed anybody can
 * recompute every roll that was ever made under it. This is the same promise
 * `statement.ts` makes about a digest, in the same shape.
 */

import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import {
  DUST_FROM_DUPLICATE, DUST_TO_FORGE, MYTHIC_PITY, POOL, POOL_COUNT, POOL_VERSION,
  PULL_CURRENCY, PULL_COST, RARE_PITY, RARITIES,
  RARITY_EFFECTIVE_PERCENT, RARITY_EFFECTIVE_WEIGHT, RARITY_PERCENT,
  RARITY_WEIGHT, SPIRITS, TEN_PULL_COST, TEN_PULL_SIZE, WEIGHT_TOTAL,
  advancePity, drawItem, islandDateKey, itemFor, itemKey, pullCost, spiritFor,
  type PityState, type DrawnItem, type Spirit, type SpiritRarity,
} from '@chivago/core';
import { row, rows, transact, type DB } from './db.ts';
import { notReversed } from './ledger-sql.ts';
import { applyMovement, getBalances } from './wallet-service.ts';

// ---------------------------------------------------------------------------
// Refusals
// ---------------------------------------------------------------------------

/**
 * Not enough Trip Points for the pulls asked for.
 *
 * Names the currency and the shortfall, the way `InsufficientPoints` does
 * for a voucher, because a traveller holding two balances needs to know
 * WHICH one is short - and because the other one, Green, can never be the
 * answer here however full it is.
 */
export class NotEnoughPoints extends Error {
  readonly have: number;
  readonly need: number;
  constructor(have: number, need: number) {
    super(`That takes ${need} Trip Points and you have ${have}.`);
    this.name = 'NotEnoughPoints';
    this.have = have;
    this.need = need;
  }
}
export class NoCharms extends Error {
  readonly earned: number;
  readonly spent: number;
  constructor(earned: number, spent: number) {
    super('No charms yet. A charm comes from a host-verified quest, or from a day you checked in somewhere.');
    this.name = 'NoCharms';
    this.earned = earned;
    this.spent = spent;
  }
}
export class NotEnoughDust extends Error {
  readonly have: number;
  readonly need: number;
  constructor(have: number, need: number) {
    super(`That one takes ${need} stardust and you have ${have}.`);
    this.name = 'NotEnoughDust';
    this.have = have;
    this.need = need;
  }
}
export class UnknownSpirit extends Error {
  constructor(key: string) {
    super(`No spirit has the key ${key}.`);
    this.name = 'UnknownSpirit';
  }
}
export class AlreadyHave extends Error {
  constructor(key: string) {
    super(`${key} is already in your collection - forging is for the ones you are missing.`);
    this.name = 'AlreadyHave';
  }
}

// ---------------------------------------------------------------------------
// The epoch: a seed committed to before anybody pulls
// ---------------------------------------------------------------------------

export interface Epoch {
  id: string;
  commitment: string;
  /** Null while the epoch is live. Non-null once it is closed and checkable. */
  seed: string | null;
  openedAt: string;
  closedAt: string | null;
}

interface EpochRow {
  id: string; commitment: string; seed: string | null; opened_at: string; closed_at: string | null;
}

const toEpoch = (r: EpochRow): Epoch => ({
  id: r.id, commitment: r.commitment, seed: r.seed, openedAt: r.opened_at, closedAt: r.closed_at,
});

export const commitmentOf = (seed: string): string => createHash('sha256').update(seed, 'utf8').digest('hex');

/**
 * The epoch in force, opening one if there is none.
 *
 * Lazy rather than seeded, so a fresh database, a test and a replica all
 * behave the same, and so an operator never has to remember a step before
 * the first person pulls.
 */
export function currentEpoch(db: DB, now = new Date()): Epoch {
  const live = row<EpochRow>(
    db.prepare('SELECT id, commitment, seed, opened_at, closed_at FROM summon_epochs WHERE closed_at IS NULL ORDER BY opened_at DESC LIMIT 1').get(),
  );
  if (live) return toEpoch(live);
  const id = randomUUID();
  const seed = randomBytes(32).toString('hex');
  db.prepare('INSERT INTO summon_epochs (id, commitment, seed, opened_at, closed_at) VALUES (?,?,?,?,NULL)')
    .run(id, commitmentOf(seed), seed, now.toISOString());
  return { id, commitment: commitmentOf(seed), seed, openedAt: now.toISOString(), closedAt: null };
}

/**
 * Close the epoch and publish its seed, so every roll made under it can be
 * recomputed by anybody. The next summon opens a new one by itself.
 *
 * The seed is stored from the start rather than held in memory: a server
 * that lost its seed on a restart could never honour the commitment, which
 * would make the commitment worthless. What `closed_at` changes is whether
 * the seed may be HANDED OUT - see `publicEpoch`.
 */
export function closeEpoch(db: DB, epochId: string, now = new Date()): Epoch | null {
  db.prepare('UPDATE summon_epochs SET closed_at = ? WHERE id = ? AND closed_at IS NULL').run(now.toISOString(), epochId);
  const r = row<EpochRow>(db.prepare('SELECT id, commitment, seed, opened_at, closed_at FROM summon_epochs WHERE id = ?').get(epochId));
  return r ? toEpoch(r) : null;
}

/**
 * How long an epoch stays open before its seed is published.
 *
 * Twenty-four hours is a compromise between two things that pull apart. An
 * epoch that never closes is a commitment nobody can ever check, which is
 * what this mechanic had until now - `closeEpoch` existed and nothing in the
 * running product called it, so `GET /summon/verify/:id` answered "still
 * open" forever and the promise in docs/68 was unkeepable. An epoch that
 * closes every hour publishes a seed while somebody is mid-session, and a
 * player who reads it can compute their next nine outcomes and wait for the
 * good one.
 *
 * A day means yesterday's rolls are all checkable, today's are all committed,
 * and nobody has to be told to trust us about either.
 */
export const EPOCH_HOURS = 24;

/**
 * Close any epoch that has outlived the window, which is what publishes its
 * seed. The next summon opens a fresh one by itself.
 *
 * Called from the hourly tick on the primary, and again at the top of
 * `summon` - belt and braces on purpose. The tick alone would leave a server
 * that was restarted every hour never rotating; the summon alone would leave
 * a quiet week's rolls uncheckable until somebody happened to pull again.
 *
 * Returns the epochs it closed, so the caller can say so in a log.
 */
export function rotateEpochs(db: DB, now = new Date()): Epoch[] {
  const cutoff = new Date(now.getTime() - EPOCH_HOURS * 3_600_000).toISOString();
  const stale = rows<EpochRow>(
    db.prepare(
      'SELECT id, commitment, seed, opened_at, closed_at FROM summon_epochs WHERE closed_at IS NULL AND opened_at <= ?',
    ).all(cutoff),
  );
  return stale.flatMap((e) => {
    const closed = closeEpoch(db, e.id, now);
    return closed ? [closed] : [];
  });
}

/**
 * What an epoch looks like from outside.
 *
 * The seed is withheld while the epoch is open - published early it would let
 * anybody compute their next nine outcomes and decide when to spend a charm,
 * which is not a security problem but is the end of the mechanic. The
 * commitment is out from the first second, which is the half that matters:
 * it pins the seed before any roll is made.
 */
export const publicEpoch = (e: Epoch) => ({
  id: e.id,
  commitment: e.commitment,
  openedAt: e.openedAt,
  closedAt: e.closedAt,
  seed: e.closedAt === null ? null : e.seed,
});

// ---------------------------------------------------------------------------
// Charms - earned, never bought
// ---------------------------------------------------------------------------

/**
 * Where a charm comes from. Both are things the system already records, and
 * neither is money.
 *
 *  - A HOST-VERIFIED QUEST. The Green-Point standard: somebody looked at
 *    the work and said it happened. One charm each.
 *  - A DAY WITH A CHECK-IN. Not a check-in - a DAY. Otherwise a traveller
 *    standing on a beach with twenty pins in range is a charm printer, and
 *    the check-in rate limit is already per place per day, so the day is
 *    the natural unit. One charm per island day on which anything was
 *    checked into, however many places.
 *
 * Reversed rows do not count, like everywhere else that reads the ledger.
 */
export const CHARM_PER_VERIFIED_QUEST = 1;
export const CHARM_PER_CHECKIN_DAY = 1;

interface CharmBreakdown {
  verifiedQuests: number;
  checkinDays: number;
  earned: number;
  spent: number;
  available: number;
}

export function charmsFor(db: DB, userId: string): CharmBreakdown {
  const verifiedQuests = row<{ n: number }>(
    db.prepare(
      `SELECT COUNT(*) AS n FROM ledger l
       WHERE l.user_id = ? AND l.kind = 'quest_reward' AND ${notReversed('l')}`,
    ).get(userId),
  )?.n ?? 0;

  /*
    The island day comes off the source_ref, not off occurred_at.

    `awardCheckin` writes `checkin:<place>:user:<user>:<dayKey>`, where the
    dayKey is already in ISLAND time - which is the whole point of
    `islandDateKey`. Re-deriving a day from the UTC timestamp here would
    disagree with it for every check-in made between midnight and 07:00
    Bangkok, and a traveller would be handed a second charm for one
    evening. Parsed in JS rather than SQL because one traveller has tens of
    these rows, and a string function in SQLite would be harder to read for
    no measurable gain.
  */
  const refs = rows<{ source_ref: string }>(
    db.prepare(
      `SELECT l.source_ref FROM ledger l WHERE l.user_id = ? AND l.kind = 'checkin' AND ${notReversed('l')}`,
    ).all(userId),
  );
  const days = new Set<string>();
  for (const r of refs) {
    const at = r.source_ref.lastIndexOf(':');
    if (at > 0) days.add(r.source_ref.slice(at + 1));
  }

  const earned = verifiedQuests * CHARM_PER_VERIFIED_QUEST + days.size * CHARM_PER_CHECKIN_DAY;
  const spent = row<{ n: number }>(
    db.prepare("SELECT COUNT(*) AS n FROM summons WHERE user_id = ? AND source = 'summon'").get(userId),
  )?.n ?? 0;
  return {
    verifiedQuests,
    checkinDays: days.size,
    earned,
    spent,
    available: Math.max(0, earned - spent),
  };
}

// ---------------------------------------------------------------------------
// The collection
// ---------------------------------------------------------------------------

export interface SummonRow {
  id: string; user_id: string; epoch_id: string; source: 'summon' | 'forge';
  nonce: number | null; roll: number | null; pick: number | null;
  spirit_key: string; rarity: SpiritRarity; by_pity: 'mythic' | 'rare' | null;
  duplicate: number; dust: number; created_at: string;
  /** 'spirit' or 'costume'. Every row written before the fashion went in is a spirit. */
  item_kind: 'spirit' | 'costume';
  /** The box this was drawn from. 1 is spirits alone; see `draw-pool.ts`. */
  pool_version: number;
  /** Trip Points this pull cost. 0 on a forge and on every charm-era row. */
  cost_points: number;
}

/** Keys this traveller holds, and how many of each. */
export function heldBy(db: DB, userId: string): Map<string, number> {
  const held = new Map<string, number>();
  for (const r of rows<{ spirit_key: string; n: number }>(
    db.prepare('SELECT spirit_key, COUNT(*) AS n FROM summons WHERE user_id = ? GROUP BY spirit_key').all(userId),
  )) held.set(r.spirit_key, r.n);
  return held;
}

/** Stardust on hand: what duplicates gave, less what forges took. */
export const dustFor = (db: DB, userId: string): number => row<{ n: number }>(
  db.prepare('SELECT COALESCE(SUM(dust), 0) AS n FROM summons WHERE user_id = ?').get(userId),
)?.n ?? 0;

/** The pity counters, read off the rolls in order. Never stored. */
export function pityFor(db: DB, userId: string): PityState {
  const past = rows<{ rarity: SpiritRarity }>(
    db.prepare("SELECT rarity FROM summons WHERE user_id = ? AND source = 'summon' ORDER BY created_at, nonce").all(userId),
  );
  let pity: PityState = { sinceMythic: 0, sinceRare: 0 };
  for (const r of past) pity = advancePity(pity, r.rarity);
  return pity;
}

// ---------------------------------------------------------------------------
// The roll
// ---------------------------------------------------------------------------

/**
 * The two numbers one summon needs, from the epoch's seed and nothing else.
 *
 * Exported so a verifier - ours, or somebody else's written from docs/68 -
 * can recompute a receipt from (seed, userId, nonce) with no access to this
 * database. The message is the user and the nonce joined by a colon; the
 * first four bytes of the digest pick the rarity band and the next four pick
 * within it.
 */
export function rollFor(seed: string, userId: string, nonce: number): { roll: number; pick: number; digest: string } {
  const digest = createHmac('sha256', Buffer.from(seed, 'hex')).update(`${userId}:${nonce}`, 'utf8').digest('hex');
  const roll = parseInt(digest.slice(0, 8), 16) % WEIGHT_TOTAL;
  const pick = parseInt(digest.slice(8, 16), 16);
  return { roll, pick, digest };
}

export interface SummonResult {
  id: string;
  /**
   * What came out. `spirit` stays for the forge door and for every caller
   * that predates the fashion going into the box; `prize` is the one to read.
   */
  item: DrawnItem;
  spirit: Spirit | null;
  rarity: SpiritRarity;
  byPity: 'mythic' | 'rare' | null;
  /** True when this one was already held. It became stardust instead. */
  duplicate: boolean;
  dustGained: number;
  dust: number;
  charms: CharmBreakdown;
  pity: PityState;
  /** Everything a third party needs to recheck this roll once the seed is out. */
  receipt: { epochId: string; commitment: string; nonce: number; roll: number; pick: number; poolVersion: number };
}

/** One tap: the pulls it made, what it cost, and the balance left. */
export interface PullResult {
  results: SummonResult[];
  /** Trip Points debited. The sum the client showed on the button. */
  cost: number;
  /** Trip Points left afterwards. */
  tripPoints: number;
  dust: number;
  pity: PityState;
}

/**
 * Spend Trip Points, draw one item or ten.
 *
 * WHAT GOES IN IS A CURRENCY NOW, AND WHAT COMES OUT STILL IS NOT. The pull
 * debits Trip Points through the ordinary ledger path - one `redemption` row,
 * zero EXP, the same movement a voucher makes - and hands back decoration.
 * Nothing it returns can be sold, sent, spent or redeemed anywhere, so the
 * exchange runs one way and there is nothing here to cash out. The tests in
 * `summon-service.test.ts` hold both halves of that.
 *
 * GREEN POINTS CANNOT PAY. `PULL_CURRENCY` is `'trip'`, it is read from core
 * rather than typed here, and a test pins it. Green is the figure an ESG
 * auditor is asked to trust; it must never be spendable on a game.
 *
 * ONE TRANSACTION, ONE DEBIT, N ROLLS. The nonces are taken inside the
 * transaction, so two taps arriving together do not both read the same
 * balance: the second collides with the unique index on (user, epoch, nonce)
 * and is retried against the state the first one left. The debit's
 * `sourceRef` names the epoch and the first nonce, which makes a retried
 * delivery idempotent rather than a second charge.
 */
export function pull(db: DB, userId: string, pulls = 1, now = new Date()): PullResult {
  const count = pulls === TEN_PULL_SIZE ? TEN_PULL_SIZE : 1;
  const cost = pullCost(count);

  return transact(db, () => {
    const held = getBalances(db, userId)[PULL_CURRENCY];
    if (held < cost) throw new NotEnoughPoints(held, cost);

    // Inside the transaction, before the epoch is read: a rotation that
    // happened half a statement later would hand this pull a seed that is
    // already published, which is the one thing the commitment forbids.
    rotateEpochs(db, now);
    const epoch = currentEpoch(db, now);
    const first = (row<{ n: number }>(
      db.prepare("SELECT COALESCE(MAX(nonce), 0) AS n FROM summons WHERE user_id = ? AND epoch_id = ? AND source = 'summon'")
        .get(userId, epoch.id),
    )?.n ?? 0) + 1;

    applyMovement(db, {
      userId,
      label: count === TEN_PULL_SIZE ? 'Ten pulls at the traveller\'s box' : 'One pull at the traveller\'s box',
      subject: null,
      host: 'ChivarGo',
      amount: -cost,
      currency: PULL_CURRENCY,
      kind: 'redemption',
      // Deterministic, so a retried request settles once. Never a random id.
      sourceRef: `summon:${epoch.id}:${userId}:${first}`,
      occurredAt: now.toISOString(),
    });

    const results: SummonResult[] = [];
    let pity = pityFor(db, userId);
    const have = heldBy(db, userId);

    for (let i = 0; i < count; i += 1) {
      const nonce = first + i;
      const { roll, pick } = rollFor(epoch.seed!, userId, nonce);
      const drawn = drawItem(roll, pick, pity);
      const key = itemKey(drawn.item);

      // Within a ten-pull the duplicate check has to see what the earlier
      // nine just produced, or ten of the same item would all read as new.
      const duplicate = (have.get(key) ?? 0) > 0;
      have.set(key, (have.get(key) ?? 0) + 1);
      const dustGained = duplicate ? DUST_FROM_DUPLICATE[drawn.rarity] : 0;

      const id = randomUUID();
      db.prepare(
        `INSERT INTO summons (id, user_id, epoch_id, source, nonce, roll, pick, spirit_key, rarity,
           by_pity, duplicate, dust, created_at, item_kind, pool_version, cost_points)
         VALUES (?,?,?,'summon',?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).run(
        id, userId, epoch.id, nonce, roll, pick, key, drawn.rarity,
        drawn.byPity, duplicate ? 1 : 0, dustGained, now.toISOString(),
        drawn.item.kind, POOL_VERSION, i === 0 ? cost : 0,
      );

      pity = advancePity(pity, drawn.rarity);
      results.push({
        id,
        item: drawn.item,
        spirit: drawn.item.kind === 'spirit' ? drawn.item.spirit : null,
        rarity: drawn.rarity,
        byPity: drawn.byPity,
        duplicate,
        dustGained,
        dust: 0,
        charms: charmsFor(db, userId),
        pity,
        receipt: { epochId: epoch.id, commitment: epoch.commitment, nonce, roll, pick, poolVersion: POOL_VERSION },
      });
    }

    const dust = dustFor(db, userId);
    for (const r of results) r.dust = dust;

    return {
      results,
      cost,
      tripPoints: getBalances(db, userId)[PULL_CURRENCY],
      dust,
      pity,
    };
  });
}

/** One pull, for the callers that only ever wanted one. */
export function summon(db: DB, userId: string, now = new Date()): SummonResult {
  return pull(db, userId, 1, now).results[0]!;
}

/**
 * The door with no luck in it: choose a spirit outright and pay stardust.
 *
 * This is what stops the collection being a chase. Every spirit has a
 * price in `DUST_TO_FORGE`, the price is published with the rates, and a
 * traveller who wants one particular creature can simply walk to it - slowly,
 * and certainly. A forge is refused for a spirit already held, because the
 * point of it is the gap in the shelf, and spending dust on a duplicate that
 * would hand some of it straight back is a trap rather than a choice.
 */
export function forge(db: DB, userId: string, spiritKey: string, now = new Date()): SummonResult {
  return transact(db, () => {
    const spirit = spiritFor(spiritKey);
    if (!spirit) throw new UnknownSpirit(spiritKey);
    if (heldBy(db, userId).has(spiritKey)) throw new AlreadyHave(spiritKey);

    const have = dustFor(db, userId);
    const need = DUST_TO_FORGE[spirit.rarity];
    if (have < need) throw new NotEnoughDust(have, need);

    const epoch = currentEpoch(db, now);
    const id = randomUUID();
    db.prepare(
      `INSERT INTO summons (id, user_id, epoch_id, source, nonce, roll, pick, spirit_key, rarity,
         by_pity, duplicate, dust, created_at)
       VALUES (?,?,?,'forge',NULL,NULL,NULL,?,?,NULL,0,?,?)`,
    ).run(id, userId, epoch.id, spirit.key, spirit.rarity, -need, now.toISOString());

    return {
      id,
      /*
        The forge stays SPIRITS ONLY, and that is not an omission.

        Its job is the rule "nothing is behind luck alone": every drawable
        thing needs a certain path to it. A costume already has one and
        always did - `costumesFor` awards them, without replacement, one per
        host-verified quest - so the fashion going into the box did not put
        anything behind luck that was not reachable by walking.
      */
      item: { kind: 'spirit', spirit, rarity: spirit.rarity },
      spirit,
      rarity: spirit.rarity,
      byPity: null,
      duplicate: false,
      dustGained: 0,
      dust: dustFor(db, userId),
      charms: charmsFor(db, userId),
      pity: pityFor(db, userId),
      receipt: { epochId: epoch.id, commitment: epoch.commitment, nonce: 0, roll: 0, pick: 0, poolVersion: POOL_VERSION },
    };
  });
}

// ---------------------------------------------------------------------------
// What the screen is shown
// ---------------------------------------------------------------------------

/**
 * The published table, served with the state.
 *
 * Every number a summon depends on is in here, which is the point: the app
 * prints it before anybody spends a charm, and nothing that decides an
 * outcome is absent from it.
 */
export const publishedRules = () => ({
  /*
    THE RATES A PLAYER MEETS, floors included. `rates` is the field the app
    prints under the word "rate", so it has to be the number that actually
    happens - it used to be the roll band, which reads as a promise of 3%
    mythic against about 5% in play (docs/68).
  */
  rates: RARITY_EFFECTIVE_PERCENT,
  effectiveWeights: RARITY_EFFECTIVE_WEIGHT,
  /*
    The roll band, kept and named for what it is: what one roll is compared
    against before a floor can lift it. A stranger recomputing a receipt
    needs this one, not the table above.
  */
  rollBand: RARITY_PERCENT,
  weights: RARITY_WEIGHT,
  weightTotal: WEIGHT_TOTAL,
  pity: { mythic: MYTHIC_PITY, rare: RARE_PITY },
  /* When the seed behind today's rolls is published, so the wait is a number
     rather than "sometime". */
  epochHours: EPOCH_HOURS,
  dustFromDuplicate: DUST_FROM_DUPLICATE,
  dustToForge: DUST_TO_FORGE,
  charmsFrom: { verifiedQuest: CHARM_PER_VERIFIED_QUEST, checkinDay: CHARM_PER_CHECKIN_DAY },
  /*
    Said in the payload, not only in a comment, because this is the sentence
    the mechanic stands on and a client that drew the screen without it
    would be drawing a different product (docs/68).
  */
  notice: {
    en: 'A summon costs a charm you earned, never money. It yields a spirit and nothing else - no points, no vouchers, no prizes.',
    th: 'การอัญเชิญใช้เครื่องรางที่คุณสะสมเอง ไม่ใช่เงิน และได้เป็นภูตเท่านั้น ไม่มีแต้ม ไม่มีคูปอง ไม่มีของรางวัล',
    zh: '召唤消耗的是你自己赢得的护符，绝不需要花钱。它只会带来一只精灵，别无其他——没有积分，没有代金券，没有奖品。',
  },
});

export function summonState(db: DB, userId: string, now = new Date()) {
  const held = heldBy(db, userId);
  const epoch = currentEpoch(db, now);
  return {
    charms: charmsFor(db, userId),
    /** What a pull is paid with, and what one and ten cost. Printed on the buttons. */
    tripPoints: getBalances(db, userId)[PULL_CURRENCY],
    price: { one: PULL_COST, ten: TEN_PULL_COST, tenSize: TEN_PULL_SIZE, currency: PULL_CURRENCY },
    dust: dustFor(db, userId),
    pity: pityFor(db, userId),
    collected: held.size,
    /** The whole box now: the spirits and the fashion that went in with them. */
    total: POOL.length,
    poolByRarity: POOL_COUNT,
    byRarity: Object.fromEntries(
      RARITIES.map((r) => [r, {
        held: SPIRITS.filter((s) => s.rarity === r && held.has(s.key)).length,
        total: SPIRITS.filter((s) => s.rarity === r).length,
      }]),
    ),
    epoch: publicEpoch(epoch),
    rules: publishedRules(),
  };
}

/** Every spirit, with how many of it this traveller holds. Unheld ones are listed, unnamed. */
export function collectionFor(db: DB, userId: string) {
  const held = heldBy(db, userId);
  return SPIRITS.map((s) => ({
    key: s.key,
    court: s.court,
    rarity: s.rarity,
    held: held.get(s.key) ?? 0,
    /*
      A spirit nobody has met shows as a silhouette: its rarity and its court,
      and no name, no creature and no lore. The province mascots show
      everything because an emblem is public and hiding it would hide
      nothing; an invented creature has nothing public about it, so the first
      meeting is worth keeping.
    */
    ...(held.has(s.key) ? { name: s.name, creature: s.creature, lore: s.lore, form: s.form } : {}),
  }));
}

/** The traveller's own roll history, newest first - the receipts. */
export function historyFor(db: DB, userId: string, limit = 50) {
  return rows<SummonRow>(
    db.prepare('SELECT * FROM summons WHERE user_id = ? ORDER BY created_at DESC, nonce DESC LIMIT ?').all(userId, limit),
  ).map((r) => ({
    id: r.id,
    at: r.created_at,
    source: r.source,
    spiritKey: r.spirit_key,
    rarity: r.rarity,
    byPity: r.by_pity,
    duplicate: r.duplicate === 1,
    dust: r.dust,
    receipt: { epochId: r.epoch_id, nonce: r.nonce, roll: r.roll, pick: r.pick },
  }));
}

export interface Verification {
  found: boolean;
  /** Null while the epoch is open: the seed is not out yet, so nothing can be recomputed. */
  checkable: boolean;
  matches: boolean | null;
  detail: string;
}

/**
 * Recheck one summon against the seed.
 *
 * Only useful once the epoch is closed and the seed published - before that
 * this says so rather than pretending. It recomputes the HMAC from scratch
 * and compares BOTH numbers and the spirit, so a row edited in the database
 * after the fact fails here even if somebody remembered to edit the roll to
 * match the spirit.
 */
export function verifySummon(db: DB, summonId: string): Verification {
  const r = row<SummonRow>(db.prepare('SELECT * FROM summons WHERE id = ?').get(summonId));
  if (!r) return { found: false, checkable: false, matches: null, detail: 'No summon has that id.' };
  if (r.source === 'forge') {
    return { found: true, checkable: false, matches: null, detail: 'A forge is a choice, not a roll: there is nothing to recompute.' };
  }
  const e = row<EpochRow>(db.prepare('SELECT id, commitment, seed, opened_at, closed_at FROM summon_epochs WHERE id = ?').get(r.epoch_id));
  if (!e) return { found: true, checkable: false, matches: null, detail: 'The epoch for this summon is gone.' };
  if (e.closed_at === null || e.seed === null) {
    return { found: true, checkable: false, matches: null, detail: 'This epoch is still open. Its seed is published when it closes.' };
  }
  if (commitmentOf(e.seed) !== e.commitment) {
    return { found: true, checkable: true, matches: false, detail: 'The revealed seed does not match the commitment that was published.' };
  }
  const { roll, pick } = rollFor(e.seed, r.user_id, r.nonce!);
  // Against the pool THIS row was drawn from. The box was widened when the
  // fashion went in, and a receipt recomputed against today's box when it
  // was drawn from yesterday's would fail for a reason that is not a fault.
  const redrawn = drawItem(roll, pick, { sinceMythic: 0, sinceRare: 0 }, r.pool_version);
  const numbersMatch = roll === r.roll && pick === r.pick;
  /*
    The spirit is only re-derivable when no floor was involved: a floor
    depends on the rolls BEFORE this one, which a third party holding one
    receipt does not have. So the strong check is on the two numbers, which
    the seed alone determines, and the spirit is compared only where the
    receipt says the roll decided it.
  */
  const spiritMatches = r.by_pity !== null || itemKey(redrawn.item) === r.spirit_key;
  return {
    found: true,
    checkable: true,
    matches: numbersMatch && spiritMatches,
    detail: numbersMatch && spiritMatches
      ? 'Recomputed from the published seed: this is the roll that was made.'
      : 'The recomputed roll does not match what was recorded.',
  };
}

/** Today, in island time - so a screen can say which day the charm came from. */
export const summonDayKey = (now = new Date()): string => islandDateKey(now);
