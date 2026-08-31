/**
 * Point movements. THE most safety-critical module in the API.
 *
 * Three invariants, enforced here and nowhere else:
 *
 *  1. EVERY balance change is paired with a ledger row, inside one transaction.
 *     A debit without its ledger row is money the user cannot account for; a
 *     ledger row without its debit is a balance nobody can reconcile.
 *
 *  2. EVERY award is idempotent, keyed on `source_ref`. Host verification
 *     arrives over the network and networks retry. Paying twice for one beach
 *     cleanup is the failure mode that ends a points economy.
 *
 *  3. SPENDING NEVER COSTS EXP. A redemption debits points and grants zero EXP,
 *     so a traveller can never be demoted by buying a coffee. The one exception
 *     is a REVERSAL, which unwinds an award that should not have happened -
 *     that takes back its EXP too, or a mistaken approval would leave behind a
 *     rank nobody earned.
 *
 * The prototype awards points on the client (`points: s.points + 150`) purely
 * so the demo runs standalone. That must never ship - a client-side award is a
 * client-side exploit.
 */

import { randomUUID } from 'node:crypto';
import { row, rows, transact, type DB } from './db.ts';
import type { Balances, Currency, LedgerEntry, Wallet } from '@chivago/core';
import { balanceOf, progressionFor } from '@chivago/core';

export class InsufficientPoints extends Error {
  balance: number;
  required: number;
  currency: Currency;
  constructor(currency: Currency, balance: number, required: number) {
    super(`insufficient ${currency} points: have ${balance}, need ${required}`);
    this.name = 'InsufficientPoints';
    this.currency = currency;
    this.balance = balance;
    this.required = required;
  }
}

/**
 * The wallets column each currency lives in.
 *
 * A fixed map, looked up by a typed key. The column name is interpolated into
 * SQL below, so it must never be able to originate from request input.
 */
const COLUMN: Record<Currency, 'trip_points' | 'green_points'> = {
  trip: 'trip_points',
  green: 'green_points',
};

/** Ensure a wallet row exists. Called on user creation. */
export function ensureWallet(db: DB, userId: string): void {
  db.prepare('INSERT OR IGNORE INTO wallets (user_id) VALUES (?)').run(userId);
}

interface WalletRow {
  trip_points: number;
  green_points: number;
  exp: number;
}

const readWallet = (db: DB, userId: string): WalletRow =>
  row<WalletRow>(
    db
      .prepare('SELECT trip_points, green_points, exp FROM wallets WHERE user_id = ?')
      .get(userId),
  ) ?? { trip_points: 0, green_points: 0, exp: 0 };

export function getBalances(db: DB, userId: string): Balances {
  const w = readWallet(db, userId);
  return { trip: w.trip_points, green: w.green_points };
}

/** Lifetime EXP. Monotonic except for reversals - see the header. */
export function getExp(db: DB, userId: string): number {
  return readWallet(db, userId).exp;
}

interface LedgerRow {
  id: string;
  label: string;
  occurred_at: string;
  host: string;
  amount: number;
  currency: string;
  exp: number;
  kind: string;
  source_ref: string;
}

const LEDGER_COLUMNS = 'id, label, occurred_at, host, amount, currency, exp, kind, source_ref';

const toLedgerEntry = (r: LedgerRow): LedgerEntry => ({
  id: r.id,
  label: r.label,
  occurredAt: r.occurred_at,
  host: r.host,
  amount: r.amount,
  currency: r.currency as Currency,
  exp: r.exp,
  kind: r.kind as LedgerEntry['kind'],
  sourceRef: r.source_ref,
});

export function getLedger(db: DB, userId: string, limit = 50): LedgerEntry[] {
  return rows<LedgerRow>(
    db
      .prepare(
        `SELECT ${LEDGER_COLUMNS}
         FROM ledger WHERE user_id = ? ORDER BY occurred_at DESC, rowid DESC LIMIT ?`,
      )
      .all(userId, limit),
  ).map(toLedgerEntry);
}

/** The full wallet payload for GET /wallet. Progression is derived from EXP. */
export function getWallet(db: DB, userId: string): Wallet {
  const w = readWallet(db, userId);
  return {
    balances: { trip: w.trip_points, green: w.green_points },
    progression: progressionFor(w.exp),
    ledger: getLedger(db, userId),
  };
}

export interface MovementInput {
  userId: string;
  label: string;
  host: string;
  /** Signed. Positive credits, negative debits. */
  amount: number;
  currency: Currency;
  kind: LedgerEntry['kind'];
  /**
   * EXP granted. Defaults to the credited amount, and to zero on a debit.
   * Pass it explicitly only to reverse an award.
   */
  exp?: number;
  /**
   * Idempotency key. Must be deterministic for the real-world event, e.g.
   * `quest:q1:user:u1` - NOT a random id, or the retry protection does nothing.
   */
  sourceRef: string;
  occurredAt?: string;
}

export interface MovementResult {
  /** False when this sourceRef was already applied. Balances are unchanged. */
  applied: boolean;
  balances: Balances;
  exp: number;
  entry: LedgerEntry | null;
}

/**
 * Apply a signed point movement, atomically and idempotently.
 *
 * Returns `applied: false` rather than throwing when the sourceRef was already
 * settled - a duplicate delivery is normal operation, not an error, and the
 * caller should respond 200 with the current balances.
 */
export function applyMovement(db: DB, input: MovementInput): MovementResult {
  const { userId, amount, currency, sourceRef } = input;
  const expDelta = input.exp ?? Math.max(0, amount);

  const existing = row<LedgerRow>(
    db.prepare(`SELECT ${LEDGER_COLUMNS} FROM ledger WHERE source_ref = ?`).get(sourceRef),
  );
  if (existing) {
    return {
      applied: false,
      balances: getBalances(db, userId),
      exp: getExp(db, userId),
      entry: toLedgerEntry(existing),
    };
  }

  return transact(db, () => {
    ensureWallet(db, userId);
    const balances = getBalances(db, userId);
    const held = balanceOf(balances, currency);

    // Checked here rather than left to the CHECK constraint, so the caller gets
    // a typed error naming the currency and the shortfall. With two balances,
    // "not enough points" is no longer an answer - the user needs to know
    // WHICH, because one of them may be full.
    if (amount < 0 && held + amount < 0) {
      throw new InsufficientPoints(currency, held, Math.abs(amount));
    }

    const occurredAt = input.occurredAt ?? new Date().toISOString();
    const id = randomUUID();

    db.prepare(
      `INSERT INTO ledger
         (id, user_id, label, occurred_at, host, amount, currency, exp, kind, source_ref)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, userId, input.label, occurredAt, input.host, amount, currency,
          expDelta, input.kind, sourceRef);

    db.prepare(
      `UPDATE wallets SET ${COLUMN[currency]} = ${COLUMN[currency]} + ?, exp = exp + ?
       WHERE user_id = ?`,
    ).run(amount, expDelta, userId);

    return {
      applied: true,
      balances:
        currency === 'green'
          ? { ...balances, green: balances.green + amount }
          : { ...balances, trip: balances.trip + amount },
      exp: getExp(db, userId),
      entry: {
        id, label: input.label, occurredAt, host: input.host,
        amount, currency, exp: expDelta, kind: input.kind, sourceRef,
      },
    };
  });
}

/**
 * Award a verified quest reward.
 *
 * The sourceRef binds the award to (quest, user) exactly once. If the host
 * verification webhook fires three times, the user is paid once.
 *
 * The currency comes from the QUEST, not from the caller's opinion: whether a
 * piece of work counts as environmental is a property of what was posted and
 * verified, not of who is settling it.
 */
export function awardQuestReward(
  db: DB,
  args: {
    userId: string; questId: string; questName: string; host: string;
    points: number; currency: Currency;
  },
): MovementResult {
  return applyMovement(db, {
    userId: args.userId,
    label: args.questName,
    host: args.host,
    amount: args.points,
    currency: args.currency,
    kind: 'quest_reward',
    sourceRef: `quest:${args.questId}:user:${args.userId}`,
  });
}

/**
 * Award a place check-in.
 *
 * Always Trip, never Green. Nobody verified this beyond the phone's own claim
 * to be standing somewhere, and self-reported presence must not reach a
 * currency that an ESG auditor is asked to trust.
 *
 * `dayKey` is the ISLAND's calendar date, so the sourceRef makes this once per
 * place per day. A device clock set to Berlin does not buy a second one.
 *
 * `occurredAt` is when the check-in HAPPENED, by the server clock. It has to
 * be carried rather than defaulted, because this row is the durable record of
 * presence that a later review reads to say when the traveller was there.
 */
export function awardCheckin(
  db: DB,
  args: {
    userId: string; placeId: string; placeName: string; points: number;
    dayKey: string; occurredAt: string;
  },
): MovementResult {
  return applyMovement(db, {
    userId: args.userId,
    label: `Checked in · ${args.placeName}`,
    // Named honestly. A self-verified row must not carry a municipality's name
    // in the column the whole ledger uses to mean "who vouched for this".
    host: 'ChivaGo · self check-in',
    amount: args.points,
    currency: 'trip',
    kind: 'checkin',
    sourceRef: `checkin:${args.placeId}:user:${args.userId}:${args.dayKey}`,
    occurredAt: args.occurredAt,
  });
}

/**
 * Spend points on an offer.
 *
 * Unlike an award, a redemption is intentionally repeatable - a user may buy
 * two coffees - so the sourceRef carries the voucher id, which is unique per
 * purchase. Retrying the same HTTP request with the same voucher id is still
 * safe.
 *
 * EXP defaults to zero on a debit, which is the whole point: spending must
 * never cost a level.
 */
export function spendOnVoucher(
  db: DB,
  args: {
    userId: string;
    voucherId: string;
    offerName: string;
    merchant: string;
    costPoints: number;
    currency: Currency;
  },
): MovementResult {
  return applyMovement(db, {
    userId: args.userId,
    label: `${args.offerName} redeemed`,
    host: args.merchant,
    amount: -Math.abs(args.costPoints),
    currency: args.currency,
    kind: 'redemption',
    sourceRef: `voucher:${args.voucherId}`,
  });
}

/**
 * Reverse a movement, e.g. a voucher the merchant could not honour, or an
 * approval a host gave by mistake.
 *
 * Never edit or delete the original row - the ledger is append-only so a
 * dispute can always be reconstructed.
 *
 * This is the ONE place EXP moves down. Reversing an award that should not have
 * happened has to take back the EXP it granted, or a mistaken approval leaves
 * behind a rank nobody earned and the ladder stops meaning anything.
 */
export function reverseMovement(
  db: DB,
  args: { userId: string; originalSourceRef: string; reason: string },
): MovementResult {
  const original = row<{ label: string; host: string; amount: number; currency: string; exp: number }>(
    db
      .prepare('SELECT label, host, amount, currency, exp FROM ledger WHERE source_ref = ?')
      .get(args.originalSourceRef),
  );
  if (!original) throw new Error(`nothing to reverse: ${args.originalSourceRef}`);

  return applyMovement(db, {
    userId: args.userId,
    label: `${original.label} — ${args.reason}`,
    host: original.host,
    amount: -original.amount,
    currency: original.currency as Currency,
    exp: -original.exp,
    kind: 'adjustment',
    sourceRef: `reversal:${args.originalSourceRef}`,
  });
}

/**
 * The pilot's opening balance.
 *
 * The prototype starts a demo user at 1,240 points so the wallet screen has
 * something to show. That figure is kept, but it now goes through the ledger
 * like every other movement instead of being written straight into the wallet.
 *
 * Two reasons. It has to be visible: a balance with no ledger row is exactly
 * the thing a user cannot account for, and "where did this come from" deserves
 * an answer even when the answer is "we gave it to you to try the app". And it
 * has to grant EXP, or a demo account reads as Level 1 while holding a
 * four-figure balance.
 *
 * Idempotent per user, so a restart never doubles it.
 */
export function grantOpeningBalance(db: DB, userId: string): void {
  const trip = Number(process.env.CHIVAGO_OPENING_TRIP ?? 320);
  const green = Number(process.env.CHIVAGO_OPENING_GREEN ?? 1240);
  const grants: [Currency, number][] = [['trip', trip], ['green', green]];
  for (const [currency, amount] of grants) {
    if (!Number.isFinite(amount) || amount <= 0) continue;
    applyMovement(db, {
      userId,
      label: 'Pilot opening balance',
      host: 'ChivaGo · pilot seed',
      amount,
      currency,
      kind: 'adjustment',
      sourceRef: `opening:${currency}:${userId}`,
    });
  }
}
