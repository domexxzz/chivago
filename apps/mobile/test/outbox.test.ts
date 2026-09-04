import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

import { enqueueProof, flushOutbox, memoryStore, pendingCount, pendingFor, type ProofPayload } from '../src/state/outbox.ts';

/**
 * "Saved - will upload when you have signal", held to meaning it.
 */

const payload = (n: number): ProofPayload => ({
  photos: [{ uri: `file:///p${n}.jpg`, lat: 9.5, lng: 100.0, takenAt: null }],
  weightKg: null,
  position: { lat: 9.5, lng: 100.0, accuracyM: 8, mocked: false },
});

describe('the proof outbox', () => {
  test('a queued proof is there after the app is gone and back', async () => {
    const store = memoryStore();
    await enqueueProof(store, 'q1', payload(1));
    assert.equal(await pendingFor(store, 'q1'), 1);
    assert.equal(await pendingFor(store, 'q2'), 0);
    assert.equal(await pendingCount(store), 1);
  });

  test('a flush sends oldest first and clears what went', async () => {
    const store = memoryStore();
    await enqueueProof(store, 'q1', payload(1), new Date('2026-09-05T01:00:00Z'));
    await enqueueProof(store, 'q2', payload(2), new Date('2026-09-05T01:05:00Z'));
    const sent: string[] = [];
    const report = await flushOutbox(store, async (questId) => { sent.push(questId); return { ok: true }; });
    assert.deepEqual(sent, ['q1', 'q2']);
    assert.equal(report.sent.length, 2);
    assert.equal(await pendingCount(store), 0);
  });

  test('still offline: nothing is lost, nothing after the first failure is even tried', async () => {
    const store = memoryStore();
    await enqueueProof(store, 'q1', payload(1));
    await enqueueProof(store, 'q2', payload(2));
    let tries = 0;
    const report = await flushOutbox(store, async () => { tries += 1; return { ok: false, code: 'NETWORK', error: 'no signal' }; });
    assert.equal(tries, 1, 'thirty timeouts in a row is a minute of nothing');
    assert.equal(report.kept.length, 2);
    assert.equal(report.kept[0]!.attempts, 1, 'the one tried remembers it was');
    assert.equal(await pendingCount(store), 2);
  });

  test('a proof the server refuses is dropped with its reason, not retried forever', async () => {
    const store = memoryStore();
    await enqueueProof(store, 'q1', payload(1));
    await enqueueProof(store, 'q2', payload(2));
    const report = await flushOutbox(store, async (questId) =>
      (questId === 'q1' ? { ok: false, code: 'WRONG_STAGE', error: 'Arrive first' } : { ok: true }));
    assert.equal(report.dropped.length, 1);
    assert.equal(report.dropped[0]!.error, 'Arrive first');
    assert.equal(report.sent.length, 1);
    assert.equal(await pendingCount(store), 0);
  });
});
