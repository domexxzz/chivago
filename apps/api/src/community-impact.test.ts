import { strict as assert } from 'node:assert';
import { beforeEach, describe, test } from 'node:test';

import { openTestDb } from './db-node.ts';
import { getCommunityImpact } from './repo.ts';
import { awardQuestReward, ensureWallet, reverseMovement } from './wallet-service.ts';
import type { DB } from './db.ts';

/*
  The community block on the Impact screen. Its actuals used to be whatever
  the seed wrote - 2,500 kg, 1,200 hours, 500 people, 20 activities - and that
  is what a judge opening the app on 21 November would have read. Every figure
  is now counted from approvals that stand, by people the app signed up.
*/

let db: DB;
const at = '2026-09-11T03:00:00.000Z';

const metric = (key: string) => {
  const m = getCommunityImpact(db, 2026).find((x) => x.key === key);
  assert.ok(m, `${key} is listed`);
  return m;
};

function user(id: string): void {
  db.prepare('INSERT INTO users (id, display_name, locale, created_at) VALUES (?,?,?,?)').run(id, id, 'th', at);
  ensureWallet(db, id);
}

function quest(id: string, duration: string): void {
  db.prepare(
    `INSERT INTO quests (id, code, name_en, name_th, where_label, duration,
      reward_points, host_id, kind, lat, lng, geofence_radius_m)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(id, id.toUpperCase(), `Quest ${id}`, `เควส ${id}`, 'Beach', duration, 100, 'h-beach', 'today', 13.15, 100.81, 150);
}

/** A host-approved completion with its proof and its reward, as the review flow leaves it. */
function verified(userId: string, questId: string, kg: number | null, when = at): void {
  db.prepare(
    `INSERT INTO quest_progress (user_id, quest_id, stage, joined_at, arrived_at, proof_submitted_at, verified_at)
     VALUES (?,?,'complete',?,?,?,?)`,
  ).run(userId, questId, when, when, when, when);
  db.prepare(
    `INSERT INTO proofs (id, user_id, quest_id, photos, weight_kg, submitted_at, reviewed_at, approved, reviewed_by)
     VALUES (?,?,?,?,?,?,?,1,?)`,
  ).run(`p-${userId}-${questId}`, userId, questId, '[]', kg, when, when, 'h-beach');
  awardQuestReward(db, { userId, questId, questName: questId, host: 'Beach host', points: 100, currency: 'green' });
}

beforeEach(() => {
  db = openTestDb();
  db.prepare('INSERT INTO hosts (id, name, type) VALUES (?,?,?)').run('h-beach', 'Beach host', 'community');
  // The placeholders exactly as the seed writes them.
  for (const [key, en, th, actual, target, unit] of [
    ['wasteCollected', 'Waste collected', 'ขยะที่เก็บได้', 2500, 3000, 'kg'],
    ['treesPlanted', 'Trees planted', 'ต้นไม้ที่ปลูก', 0, 1500, ''],
    ['volunteerHours', 'Volunteer hours', 'ชั่วโมงอาสาสมัคร', 1200, 1620, 'hr'],
    ['participants', 'Participants', 'ผู้เข้าร่วม', 500, 1000, ''],
    ['activities', 'Community activities', 'กิจกรรมชุมชน', 20, 50, ''],
  ] as const) {
    db.prepare(
      `INSERT INTO community_metrics (key, label_en, label_th, actual, target, unit, year)
       VALUES (?,?,?,?,?,?,2026)`,
    ).run(key, en, th, actual, target, unit);
  }
  quest('beach', '2 hr');
  quest('walk', '45 min');
});

describe('community impact', () => {
  test('with nothing verified, every figure is zero, whatever the seed wrote', () => {
    for (const key of ['wasteCollected', 'volunteerHours', 'participants', 'activities', 'treesPlanted']) {
      assert.equal(metric(key).actual, 0, `${key} is not the seeded placeholder`);
    }
  });

  test('the targets are still the ones in the database', () => {
    assert.equal(metric('wasteCollected').target, 3000);
    assert.equal(metric('participants').target, 1000);
  });

  test('approved work is counted: kilograms, hours, people and activities', () => {
    user('u_ana'); user('u_ben');
    verified('u_ana', 'beach', 3.2);
    verified('u_ana', 'walk', null);
    verified('u_ben', 'beach', 1.8);
    assert.equal(metric('wasteCollected').actual, 5);
    assert.equal(metric('volunteerHours').actual, 4.8, '2 hr + 45 min + 2 hr');
    assert.equal(metric('participants').actual, 2, 'Ana did two quests and is one person');
    assert.equal(metric('activities').actual, 3);
  });

  test('demo and showcase accounts are not people in the community', () => {
    for (const id of ['demo-user', 'demo-traveller-2', 'showcase-demo', 'demo-market-traveller']) {
      user(id);
      verified(id, 'beach', 3.2);
    }
    assert.equal(metric('wasteCollected').actual, 0);
    assert.equal(metric('participants').actual, 0);
    assert.equal(metric('activities').actual, 0);
  });

  test('a reversed award is not work that stands', () => {
    user('u_ana');
    verified('u_ana', 'beach', 3.2);
    reverseMovement(db, { userId: 'u_ana', originalSourceRef: 'quest:beach:user:u_ana', reason: 'test reversal' });
    assert.equal(metric('wasteCollected').actual, 0);
    assert.equal(metric('participants').actual, 0);
  });

  test('a joined but unapproved quest counts for nothing', () => {
    user('u_ana');
    db.prepare(
      `INSERT INTO quest_progress (user_id, quest_id, stage, joined_at, arrived_at)
       VALUES ('u_ana','beach','arrived',?,?)`,
    ).run(at, at);
    assert.equal(metric('participants').actual, 0);
  });

  test('only the year asked for is counted, on the date the host approved it', () => {
    user('u_ana');
    verified('u_ana', 'beach', 3.2, '2025-12-31T16:59:59.000Z');
    assert.equal(metric('wasteCollected').actual, 0);
    assert.equal(getCommunityImpact(db, 2025).length, 0, 'no 2025 metrics row, no 2025 figures');
  });
});
