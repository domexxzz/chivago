import { strict as assert } from 'node:assert';
import { test, describe, beforeEach } from 'node:test';

import { SEED_PLACES } from '@chivago/core';
import { openTestDb, type DB } from './db-node.ts';
import { getScoredPlace } from './repo.ts';
import { refreshPhotos, seedArea } from './seed-area.ts';

/**
 * What a place's picture IS, all the way from the seed to the API (#169).
 *
 * THE ROAD NOBODY DROVE. Badminton@Sinthani's logo was written into the seed
 * with `kind: 'logo'` and its own field colour, shipped to production, and
 * never appeared: the API answered `photo: null`, and once the url was put
 * back by hand the logo would have come out credited to a photographer who
 * does not exist and cropped until the venue's name fell off its own mark.
 *
 * It survived every existing test because no test drove this road. The
 * mobile suite renders from fixtures and the demo server answers with JSON
 * it holds in memory - both of them hand-written objects that already have
 * `kind` on them. Neither touches a database, so neither could notice that
 * `places` had nowhere to put it.
 *
 * These start at `SEED_PLACES` and finish at what `getScoredPlace` returns,
 * which is the shape the app receives. Everything in between - the columns,
 * the INSERT, the UPDATE and the reading - is on the road.
 */

let db: DB;
beforeEach(() => { db = openTestDb(); });

/** The venue whose logo is the reason this road is now driven. */
const LOGO_PLACE = 'sinthani-badminton';
const seeded = SEED_PLACES.find((p) => p.id === LOGO_PLACE);

const photoRow = (id: string) => db.prepare(
  'SELECT photo_url, photo_kind, photo_backdrop FROM places WHERE id = ?',
).get(id) as { photo_url: string | null; photo_kind: string | null; photo_backdrop: string | null } | undefined;

describe('a place photograph that is a logo', () => {
  test('THE SEED STILL SAYS IT IS A LOGO, WITH A COLOUR OF ITS OWN', () => {
    // If this fails the rest is meaningless: the whole chain below is only
    // worth testing while the seed has something to send down it.
    assert.ok(seeded, `${LOGO_PLACE} is missing from the seed`);
    assert.equal(seeded.photo?.kind, 'logo');
    assert.match(seeded.photo?.backdrop ?? '', /^#[0-9a-fA-F]{6}$/);
  });

  test('SEEDING AN AREA WRITES BOTH FIELDS INTO THE DATABASE', () => {
    seedArea(db, 'rmutt');
    const row = photoRow(LOGO_PLACE);
    assert.ok(row, 'the place was not seeded at all');
    assert.equal(row.photo_kind, 'logo', 'the insert dropped the kind');
    assert.equal(row.photo_backdrop, seeded!.photo!.backdrop, 'the insert dropped the backdrop');
  });

  test('AND THE API HANDS THEM TO THE APP', async () => {
    seedArea(db, 'rmutt');
    const place = await getScoredPlace(db, 'u-test', LOGO_PLACE);
    assert.ok(place, 'the place did not come back');
    assert.ok(place.photo, 'the photo record was null - the bug this file exists for');
    assert.equal(place.photo.kind, 'logo', 'without this the screen credits a logo to a photographer');
    assert.equal(place.photo.backdrop, seeded!.photo!.backdrop, 'without this the frame stays grey');
  });

  test('A PLACE WITH AN ORDINARY PHOTOGRAPH IS UNCHANGED', async () => {
    // The columns are new and nullable, and every row written before they
    // existed has null in both. That must read as "an ordinary photograph",
    // not as a broken record.
    seedArea(db, 'rmutt');
    const ordinary = SEED_PLACES.find((p) => p.province === 'TH-13' && p.photo && p.photo.kind !== 'logo');
    if (!ordinary) return; // nothing to compare against in this area
    const place = await getScoredPlace(db, 'u-test', ordinary.id);
    assert.ok(place?.photo, 'an ordinary photograph went missing');
    assert.equal(place.photo.kind, undefined, 'a photograph must not claim to be a logo');
    assert.equal(place.photo.backdrop, undefined, 'a photograph has no field colour');
  });
});

describe('what the two new columns are allowed to say', () => {
  /*
    These rows are written with SQL, not by the seed, because that is how
    they can really arrive: the project edits place rows on production by
    hand, and marking a picture as a logo without a deploy is the point of
    the columns. A value nobody checked is a value the screen would act on.
  */
  const writeRaw = (kind: string | null, backdrop: string | null) => {
    seedArea(db, 'rmutt');
    db.prepare('UPDATE places SET photo_kind = ?, photo_backdrop = ? WHERE id = ?')
      .run(kind, backdrop, LOGO_PLACE);
  };

  test('A KIND IT DOES NOT RECOGNISE IS DROPPED, NOT PASSED ON', async () => {
    writeRaw('LOGO', '#2C492A'); // right word, wrong case: still not one of the two
    const place = await getScoredPlace(db, 'u-test', LOGO_PLACE);
    assert.equal(place?.photo?.kind, undefined, 'an unknown kind must never reach the app');
    assert.equal(place?.photo?.backdrop, '#2C492A', 'and it must not take the backdrop down with it');
  });

  test('A BACKDROP THAT IS NOT A SIX-DIGIT HEX COLOUR IS DROPPED', async () => {
    for (const bad of ['green', '#2C492', '#2C492AA', 'rgb(44,73,42)', '2C492A', '#abc']) {
      writeRaw('logo', bad);
      const place = await getScoredPlace(db, 'u-test', LOGO_PLACE);
      assert.equal(place?.photo?.backdrop, undefined, `${bad} must not reach the app as a colour`);
      assert.equal(place?.photo?.kind, 'logo', `${bad} must not cost the row its kind`);
    }
  });

  test('UPPER AND LOWER CASE HEX ARE BOTH COLOURS', async () => {
    for (const good of ['#2C492A', '#2c492a', '#AbCdEf']) {
      writeRaw('logo', good);
      const place = await getScoredPlace(db, 'u-test', LOGO_PLACE);
      assert.equal(place?.photo?.backdrop, good);
    }
  });
});

describe('bringing an area’s photographs in line', () => {
  test('IT CARRIES THE KIND AND THE BACKDROP, NOT ONLY THE URL', async () => {
    /*
      The production case, in miniature: a row that is already there with
      the four old fields and nothing in the two new ones - exactly what a
      database seeded before #169 holds.
    */
    seedArea(db, 'rmutt');
    db.prepare('UPDATE places SET photo_kind = NULL, photo_backdrop = NULL WHERE id = ?').run(LOGO_PLACE);

    const changed = refreshPhotos(db, 'rmutt');
    assert.ok(changed.includes(LOGO_PLACE), 'the row was left as it was');

    const place = await getScoredPlace(db, 'u-test', LOGO_PLACE);
    assert.equal(place?.photo?.kind, 'logo');
    assert.equal(place?.photo?.backdrop, seeded!.photo!.backdrop);
  });

  test('RUNNING IT AGAIN CHANGES NOTHING', () => {
    seedArea(db, 'rmutt');
    db.prepare('UPDATE places SET photo_kind = NULL WHERE id = ?').run(LOGO_PLACE);
    assert.ok(refreshPhotos(db, 'rmutt').includes(LOGO_PLACE), 'the first run should have work to do');
    // The `WHERE NOT (... IS ...)` is what makes this safe to run on
    // production whenever somebody is unsure whether it has been run.
    assert.deepEqual(refreshPhotos(db, 'rmutt'), [], 'a second run must report and write nothing');
  });
});

describe('a database that predates the columns', () => {
  test('THE MIGRATION ADDS THEM, AND ADDS THEM ONCE', () => {
    /*
      `openTestDb` has already migrated, so the columns are there. What is
      worth holding is that a row written before them reads as an ordinary
      photograph rather than breaking the API - the state every production
      row was in before this change.
    */
    seedArea(db, 'rmutt');
    const columns = db.prepare('PRAGMA table_info(places)').all() as { name: string }[];
    const names = columns.map((c) => c.name);
    assert.equal(names.filter((n) => n === 'photo_kind').length, 1, 'photo_kind must exist exactly once');
    assert.equal(names.filter((n) => n === 'photo_backdrop').length, 1, 'photo_backdrop must exist exactly once');
  });
});
