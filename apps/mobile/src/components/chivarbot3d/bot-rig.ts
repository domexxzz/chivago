/**
 * Everything Chivar Bot's 3D model DECIDES, with nothing that draws.
 *
 * `ChivarBot3D.tsx` owns three.js, a WebGL context and a canvas; none of those
 * exist in the node test harness, so nothing that matters may live only
 * there. What the face shows for a mood, how far a drag turns him, how he
 * breathes and how he answers a tap are all here, as plain numbers a test
 * can hold.
 */

import type { BotMood } from '../ChivarBot.tsx';

// ---------------------------------------------------------------------------
// The face
// ---------------------------------------------------------------------------

export type EyeStyle = 'round' | 'arc' | 'wink' | 'wide' | 'up' | 'shades' | 'heart' | 'shut';
export type MouthStyle = 'smile' | 'grin' | 'tongue' | 'o' | 'flat';
export type FaceExtra = 'question' | 'hearts' | 'sparkle' | null;

export interface FaceParts {
  eyes: EyeStyle;
  mouth: MouthStyle;
  extra: FaceExtra;
}

/**
 * The parts of the face for a mood, read off the character sheet.
 *
 * A switch over every mood rather than a table with a default, so a mood
 * added to `BotMood` without a face here is a type error, not a blank screen.
 * `blinking` closes the eyes for the length of a blink - except behind
 * sunglasses and in heart eyes, which have no lid to close.
 */
export function faceParts(mood: BotMood, blinking = false): FaceParts {
  const face = baseFace(mood);
  if (blinking && face.eyes !== 'shades' && face.eyes !== 'heart') {
    return { ...face, eyes: 'shut' };
  }
  return face;
}

function baseFace(mood: BotMood): FaceParts {
  switch (mood) {
    case 'idle':
    case 'smile': return { eyes: 'round', mouth: 'smile', extra: null };
    case 'happy': return { eyes: 'arc', mouth: 'grin', extra: null };
    case 'playful': return { eyes: 'wink', mouth: 'tongue', extra: null };
    case 'surprised': return { eyes: 'wide', mouth: 'o', extra: null };
    case 'thinking': return { eyes: 'up', mouth: 'flat', extra: 'question' };
    case 'cool': return { eyes: 'shades', mouth: 'smile', extra: null };
    case 'love': return { eyes: 'heart', mouth: 'smile', extra: 'hearts' };
    case 'cheer': return { eyes: 'arc', mouth: 'grin', extra: 'sparkle' };
    default: {
      const unreachable: never = mood;
      return unreachable;
    }
  }
}

/** A stable string for a face, so the screen is redrawn only when it changes. */
export const faceKey = (f: FaceParts): string => `${f.eyes}|${f.mouth}|${f.extra ?? ''}`;

// ---------------------------------------------------------------------------
// Turning him round - the turnaround on the character sheet, by hand
// ---------------------------------------------------------------------------

/**
 * A drag across the full width of the model turns him once round.
 *
 * One width, one turn: slow enough that the side and back views - the ones
 * the sheet bothers to draw - can be stopped on, fast enough that a flick
 * shows all of him.
 */
export function dragYaw(startYaw: number, dxPx: number, widthPx: number): number {
  if (widthPx <= 0) return startYaw;
  return startYaw + (dxPx / widthPx) * Math.PI * 2;
}

/** How long he waits after being let go before turning back to face you. */
export const RETURN_AFTER_MS = 1600;

/**
 * The yaw he eases toward.
 *
 * While held, or for a moment after: wherever he was left. After that, the
 * nearest whole turn - so a bot spun two and a half times comes back the
 * short way, not by unwinding all of it. He is a chat assistant; between
 * turnarounds he should be looking at the person he is talking to.
 */
export function restingYaw(yaw: number, sinceReleaseMs: number, held: boolean): number {
  if (held || sinceReleaseMs < RETURN_AFTER_MS) return yaw;
  const turn = Math.PI * 2;
  return Math.round(yaw / turn) * turn;
}

/**
 * Move `current` toward `target`, frame-rate independent.
 *
 * Exponential approach: the same feel at 30 and 120 frames a second, never
 * overshooting, and a `dt` of zero (a paused tab) leaves him where he was.
 */
export function approach(current: number, target: number, dtSec: number, rate = 6): number {
  if (dtSec <= 0) return current;
  const k = 1 - Math.exp(-rate * dtSec);
  return current + (target - current) * k;
}

// ---------------------------------------------------------------------------
// Alive - breathing, glancing, waving
// ---------------------------------------------------------------------------

export interface IdlePose {
  /** Whole-body rise, in model units. */
  bob: number;
  /** Chest scale in y: the breath. */
  breathe: number;
  /** Head roll, radians: a small tilt, the curious kind. */
  headTilt: number;
  /** The sprout on his hat, swaying. */
  sprout: number;
}

/**
 * The idle at time `t`, scaled by `motion` (0 for reduce-motion, 1 for full).
 *
 * Periods that do not share a factor, so the pose never visibly repeats -
 * a loop you can see the seam of reads as a machine, which he is, but not
 * the kind the sheet drew.
 */
export function idlePose(t: number, motion = 1): IdlePose {
  // Still means exactly still - not a sine times zero, which is -0 half the time.
  if (motion === 0) return { bob: 0, breathe: 1, headTilt: 0, sprout: 0 };
  return {
    bob: Math.sin(t * 2.1) * 0.012 * motion,
    breathe: 1 + Math.sin(t * 2.1 + 0.6) * 0.018 * motion,
    headTilt: Math.sin(t * 0.73) * 0.06 * motion,
    sprout: Math.sin(t * 3.3) * 0.18 * motion,
  };
}

/** The right arm's lift while waving, radians about the shoulder. */
export function waveAngle(t: number): number {
  // Raised, then rocked: a wave is a held arm and a moving hand.
  return 2.35 + Math.sin(t * 9) * 0.32;
}

/** The right arm at rest, hanging a little out from the body. */
export const ARM_REST = 0.32;

/**
 * Where he looks, from a pointer position normalised to -1..1.
 *
 * Small and clamped: he glances at your finger, he does not snap his head
 * round to follow it. Pitch is inverted because screen y grows downward.
 */
export function lookAt(nx: number, ny: number): { yaw: number; pitch: number } {
  const clamp = (v: number) => Math.max(-1, Math.min(1, v));
  return { yaw: clamp(nx) * 0.32, pitch: -clamp(ny) * 0.18 };
}

// ---------------------------------------------------------------------------
// A tap
// ---------------------------------------------------------------------------

export const REACT_MS = 950;

export interface Reaction {
  /** Height of the hop, model units. */
  hop: number;
  /** Squash on landing: < 1 is flatter. */
  squash: number;
  /** True while the reaction should show the playful face. */
  grinning: boolean;
}

/**
 * The tap reaction at `ms` since the tap: a hop, a squash as he lands, and a
 * cheeky face for the length of it. Outside the window it is the rest pose,
 * so a caller can always ask and never has to branch.
 */
export function reaction(ms: number): Reaction {
  if (ms < 0 || ms >= REACT_MS) return { hop: 0, squash: 1, grinning: false };
  const p = ms / REACT_MS;
  // Up and down once in the first 60%: a parabola, peak at 0.3.
  const air = p < 0.6 ? 1 - ((p - 0.3) / 0.3) ** 2 : 0;
  // Squash just after landing, then recover.
  const land = p >= 0.6 && p < 0.8 ? Math.sin(((p - 0.6) / 0.2) * Math.PI) : 0;
  return { hop: Math.max(0, air) * 0.09, squash: 1 - land * 0.08, grinning: true };
}

/** A press that moved less than this is a tap; more is the start of a turn. */
export const TAP_SLOP_PX = 6;
