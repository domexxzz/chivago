import { strict as assert } from 'node:assert';
import { beforeEach, test } from 'node:test';
import { openTestDb, type DB } from './db-node.ts';
import { issueQuestCoupon } from './reward-voucher-service.ts';

let db: DB;
const now = new Date('2026-11-17T00:00:00.000Z');

beforeEach(() => {
  db = openTestDb();
  db.prepare('INSERT INTO users(id,display_name,created_at) VALUES(?,?,?)').run('u1', 'Traveller', now.toISOString());
  db.prepare(`INSERT INTO hosts(id,name,type) VALUES('h1','Host','community')`).run();
  db.prepare(`INSERT INTO quests(id,code,name_en,name_th,where_label,duration,reward_points,reward_currency,host_id,kind,lat,lng,geofence_radius_m)
    VALUES('q1','Q1','Cleanup','เก็บขยะ','Beach','1h',100,'green','h1','cleanup',13,100,100)`).run();
  db.prepare(`INSERT INTO offers(id,category,name,merchant,merchant_short,cost_points,currency,available,value_thb)
    VALUES('offer1','food','Drink discount','Island Cafe','Cafe',100,'green',1,50)`).run();
});

test('a configured quest coupon is a real voucher with source provenance and is idempotent', () => {
  db.prepare('INSERT INTO quest_coupon_rewards(quest_id,offer_id,expires_days) VALUES(?,?,?)').run('q1', 'offer1', 14);
  const first = issueQuestCoupon(db, 'u1', 'q1', now)!;
  const replay = issueQuestCoupon(db, 'u1', 'q1', now)!;
  assert.equal(first.id, replay.id);
  assert.equal(first.sourceKind, 'quest');
  assert.equal(first.costPoints, 0);
  assert.equal(first.valueTHB, 50);
});

test('an unavailable merchant offer is never silently replaced', () => {
  db.prepare('UPDATE offers SET available=0 WHERE id=?').run('offer1');
  db.prepare('INSERT INTO quest_coupon_rewards(quest_id,offer_id) VALUES(?,?)').run('q1', 'offer1');
  assert.equal(issueQuestCoupon(db, 'u1', 'q1', now), null);
  assert.equal((db.prepare('SELECT COUNT(*) AS n FROM vouchers').get() as { n: number }).n, 0);
});
