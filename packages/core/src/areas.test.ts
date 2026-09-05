import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

import {
  AREAS, DEFAULT_AREA, KU_SRIRACHA_BBOX, areaByKey, areaOfProvince, inArea, isAreaKey, nearestArea,
} from './areas.ts';
import { SEED_HOSTS, SEED_PLACES, SEED_QUESTS } from './seed.ts';
import { QUEST_RADIUS_MAX_M, metresBetween } from './presence.ts';
import { openProvinces } from './provinces.ts';

const ku = areaByKey('ku-sriracha');
const samui = areaByKey('samui');
const kuPlaces = SEED_PLACES.filter((p) => p.province === 'TH-20');
const kuQuests = SEED_QUESTS.filter((q) => inArea(ku, q));

describe('two areas, derived from provinces', () => {
  test('every open province has exactly one area, and every area an open province', () => {
    const open = openProvinces().map((p) => p.code).sort();
    assert.deepEqual(AREAS.map((a) => a.province).sort(), open);
  });

  test('a place lands in the area of its province', () => {
    assert.equal(areaOfProvince('TH-84'), 'samui');
    assert.equal(areaOfProvince('TH-20'), 'ku-sriracha');
    assert.equal(areaOfProvince('TH-10'), DEFAULT_AREA, 'a listed province falls back to the default');
  });

  test('the key check refuses what a URL might carry', () => {
    assert.ok(isAreaKey('ku-sriracha'));
    assert.ok(!isAreaKey('KU'));
    assert.ok(!isAreaKey(null));
  });

  test('the nearest area to each area is itself', () => {
    assert.equal(nearestArea(13.1205, 100.9205).key, 'ku-sriracha');
    assert.equal(nearestArea(9.5357, 100.0617).key, 'samui');
    // Bangkok is closer to the campus than to the island.
    assert.equal(nearestArea(13.7563, 100.5018).key, 'ku-sriracha');
  });
});

describe('the campus is real, and its seed stays inside it', () => {
  test('there are campus places, and every one is inside the OpenStreetMap outline', () => {
    assert.ok(kuPlaces.length >= 5, 'five places make a screen; fewer is a sketch');
    for (const p of kuPlaces) {
      assert.ok(
        p.lat >= KU_SRIRACHA_BBOX.minLat && p.lat <= KU_SRIRACHA_BBOX.maxLat
        && p.lng >= KU_SRIRACHA_BBOX.minLng && p.lng <= KU_SRIRACHA_BBOX.maxLng,
        `${p.id} is outside the campus outline`,
      );
      assert.ok(inArea(ku, p));
      assert.ok(!inArea(samui, p));
    }
  });

  test('every campus place carries the ground station, and it really is within a kilometre', () => {
    for (const p of kuPlaces) {
      assert.ok(p.airStation, `${p.id} has no air station`);
      assert.equal(p.airStation!.id, 'o61');
      const m = metresBetween(p, p.airStation!);
      assert.ok(m < 1000, `${p.id} is ${Math.round(m)} m from station o61, which is not "within reach"`);
      assert.ok(Math.abs(p.airStation!.distanceKm - m / 1000) < 0.4, 'the stated distance is roughly the real one');
    }
  });

  test('the island places carry no station: Samui has none', () => {
    for (const p of SEED_PLACES.filter((x) => x.province === 'TH-84')) {
      assert.ok(!p.airStation, `${p.id} claims a ground station Samui does not have`);
    }
  });

  test('no campus place claims a photograph nobody licensed', () => {
    // Wikimedia Commons had no photograph of the campus on 2026-09-05, only
    // faculty logos. The team's own photographs, used with permission, are
    // the honest fill - until then, null.
    for (const p of kuPlaces) assert.equal(p.photo, null, `${p.id} has a photo from nowhere`);
  });

  test('every layer has a campus place, so every companion can hatch there', () => {
    assert.deepEqual([...new Set(kuPlaces.map((p) => p.layer))].sort(), ['Food', 'Green', 'Quest', 'Safe', 'Wellness']);
  });
});

describe('the campus quests', () => {
  test('exist, are hosted by the team, and keep their fences at campus size', () => {
    assert.ok(kuQuests.length >= 1);
    for (const q of kuQuests) {
      assert.equal(q.host.id, SEED_HOSTS.kuTeam!.id, `${q.id} is not hosted by the team on campus`);
      assert.ok(q.geofenceRadiusM <= QUEST_RADIUS_MAX_M, `${q.id} fence ${q.geofenceRadiusM} m is wider than a site`);
    }
  });

  test('one of them pays Green, so the verification loop can be shown on campus', () => {
    assert.ok(kuQuests.some((q) => q.rewardCurrency === 'green' && q.esgPillar === 'environmental'));
  });
});
