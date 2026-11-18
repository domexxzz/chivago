/**
 * Where a shop's photographs live: R2, not the database.
 *
 * READ `migrations.ts` ("PHOTOGRAPHS LEAVE THE DATABASE") FIRST. In short: the
 * whole platform is one Durable Object with a 10 GB ceiling, SQLITE_FULL stops
 * every write on the island, and a photograph is the one row that can be five
 * megabytes. So the bytes go to the object store and the row keeps the key.
 *
 * THREE TABLES, ONE RULE.
 *
 *  - A row with `storage_key` is served from the store. Its `bytes` is empty.
 *  - A row without one is from before the move and is served from `bytes`.
 *  - `migrateLegacyMedia` turns the second kind into the first, a budgeted
 *    handful at a time, from the alarm.
 *
 * Deleting is not here, on purpose. Triggers queue every removed key in
 * `media_deletions` - including the ones CASCADE removes, which no route
 * would ever see - and `drainMediaDeletions` empties that queue.
 */

import { blobStore, type BlobStore } from './blob-store.ts';
import { row, rows, type DB } from './db.ts';

/** Each table and the prefix its objects live under. */
export const MEDIA_TABLES = {
  local_shop_media: 'shop-media',
  local_guide_profile_photos: 'guide-photos',
  local_guide_documents: 'guide-documents',
} as const;

export type MediaTable = keyof typeof MEDIA_TABLES;

/** What `bytes` holds once the photograph lives in the store. The column is NOT NULL. */
export const NO_BYTES = new Uint8Array(0);

/**
 * How many bytes one pass may move.
 *
 * A Worker has 128 MB. A photograph is up to 5 MB and is held in memory while
 * it is copied, so the budget is small enough that a pass never comes near
 * the limit and large enough that a few hundred megabytes finish in an hour.
 */
export const MEDIA_MOVE_BUDGET_BYTES = 16 * 1024 * 1024;

/** How many queued deletions one pass works through. */
export const MEDIA_DELETION_BATCH = 50;

/**
 * The object key for a row.
 *
 * Derived from the row id, never from anything the uploader sent. Ids are
 * UUIDs and are not reused, so a key is never shared by two photographs and a
 * retry of the same move writes the same object again rather than a second one.
 */
export const mediaKey = (table: MediaTable, id: string): string => `${MEDIA_TABLES[table]}/${id}`;

/** Put a new photograph in the store and return the key its row should hold. */
export async function storeMedia(
  table: MediaTable,
  id: string,
  bytes: Uint8Array,
  store: BlobStore = blobStore(),
): Promise<string> {
  const key = mediaKey(table, id);
  await store.put(key, bytes);
  return key;
}

/**
 * The bytes a row stands for, wherever they live.
 *
 * Null when a keyed object is missing from the store. The caller answers 404
 * rather than 500: a photograph that cannot be found is not a server fault the
 * viewer can do anything about, and it is logged where somebody can.
 */
export async function mediaBytes(
  stored: { bytes: Uint8Array | null; storage_key: string | null },
  store: BlobStore = blobStore(),
): Promise<Uint8Array | null> {
  if (stored.storage_key) return store.get(stored.storage_key);
  return stored.bytes && stored.bytes.byteLength > 0 ? stored.bytes : null;
}

export interface MoveResult {
  moved: number;
  bytes: number;
}

/**
 * Move photographs stored before this change into the object store.
 *
 * ALWAYS MOVES AT LEAST ONE. The budget slows the move down; it must never
 * stall it, and a single photograph larger than the budget would otherwise sit
 * in the database forever.
 *
 * Size is read before the bytes are, so a pass that is about to go over the
 * budget stops without loading the photograph it is not going to move.
 */
export async function migrateLegacyMedia(
  db: DB,
  opts: { budgetBytes?: number; store?: BlobStore } = {},
): Promise<MoveResult> {
  const store = opts.store ?? blobStore();
  const budget = opts.budgetBytes ?? MEDIA_MOVE_BUDGET_BYTES;
  let moved = 0;
  let bytes = 0;

  for (const table of Object.keys(MEDIA_TABLES) as MediaTable[]) {
    // Served by the partial index on `storage_key IS NULL`: once the move is
    // finished this reads nothing at all.
    const pending = rows<{ id: string }>(
      db.prepare(`SELECT id FROM ${table} WHERE storage_key IS NULL ORDER BY id LIMIT 50`).all(),
    );
    for (const { id } of pending) {
      const sized = row<{ size: number }>(
        db.prepare(`SELECT length(bytes) AS size FROM ${table} WHERE id = ? AND storage_key IS NULL`).get(id),
      );
      if (!sized) continue;
      const size = Number(sized.size);
      if (moved > 0 && bytes + size > budget) return { moved, bytes };

      const found = row<{ bytes: Uint8Array }>(
        db.prepare(`SELECT bytes FROM ${table} WHERE id = ? AND storage_key IS NULL`).get(id),
      );
      if (!found) continue;

      const key = mediaKey(table, id);
      await store.put(key, found.bytes);
      /*
        `storage_key IS NULL` again, because the put above was an await: another
        request may have deleted or replaced this row while the bytes were in
        flight. If so the object just written belongs to nobody, and is removed
        rather than left for somebody to find.
      */
      const changed = Number(
        db.prepare(`UPDATE ${table} SET storage_key = ?, bytes = ? WHERE id = ? AND storage_key IS NULL`)
          .run(key, NO_BYTES, id).changes ?? 0,
      );
      if (changed === 0) {
        await store.delete(key);
        continue;
      }
      moved += 1;
      bytes += size;
    }
  }
  return { moved, bytes };
}

/**
 * Remove from the store what has already left the database.
 *
 * A key leaves the queue only after the store has let go of it. A failure is
 * logged and the key stays queued for the next pass, so an R2 hiccup delays a
 * deletion instead of losing it.
 */
export async function drainMediaDeletions(
  db: DB,
  opts: { limit?: number; store?: BlobStore } = {},
): Promise<number> {
  const store = opts.store ?? blobStore();
  const queued = rows<{ key: string }>(
    db.prepare('SELECT key FROM media_deletions ORDER BY queued_at, key LIMIT ?').all(opts.limit ?? MEDIA_DELETION_BATCH),
  );
  let removed = 0;
  for (const { key } of queued) {
    try {
      await store.delete(key);
      db.prepare('DELETE FROM media_deletions WHERE key = ?').run(key);
      removed += 1;
    } catch (err) {
      console.error('[chivago] media: could not remove from the object store, will retry', key, err);
    }
  }
  return removed;
}
