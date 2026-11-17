/**
 * The ground of the island, painted from what is actually there.
 *
 *   node scripts/island-surface.mjs --area koh-sichang \
 *     --out apps/mobile/assets/islands/koh-sichang.png
 *
 * WHY NOT SATELLITE. Two reasons, and the second is the one that decides it.
 *
 * The licensing first: Google, Bing, Apple and Esri all forbid deriving a
 * product like this from their imagery, and the imagery that is genuinely open
 * is Sentinel-2 at 10 m a pixel - which makes this island about 280 pixels
 * wide, in total. There is no high-resolution orthophoto of Ko Sichang that
 * may legally be baked into a shipped asset.
 *
 * Then the style: the reference board has no photography anywhere in it. The
 * ground is flat colour with drawn paths. Draping a photograph over the mesh
 * would produce Google Earth with models on it, which is a different product.
 *
 * SO IT IS DRAWN FROM OPENSTREETMAP, the same data behind the vector tiles the
 * map already loads. Surveyed on 17 November 2026 for this bbox: 173 ways with
 * a highway tag (40 of them paths), 478 buildings, 16 coastline ways, 3
 * beaches. The paths end up where the paths are, and the village ends up in
 * the shape of the village.
 *
 * ODbL. Anything drawn from this data carries "© OpenStreetMap contributors"
 * wherever it is shown. That is a licence condition, not a courtesy.
 *
 * WHAT COMES OUT. A PNG of the ground, and a sidecar JSON of building
 * footprint centres for whoever instances the houses later. The mesh is
 * textured by `island-terrain.mjs --texture`.
 */

import { deflateSync } from 'node:zlib';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';

import { metresPerDegree } from './lib/geo.mjs';

export const OVERPASS = 'https://overpass-api.de/api/interpreter';

/** docs/76's palette. The ground may only be painted in these. */
export const GROUND = {
  sea: [0x1e, 0x78, 0xae],
  foam: [0xcf, 0xe9, 0xf5],
  sand: [0xe9, 0xd9, 0xa8],
  path: [0xd9, 0xc7, 0x9b],
  grassLow: [0x6f, 0xa6, 0x3c],
  grassMid: [0x8f, 0xbf, 0x4f],
  grassHigh: [0xb4, 0xc5, 0x6a],
  scrub: [0x4e, 0x7f, 0x2e],
  rock: [0x9a, 0xa3, 0xa8],
  roof: [0xbf, 0xc5, 0xc2],
};

/* ------------------------------------------------------------- raster -- */

export function canvas(width, height, fill = GROUND.sea) {
  const data = new Uint8Array(width * height * 3);
  for (let i = 0; i < data.length; i += 3) {
    data[i] = fill[0]; data[i + 1] = fill[1]; data[i + 2] = fill[2];
  }
  return { width, height, data };
}

export const setPixel = (img, x, y, colour) => {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return;
  const i = (y * img.width + x) * 3;
  img.data[i] = colour[0]; img.data[i + 1] = colour[1]; img.data[i + 2] = colour[2];
};

/** Even-odd scanline fill. Rings are arrays of [x, y] in pixels. */
export function fillPolygon(img, rings, colour) {
  let minY = Infinity;
  let maxY = -Infinity;
  for (const ring of rings) {
    for (const [, y] of ring) {
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  const top = Math.max(0, Math.floor(minY));
  const bottom = Math.min(img.height - 1, Math.ceil(maxY));
  for (let y = top; y <= bottom; y += 1) {
    const centre = y + 0.5;
    const crossings = [];
    for (const ring of rings) {
      for (let i = 0; i < ring.length; i += 1) {
        const [x1, y1] = ring[i];
        const [x2, y2] = ring[(i + 1) % ring.length];
        if (y1 === y2) continue;
        if (centre >= Math.min(y1, y2) && centre < Math.max(y1, y2)) {
          crossings.push(x1 + ((centre - y1) / (y2 - y1)) * (x2 - x1));
        }
      }
    }
    crossings.sort((a, b) => a - b);
    for (let i = 0; i + 1 < crossings.length; i += 2) {
      const from = Math.max(0, Math.round(crossings[i]));
      const to = Math.min(img.width - 1, Math.round(crossings[i + 1]));
      for (let x = from; x <= to; x += 1) setPixel(img, x, y, colour);
    }
  }
}

/** A line with a round brush. Width is in pixels, and at least one. */
export function strokePath(img, points, widthPx, colour) {
  const r = Math.max(0.5, widthPx / 2);
  const dot = (cx, cy) => {
    /*
      The pixel the brush is standing in, always.

      A disc of radius 0.5 covers no pixel centre when the line passes exactly
      through a corner, so the thinnest paths - 2.5 m at 5 m a pixel - drew
      nothing at all in places and a dotted line elsewhere. A footpath that
      vanishes for ten metres reads as a footpath that ends.
    */
    setPixel(img, Math.floor(cx), Math.floor(cy), colour);
    const from = Math.floor(cx - r);
    const to = Math.ceil(cx + r);
    const top = Math.floor(cy - r);
    const bottom = Math.ceil(cy + r);
    for (let y = top; y <= bottom; y += 1) {
      for (let x = from; x <= to; x += 1) {
        if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) setPixel(img, x, y, colour);
      }
    }
  };
  for (let i = 0; i + 1 < points.length; i += 1) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[i + 1];
    const steps = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1)));
    for (let s = 0; s <= steps; s += 1) {
      dot(x1 + ((x2 - x1) * s) / steps, y1 + ((y2 - y1) * s) / steps);
    }
  }
}

/* ---------------------------------------------------------------- png -- */

const crcTable = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

const crc32 = (buf) => {
  let c = ~0;
  for (let i = 0; i < buf.length; i += 1) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return ~c;
};

/** 8-bit RGB, filter 0 on every row. Read back by `decodePng` in the tests. */
export function encodePng(img) {
  const chunk = (type, data) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(img.width, 0);
  ihdr.writeUInt32BE(img.height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;

  const stride = img.width * 3;
  const raw = Buffer.alloc(img.height * (stride + 1));
  for (let y = 0; y < img.height; y += 1) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(img.data.buffer, img.data.byteOffset + y * stride, stride)
      .copy(raw, y * (stride + 1) + 1);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ----------------------------------------------------------- overpass -- */

export const overpassQuery = (bbox) => {
  const box = `${bbox.minLat},${bbox.minLng},${bbox.maxLat},${bbox.maxLng}`;
  return `[out:json][timeout:90];
(
  way["highway"](${box});
  way["natural"="beach"](${box});
  way["natural"="coastline"](${box});
  way["natural"~"wood|scrub"](${box});
  way["landuse"](${box});
  way["building"](${box});
);
out geom;`;
};

export async function fetchOsm(bbox, cachePath = null, log = console.log) {
  if (cachePath && existsSync(cachePath)) {
    log(`[chivago] OpenStreetMap, from cache: ${cachePath}`);
    return JSON.parse(readFileSync(cachePath, 'utf8'));
  }
  const res = await fetch(OVERPASS, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'chivago-island-surface/1.0' },
    body: `data=${encodeURIComponent(overpassQuery(bbox))}`,
  });
  if (!res.ok) throw new Error(`Overpass answered ${res.status}`);
  const body = await res.json();
  if (cachePath) {
    mkdirSync(dirname(cachePath), { recursive: true });
    writeFileSync(cachePath, JSON.stringify(body));
  }
  log(`[chivago] OpenStreetMap: ${body.elements?.length ?? 0} way(s)`);
  return body;
}

/* ---------------------------------------------------------- coastline --

  WHY THE SHORE CANNOT COME FROM THE ELEVATION.

  Measured on 17 November 2026, over this bbox, counting how much of it the
  archive calls land at each threshold:

      > 0.5 m   12.8 km2        > 3 m   10.7 km2
      > 1 m     12.3 km2        > 5 m    9.7 km2
      > 2 m     11.4 km2        > 8 m    8.4 km2

  The island is about 7.9 km2. There is no step anywhere in that curve - SRTM
  smears the coast over several metres - so every threshold is wrong, and the
  one that gets the area right eats real coastal ground to do it. The first
  attempt cut at 0.5 m and produced an island half again too big, with the
  sea around it painted in grass and sand wherever the archive's noise
  happened to land above the line.

  OpenStreetMap has the shore as a surveyed line. Use that instead.
*/

/** Join coastline ways end to end into closed rings of [lng, lat]. */
export function coastlineRings(osm) {
  const key = (p) => `${p.lat},${p.lon}`;
  const open = (osm.elements ?? [])
    .filter((e) => e.tags?.natural === 'coastline' && Array.isArray(e.geometry) && e.geometry.length > 1)
    .map((e) => e.geometry.map((g) => [g.lon, g.lat]));

  const rings = [];
  while (open.length) {
    let chain = open.pop();
    let joined = true;
    while (joined) {
      joined = false;
      const head = { lat: chain[0][1], lon: chain[0][0] };
      const tail = { lat: chain.at(-1)[1], lon: chain.at(-1)[0] };
      if (key(head) === key(tail)) break;
      for (let i = 0; i < open.length; i += 1) {
        const other = open[i];
        const oHead = { lat: other[0][1], lon: other[0][0] };
        const oTail = { lat: other.at(-1)[1], lon: other.at(-1)[0] };
        if (key(tail) === key(oHead)) { chain = chain.concat(other.slice(1)); open.splice(i, 1); joined = true; break; }
        if (key(tail) === key(oTail)) { chain = chain.concat(other.slice(0, -1).reverse()); open.splice(i, 1); joined = true; break; }
        if (key(head) === key(oTail)) { chain = other.slice(0, -1).concat(chain); open.splice(i, 1); joined = true; break; }
        if (key(head) === key(oHead)) { chain = other.slice(1).reverse().concat(chain); open.splice(i, 1); joined = true; break; }
      }
    }
    rings.push(chain);
  }
  return rings;
}

/** Twice the signed area, in degrees squared. Sign is winding, not size. */
export const ringArea = (ring) => {
  let sum = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
};

/** The island, out of everything the bbox caught. One mesh, one island. */
export const largestRing = (rings) =>
  rings.reduce((best, ring) => (Math.abs(ringArea(ring)) > Math.abs(ringArea(best ?? [])) ? ring : best), null);

/** Even-odd, on a ring of [lng, lat]. */
export function pointInRing(ring, lng, lat) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * A land test from the surveyed shore, with the elevation as the fallback.
 *
 * Returns null when there is no coastline in the data, so the caller can say
 * so rather than quietly going back to a threshold that does not work.
 */
export function landMaskFrom(osm) {
  const ring = largestRing(coastlineRings(osm));
  if (!ring || ring.length < 4) return null;
  return { ring, isLand: (lng, lat) => pointInRing(ring, lng, lat) };
}

/* --------------------------------------------------------- classifier -- */

/**
 * What a way is, and how wide it is drawn, in metres on the ground.
 *
 * Order matters: a `building` on a `landuse` polygon has to come out as a
 * building. Anything not named here is not drawn - the ground does not need
 * every tag in the database, it needs the few a traveller can see.
 */
export function classify(tags = {}) {
  if (tags.building) return { kind: 'area', colour: GROUND.roof, z: 5 };
  if (tags.natural === 'coastline') return { kind: 'line', colour: GROUND.foam, widthM: 6, z: 1 };
  if (tags.natural === 'beach') return { kind: 'area', colour: GROUND.sand, z: 2 };
  if (tags.natural === 'wood' || tags.landuse === 'forest') return { kind: 'area', colour: GROUND.scrub, z: 1 };
  if (tags.natural === 'scrub') return { kind: 'area', colour: GROUND.scrub, z: 1 };
  if (!tags.highway) return null;
  if (['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential'].includes(tags.highway)) {
    return { kind: 'line', colour: GROUND.path, widthM: 6, z: 4 };
  }
  if (['service', 'track'].includes(tags.highway)) return { kind: 'line', colour: GROUND.path, widthM: 4, z: 3 };
  if (['path', 'footway', 'steps', 'pedestrian'].includes(tags.highway)) {
    return { kind: 'line', colour: GROUND.path, widthM: 2.5, z: 3 };
  }
  return null;
}

/* ------------------------------------------------------------- paint -- */

/** Base ground colour for a texel, from the same bands the mesh uses. */
export function baseColour(metres) {
  if (!Number.isFinite(metres) || metres <= 0.5) return GROUND.sea;
  if (metres < 5) return GROUND.sand;
  if (metres < 40) return GROUND.grassLow;
  if (metres < 95) return GROUND.grassMid;
  return GROUND.grassHigh;
}

export function paintSurface({ bbox, osm, width, height, sample, isLand = null }) {
  const img = canvas(width, height, GROUND.sea);
  const toPixel = ([lng, lat]) => [
    ((lng - bbox.minLng) / (bbox.maxLng - bbox.minLng)) * width,
    ((bbox.maxLat - lat) / (bbox.maxLat - bbox.minLat)) * height,
  ];

  if (sample) {
    for (let y = 0; y < height; y += 1) {
      const lat = bbox.maxLat - ((bbox.maxLat - bbox.minLat) * (y + 0.5)) / height;
      for (let x = 0; x < width; x += 1) {
        const lng = bbox.minLng + ((bbox.maxLng - bbox.minLng) * (x + 0.5)) / width;
        if (isLand && !isLand(lng, lat)) { setPixel(img, x, y, GROUND.sea); continue; }
        // Inside the shore, height still chooses the band - but never the sea.
        const h = sample(lng, lat);
        setPixel(img, x, y, isLand ? baseColour(Math.max(h || 0, 1)) : baseColour(h));
      }
    }
  }

  const perDeg = metresPerDegree((bbox.minLat + bbox.maxLat) / 2);
  const pxPerMetre = width / ((bbox.maxLng - bbox.minLng) * perDeg.lng);

  const drawn = { area: 0, line: 0, skipped: 0 };
  const buildings = [];
  const ways = (osm.elements ?? [])
    .filter((e) => Array.isArray(e.geometry) && e.geometry.length > 1)
    .map((e) => ({ element: e, style: classify(e.tags) }))
    .filter((w) => w.style !== null)
    .sort((a, b) => a.style.z - b.style.z);

  for (const { element, style } of ways) {
    const points = element.geometry.map((g) => toPixel([g.lon, g.lat]));
    const closed = element.geometry[0].lat === element.geometry.at(-1).lat
      && element.geometry[0].lon === element.geometry.at(-1).lon;
    if (style.kind === 'area' && closed) {
      fillPolygon(img, [points], style.colour);
      drawn.area += 1;
      if (element.tags?.building) {
        const lngs = element.geometry.map((g) => g.lon);
        const lats = element.geometry.map((g) => g.lat);
        buildings.push({
          id: element.id,
          lng: Number(((Math.min(...lngs) + Math.max(...lngs)) / 2).toFixed(7)),
          lat: Number(((Math.min(...lats) + Math.max(...lats)) / 2).toFixed(7)),
          widthM: Number(((Math.max(...lngs) - Math.min(...lngs)) * perDeg.lng).toFixed(1)),
          depthM: Number(((Math.max(...lats) - Math.min(...lats)) * perDeg.lat).toFixed(1)),
        });
      }
    } else if (style.kind === 'line' || !closed) {
      strokePath(img, points, Math.max(1, style.widthM * pxPerMetre), style.colour);
      drawn.line += 1;
    } else {
      drawn.skipped += 1;
    }
  }

  return { img, drawn, buildings };
}

/* --------------------------------------------------------------- cli -- */

async function main() {
  const { values } = parseArgs({
    options: {
      area: { type: 'string', default: 'koh-sichang' },
      out: { type: 'string' },
      width: { type: 'string', default: '2048' },
      cache: { type: 'string' },
      'no-terrain': { type: 'boolean', default: false },
    },
  });

  const core = await import('../packages/core/src/index.ts');
  const area = core.areaByKey(values.area);
  if (!area?.bbox) throw new Error(`no bbox for area ${values.area}`);
  const { bbox } = area;

  const perDeg = metresPerDegree((bbox.minLat + bbox.maxLat) / 2);
  const widthM = (bbox.maxLng - bbox.minLng) * perDeg.lng;
  const heightM = (bbox.maxLat - bbox.minLat) * perDeg.lat;
  const width = Number(values.width);
  const height = Math.round((width * heightM) / widthM);

  let sample = null;
  if (!values['no-terrain']) {
    const terrain = await import('./island-terrain.mjs');
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
    sample = terrain.makeSampler(tiles, terrain.ZOOM);
  }

  const osm = await fetchOsm(bbox, values.cache ?? null);
  const mask = landMaskFrom(osm);
  if (mask) console.log(`[chivago] shore from the OSM coastline: ${mask.ring.length} point(s)`);
  else console.warn('[chivago] no coastline in this data - falling back to the elevation, which is wrong by square kilometres');
  const { img, drawn, buildings } = paintSurface({ bbox, osm, width, height, sample, isLand: mask?.isLand ?? null });

  const out = values.out ?? `apps/mobile/assets/islands/${values.area}.png`;
  mkdirSync(dirname(out), { recursive: true });
  const png = encodePng(img);
  writeFileSync(out, png);
  const sidecar = out.replace(/\.png$/, '.buildings.json');
  writeFileSync(sidecar, `${JSON.stringify(buildings, null, 1)}\n`);

  console.log(`[chivago] ${values.area}: ${width} x ${height} px over ${Math.round(widthM)} x ${Math.round(heightM)} m`);
  console.log(`          ${(widthM / width).toFixed(2)} m a pixel · ${drawn.area} area(s), ${drawn.line} line(s)`);
  console.log(`          -> ${out} (${Math.round(png.length / 1024)} KB)`);
  console.log(`          -> ${sidecar} (${buildings.length} building footprint(s))`);
  console.log('          © OpenStreetMap contributors (ODbL). The app must say so where this is shown.');
}

if (import.meta.filename === process.argv[1]) {
  await main();
}
