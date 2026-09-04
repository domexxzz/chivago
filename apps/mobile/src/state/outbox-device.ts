/**
 * The outbox on a device: the keystore where there is one, localStorage on
 * the web, memory when neither will have us. Kept apart from outbox.ts so
 * the logic there imports nothing a node test cannot load.
 */

import * as SecureStore from 'expo-secure-store';
import { memoryStore, type OutboxItem, type OutboxStore } from './outbox.ts';

const KEY = 'chivago.proofOutbox';

function webStore(): OutboxStore | null {
  if (typeof localStorage === 'undefined') return null;
  return {
    read: async () => {
      try { const raw = localStorage.getItem(KEY); return raw ? (JSON.parse(raw) as OutboxItem[]) : []; } catch { return []; }
    },
    write: async (items) => { try { localStorage.setItem(KEY, JSON.stringify(items)); } catch { /* full or private */ } },
  };
}

function keystore(): OutboxStore {
  return {
    read: async () => {
      try { const raw = await SecureStore.getItemAsync(KEY); return raw ? (JSON.parse(raw) as OutboxItem[]) : []; } catch { return []; }
    },
    write: async (items) => { try { await SecureStore.setItemAsync(KEY, JSON.stringify(items)); } catch { /* no keystore */ } },
  };
}

let chosen: OutboxStore | null = null;
const fallback = memoryStore();

export function deviceOutbox(): OutboxStore {
  if (chosen) return chosen;
  chosen = webStore() ?? (SecureStore && typeof SecureStore.getItemAsync === 'function' ? keystore() : fallback);
  return chosen;
}
