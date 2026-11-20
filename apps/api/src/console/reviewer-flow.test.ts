import { strict as assert } from 'node:assert';
import { beforeEach, describe, test } from 'node:test';

import { openTestDb, type DB } from '../db-node.ts';
import { hashApiKey, resolveSession, SESSION_COOKIE } from '../host-auth.ts';
import { ensureWallet } from '../wallet-service.ts';
import { consoleRoutes, __csrfFor } from './routes.ts';

/*
  Found by walking the reviewer flow on a phone, 20 Nov 2026, before a pitch:
  the history said "—" where the reviewer belongs because a host signing in
  with an access key had nowhere to type a name; an EXP-only quest offered
  "+0 Green Points"; a Thai screen named the quest in English; and on a
  phone the menu sat beside the language buttons, staggered down the page.
*/

let db: DB;
let app: ReturnType<typeof consoleRoutes>;
const KEY = 'chv_SICHA-NGHOS-TKEYS-AMPLE';
const iso = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString();

function quest(id: string, opts: { points: number; exp: number | null; currency: 'trip' | 'green' }): void {
  db.prepare(
    `INSERT INTO quests (id,code,name_en,name_th,where_label,where_label_th,duration,reward_points,reward_exp,
       reward_currency,host_id,kind,lat,lng,geofence_radius_m) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(id, id.toUpperCase(), 'Trash Hero', 'ฮีโร่พิทักษ์เกาะ', 'Supervised activity, Koh Sichang',
    'กิจกรรมมีผู้ดูแล เกาะสีชัง', '45 min', opts.points, opts.exp, opts.currency, 'h-sc', 'today',
    13.15, 100.81, 120);
}

function proof(id: string, questId: string): void {
  db.prepare(
    `INSERT INTO quest_progress (user_id,quest_id,stage,joined_at,arrived_at,proof_submitted_at)
     VALUES ('u1',?, 'host_verification', ?,?,?)`,
  ).run(questId, iso(60), iso(45), iso(5));
  db.prepare('INSERT INTO proofs (id,user_id,quest_id,photos,weight_kg,submitted_at) VALUES (?,?,?,?,?,?)')
    .run(id, 'u1', questId, '[]', 3.4, iso(5));
}

beforeEach(() => {
  db = openTestDb();
  app = consoleRoutes(db);
  db.prepare('INSERT INTO hosts (id,name,type,api_key_hash,created_at) VALUES (?,?,?,?,?)')
    .run('h-sc', 'Koh Sichang host', 'community', hashApiKey(KEY), iso(0));
  db.prepare('INSERT INTO users (id,display_name,created_at) VALUES (?,?,?)').run('u1', 'u1', iso(0));
  ensureWallet(db, 'u1');
  quest('q-exp', { points: 0, exp: 200, currency: 'trip' });
  quest('q-green', { points: 150, exp: null, currency: 'green' });
  proof('p-exp', 'q-exp');
  proof('p-green', 'q-green');
});

const form = (fields: Record<string, string>) => ({
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams(fields),
});

async function signIn(reviewer = 'Nok'): Promise<string> {
  const res = await app.request('/login', form({ key: KEY, reviewer }));
  const token = /chivago_host=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')?.[1];
  assert.ok(token, 'signed in');
  return token;
}

const thai = (token: string) => ({ headers: { cookie: `${SESSION_COOKIE}=${token}; chivago_lang=th` } });

describe('who reviewed is always recorded', () => {
  test('the sign-in form asks for the reviewer\'s name, and requires it', async () => {
    const page = await (await app.request('/login')).text();
    assert.match(page, /name="reviewer"[^>]*required/);
  });

  test('an access key with no name is refused, before the key is even checked', async () => {
    const res = await app.request('/login', form({ key: KEY }));
    assert.equal(res.status, 400);
    assert.equal(res.headers.get('set-cookie'), null);
    assert.match(await res.text(), /name="reviewer"/);
  });

  test('the name signed in with is the name in the history', async () => {
    const token = await signIn('Nok');
    const csrf = __csrfFor(resolveSession(db, token)!);
    await app.request('/decide', {
      ...form({ csrf, proofId: 'p-exp', decision: 'approve' }),
      headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: `${SESSION_COOKIE}=${token}` },
    });
    const history = await (await app.request('/history', thai(token))).text();
    assert.match(history, /Nok/);
  });
});

describe('the reward is what the quest actually gives', () => {
  test('an EXP-only quest says +200 EXP, not +0', async () => {
    const token = await signIn();
    const page = await (await app.request('/proof/p-exp', thai(token))).text();
    assert.match(page, /\+200 EXP/);
    assert.doesNotMatch(page, /\+0(?!\d)/);
    assert.doesNotMatch(page, /แต้มสีเขียวที่จะได้รับ/);
  });

  test('a points quest names its currency', async () => {
    const token = await signIn();
    const page = await (await app.request('/proof/p-green', thai(token))).text();
    assert.match(page, /\+150 แต้มสีเขียว/);
  });

  test('the queue shows the same reward as the proof page', async () => {
    const token = await signIn();
    const queue = await (await app.request('/', thai(token))).text();
    assert.match(queue, /\+200 EXP/);
    assert.match(queue, /\+150 แต้มสีเขียว/);
  });
});

describe('a Thai screen speaks Thai', () => {
  test('the quest and where it is are in Thai when the host reads Thai', async () => {
    const token = await signIn();
    const page = await (await app.request('/proof/p-exp', thai(token))).text();
    assert.match(page, /ฮีโร่พิทักษ์เกาะ/);
    assert.match(page, /กิจกรรมมีผู้ดูแล เกาะสีชัง/);
  });

  test('English stays English', async () => {
    const token = await signIn();
    const page = await (await app.request('/proof/p-exp', { headers: { cookie: `${SESSION_COOKIE}=${token}; chivago_lang=en` } })).text();
    assert.match(page, /Trash Hero/);
  });
});

describe('the menu on a phone', () => {
  test('the menu and the language buttons stack, left-aligned, under the host name', async () => {
    const token = await signIn();
    const page = await (await app.request('/', thai(token))).text();
    assert.match(page, /<div class="bar-tools">/);
    const phone = page.slice(page.lastIndexOf('@media (max-width:720px){'));
    assert.match(phone, /\.bar-tools \{ flex-direction:column; align-items:flex-start;/);
    assert.match(page, /\.nav \{ justify-content:flex-start;/);
  });
});
