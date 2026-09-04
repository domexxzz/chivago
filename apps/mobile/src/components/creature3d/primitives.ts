/**
 * Small builders. Every animal - the five Samui species and the seventy-seven
 * mascots - is made of these and nothing else: a sphere, a capsule, a cone,
 * a cylinder, a tube along a curve, two eyes with catchlights, and a group.
 * Placed by numbers a person can read and change. No model file, for the
 * reason `Creature3D.tsx` gives.
 */

import * as THREE from 'three';

export type Mat = THREE.MeshStandardMaterial;

export const matCache = new Map<string, Mat>();
export function mat(hex: string, opts: Partial<{ roughness: number; metalness: number; emissive: string; emissiveIntensity: number; flat: boolean }> = {}): Mat {
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

export const shadowed = <T extends THREE.Object3D>(o: T): T => { o.castShadow = true; o.receiveShadow = true; return o; };

/**
 * A soft round dot for the particles. Without a map a point is a square, and
 * a firefly is not a square. Drawn once on a tiny canvas: no asset to ship.
 */
let dotTexture: THREE.Texture | null = null;
export function softDot(): THREE.Texture {
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

export function sphere(r: number, m: Mat, sx = 1, sy = 1, sz = 1): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 28, 20), m);
  mesh.scale.set(sx, sy, sz);
  return shadowed(mesh);
}
export function capsule(r: number, len: number, m: Mat): THREE.Mesh {
  return shadowed(new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 6, 16), m));
}
export function cone(r: number, h: number, m: Mat, segs = 20): THREE.Mesh {
  return shadowed(new THREE.Mesh(new THREE.ConeGeometry(r, h, segs), m));
}
export function cylinder(rTop: number, rBottom: number, h: number, m: Mat, segs = 14): THREE.Mesh {
  return shadowed(new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, segs), m));
}
export function tube(points: [number, number, number][], r: number, m: Mat, taper = false): THREE.Mesh {
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
export function group(...children: THREE.Object3D[]): THREE.Group {
  const g = new THREE.Group();
  for (const c of children) g.add(c);
  return g;
}
export const at = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): T => {
  o.position.set(x, y, z);
  o.rotation.set(rx, ry, rz);
  return o;
};

/** Two eyes with catchlights. The catchlight is what makes it look back. */
export function eyes(r: number, spread: number, y: number, z: number, m: Mat): { group: THREE.Group; lids: THREE.Mesh[] } {
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

export interface Rig {
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
