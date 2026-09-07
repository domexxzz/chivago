/**
 * The companions, drawn.
 *
 * The collection shipped as five bordered boxes of text. A page about a
 * coconut macaque, a green sea turtle and a water buffalo that contains no
 * macaque, no turtle and no buffalo is asking the reader to do the
 * imagining, on the one screen in the app whose entire job is to be
 * delightful.
 *
 * DRAWN, NOT PHOTOGRAPHED, on purpose. These are real animals and a stock
 * photograph would carry a licence, a photographer and a place - three
 * claims this project has no evidence for. A mark is honest about being a
 * mark. Each one is built from the single feature you would actually name
 * the animal by: the macaque's round ears and its coconut, the junglefowl's
 * leaf crest, the octopus's arms, the turtle's sprout over its shell, the
 * buffalo's horns. They follow the team's own reference art of 8 September
 * (`docs/51-the-samui-five.md`) as far as a 64-pixel mark can: face-on, big
 * eyed, and each with its own thing.
 *
 * Primitives rather than long path data. Every shape here can be read, checked
 * and adjusted by a person; a 400-character `d` attribute cannot.
 *
 * These marks are what a phone draws, and what the wallet's list draws
 * everywhere. The room itself, on the web, is the three-dimensional animal in
 * `creature3d/` — same five species, same primitives-not-models rule, its own
 * colours (see `creature3d/rig.ts` for why). `CreatureScene.tsx` chooses.
 */

import React from 'react';
import Svg, { Circle, Ellipse, Path, Line, G } from 'react-native-svg';
import { color } from '../theme/index.ts';
import type { CompanionStage } from '@chivago/core';

/** Drawn inside a 64x64 box and scaled, so every creature shares a baseline. */
const BOX = 64;

export type CreatureKey =
  | 'coconut-macaque'
  | 'red-junglefowl'
  | 'day-octopus'
  | 'green-turtle'
  | 'water-buffalo';

interface MarkProps {
  /** Line and fill colour. Set by the stage, not by the species. */
  tone: string;
  /** Softer than `tone`, for the parts that sit behind. */
  soft: string;
}

/**
 * The egg. One drawing for all five, because that is the mechanic: an egg does
 * not tell you what is inside it, and an egg that hinted at the species would
 * spend the only surprise the collection has.
 */
function Egg({ tone, soft }: MarkProps) {
  return (
    <G>
      <Ellipse cx={32} cy={35} rx={17} ry={22} fill={soft} stroke={tone} strokeWidth={2.5} />
      <Circle cx={26} cy={28} r={2.6} fill={tone} opacity={0.55} />
      <Circle cx={37} cy={38} r={3.4} fill={tone} opacity={0.4} />
      <Circle cx={29} cy={45} r={2} fill={tone} opacity={0.45} />
    </G>
  );
}

/** The sprout three of them wear on the head: a stem and a leaf. */
function Sprout({ tone, soft, x, y }: MarkProps & { x: number; y: number }) {
  return (
    <G>
      <Line x1={x} y1={y} x2={x} y2={y - 4} stroke={tone} strokeWidth={1.6} strokeLinecap="round" />
      <Path d={`M${x} ${y - 4} C ${x + 1} ${y - 8}, ${x + 5} ${y - 8}, ${x + 6} ${y - 5} C ${x + 4} ${y - 3}, ${x + 1} ${y - 3}, ${x} ${y - 4} Z`} fill={soft} stroke={tone} strokeWidth={1.5} strokeLinejoin="round" />
    </G>
  );
}

/** Macaca nemestrina. Round ears, a tan face, and the coconut it was trained to pick. */
function CoconutMacaque({ tone, soft }: MarkProps) {
  return (
    <G>
      {/* Tail, curled up behind: a pig-tail, which is the name. */}
      <Path d="M22 50 C 12 52, 10 42, 16 40" stroke={tone} strokeWidth={2.4} fill="none" strokeLinecap="round" />
      <Ellipse cx={30} cy={47} rx={11} ry={10} fill={soft} stroke={tone} strokeWidth={2.5} />
      <Circle cx={18} cy={25} r={5} fill={soft} stroke={tone} strokeWidth={2.2} />
      <Circle cx={44} cy={25} r={5} fill={soft} stroke={tone} strokeWidth={2.2} />
      <Circle cx={31} cy={26} r={12} fill={soft} stroke={tone} strokeWidth={2.5} />
      {/* The tuft. */}
      <Path d="M29 14 L 31 9 L 33 14" stroke={tone} strokeWidth={1.8} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Ellipse cx={31} cy={30} rx={7.5} ry={6} fill="none" stroke={tone} strokeWidth={1.6} opacity={0.7} />
      <Circle cx={27} cy={24} r={1.8} fill={tone} />
      <Circle cx={35} cy={24} r={1.8} fill={tone} />
      <Path d="M28 32 Q 31 34.5, 34 32" stroke={tone} strokeWidth={1.8} fill="none" strokeLinecap="round" />
      {/* The coconut, held out. */}
      <Circle cx={49} cy={45} r={6} fill={soft} stroke={tone} strokeWidth={2.4} />
      <Circle cx={47} cy={43} r={1} fill={tone} />
      <Circle cx={51} cy={43} r={1} fill={tone} />
      <Circle cx={49} cy={46.5} r={1} fill={tone} />
      <Path d="M40 44 L 44 45" stroke={tone} strokeWidth={2.4} strokeLinecap="round" />
    </G>
  );
}

/** Gallus gallus. The crest is drawn as leaves, the way the team drew it; the feet say chicken. */
function RedJunglefowl({ tone, soft }: MarkProps) {
  return (
    <G>
      {/* The crest: four leaf feathers, the middle ones taller. */}
      <Ellipse cx={22} cy={13} rx={3.4} ry={7} fill={soft} stroke={tone} strokeWidth={2} transform="rotate(-32 22 13)" />
      <Ellipse cx={28.5} cy={9} rx={3.4} ry={7.5} fill={soft} stroke={tone} strokeWidth={2} transform="rotate(-10 28.5 9)" />
      <Ellipse cx={35.5} cy={9} rx={3.4} ry={7.5} fill={soft} stroke={tone} strokeWidth={2} transform="rotate(10 35.5 9)" />
      <Ellipse cx={42} cy={13} rx={3.4} ry={7} fill={soft} stroke={tone} strokeWidth={2} transform="rotate(32 42 13)" />
      {/* Wings out at the sides, and the body under the head. */}
      <Ellipse cx={17} cy={47} rx={6} ry={3.5} fill={soft} stroke={tone} strokeWidth={2} transform="rotate(-25 17 47)" />
      <Ellipse cx={47} cy={47} rx={6} ry={3.5} fill={soft} stroke={tone} strokeWidth={2} transform="rotate(25 47 47)" />
      <Ellipse cx={32} cy={48} rx={11} ry={8.5} fill={soft} stroke={tone} strokeWidth={2.5} />
      <Circle cx={32} cy={30} r={13} fill={soft} stroke={tone} strokeWidth={2.5} />
      {/* Tufts at the ears. */}
      <Ellipse cx={17} cy={30} rx={5} ry={2.8} fill={soft} stroke={tone} strokeWidth={1.8} transform="rotate(-35 17 30)" />
      <Ellipse cx={47} cy={30} rx={5} ry={2.8} fill={soft} stroke={tone} strokeWidth={1.8} transform="rotate(35 47 30)" />
      <Circle cx={27} cy={29} r={2.2} fill={tone} />
      <Circle cx={37} cy={29} r={2.2} fill={tone} />
      {/* The beak: a small diamond. */}
      <Path d="M32 32.5 L 34.5 35 L 32 37.5 L 29.5 35 Z" fill={tone} />
      <Path d="M27 56 L 26 60 M 23 60 L 29 60" stroke={tone} strokeWidth={2.2} strokeLinecap="round" />
      <Path d="M37 56 L 38 60 M 35 60 L 41 60" stroke={tone} strokeWidth={2.2} strokeLinecap="round" />
    </G>
  );
}

/** Octopus cyanea. A dome, two eyes, and arms that never all agree. */
function DayOctopus({ tone, soft }: MarkProps) {
  return (
    <G>
      <Circle cx={32} cy={27} r={15} fill={soft} stroke={tone} strokeWidth={2.5} />
      <Sprout tone={tone} soft={soft} x={32} y={12} />
      <Circle cx={26} cy={27} r={2.4} fill={tone} />
      <Circle cx={38} cy={27} r={2.4} fill={tone} />
      <Path d="M29 34 Q 32 36.5, 35 34" stroke={tone} strokeWidth={1.8} fill="none" strokeLinecap="round" />
      {/* Eight arms would be a scribble at this size. Six, in two directions, read as many. */}
      <Path d="M20 37 C 10 41, 6 51, 12 57" stroke={tone} strokeWidth={2.6} fill="none" strokeLinecap="round" />
      <Path d="M25 41 C 18 47, 18 57, 24 59" stroke={tone} strokeWidth={2.6} fill="none" strokeLinecap="round" />
      <Path d="M32 42 C 30 49, 32 56, 34 59" stroke={tone} strokeWidth={2.6} fill="none" strokeLinecap="round" />
      <Path d="M39 41 C 46 47, 46 57, 40 59" stroke={tone} strokeWidth={2.6} fill="none" strokeLinecap="round" />
      <Path d="M44 37 C 54 41, 58 51, 52 57" stroke={tone} strokeWidth={2.6} fill="none" strokeLinecap="round" />
      {/* One arm up, waving. */}
      <Path d="M46 30 C 56 28, 60 20, 56 12" stroke={tone} strokeWidth={2.4} fill="none" strokeLinecap="round" />
      {/* Suckers on the nearest arm. */}
      <Circle cx={10} cy={49} r={1.2} fill={tone} />
      <Circle cx={11} cy={53} r={1.2} fill={tone} />
      <Circle cx={13.5} cy={56} r={1.2} fill={tone} />
    </G>
  );
}

/** Chelonia mydas. Face on, the sprout on its head, the shell behind it. */
function GreenTurtle({ tone, soft }: MarkProps) {
  return (
    <G>
      {/* The shell, behind everything, with its scutes. */}
      <Ellipse cx={32} cy={44} rx={19} ry={13} fill={soft} stroke={tone} strokeWidth={2.5} />
      <Path d="M20 37 L 26 36 M 38 36 L 44 37 M 16 46 L 22 46 M 42 46 L 48 46" stroke={tone} strokeWidth={1.6} opacity={0.7} strokeLinecap="round" />
      {/* A flipper up, waving; the other down. */}
      <Ellipse cx={14} cy={36} rx={7} ry={3.5} fill={soft} stroke={tone} strokeWidth={2.2} transform="rotate(-45 14 36)" />
      <Ellipse cx={50} cy={45} rx={7} ry={3.5} fill={soft} stroke={tone} strokeWidth={2.2} transform="rotate(20 50 45)" />
      <Ellipse cx={32} cy={46} rx={11} ry={9} fill={soft} stroke={tone} strokeWidth={2.2} />
      <Ellipse cx={26} cy={58} rx={4.5} ry={2.5} fill={soft} stroke={tone} strokeWidth={2} />
      <Ellipse cx={38} cy={58} rx={4.5} ry={2.5} fill={soft} stroke={tone} strokeWidth={2} />
      <Circle cx={32} cy={23} r={12.5} fill={soft} stroke={tone} strokeWidth={2.5} />
      {/* The spots on the head, and the sprout. */}
      <Circle cx={25} cy={15} r={2.3} fill={tone} opacity={0.5} />
      <Circle cx={32} cy={13} r={2.3} fill={tone} opacity={0.5} />
      <Circle cx={39} cy={16} r={2.3} fill={tone} opacity={0.5} />
      <Sprout tone={tone} soft={soft} x={33} y={10.5} />
      <Circle cx={27} cy={24} r={2.2} fill={tone} />
      <Circle cx={37} cy={24} r={2.2} fill={tone} />
      <Path d="M29 30 Q 32 32.5, 35 30" stroke={tone} strokeWidth={1.8} fill="none" strokeLinecap="round" />
    </G>
  );
}

/** Bubalus bubalis. The horns are the whole animal; the rest is the head between them. */
function WaterBuffalo({ tone, soft }: MarkProps) {
  return (
    <G>
      {/* Horns: out, back, and up in one sweep each side. */}
      <Path d="M22 22 C 8 20, 4 8, 14 6" stroke={tone} strokeWidth={3} fill="none" strokeLinecap="round" />
      <Path d="M42 22 C 56 20, 60 8, 50 6" stroke={tone} strokeWidth={3} fill="none" strokeLinecap="round" />
      <Ellipse cx={16} cy={30} rx={5} ry={3.2} fill={soft} stroke={tone} strokeWidth={2} transform="rotate(-20 16 30)" />
      <Ellipse cx={48} cy={30} rx={5} ry={3.2} fill={soft} stroke={tone} strokeWidth={2} transform="rotate(20 48 30)" />
      <Ellipse cx={32} cy={34} rx={14} ry={13} fill={soft} stroke={tone} strokeWidth={2.5} />
      <Sprout tone={tone} soft={soft} x={33} y={21} />
      <Circle cx={27} cy={30} r={2} fill={tone} />
      <Circle cx={37} cy={30} r={2} fill={tone} />
      <Ellipse cx={32} cy={42} rx={8.5} ry={5.5} fill={soft} stroke={tone} strokeWidth={2.2} />
      <Circle cx={29} cy={42} r={1.3} fill={tone} />
      <Circle cx={35} cy={42} r={1.3} fill={tone} />
      <Path d="M28 53 L 28 58 M 36 53 L 36 58" stroke={tone} strokeWidth={2.6} strokeLinecap="round" />
    </G>
  );
}

const MARKS: Record<CreatureKey, (p: MarkProps) => React.JSX.Element> = {
  'coconut-macaque': CoconutMacaque,
  'red-junglefowl': RedJunglefowl,
  'day-octopus': DayOctopus,
  'green-turtle': GreenTurtle,
  'water-buffalo': WaterBuffalo,
};

export const hasCreatureMark = (key: string): key is CreatureKey => key in MARKS;

/**
 * A companion at its stage.
 *
 * The stage sets the colour, and the colour is the same ladder the rest of the
 * app uses for evidence: muted while it is only presence, lime once a host has
 * vouched for the quest that grew it. So the picture and the number are saying
 * the same thing, which is the point of having both.
 */
export function Creature({
  species, stage, size = 56,
}: {
  species: string;
  stage: CompanionStage;
  size?: number;
}) {
  const tone = stage === 'grown' ? color.accent : color.neutral700;
  const soft = stage === 'grown' ? color.accent100 : color.neutral200;

  const Mark = stage === 'egg' || !hasCreatureMark(species) ? Egg : MARKS[species];

  return (
    <Svg
      width={size}
      height={size}
      viewBox={`0 0 ${BOX} ${BOX}`}
      // Decorative: the name and stage are already read out beside it, and a
      // screen reader announcing "drawing of a buffalo" after "Water buffalo,
      // grown" is noise, not access.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Mark tone={tone} soft={soft} />
    </Svg>
  );
}
