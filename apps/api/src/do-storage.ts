/**
 * Durable Object SQLite, presented as the `DB` surface the rest of the API
 * already speaks.
 *
 * WHY THIS EXISTS. `prepare(` appears at 536 sites across 58 files, and across
 * all of them prepared statements use only three methods: `.get()`, `.run()`
 * and `.all()`. That is a narrow enough surface to re-present. Durable Object
 * storage (`ctx.storage.sql`) is SYNCHRONOUS, like `node:sqlite`, so it can be
 * re-presented without turning 536 call sites and every function above them
 * async. This file is the whole adaptation; no service or route changes.
 *
 * WHAT WAS MEASURED, not assumed. Run against real workerd (see
 * `do-storage.test.ts`, which runs the same assertions against the node:sqlite
 * stand-in):
 *
 *  - `PRAGMA journal_mode = WAL` is REFUSED: `not authorized: SQLITE_AUTH`.
 *    Durable Objects own their own durability, so the pragma has no job here
 *    and is dropped rather than ported.
 *  - `PRAGMA foreign_keys` WORKS, in both directions, and foreign keys are
 *    ON BY DEFAULT. `ON DELETE CASCADE` fires. This matters more than anything
 *    else in this file: the schema leans on cascade for PDPA erasure, and
 *    `reset-demo.ts` deletes children before parents in an order the foreign
 *    keys accept. Both keep working, and the two table-rebuild migrations that
 *    suspend enforcement with `PRAGMA foreign_keys = OFF` still can.
 *  - `BEGIN`, `COMMIT` and `SAVEPOINT` are REFUSED as SQL, with a message
 *    pointing at `transactionSync()` instead. So no SQL this file emits may
 *    contain them, and `exec()` strips the ones already written into
 *    `migrations.ts`.
 *  - `transactionSync()` NESTS, and an inner throw caught by the outer
 *    transaction discards ONLY the inner work. That is exactly the savepoint
 *    semantics `transact()` was built on, so re-entrancy survives unchanged.
 */

/** A cursor over one statement's results. The slice of it this port needs. */
export interface SqlCursor<T> {
  toArray(): T[];
}

/** `ctx.storage.sql`. */
export interface SqlStorage {
  exec<T = Record<string, unknown>>(query: string, ...bindings: unknown[]): SqlCursor<T>;
}

/** `ctx.storage`, as much of it as persistence needs. */
export interface DurableStorage {
  sql: SqlStorage;
  transactionSync<T>(fn: () => T): T;
}

/**
 * What `.run()` answers with.
 *
 * `number | bigint` because that is what node:sqlite answers with, and the
 * roughly twenty call sites that read `.changes` are already written against
 * it (`Number(res.changes ?? 0)`, `res.changes > 0`). Narrowing to `number`
 * here would stop `DatabaseSync` satisfying this interface.
 */
export interface RunResult {
  changes: number | bigint;
  lastInsertRowid: number | bigint;
}

/**
 * A prepared statement. Exactly the three methods the codebase uses - counted
 * across `apps/api/src`, there is no `iterate`, no `columns`, nothing else.
 *
 * Rows are `Record<string, unknown>` rather than `unknown`: call sites index
 * straight into a row (`.get()!.n`) as well as casting it, and both have to
 * keep compiling.
 */
export interface PreparedStatement {
  get(...bindings: unknown[]): Record<string, unknown> | undefined;
  all(...bindings: unknown[]): Record<string, unknown>[];
  run(...bindings: unknown[]): RunResult;
}

/**
 * The database surface. `DatabaseSync` satisfies this too, which is what lets
 * `DB` stay one type and `migrations.ts` keep taking either driver.
 */
export interface SyncDatabase {
  prepare(sql: string): PreparedStatement;
  exec(sql: string): void;
  close(): void;
}

/**
 * `PRAGMA journal_mode = ...`, which Durable Object storage answers with
 * `not authorized: SQLITE_AUTH`.
 *
 * Only this pragma. `PRAGMA foreign_keys` is deliberately NOT here: it works,
 * and two table-rebuild migrations in `migrations.ts` need it.
 */
export const JOURNAL_MODE_PRAGMA = /^[ \t]*PRAGMA[ \t]+journal_mode[ \t]*=[^;\n]*;?[ \t]*$/gim;

/**
 * Transaction control in SQL, which Durable Object storage refuses in favour
 * of `transactionSync()`.
 *
 * THE SEMICOLON IS LOAD-BEARING. `BEGIN ... END` is also how SQLite spells a
 * TRIGGER BODY, and `migrations.ts` has nine of them - the append-only guards
 * that stop a statement, a conclusion or a declaration being edited after the
 * fact. Durable Objects accept those triggers and fire them (measured), so
 * they must survive untouched. The two forms are told apart the way this
 * codebase writes them: transaction control is a statement, so it ends at a
 * `;`, while a trigger's `BEGIN` is followed by the body it opens.
 *
 *   BEGIN;                                  <- transaction, stripped
 *   COMMIT;                                 <- transaction, stripped
 *   BEGIN SELECT RAISE(ABORT, '...'); END;  <- trigger body, kept
 *
 * Line-anchored rather than split on semicolons, because a semicolon can sit
 * inside a string literal and this codebase writes one statement per line.
 */
export const TRANSACTION_CONTROL =
  /^[ \t]*(?:BEGIN(?:[ \t]+(?:IMMEDIATE|DEFERRED|EXCLUSIVE|TRANSACTION))?|COMMIT(?:[ \t]+TRANSACTION)?|ROLLBACK(?:[ \t]+TRANSACTION)?(?:[ \t]+TO(?:[ \t]+SAVEPOINT)?[ \t]+\w+)?|SAVEPOINT[ \t]+\w+|RELEASE(?:[ \t]+SAVEPOINT)?[ \t]+\w+)[ \t]*;[ \t]*$/gim;

/** Does this batch open its own transaction in SQL? */
const opensTransaction = (sql: string): boolean => {
  TRANSACTION_CONTROL.lastIndex = 0;
  return TRANSACTION_CONTROL.test(sql);
};

/**
 * Remove what the runtime will not accept.
 *
 * Dropping `BEGIN`/`COMMIT` would make a multi-statement rebuild non-atomic,
 * so `exec` puts the remainder inside `transactionSync()` instead - the same
 * guarantee by the means this runtime offers.
 */
export const stripUnsupported = (sql: string): string =>
  sql.replace(JOURNAL_MODE_PRAGMA, '').replace(TRANSACTION_CONTROL, '');

/** Is there anything left to run? */
const isBlank = (sql: string): boolean => /^[\s;]*$/.test(sql);

/**
 * Open the API's database on top of Durable Object storage.
 *
 * The schema is NOT built here. A Durable Object builds it once in its
 * constructor under `blockConcurrencyWhile`; see `openDb` in `db.ts`.
 */
export function openDurableDb(storage: DurableStorage): SyncDatabase {
  const run = (sql: string, bindings: unknown[]): RunResult => {
    storage.sql.exec(sql, ...bindings).toArray();
    /*
      `changes()` rather than the cursor's `rowsWritten`.

      Twenty-odd call sites read `.changes` to decide whether a row existed -
      "did this DELETE remove anything", "did this UPDATE match". `rowsWritten`
      is a billing counter: it counts rows written, which for a cascading
      delete includes the children. `changes()` is SQLite's own answer to the
      question those call sites are asking, and costs one more statement.
    */
    const counted = storage.sql
      .exec<{ changes: number; rowid: number }>(
        'SELECT changes() AS changes, last_insert_rowid() AS rowid',
      )
      .toArray()[0];
    return { changes: Number(counted?.changes ?? 0), lastInsertRowid: Number(counted?.rowid ?? 0) };
  };

  return {
    prepare(sql: string): PreparedStatement {
      // Durable Object storage has no prepare step of its own; it caches
      // compiled statements by query text. So a "prepared statement" here is
      // the text plus the three ways this codebase runs it.
      return {
        get: (...bindings) => storage.sql.exec(sql, ...bindings).toArray()[0],
        all: (...bindings) => storage.sql.exec(sql, ...bindings).toArray(),
        run: (...bindings) => run(sql, bindings),
      };
    },

    exec(sql: string): void {
      const cleaned = stripUnsupported(sql);
      if (isBlank(cleaned)) return;
      if (opensTransaction(sql)) {
        // The batch asked to be atomic. It still is - by the one mechanism
        // this runtime allows.
        storage.transactionSync(() => {
          storage.sql.exec(cleaned).toArray();
        });
        return;
      }
      storage.sql.exec(cleaned).toArray();
    },

    close(): void {
      // A Durable Object's storage outlives any handle to it. Nothing to close.
    },
  };
}

/**
 * Which databases are Durable-Object-backed, and how to transact on them.
 *
 * A registry rather than a method on `SyncDatabase`, so that a bare
 * `DatabaseSync` still satisfies `DB` - `migrations.test.ts` builds one
 * directly and passes it to `migrate()`.
 */
const durable = new WeakMap<object, DurableStorage>();

export const registerDurable = (db: SyncDatabase, storage: DurableStorage): void => {
  durable.set(db, storage);
};

export const durableStorageFor = (db: object): DurableStorage | undefined => durable.get(db);
