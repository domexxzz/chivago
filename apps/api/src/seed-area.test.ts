import { strict as assert } from 'node:assert';
import { test, describe, beforeEach } from 'node:test';

import { SEED_PLACES, SEED_QUESTS, areaByKey, inArea } from '@chivago/core';
import { openTestDb, type DB } from './db.ts';
import { verifyApiKey } from './host-auth.ts';
import { refreshPhotos, reseedRefusal, seedArea } from './seed-area.ts';

/**
 * Adding an area to a database that is already running.
 *
 * What is held here is what seed-db.ts does and this must never do on
 * production: change a row that exists, or delete one the seed does not list.
 * RMUTT sat empty in production for weeks because the only tool that could
 * add it was one that did both.
 */

let db: DB;
beforeEach(() => { db = openTestDb(); });

const count = (sql: string, ...args: unknown[]) =>
  (db.prepare(sql).get(...(args as never[])) as { n: number }).n;

describe('adding an area', () => {
  test('IT ADDS THE AREA’S PLACES, QUESTS AND THE HOSTS OF THOSE QUESTS', () => {
    const r = seedArea(db, 'ku-bangkhen');
    const area = areaByKey('ku-bangkhen');
    const places = SEED_PLACES.filter((p) => p.province === area.province).length;
    const quests = SEED_QUESTS.filter((q) => inArea(area, q)).length;
    assert.equal(r.placesAdded, places);
    assert.equal(r.questsAdded, quests);
    assert.equal(count("SELECT COUNT(*) AS n FROM places WHERE province = 'TH-10'"), places);
    assert.deepEqual(r.hostsCreated, ['h-ku-bangkhen-chivago']);
    const host = db.prepare("SELECT role, api_key_hash FROM hosts WHERE id = 'h-ku-bangkhen-chivago'").get() as
      { role: string; api_key_hash: string };
    assert.equal(host.role, 'host', 'a seeded area never creates a moderator');
    assert.equal(r.keys.length, 1);
    assert.ok(verifyApiKey(r.keys[0]![1], host.api_key_hash), 'the printed key must open the console');
  });

  test('an area with places and no quests adds the places and no host', () => {
    const r = seedArea(db, 'rmutt');
    assert.equal(r.placesAdded, SEED_PLACES.filter((p) => p.province === 'TH-13').length);
    assert.ok(r.placesAdded > 0);
    assert.deepEqual(r.hostsCreated, []);
    assert.deepEqual(r.keys, []);
  });

  test('ONLY THE AREA ASKED FOR: ADDING RMUTT ADDS NO SAMUI PLACE', () => {
    seedArea(db, 'rmutt');
    assert.equal(count("SELECT COUNT(*) AS n FROM places WHERE province <> 'TH-13'"), 0);
  });

  test('refuses an area the app does not know', () => {
    assert.throws(() => seedArea(db, 'bangkok' as never), /area must be one of/);
  });
});

describe('what it must never do to a running database', () => {
  test('RUN TWICE, IT ADDS NOTHING AND ISSUES NO SECOND KEY', () => {
    const first = seedArea(db, 'ku-bangkhen');
    const again = seedArea(db, 'ku-bangkhen');
    assert.equal(again.placesAdded, 0);
    assert.equal(again.questsAdded, 0);
    assert.deepEqual(again.hostsCreated, []);
    assert.deepEqual(again.keys, [], 'a second run printed a second key');
    const hash = (db.prepare("SELECT api_key_hash FROM hosts WHERE id = 'h-ku-bangkhen-chivago'").get() as
      { api_key_hash: string }).api_key_hash;
    assert.ok(verifyApiKey(first.keys[0]![1], hash), 'the first key stopped working');
  });

  test('IT NEVER CHANGES A ROW THAT EXISTS - A CORRECTION MADE IN PRODUCTION SURVIVES', () => {
    seedArea(db, 'ku-bangkhen');
    db.prepare("UPDATE places SET name_en = 'Corrected in production', aqi = 12 WHERE id = 'ku-bk-library'").run();
    db.prepare("UPDATE hosts SET name = 'Renamed by the owner' WHERE id = 'h-ku-bangkhen-chivago'").run();
    db.prepare("UPDATE quests SET reward_points = 999 WHERE id = 'q-ku-bk-walk'").run();
    seedArea(db, 'ku-bangkhen');
    const place = db.prepare("SELECT name_en, aqi FROM places WHERE id = 'ku-bk-library'").get() as
      { name_en: string; aqi: number };
    assert.deepEqual({ ...place }, { name_en: 'Corrected in production', aqi: 12 });
    assert.equal((db.prepare("SELECT name FROM hosts WHERE id = 'h-ku-bangkhen-chivago'").get() as { name: string }).name,
      'Renamed by the owner');
    assert.equal((db.prepare("SELECT reward_points AS n FROM quests WHERE id = 'q-ku-bk-walk'").get() as { n: number }).n, 999);
  });

  test('IT NEVER DELETES: A PLACE THE SEED DOES NOT LIST SURVIVES', () => {
    db.prepare(
      `INSERT INTO places (id, name_en, name_th, short, layer, province, lat, lng, meta, blurb_en, blurb_th, tags,
         safety_label_en, safety_label_th, crowd_density, aqi, safety_index, walkability)
       VALUES ('added-in-production','Added later','เพิ่มภายหลัง','Later','Green','TH-10',13.845,100.57,'m','b','b','[]',
         's','s',1,30,6,7)`,
    ).run();
    seedArea(db, 'ku-bangkhen');
    assert.equal(count("SELECT COUNT(*) AS n FROM places WHERE id = 'added-in-production'"), 1);
  });

  test('a host that already has a key keeps it', () => {
    db.prepare(
      "INSERT INTO hosts (id, name, type, role, api_key_hash) VALUES ('h-ku-bangkhen-chivago','Team','community','host','kept')",
    ).run();
    const r = seedArea(db, 'ku-bangkhen');
    assert.deepEqual(r.keys, []);
    assert.equal((db.prepare("SELECT api_key_hash AS h FROM hosts WHERE id = 'h-ku-bangkhen-chivago'").get() as { h: string }).h,
      'kept');
  });
});

describe('photographs, and only when asked', () => {
  const photoOf = (id: string) =>
    ({ ...(db.prepare('SELECT photo_url, photo_credit, photo_licence, photo_source FROM places WHERE id = ?').get(id) as object) });
  const seeded = (id: string) => {
    const p = SEED_PLACES.find((x) => x.id === id)!.photo;
    return { photo_url: p?.url ?? null, photo_credit: p?.credit ?? null, photo_licence: p?.licence ?? null, photo_source: p?.sourceUrl ?? null };
  };
  const clear = (id: string) =>
    db.prepare('UPDATE places SET photo_url = NULL, photo_credit = NULL, photo_licence = NULL, photo_source = NULL WHERE id = ?').run(id);

  test('A PHOTOGRAPH ADDED TO THE SEED REACHES A PLACE THAT IS ALREADY LIVE - WITH ITS CREDIT AND LICENCE', () => {
    seedArea(db, 'ku-sriracha');
    clear('ku-library'); // the live row, from before the team took the photograph
    seedArea(db, 'ku-sriracha');
    assert.equal((photoOf('ku-library') as { photo_url: unknown }).photo_url, null, 'the insert-only run changed a live row');
    assert.deepEqual(refreshPhotos(db, 'ku-sriracha'), ['ku-library']);
    assert.deepEqual(photoOf('ku-library'), seeded('ku-library'));
  });

  test('A PHOTOGRAPH TAKEN OUT OF THE SEED COMES OFF THE LIVE PLACE', () => {
    seedArea(db, 'rmutt');
    assert.equal(seeded('rmutt-library').photo_url, null, 'this test needs a seeded place with no photograph');
    db.prepare("UPDATE places SET photo_url = '/assets/places/withdrawn.jpg', photo_credit = 'x' WHERE id = 'rmutt-library'").run();
    assert.deepEqual(refreshPhotos(db, 'rmutt'), ['rmutt-library']);
    assert.deepEqual(photoOf('rmutt-library'), seeded('rmutt-library'));
  });

  test('IT TOUCHES NOTHING BUT THE PHOTOGRAPH, AND ONLY IN THE AREA ASKED FOR', () => {
    seedArea(db, 'ku-sriracha');
    seedArea(db, 'rmutt');
    clear('ku-library');
    db.prepare("UPDATE places SET name_en = 'Corrected in production', aqi = 12 WHERE id = 'ku-library'").run();
    db.prepare("UPDATE places SET photo_url = '/assets/places/withdrawn.jpg' WHERE id = 'rmutt-library'").run();
    refreshPhotos(db, 'ku-sriracha');
    const row = db.prepare("SELECT name_en, aqi FROM places WHERE id = 'ku-library'").get() as { name_en: string; aqi: number };
    assert.deepEqual({ ...row }, { name_en: 'Corrected in production', aqi: 12 });
    assert.equal((photoOf('rmutt-library') as { photo_url: unknown }).photo_url, '/assets/places/withdrawn.jpg');
  });

  test('run again, it changes nothing and reports nothing', () => {
    seedArea(db, 'ku-sriracha');
    clear('ku-park');
    assert.deepEqual(refreshPhotos(db, 'ku-sriracha'), ['ku-park']);
    assert.deepEqual(refreshPhotos(db, 'ku-sriracha'), []);
  });
});

describe('seed-db.ts on a live database', () => {
  // The refusal seed-db.ts checks before it touches anything.
  test('IT REFUSES ON A PRODUCTION DATABASE THAT ALREADY HAS PLACES, AND SAYS WHAT TO RUN INSTEAD', () => {
    const why = reseedRefusal({ env: 'production', places: 16, argv: [] });
    assert.ok(why);
    assert.match(why!, /DELETES every place and quest the seed does not list/);
    assert.match(why!, /seed-area\.ts --area/);
  });

  test('it may run on an empty production database: the first-run step', () => {
    assert.equal(reseedRefusal({ env: 'production', places: 0, argv: [] }), null);
  });

  test('it may run anywhere that is not production', () => {
    assert.equal(reseedRefusal({ env: undefined, places: 16, argv: [] }), null);
    assert.equal(reseedRefusal({ env: 'development', places: 16, argv: [] }), null);
  });

  test('re-seeding production anyway has to be asked for out loud', () => {
    assert.equal(reseedRefusal({ env: 'production', places: 16, argv: ['--reseed-production'] }), null);
  });
});
