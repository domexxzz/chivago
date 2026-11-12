import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

import { MINI_GAMES, miniGame } from './index.ts';

/**
 * The rules a vendored game page has to keep.
 *
 * These pages are written outside this repository and dropped in whole. That
 * is the point of them and it is also the risk: nobody reviewing a product
 * change a year from now is going to read fifteen kilobytes of someone else's
 * HTML to notice that a font moved back to Google's servers, or that the
 * ending started promising a medal again. So the four things that actually
 * matter are assertions rather than good intentions.
 *
 * Deliberately NOT tested here: whether the game is any fun, whether the
 * bins are the right bins, whether dragging works. The first is a judgement,
 * and the other two need a browser - the game's own behaviour is checked by
 * playing it, which is honest, and this file does not pretend otherwise.
 */

describe('every mini-game page is self-contained', () => {
  for (const game of MINI_GAMES) {
    test(`${game.key} fetches nothing from anywhere`, () => {
      /*
        The whole point of the rule: the ferry has no signal, the island has
        patchy signal, and a page that reaches out for a font renders wrong
        exactly when somebody has time to play. It is also the privacy line -
        a request to a third party says who played and when.
      */
      const external = game.html.match(/https?:\/\/[^"' )]+/g) ?? [];
      assert.deepEqual(external, [], `${game.key} reaches the network`);
      assert.ok(!game.html.includes('//cdn'), `${game.key} reaches a CDN`);
      assert.ok(!/<link[^>]+href/i.test(game.html), `${game.key} links a stylesheet`);
      assert.ok(!/<script[^>]+src/i.test(game.html), `${game.key} loads a script`);
    });

    test(`${game.key} carries its artwork in the document`, () => {
      // A `data:` URI is neither fetched nor blocked as mixed content, which
      // is why the pictures are inline rather than in `assets/`.
      const inline = game.html.match(/data:image\/[a-z]+;base64,/g) ?? [];
      assert.ok(inline.length > 0, `${game.key} has no inline artwork`);
      assert.ok(!/<img[^>]+src="(?!data:)/.test(game.html), `${game.key} loads an image from outside itself`);
    });

    test(`${game.key} promises nothing the ledger would have to pay`, () => {
      /*
        The one that will be broken first, and quietly. A game page saying
        "you earned a medal" costs nothing to write and is a lie the moment
        somebody opens MedalsScreen - and a game page saying it awarded Green
        would be worse, because Green is evidence a host verified something.
      */
      for (const forbidden of ['เหรียญตรา', 'Green', 'แต้มเขียว', 'Trip']) {
        assert.ok(
          !game.html.includes(forbidden),
          `${game.key} says "${forbidden}" - a mini-game awards nothing outside its own page`,
        );
      }
    });
  }

  test('the waste game keeps the line that makes it advice', () => {
    // It tells people how to sort real rubbish. That sentence is the whole
    // difference between a game and instructions somebody might follow at a
    // collection point that works differently.
    const waste = miniGame('waste-sort');
    assert.ok(waste !== null);
    assert.match(waste.html, /ตรวจสอบประเภทที่จุดรับขยะในพื้นที่อีกครั้ง/);
    assert.match(waste.html, /คะแนนเป็นของเกมนี้เท่านั้น/);
  });

  test('the dialogs cannot escape onto the page', () => {
    // Both panels are <dialog>, which Safari got in 15.4. With no rule of its
    // own a dialog is just a block element, so on anything older the help
    // text and the result sat on the page from the moment it loaded.
    const waste = miniGame('waste-sort');
    assert.ok(waste !== null);
    assert.match(waste.html, /dialog:not\(\[open\]\)\{display:none\}/);
    assert.match(waste.html, /typeof d\.showModal!=='function'/);
  });
});

describe('the catalogue', () => {
  test('keys are unique, because the route carries one', () => {
    const keys = MINI_GAMES.map((g) => g.key);
    assert.equal(new Set(keys).size, keys.length);
  });

  test('a key nobody recognises is null, not a crash', () => {
    // A pushed route can outlive the entry it names - an old deep link, a
    // game withdrawn between releases. The screen shows a sentence.
    assert.equal(miniGame('no-such-game'), null);
    assert.equal(miniGame(''), null);
  });

  test('every game says which language it is in', () => {
    // The card is translated and the page is not. The screen says so up
    // front, and it can only do that because this field exists.
    for (const game of MINI_GAMES) {
      assert.ok(['en', 'th', 'zh'].includes(game.language), `${game.key} has no language`);
      assert.ok(game.name.en && game.name.th, `${game.key} is missing a name`);
      assert.equal(game.swatches.length, 4);
    }
  });
});
