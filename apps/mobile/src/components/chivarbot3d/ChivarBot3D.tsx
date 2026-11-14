/**
 * Chivar Bot as a live 3D model. Web only.
 *
 * The character sheet draws him as a turnaround - front, side, back, three
 * quarters - and that is what this is: the same robot built from primitives,
 * which you can turn round with a finger. Cream body, the teal explorer kit,
 * the bucket hat with its band and sprout, the bedroll pack, the leaf tail,
 * and a dark screen face glowing with whichever of the eight moods the
 * conversation has put him in.
 *
 * PRIMITIVES, LIKE EVERY OTHER CHARACTER IN THE APP. No model file: rounded
 * boxes, spheres, capsules, cylinders and a tube, placed by numbers a person
 * can read. The face is a small canvas redrawn only when the mood or a blink
 * changes it, on a material that is not tone-mapped, so the teal reads as
 * light from inside the glass rather than paint on it.
 *
 * WHAT DECIDES lives in `bot-rig.ts` - the face for a mood, how a drag turns
 * him, the breath, the hop - where a test can reach it without a GPU.
 *
 * Phones keep the drawn `ChivarBot` SVG: `expo-gl` needs a development build
 * the app has never had, exactly as for `Creature3D`. `ChivarBotScene` picks.
 */

import React from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

import type { BotMood } from '../ChivarBot.tsx';
import { cylinder, group, mat, sphere, tube } from '../creature3d/primitives.ts';
import {
  ARM_REST, REACT_MS, TAP_SLOP_PX, approach, dragYaw, faceKey, faceParts, idlePose,
  lookAt, reaction, restingYaw, waveAngle, type FaceParts,
} from './bot-rig.ts';

const COLOUR = {
  body: '#F7F1E4',
  teal: '#1F7A74',
  tealDark: '#145E59',
  tealLight: '#3AA79C',
  hat: '#E6CF9C',
  hatDark: '#C9AF76',
  screen: '#0F222C',
  glow: '#5FF0E0',
  leaf: '#55B86A',
  gold: '#E8B54A',
} as const;

// ---------------------------------------------------------------------------
// The face, drawn on a canvas
// ---------------------------------------------------------------------------

const FACE_W = 320;
const FACE_H = 224;

/** Draw a face onto the screen canvas. Glow is the canvas's own shadow. */
function drawFace(ctx: CanvasRenderingContext2D, f: FaceParts): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, FACE_W, FACE_H);
  // The sheet's face fills the glass: drawn on the same grid as the SVG, then
  // enlarged about the centre. 1.15 is as far as it goes before the question
  // mark and the hearts at the edge leave the screen.
  ctx.translate(FACE_W / 2, FACE_H / 2);
  ctx.scale(1.15, 1.15);
  ctx.translate(-FACE_W / 2, -FACE_H / 2);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowColor = COLOUR.glow;
  ctx.shadowBlur = 18;
  ctx.fillStyle = COLOUR.glow;
  ctx.strokeStyle = COLOUR.glow;

  const lx = 108;
  const rx = 212;
  const ey = 92;

  const dot = (x: number, y: number, r: number) => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); };
  const arc = (x: number, y: number) => {
    ctx.lineWidth = 13; ctx.beginPath(); ctx.arc(x, y + 10, 22, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
  };
  const heart = (x: number, y: number, s: number) => {
    ctx.beginPath();
    ctx.moveTo(x, y + s * 0.9);
    ctx.bezierCurveTo(x - s * 1.6, y - s * 0.2, x - s, y - s * 1.4, x, y - s * 0.35);
    ctx.bezierCurveTo(x + s, y - s * 1.4, x + s * 1.6, y - s * 0.2, x, y + s * 0.9);
    ctx.fill();
  };

  switch (f.eyes) {
    case 'round': dot(lx, ey, 19); dot(rx, ey, 19); break;
    case 'wide': dot(lx, ey, 25); dot(rx, ey, 25); break;
    case 'up': dot(lx, ey - 10, 19); dot(rx, ey - 10, 19); break;
    case 'arc': arc(lx, ey); arc(rx, ey); break;
    case 'wink': arc(lx, ey); dot(rx, ey, 19); break;
    case 'shut':
      ctx.lineWidth = 11;
      ctx.beginPath(); ctx.moveTo(lx - 20, ey); ctx.lineTo(lx + 20, ey); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(rx - 20, ey); ctx.lineTo(rx + 20, ey); ctx.stroke();
      break;
    case 'heart':
      ctx.fillStyle = '#FF6B8A'; ctx.shadowColor = '#FF6B8A';
      heart(lx, ey, 22); heart(rx, ey, 22);
      ctx.fillStyle = COLOUR.glow; ctx.shadowColor = COLOUR.glow;
      break;
    case 'shades': {
      // Two dark lenses on a glowing bridge.
      ctx.lineWidth = 9;
      ctx.beginPath(); ctx.moveTo(lx + 26, ey - 4); ctx.lineTo(rx - 26, ey - 4); ctx.stroke();
      for (const x of [lx, rx]) {
        ctx.beginPath();
        ctx.roundRect(x - 34, ey - 22, 68, 40, 14);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#0A1820';
        ctx.beginPath(); ctx.roundRect(x - 28, ey - 16, 56, 28, 10); ctx.fill();
        ctx.fillStyle = COLOUR.glow; ctx.shadowBlur = 18;
      }
      break;
    }
    default: break;
  }

  const my = 156;
  ctx.lineWidth = 11;
  switch (f.mouth) {
    case 'smile':
      ctx.beginPath(); ctx.arc(160, my - 22, 26, Math.PI * 0.18, Math.PI * 0.82); ctx.stroke(); break;
    case 'grin':
      ctx.beginPath(); ctx.moveTo(126, my - 12); ctx.quadraticCurveTo(160, my + 40, 194, my - 12); ctx.closePath(); ctx.fill(); break;
    case 'tongue':
      ctx.beginPath(); ctx.arc(160, my - 22, 26, Math.PI * 0.18, Math.PI * 0.82); ctx.stroke();
      ctx.fillStyle = '#FF8FA3'; ctx.shadowColor = '#FF8FA3';
      ctx.beginPath(); ctx.ellipse(170, my + 8, 11, 14, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = COLOUR.glow; ctx.shadowColor = COLOUR.glow;
      break;
    case 'o':
      ctx.lineWidth = 9; ctx.beginPath(); ctx.arc(160, my, 15, 0, Math.PI * 2); ctx.stroke(); break;
    case 'flat':
      ctx.beginPath(); ctx.moveTo(140, my); ctx.lineTo(180, my); ctx.stroke(); break;
    default: break;
  }

  switch (f.extra) {
    case 'question':
      ctx.font = 'bold 64px sans-serif';
      ctx.fillStyle = COLOUR.gold; ctx.shadowColor = COLOUR.gold;
      ctx.fillText('?', 262, 82);
      break;
    case 'hearts':
      ctx.fillStyle = '#FF6B8A'; ctx.shadowColor = '#FF6B8A';
      heart(276, 46, 11); heart(296, 74, 7);
      break;
    case 'sparkle':
      ctx.fillStyle = COLOUR.gold; ctx.shadowColor = COLOUR.gold;
      for (const [x, y, s] of [[270, 44, 12], [292, 76, 7]] as const) {
        ctx.beginPath();
        ctx.moveTo(x, y - s); ctx.lineTo(x + s * 0.3, y - s * 0.3); ctx.lineTo(x + s, y);
        ctx.lineTo(x + s * 0.3, y + s * 0.3); ctx.lineTo(x, y + s); ctx.lineTo(x - s * 0.3, y + s * 0.3);
        ctx.lineTo(x - s, y); ctx.lineTo(x - s * 0.3, y - s * 0.3); ctx.closePath(); ctx.fill();
      }
      break;
    default: break;
  }
}

/** The hat band's lettering, drawn once. */
function bandTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 96;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = COLOUR.teal;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = '#F4FBF9';
  ctx.font = 'bold 54px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Centred on the half of the band that faces forward.
  ctx.fillText('Chivar Bot', c.width * 0.5, c.height * 0.54);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// ---------------------------------------------------------------------------
// The model
// ---------------------------------------------------------------------------

interface BotRig {
  root: THREE.Group;
  body: THREE.Group;
  head: THREE.Group;
  armR: THREE.Group;
  armL: THREE.Group;
  sprout: THREE.Group;
  faceCanvas: HTMLCanvasElement;
  faceTexture: THREE.CanvasTexture;
  textures: THREE.Texture[];
}

function roundedBox(w: number, h: number, d: number, r: number, m: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 5, r), m);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function buildBot(): BotRig {
  const body = mat(COLOUR.body, { roughness: 0.55 });
  const teal = mat(COLOUR.teal, { roughness: 0.6 });
  const tealDark = mat(COLOUR.tealDark, { roughness: 0.6 });
  const tealLight = mat(COLOUR.tealLight, { roughness: 0.6 });
  const hat = mat(COLOUR.hat, { roughness: 0.85 });
  const hatDark = mat(COLOUR.hatDark, { roughness: 0.85 });
  const leaf = mat(COLOUR.leaf, { roughness: 0.55 });
  const gold = mat(COLOUR.gold, { roughness: 0.35, metalness: 0.4 });
  const screen = new THREE.MeshStandardMaterial({ color: COLOUR.screen, roughness: 0.18, metalness: 0.2 });

  const root = new THREE.Group();

  // --- Legs and shoes -------------------------------------------------------
  for (const side of [-1, 1]) {
    const leg = cylinder(0.062, 0.07, 0.12, body);
    leg.position.set(side * 0.085, 0.1, 0);
    const shoe = sphere(0.075, teal, 1, 0.62, 1.3);
    shoe.position.set(side * 0.085, 0.035, 0.025);
    root.add(leg, shoe);
  }

  // --- Body, chest and kit, all of which breathe together ---------------------
  const torso = group();
  torso.position.y = 0.16;
  const belly = sphere(0.2, body, 1, 1.02, 0.88);
  belly.position.y = 0.14;
  torso.add(belly);

  // The scarf round the neck, and its knot.
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.135, 0.04, 12, 36), tealLight);
  scarf.rotation.x = Math.PI / 2;
  scarf.position.y = 0.3;
  scarf.castShadow = true;
  const knot = sphere(0.045, tealLight, 1.2, 0.9, 0.7);
  knot.position.set(0.05, 0.27, 0.13);
  torso.add(scarf, knot);

  // Straps over each shoulder, with a gold buckle.
  for (const side of [-1, 1]) {
    const strap = tube([[side * 0.1, 0.3, 0.1], [side * 0.15, 0.18, 0.17], [side * 0.14, 0.04, 0.12]], 0.017, teal);
    const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.028, 0.012), gold);
    buckle.position.set(side * 0.152, 0.15, 0.178);
    torso.add(strap, buckle);
  }

  // The compass badge on the chest.
  const badge = cylinder(0.058, 0.058, 0.018, body, 28);
  badge.rotation.x = Math.PI / 2;
  badge.position.set(0, 0.13, 0.182);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.058, 0.009, 10, 32), tealDark);
  rim.position.set(0, 0.13, 0.192);
  const needleN = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.05, 4), leaf);
  needleN.position.set(0, 0.152, 0.196);
  const needleS = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.05, 4), gold);
  needleS.position.set(0, 0.108, 0.196);
  needleS.rotation.z = Math.PI;
  torso.add(badge, rim, needleN, needleS);

  // The backpack, its bedroll, and the leaf on its flap.
  const pack = roundedBox(0.27, 0.27, 0.13, 0.05, teal);
  pack.position.set(0, 0.15, -0.19);
  const roll = cylinder(0.058, 0.058, 0.3, tealLight, 20);
  roll.rotation.z = Math.PI / 2;
  roll.position.set(0, 0.315, -0.18);
  const flap = roundedBox(0.16, 0.12, 0.02, 0.02, tealDark);
  flap.position.set(0, 0.17, -0.26);
  const packLeaf = sphere(0.032, leaf, 0.55, 1, 0.3);
  packLeaf.rotation.z = 0.5;
  packLeaf.position.set(0, 0.17, -0.275);
  torso.add(pack, roll, flap, packLeaf);

  // The tail: a teal leaf-shape curling out behind.
  const tail = tube([[0, 0.02, -0.16], [0.04, -0.02, -0.29], [0.1, 0.03, -0.37], [0.13, 0.12, -0.36]], 0.06, tealLight, true);
  torso.add(tail);

  // Arms, pivoting at the shoulder so a wave lifts the whole arm.
  const arm = (side: number): THREE.Group => {
    const g = new THREE.Group();
    g.position.set(side * 0.19, 0.25, 0);
    const limb = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.13, 6, 14), body);
    limb.position.y = -0.09;
    limb.castShadow = true;
    const hand = sphere(0.058, body);
    hand.position.y = -0.18;
    g.add(limb, hand);
    g.rotation.z = side * ARM_REST;
    return g;
  };
  const armL = arm(-1);
  const armR = arm(1);
  torso.add(armL, armR);

  root.add(torso);

  // --- Head: rounded block, ear caps, the screen, the hat ---------------------
  const head = new THREE.Group();
  head.position.y = 0.5;
  const skull = roundedBox(0.58, 0.46, 0.46, 0.16, body);
  skull.position.y = 0.21;
  head.add(skull);

  for (const side of [-1, 1]) {
    const cap = cylinder(0.088, 0.088, 0.07, teal, 24);
    cap.rotation.z = Math.PI / 2;
    cap.position.set(side * 0.3, 0.2, 0);
    const inner = cylinder(0.052, 0.052, 0.074, tealLight, 20);
    inner.rotation.z = Math.PI / 2;
    inner.position.set(side * 0.305, 0.2, 0);
    head.add(cap, inner);
  }

  const glass = roundedBox(0.46, 0.33, 0.06, 0.1, screen);
  glass.position.set(0, 0.2, 0.205);
  head.add(glass);

  const faceCanvas = document.createElement('canvas');
  faceCanvas.width = FACE_W;
  faceCanvas.height = FACE_H;
  const faceTexture = new THREE.CanvasTexture(faceCanvas);
  faceTexture.colorSpace = THREE.SRGBColorSpace;
  const faceMat = new THREE.MeshBasicMaterial({ map: faceTexture, transparent: true, toneMapped: false, depthWrite: false });
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.294), faceMat);
  face.position.set(0, 0.2, 0.237);
  head.add(face);

  // The hat: crown, band with lettering, wide brim, and the sprout.
  const hatG = new THREE.Group();
  hatG.position.set(0, 0.43, 0);
  hatG.rotation.x = -0.08;
  const brim = cylinder(0.43, 0.45, 0.026, hat, 48);
  brim.position.y = 0;
  const brimEdge = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.018, 10, 56), hatDark);
  brimEdge.rotation.x = Math.PI / 2;
  const crown = sphere(0.28, hat, 1, 0.6, 1);
  crown.position.y = 0.075;
  const band = bandTexture();
  const bandMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.283, 0.29, 0.08, 64, 1, true),
    new THREE.MeshStandardMaterial({ map: band, roughness: 0.7 }),
  );
  bandMesh.position.y = 0.05;
  // Turned half a revolution so the seam sits at the back and the lettering,
  // centred on the canvas, faces forward.
  bandMesh.rotation.y = Math.PI;
  hatG.add(brim, brimEdge, crown, bandMesh);

  const sprout = new THREE.Group();
  sprout.position.set(0.1, 0.24, 0.02);
  const stem = tube([[0, 0, 0], [0.005, 0.04, 0], [0.012, 0.075, 0]], 0.008, tealDark);
  const leafA = sphere(0.045, leaf, 0.55, 1, 0.25);
  leafA.position.set(-0.03, 0.09, 0);
  leafA.rotation.z = 0.7;
  const leafB = sphere(0.04, leaf, 0.55, 1, 0.25);
  leafB.position.set(0.045, 0.085, 0);
  leafB.rotation.z = -0.7;
  sprout.add(stem, leafA, leafB);
  hatG.add(sprout);
  head.add(hatG);

  root.add(head);

  return {
    root, body: torso, head, armR, armL, sprout, faceCanvas, faceTexture,
    textures: [faceTexture, band],
  };
}

/** A soft round shadow under the feet, drawn once. */
function shadowDisc(): THREE.Mesh {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  g.addColorStop(0, 'rgba(8,40,44,0.32)');
  g.addColorStop(1, 'rgba(8,40,44,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  const disc = new THREE.Mesh(
    new THREE.PlaneGeometry(0.7, 0.7),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
  );
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.002;
  return disc;
}

// ---------------------------------------------------------------------------
// The component
// ---------------------------------------------------------------------------

export function ChivarBot3D({
  mood, waving, height, label, still, onReady, onFail,
}: {
  mood: BotMood;
  waving: boolean;
  height: number;
  label: string;
  /** Reduce-motion: he holds his pose and nothing loops. */
  still: boolean;
  /** The first frame is on screen - the drawn stand-in can go. */
  onReady?: () => void;
  /** No WebGL here; leave the drawn one where it is. */
  onFail?: () => void;
}) {
  const host = React.useRef<HTMLDivElement | null>(null);
  const moodRef = React.useRef(mood);
  const wavingRef = React.useRef(waving);
  moodRef.current = mood;
  wavingRef.current = waving;

  React.useEffect(() => {
    const el = host.current;
    if (!el) return undefined;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    } catch {
      onFail?.();
      return undefined;
    }
    const width = el.clientWidth || height;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.setClearColor(0x000000, 0);
    const canvas = renderer.domElement;
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', label);
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = `${height}px`;
    // Vertical drags still scroll the chat; horizontal ones turn him.
    canvas.style.touchAction = 'pan-y';
    canvas.style.cursor = 'grab';
    el.appendChild(canvas);

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = environment;
    pmrem.dispose();
    scene.add(new THREE.HemisphereLight(0xe8f8ff, 0xd8c9a8, 0.55));
    const key = new THREE.DirectionalLight(0xfff2dd, 1.0);
    key.position.set(1.6, 2.6, 2.4);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xd6f2f6, 0.4);
    fill.position.set(-2, 1.1, -1.4);
    scene.add(fill);

    const camera = new THREE.PerspectiveCamera(28, width / height, 0.1, 30);
    camera.position.set(0, 0.62, 2.85);
    camera.lookAt(0, 0.56, 0);

    const bot = buildBot();
    const floor = shadowDisc();
    scene.add(bot.root, floor);

    const faceCtx = bot.faceCanvas.getContext('2d')!;
    let drawnFace = '';
    const paintFace = (parts: ReturnType<typeof faceParts>) => {
      const k = faceKey(parts);
      if (k === drawnFace) return;
      drawnFace = k;
      drawFace(faceCtx, parts);
      bot.faceTexture.needsUpdate = true;
    };

    // --- State the loop reads -------------------------------------------------
    let yaw = 0;
    let targetYaw = 0;
    let held = false;
    let pressX = 0;
    let pressYaw = 0;
    let moved = 0;
    let releasedAt = -1e9;
    let tappedAt = -1e9;
    let look = { yaw: 0, pitch: 0 };
    let nextBlink = 1.8;
    let blinkUntil = 0;

    const now = () => performance.now();

    const onDown = (e: PointerEvent) => {
      held = true;
      pressX = e.clientX;
      pressYaw = targetYaw;
      moved = 0;
      canvas.style.cursor = 'grabbing';
      canvas.setPointerCapture?.(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      if (held) {
        const dx = e.clientX - pressX;
        moved = Math.max(moved, Math.abs(dx));
        targetYaw = dragYaw(pressYaw, dx, rect.width);
      } else {
        look = lookAt(((e.clientX - rect.left) / rect.width) * 2 - 1, ((e.clientY - rect.top) / rect.height) * 2 - 1);
      }
    };
    const onUp = (e: PointerEvent) => {
      if (!held) return;
      held = false;
      canvas.style.cursor = 'grab';
      canvas.releasePointerCapture?.(e.pointerId);
      releasedAt = now();
      if (moved < TAP_SLOP_PX) tappedAt = now();
    };
    const onLeave = () => { look = { yaw: 0, pitch: 0 }; };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('pointerleave', onLeave);

    let frame = 0;
    let alive = true;
    let last = now();
    let readySent = false;
    const start = last;

    const draw = () => {
      if (!alive) return;
      const t0 = now();
      const dt = Math.min(0.05, (t0 - last) / 1000);
      last = t0;
      const t = (t0 - start) / 1000;
      const motion = still ? 0 : 1;

      // Turning: follow the finger while held, settle home afterwards.
      targetYaw = restingYaw(targetYaw, t0 - releasedAt, held);
      yaw = held ? targetYaw : approach(yaw, targetYaw, dt, 7);

      const pose = idlePose(t, motion);
      const hop = still ? reaction(-1) : reaction(t0 - tappedAt);

      bot.root.rotation.y = yaw + look.yaw * 0.35;
      bot.root.position.y = pose.bob + hop.hop;
      bot.root.scale.set(1 / Math.sqrt(hop.squash), hop.squash, 1 / Math.sqrt(hop.squash));
      bot.body.scale.y = pose.breathe;

      bot.head.rotation.z = pose.headTilt;
      bot.head.rotation.y = approach(bot.head.rotation.y, look.yaw * 0.65, dt, 5);
      bot.head.rotation.x = approach(bot.head.rotation.x, look.pitch, dt, 5);
      bot.sprout.rotation.z = pose.sprout;

      // The right arm waves on request, and during a tap's grin.
      const waveNow = wavingRef.current || hop.grinning;
      const armTarget = waveNow && !still ? waveAngle(t) : ARM_REST;
      bot.armR.rotation.z = approach(bot.armR.rotation.z, armTarget, dt, 10);
      bot.armL.rotation.z = -ARM_REST;

      // Blink every few seconds.
      const ts = t;
      if (!still && ts > nextBlink) { blinkUntil = ts + 0.13; nextBlink = ts + 2.4 + Math.random() * 2.6; }
      const blinking = ts < blinkUntil;
      const faceMood: BotMood = hop.grinning ? 'playful' : moodRef.current;
      paintFace(faceParts(faceMood, blinking));

      renderer.render(scene, camera);
      if (!readySent) { readySent = true; onReady?.(); }
      if (still) return; // one frame is the whole of a still pose
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);

    // A still bot still answers a mood change: redraw on demand.
    const repaintStill = window.setInterval(() => { if (still && alive) { frame = requestAnimationFrame(draw); } }, 400);

    const onResize = () => {
      const w = el.clientWidth || height;
      renderer.setSize(w, height);
      camera.aspect = w / height;
      camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', onResize);

    return () => {
      alive = false;
      cancelAnimationFrame(frame);
      window.clearInterval(repaintStill);
      window.removeEventListener('resize', onResize);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('pointerleave', onLeave);
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry.dispose();
        const m = mesh.material;
        // Shared materials from `mat()` are cached across scenes; only the
        // ones this file made for itself are disposed here.
        if (Array.isArray(m)) return;
        if ((m as THREE.MeshBasicMaterial).map) (m as THREE.MeshBasicMaterial).map?.dispose();
      });
      bot.textures.forEach((tx) => tx.dispose());
      environment.dispose();
      renderer.dispose();
      if (canvas.parentNode === el) el.removeChild(canvas);
    };
  }, [height, label, still, onReady, onFail]);

  return <div ref={host} style={{ width: '100%', height }} />;
}
