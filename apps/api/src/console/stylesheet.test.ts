/**
 * The generated stylesheet module, against the stylesheet.
 *
 * This is the guard that lets `public/modernist.css` stay the source of truth
 * while the bundle carries a copy. Without it, somebody edits the CSS, forgets
 * to regenerate, and the console quietly serves last week's styles - which for
 * this stylesheet is not a cosmetic difference: `html.ts` styles its inputs
 * with `border: 2px solid var(--color-text)`, so a missing or stale token can
 * make the required fields on /console/apply invisible.
 *
 * A red build is the cheap version of that failure.
 */

import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { MODERNIST_CSS } from './stylesheet.ts';

const CSS_PATH = join(import.meta.dirname, '..', '..', 'public', 'modernist.css');

describe('the console stylesheet module', () => {
  test('matches public/modernist.css exactly', () => {
    assert.equal(
      MODERNIST_CSS,
      readFileSync(CSS_PATH, 'utf8'),
      'stale: run `node scripts/build-console-css.mjs`',
    );
  });

  test('carries the tokens the console cannot render without', () => {
    /*
      Not a re-check of the equality above. These are the specific things
      `html.ts` depends on, named here so that deleting one from the CSS fails
      a test that says WHY rather than only "the files differ".
    */
    assert.match(MODERNIST_CSS, /--color-text\s*:/, 'the input border depends on this token');
    assert.match(MODERNIST_CSS, /:root/, 'the tokens need somewhere to live');
  });

  test('is not empty, and is the whole file', () => {
    // A generator bug that wrote an empty template literal would satisfy a
    // naive "is a string" check and serve a blank stylesheet.
    assert.ok(MODERNIST_CSS.length > 5_000, `suspiciously short: ${MODERNIST_CSS.length} bytes`);
  });

  test('survived the trip through a template literal intact', () => {
    // The generator escapes a backtick, a backslash and `${`. The stylesheet
    // has none today; if one is added, this is what proves the escaping worked
    // rather than mangling the CSS.
    assert.ok(!MODERNIST_CSS.includes('\\`'), 'an escape leaked into the value');
    assert.ok(!MODERNIST_CSS.includes('\\${'), 'an escape leaked into the value');
  });
});
