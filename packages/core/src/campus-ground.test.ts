import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';

import { AREAS, areaByKey, inArea } from './areas.ts';
import { SEED_PLACES, SEED_TRANSIT } from './seed.ts';

const M_PER_DEG = 111_320;

describe('the ground a campus stands on', () => {
  test('the two on the Chao Phraya plain are flat, and the hillside one is not', () => {
    assert.equal(areaByKey('rmutt').flatGround, true);
    assert.equal(areaByKey('ku-bangkhen').flatGround, true);
    assert.ok(!areaByKey('ku-sriracha').flatGround, 'Si Racha climbs 180 m to the Sapandao ridge');
  });

  test('no island is flat', () => {
    for (const area of AREAS) if (area.map === 'island') assert.ok(!area.flatGround, area.key);
  });
});

describe("RMUTT's frame", () => {
  const area = areaByKey('rmutt');
  const eastWestM = (lng: number) =>
    Math.abs(lng - area.frameCenter!.lng) * M_PER_DEG * Math.cos((area.center.lat * Math.PI) / 180);

  test('holds every seeded place on the campus', () => {
    const b = area.bbox;
    const onCampus = SEED_PLACES.filter((q) => inArea(area, q)
      && q.lat >= b.minLat && q.lat <= b.maxLat && q.lng >= b.minLng && q.lng <= b.maxLng);
    assert.equal(onCampus.length, 5);
    for (const q of onCampus) assert.ok(eastWestM(q.lng) <= area.spanM! / 2, q.id);
  });

  test('holds every bus stop at its edge', () => {
    const stops = SEED_TRANSIT.filter((r) => r.id === 'smartbus-538').flatMap((r) => r.stops);
    assert.equal(stops.length, 4);
    for (const s of stops) assert.ok(eastWestM(s.lng) <= area.spanM! / 2, s.id);
  });
});
