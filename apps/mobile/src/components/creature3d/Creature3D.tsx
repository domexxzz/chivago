/**
 * The companion, alive, in its own room. Web only.
 *
 * A real-time scene: the animal built from primitives with a small rig, lit
 * by the island's clock, on a patch of the ground it actually lives on, with
 * the things that live there too. It breathes, it blinks, it looks at your
 * finger, and it answers a tap the way that animal would - a langur hops, a
 * hornbill throws its bill up, a kite banks round, a turtle tucks its head
 * and peeks, a crab waves the claw.
 *
 * PRIMITIVES, STILL. No model file, for the same reason the SVG marks have no
 * photograph: a downloaded langur carries somebody's licence and somebody's
 * idea of a langur. Every shape here is a sphere, a capsule, a cone or a
 * tube along a curve, placed by a number a person can read and change.
 *
 * WHAT IT DOES NOT DO. It does not feed, level, decay or want anything: the
 * meters below it are the habitat's measured air and crowding, and nothing
 * in this file writes to any of them. It also does not run on a phone yet -
 * `expo-gl` needs a development build the app has never had - so the native
 * screens keep the drawn marks and this loads only where there is a document
 * and a WebGL context (`CreatureScene.tsx`).
 *
 * Everything it decides FROM lives in `rig.ts`, which the tests can reach.
 */

import React from 'react';
import * as THREE from 'three';
import type { CompanionStage, LayerKey } from '@chivago/core';
import type { CreatureKey } from '../Creature.tsx';
import {
  HABITATS, LOOKS, REACTION_MS, headRatio, lightingFor, lightingNow, motionScale, placements, speckles, stageScale,
} from './rig.ts';

// ---------------------------------------------------------------------------
// Small builders. Every animal is made of these and nothing else.
// ---------------------------------------------------------------------------

type Mat = THREE.MeshStandardMaterial;

const matCache = new Map<string, Mat>();
function mat(hex: string, opts: Partial<{ roughness: number; metalness: number; emissive: string; emissiveIntensity: number; flat: boolean }> = {}): Mat {
  const key = `${hex}|${JSON.stringify(opts)}`;
  const cached = matCache.get(key);
  if (cached) return cached;
  const m = new THREE.MeshStandardMaterial({
    color: new THREE.Color(hex),
    roughness: opts.roughness ?? 0.82,
    metalness: opts.metalness ?? 0,
    flatShading: opts.flat ?? false,
  });
  if (opts.emissive) {
    m.emissive = new THREE.Color(opts.emissive);
    m.emissiveIntensity = opts.emissiveIntensity ?? 0.6;
  }
  matCache.set(key, m);
  return m;
}

const shadowed = <T extends THREE.Object3D>(o: T): T => { o.castShadow = true; o.receiveShadow = true; return o; };

/**
 * A soft round dot for the particles. Without a map a point is a square, and
 * a firefly is not a square. Drawn once on a tiny canvas: no asset to ship.
 */
let dotTexture: THREE.Texture | null = null;
function softDot(): THREE.Texture {
  if (dotTexture) return dotTexture;
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.8)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  dotTexture = new THREE.CanvasTexture(c);
  return dotTexture;
}

function sphere(r: number, m: Mat, sx = 1, sy = 1, sz = 1): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 28, 20), m);
  mesh.scale.set(sx, sy, sz);
  return shadowed(mesh);
}
function capsule(r: number, len: number, m: Mat): THREE.Mesh {
  return shadowed(new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 6, 16), m));
}
function cone(r: number, h: number, m: Mat, segs = 20): THREE.Mesh {
  return shadowed(new THREE.Mesh(new THREE.ConeGeometry(r, h, segs), m));
}
function cylinder(rTop: number, rBottom: number, h: number, m: Mat, segs = 14): THREE.Mesh {
  return shadowed(new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, segs), m));
}
function tube(points: [number, number, number][], r: number, m: Mat, taper = false): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3(points.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
  const geom = new THREE.TubeGeometry(curve, 24, r, 10, false);
  if (taper) {
    // Thin toward the tip: a tail, a root, a claw's finger.
    const pos = geom.attributes.position as THREE.BufferAttribute;
    const n = 25; // tubular segments + 1
    for (let i = 0; i < pos.count; i += 1) {
      const seg = Math.floor(i / 11); // radial segments + 1
      const k = 1 - (seg / n) * 0.7;
      const p = curve.getPointAt(Math.min(1, seg / (n - 1)));
      pos.setXYZ(i,
        p.x + (pos.getX(i) - p.x) * k,
        p.y + (pos.getY(i) - p.y) * k,
        p.z + (pos.getZ(i) - p.z) * k);
    }
    pos.needsUpdate = true;
    geom.computeVertexNormals();
  }
  return shadowed(new THREE.Mesh(geom, m));
}
function group(...children: THREE.Object3D[]): THREE.Group {
  const g = new THREE.Group();
  for (const c of children) g.add(c);
  return g;
}
const at = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): T => {
  o.position.set(x, y, z);
  o.rotation.set(rx, ry, rz);
  return o;
};

/** Two eyes with catchlights. The catchlight is what makes it look back. */
function eyes(r: number, spread: number, y: number, z: number, m: Mat): { group: THREE.Group; lids: THREE.Mesh[] } {
  const white = mat('#f8f6f0', { roughness: 0.35 });
  const light = mat('#ffffff', { emissive: '#ffffff', emissiveIntensity: 1.4, roughness: 0.2 });
  const lids: THREE.Mesh[] = [];
  const g = new THREE.Group();
  for (const side of [-1, 1]) {
    // A large dark iris with a thin white rim and a bright catchlight high
    // on the side toward the light. The rim is a rim, not goggles: the
    // first pass drew the white wider than the iris and every animal
    // looked as if it had been surprised in the dark.
    const eye = sphere(r, m, 1, 1, 0.8);
    eye.position.set(side * spread, y, z);
    const catchlight = sphere(r * 0.3, light);
    catchlight.position.set(side * spread + r * 0.3, y + r * 0.38, z + r * 0.62);
    catchlight.castShadow = false;
    const catchlight2 = sphere(r * 0.13, light);
    catchlight2.position.set(side * spread - r * 0.28, y - r * 0.3, z + r * 0.68);
    catchlight2.castShadow = false;
    const ring = sphere(r * 1.06, white);
    ring.position.set(side * spread, y, z - r * 0.2);
    ring.scale.set(1, 1, 0.5);
    g.add(ring, eye, catchlight, catchlight2);
    lids.push(eye, catchlight, catchlight2, ring);
  }
  return { group: g, lids };
}

// ---------------------------------------------------------------------------
// The animals. Each returns its rig: the parts the animator moves.
// ---------------------------------------------------------------------------

interface Rig {
  root: THREE.Group;
  body: THREE.Object3D;
  head: THREE.Group;
  /** Scaled in y to blink. */
  lids: THREE.Mesh[];
  /** Whatever the species swings, flaps, paddles or waves. */
  limbs: THREE.Object3D[];
  tail?: THREE.Object3D;
  /** Where the animal rests in y when not moving. */
  restY: number;
}

function buildLangur(c: (typeof LOOKS)['dusky-langur']['colours'], hr: number): Rig {
  const body = mat(c.body), belly = mat(c.belly), limb = mat(c.limb), face = mat(c.beak, { roughness: 0.7 });
  const torso = sphere(0.22, body, 1, 1.25, 0.95);
  torso.position.y = 0.36;
  const chest = sphere(0.15, belly, 1, 1.15, 0.8);
  chest.position.set(0, 0.34, 0.11);
  const head = group();
  head.position.set(0, 0.66, 0.02);
  head.scale.setScalar(hr);
  const skull = sphere(0.19, body);
  const facePatch = sphere(0.12, face, 1, 0.95, 0.7);
  facePatch.position.set(0, -0.02, 0.13);
  // The crest: a tuft, not a spike. Dusky langurs have a soft peak of fur.
  const crest = sphere(0.075, body, 1, 1.2, 0.9);
  crest.position.set(0, 0.19, -0.03);
  const ey = eyes(0.045, 0.07, 0.02, 0.19, mat(c.eye, { roughness: 0.25 }));
  // The white rings. THE feature.
  const ringMat = mat(c.feature, { roughness: 0.5 });
  for (const side of [-1, 1]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.016, 10, 24), ringMat);
    ring.position.set(side * 0.07, 0.02, 0.185);
    head.add(ring);
  }
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.007, 8, 16, Math.PI), mat(c.eye));
  mouth.position.set(0, -0.06, 0.2);
  mouth.rotation.z = Math.PI;
  head.add(skull, facePatch, crest, ey.group, mouth);
  const limbs: THREE.Object3D[] = [];
  for (const side of [-1, 1]) {
    const arm = capsule(0.045, 0.2, limb);
    at(arm, side * 0.2, 0.36, 0.06, 0.5, 0, side * 0.25);
    const leg = capsule(0.055, 0.18, limb);
    at(leg, side * 0.13, 0.12, 0.02, -0.3, 0, side * 0.15);
    const foot = sphere(0.055, limb, 1, 0.6, 1.4);
    foot.position.set(side * 0.14, 0.03, 0.08);
    limbs.push(arm, leg);
    torso.parent; // no-op, keeps ordering obvious
    limbs.push(foot);
  }
  const tail = tube([[0, 0.25, -0.18], [0.05, 0.05, -0.42], [-0.12, 0.28, -0.62], [-0.1, 0.62, -0.7]], 0.035, limb, true);
  const root = group(torso, chest, head, tail, ...limbs);
  return { root, body: torso, head, lids: ey.lids, limbs, tail, restY: 0 };
}

function buildHornbill(c: (typeof LOOKS)['pied-hornbill']['colours'], hr: number): Rig {
  const body = mat(c.body, { roughness: 0.6 }), belly = mat(c.belly), bill = mat(c.beak, { roughness: 0.45 }), casque = mat(c.feature, { roughness: 0.4 });
  const torso = sphere(0.2, body, 0.95, 1.15, 1.35);
  torso.position.set(0, 0.36, -0.05);
  torso.rotation.x = 0.25;
  const chest = sphere(0.13, belly, 1, 1.1, 0.9);
  chest.position.set(0, 0.3, 0.12);
  const head = group();
  head.position.set(0, 0.62, 0.14);
  head.scale.setScalar(hr);
  const skull = sphere(0.14, body);
  const upper = cone(0.075, 0.42, bill, 16);
  at(upper, 0, 0.0, 0.3, Math.PI / 2 + 0.25, 0, 0);
  upper.scale.set(1, 1, 0.75);
  const lower = cone(0.06, 0.34, bill, 16);
  at(lower, 0, -0.045, 0.26, Math.PI / 2 + 0.15, 0, 0);
  lower.scale.set(1, 1, 0.55);
  const cas = sphere(0.075, casque, 1.9, 0.9, 1);
  at(cas, 0, 0.1, 0.16, 0, 0, 0);
  cas.rotation.x = -0.3;
  const eyeRing = mat('#9bd3ff', { roughness: 0.5 });
  const ey = eyes(0.03, 0.09, 0.03, 0.1, mat(c.eye, { roughness: 0.25 }));
  for (const side of [-1, 1]) {
    const patch = sphere(0.045, eyeRing, 1, 1, 0.4);
    patch.position.set(side * 0.09, 0.03, 0.095);
    head.add(patch);
  }
  head.add(skull, upper, lower, cas, ey.group);
  const wings: THREE.Object3D[] = [];
  for (const side of [-1, 1]) {
    const wing = sphere(0.16, body, 0.35, 0.6, 1.3);
    wing.position.set(side * 0.16, 0.4, -0.08);
    wing.rotation.z = side * 0.35;
    wings.push(wing);
  }
  const tailFeathers = group();
  for (let i = -1; i <= 1; i += 1) {
    const f = capsule(0.03, 0.34, i === 0 ? belly : body);
    at(f, i * 0.05, 0.26, -0.42, Math.PI / 2 - 0.3, 0, i * 0.12);
    tailFeathers.add(f);
  }
  const legs: THREE.Object3D[] = [];
  const legMat = mat(c.limb, { roughness: 0.6 });
  for (const side of [-1, 1]) {
    const leg = cylinder(0.018, 0.02, 0.22, legMat, 8);
    at(leg, side * 0.07, 0.13, 0.02, 0.1, 0, 0);
    const foot = capsule(0.015, 0.09, legMat);
    at(foot, side * 0.07, 0.02, 0.06, Math.PI / 2, 0, 0);
    legs.push(leg, foot);
  }
  const root = group(torso, chest, head, ...wings, tailFeathers, ...legs);
  return { root, body: torso, head, lids: ey.lids, limbs: [...wings, lower], tail: tailFeathers, restY: 0 };
}

function buildKite(c: (typeof LOOKS)['brahminy-kite']['colours'], hr: number): Rig {
  const body = mat(c.body, { roughness: 0.7 }), hood = mat(c.belly), wingMat = mat(c.feature, { roughness: 0.7 }), beak = mat(c.beak, { roughness: 0.4 }), talon = mat(c.limb, { roughness: 0.5 });
  const torso = sphere(0.16, body, 0.9, 0.85, 1.5);
  torso.position.set(0, 0, 0);
  const breast = sphere(0.14, hood, 0.95, 0.8, 1.05);
  breast.position.set(0, -0.02, 0.1);
  const head = group();
  head.position.set(0, 0.06, 0.24);
  head.scale.setScalar(hr);
  const skull = sphere(0.11, hood);
  const bk = cone(0.035, 0.11, beak, 12);
  at(bk, 0, -0.01, 0.13, Math.PI / 2 + 0.5, 0, 0);
  const ey = eyes(0.024, 0.06, 0.02, 0.085, mat(c.eye, { roughness: 0.25 }));
  head.add(skull, bk, ey.group);
  const wings: THREE.Object3D[] = [];
  for (const side of [-1, 1]) {
    const pivot = group();
    pivot.position.set(side * 0.1, 0.04, 0);
    const inner = sphere(0.3, wingMat, 1.15, 0.12, 0.5);
    inner.position.set(side * 0.3, 0, 0);
    const outer = sphere(0.26, wingMat, 1.1, 0.09, 0.42);
    outer.position.set(side * 0.78, 0.02, -0.06);
    outer.rotation.y = side * -0.25;
    // Black-tipped primaries: the field mark seen from below.
    const tips = sphere(0.14, mat('#1b1b1f'), 1, 0.08, 0.55);
    tips.position.set(side * 1.02, 0.02, -0.1);
    pivot.add(inner, outer, tips);
    wings.push(pivot);
  }
  const tail = sphere(0.14, wingMat, 1.2, 0.08, 1);
  tail.position.set(0, 0, -0.3);
  const legs: THREE.Object3D[] = [];
  for (const side of [-1, 1]) {
    const leg = capsule(0.018, 0.08, talon);
    at(leg, side * 0.05, -0.12, 0.02, 0.4, 0, 0);
    legs.push(leg);
  }
  const root = group(torso, breast, head, ...wings, tail, ...legs);
  root.position.y = 1.1;
  return { root, body: torso, head, lids: ey.lids, limbs: wings, tail, restY: 1.1 };
}

function buildTurtle(c: (typeof LOOKS)['green-turtle']['colours'], hr: number): Rig {
  const shell = mat(c.body, { roughness: 0.55 }), scute = mat(c.feature, { roughness: 0.5 }), skin = mat(c.limb, { roughness: 0.75 }), plastron = mat(c.belly);
  const dome = sphere(0.36, shell, 1, 0.55, 1.2);
  dome.position.y = 0.2;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.045, 10, 36), shell);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.19;
  rim.scale.set(1, 1.2, 1);
  shadowed(rim);
  const under = sphere(0.34, plastron, 1, 0.22, 1.15);
  under.position.y = 0.16;
  // Scutes: a ring of five around a centre, as on the real carapace.
  const scutes = group();
  // Low plates that follow the dome, not pebbles sitting on it.
  const centre = sphere(0.12, scute, 1, 0.16, 1.3);
  centre.position.set(0, 0.383, 0);
  scutes.add(centre);
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2;
    const s = sphere(0.095, scute, 1, 0.14, 1.15);
    s.position.set(Math.cos(a) * 0.2, 0.352 - Math.abs(Math.sin(a)) * 0.025, Math.sin(a) * 0.25);
    s.rotation.set(Math.sin(a) * -0.5, 0, Math.cos(a) * 0.5);
    scutes.add(s);
  }
  const head = group();
  head.position.set(0, 0.2, 0.46);
  head.scale.setScalar(hr);
  const skull = sphere(0.1, skin, 1, 0.85, 1.25);
  const ey = eyes(0.03, 0.065, 0.035, 0.08, mat(c.eye, { roughness: 0.25 }));
  const beakLine = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.006, 8, 16, Math.PI), mat(c.beak));
  beakLine.position.set(0, -0.02, 0.12);
  beakLine.rotation.z = Math.PI;
  head.add(skull, ey.group, beakLine);
  const neck = capsule(0.07, 0.1, skin);
  at(neck, 0, 0.19, 0.34, Math.PI / 2, 0, 0);
  const flippers: THREE.Object3D[] = [];
  for (const side of [-1, 1]) {
    const front = sphere(0.19, skin, 1, 0.22, 0.5);
    at(front, side * 0.36, 0.12, 0.2, 0, side * -0.55, side * -0.12);
    const back = sphere(0.12, skin, 1, 0.22, 0.55);
    at(back, side * 0.27, 0.11, -0.3, 0, side * 0.7, 0);
    flippers.push(front, back);
  }
  const tail = cone(0.035, 0.12, skin, 10);
  at(tail, 0, 0.13, -0.45, -Math.PI / 2, 0, 0);
  const root = group(dome, rim, under, scutes, neck, head, ...flippers, tail);
  return { root, body: dome, head, lids: ey.lids, limbs: flippers, tail, restY: 0 };
}

function buildCrab(c: (typeof LOOKS)['fiddler-crab']['colours'], hr: number): Rig {
  const shell = mat(c.body, { roughness: 0.5 }), under = mat(c.belly), legMat = mat(c.limb, { roughness: 0.6 }), claw = mat(c.feature, { roughness: 0.45 });
  const carapace = sphere(0.22, shell, 1.35, 0.6, 1);
  carapace.position.y = 0.2;
  const belly = sphere(0.2, under, 1.3, 0.3, 0.95);
  belly.position.y = 0.15;
  const head = group();
  head.position.set(0, 0.28, 0.1);
  head.scale.setScalar(hr);
  const ey = eyes(0.04, 0.09, 0.14, 0.05, mat(c.eye, { roughness: 0.25 }));
  for (const side of [-1, 1]) {
    const stalk = cylinder(0.014, 0.018, 0.16, legMat, 8);
    stalk.position.set(side * 0.09, 0.06, 0.05);
    head.add(stalk);
  }
  head.add(ey.group);
  const limbs: THREE.Object3D[] = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i += 1) {
      const z = -0.12 + i * 0.12;
      const leg = tube([[side * 0.2, 0.16, z], [side * 0.36, 0.26, z], [side * 0.5, 0.0, z + 0.02]], 0.018, legMat, true);
      limbs.push(leg);
    }
  }
  // The claw. One absurd claw, the whole animal.
  const clawPivot = group();
  clawPivot.position.set(0.22, 0.2, 0.16);
  const arm = capsule(0.035, 0.12, claw);
  at(arm, 0.08, 0.02, 0.02, 0, 0, -1.2);
  const palm = sphere(0.13, claw, 1.35, 0.75, 0.9);
  palm.position.set(0.24, 0.06, 0.06);
  const fingerTop = cone(0.045, 0.22, claw, 12);
  at(fingerTop, 0.42, 0.11, 0.06, 0, 0, -1.9);
  const fingerBottom = cone(0.04, 0.2, claw, 12);
  at(fingerBottom, 0.42, 0.0, 0.06, 0, 0, -1.4);
  clawPivot.add(arm, palm, fingerTop, fingerBottom);
  const small = capsule(0.02, 0.07, legMat);
  at(small, -0.24, 0.16, 0.16, 0, 0, 1.1);
  const smallTip = sphere(0.035, claw);
  smallTip.position.set(-0.3, 0.13, 0.18);
  const root = group(carapace, belly, head, ...limbs, clawPivot, small, smallTip);
  return { root, body: carapace, head, lids: ey.lids, limbs, tail: clawPivot, restY: 0 };
}

function buildEgg(layer: LayerKey): Rig {
  const h = HABITATS[layer];
  const shell = mat('#f3ede0', { roughness: 0.6 });
  const egg = sphere(0.3, shell, 1, 1.32, 1);
  egg.position.y = 0.4;
  const speck = mat(h.speckle, { roughness: 0.8 });
  const g = group(egg);
  for (const s of speckles(layer)) {
    const p = sphere(s.size, speck);
    p.castShadow = false;
    p.position.set(
      Math.sin(s.phi) * Math.cos(s.theta) * 0.3,
      0.4 + Math.cos(s.phi) * 0.3 * 1.32,
      Math.sin(s.phi) * Math.sin(s.theta) * 0.3,
    );
    p.scale.set(1, 0.45, 1);
    g.add(p);
  }
  // A shallow nest so it is not sitting on nothing.
  const nest = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.09, 10, 32), mat(h.groundDark, { roughness: 1 }));
  nest.rotation.x = Math.PI / 2;
  nest.position.y = 0.06;
  shadowed(nest);
  g.add(nest);
  return { root: g, body: egg, head: group(), lids: [], limbs: [], restY: 0 };
}

function buildCreature(key: CreatureKey, stage: CompanionStage): Rig {
  const look = LOOKS[key];
  if (stage === 'egg') return buildEgg(look.layer);
  const hr = headRatio(stage);
  const rig = key === 'dusky-langur' ? buildLangur(look.colours, hr)
    : key === 'pied-hornbill' ? buildHornbill(look.colours, hr)
      : key === 'brahminy-kite' ? buildKite(look.colours, hr)
        : key === 'green-turtle' ? buildTurtle(look.colours, hr)
          : buildCrab(look.colours, hr);
  const s = stageScale(stage);
  rig.root.scale.setScalar(s);
  rig.root.position.y *= s;
  rig.restY *= s;
  return rig;
}

// ---------------------------------------------------------------------------
// The habitat around it
// ---------------------------------------------------------------------------

function buildHabitat(layer: LayerKey, scene: THREE.Scene): { water: THREE.Mesh | null; glow: THREE.Points } {
  const h = HABITATS[layer];
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(3.2, 64),
    mat(h.ground, { roughness: 1 }),
  );
  // Gentle unevenness so the light has something to catch.
  const pos = ground.geometry.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i), y = pos.getY(i);
    const d = Math.hypot(x, y);
    pos.setZ(i, d > 0.9 ? Math.sin(x * 2.1) * Math.cos(y * 1.7) * 0.06 * Math.min(1, (d - 0.9)) : 0);
  }
  ground.geometry.computeVertexNormals();
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const dark = mat(h.groundDark, { roughness: 1 });
  const bark = mat('#6b4a2e', { roughness: 0.95 });
  const leaf = mat('#3e6b3a', { roughness: 0.9 });
  const leafLight = mat('#6f9a4c', { roughness: 0.9 });
  const rock = mat('#8d8a80', { roughness: 0.95, flat: true });
  const props = placements(layer, h.props === 'forest' || h.props === 'mangrove' ? 9 : 7);

  for (const [i, p] of props.entries()) {
    let obj: THREE.Object3D;
    if (h.props === 'forest' || h.props === 'hill') {
      if (i % 3 === 2) {
        obj = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22, 0), rock);
        obj.position.y = 0.1;
      } else {
        // A tree: a trunk and two rounded crowns, the second offset so it is
        // not a lollipop.
        const trunk = cylinder(0.05, 0.08, 0.9, bark, 8);
        trunk.position.y = 0.45;
        const crown = sphere(0.42, i % 2 ? leaf : leafLight, 1, 0.85, 1);
        crown.position.y = 1.1;
        const crown2 = sphere(0.3, leaf, 1, 0.8, 1);
        crown2.position.set(0.22, 1.3, 0.1);
        obj = group(trunk, crown, crown2);
      }
    } else if (h.props === 'beach' || h.props === 'shore') {
      if (i % 2 === 0) {
        // A coconut palm: a leaning trunk and a fan of fronds.
        const trunk = tube([[0, 0, 0], [0.1, 0.6, 0.05], [0.25, 1.2, 0.1], [0.32, 1.7, 0.12]], 0.06, bark, true);
        const fronds = group();
        for (let k = 0; k < 7; k += 1) {
          const f = sphere(0.36, k % 2 ? leaf : leafLight, 1, 0.08, 0.28);
          f.position.set(0.32, 1.72, 0.12);
          f.rotation.set(0.35, (k / 7) * Math.PI * 2, 0.2);
          f.translateX(0.32);
          fronds.add(f);
        }
        obj = group(trunk, fronds);
      } else {
        obj = new THREE.Mesh(new THREE.DodecahedronGeometry(0.16, 0), rock);
        obj.position.y = 0.08;
      }
    } else {
      // Mangrove: prop roots arching into the mud, a crown above.
      const roots = group();
      for (let k = 0; k < 5; k += 1) {
        const a = (k / 5) * Math.PI * 2;
        roots.add(tube([[0, 0.9, 0], [Math.cos(a) * 0.25, 0.5, Math.sin(a) * 0.25], [Math.cos(a) * 0.45, 0, Math.sin(a) * 0.45]], 0.03, bark, true));
      }
      const trunk = cylinder(0.06, 0.07, 0.8, bark, 8);
      trunk.position.y = 1.2;
      const crown = sphere(0.4, leaf, 1, 0.7, 1);
      crown.position.y = 1.7;
      obj = group(roots, trunk, crown);
    }
    obj.position.x = p.x;
    obj.position.z = p.z;
    obj.rotation.y = p.rotation;
    obj.scale.multiplyScalar(p.scale);
    scene.add(obj);
  }

  let water: THREE.Mesh | null = null;
  if (h.water) {
    const geom = new THREE.PlaneGeometry(7, 3.6, 40, 20);
    water = new THREE.Mesh(geom, new THREE.MeshStandardMaterial({
      color: new THREE.Color(h.water), roughness: 0.25, metalness: 0.05, transparent: true, opacity: 0.86,
    }));
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, 0.02, -2.9);
    water.receiveShadow = true;
    scene.add(water);
    // The shoreline: a paler lip of ground where the water meets it.
    const lip = new THREE.Mesh(new THREE.PlaneGeometry(7, 0.5), mat(h.ground === '#e6d6b0' ? '#f3ead0' : h.ground, { roughness: 1 }));
    lip.rotation.x = -Math.PI / 2;
    lip.position.set(0, 0.021, -1.15);
    scene.add(lip);
  }
  // A darker apron at the far edge so the ground does not end in a hard line.
  const apron = new THREE.Mesh(new THREE.RingGeometry(2.6, 3.2, 64), dark);
  apron.rotation.x = -Math.PI / 2;
  apron.position.y = 0.005;
  apron.receiveShadow = true;
  scene.add(apron);

  // Glow: fireflies, pollen, spray, bubbles, motes. Points, so they are cheap.
  const n = 42;
  const positions = new Float32Array(n * 3);
  for (let i = 0; i < n; i += 1) {
    positions[i * 3] = (Math.random() - 0.5) * 4;
    positions[i * 3 + 1] = 0.2 + Math.random() * 1.6;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 3 - 0.4;
  }
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const glowColour = h.particles === 'fireflies' ? '#d8ff7a' : h.particles === 'bubbles' ? '#cdefff' : h.particles === 'sparkle' ? '#fff6c8' : '#f0e6c0';
  const glow = new THREE.Points(pg, new THREE.PointsMaterial({
    color: new THREE.Color(glowColour), size: h.particles === 'bubbles' ? 0.07 : 0.05,
    map: softDot(), alphaTest: 0.02,
    transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
  }));
  scene.add(glow);
  return { water, glow };
}

// ---------------------------------------------------------------------------
// The component
// ---------------------------------------------------------------------------

function prefersReducedMotion(): boolean {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

export interface Creature3DProps {
  species: CreatureKey;
  stage: CompanionStage;
  height?: number;
  /** Spoken name, for the canvas. */
  label: string;
  /** Called on a tap, after the animal has reacted. The screen may toast. */
  onTap?: () => void;
}

export function Creature3D({ species, stage, height = 320, label, onTap }: Creature3DProps) {
  const holder = React.useRef<HTMLDivElement | null>(null);
  const tapRef = React.useRef(onTap);
  React.useEffect(() => { tapRef.current = onTap; });

  React.useEffect(() => {
    const el = holder.current;
    if (!el) return;
    const still = prefersReducedMotion();
    const motion = motionScale(still);
    const look = LOOKS[species];
    const habitat = HABITATS[look.layer];
    // `?hour=14` shows the room at that island hour. For looking at it, and
    // for a demo given at midnight that wants to show the beach in daylight.
    const hourOverride = Number(new URLSearchParams(window.location.search).get('hour'));
    const light = Number.isFinite(hourOverride) && window.location.search.includes('hour=')
      ? lightingFor(hourOverride)
      : lightingNow();

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(el.clientWidth, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = light.exposure;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.setAttribute('role', 'img');
    renderer.domElement.setAttribute('aria-label', label);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = `${height}px`;
    renderer.domElement.style.touchAction = 'pan-y';
    renderer.domElement.style.cursor = 'pointer';
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const skyTop = new THREE.Color(habitat.sky[0]).multiplyScalar(light.skyDim);
    const skyHorizon = new THREE.Color(habitat.sky[1]).multiplyScalar(light.skyDim);
    scene.background = skyHorizon;
    scene.fog = new THREE.Fog(skyHorizon, 4.5, 9);

    // A sky dome, so the top of the frame is not the same flat colour as the bottom.
    const domeGeom = new THREE.SphereGeometry(8, 24, 12);
    const domeMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: skyTop }, bottom: { value: skyHorizon } },
      vertexShader: 'varying float vy; void main(){ vy = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying float vy; void main(){ float k = smoothstep(-0.05, 0.6, vy); gl_FragColor = vec4(mix(bottom, top, k), 1.0); }',
    });
    scene.add(new THREE.Mesh(domeGeom, domeMat));

    const hemi = new THREE.HemisphereLight(new THREE.Color(light.skyColour), new THREE.Color(light.groundColour), 0.9);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(new THREE.Color(light.sunColour), light.sun * 2.2);
    sun.position.set(Math.sin(light.azimuth) * 4, 1 + light.elevation * 5, Math.cos(light.azimuth) * 4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 14;
    sun.shadow.camera.left = -3; sun.shadow.camera.right = 3;
    sun.shadow.camera.top = 3; sun.shadow.camera.bottom = -3;
    sun.shadow.bias = -0.0008;
    sun.shadow.radius = 4;
    scene.add(sun);
    // A soft fill from the camera side so the shadowed face still reads.
    const fill = new THREE.DirectionalLight(new THREE.Color(light.skyColour), 0.35);
    fill.position.set(-2, 2, 4);
    scene.add(fill);

    const { water, glow } = buildHabitat(look.layer, scene);
    glow.visible = light.glowVisible || habitat.particles === 'bubbles' || habitat.particles === 'sparkle';

    const rig = buildCreature(species, stage);
    const stageRoot = new THREE.Group();
    stageRoot.add(rig.root);
    scene.add(stageRoot);
    // A contact shadow under the animal in case the sun is low.
    const contact = new THREE.Mesh(
      new THREE.CircleGeometry(0.42 * stageScale(stage), 32),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18, depthWrite: false }),
    );
    contact.rotation.x = -Math.PI / 2;
    contact.position.y = 0.012;
    stageRoot.add(contact);

    const camera = new THREE.PerspectiveCamera(32, el.clientWidth / height, 0.1, 30);
    const focusY = stage === 'egg' ? 0.42 : look.medium === 'air' ? 0.95 : look.eyeHeight * 0.75 * stageScale(stage) + 0.1;
    const dist = stage === 'egg' ? 2.2 : look.medium === 'air' ? 3.1 : look.eyeHeight < 0.3 ? 1.9 : 2.5;
    camera.position.set(0.3, focusY + 0.55, dist);
    camera.lookAt(0, focusY, 0);

    // -- interaction ------------------------------------------------------
    const pointer = { x: 0, y: 0, active: false };
    let yaw = 0, yawTarget = 0, dragging = false, dragX = 0, dragYaw = 0, moved = 0;
    let reactUntil = 0, reactStart = 0;
    const react = () => {
      const now = performance.now();
      if (now < reactUntil) return;
      reactStart = now;
      reactUntil = now + REACTION_MS[species];
      burst();
      tapRef.current?.();
    };
    const rect = () => renderer.domElement.getBoundingClientRect();
    const onMove = (e: PointerEvent) => {
      const r = rect();
      pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      pointer.y = -(((e.clientY - r.top) / r.height) * 2 - 1);
      pointer.active = true;
      if (dragging) {
        moved += Math.abs(e.clientX - dragX);
        yawTarget = dragYaw + (e.clientX - dragX) * 0.008;
      }
    };
    const onDown = (e: PointerEvent) => { dragging = true; dragX = e.clientX; dragYaw = yawTarget; moved = 0; renderer.domElement.setPointerCapture(e.pointerId); };
    const onUp = (e: PointerEvent) => {
      dragging = false;
      try { renderer.domElement.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
      if (moved < 6) react();
    };
    const onLeave = () => { pointer.active = false; dragging = false; };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); react(); } };
    renderer.domElement.tabIndex = 0;
    renderer.domElement.addEventListener('pointermove', onMove);
    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointerup', onUp);
    renderer.domElement.addEventListener('pointerleave', onLeave);
    renderer.domElement.addEventListener('keydown', onKey);

    // Hearts on a tap: tiny tetrahedra that rise and fade.
    const heartMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff8fa3'), transparent: true, opacity: 0.95 });
    const hearts: { mesh: THREE.Mesh; born: number; vx: number; vz: number }[] = [];
    const burst = () => {
      if (still) return;
      for (let i = 0; i < 7; i += 1) {
        const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.05, 0), heartMat.clone());
        m.position.set((Math.random() - 0.5) * 0.4, focusY + 0.2, (Math.random() - 0.5) * 0.3 + 0.2);
        scene.add(m);
        hearts.push({ mesh: m, born: performance.now(), vx: (Math.random() - 0.5) * 0.4, vz: (Math.random() - 0.5) * 0.3 });
      }
    };

    // -- animation --------------------------------------------------------
    const clock = new THREE.Clock();
    let nextBlink = 2 + Math.random() * 3;
    let blinkT = -1;
    const waterPos = water ? (water.geometry.attributes.position as THREE.BufferAttribute) : null;
    const waterBase = waterPos ? Float32Array.from(waterPos.array as Float32Array) : null;
    const glowPos = glow.geometry.attributes.position as THREE.BufferAttribute;
    const glowBase = Float32Array.from(glowPos.array as Float32Array);
    let raf = 0;
    let paused = document.hidden;

    const animate = () => {
      raf = requestAnimationFrame(animate);
      if (paused) return;
      const dt = Math.min(clock.getDelta(), 0.05);
      const t = clock.elapsedTime;

      // Slow turn while idle, and the drag on top of it.
      if (!dragging && pointer.active === false) yawTarget += dt * 0.06 * motion;
      yaw += (yawTarget - yaw) * Math.min(1, dt * 6);
      stageRoot.rotation.y = yaw;

      const reacting = performance.now() < reactUntil;
      const k = reacting ? (performance.now() - reactStart) / REACTION_MS[species] : 0; // 0..1 through the reaction
      const pulse = reacting ? Math.sin(k * Math.PI) : 0;

      // Breath. Egg wobbles instead.
      if (stage === 'egg') {
        rig.body.rotation.z = Math.sin(t * 1.3) * 0.04 * motion + Math.sin(k * Math.PI * 6) * 0.18 * pulse;
        rig.body.rotation.x = Math.cos(t * 0.9) * 0.03 * motion;
        rig.body.scale.y = 1.32 + Math.sin(t * 2) * 0.01 * motion + pulse * 0.05;
      } else {
        const breath = 1 + Math.sin(t * 1.6) * 0.022 * motion;
        rig.body.scale.y = (rig.body.userData.baseY ??= rig.body.scale.y) * breath;
      }

      // Blink.
      if (rig.lids.length > 0 && motion > 0) {
        if (blinkT < 0 && t > nextBlink) { blinkT = 0; }
        if (blinkT >= 0) {
          blinkT += dt;
          const s = blinkT < 0.09 ? 1 - blinkT / 0.09 : blinkT < 0.18 ? (blinkT - 0.09) / 0.09 : 1;
          for (const lid of rig.lids) lid.scale.y = Math.max(0.06, s);
          if (blinkT >= 0.18) { blinkT = -1; nextBlink = t + 2.5 + Math.random() * 3.5; }
        }
      }

      // Look at the pointer. Head only, within what a neck allows.
      const lookX = pointer.active ? pointer.x : Math.sin(t * 0.3) * 0.3 * motion;
      const lookY = pointer.active ? pointer.y : 0;
      rig.head.rotation.y += ((lookX * 0.6 - yaw * 0.5) - rig.head.rotation.y) * Math.min(1, dt * 5);
      rig.head.rotation.x += ((-lookY * 0.35) - rig.head.rotation.x) * Math.min(1, dt * 5);

      // Species idle and reaction.
      switch (species) {
        case 'dusky-langur': {
          if (rig.tail) rig.tail.rotation.y = Math.sin(t * 1.1) * 0.25 * motion;
          rig.root.position.y = rig.restY + pulse * 0.28; // the hop
          rig.head.rotation.z = pulse * 0.25; // and a happy tilt
          for (const [i, limb] of rig.limbs.entries()) if (i % 3 === 0) limb.rotation.x = 0.5 + Math.sin(t * 1.6 + i) * 0.08 * motion - pulse * 0.9;
          break;
        }
        case 'pied-hornbill': {
          const [wl, wr, lower] = rig.limbs;
          const flap = pulse * 0.9;
          if (wl) wl.rotation.z = 0.35 + Math.sin(t * 2.2) * 0.04 * motion - flap;
          if (wr) wr.rotation.z = -0.35 - Math.sin(t * 2.2) * 0.04 * motion + flap;
          if (lower) lower.rotation.x = Math.PI / 2 + 0.15 + pulse * 0.35; // the bill opens
          rig.head.rotation.x += -pulse * 0.5; // thrown up, the way they call
          rig.head.position.y = 0.62 * headRatioSafe(stage) + Math.abs(Math.sin(t * 1.3)) * 0.01 * motion;
          if (rig.tail) rig.tail.rotation.x = Math.sin(t * 0.8) * 0.06 * motion + pulse * 0.4;
          break;
        }
        case 'brahminy-kite': {
          const flap = Math.sin(t * 2.6) * 0.18 * motion + Math.sin(k * Math.PI * 4) * 0.5 * pulse;
          for (const [i, w] of rig.limbs.entries()) w.rotation.z = (i === 0 ? 1 : -1) * (0.12 + flap);
          rig.root.position.y = rig.restY + Math.sin(t * 0.9) * 0.08 * motion + pulse * 0.25;
          rig.root.position.x = Math.sin(t * 0.45) * 0.35 * motion;
          rig.root.rotation.z = -Math.cos(t * 0.45) * 0.18 * motion - pulse * 0.9; // banks into the turn
          rig.root.rotation.x = -0.15;
          if (rig.tail) rig.tail.rotation.y = Math.sin(t * 0.7) * 0.15 * motion;
          break;
        }
        case 'green-turtle': {
          for (const [i, f] of rig.limbs.entries()) {
            const front = i < 2 || i === 2 ? i % 2 === 0 : false;
            f.rotation.x = (front ? -0.12 : 0) + Math.sin(t * 1.1 + i * 1.3) * 0.16 * motion + pulse * 0.3;
          }
          // Tuck the head, then peek. That is a turtle's whole reaction.
          const tuck = pulse > 0 ? Math.sin(Math.min(1, k * 1.6) * Math.PI) : 0;
          rig.head.position.z = 0.46 - tuck * 0.22;
          rig.head.scale.setScalar(headRatio(stage) * (1 - tuck * 0.12));
          rig.root.position.y = rig.restY + Math.sin(t * 0.8) * 0.01 * motion;
          if (rig.tail) rig.tail.rotation.z = Math.sin(t * 1.5) * 0.2 * motion;
          break;
        }
        case 'fiddler-crab': {
          // Wave the claw: the display, at rivals and at you.
          if (rig.tail) {
            rig.tail.rotation.z = Math.sin(t * 1.4) * 0.12 * motion + Math.abs(Math.sin(k * Math.PI * 3)) * 0.9 * pulse;
            rig.tail.rotation.x = -pulse * 0.4;
          }
          // Sidestep on a tap, scuttle in place otherwise.
          rig.root.position.x = Math.sin(k * Math.PI) * 0.35 * pulse;
          for (const [i, leg] of rig.limbs.entries()) leg.position.y = Math.max(0, Math.sin(t * 9 + i * 1.7)) * 0.02 * (motion * 0.4 + pulse);
          rig.head.position.y = 0.28 + Math.sin(t * 2.4) * 0.008 * motion;
          break;
        }
      }

      // Water and glow.
      if (water && waterPos && waterBase) {
        for (let i = 0; i < waterPos.count; i += 1) {
          const x = waterBase[i * 3]!, y = waterBase[i * 3 + 1]!;
          waterPos.setZ(i, (Math.sin(x * 1.8 + t * 1.2) * 0.02 + Math.cos(y * 2.3 + t * 0.9) * 0.015) * motion);
        }
        waterPos.needsUpdate = true;
        water.geometry.computeVertexNormals();
      }
      for (let i = 0; i < glowPos.count; i += 1) {
        const rise = habitat.particles === 'bubbles' ? (t * 0.25 + i * 0.13) % 1.8 : Math.sin(t * 0.5 + i) * 0.12;
        glowPos.setXYZ(i,
          glowBase[i * 3]! + Math.sin(t * 0.7 + i * 0.9) * 0.08 * motion,
          glowBase[i * 3 + 1]! + rise * motion,
          glowBase[i * 3 + 2]! + Math.cos(t * 0.6 + i * 1.3) * 0.08 * motion);
      }
      glowPos.needsUpdate = true;
      (glow.material as THREE.PointsMaterial).opacity = 0.55 + Math.sin(t * 3) * 0.3;

      // Hearts.
      const now = performance.now();
      for (let i = hearts.length - 1; i >= 0; i -= 1) {
        const hrt = hearts[i]!;
        const age = (now - hrt.born) / 1000;
        hrt.mesh.position.y += dt * 0.9;
        hrt.mesh.position.x += hrt.vx * dt;
        hrt.mesh.position.z += hrt.vz * dt;
        hrt.mesh.rotation.y += dt * 4;
        (hrt.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - age / 1.3);
        if (age > 1.3) { scene.remove(hrt.mesh); hrt.mesh.geometry.dispose(); (hrt.mesh.material as THREE.Material).dispose(); hearts.splice(i, 1); }
      }

      renderer.render(scene, camera);
    };

    // One composed frame, always, before any loop. A document that is hidden
    // at mount - a background tab, an embedded preview, a print - gets no
    // animation frames, and the first version rendered nothing at all in
    // that state: the room was a blank card until the tab was focused. The
    // still image is the floor; the loop is what runs on top of it.
    renderer.render(scene, camera);

    const onVisibility = () => {
      paused = document.hidden;
      if (!paused) { clock.getDelta(); renderer.render(scene, camera); }
    };
    document.addEventListener('visibilitychange', onVisibility);
    const onResize = () => {
      const w = el.clientWidth;
      if (w === 0) return;
      renderer.setSize(w, height);
      camera.aspect = w / height;
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
    };
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onResize) : null;
    ro?.observe(el);

    // Still means still: no loop at all under reduce-motion.
    if (!still) animate();

    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      renderer.domElement.removeEventListener('pointermove', onMove);
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointerup', onUp);
      renderer.domElement.removeEventListener('pointerleave', onLeave);
      renderer.domElement.removeEventListener('keydown', onKey);
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
      });
      domeMat.dispose();
      renderer.dispose();
      el.removeChild(renderer.domElement);
    };
  }, [species, stage, height, label]);

  return <div ref={holder} style={{ width: '100%', height, borderRadius: 18, overflow: 'hidden' }} />;
}

const headRatioSafe = (stage: CompanionStage): number => headRatio(stage);
