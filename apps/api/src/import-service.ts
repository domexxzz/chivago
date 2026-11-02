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
  const all = tablesInDatabase(db);
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
  if (v !== null && typeof v === 'object' && '$b64' in v) return base64ToBytes(v.$b64);
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
  const found = rows<Record<string, unknown>>(
    db.prepare(`SELECT ${quoted} FROM "${table}" LIMIT ? OFFSET ?`).all(limit, offset),
  );
  return {
    table,
    columns,
    values: found.map((r) => columns.map((c) => encodeValue(r[c]))),
  };
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
export function openImportRun(db: DB): { id: string; started_at: string } | undefined {
  return row<{ id: string; started_at: string }>(
    db
      .prepare('SELECT id, started_at FROM import_runs WHERE finished_at IS NULL ORDER BY started_at LIMIT 1')
      .get(),
  );
}

/**
 * May a batch be applied?
 *
 * NOT simply "is the database empty", and the difference is the whole reason
 * `import_runs` exists. An import is many requests - 63 tables, chunked - so
 * emptiness is true before the first batch and false before the second. Asking
 * it directly made a multi-batch import impossible, which is how this was
 * found: the `users` batch succeeded and the `wallets` batch got a 409.
 *
 * So the question is "did this import begin on an empty database", answered
 * once and then remembered. A live database refuses the FIRST batch and there
 * is never a run to continue.
 */
export function mayImport(db: DB): { allowed: boolean; reason?: string } {
  if (openImportRun(db)) return { allowed: true };
  if (!isEmptyDatabase(db)) {
    return {
      allowed: false,
      reason: 'This database already has users in it and no import is in progress. '
        + 'An import must only ever begin on an empty database.',
    };
  }
  return { allowed: true };
}

/** Record that an import has begun, if it has not already. Returns its id. */
export function beginImportRun(db: DB, now = new Date()): string {
  const open = openImportRun(db);
  if (open) return open.id;
  const id = `imp_${now.toISOString()}`;
  db.prepare('INSERT INTO import_runs (id, started_at) VALUES (?,?)').run(id, now.toISOString());
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
