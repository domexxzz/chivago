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
  /** Null while the fence is open: the app sends no position then. */
  position: Fix | null;
}

export interface QuestOutboxItem {
  kind?: 'quest';
  id: string;
  questId: string;
  payload: ProofPayload;
  queuedAt: string;
  attempts: number;
  nextAttemptAt?: string | null;
}

export interface ActivityEvidenceOutboxItem {
  kind: 'adventureEvidence';
  id: string;
  nodeId: string;
  clientRequestId: string;
  qrScanId: string | null;
  photos: { uri: string; mimeType?: string | null }[];
  position: Fix | null;
  queuedAt: string;
  attempts: number;
  nextAttemptAt?: string | null;
}

export interface JournalOutboxItem {
  kind: 'journal'; id: string; entryId: string;
  patch: { note?: string | null; visibility?: 'private' | 'shared' };
  expectedUpdatedAt: string; queuedAt: string; attempts: number; nextAttemptAt?: string | null;
}

export type OutboxItem = QuestOutboxItem | ActivityEvidenceOutboxItem | JournalOutboxItem;

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
const isQuest = (item: OutboxItem): item is QuestOutboxItem => item.kind === undefined || item.kind === 'quest';
const ready = (item: OutboxItem, now: Date): boolean => !item.nextAttemptAt || item.nextAttemptAt <= now.toISOString();
const retry = <T extends OutboxItem>(item: T, now: Date): T => {
  const attempts = item.attempts + 1;
  const delay = Math.min(15 * 60_000, 30_000 * (2 ** Math.min(5, attempts - 1)));
  return { ...item, attempts, nextAttemptAt: new Date(now.getTime() + delay).toISOString() };
};

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
  return (await store.read()).filter((i) => isQuest(i) && i.questId === questId).length;
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
  now = new Date(),
): Promise<FlushReport> {
  const all = await store.read();
  const other = all.filter((item) => !isQuest(item));
  const items = all.filter(isQuest);
  const report: FlushReport = { sent: [], kept: [], dropped: [] };
  let offline = false;
  for (const item of items) {
    if (!ready(item, now)) { report.kept.push(item); continue; }
    if (offline) { report.kept.push(item); continue; }
    const res = await send(item.questId, item.payload);
    if (res.ok) { report.sent.push(item); continue; }
    if (RETRIABLE.has(res.code)) {
      offline = true;
      report.kept.push(retry(item, now));
      continue;
    }
    report.dropped.push({ item, error: res.error });
  }
  await store.write([...other, ...report.kept]);
  return report;
}

export async function enqueueActivityEvidence(
  store: OutboxStore,
  input: Omit<ActivityEvidenceOutboxItem, 'kind' | 'id' | 'queuedAt' | 'attempts'>,
  now = new Date(),
): Promise<ActivityEvidenceOutboxItem> {
  const items = await store.read();
  const existing = items.find((item): item is ActivityEvidenceOutboxItem =>
    item.kind === 'adventureEvidence' && item.clientRequestId === input.clientRequestId);
  if (existing) return existing;
  const item: ActivityEvidenceOutboxItem = {
    kind: 'adventureEvidence', id: `adventure:${input.clientRequestId}`,
    ...input, queuedAt: now.toISOString(), attempts: 0,
  };
  await store.write([...items, item].slice(-MAX_ITEMS));
  return item;
}

export async function flushActivityEvidenceOutbox(
  store: OutboxStore,
  send: (item: ActivityEvidenceOutboxItem) => Promise<SendResult>,
  now = new Date(),
): Promise<FlushReport> {
  const all = await store.read();
  const other = all.filter((item) => item.kind !== 'adventureEvidence');
  const items = all.filter((item): item is ActivityEvidenceOutboxItem => item.kind === 'adventureEvidence');
  const report: FlushReport = { sent: [], kept: [], dropped: [] };
  let offline = false;
  for (const item of items) {
    if (!ready(item, now)) { report.kept.push(item); continue; }
    if (offline) { report.kept.push(item); continue; }
    const result = await send(item);
    if (result.ok) { report.sent.push(item); continue; }
    if (RETRIABLE.has(result.code)) {
      offline = true;
      report.kept.push(retry(item, now));
    } else report.dropped.push({ item, error: result.error });
  }
  await store.write([...other, ...report.kept]);
  return report;
}

export async function enqueueJournalChange(
  store: OutboxStore,
  entryId: string,
  patch: JournalOutboxItem['patch'],
  expectedUpdatedAt: string,
  now = new Date(),
): Promise<JournalOutboxItem> {
  const items = await store.read();
  const existing = items.find((item): item is JournalOutboxItem => item.kind === 'journal' && item.entryId === entryId);
  const item: JournalOutboxItem = existing
    ? { ...existing, patch: { ...existing.patch, ...patch }, queuedAt: now.toISOString(), attempts: 0, nextAttemptAt: null }
    : { kind: 'journal', id: `journal:${entryId}`, entryId, patch, expectedUpdatedAt, queuedAt: now.toISOString(), attempts: 0 };
  await store.write([...items.filter((candidate) => candidate !== existing), item].slice(-MAX_ITEMS));
  return item;
}

export async function flushJournalOutbox(
  store: OutboxStore,
  send: (item: JournalOutboxItem) => Promise<SendResult>,
  now = new Date(),
): Promise<FlushReport> {
  const all = await store.read();
  const other = all.filter((item) => item.kind !== 'journal');
  const items = all.filter((item): item is JournalOutboxItem => item.kind === 'journal');
  const report: FlushReport = { sent: [], kept: [], dropped: [] };
  let offline = false;
  for (const item of items) {
    if (!ready(item, now)) { report.kept.push(item); continue; }
    if (offline) { report.kept.push(item); continue; }
    const result = await send(item);
    if (result.ok) report.sent.push(item);
    else if (RETRIABLE.has(result.code)) { offline = true; report.kept.push(retry(item, now)); }
    else report.dropped.push({ item, error: result.error });
  }
  await store.write([...other, ...report.kept]);
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
