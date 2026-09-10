/**
 * The companions in three dimensions: everything that can be decided without
 * a renderer.
 *
 * `Creature3D.tsx` owns the WebGL scene and needs a browser. Everything it
 * decides FROM - what each species looks like, how big a hatchling is, what
 * the light is doing at this hour on the island, where the palms stand - is
 * decided here, in plain numbers, so the node harness can hold it to rules:
 *
 *   - the animals wear their own colours, and none of them wears the app's
 *     evidence green. The SVG marks are tinted by stage because they are
 *     marks; a three-dimensional turtle is olive because a turtle is olive,
 *     and the stage is said by size, by the egg, and by the badge beside it.
 *   - an egg gives nothing away. One egg for five species, speckled in the
 *     colour of its habitat and nothing else.
 *   - a hatchling is smaller and rounder than a grown animal, never a
 *     different animal.
 *   - the light follows the island's clock, the same one the greeting reads.
 *   - reduce-motion means still. Not slower: still.
 *
 * Numbers are metres in a scene where a grown companion stands about one
 * high, head and all, because the camera maths is easier to read that way
 * than in pixels.
 */

import type { CompanionStage, LayerKey } from '@chivago/core';
import { islandHour } from '@chivago/core';
import { dayArc, mix } from '../island-clock.ts';
import type { CreatureKey } from '../Creature.tsx';

// ---------------------------------------------------------------------------
// What each animal looks like
// ---------------------------------------------------------------------------

export interface Look {
  key: CreatureKey;
  /** The layer whose habitat this animal is drawn in. */
  layer: LayerKey;
  /** Hex colours. `body` is what the eye names the animal by. */
  colours: {
    body: string;
    belly: string;
    limb: string;
    /** The one feature: the coconut, the gold crest, the suckers, the scutes, the horns. */
    feature: string;
    eye: string;
    beak: string;
    /** A second colour where the art has one: the junglefowl's teal wings, the turtle's shell. */
    accent?: string;
  };
  /**
   * What it wears. All five are drawn in the same wardrobe - a patterned
   * sash, shorts, a rope belt - in their own colours. `ink` and `accent` are
   * the diamond pattern's two colours on the `sash` and `shorts` grounds.
   */
  wear: { sash: string; shorts: string; ink: string; accent: string; rope: string };
  /** Where it lives in the frame: on the ground, in the air, or at the water. */
  medium: 'ground' | 'air' | 'shore' | 'mud';
  /** Height of the grown animal's eye line, in scene metres. */
  eyeHeight: number;
}

/**
 * The team's own five, coloured from the reference art of 8 September
 * (docs/51): a brown macaque with a tan face and a coconut in hand; a cream
 * junglefowl with a golden crest, teal wings and orange feet; a coral
 * octopus with cream suckers; an olive turtle with dark spots under a brown
 * shell; a brown buffalo with dark horns. Mascot colours, and still none of
 * them wears the app's evidence green. The eye is nearly black with a white
 * catchlight for all five - that is what makes a drawn animal look back at
 * you.
 */
export const LOOKS: Record<CreatureKey, Look> = {
  'coconut-macaque': {
    key: 'coconut-macaque', layer: 'Green', medium: 'ground', eyeHeight: 0.8,
    colours: { body: '#8b5a2b', belly: '#e2b985', limb: '#6f4522', feature: '#5c3a1a', eye: '#1a1410', beak: '#e9c39a' },
    wear: { sash: '#f4f1e6', shorts: '#bfe0f0', ink: '#2f7fb8', accent: '#f0a040', rope: '#c9a86a' },
  },
  'red-junglefowl': {
    key: 'red-junglefowl', layer: 'Wellness', medium: 'ground', eyeHeight: 0.8,
    colours: { body: '#f1e4cc', belly: '#faf3e4', limb: '#e07a2f', feature: '#d9a531', eye: '#1a1410', beak: '#e8963b', accent: '#2a9d8f' },
    wear: { sash: '#2b4a7a', shorts: '#4fb3b8', ink: '#f4f1e6', accent: '#e8963b', rope: '#c9a86a' },
  },
  'day-octopus': {
    key: 'day-octopus', layer: 'Food', medium: 'shore', eyeHeight: 0.56,
    colours: { body: '#e8825a', belly: '#f5dcc4', limb: '#e07a50', feature: '#f4dfc8', eye: '#1a1410', beak: '#c9613c' },
    wear: { sash: '#f4f1e6', shorts: '#f4f1e6', ink: '#3b6fc4', accent: '#9fc3e8', rope: '#c9a86a' },
  },
  'green-turtle': {
    key: 'green-turtle', layer: 'Safe', medium: 'shore', eyeHeight: 0.8,
    colours: { body: '#b3ab74', belly: '#e4d8b0', limb: '#9e975f', feature: '#6b6e3a', eye: '#1a1410', beak: '#7d6a3a', accent: '#8a5a34' },
    wear: { sash: '#f4f1e6', shorts: '#f4f1e6', ink: '#2f5fb8', accent: '#9fc3e8', rope: '#c9a86a' },
  },
  'water-buffalo': {
    key: 'water-buffalo', layer: 'Quest', medium: 'ground', eyeHeight: 0.8,
    colours: { body: '#6b4423', belly: '#c79a6b', limb: '#553419', feature: '#3a2513', eye: '#1a1410', beak: '#d8b08a' },
    wear: { sash: '#f4ead2', shorts: '#f4ead2', ink: '#2f7fb8', accent: '#f0a040', rope: '#4fb3b8' },
  },
};

/** The app's evidence green. No animal may wear it - see the file header. */
export const EVIDENCE_GREEN = '#25874c';

/**
 * The leaf three of them wear on the head, as drawn. A leaf is green; the
 * evidence green it is not, and the test holds the two apart.
 */
export const LEAF_GREEN = '#3f9a5f';

// ---------------------------------------------------------------------------
// Stage
// ---------------------------------------------------------------------------

/** Overall size against the grown animal. An egg is its own model. */
export const stageScale = (stage: CompanionStage): number =>
  stage === 'grown' ? 1 : stage === 'hatchling' ? 0.62 : 1;

/**
 * How much bigger the head is, relative to the body, than in the adult.
 * Young animals have big heads and big eyes; that is most of what "cute" is,
 * and it is also true.
 */
export const headRatio = (stage: CompanionStage): number =>
  stage === 'hatchling' ? 1.28 : 1;

// ---------------------------------------------------------------------------
// Habitat
// ---------------------------------------------------------------------------

export interface Habitat {
  layer: LayerKey;
  /** Sky at the zenith and at the horizon, at midday. */
  sky: [string, string];
  ground: string;
  groundDark: string;
  /** A water plane at the edge of the frame. */
  water: string | null;
  props: 'forest' | 'hill' | 'shore' | 'beach' | 'mangrove';
  particles: 'fireflies' | 'pollen' | 'sparkle' | 'bubbles' | 'motes';
  /** The egg's speckles take the habitat's colour, not the animal's. */
  speckle: string;
}

export const HABITATS: Record<LayerKey, Habitat> = {
  Green: {
    layer: 'Green', sky: ['#6fb3e8', '#d9ecf7'], ground: '#5f7a3c', groundDark: '#3f5528',
    water: null, props: 'forest', particles: 'fireflies', speckle: '#4f6a34',
  },
  Wellness: {
    layer: 'Wellness', sky: ['#78b8ec', '#e5f1f8'], ground: '#7f8f4f', groundDark: '#5a6a36',
    water: null, props: 'hill', particles: 'pollen', speckle: '#7f8f4f',
  },
  Food: {
    layer: 'Food', sky: ['#5aa8e6', '#dcefff'], ground: '#c9b58a', groundDark: '#a08c62',
    water: '#2f8fb8', props: 'shore', particles: 'sparkle', speckle: '#a08c62',
  },
  Safe: {
    layer: 'Safe', sky: ['#62b0ea', '#e8f4fb'], ground: '#e6d6b0', groundDark: '#c9b58a',
    water: '#36a3c2', props: 'beach', particles: 'bubbles', speckle: '#c9b58a',
  },
  Quest: {
    layer: 'Quest', sky: ['#7fb2d6', '#dbe6ec'], ground: '#6b5a44', groundDark: '#4a3d2d',
    water: '#5b8d8f', props: 'mangrove', particles: 'motes', speckle: '#6b5a44',
  },
};

// ---------------------------------------------------------------------------
// Light, by the island's clock
// ---------------------------------------------------------------------------

export interface Lighting {
  /** 0–1, the sun's strength. Night is not zero: there is a moon. */
  sun: number;
  sunColour: string;
  /** Where the sun sits: elevation 0–1, and azimuth in radians. */
  elevation: number;
  azimuth: number;
  skyColour: string;
  groundColour: string;
  /** Multiplies the habitat's own sky colours toward night. */
  skyDim: number;
  exposure: number;
  /** Fireflies and the like only show when it is dark enough to see them. */
  glowVisible: boolean;
}


/**
 * The light for an hour of the day, 0–23, island time.
 *
 * Sunrise at six and sunset at half past six, which is what Koh Samui gets
 * within twenty minutes all year. Golden at the edges, white at noon, a
 * blue-grey moon at night. The numbers are a hand-tuned curve, not a solar
 * model: what matters is that a companion opened at dinner looks like
 * dinner and one opened at seven in the morning looks like morning.
 */
export function lightingFor(hour: number): Lighting {
  const h = ((hour % 24) + 24) % 24;
  // The same sun the map is drawn under - see island-clock.ts.
  const { day, arc, golden } = dayArc(h);
  const sunColour = day ? mix('#fff4dd', '#ffb268', golden) : '#9fb4dc';
  return {
    // Night is a bright tropical moon over water, not a cellar. The first
    // pass took the sun to a quarter and the exposure down with it, and a
    // companion opened after dinner - which is when people open it - was a
    // silhouette in a dark box. Moonlight is blue and it is still light.
    sun: day ? 0.55 + arc * 0.8 : 0.62,
    sunColour,
    elevation: day ? 0.18 + arc * 0.72 : 0.55,
    azimuth: day ? -0.9 + ((h - 6) / 12.5) * 1.8 : 0.6,
    skyColour: day ? mix('#f7d7b8', '#dff0ff', Math.min(1, arc * 1.6)) : '#4a5f8a',
    groundColour: day ? mix('#8a6a4a', '#b9a58a', arc) : '#3a3f52',
    skyDim: day ? 0.55 + arc * 0.45 : 0.42,
    exposure: day ? 0.95 + arc * 0.2 : 1.0,
    glowVisible: !day || h >= 18,
  };
}

export const lightingNow = (at = new Date()): Lighting => lightingFor(islandHour(at));

/**
 * The hour a companion's room is always lit at.
 *
 * Late morning: the sun is high enough that `skyDim` is near one and the
 * habitat's own colours arrive undimmed, and far enough from noon that the
 * light still comes from a direction and the animal still casts a shadow.
 * Straight overhead would flatten it.
 *
 * Why a fixed hour at all, when everything else on the island follows the
 * clock: a companion is drawn inside a card on a pale screen, and at night
 * that card became a dark rectangle in a light page. See the note in
 * Creature3D.
 */
export const COMPANION_HOUR = 10.5;

// ---------------------------------------------------------------------------
// Motion
// ---------------------------------------------------------------------------

/**
 * Reduce-motion means the animal is still. Not slower - still. A slow bob is
 * still a bob to someone who asked for none, and a companion that does not
 * move is a companion, not a broken one.
 */
export const motionScale = (reduceMotion: boolean): number => (reduceMotion ? 0 : 1);

/** How long a tap's reaction lasts, per species. A bird is quick; a turtle is not. */
export const REACTION_MS: Record<CreatureKey, number> = {
  'coconut-macaque': 1100,
  'red-junglefowl': 1000,
  'day-octopus': 1400,
  'green-turtle': 1600,
  'water-buffalo': 1300,
};

// ---------------------------------------------------------------------------
// Placement
// ---------------------------------------------------------------------------

export interface Placement { x: number; z: number; rotation: number; scale: number }

/** A tiny deterministic generator, so a habitat looks the same every visit. */
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return (s >>> 0) / 4294967296;
  };
}

/**
 * Where the props stand: a ring around the animal, never on it, and never
 * between it and the camera. Seeded by the layer so a macaque's grove is
 * the same grove tomorrow.
 */
export function placements(layer: LayerKey, count: number, inner = 1.1, outer = 2.6): Placement[] {
  const seed = [...layer].reduce((n, c) => n * 31 + c.charCodeAt(0), 7);
  const next = rng(seed);
  const out: Placement[] = [];
  for (let i = 0; i < count; i += 1) {
    // The camera stands at +z looking at the animal. The whole front arc is
    // left empty - from 0.85π round to 2.15π is behind and beside it - so no
    // palm ever stands between the two of you.
    const angle = (0.85 + (i / count) * 1.3) * Math.PI + (next() - 0.5) * 0.16 * Math.PI;
    const r = inner + next() * (outer - inner);
    out.push({
      x: Math.cos(angle) * r,
      z: Math.sin(angle) * r,
      rotation: next() * Math.PI * 2,
      scale: 0.75 + next() * 0.5,
    });
  }
  return out;
}

/** Speckles on an egg: points on its surface, seeded by habitat. */
export function speckles(layer: LayerKey, count = 22): { theta: number; phi: number; size: number }[] {
  const seed = [...layer].reduce((n, c) => n * 17 + c.charCodeAt(0), 3);
  const next = rng(seed);
  const out: { theta: number; phi: number; size: number }[] = [];
  for (let i = 0; i < count; i += 1) {
    out.push({ theta: next() * Math.PI * 2, phi: 0.35 + next() * 2.3, size: 0.02 + next() * 0.035 });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Movement
// ---------------------------------------------------------------------------

/**
 * How far a companion turns its head on its neck, in radians, either way.
 *
 * About 29 degrees. A neck is a joint with a limit, and any animation that
 * forgets that stops looking like an animal at exactly the moment somebody
 * is watching it closely.
 */
export const NECK_YAW = 0.5;

// ---------------------------------------------------------------------------
// The junglefowl's own movement
// ---------------------------------------------------------------------------

/**
 * A bird has to move like a bird.
 *
 * Every other companion can get away with a sway and a blink. The junglefowl
 * cannot: everyone watching has seen a chicken, so anything that is not one
 * reads as wrong immediately - and the first version had it slowly winding
 * its head round on its neck, which is an owl's trick and not even a real
 * owl's.
 *
 * What a red junglefowl actually does, and what is below:
 *
 *   - It keeps its head STILL. The body bobs; the head holds its place in the
 *     air and then snaps forward to a new one. That is why `headLift` runs
 *     against `lift` - in the body's frame the head must move down as the
 *     body moves up, so that in the room it does not move at all.
 *   - It steps, one foot then the other, and sways with them.
 *   - It flies in short explosive bursts - up to a branch, not across a
 *     valley. Fast wings, a brief hang at the top, and down. Junglefowl roost
 *     in trees, and this burst is how they get there.
 *
 * Plain numbers, in scene metres and radians, so the harness can hold the
 * dance to its rules without a renderer: see creature-rig.test.ts.
 */
export interface FowlPose {
  /** Metres the whole bird is off its resting height. Small dips are crouches. */
  lift: number;
  /** Radians the body leans left or right with the step. */
  lean: number;
  /** Radians the body pitches. Positive is beak-down. */
  pitch: number;
  /** Radians each wing swings up from the body. */
  wing: number;
  /** Metres the head thrusts forward, on top of its rest position. */
  headThrust: number;
  /** Metres the head sits above rest IN THE BODY'S FRAME - usually negative. */
  headLift: number;
  /** Radians the tail fans up. */
  tail: number;
  /** Metres each foot is off the ground. */
  footL: number;
  footR: number;
  /** True while it is airborne under its own wings. */
  flying: boolean;
}

/** One step of the dance, in seconds. A bird's bob is quick. */
export const FOWL_STEP_S = 0.62;
/** How often it takes off. Rare enough to be worth waiting for. */
export const FOWL_FLIGHT_EVERY_S = 9;
/** How long a burst lasts, take-off to landing. */
export const FOWL_FLIGHT_S = 1.7;
/** How high the burst goes, on an animal that stands about one metre. */
export const FOWL_FLIGHT_APEX_M = 0.32;
/** The deepest crouch or landing squash. Shallower than the legs are long. */
export const FOWL_CROUCH_M = 0.035;

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

/**
 * Where the bird is at second `t`.
 *
 * `react` is the tap: `k` runs 0..1 through the reaction and `pulse` is its
 * envelope. A tap always gets a flutter, whatever the bird was doing.
 */
export function fowlPose(
  t: number, motion: number, react: { k: number; pulse: number } = { k: 0, pulse: 0 },
): FowlPose {
  const pose: FowlPose = {
    lift: 0, lean: 0, pitch: 0, wing: 0.14, headThrust: 0, headLift: 0, tail: 0.06,
    footL: 0, footR: 0, flying: false,
  };
  // Reduce-motion means still, and still means the resting pose - not a
  // slower dance. Creature3D does not even start a loop in that state; this
  // is the same answer for anything that asks anyway.
  if (motion <= 0) return pose;

  const cycle = t % FOWL_FLIGHT_EVERY_S;
  const dancing = FOWL_FLIGHT_EVERY_S - FOWL_FLIGHT_S;

  if (cycle < dancing) {
    // --- the dance -------------------------------------------------------
    const step = cycle / FOWL_STEP_S;
    const b = step % 1;                       // through one step
    const bounce = Math.sin(Math.PI * b) ** 1.7;
    const rightFoot = Math.floor(step) % 2 === 0;
    pose.lift = bounce * 0.05;
    // Two steps to a full sway, so it rocks rather than twitching.
    pose.lean = Math.sin(Math.PI * step) * 0.11;
    pose.pitch = bounce * 0.06;
    pose.wing = 0.14 + bounce * 0.3;
    pose.tail = 0.06 + bounce * 0.2;
    pose.footL = rightFoot ? 0 : bounce * 0.05;
    pose.footR = rightFoot ? bounce * 0.05 : 0;
    // Head-hold: down in the body's frame by most of what the body rose, so
    // it stays put in the room. Then the thrust, early and sharp.
    pose.headLift = -bounce * 0.042;
    pose.headThrust = Math.max(0, Math.sin(Math.PI * b * 2)) ** 4 * 0.035;
  } else {
    // --- the burst -------------------------------------------------------
    const f = (cycle - dancing) / FOWL_FLIGHT_S;
    const CROUCH = 0.14, LAND = 0.84;
    if (f < CROUCH) {
      // Gather. Wings back, head low, legs folding.
      const u = f / CROUCH;
      pose.lift = -FOWL_CROUCH_M * u;
      pose.wing = 0.14 - u * 0.1;
      pose.pitch = u * 0.1;
      pose.headLift = -0.02 * u;
    } else if (f < LAND) {
      const u = (f - CROUCH) / (LAND - CROUCH);
      // Fast up, a hang at the top, down: the exponent is what makes it a
      // burst rather than a lob.
      pose.lift = Math.sin(u * Math.PI) ** 0.75 * FOWL_FLIGHT_APEX_M;
      pose.flying = true;
      // Wings beat right through it, wide and quick.
      pose.wing = 0.35 + Math.abs(Math.sin(f * Math.PI * 13)) * 0.95;
      pose.pitch = Math.cos(u * Math.PI) * -0.16;
      pose.tail = 0.3;
      // Legs tuck as it rises and reach again on the way down.
      const tuck = pose.lift / FOWL_FLIGHT_APEX_M * 0.06;
      pose.footL = tuck;
      pose.footR = tuck;
      pose.headThrust = 0.02;
    } else {
      // Land: a small squash, wings folding, tail flicking down.
      const v = clamp01((f - LAND) / (1 - LAND));
      pose.lift = -FOWL_CROUCH_M * Math.sin(v * Math.PI);
      pose.wing = 0.14 + (1 - v) * 0.5;
      pose.tail = 0.06 + (1 - v) * 0.3;
      pose.pitch = (1 - v) * 0.12;
    }
  }

  // --- the tap -----------------------------------------------------------
  // Folded on top of whatever it was doing, because a tap that only works
  // between dance steps reads as the animal ignoring you.
  if (react.pulse > 0) {
    // The jump only if there is ground to push off. Stacked on a burst it
    // put the bird half a metre up, out of the top of its own room.
    if (!pose.flying) pose.lift += react.pulse * 0.22;
    pose.wing += Math.abs(Math.sin(react.k * Math.PI * 7)) * 0.9 * react.pulse;
    pose.tail += react.pulse * 0.25;
    pose.headThrust += react.pulse * 0.02;
  }
  // Never through the floor, whatever the dip and the tap add up to.
  pose.lift = Math.max(pose.lift, -FOWL_CROUCH_M);
  return pose;
}
