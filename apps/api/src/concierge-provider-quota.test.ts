import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { openTestDb } from './db-node.ts';
import {
  DEFAULT_GROQ_REQUESTS_PER_MINUTE, groqRequestsPerMinute, takeGroqProviderQuota,
} from './concierge-provider-quota.ts';

describe('shared Groq provider quota', () => {
  test('uses a bounded deployment default and validates configuration', () => {
    assert.equal(groqRequestsPerMinute({}), DEFAULT_GROQ_REQUESTS_PER_MINUTE);
    assert.equal(groqRequestsPerMinute({ GROQ_GLOBAL_REQUESTS_PER_MINUTE: '7' }), 7);
    assert.equal(groqRequestsPerMinute({ GROQ_GLOBAL_REQUESTS_PER_MINUTE: '0' }), DEFAULT_GROQ_REQUESTS_PER_MINUTE);
    assert.equal(groqRequestsPerMinute({ GROQ_GLOBAL_REQUESTS_PER_MINUTE: '10001' }), DEFAULT_GROQ_REQUESTS_PER_MINUTE);
  });

  test('shares one atomic bucket across callers and resets only after the window', () => {
    const db = openTestDb();
    assert.equal(takeGroqProviderQuota(db, 2, 1_000), true);
    assert.equal(takeGroqProviderQuota(db, 2, 1_001), true);
    assert.equal(takeGroqProviderQuota(db, 2, 1_002), false);
    assert.equal(takeGroqProviderQuota(db, 2, 60_999), false);
    assert.equal(takeGroqProviderQuota(db, 2, 61_000), true);
    const row = db.prepare('SELECT used FROM concierge_provider_quota WHERE provider = ?').get('groq') as { used: number };
    assert.equal(Number(row.used), 1);
    db.close();
  });

  test('fails closed if the wall clock moves backwards and resets after the original window', () => {
    const db = openTestDb();
    assert.equal(takeGroqProviderQuota(db, 1, 10_000), true);
    assert.equal(takeGroqProviderQuota(db, 1, 9_000), false);
    assert.equal(takeGroqProviderQuota(db, 1, 70_000), true);
    db.close();
  });
});
