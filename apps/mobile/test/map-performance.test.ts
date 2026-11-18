/**
 * The 3D map does not work while nobody is looking.
 *
 * The browser map cannot be mounted in this harness - MapLibre needs a real
 * `document` and a GL context - so its idle behaviour is held here at source
 * level, the way `reachable.test.ts` holds the navigator's wiring. Each of
 * these was a measured or read cause of lag on the Map screen:
 *
 *   - a 3 Hz `triggerRepaint()` that re-rendered the whole 3D island
 *     forever, including mid-pan and while scrolled off screen;
 *   - a 45-second camera drift rendering every frame for a map scrolled
 *     out of view, competing with the scroll the reader was doing;
 *   - a label pass that forced one layout per pin, five times a second;
 *   - `filter: drop-shadow` on markers MapLibre moves every frame.
 *
 * A test that only reads source can be fooled, so each one names the exact
 * line of reasoning it guards; the behaviour itself was checked in a browser.
 */

import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', 'src', 'components');
const terrain = readFileSync(join(ROOT, 'TerrainMap.tsx'), 'utf8');
const webview = readFileSync(join(ROOT, 'WebTerrainMap.tsx'), 'utf8');

/** The body of the tide's interval: from `const tide =` to its `TIDE_FPS)`. */
const tideBody = (() => {
  const start = terrain.indexOf('const tide = ');
  const end = terrain.indexOf('1000 / TIDE_FPS', start);
  assert.ok(start > 0 && end > start, 'the tide interval moved; update this test');
  return terrain.slice(start, end);
})();

describe('the idle animation stands aside', () => {
  test('the tide skips a tick while the camera moves, off screen, or hidden', () => {
    const guard = /if \(document\.hidden \|\| !onScreen \|\| m\.isMoving\(\)\) return;/;
    assert.match(tideBody, guard, 'the tide no longer checks whether anybody is looking or dragging');
    // The guard must come BEFORE any paint write or repaint in the tick.
    const guardAt = tideBody.search(guard);
    for (const work of ['setPaintProperty', 'triggerRepaint', 'paintClouds']) {
      const at = tideBody.indexOf(work);
      assert.ok(at === -1 || at > guardAt, `${work} runs before the guard`);
    }
  });

  test('visibility comes from the browser, and is let go of on teardown', () => {
    assert.match(terrain, /new IntersectionObserver\(/, 'nothing watches whether the map is on screen');
    assert.match(terrain, /sight\?\.disconnect\(\);/, 'the observer outlives the map');
  });

  test('the drift ends when the map leaves the screen, and never starts off it', () => {
    assert.match(terrain, /if \(!onScreen && drifting\) \{ drifting = false; m\.stop\(\); \}/);
    assert.match(terrain, /if \(focusRef\.current \|\| !onScreen \|\| driftLayerActive\.current\) return;\s*drifting = true;/);
  });

  test('numbered forecast points stop the camera before they become interactive', () => {
    assert.match(terrain, /driftLayerActive\.current = driftPoints\.length > 0;[\s\S]*?m\.stop\(\);/);
    assert.match(terrain, /addEventListener\('pointerdown',[\s\S]*?onSelectDriftPoint\?\.\(point\);/);
  });

  test('forecast points stay inside a north-up view and the old camera returns afterwards', () => {
    assert.match(terrain, /driftReturnMinZoom\.current = m\.getMinZoom\(\);[\s\S]*?m\.setMinZoom\(12\.5\);/);
    assert.match(terrain, /driftReturnMaxBounds\.current = m\.getMaxBounds\(\);[\s\S]*?m\.setMaxBounds\(null\);/);
    assert.match(terrain, /m\.fitBounds\(forecastBounds, \{[\s\S]*?maxZoom: 13\.2, pitch: 0, bearing: 0, duration: 0,/);
    assert.match(terrain, /m\.once\('idle', frameForecast\);/);
    assert.match(terrain, /if \(returnMinZoom != null\) m\.setMinZoom\(returnMinZoom\);/);
    assert.match(terrain, /if \(returnMaxBounds\) m\.setMaxBounds\(returnMaxBounds\);/);
    assert.match(terrain, /if \(returnPose\) m\.easeTo\(\{ \.\.\.returnPose, duration: 450, essential: true \}\);/);
  });
});

describe('the label pass reads once, then writes', () => {
  const relabel = (() => {
    const start = terrain.indexOf('const relabel = () => {');
    const end = terrain.indexOf('let lastRun = 0;', start);
    assert.ok(start > 0 && end > start, 'relabel moved; update this test');
    return terrain.slice(start, end);
  })();

  test('no pin is measured between two writes to its own position', () => {
    // The old loop: zero a chip's left, read its box, write its left - per pin.
    assert.doesNotMatch(
      relabel,
      /row\.style\.left = '0px';\s*row\.style\.top = '0px';\s*const box = row\.getBoundingClientRect\(\);/,
      'the per-pin write-read-write loop is back',
    );
    assert.match(relabel, /const rowBoxes = rows\.map\(/, 'the chips are no longer measured in one pass');
  });

  test('quest tags are measured in batches too', () => {
    assert.match(terrain, /const slides = ordered\.map\(/);
    assert.match(terrain, /const tagBoxes = ordered\.map\(/);
  });
});

describe('markers that move every frame carry no filter', () => {
  test('shop pins use box-shadow, not drop-shadow, on both maps', () => {
    const webPin = /\.cg-shop-pin\{[^}]*\}/.exec(terrain)?.[0] ?? '';
    const nativePin = /\.shop-pin\{[^}]*\}/.exec(webview)?.[0] ?? '';
    assert.ok(webPin && nativePin, 'the shop pin rules moved; update this test');
    assert.doesNotMatch(webPin, /filter:\s*drop-shadow/, 'the web shop pin is filtered again');
    assert.doesNotMatch(nativePin, /filter:\s*drop-shadow/, 'the native shop pin is filtered again');
  });
});
