import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';
import {
  enqueueActivityEvidence, enqueueJournalChange, enqueueProof, flushActivityEvidenceOutbox,
  flushJournalOutbox, flushOutbox, memoryStore,
} from './outbox.ts';

const fix = { lat: 13.15, lng: 100.8, accuracyM: 12, mocked: false };

describe('shared offline outbox', () => {
  test('Adventure evidence is idempotent and stays separate from legacy Quest proof', async () => {
    const store = memoryStore();
    await enqueueProof(store, 'quest-1', { photos: [], weightKg: null, position: fix });
    const first = await enqueueActivityEvidence(store, {
      nodeId: 'node-1', clientRequestId: 'request-12345678', qrScanId: 'scan-1',
      photos: [{ uri: 'file:///evidence.jpg', mimeType: 'image/jpeg' }], position: fix,
    });
    const duplicate = await enqueueActivityEvidence(store, {
      nodeId: 'node-1', clientRequestId: 'request-12345678', qrScanId: 'scan-1',
      photos: [{ uri: 'file:///other.jpg' }], position: fix,
    });
    assert.equal(first.id, duplicate.id);
    assert.equal((await store.read()).length, 2);

    const activity = await flushActivityEvidenceOutbox(store, async () => ({ ok: true }));
    assert.equal(activity.sent.length, 1);
    assert.equal((await store.read()).length, 1, 'Quest proof remains queued');
    const quest = await flushOutbox(store, async () => ({ ok: true }));
    assert.equal(quest.sent.length, 1);
    assert.equal((await store.read()).length, 0);
  });

  test('network failure keeps and increments only the first Adventure item; server refusal is dropped', async () => {
    const store = memoryStore();
    await enqueueActivityEvidence(store, {
      nodeId: 'node-1', clientRequestId: 'request-network-1', qrScanId: null,
      photos: [{ uri: 'file:///one.jpg' }], position: fix,
    });
    await enqueueActivityEvidence(store, {
      nodeId: 'node-2', clientRequestId: 'request-network-2', qrScanId: null,
      photos: [{ uri: 'file:///two.jpg' }], position: fix,
    });
    const offline = await flushActivityEvidenceOutbox(store, async () => ({
      ok: false, code: 'NETWORK', error: 'offline',
    }));
    assert.equal(offline.kept.length, 2);
    assert.equal(offline.kept[0]?.attempts, 1);
    assert.equal(offline.kept[1]?.attempts, 0);

    const refused = await flushActivityEvidenceOutbox(store, async () => ({
      ok: false, code: 'QR_EXPIRED', error: 'QR expired before sync',
    }), new Date(Date.now() + 60_000));
    assert.equal(refused.dropped.length, 2);
    assert.equal((await store.read()).length, 0);
  });

  test('journal changes merge offline, back off, then surface server conflicts instead of overwriting', async () => {
    const store = memoryStore();
    await enqueueJournalChange(store, 'entry-1', { note: 'First' }, '2026-11-21T00:00:00.000Z');
    await enqueueJournalChange(store, 'entry-1', { visibility: 'shared', note: 'Latest' }, '2026-11-21T00:00:00.000Z');
    assert.equal((await store.read()).length, 1);
    const offlineAt = new Date('2026-11-21T01:00:00.000Z');
    const offline = await flushJournalOutbox(store, async () => ({ ok: false, code: 'NETWORK', error: 'offline' }), offlineAt);
    assert.equal(offline.kept.length, 1);
    assert.equal(offline.kept[0]!.attempts, 1);
    const tooSoon = await flushJournalOutbox(store, async () => ({ ok: true }), new Date('2026-11-21T01:00:10.000Z'));
    assert.equal(tooSoon.sent.length, 0);
    const conflict = await flushJournalOutbox(store, async (item) => {
      assert.equal(item.patch.note, 'Latest'); assert.equal(item.patch.visibility, 'shared');
      assert.equal(item.expectedUpdatedAt, '2026-11-21T00:00:00.000Z');
      return { ok: false, code: 'JOURNAL_CONFLICT', error: 'newer copy' };
    }, new Date('2026-11-21T01:00:31.000Z'));
    assert.equal(conflict.dropped.length, 1);
    assert.equal((await store.read()).length, 0);
  });
});
