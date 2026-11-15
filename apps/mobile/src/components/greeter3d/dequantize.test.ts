import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as THREE from 'three';

import { bakeQuantisedMesh } from './dequantize.ts';

/** A mesh stored the way KHR_mesh_quantization stores ChangChang. */
function quantised(): THREE.Mesh {
  const g = new THREE.BufferGeometry();
  // -1 (feet) and +1 (top of the hat) in int16, normalised.
  const pos = new Int16Array([0, -32767, 0, 0, 32767, 0, 32767, 0, 0]);
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3, true));
  const nrm = new Int16Array([0, 32767, 0, 0, 32767, 0, 0, 32767, 0]);
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3, true));
  const mesh = new THREE.Mesh(g);
  mesh.position.set(0, 0.5, 0);
  mesh.scale.setScalar(0.5);
  return mesh;
}

test('positions come back as model units: feet at 0, one unit tall', () => {
  const mesh = quantised();
  bakeQuantisedMesh(mesh);
  const p = mesh.geometry.attributes.position;
  assert.ok(p.array instanceof Float32Array);
  assert.equal(p.normalized, false);
  assert.ok(Math.abs(p.getY(0) - 0) < 1e-4);
  assert.ok(Math.abs(p.getY(1) - 1) < 1e-4);
  assert.ok(Math.abs(p.getX(2) - 0.5) < 1e-4);
});

test('the node transform is folded in, so the mesh itself is left at identity', () => {
  const mesh = quantised();
  bakeQuantisedMesh(mesh);
  assert.deepEqual(mesh.position.toArray(), [0, 0, 0]);
  assert.deepEqual(mesh.scale.toArray(), [1, 1, 1]);
});

test('normals stay unit length after the scale is folded in', () => {
  const mesh = quantised();
  bakeQuantisedMesh(mesh);
  const n = mesh.geometry.attributes.normal;
  assert.ok(Math.abs(Math.hypot(n.getX(0), n.getY(0), n.getZ(0)) - 1) < 1e-3);
});

test('an unquantised mesh is left exactly as it was', () => {
  const g = new THREE.BufferGeometry();
  const arr = new Float32Array([0, 0, 0, 0, 1, 0, 1, 0, 0]);
  g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  const mesh = new THREE.Mesh(g);
  bakeQuantisedMesh(mesh);
  assert.equal(mesh.geometry.attributes.position.array, arr);
});
