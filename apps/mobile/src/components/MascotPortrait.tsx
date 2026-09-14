/**
 * Ten mascots drawn one at a time, and sixty-seven still drawn by the machine.
 *
 * `MascotMark` renders all seventy-seven from eight body archetypes and a
 * short list of parts. That was the right first move — it is how seventy-seven
 * creatures exist at all rather than nine — but it has a cost the owner named
 * plainly: they look like each other. A generic silhouette with a glyph on its
 * head is a placeholder that shipped.
 *
 * So this is a REGISTRY, not a replacement. A key with a portrait gets the
 * portrait; every other key falls through to the machine, unchanged. Nothing
 * breaks on the day a mascot has no art, which is what makes it safe to add
 * them ten at a time instead of waiting for seventy-seven.
 *
 * WHICH TEN, and the rule for choosing: the ones a traveller in this pilot
 * actually meets. Surat Thani is Koh Samui, where the pilot runs; Chon Buri is
 * the Si Racha campus. The other eight are the emblems `mascots.ts` names in
 * its own header as the recognisable ones — the white elephant, the durian,
 * the ghost mask, the dugong. Fame is the tiebreak, not the criterion.
 *
 * EVERY COLOUR COMES FROM THE DATA. `mascot.colours` already holds body,
 * belly, feature and accent for all seventy-seven, chosen when the emblems
 * were researched. A portrait that picked its own palette would look better in
 * isolation and put the art and the record out of step, which is the failure
 * this codebase spends most of its comments avoiding.
 *
 * Primitives rather than path data where a primitive will do, as `Creature.tsx`
 * insists: a circle somebody can move is worth more than a curve nobody can
 * read. The few real paths here are the ones a shape genuinely needs — a
 * trunk, a spiral, a tail fluke.
 */

import React from 'react';
import Svg, {
  Circle, Defs, Ellipse, G, Path, Polygon, RadialGradient, Stop,
} from 'react-native-svg';
import type { Mascot } from '@chivago/core';
import { MascotMark } from './MascotMark.tsx';

const BOX = 64;

/** Whether this mascot has been drawn by hand yet. Exported for the catalogue and its test. */
export const hasPortrait = (key: string): boolean => key in PORTRAITS;

/** How many are drawn, so a screen can say so honestly rather than implying all. */
export const PORTRAIT_COUNT = () => Object.keys(PORTRAITS).length;

export function MascotPortrait({
  mascot, size = 64,
}: { mascot: Mascot; size?: number }) {
  const draw = PORTRAITS[mascot.key];
  if (!draw) return <MascotMark mascot={mascot} size={size} />;

  const { body, belly, feature, accent } = mascot.colours;
  // Ids are global in SVG, so every gradient carries its mascot's key. Two
  // portraits on one screen sharing an id is the classic way the second one
  // renders in the first one's colours.
  const id = `mp-${mascot.key}`;

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${BOX} ${BOX}`} accessibilityRole="image">
      <Defs>
        <RadialGradient id={`${id}-b`} cx="36%" cy="28%" r="72%">
          <Stop offset="0%" stopColor={belly} />
          <Stop offset="62%" stopColor={body} />
          <Stop offset="100%" stopColor={feature} />
        </RadialGradient>
      </Defs>
      {/* The ground shadow. Every portrait gets one: it is most of what makes a
          drawing sit on a page rather than float in front of it. */}
      <Ellipse cx={32} cy={58} rx={17} ry={3.4} fill={feature} opacity={0.22} />
      {draw({ id, body, belly, feature, accent })}
    </Svg>
  );
}

type Ink = { id: string; body: string; belly: string; feature: string; accent: string };

/** Two eyes with a catchlight, which is the whole difference between alive and drawn. */
const Eyes = ({ y = 28, gap = 7, r = 3.4, ink = '#1d2321' }: {
  y?: number; gap?: number; r?: number; ink?: string;
}) => (
  <G>
    {[-1, 1].map((s) => (
      <G key={s}>
        <Circle cx={32 + s * gap} cy={y} r={r} fill={ink} />
        <Circle cx={32 + s * gap + r * 0.34} cy={y - r * 0.36} r={r * 0.34} fill="#ffffff" />
      </G>
    ))}
  </G>
);

/** A small open smile. Drawn, not implied by a curve nobody can see at 40px. */
const Smile = ({ y = 39, w = 8 }: { y?: number; w?: number }) => (
  <Path
    d={`M ${32 - w / 2} ${y} q ${w / 2} ${w * 0.7} ${w} 0`}
    stroke="#1d2321" strokeWidth={2.2} fill="none" strokeLinecap="round"
  />
);

const PORTRAITS: Record<string, (ink: Ink) => React.ReactNode> = {
  /** Surat Thani. Rong Rian rambutan — the pilot province, so it is drawn first. */
  'suratthani-rambutan': ({ id, body, accent, feature }) => (
    <G>
      {/* The spines are the whole emblem. Sixteen, radial, in the accent green. */}
      {Array.from({ length: 16 }, (_, i) => {
        const a = (i / 16) * Math.PI * 2;
        return (
          <Path
            key={i}
            d={`M ${32 + Math.sin(a) * 15} ${33 + Math.cos(a) * 15} l ${Math.sin(a) * 7} ${Math.cos(a) * 7}`}
            stroke={accent} strokeWidth={2.4} strokeLinecap="round"
          />
        );
      })}
      <Circle cx={32} cy={33} r={16} fill={`url(#${id}-b)`} />
      <Ellipse cx={26} cy={26} rx={5.5} ry={3.6} fill="#ffffff" opacity={0.3} />
      <Eyes y={31} gap={6} />
      <Smile y={40} w={9} />
      <Path d="M 32 17 q 2 -6 7 -7" stroke={feature} strokeWidth={2.4} fill="none" strokeLinecap="round" />
    </G>
  ),

  /** Chon Buri. The dolphin of Bang Saen bay — the campus province. */
  'chonburi-dolphin': ({ id, accent, feature }) => (
    <G>
      <Path d="M 12 40 q 8 -20 28 -20 q 14 0 16 12 q -14 4 -22 12 q -12 10 -22 -4 z" fill={`url(#${id}-b)`} />
      {/* Dorsal fin and flukes, the two shapes that make it a dolphin and not a fish. */}
      <Path d="M 33 21 q 3 -10 10 -11 q -3 7 -2 12 z" fill={feature} />
      <Path d="M 12 40 q -7 -4 -8 -11 q 8 2 11 6 z" fill={feature} />
      <Path d="M 48 30 q 8 1 11 -3 q -1 8 -8 9 z" fill={feature} />
      <Eyes y={28} gap={6} r={2.8} />
      <Path d="M 52 33 q 5 1 7 3" stroke="#1d2321" strokeWidth={2} fill="none" strokeLinecap="round" />
      <Circle cx={20} cy={18} r={2.6} fill={accent} opacity={0.85} />
      <Circle cx={26} cy={12} r={1.8} fill={accent} opacity={0.6} />
    </G>
  ),

  /** Bangkok. The Siamese cat, seal points and all. */
  'bangkok-siamese': ({ id, feature, accent }) => (
    <G>
      <Path d="M 18 20 l -3 -11 l 10 5 z" fill={feature} />
      <Path d="M 46 20 l 3 -11 l -10 5 z" fill={feature} />
      <Circle cx={32} cy={30} r={16} fill={`url(#${id}-b)`} />
      {/* The mask, which is what makes a Siamese a Siamese. */}
      <Ellipse cx={32} cy={36} rx={9} ry={7} fill={feature} opacity={0.55} />
      <Eyes y={28} gap={7} r={3.6} ink={accent} />
      <Path d="M 30 36 l 2 2 l 2 -2 z" fill={feature} />
      <Smile y={40} w={7} />
      {[-1, 1].map((s) => (
        <G key={s}>
          <Path d={`M ${32 + s * 10} 37 l ${s * 9} -2`} stroke={feature} strokeWidth={1.4} strokeLinecap="round" />
          <Path d={`M ${32 + s * 10} 40 l ${s * 9} 2`} stroke={feature} strokeWidth={1.4} strokeLinecap="round" />
        </G>
      ))}
    </G>
  ),

  /** Nonthaburi. The durian the river orchards are known by. */
  'nonthaburi-durian': ({ id, feature, accent }) => (
    <G>
      <Path d="M 32 15 q 17 2 17 20 q 0 17 -17 17 q -17 0 -17 -17 q 0 -18 17 -20 z" fill={`url(#${id}-b)`} />
      {/* Spikes on the silhouette only: a durian drawn with spikes all over
          reads as a virus at 40 pixels. */}
      {Array.from({ length: 11 }, (_, i) => {
        const a = Math.PI * (0.12 + (i / 10) * 0.76) + Math.PI * 0.62;
        const x = 32 + Math.sin(a) * 17;
        const y = 35 + Math.cos(a) * 18;
        return (
          <Polygon
            key={i}
            points={`${x - 3},${y} ${x + Math.sin(a) * 6},${y + Math.cos(a) * 6} ${x + 3},${y}`}
            fill={feature}
          />
        );
      })}
      <Path d="M 32 15 q 1 -6 -3 -8 q 6 0 7 7 z" fill={accent} />
      <Eyes y={32} gap={6.5} />
      <Smile y={41} w={9} />
    </G>
  ),

  /** Loei. Phi Ta Khon, in the mask with the long nose. */
  'loei-phitakhon': ({ id, feature, accent, belly }) => (
    <G>
      {/* The woven hat is taller than the face, which is the silhouette people
          recognise from a hundred metres at Dan Sai. */}
      <Path d="M 32 6 q 13 4 12 15 l -24 0 q -1 -11 12 -15 z" fill={accent} />
      <Path d="M 20 21 l 24 0 l -2 4 l -20 0 z" fill={feature} />
      <Path d="M 32 24 q 13 1 13 15 q 0 13 -13 13 q -13 0 -13 -13 q 0 -14 13 -15 z" fill={`url(#${id}-b)`} />
      {/* The nose. Long, curved, the single most identifying line on it. */}
      <Path d="M 32 34 q 9 4 8 16 q -5 -1 -8 -6 z" fill={belly} stroke={feature} strokeWidth={1.2} />
      <Eyes y={32} gap={7} r={3} />
      <Path d="M 24 43 q 5 4 10 1" stroke="#1d2321" strokeWidth={2} fill="none" strokeLinecap="round" />
    </G>
  ),

  /** Trang. The dugong of Koh Libong, in the seagrass. */
  'trang-dugong': ({ id, accent, feature }) => (
    <G>
      <Path d="M 8 30 q 3 -6 12 -6 l 22 0 q 11 0 13 9 q -2 9 -13 9 l -22 0 q -9 0 -12 -6 z" fill={`url(#${id}-b)`} />
      <Path d="M 55 33 q 7 -5 9 -2 q -2 8 -9 6 z" fill={feature} />
      {/* The blunt snout is the difference between a dugong and a seal. */}
      <Ellipse cx={12} cy={33} rx={6} ry={5.5} fill={feature} opacity={0.55} />
      <Eyes y={30} gap={5} r={2.4} />
      <Path d="M 8 36 q 4 2 7 0" stroke="#1d2321" strokeWidth={1.8} fill="none" strokeLinecap="round" />
      {[0, 1, 2].map((i) => (
        <Path
          key={i}
          d={`M ${18 + i * 11} 54 q 2 -9 5 -12`}
          stroke={accent} strokeWidth={2.4} fill="none" strokeLinecap="round" opacity={0.8}
        />
      ))}
    </G>
  ),

  /** Phuket. The whales that pass the Andaman coast. */
  'phuket-whale': ({ id, feature, accent, belly }) => (
    <G>
      <Path d="M 6 34 q 4 -13 20 -13 q 20 0 24 11 q -4 12 -24 12 q -16 0 -20 -10 z" fill={`url(#${id}-b)`} />
      <Path d="M 50 32 q 9 -8 12 -4 q -1 11 -12 8 z" fill={feature} />
      {/* The pleated throat, in the belly colour, and the spout. */}
      {[0, 1, 2].map((i) => (
        <Path key={i} d={`M ${14 + i * 5} 41 q 3 4 0 6`} stroke={belly} strokeWidth={1.6} fill="none" opacity={0.9} />
      ))}
      <Path d="M 22 21 q 0 -9 -5 -12 q 8 2 9 11 z" fill={accent} opacity={0.85} />
      <Eyes y={31} gap={0} r={2.6} />
      <Path d="M 8 36 q 8 4 16 2" stroke="#1d2321" strokeWidth={2} fill="none" strokeLinecap="round" />
    </G>
  ),

  /** Krabi. A seahorse, for the limestone sea at Railay. */
  'krabi-seahorse': ({ id, feature, accent }) => (
    <G>
      {/* One continuous body: head, neck, trunk, and the tail curled under. */}
      <Path
        d="M 36 12 q 10 1 10 9 q 0 6 -7 8 q -6 2 -6 10 q 0 9 6 11 q -9 5 -14 -3 q -4 -7 0 -14 q 3 -6 1 -11 q -2 -6 -6 -6 q 6 -5 16 -4 z"
        fill={`url(#${id}-b)`}
      />
      <Path d="M 46 20 q 7 1 9 -2 q 0 7 -8 7 z" fill={feature} opacity={0.8} />
      {/* The snout, which is the whole reason anybody recognises it. */}
      <Path d="M 24 19 q -9 1 -11 5 q 5 3 12 1 z" fill={feature} />
      {[0, 1, 2, 3].map((i) => (
        <Circle key={i} cx={40 - i * 1.5} cy={30 + i * 5} r={1.6} fill={accent} opacity={0.75} />
      ))}
      <Circle cx={32} cy={20} r={3} fill="#1d2321" />
      <Circle cx={33} cy={19} r={1} fill="#ffffff" />
    </G>
  ),

  /** Ayutthaya. The conch on the seal, in a tray. */
  'ayutthaya-conch': ({ id, feature, accent }) => (
    <G>
      <Path d="M 40 10 q 12 8 8 22 q -4 14 -18 18 q -14 4 -18 -6 q 10 0 16 -8 q 6 -8 4 -16 q -2 -9 8 -10 z" fill={`url(#${id}-b)`} />
      {/* The whorl, three turns, which is what makes it a conch and not a shell. */}
      <Path
        d="M 38 17 q 7 4 5 13 q -2 9 -11 12"
        stroke={feature} strokeWidth={1.8} fill="none" strokeLinecap="round" opacity={0.8}
      />
      <Path
        d="M 36 24 q 4 3 2 8 q -2 5 -7 6"
        stroke={feature} strokeWidth={1.5} fill="none" strokeLinecap="round" opacity={0.6}
      />
      {/* The tray it sits in on the seal. */}
      <Path d="M 10 51 q 22 6 44 0 l -3 5 q -19 5 -38 0 z" fill={accent} />
      <Eyes y={33} gap={5.5} r={2.6} />
      <Smile y={41} w={7} />
    </G>
  ),

  /** Chiang Mai. The white elephant, under a Bo Sang umbrella. */
  'chiangmai-elephant': ({ id, feature, accent, belly }) => (
    <G>
      {/* The umbrella first, so the elephant sits under it rather than beside it. */}
      <Path d="M 32 4 q 18 4 20 14 l -40 0 q 2 -10 20 -14 z" fill={accent} />
      <Path d="M 32 4 l 0 14" stroke={feature} strokeWidth={1.4} />
      <Path d="M 20 18 q 12 4 24 0" stroke={belly} strokeWidth={1.6} fill="none" opacity={0.7} />
      {/* Ears wide and flat — the fan the data already asks for. */}
      <Ellipse cx={17} cy={34} rx={9} ry={11} fill={feature} opacity={0.7} />
      <Ellipse cx={47} cy={34} rx={9} ry={11} fill={feature} opacity={0.7} />
      <Circle cx={32} cy={34} r={15} fill={`url(#${id}-b)`} />
      {/* The trunk, curled up, which is the line the whole drawing rests on. */}
      <Path
        d="M 32 40 q 2 10 -4 13 q -7 3 -8 -4 q 1 -5 5 -4"
        stroke={feature} strokeWidth={4.6} fill="none" strokeLinecap="round"
      />
      <Eyes y={31} gap={7} r={3} />
      {[-1, 1].map((s) => (
        <Path key={s} d={`M ${32 + s * 7} 43 l ${s * 1} 5`} stroke={belly} strokeWidth={2.6} strokeLinecap="round" />
      ))}
    </G>
  ),
};
