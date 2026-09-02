import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

import {
  HERO, SAMUI_BOUNDS, chivagoStyle, heroPose, introPose, settleEasing,
} from '../src/components/terrain-style.ts';
import { SAMUI_BBOX } from '@chivago/core';
import { color } from '../src/theme/index.ts';

/**
 * The web hero's style, held to the rules it was drawn under.
 *
 * The map itself needs a browser and a GPU; the STYLE is data, and data can
 * be checked here. What these prove is that the rules survive the next person
 * who "just tweaks a colour".
 */

const style = chivagoStyle();
const layer = (id: string) => {
  const found = style.layers.find((l) => l.id === id);
  assert.ok(found, `no layer '${id}'`);
  return found;
};

describe('green is for verified evidence, and nothing on the map wears it', () => {
  test('no layer uses any green from the accent ramp', () => {
    // `accent2` is the red. Everything else called accent is the green a host
    // verified, and a forest in it would spend that meaning on trees.
    const greens = Object.entries(color)
      .filter(([name]) => /^accent$|^accent[1-9]00$/.test(name))
      .map(([, hex]) => hex.toLowerCase());
    assert.ok(greens.length >= 5, 'the green ramp should exist');

    for (const l of style.layers) {
      const painted = JSON.stringify({ paint: l.paint, layout: l.layout }).toLowerCase();
      for (const green of greens) {
        assert.ok(!painted.includes(green), `layer '${l.id}' is painted ${green}`);
      }
    }
  });
});

describe('the coastline is real, and drawn the right way up', () => {
  test('the land is the background and the sea is a fill over it', () => {
    // OpenMapTiles has no land polygon. Getting this backwards renders the
    // whole island as sea - which is exactly what the first version did.
    assert.equal(style.layers[0]?.type, 'background');
    const sea = layer('sea');
    assert.equal(sea.type, 'fill');
    assert.equal((sea as { 'source-layer'?: string })['source-layer'], 'water');
  });

  test('the sea covers the hillshade, so the elevation model cannot shade the water', () => {
    const order = style.layers.map((l) => l.id);
    assert.ok(order.indexOf('hillshade') < order.indexOf('sea'));
  });

  test('the 3D mesh and the hillshade read separate elevation sources', () => {
    // One shared source makes MapLibre warn that quality suffers. Two names
    // for the same tiles cost nothing: the browser cache serves the second.
    const hill = layer('hillshade') as { source?: string };
    assert.notEqual(hill.source, 'terrain');
    for (const id of ['terrain', hill.source!]) {
      const src = style.sources[id] as { type: string; encoding?: string };
      assert.equal(src.type, 'raster-dem', `${id} should be elevation`);
      assert.equal(src.encoding, 'terrarium', `${id}: the wrong encoding renders plausible wrong heights`);
    }
  });
});

describe('what the labels say', () => {
  const labels = layer('place-labels') as { filter?: unknown; layout?: { 'text-field'?: unknown } };
  const textField = JSON.stringify(labels.layout?.['text-field']);
  const filter = JSON.stringify(labels.filter);

  test('place names lead in English, fall back to Latin, then to whatever there is', () => {
    assert.ok(textField.includes('["coalesce",["get","name:en"],["get","name:latin"],["get","name"]]'));
  });

  test('the "Baan" that OpenStreetMap prefixes to a village is dropped, so the label matches the pin', () => {
    // Chaweng, not Baan Chaweng: the pin says CHAWENG and so does everybody.
    assert.ok(textField.includes('"Baan "'), 'the five-letter prefix');
    assert.ok(textField.includes('"Ban "'), 'and the four-letter spelling of the same word');
  });

  test('only places with an English name are labelled', () => {
    assert.ok(filter.includes('["has","name:en"]'));
  });

  test('"Moo N" - administrative village number N - is not a place name and is not shown', () => {
    assert.ok(filter.includes('"Moo "'));
  });
});

describe('free, and stays free', () => {
  test('no source URL carries a key or token', () => {
    const urls = Object.values(style.sources).flatMap((s) => {
      const src = s as { url?: string; tiles?: string[] };
      return [src.url, ...(src.tiles ?? [])].filter((u): u is string => !!u);
    });
    assert.ok(urls.length >= 3);
    for (const url of urls) {
      assert.doesNotMatch(url, /key=|token=|access_token|apikey/i, url);
    }
    assert.match(style.glyphs ?? '', /^https:\/\/tiles\.openfreemap\.org\//);
  });
});

describe('where the camera sits', () => {
  test('the settled pose is lifted from the flat fit, inside the island, at a pitch MapLibre allows', () => {
    const pose = heroPose(10.2);
    assert.ok(Math.abs(pose.zoom - (10.2 + HERO.zoomAboveFlat)) < 1e-9);
    assert.ok(pose.pitch <= 60, 'MapLibre clamps pitch to 60 by default; asking for more silently gets less');
    const [lng, lat] = pose.center;
    assert.ok(lng > SAMUI_BBOX.minLng && lng < SAMUI_BBOX.maxLng);
    assert.ok(lat > SAMUI_BBOX.minLat && lat < SAMUI_BBOX.maxLat);
  });

  test('the bounds handed to MapLibre are the island, south-west first', () => {
    assert.deepEqual(SAMUI_BOUNDS, [
      [SAMUI_BBOX.minLng, SAMUI_BBOX.minLat],
      [SAMUI_BBOX.maxLng, SAMUI_BBOX.maxLat],
    ]);
  });

  test('the intro starts lower, flatter and further round than where it settles', () => {
    const settled = heroPose(10.2);
    const intro = introPose(settled);
    assert.ok(intro.zoom < settled.zoom);
    assert.ok(intro.pitch < settled.pitch);
    assert.notEqual(intro.bearing, settled.bearing);
    assert.deepEqual(intro.center, settled.center, 'the intro is a rise and a swing, not a pan');
  });

  test('the settle easing starts at 0, ends at 1 and never overshoots', () => {
    assert.equal(settleEasing(0), 0);
    assert.equal(settleEasing(1), 1);
    let last = 0;
    for (let t = 0; t <= 1; t += 0.05) {
      const v = settleEasing(t);
      assert.ok(v >= last && v <= 1);
      last = v;
    }
  });
});
