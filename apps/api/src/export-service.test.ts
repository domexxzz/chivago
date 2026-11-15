/**
 * Reading a live database back out.
 *
 * This runs under BOTH drivers (`pnpm test` and `pnpm test:durable`), exactly
 * as `import-service.test.ts` does, and for the same reason: the second one
 * exercises it through the Durable Object adapter, which is where the export
 * actually runs. An export that worked on node:sqlite and not on the adapter
 * would be a backup path that only exists on a laptop - which is the situation
 * this code was written to end.
 *
 * The tests below are mostly about ONE property: a page boundary must not lose
 * a row. The pilot is being written to while it is read (the alarm expires
 * stories, sessions and link codes every thirty seconds), and a backup missing
 * somebody is worse than no backup, because it looks fine.
 */

import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

import { openTestDb, type DB } from './db-node.ts';
import {
  exportPage,
  exportTable,
  importBatch,
  rowCountOf,
  tablesInDependencyOrder,
} from './import-service.ts';
import {
  DEFAULT_EXPORT_ROWS,
  ExportRefused,
  MAX_EXPORT_ROWS,
  exportManifest,
  exportOnePage,
} from './export-service.ts';

const AT = '2026-11-02T00:00:00Z';
const count = (db: DB, table: string): number =>
  (db.prepare(`SELECT COUNT(*) AS n FROM "${table}"`).get() as unknown as { n: number }).n;

/** Seven travellers, so a page of two or three has boundaries to get wrong. */
function seeded(users = 7): DB {
  const db = openTestDb();
  db.prepare('INSERT INTO hosts (id, name, type) VALUES (?,?,?)')
    .run('h1', 'Samui Municipality', 'municipality');
  for (let i = 1; i <= users; i += 1) {
    db.prepare('INSERT INTO users (id, display_name, locale, created_at) VALUES (?,?,?,?)')
      .run(`u${i}`, `ผู้ใช้ ${i}`, 'th', AT);
    db.prepare('INSERT INTO wallets (user_id, trip_points, green_points, exp) VALUES (?,?,?,?)')
      .run(`u${i}`, i * 10, i * 20, i * 30);
    db.prepare(
      `INSERT INTO ledger (id, user_id, label, occurred_at, host, amount, kind, currency, exp, source_ref)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
    ).run(`l${i}`, `u${i}`, 'Checked in · Lamai', AT, 'h1', 25, 'checkin', 'green', 25, `ref-${i}`);
  }
  return db;
}

/** Every page of a table, followed the way a client has to follow them. */
function allPages(db: DB, table: string, limit: number): {
  rows: unknown[][];
  requests: number;
} {
  const rows: unknown[][] = [];
  let after: number | undefined;
  let requests = 0;
  for (;;) {
    const page = exportPage(db, table, { limit, afterRowid: after });
    requests += 1;
    rows.push(...page.batch.values);
    if (page.nextAfterRowid === null) return { rows, requests };
    after = page.nextAfterRowid;
    assert.ok(requests < 100, 'the cursor is not advancing');
  }
}

describe('paging through a table', () => {
  test('every row arrives exactly once, in pages smaller than the table', () => {
    const db = seeded();
    const { rows } = allPages(db, 'users', 2);
    assert.equal(rows.length, 7);
    const ids = rows.map((r) => r[0]);
    assert.deepEqual([...ids].sort(), ['u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7']);
    assert.equal(new Set(ids).size, 7, 'no row came twice');
  });

  test('a short page says there is nothing after it', () => {
    const db = seeded(3);
    const page = exportPage(db, 'users', { limit: 10 });
    assert.equal(page.batch.values.length, 3);
    assert.equal(page.nextAfterRowid, null);
  });

  test('a full page always hands back a cursor, even when it emptied the table', () => {
    /*
      Deliberate: knowing there is nothing after a full page would cost a
      second query every time, and the alternative - guessing - is how an
      export stops one row early. The cost is one empty request at the end.
    */
    const db = seeded(4);
    const first = exportPage(db, 'users', { limit: 4 });
    assert.equal(first.batch.values.length, 4);
    assert.ok(first.nextAfterRowid !== null, 'a full page does not claim to be the last');
    const second = exportPage(db, 'users', { limit: 4, afterRowid: first.nextAfterRowid! });
    assert.equal(second.batch.values.length, 0);
    assert.equal(second.nextAfterRowid, null);
  });

  test('an empty table is one empty page', () => {
    const db = openTestDb();
    const page = exportPage(db, 'users', { limit: DEFAULT_EXPORT_ROWS });
    assert.deepEqual(page.batch.values, []);
    assert.equal(page.nextAfterRowid, null);
    assert.deepEqual(page.batch.table, 'users');
    assert.ok(page.batch.columns.includes('id'), 'the columns come even with no rows');
  });
});

describe('the database is being written to while it is read', () => {
  test('a row deleted BEHIND the cursor does not cost the rows after it', () => {
    /*
      THE REASON THIS PAGES BY ROWID AND NOT BY OFFSET. Six sweeps run on the
      Durable Object's alarm every thirty seconds, deleting expired stories,
      sessions and link codes, so a delete during an export is the ordinary
      case rather than a thought experiment.
    */
    const db = seeded(6);
    const first = exportPage(db, 'users', { limit: 3 });
    assert.equal(first.batch.values.length, 3);

    // A sweep (or a `DELETE /profile`) takes a row that has already been read.
    db.prepare('DELETE FROM users WHERE id = ?').run('u1');

    const rest: unknown[] = [];
    let after = first.nextAfterRowid;
    while (after !== null) {
      const page = exportPage(db, 'users', { limit: 3, afterRowid: after });
      rest.push(...page.batch.values.map((r) => r[0]));
      after = page.nextAfterRowid;
    }
    assert.deepEqual(rest, ['u4', 'u5', 'u6'], 'nothing after the deletion was skipped');
  });

  test('and offset paging, the alternative, WOULD have skipped one', () => {
    /*
      The claim above is only worth making if the alternative really fails, so
      it is checked rather than asserted in a comment. `exportTable` keeps
      LIMIT/OFFSET on purpose - it reads a snapshot FILE that nothing can
      write - and this is precisely why the live route may not use it.
    */
    const db = seeded(6);
    const firstThree = exportTable(db, 'users', { limit: 3, offset: 0 }).values.map((r) => r[0]);
    assert.deepEqual(firstThree, ['u1', 'u2', 'u3']);
    db.prepare('DELETE FROM users WHERE id = ?').run('u1');
    const nextThree = exportTable(db, 'users', { limit: 3, offset: 3 }).values.map((r) => r[0]);
    assert.deepEqual(nextThree, ['u5', 'u6'], 'u4 fell through the gap the deletion opened');
  });

  test('a row written DURING the export is picked up, not refused', () => {
    // It lands above the cursor, which is the honest meaning of a snapshot
    // taken over a few seconds rather than in an instant.
    const db = seeded(3);
    const first = exportPage(db, 'users', { limit: 3 });
    db.prepare('INSERT INTO users (id, display_name, locale, created_at) VALUES (?,?,?,?)')
      .run('u-late', 'Arrived mid-export', 'en', AT);
    const next = exportPage(db, 'users', { limit: 3, afterRowid: first.nextAfterRowid! });
    assert.deepEqual(next.batch.values.map((r) => r[0]), ['u-late']);
  });
});

describe('a page is exactly what the import accepts', () => {
  test('a whole database, paged out and replayed, arrives row for row', () => {
    /*
      The end-to-end property the backup is for: pages in, pages out, no
      translation step. Pages of three, so most tables are chunked.
    */
    const src = seeded();
    const dest = openTestDb();

    for (const table of tablesInDependencyOrder(src)) {
      let after: number | undefined;
      for (;;) {
        const page = exportPage(src, table, { limit: 3, afterRowid: after });
        // Handed straight to the importer - no mapping, no rewrapping.
        if (page.batch.values.length > 0) importBatch(dest, page.batch);
        if (page.nextAfterRowid === null) break;
        after = page.nextAfterRowid;
      }
    }

    for (const table of tablesInDependencyOrder(src)) {
      assert.equal(count(dest, table), count(src, table), `${table} differs`);
    }
    const wallet = dest.prepare('SELECT trip_points, green_points, exp FROM wallets WHERE user_id=?')
      .get('u3') as unknown as { trip_points: number; green_points: number; exp: number };
    assert.deepEqual(
      { ...wallet },
      { trip_points: 30, green_points: 60, exp: 90 },
      'the values came too, not just the counts',
    );
    const user = dest.prepare('SELECT display_name FROM users WHERE id=?').get('u5') as unknown as
      { display_name: string };
    assert.equal(user.display_name, 'ผู้ใช้ 5', 'Thai text survived the round trip');
  });

  test('a BLOB survives a page byte for byte', () => {
    // Story media lives in the row. An export that lost it would leave every
    // count matching and every clip a grey box.
    const src = seeded(1);
    src.prepare(
      `INSERT INTO places (id, name_en, name_th, short, layer, lat, lng, meta, blurb_en, blurb_th,
         safety_label_en, safety_label_th, crowd_density, aqi, safety_index, walkability)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run('p1', 'Lamai Beach', 'หาดละไม', 'Beach', 'nature', 9.47, 100.05, '{}',
      'A beach.', 'ชายหาด', 'Safe', 'ปลอดภัย', 0.3, 18, 0.9, 0.7);
    const blob = new Uint8Array(300).map((_, i) => i % 256);
    src.prepare(
      `INSERT INTO stories (id, place_id, user_id, kind, caption, media_path, media_mime,
         poster_path, duration_s, status, created_at, expires_at, media_blob, poster_blob)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run('s1', 'p1', 'u1', 'video', 'low tide', 'stories/s1.mp4', 'video/mp4',
      'stories/s1.poster.jpg', 8.2, 'approved', AT, AT, blob, blob);

    const dest = openTestDb();
    for (const table of tablesInDependencyOrder(src)) {
      const page = exportPage(src, table, { limit: 500 });
      if (page.batch.values.length > 0) importBatch(dest, page.batch);
    }
    const got = dest.prepare('SELECT media_blob FROM stories WHERE id=?').get('s1') as unknown as
      { media_blob: Uint8Array };
    const bytes = new Uint8Array(got.media_blob);
    assert.equal(bytes.length, 300);
    for (let i = 0; i < 300; i += 1) assert.equal(bytes[i], i % 256, `byte ${i}`);
  });

  test('the cursor is not smuggled into the batch', () => {
    /*
      The rowid is read as an extra column to carry the cursor. If it reached
      `columns`, the importer would refuse the batch ("No such column") - or
      worse, a schema that happens to have such a column would take it.
    */
    const db = seeded(2);
    const page = exportPage(db, 'users', { limit: 1 });
    assert.deepEqual(page.batch.columns, ['id', 'display_name', 'locale', 'created_at']);
    assert.equal(page.batch.values[0]?.length, page.batch.columns.length);
    assert.ok(!page.batch.columns.some((c) => c.includes('rowid')));
  });
});

describe('the export never writes', () => {
  test('a full export leaves every count where it was, and no run record', () => {
    /*
      The import keeps `import_runs` because an interrupted import must be
      continuable. An interrupted export costs a retry, so it earns no state -
      and a backup path that writes to the thing it is backing up is a backup
      path that can damage it.
    */
    const db = seeded();
    const before = tablesInDependencyOrder(db).map((t) => [t, count(db, t)] as const);
    for (const [table] of before) {
      let after: number | undefined;
      for (;;) {
        const page = exportPage(db, table, { limit: 2, afterRowid: after });
        if (page.nextAfterRowid === null) break;
        after = page.nextAfterRowid;
      }
    }
    exportManifest(db);
    for (const [table, n] of before) assert.equal(count(db, table), n, `${table} changed`);
    assert.equal(count(db, 'import_runs'), 0, 'exporting did not open an import run');
  });
});

describe('the manifest', () => {
  test('counts what is there, table by table, and sums it', () => {
    const db = seeded();
    const manifest = exportManifest(db);
    const users = manifest.tables.find((t) => t.table === 'users');
    assert.equal(users?.rows, 7);
    assert.equal(manifest.tables.find((t) => t.table === 'wallets')?.rows, 7);
    assert.equal(manifest.tables.find((t) => t.table === 'proofs')?.rows, 0, 'empty tables listed');
    assert.equal(
      manifest.totalRows,
      manifest.tables.reduce((n, t) => n + t.rows, 0),
    );
    assert.equal(manifest.totalRows, 7 + 7 + 7 + 1, 'users, wallets, ledger and one host');
  });

  test('is in send order: a parent before its child', () => {
    // The manifest IS the plan for the restore, so its order is load-bearing.
    const db = seeded();
    const order = exportManifest(db).tables.map((t) => t.table);
    assert.ok(order.indexOf('users') < order.indexOf('wallets'));
    assert.ok(order.indexOf('users') < order.indexOf('ledger'));
    assert.deepEqual(order, tablesInDependencyOrder(db));
  });

  test('leaves out the tables an import may not write', () => {
    // Exporting something that cannot be imported would make a snapshot that
    // fails halfway through its own restore.
    const db = seeded();
    const order = exportManifest(db).tables.map((t) => t.table);
    assert.ok(!order.includes('import_runs'));
    assert.ok(!order.some((t) => t.startsWith('sqlite_') || t.startsWith('_cf_')));
  });

  test('records which schema the rows came out of', () => {
    // A restore into a different schema applies cleanly and loses whatever
    // column was added since. The number is how that is noticed.
    const manifest = exportManifest(seeded(1));
    assert.ok(Number.isInteger(manifest.schemaVersion));
    assert.ok(manifest.schemaVersion >= 1);
  });
});

describe('what the route will not export', () => {
  test('a table that does not exist is refused, by name', () => {
    assert.throws(
      () => exportOnePage(seeded(1), 'nope'),
      (err: Error) => err instanceof ExportRefused && /nope is not a table/.test(err.message),
    );
  });

  for (const table of ['import_runs', 'sqlite_master', 'sqlite_sequence']) {
    test(`${table} is refused although it is a real table`, () => {
      /*
        `import_runs` is the import guard's own bookkeeping and `sqlite_master`
        is the schema. The allow-list is derived from
        `tablesInDependencyOrder`, so the export and the import refuse exactly
        the same set and cannot drift apart.
      */
      assert.throws(() => exportOnePage(seeded(1), table), ExportRefused);
    });
  }

  test('SQL in a table name is refused', () => {
    for (const nasty of ['users"; DROP TABLE users; --', 'users; DROP TABLE users', "users'", '']) {
      assert.throws(() => exportOnePage(seeded(1), nasty), ExportRefused);
    }
  });

  test('a page size that is not a whole number of rows is refused', () => {
    const db = seeded(1);
    for (const rows of [0, -1, 1.5, Number.NaN]) {
      assert.throws(() => exportOnePage(db, 'users', { limit: rows }), ExportRefused);
    }
  });

  test('a page bigger than the import will take back is refused', () => {
    // A snapshot made of pages the importer rejects is not a backup.
    assert.throws(
      () => exportOnePage(seeded(1), 'users', { limit: MAX_EXPORT_ROWS + 1 }),
      (err: Error) => err instanceof ExportRefused && /at most/.test(err.message),
    );
  });

  test('a cursor that is not a whole number is refused', () => {
    const db = seeded(1);
    for (const after of [-1, 1.5, Number.NaN]) {
      assert.throws(() => exportOnePage(db, 'users', { afterRowid: after }), ExportRefused);
    }
  });

  test('with nothing asked for, a page is the default size', () => {
    const db = seeded(3);
    const page = exportOnePage(db, 'users');
    assert.equal(page.batch.values.length, 3);
    assert.equal(DEFAULT_EXPORT_ROWS, 500, 'the same default the batch exporter uses');
  });

  test('rowCountOf refuses an unsafe name rather than interpolating it', () => {
    assert.throws(() => rowCountOf(seeded(1), 'users; DROP TABLE users'), /Unsafe table name/);
  });
});
