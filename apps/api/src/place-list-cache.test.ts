import { strict as assert } from 'node:assert';
import { beforeEach, describe, test } from 'node:test';

import { openTestDb, type DB } from './db-node.ts';
import { listScoredPlaces, getScoredPlace } from './repo.ts';
import { PLACE_LIST_TTL_MS, invalidatePlaceList } from './place-list-cache.ts';
import { setPlaceHidden } from './admin-service.ts';
import { openArea } from './area-opening.ts';
import { importBatch } from './import-service.ts';
import type { AirReading } from './air.ts';

/*
  The place list is the slowest read in the app: measured 20 Nov 2026 at
  about 360 requests/s against 980 for the community figures, and half of
  every call was reading the air over each place. That half, and the place
  rows themselves, are the same for everybody, so they are kept for a
  minute. What is personal or live - the score for this traveller's profile,
  who checked in this hour, the reviews - is still read on every request.
*/

let db: DB;
let airCalls = 0;
const T0 = Date.parse('2026-11-20T03:00:00.000Z');

const air = async (_db: unknown, _lat: number, _lng: number, fallbackAqi: number): Promise<AirReading> => {
  airCalls += 1;
  return { aqi: fallbackAqi, pm25: null, provenance: 'live', source: 'test', observedAt: new Date(T0).toISOString() };
};

function place(id: string, lat: number, lng: number, name = `Place ${id}`): void {
  db.prepare(`INSERT INTO places (id,name_en,name_th,short,layer,province,lat,lng,meta,blurb_en,blurb_th,tags,
    safety_label_en,safety_label_th,crowd_density,aqi,safety_index,walkability)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,'[]',?,?,0,40,80,70)`).run(
    id, name, name, name.slice(0, 40), 'culture', 'Chonburi', lat, lng, 'meta', 'blurb', 'blurb', 'safe', 'safe');
}

function user(id: string): void {
  db.prepare('INSERT INTO users (id, display_name, locale, created_at) VALUES (?,?,?,?)').run(id, id, 'th', new Date(T0).toISOString());
}

const list = (userId = 'u_ana', now = T0, bbox?: { minLat: number; maxLat: number; minLng: number; maxLng: number }) =>
  listScoredPlaces(db, userId, bbox, { now, air });

beforeEach(() => {
  db = openTestDb();
  airCalls = 0;
  place('pier', 13.15, 100.81);
  place('shrine', 13.16, 100.82);
  place('far', 9.5, 100.0);
  user('u_ana');
  user('u_ben');
});

describe('the place list cache', () => {
  test('the air is read once per place, then reused inside the minute', async () => {
    await list();
    assert.equal(airCalls, 3);
    await list('u_ben', T0 + PLACE_LIST_TTL_MS - 1);
    assert.equal(airCalls, 3, 'a second traveller reuses the same readings');
    await list('u_ana', T0 + PLACE_LIST_TTL_MS);
    assert.equal(airCalls, 6, 'after the minute they are read again');
  });

  test('a change nobody announced shows within the minute, never later', async () => {
    await list();
    db.prepare("UPDATE places SET name_en = 'Renamed' WHERE id = 'pier'").run();
    assert.equal((await list('u_ana', T0 + 1)).find((p) => p.id === 'pier')?.name.en, 'Place pier');
    assert.equal((await list('u_ana', T0 + PLACE_LIST_TTL_MS)).find((p) => p.id === 'pier')?.name.en, 'Renamed');
  });

  test('invalidating shows a change at once', async () => {
    await list();
    db.prepare("UPDATE places SET name_en = 'Renamed' WHERE id = 'pier'").run();
    invalidatePlaceList(db);
    assert.equal((await list('u_ana', T0 + 1)).find((p) => p.id === 'pier')?.name.en, 'Renamed');
  });

  test('a place an admin hides disappears on the next request', async () => {
    db.prepare("INSERT INTO hosts (id, name, type, role) VALUES ('h-admin','Admin','platform','moderator')").run();
    assert.equal((await list()).length, 3);
    setPlaceHidden(db, 'h-admin', 'pier', true, new Date(T0));
    const after = await list('u_ana', T0 + 1);
    assert.equal(after.length, 2);
    assert.ok(!after.some((p) => p.id === 'pier'));
    assert.equal(await getScoredPlace(db, 'u_ana', 'pier', { now: T0 + 1, air }), null);
  });

  test('who checked in this hour is read live, not from the cache', async () => {
    const before = (await list()).find((p) => p.id === 'pier')!.crowd;
    db.prepare(
      `INSERT INTO ledger (id, user_id, label, occurred_at, host, amount, currency, exp, kind, source_ref)
       VALUES ('c1','u_ben','Check-in',?, 'ChivaGo · self check-in', 20, 'trip', 20, 'checkin', 'checkin:pier:u_ben:1')`,
    ).run(new Date().toISOString()); // the crowd window runs on the wall clock
    const after = (await list('u_ana', T0 + 1)).find((p) => p.id === 'pier')!.crowd;
    assert.notDeepEqual(after, before, 'the check-in shows at once');
  });

  test('the map viewport filters the cached list exactly as the query did', async () => {
    const island = await list('u_ana', T0, { minLat: 13.1, maxLat: 13.2, minLng: 100.8, maxLng: 100.9 });
    assert.deepEqual(island.map((p) => p.id).sort(), ['pier', 'shrine']);
    const edge = await list('u_ana', T0, { minLat: 13.15, maxLat: 13.15, minLng: 100.81, maxLng: 100.81 });
    assert.deepEqual(edge.map((p) => p.id), ['pier'], 'the bounds are inclusive, as BETWEEN was');
    assert.equal(airCalls, 3, 'one read of the air served all three lists');
  });

  test('two databases never share a cache', async () => {
    await list();
    const other = openTestDb();
    const before = airCalls;
    const theirs = await listScoredPlaces(other, 'u_ana', undefined, { now: T0, air });
    assert.equal(theirs.length, 0);
    assert.equal(airCalls, before);
  });
});

describe('the writers clear it', () => {
  test('opening an area shows its places on the next request', async () => {
    const before = (await list()).length;
    openArea(db, 'koh-sichang', new Date(T0));
    const after = (await list('u_ana', T0 + 1)).length;
    assert.ok(after > before, `${after} places after opening, ${before} before`);
  });
});

describe('an import clears it', () => {
  test('a place arriving through /admin/import is served on the next request', async () => {
    const before = (await list()).length;
    importBatch(db, {
      table: 'places',
      columns: ['id', 'name_en', 'name_th', 'short', 'layer', 'province', 'lat', 'lng', 'meta', 'blurb_en', 'blurb_th', 'tags',
        'safety_label_en', 'safety_label_th', 'crowd_density', 'aqi', 'safety_index', 'walkability'],
      values: [['imported', 'Imported', 'Imported', 'Imported', 'culture', 'Chonburi', 13.17, 100.8, 'meta', 'b', 'b', '[]',
        'safe', 'safe', 0, 40, 80, 70]],
    });
    const after = await list('u_ana', T0 + 1);
    assert.equal(after.length, before + 1);
    assert.ok(after.some((p) => p.id === 'imported'));
  });
});
