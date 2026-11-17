import { strict as assert } from 'node:assert';
import { before, describe, test } from 'node:test';

delete process.env.CHIVAGO_OPEN_IDENTITY;
process.env.CHIVAGO_DB = ':memory:';

const { app } = await import('./server-node.ts');
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

let owner: string; let member: string; let outsider: string;
before(async () => {
  owner = await register('Live Owner'); member = await register('Live Member'); outsider = await register('Live Outsider');
  const made = await json(await post('/party', owner, { name: 'Live crew' }));
  await post('/party/join', member, { code: made.data.code });
});

describe('Party Live HTTP privacy', () => {
  test('location requires opt-in and never crosses the Party boundary', async () => {
    let response = await request('PUT', '/party/location', member, { latitude: 13.16, longitude: 100.81, accuracy: 8 });
    assert.equal(response.status, 409);
    assert.match((await json(response)).code!, /SHARING/i);

    assert.equal((await json(await request('PATCH', '/party/location-sharing', member, { enabled: true }))).ok, true);
    assert.equal((await json(await request('PUT', '/party/location', member, { latitude: 13.16, longitude: 100.81, accuracy: 8 }))).ok, true);
    const visible = await json(await request('GET', '/party/live', owner));
    const memberRow = visible.data.members.find((candidate: any) => candidate.displayName === 'Live Member');
    assert.equal(memberRow.latitude, 13.16);

    response = await request('GET', '/party/live', outsider);
    assert.equal(response.status, 404);
    const text = JSON.stringify(await json(response));
    assert.doesNotMatch(text, /13\.16|100\.81/);

    await request('PATCH', '/party/location-sharing', member, { enabled: false });
    const hidden = await json(await request('GET', '/party/live', owner));
    const hiddenMember = hidden.data.members.find((candidate: any) => candidate.displayName === 'Live Member');
    assert.equal(hiddenMember.latitude, null);
    assert.equal(hiddenMember.longitude, null);
  });

  test('meeting points and chat are shared only through authenticated Party routes', async () => {
    const meeting = await json(await request('PUT', '/party/meeting-point', member, {
      latitude: 13.162, longitude: 100.811, label: 'Ferry pier',
    }));
    assert.equal(meeting.data.meetingPoint.label, 'Ferry pier');
    const live = await json(await request('GET', '/party/live', owner));
    assert.equal(live.data.meetingPoint.label, 'Ferry pier');

    const sent = await json(await post('/party/messages', member, { kind: 'chat', body: 'Meet at the pier' }));
    assert.equal(sent.data.message.body, 'Meet at the pier');
    const feed = await json(await request('GET', '/party/messages', owner));
    assert.equal(feed.data.messages.some((message: any) => message.body === 'Meet at the pier'), true);
    const outside = await request('GET', '/party/messages', outsider);
    assert.equal(outside.status, 404);
  });

  test('owner transfer is required before the owner leaves', async () => {
    let response = await post('/party/leave', owner);
    assert.equal(response.status, 409);
    assert.equal((await json(response)).code, 'OWNER_TRANSFER_REQUIRED');
    response = await post('/party/owner', owner, { memberId: (await json(await request('GET', '/party', member))).data.summary.members.find((m: any) => m.displayName === 'Live Member').userId });
    assert.equal(response.status, 200);
    assert.equal((await json(await post('/party/leave', owner))).data.left, true);
  });
});
