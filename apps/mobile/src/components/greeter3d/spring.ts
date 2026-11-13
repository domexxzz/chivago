/**
 * Why the skeleton has mass. No renderer, so a test can hold it.
 *
 * Every bone used to be set straight from the clip: the choreography said
 * "the arm is at 0.3 radians this frame" and the arm was at 0.3 radians that
 * frame. That is a puppet on rods. Nothing in it ever arrives late, nothing
 * carries past where it was going and comes back, and nothing feels like it
 * weighs anything - which is most of why a figure with three working bones
 * still read as a statue being waggled.
 *
 * So the clip stops being a position and becomes a TARGET. Each bone chases
 * it through a damped spring, which costs four numbers and buys the three
 * things an animator would otherwise key by hand:
 *
 *   LAG           the arm starts after the shoulder tells it to
 *   OVERSHOOT     it passes the mark and settles back
 *   FOLLOW-THROUGH when the body stops, the tail does not, yet
 *
 * Give a loose part a low stiffness and it trails further behind a heavy one;
 * that difference across bones is what reads as some parts being floppier
 * than others, without anybody animating floppiness.
 */

export interface SpringState {
  /** Where the bone actually is. */
  value: number;
  /** How fast it is going, per second. */
  velocity: number;
}

export const atRest = (value = 0): SpringState => ({ value, velocity: 0 });

/**
 * The longest step the spring will integrate at once, in seconds.
 *
 * A browser tab in the background stops painting, and the next frame after
 * somebody comes back carries the whole gap - seconds of it. Fed that, an
 * explicit integrator does not lag, it DETONATES: the bone shoots to some
 * enormous angle and the model turns inside out, which is a bug that only
 * ever shows up on a machine that was left alone, i.e. during a demo.
 * Clamping means a long gap resolves in a few frames instead of in one.
 */
export const MAX_STEP_S = 1 / 30;

/**
 * Advance one spring toward `target`.
 *
 * `stiffness` is how hard it pulls (bigger arrives sooner), `damping` how
 * much it resists moving (bigger overshoots less; around 2*sqrt(stiffness) is
 * the point where it stops overshooting at all).
 */
export function step(
  state: SpringState,
  target: number,
  deltaS: number,
  stiffness: number,
  damping: number,
): SpringState {
  const dt = Math.min(Math.max(deltaS, 0), MAX_STEP_S);
  if (dt === 0) return state;
  const acceleration = (target - state.value) * stiffness - state.velocity * damping;
  const velocity = state.velocity + acceleration * dt;
  return { value: state.value + velocity * dt, velocity };
}

/**
 * How each bone answers. These are the numbers that say what a part is MADE
 * of, and they are the whole reason the bones no longer move as one object.
 *
 * The head is heavy and deliberate, so it is stiff and well damped: it
 * arrives where it is going and does not wobble, because a head that wobbles
 * reads as a bobblehead rather than as attention.
 *
 * The tail is the opposite end - soft, light, attached to a body that is
 * doing something else. Low stiffness and low damping give it the big trailing
 * overshoot a real tail has, and it is the single most alive-looking thing in
 * the scene for it.
 *
 * The waist is the heaviest thing here because it is carrying everything
 * above it; it leads the motion and the limbs catch up.
 */
/*
  SOFTENED, after watching it. The first set of numbers was tuned for each
  bone to ARRIVE - stiff enough that it reached the clip's value quickly and
  stopped. What that produces is a figure that snaps between poses: every
  joint is already where it is going by the time the eye gets there, so the
  motion has no travel in it and reads as hard, which is exactly the word
  that came back.

  Everything here is roughly two thirds of what it was, damping included so
  the softer springs still settle rather than wobble. The bones now spend
  visible time on their way somewhere, which is where smoothness actually
  lives - not in the frame rate, which was never the problem.
*/
export const BONE_SPRINGS = {
  arm: { stiffness: 170, damping: 14 },
  tail: { stiffness: 70, damping: 7.5 },
  headYaw: { stiffness: 120, damping: 16 },
  headPitch: { stiffness: 120, damping: 16 },
  headRoll: { stiffness: 105, damping: 14 },
  spine: { stiffness: 200, damping: 19 },
} as const;

export type BoneName = keyof typeof BONE_SPRINGS;

/** Advance a bone by its own character. */
export const stepBone = (
  state: SpringState,
  target: number,
  deltaS: number,
  bone: BoneName,
): SpringState => step(state, target, deltaS, BONE_SPRINGS[bone].stiffness, BONE_SPRINGS[bone].damping);
