import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { setOfflineStorageForTests, type OfflineStorageAdapter } from './storage.ts';
import { cachedShops, clearPublicCache, deleteAreaCache, inspectAreaCache, searchOffline, shopWithFallback,
  shopsWithFallback, storageInfo } from './public-cache.ts';

const data = new Map<string, string>();
const old = new Map<string, string>();
const original = globalThis.localStorage;
let failWrite = false;
const adapter: OfflineStorageAdapter = {
  get: async (key) => data.get(key) ?? null,
  set: async (key, value) => { if (failWrite) throw new Error('full'); data.set(key, value); },
  delete: async (key) => { data.delete(key); },
  keys: async () => [...data.keys()],
};
before(() => {
  setOfflineStorageForTests(adapter);
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    get length() { return old.size; }, key: (i: number) => [...old.keys()][i] ?? null,
    getItem: (key: string) => old.get(key) ?? null,
    setItem: (key: string, value: string) => { old.set(key, value); },
    removeItem: (key: string) => { old.delete(key); },
  } });
});
after(() => { setOfflineStorageForTests(null); Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: original }); });

test('persistent records isolate areas, sanitize owners and expose details', async () => {
  const shop = { id: 's1', name: 'ร้านกาแฟ', category: 'ร้านอาหาร', description: 'Coffee',
    serviceType: 'business', areaKey: 'samui', active: true, owner: true, hasGuideDocument: true, coverUrl: null, rating: null };
  await shopsWithFallback('samui', async () => ({ ok: true, data: [shop] as never }));
  assert.equal((await cachedShops('samui'))?.data[0]?.owner, false);
  assert.equal((await cachedShops('koh-sichang')), null);
  assert.equal((await searchOffline('samui', 'กาแฟ')).shops.length, 1);
  assert.equal((await searchOffline('koh-sichang', 'กาแฟ')).shops.length, 0);
  const fallback = await shopWithFallback('s1', async () => ({ ok: false, code: 'NETWORK', error: 'offline' }));
  assert.equal(fallback.ok, true);
  if (fallback.ok) { assert.equal(fallback.data.coverUrl, null); assert.equal(fallback.data.rating, null); assert.deepEqual(fallback.data.images, []); }
  assert.equal((await shopWithFallback('s1', async () => ({ ok: false, code: '403', error: 'denied' }))).ok, false);
  assert.equal((await inspectAreaCache('samui')).shops?.data.length, 1);
  const info = await storageInfo();
  assert.deepEqual(info.areas, ['samui']);
  assert.ok(info.totalBytes > 0);
  old.set('unrelated', 'keep');
  await deleteAreaCache('samui', 'shops');
  assert.equal(await cachedShops('samui'), null);
  assert.equal(old.get('unrelated'), 'keep');
});

test('legacy migration verifies new storage and keeps original source', async () => {
  const now = new Date();
  const source = 'chivago.offline.public.v2.shops.samui';
  old.set(source, JSON.stringify({ version: 2, areaKey: 'samui', downloadedAt: now.toISOString(),
    lastUpdatedAt: now.toISOString(), expiresAt: new Date(now.getTime() + 7 * 86400_000).toISOString(), data: [] }));
  assert.equal((await cachedShops('samui'))?.version, 3);
  assert.ok(data.has('chivago.public.v3.shops.samui'));
  assert.ok(old.has(source));
  await deleteAreaCache('samui');
  assert.equal(old.has(source), false);
});

test('migration failure preserves source for a later retry', async () => {
  const now = new Date();
  const source = 'chivago.offline.public.v2.shops.samui';
  old.set(source, JSON.stringify({ version: 2, areaKey: 'samui', downloadedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 7 * 86400_000).toISOString(), data: [] }));
  failWrite = true;
  assert.equal(await cachedShops('samui'), null);
  assert.ok(old.has(source));
  failWrite = false;
  assert.equal((await cachedShops('samui'))?.version, 3);
  await deleteAreaCache('samui');
});

test('expired and corrupt records are rejected; clear stays inside public namespace', async () => {
  const key = 'chivago.public.v3.shops.samui';
  data.set(key, '{broken');
  assert.equal(await cachedShops('samui'), null);
  data.set(key, JSON.stringify({ id: key, version: 3, areaKey: 'samui', dataType: 'shops', status: 'ready', data: [],
    downloadedAt: new Date(Date.now() - 8 * 86400_000).toISOString(), lastUpdatedAt: new Date().toISOString(),
    lastAccessedAt: new Date().toISOString(), expiresAt: new Date(Date.now() - 86400_000).toISOString(), sizeBytes: 2 }));
  assert.equal(await cachedShops('samui'), null);
  data.set('other.application.key', 'keep');
  await clearPublicCache();
  assert.equal(data.get('other.application.key'), 'keep');
});
