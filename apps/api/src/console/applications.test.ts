import { strict as assert } from 'node:assert';
import { test, describe, beforeEach } from 'node:test';

import { openTestDb, type DB } from '../db.ts';
import { hashApiKey, resolveSession, SESSION_COOKIE } from '../host-auth.ts';
import { applicationById, pendingApplications } from '../operator-application-service.ts';
import { consoleRoutes, __csrfFor, __resetApplyAttemptsForTests } from './routes.ts';

/*
  A FIXTURE OF ITS OWN, AND A FILE OF ITS OWN.

  These tests live apart from `routes.test.ts` for the reason the README gives
  about the suites generally: every sign-in costs one scrypt derivation per
  host that holds a key - deliberately, so the response time does not reveal
  which host a key belongs to. Added to a file already running 174 tests
  against a fixture of two keyed hosts, seventeen more sign-ins were enough to
  make scrypt fail to derive on an ordinary laptop (the exact failure
  `host-auth.ts` warns about in its own comment), and three unrelated tests
  went red.

  So: two hosts, no quests, no proofs, no wallet. Nothing here needs them, and
  `h-muni` is given its key only by the test that signs in as a moderator.
*/

let db: DB;
let app: ReturnType<typeof consoleRoutes>;

const LAB_KEY = 'chv_LABAA-LABBB-LABCC-LABDD';

beforeEach(() => {
  db = openTestDb();
  app = consoleRoutes(db);
  const now = new Date().toISOString();
  db.prepare('INSERT INTO hosts (id,name,type,created_at) VALUES (?,?,?,?)')
    .run('h-muni', 'Samui Municipality', 'municipality', now);
  db.prepare('INSERT INTO hosts (id,name,type,api_key_hash,created_at) VALUES (?,?,?,?,?)')
    .run('h-lab', 'Ocean Lab', 'hotel', hashApiKey(LAB_KEY), now);
});

/** Sign in and return the session cookie value. */
async function signIn(key: string, reviewer = 'Nok'): Promise<string> {
  const res = await app.request('/login', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ key, reviewer }),
  });
  const token = /chivago_host=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')?.[1];
  assert.ok(token, `login failed: ${res.status}`);
  return token;
}

const withCookie = (token: string) => ({ cookie: `${SESSION_COOKIE}=${token}` });

/**
 * The door a business comes in by (docs/67).
 *
 * The form is the only page on this console a stranger reaches, and the queue
 * behind it is the only place an operator account is created without somebody
 * holding an SSH session. Both halves are held here: what a stranger can do,
 * and what they cannot.
 */
describe('operators asking to list', () => {
  const MOD_KEY = 'chv_APPAA-APPBB-APPCC-APPDD';
  const OP_KEY = 'chv_OPERA-OPERB-OPERC-OPERD';

  const asModerator = async () => {
    db.prepare("UPDATE hosts SET role = 'moderator', api_key_hash = ? WHERE id = 'h-muni'")
      .run(hashApiKey(MOD_KEY));
    return signIn(MOD_KEY, 'Nok');
  };

  const asOperator = async () => {
    db.prepare('INSERT INTO hosts (id,name,type,api_key_hash,created_at) VALUES (?,?,?,?,?)')
      .run('op-existing', 'Boat Co-op', 'operator', hashApiKey(OP_KEY), new Date().toISOString());
    return signIn(OP_KEY, 'Som');
  };

  const post = (path: string, fields: Record<string, string>, token?: string) =>
    app.request(path, {
      method: 'POST',
      headers: {
        ...(token ? withCookie(token) : {}),
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(fields),
    });

  const csrf = (t: string) => __csrfFor(resolveSession(db, t)!);

  const FORM = {
    businessName: 'สหกรณ์เรือท้องครุฏ',
    kind: 'transfer',
    whereLabel: 'ท่าเรือท้องครุฏ',
    contactName: 'สมชาย',
    contactPhone: '081 234 5678',
  };

  beforeEach(() => { __resetApplyAttemptsForTests(); });

  test('the form opens with no session — a business has no key yet', async () => {
    const res = await app.request('/apply');
    assert.equal(res.status, 200);
    const page = await res.text();
    assert.match(page, /ลงทะเบียนผู้ประกอบการ/);
    // Both languages on the page itself: whoever followed the link cannot be
    // asked to find a switcher before they can read the first field.
    assert.match(page, /List your business/);
  });

  test('the form says, before the fields, that sending it is not an account', async () => {
    const page = await (await app.request('/apply')).text();
    assert.match(page, /ยังไม่ได้เปิดบัญชี/);
  });

  test('a submission is taken and the applicant is told what happens next', async () => {
    const res = await post('/apply', FORM);
    assert.equal(res.status, 200);
    const page = await res.text();

    const queued = pendingApplications(db)[0];
    assert.ok(queued, 'nothing was queued');
    assert.equal(queued.businessName, FORM.businessName);
    assert.match(page, new RegExp(queued.id));
    // A reference, not a credential - and the page says so in both languages.
    assert.match(page, /ไม่ใช่รหัสเข้าใช้งาน/);
  });

  test('A SUBMISSION HANDS OUT NO KEY AND NO SESSION', async () => {
    const res = await post('/apply', FORM);
    assert.ok(!(res.headers.get('set-cookie') ?? '').includes('chivago_host='));
    assert.doesNotMatch(await res.text(), /chv_/, 'a console key reached a stranger');
    const made = db.prepare("SELECT COUNT(*) n FROM hosts WHERE type = 'operator'").get() as
      unknown as { n: number };
    assert.equal(made.n, 0);
  });

  test('a refused form comes back with what they typed still in it', async () => {
    const res = await post('/apply', { ...FORM, contactPhone: '12' });
    assert.equal(res.status, 400);
    const page = await res.text();
    assert.match(page, /เบอร์โทร/);
    // Retyping a Thai business name on a phone is how a form gets abandoned.
    assert.match(page, new RegExp(FORM.businessName));
    assert.equal(pendingApplications(db).length, 0);
  });

  test('a tour with no licence number is refused, in the applicant’s own words', async () => {
    const res = await post('/apply', { ...FORM, kind: 'tour' });
    assert.equal(res.status, 400);
    assert.match(await res.text(), /ใบอนุญาต/);
  });

  test('the form is rate limited — a flooded queue is one nobody reads', async () => {
    for (let i = 0; i < 6; i += 1) {
      assert.equal((await post('/apply', FORM)).status, 200, `submission ${i + 1}`);
    }
    assert.equal((await post('/apply', FORM)).status, 429);
    assert.equal(pendingApplications(db).length, 6);
  });

  test('the queue needs a session like every other page', async () => {
    const res = await app.request('/applications');
    assert.equal(res.status, 303);
    assert.equal(res.headers.get('location'), '/console/login');
  });

  test('the queue is hidden from a host who is not a moderator', async () => {
    const lab = await signIn(LAB_KEY, 'Nok');
    assert.equal((await app.request('/applications', { headers: withCookie(lab) })).status, 404);
    const page = await (await app.request('/', { headers: withCookie(lab) })).text();
    assert.doesNotMatch(page, /\/console\/applications/, 'the tab was drawn for a plain host');
  });

  test('AN OPERATOR CANNOT REACH THE QUEUE THAT ADMITS OPERATORS', async () => {
    const op = await asOperator();
    assert.equal((await app.request('/applications', { headers: withCookie(op) })).status, 403);
  });

  test('a moderator sees the tab and the waiting business', async () => {
    await post('/apply', FORM);
    const mod = await asModerator();
    const page = await (await app.request('/applications', { headers: withCookie(mod) })).text();
    assert.match(page, new RegExp(FORM.businessName));
    assert.match(page, /ท่าเรือท้องครุฏ/);
    assert.match(page, /081 234 5678/);
    // The two steps no software can do, printed where the decision is made.
    assert.match(page, /ขอดูใบอนุญาตด้วยตาตัวเอง|seen the licence yourself/);
  });

  test('approving creates the operator account and shows the key once', async () => {
    await post('/apply', FORM);
    const mod = await asModerator();
    const id = pendingApplications(db)[0]!.id;

    const res = await post(`/applications/${id}/approve`,
      { csrf: csrf(mod), hostId: 'op-thong-krut-boats' }, mod);
    assert.equal(res.status, 200);
    const page = await res.text();
    const key = /chv_[A-Z0-9-]+/.exec(page)?.[0];
    assert.ok(key, 'the key was not shown');
    assert.match(page, /แสดงครั้งเดียว|shown once/);

    // The key works, and it opens the console the operator type is given.
    const asNewOperator = await signIn(key, 'Somchai');
    assert.equal(resolveSession(db, asNewOperator)!.hostType, 'operator');
    assert.equal(applicationById(db, id)!.hostId, 'op-thong-krut-boats');
  });

  test('THE KEY IS NOT SHOWN AGAIN ON A RELOAD', async () => {
    await post('/apply', FORM);
    const mod = await asModerator();
    const id = pendingApplications(db)[0]!.id;
    const shown = await (await post(`/applications/${id}/approve`,
      { csrf: csrf(mod), hostId: 'op-boats' }, mod)).text();
    const key = /chv_[A-Z0-9-]+/.exec(shown)![0];

    const again = await (await app.request('/applications', { headers: withCookie(mod) })).text();
    assert.ok(!again.includes(key), 'the key came back on a reload');
    assert.match(again, /op-boats/);
  });

  test('the key is never put in a URL', async () => {
    await post('/apply', FORM);
    const mod = await asModerator();
    const id = pendingApplications(db)[0]!.id;
    const res = await post(`/applications/${id}/approve`,
      { csrf: csrf(mod), hostId: 'op-boats' }, mod);
    // A 303 would carry it through the browser's history and the proxy's log.
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('location'), null);
    assert.equal(res.headers.get('cache-control'), 'no-store');
  });

  test('an approval without the CSRF token creates nothing', async () => {
    await post('/apply', FORM);
    const mod = await asModerator();
    const id = pendingApplications(db)[0]!.id;
    const res = await post(`/applications/${id}/approve`, { hostId: 'op-boats' }, mod);
    assert.equal(res.status, 403);
    assert.equal(applicationById(db, id)!.state, 'pending');
    const made = db.prepare('SELECT COUNT(*) n FROM hosts WHERE id = ?').get('op-boats') as
      unknown as { n: number };
    assert.equal(made.n, 0);
  });

  test('a bad operator id comes back as a message, not a 500', async () => {
    await post('/apply', FORM);
    const mod = await asModerator();
    const id = pendingApplications(db)[0]!.id;
    const res = await post(`/applications/${id}/approve`, { csrf: csrf(mod), hostId: 'boats' }, mod);
    assert.equal(res.status, 303);
    assert.match(res.headers.get('location') ?? '', /error=/);
    assert.equal(applicationById(db, id)!.state, 'pending');
  });

  test('a refusal needs a reason, and is kept with the name behind it', async () => {
    await post('/apply', FORM);
    const mod = await asModerator();
    const id = pendingApplications(db)[0]!.id;

    const empty = await post(`/applications/${id}/reject`, { csrf: csrf(mod), reason: ' ' }, mod);
    assert.equal(empty.status, 303);
    assert.match(empty.headers.get('location') ?? '', /error=/);
    assert.equal(applicationById(db, id)!.state, 'pending');

    const done = await post(`/applications/${id}/reject`,
      { csrf: csrf(mod), reason: 'ติดต่อเจ้าของไม่ได้' }, mod);
    assert.equal(done.status, 303);
    const refused = applicationById(db, id)!;
    assert.equal(refused.state, 'rejected');
    assert.equal(refused.decidedBy, 'Nok');
    assert.equal(refused.hostId, null);

    const page = await (await app.request('/applications', { headers: withCookie(mod) })).text();
    assert.match(page, /ติดต่อเจ้าของไม่ได้/);
  });
});

/**
 * The guide queue says what it does, and not what it used to do.
 *
 * `148457f` made a guide profile public on its owner's `active` flag alone,
 * deliberately. This page kept promising "Only approved profiles are visible
 * in the app and on the map" for an hour and a half after that stopped being
 * true, which is the worst kind of stale copy: a moderator would reject a
 * profile, believe they had taken it off the map, and be wrong.
 */
describe('the guide review queue describes itself honestly', () => {
  const MOD_KEY = 'chv_GUIAA-GUIBB-GUICC-GUIDD';

  const guidePage = async (reviewer = 'Nok') => {
    db.prepare("UPDATE hosts SET role = 'moderator', api_key_hash = ? WHERE id = 'h-muni'")
      .run(hashApiKey(MOD_KEY));
    const token = await signIn(MOD_KEY, reviewer);
    return (await app.request('/guides', { headers: withCookie(token) })).text();
  };

  test('it does not claim that approval controls visibility', async () => {
    const page = await guidePage();
    assert.doesNotMatch(
      page,
      /Only approved profiles are visible|เฉพาะโปรไฟล์ที่อนุมัติแล้วจะแสดง/,
      'the promise that outlived the behaviour is back',
    );
  });

  test('it says plainly that approving and rejecting change nothing a traveller sees', async () => {
    const page = await guidePage();
    // Either language: this console renders Thai unless asked for English.
    assert.match(page, /Approval does NOT control visibility|การอนุมัติ .ไม่ได้. ควบคุมการแสดงผล/);
    assert.match(page, /deactivate it|ปิดสถานะ active/i,
      'a moderator needs to be told what DOES take a profile down');
  });

  test('the half of the old promise that still holds is still stated', async () => {
    // The licence image really is moderator-only, and dropping that sentence
    // while correcting the other one would lose a true thing.
    const page = await guidePage();
    assert.match(page, /License images are private|ภาพใบอนุญาตเป็นข้อมูลส่วนตัว/);
  });

  test('an empty queue does not read as "everyone has been checked"', async () => {
    const page = await guidePage();
    assert.match(page, /No guide profiles are waiting for review|ไม่มีโปรไฟล์ไกด์ที่รอตรวจสอบ/);
    assert.match(page, /does not mean every guide has been checked|ไม่ได้หมายความว่าไกด์ทุกคนถูกตรวจแล้ว/);
  });
});
