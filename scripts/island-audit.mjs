/**
 * Does anything on the island float, and is anything the wrong size?
 *
 *   node scripts/island-audit.mjs apps/mobile/public/islands/koh-sichang.glb
 *
 * WHY IT READS THE MODEL AND NOT THE SCRIPTS. The island is assembled from
 * four generators - terrain, landmarks, village, roads - and each one is
 * convincing on its own. What ships is the sum, and the sum is the only thing
 * a traveller sees. So this opens the published file, finds every separate
 * object in it, and measures each one against the ground underneath it.
 *
 * HOW AN OBJECT IS FOUND. The glb is one unindexed mesh: no object names, no
 * node tree, just triangles. Vertices are quantised to a centimetre and
 * joined through the triangles that share them, which makes every watertight
 * shape its own connected component. The largest component by far is the
 * terrain; everything else is a thing standing on it.
 *
 * WHAT COUNTS AS FLOATING. The lowest vertex of an object, against the
 * terrain directly beneath that point. A building whose base is above the
 * ground under it is in the air; one below is buried. Both are reported,
 * because a sunken building looks like a small building and is just as wrong.
 */

import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

const { values, positionals } = parseArgs({
  options: {
    float: { type: 'string', default: '2' },   // metres above ground before it counts
    sink: { type: 'string', default: '4' },    // metres below ground before it counts
    top: { type: 'string', default: '25' },
  },
  allowPositionals: true,
});

const file = positionals[0] ?? 'apps/mobile/public/islands/koh-sichang.glb';
const buf = readFileSync(file);
const jsonLen = buf.readUInt32LE(12);
const gltf = JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8'));
const binStart = 20 + jsonLen + 8;

const readAccessor = (index) => {
  const acc = gltf.accessors[index];
  const view = gltf.bufferViews[acc.bufferView];
  const start = binStart + (view.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  const parts = { VEC3: 3, VEC4: 4 }[acc.type];
  if (acc.componentType === 5126) {
    const out = new Float32Array(acc.count * parts);
    for (let i = 0; i < out.length; i += 1) out[i] = buf.readFloatLE(start + i * 4);
    return out;
  }
  const out = new Uint8Array(acc.count * parts);
  for (let i = 0; i < out.length; i += 1) out[i] = buf[start + i];
  return out;
};

const prim = gltf.meshes[0].primitives[0];
const pos = readAccessor(prim.attributes.POSITION);
const col = prim.attributes.COLOR_0 !== undefined ? readAccessor(prim.attributes.COLOR_0) : null;
const vertices = pos.length / 3;
const triangles = vertices / 3;

/* ------------------------------------------------------ objects by place -- */

/*
  FOUND BY WHERE THEY STAND, NOT BY WHAT THEY TOUCH.

  The first version of this joined vertices through shared triangles, which
  is the obvious way to find a watertight shape and the wrong way to find a
  building. These generators emit each face on its own, so connectivity broke
  every house into walls and roofs - and then reported a roof three hundred
  metres up as an object floating three hundred metres, because the lowest
  point of a roof is the roof. 1,731 of 2,047 "floating" objects was not a
  finding, it was a broken ruler.

  A building occupies one patch of ground. So the terrain is separated first
  by its own connectivity - it genuinely is one surface, and far the largest
  thing here - and everything else is grouped by footprint: triangles land in
  a grid, occupied cells that touch become one object.
*/

const key = (i) => `${Math.round(pos[i * 3] * 100)},${Math.round(pos[i * 3 + 1] * 100)},${Math.round(pos[i * 3 + 2] * 100)}`;
const ids = new Map();
const at = new Int32Array(vertices);
for (let i = 0; i < vertices; i += 1) {
  const k = key(i);
  let id = ids.get(k);
  if (id === undefined) { id = ids.size; ids.set(k, id); }
  at[i] = id;
}
const parent = new Int32Array(ids.size);
for (let i = 0; i < parent.length; i += 1) parent[i] = i;
const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
const union = (a, b) => { const ra = find(a); const rb = find(b); if (ra !== rb) parent[ra] = rb; };
for (let t = 0; t < triangles; t += 1) {
  union(at[t * 3], at[t * 3 + 1]);
  union(at[t * 3 + 1], at[t * 3 + 2]);
}
const count = new Map();
for (let t = 0; t < triangles; t += 1) {
  const r = find(at[t * 3]);
  count.set(r, (count.get(r) ?? 0) + 1);
}
const terrainRoot = [...count.entries()].sort((a, b) => b[1] - a[1])[0][0];
const isTerrain = (t) => find(at[t * 3]) === terrainRoot;

/* Footprint grid for everything that is not the terrain. */
const PATCH = 12;
const cellOf = (x, z) => `${Math.floor(x / PATCH)},${Math.floor(z / PATCH)}`;
const cells = new Map();
for (let t = 0; t < triangles; t += 1) {
  if (isTerrain(t)) continue;
  let cx = 0; let cz = 0;
  for (let v = 0; v < 3; v += 1) { cx += pos[(t * 3 + v) * 3]; cz += pos[(t * 3 + v) * 3 + 2]; }
  const k = cellOf(cx / 3, cz / 3);
  let c = cells.get(k);
  if (!c) { c = []; cells.set(k, c); }
  c.push(t);
}
/* Occupied cells that touch belong to one thing. */
const cellIds = [...cells.keys()];
const cellIndex = new Map(cellIds.map((k, i) => [k, i]));
const cparent = new Int32Array(cellIds.length);
for (let i = 0; i < cparent.length; i += 1) cparent[i] = i;
const cfind = (a) => { while (cparent[a] !== a) { cparent[a] = cparent[cparent[a]]; a = cparent[a]; } return a; };
const cunion = (a, b) => { const ra = cfind(a); const rb = cfind(b); if (ra !== rb) cparent[ra] = rb; };
for (const k of cellIds) {
  const [gx, gz] = k.split(',').map(Number);
  for (const [dx, dz] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
    const n = cellIndex.get(`${gx + dx},${gz + dz}`);
    if (n !== undefined) cunion(cellIndex.get(k), n);
  }
}

const groups = new Map();
for (const k of cellIds) {
  const root = cfind(cellIndex.get(k));
  let g = groups.get(root);
  if (!g) {
    g = { tris: 0, minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity };
    groups.set(root, g);
  }
  for (const t of cells.get(k)) {
    g.tris += 1;
    for (let v = 0; v < 3; v += 1) {
      const i = t * 3 + v;
      const x = pos[i * 3]; const y = pos[i * 3 + 1]; const z = pos[i * 3 + 2];
      if (x < g.minX) g.minX = x; if (x > g.maxX) g.maxX = x;
      if (y < g.minY) g.minY = y; if (y > g.maxY) g.maxY = y;
      if (z < g.minZ) g.minZ = z; if (z > g.maxZ) g.maxZ = z;
    }
  }
}

const objects = [...groups.values()].sort((a, b) => b.tris - a.tris);
let terrainTris = 0;
for (let t = 0; t < triangles; t += 1) if (isTerrain(t)) terrainTris += 1;
const terrain = { tris: terrainTris, minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity };
for (let t = 0; t < triangles; t += 1) {
  if (!isTerrain(t)) continue;
  for (let v = 0; v < 3; v += 1) {
    const i = t * 3 + v;
    const x = pos[i * 3]; const y = pos[i * 3 + 1]; const z = pos[i * 3 + 2];
    if (x < terrain.minX) terrain.minX = x; if (x > terrain.maxX) terrain.maxX = x;
    if (y < terrain.minY) terrain.minY = y; if (y > terrain.maxY) terrain.maxY = y;
    if (z < terrain.minZ) terrain.minZ = z; if (z > terrain.maxZ) terrain.maxZ = z;
  }
}
const all = [terrain, ...objects];

/* ------------------------------------------------- the ground beneath it -- */

/*
  THE SURFACE, INTERPOLATED - not the highest vertex somewhere nearby.

  The first version took the maximum y of terrain vertices within a few
  cells, and on a hillside where the terrain triangles are a hundred metres
  across that is wrong by as much as the hill is steep. It reported a road
  lying flat on the ground as floating a hundred metres above it.

  So: every terrain triangle is filed under the grid cells its footprint
  covers, and a query finds the triangle it stands in and reads the height
  off that triangle's own plane. That is the ground, as drawn.
*/
const CELL = 64;
const index = new Map();
const tri = [];
for (let t = 0; t < triangles; t += 1) {
  if (!isTerrain(t)) continue;
  const a = [pos[t * 9], pos[t * 9 + 1], pos[t * 9 + 2]];
  const b = [pos[t * 9 + 3], pos[t * 9 + 4], pos[t * 9 + 5]];
  const c = [pos[t * 9 + 6], pos[t * 9 + 7], pos[t * 9 + 8]];
  const id = tri.length;
  tri.push([a, b, c]);
  const x0 = Math.floor(Math.min(a[0], b[0], c[0]) / CELL);
  const x1 = Math.floor(Math.max(a[0], b[0], c[0]) / CELL);
  const z0 = Math.floor(Math.min(a[2], b[2], c[2]) / CELL);
  const z1 = Math.floor(Math.max(a[2], b[2], c[2]) / CELL);
  for (let gx = x0; gx <= x1; gx += 1) {
    for (let gz = z0; gz <= z1; gz += 1) {
      const k = `${gx},${gz}`;
      let list = index.get(k);
      if (!list) { list = []; index.set(k, list); }
      list.push(id);
    }
  }
}

const heightIn = ([a, b, c], x, z) => {
  const d = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
  if (Math.abs(d) < 1e-9) return null;
  const u = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / d;
  const v = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / d;
  const w = 1 - u - v;
  const e = -0.001;
  if (u < e || v < e || w < e) return null;
  return u * a[1] + v * b[1] + w * c[1];
};

const groundAt = (x, z) => {
  let best = null;
  for (let r = 0; r <= 2; r += 1) {
    for (let dx = -r; dx <= r; dx += 1) {
      for (let dz = -r; dz <= r; dz += 1) {
        const list = index.get(`${Math.floor(x / CELL) + dx},${Math.floor(z / CELL) + dz}`);
        if (!list) continue;
        for (const id of list) {
          const y = heightIn(tri[id], x, z);
          /* The island is a surface, but a cliff can fold: take the top. */
          if (y !== null && (best === null || y > best)) best = y;
        }
      }
    }
    if (best !== null) return best;
  }
  return null;
};

/* ------------------------------------------------------------- the report -- */

const FLOAT = Number(values.float);
const SINK = Number(values.sink);

const rows = objects.map((o) => {
  const cx = (o.minX + o.maxX) / 2;
  const cz = (o.minZ + o.maxZ) / 2;
  const g = groundAt(cx, cz);
  return {
    tris: o.tris,
    w: o.maxX - o.minX,
    d: o.maxZ - o.minZ,
    h: o.maxY - o.minY,
    base: o.minY,
    ground: g,
    gap: g === null ? null : o.minY - g,
    x: cx,
    z: cz,
  };
});

console.log(`${file}`);
console.log(`  ${triangles} triangles, ${all.length} separate objects`);
console.log(`  terrain: ${terrain.tris} triangles, ${Math.round(terrain.maxX - terrain.minX)} x ${Math.round(terrain.maxZ - terrain.minZ)} m, height ${terrain.minY.toFixed(1)} to ${terrain.maxY.toFixed(1)}`);
console.log(`  objects on it: ${objects.length}\n`);

/*
  A BUILDING, NOT A STRAY TRIANGLE. Road ribbons are flat, and a terrain
  triangle this grouping failed to claim is flat too - both report a "gap"
  that is really a measurement of the sampler. Anything with height and
  enough faces to be a box is a thing that can be said to float.
*/
const solid = rows.filter((r) => r.tris >= 8 && r.h > 3 && r.w > 3 && r.d > 3);
console.log(`of those, ${solid.length} are solid objects with height - the rest are road ribbons and flat ground
`);
const floating = solid.filter((r) => r.gap !== null && r.gap > FLOAT).sort((a, b) => b.gap - a.gap);
const sunk = solid.filter((r) => r.gap !== null && r.gap < -SINK).sort((a, b) => a.gap - b.gap);
const offMap = solid.filter((r) => r.gap === null);
const gaps = solid.map((r) => r.gap).filter((g) => g !== null).sort((a, b) => a - b);

const show = (list, title, n) => {
  console.log(`${title}: ${list.length}`);
  for (const r of list.slice(0, n)) {
    console.log(`  gap ${String(r.gap === null ? '?' : r.gap.toFixed(1)).padStart(7)} m   size ${r.w.toFixed(0)}x${r.d.toFixed(0)}x${r.h.toFixed(0)} m   at ${r.x.toFixed(0)}, ${r.z.toFixed(0)}   ${r.tris} tris`);
  }
  if (list.length > n) console.log(`  ... and ${list.length - n} more`);
  console.log('');
};

show(floating, `FLOATING more than ${FLOAT} m above the ground`, Number(values.top));
show(sunk, `SUNK more than ${SINK} m into the ground`, Number(values.top));
if (offMap.length) show(offMap, 'NO GROUND BENEATH THEM', 10);

const sizes = rows.map((r) => Math.max(r.w, r.d)).sort((a, b) => b - a);
console.log('gap from the ground, over every solid object:');
console.log('  median ' + gaps[Math.floor(gaps.length / 2)].toFixed(1) + ' m   worst float ' + gaps[gaps.length - 1].toFixed(1) + ' m   worst sink ' + gaps[0].toFixed(1) + ' m');
console.log('footprint, largest to smallest (m):', sizes.slice(0, 12).map((s) => s.toFixed(0)).join(' '));
console.log('heights, tallest to shortest (m)  :', rows.map((r) => r.h).sort((a, b) => b - a).slice(0, 12).map((s) => s.toFixed(0)).join(' '));
