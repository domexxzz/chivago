import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

import {
  AREAS, DEFAULT_AREA, KU_SRIRACHA_BBOX, RMUTT_BBOX, areaByKey, areaOfProvince, inArea, isAreaKey, nearestArea,
} from './areas.ts';
import { CHECKIN_RADIUS_M, SEED_HOSTS, SEED_PLACES, SEED_QUESTS } from './seed.ts';
import { CAMPUS_LEG_MIN_M, LEG_MIN_M, lowCarbonLeg } from './low-carbon.ts';
import { QUEST_RADIUS_MAX_M, metresBetween } from './presence.ts';
import { openProvinces } from './provinces.ts';

const ku = areaByKey('ku-sriracha');
const samui = areaByKey('samui');
const rmutt = areaByKey('rmutt');
const rmuttPlaces = SEED_PLACES.filter((p) => p.province === 'TH-13');
const kuPlaces = SEED_PLACES.filter((p) => p.province === 'TH-20');
const kuQuests = SEED_QUESTS.filter((q) => inArea(ku, q));

describe('three areas, derived from provinces', () => {
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
    assert.equal(nearestArea(14.03556, 100.72635).key, 'rmutt');
    // Bangkok is closer to Thanyaburi than to either of the others - it was
    // Si Racha's until Thanyaburi opened 40 km up the road.
    assert.equal(nearestArea(13.7563, 100.5018).key, 'rmutt');
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
      Every one of them again, including Building 13.

      It spent an evening with an empty slot - it was added hours after the
      organisers moved the hackathon into it, and nobody had been inside to
      photograph it. The card said so in words rather than borrowing a stock
      sports hall, and the test allowed the gap by name. The photograph
      arrived the same night, so the rule is back to what it should be: a
      campus place has the team's own photograph, or this fails.
    */
    for (const p of kuPlaces) {
      assert.ok(p.photo, `${p.id} has no photograph`);
      assert.match(p.photo.url, /^\/assets\/places\/[a-z0-9-]+\.jpg$/, `${p.id}: a campus photo must ship with the app`);
      assert.match(p.photo.credit, /ChivaGo team/, `${p.id}: not the team's photograph`);
      assert.ok(p.photo.licence && p.photo.sourceUrl, `${p.id}: no licence or source`);
    }
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


/**
 * The Thanyaburi campus.
 *
 * Read from OpenStreetMap on 2026-09-14, the same way Si Racha was: the
 * grounds are way 910034983, and every place is a mapped feature inside that
 * outline. What is DIFFERENT from Si Racha is the honest part - there is no
 * ground station within reach and there are no photographs yet - and these
 * hold that difference in place rather than letting it drift into a claim.
 */
describe('the Thanyaburi campus is real, and says what it does not have', () => {
  test('five places, one per layer, every one inside the OpenStreetMap outline', () => {
    assert.equal(rmuttPlaces.length, 5);
    assert.deepEqual(
      [...new Set(rmuttPlaces.map((p) => p.layer))].sort(),
      ['Food', 'Green', 'Quest', 'Safe', 'Wellness'],
    );
    for (const p of rmuttPlaces) {
      assert.ok(
        p.lat >= RMUTT_BBOX.minLat && p.lat <= RMUTT_BBOX.maxLat
        && p.lng >= RMUTT_BBOX.minLng && p.lng <= RMUTT_BBOX.maxLng,
        `${p.id} is outside the campus outline`,
      );
      assert.ok(inArea(rmutt, p));
      assert.ok(!inArea(ku, p) && !inArea(samui, p), `${p.id} is in more than one area`);
    }
  });

  test('no place claims a ground station, because the nearest is 13 km away', () => {
    // Si Racha's station is 300 m from its centre and every place there
    // carries it. Thanyaburi's nearest is Air4Thai 20t at 13.1 km, which
    // cannot speak for a courtyard. Carrying it anyway would put the word
    // "measured" on a number that is modelled.
    for (const p of rmuttPlaces) {
      assert.ok(!p.airStation, `${p.id} claims a ground station this campus does not have`);
    }
  });

  test('no place claims a photograph nobody has taken', () => {
    // The rule is that every photograph carries a real credit and licence.
    // Nobody has been here with a camera, so the honest value is null and
    // the card says so in words. This fails the day a picture appears
    // without its credit.
    for (const p of rmuttPlaces) {
      assert.equal(p.photo, null, `${p.id} has a photograph - it now needs a credit and a licence`);
    }
  });
});

/**
 * The floor that killed the walk.
 *
 * `LEG_MIN_M` was 800 m for every area, measured between beaches. Both
 * campuses are smaller than that end to end, so no leg on either could ever
 * qualify: the ledger paid nothing, and the egg that hatches on a walked leg
 * could not hatch. The mechanic was on screen with nothing behind it, which
 * is the exact failure the threshold's own comment warns about.
 */
describe('an area can produce a walk inside itself', () => {
  const furthestApartIn = (area: typeof samui): number => {
    const places = SEED_PLACES.filter((p) => inArea(area, p));
    return Math.max(...places.flatMap((a) => places.map((b) => metresBetween(a, b))));
  };

  test('every area is bigger than its own floor, or the mechanic is dead there', () => {
    for (const area of AREAS) {
      const furthest = furthestApartIn(area);
      assert.ok(
        furthest >= area.legMinM,
        `${area.key}: the two furthest places are ${Math.round(furthest)} m apart `
        + `and the floor is ${area.legMinM} m, so no walk here can ever qualify`,
      );
    }
  });

  test('the island keeps the figure it was measured with', () => {
    assert.equal(samui.legMinM, LEG_MIN_M);
    assert.equal(LEG_MIN_M, 800);
  });

  test('both campuses use the campus figure, and it is not merely smaller', () => {
    assert.equal(ku.legMinM, CAMPUS_LEG_MIN_M);
    assert.equal(rmutt.legMinM, CAMPUS_LEG_MIN_M);
    // Short enough to be reachable, long enough to still be somewhere else.
    assert.ok(CAMPUS_LEG_MIN_M >= 100, 'anything shorter is the next room');
    assert.ok(CAMPUS_LEG_MIN_M < LEG_MIN_M);
  });

  test('the longest walk on the Thanyaburi campus qualifies, and would not have', () => {
    const stadium = rmuttPlaces.find((p) => p.id === 'rmutt-stadium')!;
    const fountain = rmuttPlaces.find((p) => p.id === 'rmutt-fountain')!;
    const at = (mins: number) => new Date(Date.UTC(2026, 8, 14, 3, mins));
    const leg = (min: number) => lowCarbonLeg(
      { placeId: stadium.id, lat: stadium.lat, lng: stadium.lng, at: at(0) },
      { placeId: fountain.id, lat: fountain.lat, lng: fountain.lng, at: at(12) },
      min,
    );
    assert.equal(leg(CAMPUS_LEG_MIN_M).verdict, 'ok');
    assert.equal(leg(LEG_MIN_M).verdict, 'too-short');
  });

  test('the speed cap still does its job at campus scale', () => {
    // A shorter floor must not become a way to be paid for a ride. Same two
    // places, same distance, one minute apart: nobody walks that.
    const stadium = rmuttPlaces.find((p) => p.id === 'rmutt-stadium')!;
    const fountain = rmuttPlaces.find((p) => p.id === 'rmutt-fountain')!;
    const at = (mins: number) => new Date(Date.UTC(2026, 8, 14, 3, mins));
    const rushed = lowCarbonLeg(
      { placeId: stadium.id, lat: stadium.lat, lng: stadium.lng, at: at(0) },
      { placeId: fountain.id, lat: fountain.lat, lng: fountain.lng, at: at(1) },
      CAMPUS_LEG_MIN_M,
    );
    assert.equal(rushed.verdict, 'too-fast');
  });
});
