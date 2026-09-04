import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

import { MASCOTS, MASCOT_COUNT } from '@chivago/core';
import { MascotMark, SealedMark } from '../src/components/MascotMark.tsx';
import { MascotGrid } from '../src/screens/MascotsScreen.tsx';
import { h, html, labels } from './render.ts';

/**
 * Seventy-seven marks, drawn; and the guide that lists them.
 */

describe('every mascot has a mark', () => {
  test('all seventy-seven draw without a renderer', () => {
    // The harness renders react-native-svg as plain views, so what can be
    // held here is that each mark builds and is not empty; what it looks
    // like is checked in a browser.
    for (const m of MASCOTS) {
      let out = '';
      assert.doesNotThrow(() => { out = html(h(MascotMark, { mascot: m })); }, `${m.key} threw`);
      assert.ok(out.length > 200, `${m.key} drew nothing`);
    }
  });

  test('a sealed egg is one shape whatever the province', () => {
    const a = html(h(SealedMark, { speckle: '#5f8f4a' }));
    const b = html(h(SealedMark, { speckle: '#3f8fbf' }));
    assert.equal(a.replace(/#5f8f4a/g, 'X'), b.replace(/#3f8fbf/g, 'X'), 'the egg gives nothing away but the region');
  });
});

describe('the field guide', () => {
  test('lists all seventy-seven, and stamps only the provinces reached', () => {
    const visited = new Set(['TH-84', 'TH-20']);
    const el = h(MascotGrid, { visited, onOpen: () => {} });
    const spoken = labels(el);
    const cards = spoken.filter((l) => /Been there|Not yet|ไปมาแล้ว|ยังไม่เคยไป/.test(l));
    assert.equal(cards.length, MASCOT_COUNT);
    assert.equal(cards.filter((l) => /Been there|ไปมาแล้ว/.test(l)).length, 2);
  });

  test('nobody has been anywhere: seventy-seven cards, none stamped, none hidden', () => {
    const spoken = labels(h(MascotGrid, { visited: new Set<string>(), onOpen: () => {} }));
    assert.equal(spoken.filter((l) => /Not yet|ยังไม่เคยไป/.test(l)).length, MASCOT_COUNT);
  });
});
