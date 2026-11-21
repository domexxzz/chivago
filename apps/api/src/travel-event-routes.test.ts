import { strict as assert } from 'node:assert';
import { before, describe, test } from 'node:test';

delete process.env.CHIVAGO_OPEN_IDENTITY;
process.env.CHIVAGO_DB = ':memory:';
const { app, db } = await import('./server-node.ts');
const { bootstrapKohSichangAdventure } = await import('./adventure-bootstrap.ts');

let deviceKey = '';
let otherDeviceKey = '';
const placeIds = [
  'sc-palace', 'sc-atsadang-bridge', 'sc-chong-khao-khat', 'sc-chao-pho-khao-yai', 'sc-thamphang',
];
const first = { lat: 13.15, lng: 100.8 };

const register = async (displayName: string): Promise<string> => {
  const response = await app.request('/devices', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ displayName, label: 'travel event test' }),
  });
  const body = await response.json() as { data: { deviceKey: string } };
  return body.data.deviceKey;
};

before(async () => {
  const insert = db.prepare(
    `INSERT INTO places
     (id,name_en,name_th,short,layer,lat,lng,meta,blurb_en,blurb_th,tags,
      safety_label_en,safety_label_th,crowd_density,aqi,safety_index,walkability,photo_url)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  );
  placeIds.forEach((id, index) => insert.run(
    id, `Place ${index + 1}`, `สถานที่ ${index + 1}`, id, 'Quest', first.lat + index / 1000,
    first.lng + index / 1000, 'Koh Sichang', 'A real place', 'สถานที่จริง', '[]',
    'Use care', 'เดินทางอย่างระมัดระวัง', 1, 20, 8, 7, `/media/places/${id}.jpg`,
  ));
  bootstrapKohSichangAdventure(db);
  deviceKey = await register('Journal owner');
  otherDeviceKey = await register('Different traveller');
});

describe('Travel event HTTP API', () => {
  test('a verified check-in returns and persists its real travel consequences', async () => {
    const response = await app.request(`/places/${placeIds[0]}/checkin`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-chivago-device-key': deviceKey },
      body: JSON.stringify({ ...first, accuracyM: 5, mocked: false }),
    });
    assert.equal(response.status, 200);
    const body = await response.json() as any;
    assert.equal(body.ok, true);
    assert.equal(body.data.awarded, true);
    assert.ok(body.data.travel.events.some((event: any) => event.type === 'STORY_UNLOCKED'));
    assert.equal(body.data.travel.petMemories.length, 2);

    const eventsResponse = await app.request('/travel/events', {
      headers: { 'x-chivago-device-key': deviceKey },
    });
    const events = await eventsResponse.json() as any;
    assert.equal(events.data.events.length, 5);

    const memoriesResponse = await app.request('/companions/memories', {
      headers: { 'x-chivago-device-key': deviceKey },
    });
    const memories = await memoriesResponse.json() as any;
    assert.equal(memories.data.memories.length, 2);
  });

  test('journal is private to its owner and accepts an explicit sharing choice', async () => {
    const journalResponse = await app.request('/travel/journal', {
      headers: { 'x-chivago-device-key': deviceKey },
    });
    const journal = await journalResponse.json() as any;
    const entry = journal.data.entries[0];
    assert.equal(entry.visibility, 'private');

    const updated = await app.request(`/travel/journal/${entry.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'x-chivago-device-key': deviceKey },
      body: JSON.stringify({ note: 'บันทึกส่วนตัวจากสถานที่จริง', visibility: 'shared' }),
    });
    assert.equal(updated.status, 200);
    const updatedBody = await updated.json() as any;
    assert.equal(updatedBody.data.visibility, 'shared');

    const crossAccount = await app.request(`/travel/journal/${entry.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'x-chivago-device-key': otherDeviceKey },
      body: JSON.stringify({ note: 'not mine' }),
    });
    assert.equal(crossAccount.status, 404);
  });
});
