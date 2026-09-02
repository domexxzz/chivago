/**
 * The companions, drawn.
 *
 * The collection shipped as five bordered boxes of text. A page about a dusky
 * langur, a green sea turtle and a fiddler crab that contains no langur, no
 * turtle and no crab is asking the reader to do the imagining, on the one
 * screen in the app whose entire job is to be delightful.
 *
 * DRAWN, NOT PHOTOGRAPHED, on purpose. These are real endangered animals and a
 * stock photograph would carry a licence, a photographer and a place - three
 * claims this project has no evidence for. A mark is honest about being a mark.
 * Each one is built from the single feature you would actually name the animal
 * by: the langur's white eye rings, the hornbill's casque, the kite's swept
 * wings, the turtle's scutes, the crab's one absurd claw.
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
  | 'dusky-langur'
  | 'pied-hornbill'
  | 'brahminy-kite'
  | 'green-turtle'
  | 'fiddler-crab';

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

/** Trachypithecus obscurus. The white eye rings are the whole animal. */
function DuskyLangur({ tone, soft }: MarkProps) {
  return (
    <G>
      {/* Tail: longer than the body, which is true and also reads well. */}
      <Path
        d="M20 44 C 8 46, 6 30, 14 24"
        stroke={tone}
        strokeWidth={2.5}
        fill="none"
        strokeLinecap="round"
      />
      <Ellipse cx={32} cy={42} rx={13} ry={14} fill={soft} stroke={tone} strokeWidth={2.5} />
      <Circle cx={32} cy={24} r={13} fill={soft} stroke={tone} strokeWidth={2.5} />
      <Circle cx={27} cy={23} r={4.6} fill="none" stroke={tone} strokeWidth={2.2} />
      <Circle cx={38} cy={23} r={4.6} fill="none" stroke={tone} strokeWidth={2.2} />
      <Circle cx={27} cy={23} r={1.6} fill={tone} />
      <Circle cx={38} cy={23} r={1.6} fill={tone} />
      <Path d="M28 32 Q 32 35, 36 32" stroke={tone} strokeWidth={2} fill="none" strokeLinecap="round" />
    </G>
  );
}

/** Anthracoceros albirostris. The bill and casque are two thirds of the bird. */
function PiedHornbill({ tone, soft }: MarkProps) {
  return (
    <G>
      <Ellipse cx={38} cy={40} rx={16} ry={13} fill={soft} stroke={tone} strokeWidth={2.5} />
      <Circle cx={28} cy={24} r={10} fill={soft} stroke={tone} strokeWidth={2.5} />
      {/* The bill, downcurved, with the casque riding on top of it. */}
      <Path
        d="M20 22 L 4 27 C 9 32, 15 32, 20 30 Z"
        fill={soft}
        stroke={tone}
        strokeWidth={2.5}
        strokeLinejoin="round"
      />
      <Path d="M20 18 C 13 17, 8 20, 6 25" stroke={tone} strokeWidth={2.5} fill="none" strokeLinecap="round" />
      <Circle cx={29} cy={22} r={1.9} fill={tone} />
      <Path d="M50 46 L 60 52" stroke={tone} strokeWidth={2.5} strokeLinecap="round" />
    </G>
  );
}

/** Haliastur indus. Seen from below, the way you actually see one. */
function BrahminyKite({ tone, soft }: MarkProps) {
  return (
    <G>
      <Path
        d="M32 26 C 22 16, 10 16, 3 24 C 12 26, 22 30, 32 34 Z"
        fill={soft}
        stroke={tone}
        strokeWidth={2.5}
        strokeLinejoin="round"
      />
      <Path
        d="M32 26 C 42 16, 54 16, 61 24 C 52 26, 42 30, 32 34 Z"
        fill={soft}
        stroke={tone}
        strokeWidth={2.5}
        strokeLinejoin="round"
      />
      <Ellipse cx={32} cy={34} rx={5} ry={13} fill={soft} stroke={tone} strokeWidth={2.5} />
      <Circle cx={32} cy={20} r={5} fill={soft} stroke={tone} strokeWidth={2.5} />
      <Path d="M27 47 L 32 57 L 37 47" fill="none" stroke={tone} strokeWidth={2.5} strokeLinejoin="round" />
    </G>
  );
}

/** Chelonia mydas. From above, because that is how a snorkeller meets one. */
function GreenTurtle({ tone, soft }: MarkProps) {
  return (
    <G>
      <Ellipse cx={20} cy={22} rx={8} ry={5} fill={soft} stroke={tone} strokeWidth={2.2} transform="rotate(-30 20 22)" />
      <Ellipse cx={44} cy={22} rx={8} ry={5} fill={soft} stroke={tone} strokeWidth={2.2} transform="rotate(30 44 22)" />
      <Ellipse cx={20} cy={47} rx={6} ry={4} fill={soft} stroke={tone} strokeWidth={2.2} transform="rotate(30 20 47)" />
      <Ellipse cx={44} cy={47} rx={6} ry={4} fill={soft} stroke={tone} strokeWidth={2.2} transform="rotate(-30 44 47)" />
      <Circle cx={32} cy={13} r={7} fill={soft} stroke={tone} strokeWidth={2.5} />
      <Circle cx={29} cy={12} r={1.7} fill={tone} />
      <Ellipse cx={32} cy={35} rx={17} ry={19} fill={soft} stroke={tone} strokeWidth={2.5} />
      {/* Scutes. Three lines is enough to say "shell" and not one more. */}
      <Line x1={32} y1={17} x2={32} y2={53} stroke={tone} strokeWidth={1.8} opacity={0.8} />
      <Line x1={16} y1={30} x2={48} y2={30} stroke={tone} strokeWidth={1.8} opacity={0.8} />
      <Line x1={17} y1={42} x2={47} y2={42} stroke={tone} strokeWidth={1.8} opacity={0.8} />
    </G>
  );
}

/** Austruca / Tubuca spp. One claw enormous, one tiny. Nothing else needed. */
function FiddlerCrab({ tone, soft }: MarkProps) {
  return (
    <G>
      {/* The big claw, held up. This is the entire identification. */}
      <Path
        d="M14 34 L 6 22 C 3 16, 9 10, 14 14 L 20 22 Z"
        fill={soft}
        stroke={tone}
        strokeWidth={2.5}
        strokeLinejoin="round"
      />
      <Path d="M6 22 L 13 20" stroke={tone} strokeWidth={2} strokeLinecap="round" />
      <Ellipse cx={36} cy={36} rx={17} ry={13} fill={soft} stroke={tone} strokeWidth={2.5} />
      <Path d="M53 30 L 60 25" stroke={tone} strokeWidth={2.2} strokeLinecap="round" />
      <Circle cx={31} cy={26} r={2.1} fill={tone} />
      <Circle cx={41} cy={26} r={2.1} fill={tone} />
      <Line x1={26} y1={48} x2={22} y2={56} stroke={tone} strokeWidth={2.2} strokeLinecap="round" />
      <Line x1={36} y1={49} x2={36} y2={57} stroke={tone} strokeWidth={2.2} strokeLinecap="round" />
      <Line x1={46} y1={48} x2={50} y2={56} stroke={tone} strokeWidth={2.2} strokeLinecap="round" />
    </G>
  );
}

const MARKS: Record<CreatureKey, (p: MarkProps) => React.JSX.Element> = {
  'dusky-langur': DuskyLangur,
  'pied-hornbill': PiedHornbill,
  'brahminy-kite': BrahminyKite,
  'green-turtle': GreenTurtle,
  'fiddler-crab': FiddlerCrab,
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
      // screen reader announcing "drawing of a crab" after "Fiddler crab,
      // grown" is noise, not access.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Mark tone={tone} soft={soft} />
    </Svg>
  );
}
