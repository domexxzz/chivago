/**
 * The outbox uses the same durable adapter as Offline Lite: IndexedDB on Web
 * and SQLite on Android/iOS. Evidence photos remain in the platform file/blob
 * store; this record contains only their storage references.
 */

import { memoryStore, type OutboxItem, type OutboxStore } from './outbox.ts';
import { offlineStorage } from '../offline/storage.ts';

const KEY = 'chivago.proofOutbox';

function durableStore(): OutboxStore {
  return {
    read: async () => {
      try { const raw = await (await offlineStorage()).get(KEY); return raw ? (JSON.parse(raw) as OutboxItem[]) : []; } catch { return []; }
    },
    write: async (items) => { try { await (await offlineStorage()).set(KEY, JSON.stringify(items)); } catch { /* unavailable: memory fallback below remains safe */ } },
  };
}

let chosen: OutboxStore | null = null;
const fallback = memoryStore();

export function deviceOutbox(): OutboxStore {
  if (chosen) return chosen;
  chosen = typeof indexedDB !== 'undefined' || (typeof navigator !== 'undefined' && navigator.product === 'ReactNative') ? durableStore() : fallback;
  return chosen;
}
