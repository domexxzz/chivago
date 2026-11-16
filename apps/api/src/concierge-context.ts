/** Persistent, user-isolated conversation state for Chivar Bot. */

import { randomUUID } from 'node:crypto';
import { detectLang, emptyConversationContext, isAreaKey, type ConversationContext } from '@chivago/core';
import type { DB } from './db.ts';
import { transact } from './db.ts';

export interface StoredConversation {
  id: string;
  userId: string;
  areaKey: string;
  context: ConversationContext;
  createdAt: string;
  updatedAt: string;
}

/** A conversation may retain at most 100 complete turns. */
export const MAX_STORED_MESSAGES = 200;
/** Active history is bounded per traveller; older inactive threads expire. */
export const MAX_CONVERSATIONS_PER_USER = 50;
export const CONVERSATION_RETENTION_MS = 30 * 24 * 60 * 60_000;

export class ConversationNotFound extends Error {
  constructor() {
    super('No such conversation');
    this.name = 'ConversationNotFound';
  }
}

export class ConversationLimitReached extends Error {
  constructor() {
    super('Too many active conversations. Try an existing conversation or wait for old history to expire.');
    this.name = 'ConversationLimitReached';
  }
}

interface ConversationRow {
  id: string; user_id: string; area_key: string; context_json: string; created_at: string; updated_at: string;
}

const parseContext = (json: string): ConversationContext => {
  try {
    const value = JSON.parse(json) as Partial<ConversationContext>;
    const base = emptyConversationContext(value.language === 'en' || value.language === 'zh' ? value.language : 'th');
    return {
      ...base,
      ...value,
      selectedArea: typeof value.selectedArea === 'string' && isAreaKey(value.selectedArea) ? value.selectedArea : null,
      selectedPlaces: Array.isArray(value.selectedPlaces) ? value.selectedPlaces.filter((v): v is string => typeof v === 'string').slice(-50) : [],
      preferredCategories: Array.isArray(value.preferredCategories) ? value.preferredCategories.filter((v): v is string => typeof v === 'string').slice(-6) : [],
      lastSearchResults: Array.isArray(value.lastSearchResults) ? value.lastSearchResults.filter((v): v is string => typeof v === 'string').slice(-10) : [],
      conversationSummary: typeof value.conversationSummary === 'string' ? value.conversationSummary.slice(0, 800) : '',
    };
  } catch {
    return emptyConversationContext();
  }
};

const fromRow = (row: ConversationRow): StoredConversation => ({
  id: row.id, userId: row.user_id, areaKey: row.area_key,
  context: parseContext(row.context_json), createdAt: row.created_at, updatedAt: row.updated_at,
});

/**
 * A supplied id must belong to the authenticated caller. Without one, resume
 * the caller's most recent area conversation from the last 24 hours.
 */
export function conversationFor(
  db: DB,
  userId: string,
  areaKey: string,
  requestedId: string | null,
  firstMessage: string,
  now = new Date(),
): StoredConversation {
  const result = transact(db, (): { conversation: StoredConversation } | { error: 'not_found' | 'limit' } => {
    const retentionCutoff = new Date(now.getTime() - CONVERSATION_RETENTION_MS).toISOString();
    db.prepare(
      'DELETE FROM concierge_conversations WHERE user_id = ? AND updated_at <= ?',
    ).run(userId, retentionCutoff);

    if (requestedId) {
      const found = db.prepare(
        'SELECT * FROM concierge_conversations WHERE id = ? AND user_id = ? AND area_key = ?',
      ).get(requestedId, userId, areaKey) as unknown as ConversationRow | undefined;
      // Unknown, foreign and wrong-area identifiers deliberately look alike.
      // Most importantly, none of them are permission to allocate a thread.
      if (!found) return { error: 'not_found' };
      return { conversation: fromRow(found) };
    }

    const resumeCutoff = new Date(now.getTime() - 24 * 60 * 60_000).toISOString();
    const recent = db.prepare(
      `SELECT * FROM concierge_conversations
        WHERE user_id = ? AND area_key = ? AND updated_at >= ?
        ORDER BY updated_at DESC LIMIT 1`,
    ).get(userId, areaKey, resumeCutoff) as unknown as ConversationRow | undefined;
    if (recent) return { conversation: fromRow(recent) };

    // Only inactive history is removed. Active conversations are never
    // evicted to make an attacker's next allocation succeed.
    const count = db.prepare(
      'SELECT COUNT(*) AS n FROM concierge_conversations WHERE user_id = ?',
    ).get(userId) as { n: number | bigint };
    if (Number(count.n) >= MAX_CONVERSATIONS_PER_USER) return { error: 'limit' };

    const at = now.toISOString();
    const id = randomUUID();
    const context = emptyConversationContext(detectLang(firstMessage));
    db.prepare(
      `INSERT INTO concierge_conversations(id,user_id,area_key,context_json,created_at,updated_at)
       VALUES(?,?,?,?,?,?)`,
    ).run(id, userId, areaKey, JSON.stringify(context), at, at);
    return { conversation: { id, userId, areaKey, context, createdAt: at, updatedAt: at } };
  });
  if ('error' in result) {
    if (result.error === 'not_found') throw new ConversationNotFound();
    throw new ConversationLimitReached();
  }
  return result.conversation;
}

export function recentConversationMessages(
  db: DB,
  conversationId: string,
  limit = 8,
): { role: 'user' | 'assistant'; content: string }[] {
  const safeLimit = Math.max(1, Math.min(20, Math.floor(limit)));
  const rows = db.prepare(
    `SELECT role,content FROM concierge_messages WHERE conversation_id = ?
     ORDER BY created_at DESC,id DESC LIMIT ?`,
  ).all(conversationId, safeLimit) as unknown as { role: string; content: string }[];
  return rows.reverse().filter((item): item is { role: 'user' | 'assistant'; content: string } => (
    (item.role === 'user' || item.role === 'assistant') && typeof item.content === 'string'
  )).map((item) => ({ role: item.role, content: item.content }));
}

export function saveConversationTurn(
  db: DB,
  conversation: StoredConversation,
  userMessage: string,
  assistantMessage: string,
  context: ConversationContext,
  now = new Date(),
): void {
  const currentRow = db.prepare(
    'SELECT context_json,updated_at FROM concierge_conversations WHERE id = ? AND user_id = ?',
  ).get(conversation.id, conversation.userId) as { context_json: string; updated_at: string } | undefined;
  const current = currentRow ? parseContext(currentRow.context_json) : conversation.context;
  const effective = currentRow && currentRow.updated_at !== conversation.updatedAt
    ? mergeConcurrentContext(current, context)
    : context;

  // Requests can finish in the same millisecond or out of order after an
  // upstream call. Keep message ordering monotonic inside this conversation.
  const lastMs = Date.parse(currentRow?.updated_at ?? conversation.updatedAt);
  const userMs = Math.max(now.getTime(), Number.isFinite(lastMs) ? lastMs + 1 : now.getTime());
  const at = new Date(userMs).toISOString();
  const assistantAt = new Date(userMs + 1).toISOString();
  const insert = db.prepare(
    `INSERT INTO concierge_messages(id,conversation_id,role,content,created_at) VALUES(?,?,?,?,?)`,
  );
  insert.run(randomUUID(), conversation.id, 'user', userMessage, at);
  insert.run(randomUUID(), conversation.id, 'assistant', assistantMessage, assistantAt);

  // Recent turns and the summary are the memory. Keeping an unbounded raw
  // transcript would retain personal travel text forever without improving
  // context resolution.
  db.prepare(
    `DELETE FROM concierge_messages
      WHERE conversation_id = ? AND id NOT IN (
        SELECT id FROM concierge_messages WHERE conversation_id = ?
        ORDER BY created_at DESC,id DESC LIMIT ?
      )`,
  ).run(conversation.id, conversation.id, MAX_STORED_MESSAGES);

  // A bounded deterministic summary is enough for reference resolution. The
  // raw recent turns are still supplied separately, while old turns never
  // grow an LLM request without limit.
  const newSummary = [
    effective.conversationSummary,
    `User asked about ${effective.currentIntent ?? 'GENERAL'}.`,
    effective.selectedDestination ? `Selected destination: ${effective.selectedDestination}.` : '',
    effective.selectedArea ? `Selected area: ${effective.selectedArea}.` : '',
    effective.preferredCategories.length ? `Interests: ${effective.preferredCategories.join(', ')}.` : '',
  ].filter(Boolean).join(' ').slice(-800);
  const saved = { ...effective, conversationSummary: newSummary };
  db.prepare(
    'UPDATE concierge_conversations SET context_json = ?, updated_at = ? WHERE id = ? AND user_id = ?',
  ).run(JSON.stringify(saved), assistantAt, conversation.id, conversation.userId);
}

/** Merge facts accumulated while this request was waiting on an upstream. */
function mergeConcurrentContext(
  stored: ConversationContext,
  incoming: ConversationContext,
): ConversationContext {
  return {
    ...stored,
    ...incoming,
    previousIntent: stored.currentIntent ?? incoming.previousIntent,
    currentLocation: incoming.currentLocation ?? stored.currentLocation,
    selectedDestination: incoming.selectedDestination ?? stored.selectedDestination,
    selectedArea: incoming.selectedArea ?? stored.selectedArea,
    selectedPlaces: [...new Set([...stored.selectedPlaces, ...incoming.selectedPlaces])].slice(-50),
    preferredCategories: [...new Set([...stored.preferredCategories, ...incoming.preferredCategories])].slice(-6),
    lastSearchResults: incoming.lastSearchResults.length > 0
      ? incoming.lastSearchResults
      : stored.lastSearchResults,
    travelDate: incoming.travelDate ?? stored.travelDate,
    travelTime: incoming.travelTime ?? stored.travelTime,
    budget: incoming.budget ?? stored.budget,
    travelMode: incoming.travelMode ?? stored.travelMode,
    conversationSummary: stored.conversationSummary,
  };
}

export function conversationHistory(
  db: DB,
  userId: string,
  conversationId: string,
  limit = 50,
): { role: 'user' | 'assistant'; content: string; createdAt: string }[] | null {
  const owns = db.prepare('SELECT 1 AS one FROM concierge_conversations WHERE id = ? AND user_id = ?')
    .get(conversationId, userId);
  if (!owns) return null;
  const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
  return (db.prepare(
    `SELECT role,content,created_at FROM concierge_messages WHERE conversation_id = ?
     ORDER BY created_at DESC,id DESC LIMIT ?`,
  ).all(conversationId, safeLimit) as unknown as { role: 'user' | 'assistant'; content: string; created_at: string }[])
    .reverse().map((item) => ({ role: item.role, content: item.content, createdAt: item.created_at }));
}

export interface ConversationHistoryView {
  conversationId: string;
  messages: { role: 'user' | 'assistant'; content: string; createdAt: string }[];
}

/**
 * The conversation a traveller most recently used in this area, including an
 * older thread that is still inside the retention window. Reading history is
 * not permission to allocate a conversation, so an empty inbox returns null.
 */
export function latestConversationHistory(
  db: DB,
  userId: string,
  areaKey: string,
  limit = 100,
  now = new Date(),
): ConversationHistoryView | null {
  const cutoff = new Date(now.getTime() - CONVERSATION_RETENTION_MS).toISOString();
  const row = db.prepare(
    `SELECT id FROM concierge_conversations
      WHERE user_id = ? AND area_key = ? AND updated_at > ?
      ORDER BY updated_at DESC LIMIT 1`,
  ).get(userId, areaKey, cutoff) as { id: string } | undefined;
  if (!row) return null;
  return {
    conversationId: row.id,
    messages: conversationHistory(db, userId, row.id, limit) ?? [],
  };
}

/**
 * Clear every Chivar Bot thread in the selected area. Deleting only the most
 * recent thread would let the next message silently resume an older context,
 * which is the opposite of what “clear chat” promises.
 */
export function clearConversationHistory(db: DB, userId: string, areaKey: string): number {
  return transact(db, () => Number(db.prepare(
    'DELETE FROM concierge_conversations WHERE user_id = ? AND area_key = ?',
  ).run(userId, areaKey).changes ?? 0));
}
