/**
 * Seventy-seven mascots from eight bodies and a box of parts.
 *
 * A mascot record (`@chivago/core` `mascots.ts`) says which body it is -
 * bird, beast, sea creature, naga, bug, sprite, ape or shell - what shape
 * that body takes, what it wears on its head, what its ears and tail are,
 * and one prop. This file turns that into a rig the scene can breathe,
 * blink and bounce: the same primitives as the five Samui species, the same
 * `Rig` the animator moves, and nothing downloaded.
 *
 * The rule from `rig.ts` holds here too: the stage is said by size and by
 * the egg, never by colour, and no mascot wears the evidence green (the
 * catalogue's own test holds the colours).
 */

import * as THREE from 'three';
import type { CompanionStage, Mascot, MascotCrest, MascotEars, MascotProp, MascotTail } from '@chivago/core';
import { headRatio } from './rig.ts';
import { at, capsule, cone, cylinder, eyes, group, mat, shadowed, sphere, tube, type Mat, type Rig } from './primitives.ts';

// ---------------------------------------------------------------------------
// Parts
// ---------------------------------------------------------------------------

const GOLD = '#e0b34a';

function earsFor(kind: MascotEars, r: number, y: number, body: Mat, inner: Mat, feature: Mat): THREE.Object3D[] {
  switch (kind) {
    case 'round': return [-1, 1].map((s) => {
      const outer = at(sphere(r * 0.42, body, 1, 1, 0.5), s * r * 0.75, y + r * 0.7, 0);
      const pink = at(sphere(r * 0.24, inner, 1, 1, 0.4), s * r * 0.75, y + r * 0.7, r * 0.12);
      return group(outer, pink);
    });
    case 'long': return [-1, 1].map((s) => at(capsule(r * 0.16, r * 0.9, body), s * r * 0.45, y + r * 1.1, 0, 0, 0, s * -0.18));
    case 'fan': return [-1, 1].map((s) => at(sphere(r * 0.62, body, 0.35, 1, 0.9), s * r * 1.05, y + r * 0.1, -r * 0.1, 0, s * 0.35, 0));
    case 'horns': return [-1, 1].map((s) => at(cone(r * 0.13, r * 0.7, feature, 10), s * r * 0.55, y + r * 0.95, 0, 0, 0, s * -0.55));
    case 'antlers': return [-1, 1].map((s) => group(
      at(tube([[0, 0, 0], [s * 0.08, 0.22, 0], [s * 0.22, 0.4, 0]], 0.028, feature), s * r * 0.45, y + r * 0.85, 0),
      at(tube([[s * 0.08, 0.22, 0], [s * -0.02, 0.4, 0.02]], 0.022, feature), s * r * 0.45, y + r * 0.85, 0),
    ));
    case 'tufts': return [-1, 1].map((s) => at(cone(r * 0.16, r * 0.42, feature, 10), s * r * 0.55, y + r * 0.95, 0, 0, 0, s * -0.3));
    default: return [];
  }
}

function crestFor(kind: MascotCrest, r: number, y: number, accent: Mat, feature: Mat, belly: Mat): THREE.Object3D[] {
  switch (kind) {
    case 'crest': return [0, 1, 2].map((i) => at(sphere(r * 0.2, accent, 1, 1.5, 0.5), 0, y + r * (0.95 + i * 0.05), -r * 0.35 + i * r * 0.28, -0.3));
    case 'crown': {
      const band = at(cylinder(r * 0.55, r * 0.58, r * 0.22, mat(GOLD, { roughness: 0.4, metalness: 0.6 })), 0, y + r * 0.95, 0);
      const points = [-1, 0, 1].map((i) => at(cone(r * 0.1, r * 0.3, mat(GOLD, { roughness: 0.4, metalness: 0.6 }), 8), i * r * 0.3, y + r * 1.15, 0));
      return [band, ...points];
    }
    case 'flower': {
      const petals = [0, 1, 2, 3, 4].map((i) => {
        const a = (i / 5) * Math.PI * 2;
        return at(sphere(r * 0.24, accent, 1, 0.45, 1.6), Math.sin(a) * r * 0.32, y + r * 1.02, Math.cos(a) * r * 0.32, 0, a, 0);
      });
      return [...petals, at(sphere(r * 0.16, mat('#f2c24e'), 1, 0.7, 1), 0, y + r * 1.06, 0)];
    }
    case 'fruit': return [at(sphere(r * 0.28, accent), r * 0.25, y + r * 1.05, 0)];
    case 'leaf': return [
      at(cylinder(0.012, 0.012, r * 0.35, feature), 0, y + r * 1.1, 0),
      at(sphere(r * 0.3, mat('#5f8f4a'), 1, 0.25, 0.5), r * 0.22, y + r * 1.25, 0, 0, 0, -0.5),
    ];
    case 'spikes': return [0, 1, 2, 3].map((i) => at(cone(r * 0.11, r * 0.32, feature, 8), 0, y + r * (0.9 - i * 0.28), -r * (0.2 + i * 0.32), -0.6 + i * 0.15));
    case 'fin': return [at(sphere(r * 0.42, feature, 0.2, 1, 1), 0, y + r * 0.85, -r * 0.25)];
    case 'whiskers': return [-1, 1].map((s) => at(tube([[0, 0, 0], [s * 0.18, 0.02, 0.1], [s * 0.34, -0.06, 0.04]], 0.012, belly), s * r * 0.5, y - r * 0.15, r * 0.7));
    case 'antennae': return [-1, 1].map((s) => group(
      at(tube([[0, 0, 0], [s * 0.05, 0.22, 0.02], [s * 0.14, 0.36, 0]], 0.014, feature), s * r * 0.3, y + r * 0.8, r * 0.2),
      at(sphere(0.035, accent), s * r * 0.3 + s * 0.14, y + r * 0.8 + 0.36, r * 0.2),
    ));
    case 'flame': return [at(cone(r * 0.26, r * 0.7, mat('#ffb347', { emissive: '#ff6a00', emissiveIntensity: 1.2 }), 10), 0, y + r * 1.25, 0)];
    default: return [];
  }
}

function tailFor(kind: MascotTail, body: Mat, accent: Mat, z: number, y: number): THREE.Object3D | null {
  switch (kind) {
    case 'short': return at(sphere(0.07, body, 1, 1, 1.4), 0, y + 0.05, z - 0.05);
    case 'long': return at(tube([[0, 0, 0], [0, 0.08, -0.22], [0.08, 0.3, -0.36], [0.18, 0.44, -0.3]], 0.05, body, true), 0, y, z);
    case 'plume': return group(...[-1, 0, 1].map((i) => at(sphere(0.07, i === 0 ? accent : body, 0.5, 1.9, 1), i * 0.07, y + 0.18, z - 0.08, 0.6, 0, i * 0.3)));
    case 'flukes': return group(...[-1, 1].map((s) => at(sphere(0.16, body, 1.3, 0.25, 0.7), s * 0.14, y, z - 0.12, 0, s * 0.5, 0)));
    case 'fan': return group(...[-1, 0, 1].map((i) => at(sphere(0.11, body, 0.5, 0.2, 1.6), i * 0.06, y, z - 0.16, 0, i * 0.35, 0)));
    default: return null;
  }
}

function propFor(kind: MascotProp | null, m: Mascot, headY: number, headR: number, front: number): THREE.Object3D | null {
  const accent = mat(m.colours.accent, { roughness: 0.6 });
  const feature = mat(m.colours.feature);
  switch (kind) {
    case 'umbrella': return group(
      at(cone(0.42, 0.14, accent, 24), 0, headY + headR * 1.25, 0),
      at(cylinder(0.012, 0.012, 0.55, mat('#8a6a3c')), 0.1, headY + headR * 0.95, 0.05, 0, 0, 0.18),
      at(sphere(0.03, mat('#8a6a3c')), 0, headY + headR * 1.32, 0),
    );
    case 'chedi': return group(
      at(cylinder(headR * 0.42, headR * 0.5, headR * 0.16, mat(GOLD, { roughness: 0.4, metalness: 0.5 })), 0, headY + headR * 1.0, 0),
      at(cylinder(headR * 0.24, headR * 0.34, headR * 0.3, mat(GOLD, { roughness: 0.4, metalness: 0.5 })), 0, headY + headR * 1.2, 0),
      at(cone(headR * 0.14, headR * 0.7, mat(GOLD, { roughness: 0.4, metalness: 0.5 }), 12), 0, headY + headR * 1.65, 0),
    );
    case 'lantern': return group(
      at(sphere(0.1, mat('#ffd27a', { emissive: '#ffb347', emissiveIntensity: 1.3, roughness: 0.4 })), 0.42, headY - 0.05, front * 0.6),
      at(cylinder(0.008, 0.008, 0.4, mat('#5c3a1e')), 0.42, headY + 0.2, front * 0.6),
    );
    case 'mask': return group(
      at(sphere(headR * 1.02, mat('#f2b57a', { roughness: 0.7 }), 1, 1.15, 0.55), 0, headY + headR * 0.1, headR * 0.55),
      at(cone(headR * 0.16, headR * 0.9, mat('#c43c2f'), 10), 0, headY - headR * 0.05, headR * 1.3, Math.PI / 2 + 0.2),
      ...[-1, 1].map((s) => at(cone(headR * 0.12, headR * 0.45, accent, 8), s * headR * 0.55, headY + headR * 1.0, headR * 0.3, 0, 0, s * -0.4)),
    );
    case 'drum': return group(
      at(cylinder(0.16, 0.16, 0.22, mat('#8a4a2a'), 18), 0, 0.12, front * 0.55, Math.PI / 2),
      at(cylinder(0.165, 0.165, 0.03, mat('#f1e6d6'), 18), 0, 0.12, front * 0.55 + 0.12, Math.PI / 2),
    );
    case 'boat': return at(sphere(0.5, mat('#8a5a3a'), 1, 0.35, 0.6), 0, 0.06, 0);
    case 'gem': return at(shadowed(new THREE.Mesh(new THREE.OctahedronGeometry(0.11, 0), mat(m.colours.accent, { emissive: m.colours.accent, emissiveIntensity: 0.5, roughness: 0.2, metalness: 0.3 }))), 0.28, headY - headR * 0.6, front * 0.55);
    case 'scarf': return at(shadowed(new THREE.Mesh(new THREE.TorusGeometry(headR * 0.75, 0.05, 10, 24), accent)), 0, headY - headR * 0.9, 0, Math.PI / 2);
    case 'rocket': return group(
      at(cylinder(0.05, 0.05, 0.55, mat('#e8543a')), 0.3, 0.45, -0.15, 0, 0, -0.35),
      at(cone(0.06, 0.16, mat('#f2c24e'), 10), 0.42, 0.78, -0.15, 0, 0, -0.35),
      at(cylinder(0.012, 0.012, 0.7, mat('#8a6a3c')), 0.36, 0.3, -0.15, 0, 0, -0.35),
    );
    case 'salt': return group(...[0, 1, 2, 3, 4].map((i) => at(shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.06), mat('#f8f8f4', { roughness: 0.5 }))), -0.5 + i * 0.12, 0.03, 0.45 + (i % 2) * 0.1, 0, i * 0.5, 0)));
    case 'pearl': return at(sphere(0.09, mat('#f6f0ff', { emissive: '#ffffff', emissiveIntensity: 0.35, roughness: 0.2 })), 0, headY + headR * 0.15, front * 0.85);
    case 'steam': return group(...[0, 1, 2].map((i) => {
      const s = sphere(0.07 + i * 0.03, mat('#ffffff', { roughness: 1 }));
      (s.material as THREE.MeshStandardMaterial).transparent = true;
      (s.material as THREE.MeshStandardMaterial).opacity = 0.35;
      s.castShadow = false;
      return at(s, -0.25 + i * 0.22, 0.75 + i * 0.16, -0.1);
    }));
    case 'tusks': return group(...[-1, 1].map((s) => at(tube([[0, 0, 0], [0, -0.06, 0.12], [s * 0.02, 0.04, 0.24]], 0.03, mat('#f8f4ea'), true), s * headR * 0.42, headY - headR * 0.45, headR * 0.6)));
    case 'trunk': return at(tube([[0, 0, 0], [0, -0.22, 0.1], [0, -0.42, 0.06], [0.06, -0.52, 0.14]], headR * 0.2, mat(m.colours.body), true), 0, headY - headR * 0.2, headR * 0.85);
    case 'pot': return at(cylinder(0.3, 0.22, 0.26, mat(m.colours.feature, { roughness: 0.9 }), 20), 0, 0.14, 0);
    case 'book': return at(shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.05, 0.2), mat('#3a4a6b'))), 0.3, 0.05, front * 0.55, 0, -0.4, 0);
    case 'wings': return group(...[-1, 1].map((s) => {
      const w = sphere(0.3, mat(m.colours.accent, { roughness: 0.5 }), 1.3, 0.12, 0.8);
      (w.material as THREE.MeshStandardMaterial).transparent = true;
      (w.material as THREE.MeshStandardMaterial).opacity = 0.75;
      return at(w, s * 0.32, headY - headR * 0.4, -0.08, 0, 0, s * 0.35);
    }));
    case 'shell': return at(shadowed(new THREE.Mesh(new THREE.TorusKnotGeometry(0.17, 0.09, 48, 8, 1, 3), mat(m.colours.feature, { roughness: 0.6 }))), 0, 0.45, -0.28, 0.6, 0, 0);
    case 'basket': return at(cylinder(0.22, 0.16, 0.18, mat('#c9a06a', { roughness: 1 }), 16), 0, 0.09, front * 0.62);
    case 'petals': return group(...[0, 1, 2, 3, 4, 5].map((i) => at(sphere(0.12, accent, 1, 0.3, 1.8), Math.sin(i) * 0.4, 0.05, Math.cos(i) * 0.4, 0, i, 0)));
    default: return null;
  }
}

// ---------------------------------------------------------------------------
// Bodies
// ---------------------------------------------------------------------------

interface Mats { body: Mat; belly: Mat; feature: Mat; accent: Mat; eye: Mat }

const matsFor = (m: Mascot): Mats => ({
  body: mat(m.colours.body),
  belly: mat(m.colours.belly),
  feature: mat(m.colours.feature),
  accent: mat(m.colours.accent, { roughness: 0.6 }),
  eye: mat(m.colours.feature < '#555555' ? m.colours.feature : '#2c2622', { roughness: 0.3 }),
});

/** A head: a sphere, eyes, ears and crest, with a little snout in the belly colour. */
function head(m: Mascot, mats: Mats, r: number, y: number, z: number, snout = 0.5): { group: THREE.Group; lids: THREE.Mesh[] } {
  const g = group();
  g.position.set(0, y, z);
  const skull = sphere(r, mats.body);
  const ey = eyes(r * 0.24, r * 0.42, r * 0.12, r * 0.78, mats.eye);
  const nose = at(sphere(r * snout, mats.belly, 1, 0.8, 0.8), 0, -r * 0.3, r * 0.68);
  g.add(skull, ey.group, nose, ...earsFor(m.ears, r, 0, mats.body, mats.belly, mats.feature), ...crestFor(m.crest, r, 0, mats.accent, mats.feature, mats.belly));
  // An elephant is an elephant by its trunk, whatever else it carries.
  if (m.key.includes('elephant')) {
    g.add(propFor('trunk', m, 0, r, 1)!, propFor('tusks', m, 0, r, 1)!);
    nose.visible = false;
  }
  const prop = propFor(m.prop, m, 0, r, 1);
  if (prop && ['umbrella', 'chedi', 'mask', 'tusks', 'trunk', 'scarf', 'pearl', 'gem', 'lantern'].includes(m.prop!)) g.add(prop);
  return { group: g, lids: ey.lids };
}

/** Whatever prop is not worn on the head stands with the body. */
function bodyProp(m: Mascot, headY: number, headR: number): THREE.Object3D | null {
  if (!m.prop || ['umbrella', 'chedi', 'mask', 'tusks', 'trunk', 'scarf', 'pearl', 'gem', 'lantern'].includes(m.prop)) return null;
  return propFor(m.prop, m, headY, headR, 1);
}

function buildBird(m: Mascot, mats: Mats, hr: number): Rig {
  const body = at(sphere(0.3, mats.body, 1, 1.05, 1.15), 0, 0.42, 0);
  const belly = at(sphere(0.24, mats.belly, 1, 0.9, 0.9), 0, 0.36, 0.14);
  const hd = head(m, mats, 0.24 * hr, 0.78, 0.1, 0.3);
  const beak = at(cone(0.06, 0.16, mats.accent, 8), 0, -0.02, 0.24 * hr + 0.05, Math.PI / 2);
  hd.group.add(beak);
  const wings = [-1, 1].map((s) => at(sphere(0.2, mats.body, 0.5, 0.8, 1.2), s * 0.3, 0.46, -0.02, 0, 0, s * 0.35));
  const legs = [-1, 1].map((s) => at(cylinder(0.02, 0.02, 0.18, mats.accent), s * 0.1, 0.1, 0.04));
  const tail = tailFor(m.tail === 'none' ? 'fan' : m.tail, mats.body, mats.accent, -0.28, 0.42);
  const prop = bodyProp(m, 0.78, 0.24 * hr);
  const root = group(body, belly, hd.group, ...wings, ...legs, ...(tail ? [tail] : []), ...(prop ? [prop] : []));
  return { root, body, head: hd.group, lids: hd.lids, limbs: wings, tail: tail ?? undefined, restY: 0 };
}

function buildBeast(m: Mascot, mats: Mats, hr: number): Rig {
  const long = m.shape === 'long' || m.shape === 'tall';
  const body = at(capsule(0.27, long ? 0.6 : 0.42, mats.body), 0, 0.44, 0, Math.PI / 2);
  const belly = at(sphere(0.2, mats.belly, 1.1, 0.6, long ? 1.6 : 1.2), 0, 0.32, 0.02);
  const hd = head(m, mats, 0.27 * hr, m.shape === 'tall' ? 0.86 : 0.76, long ? 0.48 : 0.4, 0.45);
  const legs = [[-1, 1], [1, 1], [-1, -1], [1, -1]].map(([sx, sz]) => at(cylinder(0.06, 0.07, 0.24, mats.body), sx! * 0.17, 0.12, sz! * (long ? 0.28 : 0.2)));
  const tail = tailFor(m.tail, mats.body, mats.accent, long ? -0.42 : -0.32, 0.46);
  const prop = bodyProp(m, 0.76, 0.27 * hr);
  const root = group(body, belly, hd.group, ...legs, ...(tail ? [tail] : []), ...(prop ? [prop] : []));
  return { root, body, head: hd.group, lids: hd.lids, limbs: legs, tail: tail ?? undefined, restY: 0 };
}

function buildSea(m: Mascot, mats: Mats, hr: number): Rig {
  const tall = m.shape === 'tall';
  const flat = m.shape === 'flat';
  const body = tall
    ? at(capsule(0.2, 0.4, mats.body), 0, 0.5, 0)
    : at(sphere(0.3, mats.body, flat ? 1.9 : 1.5, flat ? 0.4 : 0.85, 1), 0, 0.42, 0);
  const belly = at(sphere(0.22, mats.belly, flat ? 1.5 : 1.2, 0.5, 0.8), 0, 0.34, 0.1);
  const hd = head(m, mats, 0.2 * hr, tall ? 0.82 : 0.5, tall ? 0.05 : 0.38, 0.25);
  const fins = [-1, 1].map((s) => at(sphere(0.14, mats.feature, 1.4, 0.3, 0.7), s * (flat ? 0.5 : 0.32), 0.4, 0.05, 0, 0, s * -0.4));
  const tail = tailFor(m.tail === 'none' ? 'flukes' : m.tail, mats.body, mats.accent, flat ? -0.5 : -0.4, 0.42);
  const prop = bodyProp(m, 0.5, 0.2 * hr);
  const root = group(body, belly, hd.group, ...fins, ...(tail ? [tail] : []), ...(prop ? [prop] : []));
  root.position.y = 0.12;
  return { root, body, head: hd.group, lids: hd.lids, limbs: fins, tail: tail ?? undefined, restY: 0.12 };
}

function buildNaga(m: Mascot, mats: Mats, hr: number): Rig {
  const path: [number, number, number][] = [[0.4, 0.06, -0.5], [0.3, 0.1, -0.1], [-0.2, 0.18, 0.15], [-0.35, 0.45, -0.1], [-0.05, 0.75, -0.05], [0.1, 1.0, 0.15]];
  const body = tube(path, 0.13, mats.body);
  const bellyLine = tube(path.map(([x, y, z]) => [x, y - 0.06, z + 0.05] as [number, number, number]), 0.07, mats.belly);
  const hd = head(m, mats, 0.24 * hr, 1.12, 0.22, 0.4);
  const scales = [0, 1, 2, 3, 4].map((i) => at(cone(0.05, 0.12, mats.accent, 6), path[i]![0], path[i]![1] + 0.14, path[i]![2], -0.4));
  const tailTip = at(cone(0.12, 0.3, mats.body, 10), 0.45, 0.08, -0.62, Math.PI / 2 + 0.2, 0.3);
  const prop = bodyProp(m, 1.12, 0.24 * hr);
  const root = group(body, bellyLine, hd.group, ...scales, tailTip, ...(prop ? [prop] : []));
  return { root, body, head: hd.group, lids: hd.lids, limbs: scales, tail: tailTip, restY: 0 };
}

function buildBug(m: Mascot, mats: Mats, hr: number): Rig {
  const long = m.shape === 'long';
  const body = at(sphere(0.24, mats.body, 1, 0.9, long ? 1.9 : 1.1), 0, 0.34, -0.05);
  const stripes = long ? [0, 1, 2].map((i) => at(shadowed(new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.03, 8, 24), mats.feature)), 0, 0.34, -0.05 - 0.12 + i * 0.14)) : [];
  const hd = head(m, mats, 0.19 * hr, 0.5, 0.3, 0.2);
  const legs = [[-1, 0.1], [1, 0.1], [-1, -0.05], [1, -0.05], [-1, -0.2], [1, -0.2]].map(([s, z]) => at(cylinder(0.015, 0.015, 0.22, mats.feature), s! * 0.22, 0.2, z!, 0, 0, s! * 0.6));
  const wings = m.prop === 'wings' ? [] : [-1, 1].map((s) => {
    const w = sphere(0.22, mats.accent, 1.2, 0.1, 0.8);
    (w.material as THREE.MeshStandardMaterial).transparent = true;
    (w.material as THREE.MeshStandardMaterial).opacity = 0.6;
    return at(w, s * 0.24, 0.5, -0.05, 0, 0, s * 0.3);
  });
  const prop = bodyProp(m, 0.5, 0.19 * hr);
  const propWings = prop && m.prop === 'wings' ? [prop] : [];
  const root = group(body, ...stripes, hd.group, ...legs, ...wings, ...(prop && m.prop !== 'wings' ? [prop] : []), ...propWings);
  root.position.y = 0.05;
  return { root, body, head: hd.group, lids: hd.lids, limbs: [...wings, ...propWings], restY: 0.05 };
}

function buildSprite(m: Mascot, mats: Mats, hr: number): Rig {
  let body: THREE.Mesh;
  let faceY: number;
  let faceR: number;
  switch (m.shape) {
    case 'pear': body = at(sphere(0.3, mats.body, 1, 1.25, 1), 0, 0.42, 0); faceY = 0.5; faceR = 0.3; break;
    case 'tall': body = at(capsule(0.22, 0.4, mats.body), 0, 0.5, 0); faceY = 0.6; faceR = 0.22; break;
    case 'flat': body = at(sphere(0.36, mats.body, 1.2, 0.7, 1), 0, 0.28, 0); faceY = 0.32; faceR = 0.36; break;
    case 'long': body = at(capsule(0.2, 0.5, mats.body), 0, 0.3, 0, 0, 0, Math.PI / 2 - 0.5); faceY = 0.45; faceR = 0.22; break;
    default: body = at(sphere(0.34, mats.body), 0, 0.4, 0); faceY = 0.42; faceR = 0.34;
  }
  const belly = at(sphere(faceR * 0.75, mats.belly, 1, 0.8, 0.5), 0, faceY - faceR * 0.35, faceR * 0.62);
  // The face sits on the body: the head group is at the face, and only its
  // eyes and crest belong to it, so a look-at turns the eyes, not the fruit.
  const hd = group();
  hd.position.set(0, faceY, 0);
  const ey = eyes(faceR * 0.2, faceR * 0.36, faceR * 0.12, faceR * 0.86, mats.eye);
  const smile = at(shadowed(new THREE.Mesh(new THREE.TorusGeometry(faceR * 0.16, 0.012, 6, 16, Math.PI), mats.feature)), 0, -faceR * 0.22, faceR * 0.92, Math.PI);
  hd.add(ey.group, smile);
  const top = group(...crestFor(m.crest, faceR, faceY, mats.accent, mats.feature, mats.belly));
  const arms = [-1, 1].map((s) => at(capsule(0.045, 0.16, mats.body), s * (faceR + 0.03), faceY - faceR * 0.2, 0.05, 0, 0, s * -1.1));
  const feet = [-1, 1].map((s) => at(sphere(0.08, mats.feature, 1, 0.5, 1.3), s * 0.13, 0.04, 0.08));
  const propHead = propFor(m.prop, m, faceY, faceR, 1);
  const root = group(body, belly, hd, top, ...arms, ...feet, ...(propHead ? [propHead] : []));
  return { root, body, head: hd, lids: ey.lids, limbs: arms, restY: 0 };
}

function buildApe(m: Mascot, mats: Mats, hr: number): Rig {
  const body = at(sphere(0.28, mats.body, 1, 1.1, 0.9), 0, 0.5, 0);
  const belly = at(sphere(0.2, mats.belly, 1, 1, 0.6), 0, 0.46, 0.18);
  const big = m.key.includes('loris');
  const hd = head(m, mats, 0.26 * hr, 0.92, 0.05, 0.35);
  if (big) hd.group.scale.setScalar(1.12);
  const arms = [-1, 1].map((s) => at(capsule(0.06, 0.34, mats.body), s * 0.3, 0.48, 0.06, 0.5, 0, s * -0.35));
  const legs = [-1, 1].map((s) => at(capsule(0.07, 0.2, mats.body), s * 0.16, 0.16, 0.05, 0.3));
  const tail = tailFor(m.tail, mats.body, mats.accent, -0.25, 0.4);
  const prop = bodyProp(m, 0.92, 0.26 * hr);
  const root = group(body, belly, hd.group, ...arms, ...legs, ...(tail ? [tail] : []), ...(prop ? [prop] : []));
  return { root, body, head: hd.group, lids: hd.lids, limbs: [...arms, ...legs], tail: tail ?? undefined, restY: 0 };
}

function buildShell(m: Mascot, mats: Mats, hr: number): Rig {
  const flat = m.shape === 'flat';
  const dome = at(sphere(0.38, mats.body, 1.1, flat ? 0.45 : 0.75, 1), 0, 0.22, -0.05);
  const rim = at(sphere(0.4, mats.belly, 1.15, 0.18, 1.05), 0, 0.14, -0.05);
  const ring = at(shadowed(new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.03, 8, 28), mats.accent)), 0, 0.42, -0.05, Math.PI / 2);
  const hd = head(m, mats, 0.17 * hr, 0.34, 0.42, 0.3);
  const legs = [[-1, 1], [1, 1], [-1, -1], [1, -1]].map(([sx, sz]) => at(sphere(0.08, mats.feature, 1, 0.6, 1.2), sx! * 0.3, 0.06, sz! * 0.22));
  const tail = tailFor(m.tail, mats.body, mats.accent, -0.4, 0.14);
  const prop = bodyProp(m, 0.34, 0.17 * hr);
  const root = group(dome, rim, ring, hd.group, ...legs, ...(tail ? [tail] : []), ...(prop ? [prop] : []));
  return { root, body: dome, head: hd.group, lids: hd.lids, limbs: legs, tail: tail ?? undefined, restY: 0 };
}

// ---------------------------------------------------------------------------
// The rig, the camera, the idle
// ---------------------------------------------------------------------------

export function buildMascot(m: Mascot, stage: Exclude<CompanionStage, 'egg'>): Rig {
  const mats = matsFor(m);
  const hr = headRatio(stage);
  switch (m.archetype) {
    case 'bird': return buildBird(m, mats, hr);
    case 'beast': return buildBeast(m, mats, hr);
    case 'sea': return buildSea(m, mats, hr);
    case 'naga': return buildNaga(m, mats, hr);
    case 'bug': return buildBug(m, mats, hr);
    case 'sprite': return buildSprite(m, mats, hr);
    case 'ape': return buildApe(m, mats, hr);
    case 'shell': return buildShell(m, mats, hr);
  }
}

/** Where the camera looks and how far it stands, by body. */
export function mascotCamera(m: Mascot): { focusY: number; dist: number } {
  switch (m.archetype) {
    case 'naga': return { focusY: 0.62, dist: 2.7 };
    case 'ape': return { focusY: 0.6, dist: 2.4 };
    case 'beast': return { focusY: 0.5, dist: 2.4 };
    case 'bird': return { focusY: 0.5, dist: 2.2 };
    case 'shell': return { focusY: 0.28, dist: 2.0 };
    case 'sea': return { focusY: 0.4, dist: 2.3 };
    case 'bug': return { focusY: 0.36, dist: 2.0 };
    default: return { focusY: 0.42, dist: 2.1 };
  }
}

/** How long a mascot's answer to a tap lasts. */
export const MASCOT_REACTION_MS = 1200;

/**
 * The idle and the answer to a tap, by body. `k` runs 0..1 through the
 * reaction, `pulse` is its bell curve; `motion` is 0 under reduce-motion.
 */
export function mascotIdle(rig: Rig, m: Mascot, t: number, k: number, pulse: number, motion: number): void {
  switch (m.archetype) {
    case 'bird': {
      for (const [i, w] of rig.limbs.entries()) w.rotation.z = (i === 0 ? 1 : -1) * (0.35 + Math.sin(t * 2.2) * 0.04 * motion - pulse * 0.9);
      rig.root.position.y = rig.restY + pulse * 0.32;
      rig.head.rotation.z = pulse * 0.2;
      if (rig.tail) rig.tail.rotation.x = Math.sin(t * 0.9) * 0.08 * motion + pulse * 0.4;
      break;
    }
    case 'beast': {
      rig.root.position.y = rig.restY + pulse * 0.24;
      for (const [i, leg] of rig.limbs.entries()) leg.rotation.x = Math.sin(t * 1.4 + i) * 0.05 * motion - pulse * (i < 2 ? 0.7 : -0.4);
      if (rig.tail) rig.tail.rotation.y = Math.sin(t * 2.4) * 0.3 * motion + Math.sin(k * Math.PI * 4) * 0.5 * pulse;
      rig.head.rotation.z = pulse * 0.18;
      break;
    }
    case 'sea': {
      rig.root.position.y = rig.restY + Math.sin(t * 1.1) * 0.05 * motion + pulse * 0.3;
      rig.root.rotation.z = Math.sin(t * 0.7) * 0.06 * motion + Math.sin(k * Math.PI * 2) * 0.6 * pulse;
      for (const [i, f] of rig.limbs.entries()) f.rotation.z = (i === 0 ? -0.4 : 0.4) + Math.sin(t * 2 + i) * 0.15 * motion;
      if (rig.tail) rig.tail.rotation.y = Math.sin(t * 2.2) * 0.25 * motion + Math.sin(k * Math.PI * 6) * 0.4 * pulse;
      break;
    }
    case 'naga': {
      rig.root.rotation.y = Math.sin(t * 0.5) * 0.1 * motion;
      rig.head.position.y = 1.12 + Math.sin(t * 1.2) * 0.03 * motion + pulse * 0.18;
      rig.head.rotation.z = Math.sin(k * Math.PI * 2) * 0.3 * pulse;
      for (const [i, s] of rig.limbs.entries()) s.rotation.x = -0.4 + Math.sin(t * 1.5 + i) * 0.1 * motion - pulse * 0.5;
      break;
    }
    case 'bug': {
      const buzz = pulse > 0 ? Math.sin(t * 40) * 0.5 : Math.sin(t * 6) * 0.08;
      for (const [i, w] of rig.limbs.entries()) w.rotation.z = (i % 2 === 0 ? 1 : -1) * (0.3 + buzz * motion);
      rig.root.position.y = rig.restY + Math.sin(t * 2) * 0.03 * motion + pulse * 0.4;
      break;
    }
    case 'sprite': {
      rig.root.rotation.z = Math.sin(t * 1.4) * 0.03 * motion + Math.sin(k * Math.PI * 3) * 0.2 * pulse;
      rig.root.position.y = rig.restY + Math.abs(Math.sin(k * Math.PI * 2)) * 0.28 * pulse;
      for (const [i, a] of rig.limbs.entries()) a.rotation.z = (i === 0 ? -1.1 : 1.1) + Math.sin(t * 2 + i) * 0.08 * motion + (i === 0 ? -1 : 1) * pulse * 1.2;
      break;
    }
    case 'ape': {
      rig.root.position.y = rig.restY + pulse * 0.3;
      const [al, ar] = rig.limbs;
      if (al) al.rotation.z = -0.35 + Math.sin(t * 1.3) * 0.05 * motion - pulse * 2.2; // the wave
      if (ar) ar.rotation.z = 0.35 - Math.sin(t * 1.3) * 0.05 * motion;
      if (rig.tail) rig.tail.rotation.y = Math.sin(t * 1.1) * 0.25 * motion;
      rig.head.rotation.z = pulse * 0.25;
      break;
    }
    case 'shell': {
      const tuck = pulse > 0 ? Math.sin(Math.min(1, k * 1.6) * Math.PI) : 0;
      rig.head.position.z = 0.42 - tuck * 0.2;
      for (const [i, leg] of rig.limbs.entries()) leg.position.y = 0.06 + Math.max(0, Math.sin(t * 3 + i * 1.5)) * 0.02 * motion;
      rig.root.position.y = rig.restY + Math.sin(t * 0.8) * 0.008 * motion;
      break;
    }
  }
}
