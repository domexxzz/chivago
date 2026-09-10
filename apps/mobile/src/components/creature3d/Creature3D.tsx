/**
 * The companion, alive, in its own room. Web only.
 *
 * A real-time scene: the animal built from primitives with a small rig, lit
 * by the island's clock, on a patch of the ground it actually lives on, with
 * the things that live there too. It breathes, it blinks, it looks at your
 * finger, and it answers a tap the way that animal would - every one of the
 * five waves, as the team drew them, and then the macaque hops and holds up
 * its coconut, the junglefowl flaps and hops, the octopus lifts all seven
 * resting arms and squashes, the turtle tucks its head and peeks, the
 * buffalo tosses its horns and stamps.
 *
 * PRIMITIVES, STILL. No model file, for the same reason the SVG marks have no
 * photograph: a downloaded monkey carries somebody's licence and somebody's
 * idea of a monkey. Every shape here is a sphere, a capsule, a cone or a
 * tube along a curve, placed by a number a person can read and change. The
 * five animals themselves are built in `companion-rig.ts`, to the team's
 * reference art; this file owns the room around them.
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
import type { CompanionStage, LayerKey, Mascot } from '@chivago/core';
import type { CreatureKey } from '../Creature.tsx';
import { hourFrom } from '../island-clock.ts';
import {
  COMPANION_HOUR, HABITATS, LOOKS, NECK_YAW, REACTION_MS, headRatio, lightingFor, motionScale, placements, speckles,
  stageScale,
} from './rig.ts';

// ---------------------------------------------------------------------------
// Small builders. Every animal is made of these and nothing else.
// ---------------------------------------------------------------------------

import { cylinder, group, mat, shadowed, softDot, sphere, tube, type Rig } from './primitives.ts';
import { MASCOT_REACTION_MS, buildMascot, mascotCamera, mascotIdle } from './mascot-rig.ts';
import { buildCompanion, companionIdle } from './companion-rig.ts';

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

/** The stage as size: a hatchling is a smaller animal with a bigger head. */
function scaled(rig: Rig, stage: CompanionStage): Rig {
  const s = stageScale(stage);
  rig.root.scale.setScalar(s);
  rig.root.position.y *= s;
  rig.restY *= s;
  return rig;
}

function buildCreature(key: CreatureKey, stage: CompanionStage): Rig {
  const look = LOOKS[key];
  if (stage === 'egg') return buildEgg(look.layer);
  return scaled(buildCompanion(key, look, headRatio(stage)), stage);
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
  /** One of the five Samui species, or - */
  species?: CreatureKey;
  /** - one of the seventy-seven provincial mascots. One of the two. */
  mascot?: Mascot;
  stage: CompanionStage;
  height?: number;
  /** Spoken name, for the canvas. */
  label: string;
  /** Called on a tap, after the animal has reacted. The screen may toast. */
  onTap?: () => void;
}

export function Creature3D({ species, mascot, stage, height = 320, label, onTap }: Creature3DProps) {
  const holder = React.useRef<HTMLDivElement | null>(null);
  const tapRef = React.useRef(onTap);
  React.useEffect(() => { tapRef.current = onTap; });

  React.useEffect(() => {
    const el = holder.current;
    if (!el) return;
    const still = prefersReducedMotion();
    const motion = motionScale(still);
    const look = mascot ? null : LOOKS[species ?? 'coconut-macaque'];
    const layer: LayerKey = mascot ? mascot.habitat : look!.layer;
    const habitat = HABITATS[layer];
    /*
      The companion's room is always daylight.

      It used to follow the island's clock, like the map and the greeting do,
      and the reasoning was sound: a companion opened at dinner should look
      like dinner. What that reasoning missed is WHERE this is drawn. The
      creature sits in a card on a pale screen, and after sunset the card
      became a dark rectangle punched through a light page - the animal a
      silhouette, its habitat unreadable, the whole panel reading as an image
      that failed to load.

      A companion is a PORTRAIT, not a window. It is the one picture the
      collection has of what that animal is, and it has to be legible at ten
      at night, which is when people open it. The island's clock still runs
      everywhere it belongs: the map, the terrain, the greeting.

      `?hour=` still wins, so a demo can put this room at any hour on purpose.
    */
    const hourOverride = hourFrom(window.location.search);
    const light = lightingFor(hourOverride ?? COMPANION_HOUR);

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

    const { water, glow } = buildHabitat(layer, scene);
    glow.visible = light.glowVisible || habitat.particles === 'bubbles' || habitat.particles === 'sparkle';

    const rig = mascot
      ? (stage === 'egg' ? buildEgg(mascot.habitat) : scaled(buildMascot(mascot, stage), stage))
      : buildCreature(species ?? 'coconut-macaque', stage);
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
    const cam = mascot ? mascotCamera(mascot) : null;
    const focusY = stage === 'egg' ? 0.42
      : cam ? cam.focusY * stageScale(stage) + 0.1
        : look!.medium === 'air' ? 0.95 : look!.eyeHeight * 0.75 * stageScale(stage) + 0.1;
    const dist = stage === 'egg' ? 2.2 : cam ? cam.dist : look!.medium === 'air' ? 3.1 : look!.eyeHeight < 0.3 ? 1.9 : 2.5;
    const reactionMs = mascot ? MASCOT_REACTION_MS : REACTION_MS[species ?? 'coconut-macaque'];
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
      reactUntil = now + reactionMs;
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
      const k = reacting ? (performance.now() - reactStart) / reactionMs : 0; // 0..1 through the reaction
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

      /*
        Look at the pointer. Head only, and only as far as a neck goes.

        The counter-turn here used to be `- yaw * 0.5` against a yaw that
        grows for as long as the screen is open, so a companion left alone
        wound its head steadily round on its neck - a full turn every three
        and a half minutes. No animal does that, and on the junglefowl,
        whose crest and beak say exactly where its head is pointing, it was
        the first thing anyone noticed. The target is bounded now, and the
        bird opts out of the idle sweep as well: a junglefowl thrusts its
        head, it does not swivel it. `companionIdle` gives it the bob.
      */
      const sweep = species === 'red-junglefowl' ? 0 : 0.3;
      const lookX = pointer.active ? pointer.x : Math.sin(t * 0.3) * sweep * motion;
      const lookY = pointer.active ? pointer.y : 0;
      const neck = Math.max(-NECK_YAW, Math.min(NECK_YAW, lookX * 0.6));
      rig.head.rotation.y += (neck - rig.head.rotation.y) * Math.min(1, dt * 5);
      rig.head.rotation.x += ((-lookY * 0.35) - rig.head.rotation.x) * Math.min(1, dt * 5);

      // Species idle and reaction.
      if (mascot && stage !== 'egg') mascotIdle(rig, mascot, t, k, pulse, motion);
      if (!mascot && stage !== 'egg') companionIdle(rig, species ?? 'coconut-macaque', t, k, pulse, motion, stage);

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
  }, [species, mascot?.key, stage, height, label]);

  return <div ref={holder} style={{ width: '100%', height, borderRadius: 18, overflow: 'hidden' }} />;
}
