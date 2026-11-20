/**
 * Rewards a shop on the island offers for Trip Points, and the counter where
 * the shop marks one used.
 *
 * A reward is an ordinary row in `offers` with `shop_id` set, so the market,
 * the redeem route, the voucher, the ledger debit and the backpack all work on
 * it unchanged. What this file adds is ownership: who may put a reward on a
 * shop, and who may say a voucher for it was handed over.
 *
 * TRIP POINTS ONLY. Green Points are the figure an ESG auditor is asked to
 * trust (draw-pool.ts says the same about the box), and a shop setting its
 * own Green price would be a shop deciding what host-verified work is worth.
 *
 * THE COUNTER SEES THE VOUCHER, NOT THE PERSON. The preview returns what the
 * code is for, its value and its state. It never carries the traveller's id,
 * name, email or phone: the shop needs to know whether to hand over a coffee,
 * not who drank it - the same rule `local-business-stats.test.ts` holds for
 * views.
 *
 * NO CHANCE ANYWHERE. A deed earns the points, the points buy a named thing at
 * a named price. That is why a shop's coupons live here and not in the box
 * (docs/68, "Judge-proof").
 */

import { randomUUID } from 'node:crypto';
import { row, rows, transact, type DB } from './db.ts';
import { ShopError, ownedShop } from './local-business-service.ts';

/** The published bounds on a reward a shop sets. */
export const SHOP_REWARD_MIN_POINTS = 50;
export const SHOP_REWARD_MAX_POINTS = 5_000;
export const SHOP_REWARD_MAX_THB = 5_000;
export const SHOP_REWARD_NAME_MAX = 80;
/** Rewards per shop. Enough for a menu of treats; not a catalogue to scrape. */
export const SHOP_REWARD_LIMIT = 10;

export interface ShopReward {
  id: string;
  shopId: string;
  name: string;
  costPoints: number;
  valueTHB: number | null;
  currency: 'trip';
  available: boolean;
}

interface RewardRow {
  id: string; shop_id: string; name: string; cost_points: number; value_thb: number | null; available: number;
}

const rewardFrom = (r: RewardRow): ShopReward => ({
  id: r.id, shopId: r.shop_id, name: r.name, costPoints: r.cost_points,
  valueTHB: r.value_thb ?? null, currency: 'trip', available: r.available === 1,
});

const isOwner = (db: DB, uid: string | undefined, shopId: string): boolean =>
  !!uid && row<{ owner_id: string }>(db.prepare('SELECT owner_id FROM local_shops WHERE id = ?').get(shopId))?.owner_id === uid;

/** The owner sees every reward; anybody else sees what can be redeemed today. */
export function listShopRewards(db: DB, viewer: string | undefined, shopId: string): ShopReward[] {
  const owner = isOwner(db, viewer, shopId);
  const sql = owner
    ? 'SELECT o.* FROM offers o WHERE o.shop_id = ? ORDER BY o.cost_points, o.id'
    : `SELECT o.* FROM offers o JOIN local_shops s ON s.id = o.shop_id
       WHERE o.shop_id = ? AND o.available = 1 AND s.active = 1 ORDER BY o.cost_points, o.id`;
  return rows<RewardRow>(db.prepare(sql).all(shopId)).map(rewardFrom);
}

function invalid(message: string): never {
  throw new ShopError('INVALID_REWARD', message, 400);
}

function parseReward(input: Record<string, unknown>): { name: string; costPoints: number; valueTHB: number | null; available: boolean } {
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (name.length < 2 || name.length > SHOP_REWARD_NAME_MAX) invalid(`ชื่อของรางวัลต้องยาว 2-${SHOP_REWARD_NAME_MAX} ตัวอักษร`);
  const costPoints = Number(input.costPoints);
  if (!Number.isInteger(costPoints) || costPoints < SHOP_REWARD_MIN_POINTS || costPoints > SHOP_REWARD_MAX_POINTS) {
    invalid(`ราคาแต้มต้องเป็นจำนวนเต็ม ${SHOP_REWARD_MIN_POINTS}-${SHOP_REWARD_MAX_POINTS} แต้มทริป`);
  }
  const rawValue = input.valueTHB;
  let valueTHB: number | null = null;
  if (rawValue !== undefined && rawValue !== null && rawValue !== '') {
    valueTHB = Number(rawValue);
    if (!Number.isInteger(valueTHB) || valueTHB < 0 || valueTHB > SHOP_REWARD_MAX_THB) invalid(`มูลค่าต้องเป็นจำนวนเต็ม 0-${SHOP_REWARD_MAX_THB} บาท`);
  }
  return { name, costPoints, valueTHB, available: input.available !== false };
}

/** Create a reward on a shop the caller owns, or edit one already on it. */
export function saveShopReward(
  db: DB, uid: string, shopId: string, input: Record<string, unknown>, rewardId?: string,
): ShopReward {
  ownedShop(db, uid, shopId);
  const parsed = parseReward(input);
  return transact(db, () => {
    const shop = row<{ name: string; category: string }>(db.prepare('SELECT name, category FROM local_shops WHERE id = ?').get(shopId))!;
    if (rewardId) {
      const changed = db.prepare(
        'UPDATE offers SET name = ?, cost_points = ?, value_thb = ?, available = ?, merchant = ?, merchant_short = ? WHERE id = ? AND shop_id = ?',
      ).run(parsed.name, parsed.costPoints, parsed.valueTHB, parsed.available ? 1 : 0, shop.name, shop.name.slice(0, 24), rewardId, shopId).changes;
      if (!changed) throw new ShopError('NOT_FOUND', 'ไม่พบของรางวัลนี้ในร้าน', 404);
    } else {
      const held = row<{ n: number }>(db.prepare('SELECT COUNT(*) AS n FROM offers WHERE shop_id = ?').get(shopId))?.n ?? 0;
      if (held >= SHOP_REWARD_LIMIT) throw new ShopError('REWARD_LIMIT', `ร้านหนึ่งมีของรางวัลได้ไม่เกิน ${SHOP_REWARD_LIMIT} รายการ`, 409);
      rewardId = `shop-reward-${randomUUID()}`;
      db.prepare(
        `INSERT INTO offers (id, category, name, merchant, merchant_short, cost_points, currency, available, value_thb, shop_id, example)
         VALUES (?,?,?,?,?,?,'trip',?,?,?,0)`,
      ).run(rewardId, 'local', parsed.name, shop.name, shop.name.slice(0, 24), parsed.costPoints,
        parsed.available ? 1 : 0, parsed.valueTHB, shopId);
    }
    return rewardFrom(row<RewardRow>(db.prepare('SELECT * FROM offers WHERE id = ?').get(rewardId))!);
  });
}

/**
 * What a code typed or scanned at the counter becomes.
 *
 * Upper-cased and trimmed, so a code read out loud and typed in lower case
 * still matches. Anything that is not a voucher's character set is dropped,
 * which also strips the stray whitespace a QR reader can append.
 */
export const normaliseVoucherCode = (raw: string): string => raw.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');

export interface CounterVoucher {
  code: string;
  rewardName: string;
  valueTHB: number | null;
  costPoints: number;
  status: 'active' | 'redeemed' | 'expired' | 'cancelled';
  issuedAt: string;
  expiresAt: string;
  redeemedAt: string | null;
}

interface CounterRow {
  id: string; code: string; name: string; value_thb: number | null; cost_points: number;
  status: string; issued_at: string; expires_at: string; redeemed_at: string | null;
}

/** A voucher for one of this shop's rewards, or a 404 - never another shop's. */
function counterRow(db: DB, uid: string, shopId: string, rawCode: string): CounterRow {
  ownedShop(db, uid, shopId);
  const found = row<CounterRow>(db.prepare(
    `SELECT v.id, v.code, o.name, v.value_thb, v.cost_points, v.status, v.issued_at, v.expires_at, v.redeemed_at
       FROM vouchers v JOIN offers o ON o.id = v.offer_id
      WHERE v.code = ? AND o.shop_id = ?`,
  ).get(normaliseVoucherCode(rawCode), shopId));
  if (!found) throw new ShopError('NOT_FOUND', 'ไม่พบคูปองนี้ในร้านของคุณ', 404);
  return found;
}

const counterFrom = (r: CounterRow, now: Date): CounterVoucher => ({
  code: r.code, rewardName: r.name, valueTHB: r.value_thb ?? null, costPoints: r.cost_points,
  status: r.status === 'active' && new Date(r.expires_at) < now ? 'expired' : r.status as CounterVoucher['status'],
  issuedAt: r.issued_at, expiresAt: r.expires_at, redeemedAt: r.redeemed_at,
});

/** The counter's first look: what this code is for and whether it can still be used. */
export function previewShopVoucher(db: DB, uid: string, shopId: string, code: string, now = new Date()): CounterVoucher {
  return counterFrom(counterRow(db, uid, shopId, code), now);
}

/**
 * Hand it over. Idempotent - scanning twice answers `alreadyRedeemed` rather
 * than failing - and conditional, so two staff tapping at once mark it once.
 */
export function redeemShopVoucher(
  db: DB, uid: string, shopId: string, code: string, now = new Date(),
): CounterVoucher & { alreadyRedeemed: boolean } {
  // No transaction: the expiry has to be written down even though the call
  // then refuses, and the conditional UPDATE is what makes two taps mark once.
  const found = counterRow(db, uid, shopId, code);
  if (found.status === 'redeemed') return { ...counterFrom(found, now), alreadyRedeemed: true };
  if (found.status !== 'active') throw new ShopError('UNAVAILABLE', 'คูปองนี้ใช้ไม่ได้แล้ว', 409);
  if (new Date(found.expires_at) < now) {
    db.prepare("UPDATE vouchers SET status = 'expired' WHERE id = ? AND status = 'active'").run(found.id);
    throw new ShopError('EXPIRED', 'คูปองนี้หมดอายุแล้ว', 410);
  }
  const at = now.toISOString();
  const changed = db.prepare("UPDATE vouchers SET status = 'redeemed', redeemed_at = ? WHERE id = ? AND status = 'active'")
    .run(at, found.id).changes;
  if (!changed) return { ...counterFrom(counterRow(db, uid, shopId, code), now), alreadyRedeemed: true };
  return { ...counterFrom({ ...found, status: 'redeemed', redeemed_at: at }, now), alreadyRedeemed: false };
}
