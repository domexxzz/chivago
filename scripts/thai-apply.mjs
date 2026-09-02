/**
 * Write a native speaker's corrections back into the source.
 *
 *   node scripts/thai-apply.mjs corrections.json
 *   node scripts/thai-apply.mjs corrections.json --dry-run
 *
 * The input is what the review page exports: `{ file, line, th, newTh }` per
 * change. Each is applied ONLY if the Thai literal on that line still reads
 * exactly `th` - the source may have moved since the page was generated, and
 * a correction landing on the wrong string is worse than one that is
 * refused. Refusals are listed with the reason; nothing is written for them.
 *
 * Quotes and escapes are handled by re-quoting `newTh` the way the original
 * literal was quoted. A correction that contains the quote character is
 * escaped, not rejected, because a Thai sentence with an apostrophe in it is
 * an ordinary thing.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { THAI } from './lib/thai-pairs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const escapeFor = (quote, s) => s
  .replace(/\\/g, '\\\\')
  .replace(new RegExp(quote, 'g'), `\\${quote}`)
  .replace(/\n/g, '\\n');

/** Find the quoted literal equal to `th` on one line; return [start, end, quote]. */
function locate(lineText, th) {
  for (const quote of ["'", '"', '`']) {
    const needle = `${quote}${escapeFor(quote, th)}${quote}`;
    const at = lineText.indexOf(needle);
    if (at !== -1) return { start: at, end: at + needle.length, quote };
  }
  return null;
}

export function applyCorrections(root, corrections, { write = true } = {}) {
  const byFile = new Map();
  for (const c of corrections) {
    if (!byFile.has(c.file)) byFile.set(c.file, []);
    byFile.get(c.file).push(c);
  }
  const applied = [];
  const refused = [];

  for (const [file, cs] of byFile) {
    const path = join(root, file);
    let lines;
    try {
      lines = readFileSync(path, 'utf8').split('\n');
    } catch {
      for (const c of cs) refused.push({ ...c, why: 'file not found' });
      continue;
    }
    // Bottom-up so an earlier edit on the same line cannot shift a later one.
    for (const c of [...cs].sort((a, b) => b.line - a.line)) {
      const text = lines[c.line - 1];
      if (text === undefined) { refused.push({ ...c, why: 'line does not exist' }); continue; }
      if (typeof c.newTh !== 'string' || c.newTh.trim() === '') { refused.push({ ...c, why: 'empty correction' }); continue; }
      if (!THAI.test(c.newTh) && THAI.test(c.th)) { refused.push({ ...c, why: 'correction contains no Thai' }); continue; }
      const hit = locate(text, c.th);
      if (!hit) { refused.push({ ...c, why: 'the original Thai is no longer on that line' }); continue; }
      const replacement = `${hit.quote}${escapeFor(hit.quote, c.newTh)}${hit.quote}`;
      lines[c.line - 1] = text.slice(0, hit.start) + replacement + text.slice(hit.end);
      applied.push(c);
    }
    if (write) writeFileSync(path, lines.join('\n'), 'utf8');
  }
  return { applied, refused };
}

// Only when run directly. The test imports `applyCorrections` and must not
// be told to supply a corrections file.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const input = process.argv[2];
  if (!input) {
    console.error('usage: node scripts/thai-apply.mjs corrections.json [--dry-run]');
    process.exit(2);
  }
  const dryRun = process.argv.includes('--dry-run');
  const corrections = JSON.parse(readFileSync(resolve(process.cwd(), input), 'utf8'));
  const { applied, refused } = applyCorrections(ROOT, corrections, { write: !dryRun });
  for (const c of applied) console.log(`  ok       ${c.file}:${c.line}`);
  for (const c of refused) console.log(`  REFUSED  ${c.file}:${c.line} — ${c.why}`);
  console.log(`\n  ${applied.length} applied${dryRun ? ' (dry run, nothing written)' : ''}, ${refused.length} refused.`);
  if (applied.length > 0 && !dryRun) {
    console.log('  Re-run the tests: the strings are read by 1,200 of them.');
  }
  process.exit(refused.length > 0 ? 1 : 0);
}
