import type { OfflineStorageAdapter } from './storage.ts';

export interface SqliteDatabase {
  getFirstAsync<T>(sql: string, ...args: string[]): Promise<T | null>;
  getAllAsync<T>(sql: string, ...args: string[]): Promise<T[]>;
  runAsync(sql: string, ...args: string[]): Promise<unknown>;
  execAsync(sql: string): Promise<void>;
}

/** SQL is fixed; values are always bound parameters. */
export function sqliteStorage(open: () => Promise<SqliteDatabase>): OfflineStorageAdapter {
  let opening: Promise<SqliteDatabase> | null = null;
  const database = () => {
    opening ??= open().then(async (db) => {
      const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
      if ((version?.user_version ?? 0) < 1) {
        try {
          await db.execAsync('BEGIN TRANSACTION; CREATE TABLE IF NOT EXISTS public_records (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL); PRAGMA user_version = 1; COMMIT;');
        } catch (error) {
          await db.execAsync('ROLLBACK;').catch(() => undefined);
          throw error;
        }
      }
      return db;
    }).catch((error: unknown) => { opening = null; throw error; });
    return opening;
  };
  return {
    get: async (key) => (await (await database()).getFirstAsync<{ value: string }>('SELECT value FROM public_records WHERE key = ?', key))?.value ?? null,
    set: async (key, value) => { await (await database()).runAsync('INSERT OR REPLACE INTO public_records (key, value) VALUES (?, ?)', key, value); },
    delete: async (key) => { await (await database()).runAsync('DELETE FROM public_records WHERE key = ?', key); },
    keys: async () => (await (await database()).getAllAsync<{ key: string }>('SELECT key FROM public_records')).map((row) => row.key),
  };
}
