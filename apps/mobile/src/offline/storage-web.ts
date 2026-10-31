import type { OfflineStorageAdapter } from './storage.ts';

const DB = 'chivago-public-offline';
const TABLE = 'records';
let opening: Promise<IDBDatabase> | null = null;

function database(): Promise<IDBDatabase> {
  if (opening) return opening;
  const attempt = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB unavailable')); return; }
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(TABLE)) request.result.createObjectStore(TABLE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
    request.onblocked = () => reject(new Error('IndexedDB upgrade blocked'));
  }).catch((error: unknown) => { opening = null; throw error; });
  opening = attempt;
  return attempt;
}

async function request<T>(mode: IDBTransactionMode, run: (table: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TABLE, mode);
    const operation = run(tx.objectStore(TABLE));
    let result: T;
    operation.onsuccess = () => { result = operation.result; };
    operation.onerror = () => reject(operation.error ?? new Error('IndexedDB request failed'));
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}

export function webOfflineStorage(): OfflineStorageAdapter {
  return {
    get: async (key) => (await request('readonly', (table) => table.get(key))) as string | null ?? null,
    set: async (key, value) => { await request('readwrite', (table) => table.put(value, key)); },
    delete: async (key) => { await request('readwrite', (table) => table.delete(key)); },
    keys: async () => (await request('readonly', (table) => table.getAllKeys())).filter((key): key is string => typeof key === 'string'),
  };
}
