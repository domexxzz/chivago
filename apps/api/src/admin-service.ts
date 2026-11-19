import { randomUUID } from 'node:crypto';
import { POOL, POOL_VERSION, itemKey, type SpiritRarity } from '@chivago/core';
import { row, rows, transact, type DB } from './db.ts';
import { applyMovement, ensureWallet } from './wallet-service.ts';
import { invalidatePlaceList } from './place-list-cache.ts';

export class InvalidAdminAction extends Error {}

export interface AdminUser {
  id: string; displayName: string; email: string | null; phone: string | null;
  accountType: string; trip: number; green: number; exp: number; disabledAt: string | null;
}
export interface AdminPlace {
  id: string; nameEn: string; nameTh: string; layer: string; province: string | null;
  lat: number; lng: number; hiddenAt: string | null;
}
export interface AdminPost {
  id: string; body: string; author: string; createdAt: string; hiddenAt: string | null;
  likes: number; comments: number;
}

const like = (q: string): string => `%${q.trim().replace(/[\\%_]/g, '\\$&')}%`;

export function adminUsers(db: DB, query = ''): AdminUser[] {
  const q = query.trim();
  const result = rows<{
    id: string; display_name: string; email: string | null; phone: string | null;
    account_type: string | null; trip_points: number | null; green_points: number | null;
    exp: number | null; disabled_at: string | null;
  }>(db.prepare(`SELECT u.id,u.display_name,a.email,a.phone,a.account_type,
      w.trip_points,w.green_points,w.exp,s.disabled_at
    FROM users u LEFT JOIN user_accounts a ON a.id=u.id LEFT JOIN wallets w ON w.user_id=u.id
    LEFT JOIN admin_user_status s ON s.user_id=u.id
    WHERE (?='' OR u.id LIKE ? ESCAPE '\\' OR u.display_name LIKE ? ESCAPE '\\'
      OR COALESCE(a.email,'') LIKE ? ESCAPE '\\' OR COALESCE(a.phone,'') LIKE ? ESCAPE '\\')
    ORDER BY u.created_at DESC LIMIT 100`).all(q, like(q), like(q), like(q), like(q)));
  return result.map((u) => ({ id: u.id, displayName: u.display_name, email: u.email, phone: u.phone,
    accountType: u.account_type ?? 'guest', trip: u.trip_points ?? 0, green: u.green_points ?? 0,
    exp: u.exp ?? 0, disabledAt: u.disabled_at }));
}

export function editAdminUser(db: DB, actor: string, userId: string, input: {
  displayName: string; accountType: 'traveller' | 'operator'; disabled: boolean;
}, now = new Date()): void {
  if (!row(db.prepare('SELECT id FROM users WHERE id=?').get(userId))) throw new InvalidAdminAction('unknown user');
  const name = input.displayName.trim().slice(0, 120);
  if (!name) throw new InvalidAdminAction('display name is required');
  transact(db, () => {
    db.prepare('UPDATE users SET display_name=? WHERE id=?').run(name, userId);
    db.prepare(`INSERT INTO admin_user_status(user_id,disabled_at,updated_by,updated_at) VALUES (?,?,?,?)
      ON CONFLICT(user_id) DO UPDATE SET disabled_at=excluded.disabled_at,updated_by=excluded.updated_by,updated_at=excluded.updated_at`)
      .run(userId, input.disabled ? now.toISOString() : null, actor, now.toISOString());
    db.prepare('UPDATE user_accounts SET account_type=?,updated_at=? WHERE id=?')
      .run(input.accountType, now.toISOString(), userId);
    audit(db, actor, 'user.update', 'user', userId, input, now);
  });
}

export function adminPlaces(db: DB, query = ''): AdminPlace[] {
  const q = query.trim();
  const result = rows<{ id: string; name_en: string; name_th: string; layer: string; province: string | null;
    lat: number; lng: number; admin_hidden_at: string | null }>(db.prepare(`SELECT id,name_en,name_th,layer,province,lat,lng,admin_hidden_at
    FROM places WHERE (?='' OR id LIKE ? ESCAPE '\\' OR name_en LIKE ? ESCAPE '\\' OR name_th LIKE ? ESCAPE '\\')
    ORDER BY name_en LIMIT 150`).all(q, like(q), like(q), like(q)));
  return result.map((p) => ({ id: p.id, nameEn: p.name_en, nameTh: p.name_th, layer: p.layer,
    province: p.province, lat: p.lat, lng: p.lng, hiddenAt: p.admin_hidden_at }));
}

export function saveAdminPlace(db: DB, actor: string, input: {
  id: string; nameEn: string; nameTh: string; layer: string; province?: string;
  lat: number; lng: number;
}, now = new Date()): void {
  const id = input.id.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{2,79}$/.test(id)) throw new InvalidAdminAction('place id must use letters, numbers and hyphens');
  if (!input.nameEn.trim() || !input.nameTh.trim()) throw new InvalidAdminAction('both place names are required');
  if (!Number.isFinite(input.lat) || input.lat < -90 || input.lat > 90 || !Number.isFinite(input.lng) || input.lng < -180 || input.lng > 180) {
    throw new InvalidAdminAction('invalid coordinates');
  }
  const existing = row(db.prepare('SELECT id FROM places WHERE id=?').get(id));
  transact(db, () => {
    if (existing) {
      db.prepare('UPDATE places SET name_en=?,name_th=?,short=?,layer=?,province=?,lat=?,lng=? WHERE id=?')
        .run(input.nameEn.trim(), input.nameTh.trim(), input.nameEn.trim().slice(0, 40), input.layer.trim() || 'culture',
          input.province?.trim() || null, input.lat, input.lng, id);
    } else {
      db.prepare(`INSERT INTO places (id,name_en,name_th,short,layer,province,lat,lng,meta,blurb_en,blurb_th,tags,
        safety_label_en,safety_label_th,crowd_density,aqi,safety_index,walkability)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,'[]',?,?,0,0,80,70)`).run(id, input.nameEn.trim(), input.nameTh.trim(),
          input.nameEn.trim().slice(0, 40), input.layer.trim() || 'culture', input.province?.trim() || null,
          input.lat, input.lng, 'Added by ChivarGo admin', 'Details are being verified.', 'กำลังตรวจสอบรายละเอียด',
          'Check local conditions before visiting.', 'ตรวจสอบสภาพพื้นที่ก่อนเดินทาง');
    }
    audit(db, actor, existing ? 'place.update' : 'place.create', 'place', id, input, now);
  });
  invalidatePlaceList(db);
}

export function setPlaceHidden(db: DB, actor: string, placeId: string, hidden: boolean, now = new Date()): void {
  const changed = db.prepare('UPDATE places SET admin_hidden_at=? WHERE id=?').run(hidden ? now.toISOString() : null, placeId);
  if (Number(changed.changes) !== 1) throw new InvalidAdminAction('unknown place');
  audit(db, actor, hidden ? 'place.hide' : 'place.restore', 'place', placeId, {}, now);
  invalidatePlaceList(db);
}

export function adminPosts(db: DB, query = ''): AdminPost[] {
  const q = query.trim();
  return rows<{ id: string; body: string; author: string; created_at: string; hidden_at: string | null; likes: number; comments: number }>(
    db.prepare(`SELECT p.id,p.body,u.display_name AS author,p.created_at,p.hidden_at,
      (SELECT COUNT(*) FROM community_likes l WHERE l.post_id=p.id) AS likes,
      (SELECT COUNT(*) FROM community_comments c WHERE c.post_id=p.id) AS comments
      FROM community_posts p JOIN users u ON u.id=p.author_id
      WHERE (?='' OR p.body LIKE ? ESCAPE '\\' OR u.display_name LIKE ? ESCAPE '\\')
      ORDER BY p.created_at DESC LIMIT 150`).all(q, like(q), like(q)),
  ).map((p) => ({ id: p.id, body: p.body, author: p.author, createdAt: p.created_at,
    hiddenAt: p.hidden_at, likes: Number(p.likes), comments: Number(p.comments) }));
}

export function setPostHidden(db: DB, actor: string, postId: string, hidden: boolean, now = new Date()): void {
  const changed = db.prepare('UPDATE community_posts SET hidden_at=? WHERE id=?').run(hidden ? now.toISOString() : null, postId);
  if (Number(changed.changes) !== 1) throw new InvalidAdminAction('unknown post');
  audit(db, actor, hidden ? 'post.hide' : 'post.restore', 'post', postId, {}, now);
}

export const grantableItems = () => POOL.map((item) => ({
  key: itemKey(item), kind: item.kind, rarity: item.rarity,
  name: item.kind === 'spirit' ? item.spirit.name : item.costume.name,
}));

export function grantToUser(db: DB, actor: string, input: {
  userId: string; kind: 'trip' | 'green' | 'exp' | 'item'; amount?: number; itemKey?: string; note?: string;
}, now = new Date()): void {
  if (!row(db.prepare('SELECT id FROM users WHERE id=?').get(input.userId))) throw new InvalidAdminAction('unknown user');
  const note = input.note?.trim().slice(0, 300) || 'Admin grant';
  if (input.kind === 'item') {
    const item = POOL.find((candidate) => itemKey(candidate) === input.itemKey);
    if (!item) throw new InvalidAdminAction('unknown inventory item');
    transact(db, () => {
      db.prepare(`INSERT INTO admin_inventory_grants
        (id,user_id,item_key,item_kind,rarity,note,granted_by,created_at) VALUES (?,?,?,?,?,?,?,?)`)
        .run(randomUUID(), input.userId, itemKey(item), item.kind, item.rarity as SpiritRarity, note, actor, now.toISOString());
      audit(db, actor, 'inventory.grant', 'user', input.userId, { item: itemKey(item), note }, now);
    });
    return;
  }
  const amount = Math.trunc(Number(input.amount));
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) throw new InvalidAdminAction('amount must be 1-1,000,000');
  ensureWallet(db, input.userId);
  applyMovement(db, { userId: input.userId, label: note, subject: null, host: actor,
    amount: input.kind === 'exp' ? 0 : amount, currency: input.kind === 'green' ? 'green' : 'trip',
    exp: input.kind === 'exp' ? amount : 0, kind: 'adjustment', sourceRef: `admin:${actor}:${randomUUID()}` });
  audit(db, actor, `${input.kind}.grant`, 'user', input.userId, { amount, note }, now);
}

export function adminCounts(db: DB) {
  const count = (table: string, where = '') => Number((db.prepare(`SELECT COUNT(*) AS n FROM ${table} ${where}`).get() as { n: number }).n);
  return { users: count('users'), places: count('places', 'WHERE admin_hidden_at IS NULL'),
    posts: count('community_posts', 'WHERE hidden_at IS NULL'), grants: count('admin_inventory_grants') };
}

function audit(db: DB, actor: string, action: string, targetType: string, targetId: string,
  details: unknown, now: Date): void {
  db.prepare(`INSERT INTO admin_audit_log (id,admin_host_id,action,target_type,target_id,details_json,created_at)
    VALUES (?,?,?,?,?,?,?)`).run(randomUUID(), actor, action, targetType, targetId, JSON.stringify(details), now.toISOString());
}
