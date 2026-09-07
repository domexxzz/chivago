import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { SEED_PLACES } from '@chivago/core';
import { API_BASE } from '../src/api/client.ts';
import { photoUri } from '../src/api/photos.ts';

/**
 * Place photographs.
 *
 * Two promises: a photograph in the seed is a file that exists (a path that
 * 404s is a grey box with a credit under it), and a phone can reach it. The
 * licence itself is a human's promise - see public/assets/places/README.md.
 */

const PUBLIC = join(import.meta.dirname, '..', 'public');

describe('a photograph the seed names is a file that ships', () => {
  test('every own-origin photo path exists under public/', () => {
    for (const p of SEED_PLACES) {
      if (!p.photo || !p.photo.url.startsWith('/')) continue;
      assert.ok(existsSync(join(PUBLIC, p.photo.url)), `${p.id}: ${p.photo.url} is not in apps/mobile/public`);
    }
  });

  test('every photo carries its credit and licence', () => {
    for (const p of SEED_PLACES) {
      if (!p.photo) continue;
      assert.ok(p.photo.credit, `${p.id}: no credit`);
      assert.ok(p.photo.licence, `${p.id}: no licence`);
      assert.ok(p.photo.sourceUrl, `${p.id}: no source`);
    }
  });
});

describe('where the phone fetches a photograph from', () => {
  test('a licensed photograph elsewhere keeps its address', () => {
    const url = 'https://upload.wikimedia.org/wikipedia/commons/x.jpg';
    assert.equal(photoUri(url), url);
  });

  test('an own-origin path stays a path in a browser, and is given the API\'s origin on a phone', () => {
    assert.equal(photoUri('/assets/places/ku-library.jpg', 'web'), '/assets/places/ku-library.jpg');
    assert.equal(photoUri('/assets/places/ku-library.jpg', 'ios'), `${API_BASE.replace(/\/$/, '')}/assets/places/ku-library.jpg`);
    assert.equal(photoUri('/assets/places/ku-library.jpg', 'android'), `${API_BASE.replace(/\/$/, '')}/assets/places/ku-library.jpg`);
  });
});
