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

  /* ------------------------------------------------------------------------
     The second ten.

     Same rule that chose the first: who a traveller in this pilot actually
     meets. Five are the rest of the South, because somebody on Samui moves
     through Chumphon, Ranong, Phang Nga, Nakhon Si Thammarat and Songkhla to
     get anywhere. Lampang's rooster is here because `mascots.ts` names it in
     its own header as one of the five recognisable emblems, and it was the
     only one of those five still undrawn. The last four are the provinces a
     domestic traveller is most likely to pass through next.
     ---------------------------------------------------------------------- */

  /** Lampang. The rooster on the seal, and on every chicken bowl ever made here. */
  'lampang-rooster': ({ id, body, feature, accent }) => (
    <G>
      {/* The tail is the silhouette. A rooster drawn without it is a hen. */}
      <Path d="M 20 38 q -10 -16 -4 -26 q 2 9 8 12 q -3 -12 4 -18 q 0 11 6 15 z" fill={accent} />
      <Path d="M 22 40 q -8 -12 -4 -21 q 3 8 8 11 z" fill={feature} opacity={0.45} />
      <Ellipse cx={35} cy={38} rx={15} ry={14} fill={`url(#${id}-b)`} />
      <Circle cx={38} cy={24} r={10} fill={body} />
      {/* Comb and wattle, in the feature red the data already carries. */}
      <Path d="M 34 15 q 2 -5 4 0 q 2 -5 4 0 q 2 -4 3 1 l -11 2 z" fill={feature} />
      <Path d="M 42 30 q 3 4 0 6 q -3 -1 -2 -5 z" fill={feature} />
      <Polygon points="47,24 55,26 47,29" fill={accent} />
      <Eyes y={23} gap={0} r={2.6} />
      {[-1, 1].map((sx) => (
        <Path key={sx} d={`M ${35 + sx * 4} 52 l 0 5`} stroke={accent} strokeWidth={2.4} strokeLinecap="round" />
      ))}
    </G>
  ),

  /** Nakhon Si Thammarat. A nang talung shadow puppet, lit from behind. */
  'nakhonsi-puppet': ({ id, feature, accent, belly }) => (
    <G>
      {/* The stick it is held on, first, so the puppet sits on it. */}
      <Path d="M 32 40 l 0 18" stroke={feature} strokeWidth={2.4} strokeLinecap="round" />
      <Path d="M 32 10 q 12 2 12 14 q 0 10 -6 14 q -6 4 -12 0 q -6 -4 -6 -14 q 0 -12 12 -14 z" fill={`url(#${id}-b)`} />
      {/* Perforations: a shadow puppet is defined by the light coming through it. */}
      {[0, 1, 2, 3, 4].map((i) => (
        <Circle key={i} cx={26 + (i % 3) * 6} cy={26 + Math.floor(i / 3) * 7} r={1.5} fill={belly} opacity={0.85} />
      ))}
      <Path d="M 24 12 q 8 -8 16 0 q -3 -2 -8 -2 q -5 0 -8 2 z" fill={accent} />
      <Polygon points="32,4 36,11 28,11" fill={accent} />
      <Eyes y={22} gap={5} r={2.4} />
      <Path d="M 32 30 q 4 3 7 1" stroke="#1d2321" strokeWidth={1.8} fill="none" strokeLinecap="round" />
    </G>
  ),

  /** Chumphon. A robusta coffee cherry, which is what the province grows. */
  'chumphon-coffee': ({ id, accent, feature }) => (
    <G>
      <Path d="M 32 12 q 4 -6 12 -6 q -2 8 -10 10 z" fill={accent} />
      <Path d="M 36 8 q -2 4 -3 7" stroke={feature} strokeWidth={1.2} fill="none" opacity={0.6} />
      <Circle cx={32} cy={34} r={16} fill={`url(#${id}-b)`} />
      {/* The centre line every coffee cherry has down one side. */}
      <Path d="M 32 19 q 5 15 0 30" stroke={feature} strokeWidth={1.8} fill="none" opacity={0.5} />
      <Ellipse cx={25} cy={27} rx={5} ry={3.4} fill="#ffffff" opacity={0.3} />
      <Eyes y={32} gap={6.5} />
      <Smile y={41} w={9} />
    </G>
  ),

  /** Phang Nga. A manta ray over the Similans. */
  'phangnga-ray': ({ id, feature, accent }) => (
    <G>
      {/* One wide wing shape. A ray is a silhouette before it is anything else. */}
      <Path d="M 32 18 q 20 2 27 14 q -11 8 -27 8 q -16 0 -27 -8 q 7 -12 27 -14 z" fill={`url(#${id}-b)`} />
      <Path d="M 32 40 q 2 10 0 20" stroke={feature} strokeWidth={2.6} fill="none" strokeLinecap="round" />
      {/* Cephalic fins, the two forward horns that make it a manta. */}
      <Path d="M 25 20 q -3 -7 -6 -8 q 1 6 3 9 z" fill={feature} />
      <Path d="M 39 20 q 3 -7 6 -8 q -1 6 -3 9 z" fill={feature} />
      <Ellipse cx={32} cy={26} rx={9} ry={4} fill={accent} opacity={0.35} />
      <Eyes y={26} gap={11} r={2.4} />
      <Path d="M 27 33 q 5 3 10 0" stroke="#1d2321" strokeWidth={1.8} fill="none" strokeLinecap="round" />
    </G>
  ),

  /** Songkhla. The mouse of Ko Nu, off the old town. */
  'songkhla-mouse': ({ id, feature, accent }) => (
    <G>
      {/* The tail first, curling behind, so the body overlaps it. */}
      <Path d="M 46 44 q 14 2 12 -10" stroke={accent} strokeWidth={2.4} fill="none" strokeLinecap="round" />
      <Circle cx={20} cy={24} r={9} fill={accent} opacity={0.55} />
      <Circle cx={44} cy={24} r={9} fill={accent} opacity={0.55} />
      <Circle cx={20} cy={24} r={5} fill={feature} opacity={0.35} />
      <Circle cx={44} cy={24} r={5} fill={feature} opacity={0.35} />
      <Ellipse cx={32} cy={36} rx={16} ry={14} fill={`url(#${id}-b)`} />
      <Eyes y={33} gap={6.5} r={3.2} />
      <Circle cx={32} cy={41} r={2.4} fill={accent} />
      {[-1, 1].map((sx) => (
        <G key={sx}>
          <Path d={`M ${32 + sx * 4} 42 l ${sx * 9} -2`} stroke={feature} strokeWidth={1.2} strokeLinecap="round" />
          <Path d={`M ${32 + sx * 4} 44 l ${sx * 9} 2`} stroke={feature} strokeWidth={1.2} strokeLinecap="round" />
        </G>
      ))}
    </G>
  ),

  /** Ranong. A turtle in the hot spring, with the steam the data asks for. */
  'ranong-hotspring': ({ id, feature, accent, belly }) => (
    <G>
      {/* Steam above, water below, and the turtle between them. */}
      {[0, 1, 2].map((i) => (
        <Path
          key={i}
          d={`M ${22 + i * 10} 14 q 4 -5 0 -9`}
          stroke={accent} strokeWidth={2.2} fill="none" strokeLinecap="round" opacity={0.75}
        />
      ))}
      <Ellipse cx={32} cy={48} rx={24} ry={6} fill={accent} opacity={0.45} />
      <Ellipse cx={32} cy={36} rx={17} ry={13} fill={`url(#${id}-b)`} />
      {/* Shell plates, six, which is what reads as a shell at this size. */}
      {[[32, 30], [24, 36], [40, 36], [28, 43], [36, 43], [32, 37]].map(([x, y], i) => (
        <Polygon
          key={i}
          points={`${x! - 4},${y!} ${x!},${y! - 4} ${x! + 4},${y!} ${x!},${y! + 4}`}
          fill={feature} opacity={0.35}
        />
      ))}
      <Circle cx={32} cy={24} r={7} fill={belly} />
      <Eyes y={23} gap={3} r={2} />
      <Path d="M 29 27 q 3 2 6 0" stroke="#1d2321" strokeWidth={1.6} fill="none" strokeLinecap="round" />
    </G>
  ),

  /** Chiang Rai. The Mekong giant catfish at Chiang Khong. */
  'chiangrai-catfish': ({ id, feature, accent }) => (
    <G>
      <Path d="M 8 32 q 6 -12 22 -12 q 18 0 24 10 q -6 12 -24 12 q -16 0 -22 -10 z" fill={`url(#${id}-b)`} />
      <Path d="M 54 30 q 8 -7 10 -3 q -1 10 -10 7 z" fill={feature} />
      <Path d="M 30 20 q 1 -8 6 -10 q 1 6 0 10 z" fill={feature} />
      {/* The barbels. A catfish is its whiskers. */}
      <Path d="M 10 34 q -7 3 -8 9" stroke={accent} strokeWidth={2} fill="none" strokeLinecap="round" />
      <Path d="M 10 30 q -8 -1 -9 -7" stroke={accent} strokeWidth={2} fill="none" strokeLinecap="round" />
      <Eyes y={29} gap={0} r={2.8} />
      <Path d="M 8 35 q 5 3 10 1" stroke="#1d2321" strokeWidth={1.8} fill="none" strokeLinecap="round" />
    </G>
  ),

  /** Kanchanaburi. A barking deer by the Kwae. */
  'kanchanaburi-muntjac': ({ id, feature, accent, belly }) => (
    <G>
      {/* Short antlers on long pedicles, which is exactly what a muntjac has. */}
      <Path d="M 25 16 l -3 -11 l 4 2" stroke={feature} strokeWidth={2.4} fill="none" strokeLinecap="round" />
      <Path d="M 39 16 l 3 -11 l -4 2" stroke={feature} strokeWidth={2.4} fill="none" strokeLinecap="round" />
      <Ellipse cx={18} cy={25} rx={6} ry={8} fill={feature} opacity={0.6} />
      <Ellipse cx={46} cy={25} rx={6} ry={8} fill={feature} opacity={0.6} />
      <Ellipse cx={32} cy={34} rx={14} ry={16} fill={`url(#${id}-b)`} />
      <Ellipse cx={32} cy={44} rx={7} ry={6} fill={belly} />
      <Eyes y={31} gap={7} r={3.2} />
      <Ellipse cx={32} cy={44} rx={2.6} ry={2} fill="#1d2321" />
      <Path d="M 28 50 q 4 3 8 0" stroke="#1d2321" strokeWidth={1.8} fill="none" strokeLinecap="round" />
      <Circle cx={50} cy={14} r={2.2} fill={accent} opacity={0.7} />
    </G>
  ),

  /** Nakhon Ratchasima. The Korat cat, silver-blue with green eyes. */
  'korat-cat': ({ id, feature, accent }) => (
    <G>
      <Path d="M 40 46 q 14 4 14 -8" stroke={feature} strokeWidth={3} fill="none" strokeLinecap="round" />
      <Polygon points="18,22 16,8 28,16" fill={feature} />
      <Polygon points="46,22 48,8 36,16" fill={feature} />
      {/* The heart-shaped face the breed is known for: wider at the cheeks. */}
      <Path d="M 32 18 q 16 1 16 14 q 0 16 -16 18 q -16 -2 -16 -18 q 0 -13 16 -14 z" fill={`url(#${id}-b)`} />
      <Eyes y={31} gap={7.5} r={4} ink={accent} />
      <Path d="M 30 39 l 2 2 l 2 -2 z" fill={feature} />
      <Smile y={42} w={7} />
      {[-1, 1].map((sx) => (
        <Path key={sx} d={`M ${32 + sx * 9} 40 l ${sx * 10} ${sx * 0}`} stroke={feature} strokeWidth={1.3} strokeLinecap="round" />
      ))}
    </G>
  ),

  /** Ubon Ratchathani. A carved candle from the Candle Festival. */
  'ubon-candle': ({ id, feature, accent, belly }) => (
    <G>
      {/* Flame first, because it is the top of the silhouette. */}
      <Path d="M 32 4 q 6 6 5 11 q -1 5 -5 5 q -4 0 -5 -5 q -1 -5 5 -11 z" fill={accent} />
      <Path d="M 32 10 q 2 3 2 6 q 0 2 -2 2 q -2 0 -2 -2 q 0 -3 2 -6 z" fill={belly} />
      <Path d="M 22 22 q 10 -3 20 0 l 0 30 q -10 3 -20 0 z" fill={`url(#${id}-b)`} />
      {/* Carving: three bands, which is what reads as carved at this size. */}
      {[30, 38, 46].map((y, i) => (
        <Path
          key={i}
          d={`M 22 ${y} q 10 4 20 0`}
          stroke={feature} strokeWidth={1.8} fill="none" opacity={0.55}
        />
      ))}
      <Eyes y={34} gap={5} r={2.6} />
      <Smile y={41} w={7} />
      <Path d="M 18 54 q 14 5 28 0 l -2 4 q -12 4 -24 0 z" fill={feature} opacity={0.7} />
    </G>
  ),
};
