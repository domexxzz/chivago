/**
 * Replaying a database into a Durable Object.
 *
 * WHY THIS HAS TO EXIST. A Durable Object's SQLite is not a file anyone can
 * upload. There is no `wrangler do import`; D1's `--file` does not apply; the
 * storage is reachable only from inside the object. So the only way to move
 * the pilot's database there is to send the ROWS through the object and insert
 * them, which is what `docs/71-moving-the-data-to-cloudflare.md` calls the
 * hardest step and the one with no tool. This is the tool.
 *
 * ROWS, NOT SQL. The obvious approach is `sqlite3 .dump` and replaying the
 * statements, and it is the wrong one: it puts arbitrary SQL - including DDL,
 * including DROP - on a wire into a live database, authenticated by one
 * secret. Instead a batch names a table and carries values, every identifier
 * is checked against the LIVE schema before it is used, and every value is
 * bound as a parameter. Nothing in a batch can create, alter or drop anything.
 *
 * ORDER MATTERS, because foreign keys are ON in Durable Object SQLite
 * (measured, see `do-storage.ts`) and the schema uses `ON DELETE CASCADE`
 * widely. A child inserted before its parent is rejected, so the tables are
 * sorted by their own foreign keys rather than by a hand-written list that
 * would rot - there are 63 tables and 74 foreign keys between them.
 */

import { rows, row, transact, type DB } from './db.ts';

/** One table's worth of rows. Arrays, not objects: 100k rows should not carry 100k copies of the column names. */
export interface ImportBatch {
  table: string;
  columns: string[];
  /** Row-major. Each inner array lines up with `columns`. */
  values: ImportValue[][];
}

/**
 * What a cell may be.
 *
 * `{ $b64 }` is how a BLOB survives JSON - the stories table keeps media bytes
 * in `media_blob`, and the local guide tables keep images, so this is not
 * hypothetical. Anything else JSON cannot carry would be a silent truncation,
 * which is why the encoding is explicit and tagged rather than implied.
 */
export type ImportValue = string | number | boolean | null | { $b64: string };

/** A table name or column name this code is willing to put in a statement. */
const SAFE_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Tables a batch may NEVER name, however real they are.
 *
 * `import_runs` is the guard's own bookkeeping. A batch that could write it
 * could forge an open run - and a snapshot taken from a database that was
 * itself mid-import would carry one across and prop the door open on the far
 * side without anybody doing anything wrong.
 *
 * `_cf_` is Cloudflare's: a Durable Object keeps its own tables in the same
 * database, and they are nobody's business here.
 */
const NEVER_IMPORTED = (table: string): boolean =>
  table === 'import_runs' || table.startsWith('_cf_') || table.startsWith('sqlite_');

/** Every real table in the database, as it is right now. */
export function tablesInDatabase(db: DB): string[] {
  return rows<{ name: string }>(
    db
      .prepare(
        `SELECT name FROM sqlite_master
          WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
          ORDER BY name`,
      )
      .all(),
  ).map((r) => r.name);
}

/** A table's columns, in declaration order. */
export function columnsOf(db: DB, table: string): string[] {
  if (!SAFE_IDENTIFIER.test(table)) throw new Error(`Unsafe table name: ${JSON.stringify(table)}`);
  return rows<{ name: string }>(
    db.prepare(`SELECT name FROM pragma_table_info(?)`).all(table),
  ).map((r) => r.name);
}

/** Which tables this one points at, ignoring self-references. */
function parentsOf(db: DB, table: string): string[] {
  const refs = rows<{ table: string }>(
    db.prepare(`SELECT "table" FROM pragma_foreign_key_list(?)`).all(table),
  ).map((r) => r.table);
  return [...new Set(refs)].filter((t) => t !== table);
}

/**
 * Tables with parents before children.
 *
 * Derived from the schema's own foreign keys rather than written down, because
 * a hand-written order of 63 tables is a list that silently rots the next time
 * somebody adds a table - and the symptom would be an import that fails
 * halfway through, on a constraint, with no obvious cause.
 *
 * A SELF-REFERENCE is ignored: a row pointing at another row in its own table
 * is an ordering problem inside one batch, not between tables, and none of
 * this schema's self-references are NOT NULL.
 *
 * A genuine CYCLE between two tables cannot be ordered, and this throws rather
 * than picking arbitrarily - an import that began in the wrong order would
 * fail partway and leave somebody guessing.
 */
export function tablesInDependencyOrder(db: DB): string[] {
  /*
    Tables an import may never write are left out here rather than filtered by
    every caller. The exporter would otherwise produce a batch for
    `import_runs` that the importer is obliged to refuse - a file whose only
    purpose is to fail halfway through a migration at two in the morning.
  */
  const all = tablesInDatabase(db).filter((t) => !NEVER_IMPORTED(t));
  const parents = new Map(all.map((t) => [t, parentsOf(db, t).filter((p) => all.includes(p))]));

  const ordered: string[] = [];
  const placed = new Set<string>();

  // Kahn's algorithm, by repeated sweeps: small n, and a sweep that places
  // nothing means what is left is a cycle.
  while (ordered.length < all.length) {
    const ready = all.filter(
      (t) => !placed.has(t) && parents.get(t)!.every((p) => placed.has(p)),
    );
    if (ready.length === 0) {
      const stuck = all.filter((t) => !placed.has(t));
      throw new Error(
        `Cannot order these tables - their foreign keys form a cycle: ${stuck.join(', ')}`,
      );
    }
    for (const t of ready) {
      ordered.push(t);
      placed.add(t);
    }
  }
  return ordered;
}

/** A cell, on its way out. */
const encodeValue = (v: unknown): ImportValue => {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v;
  if (typeof v === 'bigint') {
    /*
      A bigint that does not fit a double would be corrupted by JSON, so it
      goes as a decimal STRING and SQLite coerces it back on insert into an
      INTEGER column. Nothing in this schema stores an id that large, but a
      silent change of value is not a thing to leave to chance.
    */
    return v.toString();
  }
  if (v instanceof Uint8Array) return { $b64: bytesToBase64(v) };
  if (v instanceof ArrayBuffer) return { $b64: bytesToBase64(new Uint8Array(v)) };
  throw new Error(`Cannot encode a value of type ${Object.prototype.toString.call(v)}`);
};

/** A cell, on its way in. */
const decodeValue = (v: ImportValue): unknown => {
  if (v !== null && typeof v === 'object' && '$b64' in v) {
    /*
      `atob` stringifies whatever it is given, so `{"$b64": null}` decodes to
      three bytes of rubbish and `{"$b64": 123}` to two - a silently corrupted
      BLOB rather than an error. Checked, not trusted.
    */
    if (typeof v.$b64 !== 'string') throw new Error('A $b64 value must be a string');
    return base64ToBytes(v.$b64);
  }
  if (typeof v === 'boolean') return v ? 1 : 0;
  return v;
};

/*
  Base64 by hand, because this runs on both runtimes and `Buffer` is Node's.
  `atob`/`btoa` exist on Workers and in Node, but they are byte-oriented, so
  the conversion goes through latin1 where each code unit is one byte.
*/
function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  // In chunks: spreading a megabyte of bytes into apply() overflows the stack.
  const CHUNK = 8 * 1024;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

/** Read one table out, for an export. */
export function exportTable(
  db: DB,
  table: string,
  opts: { limit?: number; offset?: number } = {},
): ImportBatch {
  const columns = columnsOf(db, table);
  if (columns.length === 0) throw new Error(`No such table: ${table}`);
  const quoted = columns.map((c) => `"${c}"`).join(', ');
  const limit = opts.limit ?? -1;
  const offset = opts.offset ?? 0;
  /*
    ORDER BY rowid, because the chunks are read with LIMIT/OFFSET and an
    unordered SELECT is only stable by accident. The snapshot is read-only, so
    in practice it did not move - but "in practice" is not a property, and a
    chunk boundary that skipped or repeated a row would be invisible until the
    counts were compared at the very end.
  */
  const found = rows<Record<string, unknown>>(
    db.prepare(`SELECT ${quoted} FROM "${table}" ORDER BY rowid LIMIT ? OFFSET ?`).all(limit, offset),
  );
  return batchOf(table, columns, found);
}

/** Rows into a batch. The one place a cell is encoded, however it was read. */
const batchOf = (
  table: string,
  columns: string[],
  found: Record<string, unknown>[],
): ImportBatch => ({
  table,
  columns,
  values: found.map((r) => columns.map((c) => encodeValue(r[c]))),
});

/**
 * One page of a table, and where the next page starts.
 *
 * `nextAfterRowid` is null only when this page came back SHORT of its limit,
 * which is the only cheap proof that there is nothing after it. A full page
 * always hands back a cursor, so an exact multiple of the page size costs one
 * empty request at the end rather than a guess.
 */
export interface ExportPage {
  batch: ImportBatch;
  nextAfterRowid: number | null;
}

/**
 * Read one page of a table, for an export of a LIVE database.
 *
 * WHY NOT LIMIT/OFFSET, which `exportTable` uses. OFFSET counts rows that are
 * still there. `exportTable` reads a snapshot file that nothing can write, so
 * counting is safe there; this reads the pilot while it is serving, and the
 * alarm runs six sweeps - expiring stories, sessions and link codes - every
 * thirty seconds. A row deleted BEHIND the cursor shifts every later offset
 * down by one and the next page silently skips a row. The symptom would be a
 * backup that restores, passes every constraint, and is missing somebody.
 *
 * A rowid cursor cannot skip: rows already read are below it whether they
 * still exist or not. Rows written DURING the export land above the cursor
 * and are picked up; rows deleted during it are simply absent, which is the
 * ordinary meaning of a backup taken at a moment rather than an instant.
 *
 * It reads. There is no statement here that writes anything - that is the
 * whole contract of this route, over a database holding 339 real people.
 */
export function exportPage(
  db: DB,
  table: string,
  opts: { limit: number; afterRowid?: number },
): ExportPage {
  const columns = columnsOf(db, table);
  if (columns.length === 0) throw new Error(`No such table: ${table}`);
  if (!Number.isInteger(opts.limit) || opts.limit < 1) {
    throw new Error(`A page must be at least one row, not ${JSON.stringify(opts.limit)}`);
  }
  const quoted = columns.map((c) => `"${c}"`).join(', ');
  /*
    The cursor comes back as a column, so it needs a name no real column has.
    `rowid` itself would collide with the alias of an INTEGER PRIMARY KEY, and
    a schema is free to hold a column called `_rowid`, so the name is widened
    until it is unused rather than asserted to be safe.
  */
  let cursor = '_rowid';
  while (columns.includes(cursor)) cursor += '_';
  // Rowids start at 1, so 0 is "from the beginning" and needs no second query.
  const after = opts.afterRowid ?? 0;
  const found = rows<Record<string, unknown>>(
    db
      .prepare(
        `SELECT rowid AS "${cursor}", ${quoted} FROM "${table}"
          WHERE rowid > ? ORDER BY rowid LIMIT ?`,
      )
      .all(after, opts.limit),
  );
  const last = found.at(-1);
  return {
    batch: batchOf(table, columns, found),
    // Short page: nothing follows it. Full page: here is where to carry on.
    nextAfterRowid: last === undefined || found.length < opts.limit
      ? null
      : Number(last[cursor]),
  };
}

/** How many rows a table holds, right now. */
export function rowCountOf(db: DB, table: string): number {
  if (!SAFE_IDENTIFIER.test(table)) throw new Error(`Unsafe table name: ${JSON.stringify(table)}`);
  if (!tablesInDatabase(db).includes(table)) throw new Error(`No such table: ${table}`);
  return row<{ n: number }>(db.prepare(`SELECT COUNT(*) AS n FROM "${table}"`).get())?.n ?? 0;
}

/**
 * Is this database untouched?
 *
 * `users` is the right table to ask: everything else cascades from it.
 */
export function isEmptyDatabase(db: DB): boolean {
  const n = row<{ n: number }>(db.prepare('SELECT COUNT(*) AS n FROM users').get())?.n ?? 0;
  return n === 0;
}

/** The import that is under way, if one is. */
export interface ImportRun {
  id: string;
  started_at: string;
  last_batch_at: string | null;
  batches: number;
}

export function openImportRun(db: DB): ImportRun | undefined {
  return row<ImportRun>(
    db
      .prepare(
        `SELECT id, started_at, last_batch_at, batches FROM import_runs
          WHERE finished_at IS NULL ORDER BY started_at LIMIT 1`,
      )
      .get(),
  );
}

/** Has an import ever been completed here? */
export const anyFinishedRun = (db: DB): boolean =>
  (row<{ n: number }>(
    db.prepare('SELECT COUNT(*) AS n FROM import_runs WHERE finished_at IS NOT NULL').get(),
  )?.n ?? 0) > 0;

/**
 * How long an open run may go quiet before it stops counting.
 *
 * An abandoned run used to hold the door open for ever: while one existed, any
 * holder of the token could insert into ANY table at any time - `device_keys`,
 * `host_sessions`, `user_accounts` among them, which is account takeover with
 * extra steps. A real import sends its batches minutes apart, so six hours is
 * generous for the operation and short for an attacker who has to wait.
 */
export const RUN_GOES_STALE_AFTER_MS = 6 * 60 * 60 * 1000;

/**
 * Tables whose contents only REAL USE creates.
 *
 * The point of the guard is to refuse a LIVE database, and "does `users` have
 * a row" turned out to be the wrong question - see `importBlockers`. These are
 * the tables that cannot fill up by accident: a ledger entry, a registered
 * account, a submitted proof, a posted story, an issued voucher, a fired SOS,
 * a written review. Any one of them means somebody was really using this.
 */
const SUBSTANTIVE_TABLES: ReadonlyArray<readonly [table: string, where: string]> = [
  /*
    The ledger, EXCEPT the opening balance.

    `grantOpeningBalance` writes `source_ref = 'opening:<currency>:<user>'`
    for an account the moment it is provisioned, so on a deployment that still
    hands out a pilot balance a single anonymous request creates ledger rows -
    and counting those as "in use" refused the import for the same reason
    counting `users` did. It was caught by this project's own route tests. A
    real point movement has any other source_ref.
  */
  ['ledger', "WHERE source_ref NOT LIKE 'opening:%'"],
  // The rest cannot be created without somebody doing something deliberate.
  ['user_accounts', ''],
  ['proofs', ''],
  ['stories', ''],
  ['vouchers', ''],
  ['sos_alerts', ''],
  ['place_reviews', ''],
];

/**
 * Why this database may not be imported into. Empty means it may.
 *
 * THREE THINGS WENT WRONG with the first version of this guard, and all three
 * are why it now reads the way it does rather than asking one question.
 *
 * 1. It asked "is the database empty", which is true before the first batch
 *    and false before the second - so a 63-table import died on batch two
 *    with a 409. Hence the run record: the question is asked once, at the
 *    beginning, and then remembered.
 *
 * 2. "Empty" meant `users` having no rows, and a Worker that is already
 *    serving traffic provisions a user from the first anonymous request it
 *    sees (`server.ts`, the open-identity path). At a cutover that is not a
 *    hypothetical: ONE stray request before the first batch refused the whole
 *    import. It was reproduced end-to-end before being fixed - a `GET /places`
 *    in a test provisioned an account and the next batch got a 409. So the
 *    question is about SUBSTANTIVE data - a ledger row, a registered account,
 *    a proof, a story - which an anonymous request cannot create.
 *
 * 3. A FINISHED run was never consulted, so a database that had been imported
 *    and then had its users erased (`DELETE /profile` on the last account, or
 *    `reset-demo`) was open to a second import. A finished run now refuses
 *    permanently: this database has been set up, and setting it up again is
 *    not a thing to do by accident.
 */
export function importBlockers(db: DB, now = new Date()): string[] {
  const blockers: string[] = [];

  if (anyFinishedRun(db)) {
    blockers.push(
      'An import has already been completed here. This database has been set up; '
      + 'importing into it again is not something to do by accident.',
    );
    // Nothing below matters if this is true, and saying both would muddle it.
    return blockers;
  }

  const open = openImportRun(db);
  if (open) {
    const since = open.last_batch_at ?? open.started_at;
    const quietFor = now.getTime() - new Date(since).getTime();
    if (quietFor > RUN_GOES_STALE_AFTER_MS) {
      blockers.push(
        `The import that began at ${open.started_at} has been quiet for `
        + `${Math.round(quietFor / 3_600_000)} hours. Close it with /admin/import/finish `
        + 'and begin again deliberately, rather than leaving the door open.',
      );
    }
    // An open, live run is the ordinary case: continue it.
    return blockers;
  }

  for (const [table, where] of SUBSTANTIVE_TABLES) {
    // The table names are this file's own constants, never a caller's.
    const n = row<{ n: number }>(
      db.prepare(`SELECT COUNT(*) AS n FROM "${table}" ${where}`).get(),
    )?.n ?? 0;
    if (n > 0) {
      blockers.push(
        `This database is in use: ${table} has ${n} row(s) that only real use creates. `
        + 'An import must only ever begin on a database nobody has used yet.',
      );
    }
  }
  return blockers;
}

/**
 * Accounts that exist only because somebody opened the app.
 *
 * Reported rather than deleted. On the open-identity path an anonymous request
 * mints a `users` row and a zeroed wallet, and at a cutover a handful of those
 * can appear before the import starts. They do not block it any more, but the
 * operator should know they are there - deleting somebody's row is not a thing
 * this code should decide by itself.
 */
export function provisionedUserCount(db: DB): number {
  return row<{ n: number }>(
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM users u
          WHERE NOT EXISTS (SELECT 1 FROM user_accounts a WHERE a.id = u.id)
            AND NOT EXISTS (SELECT 1 FROM ledger l WHERE l.user_id = u.id)`,
      )
      .get(),
  )?.n ?? 0;
}

/**
 * Record that an import has begun, or that a batch has landed on one.
 *
 * Called AFTER a batch succeeds, not before. The first version called it
 * first, so a token-bearing request naming a table that does not exist left an
 * open run behind on an untouched database - a door propped open by a typo.
 */
export function recordBatch(db: DB, now = new Date()): string {
  const open = openImportRun(db);
  if (open) {
    db.prepare('UPDATE import_runs SET last_batch_at = ?, batches = batches + 1 WHERE id = ?')
      .run(now.toISOString(), open.id);
    return open.id;
  }
  const id = `imp_${now.toISOString()}`;
  db.prepare(
    'INSERT INTO import_runs (id, started_at, last_batch_at, batches) VALUES (?,?,?,1)',
  ).run(id, now.toISOString(), now.toISOString());
  return id;
}

/**
 * Close the run.
 *
 * Deliberately separate and deliberately explicit: an import that was
 * interrupted should stay OPEN, so the next batch is allowed to continue it
 * rather than being refused on a half-filled database. Finishing is something
 * the operator says, at the end, when the counts match.
 */
export function finishImportRun(db: DB, note: string | null = null, now = new Date()): boolean {
  const open = openImportRun(db);
  if (!open) return false;
  db.prepare('UPDATE import_runs SET finished_at = ?, note = ? WHERE id = ?')
    .run(now.toISOString(), note, open.id);
  return true;
}

/**
 * Insert one batch, in one transaction.
 *
 * EVERY IDENTIFIER IS CHECKED AGAINST THE LIVE SCHEMA before it reaches a
 * statement, and every value is bound. A batch therefore cannot name a table
 * that does not exist, a column that does not exist, or carry SQL at all.
 *
 * One transaction per batch rather than one for the whole import: a 63-table
 * database does not fit in one, and a batch is the unit somebody can retry.
 */
export function importBatch(db: DB, batch: ImportBatch): number {
  if (!SAFE_IDENTIFIER.test(batch.table)) {
    throw new Error(`Unsafe table name: ${JSON.stringify(batch.table)}`);
  }
  if (NEVER_IMPORTED(batch.table)) {
    throw new Error(`${batch.table} is not a table an import may write`);
  }
  if (!tablesInDatabase(db).includes(batch.table)) {
    throw new Error(`No such table: ${batch.table}`);
  }

  const known = columnsOf(db, batch.table);
  for (const c of batch.columns) {
    if (!SAFE_IDENTIFIER.test(c)) throw new Error(`Unsafe column name: ${JSON.stringify(c)}`);
    if (!known.includes(c)) throw new Error(`No such column: ${batch.table}.${c}`);
  }
  if (batch.columns.length === 0) throw new Error(`A batch must name at least one column`);

  for (const v of batch.values) {
    if (v.length !== batch.columns.length) {
      throw new Error(
        `A row has ${v.length} value(s) for ${batch.columns.length} column(s) in ${batch.table}`,
      );
    }
  }

  const quoted = batch.columns.map((c) => `"${c}"`).join(', ');
  const holes = batch.columns.map(() => '?').join(', ');
  const sql = `INSERT INTO "${batch.table}" (${quoted}) VALUES (${holes})`;

  return transact(db, () => {
    const insert = db.prepare(sql);
    let n = 0;
    for (const v of batch.values) {
      insert.run(...v.map(decodeValue));
      n += 1;
    }
    return n;
  });
}

/** What the importer answers with, so a caller can check rather than hope. */
export interface ImportReport {
  table: string;
  inserted: number;
}

/** Apply several batches in order, stopping at the first that fails. */
export function importBatches(db: DB, batches: ImportBatch[]): ImportReport[] {
  return batches.map((b) => ({ table: b.table, inserted: importBatch(db, b) }));
}
