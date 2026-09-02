/**
 * Every English/Thai pair in the product, and what a machine can say about it.
 *
 * Pulled out of `thai-review.mjs` so the same collector feeds three things:
 * the terminal summary, the review page a native speaker reads, and the
 * `thai-apply.mjs` script that writes their corrections back. One reader of
 * the source, three consumers, no drift between them.
 *
 * WHAT IT CANNOT DO. It cannot tell you whether the Thai is good. Register,
 * naturalness, whether a Thai speaker would ever say it that way - none of
 * that is mechanical. What it can do is narrow the pile.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

export const THAI = /[\u0E00-\u0E7F]/;

/** Where the copy lives. Tests excluded: a fixture is not a screen. */
export const SOURCE_ROOTS = ['packages/core/src', 'apps/mobile/src', 'apps/api/src'];

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
const PATTERNS = () => [
  new RegExp(String.raw`\bt\(\s*${Q}\s*,\s*${Q}\s*[,)]`, 'g'),
  new RegExp(String.raw`\ben:\s*${Q}\s*,\s*th:\s*${Q}`, 'g'),
];
const pick = (m, i) => m[i] ?? m[i + 1] ?? m[i + 2] ?? null;
/** Which quote the Thai literal used, so a correction can be written back in kind. */
const quoteOf = (m, i) => (m[i] !== undefined ? "'" : m[i + 1] !== undefined ? '"' : '`');

export function sourceFiles(root, roots = SOURCE_ROOTS) {
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
  for (const r of roots) walk(join(root, r));
  return files.sort();
}

/** Every pair, in source order, with the line the Thai literal sits on. */
export function collectPairs(root, roots = SOURCE_ROOTS) {
  const pairs = [];
  for (const file of sourceFiles(root, roots)) {
    const source = readFileSync(file, 'utf8');
    const lines = source.split('\n');
    for (const pattern of PATTERNS()) {
      let m;
      while ((m = pattern.exec(source)) !== null) {
        const en = pick(m, 1);
        const th = pick(m, 4);
        if (en === null || th === null) continue;
        const line = source.slice(0, m.index).split('\n').length;
        pairs.push({
          id: `${relative(root, file).split('\\').join('/')}:${line}:${pairs.length}`,
          file: relative(root, file).split('\\').join('/'),
          line,
          en,
          th,
          thQuote: quoteOf(m, 4),
          context: (lines[line - 2] ?? '').trim().slice(0, 90),
        });
      }
    }
  }
  pairs.sort((a, b) => (a.file === b.file ? a.line - b.line : a.file.localeCompare(b.file)));
  return pairs;
}

/**
 * The interpolations a sentence carries.
 *
 * A number that appears in the English and not the Thai is a fact the Thai
 * reader does not get. This is the one class of error here that is unambiguous
 * - it needs no opinion about Thai at all.
 */
export const slots = (s) => (s.match(/\$\{[^}]+\}/g) ?? [])
  .map((x) => x.replace(/\s+/g, ''))
  // A ternary whose branches are both string literals is grammar, not data:
  // `${n === 1 ? 'day' : 'days'}` exists because English inflects and Thai does
  // not. Counting those as dropped values flagged five correct translations
  // and buried the two real ones, which is how a checker stops being read.
  .filter((x) => !/\?\s*'[^']*'\s*:\s*'[^']*'\s*\}$/.test(x))
  .filter((x) => !/\?\s*"[^"]*"\s*:\s*"[^"]*"\s*\}$/.test(x))
  // The Thai side legitimately reaches for the Thai field of the same object.
  .map((x) => x.replace(/\.(en|th)\b/g, '.LANG'));

/** Latin that is fine inside Thai copy: brands, units, codes a Thai reader knows. */
const ALLOWED_LATIN = /^(SOS|QR|AQI|EXP|ChivaGo|PDPA|LINE|WhatsApp|SMS|GPS|IUCN|LC|NT|VU|EN|CR|NE|km|kg|hr|Wi-Fi|Green|Trip|Points?|Level|Rank|Chiva|Balance|Safe|Food|Wellness|Quest|Koh|Samui|Chaweng|Lamai|Bophut|Nathon)$/i;

export const KINDS = ['not-thai', 'untranslated', 'lost-value', 'inconsistent', 'english-left-in', 'suspiciously-short'];

export function analyse(pairs) {
  const findings = [];
  const add = (pair, kind, detail) => findings.push({ id: pair.id, file: pair.file, line: pair.line, en: pair.en, th: pair.th, kind, detail });

  for (const pair of pairs) {
    const { en, th } = pair;

    if (!THAI.test(th)) {
      // A string of digits or a code is the same in both languages. That is
      // not a translation that went missing.
      if (/^[\d\s.,:/%+\-·]+$/.test(th) || th.trim() === en.trim()) continue;
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

    // Latin left inside Thai. Sometimes correct (SOS, QR, AQI, 1669), often
    // not. Interpolations are stripped first: `${s.layer}` is code, not a
    // word the reader sees, and counting its identifiers as "untranslated"
    // was most of the noise in the first version of this check.
    const visible = th.replace(/\$\{[^}]+\}/g, ' ');
    const latin = visible.match(/\b[A-Za-z][A-Za-z'’-]{2,}\b/g) ?? [];
    const stray = [...new Set(latin.filter((w) => !ALLOWED_LATIN.test(w)))];
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
   * The most valuable check here, and the one a reviewer would otherwise have
   * to hold in their head across 23 files: if "Green Points" is one thing on
   * the wallet and another in a notification, the reader cannot tell they are
   * the same thing.
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
    const where = [...variants.entries()].map(([th, ps]) => ({ th, at: ps.map((p) => `${p.file}:${p.line}`), ids: ps.map((p) => p.id) }));
    const first = [...variants.values()][0][0];
    findings.push({
      id: first.id,
      file: first.file,
      line: first.line,
      en: first.en,
      th: where.map((w) => w.th).join('   ·   '),
      kind: 'inconsistent',
      detail: `One English phrase, ${variants.size} different Thai renderings.`,
      variants: where,
    });
  }

  findings.sort((a, b) => KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind));
  return findings;
}
