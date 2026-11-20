import { strict as assert } from 'node:assert';
import { beforeEach, describe, test } from 'node:test';

process.env.CHIVAGO_DB = ':memory:';
process.env.CHIVAGO_HOST_SECRET = 'test-operator-secret';
process.env.CHIVAGO_PUBLIC_URL = 'https://chivargo.example';
delete process.env.CHIVAGO_OPEN_IDENTITY;

const { app, db } = await import('./server-node.ts');
const { acceptInvite, createInvite, INVITE_TTL_MS, readInvite } = await import('./host-invite-service.ts');
const { login, SESSION_COOKIE } = await import('./host-auth.ts');
const { consoleRoutes } = await import('./console/routes.ts');

const T0 = new Date('2026-11-21T02:00:00.000Z');
const quest = (id: string, th: string) => db.prepare(
  `INSERT INTO quests (id,code,name_en,name_th,where_label,duration,reward_points,host_id,kind,lat,lng,geofence_radius_m)
   VALUES (?,?,?,?,'Beach','45 min',0,'h-team','today',13.15,100.81,120)`,
).run(id, id.toUpperCase(), `Quest ${id}`, th);

beforeEach(() => {
  db.prepare('DELETE FROM host_invites').run();
  db.prepare("DELETE FROM quests WHERE id IN ('q-trash','q-food')").run();
  db.prepare("DELETE FROM host_sessions").run();
  db.prepare("DELETE FROM hosts WHERE id IN ('h-team','h-sc-muni')").run();
  db.prepare("INSERT INTO hosts (id,name,type,created_at) VALUES ('h-team','ChivarGo team','platform',?)").run(T0.toISOString());
  quest('q-trash', 'ฮีโร่พิทักษ์เกาะ');
  quest('q-food', 'ตามล่ารสชาติ');
});

const invite = (over: Record<string, unknown> = {}) =>
  createInvite(db, { hostId: 'h-sc-muni', name: 'เทศบาลตำบลเกาะสีชัง', type: 'municipality', questIds: ['q-trash'], ...over }, T0);

describe('an invitation', () => {
  test('shows what it asks, and keeps only a hash of its token', () => {
    const { token } = invite();
    const view = readInvite(db, token, T0);
    assert.equal(view.state, 'open');
    assert.ok(view.state === 'open' && view.quests[0]?.nameTh === 'ฮีโร่พิทักษ์เกาะ');
    const stored = JSON.stringify(db.prepare('SELECT * FROM host_invites').all());
    assert.ok(!stored.includes(token));
  });

  test('accepted once: the host exists, owns the quests, and its key signs in', () => {
    const { token } = invite({ questIds: ['q-trash', 'q-food'] });
    const { hostId, key } = acceptInvite(db, token, 'Somchai', T0);
    assert.equal(hostId, 'h-sc-muni');
    const owners = db.prepare("SELECT host_id FROM quests WHERE id IN ('q-trash','q-food')").all() as { host_id: string }[];
    assert.deepEqual(owners.map((o) => o.host_id), ['h-sc-muni', 'h-sc-muni']);
    assert.ok(login(db, key, 'Somchai'));
    assert.equal(readInvite(db, token, T0).state, 'used');
    assert.throws(() => acceptInvite(db, token, 'Someone else', T0), /used, expired or unknown/);
  });

  test('an expired link opens nothing', () => {
    const { token } = invite();
    const later = new Date(T0.getTime() + INVITE_TTL_MS + 1);
    assert.equal(readInvite(db, token, later).state, 'expired');
    assert.throws(() => acceptInvite(db, token, 'Somchai', later));
    assert.equal(db.prepare("SELECT 1 FROM hosts WHERE id='h-sc-muni'").get(), undefined);
  });

  test('refuses an existing host, an unknown quest, and anyone who cannot verify', () => {
    assert.throws(() => invite({ hostId: 'h-team' }), /already exists/);
    assert.throws(() => invite({ questIds: ['q-nope'] }), /no quest/);
    assert.throws(() => invite({ type: 'operator' }), /type must be/);
    assert.throws(() => invite({ type: 'platform' }), /type must be/);
    invite();
    assert.throws(() => invite(), /open invitation/);
  });
});

describe('the page the place opens', () => {
  const con = () => consoleRoutes(db);
  const form = (fields: Record<string, string>) => ({
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: 'chivago_lang=th' },
    body: new URLSearchParams(fields),
  });

  test('shows the quest in Thai and asks for a name; a wrong link is a plain 404', async () => {
    const { token } = createInvite(db, { hostId: 'h-sc-muni', name: 'Muni', type: 'municipality', questIds: ['q-trash'] });
    const page = await (await con().request(`/invite/${token}`, { headers: { cookie: 'chivago_lang=th' } })).text();
    assert.match(page, /ฮีโร่พิทักษ์เกาะ/);
    assert.match(page, /name="reviewer"[^>]*required/);
    assert.equal((await con().request('/invite/not-a-token')).status, 404);
  });

  test('no name is refused; with a name the place is signed in and sees its key once', async () => {
    const { token } = createInvite(db, { hostId: 'h-sc-muni', name: 'Muni', type: 'municipality', questIds: ['q-trash'] });
    const app2 = con();
    assert.equal((await app2.request(`/invite/${token}`, form({}))).status, 400);
    const res = await app2.request(`/invite/${token}`, form({ reviewer: 'Somchai' }));
    assert.equal(res.status, 200);
    const cookie = /chivago_host=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')?.[1];
    assert.ok(cookie, 'signed in');
    assert.match(await res.text(), /Access Key/);
    const queue = await app2.request('/', { headers: { cookie: `${SESSION_COOKIE}=${cookie}` } });
    assert.equal(queue.status, 200);
    assert.equal((await app2.request(`/invite/${token}`, form({ reviewer: 'Again' }))).status, 404, 'a used link opens nothing');
  });
});

describe('POST /internal/invites', () => {
  const post = (body: unknown, secret: string | null = 'test-operator-secret') => app.request('/internal/invites', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(secret ? { 'x-host-secret': secret } : {}) },
    body: JSON.stringify(body),
  });

  test('needs the secret', async () => {
    assert.equal((await post({}, null)).status, 403);
  });

  test('answers a link once, on the public address', async () => {
    const res = await post({ hostId: 'h-sc-muni', name: 'Muni', type: 'municipality', questIds: ['q-trash'] });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('cache-control') ?? '', /no-store/);
    const { data } = await res.json() as { data: { url: string } };
    assert.match(data.url, /^https:\/\/chivargo\.example\/console\/invite\/[A-Za-z0-9_-]{40,}$/);
  });

  test('says what is wrong', async () => {
    assert.equal((await post({ hostId: 'h-team', name: 'x', type: 'community', questIds: ['q-trash'] })).status, 409);
    assert.equal((await post({ hostId: 'h-x1', name: 'x', type: 'community', questIds: ['q-nope'] })).status, 404);
    assert.equal((await post({ hostId: 'h-x1', name: 'x', type: 'operator', questIds: ['q-trash'] })).status, 400);
  });
});
