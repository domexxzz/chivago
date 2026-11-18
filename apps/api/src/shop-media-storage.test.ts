import { strict as assert } from 'node:assert';
import { test, beforeEach } from 'node:test';

process.env.CHIVAGO_DB = ':memory:';
const { app, db } = await import('./server-node.ts');
const { setBlobStore } = await import('./blob-store.ts');
const { drainMediaDeletions, migrateLegacyMedia } = await import('./media-store.ts');

/*
  The object store, in memory. Every test here is about WHERE bytes end up, so
  the store has to be something the test can look inside.
*/
const objects = new Map<string, Uint8Array>();
setBlobStore({
  async put(key, bytes) { objects.set(key, new Uint8Array(bytes)); },
  async get(key) { return objects.get(key) ?? null; },
  async delete(key) { objects.delete(key); },
});
beforeEach(() => objects.clear());

const parse = async (res: Response): Promise<any> => res.json();
const register = async (suffix: string) => {
  const res = await app.request('/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
    fullName: `Owner ${suffix}`, email: `media${suffix}@example.com`, phone: `0820000${suffix.padStart(3, '0')}`,
    password: 'password123', accountType: 'operator', businessName: `Shop ${suffix}`,
  }) });
  const body = await parse(res);
  assert.equal(res.status, 200, JSON.stringify(body));
  return { 'x-chivago-device-key': body.data.deviceKey };
};
const newShop = async (owner: Record<string, string>, name: string): Promise<string> => {
  const res = await app.request('/shops', { method: 'POST', headers: { ...owner, 'content-type': 'application/json' }, body: JSON.stringify({
    name, category: 'ร้านอาหาร', areaKey: 'koh-sichang', description: 'By the pier', address: 'Tha Lang',
    lat: 13.1599, lng: 100.8096, phone: '0811111111', openingHours: '09:00-18:00', amenities: [], active: true,
  }) });
  const body = await parse(res);
  assert.equal(body.ok, true, JSON.stringify(body));
  return body.data.id;
};
const png = (fill: number, length = 64) =>
  new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, ...new Array(length).fill(fill)]);
const upload = async (owner: Record<string, string>, shopId: string, kind: string, bytes: Uint8Array) => {
  const form = new FormData();
  form.set('photo', new File([new Uint8Array(bytes)], 'p.png', { type: 'image/png' }));
  const body = await parse(await app.request(`/shops/${shopId}/images?kind=${kind}`, { method: 'POST', headers: owner, body: form }));
  assert.equal(body.ok, true, JSON.stringify(body));
  return body.data as { id: string; url: string };
};
const mediaRow = (id: string) => db.prepare(
  'SELECT storage_key, length(bytes) AS stored FROM local_shop_media WHERE id = ?',
).get(id) as { storage_key: string | null; stored: number } | undefined;
const served = async (url: string) => {
  const res = await app.request(url);
  return { status: res.status, type: res.headers.get('content-type'), bytes: new Uint8Array(await res.arrayBuffer()) };
};
const queued = () => (db.prepare('SELECT key FROM media_deletions ORDER BY key').all() as { key: string }[]).map((r) => r.key);
const bytesInDatabase = () => (db.prepare(
  `SELECT (SELECT COALESCE(SUM(length(bytes)),0) FROM local_shop_media)
        + (SELECT COALESCE(SUM(length(bytes)),0) FROM local_guide_profile_photos)
        + (SELECT COALESCE(SUM(length(bytes)),0) FROM local_guide_documents) AS total`,
).get() as { total: number }).total;

/*
  THE POINT OF THE CHANGE. The whole platform is one Durable Object with a
  10 GB ceiling, and a photograph is the one row that can be five megabytes.
*/
test('a new photograph goes to the object store, and the database keeps only where it is', async () => {
  const owner = await register('901');
  const shopId = await newShop(owner, 'Pier Cafe');
  const bytes = png(7);

  const { id, url } = await upload(owner, shopId, 'cover', bytes);

  const stored = mediaRow(id);
  assert.equal(stored?.storage_key, `shop-media/${id}`);
  assert.equal(stored?.stored, 0, 'no image bytes in the database');
  assert.deepEqual(objects.get(`shop-media/${id}`), bytes);

  const answer = await served(url);
  assert.equal(answer.status, 200);
  assert.equal(answer.type, 'image/png');
  assert.deepEqual(answer.bytes, bytes, 'what is served is exactly what was uploaded');
});

test('a photograph stored before the move is still served, and moving it changes nothing a viewer sees', async () => {
  const owner = await register('902');
  const shopId = await newShop(owner, 'Old Cafe');
  const bytes = png(3);
  db.prepare(`INSERT INTO local_shop_media(id,shop_id,review_id,kind,mime_type,bytes,created_at)
    VALUES('legacy-1',?,NULL,'interior','image/png',?,?)`).run(shopId, bytes, new Date().toISOString());

  assert.deepEqual((await served('/shops/media/legacy-1')).bytes, bytes, 'served from the database before the move');

  const first = await migrateLegacyMedia(db);
  assert.equal(first.moved, 1);
  assert.equal(mediaRow('legacy-1')?.storage_key, 'shop-media/legacy-1');
  assert.equal(mediaRow('legacy-1')?.stored, 0);
  assert.deepEqual(objects.get('shop-media/legacy-1'), bytes);
  assert.deepEqual((await served('/shops/media/legacy-1')).bytes, bytes, 'served from the object store after it');

  assert.equal((await migrateLegacyMedia(db)).moved, 0, 'a second run finds nothing left to move');
});

test('the move stops at its byte budget and finishes on a later run', async () => {
  const owner = await register('903');
  const shopId = await newShop(owner, 'Budget Cafe');
  for (const n of [1, 2, 3]) {
    db.prepare(`INSERT INTO local_shop_media(id,shop_id,review_id,kind,mime_type,bytes,created_at)
      VALUES(?,?,NULL,'interior','image/png',?,?)`).run(`budget-${n}`, shopId, new Uint8Array(100).fill(n), `2026-11-18T00:00:0${n}Z`);
  }

  assert.equal((await migrateLegacyMedia(db, { budgetBytes: 250 })).moved, 2, 'two fit under 250 bytes, the third would not');
  assert.equal((await migrateLegacyMedia(db, { budgetBytes: 250 })).moved, 1);
  assert.equal((await migrateLegacyMedia(db, { budgetBytes: 250 })).moved, 0);

  /* One photograph larger than the whole budget still moves: a budget slows the move, it must never stall it. */
  db.prepare(`INSERT INTO local_shop_media(id,shop_id,review_id,kind,mime_type,bytes,created_at)
    VALUES('budget-big',?,NULL,'interior','image/png',?,?)`).run(shopId, new Uint8Array(400).fill(9), new Date().toISOString());
  assert.equal((await migrateLegacyMedia(db, { budgetBytes: 250 })).moved, 1);
  assert.equal(bytesInDatabase(), 0, 'nothing left in the database');
});

/*
  PDPA. A photograph somebody deleted - a review picture, a guide's licence -
  must leave the object store too. There are more ways to delete a row than
  there are routes: replacing a cover, deleting a shop, and every ON DELETE
  CASCADE behind them. A trigger sees all of them; route code sees only its own.
*/
test('every way a photograph leaves the database queues it to leave the object store', async () => {
  const owner = await register('904');
  const shopId = await newShop(owner, 'Gone Cafe');

  const coverA = await upload(owner, shopId, 'cover', png(1));
  const coverB = await upload(owner, shopId, 'cover', png(2));
  assert.deepEqual(queued(), [`shop-media/${coverA.id}`], 'replacing a cover queues the old one');

  const inside = await upload(owner, shopId, 'interior', png(3));
  const removed = await app.request(`/shops/${shopId}/images/${inside.id}`, { method: 'DELETE', headers: owner });
  assert.equal(removed.status, 200);
  assert.ok(queued().includes(`shop-media/${inside.id}`), 'deleting a photograph queues it');

  const gone = await app.request(`/shops/${shopId}`, { method: 'DELETE', headers: owner });
  assert.equal(gone.status, 200);
  assert.ok(queued().includes(`shop-media/${coverB.id}`), 'deleting the shop queues what CASCADE removed');

  assert.equal(await drainMediaDeletions(db), 3);
  for (const id of [coverA.id, coverB.id, inside.id]) assert.equal(objects.has(`shop-media/${id}`), false);
  assert.deepEqual(queued(), [], 'the queue empties once the store has let go');
});

test('replacing a guide photograph or licence queues the one it replaced', async () => {
  const owner = await register('905');
  const shopId = await newShop(owner, 'Guide Desk');
  for (const table of ['local_guide_profile_photos', 'local_guide_documents']) {
    const upsert = db.prepare(`INSERT INTO ${table}(id,shop_id,mime_type,bytes,storage_key,uploaded_at) VALUES(?,?,?,?,?,?)
      ON CONFLICT(shop_id) DO UPDATE SET id=excluded.id,mime_type=excluded.mime_type,bytes=excluded.bytes,
      storage_key=excluded.storage_key,uploaded_at=excluded.uploaded_at`);
    upsert.run(`${table}-1`, shopId, 'image/png', new Uint8Array(0), `k/${table}-1`, new Date().toISOString());
    upsert.run(`${table}-2`, shopId, 'image/png', new Uint8Array(0), `k/${table}-2`, new Date().toISOString());
    assert.ok(queued().includes(`k/${table}-1`), `${table}: the replaced key is queued`);
    assert.ok(!queued().includes(`k/${table}-2`), `${table}: the current key is not`);
  }
  db.prepare('DELETE FROM media_deletions').run();
});

test('a key the object store has lost answers 404 rather than 500', async () => {
  const owner = await register('906');
  const shopId = await newShop(owner, 'Lost Cafe');
  const { url, id } = await upload(owner, shopId, 'cover', png(5));
  objects.delete(`shop-media/${id}`);
  assert.equal((await served(url)).status, 404);
});
