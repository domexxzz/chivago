import type { AdventureOverview, Quest, QuestProgress } from '@chivago/core';
import type { Result } from '../api/client.ts';
import { loadDeviceKey } from '../api/account.ts';
import { offlineStorage } from './storage.ts';

type Snapshot<T> = { fetchedAt: string; data: T };
type OfflineData<T> = T & { offlineAt?: string };

const scope = async (): Promise<string> => {
  const key = await loadDeviceKey();
  if (!key) return 'guest';
  let hash = 2166136261;
  for (let i = 0; i < key.length; i += 1) hash = Math.imul(hash ^ key.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(36);
};
const cacheKey = async (kind: string): Promise<string> => `chivago.offline.adventure.v1.${await scope()}.${kind}`;

async function withFallback<T extends object>(kind: string, fetcher: () => Promise<Result<T>>): Promise<Result<OfflineData<T>>> {
  const result = await fetcher();
  const key = await cacheKey(kind);
  if (result.ok) {
    // A cache write is an optimisation. Storage quota/corruption must never
    // turn a successful live response into a failed screen.
    await (await offlineStorage()).set(
      key,
      JSON.stringify({ fetchedAt: new Date().toISOString(), data: result.data } satisfies Snapshot<T>),
    ).catch(() => undefined);
    return result;
  }
  if (result.code !== 'NETWORK' && result.code !== 'TIMEOUT') return result;
  try {
    const raw = await (await offlineStorage()).get(key);
    if (!raw) return result;
    const snapshot = JSON.parse(raw) as Snapshot<T>;
    return { ok: true, data: { ...snapshot.data, offlineAt: snapshot.fetchedAt } };
  } catch { return result; }
}

export const adventureWithFallback = (area: string, fetcher: () => Promise<Result<AdventureOverview>>) =>
  withFallback(`area.${area}`, fetcher);

export const questsWithFallback = (fetcher: () => Promise<Result<{ quests: Quest[]; progress: Record<string, QuestProgress> }>>) =>
  withFallback('quests', fetcher);
