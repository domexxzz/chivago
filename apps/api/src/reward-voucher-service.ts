import { randomUUID } from 'node:crypto';
import type { Voucher } from '@chivago/core';
import { row, type DB } from './db.ts';

type ConfiguredReward = { offer_id: string; expires_days: number };
type OfferRow = { id: string; merchant: string; cost_points: number; value_thb: number | null; available: number };

function issue(db: DB, userId: string, config: ConfiguredReward, sourceKind: 'quest', sourceRef: string, now: Date): Voucher | null {
  const prior = row<Record<string, unknown>>(db.prepare(
    'SELECT * FROM vouchers WHERE user_id=? AND source_kind=? AND source_ref=?',
  ).get(userId, sourceKind, sourceRef));
  if (prior) return voucherOf(prior);
  const offer = row<OfferRow>(db.prepare('SELECT id,merchant,cost_points,value_thb,available FROM offers WHERE id=?').get(config.offer_id));
  // A configured reward never silently substitutes another merchant offer.
  if (!offer || !offer.available) return null;
  const id = randomUUID(); const issuedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + config.expires_days * 86_400_000).toISOString();
  const code = `CG-R-${id.replaceAll('-', '').slice(0, 12).toUpperCase()}`;
  db.prepare(`INSERT INTO vouchers(id,offer_id,user_id,merchant,code,cost_points,value_thb,issued_at,expires_at,status,source_kind,source_ref)
    VALUES(?,?,?,?,?,0,?,?,?,'active',?,?)`)
    .run(id, offer.id, userId, offer.merchant, code, offer.value_thb, issuedAt, expiresAt, sourceKind, sourceRef);
  return { id, offerId: offer.id, userId, merchant: offer.merchant, code, costPoints: 0, valueTHB: offer.value_thb, issuedAt, expiresAt, redeemedAt: null, status: 'active', sourceKind, sourceRef };
}

function voucherOf(raw: Record<string, unknown>): Voucher {
  return { id: String(raw.id), offerId: String(raw.offer_id), userId: String(raw.user_id), merchant: String(raw.merchant), code: String(raw.code), costPoints: Number(raw.cost_points), valueTHB: raw.value_thb == null ? null : Number(raw.value_thb), issuedAt: String(raw.issued_at), expiresAt: String(raw.expires_at), redeemedAt: raw.redeemed_at == null ? null : String(raw.redeemed_at), status: String(raw.status) as Voucher['status'], sourceKind: String(raw.source_kind) as Voucher['sourceKind'], sourceRef: raw.source_ref == null ? null : String(raw.source_ref) };
}

export function issueQuestCoupon(db: DB, userId: string, questId: string, now = new Date()): Voucher | null {
  const config = row<ConfiguredReward>(db.prepare('SELECT offer_id,expires_days FROM quest_coupon_rewards WHERE quest_id=? AND active=1').get(questId));
  return config ? issue(db, userId, config, 'quest', `quest:${questId}`, now) : null;
}

