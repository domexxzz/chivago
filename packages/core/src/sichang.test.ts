import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';
import { KOH_SICHANG_BBOX, KU_SRIRACHA_BBOX, areaByKey, areaOfPlace, inArea } from './areas.ts';
import { ACTIVE_QUESTS, SAFETY_PHRASES, SEED_HOSTS, SEED_PLACES, SEED_QUESTS } from './seed.ts';

const area = areaByKey('koh-sichang');
const places = SEED_PLACES.filter((p) => areaOfPlace(p) === 'koh-sichang');

/** Centres and IDs checked against OSM features through Overpass. */
const mapped = [
  ['sc-pier', 'Quest', 13.161443, 100.810441, 'way 40354093'],
  ['sc-hospital', 'Safe', 13.163311, 100.807704, 'way 412192327'],
  ['sc-thamphang', 'Green', 13.1454, 100.806835, 'way 242270752'],
  ['sc-palace', 'Wellness', 13.14909, 100.818436, 'way 40443539'],
  ['sc-shops', 'Food', 13.160059, 100.809817, 'way 412192126'],
  // The one unnamed feature on the list: `building=yes, tourism=aquarium`,
  // read on 2026-10-24. The signboard 33 m away names it ชลทัศนสถาน, which
  // is where the place's own name comes from - see SEED_PLACES.
  ['sc-marinestation', 'Green', 13.1521963, 100.8147057, 'way 412143703'],
] as const;

/** Every layer the island map can filter by. */
const LAYERS = ['Food', 'Green', 'Quest', 'Safe', 'Wellness'];

describe('Koh Sichang', () => {
  test('is its own area in Chon Buri, clear of the Si Racha campus', () => {
    assert.equal(area.province, 'TH-20');
    assert.equal(area.map, 'campus');
    assert.deepEqual(area.bbox, KOH_SICHANG_BBOX);
    // Twelve kilometres of sea between them; the margins must not meet either.
    assert.ok(KOH_SICHANG_BBOX.maxLng + 0.04 < KU_SRIRACHA_BBOX.minLng);
  });

  test('every place is a real mapped feature, and the five map layers are covered', () => {
    assert.equal(places.length, mapped.length);
    assert.deepEqual([...new Set(mapped.map(([, layer]) => layer))].sort(), LAYERS);
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

  test('no air station or named business is claimed', () => {
    for (const p of places) {
      assert.equal(p.airStation, undefined, `${p.id} claims a PCD station`);
    }
    // The food place is the shop row by the pier, not one shop that never agreed.
    assert.doesNotMatch(places.find((p) => p.id === 'sc-shops')!.name.en, /7-Eleven/);
  });

  /*
    THE ISLAND HAS ITS PHOTOGRAPHS, and this is what each one has to carry.

    It opened with none: `photo: null` on all five, asserted here, because
    no photograph of Koh Sichang existed that anybody had the right to
    publish, and an unlicensed one is worse than an empty frame. The team
    went and took them, and on 24 October the owner confirmed all five are
    the team's own - so the assertion that held the gap open has done its
    job and gone.

    What it was protecting has not. `credit` and `licence` are not metadata:
    they are printed under the picture on the place screen, in the
    traveller's language, and a wrong one is the app claiming a right it
    does not have about a real place. So the shape of the claim is held
    instead of the absence of the picture, which also means the next
    photograph needs no edit here.

    ONE THING THE PICTURES DID NOT CHANGE. `sc-shops` is the shop ROW by
    the pier, and its photograph is one storefront in that row - weighed,
    and the owner's call. The title is a separate promise and still stands:
    the test above refuses a business's name in it, so whatever the picture
    shows, the place never becomes one shop's listing.
  */
  test('every photograph on the island carries its credit, its licence and a source', () => {
    assert.ok(places.length > 0);
    for (const p of places) {
      assert.ok(p.photo, `${p.id} lost its photograph`);
      assert.match(p.photo.url, /^\/media\/places\/sc-[a-z0-9-]+\.jpg$/, `${p.id}: not an own-origin island photo`);
      assert.ok(p.photo.credit.trim(), `${p.id}: a photograph with no credit cannot be published`);
      assert.ok(p.photo.licence.trim(), `${p.id}: a photograph with no licence cannot be published`);
      assert.ok(p.photo.sourceUrl?.trim(), `${p.id}: no source for the photograph`);
    }
  });

  test('only the five field-trial quests are active; the two old samples remain historical', () => {
    const historical = SEED_QUESTS.filter((q) => ['q-sc-beach', 'q-sc-dropoff'].includes(q.id));
    assert.equal(historical.length, 2);
    for (const q of historical) {
      assert.equal(q.host.id, SEED_HOSTS.sichangTeam!.id, 'the municipality has not agreed to host');
      assert.equal(q.esgPillar, 'environmental');
      assert.equal(q.rewardCurrency, 'green');
      assert.match(q.name.th, /ตัวอย่าง/);
      assert.match(q.name.en, /sample/i);
    }

    assert.deepEqual(
      ACTIVE_QUESTS.map((q) => q.code).sort(),
      ['SG-01', 'SG-02', 'SG-03', 'SG-04', 'SG-05'],
    );
    assert.ok(ACTIVE_QUESTS.every((q) => inArea(area, q)));
  });
});
