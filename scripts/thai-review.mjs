/**
 * Collect every English/Thai pair in the product and check what a machine can.
 *
 *   node scripts/thai-review.mjs            # summary to the terminal
 *   node scripts/thai-review.mjs --json     # the full set, for the review page
 *
 * WHY THIS EXISTS. The Thai has never been read by a native speaker, and the
 * reason is not that nobody offered - it is that the copy lives in 23 files
 * next to code, and nobody is going to read a codebase to check a preposition.
 * This puts every pair in one place, in the order a reader meets them.
 *
 * WHAT IT CANNOT DO. It cannot tell you whether the Thai is good. Register,
 * naturalness, whether a Thai speaker would ever say it that way - none of
 * that is mechanical, and pretending otherwise would be the same mistake as
 * shipping the copy unreviewed. What it can do is narrow the pile: find the
 * pairs that are provably suspect, so the person doing the real work starts
 * with those instead of with 400 strings in alphabetical order.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const THAI = /[\u0E00-\u0E7F]/;

const files = [];
const walk = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!/node_modules|dist|__pycache__/.test(entry.name)) walk(path);
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\./.test(entry.name)) {
      files.push(path);
    }
  }
};
for (const r of ['packages/core/src', 'apps/mobile/src', 'apps/api/src']) walk(join(ROOT, r));

/**
 * The two shapes the codebase states a pair in.
 *
 * `t('English', 'ไทย')` is the strings file's helper; `{ en: '…', th: '…' }`
 * is everything else. Template literals are matched too, because several of
 * these interpolate a number into the sentence and that is exactly where a
 * translation tends to go wrong - Thai puts the classifier somewhere English
 * has no word for.
 */
const Q = String.raw`(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|\`((?:[^\`\\]|\\.)*)\`)`;
const PATTERNS = [
  new RegExp(String.raw`\bt\(\s*${Q}\s*,\s*${Q}\s*[,)]`, 'g'),
  new RegExp(String.raw`\ben:\s*${Q}\s*,\s*th:\s*${Q}`, 'g'),
];
const pick = (m, i) => m[i] ?? m[i + 1] ?? m[i + 2] ?? null;

const pairs = [];
for (const file of files) {
  const source = readFileSync(file, 'utf8');
  const lines = source.split('\n');
  for (const pattern of PATTERNS) {
    pattern.lastIndex = 0;
    let m;
    while ((m = pattern.exec(source)) !== null) {
      const en = pick(m, 1);
      const th = pick(m, 4);
      if (en === null || th === null) continue;
      const line = source.slice(0, m.index).split('\n').length;
      pairs.push({
        file: relative(ROOT, file).split('\\').join('/'),
        line,
        en,
        th,
        context: (lines[line - 2] ?? '').trim().slice(0, 90),
      });
    }
  }
}

// ---------------------------------------------------------------------------
// What a machine can actually check
// ---------------------------------------------------------------------------

/**
 * The interpolations a sentence carries.
 *
 * A number that appears in the English and not the Thai is a fact the Thai
 * reader does not get. This is the one class of error here that is unambiguous
 * - it needs no opinion about Thai at all.
 */
const slots = (s) => (s.match(/\$\{[^}]+\}/g) ?? [])
  .map((x) => x.replace(/\s+/g, ''))
  // A ternary whose branches are both string literals is grammar, not data:
  // `${n === 1 ? 'day' : 'days'}` exists because English inflects and Thai does
  // not. Counting those as dropped values flagged five correct translations
  // and buried the two real ones, which is how a checker stops being read.
  .filter((x) => !/\?\s*'[^']*'\s*:\s*'[^']*'\s*\}$/.test(x))
  .filter((x) => !/\?\s*"[^"]*"\s*:\s*"[^"]*"\s*\}$/.test(x))
  // The Thai side legitimately reaches for the Thai field of the same object.
  .map((x) => x.replace(/\.(en|th)\b/g, '.LANG'));

const findings = [];
const add = (pair, kind, detail) => findings.push({ ...pair, kind, detail });

for (const pair of pairs) {
  const { en, th } = pair;

  if (!THAI.test(th)) {
    add(pair, 'not-thai', 'The Thai side contains no Thai script at all.');
    continue;
  }
  if (en.trim() === th.trim()) {
    add(pair, 'untranslated', 'Both sides are identical.');
    continue;
  }

  const enSlots = slots(en);
  const thSlots = slots(th);
  const missing = enSlots.filter((s) => !thSlots.includes(s));
  if (missing.length > 0) {
    add(pair, 'lost-value', `The Thai drops ${missing.join(', ')} — a number the English shows and the Thai does not.`);
  }

  // Latin left inside Thai. Sometimes correct (SOS, QR, AQI, 1669), often not.
  const latin = th.match(/\b[A-Za-z][A-Za-z'’-]{2,}\b/g) ?? [];
  const allowed = /^(SOS|QR|AQI|EXP|ChivaGo|PDPA|LINE|WhatsApp|SMS|GPS|IUCN|LC|NT|VU|EN|CR|NE|km|kg|hr|Wi-Fi)$/i;
  const stray = [...new Set(latin.filter((w) => !allowed.test(w)))];
  if (stray.length > 0) {
    add(pair, 'english-left-in', `Untranslated in the Thai: ${stray.join(', ')}`);
  }

  // A Thai rendering far shorter than its English usually means a clause went
  // missing. Thai is compact, so the threshold is generous on purpose.
  if (en.length > 40 && th.length < en.length * 0.35) {
    add(pair, 'suspiciously-short', `${th.length} Thai characters against ${en.length} English — likely a dropped clause.`);
  }
}

/**
 * The same English phrase translated two different ways.
 *
 * The most valuable check here, and the one a reviewer would otherwise have to
 * hold in their head across 23 files: if "Green Points" is one thing on the
 * wallet and another in a notification, the reader cannot tell they are the
 * same thing.
 */
const byEnglish = new Map();
for (const p of pairs) {
  const key = p.en.trim().toLowerCase();
  if (!byEnglish.has(key)) byEnglish.set(key, new Map());
  const variants = byEnglish.get(key);
  if (!variants.has(p.th)) variants.set(p.th, []);
  variants.get(p.th).push(p);
}
for (const [english, variants] of byEnglish) {
  if (variants.size < 2 || english.length < 4) continue;
  const where = [...variants.entries()].map(([th, ps]) => ({ th, at: ps.map((p) => `${p.file}:${p.line}`) }));
  findings.push({
    file: where[0].at[0],
    line: 0,
    en: [...variants.values()][0][0].en,
    th: where.map((w) => w.th).join('   ·   '),
    kind: 'inconsistent',
    detail: `One English phrase, ${variants.size} different Thai renderings.`,
    variants: where,
  });
}

// ---------------------------------------------------------------------------

const order = ['not-thai', 'untranslated', 'lost-value', 'inconsistent', 'english-left-in', 'suspiciously-short'];
findings.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ pairs, findings }, null, 2));
} else {
  console.log(`\n  ${pairs.length} English/Thai pairs across ${new Set(pairs.map((p) => p.file)).size} files\n`);
  const counts = {};
  for (const f of findings) counts[f.kind] = (counts[f.kind] ?? 0) + 1;
  for (const kind of order) {
    if (counts[kind]) console.log(`  ${String(counts[kind]).padStart(4)}  ${kind}`);
  }
  console.log(`\n  ${findings.length} flagged for a human to look at first.`);
  console.log('  Everything else still needs reading — this only narrows the pile.\n');
}
