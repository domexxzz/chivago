/**
 * Chivar Bot, drawn in code.
 *
 * The concierge's face used to be a 1.2 MB photograph that could only ever be
 * one expression, pointing one way, at one size. A travel assistant that reacts
 * to you cannot be a flat picture - so this is the same character as vector
 * parts: a cream body, the teal explorer kit, the bucket hat with its band, and
 * a dark screen face that SWAPS. The face is the only thing that changes between
 * moods, which is the whole point - it reads as one robot feeling eight things,
 * not eight robots.
 *
 * WHY SVG AND NOT A SPRITE SHEET. The face has to animate (the eyes blink, the
 * screen glows while it is thinking) and it has to tint to whatever surface it
 * sits on. A PNG does neither, and eight PNGs is four megabytes for a thing that
 * is a dozen shapes. Here the whole cast is this one file.
 *
 * THE EXPRESSIONS are the ones on the character sheet: happy, playful,
 * surprised, smile, thinking, cool, love, cheer. `FACES` is a lookup from mood
 * to the handful of shapes that draw it, over a shared screen. Add a mood by
 * adding a row, not a file.
 */

import React from 'react';
import { Animated, Easing, View } from 'react-native';
import Svg, {
  Circle, Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Rect, Stop,
} from 'react-native-svg';

export type BotMood =
  | 'happy' | 'playful' | 'surprised' | 'smile'
  | 'thinking' | 'cool' | 'love' | 'cheer' | 'idle';

/** The brand teals and the screen colours, in one place. */
const C = {
  body: '#FBF6EC', bodyShade: '#E7DCC6', bodyLine: '#C9BB9E',
  teal: '#1F7A74', tealDark: '#145E59', tealLight: '#2E9A92',
  hat: '#E7D4A8', hatShade: '#CBB683', band: '#1F7A74',
  screen: '#10232E', screenRim: '#2A4350', glow: '#5FE6D8',
  leaf: '#4FB06A', gold: '#F2B33C',
} as const;

/**
 * The face for a mood: eyes and a mouth, in the glow colour, on the screen.
 *
 * Coordinates are in the screen's own box (a ~44x34 rounded rect centred in the
 * 100x100 viewBox), so a mood never has to know where the head is - only what a
 * face looks like. `blink` is the eye path swapped in while the eyes are shut.
 */
type Face = { eyes: React.ReactNode; mouth: React.ReactNode; blink?: React.ReactNode };

const EYE = { lx: 41, rx: 59, y: 46, r: 3.4 };

/** Two round eyes, the default pair most moods reuse. */
const roundEyes = (r = EYE.r) => (
  <>
    <Circle cx={EYE.lx} cy={EYE.y} r={r} fill={C.glow} />
    <Circle cx={EYE.rx} cy={EYE.y} r={r} fill={C.glow} />
  </>
);

/** Eyes shut: a short line each, for the blink and for the happy squint. */
const happyEyes = (
  <>
    <Path d={`M${EYE.lx - 4} ${EYE.y + 1} q4 -5 8 0`} stroke={C.glow} strokeWidth="2.6" fill="none" strokeLinecap="round" />
    <Path d={`M${EYE.rx - 4} ${EYE.y + 1} q4 -5 8 0`} stroke={C.glow} strokeWidth="2.6" fill="none" strokeLinecap="round" />
  </>
);

const blinkEyes = (
  <>
    <Path d={`M${EYE.lx - 3.6} ${EYE.y} h7.2`} stroke={C.glow} strokeWidth="2.4" strokeLinecap="round" />
    <Path d={`M${EYE.rx - 3.6} ${EYE.y} h7.2`} stroke={C.glow} strokeWidth="2.4" strokeLinecap="round" />
  </>
);

const smile = (y = 54, w = 7) => (
  <Path d={`M${50 - w} ${y} q${w} ${w * 0.9} ${w * 2} 0`} stroke={C.glow} strokeWidth="2.4" fill="none" strokeLinecap="round" />
);

const FACES: Record<Exclude<BotMood, 'idle'>, Face> = {
  happy: { eyes: happyEyes, mouth: smile(53, 8) },
  smile: { eyes: roundEyes(), mouth: smile(54, 6) },
  playful: {
    // One eye winks, tongue out.
    eyes: (
      <>
        <Path d={`M${EYE.lx - 4} ${EYE.y + 1} q4 -5 8 0`} stroke={C.glow} strokeWidth="2.6" fill="none" strokeLinecap="round" />
        <Circle cx={EYE.rx} cy={EYE.y} r={EYE.r} fill={C.glow} />
      </>
    ),
    mouth: (
      <>
        {smile(53, 7)}
        <Path d="M49 55 q2 3 3.5 0" stroke={C.gold} strokeWidth="2" fill="none" strokeLinecap="round" />
      </>
    ),
  },
  surprised: {
    eyes: roundEyes(4.4),
    mouth: <Circle cx="50" cy="55" r="3.2" fill="none" stroke={C.glow} strokeWidth="2.2" />,
  },
  thinking: {
    // Eyes glance up; a question mark to the side.
    eyes: (
      <>
        <Circle cx={EYE.lx} cy={EYE.y - 1.5} r={EYE.r} fill={C.glow} />
        <Circle cx={EYE.rx} cy={EYE.y - 1.5} r={EYE.r} fill={C.glow} />
      </>
    ),
    mouth: (
      <>
        <Path d="M46 55 h8" stroke={C.glow} strokeWidth="2.2" strokeLinecap="round" />
        <Path d="M63 42 q3 -3 5 0 q1.6 1.8 -1 3.4 q-1.6 1 -1.4 2.6" stroke={C.gold} strokeWidth="2" fill="none" strokeLinecap="round" />
        <Circle cx="65.4" cy="51.4" r="1.1" fill={C.gold} />
      </>
    ),
  },
  cool: {
    // Sunglasses: one dark bar across the eyes.
    eyes: (
      <>
        <Rect x="35" y="43" width="30" height="6.4" rx="3.2" fill={C.glow} opacity="0.92" />
        <Rect x="36.5" y="44.2" width="11" height="4" rx="2" fill="#0B1A22" />
        <Rect x="52.5" y="44.2" width="11" height="4" rx="2" fill="#0B1A22" />
      </>
    ),
    mouth: smile(55, 6),
  },
  love: {
    // Heart eyes.
    eyes: (
      <>
        <Path d={heart(EYE.lx, EYE.y, 3.4)} fill={C.gold} />
        <Path d={heart(EYE.rx, EYE.y, 3.4)} fill={C.gold} />
      </>
    ),
    mouth: smile(54, 7),
  },
  cheer: {
    // Eyes up, big open smile - the "สู้ๆ" face.
    eyes: happyEyes,
    mouth: <Path d="M43 52 q7 8 14 0 z" fill={C.glow} opacity="0.9" />,
  },
};

/** A heart path centred on (cx, cy). */
function heart(cx: number, cy: number, s: number): string {
  return `M${cx} ${cy + s * 0.9}`
    + ` C${cx - s * 1.5} ${cy - s * 0.2}, ${cx - s} ${cy - s * 1.4}, ${cx} ${cy - s * 0.3}`
    + ` C${cx + s} ${cy - s * 1.4}, ${cx + s * 1.5} ${cy - s * 0.2}, ${cx} ${cy + s * 0.9} Z`;
}

/**
 * The robot.
 *
 * `mood` picks the face; `idle` is `smile` that blinks and breathes. `waving`
 * raises the right arm - used when it greets. The whole thing is one SVG so it
 * scales to any `size` without a second asset.
 */
export function ChivarBot({
  mood = 'idle',
  size = 120,
  waving,
}: {
  mood?: BotMood;
  size?: number;
  waving?: boolean;
}) {
  const face = FACES[mood === 'idle' ? 'smile' : mood];

  /*
    Three motions, each on the cheapest mechanism that drives it.

    - Breathing bobs the WHOLE robot, so it rides on the outer `Animated.View`
      with the native driver - a transform React Native animates off the JS
      thread, which `react-native-svg` cannot do to a `<G>`.
    - Blink and wave change the DRAWING, not a transform, so they are plain
      state that re-renders: shut eyes swap in, and the raised arm rocks
      between two angles. A wave is two frames; it does not need a timeline.
  */
  const bob = React.useRef(new Animated.Value(0)).current;
  const [shut, setShut] = React.useState(false);
  const [waveUp, setWaveUp] = React.useState(false);

  React.useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(bob, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [bob]);

  React.useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => {
        if (!alive) return;
        setShut(true);
        setTimeout(() => { if (alive) setShut(false); schedule(); }, 130);
      }, 2400 + Math.random() * 2600);
    };
    schedule();
    return () => { alive = false; clearTimeout(timer); };
  }, []);

  React.useEffect(() => {
    if (!waving) { setWaveUp(false); return; }
    const id = setInterval(() => setWaveUp((up) => !up), 340);
    return () => clearInterval(id);
  }, [waving]);

  const translateY = bob.interpolate({ inputRange: [0, 1], outputRange: [0, -2.2] });
  const waveRotate = waving ? (waveUp ? -22 : -6) : 0;
  const eyes = shut && mood !== 'cool' && mood !== 'love' ? (face.blink ?? blinkEyes) : face.eyes;

  return (
    <Animated.View style={{ width: size, height: size, transform: [{ translateY }] }}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Defs>
          <LinearGradient id="cbBody" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#FFFFFF" />
            <Stop offset="0.55" stopColor={C.body} />
            <Stop offset="1" stopColor={C.bodyShade} />
          </LinearGradient>
          <LinearGradient id="cbTeal" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={C.tealLight} />
            <Stop offset="1" stopColor={C.tealDark} />
          </LinearGradient>
          <RadialGradient id="cbScreenGlow" cx="50" cy="48" r="26" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={C.glow} stopOpacity="0.16" />
            <Stop offset="1" stopColor={C.glow} stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="cbShadow" cx="50" cy="50" r="50">
            <Stop offset="0" stopColor="#0B2A2E" stopOpacity="0.18" />
            <Stop offset="1" stopColor="#0B2A2E" stopOpacity="0" />
          </RadialGradient>
        </Defs>

        {/* Ground shadow, still, so the bob reads against it. */}
        <Ellipse cx="50" cy="92" rx="24" ry="5" fill="url(#cbShadow)" />

        <G>
          {/* Backpack roll peeking behind the shoulder. */}
          <Rect x="24" y="52" width="14" height="22" rx="7" fill="url(#cbTeal)" stroke={C.tealDark} strokeWidth="0.8" />
          <Circle cx="31" cy="57" r="3" fill={C.tealDark} opacity="0.5" />

          {/* Legs + feet. */}
          <Rect x="42" y="74" width="7" height="14" rx="3.5" fill="url(#cbBody)" stroke={C.bodyLine} strokeWidth="0.8" />
          <Rect x="51" y="74" width="7" height="14" rx="3.5" fill="url(#cbBody)" stroke={C.bodyLine} strokeWidth="0.8" />
          <Ellipse cx="45" cy="89" rx="5" ry="2.6" fill={C.teal} />
          <Ellipse cx="55" cy="89" rx="5" ry="2.6" fill={C.teal} />

          {/* Left arm, resting. */}
          <Path d="M34 60 q-6 4 -5 12" stroke="url(#cbBody)" strokeWidth="6.5" fill="none" strokeLinecap="round" />
          <Circle cx="29" cy="72" r="3.6" fill="url(#cbBody)" stroke={C.bodyLine} strokeWidth="0.8" />

          {/* Body: a soft capsule torso in the explorer suit. */}
          <Rect x="36" y="56" width="28" height="24" rx="13" fill="url(#cbBody)" stroke={C.bodyLine} strokeWidth="0.9" />
          {/* The teal scarf + a compass badge. */}
          <Path d="M39 59 q11 6 22 0 l-2 5 q-9 4 -18 0 z" fill="url(#cbTeal)" />
          <Circle cx="50" cy="69" r="4.6" fill={C.body} stroke={C.tealDark} strokeWidth="1" />
          <Path d="M50 65.6 l1.6 3.4 -1.6 1 -1.6 -1 z" fill={C.leaf} />
          <Path d="M50 72.4 l-1.4 -2.8 1.4 -0.9 1.4 0.9 z" fill={C.gold} />

          {/* Right arm - raised and waving when asked, else resting. The wave
              is two angles swapped on a timer, pivoting at the shoulder. */}
          <G rotation={waveRotate} originX={64} originY={60}>
            {waving ? (
              <>
                <Path d="M64 60 q10 -4 13 -13" stroke="url(#cbBody)" strokeWidth="6.5" fill="none" strokeLinecap="round" />
                <Circle cx="78" cy="46" r="4" fill="url(#cbBody)" stroke={C.bodyLine} strokeWidth="0.8" />
              </>
            ) : (
              <>
                <Path d="M66 60 q6 4 5 12" stroke="url(#cbBody)" strokeWidth="6.5" fill="none" strokeLinecap="round" />
                <Circle cx="71" cy="72" r="3.6" fill="url(#cbBody)" stroke={C.bodyLine} strokeWidth="0.8" />
              </>
            )}
          </G>

          {/* Head: a rounded square with the dark screen face. */}
          <Rect x="30" y="24" width="40" height="34" rx="15" fill="url(#cbBody)" stroke={C.bodyLine} strokeWidth="1" />
          <Circle cx="50" cy="48" r="26" fill="url(#cbScreenGlow)" />
          {/* side ear-caps */}
          <Ellipse cx="30" cy="42" rx="3.4" ry="6" fill={C.teal} />
          <Ellipse cx="70" cy="42" rx="3.4" ry="6" fill={C.teal} />

          {/* The screen, and the face on it. */}
          <Rect x="34" y="33" width="32" height="22" rx="10" fill={C.screen} stroke={C.screenRim} strokeWidth="1.4" />
          <G>
            {eyes}
            {face.mouth}
          </G>

          {/* Bucket hat with the Chivar Bot band and a sprout. */}
          <Path d="M28 30 q22 -10 44 0 l-2 4 q-20 -7 -40 0 z" fill={C.hat} stroke={C.hatShade} strokeWidth="0.8" />
          <Path d="M33 26 q17 -11 34 0 q-17 -6 -34 0 z" fill={C.hat} stroke={C.hatShade} strokeWidth="0.8" />
          <Rect x="33" y="27.4" width="34" height="4.4" rx="2.2" fill={C.band} />
          {/* sprout */}
          <Path d="M58 20 q3 -5 7 -4 q-1 5 -7 4 z" fill={C.leaf} />
          <Path d="M58 20 q-1 -4 2 -7" stroke={C.tealDark} strokeWidth="1" fill="none" strokeLinecap="round" />
        </G>
      </Svg>
    </Animated.View>
  );
}
