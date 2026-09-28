import { strict as assert } from 'node:assert';
import { test, describe, beforeEach, afterEach } from 'node:test';

import { openTestDb, type DB } from '../db.ts';
import { hashApiKey, resolveSession, SESSION_COOKIE } from '../host-auth.ts';
import { checkIn } from '../checkin-service.ts';
import {
  moderationQueue, reportReview, reviewsFor, writeReview,
} from '../place-review-service.ts';
import { pendingBatches } from '../batch-service.ts';
import { applyMovement, ensureWallet, getBalances } from '../wallet-service.ts';
import { consoleRoutes, __csrfFor } from './routes.ts';
import { verifyPage } from './statement.ts';
import { digestOf, readStatement } from '../statement-service.ts';
import { countersignaturesFor } from '../countersign-service.ts';
import { usesOf } from '../statement-use-service.ts';
import { sendInquiry } from '../inquiry-service.ts';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { submitStory } from '../story-service.ts';

let db: DB;
let app: ReturnType<typeof consoleRoutes>;

const MUNI_KEY = 'chv_MUNIA-MUNIB-MUNIC-MUNID';
const LAB_KEY = 'chv_LABAA-LABBB-LABCC-LABDD';

const iso = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

beforeEach(() => {
  db = openTestDb();
  app = consoleRoutes(db);
  const now = new Date().toISOString();

  db.prepare('INSERT INTO hosts (id,name,type,api_key_hash,created_at) VALUES (?,?,?,?,?)').run(
    'h-muni', 'Samui Municipality', 'municipality', hashApiKey(MUNI_KEY), now);
  db.prepare('INSERT INTO hosts (id,name,type,api_key_hash,created_at) VALUES (?,?,?,?,?)').run(
    'h-lab', 'Ocean Lab', 'hotel', hashApiKey(LAB_KEY), now);

  const quest = (id: string, host: string) =>
    db.prepare(
      `INSERT INTO quests (id,code,name_en,name_th,where_label,duration,reward_points,
         host_id,kind,lat,lng,geofence_radius_m) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(id, id.toUpperCase(), `Quest ${id}`, 'x', 'Chaweng', '45 min', 150, host,
          'today', 9.5357, 100.0617, 250);
  quest('q-muni', 'h-muni');
  quest('q-lab', 'h-lab');

  db.prepare('INSERT INTO users (id,display_name,created_at) VALUES (?,?,?)').run('u1', 'u1', now);
  ensureWallet(db, 'u1');
  // Opening balance goes through the ledger like every other movement, so
  // the fixture exercises the same path production does.
  applyMovement(db, {
    userId: 'u1', label: 'Opening', host: 'Test', amount: 1000,
    currency: 'green', kind: 'adjustment', sourceRef: `test:opening:${'u1'}`,
  });

  const proof = (id: string, questId: string) => {
    db.prepare(
      `INSERT INTO quest_progress (user_id,quest_id,stage,joined_at,arrived_at,proof_submitted_at)
       VALUES (?,?, 'host_verification', ?,?,?)`,
    ).run('u1', questId, iso(3), iso(2), iso(1));
    db.prepare(
      'INSERT INTO proofs (id,user_id,quest_id,photos,weight_kg,submitted_at) VALUES (?,?,?,?,?,?)',
    ).run(id, 'u1', questId, '[]', 4.2, iso(1));
  };
  proof('p-muni', 'q-muni');
  proof('p-lab', 'q-lab');
});

/** Sign in and return the session cookie value. */
async function signIn(key: string, reviewer = 'Nok'): Promise<string> {
  const res = await app.request('/login', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ key, reviewer }),
  });
  const setCookie = res.headers.get('set-cookie') ?? '';
  const token = /chivago_host=([^;]+)/.exec(setCookie)?.[1];
  assert.ok(token, `login failed: ${res.status}`);
  return token;
}

const withCookie = (token: string) => ({ cookie: `${SESSION_COOKIE}=${token}` });

describe('authentication gate', () => {
  test('every page redirects to login when signed out', async () => {
    for (const path of ['/', '/history', '/proof/p-muni']) {
      const res = await app.request(path);
      assert.equal(res.status, 303, path);
      assert.equal(res.headers.get('location'), '/console/login');
    }
  });

  test('a bad key does not issue a session', async () => {
    const res = await app.request('/login', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ key: 'chv_WRONG-WRONG-WRONG-WRONG', reviewer: 'x' }),
    });
    assert.equal(res.status, 401);
    assert.ok(!(res.headers.get('set-cookie') ?? '').includes('chivago_host='));
  });

  test('the failure message does not reveal which half was wrong', async () => {
    const res = await app.request('/login', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ key: 'chv_WRONG-WRONG-WRONG-WRONG', reviewer: 'x' }),
    });
    const body = await res.text();
    assert.ok(!/key.*(invalid|unknown|not found)/i.test(body), body.slice(0, 200));
  });

  test('the session cookie is HttpOnly, SameSite=Strict and console-scoped', async () => {
    const res = await app.request('/login', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ key: MUNI_KEY, reviewer: 'Nok' }),
    });
    const cookie = res.headers.get('set-cookie') ?? '';
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Strict/);
    assert.match(cookie, /Path=\/console/);
  });

  test('a forged cookie value is refused', async () => {
    const res = await app.request('/', { headers: withCookie('not-a-real-token') });
    assert.equal(res.status, 303);
  });
});

describe('the count the badge polls', () => {
  test('answers this host\'s pending count as JSON, uncached, and nothing else', async () => {
    const cookie = await signIn(MUNI_KEY);
    const res = await app.request('/pending', { headers: withCookie(cookie) });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await res.json(), { pending: 1 }, 'the municipality has one, the lab\'s is not counted');
  });

  test('is behind the session like every other page', async () => {
    const res = await app.request('/pending');
    assert.notEqual(res.status, 200);
  });
});

describe('cross-host isolation — the rule the console exists to enforce', () => {
  test('the queue shows only this host submissions', async () => {
    const muni = await signIn(MUNI_KEY);
    const body = await (await app.request('/', { headers: withCookie(muni) })).text();
    assert.ok(body.includes('p-muni'), 'own submission missing');
    assert.ok(!body.includes('p-lab'), 'another host submission leaked into the queue');
  });

  test('another host proof 404s, indistinguishably from not existing', async () => {
    const muni = await signIn(MUNI_KEY);
    const other = await app.request('/proof/p-lab', { headers: withCookie(muni) });
    const absent = await app.request('/proof/p-nonexistent', { headers: withCookie(muni) });
    assert.equal(other.status, 404);
    assert.equal(absent.status, 404);
    // Identical responses: confirming p-lab exists would leak that another host
    // has work in flight.
    assert.equal(await other.text(), await absent.text());
  });

  test('A HOST CANNOT DECIDE ANOTHER HOST SUBMISSION, even with a valid session and CSRF', async () => {
    // The load-bearing test. CSRF and SameSite stop a cross-SITE attack; this
    // is a legitimately signed-in reviewer reaching for work that is not theirs.
    const muni = await signIn(MUNI_KEY);
    const session = { token: muni, hostId: 'h-muni', hostName: '', reviewer: null, role: 'host' as const, hostType: 'municipality', expiresAt: '' };

    const res = await app.request('/decide', {
      method: 'POST',
      headers: { ...withCookie(muni), 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        csrf: __csrfFor(session), proofId: 'p-lab', decision: 'approve',
      }),
    });

    assert.equal(res.status, 404, 'must not be decidable');
    // And nothing moved.
    const proof = db.prepare('SELECT reviewed_at FROM proofs WHERE id = ?').get('p-lab') as
      unknown as { reviewed_at: string | null };
    assert.equal(proof.reviewed_at, null, 'another host proof was reviewed');
    assert.equal(getBalances(db, 'u1').green, 1000, 'points were released across hosts');
  });

  test('another host photo bytes are not readable', async () => {
    db.prepare(
      `INSERT INTO proof_files (id,proof_id,storage_path,mime_type,byte_size,uploaded_at)
       VALUES (?,?,?,?,?,?)`,
    ).run('f-lab', 'p-lab', '/dev/null', 'image/jpeg', 10, iso(1));
    const muni = await signIn(MUNI_KEY);
    const res = await app.request('/photo/f-lab', { headers: withCookie(muni) });
    assert.equal(res.status, 404);
  });

  test('each host sees its own history only', async () => {
    db.prepare('UPDATE proofs SET reviewed_at=?, approved=1 WHERE id=?').run(iso(0), 'p-lab');
    const muni = await signIn(MUNI_KEY);
    const lab = await signIn(LAB_KEY);
    assert.ok(!(await (await app.request('/history', { headers: withCookie(muni) })).text()).includes('p-lab'));
    const labBody = await (await app.request('/history', { headers: withCookie(lab) })).text();
    assert.ok(labBody.includes('Quest q-lab'));
  });
});

describe('decisions', () => {
  const decide = async (token: string, form: Record<string, string>) =>
    app.request('/decide', {
      method: 'POST',
      headers: { ...withCookie(token), 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(form),
    });

  const csrf = (token: string) =>
    __csrfFor({ token, hostId: 'h-muni', hostName: '', reviewer: null, role: 'host' as const, hostType: 'municipality', expiresAt: '' });

  test('approving releases points and attributes the reviewer', async () => {
    const muni = await signIn(MUNI_KEY, 'Nok Suwannee');
    const res = await decide(muni, { csrf: csrf(muni), proofId: 'p-muni', decision: 'approve' });
    assert.equal(res.status, 303);
    assert.equal(getBalances(db, 'u1').green, 1150);

    const proof = db.prepare('SELECT approved, reviewed_by FROM proofs WHERE id=?').get('p-muni') as
      unknown as { approved: number; reviewed_by: string };
    assert.equal(proof.approved, 1);
    assert.equal(proof.reviewed_by, 'Nok Suwannee', 'the decision must name a person');
  });

  test('rejecting requires a reason — a volunteer cannot fix what they were not told', async () => {
    const muni = await signIn(MUNI_KEY);
    const res = await decide(muni, { csrf: csrf(muni), proofId: 'p-muni', decision: 'reject' });
    assert.equal(res.status, 400);
    const proof = db.prepare('SELECT reviewed_at FROM proofs WHERE id=?').get('p-muni') as
      unknown as { reviewed_at: string | null };
    assert.equal(proof.reviewed_at, null, 'a reasonless rejection must not be recorded');
  });

  test('rejecting with a reason records it and pays nothing', async () => {
    const muni = await signIn(MUNI_KEY);
    const res = await decide(muni, {
      csrf: csrf(muni), proofId: 'p-muni', decision: 'reject',
      reason: 'not_at_site',
    });
    assert.equal(res.status, 303);
    assert.equal(getBalances(db, 'u1').green, 1000, 'nothing paid');

    const progress = db.prepare(
      `SELECT stage, rejection_reason_key FROM quest_progress
       WHERE user_id=? AND quest_id=?`,
    ).get('u1', 'q-muni') as unknown as { stage: string; rejection_reason_key: string };
    assert.equal(progress.stage, 'arrived', 'volunteer can resubmit');
    // The KEY is stored, not the sentence the reviewer happened to see.
    assert.equal(progress.rejection_reason_key, 'not_at_site');
  });

  test('a missing or wrong CSRF token is refused', async () => {
    const muni = await signIn(MUNI_KEY);
    for (const bad of ['', 'wrong', csrf(muni) + 'x']) {
      const res = await decide(muni, { csrf: bad, proofId: 'p-muni', decision: 'approve' });
      assert.equal(res.status, 403, `csrf "${bad}" was accepted`);
    }
    assert.equal(getBalances(db, 'u1').green, 1000);
  });

  test('a note longer than the limit is truncated, not rejected', async () => {
    const muni = await signIn(MUNI_KEY);
    await decide(muni, {
      csrf: csrf(muni), proofId: 'p-muni', decision: 'reject', note: 'x'.repeat(900),
    });
    const proof = db.prepare('SELECT review_note FROM proofs WHERE id=?').get('p-muni') as
      unknown as { review_note: string };
    assert.equal(proof.review_note.length, 500);
  });
});

describe('language', () => {
  const THAI = /[฀-๿]/;

  test('defaults to Thai when the browser expresses no preference', async () => {
    const muni = await signIn(MUNI_KEY);
    const body = await (await app.request('/', { headers: withCookie(muni) })).text();
    assert.match(body, /<html lang="th"/);
    assert.ok(THAI.test(body), 'no Thai on the page');
  });

  test('honours Accept-Language rather than forcing Thai on a foreign partner', async () => {
    const muni = await signIn(MUNI_KEY);
    const en = await (await app.request('/', {
      headers: { ...withCookie(muni), 'accept-language': 'en-GB,en;q=0.9' },
    })).text();
    assert.match(en, /<html lang="en"/);

    const th = await (await app.request('/', {
      headers: { ...withCookie(muni), 'accept-language': 'th-TH,th;q=0.9,en;q=0.5' },
    })).text();
    assert.match(th, /<html lang="th"/);
  });

  test('an explicit choice overrides the browser and persists', async () => {
    const res = await app.request('/lang/en?to=%2Fconsole%2Fhistory', {
      headers: { 'accept-language': 'th-TH' },
    });
    assert.equal(res.status, 303);
    assert.equal(res.headers.get('location'), '/console/history');
    const cookie = res.headers.get('set-cookie') ?? '';
    assert.match(cookie, /chivago_lang=en/);
    assert.match(cookie, /SameSite=Strict/);
    assert.match(cookie, /Max-Age=31536000/);
  });

  test('the chosen language is then used for rendering', async () => {
    const muni = await signIn(MUNI_KEY);
    const body = await (await app.request('/', {
      headers: { cookie: `${SESSION_COOKIE}=${muni}; chivago_lang=en`, 'accept-language': 'th-TH' },
    })).text();
    assert.match(body, /<html lang="en"/);
    assert.ok(!THAI.test(body.replace(/ไทย/g, '')), 'Thai leaked into the English page');
  });

  test('an unknown locale falls back instead of erroring', async () => {
    const res = await app.request('/lang/de');
    assert.equal(res.status, 303);
    assert.equal(res.headers.get('location'), '/console');
    assert.ok(!(res.headers.get('set-cookie') ?? '').includes('chivago_lang'));
  });

  test('the switcher cannot be turned into an open redirect', async () => {
    // /console/lang/th?to=https://evil.example would otherwise hand an attacker
    // a redirect off our own domain, signed by our URL.
    for (const evil of [
      'https://evil.example',
      '//evil.example',
      '/etc/passwd',
      'javascript:alert(1)',
      '/console/../../admin',
    ]) {
      const res = await app.request(`/lang/th?to=${encodeURIComponent(evil)}`);
      const target = res.headers.get('location') ?? '';
      assert.ok(
        target === '/console' || target.startsWith('/console/'),
        `"${evil}" redirected to "${target}"`,
      );
      assert.ok(!target.includes('evil.example'), `"${evil}" escaped the origin`);
    }
  });

  test('language can be switched without being signed in', async () => {
    // The login page needs the switcher too - a Thai officer should not have to
    // read an English form to reach a Thai one.
    const res = await app.request('/lang/en?to=%2Fconsole%2Flogin');
    assert.equal(res.status, 303);
    assert.equal(res.headers.get('location'), '/console/login');
  });

  test('the login page renders in both languages', async () => {
    const th = await (await app.request('/login')).text();
    assert.ok(THAI.test(th));
    const en = await (await app.request('/login', {
      headers: { cookie: 'chivago_lang=en' },
    })).text();
    assert.match(en, /Review submissions/);
  });

  test('rejection reasons are offered in the reviewer language, valued by key', async () => {
    const muni = await signIn(MUNI_KEY);
    const th = await (await app.request('/proof/p-muni', {
      headers: { cookie: `${SESSION_COOKIE}=${muni}; chivago_lang=th` },
    })).text();
    // The option VALUE is always the key; only the label changes.
    assert.match(th, /value="not_at_site"/);
    assert.ok(THAI.test(th));

    const en = await (await app.request('/proof/p-muni', {
      headers: { cookie: `${SESSION_COOKIE}=${muni}; chivago_lang=en` },
    })).text();
    assert.match(en, /value="not_at_site"/);
    assert.match(en, /Photos were not taken at the quest site/);
  });
});

describe('review moderation is a ROLE, not a scope', () => {
  const MOD_KEY = 'chv_MODAA-MODBB-MODCC-MODDD';
  const SITE = { lat: 9.5357, lng: 100.0617 };

  /** A moderator host, a place, a visit and a review to act on. */
  const seedReview = (): string => {
    db.prepare('INSERT INTO hosts (id,name,type,role,api_key_hash,created_at) VALUES (?,?,?,?,?,?)')
      .run('h-platform', 'ChivaGo', 'platform', 'moderator', hashApiKey(MOD_KEY),
           new Date().toISOString());
    db.prepare(
      `INSERT INTO places (id,name_en,name_th,short,layer,lat,lng,meta,blurb_en,blurb_th,
         tags,safety_label_en,safety_label_th,crowd_density,aqi,safety_index,walkability)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run('chaweng', 'Chaweng Beach', 'x', 'Chaweng', 'Green', SITE.lat, SITE.lng,
          'x', 'x', 'x', '[]', 'Patrolled', 'x', 2.4, 42, 7.2, 8.1);
    checkIn(db, { userId: 'u1', placeId: 'chaweng', ...SITE });
    return writeReview(db, {
      userId: 'u1', placeId: 'chaweng', rating: 1,
      body: 'The manager was rude to me and I would not go back there again ever.',
    }).review.id;
  };

  test('a hotel partner cannot reach the desk at all', async () => {
    seedReview();
    const token = await signIn(LAB_KEY);
    const res = await app.request('/reviews', { headers: withCookie(token) });
    // THE test. A hotel partner able to hide a bad review of the beach beside
    // a competitor is a conflict the proof queue never has, which is why this
    // is a separate role rather than a widened scope.
    assert.equal(res.status, 403);
  });

  test('a municipality cannot either - it is not about seniority', async () => {
    seedReview();
    const token = await signIn(MUNI_KEY);
    assert.equal((await app.request('/reviews', { headers: withCookie(token) })).status, 403);
  });

  test('a host cannot hide a review by posting straight at the route', async () => {
    const reviewId = seedReview();
    const token = await signIn(LAB_KEY);
    const session = resolveSession(db, token)!;
    const res = await app.request(`/reviews/${reviewId}/hide`, {
      method: 'POST',
      headers: { ...withCookie(token), 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ csrf: __csrfFor(session), reason: 'abusive' }),
    });
    assert.equal(res.status, 403);
    assert.equal(moderationQueue(db, 'hidden').length, 0, 'nothing taken down');
  });

  test('the Reviews tab is not even drawn for a host', async () => {
    seedReview();
    const token = await signIn(MUNI_KEY);
    const html = await (await app.request('/', { headers: withCookie(token) })).text();
    // Hidden, not disabled. A tab you can see but not open invites the question
    // "why not", and the answer is a boundary the host cannot cross.
    assert.doesNotMatch(html, /href="\/console\/reviews"/);
  });

  test('a moderator sees the tab and the desk', async () => {
    seedReview();
    const token = await signIn(MOD_KEY);
    const home = await (await app.request('/', { headers: withCookie(token) })).text();
    assert.match(home, /href="\/console\/reviews"/);

    const desk = await app.request('/reviews', { headers: withCookie(token) });
    assert.equal(desk.status, 200);
    const html = await desk.text();
    assert.match(html, /Chaweng Beach/);
    // The page states the limits of its own claim. A moderator who believes
    // "verified" means "true" will under-moderate.
    // The page states the limits of its own claim, in the console default
    // language (Thai). A moderator who believes "verified" means "true" will
    // under-moderate.
    assert.match(html, /แต่ไม่ได้ทำให้เป็นไปไม่ได้/);

    const inEnglish = await app.request('/reviews', {
      headers: { ...withCookie(token), 'accept-language': 'en-GB,en;q=0.9' },
    });
    assert.match(await inEnglish.text(), /expensive, not impossible/i);
  });

  test('a take-down needs a reason, and an unknown one is refused', async () => {
    const reviewId = seedReview();
    const token = await signIn(MOD_KEY);
    const session = resolveSession(db, token)!;
    const post = (reason: string) =>
      app.request(`/reviews/${reviewId}/hide`, {
        method: 'POST',
        headers: { ...withCookie(token), 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ csrf: __csrfFor(session), reason }),
      });

    assert.equal((await post('')).status, 400, 'no reason');
    assert.equal((await post('__proto__')).status, 400, 'prototype key');
    assert.equal((await post('made_up')).status, 400, 'unknown key');
    assert.equal(moderationQueue(db, 'hidden').length, 0);

    assert.equal((await post('abusive')).status, 303, 'a real reason works');
    assert.equal(moderationQueue(db, 'hidden').length, 1);
  });

  test('a take-down without the CSRF token is refused', async () => {
    const reviewId = seedReview();
    const token = await signIn(MOD_KEY);
    const res = await app.request(`/reviews/${reviewId}/hide`, {
      method: 'POST',
      headers: { ...withCookie(token), 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ reason: 'abusive' }),
    });
    assert.equal(res.status, 403);
    assert.equal(moderationQueue(db, 'hidden').length, 0);
  });
});

describe('the report queue on the desk', () => {
  const MOD_KEY = 'chv_MODAA-MODBB-MODCC-MODDD';
  const SITE = { lat: 9.5357, lng: 100.0617 };

  const seedReported = (): string => {
    db.prepare('INSERT INTO hosts (id,name,type,role,api_key_hash,created_at) VALUES (?,?,?,?,?,?)')
      .run('h-platform', 'ChivaGo', 'platform', 'moderator', hashApiKey(MOD_KEY),
           new Date().toISOString());
    db.prepare(
      `INSERT INTO places (id,name_en,name_th,short,layer,lat,lng,meta,blurb_en,blurb_th,
         tags,safety_label_en,safety_label_th,crowd_density,aqi,safety_index,walkability)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run('chaweng', 'Chaweng Beach', 'x', 'Chaweng', 'Green', SITE.lat, SITE.lng,
          'x', 'x', 'x', '[]', 'Patrolled', 'x', 2.4, 42, 7.2, 8.1);
    db.prepare('INSERT INTO users (id,display_name,created_at) VALUES (?,?,?)')
      .run('local1', 'Local', new Date().toISOString());

    checkIn(db, { userId: 'u1', placeId: 'chaweng', ...SITE });
    const id = writeReview(db, {
      userId: 'u1', placeId: 'chaweng', rating: 1,
      body: 'The manager Somsak at the beach bar was rude and I would not go back.',
    }).review.id;
    reportReview(db, {
      reviewId: id, reporterId: 'local1', reasonKey: 'personal_info',
      note: 'Somsak is my brother',
    });
    return id;
  };

  test('the desk opens on the reported lens when anything is reported', async () => {
    seedReported();
    const token = await signIn(MOD_KEY);
    const html = await (await app.request('/reviews', { headers: withCookie(token) })).text();
    // Never opens on an empty page, and never buries a human flag under an
    // automatic one.
    assert.match(html, /Somsak is my brother/);
  });

  test('the desk shows the reporter reason and note', async () => {
    seedReported();
    const token = await signIn(MOD_KEY);
    const res = await app.request('/reviews?filter=reported', {
      headers: { ...withCookie(token), 'accept-language': 'en' },
    });
    const html = await res.text();
    assert.match(html, /names or identifies someone/i);
    assert.match(html, /Somsak is my brother/);
    // The rule the lens exists to state.
    assert.match(html, /signal, not an action/i);
  });

  test('dismissing clears the reports and leaves the review published', async () => {
    const reviewId = seedReported();
    const token = await signIn(MOD_KEY);
    const session = resolveSession(db, token)!;
    const res = await app.request(`/reviews/${reviewId}/dismiss`, {
      method: 'POST',
      headers: { ...withCookie(token), 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ csrf: __csrfFor(session) }),
    });
    assert.equal(res.status, 303);
    assert.equal(moderationQueue(db, 'reported').length, 0);
    assert.equal(moderationQueue(db, 'hidden').length, 0, 'not removed, just handled');
  });

  test('a host cannot dismiss reports either', async () => {
    const reviewId = seedReported();
    const token = await signIn(LAB_KEY);
    const session = resolveSession(db, token)!;
    const res = await app.request(`/reviews/${reviewId}/dismiss`, {
      method: 'POST',
      headers: { ...withCookie(token), 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ csrf: __csrfFor(session) }),
    });
    assert.equal(res.status, 403);
    assert.equal(moderationQueue(db, 'reported').length, 1, 'still queued');
  });

  test('dismissing without the CSRF token is refused', async () => {
    const reviewId = seedReported();
    const token = await signIn(MOD_KEY);
    const res = await app.request(`/reviews/${reviewId}/dismiss`, {
      method: 'POST',
      headers: { ...withCookie(token), 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({}),
    });
    assert.equal(res.status, 403);
    assert.equal(moderationQueue(db, 'reported').length, 1);
  });
});

describe('bulk take-down needs two people', () => {
  const MOD_KEY = 'chv_MODAA-MODBB-MODCC-MODDD';
  const MOD2_KEY = 'chv_M2AAA-M2BBB-M2CCC-M2DDD';
  const SITE = { lat: 9.5357, lng: 100.0617 };

  const seedWave = (n: number): string[] => {
    for (const [id, key] of [['h-platform', MOD_KEY], ['h-platform2', MOD2_KEY]]) {
      db.prepare('INSERT INTO hosts (id,name,type,role,api_key_hash,created_at) VALUES (?,?,?,?,?,?)')
        .run(id, 'ChivaGo', 'platform', 'moderator', hashApiKey(key!), new Date().toISOString());
    }
    db.prepare(
      `INSERT INTO places (id,name_en,name_th,short,layer,lat,lng,meta,blurb_en,blurb_th,
         tags,safety_label_en,safety_label_th,crowd_density,aqi,safety_index,walkability)
       VALUES ('chaweng','Chaweng Beach','x','C','Green',?,?,'x','x','x','[]','P','x',2,42,7,8)`,
    ).run(SITE.lat, SITE.lng);

    return Array.from({ length: n }, (_, i) => {
      const author = `spam${i}`;
      db.prepare('INSERT INTO users (id,display_name,created_at) VALUES (?,?,?)')
        .run(author, 'S', new Date().toISOString());
      checkIn(db, { userId: author, placeId: 'chaweng', ...SITE });
      return writeReview(db, {
        userId: author, placeId: 'chaweng', rating: 1,
        body: 'Buy cheap tours at my shop, best price on the island, call now.',
      }).review.id;
    });
  };

  const propose = async (token: string, ids: string[]) => {
    const session = resolveSession(db, token)!;
    const body = new URLSearchParams({ csrf: __csrfFor(session), reason: 'commercial' });
    for (const id of ids) body.append('reviewId', id);
    return app.request('/reviews/batches/propose', {
      method: 'POST',
      headers: { ...withCookie(token), 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
  };

  test('"batches" is not swallowed as a review id', async () => {
    // Hono matches in registration order. If /reviews/:id/... came first,
    // POSTing to /reviews/batches/propose would try to hide a review called
    // "batches" — the kind of bug that only appears with real routes.
    const ids = seedWave(3);
    const token = await signIn(MOD_KEY);
    assert.equal((await propose(token, ids)).status, 303);
    assert.equal(pendingBatches(db).length, 1);
  });

  test('a proposal takes nothing down by itself', async () => {
    const ids = seedWave(3);
    const token = await signIn(MOD_KEY);
    await propose(token, ids);
    assert.equal(reviewsFor(db, 'chaweng').length, 3, 'all still published');
  });

  test('the proposer is refused, and told why', async () => {
    const ids = seedWave(3);
    const token = await signIn(MOD_KEY, 'Ploy');
    await propose(token, ids);
    const batch = pendingBatches(db)[0]!;
    const session = resolveSession(db, token)!;

    const res = await app.request(`/reviews/batches/${batch.id}/approve`, {
      method: 'POST',
      headers: { ...withCookie(token), 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ csrf: __csrfFor(session) }),
    });
    assert.equal(res.status, 403);
    // Refused is not enough; it has to say which rule stopped them.
    assert.match(await res.text(), /different moderator|ผู้ดูแลคนอื่น/);
    assert.equal(reviewsFor(db, 'chaweng').length, 3);
  });

  test('a second moderator runs it', async () => {
    const ids = seedWave(4);
    const proposerToken = await signIn(MOD_KEY, 'Ploy');
    await propose(proposerToken, ids);
    const batch = pendingBatches(db)[0]!;

    const approverToken = await signIn(MOD2_KEY, 'Anan');
    const session = resolveSession(db, approverToken)!;
    const res = await app.request(`/reviews/batches/${batch.id}/approve`, {
      method: 'POST',
      headers: { ...withCookie(approverToken), 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ csrf: __csrfFor(session) }),
    });
    assert.equal(res.status, 303);
    assert.equal(reviewsFor(db, 'chaweng').length, 0);
  });

  test('a host cannot reach any of it', async () => {
    const ids = seedWave(2);
    const token = await signIn(LAB_KEY);
    assert.equal((await propose(token, ids)).status, 403);
    assert.equal(
      (await app.request('/reviews/batches', { headers: withCookie(token) })).status,
      403,
    );
    assert.equal(pendingBatches(db).length, 0);
  });

  test('a proposal with no reason is refused', async () => {
    const ids = seedWave(2);
    const token = await signIn(MOD_KEY);
    const session = resolveSession(db, token)!;
    const body = new URLSearchParams({ csrf: __csrfFor(session) });
    for (const id of ids) body.append('reviewId', id);
    const res = await app.request('/reviews/batches/propose', {
      method: 'POST',
      headers: { ...withCookie(token), 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
    assert.equal(res.status, 400);
    assert.equal(pendingBatches(db).length, 0);
  });
});

describe('the SOS desk is guarded like every other state change', () => {
  test('acknowledging without the CSRF token is refused, and the alert stays unacknowledged', async () => {
    const { fireAlert, activeAlert } = await import('../sos-service.ts');
    fireAlert(db, { userId: 'u1', lat: 9.5357, lng: 100.0617, locationLabel: 'Chaweng' });
    const alertId = activeAlert(db, 'u1')!.id;
    const muni = await signIn(MUNI_KEY);

    const forged = await app.request(`/sos/${alertId}/acknowledge`, {
      method: 'POST',
      headers: { ...withCookie(muni), 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({}),
    });
    assert.equal(forged.status, 403);
    assert.equal(activeAlert(db, 'u1')!.status, 'dispatching', 'a forged acknowledge told nobody anything');

    const real = await app.request(`/sos/${alertId}/acknowledge`, {
      method: 'POST',
      headers: { ...withCookie(muni), 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ csrf: __csrfFor(resolveSession(db, muni)!) }),
    });
    assert.equal(real.status, 303);
    assert.equal(activeAlert(db, 'u1')!.status, 'acknowledged');
  });

  test('the desk page carries the token in its forms', async () => {
    const { fireAlert } = await import('../sos-service.ts');
    fireAlert(db, { userId: 'u1', lat: 9.5357, lng: 100.0617, locationLabel: 'Chaweng' });
    const muni = await signIn(MUNI_KEY);
    const page = await (await app.request('/sos', { headers: withCookie(muni) })).text();
    assert.match(page, /name="csrf" value="[A-Za-z0-9_-]+"/);
  });

  test('an alert with no position says so on the desk instead of drawing a pin', async () => {
    const { fireAlert } = await import('../sos-service.ts');
    fireAlert(db, { userId: 'u1', lat: null, lng: null, locationLabel: 'Position unknown' });
    const muni = await signIn(MUNI_KEY);
    const page = await (await app.request('/sos', { headers: withCookie(muni) })).text();
    assert.match(page, /POSITION UNKNOWN/);
    assert.doesNotMatch(page, /Open in Maps/);
  });
});

describe('signing in is metered', () => {
  test('the eleventh attempt from one address in a quarter hour is refused, whatever the key', async () => {
    const { __resetLoginAttemptsForTests } = await import('./routes.ts');
    __resetLoginAttemptsForTests();
    const attempt = (key: string) => app.request('/login', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-forwarded-for': '203.0.113.50' },
      body: new URLSearchParams({ key, reviewer: 'x' }),
    });
    for (let i = 0; i < 10; i += 1) {
      assert.equal((await attempt('chv_WRONG-WRONG-WRONG-WRONG')).status, 401);
    }
    // Even the RIGHT key is refused now: the meter is on the address, and
    // an attacker who guessed correctly on try eleven does not get in.
    const eleventh = await attempt(MUNI_KEY);
    assert.equal(eleventh.status, 429);
    __resetLoginAttemptsForTests();
  });

  test('a different address is not affected', async () => {
    const { __resetLoginAttemptsForTests } = await import('./routes.ts');
    __resetLoginAttemptsForTests();
    const res = await app.request('/login', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-forwarded-for': '203.0.113.51' },
      body: new URLSearchParams({ key: MUNI_KEY, reviewer: 'Nok' }),
    });
    assert.equal(res.status, 303);
  });
});

describe('the statement page', () => {
  const approve = (questId: string, at: string) => {
    db.prepare(
      "UPDATE quest_progress SET stage = 'complete', verified_at = ? WHERE user_id = 'u1' AND quest_id = ?",
    ).run(at, questId);
    db.prepare(
      "UPDATE proofs SET reviewed_at = ?, approved = 1, reviewed_by = 'Nok' WHERE quest_id = ?",
    ).run(at, questId);
  };
  const year = new Date().getUTCFullYear();
  const issue = (token: string, from: string, to: string, csrf?: string) =>
    app.request('/statement', {
      method: 'POST',
      headers: { ...withCookie(token), 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ csrf: csrf ?? __csrfFor(resolveSession(db, token)!), from, to }),
    });
  const count = () =>
    (db.prepare('SELECT COUNT(*) AS n FROM statements').get() as unknown as { n: number }).n;

  test("drafts this host's verified activity, and nothing of another host's", async () => {
    approve('q-lab', iso(2));
    approve('q-muni', iso(2));
    const lab = await signIn(LAB_KEY);
    const res = await app.request('/statement', { headers: withCookie(lab) });
    assert.equal(res.status, 200);
    const page = await res.text();
    assert.match(page, /Ocean Lab/);
    assert.match(page, /Issue this statement/);
    assert.match(page, /Quest q-lab/);
    assert.doesNotMatch(page, /Quest q-muni/, "another host's quest was drafted into this statement");
    assert.match(page, /Nothing issued yet/);
  });

  test('issuing writes an immutable record with a public id, and the page then lists it', async () => {
    approve('q-lab', iso(2));
    const lab = await signIn(LAB_KEY, 'Nok Suwannee');
    const res = await issue(lab, `${year}-01-01`, `${year}-12-31`);
    assert.equal(res.status, 303);
    const location = res.headers.get('location') ?? '';
    const id = /issued=(CG-\d{4}-[0-9A-Z]{6})/.exec(location)?.[1];
    assert.ok(id, `no statement id in ${location}`);

    const row = db.prepare('SELECT host_id, issued_by, digest FROM statements WHERE id = ?').get(id) as
      unknown as { host_id: string; issued_by: string; digest: string };
    assert.equal(row.host_id, 'h-lab');
    assert.equal(row.issued_by, 'Nok Suwannee', 'the person who issued it is on the record');
    assert.throws(
      () => db.prepare("UPDATE statements SET body = '{}' WHERE id = ?").run(id),
      /append-only/,
    );

    const page = await (await app.request(`/statement?issued=${id}`, { headers: withCookie(lab) })).text();
    assert.match(page, new RegExp(id!));
    assert.match(page, new RegExp(row.digest.slice(0, 12)));
    assert.match(page, /\/verify\//, 'the public link is on the page');
  });

  test('a stale csrf issues nothing', async () => {
    const lab = await signIn(LAB_KEY);
    const res = await issue(lab, `${year}-01-01`, `${year}-12-31`, 'not-this-session');
    assert.equal(res.status, 403);
    assert.equal(count(), 0);
  });

  test('a period out of order is refused before anything is written', async () => {
    const lab = await signIn(LAB_KEY);
    const res = await issue(lab, `${year}-12-31`, `${year}-01-01`);
    assert.equal(res.status, 400);
    assert.equal(count(), 0);
  });

  test('signed out, it is the login redirect like every other page', async () => {
    const res = await app.request('/statement');
    assert.equal(res.status, 303);
    assert.equal(res.headers.get('location'), '/console/login');
  });

  /**
   * The evidence pack under an issued statement.
   *
   * The statement is public because it carries counts and no people. This
   * carries a row per approval, so it is not - and the guard is the same
   * cross-host rule the rest of this console enforces.
   */
  const issuedId = async (token: string) => {
    const res = await issue(token, `${year}-01-01`, `${year}-12-31`);
    return /issued=(CG-\d{4}-[0-9A-Z]{6})/.exec(res.headers.get('location') ?? '')?.[1] ?? '';
  };

  test('the pack lists the approvals and says the evidence still matches', async () => {
    approve('q-lab', iso(2));
    const lab = await signIn(LAB_KEY, 'Nok Suwannee');
    const id = await issuedId(lab);

    const page = await (await app.request(`/evidence?id=${id}`, { headers: withCookie(lab) })).text();
    assert.match(page, new RegExp(id));
    assert.match(page, /Nok/, 'the reviewer who approved it is not on the pack');
    assert.match(page, /P-[0-9A-F]{8}/, 'no participant reference on the pack');
    assert.match(page, /ยังคงอยู่|still stand/, 'the reconciliation verdict is missing');
  });

  test('WITHDRAWING AN APPROVAL AFTER FILING SHOWS UP ON THE PACK', async () => {
    // The reason this is not a listing. The statement cannot change and still
    // says one; the proof under it has been turned down since.
    approve('q-lab', iso(2));
    const lab = await signIn(LAB_KEY, 'Nok Suwannee');
    const id = await issuedId(lab);

    db.prepare("UPDATE proofs SET approved = 0 WHERE quest_id = 'q-lab'").run();
    const page = await (await app.request(`/evidence?id=${id}`, { headers: withCookie(lab) })).text();
    assert.match(page, /ถูกเพิกถอนภายหลัง|Withdrawn since/, 'a withdrawal after filing is invisible');
  });

  test('another host cannot open it, and is not told it exists', async () => {
    // Same answer for "no such statement" and "not yours": telling a host
    // which ids exist elsewhere is itself a cross-host leak.
    approve('q-lab', iso(2));
    const lab = await signIn(LAB_KEY, 'Nok');
    const id = await issuedId(lab);

    const muni = await signIn(MUNI_KEY, 'Somsak');
    const res = await app.request(`/evidence?id=${id}`, { headers: withCookie(muni) });
    assert.equal(res.status, 404);
    const page = await res.text();
    assert.doesNotMatch(page, /P-[0-9A-F]{8}/, 'a row leaked to another host');
    assert.doesNotMatch(page, /Nok/, 'a reviewer name leaked to another host');
  });

  test('the CSV carries the statement, the digest and the verdict', async () => {
    approve('q-lab', iso(2));
    const lab = await signIn(LAB_KEY, 'Nok Suwannee');
    const id = await issuedId(lab);
    const digest = (db.prepare('SELECT digest FROM statements WHERE id = ?').get(id) as
      unknown as { digest: string }).digest;

    const res = await app.request(`/evidence?id=${id}&format=csv`, { headers: withCookie(lab) });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') ?? '', /text\/csv/);
    assert.match(res.headers.get('content-disposition') ?? '', new RegExp(`${id}-evidence.csv`));
    // Never cached: unlike the statement, this changes as the rows under it do.
    assert.equal(res.headers.get('cache-control'), 'no-store');

    const csv = await res.text();
    assert.match(csv, new RegExp(digest));
    assert.match(
      csv,
      /day,quest_id,quest,participant_ref,reviewed_by,photos,weight_kg,level_required,level_attained,standing/,
    );
    assert.match(csv, /Level 3 of four/, 'the pack does not say which rung it is on');
  });

  test('a quest with an agreed level says whether the work cleared it', async () => {
    // The two facts kept apart: what the platform can produce at all, and
    // whether THIS submission cleared the rung its own quest agreed to. The
    // fixture's proof has no photographs and the fence was never recorded, so
    // a partner approval with a named reviewer is rung 3 against a bar of 3.
    db.prepare("UPDATE quests SET evidence_level = 3 WHERE id = 'q-lab'").run();
    approve('q-lab', iso(2));
    const lab = await signIn(LAB_KEY, 'Nok Suwannee');
    const id = await issuedId(lab);

    const page = await (await app.request(`/evidence?id=${id}`, { headers: withCookie(lab) })).text();
    assert.match(page, /เทียบกับระดับที่ตกลงไว้/);
    assert.match(page, /ทั้ง 1 รายการอยู่ในระดับ|All 1 meet the level/);
  });

  test('A SHORTFALL AGAINST THE AGREED LEVEL IS SAID OUT LOUD', async () => {
    // Nothing in this platform can reach rung 4 - no third party can
    // countersign - so a quest that agreed to 4 is short by construction, and
    // the pack has to say so rather than pass it because a host approved it.
    db.prepare("UPDATE quests SET evidence_level = 4 WHERE id = 'q-lab'").run();
    approve('q-lab', iso(2));
    const lab = await signIn(LAB_KEY, 'Nok Suwannee');
    const id = await issuedId(lab);

    const page = await (await app.request(`/evidence?id=${id}`, { headers: withCookie(lab) })).text();
    assert.match(page, /ต่ำกว่าระดับที่ภารกิจตกลงไว้|fall short of the level/);
  });

  test('a quest with no agreed level is held to none, and says that too', async () => {
    approve('q-lab', iso(2));
    const lab = await signIn(LAB_KEY, 'Nok Suwannee');
    const id = await issuedId(lab);

    const page = await (await app.request(`/evidence?id=${id}`, { headers: withCookie(lab) })).text();
    assert.match(page, /ไม่ได้ตกลงระดับไว้|no agreed level/);
    assert.doesNotMatch(page, /ต่ำกว่าระดับ|fall short/, 'an unagreed quest was reported as short');
  });

  test('signed out, the pack is the login redirect too', async () => {
    const res = await app.request('/evidence?id=CG-2026-AAAAAA');
    assert.equal(res.status, 303);
    assert.equal(res.headers.get('location'), '/console/login');
  });
});

describe('the statement draft with a period that is not a date', () => {
  test('a thirteenth month is a 400, not a 500', async () => {
    const lab = await signIn(LAB_KEY);
    const res = await app.request('/statement?from=2026-13-01&to=2026-13-31', { headers: withCookie(lab) });
    assert.equal(res.status, 400);
  });
});

describe('the stories page', () => {
  // A story at Chaweng, told by u1 standing there. The municipality hosts a
  // quest on the island, so it reviews; Ocean Lab hosts one too (q-lab at
  // Chaweng) - both are island hosts here, so a campus host is added to be
  // the one that cannot.
  let dir: string;
  let storyId: string;
  const fake = {
    async video(_i: string, outMp4: string, outPoster: string) {
      writeFileSync(outMp4, 'MP4-BYTES'); writeFileSync(outPoster, 'POSTER-BYTES'); return { durationS: 5 };
    },
    async photo(_i: string, outJpg: string) { writeFileSync(outJpg, 'JPG-BYTES'); },
  };
  const mp4 = () => Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom'), Buffer.alloc(32, 1)]);
  const KU_KEY = 'chv_KUKUA-KUKUB-KUKUC-KUKUD';

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'chivago-console-stories-'));
    process.env.CHIVAGO_UPLOADS = dir;
    db.prepare(
      `INSERT INTO places (id, name_en, name_th, short, layer, province, lat, lng, meta, blurb_en, blurb_th, tags,
         safety_label_en, safety_label_th, crowd_density, aqi, safety_index, walkability)
       VALUES ('chaweng','Chaweng Beach','หาดเฉวง','Chaweng','Safe','TH-84',9.5357,100.0617,'','','','[]','x','x',1,20,6,7)`,
    ).run();
    db.prepare('INSERT INTO hosts (id,name,type,api_key_hash,created_at) VALUES (?,?,?,?,?)').run(
      'h-ku', 'ChivaGo team · KU Sriracha', 'community', hashApiKey(KU_KEY), new Date().toISOString());
    db.prepare(
      `INSERT INTO quests (id,code,name_en,name_th,where_label,duration,reward_points,host_id,kind,lat,lng,geofence_radius_m)
       VALUES ('q-ku','KU01','Campus clean-up','x','Sapandao','45 min',120,'h-ku','today',13.12189,100.92055,100)`,
    ).run();
    const s = await submitStory(db, {
      userId: 'u1', placeId: 'chaweng', bytes: mp4(), caption: 'low tide',
      fix: { lat: 9.5357, lng: 100.0617, accuracyM: 8 }, transcoder: fake, open: true,
    });
    storyId = s.id;
  });
  afterEach(() => { delete process.env.CHIVAGO_UPLOADS; rmSync(dir, { recursive: true, force: true }); });

  const post = (token: string, path: string, csrf: string) => app.request(path, {
    method: 'POST',
    headers: { ...withCookie(token), 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrf }),
  });

  test('the island host sees the island story, with its poster, and approves it', async () => {
    const muni = await signIn(MUNI_KEY, 'Nok');
    const page = await (await app.request('/stories', { headers: withCookie(muni) })).text();
    assert.match(page, /low tide/);
    assert.match(page, /Chaweng Beach/);
    assert.match(page, new RegExp(`/console/stories/${storyId}/poster`));
    const poster = await app.request(`/stories/${storyId}/poster`, { headers: withCookie(muni) });
    assert.equal(poster.status, 200);
    assert.equal(await poster.text(), 'POSTER-BYTES');

    const session = resolveSession(db, muni)!;
    const res = await post(muni, `/stories/${storyId}/approve`, __csrfFor(session));
    assert.equal(res.status, 303);
    const row = db.prepare('SELECT status, reviewed_by, reviewer_host FROM stories WHERE id = ?').get(storyId) as
      unknown as { status: string; reviewed_by: string; reviewer_host: string };
    assert.equal(row.status, 'approved');
    assert.equal(row.reviewed_by, 'Nok');
    assert.equal(row.reviewer_host, 'h-muni');
    assert.doesNotMatch(await (await app.request('/stories', { headers: withCookie(muni) })).text(), /low tide/, 'approved is no longer waiting');
  });

  test('the campus host sees nothing of the island, cannot read its bytes, and cannot decide', async () => {
    const ku = await signIn(KU_KEY, 'Team');
    const page = await (await app.request('/stories', { headers: withCookie(ku) })).text();
    assert.doesNotMatch(page, /low tide/);
    assert.match(page, /Nothing waiting/);
    assert.equal((await app.request(`/stories/${storyId}/poster`, { headers: withCookie(ku) })).status, 404);
    const session = resolveSession(db, ku)!;
    const res = await post(ku, `/stories/${storyId}/approve`, __csrfFor(session));
    assert.equal(res.status, 404);
    const row = db.prepare('SELECT status FROM stories WHERE id = ?').get(storyId) as unknown as { status: string };
    assert.equal(row.status, 'pending');
  });

  test('a stale csrf decides nothing', async () => {
    const muni = await signIn(MUNI_KEY);
    const res = await post(muni, `/stories/${storyId}/hide`, 'not-this-session');
    assert.equal(res.status, 403);
    const row = db.prepare('SELECT status FROM stories WHERE id = ?').get(storyId) as unknown as { status: string };
    assert.equal(row.status, 'pending');
  });
});

describe('the door', () => {
  const MOD_KEY = 'chv_MODAA-MODBB-MODCC-MODDD';
  beforeEach(() => {
    db.prepare('INSERT INTO hosts (id,name,type,role,api_key_hash,created_at) VALUES (?,?,?,?,?,?)').run(
      'h-mod', 'ChivaGo', 'platform', 'moderator', hashApiKey(MOD_KEY), new Date().toISOString());
    delete process.env.CHIVAGO_STORIES_OPEN;
  });

  const door = (token: string, open: '0' | '1', csrf: string) => app.request('/stories/door', {
    method: 'POST',
    headers: { ...withCookie(token), 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrf, open }),
  });
  const state = () => (db.prepare("SELECT value FROM settings WHERE key = 'stories_open'").get() as unknown as { value: string } | undefined)?.value ?? '0';

  test('a moderator opens it and shuts it, and the page says which', async () => {
    const mod = await signIn(MOD_KEY, 'Nok');
    const shut = await (await app.request('/stories', { headers: withCookie(mod) })).text();
    assert.match(shut, /The door is <strong>closed<\/strong>/);
    assert.match(shut, /Open the door/);
    const session = resolveSession(db, mod)!;
    assert.equal((await door(mod, '1', __csrfFor(session))).status, 303);
    assert.equal(state(), '1');
    const open = await (await app.request('/stories', { headers: withCookie(mod) })).text();
    assert.match(open, /The door is <strong>open<\/strong>/);
    assert.match(open, /Close the door/);
    assert.equal((await door(mod, '0', __csrfFor(session))).status, 303);
    assert.equal(state(), '0');
  });

  test('a host is shown the state and no handle, and cannot throw it', async () => {
    const muni = await signIn(MUNI_KEY, 'Nok');
    const page = await (await app.request('/stories', { headers: withCookie(muni) })).text();
    assert.match(page, /A moderator opens and closes it/);
    assert.doesNotMatch(page, /Open the door/);
    const session = resolveSession(db, muni)!;
    assert.equal((await door(muni, '1', __csrfFor(session))).status, 404);
    assert.equal(state(), '0');
  });

  test('a stale csrf throws nothing', async () => {
    const mod = await signIn(MOD_KEY, 'Nok');
    assert.equal((await door(mod, '1', 'not-this-session')).status, 403);
    assert.equal(state(), '0');
  });
});

describe('the funder in a row, not in a constant', () => {
  const MOD2_KEY = 'chv_ORGAA-ORGBB-ORGCC-ORGDD';
  beforeEach(() => {
    db.prepare('INSERT INTO hosts (id,name,type,role,api_key_hash,created_at) VALUES (?,?,?,?,?,?)').run(
      'h-org-mod', 'ChivaGo', 'platform', 'moderator', hashApiKey(MOD2_KEY), new Date().toISOString());
  });

  const form = (token: string, path: string, fields: Record<string, string>) => app.request(path, {
    method: 'POST',
    headers: { ...withCookie(token), 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields),
  });
  const csrfOf = (token: string) => __csrfFor(resolveSession(db, token)!);

  test('a deployment with no organisation shows a page that says so, not an example funder', async () => {
    // The constant this replaced put a named foundation and 65,000 THB on
    // screen on every deployment, including ones where nobody had funded
    // anything. That is the failure mode being tested for.
    const mod = await signIn(MOD2_KEY, 'Nok');
    const sponsor = await (await app.request('/sponsor', { headers: withCookie(mod) })).text();
    assert.match(sponsor, /No organisation has been added yet/);
    assert.doesNotMatch(sponsor, /Samui Green Foundation/, 'an invented funder is still on the page');
    assert.doesNotMatch(sponsor, /65,000|40,000/, 'invented money is still on the page');

    const esg = await (await app.request('/esg', { headers: withCookie(mod) })).text();
    assert.match(esg, /No organisation has been added yet/);
    assert.doesNotMatch(esg, /Samui Green Foundation/);
  });

  test('a moderator adds one, and its money is marked declared everywhere it is shown', async () => {
    const mod = await signIn(MOD2_KEY, 'Nok');
    assert.equal((await form(mod, '/organisations', {
      csrf: csrfOf(mod), name: 'Kasetsart Sriracha', nameTh: 'ม.เกษตร ศรีราชา', kind: 'university',
    })).status, 303);

    const orgId = (db.prepare('SELECT id FROM organisations').get() as unknown as { id: string }).id;
    assert.equal((await form(mod, `/organisations/${orgId}/fund`, {
      csrf: csrfOf(mod), questId: 'q-muni', fundedTHB: '50000', perVerifiedTHB: '500',
    })).status, 303);

    const sponsor = await (await app.request('/sponsor', { headers: withCookie(mod) })).text();
    // The console opens in Thai, so the Thai name is the one on the page.
    assert.match(sponsor, /ม\.เกษตร ศรีราชา/);
    assert.match(sponsor, /50,000 THB/);
    // The line that made the table safe to build at all.
    assert.match(sponsor, /Declared, not signed/);
  });

  test('marking it signed changes what the page claims, and only that', async () => {
    const mod = await signIn(MOD2_KEY, 'Nok');
    await form(mod, '/organisations', { csrf: csrfOf(mod), name: 'Acme', kind: 'company' });
    const orgId = (db.prepare('SELECT id FROM organisations').get() as unknown as { id: string }).id;
    await form(mod, `/organisations/${orgId}/fund`, {
      csrf: csrfOf(mod), questId: 'q-muni', fundedTHB: '10000', perVerifiedTHB: '100', basis: 'signed',
    });
    const page = await (await app.request('/sponsor', { headers: withCookie(mod) })).text();
    assert.match(page, /come from a signed agreement/);
    assert.doesNotMatch(page, /Declared, not signed/);
  });

  test('one declared line among signed ones makes the whole page declared', async () => {
    // Read as the weakest link. A page calling itself signed while one figure
    // was somebody's estimate would be worse than one that says declared.
    const mod = await signIn(MOD2_KEY, 'Nok');
    await form(mod, '/organisations', { csrf: csrfOf(mod), name: 'Mixed', kind: 'company' });
    const orgId = (db.prepare('SELECT id FROM organisations').get() as unknown as { id: string }).id;
    await form(mod, `/organisations/${orgId}/fund`, {
      csrf: csrfOf(mod), questId: 'q-muni', fundedTHB: '10000', perVerifiedTHB: '100', basis: 'signed',
    });
    await form(mod, `/organisations/${orgId}/fund`, {
      csrf: csrfOf(mod), questId: 'q-lab', fundedTHB: '5000', perVerifiedTHB: '50',
    });
    const page = await (await app.request('/sponsor', { headers: withCookie(mod) })).text();
    assert.match(page, /Declared, not signed/);
  });

  test('a host who is not a moderator cannot see the page or post to it', async () => {
    // A host who runs a quest must not set the funding their own work is
    // measured against.
    const host = await signIn(MUNI_KEY, 'Ann');
    assert.equal((await app.request('/organisations', { headers: withCookie(host) })).status, 404);
    assert.equal((await form(host, '/organisations', {
      csrf: csrfOf(host), name: 'Self Funded', kind: 'company',
    })).status, 404);
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM organisations').get() as unknown as { n: number }).n, 0);
  });

  test('paying out more per approval than was ever funded is refused, not stored', async () => {
    const mod = await signIn(MOD2_KEY, 'Nok');
    await form(mod, '/organisations', { csrf: csrfOf(mod), name: 'Typo Co', kind: 'company' });
    const orgId = (db.prepare('SELECT id FROM organisations').get() as unknown as { id: string }).id;
    const res = await form(mod, `/organisations/${orgId}/fund`, {
      csrf: csrfOf(mod), questId: 'q-muni', fundedTHB: '1000', perVerifiedTHB: '5000',
    });
    assert.equal(res.status, 303);
    assert.match(res.headers.get('location') ?? '', /error=/);
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM org_sponsorships').get() as unknown as { n: number }).n, 0);
  });

  test('a stale form is refused, like every other write in this console', async () => {
    const mod = await signIn(MOD2_KEY, 'Nok');
    const res = await form(mod, '/organisations', { csrf: 'not-the-token', name: 'X', kind: 'company' });
    assert.equal(res.status, 403);
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM organisations').get() as unknown as { n: number }).n, 0);
  });

  test('a pledge shows as owed until somebody records the transfer', async () => {
    // The whole point of the split, end to end on the page a partner reads.
    const mod = await signIn(MOD2_KEY, 'Nok');
    await form(mod, '/organisations', { csrf: csrfOf(mod), name: 'Acme', kind: 'company' });
    const orgId = (db.prepare('SELECT id FROM organisations').get() as unknown as { id: string }).id;
    await form(mod, `/organisations/${orgId}/fund`, {
      csrf: csrfOf(mod), questId: 'q-muni', fundedTHB: '50000', perVerifiedTHB: '500', basis: 'signed',
    });

    const owed = await (await app.request('/sponsor', { headers: withCookie(mod) })).text();
    assert.match(owed, /Pledged, not paid/, 'a signed pledge was not shown as unpaid');
    assert.match(owed, /Received/);
    // The label that used to claim delivery the system never tracked.
    assert.doesNotMatch(owed, /Reached hosts/, 'the page still says money reached anybody');

    assert.equal((await form(mod, `/organisations/${orgId}/paid`, {
      csrf: csrfOf(mod), questId: 'q-muni', receivedTHB: '50000',
    })).status, 303);

    const paid = await (await app.request('/sponsor', { headers: withCookie(mod) })).text();
    assert.doesNotMatch(paid, /Pledged, not paid/, 'the page still says money is owed after it arrived');
  });

  test('the ESG page earns the exclusivity sentence, then loses it', async () => {
    // The feature, end to end on the page a filer reads. Two partners fund
    // the same quest and the guarantee has to go for BOTH of them - if it
    // went only for whoever filed second, the platform would be helping the
    // first one double-count against the other.
    const mod = await signIn(MOD2_KEY, 'Nok');
    const fund = async (name: string) => {
      await form(mod, '/organisations', { csrf: csrfOf(mod), name, kind: 'company' });
      const org = db.prepare('SELECT id FROM organisations WHERE name_en = ?')
        .get(name) as unknown as { id: string };
      await form(mod, `/organisations/${org.id}/fund`, {
        csrf: csrfOf(mod), questId: 'q-muni', fundedTHB: '50000', perVerifiedTHB: '500',
      });
      return org.id;
    };

    const acme = await fund('Acme');
    const alone = await (await app.request(`/esg?org=${acme}`, { headers: withCookie(mod) })).text();
    assert.match(alone, /One activity, one filer/);
    // The console opens in Thai, so the Thai sentence is the one on the page.
    assert.match(alone, /เพียงรายเดียว|ไม่มีกิจกรรมที่ผ่านการตรวจ/);

    const beta = await fund('Beta');
    for (const org of [acme, beta]) {
      const page = await (await app.request(`/esg?org=${org}`, { headers: withCookie(mod) })).text();
      assert.doesNotMatch(
        page, /เพียงรายเดียว/,
        'a co-funded quest kept its exclusivity guarantee',
      );
    }
  });

  test('recording a payment needs a token, like every other write here', async () => {
    const mod = await signIn(MOD2_KEY, 'Nok');
    await form(mod, '/organisations', { csrf: csrfOf(mod), name: 'Acme', kind: 'company' });
    const orgId = (db.prepare('SELECT id FROM organisations').get() as unknown as { id: string }).id;
    await form(mod, `/organisations/${orgId}/fund`, {
      csrf: csrfOf(mod), questId: 'q-muni', fundedTHB: '50000', perVerifiedTHB: '500',
    });

    const res = await form(mod, `/organisations/${orgId}/paid`, {
      csrf: 'not-the-token', questId: 'q-muni', receivedTHB: '50000',
    });
    assert.equal(res.status, 403);
    const held = db.prepare('SELECT received_thb AS n FROM org_sponsorships').get() as unknown as { n: number };
    assert.equal(held.n, 0, 'money was recorded by a request with no token');
  });
});

/**
 * The quests page, where a KPI is agreed and read.
 *
 * Not an app screen, on purpose: a target on a traveller's phone puts the
 * next weight a host types under pressure to reach it, which breaks the only
 * measurement on the page. The person who needs the target is the person who
 * enters the number.
 */
describe('quests and their agreed indicator', () => {
  // A moderator on the municipality's own host row, so the scoping rule the
  // write enforces - a moderator agrees indicators on the quests of the host
  // they are signed in AS - has a quest to act on.
  const MOD_KEY = 'chv_KPIAA-KPIBB-KPICC-KPIDD';
  const asModerator = async () => {
    db.prepare("UPDATE hosts SET role = 'moderator', api_key_hash = ? WHERE id = 'h-muni'")
      .run(hashApiKey(MOD_KEY));
    return signIn(MOD_KEY, 'Nok');
  };
  // Local copies: the ones above live inside another describe's scope.
  const post = (token: string, path: string, fields: Record<string, string>) => app.request(path, {
    method: 'POST',
    headers: { ...withCookie(token), 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields),
  });
  const token = (t: string) => __csrfFor(resolveSession(db, t)!);
  const setKpi = (t: string, body: Record<string, string>) =>
    post(t, '/quests/kpi', { csrf: token(t), ...body });

  test('a quest with no indicator is listed, not hidden', async () => {
    // It has not failed a measurement; nobody gave it one. A page that
    // listed only the measured ones would hide the gap on the screen that
    // can close it.
    const lab = await signIn(LAB_KEY, 'Nok');
    const page = await (await app.request('/quests', { headers: withCookie(lab) })).text();
    assert.match(page, /q-lab/);
    assert.match(page, /ยังไม่ได้ตกลงตัวชี้วัด|No indicator agreed/);
  });

  test('another host’s quests are not on this host’s page', async () => {
    const lab = await signIn(LAB_KEY, 'Nok');
    const page = await (await app.request('/quests', { headers: withCookie(lab) })).text();
    assert.doesNotMatch(page, /q-muni/, "another host's quest was listed");
  });

  test('a moderator agrees one, and the page then reads it', async () => {
    const mod = await asModerator();
    assert.equal((await setKpi(mod, {
      questId: 'q-muni', measure: 'verified_submissions', target: '10',
    })).status, 303);

    const page = await (await app.request('/quests', { headers: withCookie(mod) })).text();
    assert.match(page, /งานที่ผู้จัดตรวจแล้ว|Submissions a host verified/);
    // The refusal travels with the figure rather than living in a manual.
    assert.match(page, /ไม่ใช่จำนวนคน|Not people/);
  });

  test('THE PAGE HAS NO FORMULA BOX', async () => {
    // A free-text formula would let "attendees x 3.2 kg CO2e" into a
    // contract, and the console would print the product of a number it
    // measured and a coefficient it has never held.
    const mod = await asModerator();
    const page = await (await app.request('/quests', { headers: withCookie(mod) })).text();
    assert.doesNotMatch(page, /name="formula"/);
    assert.match(page, /ไม่มีช่องสูตรคำนวณโดยตั้งใจ|no formula box/);
  });

  test('a measure a quest cannot carry is refused at the door', async () => {
    const mod = await asModerator();
    await setKpi(mod, { questId: 'q-muni', measure: 'voucher_value_thb', target: '500' });
    const stored = db.prepare("SELECT kpi_measure AS m FROM quests WHERE id = 'q-muni'")
      .get() as unknown as { m: string | null };
    assert.equal(stored.m, null, 'a voucher measure was written onto a quest');
  });

  test('clearing the indicator clears the target with it', async () => {
    // A baseline and a target with nothing to measure them in are two
    // numbers nobody can read.
    const mod = await asModerator();
    await setKpi(mod, { questId: 'q-muni', measure: 'weight_kg', baseline: '10', target: '200' });
    await setKpi(mod, { questId: 'q-muni', measure: '' });
    const stored = db.prepare(
      "SELECT kpi_measure AS m, kpi_baseline AS b, kpi_target AS t FROM quests WHERE id = 'q-muni'",
    ).get() as unknown as { m: string | null; b: number | null; t: number | null };
    assert.deepEqual([stored.m, stored.b, stored.t], [null, null, null]);
  });

  test('a host who cannot moderate gets no form and cannot post one', async () => {
    const lab = await signIn(LAB_KEY, 'Nok');
    const page = await (await app.request('/quests', { headers: withCookie(lab) })).text();
    assert.doesNotMatch(page, /name="measure"/, 'a plain host was shown the form');

    const res = await setKpi(lab, { questId: 'q-lab', measure: 'weight_kg' });
    assert.equal(res.status, 404);
  });

  test('a stale token writes nothing', async () => {
    const mod = await asModerator();
    const res = await post(mod, '/quests/kpi', {
      csrf: 'not-this-session', questId: 'q-muni', measure: 'weight_kg',
    });
    assert.equal(res.status, 403);
    const stored = db.prepare("SELECT kpi_measure AS m FROM quests WHERE id = 'q-muni'")
      .get() as unknown as { m: string | null };
    assert.equal(stored.m, null);
  });

  test('signed out, it is the login redirect like every other page', async () => {
    const res = await app.request('/quests');
    assert.equal(res.status, 303);
    assert.equal(res.headers.get('location'), '/console/login');
  });
});

/**
 * Side A: a file a partner who already files sends in.
 *
 * The danger is not a wrong number. It is a right-looking one: an imported
 * sheet rendered in the statement's clothes would be level 1 evidence dressed
 * as level 3.
 */
describe('reviewing a declared file', () => {
  const MOD_KEY = 'chv_REVAA-REVBB-REVCC-REVDD';
  const asModerator = async () => {
    db.prepare("UPDATE hosts SET role = 'moderator', api_key_hash = ? WHERE id = 'h-muni'")
      .run(hashApiKey(MOD_KEY));
    return signIn(MOD_KEY, 'Nok');
  };
  const send = (t: string, fields: Record<string, string>) => app.request('/review', {
    method: 'POST',
    headers: { ...withCookie(t), 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrf: __csrfFor(resolveSession(db, t)!), ...fields }),
  });

  test('THE PAGE SAYS IT IS NOT A STATEMENT, BEFORE ANY FIGURE', async () => {
    const mod = await asModerator();
    const page = await (await app.request('/review', { headers: withCookie(mod) })).text();
    assert.match(page, /ไม่ใช่เอกสารรับรอง|This is not a statement/);
    assert.match(page, /ไม่มีใครที่ ChivaGo ตรวจสอบ|Nobody at ChivaGo verified/);
    // None of the things that make a statement page look issued.
    assert.doesNotMatch(page, /\/verify\//, 'a review page offered a verify link');
    assert.doesNotMatch(page, /digest/i, 'a review page showed a digest');
  });

  test('it finds a total that its own rows do not add up to', async () => {
    const mod = await asModerator();
    const res = await send(mod, {
      from: '2026-01-01', to: '2026-12-31', statedTotal: '400',
      sheet: 'activity,date,amount,unit\nCleanup,2026-06-15,185,kg\nCleanup B,2026-07-02,90,kg',
    });
    const page = await res.text();
    assert.match(page, /ยอดรวมไม่ตรงกับบรรทัด|Total does not match/);
    assert.match(page, /275/);
  });

  test('it finds rows outside the period the report claims', async () => {
    const mod = await asModerator();
    const page = await (await send(mod, {
      from: '2026-01-01', to: '2026-12-31',
      sheet: 'activity,date\nCleanup,2026-06-15\nOld one,2025-11-02',
    })).text();
    assert.match(page, /อยู่นอกช่วงเวลา|Outside the period/);
  });

  test('a file whose columns cannot be identified is refused, not guessed at', async () => {
    const mod = await asModerator();
    const page = await (await send(mod, {
      from: '2026-01-01', to: '2026-12-31', sheet: 'amount,unit\n185,kg',
    })).text();
    assert.match(page, /อ่านไฟล์ไม่ได้|could not be read/);
    assert.match(page, /activity/);
    assert.doesNotMatch(page, /ข้อสังเกต|Findings/, 'a refused file was reviewed anyway');
  });

  test('a clean file is reported as clean and still not verified', async () => {
    const mod = await asModerator();
    const page = await (await send(mod, {
      from: '2026-01-01', to: '2026-12-31',
      sheet: 'กิจกรรม,วันที่,น้ำหนัก,หน่วย\nเก็บขยะชายหาด,15/06/2026,185,กก',
    })).text();
    assert.match(page, /ไม่พบข้อผิดบนหน้าไฟล์|Nothing wrong on the face/);
    assert.match(page, /ก็ยังเป็นบรรทัดที่ไม่มีใครตรวจสอบ|still a row nobody verified/);
  });

  test('NOTHING FROM THE FILE IS STORED', async () => {
    // An imported sheet sitting in this database would be a second,
    // unverified record of somebody's activity inside a system whose whole
    // claim is that its records are verified.
    const mod = await asModerator();
    const before = db.prepare("SELECT COUNT(*) AS n FROM quest_progress").get() as unknown as { n: number };
    await send(mod, {
      from: '2026-01-01', to: '2026-12-31',
      sheet: 'activity,date,amount\nImported cleanup,2026-06-15,185',
    });
    const after = db.prepare("SELECT COUNT(*) AS n FROM quest_progress").get() as unknown as { n: number };
    assert.equal(after.n, before.n, 'a declared row was written into the database');
    const quests = db.prepare("SELECT COUNT(*) AS n FROM quests WHERE name_en LIKE '%Imported%'")
      .get() as unknown as { n: number };
    assert.equal(quests.n, 0, 'a declared activity became a quest');
  });

  test('a host who cannot moderate cannot reach it at all', async () => {
    const lab = await signIn(LAB_KEY, 'Nok');
    assert.equal((await app.request('/review', { headers: withCookie(lab) })).status, 404);
    assert.equal((await send(lab, { sheet: 'activity,date\nA,2026-06-15' })).status, 404);
  });

  test('a stale token reviews nothing', async () => {
    const mod = await asModerator();
    const res = await app.request('/review', {
      method: 'POST',
      headers: { ...withCookie(mod), 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ csrf: 'not-this-session', sheet: 'activity,date\nA,2026-06-15' }),
    });
    assert.equal(res.status, 403);
  });

  test('signed out, it is the login redirect like every other page', async () => {
    const res = await app.request('/review');
    assert.equal(res.status, 303);
    assert.equal(res.headers.get('location'), '/console/login');
  });
});

/**
 * An assurer's conclusion, on the console and on the public page.
 *
 * Rung four of the ladder. The danger is not a wrong conclusion; it is a
 * conclusion that reads as ChivaGo's own.
 */
describe('recording an independent conclusion', () => {
  const MOD_KEY = 'chv_CSAAA-CSBBB-CSCCC-CSDDD';
  const asModerator = async () => {
    db.prepare("UPDATE hosts SET role = 'moderator', api_key_hash = ? WHERE id = 'h-lab'")
      .run(hashApiKey(MOD_KEY));
    return signIn(MOD_KEY, 'Nok');
  };
  const send = (t: string, path: string, fields: Record<string, string>) => app.request(path, {
    method: 'POST',
    headers: { ...withCookie(t), 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrf: __csrfFor(resolveSession(db, t)!), ...fields }),
  });
  /* The public page is on the server app, not this one, so it is rendered
     here from the same inputs the route hands it. */
  const publicPage = (id: string) =>
    verifyPage('en', readStatement(db, id)!, 'https://example.test', countersignaturesFor(db, id));

  const issueOne = async (t: string) => {
    const year = new Date().getUTCFullYear();
    db.prepare(
      "UPDATE quest_progress SET stage = 'complete', verified_at = ? WHERE quest_id = 'q-lab'",
    ).run(iso(2));
    db.prepare("UPDATE proofs SET reviewed_at = ?, approved = 1, reviewed_by = 'Nok' WHERE quest_id = 'q-lab'")
      .run(iso(2));
    const res = await send(t, '/statement', { from: `${year}-01-01`, to: `${year}-12-31` });
    return /issued=(CG-\d{4}-[0-9A-Z]{6})/.exec(res.headers.get('location') ?? '')?.[1] ?? '';
  };

  test('the digest is taken from the statement, not from the form', async () => {
    const mod = await asModerator();
    const id = await issueOne(mod);
    await send(mod, '/statement/countersign', {
      statementId: id, signerFirm: 'Andaman Assurance', signerName: 'Somsak',
      standard: 'isae3000_limited', opinion: 'unmodified', digest: 'whatever-i-like',
    });
    const stored = db.prepare('SELECT digest FROM statement_countersignatures').get() as
      unknown as { digest: string };
    const real = db.prepare('SELECT digest FROM statements WHERE id = ?').get(id) as
      unknown as { digest: string };
    assert.equal(stored.digest, real.digest);
  });

  test('IT APPEARS ON THE PUBLIC PAGE AS THE FIRM’S CLAIM, NOT OURS', async () => {
    const mod = await asModerator();
    const id = await issueOne(mod);
    await send(mod, '/statement/countersign', {
      statementId: id, signerFirm: 'Andaman Assurance', signerName: 'Somsak',
      standard: 'isae3000_limited', opinion: 'unmodified',
    });

    const page = publicPage(id);
    assert.match(page, /Andaman Assurance/);
    assert.match(page, /ChivaGo did not perform it/);
    assert.match(page, /has not verified the firm/);
    // The one sentence the page must never contain.
    assert.doesNotMatch(page, /this statement is assured/i);
    assert.match(page, /Not covered by the digest above/);
  });

  test('an adverse conclusion is shown as adverse, not softened', async () => {
    const mod = await asModerator();
    const id = await issueOne(mod);
    await send(mod, '/statement/countersign', {
      statementId: id, signerFirm: 'Andaman Assurance', signerName: 'Somsak',
      standard: 'isae3000_reasonable', opinion: 'adverse',
    });
    assert.match(publicPage(id), /Adverse/);
  });

  test('withdrawing keeps it on the page, marked', async () => {
    const mod = await asModerator();
    const id = await issueOne(mod);
    await send(mod, '/statement/countersign', {
      statementId: id, signerFirm: 'Andaman Assurance', signerName: 'Somsak',
      standard: 'other', opinion: 'unmodified',
    });
    const sig = db.prepare('SELECT id FROM statement_countersignatures').get() as
      unknown as { id: string };
    await send(mod, '/statement/countersign/withdraw', { id: sig.id, reason: 'scope changed' });

    const page = publicPage(id);
    assert.match(page, /WITHDRAWN/);
    assert.match(page, /kept on the record because it was once given/);
  });

  test('a statement with nobody’s conclusion shows no panel at all', async () => {
    // An absence of assurance is the normal state of almost every record
    // here; a panel announcing it on each one would read as a defect.
    const mod = await asModerator();
    const id = await issueOne(mod);
    assert.doesNotMatch(publicPage(id), /Independent conclusions/);
  });

  test('A SIGNATURE NEVER GETS INSIDE THE DIGESTED RECORD', async () => {
    // The digest covers the statement body. A conclusion arrives afterwards
    // and cannot be inside what was signed, so it lives on its own endpoint
    // and never on the record.
    const mod = await asModerator();
    const id = await issueOne(mod);
    await send(mod, '/statement/countersign', {
      statementId: id, signerFirm: 'Andaman Assurance', signerName: 'Somsak',
      standard: 'isae3000_limited', opinion: 'modified',
    });
    const statement = readStatement(db, id)!;
    assert.ok(!('countersignatures' in statement), 'a signature got onto the statement object');

    // Recomputed the way an outside verifier has to: the digest covers the
    // BODY, so the id and the digest itself come off first. If a conclusion
    // had crept into the body this would no longer match.
    const { id: unusedId, digest: unusedDigest, ...body } = statement;
    assert.equal(digestOf(body), statement.digest, 'the digest stopped matching its body');
  });

  test('a moderator cannot sign another host’s statement', async () => {
    const mod = await asModerator();
    const id = await issueOne(mod);
    // Sign in as the municipality instead, and aim at the lab's statement.
    db.prepare("UPDATE hosts SET role = 'moderator' WHERE id = 'h-muni'").run();
    const other = await signIn(MUNI_KEY, 'Somsak');
    await send(other, '/statement/countersign', {
      statementId: id, signerFirm: 'X', signerName: 'Y',
      standard: 'other', opinion: 'unmodified',
    });
    const n = db.prepare('SELECT COUNT(*) AS n FROM statement_countersignatures').get() as
      unknown as { n: number };
    assert.equal(n.n, 0, "a conclusion was recorded on another host's statement");
  });

  test('a plain host gets a 404 on both routes', async () => {
    const lab = await signIn(LAB_KEY, 'Nok');
    assert.equal((await send(lab, '/statement/countersign', { statementId: 'x' })).status, 404);
    assert.equal((await send(lab, '/statement/countersign/withdraw', { id: 'x' })).status, 404);
  });
});

/**
 * An organisation declaring it used a statement, on the console and in public.
 *
 * The danger here is the opposite of the countersignature's. A conclusion can
 * read as ChivaGo's own; a declaration can read as a GUARANTEE - that the
 * statement is now spent, that one declaration means one use. It is neither,
 * and these are about the page saying so.
 */
describe('declaring that a statement was used', () => {
  const MOD_KEY = 'chv_USAAA-USBBB-USCCC-USDDD';
  const asModerator = async () => {
    db.prepare("UPDATE hosts SET role = 'moderator', api_key_hash = ? WHERE id = 'h-lab'")
      .run(hashApiKey(MOD_KEY));
    return signIn(MOD_KEY, 'Nok');
  };
  const send = (t: string, path: string, fields: Record<string, string>) => app.request(path, {
    method: 'POST',
    headers: { ...withCookie(t), 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrf: __csrfFor(resolveSession(db, t)!), ...fields }),
  });
  const org = (id: string, en: string, th: string) => {
    db.prepare(
      "INSERT INTO organisations (id, name_en, name_th, kind, created_at) VALUES (?,?,?,'company',?)",
    ).run(id, en, th, iso(1));
    return id;
  };
  /* The public page lives on the server app, so it is rendered here from the
     same inputs the route hands it. */
  const publicPage = (id: string) => verifyPage(
    'en', readStatement(db, id)!, 'https://example.test',
    countersignaturesFor(db, id), usesOf(db, id),
  );

  const issueOne = async (t: string) => {
    const year = new Date().getUTCFullYear();
    db.prepare(
      "UPDATE quest_progress SET stage = 'complete', verified_at = ? WHERE quest_id = 'q-lab'",
    ).run(iso(2));
    db.prepare("UPDATE proofs SET reviewed_at = ?, approved = 1, reviewed_by = 'Nok' WHERE quest_id = 'q-lab'")
      .run(iso(2));
    const res = await send(t, '/statement', { from: `${year}-01-01`, to: `${year}-12-31` });
    return /issued=(CG-\d{4}-[0-9A-Z]{6})/.exec(res.headers.get('location') ?? '')?.[1] ?? '';
  };

  const declare = (t: string, id: string, fields: Record<string, string> = {}) =>
    send(t, '/statement/use', {
      statementId: id, orgId: 'org-siam', kind: 'one_report', reportingYear: '2026', ...fields,
    });

  test('the digest is taken from the statement, not from the form', async () => {
    const mod = await asModerator();
    const id = await issueOne(mod);
    org('org-siam', 'Siam Retail', 'สยามรีเทล');
    await declare(mod, id, { digest: 'whatever-i-like' });
    const stored = db.prepare('SELECT digest FROM statement_uses').get() as
      unknown as { digest: string };
    const real = db.prepare('SELECT digest FROM statements WHERE id = ?').get(id) as
      unknown as { digest: string };
    assert.equal(stored.digest, real.digest);
  });

  test('IT APPEARS AS THE ORGANISATION’S CLAIM, NOT AS A GUARANTEE', async () => {
    const mod = await asModerator();
    const id = await issueOne(mod);
    org('org-siam', 'Siam Retail', 'สยามรีเทล');
    await declare(mod, id);

    const page = publicPage(id);
    assert.match(page, /Siam Retail states it used/);
    assert.match(page, /ChivaGo has not read that report/);
    assert.match(page, /is not saying the use was appropriate/);
    // The word that would borrow a registry's guarantee.
    assert.doesNotMatch(page, /retired/i);
  });

  test('THE PANEL SHOWS ON A STATEMENT NOBODY HAS DECLARED', async () => {
    // Unlike the conclusions panel. An empty list is the case a reader is
    // most likely to misread, so the correction has to be on the page.
    const mod = await asModerator();
    const id = await issueOne(mod);
    const page = publicPage(id);
    assert.match(page, /Nobody has declared using this record/);
    assert.match(page, /does not mean the statement went unused/);
  });

  test('TWO ORGANISATIONS ARE FLAGGED WITHOUT BEING ACCUSED', async () => {
    const mod = await asModerator();
    const id = await issueOne(mod);
    org('org-siam', 'Siam Retail', 'สยามรีเทล');
    org('org-ptt', 'PTT Green', 'ปตท. กรีน');
    await declare(mod, id);
    await declare(mod, id, { orgId: 'org-ptt' });

    const page = publicPage(id);
    assert.match(page, /2 organisations have declared this same record/);
    assert.match(page, /not by itself wrong/);
    assert.doesNotMatch(page, /fraud/i);
  });

  test('one organisation alone is not flagged', async () => {
    const mod = await asModerator();
    const id = await issueOne(mod);
    org('org-siam', 'Siam Retail', 'สยามรีเทล');
    await declare(mod, id);
    assert.doesNotMatch(publicPage(id), /organisations have declared this same record/);
  });

  test('the three kinds of double counting are named on the page', async () => {
    const mod = await asModerator();
    const id = await issueOne(mod);
    const page = publicPage(id);
    assert.match(page, /Double issuance cannot arise here/);
    assert.match(page, /Double claiming at the funding step/);
    assert.match(page, /only made VISIBLE/);
  });

  test('withdrawing keeps it on the page, marked', async () => {
    const mod = await asModerator();
    const id = await issueOne(mod);
    org('org-siam', 'Siam Retail', 'สยามรีเทล');
    await declare(mod, id);
    const u = db.prepare('SELECT id FROM statement_uses').get() as unknown as { id: string };
    await send(mod, '/statement/use/withdraw', { id: u.id, reason: 'report was not filed' });

    const page = publicPage(id);
    assert.match(page, /WITHDRAWN/);
    assert.match(page, /kept because it was once made/);
  });

  test('A DECLARATION NEVER GETS INSIDE THE DIGESTED RECORD', async () => {
    const mod = await asModerator();
    const id = await issueOne(mod);
    org('org-siam', 'Siam Retail', 'สยามรีเทล');
    await declare(mod, id);
    const statement = readStatement(db, id)!;
    assert.ok(!('uses' in statement), 'a declaration got onto the statement object');
    const { id: unusedId, digest: unusedDigest, ...body } = statement;
    assert.equal(digestOf(body), statement.digest, 'the digest stopped matching its body');
  });

  test('an unknown organisation records nothing', async () => {
    const mod = await asModerator();
    const id = await issueOne(mod);
    await declare(mod, id, { orgId: 'org-ghost' });
    const n = db.prepare('SELECT COUNT(*) AS n FROM statement_uses').get() as
      unknown as { n: number };
    assert.equal(n.n, 0);
  });

  test('a blank year is refused rather than stored as a plausible one', async () => {
    const mod = await asModerator();
    const id = await issueOne(mod);
    org('org-siam', 'Siam Retail', 'สยามรีเทล');
    await declare(mod, id, { reportingYear: '' });
    const n = db.prepare('SELECT COUNT(*) AS n FROM statement_uses').get() as
      unknown as { n: number };
    assert.equal(n.n, 0);
  });

  test('a moderator cannot declare against another host’s statement', async () => {
    const mod = await asModerator();
    const id = await issueOne(mod);
    org('org-siam', 'Siam Retail', 'สยามรีเทล');
    db.prepare("UPDATE hosts SET role = 'moderator' WHERE id = 'h-muni'").run();
    const other = await signIn(MUNI_KEY, 'Somsak');
    await declare(other, id);
    const n = db.prepare('SELECT COUNT(*) AS n FROM statement_uses').get() as
      unknown as { n: number };
    assert.equal(n.n, 0, "a declaration was recorded on another host's statement");
  });

  test('a plain host gets a 404 on both routes', async () => {
    const lab = await signIn(LAB_KEY, 'Nok');
    assert.equal((await send(lab, '/statement/use', { statementId: 'x' })).status, 404);
    assert.equal((await send(lab, '/statement/use/withdraw', { id: 'x' })).status, 404);
  });
});

/**
 * Fixing a quest's measurement plan, on the console.
 *
 * The page has said since it was written that an indicator is settled before
 * the project runs. Nothing enforced it. These are about the enforcement and
 * about the one number that makes a lock worth recording.
 */
describe('locking a quest’s measurement plan', () => {
  const MOD_KEY = 'chv_PLNAA-PLNBB-PLNCC-PLNDD';
  const asModerator = async () => {
    db.prepare("UPDATE hosts SET role = 'moderator', api_key_hash = ? WHERE id = 'h-muni'")
      .run(hashApiKey(MOD_KEY));
    return signIn(MOD_KEY, 'Nok');
  };
  const post = (t: string, path: string, fields: Record<string, string>) => app.request(path, {
    method: 'POST',
    headers: { ...withCookie(t), 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrf: __csrfFor(resolveSession(db, t)!), ...fields }),
  });
  const page = async (t: string) =>
    (await app.request('/quests', { headers: withCookie(t) })).text();
  const withKpi = (t: string) =>
    post(t, '/quests/kpi', { questId: 'q-muni', measure: 'verified_submissions', target: '10' });

  test('a quest with no indicator has no plan to fix', async () => {
    const mod = await asModerator();
    await post(mod, '/quests/plan/lock', { questId: 'q-muni' });
    const n = db.prepare('SELECT COUNT(*) AS n FROM quest_plan_locks').get() as
      unknown as { n: number };
    assert.equal(n.n, 0);
  });

  test('THE PAGE SAYS WHEN THE PLAN WAS FIXED AND WHAT HAD HAPPENED FIRST', async () => {
    const mod = await asModerator();
    await withKpi(mod);
    await post(mod, '/quests/plan/lock', { questId: 'q-muni' });
    // The session's locale is Thai, so the short label renders in Thai; the
    // boundary note is printed in both languages on every page.
    const html = await page(mod);
    assert.match(html, /ล็อกก่อนมีผล/);
    assert.match(html, /Validation asks whether the plan was sound/);
    assert.match(html, /ตัวเลขทุกตัวที่แพลตฟอร์มนี้รายงานยังคงตรวจโดยผู้จัดกิจกรรมเช่นเดิม/);
  });

  test('AN AGREED INDICATOR CANNOT BE REWRITTEN BEHIND THE LOCK', async () => {
    // Without this the lock would be a seal on a door that still opens.
    const mod = await asModerator();
    await withKpi(mod);
    await post(mod, '/quests/plan/lock', { questId: 'q-muni' });
    const res = await post(mod, '/quests/kpi', {
      questId: 'q-muni', measure: 'distinct_participants', target: '999',
    });
    // Answered as a message, not a 500: refusing is what the lock is for.
    assert.equal(res.status, 303);
    assert.match(res.headers.get('location') ?? '', /locked%20measurement%20plan/);
    const q = db.prepare("SELECT kpi_measure, kpi_target FROM quests WHERE id = 'q-muni'").get() as
      unknown as { kpi_measure: string; kpi_target: number };
    assert.equal(q.kpi_measure, 'verified_submissions');
    assert.equal(q.kpi_target, 10);
  });

  test('superseding releases it, and both facts stay on the record', async () => {
    const mod = await asModerator();
    await withKpi(mod);
    await post(mod, '/quests/plan/lock', { questId: 'q-muni' });
    await post(mod, '/quests/plan/supersede', { questId: 'q-muni', reason: 'target renegotiated' });

    assert.equal((await post(mod, '/quests/kpi', {
      questId: 'q-muni', measure: 'verified_submissions', target: '25',
    })).status, 303);
    const q = db.prepare("SELECT kpi_target FROM quests WHERE id = 'q-muni'").get() as
      unknown as { kpi_target: number };
    assert.equal(q.kpi_target, 25);

    const row_ = db.prepare('SELECT superseded_reason FROM quest_plan_locks').get() as
      unknown as { superseded_reason: string };
    assert.equal(row_.superseded_reason, 'target renegotiated');
  });

  test('a moderator cannot lock another host’s quest', async () => {
    const mod = await asModerator();
    await post(mod, '/quests/plan/lock', { questId: 'q-lab' });
    const n = db.prepare('SELECT COUNT(*) AS n FROM quest_plan_locks').get() as
      unknown as { n: number };
    assert.equal(n.n, 0, "a plan was locked on another host's quest");
  });

  test('a plain host gets a 404 on both routes', async () => {
    const lab = await signIn(LAB_KEY, 'Nok');
    assert.equal((await post(lab, '/quests/plan/lock', { questId: 'q-lab' })).status, 404);
    assert.equal((await post(lab, '/quests/plan/supersede', { questId: 'q-lab' })).status, 404);
  });

  test('THE PLAN CELL STAYS IN THE PLAN COLUMN ON A QUEST WITH NO INDICATOR', async () => {
    // The row spans the five measurement columns and keeps its own plan cell.
    // A colspan one short silently slides the standing under "Of target".
    // Counted from the row itself rather than assumed: the first version of
    // this test did `span + 2`, and broke the day a column was added - which
    // is the change it most needs to survive.
    const lab = await signIn(LAB_KEY, 'Nok');
    const html = await page(lab);
    const headers = (/<thead>[\s\S]*?<\/thead>/.exec(html)?.[0].match(/<th>/g) ?? []).length;
    const row = /<tr>(?:(?!<\/tr>)[\s\S])*?colspan="\d+"[\s\S]*?<\/tr>/.exec(html)?.[0] ?? '';
    const cells = [...row.matchAll(/<td(?:\s+colspan="(\d+)")?/g)]
      .reduce((n, m) => n + (m[1] ? Number(m[1]) : 1), 0);
    assert.ok(headers > 0 && cells > 0, 'the test found no table to measure');
    assert.equal(cells, headers, 'the no-indicator row does not fill the header row');
  });

  test('an unlocked quest reads as not fixed, which is not a fail', async () => {
    const mod = await asModerator();
    await withKpi(mod);
    const html = await page(mod);
    assert.match(html, /ยังไม่ได้ล็อก/);
    assert.doesNotMatch(html, /ล็อกก่อนมีผล/);
  });
});

/**
 * A partner standing down from a claim, on the console.
 *
 * The danger here is the opposite of every other record in this console. Most
 * of them risk claiming too much. This one risks being USED to claim too
 * much — by the partner who gains from it, or by an operator reaching for
 * whichever undo is nearest.
 */
describe('a partner standing down from a claim', () => {
  const MOD3_KEY = 'chv_ADJAA-ADJBB-ADJCC-ADJDD';
  beforeEach(() => {
    db.prepare('INSERT INTO hosts (id,name,type,role,api_key_hash,created_at) VALUES (?,?,?,?,?,?)').run(
      'h-adj-mod', 'ChivaGo', 'platform', 'moderator', hashApiKey(MOD3_KEY), new Date().toISOString());
  });

  const form = (t: string, path: string, fields: Record<string, string>) => app.request(path, {
    method: 'POST',
    headers: { ...withCookie(t), 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrf: __csrfFor(resolveSession(db, t)!), ...fields }),
  });
  const page = async (t: string) =>
    (await app.request('/organisations', { headers: withCookie(t) })).text();

  /** Two organisations funding the same quest, which is the case that matters. */
  const twoFunders = async (t: string) => {
    const ids: string[] = [];
    for (const [name, th] of [['Siam Retail', 'สยามรีเทล'], ['PTT Green', 'ปตท. กรีน']]) {
      await form(t, '/organisations', { name, nameTh: th, kind: 'company' });
    }
    for (const r of db.prepare('SELECT id FROM organisations ORDER BY name_en').all() as
      unknown as { id: string }[]) {
      ids.push(r.id);
      await form(t, `/organisations/${r.id}/fund`, {
        questId: 'q-muni', fundedTHB: '50000', perVerifiedTHB: '500',
      });
    }
    return { ptt: ids[0]!, siam: ids[1]! };
  };

  const standing = () => db.prepare(
    'SELECT id, org_id FROM claim_adjustments WHERE resumed_at IS NULL AND voided_at IS NULL',
  ).all() as unknown as { id: string; org_id: string }[];

  test('a moderator records one and the row says who stood down', async () => {
    const mod = await signIn(MOD3_KEY, 'Nok');
    const { ptt } = await twoFunders(mod);
    assert.equal((await form(mod, `/organisations/${ptt}/stand-down`, {
      questId: 'q-muni', reason: 'reported by our parent company',
    })).status, 303);

    const html = await page(mod);
    assert.match(html, /Stood down/);
    assert.match(html, /reported by our parent company/);
    assert.equal(standing().length, 1);
  });

  test('THE PAGE SAYS THIS IS NOT AN ARTICLE 6 ADJUSTMENT', async () => {
    // The name is borrowed. A reader who knows what it means under a treaty
    // must not take this for one.
    const mod = await signIn(MOD3_KEY, 'Nok');
    const { ptt } = await twoFunders(mod);
    await form(mod, `/organisations/${ptt}/stand-down`, { questId: 'q-muni' });
    const html = await page(mod);
    assert.match(html, /borrowed from Article 6/);
    assert.match(html, /Nothing of the kind happens here/);
    assert.match(html, /removes a claim; it never creates one/);
  });

  test('AN ORGANISATION THAT DOES NOT FUND THE QUEST RECORDS NOTHING', async () => {
    const mod = await signIn(MOD3_KEY, 'Nok');
    await form(mod, '/organisations', { name: 'Bystander', nameTh: 'ผู้ไม่เกี่ยว', kind: 'company' });
    const id = (db.prepare("SELECT id FROM organisations WHERE name_en = 'Bystander'").get() as
      unknown as { id: string }).id;
    const res = await form(mod, `/organisations/${id}/stand-down`, { questId: 'q-muni' });
    assert.equal(res.status, 303);
    assert.match(res.headers.get('location') ?? '', /error=/);
    assert.equal(standing().length, 0);
  });

  test('RESUMING AND VOIDING ARE SEPARATE ENDPOINTS', async () => {
    // They mean different things and only one is retroactive. A shared
    // endpoint would put that difference in a form field, which is where it
    // would eventually be set wrong.
    const mod = await signIn(MOD3_KEY, 'Nok');
    const { ptt } = await twoFunders(mod);
    await form(mod, `/organisations/${ptt}/stand-down`, { questId: 'q-muni' });
    const id = standing()[0]!.id;

    await form(mod, `/organisations/${ptt}/resume`, { id, reason: 'claiming again for FY2027' });
    const after = db.prepare('SELECT resumed_at, voided_at FROM claim_adjustments WHERE id = ?')
      .get(id) as unknown as { resumed_at: string | null; voided_at: string | null };
    assert.notEqual(after.resumed_at, null);
    assert.equal(after.voided_at, null, 'resuming voided the record');
  });

  test('A CRAFTED ID CANNOT REACH ANOTHER PARTNER’S CONCESSION', async () => {
    const mod = await signIn(MOD3_KEY, 'Nok');
    const { ptt, siam } = await twoFunders(mod);
    await form(mod, `/organisations/${ptt}/stand-down`, { questId: 'q-muni' });
    const id = standing()[0]!.id;

    // Aim PTT's adjustment id at Siam's path.
    await form(mod, `/organisations/${siam}/void-adjustment`, { id, reason: 'not mine to void' });
    const after = db.prepare('SELECT voided_at FROM claim_adjustments WHERE id = ?')
      .get(id) as unknown as { voided_at: string | null };
    assert.equal(after.voided_at, null, "one partner voided another partner's concession");
  });

  test('a row nobody stood down from offers only standing down', async () => {
    const mod = await signIn(MOD3_KEY, 'Nok');
    await twoFunders(mod);
    const html = await page(mod);
    assert.match(html, /Stand down/);
    assert.doesNotMatch(html, /Claim again/);
  });

  test('a plain host gets a 404 on all three routes', async () => {
    const lab = await signIn(LAB_KEY, 'Nok');
    for (const path of ['stand-down', 'resume', 'void-adjustment']) {
      assert.equal((await form(lab, `/organisations/x/${path}`, { questId: 'q-lab' })).status, 404);
    }
  });
});

/**
 * The indicator layer, meeting a real file.
 *
 * Stage two of `docs/60`. The rule was built first against facts a test
 * supplied; this is where the facts have to come from somebody's spreadsheet
 * and somebody's answers, and two things about the design only show up here.
 */
describe('where a partner wants to file their figure', () => {
  const MOD_KEY = 'chv_PLCAA-PLCBB-PLCCC-PLCDD';
  const asModerator = async () => {
    db.prepare("UPDATE hosts SET role = 'moderator', api_key_hash = ? WHERE id = 'h-muni'")
      .run(hashApiKey(MOD_KEY));
    return signIn(MOD_KEY, 'Nok');
  };
  const send = (t: string, fields: Record<string, string>) => app.request('/review', {
    method: 'POST',
    headers: { ...withCookie(t), 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrf: __csrfFor(resolveSession(db, t)!), ...fields }),
  });
  const year = new Date().getUTCFullYear();
  const sheet = (unit = 'kg') =>
    `activity,date,amount,unit\nBeach clean,${year}-06-01,42,${unit}\n`;
  const review = (t: string, over: Record<string, string> = {}) => send(t, {
    from: `${year}-01-01`, to: `${year}-12-31`, sheet: sheet(), ...over,
  });

  test('a first paste reviews the file and answers no question nobody asked', async () => {
    const mod = await asModerator();
    const page = await (await review(mod)).text();
    assert.match(page, /Where they want to file it/);
    // The panel is offered; no verdict is rendered until it is asked for.
    assert.doesNotMatch(page, /Cannot go here|One answer missing/);
  });

  test('THE MEASURE IS READ OFF THEIR UNIT COLUMN AND SHOWN', async () => {
    // Shown, because if it read the wrong one the answer below is about the
    // wrong kind of figure and a moderator has to be able to see that.
    const mod = await asModerator();
    const page = await (await review(mod, { carry: '1' })).text();
    assert.match(page, /Read from their unit column as/);
    assert.match(page, /Weight recorded on approved proofs|น้ำหนักที่บันทึก/);
  });

  test('A UNIT THIS PLATFORM DOES NOT MEASURE IS SAID, NOT GUESSED AT', async () => {
    const mod = await asModerator();
    const page = await (await review(mod, { sheet: sheet('tonnes'), carry: '1' })).text();
    assert.match(page, /not one this platform measures|ไม่ใช่หน่วยที่แพลตฟอร์มนี้วัด/);
    assert.doesNotMatch(page, /Cannot go here/, 'it assessed a figure it could not identify');
  });

  test('IT ASKS WHOSE WASTE IT WAS BEFORE IT ANSWERS', async () => {
    const mod = await asModerator();
    const page = await (await review(mod, { carry: '1' })).text();
    assert.match(page, /One answer missing|ยังขาดคำตอบหนึ่งข้อ/);
    assert.match(page, /Ask them|ถามเขาว่า/);
    // The console opens in Thai, so the question renders in Thai.
    assert.match(page, /วัสดุนั้นถูกทิ้งโดยการดำเนินงานของคุณเอง หรือโดยผู้อื่น/);
  });

  test('THE FINDING ARRIVES WITH THE CLAUSE IT RESTS ON', async () => {
    // A refusal a customer cannot go and check is an opinion, and this page
    // sells the opposite.
    const mod = await asModerator();
    const page = await (await review(mod, {
      carry: '1', materialOrigin: 'third_party', organisationRole: 'manager',
    })).text();
    assert.match(page, /Cannot go here|ใส่ตรงนี้ไม่ได้/);
    assert.match(page, /anything that the holder discards/);
    assert.match(page, /GRI 306: Waste 2020/);
    assert.match(page, /Read 2026-09-26 by/);
    assert.match(page, /Not checked:/);
    // A reading one day old is one day, not "1 days". This text goes in
    // front of a customer beside a finding they are being asked to act on.
    assert.doesNotMatch(page, /\b1 days ago\b/);
    // And it says where the figure could honestly go instead.
    assert.match(page, /3-3-e-ii/);
  });

  test('the same file from the company’s own operations is not refused', async () => {
    const mod = await asModerator();
    const page = await (await review(mod, {
      carry: '1', materialOrigin: 'own_operations', organisationRole: 'generator',
      insideBoundary: 'yes',
    })).text();
    assert.match(page, /Only if stated|ได้ ถ้าระบุเงื่อนไข/);
    assert.doesNotMatch(page, /Cannot go here/);
  });

  test('A PASTED FILE IS NEVER ASKED HOW IT WAS MEASURED', async () => {
    // The thing stage two found. `measuredBy` looked like a fourth question
    // and is not one — asking would invite the answer "verified", which the
    // banner at the top of this page exists to refuse.
    const mod = await asModerator();
    const page = await (await review(mod, { carry: '1' })).text();
    assert.doesNotMatch(page, /name="measuredBy"/, 'the page offered to be told it was verified');
    assert.match(page, /is not asked here and cannot be answered here|ที่นี่ไม่ถามว่าตัวเลขวัดมาอย่างไร/);
  });

  test('AND THE DECLARED BASIS STILL REACHES THE CONDITIONS', async () => {
    // Not asking must not mean forgetting: a permitted placement still has
    // to say the figure was self-declared.
    const mod = await asModerator();
    const page = await (await review(mod, {
      carry: '1', materialOrigin: 'own_operations', organisationRole: 'generator',
      insideBoundary: 'yes',
    })).text();
    assert.match(page, /Self-declared and not verified by anybody here|แจ้งเอง/);
  });

  test('a line nobody here has studied is not silence', async () => {
    const mod = await asModerator();
    const page = await (await review(mod, {
      carry: '1', framework: 'ifrs_s', line: 'S2-29a', materialOrigin: 'third_party',
    })).text();
    assert.match(page, /Not examined|ยังไม่ได้ตรวจสอบคู่นี้/);
    assert.match(page, /gap in what ChivaGo has studied|ช่องว่างของสิ่งที่ ChivaGo ศึกษา/);
  });

  test('the placement panel never turns the page into a statement', async () => {
    const mod = await asModerator();
    const page = await (await review(mod, {
      carry: '1', materialOrigin: 'own_operations', organisationRole: 'generator',
      insideBoundary: 'yes',
    })).text();
    assert.doesNotMatch(page, /\/verify\//, 'a review page offered a verify link');
    assert.match(page, /not a ruling and not an assurance opinion|ไม่ใช่คำวินิจฉัย/);
  });

  test('a plain host still gets a 404', async () => {
    const lab = await signIn(LAB_KEY, 'Nok');
    assert.equal((await send(lab, { carry: '1' })).status, 404);
  });
});

/**
 * The indicator rule, run before anything is measured.
 *
 * Stage three of `docs/60`. The same rule the review page runs on a pasted
 * file; what changes is WHEN, and on this side the answer is while the plan
 * can still change.
 */
describe('checking where a quest will be reported, before it runs', () => {
  const MOD_KEY = 'chv_PFLAA-PFLBB-PFLCC-PFLDD';
  const asModerator = async () => {
    db.prepare("UPDATE hosts SET role = 'moderator', api_key_hash = ? WHERE id = 'h-muni'")
      .run(hashApiKey(MOD_KEY));
    return signIn(MOD_KEY, 'Nok');
  };
  const post = (t: string, path: string, fields: Record<string, string>) => app.request(path, {
    method: 'POST',
    headers: { ...withCookie(t), 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrf: __csrfFor(resolveSession(db, t)!), ...fields }),
  });
  const page = async (t: string) => (await app.request('/quests', { headers: withCookie(t) })).text();
  const intend = (t: string, over: Record<string, string> = {}) => post(t, '/quests/intent', {
    questId: 'q-muni', framework: 'gri', line: '306-3',
    materialOrigin: 'unknown', organisationRole: 'unknown', insideBoundary: 'unknown', ...over,
  });
  const withWeightKpi = (t: string) =>
    post(t, '/quests/kpi', { questId: 'q-muni', measure: 'weight_kg', target: '400' });

  test('A BEACH CLEANUP AIMED AT 306-3 IS REFUSED BEFORE IT RUNS', async () => {
    const mod = await asModerator();
    await withWeightKpi(mod);
    await intend(mod, { materialOrigin: 'third_party' });
    const html = await page(mod);
    // The console opens in Thai.
    assert.match(html, /ใส่ตรงนี้ไม่ได้/);
    assert.match(html, /anything that the holder discards/);
    assert.match(html, /3-3-e-ii/);
  });

  test('told nothing, it asks whose waste it will be', async () => {
    const mod = await asModerator();
    await withWeightKpi(mod);
    await intend(mod);
    const html = await page(mod);
    assert.match(html, /ยังขาดคำตอบหนึ่งข้อ/);
    assert.match(html, /วัสดุนั้นถูกทิ้งโดยการดำเนินงานของคุณเอง หรือโดยผู้อื่น/);
  });

  test('A LINE WITH NO KPI BEHIND IT SAYS THE KPI IS MISSING', async () => {
    // The more useful of the two findings: it is how a moderator learns the
    // quest has nothing to place yet.
    const mod = await asModerator();
    await intend(mod, { materialOrigin: 'third_party' });
    const html = await page(mod);
    assert.match(html, /ยังไม่มีตัวชี้วัดให้วาง/);
    assert.doesNotMatch(html, /ใส่ตรงนี้ไม่ได้/, 'it refused a figure nobody agreed to produce');
  });

  test('HOW THE FIGURE WAS MEASURED IS NEVER ASKED ON THIS SIDE EITHER', async () => {
    // The mirror of stage two: here every figure is verified by the host.
    const mod = await asModerator();
    const html = await page(mod);
    assert.doesNotMatch(html, /name="measuredBy"/);
  });

  test('THE LINE IS TYPED, NEVER PICKED FROM A LIST', async () => {
    // docs/60's one "never": a dropdown of codes lets somebody pick the
    // nearest one, which designs out the question of whether it belongs.
    const mod = await asModerator();
    const html = await page(mod);
    assert.match(html, /<input name="line" type="text"/);
    assert.doesNotMatch(html, /<select name="line"/);
  });

  test('A LOCKED PLAN DOES NOT STOP THE LINE BEING CORRECTED', async () => {
    // The point of finding it early is acting on it.
    const mod = await asModerator();
    await withWeightKpi(mod);
    await post(mod, '/quests/plan/lock', { questId: 'q-muni' });
    await intend(mod, { materialOrigin: 'third_party' });
    const res = await intend(mod, { line: '3-3', materialOrigin: 'third_party' });
    assert.equal(res.status, 303);
    assert.doesNotMatch(res.headers.get('location') ?? '', /error=/);
    const line = (db.prepare("SELECT indicator_line FROM quests WHERE id = 'q-muni'").get() as
      unknown as { indicator_line: string }).indicator_line;
    assert.equal(line, '3-3');
  });

  test('a moderator cannot place another host’s quest', async () => {
    const mod = await asModerator();
    await post(mod, '/quests/intent', {
      questId: 'q-lab', framework: 'gri', line: '306-3', materialOrigin: 'third_party',
    });
    const r = db.prepare("SELECT indicator_line FROM quests WHERE id = 'q-lab'").get() as
      unknown as { indicator_line: string | null };
    assert.equal(r.indicator_line, null, "another host's quest was placed");
  });

  test('a line that is not a line is refused with a message', async () => {
    const mod = await asModerator();
    const res = await intend(mod, { line: '' });
    assert.match(res.headers.get('location') ?? '', /error=/);
  });

  test('a plain host gets a 404', async () => {
    const lab = await signIn(LAB_KEY, 'Nok');
    assert.equal((await post(lab, '/quests/intent', { questId: 'q-lab' })).status, 404);
  });
});

/**
 * The second rule, reaching both console pages without a line of console code.
 *
 * Both pages call `assess(INDICATOR_RULES, …)`. A rule is data plus one
 * function; if adding one needed a page change, the machinery was wrong.
 */
describe('the GHG Category 5 rule, on both sides', () => {
  const MOD_KEY = 'chv_GHGAA-GHGBB-GHGCC-GHGDD';
  const asModerator = async () => {
    db.prepare("UPDATE hosts SET role = 'moderator', api_key_hash = ? WHERE id = 'h-muni'")
      .run(hashApiKey(MOD_KEY));
    return signIn(MOD_KEY, 'Nok');
  };
  const post = (t: string, path: string, fields: Record<string, string>) => app.request(path, {
    method: 'POST',
    headers: { ...withCookie(t), 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrf: __csrfFor(resolveSession(db, t)!), ...fields }),
  });
  const year = new Date().getUTCFullYear();

  test('SIDE A: A PASTED FILE AIMED AT “CAT 5” IS REFUSED', async () => {
    const mod = await asModerator();
    const html = await (await post(mod, '/review', {
      from: `${year}-01-01`, to: `${year}-12-31`,
      sheet: `activity,date,amount,unit\nBeach clean,${year}-06-01,42,kg\n`,
      carry: '1', framework: 'ghg_protocol', line: 'cat 5', materialOrigin: 'third_party',
    })).text();
    assert.match(html, /ใส่ตรงนี้ไม่ได้/);
    assert.match(html, /Scope 3 Category 5/, 'the canonical line was not shown');
    assert.match(html, /owned or controlled operations/);
  });

  test('SIDE B: A QUEST AIMED AT CATEGORY 5 IS REFUSED BEFORE IT RUNS', async () => {
    const mod = await asModerator();
    await post(mod, '/quests/kpi', { questId: 'q-muni', measure: 'weight_kg', target: '400' });
    await post(mod, '/quests/intent', {
      questId: 'q-muni', framework: 'ghg_protocol', line: 'Category 5',
      materialOrigin: 'third_party', organisationRole: 'unknown', insideBoundary: 'unknown',
    });
    const html = await (await app.request('/quests', { headers: withCookie(mod) })).text();
    assert.match(html, /ใส่ตรงนี้ไม่ได้/);
    assert.match(html, /never deducted from them|ห้ามนำไปหักออก/);
  });
});

/**
 * The third rule on both sides, again with no console code.
 *
 * The interesting part is side A: a pasted sheet in "people" has to be read
 * as a headcount before 413-1 can speak to it at all.
 */
describe('the GRI 413-1 rule, on both sides', () => {
  const MOD_KEY = 'chv_SOCAA-SOCBB-SOCCC-SOCDD';
  const asModerator = async () => {
    db.prepare("UPDATE hosts SET role = 'moderator', api_key_hash = ? WHERE id = 'h-muni'")
      .run(hashApiKey(MOD_KEY));
    return signIn(MOD_KEY, 'Nok');
  };
  const post = (t: string, path: string, fields: Record<string, string>) => app.request(path, {
    method: 'POST',
    headers: { ...withCookie(t), 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrf: __csrfFor(resolveSession(db, t)!), ...fields }),
  });
  const year = new Date().getUTCFullYear();

  test('SIDE A: A SHEET IN “PEOPLE” AIMED AT 413-1 IS REFUSED, WITH NOTHING ASKED', async () => {
    const mod = await asModerator();
    const html = await (await post(mod, '/review', {
      from: `${year}-01-01`, to: `${year}-12-31`,
      sheet: `activity,date,amount,unit\nBeach clean,${year}-06-01,412,people\n`,
      carry: '1', framework: 'gri', line: '413-1',
    })).text();
    assert.match(html, /ใส่ตรงนี้ไม่ได้/);
    assert.match(html, /Percentage of operations with implemented local community engagement/);
    // Nothing is put to the customer, because no answer would change it.
    assert.doesNotMatch(html, /ถามเขาว่า|Ask them/);
  });

  test('SIDE B: A QUEST COUNTED IN PEOPLE AND AIMED AT 413-1 IS REFUSED BEFORE IT RUNS', async () => {
    const mod = await asModerator();
    await post(mod, '/quests/kpi', { questId: 'q-muni', measure: 'distinct_participants', target: '400' });
    await post(mod, '/quests/intent', {
      questId: 'q-muni', framework: 'gri', line: '413-1',
      materialOrigin: 'unknown', organisationRole: 'unknown', insideBoundary: 'unknown',
    });
    const html = await (await app.request('/quests', { headers: withCookie(mod) })).text();
    assert.match(html, /ใส่ตรงนี้ไม่ได้/);
    assert.match(html, /GRI 413-1/);
  });
});

/**
 * An operator's inquiries page. docs/61, stage two.
 *
 * Any signed-in host is an operator for their own listings. The danger is
 * one operator reaching another's listing or inquiry through an id in a form,
 * and a reply being read as a confirmation.
 */
describe('an operator answering inquiries', () => {
  const post = (t: string, path: string, fields: Record<string, string>) => app.request(path, {
    method: 'POST',
    headers: { ...withCookie(t), 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrf: __csrfFor(resolveSession(db, t)!), ...fields }),
  });
  const page = async (t: string) => (await app.request('/inquiries', { headers: withCookie(t) })).text();
  const addBoat = (t: string, over: Record<string, string> = {}) => post(t, '/listings', {
    kind: 'tour', titleEn: 'Longtail to Koh Taen', titleTh: 'เรือหางยาวไปเกาะแตน',
    whereLabel: 'Thong Krut pier', licenceNo: '31/01234', ...over,
  });
  const listingId = (hostId: string) =>
    (db.prepare('SELECT id FROM listings WHERE operator_id = ?').get(hostId) as unknown as { id: string }).id;
  const inquire = (lId: string, userId = 'u-ana') => {
    db.prepare('INSERT OR IGNORE INTO users (id, display_name, created_at) VALUES (?,?,?)')
      .run(userId, userId, new Date().toISOString());
    const future = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
    return sendInquiry(db, { listingId: lId, userId, forDate: future, partySize: 2, message: 'Saturday?' });
  };

  test('any signed-in host reaches the page, which says an inquiry is not a booking', async () => {
    const lab = await signIn(LAB_KEY, 'Nok');
    const html = await page(lab);
    assert.match(html, /ไม่ใช่การจอง/);
    assert.match(html, /ไม่ได้ให้เบอร์โทรหรืออีเมล/);
  });

  test('A TOUR WITHOUT A LICENCE IS REFUSED WITH A SENTENCE, NOT A CONSTRAINT ERROR', async () => {
    const lab = await signIn(LAB_KEY, 'Nok');
    const res = await addBoat(lab, { licenceNo: '' });
    assert.equal(res.status, 303);
    assert.match(decodeURIComponent(res.headers.get('location') ?? ''), /Department of Tourism licence number/);
    const n = db.prepare('SELECT COUNT(*) AS n FROM listings').get() as unknown as { n: number };
    assert.equal(n.n, 0);
  });

  test('an operator adds a listing and it appears with its licence shown as stated', async () => {
    const lab = await signIn(LAB_KEY, 'Nok');
    await addBoat(lab);
    const html = await page(lab);
    assert.match(html, /เรือหางยาวไปเกาะแตน/);
    assert.match(html, /31\/01234/);
    assert.match(html, /ตามที่คุณระบุ/);
  });

  test('A WAITING INQUIRY SHOWS HOW LONG IS LEFT, AND THE REPLY SAYS IT CONFIRMS NOTHING', async () => {
    const lab = await signIn(LAB_KEY, 'Nok');
    await addBoat(lab);
    inquire(listingId('h-lab'));
    const html = await page(lab);
    assert.match(html, /รอคุณตอบ · 1/);
    assert.match(html, /เหลืออีก/);
    assert.match(html, /การตอบไม่ใช่การยืนยันการจอง/);
  });

  test('answering closes it and notifies the traveller', async () => {
    const lab = await signIn(LAB_KEY, 'Nok');
    await addBoat(lab);
    const i = inquire(listingId('h-lab'));
    const res = await post(lab, `/inquiries/${i.id}/answer`, { answer: 'Yes, 8am.', quoteTHB: '2400' });
    assert.equal(res.status, 303);
    assert.doesNotMatch(res.headers.get('location') ?? '', /error=/);
    const html = await page(lab);
    assert.match(html, /รอคุณตอบ · 0/);
    assert.match(html, /2,400 THB/);
    const n = db.prepare("SELECT COUNT(*) AS n FROM notifications WHERE user_id = 'u-ana'").get() as
      unknown as { n: number };
    assert.equal(n.n, 1);
  });

  test('A QUOTE THAT IS NOT WHOLE BAHT IS REFUSED BEFORE IT REACHES THE RECORD', async () => {
    const lab = await signIn(LAB_KEY, 'Nok');
    await addBoat(lab);
    const i = inquire(listingId('h-lab'));
    const res = await post(lab, `/inquiries/${i.id}/answer`, { answer: 'ok', quoteTHB: '12.5' });
    assert.match(decodeURIComponent(res.headers.get('location') ?? ''), /whole baht/);
    const r = db.prepare('SELECT state FROM inquiries WHERE id = ?').get(i.id) as unknown as { state: string };
    assert.equal(r.state, 'sent', 'a malformed quote still answered the inquiry');
  });

  test('ANOTHER OPERATOR CANNOT ANSWER, DECLINE OR PAUSE SOMEBODY ELSE’S', async () => {
    const lab = await signIn(LAB_KEY, 'Nok');
    await addBoat(lab);
    const lId = listingId('h-lab');
    const i = inquire(lId);
    const muni = await signIn(MUNI_KEY, 'Somsak');
    await post(muni, `/inquiries/${i.id}/answer`, { answer: 'I am not them' });
    await post(muni, `/inquiries/${i.id}/decline`, { reason: 'nope' });
    await post(muni, `/listings/${lId}/active`, { active: '0' });
    const r = db.prepare('SELECT state FROM inquiries WHERE id = ?').get(i.id) as unknown as { state: string };
    assert.equal(r.state, 'sent', "another operator acted on this inquiry");
    const l = db.prepare('SELECT active FROM listings WHERE id = ?').get(lId) as unknown as { active: number };
    assert.equal(l.active, 1, "another operator paused this listing");
    // And they do not see it at all.
    assert.doesNotMatch(await page(muni), /Saturday\?/);
  });

  test('a decline closes it without an answer body being required', async () => {
    const lab = await signIn(LAB_KEY, 'Nok');
    await addBoat(lab);
    const i = inquire(listingId('h-lab'));
    await post(lab, `/inquiries/${i.id}/decline`, {});
    const r = db.prepare('SELECT state FROM inquiries WHERE id = ?').get(i.id) as unknown as { state: string };
    assert.equal(r.state, 'declined');
  });

  test('THE PAGE NEVER CALLS A REPLY A CONFIRMATION OR A BOOKING', async () => {
    const lab = await signIn(LAB_KEY, 'Nok');
    await addBoat(lab);
    const i = inquire(listingId('h-lab'));
    await post(lab, `/inquiries/${i.id}/answer`, { answer: 'Yes' });
    const html = (await page(lab)).toLowerCase();
    assert.doesNotMatch(html, /confirmed|ยืนยันแล้ว|จองแล้ว/);
  });
});

describe('an operator account (docs/62)', () => {
  // A business signed up to answer travellers' questions. Its login reaches
  // its listings and its questions, and nothing that verifies work, moves
  // sponsors' money, speaks publicly or shows somebody's emergency.
  const OP_KEY = 'chv_OPERA-OPERB-OPERC-OPERD';
  const addOperator = () =>
    db.prepare('INSERT INTO hosts (id,name,type,api_key_hash,created_at) VALUES (?,?,?,?,?)').run(
      'op-boat', 'Thong Krut Boat Co-op', 'operator', hashApiKey(OP_KEY), new Date().toISOString());
  const post = (token: string, path: string, form: Record<string, string>) => {
    const session = resolveSession(db, token)!;
    return app.request(path, {
      method: 'POST',
      headers: { ...withCookie(token), 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ csrf: __csrfFor(session), ...form }),
    });
  };

  test('AN OPERATOR OPENS ON ITS QUESTIONS, NOT ON A REVIEW QUEUE', async () => {
    addOperator();
    const op = await signIn(OP_KEY);
    const res = await app.request('/', { headers: withCookie(op) });
    assert.equal(res.status, 303);
    assert.equal(res.headers.get('location'), '/console/inquiries');
  });

  test('AN OPERATOR CANNOT OPEN THE SOS DESK, THE QUEUE, ANY ESG PAGE OR A STATEMENT', async () => {
    addOperator();
    const op = await signIn(OP_KEY);
    for (const path of [
      '/sos', '/history', '/proof/p-muni', '/pending', '/esg', '/statement', '/sponsor',
      '/evidence', '/quests', '/stories', '/review', '/organisations', '/reviews',
    ]) {
      const res = await app.request(path, { headers: withCookie(op) });
      assert.equal(res.status, 403, `${path} answered an operator`);
      assert.match(await res.text(), /cannot review volunteer work|ไม่สามารถตรวจงานอาสา/, path);
    }
  });

  test('NOR DECIDE ON WORK, ISSUE A STATEMENT OR ACKNOWLEDGE AN SOS, EVEN WITH A VALID TOKEN', async () => {
    addOperator();
    const op = await signIn(OP_KEY);
    assert.equal((await post(op, '/decide', { proofId: 'p-muni', decision: 'approve' })).status, 403);
    assert.equal((await post(op, '/statement', { from: '2026-01-01', to: '2026-12-31' })).status, 403);
    assert.equal((await post(op, '/sos/any-alert/acknowledge', {})).status, 403);
    // Refused before anything was written, not after.
    const progress = db.prepare("SELECT verified_at FROM quest_progress WHERE quest_id = 'q-muni'").get() as
      { verified_at: string | null };
    assert.equal(progress.verified_at, null);
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM statements').get() as { n: number }).n, 0);
  });

  test('its console is its questions: the nav names nothing else, and the badge counts questions', async () => {
    addOperator();
    const op = await signIn(OP_KEY);
    const res = await app.request('/inquiries', { headers: withCookie(op) });
    assert.equal(res.status, 200);
    const page = await res.text();
    const nav = /<nav class="nav">([\s\S]*?)<\/nav>/.exec(page)?.[1] ?? '';
    assert.deepEqual([...nav.matchAll(/href="([^"]+)"/g)].map((m) => m[1]), ['/console/inquiries', '/console/logout']);
    assert.match(page, /\/console\/inquiries\/waiting/);
    assert.doesNotMatch(page, /\/console\/pending/, 'it polls a queue it cannot open');
    assert.match(page, /id="notify-me"/);
  });

  test('an operator lists, and the count it polls is the questions waiting on it', async () => {
    addOperator();
    const op = await signIn(OP_KEY);
    const listed = await post(op, '/listings', {
      kind: 'tour', titleEn: 'Longtail to Koh Taen', titleTh: 'เรือหางยาวไปเกาะแตน',
      whereLabel: 'Thong Krut pier', licenceNo: '31/01234', fromTHB: '',
    });
    assert.equal(listed.status, 303);
    const listing = db.prepare("SELECT id FROM listings WHERE operator_id = 'op-boat'").get() as { id: string };
    assert.ok(listing, 'the listing was not created');

    const waiting = async () =>
      (await (await app.request('/inquiries/waiting', { headers: withCookie(op) })).json()) as { pending: number };
    assert.deepEqual(await waiting(), { pending: 0 });
    sendInquiry(db, {
      listingId: listing.id, userId: 'u1', partySize: 2, message: 'Two of us, Saturday?',
      forDate: new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10),
    });
    assert.deepEqual(await waiting(), { pending: 1 });
  });

  test('A HOST THAT IS NOT AN OPERATOR KEEPS THE WHOLE CONSOLE', async () => {
    const muni = await signIn(MUNI_KEY);
    assert.equal((await app.request('/', { headers: withCookie(muni) })).status, 200);
    assert.equal((await app.request('/sos', { headers: withCookie(muni) })).status, 200);
    const page = await (await app.request('/inquiries', { headers: withCookie(muni) })).text();
    assert.match(page, /\/console\/sos/);
    assert.match(page, /\/console\/pending/);
    assert.doesNotMatch(page, /id="notify-me"/);
  });
});
