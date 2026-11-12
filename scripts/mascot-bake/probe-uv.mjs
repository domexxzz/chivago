/**
 * Can this mesh be simplified WITHOUT throwing the atlas away?
 *
 * The first bake welded by position and dropped the UVs, on the reasoning
 * that a fragmented photogrammetry atlas smears when it is decimated. The
 * weld reported only 338,404 duplicate vertices out of 3.9 M - about 9%, not
 * the sea of seams that reasoning assumed. So this measures the thing instead
 * of arguing about it: simplify the UNWELDED buffer, where every seam is a
 * border the simplifier will not cross, and see what it can actually reach.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const { MeshoptSimplifier } = await import(pathToFileURL(process.env.MESHOPT).href);
const RAW = process.argv[2];
const load = (f, T) => {
  const b = fs.readFileSync(path.join(RAW, f));
  return new T(b.buffer, b.byteOffset, b.byteLength / T.BYTES_PER_ELEMENT);
};

const position = load('position.bin', Float32Array);
const indices = load('indices.bin', Uint32Array);
console.log(`unwelded: ${position.length / 3} vertices, ${indices.length / 3} triangles`);

await MeshoptSimplifier.ready;
for (const target of [40000, 80000, 150000, 300000]) {
  // A fresh copy each time: simplify does not mutate, but compactMesh would,
  // and the floor is what matters here, not the buffer.
  const [out, error] = MeshoptSimplifier.simplify(indices, position, 3, target * 3, 0.05);
  console.log(`asked ${target} -> got ${out.length / 3} triangles, error ${error.toFixed(5)}`);
}
