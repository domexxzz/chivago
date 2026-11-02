/**
 * A stand-in for Durable Object storage, built on `node:sqlite`.
 *
 * WHAT IT IS FOR. It lets the whole existing suite - 3,341 tests - run through
 * `do-storage.ts` on a developer machine and in CI, with no Cloudflare account
 * and no network. If the adapter's shape is wrong, the suite says so here
 * rather than after a deploy.
 *
 * WHAT MAKES IT HONEST. It does not merely accept what the shim sends; it
 * REFUSES exactly what real workerd refuses, with the same messages. Those
 * refusals were measured against workerd, not guessed:
 *
 *   PRAGMA journal_mode = ...   ->  not authorized: SQLITE_AUTH
 *   BEGIN / COMMIT / SAVEPOINT  ->  "please use ... transactionSync() instead"
 *
 * So a change to `do-storage.ts` that emits a statement Durable Objects reject
 * fails a test here. A permissive stand-in would have proved nothing.
 *
 * WHAT IT IS NOT. It is not a Durable Object, and it cannot be: `BEGIN` and
 * `SAVEPOINT` live in THIS file, which is the point - they are what the real
 * runtime implements behind `transactionSync()`, and they must appear nowhere
 * in the code that ships to it.
 */

import { DatabaseSync } from 'node:sqlite';

import {
  JOURNAL_MODE_PRAGMA,
  TRANSACTION_CONTROL,
  type DurableStorage,
  type SqlCursor,
} from './do-storage.ts';

/** The messages real workerd answers with, so the stand-in refuses alike. */
const SQLITE_AUTH = 'not authorized: SQLITE_AUTH';
const USE_TRANSACTION_SYNC =
  'To execute a transaction, please use the state.storage.transaction() or ' +
  'state.storage.transactionSync() APIs instead of the SQL BEGIN TRANSACTION ' +
  'or SAVEPOINT statements.';

/**
 * Durable Object storage refuses these however they arrive - alone, or buried
 * in a multi-statement batch. Checked before anything executes, because
 * workerd rejects the batch whole.
 *
 * The patterns come from `do-storage.ts` rather than being restated here, so
 * that what the adapter STRIPS and what the stand-in REFUSES can never drift
 * apart. If they drifted, the suite would pass against a rule the real
 * runtime does not hold.
 */
function refuseWhatDurableObjectsRefuse(query: string): void {
  JOURNAL_MODE_PRAGMA.lastIndex = 0;
  if (JOURNAL_MODE_PRAGMA.test(query)) throw new Error(SQLITE_AUTH);
  TRANSACTION_CONTROL.lastIndex = 0;
  if (TRANSACTION_CONTROL.test(query)) throw new Error(USE_TRANSACTION_SYNC);
}

/** A cursor whose rows are already in hand. The real one streams; nothing here depends on that. */
const cursorOver = <T>(rows: T[]): SqlCursor<T> => ({ toArray: () => rows });

/** Does this query text hold more than one statement? */
const isMultiStatement = (query: string): boolean =>
  query.replace(/;\s*$/, '').includes(';');

/**
 * Nesting depth, so `transactionSync` nests the way the measured runtime does:
 * the outermost owns BEGIN/COMMIT and an inner one uses a SAVEPOINT, so an
 * inner throw discards only its own work.
 */
let depth = 0;

export function standInStorage(db: DatabaseSync): DurableStorage {
  return {
    sql: {
      exec<T>(query: string, ...bindings: unknown[]): SqlCursor<T> {
        refuseWhatDurableObjectsRefuse(query);

        if (isMultiStatement(query)) {
          /*
            node:sqlite's `prepare` takes one statement, so a batch goes
            through `exec`, which takes no bindings. Real Durable Object
            storage applies bindings to the LAST statement of a batch; nothing
            in this codebase passes bindings with a batch, and guessing at it
            would be inventing behaviour the suite never exercises.
          */
          if (bindings.length > 0) {
            throw new Error('stand-in: bindings with a multi-statement batch are not modelled');
          }
          db.exec(query);
          return cursorOver<T>([]);
        }

        const statement = db.prepare(query);
        // `.all()` serves both queries and writes: node:sqlite answers a write
        // with an empty array, which is what the real cursor does too.
        return cursorOver(statement.all(...(bindings as never[])) as T[]);
      },
    },

    transactionSync<T>(fn: () => T): T {
      const level = depth;
      const nested = level > 0;
      const savepoint = `sp_stand_in_${level}`;

      db.exec(nested ? `SAVEPOINT ${savepoint}` : 'BEGIN IMMEDIATE');
      depth = level + 1;
      try {
        const out = fn();
        db.exec(nested ? `RELEASE ${savepoint}` : 'COMMIT');
        return out;
      } catch (err) {
        db.exec(nested ? `ROLLBACK TO ${savepoint}` : 'ROLLBACK');
        if (nested) db.exec(`RELEASE ${savepoint}`);
        throw err;
      } finally {
        depth = level;
      }
    },
  };
}

/** Reset the nesting counter. Tests that deliberately throw mid-transaction use it. */
export const resetStandInDepth = (): void => {
  depth = 0;
};
