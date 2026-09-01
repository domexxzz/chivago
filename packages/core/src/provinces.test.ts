import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

import {
  PROVINCES, PROVINCE_COUNT, REGIONS,
  findProvince, openProvinces, passportProgress, provincesIn,
} from './provinces.ts';

describe('the country, and whether we have it right', () => {
  test('there are exactly 77', () => {
    // The number a Thai reader knows without looking it up. A list that
    // quietly loses one is wrong in the way nobody notices until somebody
    // from that province opens the passport.
    assert.equal(PROVINCES.length, PROVINCE_COUNT);
  });

  test('every province is in exactly one region, and the regions add up', () => {
    const counted = REGIONS.reduce((n, r) => n + provincesIn(r.key).length, 0);
    assert.equal(counted, PROVINCE_COUNT, 'a province is in no region or in two');
  });

  test('the regional counts are the standard ones', () => {
    // 9 / 20 / 22 / 7 / 5 / 14 — Bangkok counted in Central.
    const expected: Record<string, number> = {
      north: 9, northeast: 20, central: 22, east: 7, west: 5, south: 14,
    };
    for (const region of REGIONS) {
      assert.equal(
        provincesIn(region.key).length, expected[region.key],
        `${region.name.en} has the wrong number of provinces`,
      );
    }
  });

  test('no duplicate codes and no duplicate names', () => {
    assert.equal(new Set(PROVINCES.map((p) => p.code)).size, PROVINCE_COUNT, 'duplicate code');
    assert.equal(new Set(PROVINCES.map((p) => p.name.th)).size, PROVINCE_COUNT, 'duplicate Thai name');
    assert.equal(new Set(PROVINCES.map((p) => p.name.en)).size, PROVINCE_COUNT, 'duplicate English name');
  });

  test('every code is a real ISO 3166-2:TH subdivision code', () => {
    // Kept to the standard so this joins to outside data later without a
    // translation table nobody maintains.
    for (const p of PROVINCES) {
      assert.match(p.code, /^TH-\d{2}$/, `${p.name.en} has a non-standard code`);
    }
  });

  test('every province is named in both languages', () => {
    for (const p of PROVINCES) {
      assert.ok(p.name.en.length > 2, `${p.code} has no English name`);
      assert.match(p.name.th, /[฀-๿]/, `${p.code} has no Thai name`);
    }
  });

  test('the provinces we claim to know are findable by code', () => {
    assert.equal(findProvince('TH-84')?.name.en, 'Surat Thani');
    assert.equal(findProvince('TH-20')?.name.th, 'ชลบุรี');
    assert.equal(findProvince('TH-99'), null);
  });
});

describe('open means we have something true to say', () => {
  test('only the provinces with real content are open', () => {
    // Two. Not seventy-seven with placeholder data, which is the failure this
    // status field exists to prevent.
    const open = openProvinces().map((p) => p.name.en).sort();
    assert.deepEqual(open, ['Chon Buri', 'Surat Thani']);
  });

  test('every province has a status, so none is silently half-built', () => {
    for (const p of PROVINCES) {
      assert.ok(['open', 'listed'].includes(p.status), `${p.name.en} has no status`);
    }
  });
});

describe('the passport counts against the whole country', () => {
  test('the denominator is 77, not the number we happen to have opened', () => {
    // "2 of 2" would flatter the app and lie about what collecting Thailand
    // means. The traveller is told the real size of the thing.
    const p = passportProgress(['TH-84']);
    assert.equal(p.visited, 1);
    assert.equal(p.total, 77);
    assert.equal(p.open, 2);
  });

  test('it breaks down by region, and the regions still add to 77', () => {
    const p = passportProgress(['TH-84', 'TH-20', 'TH-50']);
    assert.equal(p.byRegion.reduce((n, r) => n + r.total, 0), 77);
    assert.equal(p.byRegion.reduce((n, r) => n + r.visited, 0), 3);
    assert.equal(p.byRegion.find((r) => r.region.key === 'south')!.visited, 1);
    assert.equal(p.byRegion.find((r) => r.region.key === 'east')!.visited, 1);
  });

  test('an unknown code counts for nothing rather than throwing', () => {
    // Codes arrive from a server that may be ahead of this client.
    const p = passportProgress(['TH-84', 'TH-99', '']);
    assert.equal(p.visited, 1);
  });

  test('an empty passport is zero of seventy-seven', () => {
    const p = passportProgress([]);
    assert.equal(p.visited, 0);
    assert.equal(p.total, 77);
  });
});
