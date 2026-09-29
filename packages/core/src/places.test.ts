import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';
import { areaByKey, inArea } from './areas.ts';
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

  test('no unmapped air station or unlicensed photograph is claimed', () => {
    for (const p of places) {
      assert.equal(p.airStation, undefined, `${p.id} claims an unconfirmed PCD station`);
      assert.equal(p.photo, null, `${p.id} claims a photograph nobody supplied`);
      assert.match(p.meta, /Air modelled|Campus landmark|Central campus/);
    }
  });

  test('the local team hosts a walking quest without calling it environmental work', () => {
    const quests = SEED_QUESTS.filter((q) => inArea(area, q));
    assert.equal(quests.length, 1);
    assert.equal(quests[0]!.host.id, SEED_HOSTS.kuBangkhen!.id);
    assert.equal(quests[0]!.host.name, 'ChivaGo team · KU Bangkhen');
    assert.equal(quests[0]!.rewardCurrency, 'trip');
    assert.equal(quests[0]!.geofenceRadiusM, 100);
  });
});
