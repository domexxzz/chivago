/**
 * Where uploaded bytes live.
 *
 * WHY A PORT. `uploads.ts` always said "`storagePath` is the only thing that
 * changes when this moves to S3/R2", and it was nearly right - but it was
 * written with `writeFileSync`/`readFileSync`, and an object store is async.
 * So unlike Durable Object SQLite, which is synchronous and could be adapted
 * invisibly, this one really does push `async` into its callers. There are
 * only two of them, which is why this is a small change and not a sweep.
 *
 * TWO BACKINGS, one interface:
 *
 *  - `diskBlobStore()` - the current deployment. One machine, one mounted
 *    volume at `CHIVAGO_UPLOADS`, exactly as before.
 *  - `r2BlobStore(bucket)` - a Cloudflare R2 bucket, for the Worker.
 *
 * Both are needed at once rather than one replacing the other: media
 * transcoding needs ffmpeg and ffmpeg needs a container, so the container and
 * the Worker have to reach the same bytes. R2 is what they share.
 *
 * KEYS, NOT PATHS. A key looks like `photos/ab/<uuid>.jpg` - relative, forward
 * slashes, no leading slash. The disk store resolves it under the upload root;
 * R2 uses it verbatim. Rows written before this change hold an ABSOLUTE
 * filesystem path instead, and `isLegacyPath` below is how they keep being
 * readable: there are real photographs on the live volume and a port is not
 * permitted to orphan them.
 */

import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';

/**
 * Where uploaded bytes live on a disk deployment.
 *
 * ON A DEPLOYMENT THIS MUST POINT AT THE MOUNTED VOLUME. The default is a
 * path relative to the working directory, which inside a container is a layer
 * of the image: the rows survive a deploy on the volume and the FILES do not,
 * so every clip anybody posted turns into a grey box the next time anyone
 * ships. That happened on 9 September and cost two real uploads. `fly.toml`
 * sets CHIVAGO_UPLOADS=/data/uploads beside the database for exactly this
 * reason.
 */
export const uploadRoot = (): string =>
  resolve(process.env.CHIVAGO_UPLOADS ?? './data/uploads');

/**
 * Is this stored value an old absolute path rather than a key?
 *
 * Rows written before the port hold `/data/uploads/ab/<uuid>.jpg`, and on a
 * Windows development machine `C:\...\data\uploads\...`. Keys never start with
 * a separator and never carry a drive letter, so the test is unambiguous.
 */
export const isLegacyPath = (stored: string): boolean =>
  stored.startsWith('/') || stored.startsWith('\\') || /^[a-z]:[\\/]/i.test(stored);

/** Bytes keyed by a path-like string. Both backings implement exactly this. */
export interface BlobStore {
  /** Store bytes. Overwrites. */
  put(key: string, bytes: Uint8Array): Promise<void>;
  /**
   * Fetch bytes, or null if there are none.
   *
   * The content type is NOT returned: `proof_files.mime_type` and
   * `stories.media_mime` already hold it, sniffed from the file's own magic
   * bytes when it arrived. Asking the store would be asking a less reliable
   * source the same question.
   */
  get(key: string): Promise<Uint8Array | null>;
  /** Remove bytes. Succeeds whether or not they were there. */
  delete(key: string): Promise<void>;
  /**
   * Read without holding the whole object, and only part of it if asked.
   *
   * Optional, and only R2 has it. A story clip is up to 25 MB and is read by
   * every phone that plays it, several ranges at a time; buffering each one
   * whole inside a 128 MB Worker is how five viewers take the API down.
   * `openBlob` below falls back to `get` and a slice for a store without it.
   */
  open?(key: string, range?: ByteRange | null): Promise<BlobRead | 'unsatisfiable' | null>;
}

/** Part of an object: from an offset, or the last `suffix` bytes. */
export type ByteRange = { offset: number; length?: number } | { suffix: number };

/** What a ranged read hands back: the bytes, and where they sit in the whole. */
export interface BlobRead {
  body: ReadableStream<Uint8Array> | Uint8Array;
  /** The whole object's size. */
  size: number;
  offset: number;
  length: number;
}

/** A single `Range: bytes=` header, or null for none or one this does not serve (multi-range). */
export function parseRange(header: string | undefined | null): ByteRange | null {
  const m = /^bytes=(\d*)-(\d*)$/.exec((header ?? '').trim());
  if (!m || (m[1] === '' && m[2] === '')) return null;
  if (m[1] === '') return { suffix: Number(m[2]) };
  const offset = Number(m[1]);
  if (m[2] === '') return { offset };
  const last = Number(m[2]);
  return last < offset ? null : { offset, length: last - offset + 1 };
}

/** Where a range lands in an object of `size` bytes, or null when it lands nowhere. */
export function resolveRange(range: ByteRange, size: number): { offset: number; length: number } | null {
  if ('suffix' in range) {
    const length = Math.min(range.suffix, size);
    return length > 0 ? { offset: size - length, length } : null;
  }
  if (range.offset >= size) return null;
  return { offset: range.offset, length: Math.min(range.length ?? Infinity, size - range.offset) };
}

/** A range of bytes already in memory, in the same shape a store's `open` gives. */
export function sliceBytes(bytes: Uint8Array, range: ByteRange | null): BlobRead | 'unsatisfiable' {
  if (!range) return { body: bytes, size: bytes.length, offset: 0, length: bytes.length };
  const at = resolveRange(range, bytes.length);
  if (!at) return 'unsatisfiable';
  return { body: bytes.subarray(at.offset, at.offset + at.length), size: bytes.length, ...at };
}

/** Read a range from whichever store this is: streamed if it can, sliced if it cannot. */
export async function openBlob(
  store: BlobStore, key: string, range: ByteRange | null,
): Promise<BlobRead | 'unsatisfiable' | null> {
  if (store.open) return store.open(key, range);
  const bytes = await store.get(key);
  return bytes ? sliceBytes(bytes, range) : null;
}

/**
 * Reject a key that would escape the store.
 *
 * The stored filename is generated and never derived from the client's, so
 * this should be unreachable - but it is the one check that turns a future
 * mistake into an error instead of a path traversal, and it costs nothing.
 */
function assertSafeKey(key: string): void {
  if (key === '' || key.startsWith('/') || key.startsWith('\\')) {
    throw new Error(`Unsafe blob key: ${JSON.stringify(key)}`);
  }
  if (/^[a-z]:/i.test(key)) throw new Error(`Unsafe blob key: ${JSON.stringify(key)}`);
  if (key.split(/[\\/]/).some((part) => part === '..')) {
    throw new Error(`Unsafe blob key: ${JSON.stringify(key)}`);
  }
}

/** The local filesystem, under `CHIVAGO_UPLOADS`. */
export function diskBlobStore(root: () => string = uploadRoot): BlobStore {
  /*
    A key is resolved under the root and then checked to be STILL under it.
    The check is on the resolved path rather than the key alone, because that
    is what catches anything `assertSafeKey` did not think of.
  */
  const pathFor = (key: string): string => {
    assertSafeKey(key);
    const base = root();
    const full = resolve(join(base, key));
    if (full !== base && !full.startsWith(base + sep)) {
      throw new Error(`Blob key escapes the upload root: ${JSON.stringify(key)}`);
    }
    return full;
  };

  /*
    `async` rather than returning a resolved promise, so that a rejected key
    REJECTS instead of throwing synchronously. A method that sometimes throws
    before it returns a promise and sometimes rejects one is two error
    channels for the same fault, and a caller who writes `.catch()` would miss
    half of them.
  */
  return {
    async put(key, bytes) {
      const full = pathFor(key);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, bytes);
    },
    async get(key) {
      // A legacy absolute path is read where it actually is. Pre-port rows
      // hold one, and the bytes on the volume are real.
      const full = isLegacyPath(key) ? key : pathFor(key);
      if (!existsSync(full)) return null;
      return new Uint8Array(readFileSync(full));
    },
    async delete(key) {
      const full = isLegacyPath(key) ? key : pathFor(key);
      rmSync(full, { force: true });
    },
  };
}

/**
 * The slice of Cloudflare's `R2Bucket` this port uses.
 *
 * Declared structurally rather than by depending on `@cloudflare/workers-types`,
 * for the same reason `do-storage.ts` declares its own: the API surface used
 * here is three methods, and a type-only dependency on the whole Workers
 * runtime would be a large thing to carry for them.
 */
export interface R2Like {
  put(key: string, value: ArrayBuffer | Uint8Array): Promise<unknown>;
  get(key: string, options?: { range?: ByteRange }): Promise<{
    arrayBuffer(): Promise<ArrayBuffer>;
    body?: ReadableStream<Uint8Array>;
    size?: number;
  } | null>;
  delete(key: string): Promise<void>;
}

/** A Cloudflare R2 bucket. */
export function r2BlobStore(bucket: R2Like): BlobStore {
  return {
    async put(key, bytes) {
      assertSafeKey(key);
      await bucket.put(key, bytes);
    },
    async get(key) {
      /*
        A legacy absolute path cannot exist in R2 - it names a place on the Fly
        volume. Returning null rather than asking is both correct and honest:
        it means "this photograph has not been migrated", which is a different
        thing from "this photograph does not exist", and the migration runbook
        is what resolves it.
      */
      if (isLegacyPath(key)) return null;
      assertSafeKey(key);
      const object = await bucket.get(key);
      if (!object) return null;
      return new Uint8Array(await object.arrayBuffer());
    },
    async delete(key) {
      if (isLegacyPath(key)) return;
      assertSafeKey(key);
      await bucket.delete(key);
    },
    async open(key, range) {
      if (isLegacyPath(key)) return null;
      assertSafeKey(key);
      let object: Awaited<ReturnType<R2Like['get']>>;
      try {
        object = await bucket.get(key, range ? { range } : undefined);
      } catch (err) {
        // R2 refuses a range that starts past the end by throwing.
        if (range) return 'unsatisfiable';
        throw err;
      }
      if (!object) return null;
      // A stand-in bucket in a test may hand back neither; read it whole then.
      if (!object.body || object.size === undefined) {
        return sliceBytes(new Uint8Array(await object.arrayBuffer()), range ?? null);
      }
      if (!range) return { body: object.body, size: object.size, offset: 0, length: object.size };
      const at = resolveRange(range, object.size);
      if (!at) return 'unsatisfiable';
      return { body: object.body, size: object.size, ...at };
    },
  };
}

/**
 * The store this process uses.
 *
 * Disk by default, which is the current deployment. The Worker entry point
 * will call `setBlobStore(r2BlobStore(env.UPLOADS))` once at startup rather
 * than threading a store through every call site - the same shape as the
 * single memoised database handle in `db.ts`.
 */
let current: BlobStore | null = null;

export const blobStore = (): BlobStore => (current ??= diskBlobStore());

export const setBlobStore = (store: BlobStore | null): void => {
  current = store;
};
