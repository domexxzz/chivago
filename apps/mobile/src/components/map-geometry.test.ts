import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

import { SAMUI_BBOX, SEED_PLACES, computeHealthyScore, type ScoredPlace } from '@chivago/core';
import { CHIP, layoutPins, mistCircles, project, tilt } from './map-geometry.ts';

/**
 * The island's places only. The projection is Samui's bounding box and the
 * silhouette is Samui's; the campus (TH-20) is drawn by a different map
 * and would land in the Gulf of Thailand here, which is the point.
 */
const ISLAND_PLACES = SEED_PLACES.filter((p) => p.province === 'TH-84');

const W = 390;
const H = 344;

const scored: ScoredPlace[] = ISLAND_PLACES.map((p) => {
  const breakdown = computeHealthyScore(p.metrics);
  // Geometry does not read ratings; an empty roll-up keeps the fixture
  // honest without pretending these seeded places have reviews.
  const reviews = { count: 0, average: null, distribution: [0, 0, 0, 0, 0] } as const;
  return { ...p, healthyScore: breakdown.total, breakdown, reviews: { ...reviews, distribution: [...reviews.distribution] as [number, number, number, number, number] } };
});

describe('projection', () => {
  test('the island centre lands near the middle of the viewport', () => {
    const centreLat = (SAMUI_BBOX.minLat + SAMUI_BBOX.maxLat) / 2;
    const centreLng = (SAMUI_BBOX.minLng + SAMUI_BBOX.maxLng) / 2;
    const { x, y } = project(centreLat, centreLng);
    assert.ok(Math.abs(x - 0.5) < 0.01, `x was ${x}`);
    assert.ok(Math.abs(y - 0.5) < 0.01, `y was ${y}`);
  });

  test('north is up and east is right', () => {
    const north = project(9.60, 100.0);
    const south = project(9.39, 100.0);
    const west = project(9.5, 99.91);
    const east = project(9.5, 100.09);
    assert.ok(north.y < south.y, 'higher latitude must sit higher on screen');
    assert.ok(east.x > west.x, 'higher longitude must sit further right');
  });

  test('every seed place lands inside the drawn island, not in open sea', () => {
    for (const p of ISLAND_PLACES) {
      const { x, y } = project(p.lat, p.lng);
      assert.ok(x > 0.1 && x < 0.9, `${p.id} x=${x.toFixed(2)} is off the island`);
      assert.ok(y > 0.1 && y < 0.9, `${p.id} y=${y.toFixed(2)} is off the island`);
    }
  });

  test('real relative geography is preserved', () => {
    const chaweng = ISLAND_PLACES.find((p) => p.id === 'chaweng')!;
    const thongKrut = ISLAND_PLACES.find((p) => p.id === 'mangrove')!;
    // Chaweng is on the north-east coast, Thong Krut on the south-west.
    assert.ok(project(chaweng.lat, chaweng.lng).x > project(thongKrut.lat, thongKrut.lng).x);
    assert.ok(project(chaweng.lat, chaweng.lng).y < project(thongKrut.lat, thongKrut.lng).y);
  });
});

describe('pin de-collision', () => {
  test('places every pin', () => {
    assert.equal(layoutPins(scored, W, H).length, scored.length);
  });

  test('no two chips overlap', () => {
    const pins = layoutPins(scored, W, H);
    for (let i = 0; i < pins.length; i += 1) {
      for (let j = i + 1; j < pins.length; j += 1) {
        const a = pins[i]!;
        const b = pins[j]!;
        const overlaps = Math.abs(a.left - b.left) < 46 * 1.6 && Math.abs(a.top - b.top) < 30;
        assert.ok(
          !overlaps,
          `${a.place.id} and ${b.place.id} overlap at (${a.left},${a.top}) / (${b.left},${b.top})`,
        );
      }
    }
  });

  test('no chip clips off the left or right edge', () => {
    for (const pin of layoutPins(scored, W, H)) {
      assert.ok(pin.left >= 46, `${pin.place.id} clips left at ${pin.left}`);
      assert.ok(pin.left <= W - 46, `${pin.place.id} clips right at ${pin.left}`);
    }
  });

  test('no chip is pushed off the top of the viewport', () => {
    for (const pin of layoutPins(scored, W, H)) {
      assert.ok(pin.top >= 0, `${pin.place.id} pushed above the viewport at ${pin.top}`);
    }
  });

  test('the highest-scoring place keeps its true position', () => {
    // Priority order matters: the pin the product most wants read is placed
    // first, so it never gets nudged.
    // Found by id rather than taken from the front: the array now comes back
    // in PAINT order (far to near), and this test is about placement.
    const pins = layoutPins(scored, W, H);
    const best = pins.find((p) => p.place.id === 'namuang')!;
    // Against the TILTED anchor: the ground plane the island is drawn on is
    // the same one the pins stand on, so "true position" means the tilted one.
    const flat = project(best.place.lat, best.place.lng);
    assert.equal(best.top, tilt(flat.x, flat.y).y * H);
  });

  test('survives a degenerate case of many co-located places', () => {
    const stacked: ScoredPlace[] = Array.from({ length: 8 }, (_, i) => ({
      ...scored[0]!,
      id: `dup-${i}`,
    }));
    const pins = layoutPins(stacked, W, H);
    assert.equal(pins.length, 8);
    for (const pin of pins) assert.ok(Number.isFinite(pin.top) && pin.top >= 0);
  });
});

describe('de-collision preserves geography', () => {
  test('a southern place never ends up above a northern one', () => {
    // Chaweng (9.5357) is SOUTH of Fisherman's Village (9.5573), but scores
    // lower, so it is placed second. A naive "always push up" put the southern
    // place above the northern one - wrong information, not a cosmetic flaw.
    const pins = layoutPins(scored, W, H);
    const byId = Object.fromEntries(pins.map((p) => [p.place.id, p]));
    assert.ok(
      byId.fisherman!.top < byId.chaweng!.top,
      `Fisherman's Village (north, top=${byId.fisherman!.top}) must sit above ` +
        `Chaweng (south, top=${byId.chaweng!.top})`,
    );
  });

  test('north/south order holds for every colliding pair', () => {
    const pins = layoutPins(scored, W, H);
    for (const a of pins) {
      for (const b of pins) {
        if (a.place.id === b.place.id) continue;
        // Only meaningful for pins in the same horizontal band, since that is
        // where de-collision actually moves things.
        if (Math.abs(a.left - b.left) > CHIP.halfWidth * 1.6) continue;
        if (a.place.lat > b.place.lat) {
          assert.ok(
            a.top <= b.top,
            `${a.place.id} (lat ${a.place.lat}) must not sit below ${b.place.id} (lat ${b.place.lat})`,
          );
        }
      }
    }
  });

  test('every chip stays inside the viewport vertically', () => {
    for (const pin of layoutPins(scored, W, H)) {
      assert.ok(pin.top >= 0 && pin.top <= H, `${pin.place.id} at ${pin.top} escaped 0..${H}`);
    }
  });
});

/**
 * The island silhouette the component draws.
 *
 * Duplicated here on purpose. The point of the test below is that the drawn
 * coastline and the projected coordinates agree, and a test that imported the
 * shape from the thing it is checking would pass by construction.
 */
const ISLAND_PLAN = '28,4 62,0 86,18 96,46 88,74 66,96 34,100 12,78 4,44 14,18';

const islandPolygon = ISLAND_PLAN.split(' ').map((pair) => {
  const [x, y] = pair.split(',').map(Number) as [number, number];
  return tilt(x / 100, y / 100);
});

/** Ray casting. Small enough to read, which matters more here than speed. */
function insideIsland(pt: { x: number; y: number }): boolean {
  let inside = false;
  for (let i = 0, j = islandPolygon.length - 1; i < islandPolygon.length; j = i, i += 1) {
    const a = islandPolygon[i]!;
    const b = islandPolygon[j]!;
    const straddles = (a.y > pt.y) !== (b.y > pt.y);
    if (straddles && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

describe('real coordinates land on the drawn island', () => {
  // The silhouette is traced from a design comp, not from survey data, while
  // the pins come from true latitude and longitude. Those two facts are only
  // compatible by luck, and today the luck holds — every seeded place lands on
  // land. Nothing guaranteed it would, and a new place added along a coast is
  // exactly what would put a pin in the sea with no test to notice.
  for (const place of ISLAND_PLACES) {
    test(`${place.name.en} is on land`, () => {
      const flat = project(place.lat, place.lng);
      assert.ok(
        insideIsland(tilt(flat.x, flat.y)),
        `${place.name.en} projects into open sea — the silhouette and the coordinates have drifted apart`,
      );
    });
  }

  test('a point well outside the bounding box is NOT on land', () => {
    // Guards the guard: a containment test that returns true for everything
    // would pass the whole suite above while checking nothing.
    const far = project(SAMUI_BBOX.minLat - 0.5, SAMUI_BBOX.minLng - 0.5);
    assert.equal(insideIsland(tilt(far.x, far.y)), false);
  });
});

describe('pins paint far to near', () => {
  test('the array comes back in depth order, not score order', () => {
    // Absolutely-positioned siblings paint in document order, so whatever is
    // last sits in front. In a tilted scene that has to be the NEAREST pin.
    const pins = layoutPins(scored, W, H);
    for (let i = 1; i < pins.length; i += 1) {
      assert.ok(
        pins[i]!.top >= pins[i - 1]!.top,
        `pin ${i} (${pins[i]!.place.name.en}) paints before a nearer one`,
      );
    }
  });

  test('a distant low-scoring pin cannot occlude a near high-scoring one', () => {
    // The exact inversion the old return order produced: placement ran by
    // score, so a low scorer in the north was painted after a high scorer in
    // the south, and the far chip covered the near one.
    const north: ScoredPlace = { ...scored[0]!, id: 'north', lat: SAMUI_BBOX.maxLat - 0.01, lng: 100.0, healthyScore: 40 };
    const south: ScoredPlace = { ...scored[0]!, id: 'south', lat: SAMUI_BBOX.minLat + 0.01, lng: 100.0, healthyScore: 95 };

    const order = layoutPins([north, south], W, H).map((p) => p.place.id);
    assert.deepEqual(order, ['north', 'south'], 'the far pin was painted last, over the near one');
  });

  test('every place still appears exactly once', () => {
    // A sort is a cheap place to lose a row.
    const ids = layoutPins(scored, W, H).map((p) => p.place.id).sort();
    assert.deepEqual(ids, ISLAND_PLACES.map((p) => p.id).sort());
  });
});

describe('the mist on the drawn island', () => {
  const W = 390, H = 344;
  const places = ISLAND_PLACES.map((p) => ({ id: p.id, lat: p.lat, lng: p.lng }));

  test('a cleared circle sits where the pin stands, through the same tilt', () => {
    const [c] = mistCircles([{ placeId: 'chaweng' }], places, W, H);
    const chaweng = places.find((p) => p.id === 'chaweng')!;
    const flat = project(chaweng.lat, chaweng.lng);
    const t = tilt(flat.x, flat.y);
    assert.ok(Math.abs(c!.cx - t.x * W) < 1e-9 && Math.abs(c!.cy - t.y * H) < 1e-9);
  });

  test('it is a beach and a walk wide, foreshortened like the ground plane', () => {
    const [c] = mistCircles([{ placeId: 'namuang' }], places, W, H);
    assert.ok(c!.rx > 8 && c!.rx < 80, `rx ${c!.rx.toFixed(1)} px on a phone`);
    assert.ok(c!.ry < c!.rx, 'squashed by the tilt, as the island is');
  });

  test('a place they reached that is filtered off the map still clears; an unknown id clears nothing', () => {
    assert.equal(mistCircles([{ placeId: 'nowhere' }], places, W, H).length, 0);
    assert.equal(mistCircles([{ placeId: 'lamai' }], places, W, H).length, 1);
    assert.equal(mistCircles([], places, W, H).length, 0);
  });
});
