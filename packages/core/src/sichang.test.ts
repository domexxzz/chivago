import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';
import { KOH_SICHANG_BBOX, KU_SRIRACHA_BBOX, areaByKey, areaOfPlace, inArea } from './areas.ts';
import { SAFETY_PHRASES, SEED_HOSTS, SEED_PLACES, SEED_QUESTS } from './seed.ts';

const area = areaByKey('koh-sichang');
const places = SEED_PLACES.filter((p) => areaOfPlace(p) === 'koh-sichang');

/** Centres and IDs checked against named OSM features on 2026-10-23. */
const mapped = [
  ['sc-pier', 'Quest', 13.161443, 100.810441, 'way 40354093'],
  ['sc-hospital', 'Safe', 13.163311, 100.807704, 'way 412192327'],
  ['sc-thamphang', 'Green', 13.1454, 100.806835, 'way 242270752'],
  ['sc-palace', 'Wellness', 13.14909, 100.818436, 'way 40443539'],
  ['sc-shops', 'Food', 13.160059, 100.809817, 'way 412192126'],
] as const;

describe('Koh Sichang', () => {
  test('is its own area in Chon Buri, clear of the Si Racha campus', () => {
    assert.equal(area.province, 'TH-20');
    assert.equal(area.map, 'campus');
    assert.deepEqual(area.bbox, KOH_SICHANG_BBOX);
    // Twelve kilometres of sea between them; the margins must not meet either.
    assert.ok(KOH_SICHANG_BBOX.maxLng + 0.04 < KU_SRIRACHA_BBOX.minLng);
  });

  test('five real features cover the five map layers, inside the island frame', () => {
    assert.equal(places.length, 5);
    for (const [id, layer, lat, lng, osm] of mapped) {
      const p = places.find((candidate) => candidate.id === id);
      assert.ok(p, `${osm} has no place`);
      assert.equal(p.layer, layer);
      assert.equal(p.province, 'TH-20');
      assert.deepEqual([p.lat, p.lng], [lat, lng], `${id} moved away from ${osm}`);
      assert.ok(inArea(area, p));
      assert.ok(SAFETY_PHRASES[id], `${id} has no safety phrase`);
    }
  });

  test('no air station, photograph or named business is claimed', () => {
    for (const p of places) {
      assert.equal(p.airStation, undefined, `${p.id} claims a PCD station`);
      assert.equal(p.photo, null, `${p.id} claims a photograph nobody supplied`);
    }
    // The food place is the shop row by the pier, not one shop that never agreed.
    assert.doesNotMatch(places.find((p) => p.id === 'sc-shops')!.name.en, /7-Eleven/);
  });

  test('the sample waste quests are the team\'s, environmental, and say they are samples', () => {
    const quests = SEED_QUESTS.filter((q) => inArea(area, q));
    assert.deepEqual(quests.map((q) => q.id).sort(), ['q-sc-beach', 'q-sc-dropoff']);
    for (const q of quests) {
      assert.equal(q.host.id, SEED_HOSTS.sichangTeam!.id, 'the municipality has not agreed to host');
      assert.equal(q.esgPillar, 'environmental');
      assert.equal(q.rewardCurrency, 'green');
      assert.match(q.name.th, /ตัวอย่าง/);
      assert.match(q.name.en, /sample/i);
    }
  });
});
