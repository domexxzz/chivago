/** Public offline records only. Keys are scoped to this repository. */
export interface OfflineStorageAdapter {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  keys(): Promise<string[]>;
}

let injected: OfflineStorageAdapter | null = null;
let pending: Promise<OfflineStorageAdapter> | null = null;

export function setOfflineStorageForTests(adapter: OfflineStorageAdapter | null): void {
  injected = adapter;
  pending = null;
}

export function offlineStorage(): Promise<OfflineStorageAdapter> {
  if (injected) return Promise.resolve(injected);
  const native = typeof navigator !== 'undefined' && navigator.product === 'ReactNative';
  pending ??= (native ? import('./storage-native.ts').then((m) => m.nativeOfflineStorage())
    : import('./storage-web.ts').then((m) => m.webOfflineStorage())).catch((error: unknown) => {
      pending = null;
      throw error;
    });
  return pending;
}
