import { strict as assert } from 'node:assert';
import { test } from 'node:test';

delete process.env.CHIVAGO_OPEN_IDENTITY;
process.env.CHIVAGO_DB = ':memory:';

const { app, db } = await import('./server.ts');
const { addOrganisation, addSponsorship } = await import('./organisation-service.ts');
const { recordTreePlanting, setTreeCommitment } = await import('./tree-impact-service.ts');
const { awardQuestReward, ensureWallet, reverseMovement } = await import('./wallet-service.ts');

const json = async (res: Response) => (await res.json()) as {
  ok: boolean; data?: any; code?: string;
};

test('tree impact over HTTP belongs to the caller and needs planting proof', async () => {
  const created = await json(await app.request('/devices', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ displayName: 'Ana' }),
  }));
  const { userId, deviceKey } = created.data;
  // Registering the first device closes the pilot's open-identity path.
  assert.equal((await app.request('/impact/trees')).status, 401);
  const get = (path: string) => app.request(path, { headers: { 'x-chivago-device-key': deviceKey } });
  assert.deepEqual((await json(await get('/impact/trees'))).data, { pending: 0, planted: 0, lines: [] });
  const emptyPersonal = (await json(await get('/impact/me'))).data;
  assert.equal(emptyPersonal.find((m: { key: string }) => m.key === 'treesPlanted').value, 0);
  assert.ok(!emptyPersonal.some((m: { key: string }) => m.key === 'mangrovesPlanted'));

  db.prepare('INSERT INTO hosts (id, name, type) VALUES (?,?,?)').run('tree-host', 'Tree host', 'ngo');
  db.prepare(
    `INSERT INTO quests (id, code, name_en, name_th, where_label, duration,
      reward_points, host_id, kind, lat, lng, geofence_radius_m)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run('tree-q', 'TREE-Q', 'Tree cleanup', 'เก็บขยะ', 'Site', '1 hr', 100,
    'tree-host', 'today', 9.51, 100.01, 100);
  const org = addOrganisation(db, { name: 'Tree sponsor', kind: 'ngo' }, 'moderator');
  addSponsorship(db, { orgId: org.id, questId: 'tree-q', fundedTHB: 1000,
    perVerifiedTHB: 100, basis: 'signed' }, 'moderator');
  setTreeCommitment(db, org.id, 'tree-q', 3, new Date('2026-09-01T00:00:00.000Z'));
  const at = '2026-09-11T00:00:00.000Z';
  db.prepare(
    `INSERT INTO quest_progress (user_id, quest_id, stage, joined_at, arrived_at,
      proof_submitted_at, verified_at) VALUES (?,?,'complete',?,?,?,?)`,
  ).run(userId, 'tree-q', at, at, at, at);
  ensureWallet(db, userId);
  awardQuestReward(db, {
    userId, questId: 'tree-q', questName: 'Tree cleanup', host: 'Tree host',
    points: 100, currency: 'green',
  });

  const pending = (await json(await get('/impact/trees'))).data;
  assert.deepEqual([pending.pending, pending.planted], [3, 0]);
  assert.equal(pending.lines[0].sponsorName.en, 'Tree sponsor');
  assert.equal(pending.lines[0].questName.en, 'Tree cleanup');

  recordTreePlanting(db, {
    userId, sponsorId: org.id, questId: 'tree-q', trees: 2,
    partner: 'Test planting partner', plantedAt: '2026-09-20T00:00:00.000Z',
    lat: 9.51, lng: 100.01,
    photo: { url: 'https://example.org/tree.jpg', credit: 'Test photographer', licence: 'CC BY 4.0' },
  }, 'moderator', new Date('2026-09-28T00:00:00.000Z'));
  const planted = (await json(await get('/impact/trees'))).data;
  assert.deepEqual([planted.pending, planted.planted], [1, 2]);
  assert.equal(planted.lines[0].evidence[0].photo.credit, 'Test photographer');
  assert.equal((await json(await get('/impact/me'))).data.find(
    (m: { key: string }) => m.key === 'treesPlanted',
  ).value, 2);

  db.prepare(
    `INSERT INTO community_metrics (key, label_en, label_th, actual, target, unit, year)
     VALUES ('treesPlanted','Trees planted','ต้นไม้ที่ปลูก',1000,1500,'',2026)`,
  ).run();
  const community = (await json(await get('/impact/community?year=2026'))).data;
  assert.equal(community.metrics.find((m: { key: string }) => m.key === 'treesPlanted').actual, 2,
    'the old seeded placeholder escaped into the app');

  reverseMovement(db, {
    userId, originalSourceRef: `quest:tree-q:user:${userId}`, reason: 'test reversal',
  });
  assert.deepEqual((await json(await get('/impact/trees'))).data, { pending: 0, planted: 0, lines: [] });
  assert.equal((await json(await get('/impact/me'))).data.find(
    (m: { key: string }) => m.key === 'treesPlanted',
  ).value, 0);
  const after = (await json(await get('/impact/community?year=2026'))).data;
  assert.equal(after.metrics.find((m: { key: string }) => m.key === 'treesPlanted').actual, 2);
});
