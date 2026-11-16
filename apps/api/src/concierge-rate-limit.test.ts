import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createConciergeRateLimiter } from './concierge-rate-limit.ts';

test('concierge rate limit refuses the excess call, resets by time and bounds identities', () => {
  const limiter = createConciergeRateLimiter(2, 1_000, 3);
  assert.equal(limiter.take('u1', 0), true);
  assert.equal(limiter.take('u1', 1), true);
  assert.equal(limiter.take('u1', 2), false);
  assert.equal(limiter.take('u1', 1_000), true);

  limiter.take('u2', 1_001);
  limiter.take('u3', 1_001);
  limiter.take('u4', 1_001);
  assert.equal(limiter.size(), 3);
  limiter.reset();
  assert.equal(limiter.size(), 0);
});
