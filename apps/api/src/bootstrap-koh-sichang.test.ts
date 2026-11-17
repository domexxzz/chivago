import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { openTestDb } from './db-node.ts';
import {
  bootstrapKohSichangBusinesses, KOH_SICHANG_ATTRACTIONS, KOH_SICHANG_BUSINESSES,
  KOH_SICHANG_SUPERSEDED,
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
      attractionsInserted: KOH_SICHANG_ATTRACTIONS.length, attractionsAlreadyPresent: 0,
      attractionsCorrected: [], attractionsLeftAlone: [], skipped: false,
    });

    const second = bootstrapKohSichangBusinesses(db, env);
    assert.deepEqual(second, {
      accountCreated: false, shopsInserted: 0, shopsAlreadyPresent: KOH_SICHANG_BUSINESSES.length,
      attractionsInserted: 0, attractionsAlreadyPresent: KOH_SICHANG_ATTRACTIONS.length,
      attractionsCorrected: [], attractionsLeftAlone: [], skipped: false,
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
      attractionsInserted: KOH_SICHANG_ATTRACTIONS.length, attractionsAlreadyPresent: 0,
      attractionsCorrected: [], attractionsLeftAlone: [], skipped: false,
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

describe('correcting a landmark that was already live', () => {
  /*
    THE SITUATION THIS REPRODUCES, which is the only reason the code exists.
    On 17 November `sc-chong-khao-khat` was planted with coordinates read off
    an OpenStreetMap viewpoint node. Hours later the seed was corrected to the
    Thailand Digital Tourism Center's official ones. The bootstrap is
    insert-only, so two deploys since have left the live pin where it was.

    Every test below starts from a database holding the OLD row, because a
    test that starts from an empty one proves nothing about production: an
    empty database takes the insert path, which was never the broken one.
  */
  const plantTheOldRow = (db: ReturnType<typeof openTestDb>) => {
    const old = KOH_SICHANG_SUPERSEDED[0]!;
    db.prepare(`INSERT INTO places
      (id, name_en, name_th, short, layer, province, lat, lng, meta, blurb_en, blurb_th,
       tags, photo_url, photo_credit, photo_licence, photo_source, safety_label_en,
       safety_label_th, crowd_density, aqi, safety_index, walkability)
      VALUES (?, ?, ?, ?, ?, 'TH-20', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1.5, 40, 6.0, 6.0)`).run(
      // Copied from a20f304, the seed the live row was actually created from.
      old.id, old.nameEn, 'ช่องเขาขาด', 'Khao Khat', 'Green',
      old.lat, old.lng, 'Ko Sichang attraction · Air modelled',
      'The gap through the ridge on the west coast, formally Chong Itsariyaphon, looking out over open sea towards the sunset.',
      'ช่องเขาริมฝั่งตะวันตก ชื่อทางการคือช่องอิศริยาภรณ์ มองออกไปเห็นทะเลเปิด เป็นจุดชมพระอาทิตย์ตก',
      JSON.stringify(['Viewpoint', 'Sunset', 'Walking']), '', '', '', '',
      'Cliff edge, keep back', 'ริมหน้าผา ควรอยู่ห่างขอบ',
    );
    return old;
  };

  const liveRow = (db: ReturnType<typeof openTestDb>, id: string) =>
    db.prepare('SELECT name_en, name_th, lat, lng, meta, tags, photo_url FROM places WHERE id = ?').get(id) as {
      name_en: string; name_th: string; lat: number; lng: number;
      meta: string | null; tags: string; photo_url: string | null;
    };

  test('every superseded entry still names a place the seed can correct it to', () => {
    for (const old of KOH_SICHANG_SUPERSEDED) {
      const seed = KOH_SICHANG_ATTRACTIONS.find((a) => a.id === old.id);
      assert.ok(seed, `${old.id} is listed as superseded but is no longer in the seed`);
      // A superseded value equal to the current one would be a list entry that
      // can never match anything: dead weight pretending to be a correction.
      const same = seed.nameEn === old.nameEn && seed.lat === old.lat && seed.lng === old.lng;
      assert.equal(same, false, `${old.id} records a superseded value identical to the seed`);
    }
  });

  /*
    THE LIMIT OF EVERY TEST BELOW, stated because it cost a deploy to learn.
    `plantTheOldRow` plants whatever `KOH_SICHANG_SUPERSEDED` says, so these
    tests prove the MECHANISM and can say nothing about whether the recorded
    value is the one production holds. The first version recorded the name
    from the commit that introduced the entry rather than the commit that was
    deployed, every test here passed, and the correction did not apply.

    What catches that is the deploy log, which now prints both rows side by
    side when they disagree. A fingerprint is archaeology, and archaeology is
    checked against the site, not against the notebook.
  */
  test('a row still holding what was planted is rewritten from the seed', () => {
    const db = openTestDb();
    const old = plantTheOldRow(db);
    const before = liveRow(db, old.id);
    assert.equal(before.lat, old.lat, 'the test must start from the wrong value');

    const result = bootstrapKohSichangBusinesses(db, { CHIVAGO_BOOTSTRAP_KOH_SICHANG: '1' } as NodeJS.ProcessEnv);
    assert.deepEqual(result.attractionsCorrected, [old.id]);
    assert.deepEqual(result.attractionsLeftAlone, []);

    const seed = KOH_SICHANG_ATTRACTIONS.find((a) => a.id === old.id)!;
    const after = liveRow(db, old.id);
    assert.equal(after.lat, seed.lat);
    assert.equal(after.lng, seed.lng);
    assert.equal(after.name_en, seed.nameEn);
    assert.equal(after.name_th, seed.nameTh);
    assert.equal(after.meta, seed.meta);
    assert.deepEqual(JSON.parse(after.tags), seed.tags);
    // The empty strings the old seed wrote are a half photo record, which
    // repo.ts refuses to ship. The correction clears them to null.
    assert.equal(after.photo_url, null);
  });

  test('running it again corrects nothing, with no flag to remember', () => {
    const db = openTestDb();
    const old = plantTheOldRow(db);
    const env1 = { CHIVAGO_BOOTSTRAP_KOH_SICHANG: '1' } as NodeJS.ProcessEnv;
    assert.deepEqual(bootstrapKohSichangBusinesses(db, env1).attractionsCorrected, [old.id]);

    const again = bootstrapKohSichangBusinesses(db, env1);
    assert.deepEqual(again.attractionsCorrected, []);
    assert.deepEqual(again.attractionsLeftAlone, []);
  });

  test('a pin somebody has moved is left exactly where they put it', () => {
    const db = openTestDb();
    const old = plantTheOldRow(db);
    // Somebody walked to the gap and dropped the pin where they were standing.
    db.prepare('UPDATE places SET lat = ?, lng = ? WHERE id = ?').run(13.1627, 100.8015, old.id);

    const result = bootstrapKohSichangBusinesses(db, { CHIVAGO_BOOTSTRAP_KOH_SICHANG: '1' } as NodeJS.ProcessEnv);
    assert.deepEqual(result.attractionsCorrected, []);
    assert.deepEqual(result.attractionsLeftAlone, [old.id], 'an edited row must be reported, not silently skipped');

    const after = liveRow(db, old.id);
    assert.equal(after.lat, 13.1627);
    assert.equal(after.lng, 100.8015);
    assert.equal(after.name_en, old.nameEn, 'nothing else may be rewritten either');
  });

  test('the recorded name is the one the deployed seed used, not the first one', () => {
    /*
      The entry went through three states: planted as 'Itsariyaphon Pass',
      renamed to 'Chong Khao Khat' with the position untouched, then the
      position corrected. A fingerprint taken from the first state matches a
      row that was created in the second, which is to say it matches nothing.
      This pins the pair that identifies the real row: the CURRENT name with
      the SUPERSEDED position.
    */
    const old = KOH_SICHANG_SUPERSEDED.find((x) => x.id === 'sc-chong-khao-khat')!;
    const seed = KOH_SICHANG_ATTRACTIONS.find((a) => a.id === 'sc-chong-khao-khat')!;
    assert.equal(old.nameEn, seed.nameEn, 'the rename landed before the deploy that created the row');
    assert.notEqual(old.lat, seed.lat, 'the position is what is actually being corrected');
  });

  test('a renamed row is left alone even though the pin never moved', () => {
    const db = openTestDb();
    const old = plantTheOldRow(db);
    db.prepare('UPDATE places SET name_en = ? WHERE id = ?').run('Khao Khat Gap', old.id);

    const result = bootstrapKohSichangBusinesses(db, { CHIVAGO_BOOTSTRAP_KOH_SICHANG: '1' } as NodeJS.ProcessEnv);
    assert.deepEqual(result.attractionsLeftAlone, [old.id]);
    assert.equal(liveRow(db, old.id).name_en, 'Khao Khat Gap');
  });
});
