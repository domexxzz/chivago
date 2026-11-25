import { strict as assert } from 'node:assert';
import { beforeEach, describe, test } from 'node:test';

import { openTestDb, type DB } from '../db-node.ts';
import { hashApiKey, resolveSession, SESSION_COOKIE } from '../host-auth.ts';
import { hostQuestsOf } from '../host-quest-service.ts';
import { getQuest } from '../repo.ts';
import { consoleRoutes, __csrfFor } from './routes.ts';

let db: DB;
let app: ReturnType<typeof consoleRoutes>;
const KEY = { faculty: 'chv_FACAA-FACBB-FACCC-FACDD', affairs: 'chv_AFFAA-AFFBB-AFFCC-AFFDD', shop: 'chv_SHOPA-SHOPB-SHOPC-SHOPD', hotel: 'chv_HOTEA-HOTEB-HOTEC-HOTED' };

beforeEach(() => {
  db = openTestDb();
  app = consoleRoutes(db);
  const add = (id: string, name: string, type: string, role: string, key: string) =>
    db.prepare('INSERT INTO hosts (id,name,type,role,api_key_hash,created_at) VALUES (?,?,?,?,?,?)')
      .run(id, name, type, role, hashApiKey(key), new Date().toISOString());
  add('h-faculty', 'Faculty of Engineering', 'community', 'host', KEY.faculty);
  add('h-affairs', 'Student affairs', 'community', 'moderator', KEY.affairs);
  add('h-shop', 'A shop', 'operator', 'host', KEY.shop);
  add('h-hotel', 'A hotel', 'hotel', 'host', KEY.hotel);
  db.prepare("UPDATE hosts SET campus = 'rmutt' WHERE id IN ('h-faculty', 'h-affairs')").run();
});

async function signIn(key: string): Promise<string> {
  const res = await app.request('/login', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ key, reviewer: 'Nok' }),
  });
  const token = /chivago_host=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')?.[1];
  assert.ok(token, `login failed: ${res.status}`);
  return token;
}
const get = (token: string, path = '/quest-desk') =>
  app.request(path, { headers: { cookie: `${SESSION_COOKIE}=${token}; chivago_lang=en` } });
const post = (token: string, path: string, fields: Record<string, string> = {}, csrf?: string) =>
  app.request(path, {
    method: 'POST',
    headers: { cookie: `${SESSION_COOKIE}=${token}; chivago_lang=en`, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrf: csrf ?? __csrfFor(resolveSession(db, token)!), ...fields }),
  });

const local = (days: number, hour: string) => `${new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)}T${hour}`;
const fields = () => ({
  area: 'rmutt', placeId: '', lat: '14.0334', lng: '100.7251', radiusM: '120',
  nameTh: 'ปลูกต้นไม้', nameEn: 'Plant a tree', whereTh: 'สวนราชมงคล', whereEn: 'Rajamangala Park',
  minutes: '90', rewardPoints: '80', rewardCurrency: 'green', seats: '20',
  startsAt: local(3, '09:00'), endsAt: local(3, '12:00'),
});

describe('writing an activity in the console', () => {
  test('saved, sent, and published by another host', async () => {
    const writer = await signIn(KEY.faculty);
    assert.equal((await post(writer, '/quest-desk', fields())).status, 303);
    const [draft] = hostQuestsOf(db, 'h-faculty');
    assert.equal(draft!.startsAt.slice(11, 16), '02:00', 'nine in the morning in Thailand');
    assert.equal((await post(writer, `/quest-desk/${draft!.id}/submit`)).status, 303);

    const reviewer = await signIn(KEY.affairs);
    const page = await (await get(reviewer)).text();
    assert.match(page, /Plant a tree/);
    assert.match(page, /pays at most <\/?strong>?|1,600/);
    assert.equal((await post(reviewer, `/quest-desk/${draft!.id}/publish`)).status, 303);
    assert.equal(getQuest(db, draft!.id)!.name.en, 'Plant a tree');
    assert.equal(hostQuestsOf(db, 'h-faculty')[0]!.reviewedBy, 'Nok');
  });

  test('a mistake comes back with what was typed still in the boxes', async () => {
    const writer = await signIn(KEY.faculty);
    const res = await post(writer, '/quest-desk', { ...fields(), rewardPoints: '9999', nameEn: 'Keep <me>' });
    assert.equal(res.status, 400);
    const page = await res.text();
    assert.match(page, /Points: 0 to 150/);
    assert.match(page, /value="Keep &lt;me&gt;"/, 'escaped, not lost');
    assert.equal(hostQuestsOf(db, 'h-faculty').length, 0);
  });

  test('an empty coordinate is not the Gulf of Guinea', async () => {
    const writer = await signIn(KEY.faculty);
    const res = await post(writer, '/quest-desk', { ...fields(), lat: '', lng: '' });
    assert.match(await res.text(), /outside this campus/);
  });

  test('the campus’s own places can be chosen instead of typing numbers', async () => {
    db.prepare(
      `INSERT INTO places (id,name_en,name_th,short,layer,province,lat,lng,meta,blurb_en,blurb_th,tags,
         safety_label_en,safety_label_th,crowd_density,aqi,safety_index,walkability)
       VALUES ('rmutt-library','Library','หอสมุด','Lib','Safe','TH-13',14.0343,100.7255,'','','','[]','','',0.1,20,90,90)`,
    ).run();
    const writer = await signIn(KEY.faculty);
    assert.match(await (await get(writer)).text(), /value="rmutt-library"/);
    await post(writer, '/quest-desk', { ...fields(), lat: '', lng: '', placeId: 'rmutt-library' });
    assert.equal(hostQuestsOf(db, 'h-faculty')[0]!.lat, 14.0343);
  });
});

describe('who may do what', () => {
  test('a host nobody opened a campus to is shown no form, and cannot post one', async () => {
    const hotel = await signIn(KEY.hotel);
    const page = await (await get(hotel)).text();
    assert.match(page, /has not been opened to write/);
    assert.doesNotMatch(page, /name="nameEn"/);
    const res = await post(hotel, '/quest-desk', fields());
    assert.equal(res.status, 400);
    assert.equal(hostQuestsOf(db, 'h-hotel').length, 0);
  });

  test('nor for a campus other than its own', async () => {
    const writer = await signIn(KEY.faculty);
    const res = await post(writer, '/quest-desk', { ...fields(), area: 'ku-bangkhen', lat: '13.8476', lng: '100.5724' });
    assert.match(await res.text(), /another campus/);
    assert.equal(hostQuestsOf(db, 'h-faculty').length, 0);
  });

  test('a host that is not a reviewer is not offered the decision, and cannot take it', async () => {
    const writer = await signIn(KEY.faculty);
    await post(writer, '/quest-desk', fields());
    const { id } = hostQuestsOf(db, 'h-faculty')[0]!;
    await post(writer, `/quest-desk/${id}/submit`);
    assert.doesNotMatch(await (await get(writer)).text(), /Approve and publish/);
    assert.equal((await post(writer, `/quest-desk/${id}/publish`)).status, 404);
    assert.equal(getQuest(db, id), null);
  });

  test('a reviewer does not publish their own host’s', async () => {
    const reviewer = await signIn(KEY.affairs);
    await post(reviewer, '/quest-desk', fields());
    const { id } = hostQuestsOf(db, 'h-affairs')[0]!;
    await post(reviewer, `/quest-desk/${id}/submit`);
    const res = await post(reviewer, `/quest-desk/${id}/publish`);
    assert.equal(res.status, 400);
    assert.match(await res.text(), /another host/);
    assert.equal(getQuest(db, id), null);
  });

  test('a page from another site cannot post here', async () => {
    const writer = await signIn(KEY.faculty);
    assert.equal((await post(writer, '/quest-desk', fields(), 'forged')).status, 403);
    assert.equal(hostQuestsOf(db, 'h-faculty').length, 0);
  });

  test('a stranger is sent to sign in, and an operator is refused', async () => {
    assert.equal((await app.request('/quest-desk')).status, 303);
    assert.equal((await get(await signIn(KEY.shop))).status, 403);
  });

  test('another host’s draft cannot be opened for editing', async () => {
    const writer = await signIn(KEY.faculty);
    await post(writer, '/quest-desk', { ...fields(), nameEn: 'Secret plans' });
    const { id } = hostQuestsOf(db, 'h-faculty')[0]!;
    const other = await signIn(KEY.affairs);
    assert.doesNotMatch(await (await get(other, `/quest-desk?edit=${id}`)).text(), /Secret plans/);
  });
});
