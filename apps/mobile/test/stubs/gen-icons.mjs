/**
 * Generate `icons.mjs` from the icons the app actually imports.
 *
 *   node apps/mobile/test/stubs/gen-icons.mjs
 *
 * A hand-kept stub list broke three separate times in one afternoon. An ES
 * module namespace is built by static analysis, so an icon nobody remembered
 * to add throws at import and takes the whole test file with it — a failure
 * that has nothing to do with the change that triggered it, which is the
 * expensive kind.
 *
 * Reading the imports is the only version that cannot fall behind them.
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, '..', '..', 'src');
const OUT = join(here, 'icons.mjs');

const files = [];
const walk = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (/\.tsx?$/.test(entry.name)) files.push(path);
  }
};
walk(SRC);

const used = new Set();
for (const file of files) {
  const match = readFileSync(file, 'utf8')
    .match(/import\s*\{([^}]*)\}\s*from\s*'lucide-react-native';/);
  if (!match) continue;
  for (const part of match[1].split(',')) {
    // `Map as MapIcon` exports Map. The alias is the importer's business.
    const name = part.trim().split(/\s+as\s+/)[0];
    if (name) used.add(name);
  }
}

const names = [...used].sort();

writeFileSync(OUT, [
  '/**',
  ' * Icons carry no text. Every name resolves to a component that renders nothing.',
  ' *',
  ' * GENERATED — do not edit by hand. Re-run after adding an icon:',
  ' *   node apps/mobile/test/stubs/gen-icons.mjs',
  ' */',
  'const Icon = () => null;',
  'export default Icon;',
  ...names.map((n) => `export const ${n} = Icon;`),
  '',
].join('\n'), 'utf8');

console.log(`[chivago] icons stub: ${names.length} icons from ${files.length} source files`);
console.log(`          ${names.join(' ')}`);
