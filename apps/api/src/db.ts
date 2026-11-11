/**
 * Persistence. Uses node:sqlite (built into Node 22+), so the API has no native
 * build step and runs anywhere Node runs - including a Windows dev machine and
 * a small VPS on the island.
 *
 * SQLite is the right call for the pilot: single-region, read-heavy, a few
 * thousand users. The schema is deliberately plain SQL so the move to Postgres
 * later is a dump-and-load, not a rewrite.
 */

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { migrate } from './migrations.ts';
import { isPrimary } from './primary.ts';
import {
  durableStorageFor,
  openDurableDb,
  registerDurable,
  type DurableStorage,
  type SyncDatabase,
} from './do-storage.ts';
import { standInStorage } from './do-storage-stand-in.ts';

// The schema and the Durable Object opener live in `schema.ts`, which has
// nothing from Node in it so a Worker can import them. Re-exported here
// because every existing caller imports them from this file.
import { SCHEMA, SCHEMA_2, openDurableDatabase } from './schema.ts';

export { openDurableDatabase };

/**
 * The database, as the codebase uses it: `prepare`, `exec`, `close`, and on a
 * statement `get`/`run`/`all`. Counted across `apps/api/src`, that is the
 * WHOLE surface - nothing calls anything else.
 *
 * It was `DatabaseSync` and is now the structural type `DatabaseSync` already
 * satisfies, so every existing call site and signature is unchanged while a
 * second driver (Durable Object storage, see `do-storage.ts`) can also be a
 * `DB`.
 */
export type DB = SyncDatabase;

/**
 * Schema.
 *
 * Design notes that matter:
 *  - `wallets.trip_points` / `wallets.green_points` are the ONLY places a point
 *    total lives. Never derived on the client, never written by the client.
 *  - `ledger.source_ref` is UNIQUE. That is what makes the reward award
 *    idempotent: a retried verification callback hits the constraint and does
 *    nothing rather than paying twice.
 *  - `quest_progress` is keyed (user, quest) so re-joining is a no-op.
 *  - Times are ISO-8601 UTC strings. SQLite has no date type and storing text
 *    keeps the dumps human-readable.
 */

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

/**
 * Nesting depth per database handle. SQLite has no nested BEGIN, so an inner
 * `transact` must join the outer one rather than starting its own.
 */
const depth = new WeakMap<DB, number>();

/**
 * Run `fn` inside a transaction, rolling back on any throw.
 *
 * Point movements MUST go through this - a debit without its ledger row, or a
 * ledger row without its debit, is a support ticket nobody can reconcile.
 *
 * RE-ENTRANT. Services compose: redeeming an offer wraps `spendOnVoucher`,
 * which transacts internally. The outermost call owns BEGIN/COMMIT; inner calls
 * use SAVEPOINTs, so an inner failure rolls back only its own work and an outer
 * failure still discards everything. A plain BEGIN here would throw
 * "cannot start a transaction within a transaction" the moment two services
 * compose - which is exactly what happened the first time this ran.
 */
export function transact<T>(db: DB, fn: () => T): T {
  /*
    Durable Object storage refuses BEGIN and SAVEPOINT as SQL and offers
    `transactionSync()` instead - which, measured against workerd, NESTS, and
    on an inner throw caught by the outer transaction discards only the inner
    work. That is the same guarantee the savepoints below give, so re-entrancy
    needs no special handling: hand the nesting to the runtime that owns it.
  */
  const storage = durableStorageFor(db);
  if (storage) return storage.transactionSync(fn);

  const level = depth.get(db) ?? 0;
  const nested = level > 0;
  const savepoint = `sp_${level}`;

  db.exec(nested ? `SAVEPOINT ${savepoint}` : 'BEGIN IMMEDIATE');
  depth.set(db, level + 1);
  try {
    const out = fn();
    db.exec(nested ? `RELEASE ${savepoint}` : 'COMMIT');
    return out;
  } catch (err) {
    db.exec(nested ? `ROLLBACK TO ${savepoint}` : 'ROLLBACK');
    if (nested) db.exec(`RELEASE ${savepoint}`);
    throw err;
  } finally {
    depth.set(db, level);
  }
}

/**
 * Row-type helpers for the node:sqlite boundary.
 *
 * The driver returns `Record<string, SQLOutputValue>`, which does not overlap
 * with a named row interface, so a cast is unavoidable where SQL meets types.
 * It is centralised here rather than repeated at twenty call sites, and it
 * gives one place to add runtime validation if a schema drift ever bites.
 */
export const rows = <T>(result: unknown): T[] => result as T[];
export const row = <T>(result: unknown): T | undefined => result as T | undefined;
