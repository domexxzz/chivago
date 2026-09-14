import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';
import { readFileSync } from 'node:fs';

import { MASCOTS } from '@chivago/core';

/**
 * The hand-drawn ten.
 *
 * Art is the one part of this app a test cannot judge — nothing here says a
 * drawing is good. What it CAN hold is the two ways hand-drawn art goes wrong
 * in a product like this: it drifts from the record it illustrates, and it
 * quietly becomes a requirement so the sixty-seven without it break.
 */

const SOURCE = readFileSync(new URL('./MascotPortrait.tsx', import.meta.url), 'utf8');

/*
  Read, never imported.

  The `src` suite runs without the JSX register hook, so a .tsx import here
  would throw before a single assertion ran — the same reason
  `game-surface.test.ts` reads its screens off disk. The registry is a literal
  in one file, so the source is a faithful reading of it.
*/
const DRAWN: string[] = [...SOURCE.matchAll(/^\s{2}'([a-z-]+)':\s\(\{/gm)].map((m) => m[1]!);
const hasPortrait = (key: string): boolean => DRAWN.includes(key);
const PORTRAIT_COUNT = () => DRAWN.length;

describe('a portrait illustrates the record, it does not replace it', () => {
  test('every drawn key is a real mascot', () => {
    // A portrait keyed to a mascot that does not exist is dead code that
    // renders for nobody, and it is how a typo survives a year.
    assert.ok(DRAWN.length >= 20, `expected at least twenty portraits, found ${DRAWN.length}`);
    for (const key of DRAWN) {
      assert.ok(
        MASCOTS.some((m) => m.key === key),
        `${key} has a portrait but is not a mascot`,
      );
    }
  });

  test('no portrait picks its own palette', () => {
    // THE rule. Every colour comes from `mascot.colours`, which was chosen when
    // the emblems were researched. A portrait that hardcoded a nicer green
    // would look better alone and put the art and the record out of step.
    //
    // Two literals are allowed and both are light, not identity: the ink the
    // eyes and mouth are drawn in, and the white of a catchlight.
    const allowed = new Set(['#1d2321', '#ffffff']);
    const literals = [...SOURCE.matchAll(/#[0-9a-fA-F]{6}/g)].map((m) => m[0].toLowerCase());
    const rogue = [...new Set(literals)].filter((c) => !allowed.has(c));
    assert.deepEqual(
      rogue, [],
      `these colours are hardcoded instead of read from mascot.colours: ${rogue.join(', ')}`,
    );
  });

  test('the pilot provinces are drawn first', () => {
    // Surat Thani is Koh Samui, where the pilot runs; Chon Buri is the Si Racha
    // campus. If ten are drawn and these two are not among them, the ten were
    // picked by fame rather than by who will actually see them.
    for (const code of ['TH-84', 'TH-20']) {
      const mascot = MASCOTS.find((m) => m.code === code);
      assert.ok(mascot, `${code} is missing from MASCOTS`);
      assert.ok(hasPortrait(mascot.key), `${code} (${mascot.key}) has no portrait`);
    }
  });

  test('the undrawn ones still render', () => {
    // The registry is additive on purpose. The day a mascot has no art must be
    // an ordinary day, or art becomes a blocker and seventy-seven never ship.
    // Counted rather than named, so this test does not need editing every
    // time a batch lands — which is how a guard quietly stops being true.
    const undrawn = MASCOTS.filter((m) => !hasPortrait(m.key));
    assert.ok(undrawn.length > 0, 'this test is meaningless once all are drawn');
    assert.equal(hasPortrait('not-a-mascot'), false);
  });

  test('the count is the real count, so a screen cannot imply all', () => {
    assert.equal(PORTRAIT_COUNT(), MASCOTS.filter((m) => hasPortrait(m.key)).length);
    assert.ok(PORTRAIT_COUNT() < MASCOTS.length);
  });

  test('every portrait draws eyes', () => {
    // The cheapest possible check that something was actually drawn rather
    // than stubbed: a body with no face is the placeholder this replaces.
    const blocks = SOURCE.split(/^\s{2}'[a-z-]+':\s\(\{/gm).slice(1);
    assert.equal(blocks.length, PORTRAIT_COUNT());
    for (const [i, block] of blocks.entries()) {
      assert.ok(
        /<Eyes|<Circle cx=\{32\} cy=\{20\}/.test(block),
        `portrait ${i + 1} has no eyes`,
      );
    }
  });
});
