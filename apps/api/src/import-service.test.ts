/**
 * Replaying a database into another one.
 *
 * This runs under BOTH drivers (`pnpm test` and `pnpm test:durable`), which is
 * the point: the second one exercises it through the Durable Object adapter,
 * which is where the import will actually run. A round trip that works on
 * node:sqlite and not on the adapter would be a migration that fails on the
 * day, with the Fly machine already turned off.
 */

import { strict as assert } from 'node:assert';
import { test, describe, beforeEach } from 'node:test';

import { openTestDb, type DB } from './db-node.ts';
import {
  columnsOf,
  exportTable,
  importBatch,
  importBatches,
  isEmptyDatabase,
  tablesInDatabase,
  tablesInDependencyOrder,
} from './import-service.ts';

const AT = '2026-11-02T00:00:00Z';
const count = (db: DB, table: string): number =>
  (db.prepare(`SELECT COUNT(*) AS n FROM "${table}"`).get() as unknown as { n: number }).n;

/** A database with something in it, across tables that reference each other. */
function seeded(): DB {
  const db = openTestDb();

  db.prepare('INSERT INTO users (id, display_name, locale, created_at) VALUES (?,?,?,?)')
    .run('u1', 'Nok', 'th', AT);
  db.prepare('INSERT INTO users (id, display_name, locale, created_at) VALUES (?,?,?,?)')
    .run('u2', 'ผู้ใช้ไทย', 'th', AT);
  db.prepare('INSERT INTO wallets (user_id, trip_points, green_points, exp) VALUES (?,?,?,?)')
    .run('u1', 120, 340, 500);
  db.prepare('INSERT INTO hosts (id, name, type) VALUES (?,?,?)')
    .run('h1', 'Samui Municipality', 'municipality');
  db.prepare(
    `INSERT INTO ledger (id, user_id, label, occurred_at, host, amount, kind, currency, exp, source_ref)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
  ).run('l1', 'u1', 'Checked in · Lamai', AT, 'h1', 25, 'checkin', 'green', 25, 'ref-1');
  db.prepare(
    `INSERT INTO places (id, name_en, name_th, short, layer, lat, lng, meta, blurb_en, blurb_th,
       safety_label_en, safety_label_th, crowd_density, aqi, safety_index, walkability)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run('p1', 'Lamai Beach', 'หาดละไม', 'Beach', 'nature', 9.47, 100.05, '{}',
    'A beach.', 'ชายหาด', 'Safe', 'ปลอดภัย', 0.3, 18, 0.9, 0.7);

  /*
    A BLOB, because story media lives in the row rather than on a disk and a
    migration that dropped it would lose every clip while every count still
    matched. 300 bytes of every value 0-255, so a byte mangled anywhere in the
    base64 round trip shows up.
  */
  const blob = new Uint8Array(300).map((_, i) => i % 256);
  db.prepare(
    `INSERT INTO stories (id, place_id, user_id, kind, caption, media_path, media_mime,
       poster_path, duration_s, status, created_at, expires_at, media_blob, poster_blob)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run('s1', 'p1', 'u1', 'video', 'low tide', 'stories/s1.mp4', 'video/mp4',
    'stories/s1.poster.jpg', 8.2, 'approved', AT, AT, blob, blob);

  return db;
}

describe('the order tables go in', () => {
  let db: DB;
  beforeEach(() => { db = openTestDb(); });

  test('every table is included, exactly once', () => {
    const order = tablesInDependencyOrder(db);
    assert.deepEqual([...order].sort(), [...tablesInDatabase(db)].sort());
    assert.equal(new Set(order).size, order.length);
  });

  test('a parent always comes before its child', () => {
    /*
      The property the whole import depends on. Foreign keys are ON in Durable
      Object SQLite, so a child inserted first is simply rejected - and this is
      checked against the schema's own foreign keys rather than a list someone
      maintains, because 63 tables and 74 keys is a list that rots.
    */
    const order = tablesInDependencyOrder(db);
    const position = new Map(order.map((t, i) => [t, i]));
    for (const table of order) {
      const parents = (
        db.prepare('SELECT "table" AS t FROM pragma_foreign_key_list(?)').all(table) as unknown as
          { t: string }[]
      ).map((r) => r.t).filter((t) => t !== table && position.has(t));
      for (const p of parents) {
        assert.ok(
          position.get(p)! < position.get(table)!,
          `${p} must come before ${table}, but came at ${position.get(p)} vs ${position.get(table)}`,
        );
      }
    }
  });

  test('users comes before wallets and before the ledger', () => {
    // A named case, so a failure reads as something rather than as an index.
    const order = tablesInDependencyOrder(db);
    assert.ok(order.indexOf('users') < order.indexOf('wallets'));
    assert.ok(order.indexOf('users') < order.indexOf('ledger'));
  });
});

describe('a whole database, round-tripped', () => {
  test('every table arrives with the same number of rows', () => {
    const src = seeded();
    const dest = openTestDb();
    const order = tablesInDependencyOrder(src);

    const reports = importBatches(dest, order.map((t) => exportTable(src, t)));

    for (const t of order) {
      assert.equal(count(dest, t), count(src, t), `${t} differs`);
    }
    // And the report said so, rather than the test having to count for it.
    const inserted = reports.reduce((n, r) => n + r.inserted, 0);
    assert.equal(inserted, order.reduce((n, t) => n + count(src, t), 0));
  });

  test('the values arrive, not just the row counts', () => {
    const src = seeded();
    const dest = openTestDb();
    for (const t of tablesInDependencyOrder(src)) importBatch(dest, exportTable(src, t));

    // Spread into a plain object: node:sqlite rows have a null prototype, and
    // `deepEqual` counts that as a difference from a literal.
    const wallet = { ...(dest.prepare('SELECT trip_points, green_points, exp FROM wallets WHERE user_id=?')
      .get('u1') as unknown as { trip_points: number; green_points: number; exp: number }) };
    assert.deepEqual(wallet, { trip_points: 120, green_points: 340, exp: 500 });

    const place = dest.prepare('SELECT name_th, lat FROM places WHERE id=?').get('p1') as unknown as
      { name_th: string; lat: number };
    assert.equal(place.name_th, 'หาดละไม', 'Thai text survived');
    assert.equal(place.lat, 9.47, 'a REAL survived');

    const user = dest.prepare('SELECT display_name FROM users WHERE id=?').get('u2') as unknown as
      { display_name: string };
    assert.equal(user.display_name, 'ผู้ใช้ไทย');
  });

  test('a BLOB arrives byte for byte', () => {
    // Story media lives in the row. A migration that lost it would leave every
    // count matching and every clip a grey box.
    const src = seeded();
    const dest = openTestDb();
    for (const t of tablesInDependencyOrder(src)) importBatch(dest, exportTable(src, t));

    const got = dest.prepare('SELECT media_blob FROM stories WHERE id=?').get('s1') as unknown as
      { media_blob: Uint8Array };
    const bytes = new Uint8Array(got.media_blob);
    assert.equal(bytes.length, 300);
    for (let i = 0; i < 300; i += 1) assert.equal(bytes[i], i % 256, `byte ${i}`);
  });

  test('a NULL stays a NULL and does not become an empty string', () => {
    const src = seeded();
    const dest = openTestDb();
    for (const t of tablesInDependencyOrder(src)) importBatch(dest, exportTable(src, t));
    const r = dest.prepare('SELECT reviewed_at, duration_s FROM stories WHERE id=?')
      .get('s1') as unknown as { reviewed_at: string | null; duration_s: number };
    assert.equal(r.reviewed_at, null);
    assert.equal(r.duration_s, 8.2);
  });

  test('the idempotency constraint comes with the rows', () => {
    /*
      `ledger.source_ref` is UNIQUE and that uniqueness is what makes a reward
      award idempotent. An import that moved the rows but landed them somewhere
      the constraint was not enforced would pay twice on the first retry.
    */
    const src = seeded();
    const dest = openTestDb();
    for (const t of tablesInDependencyOrder(src)) importBatch(dest, exportTable(src, t));
    assert.throws(
      () => dest.prepare(
        `INSERT INTO ledger (id, user_id, label, occurred_at, host, amount, kind, currency, exp, source_ref)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
      ).run('l2', 'u1', 'again', AT, 'h1', 25, 'checkin', 'green', 25, 'ref-1'),
      /UNIQUE/i,
    );
  });

  test('importing in the WRONG order is refused, rather than silently orphaning', () => {
    // Proof that the ordering is load-bearing and not decoration.
    const src = seeded();
    const dest = openTestDb();
    assert.throws(
      () => importBatch(dest, exportTable(src, 'wallets')),
      /FOREIGN KEY/i,
      'a wallet without its user should be rejected',
    );
  });
});

describe('the guards', () => {
  test('a fresh database is empty; a seeded one is not', () => {
    assert.equal(isEmptyDatabase(openTestDb()), true);
    assert.equal(isEmptyDatabase(seeded()), false);
  });

  test('a table that does not exist is refused', () => {
    assert.throws(
      () => importBatch(openTestDb(), { table: 'nope', columns: ['a'], values: [['x']] }),
      /No such table/,
    );
  });

  test('a column that does not exist is refused', () => {
    assert.throws(
      () => importBatch(openTestDb(), { table: 'users', columns: ['nope'], values: [['x']] }),
      /No such column/,
    );
  });

  for (const nasty of [
    'users"; DROP TABLE users; --',
    'users; DROP TABLE users',
    "users'",
    '',
    'sqlite_master',
  ]) {
    test(`SQL in a table name is refused: ${JSON.stringify(nasty)}`, () => {
      /*
        Belt and braces. A batch cannot carry SQL by design - it names a table
        and binds values - but the table name does reach a statement as an
        identifier, so it is checked against a character class AND against the
        live schema. `sqlite_master` is in this list because it IS a real table
        and must still be refused.
      */
      assert.throws(
        () => importBatch(openTestDb(), { table: nasty, columns: ['id'], values: [['x']] }),
        /Unsafe table name|No such table/,
      );
    });
  }

  test('SQL in a column name is refused', () => {
    assert.throws(
      () => importBatch(openTestDb(), {
        table: 'users',
        columns: ['id"; DROP TABLE users; --'],
        values: [['x']],
      }),
      /Unsafe column name|No such column/,
    );
  });

  test('a row of the wrong width is refused before anything is inserted', () => {
    const db = openTestDb();
    assert.throws(
      () => importBatch(db, {
        table: 'users',
        columns: ['id', 'display_name', 'created_at'],
        values: [['u1', 'Nok', AT], ['u2', 'short']],
      }),
      /2 value\(s\) for 3 column\(s\)/,
    );
    assert.equal(count(db, 'users'), 0, 'the first row was not inserted either');
  });

  test('a batch naming no columns is refused', () => {
    assert.throws(
      () => importBatch(openTestDb(), { table: 'users', columns: [], values: [] }),
      /at least one column/,
    );
  });

  test('a failed batch leaves nothing behind', () => {
    // One transaction per batch. A half-applied batch would be the worst
    // outcome of all: a partial import that looks like a complete one.
    const db = openTestDb();
    assert.throws(() => importBatch(db, {
      table: 'users',
      columns: ['id', 'display_name', 'created_at'],
      // The second row repeats the first's primary key.
      values: [['u1', 'Nok', AT], ['u1', 'Again', AT]],
    }));
    assert.equal(count(db, 'users'), 0, 'the first row was rolled back with the second');
  });

  test('columnsOf refuses an unsafe name rather than interpolating it', () => {
    assert.throws(() => columnsOf(openTestDb(), 'users; DROP TABLE users'), /Unsafe table name/);
  });
});
