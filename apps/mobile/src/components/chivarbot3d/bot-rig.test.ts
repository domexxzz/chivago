/**
 * What Chivar Bot's 3D model decides, held without a GPU.
 */

import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

import type { BotMood } from '../ChivarBot.tsx';
import {
  ARM_REST, REACT_MS, RETURN_AFTER_MS, approach, dragYaw, faceKey, faceParts, idlePose,
  lookAt, reaction, restingYaw, waveAngle,
} from './bot-rig.ts';

const MOODS: BotMood[] = ['idle', 'smile', 'happy', 'playful', 'surprised', 'thinking', 'cool', 'love', 'cheer'];

describe('the face', () => {
  test('every mood on the character sheet has a face of its own', () => {
    const faces = new Set(MOODS.filter((m) => m !== 'idle').map((m) => faceKey(faceParts(m))));
    // Eight moods, eight different faces: two that drew the same would be
    // one mood with two names.
    assert.equal(faces.size, 8);
  });

  test('idle is the resting smile', () => {
    assert.deepEqual(faceParts('idle'), faceParts('smile'));
  });

  test('a blink closes the eyes and leaves the mouth alone', () => {
    const open = faceParts('happy');
    const shut = faceParts('happy', true);
    assert.equal(shut.eyes, 'shut');
    assert.equal(shut.mouth, open.mouth);
  });

  test('sunglasses and heart eyes do not blink - there is no lid to close', () => {
    assert.equal(faceParts('cool', true).eyes, 'shades');
    assert.equal(faceParts('love', true).eyes, 'heart');
  });

  test('the sheet\'s details are kept: a question mark when thinking, hearts when in love', () => {
    assert.equal(faceParts('thinking').extra, 'question');
    assert.equal(faceParts('love').extra, 'hearts');
  });
});

describe('turning him round', () => {
  test('a drag the width of the model is one whole turn', () => {
    assert.ok(Math.abs(dragYaw(0, 200, 200) - Math.PI * 2) < 1e-9);
    assert.ok(Math.abs(dragYaw(0, -100, 200) + Math.PI) < 1e-9);
  });

  test('a zero-width box does not divide by zero', () => {
    assert.equal(dragYaw(1.2, 50, 0), 1.2);
  });

  test('held, or just let go, he stays where he was turned', () => {
    assert.equal(restingYaw(2.5, 0, true), 2.5);
    assert.equal(restingYaw(2.5, RETURN_AFTER_MS - 1, false), 2.5);
  });

  test('then he turns back to face you, the short way round', () => {
    const turn = Math.PI * 2;
    assert.equal(restingYaw(0.4, RETURN_AFTER_MS, false), 0);
    // Spun two and a half turns and a bit: back to the nearest whole turn,
    // not unwound all the way to zero.
    assert.equal(restingYaw(turn * 2.4, RETURN_AFTER_MS, false), turn * 2);
  });

  test('easing never overshoots and a paused frame does not move him', () => {
    const v = approach(0, 1, 0.016);
    assert.ok(v > 0 && v < 1);
    assert.equal(approach(0.3, 1, 0), 0.3);
    assert.ok(approach(0, 1, 10) <= 1);
  });

  test('easing is the same at different frame rates', () => {
    let a = 0; for (let i = 0; i < 60; i += 1) a = approach(a, 1, 1 / 60);
    let b = 0; for (let i = 0; i < 120; i += 1) b = approach(b, 1, 1 / 120);
    assert.ok(Math.abs(a - b) < 1e-6, `${a} vs ${b}`);
  });
});

describe('alive', () => {
  test('reduce-motion means still', () => {
    const p = idlePose(3.7, 0);
    assert.equal(p.bob, 0);
    assert.equal(p.breathe, 1);
    assert.equal(p.headTilt, 0);
    assert.equal(p.sprout, 0);
  });

  test('the breath and the bob stay small', () => {
    for (let t = 0; t < 20; t += 0.37) {
      const p = idlePose(t);
      assert.ok(Math.abs(p.bob) <= 0.012 + 1e-9);
      assert.ok(Math.abs(p.breathe - 1) <= 0.018 + 1e-9);
    }
  });

  test('a waving arm is raised above the resting one', () => {
    for (let t = 0; t < 3; t += 0.1) assert.ok(waveAngle(t) > ARM_REST + 1);
  });

  test('he glances at your finger but does not snap round to it', () => {
    const far = lookAt(5, -5);
    assert.ok(Math.abs(far.yaw) <= 0.32 + 1e-9);
    assert.ok(Math.abs(far.pitch) <= 0.18 + 1e-9);
    assert.ok(lookAt(1, 0).yaw > 0, 'a finger to the right turns him right');
  });
});

describe('a tap', () => {
  test('he hops, lands, and is back at rest when it is over', () => {
    const peak = reaction(REACT_MS * 0.3);
    assert.ok(peak.hop > 0.08, 'the hop reaches its height at the peak');
    assert.ok(reaction(REACT_MS * 0.7).squash < 1, 'and squashes as he lands');
    assert.deepEqual(reaction(REACT_MS), { hop: 0, squash: 1, grinning: false });
    assert.deepEqual(reaction(-5), { hop: 0, squash: 1, grinning: false });
  });

  test('he grins for the length of it', () => {
    assert.equal(reaction(10).grinning, true);
    assert.equal(reaction(REACT_MS + 1).grinning, false);
  });
});
