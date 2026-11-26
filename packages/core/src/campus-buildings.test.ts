import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

import {
  BUILDINGS_READ_ON, CAMPUS_BUILDINGS, UNNAMED_KIND,
  buildingById, buildingsIn, findBuildings,
} from './campus-buildings.ts';
import { RMUTT_BBOX } from './areas.ts';
import { SEED_PLACES } from './seed.ts';

/**
 * The campus directory.
 *
 * What these tests are really guarding is that nothing here was made up: every
 * entry stands on an OpenStreetMap feature, every position falls inside the
 * campus it claims, and the five seeded places are not described a second time
 * where the two copies could drift.
 */

describe('what the directory holds', () => {
  test('every building stands inside the campus it says it is on', () => {
    for (const b of buildingsIn('rmutt')) {
      assert.ok(
        b.lat >= RMUTT_BBOX.minLat && b.lat <= RMUTT_BBOX.maxLat
        && b.lng >= RMUTT_BBOX.minLng && b.lng <= RMUTT_BBOX.maxLng,
        `${b.id} is outside RMUTT's own frame: ${b.lat}, ${b.lng}`,
      );
    }
  });

  test('every entry cites the feature it was read from', () => {
    for (const b of CAMPUS_BUILDINGS) {
      assert.match(b.osm, /^(way|node) \d+$/, `${b.id} does not cite a checkable OpenStreetMap feature`);
    }
    assert.match(BUILDINGS_READ_ON, /^\d{4}-\d{2}-\d{2}$/, 'the day it was read has to be on the record');
  });

  test('no id is used twice, and none of them collides with a seeded place', () => {
    const ids = CAMPUS_BUILDINGS.map((b) => b.id);
    assert.equal(new Set(ids).size, ids.length, 'two buildings share an id');
    const places = new Set(SEED_PLACES.map((p) => p.id));
    for (const id of ids) assert.ok(!places.has(id), `${id} is already a place`);
  });

  test('the five seeded places are not described here as well', () => {
    // One source per thing: the library and the food court are places, with
    // scores and blurbs, and a second copy would drift from them.
    const named = CAMPUS_BUILDINGS.map((b) => b.name?.th ?? '').join(' ');
    for (const th of ['วิทยบริการ', 'โรงอาหารกลาง', 'สวนราชมงคล', 'น้ำพุราชมงคล']) {
      assert.doesNotMatch(named, new RegExp(th), `${th} is a place already`);
    }
  });

  test('a name is given in all three languages, or not given at all', () => {
    for (const b of CAMPUS_BUILDINGS) {
      if (b.name === null) {
        assert.ok(
          b.kind === 'parking' || b.kind === 'toilets',
          `${b.id} has no name, and its kind does not explain why`,
        );
        continue;
      }
      assert.ok(b.name.en.trim().length > 0, `${b.id} is missing its English name`);
      assert.ok(b.name.th.trim().length > 0, `${b.id} is missing its Thai name`);
      // `zh` is optional on Localised across the app; on this campus it is not
      // optional, because every name here was written in all three at once.
      assert.ok((b.name.zh ?? '').trim().length > 0, `${b.id} is missing its Chinese name`);
    }
  });

  test('every kind has words for an unnamed one of it', () => {
    for (const b of CAMPUS_BUILDINGS) {
      const words = UNNAMED_KIND[b.kind];
      assert.ok(words.th.length > 0, `${b.kind} has nothing to call an unnamed one`);
      assert.ok((words.zh ?? '').length > 0, `${b.kind} has nothing to call an unnamed one in Chinese`);
    }
  });

  test('a campus with nothing mapped answers with nothing, not with another campus', () => {
    assert.deepEqual(buildingsIn('ku-bangkhen'), []);
    assert.deepEqual(buildingsIn('samui'), []);
  });

  test('buildingById finds one, and invents none', () => {
    assert.equal(buildingById('rmutt-nursing')?.name?.th, 'คณะพยาบาลศาสตร์');
    assert.equal(buildingById('nope'), null);
    // A list search, so a prototype key cannot answer for a building.
    assert.equal(buildingById('constructor'), null);
    assert.equal(buildingById('__proto__'), null);
  });
});

describe('finding one', () => {
  const ids = (q: string) => findBuildings('rmutt', q).map((b) => b.id);

  test('an empty query opens on the whole campus, in the order listed', () => {
    assert.deepEqual(ids(''), buildingsIn('rmutt').map((b) => b.id));
    assert.deepEqual(ids('   '), buildingsIn('rmutt').map((b) => b.id));
  });

  test('a faculty by its Thai name, and by its English one', () => {
    assert.equal(ids('พยาบาล')[0], 'rmutt-nursing');
    assert.equal(ids('nursing')[0], 'rmutt-nursing');
    assert.equal(ids('NURSING')[0], 'rmutt-nursing', 'case should not matter');
  });

  test('every word has to match, so two words are not a wider search', () => {
    // "คณะ" alone reaches every faculty; adding the second word must narrow it.
    assert.ok(ids('คณะ').length > 1);
    assert.deepEqual(ids('คณะ พยาบาล'), ['rmutt-nursing']);
    assert.deepEqual(ids('พยาบาล วิศวกรรม'), [], 'a word that matches nothing has to empty the result');
  });

  test('an alias nobody sees still finds the building', () => {
    assert.equal(ids('วิศวะ')[0], 'rmutt-eng');
    assert.equal(ids('ทุน')[0], 'rmutt-student-development');
    assert.equal(ids('รับปริญญา')[0], 'rmutt-auditorium');
  });

  test('a name beats an alias', () => {
    // Five residences carry "หอ" in their name; nothing else should outrank them.
    assert.match(ids('หอพัก')[0], /^rmutt-residence-/);
  });

  test('the unnamed are found by what they are', () => {
    const parks = ids('ลานจอด');
    assert.equal(parks.length, 7, 'every car park inside the campus frame should answer');
    assert.ok(parks.every((id) => id.startsWith('rmutt-parking-')));
    assert.equal(ids('ห้องน้ำ').length, 3);
    assert.equal(ids('toilets').length, 3);
  });

  test('a query that matches nothing returns nothing', () => {
    assert.deepEqual(ids('โรงไฟฟ้านิวเคลียร์'), []);
  });
});
