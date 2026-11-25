/** Opening a campus to a host, and what may not then be done to what it wrote. */
import { strict as assert } from 'node:assert';
import { before, describe, test } from 'node:test';

process.env.CHIVAGO_DB = ':memory:';
process.env.CHIVAGO_HOST_SECRET = 'test-operator-secret';
delete process.env.CHIVAGO_OPEN_IDENTITY;

const { app, db } = await import('./server-node.ts');
const { campusOf, createHostQuest, publishHostQuest, submitHostQuest } = await import('./host-quest-service.ts');

const post = (path: string, body: unknown, headers: Record<string, string> = { 'x-host-secret': 'test-operator-secret' }) =>
  app.request(path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

const future = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();
const activity = () => ({
  area: 'rmutt', nameEn: 'Walk', nameTh: 'เดินเล่น', whereEn: 'Park', whereTh: 'สวน', minutes: 60, rewardPoints: 10,
  rewardCurrency: 'trip', lat: 14.0334, lng: 100.7251, radiusM: 100, seats: 3, startsAt: future(1), endsAt: future(2),
});
let deviceKey = '';
const rider = (path: string) => post(path, {}, { 'x-chivago-device-key': deviceKey });

before(async () => {
  for (const [id, type] of [['h-fac', 'community'], ['h-dean', 'community'], ['h-op', 'operator']] as const) {
    db.prepare('INSERT INTO hosts (id,name,type,created_at) VALUES (?,?,?,?)').run(id, id, type, new Date().toISOString());
  }
  const made = await (await post('/devices', { label: 'phone' }, {})).json() as { data: { deviceKey: string } };
  deviceKey = made.data.deviceKey;
});

describe('opening a campus to a host', () => {
  test('is the operator’s act alone', async () => {
    assert.equal((await post('/internal/host-campus', { hostId: 'h-fac', campus: 'rmutt' }, {})).status, 403);
    assert.equal((await post('/internal/host-campus', { hostId: 'h-fac', campus: 'rmutt' }, { 'x-host-secret': 'wrong' })).status, 403);
    assert.equal(campusOf(db, 'h-fac'), null);
  });

  test('only a real host, only a university, and not an operator', async () => {
    assert.equal((await post('/internal/host-campus', { hostId: 'h-nope', campus: 'rmutt' })).status, 404);
    for (const campus of ['koh-sichang', 'moon', undefined, 7]) {
      assert.equal((await post('/internal/host-campus', { hostId: 'h-fac', campus })).status, 400, String(campus));
    }
    assert.equal((await post('/internal/host-campus', { hostId: 'h-op', campus: 'rmutt' })).status, 400);
  });

  test('opens, and closes again', async () => {
    assert.equal((await post('/internal/host-campus', { hostId: 'h-fac', campus: 'rmutt' })).status, 200);
    assert.equal(campusOf(db, 'h-fac'), 'rmutt');
    assert.equal((await post('/internal/host-campus', { hostId: 'h-fac', campus: null })).status, 200);
    assert.equal(campusOf(db, 'h-fac'), null);
  });
});

describe('what a host wrote', () => {
  test('cannot be handed to another host: one wrote it and another approved it', async () => {
    await post('/internal/host-campus', { hostId: 'h-fac', campus: 'rmutt' });
    const q = createHostQuest(db, 'h-fac', null, activity());
    submitHostQuest(db, 'h-fac', q.id);

    assert.equal((await rider(`/quests/${q.id}/join`)).status, 404, 'a draft cannot be joined by guessing');
    publishHostQuest(db, { hostId: 'h-dean', name: null }, q.id);
    assert.equal((await rider(`/quests/${q.id}/join`)).status, 200);
    assert.equal((await post('/internal/quests/host', { questId: q.id, hostId: 'h-dean' })).status, 400);

    assert.equal((await rider(`/quests/${q.id}/leave`)).status, 200);
    assert.equal((await rider(`/quests/${q.id}/leave`)).status, 409);
    assert.equal((await rider('/quests/no-such-quest/join')).status, 404);
  });
});
