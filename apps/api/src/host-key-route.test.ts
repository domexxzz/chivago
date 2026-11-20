/**
 * POST /internal/host-key - a new console key for a host, on a live server.
 *
 * On Cloudflare there is no file to run `add-host.ts` against, so a lost key
 * (docs/62) could not be replaced, and a host on Ko Sichang could not be
 * handed one. The operator calls this with the deployment's host secret; the
 * new key is answered once, the old key stops working, and every console
 * session signed in with the old key ends.
 */
import { strict as assert } from 'node:assert';
import { beforeEach, describe, test } from 'node:test';

process.env.CHIVAGO_DB = ':memory:';
process.env.CHIVAGO_HOST_SECRET = 'test-operator-secret';
delete process.env.CHIVAGO_OPEN_IDENTITY;

const { app, db } = await import('./server-node.ts');
const { hashApiKey, login } = await import('./host-auth.ts');

const OLD_KEY = 'chv_OLDKE-YOLDK-EYOLD-KEYAA';
const ask = (body: unknown, secret: string | null = 'test-operator-secret') =>
  app.request('/internal/host-key', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(secret === null ? {} : { 'x-host-secret': secret }) },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  db.prepare("DELETE FROM quests WHERE id = 'q-move'").run();
  db.prepare('DELETE FROM host_sessions').run();
  db.prepare("DELETE FROM hosts WHERE id IN ('h-sc','h-admin')").run();
  db.prepare('INSERT INTO hosts (id,name,type,api_key_hash,created_at) VALUES (?,?,?,?,?)')
    .run('h-sc', 'Koh Sichang host', 'community', hashApiKey(OLD_KEY), new Date().toISOString());
  db.prepare("INSERT INTO hosts (id,name,type,role,created_at) VALUES ('h-admin','Admin','admin','admin',?)")
    .run(new Date().toISOString());
});

describe('who may ask', () => {
  test('no secret and a wrong secret are refused alike', async () => {
    assert.equal((await ask({ hostId: 'h-sc' }, null)).status, 403);
    assert.equal((await ask({ hostId: 'h-sc' }, 'wrong')).status, 403);
  });

  test('an unknown host is a 404', async () => {
    assert.equal((await ask({ hostId: 'h-nobody' })).status, 404);
  });

  test('an admin is refused: admins sign in with a username and password, not a key', async () => {
    assert.equal((await ask({ hostId: 'h-admin' })).status, 400);
  });
});

describe('what it does', () => {
  test('answers a new key once, and only that key signs in', async () => {
    const res = await ask({ hostId: 'h-sc' });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('cache-control') ?? '', /no-store/);
    const body = await res.json() as { data: { hostId: string; name: string; key: string } };
    assert.equal(body.data.hostId, 'h-sc');
    assert.equal(body.data.name, 'Koh Sichang host');
    assert.ok(body.data.key.length >= 20);
    assert.ok(login(db, body.data.key, 'Nok'), 'the new key signs in');
    assert.equal(login(db, OLD_KEY, 'Nok'), null, 'the old key no longer does');
    const stored = (db.prepare("SELECT api_key_hash FROM hosts WHERE id='h-sc'").get() as { api_key_hash: string }).api_key_hash;
    assert.ok(!stored.includes(body.data.key), 'only a hash is kept');
  });

  test('every session signed in with the old key ends', async () => {
    assert.ok(login(db, OLD_KEY, 'Nok'));
    const before = (db.prepare("SELECT COUNT(*) AS n FROM host_sessions WHERE host_id='h-sc'").get() as { n: number }).n;
    assert.ok(before > 0);
    await ask({ hostId: 'h-sc' });
    const after = (db.prepare("SELECT COUNT(*) AS n FROM host_sessions WHERE host_id='h-sc'").get() as { n: number }).n;
    assert.equal(after, 0);
  });

  test('two calls give two different keys, and the second replaces the first', async () => {
    const first = ((await (await ask({ hostId: 'h-sc' })).json()) as { data: { key: string } }).data.key;
    const second = ((await (await ask({ hostId: 'h-sc' })).json()) as { data: { key: string } }).data.key;
    assert.notEqual(first, second);
    assert.equal(login(db, first, 'Nok'), null);
    assert.ok(login(db, second, 'Nok'));
  });
});

/*
  The verifier is the place on the map, not the ChivarGo team: the beach's
  clean-up is approved by the municipality, the food trail by the restaurant.
  POST /internal/hosts makes a host for a real place and answers its key once;
  POST /internal/quests/host hands a quest, and every proof still waiting on
  it, to that host.
*/
const post = (path: string, body: unknown, secret: string | null = 'test-operator-secret') =>
  app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(secret === null ? {} : { 'x-host-secret': secret }) },
    body: JSON.stringify(body),
  });

describe('a host for a real place', () => {
  beforeEach(() => { db.prepare("DELETE FROM hosts WHERE id = 'h-sc-muni'").run(); });

  test('needs the secret', async () => {
    assert.equal((await post('/internal/hosts', { id: 'h-sc-muni', name: 'Muni', type: 'municipality' }, null)).status, 403);
  });

  test('is created with a key answered once, and the key signs in', async () => {
    const res = await post('/internal/hosts', { id: 'h-sc-muni', name: 'เทศบาลตำบลเกาะสีชัง', type: 'municipality' });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('cache-control') ?? '', /no-store/);
    const { data } = await res.json() as { data: { hostId: string; key: string } };
    assert.equal(data.hostId, 'h-sc-muni');
    assert.ok(login(db, data.key, 'Somchai'));
  });

  test('never overwrites a host that exists, and refuses an unknown type', async () => {
    assert.equal((await post('/internal/hosts', { id: 'h-sc', name: 'Renamed', type: 'community' })).status, 409);
    assert.equal((db.prepare("SELECT name FROM hosts WHERE id='h-sc'").get() as { name: string }).name, 'Koh Sichang host');
    assert.equal((await post('/internal/hosts', { id: 'h-sc-muni', name: 'X', type: 'admin' })).status, 400);
    assert.equal((await post('/internal/hosts', { id: 'Bad Id!', name: 'X', type: 'community' })).status, 400);
  });
});

describe('moving a quest to the place that verifies it', () => {
  beforeEach(() => {
    db.prepare("DELETE FROM proofs WHERE quest_id = 'q-move'").run();
    db.prepare("DELETE FROM quests WHERE id = 'q-move'").run();
    db.prepare("DELETE FROM hosts WHERE id = 'h-sc-muni'").run();
    db.prepare("INSERT INTO hosts (id,name,type,created_at) VALUES ('h-sc-muni','Muni','municipality',?)").run(new Date().toISOString());
    db.prepare(
      `INSERT INTO quests (id,code,name_en,name_th,where_label,duration,reward_points,host_id,kind,lat,lng,geofence_radius_m)
       VALUES ('q-move','Q-MOVE','Trash Hero','ฮีโร่','Beach','45 min',0,'h-sc','today',13.15,100.81,120)`,
    ).run();
  });

  test('needs the secret, a real quest and a real host', async () => {
    assert.equal((await post('/internal/quests/host', { questId: 'q-move', hostId: 'h-sc-muni' }, 'wrong')).status, 403);
    assert.equal((await post('/internal/quests/host', { questId: 'q-nope', hostId: 'h-sc-muni' })).status, 404);
    assert.equal((await post('/internal/quests/host', { questId: 'q-move', hostId: 'h-nope' })).status, 404);
    assert.equal((await post('/internal/quests/host', { questId: 'q-move', hostId: 'h-admin' })).status, 400);
  });

  test('the quest and its waiting proofs now belong to the new host', async () => {
    const res = await post('/internal/quests/host', { questId: 'q-move', hostId: 'h-sc-muni' });
    assert.equal(res.status, 200);
    const { data } = await res.json() as { data: { questId: string; from: string; to: string } };
    assert.deepEqual(data, { questId: 'q-move', from: 'h-sc', to: 'h-sc-muni' });
    assert.equal((db.prepare("SELECT host_id FROM quests WHERE id='q-move'").get() as { host_id: string }).host_id, 'h-sc-muni');
  });
});
