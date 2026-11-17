/**
 * The painted ground, checked without the network.
 *
 * The raster is driven with ways written by hand, so what should be on the
 * canvas is known pixel by pixel. The PNG is checked by reading it back with
 * the decoder `island-terrain.mjs` already owns: a writer and a reader that
 * agree with each other are worth more than either checked against itself.
 */

import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

import { decodePng } from './island-terrain.mjs';
import {
  GROUND,
  baseColour,
  canvas,
  classify,
  encodePng,
  fillPolygon,
  overpassQuery,
  paintSurface,
  strokePath,
} from './island-surface.mjs';

const BBOX = { minLng: 100.800, maxLng: 100.810, minLat: 13.150, maxLat: 13.160 };
const pixel = (img, x, y) => {
  const i = (y * img.width + x) * 3;
  return [img.data[i], img.data[i + 1], img.data[i + 2]];
};

describe('the raster', () => {
  test('fills a polygon and leaves the outside alone', () => {
    const img = canvas(20, 20, GROUND.sea);
    fillPolygon(img, [[[5, 5], [15, 5], [15, 15], [5, 15]]], GROUND.sand);
    assert.deepEqual(pixel(img, 10, 10), GROUND.sand, 'the middle is empty');
    assert.deepEqual(pixel(img, 2, 2), GROUND.sea, 'the fill leaked');
    assert.deepEqual(pixel(img, 18, 10), GROUND.sea, 'the fill leaked sideways');
  });

  test('fills a concave shape without bleeding across the notch', () => {
    // A C: two arms and a gap between them.
    const img = canvas(20, 20, GROUND.sea);
    fillPolygon(img, [[[4, 4], [16, 4], [16, 7], [8, 7], [8, 13], [16, 13], [16, 16], [4, 16]]], GROUND.sand);
    assert.deepEqual(pixel(img, 12, 5), GROUND.sand, 'the top arm is missing');
    assert.deepEqual(pixel(img, 12, 14), GROUND.sand, 'the bottom arm is missing');
    assert.deepEqual(pixel(img, 12, 10), GROUND.sea, 'the notch was filled in');
  });

  test('strokes a path with the width it was given', () => {
    const img = canvas(40, 40, GROUND.sea);
    strokePath(img, [[5, 20], [35, 20]], 6, GROUND.path);
    assert.deepEqual(pixel(img, 20, 20), GROUND.path, 'nothing was drawn');
    assert.deepEqual(pixel(img, 20, 22), GROUND.path, 'the brush is too thin');
    assert.deepEqual(pixel(img, 20, 30), GROUND.sea, 'the brush is far too wide');
  });

  test('draws nothing outside the canvas rather than throwing', () => {
    const img = canvas(10, 10);
    strokePath(img, [[-50, -50], [60, 60]], 4, GROUND.path);
    assert.deepEqual(pixel(img, 5, 5), GROUND.path);
  });
});

describe('the PNG', () => {
  test('is read back by the decoder the terrain script already owns', () => {
    const img = canvas(37, 11, GROUND.grassMid);
    strokePath(img, [[2, 5], [34, 5]], 3, GROUND.path);
    fillPolygon(img, [[[20, 1], [30, 1], [30, 4], [20, 4]]], GROUND.roof);

    const decoded = decodePng(encodePng(img));
    assert.equal(decoded.width, 37);
    assert.equal(decoded.height, 11);
    assert.equal(decoded.channels, 3);
    for (let i = 0; i < img.data.length; i += 1) {
      assert.equal(decoded.data[i], img.data[i], `byte ${i} came back changed`);
    }
  });

  test('compresses a flat image to far less than its pixels', () => {
    const img = canvas(512, 512, GROUND.sea);
    const png = encodePng(img);
    assert.ok(png.length < 512 * 512 * 3 / 50, `flat image took ${png.length} bytes`);
  });
});

describe('what gets drawn, and what does not', () => {
  test('reads the tags a traveller can see and ignores the rest', () => {
    assert.equal(classify({ highway: 'path' }).widthM, 2.5);
    assert.equal(classify({ highway: 'residential' }).widthM, 6);
    assert.deepEqual(classify({ natural: 'beach' }).colour, GROUND.sand);
    assert.deepEqual(classify({ building: 'yes' }).colour, GROUND.roof);
    assert.equal(classify({ barrier: 'fence' }), null, 'a fence reached the ground');
    assert.equal(classify({}), null);
  });

  test('a building inside a wood is drawn on top of it, not under it', () => {
    const building = classify({ building: 'house', natural: 'wood' });
    assert.deepEqual(building.colour, GROUND.roof);
    assert.ok(building.z > classify({ natural: 'wood' }).z, 'the wood would cover it');
  });

  test('a landuse the ground has no colour for is left undrawn', () => {
    // Residential landuse over the village would be a grey slab across the
    // one part of the island with any detail in it.
    assert.equal(classify({ landuse: 'residential' }), null);
  });

  test('the base colour follows height, and the sea is not land', () => {
    assert.deepEqual(baseColour(0), GROUND.sea);
    assert.deepEqual(baseColour(NaN), GROUND.sea);
    assert.deepEqual(baseColour(2), GROUND.sand);
    assert.deepEqual(baseColour(150), GROUND.grassHigh);
  });

  test('asks Overpass for the island and nothing beyond it', () => {
    const q = overpassQuery(BBOX);
    assert.match(q, /13\.15,100\.8,13\.16,100\.81/);
    assert.match(q, /way\["building"\]/);
    assert.ok(!/node/.test(q), 'the query drags in nodes it cannot draw');
  });
});

describe('painting a small island', () => {
  /** One path, one beach, one house, in a bbox with a hill in the middle. */
  const osm = {
    elements: [
      {
        id: 1, tags: { highway: 'path' },
        geometry: [{ lat: 13.152, lon: 100.802 }, { lat: 13.158, lon: 100.808 }],
      },
      {
        id: 2, tags: { natural: 'beach' },
        geometry: [
          { lat: 13.1510, lon: 100.8010 }, { lat: 13.1510, lon: 100.8030 },
          { lat: 13.1525, lon: 100.8030 }, { lat: 13.1525, lon: 100.8010 },
          { lat: 13.1510, lon: 100.8010 },
        ],
      },
      {
        id: 3, tags: { building: 'yes' },
        geometry: [
          { lat: 13.1570, lon: 100.8070 }, { lat: 13.1570, lon: 100.8075 },
          { lat: 13.1575, lon: 100.8075 }, { lat: 13.1575, lon: 100.8070 },
          { lat: 13.1570, lon: 100.8070 },
        ],
      },
    ],
  };
  const hill = (lng, lat) => {
    const d = Math.hypot((lng - 100.805) * 100, (lat - 13.155) * 100);
    return d > 0.35 ? -2 : 120 * (1 - d / 0.35);
  };
  const painted = paintSurface({ bbox: BBOX, osm, width: 200, height: 200, sample: hill });

  test('lays down the ground before anything is drawn on it', () => {
    // Off the path on purpose: the way crosses the summit, and a pixel that
    // is both would prove nothing about either.
    assert.deepEqual(pixel(painted.img, 90, 100), GROUND.grassHigh, 'the summit is not land');
    assert.deepEqual(pixel(painted.img, 3, 3), GROUND.sea, 'the sea is not sea');
  });

  test('puts the path where the path is', () => {
    // The way runs from the south-west to the north-east of the bbox.
    const onLine = (lng, lat) => [
      Math.round(((lng - BBOX.minLng) / (BBOX.maxLng - BBOX.minLng)) * 200),
      Math.round(((BBOX.maxLat - lat) / (BBOX.maxLat - BBOX.minLat)) * 200),
    ];
    const [mx, my] = onLine(100.805, 13.155);
    assert.deepEqual(pixel(painted.img, mx, my), GROUND.path, 'the path is not on its own line');
  });

  test('reports what it drew and hands back the footprints', () => {
    assert.equal(painted.drawn.area, 2, 'the beach and the house did not both land');
    assert.equal(painted.drawn.line, 1);
    assert.equal(painted.buildings.length, 1);
    assert.ok(painted.buildings[0].widthM > 0 && painted.buildings[0].depthM > 0);
    assert.ok(Math.abs(painted.buildings[0].lat - 13.15725) < 0.0001, 'the centre is off the footprint');
  });
});
