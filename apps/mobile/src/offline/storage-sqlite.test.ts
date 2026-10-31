import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sqliteStorage, type SqliteDatabase } from './storage-sqlite.ts';

test('SQLite adapter initializes once, binds keys and persists across adapter instances', async () => {
  const rows = new Map<string, string>();
  let version = 0;
  let migrations = 0;
  const db: SqliteDatabase = {
    getFirstAsync: async <T>(sql: string, ...args: string[]) => {
      if (sql === 'PRAGMA user_version') return { user_version: version } as T;
      assert.equal(sql, 'SELECT value FROM public_records WHERE key = ?');
      return rows.has(args[0]) ? { value: rows.get(args[0]) } as T : null;
    },
    getAllAsync: async <T>(sql: string) => {
      assert.equal(sql, 'SELECT key FROM public_records');
      return [...rows.keys()].map((key) => ({ key })) as T[];
    },
    runAsync: async (sql: string, ...args: string[]) => {
      if (sql.startsWith('INSERT')) { assert.deepEqual(args.length, 2); rows.set(args[0], args[1]); }
      else { assert.equal(sql, 'DELETE FROM public_records WHERE key = ?'); rows.delete(args[0]); }
    },
    execAsync: async (sql: string) => { assert.match(sql, /CREATE TABLE IF NOT EXISTS public_records/); version = 1; migrations++; },
  };
  const first = sqliteStorage(async () => db);
  await first.set('samui', 'snapshot');
  assert.equal(await first.get('samui'), 'snapshot');
  const reopened = sqliteStorage(async () => db);
  assert.equal(await reopened.get('samui'), 'snapshot');
  assert.deepEqual(await reopened.keys(), ['samui']);
  assert.equal(migrations, 1);
  await reopened.delete('samui');
  assert.equal(await first.get('samui'), null);
});

test('SQLite migration failure can retry on next operation', async () => {
  let opens = 0;
  const db: SqliteDatabase = {
    getFirstAsync: async <T>() => ({ user_version: 0 }) as T,
    getAllAsync: async <T>() => [] as T[],
    runAsync: async () => undefined,
    execAsync: async (sql) => { if (sql.startsWith('BEGIN') && opens === 1) throw new Error('disk'); },
  };
  const adapter = sqliteStorage(async () => { opens++; return db; });
  await assert.rejects(adapter.keys());
  await assert.doesNotReject(adapter.keys());
  assert.equal(opens, 2);
});
