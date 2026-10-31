import * as SQLite from 'expo-sqlite';
import type { OfflineStorageAdapter } from './storage.ts';
import { sqliteStorage } from './storage-sqlite.ts';

/** Expo's SQLite database survives app restarts on Android and iOS. */
let adapter: OfflineStorageAdapter | null = null;
export function nativeOfflineStorage(): OfflineStorageAdapter {
  adapter ??= sqliteStorage(() => SQLite.openDatabaseAsync('chivago-public-offline.db'));
  return adapter;
}
