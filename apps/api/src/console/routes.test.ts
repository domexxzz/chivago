import { strict as assert } from 'node:assert';
import { test, describe, beforeEach } from 'node:test';

import { openTestDb, type DB } from '../db.ts';
import { hashApiKey, resolveSession, SESSION_COOKIE } from '../host-auth.ts';
import { checkIn } from '../checkin-service.ts';
import {
  moderationQueue, reportReview, reviewsFor, writeReview,
} from '../place-review-service.ts';
import { pendingBatches } from '../batch-service.ts';
import { applyMovement, ensureWallet, getBalances } from '../wallet-service.ts';
import { consoleRoutes, __csrfFor } from './routes.ts';

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
    const session = { token: muni, hostId: 'h-muni', hostName: '', reviewer: null, role: 'host' as const, expiresAt: '' };

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
    __csrfFor({ token, hostId: 'h-muni', hostName: '', reviewer: null, role: 'host' as const, expiresAt: '' });

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
});

describe('the statement draft with a period that is not a date', () => {
  test('a thirteenth month is a 400, not a 500', async () => {
    const lab = await signIn(LAB_KEY);
    const res = await app.request('/statement?from=2026-13-01&to=2026-13-31', { headers: withCookie(lab) });
    assert.equal(res.status, 400);
  });
});
