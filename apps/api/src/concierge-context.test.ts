import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { emptyConversationContext } from '@chivago/core';
import { openTestDb } from './db-node.ts';
import {
  CONVERSATION_RETENTION_MS, MAX_CONVERSATIONS_PER_USER, MAX_STORED_MESSAGES,
  ConversationLimitReached, ConversationNotFound, clearConversationHistory,
  conversationFor, conversationHistory, latestConversationHistory,
  recentConversationMessages, saveConversationTurn,
} from './concierge-context.ts';

const NOW = new Date('2026-11-16T03:00:00.000Z');

describe('persistent concierge context', () => {
  test('resumes by user and area, preserves turn order, and never leaks to another user', () => {
    const db = openTestDb();
    for (const id of ['u1', 'u2']) db.prepare('INSERT INTO users(id,display_name,created_at) VALUES(?,?,?)').run(id, id, NOW.toISOString());

    const first = conversationFor(db, 'u1', 'koh-sichang', null, 'ที่เที่ยว', NOW);
    const context = { ...emptyConversationContext(), currentIntent: 'TOURISM' as const, lastSearchResults: ['p1'] };
    saveConversationTurn(db, first, 'ที่เที่ยว', 'มีตัวเลือกครับ', context, NOW);

    const resumed = conversationFor(db, 'u1', 'koh-sichang', null, 'แล้วพรุ่งนี้', new Date(NOW.getTime() + 5_000));
    assert.equal(resumed.id, first.id);
    assert.deepEqual(resumed.context.lastSearchResults, ['p1']);
    assert.deepEqual(recentConversationMessages(db, first.id), [
      { role: 'user', content: 'ที่เที่ยว' },
      { role: 'assistant', content: 'มีตัวเลือกครับ' },
    ]);

    assert.equal(conversationHistory(db, 'u2', first.id), null);
    assert.throws(
      () => conversationFor(db, 'u2', 'koh-sichang', first.id, 'hello', NOW),
      ConversationNotFound,
    );
    db.close();
  });

  test('starts a new context after the 24 hour resume window', () => {
    const db = openTestDb();
    db.prepare('INSERT INTO users(id,display_name,created_at) VALUES(?,?,?)').run('u1', 'u1', NOW.toISOString());
    const first = conversationFor(db, 'u1', 'koh-sichang', null, 'hello', NOW);
    const later = conversationFor(db, 'u1', 'koh-sichang', null, 'hello again', new Date(NOW.getTime() + 25 * 60 * 60_000));
    assert.notEqual(later.id, first.id);
    db.close();
  });

  test('loads the latest area transcript and clearing it cannot resume an older context', () => {
    const db = openTestDb();
    db.prepare('INSERT INTO users(id,display_name,created_at) VALUES(?,?,?)').run('u1', 'u1', NOW.toISOString());
    const first = conversationFor(db, 'u1', 'samui', null, 'first question', NOW);
    saveConversationTurn(db, first, 'first question', 'first answer', emptyConversationContext('en'), NOW);
    const secondAt = new Date(NOW.getTime() + 25 * 60 * 60_000);
    const second = conversationFor(db, 'u1', 'samui', null, 'new question', secondAt);
    saveConversationTurn(db, second, 'new question', 'new answer', emptyConversationContext('en'), secondAt);

    const latest = latestConversationHistory(db, 'u1', 'samui', 100, secondAt);
    assert.equal(latest?.conversationId, second.id);
    assert.deepEqual(latest?.messages.map((message) => message.content), ['new question', 'new answer']);
    assert.equal(latestConversationHistory(db, 'u1', 'koh-sichang', 100, secondAt), null);

    assert.equal(clearConversationHistory(db, 'u1', 'samui'), 2);
    assert.equal(latestConversationHistory(db, 'u1', 'samui', 100, secondAt), null);
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM concierge_messages').get() as { n: number }).n, 0);
    db.close();
  });

  test('expires an explicitly requested inactive conversation without leaking or retaining messages', () => {
    const db = openTestDb();
    db.prepare('INSERT INTO users(id,display_name,created_at) VALUES(?,?,?)').run('u1', 'u1', NOW.toISOString());
    const old = conversationFor(db, 'u1', 'koh-sichang', null, 'hello', NOW);
    saveConversationTurn(db, old, 'hello', 'hi', old.context, NOW);
    assert.throws(
      () => conversationFor(
        db, 'u1', 'koh-sichang', old.id, 'again',
        new Date(NOW.getTime() + CONVERSATION_RETENTION_MS + 10),
      ),
      ConversationNotFound,
    );
    assert.equal(
      Number((db.prepare('SELECT COUNT(*) AS n FROM concierge_messages WHERE conversation_id = ?').get(old.id) as { n: number }).n),
      0,
    );
    db.close();
  });

  test('rejects unknown, foreign and wrong-area ids without allocating a conversation', () => {
    const db = openTestDb();
    for (const id of ['u1', 'u2']) db.prepare('INSERT INTO users(id,display_name,created_at) VALUES(?,?,?)').run(id, id, NOW.toISOString());
    const foreign = conversationFor(db, 'u1', 'koh-sichang', null, 'hello', NOW);
    const prior = conversationFor(db, 'u2', 'koh-sichang', null, 'เที่ยว', NOW);
    const before = Number((db.prepare('SELECT COUNT(*) AS n FROM concierge_conversations').get() as { n: number }).n);
    for (const run of [
      () => conversationFor(db, 'u2', 'koh-sichang', foreign.id, 'new topic', NOW),
      () => conversationFor(db, 'u2', 'koh-sichang', 'does-not-exist', 'new topic', NOW),
      () => conversationFor(db, 'u2', 'samui', prior.id, 'new topic', NOW),
    ]) assert.throws(run, ConversationNotFound);
    const after = Number((db.prepare('SELECT COUNT(*) AS n FROM concierge_conversations').get() as { n: number }).n);
    assert.equal(after, before);
    db.close();
  });

  test('caps active conversations and removes only expired history before a new allocation', () => {
    const db = openTestDb();
    db.prepare('INSERT INTO users(id,display_name,created_at) VALUES(?,?,?)').run('u1', 'u1', NOW.toISOString());
    const expired = conversationFor(db, 'u1', 'old-area', null, 'old', NOW);
    saveConversationTurn(db, expired, 'old', 'old answer', expired.context, NOW);

    const freshNow = new Date(NOW.getTime() + CONVERSATION_RETENTION_MS + 10);
    for (let index = 0; index < MAX_CONVERSATIONS_PER_USER; index += 1) {
      conversationFor(db, 'u1', `area-${index}`, null, 'hello', freshNow);
    }
    assert.equal(
      Number((db.prepare('SELECT COUNT(*) AS n FROM concierge_conversations WHERE user_id = ?').get('u1') as { n: number }).n),
      MAX_CONVERSATIONS_PER_USER,
    );
    assert.equal(
      Number((db.prepare('SELECT COUNT(*) AS n FROM concierge_messages WHERE conversation_id = ?').get(expired.id) as { n: number }).n),
      0,
      'expired conversation messages must cascade',
    );
    assert.throws(
      () => conversationFor(db, 'u1', 'one-more-area', null, 'hello', freshNow),
      ConversationLimitReached,
    );
    assert.equal(
      Number((db.prepare('SELECT COUNT(*) AS n FROM concierge_conversations WHERE user_id = ?').get('u1') as { n: number }).n),
      MAX_CONVERSATIONS_PER_USER,
    );
    db.close();
  });

  test('isolates auto-resume by area and recovers safely from malformed stored context', () => {
    const db = openTestDb();
    db.prepare('INSERT INTO users(id,display_name,created_at) VALUES(?,?,?)').run('u1', 'u1', NOW.toISOString());
    const sichang = conversationFor(db, 'u1', 'koh-sichang', null, 'hello', NOW);
    const samui = conversationFor(db, 'u1', 'samui', null, 'hello', NOW);
    assert.notEqual(sichang.id, samui.id);

    db.prepare('UPDATE concierge_conversations SET context_json = ? WHERE id = ?').run('{not-json', sichang.id);
    const recovered = conversationFor(db, 'u1', 'koh-sichang', sichang.id, 'hello', NOW);
    assert.deepEqual(recovered.context, emptyConversationContext());
    db.close();
  });

  test('merges stale concurrent saves and keeps raw transcript storage bounded', () => {
    const db = openTestDb();
    db.prepare('INSERT INTO users(id,display_name,created_at) VALUES(?,?,?)').run('u1', 'u1', NOW.toISOString());
    const conversation = conversationFor(db, 'u1', 'koh-sichang', null, 'hello', NOW);
    const staleCopy = { ...conversation, context: { ...conversation.context } };

    saveConversationTurn(db, conversation, 'nature', 'one', {
      ...emptyConversationContext(), currentIntent: 'TOURISM', selectedPlaces: ['p1'],
      lastSearchResults: ['p1'], preferredCategories: ['nature'],
    }, NOW);
    saveConversationTurn(db, staleCopy, 'food', 'two', {
      ...emptyConversationContext(), currentIntent: 'RESTAURANT', selectedPlaces: ['p2'],
      lastSearchResults: ['p2'], preferredCategories: ['food'],
    }, NOW);

    const merged = conversationFor(db, 'u1', 'koh-sichang', conversation.id, 'again', NOW);
    assert.deepEqual(merged.context.selectedPlaces, ['p1', 'p2']);
    assert.deepEqual(merged.context.preferredCategories, ['nature', 'food']);
    assert.equal(merged.context.currentIntent, 'RESTAURANT');
    assert.deepEqual(recentConversationMessages(db, conversation.id), [
      { role: 'user', content: 'nature' }, { role: 'assistant', content: 'one' },
      { role: 'user', content: 'food' }, { role: 'assistant', content: 'two' },
    ]);

    for (let index = 0; index < 105; index += 1) {
      const latest = conversationFor(db, 'u1', 'koh-sichang', conversation.id, 'turn', NOW);
      saveConversationTurn(db, latest, `u${index}`, `a${index}`, latest.context, NOW);
    }
    const count = db.prepare('SELECT COUNT(*) AS n FROM concierge_messages WHERE conversation_id = ?')
      .get(conversation.id) as { n: number };
    assert.equal(count.n, MAX_STORED_MESSAGES);
    assert.equal(conversationHistory(db, 'u1', conversation.id, 1_000)?.length, 100);
    db.close();
  });
});
