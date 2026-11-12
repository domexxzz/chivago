/**
 * The blob store, both backings.
 *
 * The R2 backing is exercised against a fake bucket rather than a real one -
 * the point is that the ADAPTER is right, and a real bucket would test
 * Cloudflare's code instead of ours. The fake implements only the three
 * methods `R2Like` declares, so a call this port makes that R2 does not offer
 * fails here rather than after a deploy.
 */

import { strict as assert } from 'node:assert';
import { test, describe, beforeEach, afterEach } from 'node:test';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  diskBlobStore,
  isLegacyPath,
  r2BlobStore,
  uploadRoot,
  type R2Like,
} from './blob-store.ts';

const BYTES = new Uint8Array([1, 2, 3, 4]);

/** An R2 bucket, in memory, offering exactly what `R2Like` promises. */
function fakeBucket(): R2Like & { keys: () => string[] } {
  const store = new Map<string, Uint8Array>();
  return {
    keys: () => [...store.keys()],
    put(key, value) {
      store.set(key, value instanceof Uint8Array ? value : new Uint8Array(value));
      return Promise.resolve(undefined);
    },
    get(key) {
      const found = store.get(key);
      if (!found) return Promise.resolve(null);
      return Promise.resolve({
        arrayBuffer: () =>
          Promise.resolve(found.buffer.slice(found.byteOffset, found.byteOffset + found.byteLength) as ArrayBuffer),
      });
    },
    delete(key) {
      store.delete(key);
      return Promise.resolve();
    },
  };
}

describe('the disk backing', () => {
  let dir: string;
  let previous: string | undefined;

  beforeEach(() => {
    previous = process.env.CHIVAGO_UPLOADS;
    dir = mkdtempSync(join(tmpdir(), 'chivago-blob-'));
    process.env.CHIVAGO_UPLOADS = dir;
  });

  afterEach(() => {
    if (previous === undefined) delete process.env.CHIVAGO_UPLOADS;
    else process.env.CHIVAGO_UPLOADS = previous;
    rmSync(dir, { recursive: true, force: true });
  });

  test('a key round-trips, and lands where the key says', async () => {
    const store = diskBlobStore();
    await store.put('photos/ab/one.jpg', BYTES);
    assert.deepEqual(await store.get('photos/ab/one.jpg'), BYTES);
    // Not only readable through the port - actually on the disk, at that path.
    assert.deepEqual(new Uint8Array(readFileSync(join(uploadRoot(), 'photos/ab/one.jpg'))), BYTES);
  });

  test('intermediate directories are created', async () => {
    const store = diskBlobStore();
    await store.put('a/b/c/d/deep.jpg', BYTES);
    assert.deepEqual(await store.get('a/b/c/d/deep.jpg'), BYTES);
  });

  test('a missing key is null, not a throw', async () => {
    assert.equal(await diskBlobStore().get('photos/ab/absent.jpg'), null);
  });

  test('deleting is idempotent', async () => {
    const store = diskBlobStore();
    await store.put('photos/ab/one.jpg', BYTES);
    await store.delete('photos/ab/one.jpg');
    await store.delete('photos/ab/one.jpg');
    assert.equal(await store.get('photos/ab/one.jpg'), null);
  });

  test('an OLD absolute path is still readable - the live volume has real photographs', async () => {
    /*
      Rows written before this port hold an absolute filesystem path. A port
      is not permitted to orphan the photographs already on the Fly volume, so
      the disk store reads either shape.
    */
    const legacyDir = join(dir, 'legacy');
    mkdirSync(legacyDir, { recursive: true });
    const legacy = join(legacyDir, 'old.jpg');
    writeFileSync(legacy, BYTES);
    assert.ok(isLegacyPath(legacy), 'the fixture is the legacy shape');
    assert.deepEqual(await diskBlobStore().get(legacy), BYTES);
  });

  for (const nasty of ['../escape.jpg', 'photos/../../escape.jpg', '/etc/passwd', '']) {
    test(`a key that escapes the root is refused: ${JSON.stringify(nasty)}`, async () => {
      // Unreachable today - the filename is generated, never the client's -
      // but this is what turns a future mistake into an error rather than a
      // write outside the upload root.
      await assert.rejects(() => diskBlobStore().put(nasty, BYTES));
    });
  }
});

describe('the R2 backing', () => {
  test('a key round-trips', async () => {
    const bucket = fakeBucket();
    const store = r2BlobStore(bucket);
    await store.put('photos/ab/one.jpg', BYTES);
    assert.deepEqual(bucket.keys(), ['photos/ab/one.jpg'], 'the key is used verbatim');
    assert.deepEqual(await store.get('photos/ab/one.jpg'), BYTES);
  });

  test('a missing key is null', async () => {
    assert.equal(await r2BlobStore(fakeBucket()).get('photos/ab/absent.jpg'), null);
  });

  test('delete removes it', async () => {
    const bucket = fakeBucket();
    const store = r2BlobStore(bucket);
    await store.put('k/one.jpg', BYTES);
    await store.delete('k/one.jpg');
    assert.deepEqual(bucket.keys(), []);
  });

  test('an OLD absolute path reads as null, not as an error', async () => {
    /*
      An absolute path names a place on the Fly volume, which R2 does not have.
      Null means "not migrated yet", which the migration runbook resolves. The
      alternative - asking R2 for a key beginning with a slash - would be a
      confident lookup for something that cannot be there.
    */
    assert.equal(await r2BlobStore(fakeBucket()).get('/data/uploads/ab/old.jpg'), null);
  });

  test('an escaping key is refused here too', async () => {
    await assert.rejects(() => r2BlobStore(fakeBucket()).put('../escape.jpg', BYTES));
  });
});

describe('telling a key from an old path', () => {
  test('keys are relative', () => {
    assert.equal(isLegacyPath('photos/ab/one.jpg'), false);
    assert.equal(isLegacyPath('stories/one.mp4'), false);
  });

  test('old paths are absolute, on either platform', () => {
    assert.equal(isLegacyPath('/data/uploads/ab/one.jpg'), true);
    assert.equal(isLegacyPath('C:\\data\\uploads\\ab\\one.jpg'), true);
    assert.equal(isLegacyPath('c:/data/uploads/ab/one.jpg'), true);
    assert.equal(isLegacyPath('\\\\server\\share\\one.jpg'), true);
  });
});
