/**
 * Turn the Koh Sichang drift model's output into something the island can draw.
 *
 *   node scripts/island-drift.mjs <forecast.json> [--window 6]
 *
 * THE SOURCE IS ANOTHER REPOSITORY. `electiction/chivargo-sichang` runs
 * Sentinel-2 detection and a particle model over Copernicus SMOC currents and
 * Open-Meteo wind, and writes `forecast.json`: forty-three coastal segments of
 * about 430 m each, with how many simulated particles first touched land in
 * each of them. This script copies the shape of that answer and nothing else.
 *
 * WHAT THIS IS NOT, and the reason every field below carries its own caveat:
 * the model seeds particles on a UNIFORM OFFSHORE GRID with no observed debris
 * mass, and reports `calibrated: false`. So it cannot say a beach will have
 * litter on it. It can only say that IF something were adrift offshore, these
 * are the shores it would reach first, and in roughly what order. Drawing it
 * as a litter forecast would be a claim its own author refuses to make, which
 * is why `calibrated` and `seeding` travel with the data into the app rather
 * than living in a README nobody opens.
 *
 * THE SIX HOUR WINDOW IS THE DEFAULT and not an arbitrary one. Measured in the
 * 17 November issue: at six hours none of the 5,133 simulations had left the
 * frame; by twenty-four, 3,350 had, and only 108 were still afloat. A window
 * whose particles have mostly walked off the edge of the map is a picture of
 * the edge of the map.
 *
 * LONGITUDE AND LATITUDE ARE KEPT. The anchors sidecar stores island metres
 * because the page needs them and cannot project; this file is read by the
 * React side, which has `toIsland`, so it stays in the coordinates its source
 * published and can be checked against them line by line.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';

const { values, positionals } = parseArgs({
  options: {
    window: { type: 'string', default: '6' },
    out: { type: 'string', default: 'apps/mobile/public/islands/koh-sichang.drift.json' },
  },
  allowPositionals: true,
});

const source = positionals[0];
if (!source) {
  console.error('usage: node scripts/island-drift.mjs <forecast.json> [--window 6]');
  process.exit(1);
}

const forecast = JSON.parse(readFileSync(source, 'utf8'));
const hours = Number(values.window);
const win = forecast.windows?.find((w) => w.hours === hours);
if (!win) {
  console.error(`no ${hours} hour window in ${source}; it has ${(forecast.windows ?? []).map((w) => w.hours).join(', ')}`);
  process.exit(1);
}

/*
  `windows[].segments` is keyed by rank, not by segment id, and each entry
  carries the id it refers to. Reading it as an array indexed by segment would
  put the busiest shore wherever rank zero happened to fall.
*/
const counts = new Map();
for (const entry of Object.values(win.segments ?? {})) {
  if (entry && typeof entry.id === 'number') counts.set(entry.id, entry);
}

const segments = (forecast.segments ?? []).map((seg) => {
  const hit = counts.get(seg.id);
  return {
    id: seg.id,
    /* Null, not zero: a shore nothing reached and a shore never simulated are
       different answers, and the model only lists the ones that were hit. */
    count: hit ? hit.count : 0,
    firstHours: hit?.firstHours ?? null,
    arrivalP10: hit?.arrivalHoursP10 ?? null,
    arrivalP90: hit?.arrivalHoursP90 ?? null,
    /* The model's own disagreement with itself under +/-20% speed and +/-15
       degrees. Shown as a range, because a single number here would be the
       one thing this dataset is least able to promise. */
    low: hit?.sensitivity?.min ?? null,
    high: hit?.sensitivity?.max ?? null,
    beach: seg.nearBeach ?? null,
    near: seg.reference?.name ?? null,
    path: seg.path,
  };
});

const max = segments.reduce((m, s) => Math.max(m, s.count), 0);

const out = {
  model: forecast.modelVersion ?? null,
  issued: forecast.issue ?? null,
  window: hours,
  /* Carried, not summarised. */
  calibrated: forecast.methodology?.calibrated ?? null,
  seeding: forecast.methodology?.seedDistribution ?? null,
  sensitivityMeaning: forecast.methodology?.sensitivityMeaning ?? null,
  simulations: forecast.total ?? null,
  contacts: win.contacts ?? null,
  afloat: win.afloat ?? null,
  outOfArea: win.outOfArea ?? null,
  max,
  source: 'electiction/chivargo-sichang · Copernicus SMOC via Open-Meteo · coastline © OpenStreetMap contributors',
  segments,
};

mkdirSync(dirname(values.out), { recursive: true });
writeFileSync(values.out, `${JSON.stringify(out)}\n`);

const hit = segments.filter((s) => s.count > 0).length;
console.log(`[chivago] ${values.out}`);
console.log(`  model ${out.model}, issued ${out.issued}, ${hours}h window`);
console.log(`  ${segments.length} segments, ${hit} of them reached, busiest ${max}`);
console.log(`  ${out.contacts} contacts, ${out.afloat} afloat, ${out.outOfArea} out of area, calibrated: ${out.calibrated}`);
