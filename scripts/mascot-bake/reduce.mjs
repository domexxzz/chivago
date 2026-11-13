/**
 * 7.1 M triangles and a 4K atlas down to something an app can ship.
 *
 * The atlas is photogrammetry output: thousands of small UV islands. Decimating
 * a mesh like that while keeping its texture smears every island edge, because
 * the simplifier can only see positions and every seam reads to it as a border
 * it must not cross. Locking those borders keeps the texture honest and keeps
 * the triangle count high - there are tens of thousands of them.
 *
 * So the colour comes off the atlas and onto the vertices, once, at full 4K
 * resolution, BEFORE anything is collapsed. After that there are no seams: the
 * mesh is welded by position and the simplifier is free to collapse wherever
 * the silhouette allows. Three textures - 22 MB of JPEG - become four bytes a
 * vertex, and what is lost is the fine painted pattern, not the colour.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

// Resolved by path: meshoptimizer is a transitive dependency of the workspace,
// and this script runs from a scratch directory outside it.
const { MeshoptSimplifier } = await import(pathToFileURL(process.env.MESHOPT).href);

const RAW = process.argv[2];
const OUT = process.argv[3];
const TARGET_TRIS = Number(process.argv[4] || 40000);
const SAMPLE = Number(process.argv[5] || 4096);
const FFMPEG = process.env.FFMPEG
  || 'C:/Users/DomeCB/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-8.1.2-full_build/bin/ffmpeg.exe';

const load = (f, T) => {
  const b = fs.readFileSync(path.join(RAW, f));
  return new T(b.buffer, b.byteOffset, b.byteLength / T.BYTES_PER_ELEMENT);
};

const position = load('position.bin', Float32Array);
const normal = load('normal.bin', Float32Array);
const uv = load('uv.bin', Float32Array);
let indices = load('indices.bin', Uint32Array);
const vertexCount = position.length / 3;
console.log(`in: ${vertexCount} vertices, ${indices.length / 3} triangles`);

// ---- 1. colour, sampled off the full-resolution atlas ----------------------
const rgbPath = path.join(RAW, `atlas-${SAMPLE}.rgb`);
if (!fs.existsSync(rgbPath)) {
  execFileSync(FFMPEG, ['-v', 'error', '-y', '-i', path.join(RAW, 'image-0.jpg'),
    '-vf', `scale=${SAMPLE}:${SAMPLE}`, '-pix_fmt', 'rgb24', '-f', 'rawvideo', rgbPath]);
}
const atlas = fs.readFileSync(rgbPath);
console.log('atlas', atlas.length, 'bytes =', SAMPLE, 'x', SAMPLE);

// COLOR_0 is linear in glTF; a JPEG's bytes are sRGB. Without this the whole
// mascot renders several stops too dark once a renderer converts for output.
const TO_LINEAR = new Uint8Array(256);
for (let i = 0; i < 256; i += 1) {
  const s = i / 255;
  const lin = s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  TO_LINEAR[i] = Math.round(lin * 255);
}

const colour = new Uint8Array(vertexCount * 3);
for (let i = 0; i < vertexCount; i += 1) {
  // glTF UV origin is the image's top-left corner, so v maps straight to y.
  let x = Math.round(uv[i * 2] * (SAMPLE - 1));
  let y = Math.round(uv[i * 2 + 1] * (SAMPLE - 1));
  x = x < 0 ? 0 : x >= SAMPLE ? SAMPLE - 1 : x;
  y = y < 0 ? 0 : y >= SAMPLE ? SAMPLE - 1 : y;
  const o = (y * SAMPLE + x) * 3;
  colour[i * 3] = TO_LINEAR[atlas[o]];
  colour[i * 3 + 1] = TO_LINEAR[atlas[o + 1]];
  colour[i * 3 + 2] = TO_LINEAR[atlas[o + 2]];
}

// ---- 2. weld by position ---------------------------------------------------
// Seam duplicates exist only to carry two UVs at one point. With the colour
// already baked they are the thing stopping the simplifier from working.
const GRID = 100000; // 1e-5 on a model about two units across
const CAP = 1 << 23;
const table = new Int32Array(CAP).fill(-1);
const keyX = new Int32Array(vertexCount);
const keyY = new Int32Array(vertexCount);
const keyZ = new Int32Array(vertexCount);
const remap = new Uint32Array(vertexCount);
const sumR = new Float64Array(vertexCount);
const sumG = new Float64Array(vertexCount);
const sumB = new Float64Array(vertexCount);
const sumNx = new Float64Array(vertexCount);
const sumNy = new Float64Array(vertexCount);
const sumNz = new Float64Array(vertexCount);
const hits = new Uint32Array(vertexCount);
const wPos = new Float32Array(vertexCount * 3);
let unique = 0;

for (let i = 0; i < vertexCount; i += 1) {
  const qx = Math.round(position[i * 3] * GRID);
  const qy = Math.round(position[i * 3 + 1] * GRID);
  const qz = Math.round(position[i * 3 + 2] * GRID);
  let h = (Math.imul(qx, 0x9e3779b1) ^ Math.imul(qy, 0x85ebca6b) ^ Math.imul(qz, 0xc2b2ae35)) >>> 0;
  h &= CAP - 1;
  let slot = -1;
  for (;;) {
    const at = table[h];
    if (at === -1) {
      table[h] = unique;
      slot = unique;
      keyX[unique] = qx; keyY[unique] = qy; keyZ[unique] = qz;
      wPos[unique * 3] = position[i * 3];
      wPos[unique * 3 + 1] = position[i * 3 + 1];
      wPos[unique * 3 + 2] = position[i * 3 + 2];
      unique += 1;
      break;
    }
    if (keyX[at] === qx && keyY[at] === qy && keyZ[at] === qz) { slot = at; break; }
    h = (h + 1) & (CAP - 1);
  }
  remap[i] = slot;
  sumR[slot] += colour[i * 3]; sumG[slot] += colour[i * 3 + 1]; sumB[slot] += colour[i * 3 + 2];
  sumNx[slot] += normal[i * 3]; sumNy[slot] += normal[i * 3 + 1]; sumNz[slot] += normal[i * 3 + 2];
  hits[slot] += 1;
}
console.log(`welded: ${vertexCount} -> ${unique} vertices`);

const wNormal = new Float32Array(unique * 3);
const wColour = new Uint8Array(unique * 3);
for (let i = 0; i < unique; i += 1) {
  const n = hits[i];
  let nx = sumNx[i] / n; let ny = sumNy[i] / n; let nz = sumNz[i] / n;
  const len = Math.hypot(nx, ny, nz) || 1;
  wNormal[i * 3] = nx / len; wNormal[i * 3 + 1] = ny / len; wNormal[i * 3 + 2] = nz / len;
  wColour[i * 3] = Math.round(sumR[i] / n);
  wColour[i * 3 + 1] = Math.round(sumG[i] / n);
  wColour[i * 3 + 2] = Math.round(sumB[i] / n);
}

let wIndices = new Uint32Array(indices.length);
for (let i = 0; i < indices.length; i += 1) wIndices[i] = remap[indices[i]];
// Degenerate triangles appear wherever a weld merged two corners of one face.
{
  const kept = new Uint32Array(wIndices.length);
  let k = 0;
  for (let t = 0; t < wIndices.length; t += 3) {
    const a = wIndices[t]; const b = wIndices[t + 1]; const c = wIndices[t + 2];
    if (a !== b && b !== c && a !== c) { kept[k] = a; kept[k + 1] = b; kept[k + 2] = c; k += 3; }
  }
  wIndices = kept.slice(0, k);
}
console.log(`triangles after weld: ${wIndices.length / 3}`);

// ---- 3. simplify -----------------------------------------------------------
await MeshoptSimplifier.ready;
const [simplified, error] = MeshoptSimplifier.simplify(
  wIndices, wPos, 3, TARGET_TRIS * 3, 0.02,
);
console.log(`simplified to ${simplified.length / 3} triangles, error ${error.toFixed(5)}`);

// compactMesh returns a REMAP TABLE over the old vertex range, not an index
// buffer: remap[old] is the new slot, or 0xffffffff where the simplifier
// dropped the vertex.
// compactMesh returns a remap table over the OLD vertex range and rewrites the
// index array it was given IN PLACE. `simplified` is therefore already the new
// index buffer; remapping it again would apply the table twice.
const [remapTable, left] = MeshoptSimplifier.compactMesh(simplified);
console.log(`vertices in use: ${left}`);
const compacted = simplified;
const outPos = new Float32Array(left * 3);
const outNorm = new Float32Array(left * 3);
const outCol = new Uint8Array(left * 4);
for (let from = 0; from < remapTable.length; from += 1) {
  const to = remapTable[from];
  if (to === 0xffffffff || to >= left) continue;
  outPos[to * 3] = wPos[from * 3];
  outPos[to * 3 + 1] = wPos[from * 3 + 1];
  outPos[to * 3 + 2] = wPos[from * 3 + 2];
  outNorm[to * 3] = wNormal[from * 3];
  outNorm[to * 3 + 1] = wNormal[from * 3 + 1];
  outNorm[to * 3 + 2] = wNormal[from * 3 + 2];
  outCol[to * 4] = wColour[from * 3];
  outCol[to * 4 + 1] = wColour[from * 3 + 1];
  outCol[to * 4 + 2] = wColour[from * 3 + 2];
  outCol[to * 4 + 3] = 255;
}

// ---- 4. stand it up --------------------------------------------------------
// Feet at y=0, centred on x and z, one unit tall: the scene should not have to
// know what a Meshy bounding box happened to be.
const bb = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
for (let i = 0; i < left; i += 1) {
  for (let c = 0; c < 3; c += 1) {
    const v = outPos[i * 3 + c];
    if (v < bb.min[c]) bb.min[c] = v;
    if (v > bb.max[c]) bb.max[c] = v;
  }
}
const height = bb.max[1] - bb.min[1];
const scale = 1 / height;
const cx = (bb.min[0] + bb.max[0]) / 2;
const cz = (bb.min[2] + bb.max[2]) / 2;
for (let i = 0; i < left; i += 1) {
  outPos[i * 3] = (outPos[i * 3] - cx) * scale;
  outPos[i * 3 + 1] = (outPos[i * 3 + 1] - bb.min[1]) * scale;
  outPos[i * 3 + 2] = (outPos[i * 3 + 2] - cz) * scale;
}
console.log('normalised from bbox', JSON.stringify(bb), 'scale', scale.toFixed(4));

// ---- 5. write the GLB ------------------------------------------------------
const useShortIndices = left <= 65535;
const idxArray = useShortIndices ? new Uint16Array(compacted) : compacted;
const pad4 = (n) => (n + 3) & ~3;

const parts = [];
let offset = 0;
const push = (typed) => {
  const bytes = Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength);
  const at = offset;
  parts.push(bytes);
  offset += bytes.length;
  const padding = pad4(offset) - offset;
  if (padding) { parts.push(Buffer.alloc(padding)); offset += padding; }
  return { at, length: bytes.length };
};
const vPos = push(outPos);
const vNorm = push(outNorm);
const vCol = push(outCol);
const vIdx = push(idxArray);

const nb = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
for (let i = 0; i < left; i += 1) {
  for (let c = 0; c < 3; c += 1) {
    const v = outPos[i * 3 + c];
    if (v < nb.min[c]) nb.min[c] = v;
    if (v > nb.max[c]) nb.max[c] = v;
  }
}

const gltf = {
  asset: { version: '2.0', generator: 'chivago mascot bake' },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{ mesh: 0, name: 'changchang' }],
  meshes: [{
    name: 'changchang',
    primitives: [{ attributes: { POSITION: 0, NORMAL: 1, COLOR_0: 2 }, indices: 3, material: 0 }],
  }],
  materials: [{
    name: 'changchang',
    pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0.75 },
    doubleSided: false,
  }],
  accessors: [
    { bufferView: 0, componentType: 5126, count: left, type: 'VEC3', min: nb.min, max: nb.max },
    { bufferView: 1, componentType: 5126, count: left, type: 'VEC3' },
    { bufferView: 2, componentType: 5121, normalized: true, count: left, type: 'VEC4' },
    { bufferView: 3, componentType: useShortIndices ? 5123 : 5125, count: idxArray.length, type: 'SCALAR' },
  ],
  bufferViews: [
    { buffer: 0, byteOffset: vPos.at, byteLength: vPos.length, target: 34962 },
    { buffer: 0, byteOffset: vNorm.at, byteLength: vNorm.length, target: 34962 },
    { buffer: 0, byteOffset: vCol.at, byteLength: vCol.length, target: 34962 },
    { buffer: 0, byteOffset: vIdx.at, byteLength: vIdx.length, target: 34963 },
  ],
  buffers: [{ byteLength: offset }],
};

const json = Buffer.from(JSON.stringify(gltf), 'utf8');
const jsonPad = Buffer.alloc(pad4(json.length) - json.length, 0x20);
const bin = Buffer.concat([...parts]);
const total = 12 + 8 + json.length + jsonPad.length + 8 + bin.length;
const head = Buffer.alloc(12);
head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(total, 8);
const jsonHead = Buffer.alloc(8);
jsonHead.writeUInt32LE(json.length + jsonPad.length, 0); jsonHead.writeUInt32LE(0x4e4f534a, 4);
const binHead = Buffer.alloc(8);
binHead.writeUInt32LE(bin.length, 0); binHead.writeUInt32LE(0x004e4942, 4);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, Buffer.concat([head, jsonHead, json, jsonPad, binHead, bin]));
console.log(`wrote ${OUT}: ${(total / 1024).toFixed(1)} KB, ${idxArray.length / 3} triangles, ${left} vertices`);
