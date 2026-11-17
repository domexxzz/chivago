/**
 * The island as a mesh, built from the elevation the map already reads.
 *
 *   node scripts/island-terrain.mjs --area koh-sichang \
 *     --out apps/mobile/assets/islands/koh-sichang.glb
 *
 * WHAT THIS IS FOR. `docs/76` (the diorama direction) asks for a hand-made
 * island that is nonetheless in the right place: every distance on it has to
 * be the real distance, because people navigate with it. Terrain is therefore
 * the one part nobody should sculpt. This reads the same Terrarium tiles
 * `terrain-style.ts` already loads, and writes a glTF the artist dresses.
 *
 * ZOOM 13, AND NOT MORE. `terrain-style.ts` measured it on this very island on
 * 2026-10-23: above zoom 13 the archive's upsample mishandles NODATA and about
 * one texel in two thousand comes back as a value like -2,021 m (Ko Sichang)
 * or -18,109 m (Samui). The source is SRTM at one arc-second, so zoom 13 is
 * already the real resolution - 18.8 m a sample at this latitude - and
 * everything above it is interpolation of detail that never existed. Any
 * sample outside PLAUSIBLE is dropped rather than smoothed, because one such
 * needle drives a spike through the ridge and reads as a modelling mistake.
 *
 * NO DECIMATION STEP, ON PURPOSE. The obvious pipeline samples densely and
 * then simplifies with quadric error metrics. This one picks the grid spacing
 * that gives the facet size the style wants (`SPACING_M`), and the triangle
 * budget falls out of it: 70 m facets over Ko Sichang is about 6,000 triangles
 * against a budget of 8,000. A simplifier would be a few hundred lines to
 * arrive at the same count with less control over how the facets read.
 *
 * WHAT IT DOES NOT DO. It cuts the shore at sea level rather than against the
 * OSM coastline, so the waterline is as good as the DEM is - a few tens of
 * metres. For a greybox that is right; before the art pass somebody should
 * compare it against the real coastline and decide whether to carry the
 * polygon through. The flat-shaded mesh is emitted unindexed: each triangle
 * owns its three vertices, which is what gives a true facet and lets each one
 * carry its own colour.
 */

import { inflateSync } from 'node:zlib';
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';

import { lngLatToTile, metresPerDegree } from './lib/geo.mjs';

export { lngLatToTile, metresPerDegree };

/** The archive `terrain-style.ts` points MapLibre at. One source, one island. */
export const TERRAIN_TILES = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';

/** The deepest zoom that is clean. See the note above before raising it. */
export const ZOOM = 13;

/** docs/76: terrain is the one class that may lie about height, by this much. */
export const EXAGGERATION = 2.6;

/** Facet size on the ground. The triangle count follows from it. */
export const SPACING_M = 70;

/** Above this, land. Not zero: a DEM metre at the waterline is a guess. */
export const SEA_LEVEL_M = 0.5;

/** Thailand's highest point is 2,565 m and its deepest water here is tens. */
export const PLAUSIBLE = { min: -200, max: 3000 };

/* ------------------------------------------------------------------ PNG --

  Terrarium tiles are 8-bit PNG, colour type 2 or 6, not interlaced. That is
  the whole of what this decodes; anything else throws rather than guesses,
  because a silently misread height field looks like terrain.
*/

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function decodePng(buffer) {
  for (let i = 0; i < PNG_MAGIC.length; i += 1) {
    if (buffer[i] !== PNG_MAGIC[i]) throw new Error('not a PNG');
  }
  let offset = 8;
  let header = null;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const start = offset + 8;
    if (type === 'IHDR') {
      header = {
        width: buffer.readUInt32BE(start),
        height: buffer.readUInt32BE(start + 4),
        depth: buffer[start + 8],
        colourType: buffer[start + 9],
        interlace: buffer[start + 12],
      };
    } else if (type === 'IDAT') {
      idat.push(buffer.subarray(start, start + length));
    } else if (type === 'IEND') {
      break;
    }
    offset = start + length + 4;
  }
  if (!header) throw new Error('PNG has no IHDR');
  if (header.depth !== 8) throw new Error(`PNG bit depth ${header.depth} is not supported`);
  if (header.colourType !== 2 && header.colourType !== 6) {
    throw new Error(`PNG colour type ${header.colourType} is not supported`);
  }
  if (header.interlace !== 0) throw new Error('interlaced PNG is not supported');

  const channels = header.colourType === 2 ? 3 : 4;
  const stride = header.width * channels;
  const raw = inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(stride * header.height);

  for (let y = 0; y < header.height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const prev = y === 0 ? null : out.subarray((y - 1) * stride, y * stride);
    const row = out.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x += 1) {
      const a = x >= channels ? row[x - channels] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= channels ? prev[x - channels] : 0;
      const v = line[x];
      if (filter === 0) row[x] = v;
      else if (filter === 1) row[x] = (v + a) & 0xff;
      else if (filter === 2) row[x] = (v + b) & 0xff;
      else if (filter === 3) row[x] = (v + ((a + b) >> 1)) & 0xff;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        const pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        row[x] = (v + pred) & 0xff;
      } else throw new Error(`unknown PNG filter ${filter}`);
    }
  }
  return { width: header.width, height: header.height, channels, data: out };
}

/* ----------------------------------------------------------- elevation -- */

/** Terrarium's own formula. Not a guess: it is the encoding's definition. */
export const terrariumMetres = (r, g, b) => r * 256 + g + b / 256 - 32768;

export const isPlausible = (metres) =>
  Number.isFinite(metres) && metres >= PLAUSIBLE.min && metres <= PLAUSIBLE.max;

/* ------------------------------------------------------ web mercator -- */


export function tileRangeFor(bbox, zoom) {
  const a = lngLatToTile(bbox.minLng, bbox.maxLat, zoom);
  const b = lngLatToTile(bbox.maxLng, bbox.minLat, zoom);
  return {
    x0: Math.floor(a.x), x1: Math.floor(b.x),
    y0: Math.floor(a.y), y1: Math.floor(b.y),
  };
}

/**
 * Bilinear sampling across a mosaic of decoded tiles.
 *
 * Returns NaN where a corner is missing or implausible, rather than a number:
 * the mesh builder treats NaN as "no ground here", and that is the honest
 * answer. Smoothing over a NODATA needle would hide it.
 */
export function makeSampler(tiles, zoom = ZOOM) {
  const at = (tx, ty, px, py) => {
    const tile = tiles.get(`${tx}/${ty}`);
    if (!tile) return NaN;
    const x = Math.min(tile.width - 1, Math.max(0, px));
    const y = Math.min(tile.height - 1, Math.max(0, py));
    const i = (y * tile.width + x) * tile.channels;
    const m = terrariumMetres(tile.data[i], tile.data[i + 1], tile.data[i + 2]);
    return isPlausible(m) ? m : NaN;
  };

  return (lng, lat) => {
    const t = lngLatToTile(lng, lat, zoom);
    const tx = Math.floor(t.x);
    const ty = Math.floor(t.y);
    const tile = tiles.get(`${tx}/${ty}`);
    if (!tile) return NaN;
    const fx = (t.x - tx) * tile.width - 0.5;
    const fy = (t.y - ty) * tile.height - 0.5;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const u = fx - x0;
    const v = fy - y0;
    const h00 = at(tx, ty, x0, y0);
    const h10 = at(tx, ty, x0 + 1, y0);
    const h01 = at(tx, ty, x0, y0 + 1);
    const h11 = at(tx, ty, x0 + 1, y0 + 1);
    if (!(Number.isFinite(h00) && Number.isFinite(h10) && Number.isFinite(h01) && Number.isFinite(h11))) return NaN;
    return (h00 * (1 - u) + h10 * u) * (1 - v) + (h01 * (1 - u) + h11 * u) * v;
  };
}

/* ------------------------------------------------------- projection -- */


/* -------------------------------------------------------------- mask -- */

/**
 * The largest run of connected land, and nothing else.
 *
 * A bbox around one island also catches its neighbours and every rock with a
 * metre of elevation on it. Ko Kham Yai is a real island with a real quest
 * anchored on it, so this is a choice rather than a cleanup: the mesh is ONE
 * island, and anything else is dressed separately or built from its own bbox.
 */
export function largestLandComponent(mask, width, height) {
  const label = new Int32Array(mask.length).fill(-1);
  let best = [];
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || label[start] !== -1) continue;
    const queue = [start];
    const seen = [];
    label[start] = start;
    while (queue.length) {
      const i = queue.pop();
      seen.push(i);
      const x = i % width;
      const y = (i / width) | 0;
      const around = [
        x > 0 ? i - 1 : -1,
        x < width - 1 ? i + 1 : -1,
        y > 0 ? i - width : -1,
        y < height - 1 ? i + width : -1,
      ];
      for (const j of around) {
        if (j >= 0 && mask[j] && label[j] === -1) { label[j] = start; queue.push(j); }
      }
    }
    if (seen.length > best.length) best = seen;
  }
  const kept = new Uint8Array(mask.length);
  for (const i of best) kept[i] = 1;
  return kept;
}

/* ------------------------------------------------------------ colour -- */

/**
 * docs/76's palette, applied by what the ground is rather than by hand.
 *
 * Steep is rock, the waterline is sand, and the rest is grass banded by
 * height. The bands are wide on purpose: a smooth ramp over a faceted mesh
 * reads as a rendering artefact, not as a decision.
 */
export function faceColour(metres, slopeDeg) {
  if (slopeDeg > 32) return [0x9a / 255, 0xa3 / 255, 0xa8 / 255];
  if (metres < 5) return [0xe9 / 255, 0xd9 / 255, 0xa8 / 255];
  if (metres < 40) return [0x6f / 255, 0xa6 / 255, 0x3c / 255];
  if (metres < 95) return [0x8f / 255, 0xbf / 255, 0x4f / 255];
  return [0xb4 / 255, 0xc5 / 255, 0x6a / 255];
}

/* -------------------------------------------------------------- mesh -- */

export function buildTerrain({
  bbox,
  sample,
  spacingM = SPACING_M,
  exaggeration = EXAGGERATION,
  seaLevel = SEA_LEVEL_M,
  /*
    A surveyed shore, when there is one.

    MEASURED 17 November 2026: over this bbox the archive calls 12.8 km2 land
    above 0.5 m and 8.4 km2 above 8 m, for an island of about 7.9 km2, with no
    step anywhere in between. SRTM smears a coast over several metres, so no
    threshold is right and the first attempt built an island half again too
    big. `island-surface.mjs` turns the OSM coastline into this callback.
  */
  isLand = null,
}) {
  const midLat = (bbox.minLat + bbox.maxLat) / 2;
  const perDeg = metresPerDegree(midLat);
  const widthM = (bbox.maxLng - bbox.minLng) * perDeg.lng;
  const heightM = (bbox.maxLat - bbox.minLat) * perDeg.lat;
  const cols = Math.max(2, Math.round(widthM / spacingM) + 1);
  const rows = Math.max(2, Math.round(heightM / spacingM) + 1);

  const heights = new Float64Array(cols * rows);
  const land = new Uint8Array(cols * rows);
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const lng = bbox.minLng + ((bbox.maxLng - bbox.minLng) * c) / (cols - 1);
      const lat = bbox.maxLat - ((bbox.maxLat - bbox.minLat) * r) / (rows - 1);
      const h = sample(lng, lat);
      // Inside a surveyed shore, a sample the archive lost is still land: it
      // is carried at the waterline rather than punched out of the island.
      heights[r * cols + c] = isLand && isLand(lng, lat) ? Math.max(Number.isFinite(h) ? h : 0, 0.5) : h;
      land[r * cols + c] = isLand
        ? (isLand(lng, lat) ? 1 : 0)
        : (Number.isFinite(h) && h > seaLevel ? 1 : 0);
    }
  }
  const kept = largestLandComponent(land, cols, rows);

  // Local metres, origin at the centre of the bbox, Y up, -Z north.
  const originLng = (bbox.minLng + bbox.maxLng) / 2;
  const originLat = (bbox.minLat + bbox.maxLat) / 2;
  const point = (c, r) => {
    const lng = bbox.minLng + ((bbox.maxLng - bbox.minLng) * c) / (cols - 1);
    const lat = bbox.maxLat - ((bbox.maxLat - bbox.minLat) * r) / (rows - 1);
    return [
      (lng - originLng) * perDeg.lng,
      heights[r * cols + c] * exaggeration,
      -(lat - originLat) * perDeg.lat,
    ];
  };

  const positions = [];
  const normals = [];
  const colours = [];
  const uvs = [];
  let triangles = 0;
  let highest = -Infinity;

  /*
    PLANAR UV, STRAIGHT DOWN, because the mesh is a grid and the texture it
    takes (`island-surface.mjs`) is drawn in the same bbox. A cliff's texels
    stretch, which is correct here: a vertical face has no ground on it, and
    the alternative is a seam somebody has to hide.
  */
  const uv = (c, r) => [c / (cols - 1), r / (rows - 1)];

  const face = (a, b, c, uvA, uvB, uvC) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
    const slope = (Math.acos(Math.min(1, Math.max(-1, ny))) * 180) / Math.PI;
    const mid = (a[1] + b[1] + c[1]) / 3 / exaggeration;
    const colour = faceColour(mid, slope);
    const corners = [[a, uvA], [b, uvB], [c, uvC]];
    for (const [p, t] of corners) {
      positions.push(p[0], p[1], p[2]);
      normals.push(nx, ny, nz);
      colours.push(colour[0], colour[1], colour[2]);
      uvs.push(t[0], t[1]);
      if (p[1] > highest) highest = p[1];
    }
    triangles += 1;
  };

  for (let r = 0; r < rows - 1; r += 1) {
    for (let c = 0; c < cols - 1; c += 1) {
      const i00 = r * cols + c;
      const i10 = r * cols + c + 1;
      const i01 = (r + 1) * cols + c;
      const i11 = (r + 1) * cols + c + 1;
      if (!(kept[i00] && kept[i10] && kept[i01] && kept[i11])) continue;
      const p00 = point(c, r);
      const p10 = point(c + 1, r);
      const p01 = point(c, r + 1);
      const p11 = point(c + 1, r + 1);
      face(p00, p01, p10, uv(c, r), uv(c, r + 1), uv(c + 1, r));
      face(p10, p01, p11, uv(c + 1, r), uv(c, r + 1), uv(c + 1, r + 1));
    }
  }

  return {
    positions: Float32Array.from(positions),
    normals: Float32Array.from(normals),
    colours: Float32Array.from(colours),
    uvs: Float32Array.from(uvs),
    stats: {
      cols,
      rows,
      triangles,
      vertices: positions.length / 3,
      landCells: kept.reduce((n, v) => n + v, 0),
      spacingM: Math.round(widthM / (cols - 1)),
      widthM: Math.round(widthM),
      heightM: Math.round(heightM),
      highestM: highest === -Infinity ? 0 : Math.round(highest / exaggeration),
    },
  };
}

/* --------------------------------------------------------------- glb -- */

const GLTF_FLOAT = 5126;
const GLTF_ARRAY_BUFFER = 34962;

const pad4 = (n) => (n + 3) & ~3;

const extent = (array, stride, offset) => {
  let min = Infinity;
  let max = -Infinity;
  for (let i = offset; i < array.length; i += stride) {
    if (array[i] < min) min = array[i];
    if (array[i] > max) max = array[i];
  }
  return [min, max];
};

/**
 * A single-mesh binary glTF.
 *
 * Untextured, the ground colour is the vertex colour and the facets carry it.
 * With `texture`, the painted ground (`island-surface.mjs`) is the colour and
 * COLOR_0 is left out entirely rather than multiplied into it: two colour
 * sources over one surface is how a texture ends up looking muddy, and the
 * one drawn from real paths and real buildings is the one worth keeping.
 */
export function glb({ positions, normals, colours, uvs, name = 'island', texture = null }) {
  const count = positions.length / 3;
  const parts = texture ? [positions, normals, uvs] : [positions, normals, colours];
  let offset = 0;
  const views = parts.map((part) => {
    const view = { buffer: 0, byteOffset: offset, byteLength: part.byteLength, target: GLTF_ARRAY_BUFFER };
    offset = pad4(offset + part.byteLength);
    return view;
  });

  const [minX, maxX] = extent(positions, 3, 0);
  const [minY, maxY] = extent(positions, 3, 1);
  const [minZ, maxZ] = extent(positions, 3, 2);

  const json = {
    asset: { version: '2.0', generator: 'chivago/island-terrain' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name }],
    meshes: [{
      name,
      primitives: [{
        attributes: texture
          ? { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }
          : { POSITION: 0, NORMAL: 1, COLOR_0: 2 },
        material: 0,
        mode: 4,
      }],
    }],
    materials: [{
      name: 'island',
      pbrMetallicRoughness: {
        baseColorFactor: [1, 1, 1, 1],
        metallicFactor: 0,
        roughnessFactor: 1,
        ...(texture ? { baseColorTexture: { index: 0 } } : {}),
      },
      doubleSided: false,
    }],
    ...(texture
      ? {
          textures: [{ source: 0, sampler: 0 }],
          images: [{ uri: texture }],
          samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 33071, wrapT: 33071 }],
        }
      : {}),
    accessors: [
      { bufferView: 0, componentType: GLTF_FLOAT, count, type: 'VEC3', min: [minX, minY, minZ], max: [maxX, maxY, maxZ] },
      { bufferView: 1, componentType: GLTF_FLOAT, count, type: 'VEC3' },
      { bufferView: 2, componentType: GLTF_FLOAT, count, type: texture ? 'VEC2' : 'VEC3' },
    ],
    bufferViews: views,
    buffers: [{ byteLength: offset }],
  };

  const jsonChunk = Buffer.from(JSON.stringify(json), 'utf8');
  const jsonPadded = Buffer.alloc(pad4(jsonChunk.length), 0x20);
  jsonChunk.copy(jsonPadded);

  const bin = Buffer.alloc(offset);
  parts.forEach((part, i) => {
    Buffer.from(part.buffer, part.byteOffset, part.byteLength).copy(bin, views[i].byteOffset);
  });

  const header = Buffer.alloc(12);
  header.write('glTF', 0, 'ascii');
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonPadded.length + 8 + bin.length, 8);

  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonPadded.length, 0);
  jsonHeader.write('JSON', 4, 'ascii');

  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(bin.length, 0);
  binHeader.write('BIN\0', 4, 'ascii');

  return Buffer.concat([header, jsonHeader, jsonPadded, binHeader, bin]);
}

/* --------------------------------------------------------------- cli -- */

async function fetchTiles(bbox, zoom, log = console.log) {
  const range = tileRangeFor(bbox, zoom);
  const tiles = new Map();
  let bytes = 0;
  for (let x = range.x0; x <= range.x1; x += 1) {
    for (let y = range.y0; y <= range.y1; y += 1) {
      const url = TERRAIN_TILES.replace('{z}', String(zoom)).replace('{x}', String(x)).replace('{y}', String(y));
      const res = await fetch(url);
      if (!res.ok) throw new Error(`tile ${zoom}/${x}/${y} answered ${res.status}`);
      const buffer = Buffer.from(await res.arrayBuffer());
      bytes += buffer.length;
      tiles.set(`${x}/${y}`, decodePng(buffer));
    }
  }
  log(`[chivago] ${tiles.size} tile(s) at z${zoom}, ${Math.round(bytes / 1024)} KB`);
  return tiles;
}

async function bboxFor(areaKey) {
  const core = await import('../packages/core/src/index.ts');
  const area = core.areaByKey(areaKey);
  if (!area?.bbox) throw new Error(`no bbox for area ${areaKey}`);
  return area.bbox;
}

async function main() {
  const { values } = parseArgs({
    options: {
      area: { type: 'string', default: 'koh-sichang' },
      out: { type: 'string' },
      bbox: { type: 'string' },
      spacing: { type: 'string' },
      exaggeration: { type: 'string' },
      texture: { type: 'string' },
      coastline: { type: 'string' },
    },
  });

  const bbox = values.bbox
    ? (() => {
        const [minLng, minLat, maxLng, maxLat] = values.bbox.split(',').map(Number);
        return { minLng, minLat, maxLng, maxLat };
      })()
    : await bboxFor(values.area);

  const out = values.out ?? `apps/mobile/assets/islands/${values.area}.glb`;
  const spacingM = values.spacing ? Number(values.spacing) : SPACING_M;
  const exaggeration = values.exaggeration ? Number(values.exaggeration) : EXAGGERATION;

  let isLand = null;
  if (values.coastline) {
    const { landMaskFrom } = await import('./island-surface.mjs');
    const mask = landMaskFrom(JSON.parse(readFileSync(values.coastline, 'utf8')));
    if (!mask) throw new Error(`no coastline in ${values.coastline}`);
    isLand = mask.isLand;
    console.log(`[chivago] shore from the OSM coastline: ${mask.ring.length} point(s)`);
  } else {
    console.warn('[chivago] no --coastline: the shore comes from the elevation, which is wrong by square kilometres');
  }

  const tiles = await fetchTiles(bbox, ZOOM);
  const built = buildTerrain({ bbox, sample: makeSampler(tiles, ZOOM), spacingM, exaggeration, isLand });
  const file = glb({ ...built, name: values.area, texture: values.texture ?? null });

  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, file);

  const s = built.stats;
  console.log(`[chivago] ${values.area}: ${s.widthM} x ${s.heightM} m, grid ${s.cols} x ${s.rows} at ${s.spacingM} m`);
  console.log(`          ${s.triangles} triangle(s), ${s.landCells} land cell(s), highest ${s.highestM} m before exaggeration`);
  console.log(`          -> ${out} (${Math.round(file.length / 1024)} KB, exaggeration x${exaggeration})`);
  if (values.texture) console.log(`          ground painted by ${values.texture}, vertex colour left out`);

  if (s.triangles === 0) throw new Error('no land in this bbox - check the bbox and the sea level');
  if (s.triangles > 12_000) {
    console.warn(`[chivago] over the 8,000 triangle budget in docs/76. Raise --spacing.`);
  }
}

if (import.meta.filename === process.argv[1]) {
  await main();
}
