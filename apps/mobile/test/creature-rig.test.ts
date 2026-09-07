import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

import {
  EVIDENCE_GREEN, HABITATS, LEAF_GREEN, LOOKS, REACTION_MS, headRatio, lightingFor, motionScale, placements,
  speckles, stageScale,
} from '../src/components/creature3d/rig.ts';
import { SPECIES } from '@chivago/core';

/**
 * The three-dimensional companions, held to their rules without a renderer.
 *
 * The scene itself needs WebGL and a document; everything it decides FROM is
 * in rig.ts, and these are the rules a person would otherwise have to check
 * by opening five rooms at five times of day.
 */

describe('the animals wear their own colours', () => {
  test('every species in core has a look, and every look names its species', () => {
    const keys = Object.values(SPECIES).map((s) => s.key).sort();
    assert.deepEqual(Object.keys(LOOKS).sort(), keys);
    for (const look of Object.values(LOOKS)) {
      const species = Object.values(SPECIES).find((s) => s.key === look.key)!;
      assert.equal(look.layer, species.layer, `${look.key} is drawn in the wrong habitat`);
    }
  });

  test('no animal wears the evidence green, in its fur or its clothes', () => {
    // Green means a host verified something. A turtle is olive; a macaque is
    // brown. The stage is said by size and by the badge, never by the colour.
    for (const look of Object.values(LOOKS)) {
      for (const [part, hex] of [...Object.entries(look.colours), ...Object.entries(look.wear)]) {
        assert.notEqual(hex.toLowerCase(), EVIDENCE_GREEN, `${look.key}.${part}`);
        assert.match(hex, /^#[0-9a-f]{6}$/i, `${look.key}.${part} is not a hex colour`);
      }
    }
    // The sprout on three of the heads is a leaf, and a leaf is green - but not that one.
    assert.notEqual(LEAF_GREEN.toLowerCase(), EVIDENCE_GREEN);
  });

  test('the field marks are the ones you would name the animal by', () => {
    // From the reference art: a tan face on a brown macaque holding a dark
    // coconut; a golden crest and teal wings on a cream junglefowl; cream
    // suckers on a coral octopus; dark spots on an olive turtle under a brown
    // shell; dark horns on a brown buffalo.
    const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
    const light = (hex: string) => rgb(hex).reduce((a, b) => a + b, 0);
    const m = LOOKS['coconut-macaque'].colours;
    assert.ok(light(m.beak) > light(m.body), 'the macaque face is paler than its fur');
    assert.ok(light(m.feature) < light(m.body), 'the coconut is darker than the fur');
    const j = LOOKS['red-junglefowl'].colours;
    assert.ok(light(j.body) > 600, 'the junglefowl is cream');
    const [cr, cg, cb] = rgb(j.feature);
    assert.ok(cr > cg && cg > cb, 'the crest is gold: red over green over blue');
    const [tr, tg, tb] = rgb(j.accent!);
    assert.ok(tg > tr && tb > tr, 'the wings are teal');
    const o = LOOKS['day-octopus'].colours;
    assert.ok(light(o.feature) > light(o.body), 'the suckers are paler than the arm');
    const [or, og, ob] = rgb(o.body);
    assert.ok(or > og && og > ob, 'the octopus is coral');
    const t = LOOKS['green-turtle'].colours;
    assert.ok(light(t.feature) < light(t.body), 'the spots are darker than the skin');
    const [sr, sg, sb] = rgb(t.accent!);
    assert.ok(sr > sg && sg > sb, 'the shell is brown');
    const b = LOOKS['water-buffalo'].colours;
    assert.ok(light(b.feature) < light(b.body) && light(b.feature) < 0x90, 'the horns are dark');
  });

  test('every one of the five is dressed, and in cloth that is not the evidence green', () => {
    // The art puts all five in the same wardrobe: sash, shorts, rope belt.
    for (const look of Object.values(LOOKS)) {
      for (const part of ['sash', 'shorts', 'ink', 'accent', 'rope'] as const) {
        assert.match(look.wear[part], /^#[0-9a-f]{6}$/i, `${look.key} has no ${part}`);
      }
      assert.notEqual(look.wear.ink, look.wear.sash, `${look.key}: the pattern would vanish on its own sash`);
    }
  });
});

describe('an egg gives nothing away', () => {
  test('speckles are the habitat colour, and every habitat has one', () => {
    for (const h of Object.values(HABITATS)) {
      assert.match(h.speckle, /^#[0-9a-f]{6}$/i);
      for (const look of Object.values(LOOKS)) {
        assert.notEqual(h.speckle, look.colours.body, `${h.layer} speckle hints at ${look.key}`);
      }
    }
  });

  test('speckles are deterministic per habitat and differ between habitats', () => {
    assert.deepEqual(speckles('Green'), speckles('Green'));
    assert.notDeepEqual(speckles('Green'), speckles('Safe'));
    for (const s of speckles('Quest')) assert.ok(s.size > 0 && s.phi > 0 && s.phi < Math.PI);
  });
});

describe('stage is size, not species', () => {
  test('a hatchling is smaller with a bigger head; an egg is its own model', () => {
    assert.ok(stageScale('hatchling') < stageScale('grown'));
    assert.equal(stageScale('grown'), 1);
    assert.ok(headRatio('hatchling') > headRatio('grown'));
    assert.equal(headRatio('grown'), 1);
  });

  test('every species has a reaction, and none is instant or endless', () => {
    for (const ms of Object.values(REACTION_MS)) assert.ok(ms >= 500 && ms <= 3000);
  });
});

describe('the light follows the island clock', () => {
  test('noon is bright and white, dawn is golden, night is dim and blue', () => {
    const noon = lightingFor(12), dawn = lightingFor(6.5), night = lightingFor(23);
    assert.ok(noon.sun > dawn.sun && dawn.sun > night.sun);
    assert.ok(noon.elevation > dawn.elevation, 'the sun is higher at noon');
    assert.ok(night.skyDim < 0.5 && noon.skyDim > 0.9);
    // But a tropical night is not a cellar: the moon still lights the room.
    assert.ok(night.sun > 0.5 && night.exposure >= 0.9, 'a companion opened after dinner must be visible');
    // Dawn is warmer than noon: more red relative to blue.
    const warmth = (hex: string) => parseInt(hex.slice(1, 3), 16) - parseInt(hex.slice(5, 7), 16);
    assert.ok(warmth(dawn.sunColour) > warmth(noon.sunColour));
    assert.ok(warmth(night.sunColour) < 0, 'moonlight is blue');
  });

  test('fireflies show at night and not at noon', () => {
    assert.equal(lightingFor(12).glowVisible, false);
    assert.equal(lightingFor(21).glowVisible, true);
  });

  test('hours wrap', () => {
    assert.deepEqual(lightingFor(25), lightingFor(1));
    assert.deepEqual(lightingFor(-1), lightingFor(23));
  });
});

describe('the habitat', () => {
  test('props stand in a ring that leaves the front clear', () => {
    for (const layer of ['Green', 'Wellness', 'Food', 'Safe', 'Quest'] as const) {
      for (const p of placements(layer, 8)) {
        const r = Math.hypot(p.x, p.z);
        assert.ok(r >= 1.1 && r <= 2.6, `${layer}: a prop at ${r.toFixed(2)} m would sit on the animal or out of frame`);
        // The camera stands at +z. Anything with z > 0 must be well off to
        // the side, or it stands between the camera and the animal.
        assert.ok(p.z <= 0 || Math.abs(p.x) >= 0.7 * r, `${layer}: a prop at (${p.x.toFixed(2)}, ${p.z.toFixed(2)}) is in front of the animal`);
      }
    }
  });

  test('the same forest tomorrow', () => {
    assert.deepEqual(placements('Green', 9), placements('Green', 9));
    assert.notDeepEqual(placements('Green', 9), placements('Quest', 9));
  });

  test('water where there is a shore, none in the forest', () => {
    assert.equal(HABITATS.Green.water, null);
    assert.equal(HABITATS.Wellness.water, null);
    assert.ok(HABITATS.Safe.water && HABITATS.Food.water && HABITATS.Quest.water);
  });
});

describe('reduce-motion means still', () => {
  test('the motion scale is zero, not small', () => {
    assert.equal(motionScale(true), 0);
    assert.equal(motionScale(false), 1);
  });
});
