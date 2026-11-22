/**
 * The three routes that take a position, with the fence open and shut.
 *
 * While `CHIVAGO_FENCE_OFF=1` the app stops reading the GPS and sends these
 * requests with no position at all (apps/mobile/src/state/server-config.ts,
 * `locationOff`). So the routes must take a request with none - and must take
 * one ONLY while the fence is open, or the switch would have quietly become
 * the weaker path any client can pick. See fence.ts.
 */
import { strict as assert } from 'node:assert';
import { afterEach, before, describe, test } from 'node:test';

delete process.env.CHIVAGO_OPEN_IDENTITY;
delete process.env.CHIVAGO_FENCE_OFF;
process.env.CHIVAGO_DB = ':memory:';
const { app, db } = await import('./server-node.ts');

const QUEST = 'q-fence';
const PLACE = 'p-fence';
const SITE = { lat: 13.15, lng: 100.8 };

let deviceKey = '';
let userId = '';

const send = async (path: string, body: unknown) => {
  const response = await app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-chivago-device-key': deviceKey },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() as any };
};

const openFence = () => { process.env.CHIVAGO_FENCE_OFF = '1'; };
afterEach(() => { delete process.env.CHIVAGO_FENCE_OFF; });

before(async () => {
  db.prepare('INSERT INTO hosts (id, name, type) VALUES (?,?,?)').run('h-fence', 'Ko Sichang', 'municipality');
  db.prepare(
    `INSERT INTO quests (id, code, name_en, name_th, where_label, duration, reward_points,
       host_id, kind, lat, lng, geofence_radius_m)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(QUEST, 'KS-99', 'Beach Cleanup', 'เก็บขยะชายหาด', 'Tham Phang', '45 min', 150,
        'h-fence', 'today', SITE.lat, SITE.lng, 250);
  db.prepare(
    `INSERT INTO places (id, name_en, name_th, short, layer, lat, lng, meta,
       blurb_en, blurb_th, tags, safety_label_en, safety_label_th,
       crowd_density, aqi, safety_index, walkability)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(PLACE, 'Tham Phang Beach', 'หาดถ้ำพัง', 'Tham Phang', 'Green', SITE.lat, SITE.lng,
        'Beach', 'x', 'x', '[]', 'Patrolled', 'มีสายตรวจ', 2.4, 42, 7.2, 8.1);
  const registered = await app.request('/devices', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ displayName: 'Trial tester', label: 'test phone' }),
  });
  const body = await registered.json() as { data: { deviceKey: string; userId: string } };
  deviceKey = body.data.deviceKey;
  userId = body.data.userId;
});

describe('routes that take a position', () => {
  test('fence shut: no position is refused at check-in, arrival and proof', async () => {
    const checkin = await send(`/places/${PLACE}/checkin`, {});
    assert.equal(checkin.status, 400);
    assert.equal(checkin.body.code, 'BAD_REQUEST');

    assert.equal((await send(`/quests/${QUEST}/join`, {})).status, 200);
    const arrive = await send(`/quests/${QUEST}/arrive`, {});
    assert.equal(arrive.body.code, 'LOCATION_REQUIRED');

    // Arrived honestly, so only the missing position can refuse the proof.
    assert.equal((await send(`/quests/${QUEST}/arrive`, SITE)).body.data.stage, 'arrived');
    db.prepare('UPDATE quest_progress SET arrived_at = ? WHERE user_id = ? AND quest_id = ?')
      .run(new Date(Date.now() - 20 * 60_000).toISOString(), userId, QUEST);
    const proof = await send(`/quests/${QUEST}/proof`, { photos: [], weightKg: null });
    assert.equal(proof.body.code, 'LOCATION_REQUIRED');

    // The shape the app really sends: photos as a form. The position check
    // comes before anything is stored, so a stand-in photo is enough.
    const form = new FormData();
    form.append('photo', new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], 'p.jpg', { type: 'image/jpeg' }));
    form.append('meta', '[]');
    const upload = await app.request(`/quests/${QUEST}/proof`, {
      method: 'POST', headers: { 'x-chivago-device-key': deviceKey }, body: form,
    });
    assert.equal(((await upload.json()) as any).code, 'LOCATION_REQUIRED');
  });

  test('fence open: a check-in with no position is taken and keeps no fix', async () => {
    db.prepare('DELETE FROM last_fix WHERE user_id = ?').run(userId);
    openFence();
    const checkin = await send(`/places/${PLACE}/checkin`, {});
    assert.equal(checkin.status, 200);
    assert.equal(checkin.body.data.awarded, true);
    const kept = db.prepare('SELECT COUNT(*) AS n FROM last_fix WHERE user_id = ?').get(userId) as { n: number };
    assert.equal(kept.n, 0, 'a position nobody checks is not collected');
  });

  test('fence open: arrival and proof with no position reach the host queue', async () => {
    db.prepare(`UPDATE quest_progress SET stage = 'joined', arrived_at = NULL WHERE user_id = ? AND quest_id = ?`)
      .run(userId, QUEST);
    openFence();
    const arrive = await send(`/quests/${QUEST}/arrive`, {});
    assert.equal(arrive.status, 200);
    assert.equal(arrive.body.data.stage, 'arrived');
    const row = db.prepare('SELECT fence_enforced FROM quest_progress WHERE user_id = ? AND quest_id = ?')
      .get(userId, QUEST) as { fence_enforced: number };
    assert.equal(row.fence_enforced, 0, 'an unfenced arrival says so');

    db.prepare('UPDATE quest_progress SET arrived_at = ? WHERE user_id = ? AND quest_id = ?')
      .run(new Date(Date.now() - 20 * 60_000).toISOString(), userId, QUEST);
    const proof = await send(`/quests/${QUEST}/proof`, {
      photos: [{ uri: 'file://p1.jpg', lat: null, lng: null, takenAt: null }], weightKg: null,
    });
    assert.equal(proof.status, 200);
    assert.equal(proof.body.data.progress.stage, 'host_verification');
  });

  test('no ten-minute wait before proof with the fence open; shut, it holds', async () => {
    const photos = [{ uri: 'file://p1.jpg', lat: null, lng: null, takenAt: null }];
    const rejoin = () => db.prepare(`UPDATE quest_progress SET stage = 'joined', arrived_at = NULL WHERE user_id = ? AND quest_id = ?`)
      .run(userId, QUEST);

    rejoin();
    assert.equal((await send(`/quests/${QUEST}/arrive`, SITE)).body.data.stage, 'arrived');
    const tooSoon = await send(`/quests/${QUEST}/proof`, { photos, weightKg: null, position: SITE });
    assert.equal(tooSoon.status, 409);
    assert.equal(tooSoon.body.code, 'TOO_SOON');

    rejoin();
    openFence();
    assert.equal((await send(`/quests/${QUEST}/arrive`, {})).body.data.stage, 'arrived');
    const straightAway = await send(`/quests/${QUEST}/proof`, { photos, weightKg: null });
    assert.equal(straightAway.status, 200);
    assert.equal(straightAway.body.data.progress.stage, 'host_verification');
  });
});
