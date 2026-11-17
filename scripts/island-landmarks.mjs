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
  /*
    WOUND THE OTHER WAY, AND IT SHOWED UNDER A REAL LIGHT RIG.

    Every face in this file was written with the opposite convention, so each
    normal pointed INTO the building. Under a flat Lambert with a floor it
    only looked a little dull; under the sun, sky and sea of docs/76 the roofs
    came out near black, because a roof facing down gets nothing but the sea
    bounce. The normal is flipped and the winding reversed with it, so a
    renderer that culls back faces sees the building rather than its inside.
  */
  const n = [-nx / len, -ny / len, -nz / len];
  push(out, a, n, colour);
  push(out, c, n, colour);
  push(out, b, n, colour);
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

/* ------------------------------------------------------------ parts --

  Pieces that appear on more than one building. A railing is a railing
  whether it runs round a lighthouse gallery or along a pier.
*/

/** A row of posts along Z, or along X when `axis` says so. */
export function posts(out, { x, y, z, span, count, r = 0.18, h, colour, axis = 'z' }) {
  for (let i = 0; i <= count; i += 1) {
    const t = -span / 2 + (span * i) / count;
    box(out, {
      x: axis === 'z' ? x : x + t,
      y,
      z: axis === 'z' ? z + t : z,
      w: r * 2, d: r * 2, h, colour,
    });
  }
}

/** A rail on top of those posts. */
export const rail = (out, { x, y, z, w, d, colour }) =>
  box(out, { x, y, z, w, d, h: 0.22, colour });

/** Steps up to a platform, running out along +Z. */
export function steps(out, { x, y, z, w, count = 4, rise = 0.5, run = 0.9, colour }) {
  for (let i = 0; i < count; i += 1) {
    box(out, {
      x, y: y + i * rise, z: z + (count - i) * run,
      w, d: run * (i + 1), h: rise, colour,
    });
  }
}

/** A recessed dark band: what a window row reads as at this size. */
export const windowBand = (out, { x, y, z, w, d, h, colour = [0.22, 0.26, 0.30] }) =>
  box(out, { x, y, z, w, d, h, colour });

/** A column under an eave. Six sides, because four reads as a post. */
export const column = (out, { x, y, z, r = 0.45, h, colour }) =>
  cylinder(out, { x, y, z, r, h, colour, sides: 6, taper: 0.88, cap: false });

/**
 * A chofa: the horn at the end of a Thai roof ridge.
 *
 * Three tapering segments leaning back. It is the single most recognisable
 * thing on the skyline of a wat, and the reason a Thai temple does not read
 * as a barn at twelve pixels.
 */
export function chofa(out, { x, y, z, s = 1, lean = 1, colour }) {
  let cx = x;
  let cy = y;
  let r = 0.55 * s;
  for (let i = 0; i < 3; i += 1) {
    const h = 1.5 * s * (1 - i * 0.18);
    cylinder(out, { x: cx, y: cy, z, r, h, colour, sides: 5, taper: 0.62, cap: i === 2 });
    cy += h;
    cx += 0.35 * s * lean * (i + 1);
    r *= 0.62;
  }
}

/** The fins down the edge of a Thai roof. Small, and the eye counts them. */
export function baiRaka(out, { x, y, z, d, h, count, colour, side }) {
  for (let i = 0; i < count; i += 1) {
    const t = -d / 2 + (d * (i + 0.5)) / count;
    const drop = (i / count) * h * 0.5;
    box(out, { x: x + side * 0.1, y: y + h - drop - 0.5, z: z + t, w: 0.25, d: 0.5, h: 0.9, colour });
  }
}

/* --------------------------------------------------------- archetypes --

  Each takes the anchor and a scale, and builds upward from y. Sizes are in
  metres before docs/76's class multiplier, so the proportions hold whatever
  the multiplier becomes.

  The detail here is what makes a silhouette: eaves that overhang far enough
  to throw a shadow, columns under them, a base the building stands on rather
  than sits in, and a finial where the real building has one.
*/

/** A Thai ubosot: stepped base, columns, three roofs, chofa, bai raka. */
export function thaiTemple(out, { x, y, z, s = 1 }) {
  box(out, { x, y, z, w: 20 * s, d: 28 * s, h: 1.1 * s, colour: C.stone });
  box(out, { x, y: y + 1.1 * s, z, w: 17 * s, d: 25 * s, h: 0.9 * s, colour: C.plaster });
  const base = y + 2 * s;

  box(out, { x, y: base, z, w: 12 * s, d: 20 * s, h: 6.5 * s, colour: C.plaster });
  windowBand(out, { x: x - 6.1 * s, y: base + 2.6 * s, z, w: 0.3 * s, d: 14 * s, h: 2.4 * s });
  windowBand(out, { x: x + 6.1 * s, y: base + 2.6 * s, z, w: 0.3 * s, d: 14 * s, h: 2.4 * s });
  windowBand(out, { x, y: base, z: z + 10.1 * s, w: 3 * s, d: 0.3 * s, h: 4.6 * s, colour: C.teak });

  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i += 1) {
      column(out, {
        x: x + side * 7.4 * s,
        y: base,
        z: z - 8 * s + (16 * s * i) / 3,
        r: 0.5 * s, h: 7.4 * s, colour: C.plaster,
      });
    }
  }

  gableRoof(out, { x, y: base + 7.4 * s, z, w: 15 * s, d: 21 * s, h: 3.6 * s, colour: C.roof, overhang: 2.2 * s });
  gableRoof(out, { x, y: base + 9.6 * s, z, w: 11 * s, d: 16 * s, h: 3.2 * s, colour: C.roof, overhang: 1.6 * s });
  gableRoof(out, { x, y: base + 11.8 * s, z, w: 7 * s, d: 11 * s, h: 2.8 * s, colour: C.roof, overhang: 1.2 * s });

  for (const side of [-1, 1]) {
    baiRaka(out, { x: x + side * 8.6 * s, y: base + 7.4 * s, z, d: 21 * s, h: 3.6 * s, count: 7, colour: C.gold, side });
  }
  for (const end of [-1, 1]) {
    chofa(out, { x, y: base + 14.6 * s, z: z + end * 5.5 * s, s, lean: end, colour: C.gold });
  }
  steps(out, { x, y, z: z + 14 * s, w: 7 * s, count: 3, rise: 0.7 * s, run: 1.1 * s, colour: C.stone });
}

/** Chao Pho Khao Yai: terrace, red hall, gold upturned roof, flag poles. */
export function chineseShrine(out, { x, y, z, s = 1 }) {
  box(out, { x, y, z, w: 30 * s, d: 24 * s, h: 1.6 * s, colour: C.stone });
  box(out, { x, y: y + 1.6 * s, z, w: 27 * s, d: 21 * s, h: 0.7 * s, colour: C.plaster });
  const base = y + 2.3 * s;

  box(out, { x, y: base, z, w: 19 * s, d: 14 * s, h: 6.5 * s, colour: C.roof });
  windowBand(out, { x, y: base, z: z + 7.1 * s, w: 4 * s, d: 0.3 * s, h: 4.6 * s, colour: C.gold });
  for (const side of [-1, 1]) {
    for (const row of [-1, 1]) {
      column(out, { x: x + side * 8.2 * s, y: base, z: z + row * 5.5 * s, r: 0.6 * s, h: 7 * s, colour: C.roof });
    }
  }

  // Two roofs, the upper set back: how an upturned eave reads at this size.
  gableRoof(out, { x, y: base + 7 * s, z, w: 20 * s, d: 15 * s, h: 2.6 * s, colour: C.gold, overhang: 3.4 * s });
  gableRoof(out, { x, y: base + 9 * s, z, w: 14 * s, d: 11 * s, h: 2.6 * s, colour: C.gold, overhang: 2.2 * s });
  box(out, { x, y: base + 11.3 * s, z, w: 1.2 * s, d: 11 * s, h: 0.9 * s, colour: C.roof });
  for (const end of [-1, 1]) {
    cone(out, { x, y: base + 12.2 * s, z: z + end * 5 * s, r: 0.9 * s, h: 2.6 * s, colour: C.roof, sides: 6 });
  }

  for (const side of [-1, 1]) {
    cylinder(out, { x: x + side * 12.5 * s, y, z: z + 12 * s, r: 0.4 * s, h: 17 * s, colour: C.roof, sides: 6, taper: 0.7, cap: false });
    cone(out, { x: x + side * 12.5 * s, y: y + 17 * s, z: z + 12 * s, r: 0.7 * s, h: 1.6 * s, colour: C.gold, sides: 6 });
    box(out, { x: x + side * 7.5 * s, y: y + 1.6 * s, z: z + 10.5 * s, w: 2.6 * s, d: 2.6 * s, h: 3.4 * s, colour: C.stone });
  }
  steps(out, { x, y, z: z + 13 * s, w: 10 * s, count: 4, rise: 0.45 * s, run: 1.1 * s, colour: C.stone });
}

/** The mondop: lotus base, columns, tiered gold roof, a bud for a spire. */
export function mondop(out, { x, y, z, s = 1 }) {
  box(out, { x, y, z, w: 13 * s, d: 13 * s, h: 1.2 * s, colour: C.stone });
  box(out, { x, y: y + 1.2 * s, z, w: 11 * s, d: 11 * s, h: 0.8 * s, colour: C.plaster });
  const base = y + 2 * s;

  box(out, { x, y: base, z, w: 8 * s, d: 8 * s, h: 5 * s, colour: C.plaster });
  windowBand(out, { x, y: base, z: z + 4.1 * s, w: 2.6 * s, d: 0.3 * s, h: 3.6 * s, colour: C.gold });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      column(out, { x: x + sx * 4.6 * s, y: base, z: z + sz * 4.6 * s, r: 0.42 * s, h: 5.6 * s, colour: C.plaster });
    }
  }

  pyramidRoof(out, { x, y: base + 5.6 * s, z, w: 9 * s, d: 9 * s, h: 2.2 * s, colour: C.gold, overhang: 1.6 * s });
  pyramidRoof(out, { x, y: base + 7.2 * s, z, w: 6.4 * s, d: 6.4 * s, h: 2 * s, colour: C.gold, overhang: 1.1 * s });
  pyramidRoof(out, { x, y: base + 8.8 * s, z, w: 4.2 * s, d: 4.2 * s, h: 1.8 * s, colour: C.gold, overhang: 0.7 * s });

  // A lotus bud: three rings narrowing, then the point.
  let sy = base + 10.4 * s;
  let r = 1.5 * s;
  for (let i = 0; i < 3; i += 1) {
    cylinder(out, { x, y: sy, z, r, h: 1.1 * s, colour: C.gold, sides: 8, taper: 0.72, cap: false });
    sy += 1.1 * s;
    r *= 0.72;
  }
  cone(out, { x, y: sy, z, r: r * 1.1, h: 3.4 * s, colour: C.gold, sides: 8 });
}

/** Wat Atsadang Nimit: the white round ubosot, its dome, and the chedi. */
export function domeChapel(out, { x, y, z, s = 1 }) {
  box(out, { x, y, z, w: 13 * s, d: 13 * s, h: 1 * s, colour: C.stone });
  const base = y + 1 * s;

  cylinder(out, { x, y: base, z, r: 5 * s, h: 7 * s, colour: C.plaster, sides: 12, cap: false });
  // Pilasters round the drum, which is what gives it its vertical rhythm.
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    box(out, {
      x: x + Math.cos(a) * 4.9 * s, y: base, z: z + Math.sin(a) * 4.9 * s,
      w: 0.8 * s, d: 0.8 * s, h: 7 * s, colour: C.plaster,
    });
  }
  windowBand(out, { x, y: base, z: z + 4.9 * s, w: 2.4 * s, d: 0.4 * s, h: 4.4 * s, colour: C.teak });
  cylinder(out, { x, y: base + 7 * s, z, r: 5.6 * s, h: 0.7 * s, colour: C.stone, sides: 12 });
  dome(out, { x, y: base + 7.7 * s, z, r: 4.6 * s, colour: C.plaster, sides: 12, rings: 4 });
  cylinder(out, { x, y: base + 12 * s, z, r: 0.9 * s, h: 1.4 * s, colour: C.plaster, sides: 8, cap: false });
  cone(out, { x, y: base + 13.4 * s, z, r: 1.1 * s, h: 2.6 * s, colour: C.gold, sides: 8 });

  // The chedi beside it: square base, bell, rings, spire.
  const cx = x + 11 * s;
  box(out, { x: cx, y, z, w: 7 * s, d: 7 * s, h: 1.4 * s, colour: C.stone });
  box(out, { x: cx, y: y + 1.4 * s, z, w: 5.6 * s, d: 5.6 * s, h: 1.2 * s, colour: C.plaster });
  cylinder(out, { x: cx, y: y + 2.6 * s, z, r: 2.6 * s, h: 3.4 * s, colour: C.plaster, sides: 10, taper: 0.8, cap: false });
  let ry = y + 6 * s;
  let rr = 2 * s;
  for (let i = 0; i < 3; i += 1) {
    cylinder(out, { x: cx, y: ry, z, r: rr, h: 0.7 * s, colour: C.plaster, sides: 10, taper: 0.82, cap: false });
    ry += 0.7 * s;
    rr *= 0.82;
  }
  cone(out, { x: cx, y: ry, z, r: rr, h: 6 * s, colour: C.plaster, sides: 10 });
}

/** The customs lighthouse: keeper's house, tower, gallery, lantern. */
export function lighthouse(out, { x, y, z, s = 1 }) {
  box(out, { x: x - 6 * s, y, z, w: 9 * s, d: 7 * s, h: 3.4 * s, colour: C.plaster });
  gableRoof(out, { x: x - 6 * s, y: y + 3.4 * s, z, w: 9 * s, d: 7 * s, h: 2 * s, colour: C.roof, overhang: 0.9 * s });
  windowBand(out, { x: x - 6 * s, y: y + 1.2 * s, z: z + 3.6 * s, w: 5 * s, d: 0.3 * s, h: 1.4 * s });

  box(out, { x, y, z, w: 8 * s, d: 8 * s, h: 1.6 * s, colour: C.stone });
  cylinder(out, { x, y: y + 1.6 * s, z, r: 2.7 * s, h: 12 * s, colour: C.plaster, sides: 12, taper: 0.74, cap: false });
  windowBand(out, { x, y: y + 5 * s, z: z + 2.2 * s, w: 1 * s, d: 0.4 * s, h: 1.4 * s });
  windowBand(out, { x, y: y + 9 * s, z: z + 2 * s, w: 1 * s, d: 0.4 * s, h: 1.4 * s });

  // Gallery: a floor that overhangs, a ring of posts, a rail on top.
  cylinder(out, { x, y: y + 13.6 * s, z, r: 3.2 * s, h: 0.5 * s, colour: C.roof, sides: 12 });
  for (let i = 0; i < 10; i += 1) {
    const a = (i / 10) * Math.PI * 2;
    box(out, {
      x: x + Math.cos(a) * 2.9 * s, y: y + 14.1 * s, z: z + Math.sin(a) * 2.9 * s,
      w: 0.22 * s, d: 0.22 * s, h: 1.1 * s, colour: C.plaster,
    });
  }
  cylinder(out, { x, y: y + 15.2 * s, z, r: 3.1 * s, h: 0.22 * s, colour: C.plaster, sides: 12 });

  cylinder(out, { x, y: y + 14.1 * s, z, r: 1.8 * s, h: 2.6 * s, colour: C.gold, sides: 8, cap: false });
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    box(out, {
      x: x + Math.cos(a) * 1.8 * s, y: y + 14.1 * s, z: z + Math.sin(a) * 1.8 * s,
      w: 0.18 * s, d: 0.18 * s, h: 2.6 * s, colour: C.roof,
    });
  }
  cone(out, { x, y: y + 16.7 * s, z, r: 2.3 * s, h: 2.4 * s, colour: C.roof, sides: 10 });
  cone(out, { x, y: y + 19.1 * s, z, r: 0.35 * s, h: 1.2 * s, colour: C.gold, sides: 6 });
}

/** The palace: teak houses on stilts, verandas, hipped roofs, its own green. */
export function palace(out, { x, y, z, s = 1 }) {
  const house = (dx, dz, w, d) => {
    const hx = x + dx;
    const hz = z + dz;
    for (let i = 0; i <= 2; i += 1) {
      for (let j = 0; j <= 2; j += 1) {
        box(out, {
          x: hx - (w / 2 - 0.9) * s + ((w - 1.8) * s * i) / 2,
          y,
          z: hz - (d / 2 - 0.9) * s + ((d - 1.8) * s * j) / 2,
          w: 0.7 * s, d: 0.7 * s, h: 2.2 * s, colour: C.teak,
        });
      }
    }
    // Floor plate, then the walls set in: that step is the veranda.
    box(out, { x: hx, y: y + 2.2 * s, z: hz, w: (w + 2.4) * s, d: (d + 2.4) * s, h: 0.4 * s, colour: C.teak });
    posts(out, { x: hx, y: y + 2.6 * s, z: hz + ((d + 2.4) / 2) * s, span: (w + 2.4) * s, count: 6, r: 0.12 * s, h: 1.1 * s, colour: C.plaster, axis: 'x' });
    rail(out, { x: hx, y: y + 3.7 * s, z: hz + ((d + 2.4) / 2) * s, w: (w + 2.4) * s, d: 0.2 * s, colour: C.plaster });

    box(out, { x: hx, y: y + 2.6 * s, z: hz, w: w * s, d: d * s, h: 4.4 * s, colour: C.palace });
    windowBand(out, { x: hx, y: y + 4 * s, z: hz + (d / 2 + 0.05) * s, w: (w - 3) * s, d: 0.3 * s, h: 2 * s, colour: C.plaster });
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i += 1) {
        column(out, {
          x: hx + side * ((w + 2.2) / 2) * s, y: y + 2.6 * s,
          z: hz - (d / 2 - 1) * s + ((d - 2) * s * i) / 2,
          r: 0.22 * s, h: 4.6 * s, colour: C.plaster,
        });
      }
    }
    gableRoof(out, { x: hx, y: y + 7 * s, z: hz, w: w * s, d: d * s, h: 2.8 * s, colour: C.plaster, overhang: 2 * s });
    box(out, { x: hx, y: y + 9.7 * s, z: hz, w: 0.6 * s, d: (d + 1) * s, h: 0.4 * s, colour: C.stone });
  };
  house(-11 * s, 1 * s, 13, 9);
  house(5 * s, 3 * s, 11, 8);
  house(0, -11 * s, 9, 7);
  steps(out, { x: -11 * s + x, y, z: z + 7.5 * s, w: 4 * s, count: 4, rise: 0.55 * s, run: 0.8 * s, colour: C.teak });
}

/** The marine museum: plinth, long block, window band, canopy. */
export function museum(out, { x, y, z, s = 1 }) {
  box(out, { x, y, z, w: 30 * s, d: 14 * s, h: 1 * s, colour: C.stone });
  box(out, { x, y: y + 1 * s, z, w: 27 * s, d: 12 * s, h: 6.4 * s, colour: C.plaster });
  windowBand(out, { x, y: y + 3 * s, z: z + 6.1 * s, w: 22 * s, d: 0.3 * s, h: 2.4 * s });
  windowBand(out, { x, y: y + 3 * s, z: z - 6.1 * s, w: 22 * s, d: 0.3 * s, h: 2.4 * s });
  box(out, { x, y: y + 7.4 * s, z, w: 29 * s, d: 14 * s, h: 0.7 * s, colour: C.stone });
  box(out, { x, y: y + 8.1 * s, z, w: 29 * s, d: 14 * s, h: 0.5 * s, colour: C.plaster });

  box(out, { x: x - 8 * s, y: y + 1 * s, z: z + 7.4 * s, w: 7 * s, d: 3 * s, h: 4.6 * s, colour: C.stone });
  box(out, { x: x - 8 * s, y: y + 5.6 * s, z: z + 8.4 * s, w: 9 * s, d: 5 * s, h: 0.5 * s, colour: C.plaster });
  posts(out, { x: x - 8 * s, y: y + 1 * s, z: z + 10.6 * s, span: 8 * s, count: 2, r: 0.2 * s, h: 4.6 * s, colour: C.plaster, axis: 'x' });
}

/** A pier: deck, rails, piles, and a shelter at the head. */
export function pier(out, { x, y, z, s = 1, length = 60 }) {
  const len = length * s;
  box(out, { x, y: y + 2.3 * s, z, w: 5.2 * s, d: len, h: 0.45 * s, colour: C.deck });
  const bays = Math.max(3, Math.round(len / (7 * s)));
  for (let i = 0; i <= bays; i += 1) {
    const pz = z - len / 2 + (len * i) / bays;
    for (const side of [-1, 1]) {
      box(out, { x: x + side * 2.2 * s, y: y - 1.4 * s, z: pz, w: 0.6 * s, d: 0.6 * s, h: 3.9 * s, colour: C.teak });
      box(out, { x: x + side * 2.5 * s, y: y + 2.75 * s, z: pz, w: 0.18 * s, d: 0.18 * s, h: 1 * s, colour: C.plaster });
    }
  }
  for (const side of [-1, 1]) {
    box(out, { x: x + side * 2.5 * s, y: y + 3.6 * s, z, w: 0.2 * s, d: len, h: 0.18 * s, colour: C.plaster });
  }
  box(out, { x, y: y + 2.75 * s, z: z - len / 2 + 3 * s, w: 5 * s, d: 5 * s, h: 2.6 * s, colour: C.plaster });
  gableRoof(out, { x, y: y + 5.35 * s, z: z - len / 2 + 3 * s, w: 5 * s, d: 5 * s, h: 1.6 * s, colour: C.tin, overhang: 0.9 * s });
}

/** Wat Tham Yai Prik: kuti under a rock shoulder, with the cave mouth. */
export function caveMonastery(out, { x, y, z, s = 1 }) {
  dome(out, { x: x - 7 * s, y, z: z - 5 * s, r: 10 * s, colour: C.rock, sides: 10, rings: 3 });
  dome(out, { x: x - 2 * s, y, z: z - 11 * s, r: 6 * s, colour: C.rock, sides: 8, rings: 2 });
  windowBand(out, { x: x - 7 * s, y, z: z + 4 * s, w: 4 * s, d: 1.4 * s, h: 4 * s, colour: [0.12, 0.13, 0.14] });

  for (const [dx, dz, rot] of [[5, 3, 0], [11, -3, 0], [7, 10, 1]]) {
    const hx = x + dx * s;
    const hz = z + dz * s;
    for (const ox of [-1, 1]) {
      for (const oz of [-1, 1]) {
        box(out, { x: hx + ox * 2 * s, y, z: hz + oz * 2 * s, w: 0.5 * s, d: 0.5 * s, h: 1.4 * s, colour: C.teak });
      }
    }
    box(out, { x: hx, y: y + 1.4 * s, z: hz, w: 5.5 * s, d: 5 * s, h: 3 * s, colour: C.plaster });
    windowBand(out, { x: hx, y: y + 2.2 * s, z: hz + 2.6 * s, w: 1.6 * s, d: 0.3 * s, h: 1.6 * s, colour: C.teak });
    gableRoof(out, {
      x: hx, y: y + 4.4 * s, z: hz,
      w: (rot ? 5 : 5.5) * s, d: (rot ? 5.5 : 5) * s, h: 2 * s, colour: C.roof, overhang: 1.1 * s,
    });
  }
  steps(out, { x: x + 5 * s, y, z: z + 7 * s, w: 3 * s, count: 3, rise: 0.45 * s, run: 0.8 * s, colour: C.stone });
}

/** Anything else with a roof: an ordinary building on this island. */
export function ordinaryBuilding(out, { x, y, z, s = 1 }) {
  box(out, { x, y, z, w: 9 * s, d: 11 * s, h: 4.4 * s, colour: C.plaster });
  windowBand(out, { x, y: y + 1.6 * s, z: z + 5.6 * s, w: 5 * s, d: 0.3 * s, h: 1.6 * s });
  gableRoof(out, { x, y: y + 4.4 * s, z, w: 9 * s, d: 11 * s, h: 2.3 * s, colour: C.tin, overhang: 1 * s });
  box(out, { x, y, z: z + 6.4 * s, w: 3.4 * s, d: 2.2 * s, h: 2.6 * s, colour: C.plaster });
  gableRoof(out, { x, y: y + 2.6 * s, z: z + 6.4 * s, w: 3.4 * s, d: 2.2 * s, h: 0.9 * s, colour: C.tin, overhang: 0.5 * s });
}

/**
 * One house of the village, from a surveyed footprint.
 *
 * The chorus is not scattered: OpenStreetMap has 476 building outlines on
 * this island, so the village can stand where the village stands, in roughly
 * the shape it has. Only the footprint's bounding box survives the trip -
 * orientation would need the outline itself - so the ridge runs along
 * whichever side is longer, which is what a roof usually does.
 *
 * COLOUR IS CHOSEN FROM THE ID, not at random: a rebuild has to produce the
 * same village, or every render is a different place.
 */
export const VILLAGE_WALLS = [
  [0.93, 0.92, 0.88], [0.86, 0.84, 0.78], [0.78, 0.76, 0.70], [0.70, 0.66, 0.58],
];
export const VILLAGE_ROOFS = [
  [0.62, 0.66, 0.68], [0.55, 0.58, 0.60], [0.66, 0.40, 0.31], [0.47, 0.50, 0.52],
];

export const pick = (list, id) => {
  let hash = 0;
  for (const ch of String(id)) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return list[hash % list.length];
};

export function villageHouse(out, { x, y, z, w, d, h, id = 0 }) {
  const wall = pick(VILLAGE_WALLS, id);
  const roof = pick(VILLAGE_ROOFS, `${id}r`);
  box(out, { x, y, z, w, d, h, colour: wall });
  if (w >= d) {
    // Ridge along X: rotate the gable by swapping the span it runs down.
    gableRoofAlongX(out, { x, y: y + h, z, w, d, h: Math.min(w, d) * 0.34, colour: roof, overhang: 0.6 });
  } else {
    gableRoof(out, { x, y: y + h, z, w, d, h: Math.min(w, d) * 0.34, colour: roof, overhang: 0.6 });
  }
}

/** The same roof with its ridge running along X instead of Z. */
export function gableRoofAlongX(out, { x = 0, y, z = 0, w, d, h, colour, overhang = 0 }) {
  const hw = w / 2 + overhang;
  const hd = d / 2 + overhang;
  const ridge = [[x - hw, y + h, z], [x + hw, y + h, z]];
  const eaves = [
    [x - hw, y, z - hd], [x + hw, y, z - hd], [x + hw, y, z + hd], [x - hw, y, z + hd],
  ];
  quad(out, eaves[0], eaves[1], ridge[1], ridge[0], colour);
  quad(out, eaves[3], ridge[0], ridge[1], eaves[2], colour);
  tri(out, eaves[0], ridge[0], eaves[3], colour);
  tri(out, eaves[1], eaves[2], ridge[1], colour);
}

/**
 * The whole village, skipping anything that would stand inside a landmark.
 *
 * The heroes have footprints in OpenStreetMap too, so without this the temple
 * gets a tin-roofed house in the middle of it.
 */
export function buildVillage(buildings, { project, sample, exaggeration, scale = 2.4, clear = [], clearance = 45 }) {
  const out = { positions: [], normals: [], colours: [] };
  let placed = 0;
  let skipped = 0;
  for (const b of buildings) {
    const [x, z] = project(b.lng, b.lat);
    if (clear.some((a) => Math.hypot(a.x - x, a.z - z) < clearance)) { skipped += 1; continue; }
    const ground = sample(b.lng, b.lat);
    const w = Math.max(4, Math.min(28, b.widthM)) * scale;
    const d = Math.max(4, Math.min(28, b.depthM)) * scale;
    villageHouse(out, {
      x, z, y: (Number.isFinite(ground) ? Math.max(ground, 0) : 0) * exaggeration,
      w, d, h: Math.min(w, d) * 0.55, id: b.id,
    });
    placed += 1;
  }
  return {
    positions: Float32Array.from(out.positions),
    normals: Float32Array.from(out.normals),
    colours: Float32Array.from(out.colours),
    placed,
    skipped,
    triangles: out.positions.length / 9,
  };
}

/** A rock in the sea, for an island that is not this island. */
export function islet(out, { x, y, z, s = 1 }) {
  dome(out, { x, y, z, r: 10 * s, colour: C.rock, sides: 10, rings: 3 });
  dome(out, { x: x + 7 * s, y, z: z + 4 * s, r: 5 * s, colour: C.rock, sides: 8, rings: 2 });
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
