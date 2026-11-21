import { strict as assert } from 'node:assert';
import { beforeEach, describe, test } from 'node:test';
import { openTestDb, type DB } from './db-node.ts';
import { bootstrapKohSichangAdventure } from './adventure-bootstrap.ts';
import { adventureOverviewFor } from './adventure-service.ts';

let db: DB;
const USER = 'adventure-user';
const placeIds = [
  'sc-palace', 'sc-atsadang-bridge', 'sc-chong-khao-khat', 'sc-chao-pho-khao-yai', 'sc-thamphang',
];

beforeEach(() => {
  db = openTestDb();
  db.prepare('INSERT INTO users (id, display_name, created_at) VALUES (?,?,?)')
    .run(USER, 'Traveller', '2026-11-20T00:00:00.000Z');
  const insert = db.prepare(
    `INSERT INTO places
     (id,name_en,name_th,short,layer,lat,lng,meta,blurb_en,blurb_th,tags,
      safety_label_en,safety_label_th,crowd_density,aqi,safety_index,walkability,photo_url)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  );
  placeIds.forEach((id, index) => insert.run(
    id, `Place ${index + 1}`, `สถานที่ ${index + 1}`, id, 'Quest', 13.15 + index / 1000,
    100.8 + index / 1000, 'Koh Sichang', 'A real place', 'สถานที่จริง', '[]',
    'Use care', 'เดินทางอย่างระมัดระวัง', 1, 20, 8, 7, `/media/places/${id}.jpg`,
  ));
  assert.equal(bootstrapKohSichangAdventure(db).skipped, false);
});

describe('Adventure narrative projection', () => {
  test('publishes real places and unlocks only the first unfinished stop', () => {
    const result = adventureOverviewFor(db, USER).adventure!;
    assert.equal(result.totalNodes, 5);
    assert.equal(result.completedNodes, 0);
    assert.equal(result.chapters[0].nodes[0].state, 'available');
    assert.equal(result.chapters[0].nodes[1].state, 'locked');
    assert.equal(result.chapters[0].nodes[0].place.id, 'sc-palace');
  });

  test('derives completion from a standing check-in ledger row', () => {
    db.prepare(
      `INSERT INTO ledger
       (id,user_id,label,occurred_at,host,amount,kind,currency,exp,source_ref)
       VALUES (?,?,?,?,?,0,'checkin','trip',0,?)`,
    ).run(
      'checkin-1', USER, 'Checked in', '2026-11-20T01:00:00.000Z', 'ChivaGo',
      `checkin:sc-palace:user:${USER}:2026-11-20`,
    );
    const result = adventureOverviewFor(db, USER).adventure!;
    assert.equal(result.completedNodes, 1);
    assert.equal(result.progressPercent, 20);
    assert.equal(result.chapters[0].nodes[0].state, 'completed');
    assert.equal(result.chapters[0].nodes[0].completionSource, 'checkin');
    assert.equal(result.chapters[0].nodes[1].state, 'available');
  });

  test('a real visit to a later stop cannot skip the earlier story clues', () => {
    db.prepare(
      `INSERT INTO ledger
       (id,user_id,label,occurred_at,host,amount,kind,currency,exp,source_ref)
       VALUES (?,?,?,?,?,0,'checkin','trip',0,?)`,
    ).run(
      'checkin-later', USER, 'Checked in later', '2026-11-20T01:00:00.000Z', 'ChivaGo',
      `checkin:sc-atsadang-bridge:user:${USER}:2026-11-20`,
    );
    const result = adventureOverviewFor(db, USER).adventure!;
    assert.equal(result.completedNodes, 0);
    assert.equal(result.chapters[0].nodes[0].state, 'available');
    assert.equal(result.chapters[0].nodes[1].state, 'locked');
  });

  test('is idempotent and does not overwrite published content', () => {
    assert.equal(bootstrapKohSichangAdventure(db).inserted, 0);
    assert.equal(adventureOverviewFor(db, USER).adventure?.totalNodes, 5);
  });

  test('returns no adventure outside a published area', () => {
    assert.equal(adventureOverviewFor(db, USER, 'koh-samui').adventure, null);
  });
});
