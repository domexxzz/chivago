import { strict as assert } from 'node:assert';
import { before, describe, test } from 'node:test';

delete process.env.CHIVAGO_OPEN_IDENTITY;
process.env.CHIVAGO_DB = ':memory:';
const { app, db } = await import('./server-node.ts');

type Body = { ok: boolean; data?: any; code?: string; error?: string };
const json = async (response: Response) => (await response.json()) as Body;
const request = (method: string, path: string, key: string, body?: unknown) => app.request(path, {
  method,
  headers: { 'x-chivago-device-key': key, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
const post = (path: string, key: string, body: unknown = {}) => request('POST', path, key, body);
const register = async (name: string) => {
  const response = await app.request('/devices', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ displayName: name, label: name }),
  });
  return (await json(response)).data.deviceKey as string;
};

let owner: string; let member: string; let late: string; let outsider: string; let code: string;
before(async () => {
  owner = await register('Quest Owner'); member = await register('Quest Member');
  late = await register('Quest Late'); outsider = await register('Quest Outsider');
  db.prepare("INSERT INTO hosts (id,name,type) VALUES ('party-host','Party Host','community')").run();
  db.prepare(
    `INSERT INTO quests
     (id,code,name_en,name_th,where_label,duration,reward_points,host_id,kind,lat,lng,geofence_radius_m)
     VALUES ('party-route-quest','PQ-01','Island mission','ภารกิจเกาะ','Koh Sichang','45 min',100,'party-host','today',13.16,100.81,100)`,
  ).run();
  const made = await json(await post('/party', owner, { name: 'Quest crew' }));
  code = made.data.code;
  await post('/party/join', member, { code });
});

describe('Party Quest HTTP foundation', () => {
  let instanceId: string;
  test('selection and start are owner-only', async () => {
    let response = await post('/party/quests/select', member, {
      questId: 'party-route-quest', questType: 'exploration', questMode: 'all_members',
    });
    assert.equal(response.status, 403);
    assert.equal((await json(response)).code, 'OWNER_ONLY');

    const selected = await json(await post('/party/quests/select', owner, {
      questId: 'party-route-quest', questType: 'exploration', questMode: 'all_members',
    }));
    instanceId = selected.data.partyQuest.id;
    response = await post(`/party/quests/${instanceId}/start`, member);
    assert.equal(response.status, 403);
    const started = await json(await post(`/party/quests/${instanceId}/start`, owner));
    assert.equal(started.data.partyQuest.state, 'in_progress');
    assert.equal(started.data.partyQuest.participants.length, 2);
  });

  test('late joiners are excluded and cross-Party reads are hidden', async () => {
    await post('/party/join', late, { code });
    const current = await json(await request('GET', '/party/quests/current', late));
    assert.equal(current.data.partyQuest.participants.length, 2);
    assert.equal(current.data.partyQuest.participants.some((p: any) => p.displayName === 'Quest Late'), false);
    const hidden = await request('GET', `/party/quests/${instanceId}`, outsider);
    assert.equal(hidden.status, 404);
    const progress = await json(await request('GET', `/party/quests/${instanceId}/progress`, owner));
    assert.equal(progress.data.progress.rosterSize, 2);
    assert.equal(progress.data.progress.progressPercent, 0);
    const hiddenProgress = await request('GET', `/party/quests/${instanceId}/progress`, outsider);
    assert.equal(hiddenProgress.status, 404);
  });

  test('a leaving member remains in the locked roster and can resume', async () => {
    await post('/party/leave', member);
    let history = await json(await request('GET', '/party/quests/history', member));
    assert.equal(history.data.partyQuests[0].participants.find((p: any) => p.displayName === 'Quest Member').membershipStatus, 'left');
    await post('/party/join', member, { code });
    history = await json(await request('GET', '/party/quests/current', member));
    assert.equal(history.data.partyQuest.participants.find((p: any) => p.displayName === 'Quest Member').membershipStatus, 'active');
  });
});
