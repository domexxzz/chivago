import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

import { SAMUI_BBOX, SEED_PLACES, computeHealthyScore, type ScoredPlace } from '@chivago/core';
import { CHIP, layoutPins, project, tilt } from './map-geometry.ts';

const W = 390;
const H = 344;

const scored: ScoredPlace[] = SEED_PLACES.map((p) => {
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
    for (const p of SEED_PLACES) {
      const { x, y } = project(p.lat, p.lng);
      assert.ok(x > 0.1 && x < 0.9, `${p.id} x=${x.toFixed(2)} is off the island`);
      assert.ok(y > 0.1 && y < 0.9, `${p.id} y=${y.toFixed(2)} is off the island`);
    }
  });

  test('real relative geography is preserved', () => {
    const chaweng = SEED_PLACES.find((p) => p.id === 'chaweng')!;
    const thongKrut = SEED_PLACES.find((p) => p.id === 'mangrove')!;
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
    const pins = layoutPins(scored, W, H);
    const best = pins[0]!;
    assert.equal(best.place.id, 'namuang');
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
