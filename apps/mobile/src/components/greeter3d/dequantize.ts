/**
 * Undo KHR_mesh_quantization on one mesh, so the rig sees model units.
 *
 * The detailed build is quantised to fit a phone's download: positions are
 * int16 in -1..1 and the node carries the scale and offset back to "feet at
 * y = 0, one unit tall". three renders that correctly, but `rig.ts` reads the
 * raw position array to weight the arm, tail and head, and the shader patch
 * uses `position` as the rest pose - both measured in model units. So the
 * positions are widened to float and the node's transform is folded into the
 * geometry, once, at load. Everything downstream is unchanged.
 */

import * as THREE from 'three';

export function bakeQuantisedMesh(mesh: THREE.Mesh): void {
  const geometry = mesh.geometry;
  const position = geometry.attributes.position as THREE.BufferAttribute;
  if (!position.normalized && position.array instanceof Float32Array) return;

  geometry.setAttribute('position', toFloat(position));
  const normal = geometry.attributes.normal as THREE.BufferAttribute | undefined;
  if (normal && !(normal.array instanceof Float32Array)) {
    geometry.setAttribute('normal', toFloat(normal));
  }

  mesh.updateMatrix();
  geometry.applyMatrix4(mesh.matrix);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  mesh.position.set(0, 0, 0);
  mesh.quaternion.identity();
  mesh.scale.set(1, 1, 1);
  mesh.updateMatrix();
}

/** A float copy; `getX` already applies the int-to-unit normalisation. */
function toFloat(attr: THREE.BufferAttribute): THREE.BufferAttribute {
  const out = new Float32Array(attr.count * attr.itemSize);
  for (let i = 0; i < attr.count; i += 1) {
    for (let c = 0; c < attr.itemSize; c += 1) {
      out[i * attr.itemSize + c] = attr.getComponent(i, c);
    }
  }
  return new THREE.BufferAttribute(out, attr.itemSize);
}
