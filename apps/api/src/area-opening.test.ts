/**
 * Opening an area on a database that already has people on it.
 *
 * The case these tests are really about is the one found on 13 November 2026:
 * Ko Sichang's quests were replaced, three became five, and production could
 * not be told. When it finally could, the new set collided with the old on a
 * UNIQUE column, and one of the old quests had a volunteer's completed work
 * behind it. Both of those have to come out right, and neither is obvious.
 */

import { strict as assert } from 'node:assert';
import { test, describe, beforeEach } from 'node:test';

import { ACTIVE_QUESTS, areaByKey, inArea } from '@chivago/core';
import { openTestDb, type DB } from './db-node.ts';
import { openArea, retireSupersededQuests, seedArea } from './area-opening.ts';

let db: DB;

const SICHANG = areaByKey('koh-sichang');
/*
  ACTIVE_QUESTS, which is what the opener seeds.

  `SEED_QUESTS` is the historical catalogue and still holds SC-01..SC-03
  beside the SG-01..SG-05 that replaced them, so measuring against it expects
  eight quests on an island the deck says has five - and the test named "the
  five quests land" would be asserting the opposite of its own name.
*/
const seededSichang = ACTIVE_QUESTS.filter((q) => inArea(SICHANG, q));

/** One of the quests the field guide replaced, as production still holds it. */
function insertOldQuest(id: string, code: string, lat: number, lng: number): void {
  db.prepare(
    `INSERT INTO hosts (id, name, type, role, created_at)
     VALUES ('h-old', 'Old host', 'ngo', 'host', ?) ON CONFLICT(id) DO NOTHING`,
  ).run(new Date().toISOString());
  db.prepare(
    `INSERT INTO quests (id, code, name_en, name_th, where_label, duration, reward_points,
       reward_currency, host_id, kind, lat, lng, geofence_radius_m)
     VALUES (?, ?, 'Old (sample)', 'เก่า (ตัวอย่าง)', 'Somewhere', '30 min', 60,
       'green', 'h-old', 'today', ?, ?, 120)`,
  ).run(id, code, lat, lng);
}

/** Somebody started it, so its evidence must outlive the content change. */
function startQuest(questId: string): void {
  const now = new Date().toISOString();
  db.prepare('INSERT INTO users (id, display_name, created_at) VALUES (?,?,?) ON CONFLICT(id) DO NOTHING')
    .run('u1', 'Ana', now);
  db.prepare('INSERT INTO quest_progress (user_id, quest_id, stage, joined_at) VALUES (?,?,?,?)')
    .run('u1', questId, 'joined', now);
}

/** Typed readers, so a test asserts on a value and not on `unknown`. */
const questCount = (): number =>
  (db.prepare('SELECT COUNT(*) AS n FROM quests').get() as { n: number }).n;
const codeOf = (id: string): string | undefined =>
  (db.prepare('SELECT code FROM quests WHERE id = ?').get(id) as { code: string } | undefined)?.code;
const hostOf = (id: string): string | undefined =>
  (db.prepare('SELECT host_id FROM quests WHERE id = ?').get(id) as { host_id: string } | undefined)?.host_id;

beforeEach(() => { db = openTestDb(); });

describe('retiring the quests the seed replaced', () => {
  test('a replaced quest nobody started is removed', () => {
    insertOldQuest('q-sc-dropoff', 'SC-01', SICHANG.center.lat, SICHANG.center.lng);

    const r = retireSupersededQuests(db, 'koh-sichang');

    assert.deepEqual(r.deleted, ['q-sc-dropoff']);
    assert.deepEqual(r.kept, []);
    assert.equal(questCount(), 0);
  });

  test('a replaced quest somebody started is KEPT, and its code is freed', () => {
    /*
      The one that matters. `q-sc-beach` was walked end to end on 6 November
      and a certificate was issued against that work - `docs/72` tells the
      speaker to open it on stage. Deleting the quest would orphan the evidence
      behind a certificate we are asking a judge to trust.
    */
    insertOldQuest('q-sc-beach', 'SC-02', SICHANG.center.lat, SICHANG.center.lng);
    startQuest('q-sc-beach');

    const r = retireSupersededQuests(db, 'koh-sichang');

    assert.deepEqual(r.deleted, [], 'nothing with work behind it may be deleted');
    assert.deepEqual(r.kept, ['q-sc-beach']);

    const row = db.prepare('SELECT code FROM quests WHERE id = ?').get('q-sc-beach');
    assert.ok(row, 'the quest row survives');
    assert.notEqual(row.code, 'SC-02', 'the code moved out of the seed\'s way');
    assert.ok(String(row.code).endsWith('SC-02'), 'and the old code is still legible in it');
  });

  test('running twice does not grow the prefix', () => {
    insertOldQuest('q-sc-beach', 'SC-02', SICHANG.center.lat, SICHANG.center.lng);
    startQuest('q-sc-beach');

    retireSupersededQuests(db, 'koh-sichang');
    const once = codeOf('q-sc-beach');
    retireSupersededQuests(db, 'koh-sichang');
    const twice = codeOf('q-sc-beach');

    assert.equal(twice, once, 'X-X-SC-02 is how an idempotent function stops being one');
  });

  test('another area is not touched', () => {
    // Chaweng, on Samui, 400 km away and not this area's business.
    insertOldQuest('q-samui-thing', 'SM-99', 9.5357, 100.0617);

    const r = retireSupersededQuests(db, 'koh-sichang');

    assert.deepEqual(r.deleted, []);
    assert.equal(questCount(), 1);
  });

  test('a seeded quest is never retired', () => {
    seedArea(db, 'koh-sichang');
    const before = questCount();

    const r = retireSupersededQuests(db, 'koh-sichang');

    assert.deepEqual([...r.deleted, ...r.kept], []);
    assert.equal(questCount(), before);
  });
});

describe('opening the area', () => {
  test('the five quests land on a database still holding the old two', () => {
    /*
      Production, as of 13 November 2026, reproduced: q-sc-dropoff holding
      SC-01 and q-sc-beach holding SC-02, which are the codes two of the new
      quests want. `quests.code` is UNIQUE, so a plain insert throws here -
      which is why `openArea` retires before it seeds.
    */
    insertOldQuest('q-sc-dropoff', 'SC-01', SICHANG.center.lat, SICHANG.center.lng);
    insertOldQuest('q-sc-beach', 'SC-02', SICHANG.center.lat + 0.001, SICHANG.center.lng);

    const r = openArea(db, 'koh-sichang');

    assert.equal(r.questsAdded, seededSichang.length, 'every seeded quest landed');
    assert.deepEqual(
      r.questsLive.map((q) => q.id).sort(),
      seededSichang.map((q) => q.id).sort(),
      'and the area ends up with exactly the seeded set',
    );
    assert.equal(
      r.questsLive.reduce((a, q) => a + q.rewardPoints, 0),
      seededSichang.reduce((a, q) => a + q.rewardPoints, 0),
      'the Green on the screen matches the Green in the seed',
    );
  });

  test('a quest with work behind it stays in the list, and the result says so', () => {
    insertOldQuest('q-sc-beach', 'SC-02', SICHANG.center.lat, SICHANG.center.lng);
    startQuest('q-sc-beach');

    const r = openArea(db, 'koh-sichang');

    assert.deepEqual(r.retired.kept, ['q-sc-beach']);
    assert.ok(
      r.questsLive.some((q) => q.id === 'q-sc-beach'),
      'an operator must be able to see that the area has one more than the seed',
    );
    assert.equal(r.questsLive.length, seededSichang.length + 1);
  });

  test('running it twice changes nothing the second time', () => {
    openArea(db, 'koh-sichang');
    const second = openArea(db, 'koh-sichang');

    assert.equal(second.questsAdded, 0);
    assert.equal(second.placesAdded, 0);
    assert.deepEqual(second.hostsCreated, []);
    assert.deepEqual(second.retired, { deleted: [], kept: [] });
  });

  test('it adds the host the quests name, with a console key', () => {
    const r = openArea(db, 'koh-sichang');

    assert.ok(r.hostsCreated.length > 0, 'the host did not exist and had to be made');
    assert.equal(r.keys.length, r.hostsCreated.length, 'each new host got exactly one key');
    for (const q of seededSichang) {
      assert.equal(hostOf(q.id), q.host.id, `${q.id} names its seeded host`);
    }
  });

  test('an area nobody has heard of throws rather than doing half the job', () => {
    assert.throws(() => openArea(db, 'atlantis' as never), /area must be one of/);
  });
});
