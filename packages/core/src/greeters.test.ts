import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

import { GREETERS, GREETER_COUNT, greeterFor } from './greeters.ts';
import { AREAS, isAreaKey } from './areas.ts';
import { SPECIES } from './companions.ts';
import { MASCOTS } from './mascots.ts';

describe('area greeters', () => {
  test('every greeter belongs to an area that exists', () => {
    for (const g of GREETERS) {
      assert.ok(isAreaKey(g.area), `${g.key} greets "${g.area}", which is not an area`);
    }
  });

  test('at most one greeter an area, so a screen never has to choose', () => {
    const seen = new Set<string>();
    for (const g of GREETERS) {
      assert.ok(!seen.has(g.area), `${g.area} has more than one greeter`);
      seen.add(g.area);
    }
  });

  test('an area without one gets null rather than a stand-in', () => {
    /*
      The registry rule. Every surface that shows a greeter has to render
      without it, because four of the five areas have none and nobody is
      working on them. A fallback here would hide that from the screens and
      they would stop handling it.
    */
    const without = AREAS.filter((a) => greeterFor(a.key) === null);
    assert.ok(without.length > 0, 'this test is pointless once every area has a greeter');
    assert.equal(GREETER_COUNT + without.length, AREAS.length);
  });

  test('Koh Sichang, the pilot, has ChangChang', () => {
    const g = greeterFor('koh-sichang');
    assert.ok(g);
    assert.equal(g.key, 'changchang');
    assert.equal(g.name.th, 'ชังชัง');
  });

  test('every greeter says what it is in all three languages', () => {
    for (const g of GREETERS) {
      for (const field of ['name', 'creature', 'blurb', 'made'] as const) {
        for (const lang of ['en', 'th', 'zh'] as const) {
          assert.ok(g[field][lang], `${g.key}.${field} has no ${lang}`);
        }
      }
    }
  });

  test('every greeter says where its art came from', () => {
    /*
      `made` is the whole reason this list is separate from the two that
      describe real things. A greeter that did not carry its provenance
      would be an invented animal sitting unmarked beside researched ones.
    */
    for (const g of GREETERS) {
      assert.ok(g.made.en.length > 20, `${g.key} does not say who made it`);
    }
  });

  test('art lives under /media/, which is the only prefix a web export serves', () => {
    /*
      Not /assets/: that is Metro's own URL namespace and `expo start --web`
      answers it from the bundler registry instead of public/, so every file
      under it is a 404 for the whole of development. The comment at the top
      of apps/mobile/src/api/photos.ts is the measurement.
    */
    for (const g of GREETERS) {
      for (const path of [g.portrait, g.mark, g.model, g.modelDetailed]) {
        assert.ok(path.startsWith('/media/'), `${g.key}: ${path} is not under /media/`);
      }
    }
  });

  test('a greeter is not a companion species and not a province emblem', () => {
    /*
      Held as a test and not only as a comment, because the cheap way to add
      the next one is to paste it into whichever list is open. These three
      lists make three different claims and only this one is allowed to be
      about a character somebody invented.
    */
    const species = new Set(Object.values(SPECIES).map((s) => s.key));
    const emblems = new Set(MASCOTS.map((m) => m.key));
    for (const g of GREETERS) {
      assert.ok(!species.has(g.key), `${g.key} is also a companion species`);
      assert.ok(!emblems.has(g.key), `${g.key} is also a province emblem`);
    }
  });
});
