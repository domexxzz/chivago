import { strict as assert } from 'node:assert';
import { test, describe, beforeEach } from 'node:test';

import { DEEDS_TO_REST } from '@chivago/core';
import { readFileSync } from 'node:fs';
import { openTestDb, rows, type DB } from './db.ts';
import {
  VERIFIED_QUEST_DEEDS_SQL, WALKED_LEG_DEEDS_SQL, monstersInArea,
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
