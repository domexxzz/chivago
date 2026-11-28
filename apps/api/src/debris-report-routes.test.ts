/**
 * The debris report routes, as the phone calls them: one multipart POST with
 * the photograph and three answers, and two reads of the sender's own reports.
 */
import { strict as assert } from 'node:assert';
import { before, beforeEach, describe, test } from 'node:test';

import { setBlobStore, type BlobStore } from './blob-store.ts';

delete process.env.CHIVAGO_OPEN_IDENTITY;
process.env.CHIVAGO_DB = ':memory:';
const READER = 'Ko Sichang Municipality';
process.env.CHIVAGO_DEBRIS_READER = READER;

const { app, db } = await import('./server-node.ts');

type Body = { ok: boolean; data?: any; code?: string; error?: string };
const json = async (res: Response) => (await res.json()) as Body;

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const THAM_PHANG = { lat: 13.1454, lng: 100.806835, accuracyM: 8 };
const SI_RACHA = { lat: 13.1676, lng: 100.9253, accuracyM: 8 };

const blobs = new Map<string, Uint8Array>();
const store: BlobStore = {
  async put(key, bytes) { blobs.set(key, bytes); },
  async get(key) { return blobs.get(key) ?? null; },
  async delete(key) { blobs.delete(key); },
};

const form = (over: Record<string, string | null> = {}, photo: Uint8Array<ArrayBuffer> | null = JPEG) => {
  const f = new FormData();
  if (photo) f.set('photo', new Blob([photo], { type: 'image/jpeg' }), 'beach.jpg');
  const fields: Record<string, string | null> = {
    position: JSON.stringify(THAM_PHANG),
    takenAt: new Date(Date.now() - 60_000).toISOString(),
    kinds: JSON.stringify(['foam', 'net_rope']),
    amount: 'strand',
    access: 'climb',
    ...over,
  };
  for (const [k, v] of Object.entries(fields)) if (v !== null) f.set(k, v);
  return f;
};

const report = (key: string, body: FormData) =>
  app.request('/debris-reports', { method: 'POST', headers: { 'x-chivago-device-key': key }, body });
const get = (path: string, key: string) => app.request(path, { headers: { 'x-chivago-device-key': key } });

let ana: string;
let bo: string;

before(async () => {
  const register = async (name: string) => (await json(await app.request('/devices', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ displayName: name, label: name }),
  }))).data.deviceKey as string;
  ana = await register('Ana');
  bo = await register('Bo');
});

beforeEach(() => {
  blobs.clear();
  setBlobStore(store);
  db.exec('DELETE FROM debris_reports; DELETE FROM debris_cases;');
});

describe('POST /debris-reports', () => {
  test('a photograph from Tham Phang comes back as an open case with its number', async () => {
    const res = await report(ana, form());
    const body = await json(res);
    assert.equal(res.status, 200, JSON.stringify(body));
    assert.equal(body.data.verdict, 'opened');
    assert.match(body.data.case.number, /^KS-\d{4}-0001$/);
    assert.equal(body.data.case.reporters, 1);
    assert.equal(blobs.size, 1);
  });

  test('a single kind may arrive as a bare word, the way a simple form sends it', async () => {
    const body = await json(await report(ana, form({ kinds: 'foam' })));
    assert.deepEqual(body.data.kinds, ['foam']);
  });

  test('a photograph from Si Racha is answered, not queued, and the reason travels with it', async () => {
    const res = await report(ana, form({ position: JSON.stringify(SI_RACHA) }));
    const body = await json(res);
    assert.equal(res.status, 200);
    assert.equal(body.data.verdict, 'rejected');
    assert.equal(body.data.rejectReason, 'outside_area');
    assert.equal(body.data.case, null);
    assert.equal(blobs.size, 0);
  });

  test('bad answers are a 400 that names every field', async () => {
    const res = await report(ana, form({ amount: 'lots', access: null }));
    const body = await json(res);
    assert.equal(res.status, 400);
    assert.equal(body.code, 'INVALID_REPORT');
    assert.match(body.error ?? '', /amount/);
    assert.match(body.error ?? '', /access/);
  });

  test('no photograph is a 400', async () => {
    const res = await report(ana, form({}, null));
    assert.equal(res.status, 400);
    assert.equal((await json(res)).code, 'PHOTO_REQUIRED');
  });

  test('a file that is not an image is a 415', async () => {
    const res = await report(ana, form({}, new TextEncoder().encode('%PDF-1.7')));
    assert.equal(res.status, 415);
  });

  test('JSON is refused: the photograph is the report', async () => {
    const res = await app.request('/debris-reports', {
      method: 'POST', headers: { 'x-chivago-device-key': ana, 'content-type': 'application/json' },
      body: JSON.stringify({ position: THAM_PHANG }),
    });
    assert.equal(res.status, 400);
    assert.equal((await json(res)).code, 'MULTIPART_REQUIRED');
  });
});

describe('nobody to read it', () => {
  test('/config names the reader, so the app knows to show the button', async () => {
    const body = await json(await app.request('/config'));
    assert.equal(body.data.debrisReader, READER);
  });

  test('with no reader named, /config says null and a report is refused before anything is kept', async () => {
    delete process.env.CHIVAGO_DEBRIS_READER;
    try {
      assert.equal((await json(await app.request('/config'))).data.debrisReader, null);
      const res = await report(ana, form());
      assert.equal(res.status, 409);
      assert.equal((await json(res)).code, 'NO_READER');
      assert.equal(blobs.size, 0);
      assert.equal((db.prepare('SELECT COUNT(*) AS n FROM debris_reports').get() as { n: number }).n, 0);
    } finally {
      process.env.CHIVAGO_DEBRIS_READER = READER;
    }
  });
});

describe('GET /debris-reports', () => {
  test('the sender sees their own reports, and only theirs', async () => {
    const mine = (await json(await report(ana, form()))).data;
    await report(bo, form({ position: JSON.stringify({ ...THAM_PHANG, lat: THAM_PHANG.lat + 0.004 }) }));

    const list = (await json(await get('/debris-reports', ana))).data.reports as { id: string }[];
    assert.deepEqual(list.map((r) => r.id), [mine.id]);

    const one = await get(`/debris-reports/${mine.id}`, ana);
    assert.equal((await json(one)).data.id, mine.id);

    const theirs = await get(`/debris-reports/${mine.id}`, bo);
    assert.equal(theirs.status, 404);
  });
});
