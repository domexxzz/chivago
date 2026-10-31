import assert from 'node:assert/strict';
import { test } from 'node:test';
import 'fake-indexeddb/auto';
import { webOfflineStorage } from './storage-web.ts';

test('IndexedDB persists records across adapter instances and isolates keys', async () => {
  const first = webOfflineStorage();
  await first.set('chivago.public.v3.places.samui', 'one');
  await first.set('other', 'untouched');
  const reopened = webOfflineStorage();
  assert.equal(await reopened.get('chivago.public.v3.places.samui'), 'one');
  assert.ok((await reopened.keys()).includes('chivago.public.v3.places.samui'));
  await reopened.delete('chivago.public.v3.places.samui');
  assert.equal(await first.get('chivago.public.v3.places.samui'), null);
  assert.equal(await first.get('other'), 'untouched');
});
