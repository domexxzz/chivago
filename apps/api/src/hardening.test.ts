import { strict as assert } from 'node:assert';
import { test, describe, before } from 'node:test';

/**
 * Edges a deep read found, over HTTP.
 *
 * Every test here answers a request that used to get the wrong status: a
 * 500 for a client mistake, a 200 for a claim the server could not stand
 * behind, a 403 that could be walked around by leaving a field out. They
 * drive the real app through the real middleware, like account-routes.test.
 */

delete process.env.CHIVAGO_OPEN_IDENTITY;
process.env.CHIVAGO_DB = ':memory:';
process.env.CHIVAGO_HOST_SECRET = 'test-host-secret';

const { app, db } = await import('./server.ts');
const { readCookie } = await import('./host-auth.ts');
const { getAir, CROSS_CHECK_TOLERANCE } = await import('./air.ts');
type AirSources = import('./air.ts').AirSources;
const { openTestDb } = await import('./db.ts');
const { issueStatement } = await import('./statement-service.ts');

const json = async (res: Response) => (await res.json()) as { ok: boolean; data?: any; code?: string; error?: string };

let key: string;
const auth = () => ({ 'x-chivago-device-key': key });

const post = (path: string, body?: unknown, headers: Record<string, string> = {}) =>
  app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...auth(), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const put = (path: string, body: unknown) =>
  app.request(path, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', ...auth() },
    body: JSON.stringify(body),
  });

before(async () => {
  const res = await json(await app.request('/devices', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.9' },
    body: JSON.stringify({ label: 'hardening phone' }),
  }));
  assert.equal(res.ok, true);
  key = res.data.deviceKey;
  // Content for the routes that need a place or a quest to exist.
  const now = new Date().toISOString();
  db.prepare(
    `INSERT OR IGNORE INTO hosts (id,name,type,created_at) VALUES ('h-a','Host A','ngo',?), ('h-b','Host B','hotel',?)`,
  ).run(now, now);
  db.prepare(
    `INSERT OR IGNORE INTO quests (id,code,name_en,name_th,where_label,duration,reward_points,
       host_id,kind,lat,lng,geofence_radius_m) VALUES ('q-a','QA','Quest A','x','Chaweng','45 min',150,'h-a','today',9.5357,100.0617,250)`,
  ).run();
});

describe('an SOS with no fix is recorded as no fix', () => {
  test('no coordinates means null coordinates and a label that says so - not Bophut', async () => {
    const res = await json(await post('/sos', { note: 'no gps' }));
    assert.equal(res.ok, true);
    assert.equal(res.data.lat, null);
    assert.equal(res.data.lng, null);
    assert.match(res.data.locationLabel, /Position unknown/);
    assert.equal(res.data.lastPositionAt, null, 'no fix, so no time a fix was taken');
  });

  test('the public page says the phone could not say where they are', async () => {
    const alert = (await json(await app.request('/sos', { headers: auth() }))).data;
    const token = String(alert.shareUrl).split('/').pop();
    const page = await (await app.request(`/sos/live/${token}`)).text();
    assert.match(page, /has not been able to say/);
    assert.doesNotMatch(page, /Open in Maps/);
    // And a later fix still updates it: the alert was not stuck without one.
    const upd = await json(await post('/sos/position', { lat: 9.5, lng: 100.0 }));
    assert.equal(upd.ok, true);
    assert.equal(upd.data.alert.lat, 9.5);
    await app.request('/sos', { method: 'DELETE', headers: auth() });
  });

  test('a fix that is not a number is not a fix either', async () => {
    const res = await json(await post('/sos', { lat: 'nine', lng: {} }));
    assert.equal(res.ok, true);
    assert.equal(res.data.lat, null);
    await app.request('/sos', { method: 'DELETE', headers: auth() });
  });
});

describe('the machine verification path must name its host', () => {
  const secret = { 'x-host-secret': 'test-host-secret' };

  test('leaving hostId out is refused, not treated as "any host"', async () => {
    const raw = await post('/internal/verify', { userId: 'x', questId: 'q-a', proofId: 'p', approved: true }, secret);
    assert.equal(raw.status, 400);
    assert.equal((await json(raw)).code, 'HOST_REQUIRED');
  });

  test('naming a host that does not own the quest is still refused', async () => {
    const raw = await post('/internal/verify', { userId: 'x', questId: 'q-a', proofId: 'p', approved: true, hostId: 'h-b' }, secret);
    assert.equal(raw.status, 403);
  });

  test('an unknown rejection reason is a 400, not a stored key nobody can render', async () => {
    const raw = await post('/internal/verify', {
      userId: 'x', questId: 'q-a', proofId: 'p', approved: false, hostId: 'h-a', reason: '__proto__',
    }, secret);
    assert.equal(raw.status, 400);
    assert.equal((await json(raw)).code, 'INVALID_REASON');
  });
});

describe('a client mistake is a 400 with a name, never a 500', () => {
  test('a review body that is not text', async () => {
    const raw = await post('/places/chaweng/reviews', { rating: 4, body: { text: 'hi' } });
    assert.equal(raw.status, 400);
    assert.equal((await json(raw)).code, 'INVALID_BODY');
  });

  test('a report note that is not text', async () => {
    const raw = await post('/reviews/nope/report', { reason: 'abusive', note: ['x'] });
    assert.equal(raw.status, 400);
    assert.equal((await json(raw)).code, 'INVALID_NOTE');
  });

  test('an appeal whose message is not text is "too short", not a crash', async () => {
    const raw = await post('/reviews/nope/appeal', { message: 12345678901 });
    assert.equal(raw.status, 400);
    assert.equal((await json(raw)).code, 'APPEAL_TOO_SHORT');
  });

  test('photo metadata that is not JSON', async () => {
    const form = new FormData();
    form.append('photo', new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], { type: 'image/jpeg' }), 'a.jpg');
    form.append('meta', '{not json');
    const raw = await app.request('/quests/q-a/proof', { method: 'POST', headers: auth(), body: form });
    assert.equal(raw.status, 400);
    assert.equal((await json(raw)).code, 'INVALID_META');
  });

  test('a profile whose purposes are not a list', async () => {
    const raw = await put('/profile', { purposes: 'wellness' });
    assert.equal(raw.status, 400);
    assert.equal((await json(raw)).code, 'INVALID_PROFILE');
  });

  test('a profile that is not an object', async () => {
    const raw = await put('/profile', 'nope');
    assert.equal(raw.status, 400);
  });

  test('a malformed cookie is a signed-out request, not an exception', () => {
    assert.equal(readCookie('chivago_host=%E0%A4%A; other=1', 'chivago_host'), '%E0%A4%A');
    assert.equal(readCookie('chivago_host=abc%20def', 'chivago_host'), 'abc def');
  });
});

describe('the air cross-check is finally applied', () => {
  const live = { aqi: 38, pm25: 5.2, provenance: 'live' as const, source: 'model', observedAt: '2026-09-01T00:00:00.000Z' };

  test('a ground station that disagrees by a category downgrades the reading to estimated', async () => {
    const tdb = openTestDb();
    const sources: AirSources = {
      fetchLive: async () => live,
      fetchGround: async () => live.aqi + CROSS_CHECK_TOLERANCE + 1,
    };
    const out = await getAir(tdb, 9.5357, 100.0617, 42, sources);
    assert.equal(out.provenance, 'estimated');
    assert.match(out.source, /diverges/);
  });

  test('a station that agrees leaves it live, and a station that is down changes nothing', async () => {
    const tdb = openTestDb();
    const agree = await getAir(tdb, 9.5357, 100.0617, 42, { fetchLive: async () => live, fetchGround: async () => 40 });
    assert.equal(agree.provenance, 'live');
    const tdb2 = openTestDb();
    const down = await getAir(tdb2, 9.5357, 100.0617, 42, { fetchLive: async () => live, fetchGround: async () => null });
    assert.equal(down.provenance, 'live');
  });

  test('the station is asked once per window, however many places are scored', async () => {
    const tdb = openTestDb();
    let asked = 0;
    const sources: AirSources = { fetchLive: async () => live, fetchGround: async () => { asked += 1; return 40; } };
    for (const [lat, lng] of [[9.5357, 100.0617], [9.4693, 100.0446], [9.4179, 99.9433]]) {
      await getAir(tdb, lat!, lng!, 42, sources);
    }
    assert.equal(asked, 1);
  });

  test('a cross-check that throws degrades nothing', async () => {
    const tdb = openTestDb();
    const out = await getAir(tdb, 9.5357, 100.0617, 42, {
      fetchLive: async () => live,
      fetchGround: async () => { throw new Error('air4thai down'); },
    });
    assert.equal(out.provenance, 'live');
  });
});

describe('the second signal reaches the service through the route', () => {
  // Caught live, not by the unit tests: the route parsed lat and lng, dropped
  // accuracy and the mock flag on the floor, and the service checked nothing.
  before(() => {
    db.prepare(
      `INSERT OR IGNORE INTO places (id, name_en, name_th, short, layer, lat, lng, meta,
         blurb_en, blurb_th, tags, safety_label_en, safety_label_th,
         crowd_density, aqi, safety_index, walkability)
       VALUES ('p-signal','Signal Beach','x','Sig','Green',9.5357,100.0617,'Beach','x','x','[]',
               'Patrolled','x',2,40,7,8)`,
    ).run();
  });

  test('a check-in that says it is mocked is refused at the route', async () => {
    const raw = await post('/places/p-signal/checkin', { lat: 9.5357, lng: 100.0617, accuracyM: 8, mocked: true });
    assert.equal(raw.status, 403);
    assert.equal((await json(raw)).code, 'MOCK_LOCATION');
  });

  test('a check-in whose fix is wider than the fence is refused at the route', async () => {
    const raw = await post('/places/p-signal/checkin', { lat: 9.5357, lng: 100.0617, accuracyM: 900 });
    assert.equal(raw.status, 403);
    assert.equal((await json(raw)).code, 'FIX_TOO_COARSE');
  });
});

describe('a statement is checkable by anyone', () => {
  // The evidence layer's public half (docs/31): the record a hotel prints an
  // id from has to open for a stranger with no account, no key and no reason
  // to trust the hotel.
  let issued: { id: string; digest: string };

  before(() => {
    const at = '2026-08-14T04:00:00.000Z';
    db.prepare("INSERT OR IGNORE INTO users (id, display_name, created_at) VALUES ('u-stmt','u-stmt',?)").run(at);
    db.prepare(
      `INSERT OR IGNORE INTO quests (id,code,name_en,name_th,where_label,duration,reward_points,
         host_id,kind,lat,lng,geofence_radius_m)
       VALUES ('q-b','QB','Quest B','x','Chaweng','45 min',150,'h-b','today',9.5357,100.0617,120)`,
    ).run();
    db.prepare(
      `INSERT OR IGNORE INTO quest_progress (user_id, quest_id, stage, joined_at, arrived_at,
         proof_submitted_at, verified_at) VALUES ('u-stmt','q-b','complete',?,?,?,?)`,
    ).run(at, at, at, at);
    issued = issueStatement(
      db, 'h-b', { from: '2026-07-01', to: '2026-09-30' }, 'Nok', new Date('2026-10-01T02:00:00.000Z'),
    );
  });

  test('the JSON needs no key, carries the digest, and names nobody', async () => {
    const res = await app.request(`/statements/${issued.id}`);
    assert.equal(res.status, 200);
    const body = await json(res);
    assert.equal(body.data.digest, issued.digest);
    assert.equal(body.data.host.name, 'Host B');
    assert.equal(body.data.verified, 1);
    assert.doesNotMatch(JSON.stringify(body), /u-stmt/, 'a traveller id reached a public record');
  });

  test('the page is the same record for a person, with the digest in full', async () => {
    const res = await app.request(`/verify/${issued.id}`);
    assert.equal(res.status, 200);
    const page = await res.text();
    assert.match(page, new RegExp(issued.digest));
    assert.match(page, /Host B/);
    assert.match(page, /does not replace HCMI, CHSB or CF-Hotels/, 'the hotel refusal, on the public page');
  });

  test('an id nobody issued is a 404 that says how to re-read the id', async () => {
    const page = await app.request('/verify/CG-2026-000000');
    assert.equal(page.status, 404);
    assert.match(await page.text(), /no I, L, O or U/);
    const api = await app.request('/statements/CG-2026-000000');
    assert.equal(api.status, 404);
    assert.equal((await json(api)).code, 'NO_STATEMENT');
  });

  test('the traveller route is not public', async () => {
    const anon = await app.request('/me/statements');
    assert.equal(anon.status, 401, 'whose statements, without a device?');
    const mine = await json(await app.request('/me/statements', { headers: auth() }));
    assert.equal(mine.ok, true);
    assert.deepEqual(mine.data.statements, [], 'this device has verified nothing');
  });
});
