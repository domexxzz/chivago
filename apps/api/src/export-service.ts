/**
 * Reading a live Durable Object's database back out.
 *
 * WHY THIS HAS TO EXIST. `import-service.ts` explains that a Durable Object's
 * SQLite is not a file anyone can upload. The same sentence read the other way
 * is worse: it is not a file anyone can DOWNLOAD either. There is no
 * `wrangler do export`, no `fly ssh sftp get`, and on 12 November the pilot
 * moved from a volume - where a backup was a file copy - into an object where
 * the only copy of its data is the object itself. The import half was built
 * for the move and the export half was not built at all, which left a pilot
 * with 339 people in it and no way to take a snapshot.
 *
 * SO THE ROWS COME OUT THE WAY THEY WENT IN. A page of an export IS an
 * `ImportBatch`, byte for byte what `POST /admin/import` accepts, in the order
 * `tablesInDependencyOrder` already computes. A snapshot can therefore be
 * replayed into an empty object with the loop that is already in `docs/71`,
 * and there is no translation step to be wrong.
 *
 * IT NEVER WRITES. Not the rows, not a bookkeeping table, not a counter. The
 * import has `import_runs` because an interrupted import must be continuable;
 * an interrupted export costs a retry and nothing else, so it earns no state -
 * and a read-only backup path is one that cannot damage what it is protecting.
 *
 * ITS OWN SECRET, NOT THE IMPORT'S. `CHIVAGO_IMPORT_TOKEN` is meant to be
 * DELETED once a migration is over (`docs/71` step 3d, and deleting it is what
 * removes the route). A backup is not a migration: it happens again next week.
 * Gating the export on the import token would mean arming the write door every
 * time somebody wanted a copy, which is exactly backwards.
 */

import { exportPage, rowCountOf, tablesInDependencyOrder, type ExportPage } from './import-service.ts';
import { SCHEMA_VERSION, type DB } from './db.ts';

/**
 * Rows per page, by default.
 *
 * The same 500 `export-for-import.ts` uses, for the same reason: the number
 * that matters is BYTES and the number that is easy to count is rows. A row of
 * `wallets` is tens of bytes and a row of `stories` carries video, so 500 is
 * right for most of the schema and wrong for one table. Hence the override.
 */
export const DEFAULT_EXPORT_ROWS = 500;

/**
 * The most rows one page may carry.
 *
 * Not a politeness limit. The page has to be something `POST /admin/import`
 * will accept on the way back in, and that route refuses more than 5,000 rows
 * - a snapshot made of pages the importer rejects is not a backup. It is also
 * one synchronous read inside an object that serves nothing else while it
 * runs.
 */
export const MAX_EXPORT_ROWS = 5_000;

/** What the whole database looks like from outside, before a byte is moved. */
export interface ExportManifest {
  takenAt: string;
  /**
   * Which schema these rows came out of.
   *
   * A snapshot restored into an object running a DIFFERENT schema is the
   * failure that looks like success - the batches apply, a column that was
   * added since is simply absent from the rows and silently default or null.
   * Written down so a restore can check rather than assume.
   */
  schemaVersion: number;
  /** Parents first: the order the batches must be sent back in. */
  tables: { table: string; rows: number }[];
  totalRows: number;
  defaultRows: number;
  maxRows: number;
}

/**
 * Every table and how many rows it holds, in the order an import needs them.
 *
 * This is also the only honest way to CHECK a snapshot. A backup you have not
 * counted is a backup you are hoping about, and the counts have to come from
 * the live system rather than from the file that is being checked - a
 * truncated download agrees with itself.
 */
export function exportManifest(db: DB, now = new Date()): ExportManifest {
  const tables = tablesInDependencyOrder(db).map((table) => ({
    table,
    rows: rowCountOf(db, table),
  }));
  return {
    takenAt: now.toISOString(),
    schemaVersion: SCHEMA_VERSION,
    tables,
    totalRows: tables.reduce((n, t) => n + t.rows, 0),
    defaultRows: DEFAULT_EXPORT_ROWS,
    maxRows: MAX_EXPORT_ROWS,
  };
}

/** A caller asked for something this route will not answer. */
export class ExportRefused extends Error {}

/**
 * One page of one table, with the request checked first.
 *
 * THE ALLOW-LIST IS DERIVED, not written down: a table is exportable exactly
 * when `tablesInDependencyOrder` includes it, which is the same list the
 * import will accept and already excludes `import_runs`, Cloudflare's own
 * `_cf_*` tables and `sqlite_*`. Asking the question once means the two halves
 * cannot drift into exporting something that cannot be imported.
 */
export function exportOnePage(
  db: DB,
  table: string,
  opts: { limit?: number; afterRowid?: number } = {},
): ExportPage {
  if (!tablesInDependencyOrder(db).includes(table)) {
    // Named, because an operator mid-backup needs to know whether they
    // mistyped a table or asked for one that is nobody's business.
    throw new ExportRefused(`${table} is not a table this database exports`);
  }
  const limit = opts.limit ?? DEFAULT_EXPORT_ROWS;
  if (!Number.isInteger(limit) || limit < 1) {
    throw new ExportRefused(`rows must be a whole number of at least 1, not ${limit}`);
  }
  if (limit > MAX_EXPORT_ROWS) {
    throw new ExportRefused(
      `rows may be at most ${MAX_EXPORT_ROWS} - more than the import route will take back.`,
    );
  }
  if (opts.afterRowid !== undefined
      && (!Number.isInteger(opts.afterRowid) || opts.afterRowid < 0)) {
    throw new ExportRefused(`after must be a whole number of at least 0, not ${opts.afterRowid}`);
  }
  return exportPage(db, table, { limit, afterRowid: opts.afterRowid });
}
