/**
 * The landmarks, as shapes rather than boxes.
 *
 * WHAT THIS IS. docs/76 says the eight heroes have to be modelled, and that
 * the test of one is whether its silhouette reads when it is twelve pixels
 * tall. This file builds each of them out of primitives, in code, from the
 * palette the document sets - a stand-in good enough to judge a composition
 * by, and a specification of the silhouette for whoever models it properly.
 *
 * WHY NOT AN ASSET PACK. Two reasons. The repository is public, so anything
 * here has to be CC0 or made here; and docs/76 is explicit that a generic
 * Thai temple in place of Wat Atsadang Nimit - which is a white European dome
 * on a hill - is wrong to anyone who has been there. A shape built from a
 * description of the real building is closer than a bought one of the wrong
 * building.
 *
 * WHAT IT IS NOT. Not the art. Every roof here is flat planes and every curve
 * is eight segments. It carries the proportions, the colour and the stance;
 * an artist carries everything else.
 */

/* ------------------------------------------------------------ solids -- */

const push = (out, p, normal, colour) => {
  out.positions.push(p[0], p[1], p[2]);
  out.normals.push(normal[0], normal[1], normal[2]);
  out.colours.push(colour[0], colour[1], colour[2]);
};

/** One flat triangle, its normal computed from its own winding. */
export function tri(out, a, b, c, colour) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  let nx = uy * vz - uz * vy;
  let ny = uz * vx - ux * vz;
  let nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz) || 1;
  const n = [nx / len, ny / len, nz / len];
  push(out, a, n, colour);
  push(out, b, n, colour);
  push(out, c, n, colour);
}

export const quad = (out, a, b, c, d, colour) => {
  tri(out, a, b, c, colour);
  tri(out, a, c, d, colour);
};

/** An axis-aligned box standing on y. */
export function box(out, { x = 0, y = 0, z = 0, w, d, h, colour }) {
  const hw = w / 2;
  const hd = d / 2;
  const p = [
    [x - hw, y, z - hd], [x + hw, y, z - hd], [x + hw, y, z + hd], [x - hw, y, z + hd],
    [x - hw, y + h, z - hd], [x + hw, y + h, z - hd], [x + hw, y + h, z + hd], [x - hw, y + h, z + hd],
  ];
  quad(out, p[4], p[5], p[6], p[7], colour);
  quad(out, p[3], p[2], p[1], p[0], colour);
  quad(out, p[0], p[1], p[5], p[4], colour);
  quad(out, p[2], p[3], p[7], p[6], colour);
  quad(out, p[1], p[2], p[6], p[5], colour);
  quad(out, p[3], p[0], p[4], p[7], colour);
}

/**
 * A gable roof: two slopes and two gable ends, ridge running along Z.
 *
 * `overhang` is what makes a Thai roof read as one: the eaves reach well past
 * the wall, and the shadow under them is most of the silhouette.
 */
export function gableRoof(out, { x = 0, y, z = 0, w, d, h, colour, overhang = 0 }) {
  const hw = w / 2 + overhang;
  const hd = d / 2 + overhang;
  const ridge = [[x, y + h, z - hd], [x, y + h, z + hd]];
  const eaves = [
    [x - hw, y, z - hd], [x + hw, y, z - hd], [x + hw, y, z + hd], [x - hw, y, z + hd],
  ];
  quad(out, eaves[0], ridge[0], ridge[1], eaves[3], colour);
  quad(out, eaves[1], eaves[2], ridge[1], ridge[0], colour);
  tri(out, eaves[0], eaves[1], ridge[0], colour);
  tri(out, eaves[2], eaves[3], ridge[1], colour);
}

/** A roof that rises to a point on a square plan. */
export function pyramidRoof(out, { x = 0, y, z = 0, w, d, h, colour, overhang = 0 }) {
  const hw = w / 2 + overhang;
  const hd = d / 2 + overhang;
  const apex = [x, y + h, z];
  const base = [
    [x - hw, y, z - hd], [x + hw, y, z - hd], [x + hw, y, z + hd], [x - hw, y, z + hd],
  ];
  for (let i = 0; i < 4; i += 1) tri(out, base[i], base[(i + 1) % 4], apex, colour);
}

/** An n-sided prism. `taper` < 1 narrows it towards the top. */
export function cylinder(out, { x = 0, y, z = 0, r, h, colour, sides = 8, taper = 1, cap = true }) {
  const ring = (radius, height) => Array.from({ length: sides }, (unused, i) => {
    const a = (i / sides) * Math.PI * 2;
    return [x + Math.cos(a) * radius, height, z + Math.sin(a) * radius];
  });
  const low = ring(r, y);
  const high = ring(r * taper, y + h);
  for (let i = 0; i < sides; i += 1) {
    const j = (i + 1) % sides;
    quad(out, low[i], low[j], high[j], high[i], colour);
  }
  if (cap) for (let i = 1; i < sides - 1; i += 1) tri(out, high[0], high[i], high[i + 1], colour);
}

/** A cone, for a spire or a finial. */
export function cone(out, { x = 0, y, z = 0, r, h, colour, sides = 8 }) {
  const apex = [x, y + h, z];
  for (let i = 0; i < sides; i += 1) {
    const a = (i / sides) * Math.PI * 2;
    const b = ((i + 1) / sides) * Math.PI * 2;
    tri(out, [x + Math.cos(a) * r, y, z + Math.sin(a) * r], [x + Math.cos(b) * r, y, z + Math.sin(b) * r], apex, colour);
  }
}

/** A hemisphere, in two rings. Eight segments is the style, not a shortcut. */
export function dome(out, { x = 0, y, z = 0, r, colour, sides = 8, rings = 3 }) {
  const at = (ring, i) => {
    const phi = (ring / rings) * (Math.PI / 2);
    const a = (i / sides) * Math.PI * 2;
    return [x + Math.cos(a) * r * Math.cos(phi), y + r * Math.sin(phi), z + Math.sin(a) * r * Math.cos(phi)];
  };
  for (let ring = 0; ring < rings; ring += 1) {
    for (let i = 0; i < sides; i += 1) {
      const j = (i + 1) % sides;
      if (ring === rings - 1) tri(out, at(ring, i), at(ring, j), [x, y + r, z], colour);
      else quad(out, at(ring, i), at(ring, j), at(ring + 1, j), at(ring + 1, i), colour);
    }
  }
}

/* ----------------------------------------------------------- palette -- */

/** docs/76. Saturated colour is reserved for the heroes. */
export const C = {
  plaster: [0.95, 0.94, 0.90],
  teak: [0.54, 0.35, 0.20],
  roof: [0.77, 0.27, 0.17],
  gold: [0.89, 0.65, 0.17],
  palace: [0.50, 0.72, 0.66],
  stone: [0.60, 0.64, 0.65],
  rock: [0.48, 0.50, 0.49],
  deck: [0.72, 0.66, 0.54],
  tin: [0.66, 0.70, 0.72],
};

/* --------------------------------------------------------- archetypes --

  Each takes the anchor and a scale, and builds upward from y. The sizes are
  in metres before docs/76's class multiplier, so the proportions stay true
  whatever the multiplier becomes.
*/

/** A Thai ubosot: walls, a deep tiered roof, gold at the ridge ends. */
export function thaiTemple(out, { x, y, z, s = 1 }) {
  box(out, { x, y, z, w: 14 * s, d: 22 * s, h: 7 * s, colour: C.plaster });
  gableRoof(out, { x, y: y + 7 * s, z, w: 14 * s, d: 22 * s, h: 5 * s, colour: C.roof, overhang: 2.5 * s });
  gableRoof(out, { x, y: y + 10 * s, z, w: 9 * s, d: 15 * s, h: 4 * s, colour: C.roof, overhang: 1.5 * s });
  for (const end of [-1, 1]) {
    cone(out, { x, y: y + 12 * s, z: z + end * 11 * s, r: 0.8 * s, h: 4 * s, colour: C.gold, sides: 6 });
  }
  box(out, { x, y, z: z + 13 * s, w: 8 * s, d: 4 * s, h: 1.2 * s, colour: C.stone });
}

/** A Chinese shrine on a hillside: terrace, red hall, flag poles. */
export function chineseShrine(out, { x, y, z, s = 1 }) {
  box(out, { x, y, z, w: 26 * s, d: 20 * s, h: 2 * s, colour: C.stone });
  box(out, { x, y: y + 2 * s, z, w: 18 * s, d: 14 * s, h: 6 * s, colour: C.roof });
  gableRoof(out, { x, y: y + 8 * s, z, w: 18 * s, d: 14 * s, h: 4 * s, colour: C.gold, overhang: 3 * s });
  for (const side of [-1, 1]) {
    cylinder(out, { x: x + side * 11 * s, y, z: z + 11 * s, r: 0.5 * s, h: 14 * s, colour: C.roof, sides: 6, cap: false });
    box(out, { x: x + side * 7 * s, y: y + 2 * s, z: z + 9 * s, w: 3 * s, d: 3 * s, h: 4 * s, colour: C.gold });
  }
}

/** The mondop: a square base under a tiered golden roof and a spire. */
export function mondop(out, { x, y, z, s = 1 }) {
  box(out, { x, y, z, w: 10 * s, d: 10 * s, h: 1.5 * s, colour: C.stone });
  box(out, { x, y: y + 1.5 * s, z, w: 8 * s, d: 8 * s, h: 5 * s, colour: C.plaster });
  pyramidRoof(out, { x, y: y + 6.5 * s, z, w: 8 * s, d: 8 * s, h: 2.5 * s, colour: C.gold, overhang: 1.5 * s });
  pyramidRoof(out, { x, y: y + 8.5 * s, z, w: 5.5 * s, d: 5.5 * s, h: 2.5 * s, colour: C.gold, overhang: 1 * s });
  cone(out, { x, y: y + 11 * s, z, r: 1.4 * s, h: 6 * s, colour: C.gold, sides: 6 });
}

/** Wat Atsadang Nimit: a white round ubosot with a dome, and its chedi. */
export function domeChapel(out, { x, y, z, s = 1 }) {
  cylinder(out, { x, y, z, r: 5 * s, h: 7 * s, colour: C.plaster, sides: 10, cap: false });
  dome(out, { x, y: y + 7 * s, z, r: 5 * s, colour: C.plaster, sides: 10 });
  cone(out, { x, y: y + 12 * s, z, r: 1 * s, h: 3 * s, colour: C.plaster, sides: 6 });
  cylinder(out, { x: x + 9 * s, y, z, r: 3 * s, h: 4 * s, colour: C.plaster, sides: 8, taper: 0.7 });
  cone(out, { x: x + 9 * s, y: y + 4 * s, z, r: 2.2 * s, h: 7 * s, colour: C.plaster, sides: 8 });
}

/** A lighthouse: tapered tower, gallery, lantern. */
export function lighthouse(out, { x, y, z, s = 1 }) {
  box(out, { x, y, z, w: 9 * s, d: 9 * s, h: 2.5 * s, colour: C.plaster });
  cylinder(out, { x, y: y + 2.5 * s, z, r: 2.6 * s, h: 11 * s, colour: C.plaster, sides: 10, taper: 0.72, cap: false });
  cylinder(out, { x, y: y + 13.5 * s, z, r: 3 * s, h: 1 * s, colour: C.roof, sides: 10 });
  cylinder(out, { x, y: y + 14.5 * s, z, r: 1.8 * s, h: 2.5 * s, colour: C.gold, sides: 8, cap: false });
  cone(out, { x, y: y + 17 * s, z, r: 2.2 * s, h: 2.5 * s, colour: C.roof, sides: 8 });
}

/** The palace: several teak houses on low stilts, roofs in its own green. */
export function palace(out, { x, y, z, s = 1 }) {
  const house = (dx, dz, w, d) => {
    for (const ox of [-1, 1]) {
      for (const oz of [-1, 1]) {
        box(out, { x: x + dx + ox * (w / 2 - 1) * s, y, z: z + dz + oz * (d / 2 - 1) * s, w: 1 * s, d: 1 * s, h: 2 * s, colour: C.teak });
      }
    }
    box(out, { x: x + dx, y: y + 2 * s, z: z + dz, w: w * s, d: d * s, h: 4.5 * s, colour: C.palace });
    gableRoof(out, { x: x + dx, y: y + 6.5 * s, z: z + dz, w: w * s, d: d * s, h: 3 * s, colour: C.plaster, overhang: 1.8 * s });
  };
  house(-9 * s, 0, 12, 9);
  house(6 * s, 2 * s, 10, 8);
  house(1 * s, -10 * s, 8, 7);
}

/** The marine museum: one long institutional block, flat and modern. */
export function museum(out, { x, y, z, s = 1 }) {
  box(out, { x, y, z, w: 26 * s, d: 11 * s, h: 6 * s, colour: C.plaster });
  box(out, { x, y: y + 6 * s, z, w: 28 * s, d: 13 * s, h: 0.8 * s, colour: C.stone });
  box(out, { x, y, z: z + 7 * s, w: 9 * s, d: 3 * s, h: 4 * s, colour: C.stone });
}

/** A pier: deck on piles, running out to sea along Z. */
export function pier(out, { x, y, z, s = 1, length = 60 }) {
  const len = length * s;
  box(out, { x, y: y + 2.2 * s, z, w: 5 * s, d: len, h: 0.6 * s, colour: C.deck });
  const piles = Math.max(2, Math.round(len / (8 * s)));
  for (let i = 0; i <= piles; i += 1) {
    const pz = z - len / 2 + (len * i) / piles;
    for (const side of [-1, 1]) {
      box(out, { x: x + side * 2 * s, y: y - 1 * s, z: pz, w: 0.7 * s, d: 0.7 * s, h: 3.2 * s, colour: C.teak });
    }
  }
}

/** A cave monastery: huts under a rock shoulder. */
export function caveMonastery(out, { x, y, z, s = 1 }) {
  dome(out, { x: x - 6 * s, y, z: z - 4 * s, r: 8 * s, colour: C.rock, sides: 8, rings: 2 });
  for (const [dx, dz] of [[4, 2], [9, -3], [6, 8]]) {
    box(out, { x: x + dx * s, y, z: z + dz * s, w: 5 * s, d: 5 * s, h: 3 * s, colour: C.plaster });
    gableRoof(out, { x: x + dx * s, y: y + 3 * s, z: z + dz * s, w: 5 * s, d: 5 * s, h: 2 * s, colour: C.roof, overhang: 1 * s });
  }
}

/** Anything else with a roof: the shape of an ordinary building here. */
export function ordinaryBuilding(out, { x, y, z, s = 1 }) {
  box(out, { x, y, z, w: 9 * s, d: 11 * s, h: 4.5 * s, colour: C.plaster });
  gableRoof(out, { x, y: y + 4.5 * s, z, w: 9 * s, d: 11 * s, h: 2.2 * s, colour: C.tin, overhang: 0.8 * s });
}

/** A rock in the sea, for an island that is not this island. */
export function islet(out, { x, y, z, s = 1 }) {
  dome(out, { x, y, z, r: 9 * s, colour: C.rock, sides: 8, rings: 2 });
}

/**
 * Which shape each record gets.
 *
 * By id, never by reading the name: a record called "Shop row by Tha Lang
 * pier" once became a jetty that way.
 */
export const ARCHETYPES = {
  'sc-palace': palace,
  'sc-wat-atsadang': domeChapel,
  'sc-chao-pho-khao-yai': chineseShrine,
  'sc-buddha-footprint': mondop,
  'sc-wat-tham-yai-prik': caveMonastery,
  'sc-marinestation': museum,
  'sc-atsadang-bridge': pier,
  'sc-pier': pier,
  'sc-ko-kham-yai': islet,
};

export const archetypeFor = (id) => ARCHETYPES[id] ?? ordinaryBuilding;

/** Every landmark, built where its anchor stands. */
export function buildLandmarks(anchors, scaleFor) {
  const out = { positions: [], normals: [], colours: [] };
  for (const anchor of anchors) {
    archetypeFor(anchor.id)(out, {
      x: anchor.x, y: anchor.y, z: anchor.z, s: scaleFor(anchor),
    });
  }
  return {
    positions: Float32Array.from(out.positions),
    normals: Float32Array.from(out.normals),
    colours: Float32Array.from(out.colours),
    triangles: out.positions.length / 9,
  };
}
