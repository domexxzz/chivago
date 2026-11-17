/**
 * Gate one, checked without the network.
 *
 * The question these answer is not whether the boxes look good - that is what
 * the gate is for, and it takes eyes. It is whether a box stands where the
 * database says the place is, at the size docs/76 says its class is, on the
 * ground rather than through it.
 */

import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

import { decodePng } from './island-terrain.mjs';
import {
  BOX_COLOUR,
  HEROES,
  SCALE,
  SHAPE,
  anchorsFor,
  blockout,
  box,
  shapeFor,
} from './island-blockout.mjs';

const BBOX = { minLng: 100.797, maxLng: 100.823, minLat: 13.125, maxLat: 13.180 };
/** Flat ground at 40 m, so a box's height is the only thing that moves. */
const flat = () => 40;

const PLACES = [
  { id: 'sc-palace', name: 'Phra Chudadhuj Palace', lat: 13.1504, lng: 100.8105 },
  { id: 'sc-shops', name: 'Shop row', lat: 13.1600, lng: 100.8096 },
  { id: 'sc-pier', name: 'Tha Lang pier', lat: 13.1570, lng: 100.8080 },
];

describe('what class a place is', () => {
  test('the heroes are the eight the document names, and nothing else', () => {
    assert.equal(shapeFor(PLACES[0]).kind, 'hero');
    assert.equal(shapeFor(PLACES[1]).kind, 'ordinary');
    assert.ok(HEROES.has('sc-chao-pho-khao-yai'));
    assert.ok(!HEROES.has('sc-shops'), 'the shop row is not a hero');
  });

  /**
   * MEASURED ON THE ISLAND: matching /pier|bridge/ against the name gave the
   * shape of a jetty to "Shop row by Tha Lang pier", which is a row of shops
   * on dry land. The list of ids is duller and right.
   */
  test('a pier is a pier by name of record, not by what its name mentions', () => {
    assert.equal(shapeFor(PLACES[2]).kind, 'pier');
    assert.equal(shapeFor({ id: 'sc-atsadang-bridge', name: 'Atsadang Bridge', lat: 0, lng: 0 }).kind, 'pier');
    assert.equal(
      shapeFor({ id: 'sc-shops', name: 'Shop row by Tha Lang pier', lat: 0, lng: 0 }).kind,
      'ordinary',
      'a shop row beside a pier is not a pier',
    );
  });

  test('carries the multipliers docs/76 sets, not a number of its own', () => {
    assert.equal(shapeFor(PLACES[0]).scale, SCALE.hero);
    assert.equal(shapeFor(PLACES[1]).scale, SCALE.ordinary);
    assert.ok(SCALE.hero > SCALE.ordinary, 'a hero must out-read an ordinary building');
  });
});

describe('a box', () => {
  test('is twelve triangles, and every face has its own normal', () => {
    const out = { positions: [], normals: [], colours: [] };
    box({ x: 0, y: 0, z: 0, width: 10, depth: 10, height: 20, colour: [1, 1, 1] }, out);
    assert.equal(out.positions.length / 3, 36, 'a cuboid is 12 triangles');
    const normals = new Set();
    for (let i = 0; i < out.normals.length; i += 3) {
      normals.add(`${out.normals[i]},${out.normals[i + 1]},${out.normals[i + 2]}`);
    }
    assert.equal(normals.size, 6, 'a cuboid has six directions');
  });

  test('stands on its anchor rather than straddling it', () => {
    const out = { positions: [], normals: [], colours: [] };
    box({ x: 0, y: 100, z: 0, width: 10, depth: 10, height: 20, colour: [1, 1, 1] }, out);
    let low = Infinity;
    let high = -Infinity;
    for (let i = 1; i < out.positions.length; i += 3) {
      low = Math.min(low, out.positions[i]);
      high = Math.max(high, out.positions[i]);
    }
    assert.equal(low, 100, 'the box sank into the ground');
    assert.equal(high, 120, 'the box is not its own height');
  });
});

describe('placing the island', () => {
  const built = blockout({ bbox: BBOX, places: PLACES, sample: flat, exaggeration: 2.6 });

  test('puts one box at every place, and no box anywhere else', () => {
    assert.equal(built.boxes, PLACES.length);
    assert.equal(built.positions.length / 3, PLACES.length * 36);
  });

  test('reads the position from the record rather than from the order', () => {
    const palace = built.anchors.find((a) => a.id === 'sc-palace');
    const shops = built.anchors.find((a) => a.id === 'sc-shops');
    // The palace is south of the shop row, and -Z is north.
    assert.ok(palace.z > shops.z, 'the palace drifted north of the village');
    // Both are within the bbox, which is 2.8 km across and 6.1 km tall.
    for (const a of built.anchors) {
      assert.ok(Math.abs(a.x) < 1500, `${a.id} is ${a.x} m east of the middle`);
      assert.ok(Math.abs(a.z) < 3100, `${a.id} is ${a.z} m north of the middle`);
    }
  });

  test('stands every box on the terrain, exaggeration included', () => {
    for (const a of built.anchors) {
      assert.equal(a.groundM, 40);
      assert.equal(a.y, 104, 'the box ignored the height exaggeration');
    }
  });

  test('keeps a place the archive lost rather than dropping it to the sea floor', () => {
    const missing = blockout({
      bbox: BBOX, places: [PLACES[0]], sample: () => NaN, exaggeration: 2.6,
    });
    assert.equal(missing.anchors[0].groundM, null, 'a missing sample was invented');
    assert.equal(missing.anchors[0].y, 0, 'the box fell through the world');
  });

  test('hands the label layer an anchor it can project', () => {
    for (const a of built.anchors) {
      assert.equal(typeof a.name, 'string');
      assert.ok(a.name.length > 0);
      assert.ok(['hero', 'ordinary', 'pier'].includes(a.kind));
    }
  });

  test('tells a hero from an ordinary building by colour as well as size', () => {
    assert.notDeepEqual(BOX_COLOUR.hero, BOX_COLOUR.ordinary);
    assert.ok(SHAPE.hero.height > SHAPE.ordinary.height);
  });
});

describe('the file it writes', () => {
  test('is a glTF the terrain writer produced, with no texture on it', async () => {
    const { glb } = await import('./island-terrain.mjs');
    const built = blockout({ bbox: BBOX, places: PLACES, sample: flat, exaggeration: 2.6 });
    const file = glb({ ...built, uvs: null, name: 'blockout' });
    assert.equal(file.toString('ascii', 0, 4), 'glTF');
    const jsonLength = file.readUInt32LE(12);
    const json = JSON.parse(file.toString('utf8', 20, 20 + jsonLength));
    assert.ok(!json.images, 'the blockout should carry no image');
    assert.ok(json.meshes[0].primitives[0].attributes.COLOR_0 !== undefined, 'the boxes lost their colour');
    // Same decoder the rest of the pipeline uses, so this stays one toolchain.
    assert.equal(typeof decodePng, 'function');
  });
});
