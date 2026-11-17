import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { constrainLauncherPoint, snapLauncherPoint } from './launcher-position.ts';

describe('the movable Chivar Bot launcher', () => {
  test('cannot be dragged outside the visible frame', () => {
    assert.deepEqual(constrainLauncherPoint({ x: -200, y: -100 }, 390, 844), { x: 8, y: 48 });
    assert.deepEqual(constrainLauncherPoint({ x: 900, y: 1200 }, 390, 844), { x: 312, y: 702 });
  });

  test('snaps to the closest side and keeps the chosen height', () => {
    assert.deepEqual(snapLauncherPoint({ x: 40, y: 300 }, 390, 844), { x: 8, y: 300 });
    assert.deepEqual(snapLauncherPoint({ x: 280, y: 300 }, 390, 844), { x: 312, y: 300 });
  });

  test('still behaves on a very small viewport', () => {
    assert.deepEqual(snapLauncherPoint({ x: 100, y: 100 }, 70, 120), { x: 8, y: 48 });
  });
});
