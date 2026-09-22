import { strict as assert } from 'node:assert';
import { test, describe, beforeEach } from 'node:test';

import { DEEDS_TO_REST } from '@chivago/core';
import { readFileSync } from 'node:fs';
import { openTestDb, rows, type DB } from './db.ts';
import {
  VERIFIED_QUEST_DEEDS_SQL, WALKED_LEG_DEEDS_SQL, forgetDeedSweeps, monstersInArea,
} from './monster-service.ts';

/**
 * Monsters read off rows that already exist.
 *
 * The thing worth holding here is not that a monster appears. It is that
 * nothing INVENTS one, that the bar is filled only by work something else
 * already checked, and that standing next to a problem counts for nothing.
 */
let db: DB;
const NOW = new Date('2026-09-10T12:00:00.000Z');
const ago = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

/** The campus park, and a quest sitting exactly on it. */
const PARK = { id: 'ku-park', lat: 13.12154, lng: 100.91812 };

const clean = () => ({ aqi: 14, provenance: 'live' as const });
const bad = () => ({ aqi: 140, provenance: 'live' as const });

beforeEach(() => {
  db = openTestDb();
  db.prepare('INSERT INTO users (id, display_name, created_at) VALUES (?,?,?)').run('ana', 'Ana', ago(200));
  // The quest's host has to exist before the quest can point at it.
  db.prepare("INSERT INTO hosts (id, name, type, role, created_at) VALUES ('h-ku','KU team','community','host',?)")
    .run(ago(200));
  db.prepare(
    `INSERT INTO places (id, name_en, name_th, short, layer, province, lat, lng, meta,
       blurb_en, blurb_th, tags, safety_label_en, safety_label_th,
       crowd_density, aqi, safety_index, walkability)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(PARK.id, 'Campus park', 'สวน', 'Park', 'Green', 'TH-20', PARK.lat, PARK.lng, 'Park',
        'x', 'x', '[]', 'Campus grounds', 'ในเขตมหาวิทยาลัย', 0.6, 22, 6.0, 7.0);
});

const quest = (pillar: string | null) => {
  db.prepare(
    `INSERT INTO quests (id, code, name_en, name_th, where_label, where_label_th,
       duration, duration_th, reward_points, reward_currency, host_id, kind,
       lat, lng, geofence_radius_m, esg_pillar)
     VALUES ('q-clean','KU-09','Clean-up','เก็บขยะ','Park','สวน','45 min','45 นาที',
       120,'green','h-ku','today',?,?,120,?)`,
  ).run(PARK.lat, PARK.lng, pillar);
};

const ledger = (kind: string, currency: string, sourceRef: string, at: string) => {
  db.prepare(
    `INSERT INTO ledger (id, user_id, label, occurred_at, host, amount, currency, exp, kind, source_ref)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
  ).run(`l-${sourceRef}`, 'ana', 'x', at, 'h', 10, currency, 0, kind, sourceRef);
};

const standing = (air = clean()) => monstersInArea(db, 'ku-sriracha', () => air, NOW);

describe('what stands on the campus', () => {
  test('good air and no clean-up: nothing at all, and the app says so', () => {
    assert.deepEqual(standing(), []);
  });

  test('a host with an open clean-up summons the plastic one', () => {
    quest('environmental');
    assert.deepEqual(standing().map((m) => m.key), ['plastic']);
  });

  test('a quest that is not an environmental one summons nothing', () => {
    // A food trail is not a statement that there is litter here.
    quest('social');
    assert.deepEqual(standing(), []);
  });

  test('bad air summons smog, carrying the number that summoned it', () => {
    const found = standing(bad());
    assert.deepEqual(found.map((m) => m.key), ['smog']);
    assert.match(found[0]!.because.en, /140/);
  });

  test('an estimate never summons one, however bad', () => {
    assert.deepEqual(monstersInArea(db, 'ku-sriracha', () => ({ aqi: 300, provenance: 'estimated' }), NOW), []);
  });

  test('an area that is not one of ours has no monsters and does not throw', () => {
    assert.deepEqual(monstersInArea(db, 'atlantis', () => bad(), NOW), []);
  });
});

describe('what pushes one back', () => {
  beforeEach(() => { quest('environmental'); });

  test('a check-in is worth nothing: being near a problem is not doing anything', () => {
    ledger('checkin', 'trip', `checkin:${PARK.id}:user:ana:2026-09-10`, ago(2));
    assert.equal(standing()[0]!.progress, 0);
  });

  test('a verified green quest at the site is worth three', () => {
    ledger('quest_reward', 'green', 'quest:q-clean:user:ana', ago(3));
    assert.equal(standing()[0]!.progress, 3);
  });

  test('a Trip-paying quest does not count: self-reported work must not clear it', () => {
    ledger('quest_reward', 'trip', 'quest:q-clean:user:ana', ago(3));
    assert.equal(standing()[0]!.progress, 0);
  });

  test('a measured leg on foot counts at both of its ends', () => {
    ledger('walk', 'trip', `walk:${PARK.id}:ku-shops:user:ana:2026-09-10`, ago(4));
    ledger('walk', 'trip', `walk:ku-shops:${PARK.id}:user:ana:2026-09-09`, ago(30));
    assert.equal(standing()[0]!.progress, 2);
  });

  test('enough deeds put it to rest, and it says until when', () => {
    ledger('quest_reward', 'green', 'quest:q-clean:user:ana', ago(5));
    ledger('walk', 'trip', `walk:${PARK.id}:ku-shops:user:ana:2026-09-10`, ago(4));
    ledger('walk', 'trip', `walk:${PARK.id}:ku-park:user:ana:2026-09-08`, ago(3));
    const m = standing()[0]!;
    assert.equal(m.progress, DEEDS_TO_REST);
    assert.ok(m.restingUntil && m.restingUntil > NOW.toISOString());
  });

  test('work from last month does not count, so the island keeps having to do it', () => {
    ledger('quest_reward', 'green', 'quest:q-clean:user:ana', ago(24 * 30));
    assert.equal(standing()[0]!.progress, 0);
  });
});

/**
 * The index under the derivation.
 *
 * Deriving a monster instead of storing its HP is the right call and this is
 * the bill for it: every map load sweeps the ledger. That is free while the
 * sweep is an index seek and ruinous while it is a table scan, and the
 * difference is invisible in every other test in this file — twenty seeded
 * rows scan in microseconds, so a missing index passes everything.
 *
 * So the assertion is on the PLAN, not on a timing. A timing test would be
 * flaky on a loaded CI box and would still pass on a full scan of a small
 * table; SQLite's own planner saying `SEARCH` is the fact we actually want.
 */
describe('the ledger reads behind a monster do not scan the ledger', () => {
  const plan = (sql: string): string =>
    rows<{ detail: string }>(db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(ago(48)))
      .map((r) => r.detail)
      .join(' | ');

  test('verified quests are found by index, not by sweeping every row', () => {
    const detail = plan(VERIFIED_QUEST_DEEDS_SQL);
    assert.ok(
      detail.includes('idx_ledger_kind_at'),
      `expected the ledger read to use idx_ledger_kind_at, planner said: ${detail}`,
    );
    assert.ok(!/SCAN ledger\b/.test(detail), `the ledger is being scanned: ${detail}`);
  });

  test('legs on foot are found by index too', () => {
    const detail = plan(WALKED_LEG_DEEDS_SQL);
    assert.ok(
      detail.includes('idx_ledger_kind_at'),
      `expected the ledger read to use idx_ledger_kind_at, planner said: ${detail}`,
    );
    assert.ok(!/SCAN ledger\b/.test(detail), `the ledger is being scanned: ${detail}`);
  });

  test('the constants the test explains are the ones the code runs', () => {
    // The guard on the guard. These two tests are only worth anything while
    // `deedsByPlace` prepares these exact strings rather than a copy that has
    // since changed, so the source is read and checked for the use.
    const source = readFileSync(new URL('./monster-service.ts', import.meta.url), 'utf8');
    assert.match(source, /db\.prepare\(VERIFIED_QUEST_DEEDS_SQL\)/);
    assert.match(source, /db\.prepare\(WALKED_LEG_DEEDS_SQL\)/);
  });
});

/**
 * The sweep, remembered between readers.
 *
 * `deedsByPlace` reads every walk and quest reward in the window across the
 * whole country, and the caller then throws away the places outside the area
 * being drawn. So every reader on the island was paying for the same answer:
 * 122 ms each at a million ledger rows with a busy week in them, on a
 * synchronous database, which is 122 ms everybody else waited too.
 *
 * A cache is a second copy of the truth, which is the one thing this file
 * exists to avoid. It is allowed here because it cannot drift quietly: its
 * key is the highest ledger rowid and the minute the window opens in, so the
 * answer is thrown away the moment either could have changed it.
 */
describe('the deed sweep is shared, and knows when to stop trusting itself', () => {
  test('a deed done a second ago counts on the next read, with no waiting', () => {
    // The case that would have made a cache unacceptable. The traveller whose
    // quest was just approved is the likeliest person to open this screen, and
    // a monster still standing after their own work is the app calling them a
    // liar. Their approval wrote a ledger row, so the key moved.
    quest('environmental');
    assert.equal(standing(bad())[0]!.progress, 0);
    ledger('quest_reward', 'green', 'quest:q-clean:user:ana', ago(1));
    assert.equal(standing(bad())[0]!.progress, 3, 'the new deed was not seen');
  });

  test('it really is cached, and this is exactly what that costs', () => {
    // Proved by doing the one thing the key cannot see: removing a row that is
    // not the newest. MAX(rowid) does not move, so the old answer stands.
    //
    // THIS IS NOT A BUG BEING HIDDEN, it is the blind spot being named. The
    // ledger is append-only - nothing in `apps/api/src` issues a DELETE against
    // it, and `reverseMovement` unwinds an award by INSERTING the opposite
    // movement - so the only way to reach this state is the SQL below.
    quest('environmental');
    ledger('quest_reward', 'green', 'quest:q-clean:user:ana', ago(1));
    ledger('checkin', 'trip', 'checkin:later:user:ana', ago(1)); // now the newest
    assert.equal(standing(bad())[0]!.progress, 3);

    db.prepare("DELETE FROM ledger WHERE source_ref = 'quest:q-clean:user:ana'").run();
    assert.equal(standing(bad())[0]!.progress, 3, 'the sweep was not cached at all');

    forgetDeedSweeps(db);
    assert.equal(standing(bad())[0]!.progress, 0, 'the sweep was never forgotten');
  });

  test('two islands do not share one answer', () => {
    // The sweep is held against the database object, not against nothing. The
    // suite opens a fresh `:memory:` database per test, and a module-level
    // cache would hand the second one the first one's deeds: same rowid,
    // different island.
    quest('environmental');
    ledger('quest_reward', 'green', 'quest:q-clean:user:ana', ago(1));
    assert.equal(standing(bad())[0]!.progress, 3);

    const other = openTestDb();
    other.prepare("INSERT INTO hosts (id, name, type, role, created_at) VALUES ('h-ku','KU team','community','host',?)")
      .run(ago(200));
    other.prepare(
      `INSERT INTO places (id, name_en, name_th, short, layer, province, lat, lng, meta,
         blurb_en, blurb_th, tags, safety_label_en, safety_label_th,
         crowd_density, aqi, safety_index, walkability)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(PARK.id, 'Campus park', 'สวน', 'Park', 'Green', 'TH-20', PARK.lat, PARK.lng, 'Park',
          'x', 'x', '[]', 'Campus grounds', 'ในเขตมหาวิทยาลัย', 0.6, 22, 6.0, 7.0);
    other.prepare(
      `INSERT INTO quests (id,code,name_en,name_th,where_label,duration,reward_points,host_id,kind,lat,lng,geofence_radius_m,esg_pillar)
       VALUES ('q-clean','QC','Clean','เก็บ','x','1 hr',40,'h-ku','today',?,?,250,'environmental')`,
    ).run(PARK.lat, PARK.lng);

    const theirs = monstersInArea(other, 'ku-sriracha', () => bad(), NOW);
    assert.equal(theirs[0]!.progress, 0, 'the second island was handed the first one’s deeds');
  });

  test('the window keeps moving, so an old deed stops counting on its own', () => {
    // The staleness the key accepts is at the TRAILING edge and is bounded by
    // the minute the window is bucketed into. Two minutes on, a deed that has
    // just aged out is gone without anybody writing anything.
    quest('environmental');
    ledger('quest_reward', 'green', 'quest:q-clean:user:ana', ago(24 * 7 - 1));
    assert.equal(standing(bad())[0]!.progress, 3);

    const later = new Date(NOW.getTime() + 2 * 60 * 60 * 1000);
    assert.equal(
      monstersInArea(db, 'ku-sriracha', () => bad(), later)[0]!.progress, 0,
      'the deed outlived its window because the sweep was never redone',
    );
  });
});
