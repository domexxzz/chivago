import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';
import { areaByKey, inArea } from './areas.ts';
import { metresBetween } from './presence.ts';
import { SEED_HOSTS, SEED_PLACES, SEED_QUESTS } from './seed.ts';

const area = areaByKey('ku-bangkhen');
const places = SEED_PLACES.filter((p) => p.province === 'TH-10');

/** Centres and IDs checked against named OSM features on 2026-09-28. */
const mapped = [
  ['ku-bk-library', 'Safe', 13.8476433, 100.5718353, 'way 589727993'],
  ['ku-bk-park', 'Green', 13.8498175, 100.5661669, 'way 259496906'],
  ['ku-bk-auditorium', 'Quest', 13.8413167, 100.5747727, 'way 259685345'],
  ['ku-bk-stadium', 'Wellness', 13.8471882, 100.5657358, 'way 1313552698'],
  ['ku-bk-canteen', 'Food', 13.8488140, 100.5673153, 'way 389998960'],
] as const;

describe('KU Bangkhen mapped places', () => {
  test('five real features cover the five map layers, inside the campus frame', () => {
    assert.equal(places.length, 5);
    for (const [id, layer, lat, lng, osm] of mapped) {
      const p = places.find((candidate) => candidate.id === id);
      assert.ok(p, `${osm} has no place`);
      assert.equal(p.layer, layer);
      assert.deepEqual([p.lat, p.lng], [lat, lng], `${id} moved away from ${osm}`);
      assert.ok(inArea(area, p));
      assert.ok(p.lat >= area.bbox.minLat && p.lat <= area.bbox.maxLat);
      assert.ok(p.lng >= area.bbox.minLng && p.lng <= area.bbox.maxLng);
    }
  });

  test('every place carries the Kasetsart roadside station, at the distance it states', () => {
    // Air4Thai bkp73t, read from the feed on 2026-10-22: the nearest of 173
    // stations to every one of the five, 181 m from the auditorium and
    // 1,502 m from the 60th Park.
    for (const p of places) {
      assert.ok(p.airStation, `${p.id} has no air station`);
      assert.equal(p.airStation.id, 'bkp73t');
      assert.match(p.airStation.name, /roadside/, 'a roadside sensor must say so wherever it is named');
      const m = metresBetween(p, p.airStation);
      assert.ok(m < 1600, `${p.id} is ${Math.round(m)} m from bkp73t`);
      assert.ok(Math.abs(p.airStation.distanceKm - m / 1000) < 0.06, 'the stated distance is the real one');
    }
  });

  test('a card that talks about air says measured, how far, and roadside', () => {
    for (const p of places) {
      assert.doesNotMatch(p.meta, /Air modelled/, `${p.id} still says its air is modelled`);
      if (/Air/.test(p.meta)) {
        assert.ok(p.meta.includes(`Air measured ${p.airStation!.distanceKm} km away, roadside`), p.meta);
      }
    }
  });

  test('no unlicensed photograph is claimed', () => {
    for (const p of places) {
      assert.equal(p.photo, null, `${p.id} claims a photograph nobody supplied`);
    }
  });

  test('the local team hosts a walking quest without calling it environmental work', () => {
    const quests = SEED_QUESTS.filter((q) => inArea(area, q));
    assert.equal(quests.length, 1);
    assert.equal(quests[0]!.host.id, SEED_HOSTS.kuBangkhen!.id);
    assert.equal(quests[0]!.rewardCurrency, 'trip');
    assert.equal(quests[0]!.geofenceRadiusM, 100);
  });
});
