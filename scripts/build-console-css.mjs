/**
 * Turn the console stylesheet into a module.
 *
 *   node scripts/build-console-css.mjs          # write it
 *   node scripts/build-console-css.mjs --check  # fail if it is stale
 *
 * WHY THIS EXISTS. `apps/api/public/modernist.css` used to be read from disk
 * when the console asked for it. There is no disk on Cloudflare Workers, and
 * the route answered 503 there - which is not cosmetic: `html.ts` styles its
 * inputs with `border: 2px solid var(--color-text)`, so with no stylesheet the
 * custom property is undefined, the whole shorthand is invalid, the border
 * computes to none, and the first three required fields on /console/apply are
 * INVISIBLE to the business trying to fill them in.
 *
 * WHY NOT WORKERS ASSETS. That would work, but it would make a stylesheet the
 * console cannot do without depend on a deploy step somebody can forget. In
 * the bundle it is simply always there.
 *
 * WHY NOT WRITE THE CSS INSIDE THE .ts FILE. Because then it stops being CSS:
 * no editor support, no linting, no highlighting, for 257 lines somebody will
 * eventually have to edit. The .css file stays the source of truth; this makes
 * the copy the bundle needs, and `stylesheet.test.ts` fails the build if the
 * two ever drift.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const CSS_SOURCE = join(root, 'apps', 'api', 'public', 'modernist.css');
export const CSS_MODULE = join(root, 'apps', 'api', 'src', 'console', 'stylesheet.ts');

/**
 * The module text, from the stylesheet.
 *
 * Exported so the test can build the expected text and compare, rather than
 * re-implementing the escaping and comparing something subtly different.
 */
export function moduleTextFor(css) {
  /*
    A template literal, so the CSS reads as CSS in the generated file too.
    Three characters have to be escaped or they would end it or interpolate:
    a backtick, a backslash, and the `${` that opens a substitution. The
    stylesheet contains none of them today; the escaping is here so that the
    day one arrives it is a correct file rather than a syntax error.
  */
  const escaped = css
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$\{/g, '\\${');

  return `/**
 * The console stylesheet, as a module.
 *
 * GENERATED. Do not edit: edit \`apps/api/public/modernist.css\` and run
 *
 *     node scripts/build-console-css.mjs
 *
 * \`stylesheet.test.ts\` fails if this file and the stylesheet disagree, so a
 * forgotten regeneration is a red build and not an unstyled console.
 *
 * It is a module rather than a file read from disk because Cloudflare Workers
 * has no disk, and rather than a Workers Asset because the console cannot do
 * without it - see the header of the generator for what an unstyled console
 * actually costs.
 */

export const MODERNIST_CSS = \`${escaped}\`;
`;
}

const css = readFileSync(CSS_SOURCE, 'utf8');
const wanted = moduleTextFor(css);

if (process.argv.includes('--check')) {
  const found = readFileSync(CSS_MODULE, 'utf8');
  if (found !== wanted) {
    console.error('[chivago] apps/api/src/console/stylesheet.ts is stale.');
    console.error('          Run: node scripts/build-console-css.mjs');
    process.exit(1);
  }
  console.log('[chivago] the console stylesheet module is up to date.');
} else {
  writeFileSync(CSS_MODULE, wanted, 'utf8');
  console.log(`[chivago] wrote ${CSS_MODULE} (${css.length} bytes of CSS)`);
}
