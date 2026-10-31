import { areaOfPlace, isAreaKey, type AreaKey, type ScoredPlace } from '@chivago/core';
import type { Shop, ShopDetail } from '../api/shops.ts';
import type { Result } from '../api/client.ts';
import { offlineStorage } from './storage.ts';

const PREFIX = 'chivago.public.v3.';
const LEGACY = 'chivago.offline.public.v2.';
const TTL = 7 * 86400_000;
const MAX_BYTES = 5 * 1024 * 1024;
type Kind = 'places' | 'shops';
export type Snapshot<T> = { id: string; areaKey: AreaKey; dataType: Kind; version: 3; downloadedAt: string;
  lastUpdatedAt: string; expiresAt: string; lastAccessedAt: string; sizeBytes: number; status: 'ready'; data: T };
const key = (kind: Kind, area: AreaKey) => `${PREFIX}${kind}.${area}`;
const legacyKey = (kind: Kind, area: AreaKey) => `${LEGACY}${kind}.${area}`;
const size = (value: string) => new TextEncoder().encode(value).length;
function legacyKeys(): string[] {
  if (typeof localStorage === 'undefined') return [];
  try { return Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)).filter((id): id is string => id !== null); }
  catch { return []; }
}

function valid<T>(input: unknown, kind: Kind, area: AreaKey): Snapshot<T> | null {
  if (!input || typeof input !== 'object') return null;
  const v = input as Partial<Snapshot<T>>;
  const start = Date.parse(v.downloadedAt ?? '');
  const end = Date.parse(v.expiresAt ?? '');
  if (v.id !== key(kind, area) || v.areaKey !== area || v.dataType !== kind || v.version !== 3
    || v.status !== 'ready' || !Array.isArray(v.data) || !Number.isFinite(start) || !Number.isFinite(end)
    || !Number.isFinite(Date.parse(v.lastUpdatedAt ?? '')) || !Number.isFinite(Date.parse(v.lastAccessedAt ?? ''))
    || !Number.isFinite(v.sizeBytes) || start > Date.now() || end <= Date.now()
    || end - start > TTL || v.sizeBytes! > MAX_BYTES) return null;
  if (!(v.data as unknown[]).every((item) => item && typeof item === 'object'
    && typeof (item as { id?: unknown }).id === 'string'
    && (kind === 'shops' ? (item as Shop).areaKey === area && typeof (item as Shop).name === 'string'
      : typeof (item as ScoredPlace).name === 'object'))) return null;
  if (size(JSON.stringify(v.data)) !== v.sizeBytes) return null;
  return v as Snapshot<T>;
}

async function migrate<T>(kind: Kind, area: AreaKey): Promise<Snapshot<T> | null> {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(legacyKey(kind, area));
    if (!raw) return null;
    const old = JSON.parse(raw) as { version?: number; areaKey?: string; data?: T; downloadedAt?: string; lastUpdatedAt?: string; expiresAt?: string };
    const start = Date.parse(old.downloadedAt ?? '');
    const end = Date.parse(old.expiresAt ?? '');
    if (old.version !== 2 || old.areaKey !== area || !Array.isArray(old.data)
      || !Number.isFinite(start) || !Number.isFinite(end) || start > Date.now() || end <= Date.now() || end - start > TTL) return null;
    if (kind === 'shops') old.data = (old.data as Shop[]).map((shop) => ({ ...shop, owner: false, hasGuideDocument: false })) as T;
    const payload = JSON.stringify(old.data);
    if (size(payload) > MAX_BYTES) return null;
    const snapshot: Snapshot<T> = { id: key(kind, area), areaKey: area, dataType: kind, version: 3,
      downloadedAt: old.downloadedAt!, lastUpdatedAt: old.lastUpdatedAt ?? old.downloadedAt!,
      expiresAt: old.expiresAt!, lastAccessedAt: new Date().toISOString(), sizeBytes: size(payload), status: 'ready', data: old.data };
    const storage = await offlineStorage();
    await storage.set(snapshot.id, JSON.stringify(snapshot));
    // Preserve the source. Verify persistence before reporting success; retry next launch on failure.
    return valid<T>(JSON.parse((await storage.get(snapshot.id)) ?? 'null'), kind, area);
  } catch { return null; }
}

async function read<T>(kind: Kind, area: AreaKey): Promise<Snapshot<T> | null> {
  try {
    const storage = await offlineStorage();
    const raw = await storage.get(key(kind, area));
    const snapshot = raw ? valid<T>(JSON.parse(raw), kind, area) : null;
    if (!snapshot) return migrate<T>(kind, area);
    const accessed = { ...snapshot, lastAccessedAt: new Date().toISOString() };
    try { await storage.set(snapshot.id, JSON.stringify(accessed)); return accessed; }
    catch { return snapshot; }
  } catch { return migrate<T>(kind, area); }
}
async function write<T>(kind: Kind, area: AreaKey, data: T): Promise<void> {
  try {
    const payload = JSON.stringify(data);
    if (size(payload) > MAX_BYTES) return;
    const now = new Date();
    const snapshot: Snapshot<T> = { id: key(kind, area), areaKey: area, dataType: kind, version: 3,
      downloadedAt: now.toISOString(), lastUpdatedAt: now.toISOString(), expiresAt: new Date(now.getTime() + TTL).toISOString(),
      lastAccessedAt: now.toISOString(), sizeBytes: size(payload), status: 'ready', data };
    await (await offlineStorage()).set(snapshot.id, JSON.stringify(snapshot));
  } catch { /* Cache failure must not break the online response. */ }
}
export const cachedPlaces = (area: AreaKey) => read<ScoredPlace[]>('places', area);
export const cachedShops = (area: AreaKey) => read<Shop[]>('shops', area);
export const inspectAreaCache = async (area: AreaKey) => ({ places: await cachedPlaces(area), shops: await cachedShops(area) });

export async function deleteAreaCache(area: AreaKey, kind?: Kind): Promise<void> {
  const storage = await offlineStorage();
  for (const item of kind ? [kind] : ['places', 'shops'] as const) await storage.delete(key(item, area));
  // Remove only legacy public keys, so deletion cannot remigrate them.
  if (typeof localStorage !== 'undefined') for (const item of kind ? [kind] : ['places', 'shops'] as const) {
    try { localStorage.removeItem(legacyKey(item, area)); } catch { /* persistent record already deleted */ }
  }
}
export async function storageInfo() {
  const storage = await offlineStorage();
  const records: { areaKey: AreaKey; dataType: Kind; sizeBytes: number; downloadedAt: string; expired: boolean }[] = [];
  for (const id of await storage.keys()) {
    const match = /^chivago\.public\.v3\.(places|shops)\.(.+)$/.exec(id);
    if (!match || !isAreaKey(match[2])) continue;
    try {
      const raw = await storage.get(id);
      const value = raw ? JSON.parse(raw) as Snapshot<unknown> : null;
      if (value?.id === id && Number.isFinite(value.sizeBytes)) records.push({ areaKey: match[2], dataType: match[1] as Kind,
        sizeBytes: value.sizeBytes, downloadedAt: value.downloadedAt, expired: Date.parse(value.expiresAt) <= Date.now() });
    } catch { /* skip corrupt record */ }
  }
  return { records, totalBytes: records.reduce((sum, item) => sum + item.sizeBytes, 0), areas: [...new Set(records.map((item) => item.areaKey))] };
}
export async function clearPublicCache(): Promise<void> {
  const storage = await offlineStorage();
  for (const id of await storage.keys()) if (id.startsWith(PREFIX)) await storage.delete(id);
  if (typeof localStorage !== 'undefined') {
    try { for (const id of legacyKeys()) if (id.startsWith(LEGACY)) localStorage.removeItem(id); } catch { /* no legacy storage */ }
  }
}
async function areas(): Promise<AreaKey[]> {
  const out = new Set<AreaKey>();
  try { for (const id of await (await offlineStorage()).keys()) {
    const match = /^chivago\.public\.v3\.(?:places|shops)\.(.+)$/.exec(id);
    if (match && isAreaKey(match[1])) out.add(match[1]);
  } } catch { /* Persistent storage is unavailable; legacy keys may still work. */ }
  if (typeof localStorage !== 'undefined') {
    try { for (const id of legacyKeys()) {
      const match = /^chivago\.offline\.public\.v2\.(?:places|shops)\.(.+)$/.exec(id);
      if (match && isAreaKey(match[1])) out.add(match[1]);
    } } catch { /* no legacy storage */ }
  }
  return [...out];
}
export async function cachedPlace(id: string): Promise<{ data: ScoredPlace; downloadedAt: string } | null> {
  for (const area of await areas()) { const snapshot = await cachedPlaces(area); const data = snapshot?.data.find((p) => p.id === id);
    if (snapshot && data) return { data, downloadedAt: snapshot.downloadedAt }; }
  return null;
}
export async function cachedShop(id: string): Promise<{ data: ShopDetail; downloadedAt: string } | null> {
  for (const area of await areas()) { const snapshot = await cachedShops(area); const data = snapshot?.data.find((s) => s.id === id);
    if (snapshot && data) return { data: { ...data, owner: false, images: [] }, downloadedAt: snapshot.downloadedAt }; }
  return null;
}
export async function searchOffline(area: AreaKey, query: string) {
  const q = query.normalize('NFKC').trim().toLocaleLowerCase();
  const matches = (text: string) => text.normalize('NFKC').toLocaleLowerCase().includes(q);
  return { places: (await cachedPlaces(area))?.data.filter((p) => matches(JSON.stringify(p.name)) || matches(JSON.stringify(p.blurb)) || matches(p.layer)) ?? [],
    shops: (await cachedShops(area))?.data.filter((s) => [s.name, s.category, s.description, s.serviceType].some(matches)) ?? [] };
}
const unavailable = (code: string) => ['NETWORK', 'TIMEOUT'].includes(code) || /^5\d\d$/.test(code);
export async function placesWithFallback(area: AreaKey, online: () => Promise<Result<ScoredPlace[]>>): Promise<Result<ScoredPlace[]>> {
  const result = await online();
  if (result.ok) { await write('places', area, result.data.filter((p) => areaOfPlace(p) === area)); return result; }
  if (!unavailable(result.code)) return result;
  const cached = await cachedPlaces(area); return cached ? { ok: true, data: cached.data } : result;
}
export async function shopsWithFallback(area: AreaKey, online: () => Promise<Result<Shop[]>>): Promise<Result<Shop[]>> {
  const result = await online();
  if (result.ok) { await write('shops', area, result.data.filter((s) => s.areaKey === area && s.active).map((s) => ({ ...s, owner: false, hasGuideDocument: false }))); return result; }
  if (!unavailable(result.code)) return result;
  const cached = await cachedShops(area); return cached ? { ok: true, data: cached.data } : result;
}
export async function placeWithFallback(id: string, online: () => Promise<Result<ScoredPlace>>): Promise<Result<ScoredPlace>> {
  const result = await online(); if (result.ok || !unavailable(result.code)) return result;
  const cached = await cachedPlace(id); return cached ? { ok: true, data: cached.data } : result;
}
export async function shopWithFallback(id: string, online: () => Promise<Result<ShopDetail>>): Promise<Result<ShopDetail>> {
  const result = await online(); if (result.ok || !unavailable(result.code)) return result;
  const cached = await cachedShop(id); return cached ? { ok: true, data: cached.data } : result;
}
