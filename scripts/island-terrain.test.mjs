/**
 * The island mesh, checked without the network.
 *
 * Every test here drives the pure half of `island-terrain.mjs` with a sampler
 * written by hand, so the shape of the island under test is known exactly and
 * the archive is never asked for a tile. The one thing that cannot be proved
 * this way - that the real tiles decode to the real island - is proved by
 * running the script, and its numbers go in the commit.
 */

import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';
import { deflateSync } from 'node:zlib';

import {
  PLAUSIBLE,
  buildTerrain,
  decodePng,
  faceColour,
  glb,
  largestLandComponent,
  lngLatToTile,
  makeSampler,
  metresPerDegree,
  terrariumMetres,
  tileRangeFor,
} from './island-terrain.mjs';

/** A minimal 8-bit RGB PNG, filter 0 on every row. */
function png(width, height, pixels) {
  const chunk = (type, data) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([length, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.alloc(height * (width * 3 + 1));
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 3 + 1)] = 0;
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = pixels[y * width + x];
      const at = y * (width * 3 + 1) + 1 + x * 3;
      raw[at] = r; raw[at + 1] = g; raw[at + 2] = b;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c;
}

/** A cone 600 m across, 120 m high, in the middle of a one-kilometre bbox. */
const CONE_BBOX = { minLng: 100.800, maxLng: 100.812, minLat: 13.150, maxLat: 13.162 };
const coneSampler = (lng, lat) => {
  const perDeg = metresPerDegree(13.156);
  const dx = (lng - 100.806) * perDeg.lng;
  const dy = (lat - 13.156) * perDeg.lat;
  const d = Math.hypot(dx, dy);
  return d > 300 ? -3 : 120 * (1 - d / 300);
};

describe('reading the archive', () => {
  test('decodes Terrarium the way the encoding defines it', () => {
    assert.equal(terrariumMetres(128, 0, 0), 0);
    assert.equal(terrariumMetres(128, 100, 0), 100);
    assert.equal(terrariumMetres(0, 0, 0), -32768);
    assert.equal(terrariumMetres(128, 0, 128), 0.5);
  });

  /**
   * MEASURED BY `terrain-style.ts` ON 2026-10-23, on this island: above zoom
   * 13 the archive's upsample returns values like -2,021 m. The mesh must
   * drop them rather than interpolate through them, because one of them is a
   * spike through the ridge and reads as somebody's modelling mistake.
   */
  test('refuses a needle instead of smoothing it', () => {
    const tiles = new Map([['0/0', { width: 2, height: 2, channels: 3, data: Buffer.alloc(12) }]]);
    const tile = tiles.get('0/0');
    // Three good samples at 100 m and one at -2,021 m.
    for (let i = 0; i < 3; i += 1) { tile.data[i * 3] = 128; tile.data[i * 3 + 1] = 100; }
    const needle = -2021 + 32768;
    tile.data[9] = Math.floor(needle / 256);
    tile.data[10] = Math.floor(needle % 256);
    assert.ok(!Number.isFinite(makeSampler(tiles, 0)(0.001, 0.001)), 'the needle reached the mesh');
    assert.ok(PLAUSIBLE.min > -2021, 'the plausible range would admit the measured needle');
  });

  test('decodes a PNG it wrote itself, through every filter path it allows', () => {
    const image = png(2, 2, [[128, 0, 0], [128, 10, 0], [128, 20, 0], [128, 30, 0]]);
    const decoded = decodePng(image);
    assert.equal(decoded.width, 2);
    assert.equal(decoded.height, 2);
    assert.equal(decoded.channels, 3);
    assert.equal(terrariumMetres(decoded.data[0], decoded.data[1], decoded.data[2]), 0);
    assert.equal(terrariumMetres(decoded.data[9], decoded.data[10], decoded.data[11]), 30);
  });

  test('refuses a PNG shape it cannot read rather than guessing', () => {
    assert.throws(() => decodePng(Buffer.alloc(32)), /not a PNG/);
  });

  test('covers the bbox in tiles, corner to corner', () => {
    const range = tileRangeFor(CONE_BBOX, 13);
    assert.ok(range.x1 >= range.x0 && range.y1 >= range.y0);
    const a = lngLatToTile(CONE_BBOX.minLng, CONE_BBOX.maxLat, 13);
    assert.equal(Math.floor(a.x), range.x0);
    assert.equal(Math.floor(a.y), range.y0);
  });
});

describe('cutting one island out of a bbox', () => {
  test('keeps the largest run of land and drops the rest', () => {
    // A 5x5 field: a 3x3 island, and one rock in the corner.
    const mask = new Uint8Array(25);
    for (let y = 1; y <= 3; y += 1) for (let x = 1; x <= 3; x += 1) mask[y * 5 + x] = 1;
    mask[0] = 1;
    const kept = largestLandComponent(mask, 5, 5);
    assert.equal(kept.reduce((n, v) => n + v, 0), 9);
    assert.equal(kept[0], 0, 'the rock came along');
  });

  test('a field with no land keeps nothing', () => {
    const kept = largestLandComponent(new Uint8Array(9), 3, 3);
    assert.equal(kept.reduce((n, v) => n + v, 0), 0);
  });
});

describe('the mesh', () => {
  const built = buildTerrain({ bbox: CONE_BBOX, sample: coneSampler, spacingM: 70 });

  test('has triangles, and only over land', () => {
    assert.ok(built.stats.triangles > 0, 'nothing was built');
    for (let i = 1; i < built.positions.length; i += 3) {
      assert.ok(built.positions[i] >= 0, 'a triangle hangs below sea level');
    }
  });

  test('exaggerates height and nothing else', () => {
    // The cone is 120 m; at x2.6 the summit is about 312 m in the mesh.
    let highest = -Infinity;
    for (let i = 1; i < built.positions.length; i += 3) highest = Math.max(highest, built.positions[i]);
    assert.ok(highest > 260 && highest < 320, `summit landed at ${Math.round(highest)}`);

    // 600 m of cone across a 1.3 km bbox: the mesh must still be 600 m across.
    let minX = Infinity;
    let maxX = -Infinity;
    for (let i = 0; i < built.positions.length; i += 3) {
      minX = Math.min(minX, built.positions[i]);
      maxX = Math.max(maxX, built.positions[i]);
    }
    assert.ok(maxX - minX > 450 && maxX - minX < 700, `the island is ${Math.round(maxX - minX)} m wide`);
  });

  test('is unindexed and flat: three vertices and one normal to a face', () => {
    assert.equal(built.positions.length, built.stats.triangles * 9);
    assert.equal(built.normals.length, built.positions.length);
    for (let t = 0; t < built.stats.triangles; t += 1) {
      const a = t * 9;
      assert.equal(built.normals[a], built.normals[a + 3], 'a face carries two normals');
      assert.equal(built.normals[a + 1], built.normals[a + 4]);
    }
  });

  test('every normal points up, so no face is wound inside out', () => {
    for (let i = 1; i < built.normals.length; i += 3) {
      assert.ok(built.normals[i] >= 0, 'a face points into the ground');
    }
  });

  test('spends its triangles near the budget docs/76 sets', () => {
    // A 1.3 km square at 70 m is about 340 cells; a 600 m cone fills ~60 of
    // them. The real island is twenty times the area and lands near 6,000.
    assert.ok(built.stats.triangles < 400, `${built.stats.triangles} triangles for one small cone`);
    // The grid takes a whole number of columns, so the spacing it reports is
    // the one it actually used (68 m here) rather than the one it was asked
    // for. The report is the truth; the request is the intent.
    assert.ok(Math.abs(built.stats.spacingM - 70) <= 4, `spacing came out at ${built.stats.spacingM} m`);
  });

  test('paints by ground, not by hand', () => {
    assert.deepEqual(faceColour(2, 5), [0xe9 / 255, 0xd9 / 255, 0xa8 / 255], 'the waterline is not sand');
    assert.deepEqual(faceColour(60, 45), [0x9a / 255, 0xa3 / 255, 0xa8 / 255], 'a cliff is not rock');
    assert.notDeepEqual(faceColour(20, 5), faceColour(120, 5), 'every height is one green');
  });
});

describe('the file', () => {
  const built = buildTerrain({ bbox: CONE_BBOX, sample: coneSampler, spacingM: 70 });
  const file = glb({ ...built, name: 'cone' });

  test('is a glTF binary a viewer will open', () => {
    assert.equal(file.toString('ascii', 0, 4), 'glTF');
    assert.equal(file.readUInt32LE(4), 2);
    assert.equal(file.readUInt32LE(8), file.length, 'the header lies about the length');

    const jsonLength = file.readUInt32LE(12);
    assert.equal(file.toString('ascii', 16, 20), 'JSON');
    const json = JSON.parse(file.toString('utf8', 20, 20 + jsonLength));
    assert.equal(json.asset.version, '2.0');
    assert.equal(json.meshes[0].name, 'cone');

    const binOffset = 20 + jsonLength;
    assert.equal(file.toString('ascii', binOffset + 4, binOffset + 8).replace(/\0/g, ''), 'BIN');
    assert.equal(file.readUInt32LE(binOffset), json.buffers[0].byteLength);
  });

  test('declares the vertex count it actually carries', () => {
    const jsonLength = file.readUInt32LE(12);
    const json = JSON.parse(file.toString('utf8', 20, 20 + jsonLength));
    const count = built.positions.length / 3;
    for (const accessor of json.accessors) assert.equal(accessor.count, count);
    assert.equal(json.bufferViews[0].byteLength, built.positions.byteLength);
  });

  test('carries bounds a viewer can frame the island with', () => {
    const jsonLength = file.readUInt32LE(12);
    const json = JSON.parse(file.toString('utf8', 20, 20 + jsonLength));
    const [min, max] = [json.accessors[0].min, json.accessors[0].max];
    assert.equal(min.length, 3);
    for (let i = 0; i < 3; i += 1) assert.ok(max[i] >= min[i]);
    assert.ok(max[1] > 100, 'the summit is not in the bounds');
  });
});
