/**
 * The upgrade path for a database that already holds real balances.
 *
 * A pilot is running. Somchai has 1,610 points he earned and 180 he already
 * spent. Every assertion here is about not losing, inventing or silently
 * reclassifying any of that.
 */

import { strict as assert } from 'node:assert';
import { test, describe, beforeEach } from 'node:test';
import { DatabaseSync } from 'node:sqlite';

import { migrate } from './migrations.ts';

/** The schema exactly as it stood before two currencies existed. */
const OLD_SCHEMA = `
  PRAGMA foreign_keys = ON;
  CREATE TABLE users (id TEXT PRIMARY KEY, display_name TEXT NOT NULL,
    locale TEXT NOT NULL DEFAULT 'en', created_at TEXT NOT NULL);
  CREATE TABLE hosts (id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL);
  -- In the real old schema too. Quiet-hours preferences are columns ON this
  -- table, so leaving it out of the fixture made the migration fail here and
  -- nowhere else.
  CREATE TABLE profiles (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    purposes TEXT NOT NULL DEFAULT '[]', activity TEXT, watch TEXT NOT NULL DEFAULT '[]',
    completed_at TEXT, consent_version TEXT, consented_at TEXT);
  -- Present in the real old schema too. Omitting it here hid a genuine
  -- problem: place_reviews references places, and with foreign_keys ON a
  -- reference to a table that does not exist only fails at DELETE time.
  CREATE TABLE places (id TEXT PRIMARY KEY, name_en TEXT NOT NULL, name_th TEXT NOT NULL,
    short TEXT NOT NULL, layer TEXT NOT NULL, lat REAL NOT NULL, lng REAL NOT NULL,
    meta TEXT NOT NULL, blurb_en TEXT NOT NULL, blurb_th TEXT NOT NULL,
    tags TEXT NOT NULL DEFAULT '[]', photo_url TEXT, safety_label_en TEXT NOT NULL,
    safety_label_th TEXT NOT NULL, crowd_density REAL NOT NULL, aqi REAL NOT NULL,
    safety_index REAL NOT NULL, walkability REAL NOT NULL);
  CREATE TABLE quests (id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, name_en TEXT NOT NULL,
    name_th TEXT NOT NULL, where_label TEXT NOT NULL, duration TEXT NOT NULL,
    reward_points INTEGER NOT NULL, host_id TEXT NOT NULL REFERENCES hosts(id),
    kind TEXT NOT NULL, lat REAL NOT NULL, lng REAL NOT NULL, geofence_radius_m INTEGER NOT NULL);
  CREATE TABLE proofs (id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    quest_id TEXT NOT NULL REFERENCES quests(id), photos TEXT NOT NULL DEFAULT '[]',
    weight_kg REAL, submitted_at TEXT NOT NULL, reviewed_at TEXT, approved INTEGER);
  CREATE TABLE quest_progress (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    quest_id TEXT NOT NULL REFERENCES quests(id), stage TEXT NOT NULL, joined_at TEXT,
    arrived_at TEXT, proof_submitted_at TEXT, verified_at TEXT, rejected_at TEXT,
    rejection_reason TEXT, PRIMARY KEY (user_id, quest_id));
  CREATE TABLE offers (id TEXT PRIMARY KEY, category TEXT NOT NULL, name TEXT NOT NULL,
    merchant TEXT NOT NULL, merchant_short TEXT NOT NULL, cost_points INTEGER NOT NULL,
    image_url TEXT, available INTEGER NOT NULL DEFAULT 1);
  CREATE TABLE sos_alerts (id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL, lat REAL NOT NULL, lng REAL NOT NULL, location_label TEXT NOT NULL,
    fired_at TEXT NOT NULL, resolved_at TEXT, nearest_hospital TEXT NOT NULL,
    contacts_notified INTEGER NOT NULL DEFAULT 0, interpreter_joining INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE wallets (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0));
  CREATE TABLE ledger (id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    label TEXT NOT NULL, occurred_at TEXT NOT NULL, host TEXT NOT NULL, amount INTEGER NOT NULL,
    kind TEXT NOT NULL, source_ref TEXT NOT NULL UNIQUE);
`;

let db: DatabaseSync;

interface WalletRow { trip_points: number; green_points: number; exp: number }
interface LedgerRow { amount: number; currency: string; exp: number }

beforeEach(() => {
  db = new DatabaseSync(':memory:');
  db.exec(OLD_SCHEMA);
  db.prepare("INSERT INTO users VALUES ('u1','Somchai','th','2026-08-01T00:00:00Z')").run();
  // Earned 1,240 + 150 + 400 = 1,790. Spent 180. Holding 1,610.
  db.prepare('INSERT INTO wallets (user_id, balance) VALUES (?,?)').run('u1', 1610);
  const led = (id: string, label: string, host: string, amount: number, kind: string, ref: string) =>
    db.prepare('INSERT INTO ledger VALUES (?,?,?,?,?,?,?,?)')
      .run(id, 'u1', label, '2026-08-01T00:00:00Z', host, amount, kind, ref);
  led('l1', 'Opening', 'ChivaGo', 1240, 'adjustment', 'opening:u1');
  led('l2', 'Beach Cleanup', 'Samui Municipality', 150, 'quest_reward', 'quest:q1:user:u1');
  led('l3', 'Mangrove Planting', 'Samui Green Foundation', 400, 'quest_reward', 'quest:q2:user:u1');
  led('l4', 'Cold brew redeemed', 'Sabeinglae Coffee', -180, 'redemption', 'voucher:v1');
});

const wallet = (): WalletRow =>
  db.prepare('SELECT trip_points, green_points, exp FROM wallets WHERE user_id = ?')
    .get('u1') as unknown as WalletRow;

const ledger = (): LedgerRow[] =>
  db.prepare('SELECT amount, currency, exp FROM ledger ORDER BY id')
    .all() as unknown as LedgerRow[];

describe('splitting one balance into two', () => {
  test('the existing balance becomes GREEN, and nothing becomes Trip', () => {
    migrate(db);
    const w = wallet();
    // Every historical point was paid after a host approved a geofenced photo.
    // That is the Green definition. Putting any of it in Trip would be
    // inventing evidence that was never collected.
    assert.equal(w.green_points, 1610);
    assert.equal(w.trip_points, 0);
  });

  test('every historical ledger row is Green, not free text or null', () => {
    migrate(db);
    for (const row of ledger()) assert.equal(row.currency, 'green');
  });

  test('not a single point is lost or invented', () => {
    const before = (db.prepare('SELECT balance FROM wallets WHERE user_id = ?')
      .get('u1') as unknown as { balance: number }).balance;
    migrate(db);
    const w = wallet();
    assert.equal(w.trip_points + w.green_points, before);
  });
});

describe('backfilling EXP', () => {
  test('EXP comes from what was EARNED, not from what is left', () => {
    migrate(db);
    // 1,790 earned, not the 1,610 still held. Deriving EXP from the balance
    // would silently demote every user who has ever redeemed anything - which
    // is the exact bug the split exists to make impossible.
    assert.equal(wallet().exp, 1790);
  });

  test('the spend granted no EXP, so refunding it cannot invent any', () => {
    migrate(db);
    const debit = ledger().find((r) => r.amount < 0)!;
    assert.equal(debit.exp, 0);
  });

  test('wallet EXP always equals the sum of the ledger', () => {
    migrate(db);
    const sum = ledger().reduce((a, r) => a + r.exp, 0);
    assert.equal(wallet().exp, sum);
  });
});

describe('safety of re-running', () => {
  test('a second migrate changes nothing', () => {
    migrate(db);
    const before = wallet();
    const applied = migrate(db);
    assert.deepEqual(wallet(), before);
    assert.equal(
      applied.filter((a) => /wallets|ledger|quests\.reward|offers\.currency/.test(a)).length,
      0,
      'nothing re-applied',
    );
  });

  test('the new CHECK constraints are actually in force afterwards', () => {
    migrate(db);
    assert.throws(
      () => db.prepare('UPDATE wallets SET green_points = -1 WHERE user_id = ?').run('u1'),
    );
    assert.throws(
      () => db.prepare('UPDATE wallets SET exp = -1 WHERE user_id = ?').run('u1'),
    );
  });

  test('the user row still owns its wallet after the table rebuild', () => {
    migrate(db);
    // The rebuild drops and recreates wallets. If the FK did not come back,
    // PDPA erasure would leave an orphan balance behind.
    db.prepare('DELETE FROM users WHERE id = ?').run('u1');
    const left = db.prepare('SELECT COUNT(*) n FROM wallets').get() as unknown as { n: number };
    assert.equal(left.n, 0, 'wallet cascaded with the user');
  });
});

describe('removing prototype-only account scores', () => {
  test('removes only the exact generated opening grants and restores the wallet totals', () => {
    migrate(db);
    const before = wallet();
    db.prepare(
      'UPDATE wallets SET trip_points = trip_points + 320, green_points = green_points + 1240, exp = exp + 1560 WHERE user_id = ?',
    ).run('u1');
    const insert = db.prepare(
      `INSERT INTO ledger
        (id,user_id,label,subject,occurred_at,host,amount,currency,exp,kind,source_ref)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    );
    insert.run('mock-trip', 'u1', 'Pilot opening balance', null, '2026-08-02T00:00:00Z', 'ChivaGo · pilot seed', 320, 'trip', 320, 'adjustment', 'opening:trip:u1');
    insert.run('mock-green', 'u1', 'Pilot opening balance', null, '2026-08-02T00:00:00Z', 'ChivaGo · pilot seed', 1240, 'green', 1240, 'adjustment', 'opening:green:u1');

    const applied = migrate(db);
    assert.deepEqual(wallet(), before);
    assert.ok(applied.includes('remove prototype opening balances'));
    const remaining = db.prepare("SELECT source_ref FROM ledger WHERE source_ref LIKE 'opening:%' ORDER BY source_ref")
      .all() as unknown as { source_ref: string }[];
    assert.deepEqual(remaining.map((r) => r.source_ref), ['opening:u1']);
  });
});

/*
  The photographs moved off Metro's URL namespace, and a running pilot is
  holding the old path.

  `/assets/` is Metro's own prefix, so under `expo start --web` every place
  photograph answered 404 while production - where they are real files in an
  export - looked fine. Moving the directory fixes the repository; these rows
  were written by an earlier seed and have to be brought along, or the pilot
  keeps pointing at a directory that no longer exists.
*/
describe('the place photographs follow the directory', () => {
  const place = (id: string, url: string | null, source: string | null) => {
    db.prepare(
      `INSERT INTO places (id, name_en, name_th, short, layer, lat, lng, meta, blurb_en, blurb_th,
         tags, photo_url, safety_label_en, safety_label_th, crowd_density, aqi, safety_index, walkability)
       VALUES (?,?,?,?,'Green',1,1,'','','','[]',?,'x','x',1,20,6,7)`,
    ).run(id, id, id, id, url);
    if (source !== null) {
      // photo_source arrives with the migration that adds the column, so it
      // is set after the first pass rather than in the INSERT above.
      migrate(db);
      db.prepare('UPDATE places SET photo_source = ? WHERE id = ?').run(source, id);
    }
  };

  const photoOf = (id: string) =>
    db.prepare('SELECT photo_url, photo_source FROM places WHERE id = ?')
      .get(id) as unknown as { photo_url: string | null; photo_source: string | null };

  test('a seeded photograph and its source link both move to /media', () => {
    place('ku-library', '/assets/places/ku-library.jpg',
      'https://github.com/domexxzz/chivago/tree/main/apps/mobile/public/assets/places');
    migrate(db);
    assert.equal(photoOf('ku-library').photo_url, '/media/places/ku-library.jpg');
    assert.equal(
      photoOf('ku-library').photo_source,
      'https://github.com/domexxzz/chivago/tree/main/apps/mobile/public/media/places',
      'the licence trail still has to lead somewhere',
    );
  });

  test('an illustration moves too', () => {
    place('mangrove', '/assets/illustrations/mangrove-habitat-v1.jpg', null);
    migrate(db);
    assert.equal(photoOf('mangrove').photo_url, '/media/illustrations/mangrove-habitat-v1.jpg');
  });

  /*
    The narrow part. A licensed photograph from somewhere else keeps its own
    absolute URL, and a path this repository does not own is not ours to
    rewrite - a blanket replace of "/assets/" would have broken both.
  */
  test('a photograph that is not ours is left exactly as it was', () => {
    place('licensed', 'https://images.example.com/assets/places/beach.jpg', null);
    place('elsewhere', '/assets/fonts/Anuphan_600SemiBold.ttf', null);
    migrate(db);
    assert.equal(photoOf('licensed').photo_url, 'https://images.example.com/assets/places/beach.jpg');
    assert.equal(photoOf('elsewhere').photo_url, '/assets/fonts/Anuphan_600SemiBold.ttf');
  });

  test('a place with no photograph is not given one', () => {
    place('nophoto', null, null);
    migrate(db);
    assert.equal(photoOf('nophoto').photo_url, null);
  });

  test('running it twice does not double-prefix', () => {
    place('ku-park', '/assets/places/ku-park.jpg', null);
    migrate(db);
    migrate(db);
    assert.equal(photoOf('ku-park').photo_url, '/media/places/ku-park.jpg');
  });
});
