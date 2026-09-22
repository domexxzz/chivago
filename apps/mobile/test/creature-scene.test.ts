import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';
import { readFileSync } from 'node:fs';

import { MASCOTS } from '@chivago/core';
import { CreatureScene } from '../src/components/CreatureScene.tsx';
import { h, html } from './render.ts';

/**
 * There is never nothing where the animal goes.
 *
 * The room is three.js, and the mistake it took two goes to find was not what
 * the Suspense fallback contained - it was that the import ran during render
 * at all. React suspended on the first commit, and the screen's first PAINT
 * went behind a 751 ms request (measured cold, on the deployed demo). A
 * fallback nobody has painted yet is not a fallback.
 *
 * So the room is fetched from an effect, behind two animation frames, and the
 * drawn animal - already shipped, already breathing, already what every phone
 * shows - is what stands there until it arrives.
 *
 * Two of these read the source. The harness has no `document`, so the room is
 * never wanted and the drawn branch is the only one a test ever runs; when the
 * import happens is invisible to rendering, and when is the whole point.
 */

const SOURCE = readFileSync(
  new URL('../src/components/CreatureScene.tsx', import.meta.url),
  'utf8',
);

/**
 * Where the module is actually FETCHED, as opposed to merely named.
 *
 * `typeof import('...')` appears earlier in the file to type the component,
 * and that occurrence is not a fetch. Matching the first one made both of the
 * assertions below read a type annotation and fail against correct code - so
 * the one that matters is the call with a `.then` after it.
 */
const runtimeImport = (): number => {
  const re = /import\('\.\/creature3d\/Creature3D\.tsx'\)\s*\r?\n?\s*(\/\/[^\n]*\n\s*)*\.then/;
  const m = re.exec(SOURCE);
  return m ? m.index : -1;
};

describe('the lazy room never shows an empty box', () => {
  test('three.js is not asked for during render', () => {
    // THE ONE THAT MATTERS. `React.lazy` starts its import while rendering,
    // so React suspends on the first commit and the screen's first paint is
    // queued behind ~200 KB of three.js - measured cold on the deployed demo
    // at 751 ms for the request alone. Whatever the Suspense fallback held
    // was irrelevant: nothing had been painted to hold it.
    // The CALL, not the name: the comment above `useRoom` explains what
    // `React.lazy` does wrong, and a test that forbade the words would forbid
    // the explanation of why they are forbidden.
    assert.ok(
      !/React\.lazy\s*\(/.test(SOURCE),
      'React.lazy is back - it imports during render, which is what put an empty screen in front of people',
    );
    const call = runtimeImport();
    assert.notEqual(call, -1, 'the room is never imported at all');
    const before = SOURCE.slice(0, call);
    assert.ok(
      before.lastIndexOf('React.useEffect') > before.lastIndexOf('return ('),
      'the import is not inside an effect - it will run during render again',
    );
  });

  test('the import waits for a painted frame, not just for an effect', () => {
    // An effect runs after commit but can still run before the browser has
    // painted. Two frames is the cheap, reliable way to mean AFTER PAINT: the
    // first fires before the paint that follows this commit, the second after.
    const before = SOURCE.slice(0, runtimeImport());
    const frames = (before.match(/requestAnimationFrame/g) ?? []).length;
    assert.ok(frames >= 2, `the import is behind ${frames} animation frame(s), not two`);
    assert.match(SOURCE, /cancelAnimationFrame/, 'the frame is never cancelled on unmount');
  });

  test('the stand-in holds the room’s height, so nothing reflows under a thumb', () => {
    // A drawn mark shorter than the room means the page jumps the moment the
    // scene arrives, which is a worse experience than the blank was.
    assert.match(SOURCE, /height=\{roomSuits \? height : undefined\}/);
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
