import { randomUUID } from 'node:crypto';
import { AREAS, isAreaKey } from '@chivago/core';
import { row, rows, type DB } from './db.ts';

export class ShopError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status = 400) { super(message); this.code = code; this.status = status; }
}

type ShopRow = {
  id: string; owner_id: string; name: string; category: string; area_key: string;
  description: string; address: string; lat: number | null; lng: number | null; phone: string;
  email: string; opening_hours: string; amenities: string; active: number;
  created_at: string; updated_at: string; rating: number | null; review_count: number;
  cover_id: string | null; guide_profile_photo_id: string | null;
  service_type: string; guide_languages: string; guide_skills: string; guide_tour_styles: string; guide_line_id: string; guide_meeting_point: string; guide_status: string;
  guide_document_id?: string | null;
};
export type ShopInput = Record<string, unknown>;
export const SHOP_CATEGORIES = ['ที่พัก', 'ร้านอาหาร', 'ร้านขายของ', 'เช่ารถ', 'เสริมสวย', 'ตัดผม', 'ไกด์นำเที่ยว', 'อื่นๆ'] as const;

const SELECT = `SELECT s.*,
  (SELECT ROUND(AVG(r.rating), 1) FROM local_shop_reviews r WHERE r.shop_id = s.id AND r.hidden_at IS NULL) AS rating,
  (SELECT COUNT(*) FROM local_shop_reviews r WHERE r.shop_id = s.id AND r.hidden_at IS NULL) AS review_count,
  (SELECT m.id FROM local_shop_media m WHERE m.shop_id = s.id AND m.kind = 'cover' ORDER BY m.created_at DESC, m.id DESC LIMIT 1) AS cover_id,
  (SELECT p.id FROM local_guide_profile_photos p WHERE p.shop_id = s.id) AS guide_profile_photo_id,
  (SELECT d.id FROM local_guide_documents d WHERE d.shop_id = s.id) AS guide_document_id
  FROM local_shops s`;

const text = (v: unknown, max: number) => typeof v === 'string' ? v.trim().slice(0, max) : '';
export const validShopPoint = (areaKey: string, lat: number, lng: number) => {
  const area = AREAS.find((a) => a.key === areaKey);
  return !!area && Number.isFinite(lat) && Number.isFinite(lng)
    && lat >= area.bbox.minLat && lat <= area.bbox.maxLat
    && lng >= area.bbox.minLng && lng <= area.bbox.maxLng;
};

function shopFrom(r: ShopRow, viewer?: string) {
  return {
    id: r.id, name: r.name, category: r.category, areaKey: r.area_key,
    description: r.description, address: r.address, lat: r.lat, lng: r.lng,
    phone: r.phone, email: r.email, openingHours: r.opening_hours,
    amenities: r.amenities.split(',').map((v) => v.trim()).filter(Boolean),
    active: !!r.active, rating: r.rating, reviewCount: r.review_count,
    coverUrl: r.cover_id ? `/shops/media/${r.cover_id}` : null,
    guideProfilePhotoUrl: r.service_type === 'guide' && r.guide_profile_photo_id ? `/shops/guide-photos/${r.guide_profile_photo_id}` : null,
    owner: viewer === r.owner_id, createdAt: r.created_at, updatedAt: r.updated_at,
    serviceType: r.service_type === 'guide' ? 'guide' : 'business',
    guideLanguages: r.guide_languages.split(',').map((v) => v.trim()).filter(Boolean),
    guideSkills: (() => { try { const v: unknown = JSON.parse(r.guide_skills); return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []; } catch { return []; } })(),
    guideTourStyles: (() => { try { const v: unknown = JSON.parse(r.guide_tour_styles); return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []; } catch { return []; } })(),
    guideLineId: r.guide_line_id,
    guideStatus: r.guide_status,
    hasGuideDocument: viewer === r.owner_id && !!r.guide_document_id,
  };
}

export function requireOperator(db: DB, uid: string) {
  const account = row<{ account_type: string }>(db.prepare('SELECT account_type FROM user_accounts WHERE id = ?').get(uid));
  if (account?.account_type !== 'operator') throw new ShopError('OPERATOR_REQUIRED', 'เฉพาะบัญชีผู้ประกอบการเท่านั้น', 403);
}

export function ownedShop(db: DB, uid: string, id: string) {
  requireOperator(db, uid);
  const shop = row<{ owner_id: string }>(db.prepare('SELECT owner_id FROM local_shops WHERE id = ?').get(id));
  if (!shop) throw new ShopError('NOT_FOUND', 'ไม่พบร้านค้า', 404);
  if (shop.owner_id !== uid) throw new ShopError('FORBIDDEN', 'จัดการได้เฉพาะร้านของตนเอง', 403);
}

export function listShops(db: DB, q: Record<string, string | undefined>, viewer?: string) {
  const owner = q.owner === 'me' ? viewer : undefined;
  if (q.owner === 'me' && !owner) return [];
  const category = text(q.category, 60).toLowerCase();
  const search = text(q.search, 80).toLowerCase();
  const minRating = q.minRating ? Number(q.minRating) : 0;
  /*
   * A guide nobody has approved is not public.
   *
   * The moderator page says "Only approved profiles are visible in the app
   * and on the map", and until this line it was not true: the list filtered
   * on `active` alone, so a `pending` or `rejected` guide was served to
   * anyone - name, area, languages, LINE ID and profile photo - and the app
   * withheld only the "Verified" badge. A person whose licence nobody has
   * looked at was being presented as a tour guide with a way to contact them.
   *
   * Only guides are gated: a business has no approval step and `guide_status`
   * is 'not_required' for them. The owner's own branch above is untouched,
   * so an operator still sees their profile while it waits.
   */
  const publicRows = `s.active = 1 AND (s.service_type <> 'guide' OR s.guide_status = 'approved')`;
  const sql = `${SELECT} WHERE ${owner ? 's.owner_id = ?' : publicRows}
    ${q.area ? 'AND s.area_key = ?' : ''}
    ${category ? 'AND lower(s.category) = ?' : ''}
    ${search ? 'AND (lower(s.name) LIKE ? OR lower(s.category) LIKE ?)' : ''}
    ORDER BY CASE s.category
      WHEN 'ที่พัก' THEN 1
      WHEN 'ร้านอาหาร' THEN 2
      WHEN 'ร้านขายของ' THEN 3
      WHEN 'เช่ารถ' THEN 4
      WHEN 'เสริมสวย' THEN 5
      WHEN 'ตัดผม' THEN 6
      WHEN 'ไกด์นำเที่ยว' THEN 7
      WHEN 'อื่นๆ' THEN 8
      ELSE 99 END,
      s.updated_at DESC, s.id DESC`;
  const args: (string | number)[] = [];
  if (owner) args.push(owner);
  if (q.area) args.push(q.area);
  if (category) args.push(category);
  if (search) args.push(`%${search}%`, `%${search}%`);
  return rows<ShopRow>(db.prepare(sql).all(...args))
    .map((r) => shopFrom(r, viewer))
    .filter((s) => (!q.openNow || q.openNow !== '1' || isOpenNow(s.openingHours)) && (s.rating ?? 0) >= minRating);
}

export function isOpenNow(hours: string, now = new Date()) {
  const match = /^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/.exec(hours);
  if (!match) return false;
  const current = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now).replace(':', ''));
  const start = Number(match[1] + match[2]);
  const end = Number(match[3] + match[4]);
  return start <= end ? current >= start && current < end : current >= start || current < end;
}

export function getShop(db: DB, id: string, viewer?: string) {
  const r = row<ShopRow>(db.prepare(`${SELECT} WHERE s.id = ?`).get(id));
  if (!r) return null;
  // Hidden from everyone but its owner: inactive, or a guide nobody has
  // approved. Same rule as the list, because a direct link is the obvious way
  // around a filtered list. Moderators read these through the console's own
  // query, which is deliberately not this one.
  const hidden = !r.active || (r.service_type === 'guide' && r.guide_status !== 'approved');
  if (hidden && r.owner_id !== viewer) return null;
  const images = rows<{ id: string; kind: string }>(db.prepare("SELECT id, kind FROM local_shop_media WHERE shop_id = ? AND kind <> 'review' ORDER BY created_at DESC").all(id));
  return { ...shopFrom(r, viewer), images: images.map((m) => ({ id: m.id, kind: m.kind, url: `/shops/media/${m.id}` })) };
}

export function saveShop(db: DB, uid: string, input: ShopInput, id?: string) {
  requireOperator(db, uid);
  if (id) ownedShop(db, uid, id);
  const name = text(input.name, 100);
  const category = text(input.category, 60);
  const serviceType = input.serviceType === 'guide' ? 'guide' : 'business';
  const address = text(input.address, 250);
  const phone = text(input.phone, 30);
  const email = text(input.email, 120);
  const guideLanguages = Array.isArray(input.guideLanguages) ? input.guideLanguages.map((v) => text(v, 30)).filter(Boolean).slice(0, 12).join(',') : '';
  const area = input.areaKey;
  const lat = serviceType === 'guide' ? null : Number(input.lat);
  const lng = serviceType === 'guide' ? null : Number(input.lng);
  if (name.length < 2 || !category) throw new ShopError('INVALID_SHOP', 'กรอกชื่อและประเภทร้านค้า');
  if ((serviceType === 'guide') !== (category === 'ไกด์นำเที่ยว')) throw new ShopError('INVALID_CATEGORY', 'ประเภทโปรไฟล์ไม่ตรงกับประเภทบริการ');
  if (!SHOP_CATEGORIES.includes(category as typeof SHOP_CATEGORIES[number]))
    throw new ShopError('INVALID_CATEGORY', 'เลือกประเภทร้านจากรายการที่กำหนด');
  if (serviceType === 'guide') {
    if (!guideLanguages) throw new ShopError('INVALID_GUIDE_PROFILE', 'กรุณาเลือกภาษาที่สื่อสารได้');
  } else if (address.length < 3) throw new ShopError('INVALID_ADDRESS', 'กรุณากรอกที่อยู่ร้านค้า');
  if (phone && !/^\+?[0-9\s-]{8,20}$/.test(phone)) throw new ShopError('INVALID_PHONE', 'รูปแบบเบอร์โทรศัพท์ไม่ถูกต้อง');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ShopError('INVALID_EMAIL', 'รูปแบบอีเมลไม่ถูกต้อง');
  if (!isAreaKey(area) || (serviceType !== 'guide' && !validShopPoint(area, lat!, lng!))) throw new ShopError('INVALID_LOCATION', 'พิกัดต้องอยู่ในพื้นที่ที่เลือก');
  const hours = text(input.openingHours, 11);
  if (serviceType === 'guide' && hours) throw new ShopError('INVALID_GUIDE_HOURS', 'โปรไฟล์ไกด์ไม่ใช้เวลาเปิด–ปิดร้าน');
  if (hours && !/^(?:[01]\d|2[0-3]):[0-5]\d-(?:[01]\d|2[0-3]):[0-5]\d$/.test(hours)) throw new ShopError('INVALID_HOURS', 'เวลาเปิดปิดต้องเป็น HH:MM-HH:MM');
  const amenities = Array.isArray(input.amenities) ? input.amenities.map((v) => text(v, 40)).filter(Boolean).slice(0, 12).join(',') : '';
  const guideSkills = Array.isArray(input.guideSkills) ? JSON.stringify([...new Set(input.guideSkills.map((v) => text(v, 80)).filter(Boolean))].slice(0, 20)) : '[]';
  const guideTourStyles = Array.isArray(input.guideTourStyles) ? JSON.stringify([...new Set(input.guideTourStyles.map((v) => text(v, 60)).filter(Boolean))].slice(0, 12)) : '[]';
  const guideLineId = serviceType === 'guide' ? text(input.guideLineId, 50) : '';
  const now = new Date().toISOString();
  const key = id ?? randomUUID();
  const previous = id ? row<{ service_type: string; guide_languages: string; guide_skills: string; guide_tour_styles: string; guide_line_id: string; guide_status: string; guide_reviewed_at: string | null; guide_reviewed_by: string | null; name: string; description: string; area_key: string; lat: number | null; lng: number | null; phone: string; email: string }>(db.prepare('SELECT service_type,guide_languages,guide_skills,guide_tour_styles,guide_line_id,guide_status,guide_reviewed_at,guide_reviewed_by,name,description,area_key,lat,lng,phone,email FROM local_shops WHERE id=?').get(id)) : null;
  const guideChanged = serviceType === 'guide' && previous?.service_type === 'guide'
    && (previous.guide_languages !== guideLanguages || previous.guide_skills !== guideSkills || previous.guide_tour_styles !== guideTourStyles || previous.guide_line_id !== guideLineId
      || previous.name !== name || previous.description !== text(input.description, 2000) || previous.area_key !== area
      || previous.lat !== lat || previous.lng !== lng || previous.phone !== phone || previous.email !== email);
  const guideStatus = serviceType !== 'guide' ? 'not_required'
    : previous?.service_type === 'guide' ? (guideChanged ? 'pending' : previous.guide_status) : 'pending';
  const reviewedAt = guideStatus === 'pending' || guideStatus === 'not_required' ? null : previous?.guide_reviewed_at ?? null;
  const reviewedBy = guideStatus === 'pending' || guideStatus === 'not_required' ? null : previous?.guide_reviewed_by ?? null;
  const values = [name, category, area, text(input.description, 2000), serviceType === 'guide' ? '' : address, lat, lng,
    phone, email, serviceType === 'guide' ? '' : hours, amenities, input.active === false ? 0 : 1, serviceType, guideLanguages, guideSkills, guideTourStyles, guideLineId, '', guideStatus, reviewedAt, reviewedBy, now];
  if (id) db.prepare(`UPDATE local_shops SET name=?,category=?,area_key=?,description=?,address=?,lat=?,lng=?,phone=?,email=?,opening_hours=?,amenities=?,active=?,service_type=?,guide_languages=?,guide_skills=?,guide_tour_styles=?,guide_line_id=?,guide_meeting_point=?,guide_status=?,guide_reviewed_at=?,guide_reviewed_by=?,updated_at=? WHERE id=?`).run(...values, id);
  else db.prepare(`INSERT INTO local_shops(id,owner_id,name,category,area_key,description,address,lat,lng,phone,email,opening_hours,amenities,active,service_type,guide_languages,guide_skills,guide_tour_styles,guide_line_id,guide_meeting_point,guide_status,guide_reviewed_at,guide_reviewed_by,updated_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(key, uid, ...values, now);
  if (id && serviceType !== 'guide' && previous?.service_type === 'guide') {
    db.prepare('DELETE FROM local_guide_documents WHERE shop_id=?').run(id);
    db.prepare('DELETE FROM local_guide_profile_photos WHERE shop_id=?').run(id);
  }
  return getShop(db, key, uid)!;
}

export function deleteShop(db: DB, uid: string, id: string) {
  ownedShop(db, uid, id);
  db.prepare('DELETE FROM local_shops WHERE id = ?').run(id);
}

export function listReviews(db: DB, shopId: string, cursor?: string, viewer?: string) {
  if (!getShop(db, shopId, viewer)) throw new ShopError('NOT_FOUND', 'ไม่พบร้านค้า', 404);
  const limit = 20;
  const results = rows<{ id: string; user_id: string; rating: number; body: string; owner_reply: string | null; created_at: string; updated_at: string; display_name: string; photo_id: string | null }>(db.prepare(`
    SELECT r.*, u.display_name,
      (SELECT id FROM local_shop_media WHERE review_id = r.id ORDER BY created_at DESC LIMIT 1) AS photo_id
    FROM local_shop_reviews r JOIN users u ON u.id = r.user_id
    WHERE r.shop_id = ? AND r.hidden_at IS NULL AND (? IS NULL OR (r.created_at || '|' || r.id) < ?)
    ORDER BY r.created_at DESC, r.id DESC LIMIT ?`).all(shopId, cursor ?? null, cursor ?? null, limit + 1));
  const page = results.slice(0, limit);
  return { reviews: page.map((r) => ({ id: r.id, rating: r.rating, body: r.body, author: r.display_name,
    mine: r.user_id === viewer, ownerReply: r.owner_reply, createdAt: r.created_at, updatedAt: r.updated_at,
    photoUrl: r.photo_id ? `/shops/media/${r.photo_id}` : null })),
    nextCursor: results.length > limit ? `${page.at(-1)!.created_at}|${page.at(-1)!.id}` : null };
}

export function ownReview(db: DB, shopId: string, uid: string) {
  if (!row(db.prepare('SELECT 1 FROM user_accounts WHERE id=?').get(uid))) return null;
  const review = row<{ id: string; rating: number; body: string; owner_reply: string | null; created_at: string; updated_at: string; display_name: string; photo_id: string | null }>(db.prepare(`
    SELECT r.*, u.display_name,
      (SELECT id FROM local_shop_media WHERE review_id=r.id ORDER BY created_at DESC LIMIT 1) AS photo_id
    FROM local_shop_reviews r JOIN users u ON u.id=r.user_id
    WHERE r.shop_id=? AND r.user_id=? AND r.hidden_at IS NULL`).get(shopId, uid));
  return review ? { id: review.id, rating: review.rating, body: review.body, author: review.display_name,
    mine: true, ownerReply: review.owner_reply, createdAt: review.created_at, updatedAt: review.updated_at,
    photoUrl: review.photo_id ? `/shops/media/${review.photo_id}` : null } : null;
}

export function saveReview(db: DB, uid: string, shopId: string, rating: unknown, body: unknown) {
  if (!row(db.prepare('SELECT 1 FROM user_accounts WHERE id=?').get(uid))) throw new ShopError('LOGIN_REQUIRED', 'เข้าสู่ระบบก่อนเขียนรีวิว', 401);
  const shop = row<{ owner_id: string; active: number; service_type: string; guide_status: string }>(db.prepare('SELECT owner_id,active,service_type,guide_status FROM local_shops WHERE id=?').get(shopId));
  if (!shop || !shop.active || (shop.service_type === 'guide' && shop.guide_status !== 'approved')) throw new ShopError('NOT_FOUND', 'ไม่พบร้านค้า', 404);
  if (shop.owner_id === uid) throw new ShopError('OWN_SHOP', 'เจ้าของร้านรีวิวร้านตัวเองไม่ได้', 403);
  if (!Number.isInteger(rating) || Number(rating) < 1 || Number(rating) > 5) throw new ShopError('INVALID_RATING', 'ให้คะแนน 1–5 ดาว');
  if (typeof body !== 'string' || body.trim().length > 2000) throw new ShopError('INVALID_REVIEW', 'ความคิดเห็นต้องเป็นข้อความไม่เกิน 2000 ตัวอักษร');
  const now = new Date().toISOString();
  const id = randomUUID();
  db.prepare(`INSERT INTO local_shop_reviews(id,shop_id,user_id,rating,body,created_at,updated_at) VALUES(?,?,?,?,?,?,?)
    ON CONFLICT(shop_id,user_id) DO UPDATE SET rating=excluded.rating,body=excluded.body,updated_at=excluded.updated_at`).run(id, shopId, uid, Number(rating), body.trim(), now, now);
  return row<{ id: string }>(db.prepare('SELECT id FROM local_shop_reviews WHERE shop_id=? AND user_id=?').get(shopId, uid))!.id;
}

export function deleteReview(db: DB, uid: string, shopId: string) {
  return db.prepare('DELETE FROM local_shop_reviews WHERE shop_id=? AND user_id=?').run(shopId, uid).changes > 0;
}

export function replyReview(db: DB, uid: string, shopId: string, reviewId: string, reply: unknown) {
  ownedShop(db, uid, shopId);
  if (typeof reply !== 'string' || !reply.trim() || reply.length > 1000) throw new ShopError('INVALID_REPLY', 'ตอบกลับไม่เกิน 1000 ตัวอักษร');
  if (!db.prepare('UPDATE local_shop_reviews SET owner_reply=?,replied_at=? WHERE id=? AND shop_id=?').run(reply.trim(), new Date().toISOString(), reviewId, shopId).changes)
    throw new ShopError('NOT_FOUND', 'ไม่พบรีวิว', 404);
}

export function reportShopReview(db: DB, uid: string, shopId: string, reviewId: string, reason: unknown) {
  if (!row(db.prepare('SELECT 1 FROM user_accounts WHERE id=?').get(uid))) throw new ShopError('LOGIN_REQUIRED', 'เข้าสู่ระบบก่อนรายงานรีวิว', 401);
  if (!row(db.prepare('SELECT 1 FROM local_shop_reviews WHERE id=? AND shop_id=? AND hidden_at IS NULL').get(reviewId, shopId))) throw new ShopError('NOT_FOUND', 'ไม่พบรีวิว', 404);
  if (typeof reason !== 'string' || reason.trim().length < 3 || reason.length > 500) throw new ShopError('INVALID_REASON', 'ระบุเหตุผลในการรายงาน');
  db.prepare('INSERT OR IGNORE INTO local_shop_review_reports(id,review_id,reporter_id,reason,created_at) VALUES(?,?,?,?,?)').run(randomUUID(), reviewId, uid, reason.trim(), new Date().toISOString());
}
