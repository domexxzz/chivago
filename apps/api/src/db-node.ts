/**
 * Persistence, the Node half: a real SQLite file on a real disk.
 *
 * WHY IT IS ITS OWN FILE. `node:sqlite` does not exist on Cloudflare Workers
 * and is not provided by `nodejs_compat`. While `openDb` and `openTestDb` sat
 * beside the schema, every importer of `db.ts` dragged `node:sqlite` with it -
 * including, eventually, the Worker. Splitting is what makes a Workers bundle
 * possible at all; nothing else blocks it harder.
 *
 * It re-exports the whole of `db.ts`, so anything that wants BOTH halves - the
 * Node entry point, the seed scripts, and every test - imports this one module
 * and sees the same surface it always did.
 */

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { migrate } from './migrations.ts';
import { isPrimary } from './primary.ts';
import { standInStorage } from './do-storage-stand-in.ts';
import { SCHEMA, SCHEMA_2, openDurableDatabase, type DB } from './db.ts';

export * from './db.ts';

let instance: DB | null = null;

/** Open (and migrate) the database. Idempotent. */
export function openDb(path = process.env.CHIVAGO_DB ?? './data/chivago.db'): DB {
  if (instance) return instance;
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);

  /*
    Only the writer builds the schema.

    Under LiteFS every replica's filesystem refuses writes, so a replica
    running `db.exec(SCHEMA)` at boot fills its log with `read only replica`
    and, worse, looks like it started cleanly. It waits for the primary's
    tables to replicate instead.

    Without LiteFS `isPrimary()` is true and this is exactly what it always
    was - a single machine on a volume migrating itself.
  */
  if (isPrimary()) {
    db.exec(SCHEMA);
    db.exec(SCHEMA_2);
    const applied = migrate(db);
    if (applied.length > 0) console.log('[chivago] migrated:', applied.join(', '));
  } else {
    awaitSchema(db);
  }

  instance = db;
  return db;
}

/**
 * Block until the primary's tables arrive.
 *
 * A replica can open its database before replication has delivered anything,
 * and an empty file answers every query with "no such table" - which reads
 * downstream as an empty island rather than as a node that is not ready.
 * Better to hold the boot for a few seconds than to serve nothing
 * confidently.
 */
function awaitSchema(db: DB, tries = 60): void {
  for (let i = 0; i < tries; i += 1) {
    try {
      db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='places'").get();
      const ready = db.prepare(
        "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='places'",
      ).get() as unknown as { n: number };
      if (ready.n > 0) {
        if (i > 0) console.log(`[chivago] replica: schema arrived after ${i * 250}ms`);
        return;
      }
    } catch { /* not there yet */ }
    // Synchronous on purpose: nothing may query this database until it is real.
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
  }
  console.warn('[chivago] replica: schema never arrived; serving whatever is here');
}

/**
 * Fresh in-memory database, for tests. Never memoised.
 *
 * With `CHIVAGO_DB_DRIVER=durable` the same schema and the same migrations are
 * built through the Durable Object adapter instead, over the node:sqlite
 * stand-in. That is what lets the entire existing suite run against the
 * adapter without a Cloudflare account: `pnpm test:durable`.
 */
export function openTestDb(): DB {
  const sqlite = new DatabaseSync(':memory:');
  const db = process.env.CHIVAGO_DB_DRIVER === 'durable' ? viaDurableAdapter(sqlite) : sqlite;
  db.exec(SCHEMA);
  db.exec(SCHEMA_2);
  migrate(db);
  return db;
}

/**
 * Wrap a node:sqlite handle in the Durable Object adapter, for tests.
 *
 * This file is the Node driver - it already imports `node:sqlite`, `node:fs`
 * and the LiteFS check, none of which exist on Workers. The Worker entry point
 * will import `openDurableDatabase` from a module split out of here; it will
 * not reach this function or the stand-in.
 */
function viaDurableAdapter(sqlite: DatabaseSync): DB {
  return openDurableDatabase(standInStorage(sqlite), { migrate: false });
}


export function closeDb(): void {
  instance?.close();
  instance = null;
}

