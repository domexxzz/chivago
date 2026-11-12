/**
 * Turn a SQLite snapshot into batches the import route can accept.
 *
 *   pnpm --filter @chivago/api export:import -- --db ./snapshot.db --out ./batches
 *
 * WHERE THIS RUNS: the owner's machine, on a copy of the Fly volume's
 * database. It is the first half of the step `docs/71` calls the hardest one -
 * a Durable Object's SQLite is not a file anyone can upload, so the rows have
 * to be replayed through the object, and something has to produce them.
 *
 * IT READS. It opens the snapshot read-only and writes nothing to it, because
 * the snapshot is the only untransformed copy of the pilot and this script
 * being wrong must not cost it.
 *
 * TABLES COME OUT PARENTS-FIRST, derived from the snapshot's own foreign keys
 * (63 tables, 74 keys between them). Foreign keys are enforced in Durable
 * Object SQLite, so a child sent before its parent is simply rejected - and
 * the batch files are numbered in the order they must be sent, so `sort` is
 * the whole instruction.
 *
 * A BATCH IS A RETRY UNIT. Rows are chunked so one HTTP request is a sensible
 * size and a failure costs one chunk rather than a table.
 */

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { exportTable, tablesInDependencyOrder, type ImportBatch } from './import-service.ts';

const { values } = parseArgs({
  options: {
    db: { type: 'string' },
    out: { type: 'string' },
    chunk: { type: 'string' },
  },
});

const dbPath = values.db ?? process.env.CHIVAGO_DB;
const outDir = values.out ?? './batches';
/*
  500 rows a batch by default. The number that matters is the BYTES, and the
  stories table carries media blobs, so a row there can be megabytes while a
  row in `wallets` is tens of bytes. 500 keeps the big tables' requests
  sensible; `--chunk` is there for when it does not.
*/
const chunkSize = Number(values.chunk ?? 500);

if (dbPath === undefined || dbPath === '') {
  console.error('usage: export:import -- --db <snapshot.db> [--out ./batches] [--chunk 500]');
  console.error('   or: CHIVAGO_DB=<snapshot.db> export:import');
  process.exit(2);
}

if (!Number.isInteger(chunkSize) || chunkSize < 1) {
  console.error(`--chunk must be a positive whole number, not ${JSON.stringify(values.chunk)}`);
  process.exit(2);
}

// Read-only, so a mistake here cannot touch the only untransformed copy.
const db = new DatabaseSync(dbPath, { readOnly: true });
mkdirSync(outDir, { recursive: true });

const order = tablesInDependencyOrder(db);
console.log(`[chivago] ${order.length} tables, parents first.`);

let fileNumber = 0;
let totalRows = 0;
const skipped: string[] = [];
const manifest: { file: string; table: string; rows: number }[] = [];

for (const table of order) {
  const total = (
    db.prepare(`SELECT COUNT(*) AS n FROM "${table}"`).get() as unknown as { n: number }
  ).n;

  if (total === 0) {
    // Not an error, and not worth a file: most of a schema is empty on a
    // pilot. Listed at the end so the operator can see it was considered.
    skipped.push(table);
    continue;
  }

  for (let offset = 0; offset < total; offset += chunkSize) {
    const batch: ImportBatch = exportTable(db, table, { limit: chunkSize, offset });
    fileNumber += 1;
    // Zero-padded and in send order, so `ls`, `sort` and a shell loop agree.
    const file = `${String(fileNumber).padStart(4, '0')}-${table}.json`;
    writeFileSync(join(outDir, file), JSON.stringify(batch), 'utf8');
    manifest.push({ file, table, rows: batch.values.length });
    totalRows += batch.values.length;
  }
  console.log(`  ${table}: ${total} row(s)`);
}

/*
  A manifest, because the counts are what Step 5 of the runbook checks against
  and writing them down now is cheaper than reconstructing them later from a
  database that has already been turned off.
*/
writeFileSync(
  join(outDir, 'manifest.json'),
  JSON.stringify({ exportedAt: new Date().toISOString(), totalRows, batches: manifest, skipped }, null, 2),
  'utf8',
);

db.close();

console.log(`\n[chivago] ${totalRows} row(s) in ${fileNumber} batch file(s) under ${outDir}`);
if (skipped.length > 0) {
  console.log(`[chivago] ${skipped.length} empty table(s), no file written: ${skipped.join(', ')}`);
}
console.log('\nSend them IN ORDER - a child before its parent is refused:');
console.log('  for f in ' + outDir + '/[0-9]*.json; do');
console.log('    curl -fsS -X POST "$API/admin/import" \\');
console.log('      -H "x-import-token: $CHIVAGO_IMPORT_TOKEN" \\');
console.log('      -H "content-type: application/json" \\');
console.log('      --data-binary "@$f" || { echo "FAILED on $f"; break; }');
console.log('  done');
console.log('\nThen UNSET CHIVAGO_IMPORT_TOKEN, which is what closes the door again.');
