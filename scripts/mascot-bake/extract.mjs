/**
 * Pull the one mesh and the three textures out of a 233 MB Meshy GLB without
 * reading the whole buffer into memory: every accessor is a targeted fs.read
 * of its own byte range.
 */
import fs from 'node:fs';
import path from 'node:path';

const SRC = process.argv[2];
const OUT = process.argv[3];
fs.mkdirSync(OUT, { recursive: true });

const fd = fs.openSync(SRC, 'r');
const header = Buffer.alloc(12);
fs.readSync(fd, header, 0, 12, 0);
const jsonLen = (() => { const b = Buffer.alloc(8); fs.readSync(fd, b, 0, 8, 12); return b.readUInt32LE(0); })();
const jsonBuf = Buffer.alloc(jsonLen);
fs.readSync(fd, jsonBuf, 0, jsonLen, 20);
const g = JSON.parse(jsonBuf.toString('utf8'));

// BIN chunk header sits right after the JSON chunk.
const binHeaderAt = 20 + jsonLen;
const binHeader = Buffer.alloc(8);
fs.readSync(fd, binHeader, 0, 8, binHeaderAt);
const binLen = binHeader.readUInt32LE(0);
const binType = binHeader.readUInt32LE(4);
if (binType !== 0x004e4942) throw new Error(`chunk1 is not BIN: 0x${binType.toString(16)}`);
const BIN = binHeaderAt + 8;
console.log('bin starts at', BIN, 'length', binLen);

console.log('node 0:', JSON.stringify(g.nodes[0]));
console.log('scene:', JSON.stringify(g.scenes));
console.log('samplers:', JSON.stringify(g.samplers));
console.log('textures:', JSON.stringify(g.textures));
console.log('material 0 full:', JSON.stringify(g.materials[0]));

const COMPONENT = {
  5120: { n: 'BYTE', size: 1, read: (b, o) => b.readInt8(o) },
  5121: { n: 'UBYTE', size: 1, read: (b, o) => b.readUInt8(o) },
  5122: { n: 'SHORT', size: 2, read: (b, o) => b.readInt16LE(o) },
  5123: { n: 'USHORT', size: 2, read: (b, o) => b.readUInt16LE(o) },
  5125: { n: 'UINT', size: 4, read: (b, o) => b.readUInt32LE(o) },
  5126: { n: 'FLOAT', size: 4, read: (b, o) => b.readFloatLE(o) },
};
const COUNT = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

/** Read one accessor into a typed array, as float or uint32. */
function readAccessor(index, { asIndex = false } = {}) {
  const a = g.accessors[index];
  const bv = g.bufferViews[a.bufferView];
  const comp = COMPONENT[a.componentType];
  const per = COUNT[a.type];
  const elementBytes = comp.size * per;
  const stride = bv.byteStride || elementBytes;
  const start = BIN + (bv.byteOffset || 0) + (a.byteOffset || 0);
  const total = stride * (a.count - 1) + elementBytes;
  const raw = Buffer.alloc(total);
  fs.readSync(fd, raw, 0, total, start);
  const out = asIndex ? new Uint32Array(a.count * per) : new Float32Array(a.count * per);
  for (let i = 0; i < a.count; i += 1) {
    for (let c = 0; c < per; c += 1) {
      out[i * per + c] = comp.read(raw, i * stride + c * comp.size);
    }
  }
  return { data: out, per, count: a.count, componentType: comp.n, min: a.min, max: a.max };
}

const prim = g.meshes[0].primitives[0];
const indices = readAccessor(prim.indices, { asIndex: true });
const position = readAccessor(prim.attributes.POSITION);
const normal = readAccessor(prim.attributes.NORMAL);
const uv = readAccessor(prim.attributes.TEXCOORD_0);
console.log('indices', indices.count, indices.componentType, 'positions', position.count, 'normals', normal.count, 'uv', uv.count);
console.log('POSITION min/max from accessor:', position.min, position.max);

// Measured, not trusted: Meshy writes accessor min/max but the bake depends on it.
const bbox = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
for (let i = 0; i < position.count; i += 1) {
  for (let c = 0; c < 3; c += 1) {
    const v = position.data[i * 3 + c];
    if (v < bbox.min[c]) bbox.min[c] = v;
    if (v > bbox.max[c]) bbox.max[c] = v;
  }
}
console.log('measured bbox', JSON.stringify(bbox));
console.log('size', bbox.max.map((v, i) => +(v - bbox.min[i]).toFixed(4)));

fs.writeFileSync(path.join(OUT, 'indices.bin'), Buffer.from(indices.data.buffer, 0, indices.data.byteLength));
fs.writeFileSync(path.join(OUT, 'position.bin'), Buffer.from(position.data.buffer, 0, position.data.byteLength));
fs.writeFileSync(path.join(OUT, 'normal.bin'), Buffer.from(normal.data.buffer, 0, normal.data.byteLength));
fs.writeFileSync(path.join(OUT, 'uv.bin'), Buffer.from(uv.data.buffer, 0, uv.data.byteLength));

for (const [i, img] of g.images.entries()) {
  const bv = g.bufferViews[img.bufferView];
  const buf = Buffer.alloc(bv.byteLength);
  fs.readSync(fd, buf, 0, bv.byteLength, BIN + (bv.byteOffset || 0));
  const ext = img.mimeType === 'image/png' ? 'png' : 'jpg';
  const file = path.join(OUT, `image-${i}.${ext}`);
  fs.writeFileSync(file, buf);
  console.log('wrote', file, bv.byteLength, 'bytes');
}

fs.writeFileSync(path.join(OUT, 'meta.json'), JSON.stringify({
  counts: { indices: indices.count, vertices: position.count },
  bbox,
  material: g.materials[0],
  textures: g.textures,
  images: g.images.map((im) => ({ mimeType: im.mimeType, name: im.name })),
}, null, 2));
fs.closeSync(fd);
console.log('done');
