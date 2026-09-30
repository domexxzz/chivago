import { strict as assert } from 'node:assert';
import { test, describe, beforeEach } from 'node:test';

import { openTestDb, type DB } from '../db.ts';
import { hashApiKey, SESSION_COOKIE } from '../host-auth.ts';
import { ensureWallet } from '../wallet-service.ts';
import { consoleRoutes, __csrfFor } from './routes.ts';

/**
 * What a host sees of the AI's opinion (docs/63 rule 5): marked as the AI's,
 * escaped like anything else a machine or a person typed, and never choosing
 * the rejection reason for them.
 */

let db: DB;
let app: ReturnType<typeof consoleRoutes>;
const KEY = 'chv_MUNIA-MUNIB-MUNIC-MUNID';
const iso = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

const opinion = (over: Record<string, unknown> = {}) => JSON.stringify({
  work: 'not_shown',
  weight: 'higher_than_shown',
  concerns: ['screen_or_printout'],
  suggestedReason: 'no_work_shown',
  photos: [{ index: 0, en: 'A phone screen showing a beach', th: 'จอโทรศัพท์ที่แสดงภาพชายหาด' }],
  summary: { en: 'This is a photo of a screen.', th: 'นี่เป็นภาพถ่ายหน้าจอ' },
  ...over,
});

const giveOpinion = (json: string) =>
  db.prepare(
    `INSERT INTO proof_assists (proof_id,status,result_json,created_at) VALUES ('p1','done',?,?)`,
  ).run(json, iso(0.5));

beforeEach(() => {
  db = openTestDb();
  app = consoleRoutes(db);
  const now = new Date().toISOString();
  db.prepare('INSERT INTO hosts (id,name,type,api_key_hash,created_at) VALUES (?,?,?,?,?)')
    .run('h1', 'Samui Municipality', 'municipality', hashApiKey(KEY), now);
  db.prepare(
    `INSERT INTO quests (id,code,name_en,name_th,where_label,duration,reward_points,
       host_id,kind,lat,lng,geofence_radius_m) VALUES ('q1','BC-04','Beach Cleanup','x','Chaweng','45 min',150,'h1','today',9.5357,100.0617,250)`,
  ).run();
  db.prepare('INSERT INTO users (id,display_name,created_at) VALUES (?,?,?)').run('u1', 'u1', now);
  ensureWallet(db, 'u1');
  db.prepare(
    `INSERT INTO quest_progress (user_id,quest_id,stage,joined_at,arrived_at,proof_submitted_at)
     VALUES ('u1','q1','host_verification',?,?,?)`,
  ).run(iso(3), iso(2), iso(1));
  db.prepare(
    `INSERT INTO proofs (id,user_id,quest_id,photos,weight_kg,submitted_at) VALUES ('p1','u1','q1','[]',4,?)`,
  ).run(iso(1));
});

async function signIn(): Promise<string> {
  const res = await app.request('/login', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ key: KEY, reviewer: 'Nok' }),
  });
  const token = /chivago_host=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')?.[1];
  assert.ok(token);
  return token;
}

const page = async (token: string, lang: 'en' | 'th' = 'en') =>
  (await app.request('/proof/p1', {
    headers: { cookie: `${SESSION_COOKIE}=${token}; chivago_lang=${lang}` },
  })).text();

describe('the AI card on a proof', () => {
  test('is labelled as the AI\'s opinion, not a decision, in the host\'s language', async () => {
    giveOpinion(opinion());
    const token = await signIn();
    const en = await page(token, 'en');
    assert.match(en, /AI opinion/);
    assert.match(en, /not a decision/);
    assert.match(en, /This is a photo of a screen\./);
    assert.match(en, /A phone screen showing a beach/);
    const th = await page(token, 'th');
    assert.match(th, /ความเห็นจาก AI/);
    assert.match(th, /นี่เป็นภาพถ่ายหน้าจอ/);
  });

  test('names concerns in words, not as keys', async () => {
    giveOpinion(opinion());
    const en = await page(await signIn(), 'en');
    assert.doesNotMatch(en, /screen_or_printout/);
    assert.match(en, /screen or a printout/i);
  });

  test('offers its reason as a hint and leaves the choice empty', async () => {
    giveOpinion(opinion());
    const en = await page(await signIn(), 'en');
    assert.match(en, /AI suggests/);
    assert.match(en, /Photos do not show the completed work/);
    assert.doesNotMatch(en, /<option[^>]*selected/);
  });

  test('whatever the model wrote is escaped', async () => {
    giveOpinion(opinion({
      summary: { en: '<script>alert(1)</script>', th: '<img src=x onerror=alert(1)> ขยะ' },
    }));
    const token = await signIn();
    for (const lang of ['en', 'th'] as const) {
      const body = await page(token, lang);
      assert.doesNotMatch(body, /<script>alert/);
      assert.doesNotMatch(body, /<img src=x/);
    }
  });

  test('with no opinion there is no card, and the check says the assistant is off', async () => {
    const en = await page(await signIn(), 'en');
    assert.doesNotMatch(en, /AI suggests/);
    assert.match(en, /AI assistant is off/);
    assert.doesNotMatch(en, /aiOff/);
  });
});

describe('the decision remembers what the AI said', () => {
  const decide = async (token: string, decision: 'approve' | 'reject') =>
    app.request('/decide', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        cookie: `${SESSION_COOKIE}=${token}`,
      },
      body: new URLSearchParams({
        csrf: __csrfFor({ token, hostId: 'h1', hostName: '', reviewer: null, role: 'host', hostType: 'municipality', expiresAt: '' }),
        proofId: 'p1',
        decision,
        reason: decision === 'reject' ? 'no_work_shown' : '',
      }),
    });

  test('a host who approves against a "fail" is recorded as having seen a fail - and is still obeyed', async () => {
    giveOpinion(opinion());
    const res = await decide(await signIn(), 'approve');
    assert.equal(res.status, 303);
    const p = db.prepare("SELECT approved, assist_at_decision FROM proofs WHERE id='p1'").get() as Record<string, unknown>;
    assert.equal(p.approved, 1);
    assert.equal(p.assist_at_decision, 'fail');
  });

  test('records what the page showed, even if the opinion landed after it loaded', async () => {
    const token = await signIn();
    const body = await page(token, 'en');
    const seen = /name="assistSeen"\s+value="([a-z]*)"/.exec(body)?.[1];
    assert.equal(seen, 'unknown');
    giveOpinion(opinion()); // arrives while the host is looking
    await app.request('/decide', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: `${SESSION_COOKIE}=${token}` },
      body: new URLSearchParams({
        csrf: __csrfFor({ token, hostId: 'h1', hostName: '', reviewer: null, role: 'host', hostType: 'municipality', expiresAt: '' }),
        proofId: 'p1', decision: 'approve', assistSeen: seen!,
      }),
    });
    const p = db.prepare("SELECT assist_at_decision FROM proofs WHERE id='p1'").get() as Record<string, unknown>;
    assert.equal(p.assist_at_decision, 'unknown');
  });

  test('a forged value is not recorded; what is stored is', async () => {
    giveOpinion(opinion());
    const token = await signIn();
    await app.request('/decide', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: `${SESSION_COOKIE}=${token}` },
      body: new URLSearchParams({
        csrf: __csrfFor({ token, hostId: 'h1', hostName: '', reviewer: null, role: 'host', hostType: 'municipality', expiresAt: '' }),
        proofId: 'p1', decision: 'approve', assistSeen: '<script>',
      }),
    });
    const p = db.prepare("SELECT assist_at_decision FROM proofs WHERE id='p1'").get() as Record<string, unknown>;
    assert.equal(p.assist_at_decision, 'fail');
  });

  test('with no opinion it records "unknown"', async () => {
    await decide(await signIn(), 'reject');
    const p = db.prepare("SELECT approved, assist_at_decision FROM proofs WHERE id='p1'").get() as Record<string, unknown>;
    assert.equal(p.approved, 0);
    assert.equal(p.assist_at_decision, 'unknown');
  });
});
