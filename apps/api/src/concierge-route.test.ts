import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { gridKey } from './air.ts';

delete process.env.CHIVAGO_OPEN_IDENTITY;
process.env.CHIVAGO_DB = ':memory:';
process.env.CHIVAGO_GROQ = 'off';

const { app, db } = await import('./server-node.ts');
let key = '';

const register = async (label: string): Promise<string> => {
  const registration = await app.request('/devices', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ displayName: 'Concierge tester', label }),
  });
  const body = await registration.json() as { data: { deviceKey: string } };
  return body.data.deviceKey;
};

const request = (body: unknown) => app.request('/concierge/chat', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-chivago-device-key': key },
  body: JSON.stringify(body),
});

const exactJson = (bytes: number): string => {
  const base = JSON.stringify({ message: 'hello', area: 'koh-sichang', padding: '' });
  return JSON.stringify({ message: 'hello', area: 'koh-sichang', padding: 'x'.repeat(bytes - base.length) });
};

before(async () => {
  key = await register('Test phone');

  const rows = db.prepare('SELECT lat,lng,aqi FROM places').all() as unknown as { lat: number; lng: number; aqi: number }[];
  const insert = db.prepare('INSERT OR REPLACE INTO air_cache(grid_key,aqi,pm25,fetched_at) VALUES(?,?,?,?)');
  for (const row of rows) insert.run(gridKey(row.lat, row.lng), row.aqi, null, new Date().toISOString());
});

test('concierge HTTP boundary rejects oversized/invalid input and returns 429 after the user quota', async () => {
  assert.equal((await request({ message: 'x'.repeat(501), area: 'koh-sichang' })).status, 400);
  assert.equal((await request({ message: 'hello', area: 'koh-sichang', location: { lat: 999, lng: 0 } })).status, 400);

  for (let index = 0; index < 20; index += 1) {
    const response = await request({ message: 'hello', area: 'koh-sichang', conversationId: null });
    assert.equal(response.status, 200, `call ${index + 1}`);
  }
  const refused = await request({ message: 'hello', area: 'koh-sichang' });
  assert.equal(refused.status, 429);
  const body = await refused.json() as { ok: boolean; code: string; error: string };
  assert.equal(body.ok, false);
  assert.equal(body.code, 'RATE_LIMITED');
  assert.match(body.error, /minute/i);
});

test('concierge counts actual body bytes before JSON parsing even without a trustworthy length', async () => {
  const bodyLimitKey = await register('Body limit phone');
  const valid = await app.request(new Request('http://localhost/concierge/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-chivago-device-key': bodyLimitKey },
    body: exactJson(8_192),
  }));
  assert.equal(valid.status, 200);

  const noLength = await app.request(new Request('http://localhost/concierge/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-chivago-device-key': bodyLimitKey },
    body: exactJson(8_193),
  }));
  assert.equal(noLength.status, 413);

  const forgedLength = await app.request(new Request('http://localhost/concierge/chat', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'content-length': '1',
      'x-chivago-device-key': bodyLimitKey,
    },
    body: exactJson(8_193),
  }));
  assert.equal(forgedLength.status, 413);
});

test('an unknown conversation id returns 404 and cannot allocate storage', async () => {
  const unknownKey = await register('Unknown conversation phone');
  const before = Number((db.prepare('SELECT COUNT(*) AS n FROM concierge_conversations').get() as { n: number }).n);
  const response = await app.request('/concierge/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-chivago-device-key': unknownKey },
    body: JSON.stringify({ message: 'hello', area: 'koh-sichang', conversationId: 'not-a-real-conversation' }),
  });
  assert.equal(response.status, 404);
  const payload = await response.json() as { ok: boolean; code: string };
  assert.equal(payload.ok, false);
  assert.equal(payload.code, 'NOT_FOUND');
  const after = Number((db.prepare('SELECT COUNT(*) AS n FROM concierge_conversations').get() as { n: number }).n);
  assert.equal(after, before);
});

test('an explicit empty conversation id is invalid and cannot resume or allocate', async () => {
  const emptyIdKey = await register('Empty conversation id phone');
  const before = Number((db.prepare('SELECT COUNT(*) AS n FROM concierge_conversations').get() as { n: number }).n);
  const response = await app.request('/concierge/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-chivago-device-key': emptyIdKey },
    body: JSON.stringify({ message: 'hello', area: 'koh-sichang', conversationId: '' }),
  });
  assert.equal(response.status, 400);
  const after = Number((db.prepare('SELECT COUNT(*) AS n FROM concierge_conversations').get() as { n: number }).n);
  assert.equal(after, before);
});

test('history resumes across screen visits and clear deletes the transcript and context', async () => {
  const historyKey = await register('History phone');
  const headers = { 'content-type': 'application/json', 'x-chivago-device-key': historyKey };
  const sent = await app.request('/concierge/chat', {
    method: 'POST', headers,
    body: JSON.stringify({ message: 'แนะนำที่เที่ยว', area: 'samui', conversationId: null }),
  });
  assert.equal(sent.status, 200);

  const history = await app.request('/concierge/history?area=samui', { headers });
  assert.equal(history.status, 200);
  const before = await history.json() as { data: { conversationId: string | null; messages: { role: string; content: string }[] } };
  assert.ok(before.data.conversationId);
  assert.deepEqual(before.data.messages.map((message) => message.role), ['user', 'assistant']);
  assert.equal(before.data.messages[0]?.content, 'แนะนำที่เที่ยว');

  const cleared = await app.request('/concierge/history?area=samui', { method: 'DELETE', headers });
  assert.equal(cleared.status, 200);
  const clearedBody = await cleared.json() as { data: { cleared: boolean; deletedConversations: number } };
  assert.equal(clearedBody.data.cleared, true);
  assert.equal(clearedBody.data.deletedConversations, 1);

  const empty = await app.request('/concierge/history?area=samui', { headers });
  const after = await empty.json() as { data: { conversationId: string | null; messages: unknown[] } };
  assert.equal(after.data.conversationId, null);
  assert.deepEqual(after.data.messages, []);
});
