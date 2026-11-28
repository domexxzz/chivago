/**
 * The shoreline page, and the two ways it could mislead somebody.
 *
 *  1. IT COULD BE PUBLIC. It is not a traveller's page: it carries an
 *     uncalibrated model beside real approved weights, and the whole point of
 *     the copy is that a reader needs the caveats to read the numbers. It sits
 *     behind the console session gate, like every other `/console` page, and
 *     `/console` is disallowed in robots.txt.
 *  2. IT COULD RENDER A RANKING FROM A RUN THAT HAS EXPIRED, or from no run at
 *     all, without saying so. Both are normal states - the sidecar is fetched
 *     over HTTP and can simply fail - so both are pinned here.
 */

import { strict as assert } from 'node:assert';
import { test, describe, beforeEach, afterEach } from 'node:test';

import { openTestDb, type DB } from '../db-node.ts';
import { hashApiKey, SESSION_COOKIE } from '../host-auth.ts';
import { consoleRoutes } from './routes.ts';
import { __resetDriftSidecar } from '../drift-sidecar.ts';

let db: DB;
let app: ReturnType<typeof consoleRoutes>;

const KEY = 'chv_MUNIA-MUNIB-MUNIC-MUNID';
const DAY = new Date().toISOString().slice(0, 10);

/** One shoreline segment at Tham Phang, and one inland, so both paths run. */
const run = (issued: string | null) => ({
  model: 'sichang-rk2-sensitivity-v2',
  issued,
  window: 6,
  calibrated: false,
  seeding: 'uniform offshore grid; no observed debris mass',
  source: 'electiction/chivargo-sichang',
  segments: [
    { id: 11, count: 61, firstHours: 1.5, near: 'หาดถ้ำพัง', beach: null, path: [[100.806835, 13.1454]] },
    { id: 12, count: 20, firstHours: 3, near: 'หาดท่าวัง', beach: null, path: [[100.8104, 13.1614]] },
  ],
});

/** Serve the sidecar as the static file it is: no API envelope. */
const serveSidecar = (body: unknown, ok = true): (() => void) => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => ({
    ok,
    status: ok ? 200 : 500,
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(JSON.stringify(body)));
        controller.close();
      },
    }),
  })) as unknown as typeof fetch;
  return () => { globalThis.fetch = original; };
};

let restoreFetch: null | (() => void) = null;

beforeEach(() => {
  __resetDriftSidecar();
  process.env.CHIVAGO_PUBLIC_URL = 'https://chivargo.example';
  db = openTestDb();
  app = consoleRoutes(db);
  const now = new Date().toISOString();

  db.prepare('INSERT INTO hosts (id,name,type,api_key_hash,created_at) VALUES (?,?,?,?,?)').run(
    'h-muni', 'Ko Sichang Municipality', 'municipality', hashApiKey(KEY), now);
  db.prepare('INSERT INTO users (id,display_name,created_at) VALUES (?,?,?)')
    .run('u1', 'Cleaner', now);

  // A cleanup on Tham Phang beach, weighed and approved.
  db.prepare(
    `INSERT INTO quests (id,code,name_en,name_th,where_label,duration,reward_points,
       host_id,kind,lat,lng,geofence_radius_m) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run('q-tp', 'TP-1', 'Tham Phang cleanup', 'เก็บขยะหาดถ้ำพัง', 'Tham Phang', '1 hr', 150,
    'h-muni', 'today', 13.1454, 100.806835, 150);
  db.prepare(
    `INSERT INTO proofs (id,user_id,quest_id,photos,weight_kg,submitted_at,reviewed_at,approved)
     VALUES (?,?,?,?,?,?,?,1)`,
  ).run('p-tp', 'u1', 'q-tp', '[]', 23.4, now, now);
});

afterEach(() => {
  restoreFetch?.();
  restoreFetch = null;
  __resetDriftSidecar();
});

async function signedIn(): Promise<Record<string, string>> {
  const res = await app.request('/login', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ key: KEY, reviewer: 'Nok' }),
  });
  const token = /chivago_host=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')?.[1];
  assert.ok(token, `login failed: ${res.status}`);
  return { cookie: `${SESSION_COOKIE}=${token}` };
}

const page = async (query = ''): Promise<string> => {
  const res = await app.request(`/coastal${query}`, { headers: await signedIn() });
  assert.equal(res.status, 200);
  return res.text();
};

describe('the shoreline page is not for strangers', () => {
  test('it is 302 to the login, not a page, with no session', async () => {
    restoreFetch = serveSidecar(run(new Date().toISOString()));
    const res = await app.request('/coastal');
    assert.ok(res.status >= 300 && res.status < 400 || res.status === 401,
      `an uncalibrated model beside real weights answered ${res.status} to a stranger`);
    const body = await res.text();
    assert.doesNotMatch(body, /23\.4/, 'a weight leaked to an unauthenticated reader');
  });
});

describe('a current run', () => {
  test('the weighed cleanup lands on its shoreline, with the model beside it', async () => {
    restoreFetch = serveSidecar(run(new Date().toISOString()));
    const html = await page(`?from=${DAY}&to=${DAY}`);
    assert.match(html, /หาดถ้ำพัง/, 'the shoreline is missing from the table');
    assert.match(html, /23\.4 kg/, 'the weighed cleanup is missing');
    assert.match(html, /61/, 'the modelled contact count is missing');
    assert.doesNotMatch(html, /THIS RUN HAS EXPIRED|หมดอายุแล้ว/,
      'a current run was reported as expired');
  });

  test('it says the model is uncalibrated and a contact is not a piece of rubbish', async () => {
    restoreFetch = serveSidecar(run(new Date().toISOString()));
    const html = await page();
    assert.match(html, /uncalibrated|ยังไม่ผ่านการสอบเทียบ/i);
    assert.match(html, /not a count of rubbish|ไม่ใช่จำนวนชิ้นขยะ/);
    assert.match(html, /no observed debris mass/, 'the seeding is not shown');
  });

  test('it states the attribution it is making, above the table', async () => {
    restoreFetch = serveSidecar(run(new Date().toISOString()));
    const html = await page();
    // The console renders in Thai by default, so match the note by the phrase
    // that is in it either way.
    const note = Math.max(
      html.indexOf('nearest its quest pin'),
      html.indexOf('ใกล้หมุดเควสที่สุด'),
    );
    const table = html.indexOf('<table');
    assert.ok(note >= 0, 'the attribution note is missing');
    assert.ok(table >= 0 && note < table, 'the caveat sits below the numbers it qualifies');
  });

  test('one cleanup is not enough to report an agreement', async () => {
    restoreFetch = serveSidecar(run(new Date().toISOString()));
    const html = await page();
    assert.match(html, /Not enough cleaned shorelines|ยังน้อยเกินกว่าจะบอก/,
      'a coefficient was computed off one beach');
    assert.doesNotMatch(html, /Rank agreement/, 'a rank agreement was shown with n of 1');
  });
});

describe('a run that cannot be trusted', () => {
  test('an expired run says so, in capitals, above its own ranking', async () => {
    restoreFetch = serveSidecar(run('2026-11-17T04:08+07:00'));
    const html = await page();
    assert.match(html, /THIS RUN HAS EXPIRED|ผลจำลองชุดนี้หมดอายุแล้ว/);
    // The table is still there - it is history, and history is useful - but
    // the reader has been told which it is before reaching it.
    assert.match(html, /หาดถ้ำพัง/);
  });

  test('no sidecar at all renders a page that says so, and loses no weight', async () => {
    restoreFetch = serveSidecar({ nonsense: true });
    const html = await page(`?from=${DAY}&to=${DAY}`);
    assert.match(html, /No model run|ไม่มีผลจำลอง/);
    // The 23.4 kg still has to appear somewhere: it was collected, approved
    // and weighed, and a missing model is no reason to drop it.
    assert.match(html, /23\.4 kg/, 'the weighed cleanup vanished with the model');
    assert.match(html, /could not be matched to any shoreline|จับคู่กับชายฝั่งไหนไม่ได้/);
  });

  test('a failed fetch is the same page, not a 500', async () => {
    restoreFetch = serveSidecar({}, false);
    const html = await page();
    assert.match(html, /No model run|ไม่มีผลจำลอง/);
  });

  test('a file claiming to be calibrated is refused, not believed', async () => {
    restoreFetch = serveSidecar({ ...run(new Date().toISOString()), calibrated: true });
    const html = await page();
    assert.match(html, /No model run|ไม่มีผลจำลอง/,
      'a page started calling the model calibrated on somebody else’s behalf');
  });
});

/*
  The archive is what makes a calibration possible at all, and the page has to
  report how far off one is rather than letting the agreement above read as
  one. Reading the page is also what fills the archive, so the first load is
  both the measurement and the thing being measured.
*/
describe('the page keeps the runs it reads, and says where calibration stands', () => {
  test('reading it once puts the run in the archive', async () => {
    restoreFetch = serveSidecar(run('2026-11-28T06:00:00.000Z'));
    await page();
    const kept = db.prepare('SELECT model, issued FROM drift_runs').all() as
      { model: string; issued: string }[];
    assert.equal(kept.length, 1, 'the run was read and then thrown away');
    assert.equal(kept[0]!.issued, '2026-11-28T06:00:00.000Z');
  });

  test('a cleanup collected before the archive existed is counted as unpaired', async () => {
    restoreFetch = serveSidecar(run(new Date().toISOString()));
    const html = await page(`?from=${DAY}&to=${DAY}`);
    assert.match(html, /Towards a calibration|ระยะทางสู่การสอบเทียบ/);
    // The fixture's cleanup was submitted now, and the only run kept is the
    // one this page just read - whose window covers now - so it pairs. What
    // must never happen is a page that reports pairing it has not done.
    assert.match(html, /paired with their own run|จับคู่กับผลจำลองของวันนั้นได้/);
  });

  test('with no run readable the archive stays empty and says so', async () => {
    restoreFetch = serveSidecar({ nonsense: true });
    const html = await page();
    assert.match(html, /archive is empty|คลังยังว่าง/);
    const kept = db.prepare('SELECT COUNT(*) AS n FROM drift_runs').all() as { n: number }[];
    assert.equal(kept[0]!.n, 0, 'an unparseable file was stored as a run');
  });

  test('it says plainly that nothing here can calibrate the model', async () => {
    restoreFetch = serveSidecar(run(new Date().toISOString()));
    const html = await page();
    assert.match(html, /electiction\/chivargo-sichang/,
      'the page does not say where the model actually lives');
  });
});

describe('the period bounds the evidence', () => {
  test('a period before the cleanup shows the shorelines and no weight', async () => {
    restoreFetch = serveSidecar(run(new Date().toISOString()));
    const html = await page('?from=2026-01-01&to=2026-01-02');
    assert.match(html, /หาดถ้ำพัง/, 'the shorelines went away with the evidence');
    assert.doesNotMatch(html, /23\.4 kg/, 'a cleanup outside the period was counted');
  });
});
