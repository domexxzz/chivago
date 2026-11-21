import { randomUUID } from 'node:crypto';
import type { SeasonCollectionItem, SeasonCollectionKind, SeasonOverview, SeasonStatus } from '@chivago/core';
import { row, rows, transact, type DB } from './db.ts';

export class SeasonError extends Error {
  readonly code: string; readonly status: number;
  constructor(code: string, message: string, status = 400) { super(message); this.code = code; this.status = status; }
}
type SeasonRow = {
  id: string; status: SeasonStatus; theme: string;
  name_en: string; name_th: string; name_zh: string;
  description_en: string; description_th: string; description_zh: string;
  starts_at: string; ends_at: string;
};
type ItemRow = {
  id: string; season_id: string; kind: SeasonCollectionKind;
  name_en: string; name_th: string; name_zh: string;
  description_en: string; description_th: string; description_zh: string;
  coin_cost: number; required_progress: number; catch_up_allowed: number;
  earned_at: string | null;
};

const text = (value: unknown, label: string, max = 2_000): string => {
  const result = String(value ?? '').trim();
  if (!result) throw new SeasonError('SEASON_INVALID', `${label} is required`);
  if (result.length > max) throw new SeasonError('SEASON_INVALID', `${label} is too long`);
  return result;
};
const id = (value: unknown, label: string): string => {
  const result = String(value ?? '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{2,79}$/.test(result)) throw new SeasonError('SEASON_INVALID', `${label} must use letters, numbers and hyphens`);
  return result;
};
const integer = (value: unknown, label: string, min = 0, max = 100_000): number => {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new SeasonError('SEASON_INVALID', `${label} is invalid`);
  return n;
};

function seasonAudit(
  db: DB, actor: string, action: string, targetType: string, targetId: string,
  details: Record<string, unknown>, now = new Date(),
): void {
  db.prepare(`INSERT INTO admin_audit_log
    (id,admin_host_id,action,target_type,target_id,details_json,created_at)
    VALUES (?,?,?,?,?,?,?)`).run(
    randomUUID(), actor, action, targetType, targetId, JSON.stringify(details), now.toISOString(),
  );
}
function memoryCoins(db: DB, userId: string): number {
  const earned = row<{ n: number }>(db.prepare(`SELECT COALESCE(SUM(memory_coins),0) n FROM seasonal_progress_events
    WHERE user_id=? AND invalidated_at IS NULL`).get(userId))?.n ?? 0;
  const spent = row<{ n: number }>(db.prepare('SELECT COALESCE(SUM(coin_cost),0) n FROM seasonal_exchanges WHERE user_id=?').get(userId))?.n ?? 0;
  return Math.max(0, Number(earned) - Number(spent));
}
function overview(db: DB, userId: string, season: SeasonRow): SeasonOverview {
  const total = row<{ n: number }>(db.prepare('SELECT COUNT(*) n FROM seasonal_quest_bindings WHERE season_id=?').get(season.id))?.n ?? 0;
  const completed = row<{ n: number }>(db.prepare(`SELECT COUNT(DISTINCT quest_id) n FROM seasonal_progress_events
    WHERE season_id=? AND user_id=? AND invalidated_at IS NULL`).get(season.id, userId))?.n ?? 0;
  const items: SeasonCollectionItem[] = rows<ItemRow>(db.prepare(`SELECT i.*,
    (SELECT o.earned_at FROM seasonal_item_ownership o WHERE o.user_id=? AND o.item_id=i.id) earned_at
    FROM seasonal_items i WHERE i.season_id=? ORDER BY i.coin_cost,i.id`).all(userId, season.id)).map((item) => ({
      id: item.id, kind: item.kind,
      name: { en: item.name_en, th: item.name_th, zh: item.name_zh },
      description: { en: item.description_en, th: item.description_th, zh: item.description_zh },
      coinCost: item.coin_cost, catchUpAllowed: item.catch_up_allowed === 1,
      owned: item.earned_at !== null, earnedAt: item.earned_at,
    }));
  return {
    id: season.id, status: season.status, theme: season.theme,
    name: { en: season.name_en, th: season.name_th, zh: season.name_zh },
    description: { en: season.description_en, th: season.description_th, zh: season.description_zh },
    startsAt: season.starts_at, endsAt: season.ends_at,
    completedQuests: Number(completed), totalQuests: Number(total),
    progressPercent: total === 0 ? 0 : Math.min(100, Math.round((Number(completed) / Number(total)) * 100)),
    memoryCoins: memoryCoins(db, userId), items,
  };
}
export function currentSeason(db: DB, userId: string, now = new Date()): SeasonOverview | null {
  const iso = now.toISOString();
  const season = row<SeasonRow>(db.prepare(`SELECT * FROM seasonal_events
    WHERE status IN ('active','scheduled') AND ends_at>? ORDER BY CASE WHEN status='active' THEN 0 ELSE 1 END,starts_at LIMIT 1`).get(iso));
  return season ? overview(db, userId, season) : null;
}
export function seasonById(db: DB, userId: string, seasonId: string): SeasonOverview {
  const season = row<SeasonRow>(db.prepare("SELECT * FROM seasonal_events WHERE id=? AND status!='draft'").get(seasonId));
  if (!season) throw new SeasonError('SEASON_NOT_FOUND', 'Season not found', 404);
  return overview(db, userId, season);
}

export function seasonHistory(db: DB, userId: string): SeasonOverview[] {
  return rows<SeasonRow>(db.prepare("SELECT * FROM seasonal_events WHERE status IN ('ended','archived') ORDER BY ends_at DESC LIMIT 50").all())
    .map((season) => overview(db, userId, season));
}

export function listSeasonsForAdmin(db: DB): Array<SeasonRow & { quest_count: number; item_count: number }> {
  return rows<SeasonRow & { quest_count: number; item_count: number }>(db.prepare(`SELECT s.*,
    (SELECT COUNT(*) FROM seasonal_quest_bindings b WHERE b.season_id=s.id) quest_count,
    (SELECT COUNT(*) FROM seasonal_items i WHERE i.season_id=s.id) item_count
    FROM seasonal_events s ORDER BY s.starts_at DESC`).all());
}

/** Called only after a server-owned Travel Event is durably inserted. */
export function applyTravelEventToSeasons(db: DB, event: {
  id: string; userId: string; type: string; questId: string | null; occurredAt: string;
}): void {
  if (!event.questId || !['QUEST_COMPLETED', 'PARTY_QUEST_COMPLETED', 'SHOP_ACTIVITY_VERIFIED'].includes(event.type)) return;
  const bindings = rows<{ season_id: string; memory_coin_reward: number }>(db.prepare(`SELECT b.season_id,b.memory_coin_reward
    FROM seasonal_quest_bindings b JOIN seasonal_events s ON s.id=b.season_id
    WHERE b.quest_id=? AND s.status IN ('active','ended') AND ?>=s.starts_at AND ?<=s.ends_at`).all(event.questId, event.occurredAt, event.occurredAt));
  for (const binding of bindings) {
    const inserted = db.prepare(`INSERT OR IGNORE INTO seasonal_progress_events
      (season_id,user_id,travel_event_id,quest_id,memory_coins,earned_at) VALUES (?,?,?,?,?,?)`)
      .run(binding.season_id, event.userId, event.id, event.questId, binding.memory_coin_reward, event.occurredAt);
    if (Number(inserted.changes ?? 0) !== 1) continue;
    const count = row<{ n: number }>(db.prepare(`SELECT COUNT(DISTINCT quest_id) n FROM seasonal_progress_events
      WHERE season_id=? AND user_id=? AND invalidated_at IS NULL`).get(binding.season_id, event.userId))?.n ?? 0;
    const eligible = rows<{ id: string }>(db.prepare(`SELECT id FROM seasonal_items WHERE season_id=? AND required_progress<=?`).all(binding.season_id, count));
    for (const item of eligible) db.prepare(`INSERT OR IGNORE INTO seasonal_item_ownership
      (user_id,item_id,source_kind,source_ref,earned_at) VALUES (?,?,'season_reward',?,?)`)
      .run(event.userId, item.id, `season-progress:${binding.season_id}:${event.userId}:item:${item.id}`, event.occurredAt);
  }
}

export function invalidateSeasonProgressForTravelEvent(db: DB, travelEventId: string, now = new Date()): void {
  const affected = rows<{ season_id: string; user_id: string }>(db.prepare(
    `SELECT DISTINCT season_id,user_id FROM seasonal_progress_events
     WHERE travel_event_id=? AND invalidated_at IS NULL`,
  ).all(travelEventId));
  db.prepare('UPDATE seasonal_progress_events SET invalidated_at=? WHERE travel_event_id=? AND invalidated_at IS NULL')
    .run(now.toISOString(), travelEventId);
  for (const target of affected) {
    db.prepare(`DELETE FROM seasonal_item_ownership
      WHERE user_id=? AND source_kind='season_reward'
        AND item_id IN (SELECT id FROM seasonal_items WHERE season_id=?)`)
      .run(target.user_id, target.season_id);
    const progress = row<{ n: number; earned_at: string | null }>(db.prepare(
      `SELECT COUNT(DISTINCT quest_id) n,MIN(earned_at) earned_at FROM seasonal_progress_events
       WHERE season_id=? AND user_id=? AND invalidated_at IS NULL`,
    ).get(target.season_id, target.user_id)) ?? { n: 0, earned_at: null };
    if (progress.n < 1 || !progress.earned_at) continue;
    const eligible = rows<{ id: string }>(db.prepare(
      'SELECT id FROM seasonal_items WHERE season_id=? AND required_progress<=?',
    ).all(target.season_id, progress.n));
    for (const item of eligible) db.prepare(`INSERT OR IGNORE INTO seasonal_item_ownership
      (user_id,item_id,source_kind,source_ref,earned_at) VALUES (?,?,'season_reward',?,?)`)
      .run(target.user_id, item.id, `season-progress:${target.season_id}:${target.user_id}:item:${item.id}`, progress.earned_at);
  }
}

export function exchangeSeasonItem(db: DB, userId: string, itemId: string, clientRequestId: unknown, now = new Date()): SeasonOverview {
  const requestId = text(clientRequestId, 'client request id', 120);
  return transact(db, () => {
    const existing = row<{ season_id: string }>(db.prepare(`SELECT i.season_id FROM seasonal_exchanges e JOIN seasonal_items i ON i.id=e.item_id
      WHERE e.user_id=? AND e.client_request_id=?`).get(userId, requestId));
    if (existing) return seasonById(db, userId, existing.season_id);
    const item = row<ItemRow & { status: SeasonStatus }>(db.prepare(`SELECT i.*,s.status FROM seasonal_items i JOIN seasonal_events s ON s.id=i.season_id WHERE i.id=?`).get(itemId));
    if (!item) throw new SeasonError('ITEM_NOT_FOUND', 'Collection item not found', 404);
    if (!item.catch_up_allowed || !['ended', 'archived'].includes(item.status)) throw new SeasonError('CATCH_UP_UNAVAILABLE', 'This item is not available for catch-up exchange', 409);
    if (row(db.prepare('SELECT item_id FROM seasonal_item_ownership WHERE user_id=? AND item_id=?').get(userId, itemId))) {
      throw new SeasonError('ITEM_ALREADY_OWNED', 'This item is already in your collection', 409);
    }
    if (memoryCoins(db, userId) < item.coin_cost) throw new SeasonError('MEMORY_COINS_INSUFFICIENT', 'Not enough Memory Coins', 409);
    const exchangeId = randomUUID();
    db.prepare(`INSERT INTO seasonal_exchanges (id,user_id,item_id,coin_cost,client_request_id,exchanged_at) VALUES (?,?,?,?,?,?)`)
      .run(exchangeId, userId, itemId, item.coin_cost, requestId, now.toISOString());
    db.prepare(`INSERT INTO seasonal_item_ownership (user_id,item_id,source_kind,source_ref,earned_at)
      VALUES (?,?,'catch_up_exchange',?,?)`).run(userId, itemId, `season-exchange:${exchangeId}`, now.toISOString());
    return seasonById(db, userId, item.season_id);
  });
}

export function createSeason(db: DB, actor: string, input: Record<string, unknown>, now = new Date()): void {
  const seasonId = id(input.id, 'season id');
  const startsAt = new Date(text(input.startsAt, 'start date'));
  const endsAt = new Date(text(input.endsAt, 'end date'));
  if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime()) || endsAt <= startsAt) throw new SeasonError('SEASON_INVALID', 'Season dates are invalid');
  db.prepare(`INSERT INTO seasonal_events
    (id,status,theme,name_en,name_th,name_zh,description_en,description_th,description_zh,starts_at,ends_at,created_by,created_at,updated_at)
    VALUES (?,'draft',?,?,?,?,?,?,?,?,?,?,?,?)`).run(seasonId, text(input.theme, 'theme', 120),
    text(input.nameEn, 'English name', 160), text(input.nameTh, 'Thai name', 160), text(input.nameZh, 'Chinese name', 160),
    text(input.descriptionEn, 'English description'), text(input.descriptionTh, 'Thai description'), text(input.descriptionZh, 'Chinese description'),
    startsAt.toISOString(), endsAt.toISOString(), actor, now.toISOString(), now.toISOString());
  seasonAudit(db, actor, 'season.create', 'season', seasonId, { status: 'draft' }, now);
}

export function bindSeasonQuest(db: DB, actor: string, seasonId: string, questId: string, coinReward: unknown, now = new Date()): void {
  if (!row(db.prepare('SELECT id FROM seasonal_events WHERE id=?').get(seasonId))) throw new SeasonError('SEASON_NOT_FOUND', 'Season not found', 404);
  if (!row(db.prepare('SELECT id FROM quests WHERE id=?').get(questId))) throw new SeasonError('QUEST_NOT_FOUND', 'Quest not found', 404);
  db.prepare(`INSERT INTO seasonal_quest_bindings(season_id,quest_id,memory_coin_reward) VALUES (?,?,?)
    ON CONFLICT(season_id,quest_id) DO UPDATE SET memory_coin_reward=excluded.memory_coin_reward`)
    .run(seasonId, questId, integer(coinReward, 'coin reward'));
  seasonAudit(db, actor, 'season.quest.bind', 'season', seasonId, { questId }, now);
}

export function addSeasonItem(db: DB, actor: string, seasonId: string, input: Record<string, unknown>, now = new Date()): void {
  const kind = String(input.kind ?? '');
  if (!['stamp', 'pet_costume', 'mascot_costume', 'memory', 'achievement', 'limited_item'].includes(kind)) throw new SeasonError('SEASON_INVALID', 'Invalid collection item kind');
  const itemId = id(input.id, 'item id');
  db.prepare(`INSERT INTO seasonal_items
    (id,season_id,kind,name_en,name_th,name_zh,description_en,description_th,description_zh,coin_cost,required_progress,catch_up_allowed,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(itemId, seasonId, kind,
    text(input.nameEn, 'English name', 160), text(input.nameTh, 'Thai name', 160), text(input.nameZh, 'Chinese name', 160),
    text(input.descriptionEn, 'English description'), text(input.descriptionTh, 'Thai description'), text(input.descriptionZh, 'Chinese description'),
    integer(input.coinCost ?? 0, 'coin cost'), integer(input.requiredProgress ?? 1, 'required progress', 1), String(input.catchUpAllowed ?? '') === '1' ? 1 : 0, now.toISOString());
  seasonAudit(db, actor, 'season.item.add', 'season_item', itemId, { seasonId, kind }, now);
}

export function setSeasonStatus(db: DB, actor: string, seasonId: string, status: SeasonStatus, now = new Date()): void {
  const season = row<SeasonRow>(db.prepare('SELECT * FROM seasonal_events WHERE id=?').get(seasonId));
  if (!season) throw new SeasonError('SEASON_NOT_FOUND', 'Season not found', 404);
  if (!['draft', 'scheduled', 'active', 'ended', 'archived'].includes(status)) throw new SeasonError('SEASON_INVALID', 'Invalid status');
  if (['scheduled', 'active'].includes(status)) {
    const quests = row<{ n: number }>(db.prepare('SELECT COUNT(*) n FROM seasonal_quest_bindings WHERE season_id=?').get(seasonId))?.n ?? 0;
    const items = row<{ n: number }>(db.prepare('SELECT COUNT(*) n FROM seasonal_items WHERE season_id=?').get(seasonId))?.n ?? 0;
    if (!quests || !items) throw new SeasonError('SEASON_INCOMPLETE', 'Season needs at least one existing Quest and collection item before activation', 409);
  }
  db.prepare('UPDATE seasonal_events SET status=?,updated_at=? WHERE id=?').run(status, now.toISOString(), seasonId);
  seasonAudit(db, actor, 'season.status', 'season', seasonId, { from: season.status, to: status }, now);
}
