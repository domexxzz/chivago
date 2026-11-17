/**
 * Looking at the island, without a browser.
 *
 *   node scripts/island-preview.mjs model.glb --out preview.png --yaw 18
 *
 * WHY THIS EXISTS. docs/76's gates are all judged by eye, and nothing on this
 * toolchain opens a glTF: the preview pane refuses a local file and a static
 * server is not always available. So the thing that decides whether a
 * silhouette reads was the one thing nobody could see. This renders the file
 * to a PNG, which anybody can open and which an agent can read directly.
 *
 * It is a scanline rasteriser with a depth buffer, supersampled. Not a
 * renderer to ship behind: a renderer to decide with.
 *
 * DEPTH BUFFER, NOT PAINTER'S ALGORITHM. Sorting triangles by their centre is
 * how a spire ends up behind the roof it stands on: a long triangle can be
 * nearer at one end and further at the other, and no ordering of whole
 * triangles fixes it. Per pixel is the only answer that is always right.
 *
 * SUPERSAMPLED x3. The edges are the whole look in a faceted style, and an
 * aliased edge reads as a mistake rather than as a facet. Rendering at three
 * times and averaging costs nine times the pixels and is still under a second
 * for this island.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import { encodePng } from './island-surface.mjs';

/** docs/76's light rig: a warm sun, a cool sky, and the sea bouncing up. */
export const RIG = {
  sun: { azimuth: 135, elevation: 48, colour: [1.0, 0.94, 0.81], strength: 1.05 },
  sky: { colour: [0.66, 0.78, 0.91], strength: 0.42 },
  sea: { colour: [0.24, 0.56, 0.77], strength: 0.18 },
  ambient: 0.20,
};

export const SEA = [30, 120, 174];

const dir = (azimuth, elevation) => {
  const a = (azimuth * Math.PI) / 180;
  const e = (elevation * Math.PI) / 180;
  return [Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)];
};

/** Read POSITION, NORMAL and COLOR_0 out of a single-primitive .glb. */
export function readGlb(buffer) {
  const jsonLength = buffer.readUInt32LE(12);
  const json = JSON.parse(buffer.toString('utf8', 20, 20 + jsonLength));
  const binStart = 20 + jsonLength + 8;
  const attribute = (name) => {
    const accessor = json.accessors[json.meshes[0].primitives[0].attributes[name]];
    const view = json.bufferViews[accessor.bufferView];
    const start = buffer.byteOffset + binStart + (view.byteOffset ?? 0);
    return new Float32Array(buffer.buffer.slice(start, start + view.byteLength));
  };
  return { positions: attribute('POSITION'), normals: attribute('NORMAL'), colours: attribute('COLOR_0') };
}

/** Shade one face: key, sky, bounce, ambient. Values, not a tone curve. */
export function shade(normal, colour, rig = RIG) {
  const sun = dir(rig.sun.azimuth, rig.sun.elevation);
  const key = Math.max(0, normal[0] * sun[0] + normal[1] * sun[1] + normal[2] * sun[2]) * rig.sun.strength;
  /*
    A HEMISPHERE, NOT A CLAMP.

    `max(0, n.y)` gives a wall no sky at all, and a wall out of the sun then
    renders black - which is what the first pass with this rig produced, dark
    bands under every building. A vertical surface sees half the sky and half
    the water; that is what these two terms say now.
  */
  const sky = ((normal[1] + 1) / 2) * rig.sky.strength;
  const sea = ((1 - normal[1]) / 2) * rig.sea.strength;
  return [0, 1, 2].map((i) => {
    const lit = colour[i] * (rig.ambient
      + key * rig.sun.colour[i]
      + sky * rig.sky.colour[i]
      + sea * rig.sea.colour[i]);
    // One stop of shoulder, so a white roof in full sun keeps its facets.
    return Math.min(1, lit <= 0.86 ? lit : 0.86 + (lit - 0.86) * 0.45);
  });
}

/**
 * Orthographic, because a diorama is read as an object rather than entered.
 * Yaw turns the island, pitch lifts the eye; both in degrees.
 */
export function render({ positions, normals, colours, width = 1600, height = 1000, yaw = 18, pitch = 34, ss = 3, background = SEA }) {
  const W = width * ss;
  const H = height * ss;
  const cy = Math.cos((yaw * Math.PI) / 180);
  const sy = Math.sin((yaw * Math.PI) / 180);
  const cp = Math.cos((pitch * Math.PI) / 180);
  const sp = Math.sin((pitch * Math.PI) / 180);

  const count = positions.length / 3;
  const view = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    const x = positions[i * 3];
    const y = positions[i * 3 + 1];
    const z = positions[i * 3 + 2];
    const rx = x * cy - z * sy;
    const rz = x * sy + z * cy;
    view[i * 3] = rx;
    view[i * 3 + 1] = y * cp - rz * sp;
    view[i * 3 + 2] = y * sp + rz * cp;
  }

  let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
  for (let i = 0; i < count; i += 1) {
    minX = Math.min(minX, view[i * 3]); maxX = Math.max(maxX, view[i * 3]);
    minY = Math.min(minY, view[i * 3 + 1]); maxY = Math.max(maxY, view[i * 3 + 1]);
  }
  const margin = 0.04;
  const scale = Math.min((W * (1 - margin * 2)) / (maxX - minX), (H * (1 - margin * 2)) / (maxY - minY));
  const offX = (W - (maxX - minX) * scale) / 2;
  const offY = (H - (maxY - minY) * scale) / 2;

  const colour = new Float32Array(W * H * 3);
  const depth = new Float32Array(W * H).fill(Infinity);
  for (let i = 0; i < W * H; i += 1) {
    colour[i * 3] = background[0] / 255;
    colour[i * 3 + 1] = background[1] / 255;
    colour[i * 3 + 2] = background[2] / 255;
  }

  for (let t = 0; t < count; t += 3) {
    const n = [normals[t * 3], normals[t * 3 + 1], normals[t * 3 + 2]];
    const base = [colours[t * 3], colours[t * 3 + 1], colours[t * 3 + 2]];
    const lit = shade(n, base);
    const px = [];
    for (let k = 0; k < 3; k += 1) {
      px.push([
        (view[(t + k) * 3] - minX) * scale + offX,
        H - ((view[(t + k) * 3 + 1] - minY) * scale + offY),
        view[(t + k) * 3 + 2],
      ]);
    }
    const area = (px[1][0] - px[0][0]) * (px[2][1] - px[0][1]) - (px[2][0] - px[0][0]) * (px[1][1] - px[0][1]);
    /*
      BACK FACES ARE DROPPED, and it is not an optimisation.

      A building sits on a plinth, so the box's underside and the plinth's top
      are the same plane. At equal depth the rasteriser keeps whichever it met
      first, and float error decides which - so the plinths came out mottled
      with the dark underside of the thing standing on them. Culling settles
      it: the face pointing away from the eye is never the one you meant.
    */
    if (area >= 0) continue;
    const left = Math.max(0, Math.floor(Math.min(px[0][0], px[1][0], px[2][0])));
    const right = Math.min(W - 1, Math.ceil(Math.max(px[0][0], px[1][0], px[2][0])));
    const top = Math.max(0, Math.floor(Math.min(px[0][1], px[1][1], px[2][1])));
    const bottom = Math.min(H - 1, Math.ceil(Math.max(px[0][1], px[1][1], px[2][1])));

    for (let y = top; y <= bottom; y += 1) {
      for (let x = left; x <= right; x += 1) {
        const cxp = x + 0.5;
        const cyp = y + 0.5;
        const w0 = ((px[1][0] - px[0][0]) * (cyp - px[0][1]) - (cxp - px[0][0]) * (px[1][1] - px[0][1])) / area;
        const w1 = ((cxp - px[0][0]) * (px[2][1] - px[0][1]) - (px[2][0] - px[0][0]) * (cyp - px[0][1])) / area;
        if (w0 < 0 || w1 < 0 || w0 + w1 > 1) continue;
        const z = px[0][2] + w1 * (px[1][2] - px[0][2]) + w0 * (px[2][2] - px[0][2]);
        const at = y * W + x;
        if (z >= depth[at]) continue;
        depth[at] = z;
        colour[at * 3] = lit[0];
        colour[at * 3 + 1] = lit[1];
        colour[at * 3 + 2] = lit[2];
      }
    }
  }

  // Average the supersamples down. This is where the edges come from.
  const out = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      for (let c = 0; c < 3; c += 1) {
        let sum = 0;
        for (let dy = 0; dy < ss; dy += 1) {
          for (let dx = 0; dx < ss; dx += 1) {
            sum += colour[(((y * ss + dy) * W) + (x * ss + dx)) * 3 + c];
          }
        }
        out[(y * width + x) * 3 + c] = Math.round(Math.min(1, sum / (ss * ss)) * 255);
      }
    }
  }
  return { width, height, data: out };
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      out: { type: 'string', default: 'preview.png' },
      yaw: { type: 'string', default: '18' },
      pitch: { type: 'string', default: '34' },
      width: { type: 'string', default: '1600' },
      ss: { type: 'string', default: '3' },
    },
  });
  const model = positionals[0];
  if (!model) throw new Error('usage: island-preview.mjs <model.glb> [--out preview.png]');

  const mesh = readGlb(readFileSync(model));
  const width = Number(values.width);
  const image = render({
    ...mesh,
    width,
    height: Math.round(width * 0.625),
    yaw: Number(values.yaw),
    pitch: Number(values.pitch),
    ss: Number(values.ss),
  });
  const png = encodePng(image);
  writeFileSync(values.out, png);
  console.log(`[chivago] ${mesh.positions.length / 9} triangle(s) -> ${values.out} (${image.width}x${image.height}, ${Math.round(png.length / 1024)} KB)`);
}

if (import.meta.filename === process.argv[1]) {
  await main();
}
