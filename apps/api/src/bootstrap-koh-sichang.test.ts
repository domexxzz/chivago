import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { openTestDb } from './db-node.ts';
import {
  bootstrapKohSichangBusinesses, KOH_SICHANG_ATTRACTIONS, KOH_SICHANG_BUSINESSES,
} from './bootstrap-koh-sichang.ts';

const env = {
  CHIVAGO_BOOTSTRAP_KOH_SICHANG: '1',
  CHIVAGO_BOOTSTRAP_KOH_SICHANG_BUSINESSES: '1',
  CHIVAGO_BOOTSTRAP_OPERATOR_PASSWORD: 'test-password-456123',
  CHIVAGO_BOOTSTRAP_OPERATOR_PHONE: '0000456123',
} as NodeJS.ProcessEnv;

describe('Ko Sichang production bootstrap', () => {
  test('creates the operator and inserts each business exactly once', () => {
    const db = openTestDb();
    const first = bootstrapKohSichangBusinesses(db, env);
    assert.deepEqual(first, {
      accountCreated: true, shopsInserted: KOH_SICHANG_BUSINESSES.length, shopsAlreadyPresent: 0,
      attractionsInserted: KOH_SICHANG_ATTRACTIONS.length, attractionsAlreadyPresent: 0, skipped: false,
    });

    const second = bootstrapKohSichangBusinesses(db, env);
    assert.deepEqual(second, {
      accountCreated: false, shopsInserted: 0, shopsAlreadyPresent: KOH_SICHANG_BUSINESSES.length,
      attractionsInserted: 0, attractionsAlreadyPresent: KOH_SICHANG_ATTRACTIONS.length, skipped: false,
    });
    const count = db.prepare("SELECT COUNT(*) AS n FROM local_shops WHERE area_key='koh-sichang'").get() as { n: number };
    assert.equal(count.n, KOH_SICHANG_BUSINESSES.length);
    const attractions = db.prepare("SELECT id, photo_url, photo_credit, photo_licence, photo_source FROM places WHERE id LIKE 'sc-%'").all() as {
      id: string; photo_url: string | null; photo_credit: string | null; photo_licence: string | null; photo_source: string | null;
    }[];
    assert.equal(attractions.length, KOH_SICHANG_ATTRACTIONS.length);
    /*
      WHOLE RECORD OR NO RECORD, which is the rule `repo.ts` states:

        "A photograph is only usable with its credit, so the whole record is
         present or the whole record is null. Half of one is not shippable."

      This test used to demand the record be PRESENT on every landmark, a
      stricter rule than the code enforces, and on 17 November it refused four
      landmarks that have no photograph anywhere. Commons holds no image of
      Laem Chakraphong, the Khao Khat pass, Kuan Yin Shrine or Wat Chuthathit:
      a geolocated search around the last two returns only photographs of a
      DIFFERENT shrine eighty metres away, and a search for "Chakrabongse"
      returns portraits of the prince the cape is named after. Either would
      have been a false caption, which is a worse failure than an honest
      blank.

      So the bar is unchanged wherever a photograph exists, and a landmark
      with none passes only with every field empty - never some of them.
    */
    for (const attraction of attractions) {
      const parts = [attraction.photo_url, attraction.photo_credit, attraction.photo_licence, attraction.photo_source];
      const filled = parts.filter((v) => v && v.trim() !== '').length;
      if (filled === 0) continue;
      assert.equal(filled, 4, `${attraction.id} has half a photo record, which is not shippable`);
      assert.match(attraction.photo_url ?? '', /^https:\/\//);
      assert.ok(attraction.photo_credit, `${attraction.id} has no photo credit`);
      assert.match(attraction.photo_licence ?? '', /^CC BY/);
      assert.match(attraction.photo_source ?? '', /^https:\/\/commons\.wikimedia\.org\//);
    }
  });

  test('does nothing when deployment configuration is disabled', () => {
    const db = openTestDb();
    assert.equal(bootstrapKohSichangBusinesses(db, {}).skipped, true);
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM user_accounts').get() as { n: number }).n, 0);
  });

  test('inserts public landmarks without requiring operator credentials', () => {
    const db = openTestDb();
    const result = bootstrapKohSichangBusinesses(db, { CHIVAGO_BOOTSTRAP_KOH_SICHANG: '1' } as NodeJS.ProcessEnv);
    assert.deepEqual(result, {
      accountCreated: false, shopsInserted: 0, shopsAlreadyPresent: 0,
      attractionsInserted: KOH_SICHANG_ATTRACTIONS.length, attractionsAlreadyPresent: 0, skipped: false,
    });
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM places').get() as { n: number }).n, KOH_SICHANG_ATTRACTIONS.length);
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM user_accounts').get() as { n: number }).n, 0);
  });

  /*
    ONE GAP IN THE RIDGE, NOT TWO.

    This test arrived expecting 'sc-chong-khao-khad'. The same place had been
    added hours earlier on the other side of the merge as
    'sc-chong-khao-khat' - ขาด transliterates with a t - and git kept one
    entry and the other's test, which is how main went red.

    The id kept is the one ALREADY IN THE PRODUCTION DATABASE. The bootstrap
    is insert-only: it skips an id it finds, so shipping the other spelling
    would not have replaced anything, it would have put a second pin twenty
    metres from the first and left the island with two gaps in one ridge.

    The RECORD kept is the one that arrived with this test, because it is
    better sourced: official coordinates from the Thailand Digital Tourism
    Center rather than an OpenStreetMap viewpoint node, both names in Thai,
    the provenance in `meta`, and the Landmark tag.

    WHAT THIS DOES NOT DO is correct the row that is already live. Insert-only
    means the deployed place keeps the coordinates it was created with, about
    twenty metres from these. For a gap in a ridge that is inside the error of
    standing in it; for anything that matters more, a seed edit is not enough
    and never was.
  */
  test('ships the two landmark additions with official coordinates and map taxonomy', () => {
    const db = openTestDb();
    bootstrapKohSichangBusinesses(db, { CHIVAGO_BOOTSTRAP_KOH_SICHANG: '1' } as NodeJS.ProcessEnv);
    const landmarks = db.prepare(`
      SELECT id, name_th, lat, lng, tags, meta, photo_url
      FROM places
      WHERE id IN ('sc-chong-khao-khat', 'sc-phra-lueang-chakraphong')
      ORDER BY id
    `).all() as {
      id: string; name_th: string; lat: number; lng: number; tags: string; meta: string; photo_url: string | null;
    }[];

    assert.deepEqual(landmarks.map((place) => place.id), [
      'sc-chong-khao-khat',
      'sc-phra-lueang-chakraphong',
    ]);
    assert.deepEqual(
      landmarks.map(({ id, name_th, lat, lng }) => ({ id, name_th, lat, lng })),
      [
        { id: 'sc-chong-khao-khat', name_th: 'ช่องเขาขาด (ช่องอิศริยาภรณ์)', lat: 13.16246, lng: 100.80146 },
        { id: 'sc-phra-lueang-chakraphong', name_th: 'พระเหลือง–วัดถ้ำจักรพงษ์', lat: 13.15779, lng: 100.80618 },
      ],
    );
    for (const landmark of landmarks) {
      assert.ok((JSON.parse(landmark.tags) as string[]).includes('Landmark'));
      assert.match(landmark.meta, /Thailand Digital Tourism Center attraction 21(?:533|351)/);
    }
    assert.equal(landmarks[0]?.photo_url, null, 'an unlicensed government-directory image must not be published');
    assert.match(landmarks[1]?.photo_url ?? '', /^https:\/\/upload\.wikimedia\.org\//);
    db.close();
  });

  test('production deploy keeps the insert-only landmark bootstrap enabled on server start', () => {
    const fly = readFileSync(new URL('../../../fly.toml', import.meta.url), 'utf8');
    const server = readFileSync(new URL('./server.ts', import.meta.url), 'utf8');
    assert.match(fly, /CHIVAGO_BOOTSTRAP_KOH_SICHANG\s*=\s*"1"/);
    assert.match(server, /bootstrapKohSichangBusinesses\(db\)/);
  });
});
