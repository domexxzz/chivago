import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

import {
  AREAS, DEFAULT_AREA, KU_SRIRACHA_BBOX, areaByKey, areaOfProvince, inArea, isAreaKey, nearestArea,
} from './areas.ts';
import { CHECKIN_RADIUS_M, SEED_HOSTS, SEED_PLACES, SEED_QUESTS } from './seed.ts';
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

  test("every campus photograph is the team's own, credited, and ships with the app", () => {
    // Wikimedia Commons, both Wikipedias, Openverse and Wikidata had no
    // photograph of the campus (checked 2026-09-05 and again on the 8th),
    // only faculty logos. The team's own photographs, taken on the campus,
    // are the honest fill: each carries its credit, and its address is a
    // path inside the app's own export rather than somebody else's server.
    // That the file is really there is checked where the files live
    // (apps/mobile/test/place-photos.test.ts).
    /*
      A campus place has the team's own photograph or NONE. The rule this
      test exists for is that no campus photograph comes from nowhere, and
      an empty slot breaks that rule in neither direction: the card draws
      its habitat and says it has no photograph, which is true.

      Building 13 arrived on the evening of 8 September, hours after the
      organisers moved the hackathon into it, and nobody has been inside to
      photograph it. A stock sports hall would be a picture of somewhere
      else.
    */
    for (const p of kuPlaces) {
      if (!p.photo) continue;
      assert.match(p.photo.url, /^\/assets\/places\/[a-z0-9-]+\.jpg$/, `${p.id}: a campus photo must ship with the app`);
      assert.match(p.photo.credit, /ChivaGo team/, `${p.id}: not the team's photograph`);
      assert.ok(p.photo.licence && p.photo.sourceUrl, `${p.id}: no licence or source`);
    }
    // And the gap is visible rather than silent: exactly one, named.
    assert.deepEqual(kuPlaces.filter((p) => !p.photo).map((p) => p.id), ['ku-building13']);
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

/**
 * The hackathon venue.
 *
 * The organisers moved Sriracha Hackathon 2026 out of the library and into
 * building 13 on the evening of 8 September, and people are meant to check in
 * there to try the app. Coordinates from the Google Maps link in that
 * announcement, not from the building's name.
 */
describe('building 13, where the hackathon actually is', () => {
  const hall = SEED_PLACES.find((p) => p.id === 'ku-building13')!;

  test('it is on the campus, inside the outline like every other campus place', () => {
    assert.ok(hall, 'the venue is missing from the seed');
    assert.ok(inArea(ku, hall));
    assert.equal(hall.province, 'TH-20');
  });

  test('the coordinates are the ones from the announcement', () => {
    // 13.1234148 / 100.9183455, the destination of maps.app.goo.gl/mkjEfXtv7Xqm374z6.
    assert.equal(hall.lat, 13.1234148);
    assert.equal(hall.lng, 100.9183455);
  });

  test('it is a short walk from the library it replaced', () => {
    const library = SEED_PLACES.find((p) => p.id === 'ku-library')!;
    const m = metresBetween(hall, library);
    assert.ok(m < 400, `${Math.round(m)} m from the old venue, which is not "near"`);
  });

  test('its air comes from the same ground station as the rest of the campus', () => {
    assert.equal(hall.airStation!.id, 'o61');
    assert.ok(metresBetween(hall, hall.airStation!) < 1000);
  });

  test('the check-in fence reaches it, so somebody standing there can check in', () => {
    assert.ok(CHECKIN_RADIUS_M >= 100, 'a hall needs a fence a person can stand inside');
  });
});
