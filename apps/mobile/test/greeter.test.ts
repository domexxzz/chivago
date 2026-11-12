/**
 * The island's greeter, on the surface a phone actually gets.
 *
 * The live model is web-only and arrives from a dynamic import behind two
 * animation frames, so nothing here can reach it and nothing here should try.
 * What these hold is the half that ships to every platform and is on screen
 * first everywhere: the painted portrait, its spoken label, the character's
 * name, and the line saying the art was made for this project rather than
 * found on an island.
 *
 * And the quiet half: that four of the five areas draw no greeter at all. The
 * registry is only safe while every surface renders without one, and the way
 * that stops being true is somebody adding a fallback here.
 */

import { describe, test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';

import { greeterFor } from '@chivago/core';
import { GreeterCard } from '../src/components/GreeterCard.tsx';
import { GreeterMark } from '../src/components/GreeterMark.tsx';
import { mount } from './interact.ts';
import { __setAreaForTests } from '../src/state/area.ts';

afterEach(() => { __setAreaForTests('samui'); });

describe('the greeter card', () => {
  test('Koh Sichang shows ChangChang, named and described', () => {
    const ui = mount(h(GreeterCard, { area: 'koh-sichang' }));
    try {
      const said = ui.text();
      assert.match(said, /ChangChang/, 'the card says who it is');
      assert.match(said, /travelling squirrel/, 'and what it is');
    } finally { ui.unmount(); }
  });

  test('the portrait is there before any model is, and is spoken for', () => {
    /*
      The portrait is what a phone shows and what the web shows while
      three.js is in flight. A card that reached this point with an empty
      frame would pass every text assertion above and still be the bug.
    */
    const ui = mount(h(GreeterCard, { area: 'koh-sichang' }));
    try {
      const labels = ui.labels();
      assert.ok(
        labels.some((l) => /ChangChang, a travelling squirrel/.test(l)),
        `nothing on the card is labelled for a screen reader: ${JSON.stringify(labels)}`,
      );
      const images = ui.renderer.root.findAll(
        (n) => typeof n.props?.source === 'object' && typeof n.props.source?.uri === 'string',
        { deep: true },
      );
      assert.ok(
        images.some((n) => String(n.props.source.uri).includes('changchang-greeting.png')),
        'the greeting portrait is not on the card',
      );
    } finally { ui.unmount(); }
  });

  test('it says the art was made, not found', () => {
    /*
      The one claim this card is allowed to make, and the reason greeters are
      not in `mascots.ts` or `companions.ts`. If this line ever goes quiet,
      an invented animal is sitting unmarked on the island's Home.
    */
    const ui = mount(h(GreeterCard, { area: 'koh-sichang' }));
    try {
      assert.match(ui.text(), /made for ChivaGo/i);
      assert.match(ui.text(), /[Nn]ot a species/);
    } finally { ui.unmount(); }
  });

  test('an area without a greeter draws nothing at all', () => {
    for (const area of ['samui', 'ku-sriracha', 'rmutt', 'ku-bangkhen'] as const) {
      assert.equal(greeterFor(area), null, `${area} gained a greeter; this test needs updating`);
      for (const Component of [GreeterCard, GreeterMark]) {
        const ui = mount(h(Component, { area }));
        try {
          assert.equal(ui.text(), '', `${area} drew something`);
          assert.equal(ui.renderer.toJSON(), null, `${area} drew an empty box, which still takes space`);
        } finally { ui.unmount(); }
      }
    }
  });
});

describe('the greeter in the header', () => {
  test('it is the small cut of the render, not the big one scaled down', () => {
    /*
      132 points of squirrel in a hero header. Pointing this at the 484 KB
      greeting portrait would work and would make every phone fetch it twice
      over, once at a size nobody can see.
    */
    const ui = mount(h(GreeterMark, { area: 'koh-sichang' }));
    try {
      const images = ui.renderer.root.findAll(
        (n) => typeof n.props?.source === 'object' && typeof n.props.source?.uri === 'string',
        { deep: true },
      );
      assert.equal(images.length, 1);
      assert.match(String(images[0].props.source.uri), /changchang-mark\.png$/);
    } finally { ui.unmount(); }
  });

  test('it is decorative: nothing here is announced twice on one screen', () => {
    /*
      The card lower down the same screen carries the name and the facts. A
      header mark that also introduced itself would say the same thing twice
      to the one person who cannot skim past the second time.
    */
    const ui = mount(h(GreeterMark, { area: 'koh-sichang' }));
    try {
      assert.deepEqual(ui.labels(), []);
      assert.equal(ui.text(), '');
    } finally { ui.unmount(); }
  });
});
