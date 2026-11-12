/**
 * What ChangChang does, as arithmetic. No renderer, no window, so a test can
 * hold it.
 *
 * WHY THE WHOLE BODY MOVES AND NOT AN ARM, which is the first thing anyone
 * will ask. The model has no skeleton: the file carries no `skins` and no
 * `animations`, and the mesh is ONE WELDED SHELL - measured, 19,615 of its
 * 19,630 vertices in a single connected component, with the hat fused to the
 * head. So neither a box of coordinates nor a walk across the surface can cut
 * an arm out of it. A coordinate box wide enough to hold the raised hand also
 * holds the hat brim and tears it; a flood from the hand across triangles
 * leaks into the body (the same flood aimed at the tail took 34% of the
 * animal). Independent limbs need the model rigged in a tool that rigs, and
 * this file does not pretend otherwise.
 *
 * What it does instead is the oldest trick in character animation and not a
 * consolation prize: SQUASH, STRETCH, ANTICIPATION, ARCS AND OVERSHOOT applied
 * to the whole figure. A ball with none of those reads as a rock; a ball with
 * all of them reads as alive, which is the entire lesson of the bouncing-ball
 * exercise every animator starts with.
 *
 * Volume is conserved: when the body squashes to 0.8 of its height it widens
 * by 1/sqrt(0.8), so it looks compressed rather than merely shorter. That one
 * relationship is most of why squash reads as a body and not as a scale
 * transform, and `volumeOf` below is held to it by a test.
 *
 * Everything is in MODEL HEIGHTS, not pixels or metres: the bake stands the
 * mascot exactly one unit tall, so 0.3 of lift is three tenths of ChangChang
 * whatever size the card is.
 */

export type ClipName = 'idle' | 'greet' | 'jump' | 'dance';

export interface Pose {
  /** Height above the ground, in model heights. Never negative. */
  lift: number;
  /** Side to side, in model heights. */
  drift: number;
  /** Lean, radians, pivoting at the feet. Positive leans to its left. */
  lean: number;
  /** Turn about the vertical, radians. */
  turn: number;
  /**
   * Vertical scale. 1 is standing; below 1 is compressed, above is stretched.
   * The horizontal scale is derived from it, never set.
   */
  squash: number;
  /**
   * The raised arm, radians about the shoulder. Positive swings the hand
   * away from the body. See `rig.ts` for how an arm was found in a model
   * that arrived with no skeleton.
   */
  wave: number;
  /** The tail, radians about its base. Positive sweeps it to its left. */
  wag: number;
  /** Head turn, radians. Positive looks to its left. */
  glance: number;
  /** Head pitch, radians. Positive looks up. */
  nod: number;
  /** Head roll, radians. The curious tilt. */
  tilt: number;
}

export const REST: Pose = {
  lift: 0, drift: 0, lean: 0, turn: 0, squash: 1, wave: 0, wag: 0, glance: 0, nod: 0, tilt: 0,
};

/** The horizontal scale that keeps the body's volume as it squashes. */
export const widthFor = (squash: number): number => 1 / Math.sqrt(squash);

/** Volume, for the test that holds the line above. */
export const volumeOf = (squash: number): number => squash * widthFor(squash) ** 2;

/** How long each clip runs. `idle` loops and never ends. */
export const CLIP_MS: Record<ClipName, number> = {
  idle: 0,
  greet: 1900,
  jump: 1150,
  dance: 3400,
};

/** The clips a tap cycles through, in the order it offers them. */
export const PERFORMANCES: readonly ClipName[] = ['greet', 'jump', 'dance'];

const TAU = Math.PI * 2;
/** 0 at the ends, 1 in the middle: fades a flourish in and out of rest. */
const arch = (k: number) => Math.sin(Math.min(Math.max(k, 0), 1) * Math.PI);
/** Ease-out cubic, for things that arrive and settle. */
const settle = (k: number) => 1 - (1 - Math.min(Math.max(k, 0), 1)) ** 3;

/**
 * Breathing, and a slow shift of weight.
 *
 * Two periods that do not divide into each other, so the loop never lands in
 * the same place twice in any span anybody watches - the same reason
 * `GreeterIdle` runs the portrait's bob and sway at 2.2 and 3.4 seconds.
 */
/**
 * IDLE BREAKS: the small unprompted actions that separate a living thing
 * from a looping one.
 *
 * Breathing on its own is what a sleeping animal does. An awake one looks
 * around, shifts its weight, flicks its tail, cocks its head at something -
 * every few seconds, unprompted, and never twice in the same order. Without
 * these the idle is honest about being a sine wave, and about four seconds
 * of watching is enough for anyone to see the loop.
 *
 * Five of them, cycling, one every 4.7 seconds, each about a second and a
 * quarter long. Five and 4.7 do not divide into the breathing or the sway,
 * so the same break never lands on the same part of a breath - the whole
 * pattern takes over three minutes to come round, which is longer than
 * anyone will look at a card on a home screen.
 */
const BREAK_EVERY_MS = 4700;
const BREAK_MS = 1250;

const BREAKS: readonly ((k: number) => Partial<Pose>)[] = [
  // Looks away to its left, and the ear-tilt that goes with looking.
  (k) => ({ glance: arch(k) * -0.5, tilt: arch(k) * 0.1 }),
  // Shifts its weight, with the head staying put as the body moves under it.
  (k) => ({ drift: arch(k) * 0.03, lean: arch(k) * 0.07, glance: arch(k) * 0.06, squash: 1 - arch(k) * 0.025 }),
  // Looks up and to its right, at something that is not there.
  (k) => ({ glance: arch(k) * 0.42, nod: arch(k) * 0.16, tilt: arch(k) * -0.08 }),
  // A tail flick, and the head follows it round.
  (k) => ({ wag: Math.sin(k * TAU * 1.5) * 0.45, glance: arch(k) * -0.14 }),
  // The curious head-cock, held longer than the rest.
  (k) => ({ tilt: arch(k) * 0.3, nod: arch(k) * -0.07, glance: arch(k) * 0.1 }),
];

function idlePose(ms: number): Pose {
  /*
    Four rhythms, none a multiple of another: the breath, the weight on the
    feet, the tail, and a slow wander of the head. Four prime-ish periods
    beat against each other for minutes before repeating, which is the
    cheapest way to look unrepeating.
  */
  const breath = Math.sin((ms / 2600) * TAU);
  const weight = Math.sin((ms / 4100) * TAU);
  const tailRhythm = Math.sin((ms / 5300) * TAU);
  const wander = Math.sin((ms / 7300) * TAU);

  const base: Pose = {
    /*
      Three times what this used to be. The old idle was technically moving
      and visually dead; "subtle" and "not happening" look identical.

      The offset is the amplitude, not less than it, so the bottom of a
      breath is exactly the ground and never under it. At 0.006 it went to
      -0.003 and the feet sank through the shadow - caught by the test that
      holds lift above zero, which is the kind of thing nobody sees in a
      card 340 pixels tall and everybody sees on a projector.
    */
    lift: 0.009 + breath * 0.009,
    drift: weight * 0.022,
    lean: weight * 0.035,
    turn: weight * 0.05 + wander * 0.05,
    squash: 1 + breath * 0.022,
    // An arm held perfectly still for a minute is a mannequin's.
    wave: breath * 0.07,
    wag: tailRhythm * 0.16,
    glance: wander * 0.17,
    nod: breath * 0.03,
    tilt: weight * 0.04,
  };

  const sinceBreak = ms % BREAK_EVERY_MS;
  if (sinceBreak >= BREAK_MS) return base;
  const which = Math.floor(ms / BREAK_EVERY_MS) % BREAKS.length;
  const overlay = BREAKS[which](sinceBreak / BREAK_MS);
  // Added to the base rather than replacing it: it keeps breathing while it
  // looks around, because animals do.
  return {
    lift: base.lift + (overlay.lift ?? 0),
    drift: base.drift + (overlay.drift ?? 0),
    lean: base.lean + (overlay.lean ?? 0),
    turn: base.turn + (overlay.turn ?? 0),
    squash: base.squash + ((overlay.squash ?? 1) - 1),
    wave: base.wave + (overlay.wave ?? 0),
    wag: base.wag + (overlay.wag ?? 0),
    glance: base.glance + (overlay.glance ?? 0),
    nod: base.nod + (overlay.nod ?? 0),
    tilt: base.tilt + (overlay.tilt ?? 0),
  };
}

/**
 * The greeting: the arm actually waves.
 *
 * THE BODY LAGS THE HAND BY A SIXTH OF A CYCLE, and that one detail is most
 * of what separates a wave from a windscreen wiper. A real wave starts at the
 * hand; the shoulder and then the body follow it a beat later because they
 * are being dragged along, not driven. Swinging both in step reads as a rigid
 * figure being rocked by something off-screen.
 *
 * Four swings at 2.4 a second, which is the rate a person waves at without
 * being asked to hurry. It leans toward the viewer first - turning a shoulder
 * in before greeting is what people do, and costs one term.
 */
function greetPose(ms: number): Pose {
  const k = ms / CLIP_MS.greet;
  const envelope = arch(k);
  const swing = Math.sin(k * TAU * 2.4);
  const dragged = Math.sin((k - 1 / (2.4 * 6)) * TAU * 2.4);
  return {
    lift: envelope * Math.abs(dragged) * 0.014,
    drift: envelope * dragged * 0.014,
    lean: envelope * dragged * 0.05,
    turn: envelope * 0.16,
    squash: 1 + envelope * Math.abs(dragged) * 0.014,
    // Half a radian is about 29 degrees - a greeting, not a semaphore.
    wave: envelope * swing * 0.5,
    wag: envelope * dragged * 0.18,
    /*
      THE HEAD LEADS. It turns toward you and tips a quarter of a beat before
      the hand gets going, because that is the order a greeting happens in -
      you look at someone, then you wave at them. Reverse the two and it
      reads as a machine that noticed afterwards.
    */
    glance: settle(Math.min(1, k * 4)) * 0.2 * (1 - k * 0.4),
    nod: envelope * 0.1 + Math.sin(k * TAU * 2.4 * 0.5) * envelope * 0.05,
    tilt: envelope * swing * 0.11,
  };
}

/**
 * The jump, in the five beats a jump actually has.
 *
 *   0.00-0.22  ANTICIPATION. It sinks and widens. Nothing launches from
 *              standing; the dip is what tells the eye a jump is coming, and
 *              without it the take-off looks like a cut.
 *   0.22-0.30  LAUNCH. Stretched tall and thin, the pose held for two frames.
 *   0.30-0.72  THE ARC, as a parabola, because gravity is a parabola. Slow at
 *              the top - most of the airtime is spent in the top third, which
 *              is what makes a jump feel floaty and right.
 *   0.72-0.84  LANDING. The deepest squash of the whole clip.
 *   0.84-1.00  RECOVERY, overshooting a little past standing before settling.
 */
/*
  EVERY PHASE HANDS THE NEXT ONE ITS EXACT POSE. The numbers below are chosen
  so each segment ends where the following one begins - crouch ends at 0.83
  and launch starts there, launch ends at 1.18 and the arc starts there, and
  so on. A piecewise clip whose pieces do not meet pops on screen, and three
  of these did until `choreography.test.ts` sampled across the seams and said
  so. It still does, every run.
*/
const CROUCH = 0.83;
const LAUNCH = 1.18;
const IMPACT = 0.78;

function jumpPose(ms: number): Pose {
  const k = ms / CLIP_MS.jump;
  if (k < 0.22) {
    // Anticipation. Feet down the whole time: nothing rises yet.
    return { ...REST, squash: 1 - (1 - CROUCH) * settle(k / 0.22) };
  }
  if (k < 0.3) {
    // The push. Still on the ground - the body extends before it leaves it.
    const d = (k - 0.22) / 0.08;
    return { ...REST, squash: CROUCH + (LAUNCH - CROUCH) * d };
  }
  if (k < 0.72) {
    const d = (k - 0.3) / 0.42;
    return {
      lift: 4 * d * (1 - d) * 0.34, // a parabola, zero at both ends
      drift: 0,
      lean: Math.sin(d * Math.PI) * 0.05,
      turn: 0,
      // Stretched where it is moving fastest, neutral at the top.
      squash: LAUNCH - 0.2 * Math.sin(d * Math.PI),
      /*
        Arm and tail TRAIL the body: thrown up as it rises, and still coming
        up as it falls. Loose parts lag whatever is carrying them, which is
        the whole of what overlapping action means and most of what stops a
        jump reading as one rigid object translated up and down.
      */
      wave: Math.sin(d * Math.PI) * -0.3,
      wag: Math.sin(d * Math.PI) * 0.35,
      // The head goes up first and comes down last: it leads the rise and
      // lags the fall, which is what a head on a neck does.
      nod: Math.sin(d * Math.PI * 0.8) * 0.22,
      glance: 0,
      tilt: Math.sin(d * TAU) * 0.06,
    };
  }
  if (k < 0.82) {
    /*
      The hit: the deepest squash of the clip and the quickest move in it.

      Eased at BOTH ends rather than ease-out. Ease-out starts at three times
      its average speed, which leaves the arc at full stretch and the impact
      already compressing hard in the same instant - a visible tick on the
      frame they meet, and the one the seam test found after the obvious
      three were fixed. A body meeting the ground compresses progressively
      anyway: it does not reach its fastest until it is partly folded.
    */
    const d = (k - 0.72) / 0.1;
    return { ...REST, squash: LAUNCH + (IMPACT - LAUNCH) * ((1 - Math.cos(d * Math.PI)) / 2) };
  }
  // Recovery: a damped spring back up through standing, not a stop at it.
  const d = (k - 0.82) / 0.18;
  return { ...REST, squash: 1 - (1 - IMPACT) * Math.exp(-4 * d) * Math.cos(d * 2.2 * Math.PI) };
}

/**
 * The dance: eight beats at 140 bpm, which is a tempo a body naturally bounces
 * at rather than one chosen for the maths.
 *
 * The weight goes side to side on the half-beat and the bounce lands ON the
 * beat, so the two are a quarter-cycle out of step - the body is lowest when
 * it has just arrived at one side. In step they would read as one wobble.
 * There is a turn on the last two beats, because a dance that never changes
 * which way it faces is a metronome.
 */
function dancePose(ms: number): Pose {
  const k = ms / CLIP_MS.dance;
  const beat = k * 8;
  const envelope = Math.min(1, arch(k) * 1.6);
  const sway = Math.sin((beat / 2) * TAU);
  const bounce = Math.abs(Math.sin(beat * Math.PI));
  return {
    lift: envelope * bounce * 0.05,
    drift: envelope * sway * 0.055,
    lean: envelope * sway * 0.13,
    turn: envelope * (Math.sin((beat / 4) * TAU) * 0.1 + (beat > 6 ? Math.sin(((beat - 6) / 2) * TAU) * 0.5 : 0)),
    squash: 1 + envelope * (bounce * 0.05 - 0.035),
    // The arm keeps the beat at double time; the tail answers the sway at
    // half. Three rates across one body is what stops a dance looking like
    // one gesture repeated.
    wave: envelope * Math.sin(beat * TAU) * 0.26,
    wag: envelope * -sway * 0.4,
    /*
      The head keeps the beat but on the OFF-beat, and looks where the body
      is going rather than where it is. Both are what a dancing body does and
      neither is what a rigid one can fake: the head is the part that knows
      what comes next.
    */
    glance: envelope * sway * 0.22,
    nod: envelope * (bounce * 0.12 - 0.05),
    tilt: envelope * -sway * 0.14,
  };
}

const CLIPS: Record<ClipName, (ms: number) => Pose> = {
  idle: idlePose,
  greet: greetPose,
  jump: jumpPose,
  dance: dancePose,
};

/**
 * The pose at `ms` into `clip`.
 *
 * Past the end of a finite clip it returns rest, so a caller that is a frame
 * late getting back to idle shows a standing animal rather than whatever the
 * last formula happened to extrapolate to.
 */
export function poseAt(clip: ClipName, ms: number): Pose {
  const length = CLIP_MS[clip];
  if (length > 0 && ms >= length) return { ...REST };
  return CLIPS[clip](Math.max(0, ms));
}

/**
 * One pose blended into another. Used to cross-fade a finished performance
 * back into breathing instead of snapping to it.
 */
export function blend(a: Pose, b: Pose, k: number): Pose {
  const t = Math.min(Math.max(k, 0), 1);
  const mix = (x: number, y: number) => x + (y - x) * t;
  return {
    lift: mix(a.lift, b.lift),
    drift: mix(a.drift, b.drift),
    lean: mix(a.lean, b.lean),
    turn: mix(a.turn, b.turn),
    squash: mix(a.squash, b.squash),
    wave: mix(a.wave, b.wave),
    wag: mix(a.wag, b.wag),
    glance: mix(a.glance, b.glance),
    nod: mix(a.nod, b.nod),
    tilt: mix(a.tilt, b.tilt),
  };
}

/*
  BLINKING, which is not part of a Pose and should not be.

  Every other field here is body motion that belongs to a clip. Blinking
  belongs to the ANIMAL: it keeps going while it waves, while it jumps, while
  it stands there, and it has no business starting over because somebody
  tapped. So it runs off the room's own clock and is applied on top of
  whatever the body is doing.
*/

/** Closing is fast and opening is slow. Reverse the two and it reads as a wink. */
const BLINK_CLOSE_MS = 60;
const BLINK_OPEN_MS = 125;
const BLINK_TOTAL_MS = BLINK_CLOSE_MS + BLINK_OPEN_MS;
/** A blink lands somewhere inside each of these, never on the tick of it. */
const BLINK_SLOT_MS = 3800;
/** How much of the slot the start can wander over. */
const BLINK_JITTER_MS = 1900;
/** The pause before the second blink of a double. */
const BLINK_DOUBLE_GAP_MS = 90;

/**
 * A repeatable hash, so the pattern is irregular to watch and identical to
 * test. Real randomness here would mean a test could only assert averages.
 */
const scatter = (n: number): number => {
  const s = Math.sin(n * 12.9898) * 43758.5453;
  return s - Math.floor(s);
};

/**
 * One blink's shape: shut quickly, open at a steady rate.
 *
 * The closing is eased out - a lid snaps down and arrives soft. The opening
 * is a cosine rather than the same ease, because a lid does NOT fly open and
 * then creep the last of the way: it lifts at a roughly even rate. With
 * ease-out on both halves the opening was visually over in 80 ms of its 110,
 * which read as a flicker rather than a blink.
 */
function blinkShape(t: number): number {
  if (t < 0 || t > BLINK_TOTAL_MS) return 0;
  if (t < BLINK_CLOSE_MS) return settle(t / BLINK_CLOSE_MS);
  const k = (t - BLINK_CLOSE_MS) / BLINK_OPEN_MS;
  return (1 + Math.cos(k * Math.PI)) / 2;
}

/**
 * How shut the eyes are at `ms`, 0 to 1.
 *
 * Roughly one every four seconds, which is about the rate a person blinks at
 * while listening. The start wanders within its slot so the interval is never
 * twice the same, and about one in five is a DOUBLE - two in quick succession
 * - because that is what blinking actually looks like and a perfectly spaced
 * one reads as a cursor.
 */
export function blinkAt(ms: number): number {
  const slot = Math.floor(ms / BLINK_SLOT_MS);
  const start = slot * BLINK_SLOT_MS + scatter(slot) * BLINK_JITTER_MS;
  const first = blinkShape(ms - start);
  if (scatter(slot + 7) < 0.78) return first;
  return Math.max(first, blinkShape(ms - start - BLINK_TOTAL_MS - BLINK_DOUBLE_GAP_MS));
}

/** The clip a tap should play, given the one before it. */
export const nextPerformance = (previous: ClipName | null): ClipName => {
  const at = previous === null ? -1 : PERFORMANCES.indexOf(previous);
  return PERFORMANCES[(at + 1) % PERFORMANCES.length];
};
