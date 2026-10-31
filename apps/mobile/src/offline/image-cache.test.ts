import assert from 'node:assert/strict';
import { test } from 'node:test';
import { publicImageUrl } from './image-cache.ts';

test('public image cache rejects credentials, query tokens and non-http URLs', () => {
  assert.equal(publicImageUrl('https://example.com/cover.jpg'), 'https://example.com/cover.jpg');
  assert.equal(publicImageUrl('https://example.com/cover.jpg?token=secret'), null);
  assert.equal(publicImageUrl('https://user:pass@example.com/cover.jpg'), null);
  assert.equal(publicImageUrl('file:///private/photo.jpg'), null);
  assert.equal(publicImageUrl('http://example.com/cover.jpg'), null);
});
