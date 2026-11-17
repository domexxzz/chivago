/**
 * Gate one of docs/76: the island with a box where every building will go.
 *
 *   node scripts/island-blockout.mjs --area koh-sichang \
 *     --coastline <cached osm.json> --out blockout.glb
 *
 * WHAT IT IS FOR. The direction document asks for a grey-box pass before
 * anybody models anything: the real terrain with a plain box standing in for
 * each landmark, so the composition and the scale contract can be judged while
 * they are still cheap to change. If this view is not good, colour and detail
 * will not save it.
 *
 * EVERY BOX IS PLACED FROM THE DATABASE, never by eye. The coordinates are the
 * ones the app already navigates to - `SEED_PLACES` and the Ko Sichang
 * attraction seed - projected with the same transform the terrain used and
 * snapped to its surface. That is the rule docs/76 calls the serious one: a
 * map that disagrees with the data discredits the data, and a hand-placed box
 * is a disagreement waiting to happen.
 *
 * THE BOXES CARRY THE SCALE CONTRACT. docs/76 multiplies ordinary buildings by
 * 1.8 and heroes by 2.2, and a box is where that first becomes visible. A
 * silhouette that reads at this size will read when it is modelled.
 */

import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';

import { metresPerDegree } from './lib/geo.mjs';

/** docs/76, section "the scale contract". */
export const SCALE = { hero: 2.2, ordinary: 1.8, pier: 1.4 };

/**
 * The eight the direction document calls heroes, by the id the database uses.
 * Everything else on the island is a box of the ordinary size.
 */
export const HEROES = new Set([
  'sc-palace',
  'sc-wat-atsadang',
  'sc-chao-pho-khao-yai',
  'sc-buddha-footprint',
  'sc-wat-tham-yai-prik',
  'sc-atsadang-bridge',
  'sc-marinestation',
]);

/** Footprint and height before the multiplier, in metres on the ground. */
export const SHAPE = {
  hero: { width: 26, depth: 26, height: 14 },
  ordinary: { width: 18, depth: 18, height: 8 },
  pier: { width: 8, depth: 60, height: 3 },
};

/**
 * The things that stand over water, named rather than guessed.
 *
 * This matched /pier|bridge/ against the name first, and the island answered
 * with "Shop row by Tha Lang pier" - a row of shops on dry land, given the
 * shape of a jetty because of where it is. A list of ids is duller and right.
 */
export const PIERS = new Set(['sc-pier', 'sc-atsadang-bridge']);

export function shapeFor(place) {
  if (PIERS.has(place.id)) return { ...SHAPE.pier, scale: SCALE.pier, kind: 'pier' };
  if (HEROES.has(place.id)) return { ...SHAPE.hero, scale: SCALE.hero, kind: 'hero' };
  return { ...SHAPE.ordinary, scale: SCALE.ordinary, kind: 'ordinary' };
}

/** Grey, and one step lighter for a hero, so the eight read at a glance. */
export const BOX_COLOUR = {
  hero: [0.86, 0.86, 0.84],
  ordinary: [0.62, 0.65, 0.66],
  pier: [0.72, 0.70, 0.66],
};

/**
 * A box, as twelve triangles with their own flat normals.
 *
 * Unindexed like the terrain, for the same reason: a facet needs its own
 * normal, and at this count nothing is saved by sharing vertices.
 */
export function box({ x, y, z, width, depth, height, colour }, out) {
  const hx = width / 2;
  const hz = depth / 2;
  const corners = [
    [x - hx, y, z - hz], [x + hx, y, z - hz], [x + hx, y, z + hz], [x - hx, y, z + hz],
    [x - hx, y + height, z - hz], [x + hx, y + height, z - hz],
    [x + hx, y + height, z + hz], [x - hx, y + height, z + hz],
  ];
  const faces = [
    [4, 5, 6, 7, [0, 1, 0]],
    [0, 3, 2, 1, [0, -1, 0]],
    [0, 1, 5, 4, [0, 0, -1]],
    [2, 3, 7, 6, [0, 0, 1]],
    [1, 2, 6, 5, [1, 0, 0]],
    [3, 0, 4, 7, [-1, 0, 0]],
  ];
  for (const [a, b, c, d, normal] of faces) {
    for (const [p, q, r] of [[a, b, c], [a, c, d]]) {
      for (const index of [p, q, r]) {
        out.positions.push(...corners[index]);
        out.normals.push(...normal);
        out.colours.push(...colour);
      }
    }
  }
}

/**
 * Where each place stands, in the terrain's own metres.
 *
 * The origin and the axes are the terrain script's: X east, Y up, -Z north,
 * zero at the centre of the bbox. Anything that wants to sit on this island
 * has to agree with that, so it is computed here once and handed out.
 */
export function anchorsFor({ bbox, places, sample, exaggeration }) {
  const perDeg = metresPerDegree((bbox.minLat + bbox.maxLat) / 2);
  const originLng = (bbox.minLng + bbox.maxLng) / 2;
  const originLat = (bbox.minLat + bbox.maxLat) / 2;
  return places.map((place) => {
    const ground = sample(place.lng, place.lat);
    return {
      id: place.id,
      name: place.name,
      x: Number(((place.lng - originLng) * perDeg.lng).toFixed(1)),
      y: Number(((Number.isFinite(ground) ? Math.max(ground, 0) : 0) * exaggeration).toFixed(1)),
      z: Number((-(place.lat - originLat) * perDeg.lat).toFixed(1)),
      groundM: Number.isFinite(ground) ? Number(ground.toFixed(1)) : null,
      kind: shapeFor(place).kind,
    };
  });
}

export function blockout({ bbox, places, sample, exaggeration }) {
  const anchors = anchorsFor({ bbox, places, sample, exaggeration });
  const out = { positions: [], normals: [], colours: [] };
  for (const anchor of anchors) {
    const place = places.find((p) => p.id === anchor.id);
    const shape = shapeFor(place);
    box({
      x: anchor.x,
      y: anchor.y,
      z: anchor.z,
      width: shape.width,
      depth: shape.depth,
      height: shape.height * shape.scale,
      colour: BOX_COLOUR[shape.kind],
    }, out);
  }
  return {
    anchors,
    positions: Float32Array.from(out.positions),
    normals: Float32Array.from(out.normals),
    colours: Float32Array.from(out.colours),
    boxes: anchors.length,
  };
}

/* --------------------------------------------------------------- cli -- */

async function main() {
  const { values } = parseArgs({
    options: {
      area: { type: 'string', default: 'koh-sichang' },
      out: { type: 'string' },
      coastline: { type: 'string' },
      exaggeration: { type: 'string' },
    },
  });

  const terrain = await import('./island-terrain.mjs');
  const core = await import('../packages/core/src/index.ts');
  const bootstrap = await import('../apps/api/src/bootstrap-koh-sichang.ts');

  const area = core.areaByKey(values.area);
  if (!area?.bbox) throw new Error(`no bbox for area ${values.area}`);
  const { bbox } = area;
  const exaggeration = values.exaggeration ? Number(values.exaggeration) : terrain.EXAGGERATION;

  /*
    Two sources, because the island is in two.

    `SEED_PLACES` is what the map has always drawn. The attraction seed is the
    set bootstrapped at run time - the shrine, the mondop, the bridge - which
    is why `sichang.test.ts` refuses a quest pinned on one of them. For a
    composition both have to stand up.
  */
  const places = [
    ...core.SEED_PLACES.filter((p) => core.inArea(area, p))
      .map((p) => ({ id: p.id, name: p.name.en, lat: p.lat, lng: p.lng })),
    ...bootstrap.KOH_SICHANG_ATTRACTIONS
      .map((a) => ({ id: a.id, name: a.nameEn, lat: a.lat, lng: a.lng })),
  ];

  const tiles = new Map();
  const range = terrain.tileRangeFor(bbox, terrain.ZOOM);
  for (let x = range.x0; x <= range.x1; x += 1) {
    for (let y = range.y0; y <= range.y1; y += 1) {
      const url = terrain.TERRAIN_TILES.replace('{z}', String(terrain.ZOOM))
        .replace('{x}', String(x)).replace('{y}', String(y));
      const res = await fetch(url);
      if (!res.ok) throw new Error(`tile ${x}/${y} answered ${res.status}`);
      tiles.set(`${x}/${y}`, terrain.decodePng(Buffer.from(await res.arrayBuffer())));
    }
  }
  const sample = terrain.makeSampler(tiles, terrain.ZOOM);

  const built = blockout({ bbox, places, sample, exaggeration });
  const file = terrain.glb({ ...built, uvs: null, name: `${values.area}-blockout` });

  const out = values.out ?? `apps/mobile/assets/islands/${values.area}-blockout.glb`;
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, file);
  const sidecar = out.replace(/\.glb$/, '.anchors.json');
  writeFileSync(sidecar, `${JSON.stringify(built.anchors, null, 1)}\n`);

  const offIsland = built.anchors.filter((a) => a.groundM === null || a.groundM <= 0);
  console.log(`[chivago] ${built.boxes} box(es) from the database, ${built.anchors.filter((a) => a.kind === 'hero').length} of them heroes`);
  console.log(`          -> ${out} (${Math.round(file.length / 1024)} KB)`);
  console.log(`          -> ${sidecar} (anchors for the label layer)`);
  for (const a of offIsland) {
    console.warn(`[chivago] ${a.id} (${a.name}) has no ground under it: the archive reads ${a.groundM} m there`);
  }
  if (values.coastline) {
    const { landMaskFrom } = await import('./island-surface.mjs');
    const mask = landMaskFrom(JSON.parse(readFileSync(values.coastline, 'utf8')));
    const outside = places.filter((p) => mask && !mask.isLand(p.lng, p.lat));
    for (const p of outside) console.warn(`[chivago] ${p.id} (${p.name}) is outside the surveyed shore`);
  }
}

if (import.meta.filename === process.argv[1]) {
  await main();
}
