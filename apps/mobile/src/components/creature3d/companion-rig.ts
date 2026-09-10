/**
 * The five Samui companions, built to the team's own reference art.
 *
 * On 8 September the team brought its mascots: a coconut macaque, a
 * junglefowl, an octopus, a turtle and a buffalo, each standing upright,
 * waving, in a patterned sash and shorts with a rope belt and two
 * coconut-shell buttons, on the sand under the palms (`docs/51-the-samui-five.md`,
 * with the art in `docs/assets/mascots/`). These rigs follow that art as far
 * as spheres, capsules and tubes can: the same proportions - a head near
 * half the height, big eyes, short legs - the same wardrobe, the same
 * raised hand, and each animal's own thing: the coconut, the leaf crest and
 * the tiffin, the suckers, the sprout and the shell, the horns.
 *
 * PRIMITIVES, STILL. No model file, for the reason `Creature3D.tsx` gives:
 * a downloaded monkey carries somebody's licence and somebody's idea of a
 * monkey. The cloth is the one texture in the scene, and it is drawn on a
 * canvas at run time from three colours - no image file either.
 *
 * The rule from `rig.ts` holds: the stage is said by size and by the egg,
 * never by colour, and nothing here wears the evidence green. The leaf on
 * three of the heads is `LEAF_GREEN`, which the tests hold apart from it.
 *
 * Conventions the animator relies on: `limbs[0]` is the raised, waving arm
 * and `limbs[1]` the other one, whatever the species; the rest of `limbs`
 * is the animal's own - legs, wings, the seven resting arms of an octopus.
 * The animal faces +z, toward the camera, so its right hand is at -x.
 */

import * as THREE from 'three';
import type { CompanionStage } from '@chivago/core';
import type { CreatureKey } from '../Creature.tsx';
import { LEAF_GREEN, fowlPose, headRatio, type Look } from './rig.ts';
import { at, capsule, cone, cylinder, eyes, group, mat, shadowed, sphere, tube, type Mat, type Rig } from './primitives.ts';

type Colours = Look['colours'];
type Wear = Look['wear'];

// Proportions shared by the four that stand on legs. Scene metres.
const BODY_R = 0.24;
const BODY_Y = 0.44;
/** The body is a little flatter front-to-back than side-to-side, as a plush is. */
const SQUASH = 0.86;
const SHORTS_Y = 0.27;
export const HEAD_Y = 0.8;
const HEAD_R = 0.27;

// ---------------------------------------------------------------------------
// Cloth
// ---------------------------------------------------------------------------

const clothCache = new Map<string, Mat>();

/**
 * The patterned cloth every one of the five wears: a lattice of diamonds,
 * the motif on all five sashes in the reference art. Drawn once per colour
 * set on a small canvas and repeated, so there is no image to ship or to
 * licence.
 */
function cloth(base: string, ink: string, accent: string, repeatU: number, repeatV: number): Mat {
  const key = `${base}|${ink}|${accent}|${repeatU}|${repeatV}`;
  const cached = clothCache.get(key);
  if (cached) return cached;
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 64, 64);
  const diamond = (cx: number, cy: number, r: number) => {
    ctx.beginPath();
    ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy); ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r, cy);
    ctx.closePath();
  };
  ctx.lineWidth = 3;
  ctx.strokeStyle = ink;
  ctx.fillStyle = accent;
  diamond(32, 32, 26); ctx.fill(); ctx.stroke();
  ctx.fillStyle = base;
  diamond(32, 32, 14); ctx.fill(); ctx.stroke();
  ctx.fillStyle = ink;
  diamond(32, 32, 5); ctx.fill();
  // Quarter diamonds at the corners, so the tiles join into a lattice.
  for (const [cx, cy] of [[0, 0], [64, 0], [0, 64], [64, 64]] as const) { diamond(cx, cy, 10); ctx.fill(); }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatU, repeatV);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 });
  clothCache.set(key, m);
  return m;
}

interface Fit {
  /** Radius of the sash ring and where it sits; `squash` follows the body's depth. */
  sashR: number; sashY: number; squash: number;
  shortsR: number; shortsY: number;
  ropeY: number;
}

const STANDING_FIT: Fit = { sashR: BODY_R * 1.02, sashY: BODY_Y, squash: SQUASH, shortsR: BODY_R * 1.04, shortsY: SHORTS_Y, ropeY: SHORTS_Y + 0.07 };

/**
 * The wardrobe: a sash from one shoulder to the other hip, two coconut-shell
 * buttons where it crosses the chest, shorts, and a rope belt with its knot
 * and tassels in front. The same five things on all five, as drawn.
 */
function wardrobe(w: Wear, fit: Fit): THREE.Object3D[] {
  const sash = shadowed(new THREE.Mesh(new THREE.TorusGeometry(fit.sashR, fit.sashR * 0.19, 8, 56), cloth(w.sash, w.ink, w.accent, 7, 1)));
  // Laid flat round the body, then tilted: high on the animal's left shoulder,
  // low on its right hip. 'ZXY' so the tilt is about the world's z, not the ring's.
  sash.rotation.set(Math.PI / 2, 0, 0.7, 'ZXY');
  sash.position.y = fit.sashY;
  sash.scale.set(1, fit.squash, 1);
  const button = mat('#5c3a1a', { roughness: 0.9 });
  const buttons = [-1, 1].map((s) => at(sphere(0.026, button, 1, 1, 0.5), s * 0.031, fit.sashY + s * 0.026, fit.sashR * fit.squash + 0.032));
  const shorts = at(sphere(fit.shortsR, cloth(w.shorts, w.ink, w.accent, 5, 2), 1.02, 0.5, fit.squash), 0, fit.shortsY, 0);
  const ropeMat = mat(w.rope, { roughness: 0.95 });
  const rope = shadowed(new THREE.Mesh(new THREE.TorusGeometry(fit.shortsR * 0.99, 0.018, 8, 48), ropeMat));
  rope.rotation.x = Math.PI / 2;
  rope.position.y = fit.ropeY;
  rope.scale.set(1, fit.squash, 1);
  const front = fit.shortsR * fit.squash;
  const knot = [-1, 1].map((s) => at(sphere(0.024, ropeMat), s * 0.026, fit.ropeY, front + 0.01));
  const tassels = [-1, 1].map((s) => at(capsule(0.011, 0.05, ropeMat), s * 0.03, fit.ropeY - 0.045, front, 0, 0, s * 0.3));
  return [sash, ...buttons, shorts, rope, ...knot, ...tassels];
}

// ---------------------------------------------------------------------------
// Parts
// ---------------------------------------------------------------------------

/** A round body with a paler front. */
function torso(body: Mat, belly: Mat): { chest: THREE.Mesh; front: THREE.Mesh } {
  const chest = at(sphere(BODY_R, body, 1, 1.08, SQUASH), 0, BODY_Y, 0);
  const front = at(sphere(BODY_R * 0.7, belly, 1, 0.9, 0.55), 0, BODY_Y - 0.02, BODY_R * SQUASH * 0.55);
  return { chest, front };
}

/**
 * The face all five share: two big eyes with catchlights, thin brows, and a
 * mouth open in a smile - every one of the five is drawn mid-laugh.
 */
function face(r: number, eye: Mat, brow: Mat, mouthOpen = true): { parts: THREE.Object3D[]; lids: THREE.Mesh[] } {
  const ey = eyes(r * 0.2, r * 0.38, r * 0.05, r * 0.86, eye);
  const parts: THREE.Object3D[] = [ey.group];
  for (const s of [-1, 1]) {
    // Arched, the outer end lower: a happy brow, not a worried one.
    parts.push(at(capsule(r * 0.025, r * 0.16, brow), s * r * 0.4, r * 0.36, r * 0.9, 0, 0, Math.PI / 2 - s * 0.35));
  }
  const mouth = at(sphere(r * 0.11, mat('#9c3630', { roughness: 0.6 }), 1.5, mouthOpen ? 0.75 : 0.3, 0.5), 0, -r * 0.4, r * 0.9);
  parts.push(mouth);
  return { parts, lids: ey.lids };
}

/** The sprout three of them wear: a stem and two leaves, on top of the head. */
function sprout(r: number): THREE.Group {
  const stem = at(cylinder(0.008, 0.011, r * 0.28, mat('#8a6a3a', { roughness: 0.9 }), 6), 0, r * 1.05, -r * 0.05);
  const l1 = at(sphere(r * 0.16, mat(LEAF_GREEN, { roughness: 0.6 }), 1.7, 0.45, 1), r * 0.14, r * 1.2, -r * 0.05, 0, 0, -0.5);
  const l2 = at(sphere(r * 0.13, mat('#2f7a4a', { roughness: 0.6 }), 1.6, 0.45, 1), -r * 0.11, r * 1.16, -r * 0.05, 0, 0, 0.6);
  return group(stem, l1, l2);
}

/** A flat plate sitting on a sphere of radius `r`, facing outward. Scutes, spots. */
function onSurface(mesh: THREE.Mesh, r: number, theta: number, phi: number, scale: [number, number, number] = [1, 1, 1]): THREE.Mesh {
  const d = new THREE.Vector3(Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta));
  mesh.position.set(d.x * r * scale[0], d.y * r * scale[1], d.z * r * scale[2]);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), d.normalize());
  return mesh;
}

interface Arms { wave: THREE.Group; other: THREE.Group }

/**
 * Two arms on shoulder pivots. The animal's right arm (at -x, the viewer's
 * left) is raised in the wave every one of the five is drawn giving; the
 * left hangs, or holds the prop.
 */
function armPair(makeLimb: (s: number) => THREE.Object3D[]): Arms {
  const make = (s: number) => {
    const pivot = group(...makeLimb(s));
    pivot.position.set(s * (BODY_R + 0.02), BODY_Y + 0.12, 0.04);
    return pivot;
  };
  const wave = make(-1);
  wave.rotation.z = -2.4;
  const other = make(1);
  other.rotation.z = 0.3;
  return { wave, other };
}

const plainArm = (limb: Mat, hand: Mat, len = 0.16, r = 0.055) => (): THREE.Object3D[] =>
  [at(capsule(r, len, limb), 0, -len * 0.6, 0), at(sphere(r * 1.25, hand), 0, -len * 1.25, 0)];

/** Two short legs and two feet. `limbs` order: left leg, left foot, right leg, right foot. */
function legs(limb: Mat, foot: Mat, footScale: [number, number, number] = [1, 0.55, 1.35]): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  for (const s of [-1, 1]) {
    out.push(at(capsule(0.07, 0.1, limb), s * 0.12, 0.14, 0.02));
    out.push(at(sphere(0.085, foot, ...footScale), s * 0.13, 0.05, 0.07));
  }
  return out;
}

/** An octopus arm along a curve, with suckers toward the tip on the side that shows. */
function tentacle(points: [number, number, number][], r: number, m: Mat, suckerMat: Mat, side: [number, number, number]): THREE.Group {
  const g = group(tube(points, r, m, true));
  const curve = new THREE.CatmullRomCurve3(points.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
  for (let i = 0; i < 4; i += 1) {
    const u = 0.5 + i * 0.15;
    const p = curve.getPointAt(u);
    const k = 1 - u * 0.7; // the taper, as `tube` thins it
    const dot = sphere(r * 0.5 * k, suckerMat, 1, 1, 0.45);
    dot.position.set(p.x + side[0] * r * k * 0.8, p.y + side[1] * r * k * 0.8, p.z + side[2] * r * k * 0.8);
    dot.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...side).normalize());
    g.add(dot);
  }
  return g;
}

// ---------------------------------------------------------------------------
// The five
// ---------------------------------------------------------------------------

function buildMacaque(c: Colours, w: Wear, hr: number): Rig {
  const fur = mat(c.body), pale = mat(c.belly), dark = mat(c.limb), skin = mat(c.beak, { roughness: 0.7 }), eye = mat(c.eye, { roughness: 0.25 });
  const { chest, front } = torso(fur, pale);
  const head = group();
  head.position.set(0, HEAD_Y, 0.03);
  head.scale.setScalar(hr);
  const R = HEAD_R;
  const skull = sphere(R, fur);
  // The tan face and muzzle, and the two round ears: the reference's whole silhouette.
  const facePatch = at(sphere(R * 0.78, skin, 1.05, 0.82, 0.6), 0, -R * 0.12, R * 0.52);
  const muzzle = at(sphere(R * 0.36, skin, 1.35, 0.72, 0.7), 0, -R * 0.42, R * 0.7);
  const f = face(R, eye, dark);
  const nostrils = [-1, 1].map((s) => at(sphere(R * 0.035, eye), s * R * 0.12, -R * 0.36, R * 0.98));
  const ears = [-1, 1].flatMap((s) => [
    at(sphere(R * 0.4, fur, 1, 1, 0.45), s * R, R * 0.12, -R * 0.05),
    at(sphere(R * 0.26, skin, 1, 1, 0.4), s * R * 1.04, R * 0.12, R * 0.02),
  ]);
  // The tuft on top, three tufts of darker fur leaning back.
  const tuft = group(...[-0.3, 0, 0.3].map((a) => at(sphere(R * 0.16, dark, 0.6, 1.5, 0.6), Math.sin(a) * R * 0.2, R, -R * 0.1, 0, 0, -a * 1.2)));
  head.add(skull, facePatch, muzzle, ...f.parts, ...nostrils, ...ears, tuft);
  const { wave, other } = armPair(plainArm(fur, skin));
  // The coconut, held out in the left hand, three eyes toward you.
  other.rotation.set(-1.1, 0, 0.25);
  const coconut = at(sphere(0.095, mat(c.feature, { roughness: 0.95 })), 0, -0.24, 0.07);
  for (let i = 0; i < 3; i += 1) coconut.add(at(sphere(0.014, eye), Math.cos(i * 2.1) * 0.035, 0.03 + Math.sin(i * 2.1) * 0.02, 0.088));
  other.add(coconut);
  const lg = legs(fur, skin);
  // The pig-tail: short, and carried in a curl.
  const tail = tube([[0.02, 0.3, -0.2], [0.12, 0.14, -0.34], [0.02, 0.32, -0.46], [-0.08, 0.48, -0.36]], 0.032, fur, true);
  const root = group(chest, front, ...wardrobe(w, STANDING_FIT), head, wave, other, ...lg, tail);
  return { root, body: chest, head, lids: f.lids, limbs: [wave, other, ...lg], tail, restY: 0 };
}

function buildJunglefowl(c: Colours, w: Wear, hr: number): Rig {
  const down = mat(c.body, { roughness: 0.75 }), pale = mat(c.belly), orange = mat(c.limb, { roughness: 0.6 }), gold = mat(c.feature, { roughness: 0.55 });
  const beak = mat(c.beak, { roughness: 0.5 }), teal = mat(c.accent ?? c.feature, { roughness: 0.6 }), eye = mat(c.eye, { roughness: 0.25 });
  const { chest, front } = torso(down, pale);
  const head = group();
  head.position.set(0, HEAD_Y, 0.03);
  head.scale.setScalar(hr);
  const R = HEAD_R;
  const skull = sphere(R, down);
  const f = face(R, eye, mat('#3a2a1a'), false);
  // The crest: four leaf feathers, three gold and the last orange, as drawn -
  // each nearly as tall as the head, fanned out from the crown.
  const crest = group();
  [-0.6, -0.2, 0.2, 0.6].forEach((a, i) => {
    const tall = i === 1 || i === 2 ? 1.8 : 1.5;
    crest.add(at(sphere(R * 0.5, i === 3 ? beak : gold, 0.5, tall, 0.22), Math.sin(a) * R * 0.85, R * 0.5 + Math.cos(a) * R * 0.65, R * 0.05, 0, 0, -a * 0.9));
  });
  // Teal tufts at the ears, a small orange beak, orange cheeks.
  const tufts = [-1, 1].map((s) => at(sphere(R * 0.26, teal, 0.6, 1.3, 0.3), s * R, R * 0.02, 0, 0, 0, s * -0.9));
  const bk = at(cone(R * 0.12, R * 0.26, beak, 4), 0, -R * 0.12, R * 1.02, Math.PI / 2, Math.PI / 4, 0);
  const cheeks = [-1, 1].map((s) => at(sphere(R * 0.16, orange, 1, 0.75, 0.35), s * R * 0.55, -R * 0.3, R * 0.8));
  head.add(skull, ...f.parts, crest, ...tufts, bk, ...cheeks);
  const { wave, other } = armPair(plainArm(down, pale, 0.15));
  // The tiffin carrier in the other hand: three tiers and a handle, as drawn.
  other.rotation.z = 0.2;
  const tin = mat('#7a7f86', { metalness: 0.6, roughness: 0.4 });
  const tiffin = group();
  tiffin.position.set(0, -0.31, 0.02);
  ['#4fb3b8', '#e8c94f', '#e8763b'].forEach((hex, i) => tiffin.add(at(cylinder(0.055, 0.055, 0.045, mat(hex, { roughness: 0.4, metalness: 0.2 }), 20), 0, i * 0.05, 0)));
  tiffin.add(at(cylinder(0.005, 0.005, 0.18, tin, 6), 0, 0.1, 0));
  tiffin.add(at(new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.005, 6, 16, Math.PI), tin), 0, 0.19, 0));
  other.add(tiffin);
  // Teal wings at the back, gold at the tips; a fan of tail feathers.
  const wings = [-1, 1].map((s) => {
    const wg = group();
    wg.position.set(s * 0.2, BODY_Y + 0.08, -0.12);
    wg.add(at(sphere(0.15, teal, 1.15, 0.5, 0.3), s * 0.12, 0.02, 0, 0, 0, s * 0.35), at(sphere(0.07, gold, 1.2, 0.5, 0.3), s * 0.3, 0.12, 0, 0, 0, s * 0.5));
    return wg;
  });
  const tail = group(...[-1, 0, 1].map((i) => at(sphere(0.06, i === 0 ? gold : teal, 0.6, 1.8, 0.35), i * 0.09, BODY_Y - 0.16, -0.2, 0.9, 0, i * 0.45)));
  // Orange legs and feet, three toes each.
  const lg: THREE.Object3D[] = [];
  for (const s of [-1, 1]) {
    lg.push(at(capsule(0.045, 0.08, orange), s * 0.11, 0.13, 0.02));
    const ft = group();
    ft.position.set(s * 0.12, 0.05, 0.05);
    for (const a of [-0.45, 0, 0.45]) {
      const toe = capsule(0.03, 0.09, orange);
      toe.position.set(Math.sin(a) * 0.05, 0, 0.05 + Math.cos(a) * 0.02);
      toe.rotation.set(Math.PI / 2, a, 0, 'YXZ');
      ft.add(toe);
    }
    lg.push(ft);
  }
  const root = group(chest, front, ...wardrobe(w, STANDING_FIT), head, wave, other, ...wings, tail, ...lg);
  // Legs after the wings: `lg` is [leg, foot] for the left side then the
  // right, which is what `companionIdle` steps with. Appending keeps the
  // convention at the top of this file - limbs[0] waves, limbs[1] is the
  // other hand - and leaves the wing indices where they were.
  return { root, body: chest, head, lids: f.lids, limbs: [wave, other, ...wings, ...lg], tail, restY: 0 };
}

function buildOctopus(c: Colours, w: Wear, hr: number): Rig {
  const skin = mat(c.body, { roughness: 0.7 }), armMat = mat(c.limb, { roughness: 0.7 }), sucker = mat(c.feature, { roughness: 0.5 }), eye = mat(c.eye, { roughness: 0.25 });
  const R = 0.33;
  const HEAD = 0.56;
  // The mantle is the head is the body: one dome with the face on it. It
  // lives inside the head group so a hatchling's bigger head is the whole
  // animal, which is what a baby octopus is.
  const mantle = sphere(R, skin, 1, 1.08, 1);
  const head = group();
  head.position.set(0, HEAD, 0);
  head.scale.setScalar(hr);
  const f = face(R, eye, mat('#8a3a2a'));
  const blush = [-1, 1].map((s) => at(sphere(R * 0.16, mat('#f0a08a', { roughness: 0.8 }), 1, 0.7, 0.3), s * R * 0.62, -R * 0.28, R * 0.78));
  head.add(mantle, ...f.parts, ...blush, sprout(R));
  // The sash sits on the mantle where a chest would be; the skirt and rope below it.
  const fit: Fit = { sashR: 0.31, sashY: HEAD - 0.16, squash: 1, shortsR: 0.3, shortsY: 0.22, ropeY: 0.26 };
  // The right front arm is raised, waving; the other seven rest curled on the sand.
  const wave = group();
  wave.position.set(-0.2, 0.36, 0.16);
  wave.rotation.z = -0.3;
  wave.add(tentacle([[0, 0, 0], [-0.1, 0.16, 0.06], [-0.14, 0.36, 0.06], [-0.06, 0.5, 0.02]], 0.075, armMat, sucker, [0.3, 0, 1]));
  const rest: THREE.Object3D[] = [];
  for (const i of [0, 1, 2, 4, 5, 6, 7]) {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    const dx = Math.cos(a), dz = Math.sin(a);
    const curl = 0.9 + (i % 3) * 0.12;
    // Thick at the root, curling up at the tip, as a plush arm is stitched.
    rest.push(tentacle([
      [dx * 0.12, 0.3, dz * 0.12], [dx * 0.3, 0.14, dz * 0.3], [dx * 0.46, 0.07, dz * 0.46], [dx * 0.52 * curl, 0.22, dz * 0.5 * curl],
    ], 0.082, armMat, sucker, [0, 1, 0]));
  }
  const root = group(head, ...wardrobe(w, fit), wave, ...rest);
  return { root, body: mantle, head, lids: f.lids, limbs: [wave, ...rest], restY: 0 };
}

function buildTurtle(c: Colours, w: Wear, hr: number): Rig {
  const skin = mat(c.body, { roughness: 0.75 }), pale = mat(c.belly), legMat = mat(c.limb, { roughness: 0.75 }), spot = mat(c.feature, { roughness: 0.7 });
  const shell = mat(c.accent ?? '#8a5a34', { roughness: 0.6 }), eye = mat(c.eye, { roughness: 0.25 });
  const { chest, front } = torso(skin, pale);
  // The shell: a dome on the back, the scutes as dark plates on it.
  const domeScale: [number, number, number] = [1.15, 1.15, 0.72];
  const dome = at(sphere(0.33, shell, ...domeScale), 0, BODY_Y + 0.02, -0.14);
  const scutes = group();
  scutes.position.copy(dome.position);
  const back = -Math.PI / 2;
  for (const [theta, phi] of [[back, 0.5], [back - 0.6, 0.9], [back + 0.6, 0.9], [back - 0.35, 1.4], [back + 0.35, 1.4], [back - 1.1, 1.3], [back + 1.1, 1.3]]) {
    scutes.add(onSurface(sphere(0.09, spot, 1, 1, 0.3), 0.33, theta!, phi!, domeScale));
  }
  const head = group();
  head.position.set(0, HEAD_Y, 0.03);
  head.scale.setScalar(hr);
  const R = HEAD_R;
  const skull = sphere(R, skin);
  const f = face(R, eye, mat('#5c4a2a'));
  // The big hexagonal spots on the head, dark olive, as drawn - and the sprout.
  const spots = group();
  const top = Math.PI / 2;
  for (const [theta, phi] of [[top + 0.2, 0.35], [top - 0.9, 0.55], [top + 1.1, 0.6], [top - 0.4, 0.95], [top + 0.6, 1.0], [back, 0.5], [back + 0.9, 0.9], [back - 0.9, 0.9]]) {
    spots.add(onSurface(sphere(R * 0.24, spot, 1, 1, 0.3), R, theta!, phi!));
  }
  const muzzle = at(sphere(R * 0.34, pale, 1.3, 0.72, 0.6), 0, -R * 0.4, R * 0.68);
  head.add(skull, ...f.parts, spots, muzzle, sprout(R));
  // Flippers for arms, a spot on each, one raised.
  const { wave, other } = armPair(() => [
    at(sphere(0.13, skin, 0.5, 1.15, 0.28), 0, -0.14, 0),
    at(sphere(0.035, spot, 1, 1, 0.4), 0.01, -0.2, 0.04),
  ]);
  const lg = legs(legMat, legMat, [1, 0.55, 1.3]);
  const tail = at(cone(0.04, 0.12, skin, 10), 0, 0.2, -0.3, -Math.PI / 2 - 0.4, 0, 0);
  const root = group(dome, scutes, chest, front, ...wardrobe(w, STANDING_FIT), head, wave, other, ...lg, tail);
  return { root, body: chest, head, lids: f.lids, limbs: [wave, other, ...lg], tail, restY: 0 };
}

function buildBuffalo(c: Colours, w: Wear, hr: number): Rig {
  const hide = mat(c.body, { roughness: 0.85 }), pale = mat(c.belly, { roughness: 0.85 }), legMat = mat(c.limb, { roughness: 0.85 });
  const horn = mat(c.feature, { roughness: 0.35 }), muzzleMat = mat(c.beak, { roughness: 0.75 }), eye = mat(c.eye, { roughness: 0.25 });
  const { chest, front } = torso(hide, pale);
  const head = group();
  head.position.set(0, HEAD_Y, 0.03);
  head.scale.setScalar(hr);
  const R = HEAD_R * 1.05;
  const skull = sphere(R, hide);
  const f = face(R, eye, mat('#2a1a0e'));
  const muzzle = at(sphere(R * 0.44, muzzleMat, 1.3, 0.72, 0.7), 0, -R * 0.4, R * 0.66);
  const nostrils = [-1, 1].map((s) => at(sphere(R * 0.05, eye, 1, 0.8, 0.5), s * R * 0.16, -R * 0.32, R * 0.99));
  // The horns: out, back and up in one sweep each side. The whole animal.
  const horns = [-1, 1].map((s) => tube([
    [s * R * 0.5, R * 0.55, -R * 0.1], [s * R * 1.1, R * 0.7, -R * 0.25], [s * R * 1.55, R * 1.3, -R * 0.3], [s * R * 1.35, R * 1.9, -R * 0.3],
  ], R * 0.17, horn, true));
  const ears = [-1, 1].flatMap((s) => [
    at(sphere(R * 0.36, hide, 1.5, 0.6, 0.35), s * R * 1.05, -R * 0.02, 0, 0, 0, s * 0.5),
    at(sphere(R * 0.24, muzzleMat, 1.5, 0.55, 0.3), s * R * 1.08, -R * 0.02, R * 0.06, 0, 0, s * 0.5),
  ]);
  head.add(skull, ...f.parts, muzzle, ...nostrils, ...horns, ...ears, sprout(R));
  const { wave, other } = armPair(plainArm(hide, muzzleMat, 0.15, 0.06));
  const lg = legs(legMat, muzzleMat, [1, 0.6, 1.15]);
  const tail = group(
    tube([[0, 0.34, -0.2], [0.03, 0.2, -0.3], [0, 0.08, -0.28]], 0.02, legMat, true),
    at(sphere(0.04, horn, 1, 1.4, 1), 0, 0.06, -0.28),
  );
  const root = group(chest, front, ...wardrobe(w, STANDING_FIT), head, wave, other, ...lg, tail);
  return { root, body: chest, head, lids: f.lids, limbs: [wave, other, ...lg], tail, restY: 0 };
}

// ---------------------------------------------------------------------------
// The rig and the idle
// ---------------------------------------------------------------------------

export function buildCompanion(key: CreatureKey, look: Look, hr: number): Rig {
  const c = look.colours, w = look.wear;
  switch (key) {
    case 'coconut-macaque': return buildMacaque(c, w, hr);
    case 'red-junglefowl': return buildJunglefowl(c, w, hr);
    case 'day-octopus': return buildOctopus(c, w, hr);
    case 'green-turtle': return buildTurtle(c, w, hr);
    case 'water-buffalo': return buildBuffalo(c, w, hr);
  }
}

/**
 * The idle and the answer to a tap, by species. `t` is the clock, `k` runs
 * 0..1 through the reaction, `pulse` is its bell curve; `motion` is 0 under
 * reduce-motion. The general loop has already breathed, blinked and turned
 * the head toward the pointer; this adds what that animal does.
 */
export function companionIdle(rig: Rig, key: CreatureKey, t: number, k: number, pulse: number, motion: number, stage: CompanionStage): void {
  const [wave, other] = rig.limbs;
  // The wave, for all five: a slow sway at rest, a proper wave on a tap.
  if (wave) wave.rotation.z = (key === 'day-octopus' ? -0.3 : -2.4) + Math.sin(t * 2.2) * 0.1 * motion + Math.sin(k * Math.PI * 6) * 0.4 * pulse;
  switch (key) {
    case 'coconut-macaque': {
      rig.root.position.y = rig.restY + pulse * 0.26; // the hop
      rig.head.rotation.z = pulse * 0.25; // and a happy tilt
      if (other) other.rotation.x = -1.1 - pulse * 0.5; // the coconut, held up to you
      if (rig.tail) rig.tail.rotation.y = Math.sin(t * 1.1) * 0.3 * motion;
      break;
    }
    case 'red-junglefowl': {
      /*
        The one companion that has to move like the animal it is: everybody
        watching has seen a chicken. `fowlPose` in rig.ts holds the whole
        dance - the step, the head-hold, the burst of flight - in plain
        numbers; this only hangs the rig on it.
      */
      const [, , wl, wr, legL, footL, legR, footR] = rig.limbs;
      const pose = fowlPose(t, motion, { k, pulse });
      // Metres, at the size this one is drawn: a hatchling's burst is a
      // hatchling-sized burst, not an adult's with a smaller bird under it.
      rig.root.position.y = rig.restY + pose.lift * rig.root.scale.x;
      // The lean and the pitch go on the ROOT, not the chest. The root's
      // origin is the ground between its feet, which is what a bird actually
      // rocks about; leaning the chest alone would just wobble a sphere
      // inside a bird that stayed put.
      rig.root.rotation.z = pose.lean;
      rig.root.rotation.x = pose.pitch;
      // Left wing is limbs[2], built at -x, so it rises on a negative angle.
      if (wl) wl.rotation.z = -pose.wing;
      if (wr) wr.rotation.z = pose.wing;
      // The head holds its place in the room while the body bobs under it,
      // then thrusts. That is the whole reason a chicken reads as a chicken.
      rig.head.position.y = HEAD_Y + pose.headLift;
      rig.head.position.z = (rig.head.userData.baseZ ??= rig.head.position.z) + pose.headThrust;
      /*
        Beak stays level while the body tips under it - the same hold as the
        bob, in the other axis.

        SET, not `+=`. The shared look-at above eases the head toward the
        pointer by a fraction of the gap each frame, so an offset added on
        top of it every frame does not stay that size: it settles where the
        easing pulls back exactly as hard, which is more than TWELVE TIMES
        the offset. Nine degrees of body pitch came out as a bird with its
        beak in the grass. Assigning costs the fowl the pointer's up-down
        look, which it was not using - it does not sweep either.
      */
      rig.head.rotation.x = -pose.pitch * 0.6;
      if (legL) legL.position.y = 0.13 + pose.footL;
      if (footL) footL.position.y = 0.05 + pose.footL;
      if (legR) legR.position.y = 0.13 + pose.footR;
      if (footR) footR.position.y = 0.05 + pose.footR;
      if (rig.tail) rig.tail.rotation.x = pose.tail;
      break;
    }
    case 'day-octopus': {
      // Seven resting arms, none of them agreeing; all of them lifting on a tap.
      for (const [i, arm] of rig.limbs.entries()) {
        if (i === 0) continue;
        arm.rotation.y = Math.sin(t * 1.1 + i * 0.9) * 0.06 * motion;
        arm.rotation.x = Math.cos(t * 1.3 + i * 1.1) * 0.05 * motion;
        arm.position.y = Math.max(0, Math.sin(k * Math.PI * 2 + i * 0.6)) * 0.08 * pulse;
      }
      // A squash and a bounce: the mantle settles like a bag of water.
      const squash = 1 - pulse * 0.12;
      rig.body.scale.y *= squash;
      rig.body.scale.x = 1 / squash;
      rig.body.scale.z = 1 / squash;
      rig.root.position.y = rig.restY + Math.sin(t * 0.9) * 0.012 * motion + pulse * 0.1;
      break;
    }
    case 'green-turtle': {
      // Tuck the head, then peek. That is a turtle's whole reaction.
      const tuck = pulse > 0 ? Math.sin(Math.min(1, k * 1.6) * Math.PI) : 0;
      rig.head.position.y = HEAD_Y - tuck * 0.12;
      rig.head.scale.setScalar(headRatio(stage) * (1 - tuck * 0.1));
      if (other) other.rotation.z = 0.3 + Math.sin(t * 1.3) * 0.08 * motion + pulse * 0.6;
      rig.root.position.y = rig.restY + Math.sin(t * 0.8) * 0.01 * motion;
      if (rig.tail) rig.tail.rotation.y = Math.sin(t * 1.5) * 0.2 * motion;
      break;
    }
    case 'water-buffalo': {
      // The head tosses on a tap, horns and all; the tail swats; a front hoof stamps.
      rig.head.rotation.x += -pulse * 0.4;
      rig.head.rotation.z += Math.sin(k * Math.PI * 3) * 0.18 * pulse;
      if (rig.tail) rig.tail.rotation.z = Math.sin(t * 1.7) * 0.35 * motion + Math.sin(k * Math.PI * 2) * 0.5 * pulse;
      rig.root.position.y = rig.restY + Math.sin(t * 0.7) * 0.008 * motion;
      const [, , legL, footL] = rig.limbs;
      const stamp = Math.max(0, Math.sin(k * Math.PI * 2)) * 0.07 * pulse;
      if (legL) legL.position.y = 0.14 + stamp;
      if (footL) footL.position.y = 0.05 + stamp;
      break;
    }
  }
}
