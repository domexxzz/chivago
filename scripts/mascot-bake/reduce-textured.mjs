/**
 * The other bake: keep the atlas, pay for it in triangles.
 *
 * `reduce.mjs` throws the textures away and bakes their colour onto the
 * vertices, which is how 222 MB becomes 771 KB. What that cannot carry is
 * SURFACE: fur that is fur rather than smooth plastic, fabric with a weave,
 * a camera lens that is glossy while the coat beside it is not. All three of
 * those live in the maps - a normal map for the micro-relief and a
 * metallic-roughness map for how each part answers light - and no amount of
 * vertex colour substitutes for either.
 *
 * WHY THIS IS NOT SIMPLY BETTER. The atlas pins every UV seam, and a seam is
 * a border the simplifier will not collapse across. Measured on this model:
 *
 *   asked  40,000 -> got 103,144 triangles, error 0.04645
 *   asked  80,000 -> got 103,038 triangles, error 0.04885
 *   asked 150,000 -> got 149,992 triangles, error 0.00154
 *   asked 300,000 -> got 299,982 triangles, error 0.00065
 *
 * 103k is the floor, and the floor is a bad place to stand: the error there
 * is thirty times what it is at 150k, because the simplifier is chewing into
 * the silhouette trying to reach a number the seams forbid. So 150,000 is the
 * number - just above the floor, where the error collapses.
 *
 * That is 3.8x the geometry of the vertex-coloured bake, plus the maps. The
 * two builds are both kept, on purpose: this one is for the room on a laptop,
 * and `reduce.mjs`'s is the one to reach for if that ever has to go anywhere
 * a megabyte matters.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const { MeshoptSimplifier } = await import(pathToFileURL(process.env.MESHOPT).href);

const RAW = process.argv[2];
const OUT = process.argv[3];
const TARGET_TRIS = Number(process.argv[4] || 150000);
const FFMPEG = process.env.FFMPEG
  || 'C:/Users/DomeCB/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-8.1.2-full_build/bin/ffmpeg.exe';

const load = (f, T) => {
  const b = fs.readFileSync(path.join(RAW, f));
  return new T(b.buffer, b.byteOffset, b.byteLength / T.BYTES_PER_ELEMENT);
};

const position = load('position.bin', Float32Array);
const normal = load('normal.bin', Float32Array);
const uv = load('uv.bin', Float32Array);
const indices = load('indices.bin', Uint32Array);
console.log(`in: ${position.length / 3} vertices, ${indices.length / 3} triangles`);

// ---- 1. simplify, unwelded, so every UV stays with its vertex -------------
await MeshoptSimplifier.ready;
const [simplified, error] = MeshoptSimplifier.simplify(indices, position, 3, TARGET_TRIS * 3, 0.02);
console.log(`simplified to ${simplified.length / 3} triangles, error ${error.toFixed(5)}`);

// compactMesh rewrites the index array IN PLACE and returns a remap table
// over the old vertex range. See reduce.mjs for the hour this cost once.
const [remapTable, left] = MeshoptSimplifier.compactMesh(simplified);
const compacted = simplified;
console.log(`vertices in use: ${left}`);

const outPos = new Float32Array(left * 3);
const outNorm = new Float32Array(left * 3);
const outUv = new Float32Array(left * 2);
for (let from = 0; from < remapTable.length; from += 1) {
  const to = remapTable[from];
  if (to === 0xffffffff || to >= left) continue;
  outPos[to * 3] = position[from * 3];
  outPos[to * 3 + 1] = position[from * 3 + 1];
  outPos[to * 3 + 2] = position[from * 3 + 2];
  outNorm[to * 3] = normal[from * 3];
  outNorm[to * 3 + 1] = normal[from * 3 + 1];
  outNorm[to * 3 + 2] = normal[from * 3 + 2];
  outUv[to * 2] = uv[from * 2];
  outUv[to * 2 + 1] = uv[from * 2 + 1];
}

// ---- 2. stand it up, exactly as the other bake does -----------------------
const bb = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
for (let i = 0; i < left; i += 1) {
  for (let c = 0; c < 3; c += 1) {
    const v = outPos[i * 3 + c];
    if (v < bb.min[c]) bb.min[c] = v;
    if (v > bb.max[c]) bb.max[c] = v;
  }
}
const scale = 1 / (bb.max[1] - bb.min[1]);
const cx = (bb.min[0] + bb.max[0]) / 2;
const cz = (bb.min[2] + bb.max[2]) / 2;
for (let i = 0; i < left; i += 1) {
  outPos[i * 3] = (outPos[i * 3] - cx) * scale;
  outPos[i * 3 + 1] = (outPos[i * 3 + 1] - bb.min[1]) * scale;
  outPos[i * 3 + 2] = (outPos[i * 3 + 2] - cz) * scale;
}

// ---- 3. the maps, each at the size its job needs --------------------------
/*
  Not all three at 4K, which is what arrived. Base colour carries pattern and
  is the one a viewer reads directly, so it keeps the most. The normal map
  carries relief, which survives halving far better than colour does. The
  metallic-roughness map is mostly flat regions - fur here, fabric there,
  lens over there - and is the cheapest of the three to shrink.

  JPEG quality is higher on the normal map than on the colour: its channels
  are a direction vector, not a picture, and chroma artefacts there show up
  as lighting that crawls over a surface that should be smooth.
*/
const MAPS = [
  { image: 'image-0.jpg', out: 'basecolour.jpg', size: 2048, q: 4 },
  { image: 'image-1.jpg', out: 'roughness.jpg', size: 1024, q: 5 },
  { image: 'image-2.jpg', out: 'normal.jpg', size: 2048, q: 2 },
];
const encoded = MAPS.map((m) => {
  const dst = path.join(RAW, m.out);
  execFileSync(FFMPEG, ['-v', 'error', '-y', '-i', path.join(RAW, m.image),
    '-vf', `scale=${m.size}:${m.size}:flags=lanczos`, '-q:v', String(m.q), dst]);
  const bytes = fs.readFileSync(dst);
  console.log(`${m.out}: ${m.size}px, ${(bytes.length / 1024).toFixed(0)} KB`);
  return bytes;
});

// ---- 4. write the GLB -----------------------------------------------------
const pad4 = (n) => (n + 3) & ~3;
const parts = [];
let offset = 0;
const push = (bytes) => {
  const at = offset;
  parts.push(bytes);
  offset += bytes.length;
  const padding = pad4(offset) - offset;
  if (padding) { parts.push(Buffer.alloc(padding)); offset += padding; }
  return { at, length: bytes.length };
};
const asBuffer = (typed) => Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength);

const vPos = push(asBuffer(outPos));
const vNorm = push(asBuffer(outNorm));
const vUv = push(asBuffer(outUv));
const vIdx = push(asBuffer(compacted));
const vImg = encoded.map((b) => push(b));

const nb = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
for (let i = 0; i < left; i += 1) {
  for (let c = 0; c < 3; c += 1) {
    const v = outPos[i * 3 + c];
    if (v < nb.min[c]) nb.min[c] = v;
    if (v > nb.max[c]) nb.max[c] = v;
  }
}

const sampler = { magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 };
const gltf = {
  asset: { version: '2.0', generator: 'chivago mascot bake (textured)' },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{ mesh: 0, name: 'changchang' }],
  meshes: [{
    name: 'changchang',
    primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 3, material: 0 }],
  }],
  materials: [{
    name: 'changchang',
    pbrMetallicRoughness: {
      baseColorFactor: [1, 1, 1, 1],
      baseColorTexture: { index: 0, texCoord: 0 },
      metallicRoughnessTexture: { index: 1, texCoord: 0 },
      metallicFactor: 1,
      roughnessFactor: 1,
    },
    normalTexture: { index: 2, texCoord: 0 },
    alphaMode: 'OPAQUE',
    doubleSided: false,
  }],
  textures: [0, 1, 2].map((i) => ({ sampler: 0, source: i })),
  samplers: [sampler],
  images: vImg.map((v, i) => ({ mimeType: 'image/jpeg', bufferView: 4 + i })),
  accessors: [
    { bufferView: 0, componentType: 5126, count: left, type: 'VEC3', min: nb.min, max: nb.max },
    { bufferView: 1, componentType: 5126, count: left, type: 'VEC3' },
    { bufferView: 2, componentType: 5126, count: left, type: 'VEC2' },
    { bufferView: 3, componentType: 5125, count: compacted.length, type: 'SCALAR' },
  ],
  bufferViews: [
    { buffer: 0, byteOffset: vPos.at, byteLength: vPos.length, target: 34962 },
    { buffer: 0, byteOffset: vNorm.at, byteLength: vNorm.length, target: 34962 },
    { buffer: 0, byteOffset: vUv.at, byteLength: vUv.length, target: 34962 },
    { buffer: 0, byteOffset: vIdx.at, byteLength: vIdx.length, target: 34963 },
    ...vImg.map((v) => ({ buffer: 0, byteOffset: v.at, byteLength: v.length })),
  ],
  buffers: [{ byteLength: offset }],
};

const json = Buffer.from(JSON.stringify(gltf), 'utf8');
const jsonPad = Buffer.alloc(pad4(json.length) - json.length, 0x20);
const bin = Buffer.concat(parts);
const total = 12 + 8 + json.length + jsonPad.length + 8 + bin.length;
const head = Buffer.alloc(12);
head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(total, 8);
const jsonHead = Buffer.alloc(8);
jsonHead.writeUInt32LE(json.length + jsonPad.length, 0); jsonHead.writeUInt32LE(0x4e4f534a, 4);
const binHead = Buffer.alloc(8);
binHead.writeUInt32LE(bin.length, 0); binHead.writeUInt32LE(0x004e4942, 4);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, Buffer.concat([head, jsonHead, json, jsonPad, binHead, bin]));
console.log(`wrote ${OUT}: ${(total / 1024 / 1024).toFixed(2)} MB, ${compacted.length / 3} triangles, ${left} vertices`);
