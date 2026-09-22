import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';
import { readFileSync } from 'node:fs';

import { MASCOTS } from '@chivago/core';
import { CreatureScene } from '../src/components/CreatureScene.tsx';
import { h, html } from './render.ts';

/**
 * There is never nothing where the animal goes.
 *
 * The room is three.js, loaded lazily, and for as long as it is arriving
 * React shows the Suspense fallback. That fallback used to be an empty
 * coloured box — which is invisible on a warm cache and, on the first open
 * over a beach's signal, is a blank rectangle holding ~700 KB of silence.
 *
 * A spinner would have been the obvious repair and the worse one. The right
 * thing to put in the space where the animal goes is the animal: the drawn
 * mark already shipped, already breathing, already what every phone sees.
 *
 * Two things are held here, and neither can be held by rendering alone. The
 * harness has no `document`, so `Creature3D` is null and the drawn branch is
 * the only one that ever runs in a test — the fallback wiring is invisible to
 * it. So the wiring is read off the source, and what it falls back TO is
 * rendered.
 */

const SOURCE = readFileSync(
  new URL('../src/components/CreatureScene.tsx', import.meta.url),
  'utf8',
);

/**
 * The text inside `fallback={...}`, brace-counted rather than matched.
 *
 * A regex for this is a trap: the first `}` inside the JSX ends it, so
 * `fallback={<DrawnScene species={species} .../>}` reads as
 * `<DrawnScene species={species`, and every assertion below then tests a
 * fragment instead of the thing.
 */
const fallbackExpr = (source: string): string => {
  const open = source.indexOf('fallback={');
  if (open === -1) return '';
  let depth = 0;
  for (let i = open + 'fallback='.length; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open + 'fallback={'.length, i);
    }
  }
  return '';
};

describe('the lazy room never shows an empty box', () => {
  test('the Suspense fallback is the drawn animal, not a blank view', () => {
    const fallback = fallbackExpr(SOURCE);
    assert.notEqual(fallback, '', 'no Suspense fallback found at all');
    assert.match(fallback, /DrawnScene/, `the fallback is not the drawn animal: ${fallback}`);
    assert.ok(
      !/^<View\b/.test(fallback.trim()),
      `the fallback is a bare View again — an empty box is what this test exists to stop: ${fallback}`,
    );
  });

  test('the fallback is given the room’s height, so nothing reflows under a thumb', () => {
    // A drawn mark shorter than the room means the page jumps the moment the
    // scene arrives, which is a worse reading experience than the blank was.
    const fallback = fallbackExpr(SOURCE);
    assert.match(fallback, /height=\{height\}/, 'the fallback does not take the room’s height');
  });

  test('what it falls back to actually draws something', () => {
    // The assertions above are about wiring. This one is about there being an
    // animal at the end of it.
    const out = html(h(CreatureScene, {
      species: 'coconut-macaque',
      stage: 'hatchling',
      label: 'Macaque, hatchling',
    }));
    assert.ok(out.length > 200, 'the drawn scene rendered nothing');
  });

  test('a mascot falls back to its own portrait, not a generic one', () => {
    const suratthani = MASCOTS.find((m) => m.code === 'TH-84');
    assert.ok(suratthani);
    const mine = html(h(CreatureScene, {
      species: 'x', mascot: suratthani, stage: 'grown', label: 'Ngo, grown',
    }));
    const other = html(h(CreatureScene, {
      species: 'x', mascot: MASCOTS.find((m) => m.code === 'TH-75'), stage: 'grown', label: 'Pla Thu, grown',
    }));
    assert.notEqual(mine, other, 'two provinces drew the same body while waiting');
  });

  test('an egg stays an egg while the room loads', () => {
    // A mascot at the egg stage must not leak its portrait early: the whole
    // point of a sealed egg is that the province is not yet known.
    const egg = html(h(CreatureScene, {
      species: 'x', mascot: MASCOTS.find((m) => m.code === 'TH-84'), stage: 'egg', label: 'An egg',
    }));
    const grown = html(h(CreatureScene, {
      species: 'x', mascot: MASCOTS.find((m) => m.code === 'TH-84'), stage: 'grown', label: 'Ngo, grown',
    }));
    assert.notEqual(egg, grown, 'the egg drew the grown mascot');
  });
});
