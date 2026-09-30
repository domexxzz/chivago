import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { diagnose, redact } from './assist-spike.ts';

/** The spike prints upstream error bodies to a terminal: the key must never be in one. */

test('the key is cut out wherever it appears, however often', () => {
  const s = redact('Bearer abc123 was refused; abc123 is not valid', 'abc123');
  assert.equal(s, 'Bearer [redacted] was refused; [redacted] is not valid');
  assert.equal(redact('nothing here', ''), 'nothing here');
});

test('each refusal points at the one of the three questions it answers', () => {
  assert.match(diagnose(403, '{"message":"The security token included in the request is invalid"}'), /^auth:/);
  assert.match(diagnose(403, '{"message":"You don\'t have access to the model with the specified model ID."}'), /model access/);
  assert.match(diagnose(400, '{"message":"The provided model identifier is invalid."}'), /^region\/model:/);
  assert.match(diagnose(404, ''), /^region\/model:/);
  assert.match(diagnose(400, '{"message":"messages.0.content.1.image: bad"}'), /^shape:/);
  assert.match(diagnose(429, ''), /^throttled/);
  assert.match(diagnose(503, ''), /Bedrock itself/);
});
