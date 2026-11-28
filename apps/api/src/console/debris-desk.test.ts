/**
 * The debris desk in the console, as an officer and as everybody who is not
 * one: who can open it, what it shows, and the two decisions with their CSRF.
 */
import { strict as assert } from 'node:assert';
import { beforeEach, describe, test } from 'node:test';

import { setBlobStore, type BlobStore } from '../blob-store.ts';
import { openTestDb, type DB } from '../db-node.ts';
import { submitDebrisReport } from '../debris-report-service.ts';
import { hashApiKey, resolveSession, SESSION_COOKIE } from '../host-auth.ts';
import { consoleRoutes, __csrfFor } from './routes.ts';

let db: DB;
let app: ReturnType<typeof consoleRoutes>;
const KEY = {
  sichang: 'chv_SICHA-SICHB-SICHC-SICHD',
  unset: 'chv_UNSEA-UNSEB-UNSEC-UNSED',
  shop: 'chv_SHOPA-SHOPB-SHOPC-SHOPD',
  mod: 'chv_MODEA-MODEB-MODEC-MODED',
};
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const THAM_PHANG = { lat: 13.1454, lng: 100.806835 };

const blobs = new Map<string, Uint8Array>();
const store: BlobStore = {
  async put(key, bytes) { blobs.set(key, bytes); },
  async get(key) { return blobs.get(key) ?? null; },
  async delete(key) { blobs.delete(key); },
};

let reportId: string;
let caseId: string;

beforeEach(async () => {
  blobs.clear();
  setBlobStore(store);
  db = openTestDb();
  app = consoleRoutes(db);
  const add = (id: string, name: string, type: string, role: string, key: string, campus: string | null) =>
    db.prepare('INSERT INTO hosts (id,name,type,role,campus,api_key_hash,created_at) VALUES (?,?,?,?,?,?,?)')
      .run(id, name, type, role, campus, hashApiKey(key), new Date().toISOString());
  add('h-sichang', 'Ko Sichang Municipality', 'municipality', 'host', KEY.sichang, 'koh-sichang');
  add('h-unset', 'A municipality with no island', 'municipality', 'host', KEY.unset, null);
  // A community host, like the seeded traders: an `operator` login is stopped
  // earlier by the console's own marketplace rule and would not test this one.
  add('h-shop', 'A shop', 'community', 'host', KEY.shop, 'koh-sichang');
  add('h-mod', 'Platform', 'platform', 'moderator', KEY.mod, null);
  db.prepare("INSERT INTO users (id, display_name, created_at) VALUES ('ana','ana',?)").run(new Date().toISOString());
  const view = await submitDebrisReport(db, {
    userId: 'ana',
    raw: { position: { ...THAM_PHANG, accuracyM: 8 }, takenAt: new Date(Date.now() - 60_000).toISOString(), kinds: ['net_rope'], amount: 'strand', access: 'climb' },
    photo: JPEG,
  });
  reportId = view.id;
  caseId = (db.prepare('SELECT case_id FROM debris_reports WHERE id = ?').get(reportId) as { case_id: string }).case_id;
});

async function signIn(key: string): Promise<string> {
  const res = await app.request('/login', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ key, reviewer: 'Prasert' }),
  });
  const token = /chivago_host=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')?.[1];
  assert.ok(token, `login failed: ${res.status}`);
  return token;
}
const get = (token: string, path: string) =>
  app.request(path, { headers: { cookie: `${SESSION_COOKIE}=${token}; chivago_lang=en` } });
const post = (token: string, path: string, fields: Record<string, string> = {}, csrf?: string) =>
  app.request(path, {
    method: 'POST',
    headers: { cookie: `${SESSION_COOKIE}=${token}; chivago_lang=en`, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrf: csrf ?? __csrfFor(resolveSession(db, token)!), ...fields }),
  });
const status = () => (db.prepare('SELECT status FROM debris_cases WHERE id = ?').get(caseId) as { status: string }).status;

describe('who can open it', () => {
  test('the island’s municipality: the tab is there and the desk opens', async () => {
    const token = await signIn(KEY.sichang);
    assert.match(await (await get(token, '/')).text(), /href="\/console\/debris"/);
    const res = await get(token, '/debris');
    assert.equal(res.status, 200);
    assert.match(await res.text(), /KS-\d{4}-0001/);
  });

  test('a shop on the same island: no tab, and the desk is refused', async () => {
    const token = await signIn(KEY.shop);
    assert.doesNotMatch(await (await get(token, '/')).text(), /href="\/console\/debris"/);
    assert.equal((await get(token, '/debris')).status, 403);
    assert.equal((await get(token, `/debris/${caseId}`)).status, 404);
  });

  test('a municipality not tied to an island is told so, not shown every island', async () => {
    const token = await signIn(KEY.unset);
    const res = await get(token, '/debris');
    assert.equal(res.status, 403);
    assert.match(await res.text(), /not tied to an island/i);
  });

  test('a platform moderator sees it', async () => {
    const token = await signIn(KEY.mod);
    assert.equal((await get(token, '/debris')).status, 200);
  });
});

describe('the desk', () => {
  test('says how it ranks, that it only suggests, and what it cannot catch', async () => {
    const text = await (await get(await signIn(KEY.sichang), '/debris')).text();
    assert.match(text, /severity × people × access/i);
    assert.match(text, /you decide/i);
    assert.match(text, /same spot for days/i);
  });

  test('the case page shows the photograph from its own route, the hardest way in, and both decisions', async () => {
    const text = await (await get(await signIn(KEY.sichang), `/debris/${caseId}`)).text();
    assert.match(text, new RegExp(`/console/debris/photo/${reportId}`));
    assert.match(text, /park and walk/i);
    assert.match(text, /action="\/console\/debris\/[^"]+\/assign"/);
    assert.match(text, /action="\/console\/debris\/[^"]+\/dismiss"/);
    assert.doesNotMatch(text, /\bana\b/, 'a reporter is a count, not a name');
  });

  test('the photograph is served private and uncached, and only to the desk', async () => {
    const res = await get(await signIn(KEY.sichang), `/debris/photo/${reportId}`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'image/jpeg');
    assert.match(res.headers.get('cache-control') ?? '', /private/);
    assert.match(res.headers.get('cache-control') ?? '', /no-store/);
    assert.equal((await get(await signIn(KEY.shop), `/debris/photo/${reportId}`)).status, 404);
  });
});

describe('closing the job', () => {
  const close = (token: string, fields: Record<string, string>, photo: Uint8Array<ArrayBuffer> | null, csrf?: string) => {
    const form = new FormData();
    form.set('csrf', csrf ?? __csrfFor(resolveSession(db, token)!));
    for (const [k, v] of Object.entries(fields)) form.append(k, v);
    if (photo) form.set('afterPhoto', new Blob([photo], { type: 'image/jpeg' }), 'after.jpg');
    return app.request(`/debris/${caseId}/close`, {
      method: 'POST', headers: { cookie: `${SESSION_COOKIE}=${token}; chivago_lang=en` }, body: form,
    });
  };
  const AFTER = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x08]);

  test('the case page carries a close form that takes a photo, a weight and what was really there', async () => {
    const text = await (await get(await signIn(KEY.sichang), `/debris/${caseId}`)).text();
    assert.match(text, /action="\/console\/debris\/[^"]+\/close"[^>]*enctype="multipart\/form-data"/);
    assert.match(text, /name="weightKg"/);
    assert.match(text, /name="afterPhoto"/);
  });

  test('closing with the token, a weight and a photo: closed, and the after photo is the desk’s own', async () => {
    const token = await signIn(KEY.sichang);
    const res = await close(token, { weightKg: '6.4', foundKinds: 'foam', left: 'none' }, AFTER);
    assert.equal(res.status, 303);
    assert.equal(status(), 'closed');
    const photo = await get(token, `/debris/after/${caseId}`);
    assert.equal(photo.status, 200);
    assert.match(photo.headers.get('cache-control') ?? '', /no-store/);
    assert.match(await (await get(token, `/debris/${caseId}`)).text(), /6\.4 kg/);
  });

  test('no weight is refused on the page and nothing closes', async () => {
    const token = await signIn(KEY.sichang);
    const res = await close(token, { left: 'none' }, null);
    assert.equal(res.status, 400);
    assert.match(await res.text(), /scale/i);
    assert.equal(status(), 'open');
  });

  test('"what is left" is one answer with no default: a heap left opens a case for it, and no answer closes nothing', async () => {
    const token = await signIn(KEY.sichang);
    const page = await (await get(token, `/debris/${caseId}`)).text();
    assert.match(page, /<select name="left" required>/);
    assert.doesNotMatch(page, /name="outcome"/, 'no second control that can disagree with the first');

    const unanswered = await close(token, { weightKg: '2.1' }, null);
    assert.equal(unanswered.status, 400);
    assert.equal(status(), 'open');

    assert.equal((await close(token, { weightKg: '2.1', left: 'pile' }, null)).status, 303);
    assert.equal(status(), 'closed');
    const rest = db.prepare('SELECT number, carried_amount FROM debris_cases WHERE follow_up_of = ?').get(caseId) as { number: string; carried_amount: string };
    assert.equal(rest.carried_amount, 'pile');
  });

  test('a forged close changes nothing', async () => {
    const token = await signIn(KEY.sichang);
    assert.equal((await close(token, { weightKg: '1', left: 'none' }, null, 'forged')).status, 403);
    assert.equal(status(), 'open');
  });
});

describe('the decisions', () => {
  test('assign, with the form’s token, sends somebody and goes back to the case', async () => {
    const token = await signIn(KEY.sichang);
    const res = await post(token, `/debris/${caseId}/assign`, { note: 'Two of us after 13:00' });
    assert.equal(res.status, 303);
    assert.equal(res.headers.get('location'), `/console/debris/${caseId}`);
    assert.equal(status(), 'assigned');
    const event = db.prepare('SELECT actor, note FROM debris_case_events WHERE case_id = ?').get(caseId) as { actor: string; note: string };
    assert.deepEqual({ ...event }, { actor: 'Prasert', note: 'Two of us after 13:00' });
  });

  test('a forged assign without the token changes nothing', async () => {
    const token = await signIn(KEY.sichang);
    assert.equal((await post(token, `/debris/${caseId}/assign`, {}, 'forged')).status, 403);
    assert.equal(status(), 'open');
  });

  test('dismissing without a reason is refused on the page, with the reason why', async () => {
    const token = await signIn(KEY.sichang);
    const res = await post(token, `/debris/${caseId}/dismiss`, { reason: '  ' });
    assert.equal(res.status, 400);
    assert.match(await res.text(), /reporter is shown/i);
    assert.equal(status(), 'open');
    assert.equal((await post(token, `/debris/${caseId}/dismiss`, { reason: 'A net in use, not rubbish' })).status, 303);
    assert.equal(status(), 'dismissed');
  });

  test('a shop cannot decide the island’s case', async () => {
    const token = await signIn(KEY.shop);
    assert.equal((await post(token, `/debris/${caseId}/assign`, { note: 'x' })).status, 404);
    assert.equal(status(), 'open');
  });
});
