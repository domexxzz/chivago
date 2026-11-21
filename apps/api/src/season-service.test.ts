import { strict as assert } from 'node:assert';
import { beforeEach, describe, test } from 'node:test';
import { openTestDb, type DB } from './db-node.ts';
import { invalidateTravelEventsForLedgerSource, recordTravelEvent } from './travel-event-service.ts';
import {
  addSeasonItem, bindSeasonQuest, createSeason, exchangeSeasonItem, seasonById, setSeasonStatus,
} from './season-service.ts';

let db: DB;
const at = new Date('2026-11-21T12:00:00.000Z');
const labels = {
  nameEn: 'Island Lights', nameTh: 'แสงสีชัง', nameZh: '锡昌之光',
  descriptionEn: 'Travel season.', descriptionTh: 'ฤดูกาลเดินทาง', descriptionZh: '旅行季。',
};

beforeEach(() => {
  db = openTestDb();
  db.prepare("INSERT INTO hosts(id,name,type,role) VALUES ('admin','Admin','community','admin')").run();
  db.prepare("INSERT INTO users(id,display_name,created_at) VALUES ('user','User',?)").run(at.toISOString());
  db.prepare(`INSERT INTO quests(id,code,name_en,name_th,where_label,duration,reward_points,host_id,kind,lat,lng,geofence_radius_m)
    VALUES ('quest','S-01','Season Quest','เควสฤดูกาล','Island','30 min',10,'admin','today',13,100,100)`).run();
});
function season(status: 'active' | 'ended', requiredProgress = 1): void {
  createSeason(db, 'admin', {
    id: 'season-one', theme: 'tropical-lights', ...labels,
    startsAt: '2026-11-01T00:00:00.000Z', endsAt: '2026-11-30T23:59:59.000Z',
  }, at);
  bindSeasonQuest(db, 'admin', 'season-one', 'quest', 50);
  addSeasonItem(db, 'admin', 'season-one', {
    id: 'light-stamp', kind: 'stamp', ...labels, coinCost: 40,
    requiredProgress, catchUpAllowed: '1',
  }, at);
  setSeasonStatus(db, 'admin', 'season-one', status, at);
}

describe('season progress and collection', () => {
  test('a verified Travel Event advances progress, coins and collection once', () => {
    season('active');
    const first = recordTravelEvent(db, {
      userId: 'user', type: 'QUEST_COMPLETED', sourceKind: 'ledger', sourceRef: 'quest:one',
      questId: 'quest', occurredAt: at.toISOString(),
    });
    recordTravelEvent(db, {
      userId: 'user', type: 'QUEST_COMPLETED', sourceKind: 'ledger', sourceRef: 'quest:one',
      questId: 'quest', occurredAt: at.toISOString(),
    });
    const overview = seasonById(db, 'user', 'season-one');
    assert.equal(overview.completedQuests, 1);
    assert.equal(overview.progressPercent, 100);
    assert.equal(overview.memoryCoins, 50);
    assert.equal(overview.items[0]!.owned, true);
    assert.equal((db.prepare('SELECT COUNT(*) n FROM seasonal_progress_events').get() as { n: number }).n, 1);
    assert.equal(first.created, true);
  });

  test('ledger reversal withdraws derived season progress while retaining audit rows', () => {
    season('active');
    recordTravelEvent(db, {
      userId: 'user', type: 'QUEST_COMPLETED', sourceKind: 'ledger', sourceRef: 'quest:reverse',
      questId: 'quest', occurredAt: at.toISOString(),
    });
    invalidateTravelEventsForLedgerSource(db, 'user', 'quest:reverse', at.toISOString());
    const overview = seasonById(db, 'user', 'season-one');
    assert.equal(overview.completedQuests, 0);
    assert.equal(overview.memoryCoins, 0);
    assert.equal(overview.items[0]!.owned, false);
    assert.ok((db.prepare('SELECT invalidated_at FROM seasonal_progress_events').get() as { invalidated_at: string }).invalidated_at);
  });

  test('recomputes collection ownership when another valid event still meets the threshold', () => {
    season('active');
    db.prepare(`INSERT INTO quests(id,code,name_en,name_th,where_label,duration,reward_points,host_id,kind,lat,lng,geofence_radius_m)
      VALUES ('quest-two','S-02','Second Season Quest','เควสฤดูกาลสอง','Island','30 min',10,'admin','today',13,100,100)`).run();
    bindSeasonQuest(db, 'admin', 'season-one', 'quest-two', 25, at);
    recordTravelEvent(db, {
      userId: 'user', type: 'QUEST_COMPLETED', sourceKind: 'ledger', sourceRef: 'quest:first',
      questId: 'quest', occurredAt: at.toISOString(),
    });
    recordTravelEvent(db, {
      userId: 'user', type: 'QUEST_COMPLETED', sourceKind: 'ledger', sourceRef: 'quest:second',
      questId: 'quest-two', occurredAt: at.toISOString(),
    });
    invalidateTravelEventsForLedgerSource(db, 'user', 'quest:first', at.toISOString());
    const overview = seasonById(db, 'user', 'season-one');
    assert.equal(overview.completedQuests, 1);
    assert.equal(overview.items[0]!.owned, true);
    assert.equal(overview.memoryCoins, 25);
  });

  test('catch-up exchange spends derived coins transactionally and cannot duplicate', () => {
    season('ended', 99);
    recordTravelEvent(db, {
      userId: 'user', type: 'QUEST_COMPLETED', sourceKind: 'ledger', sourceRef: 'quest:coin',
      questId: 'quest', occurredAt: at.toISOString(),
    });
    const after = exchangeSeasonItem(db, 'user', 'light-stamp', 'exchange-1', at);
    assert.equal(after.memoryCoins, 10);
    assert.equal(after.items[0]!.owned, true);
    const retry = exchangeSeasonItem(db, 'user', 'light-stamp', 'exchange-1', at);
    assert.equal(retry.memoryCoins, 10);
    assert.equal((db.prepare('SELECT COUNT(*) n FROM seasonal_exchanges').get() as { n: number }).n, 1);
  });
});
