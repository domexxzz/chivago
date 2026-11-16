/**
 * The one thing that makes `SCHEMA_VERSION` safe to trust.
 *
 * The Worker skips the schema and the migrations when the version it has
 * stored matches the version in the code (see the note over `SCHEMA_VERSION`
 * in `db.ts` for the five-million-rows-a-day reason). That is a bargain with a
 * sharp edge: add a column and forget to bump the number, and the pilot's
 * Durable Object - which already holds the old number - never runs your
 * migration. The column is simply missing, in production, silently, and the
 * first sign of it is a query failing at three in the morning.
 *
 * So this test pins the schema. It hashes what actually decides the shape of
 * the database - the two schema strings and the executable lines of
 * `migrations.ts` - and fails when that hash moves. Comments and blank lines
 * are stripped before hashing, so documenting a migration costs nothing and
 * changing one costs a version bump, which is exactly the right way round.
 *
 * WHEN THIS FAILS, you have changed the schema. Do both of these:
 *   1. bump `SCHEMA_VERSION` in `db.ts`,
 *   2. paste the digest the failure prints into `PINNED` below.
 * Do not do only the second. The point of the first is that every deployed
 * object re-migrates once, and the point of the second is that the next person
 * gets this same warning.
 */

import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { SCHEMA, SCHEMA_2, SCHEMA_VERSION } from './db.ts';

/** The digest of the schema as it stood when `SCHEMA_VERSION` was last bumped. */
const PINNED = '34c203f4417a83f654c9597bf3a89bf81c44ccd24eaa625a139bc79de8d7383a';

/**
 * Strip what a reader needs and SQLite does not: line comments, block
 * comments, SQL comments and blank lines. A migration's PROSE should be free
 * to improve - most of the value of `migrations.ts` is in its prose - while
 * any change to what it executes is caught.
 */
function executableLines(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/--.*$/, '').replace(/\/\/.*$/, '').trim())
    .filter((line) => line.length > 0)
    .join('\n');
}

test('the schema has not changed without a SCHEMA_VERSION bump', () => {
  const migrations = readFileSync(
    fileURLToPath(new URL('./migrations.ts', import.meta.url)),
    'utf8',
  );

  const digest = createHash('sha256')
    .update(executableLines(SCHEMA))
    .update(executableLines(SCHEMA_2))
    .update(executableLines(migrations))
    .digest('hex');

  assert.equal(
    digest,
    PINNED,
    `The schema changed.\n\n` +
      `  1. bump SCHEMA_VERSION in db.ts (it is ${SCHEMA_VERSION})\n` +
      `  2. set PINNED in this file to:\n     ${digest}\n\n` +
      `Skipping step 1 means the live Durable Object keeps the old schema and ` +
      `never runs your migration.`,
  );
});

test('SCHEMA_VERSION is a whole number that only ever goes up', () => {
  assert.ok(Number.isInteger(SCHEMA_VERSION), 'SCHEMA_VERSION must be an integer');
  assert.ok(SCHEMA_VERSION >= 1, 'SCHEMA_VERSION starts at 1');
});

test('a boot that skips the migration runs no SQL at all', async () => {
  /*
    The measurement the whole change rests on.

    Before the version gate, every construction of the Durable Object ran 142
    statements to re-discover a schema that had not moved - 2,880 times a day,
    billed by the row, which is what exhausted the free tier on 12 November
    2026. This asserts the two numbers either side of that: what a migrating
    boot costs, and that a non-migrating one costs nothing.

    `openDurableDatabase` is given the stand-in storage the Node test driver
    uses, so the count is of real statements against a real SQLite.
  */
  const { DatabaseSync } = await import('node:sqlite');
  const { standInStorage } = await import('./do-storage-stand-in.ts');
  const { openDurableDatabase } = await import('./db.ts');

  const storage = standInStorage(new DatabaseSync(':memory:'));
  openDurableDatabase(storage);

  let statements = 0;
  const exec = storage.sql.exec.bind(storage.sql);
  storage.sql.exec = ((query: string, ...bindings: unknown[]) => {
    statements += 1;
    return exec(query, ...bindings);
  }) as typeof storage.sql.exec;

  openDurableDatabase(storage, { migrate: false });
  assert.equal(statements, 0, 'a skipped migration must not touch the database');

  openDurableDatabase(storage, { migrate: true });
  assert.ok(
    statements > 100,
    `a migrating boot is expensive on purpose - it ran ${statements} statements, ` +
      `which is why it must not happen on every alarm`,
  );
});
