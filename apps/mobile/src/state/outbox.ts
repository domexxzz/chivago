/**
 * The proof outbox: what "Saved — will upload when you have signal" means.
 *
 * It said that for fifty commits and stored nothing; a proof taken at the
 * mangrove with no signal was a toast and then gone. Now a submission that
 * fails for want of a network is written here, and tried again when the app
 * comes to the foreground, when the browser says it is online, and every
 * minute while anything waits. A proof the server REFUSES - wrong stage,
 * outside the fence - is not retried forever: it is dropped with its reason
 * kept, and the quest screen says so.
 *
 * Storage is behind an interface so the tests use a map and a phone uses the
 * keystore; on the web the keystore is absent and localStorage stands in.
 */

import type { Fix, ProofPhoto } from '@chivago/core';

export interface ProofPayload {
  photos: ProofPhoto[];
  weightKg: number | null;
  position: Fix;
}

export interface OutboxItem {
  id: string;
  questId: string;
  payload: ProofPayload;
  queuedAt: string;
  attempts: number;
}

export interface OutboxStore {
  read(): Promise<OutboxItem[]>;
  write(items: OutboxItem[]): Promise<void>;
}

/** What a send attempt came back with. Mirrors the API client's result shape. */
export type SendResult = { ok: true } | { ok: false; code: string; error: string };

export interface FlushReport {
  sent: OutboxItem[];
  /** Kept for another try: the network was the problem. */
  kept: OutboxItem[];
  /** Dropped: the server answered, and the answer was no. */
  dropped: { item: OutboxItem; error: string }[];
}

const RETRIABLE = new Set(['NETWORK', 'TIMEOUT']);
const MAX_ITEMS = 30;

export async function enqueueProof(store: OutboxStore, questId: string, payload: ProofPayload, now = new Date()): Promise<OutboxItem> {
  const items = await store.read();
  const item: OutboxItem = {
    id: `${questId}:${now.getTime()}`,
    questId,
    payload,
    queuedAt: now.toISOString(),
    attempts: 0,
  };
  await store.write([...items, item].slice(-MAX_ITEMS));
  return item;
}

export async function pendingFor(store: OutboxStore, questId: string): Promise<number> {
  return (await store.read()).filter((i) => i.questId === questId).length;
}

export async function pendingCount(store: OutboxStore): Promise<number> {
  return (await store.read()).length;
}

/**
 * Try everything, oldest first. Stops at the first network failure - if the
 * first one cannot reach the server, neither can the rest, and thirty
 * timeouts in a row is a minute of nothing.
 */
export async function flushOutbox(
  store: OutboxStore,
  send: (questId: string, payload: ProofPayload) => Promise<SendResult>,
): Promise<FlushReport> {
  const items = await store.read();
  const report: FlushReport = { sent: [], kept: [], dropped: [] };
  let offline = false;
  for (const item of items) {
    if (offline) { report.kept.push(item); continue; }
    const res = await send(item.questId, item.payload);
    if (res.ok) { report.sent.push(item); continue; }
    if (RETRIABLE.has(res.code)) {
      offline = true;
      report.kept.push({ ...item, attempts: item.attempts + 1 });
      continue;
    }
    report.dropped.push({ item, error: res.error });
  }
  await store.write(report.kept);
  return report;
}

/** A store in memory, for tests and as the last fallback. */
export function memoryStore(initial: OutboxItem[] = []): OutboxStore {
  let items = [...initial];
  return {
    read: async () => [...items],
    write: async (next) => { items = [...next]; },
  };
}
