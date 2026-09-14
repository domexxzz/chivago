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
  /* ------------------------------------------------------------------------
     The third ten.

     The rule has not changed and does not need to: who a traveller in this
     pilot actually meets. Prachuap and Phetchaburi are the road south, which
     everybody on that road drives through. Rayong and Samut Prakan are the
     coast either side of the Si Racha campus. The four in Isan and Sukhothai
     are where domestic travel goes after the coast.
     ---------------------------------------------------------------------- */

  /** Prachuap Khiri Khan. The pineapple the province is planted with. */
  'prachuap-pineapple': ({ id, feature, accent }) => (
    <G>
      {/* The crown is half the silhouette, so it is drawn at full height. */}
      {[-2, -1, 0, 1, 2].map((i) => (
        <Path
          key={i}
          d={`M 32 20 q ${i * 5} -9 ${i * 7} -14`}
          stroke={accent} strokeWidth={3.4} fill="none" strokeLinecap="round"
        />
      ))}
      <Ellipse cx={32} cy={37} rx={14} ry={17} fill={`url(#${id}-b)`} />
      {/* The diamond lattice, which is what says pineapple at any size. */}
      {[24, 31, 38, 45].map((y, r) => (
        <G key={y}>
          {[-1, 0, 1].map((c) => (
            <Polygon
              key={c}
              points={`${32 + c * 8 + (r % 2) * 4 - 4},${y} ${32 + c * 8 + (r % 2) * 4},${y - 4} ${32 + c * 8 + (r % 2) * 4 + 4},${y} ${32 + c * 8 + (r % 2) * 4},${y + 4}`}
              fill={feature} opacity={0.28}
            />
          ))}
        </G>
      ))}
      <Eyes y={35} gap={6} />
      <Smile y={44} w={8} />
    </G>
  ),

  /** Phetchaburi. A bee, for the palm sugar the province is known by. */
  'phetchaburi-bee': ({ id, feature, accent, belly }) => (
    <G>
      {/* Wings behind the body, translucent, so the stripes read on top. */}
      <Ellipse cx={20} cy={24} rx={10} ry={6} fill={accent} opacity={0.55} transform="rotate(-24 20 24)" />
      <Ellipse cx={44} cy={24} rx={10} ry={6} fill={accent} opacity={0.55} transform="rotate(24 44 24)" />
      <Ellipse cx={32} cy={36} rx={14} ry={13} fill={`url(#${id}-b)`} />
      {[30, 38, 45].map((y, i) => (
        <Path key={i} d={`M ${21 + i} ${y} q 11 ${5 - i} ${22 - i * 2} 0`} stroke={feature} strokeWidth={3} fill="none" opacity={0.8} />
      ))}
      <Path d="M 27 18 q -3 -8 -7 -9" stroke={feature} strokeWidth={1.8} fill="none" strokeLinecap="round" />
      <Path d="M 37 18 q 3 -8 7 -9" stroke={feature} strokeWidth={1.8} fill="none" strokeLinecap="round" />
      <Circle cx={19} cy={9} r={2} fill={belly} />
      <Circle cx={45} cy={9} r={2} fill={belly} />
      <Eyes y={32} gap={6} />
      <Smile y={40} w={7} />
    </G>
  ),

  /** Sukhothai. A Sangkhalok celadon fish, off a kiln plate. */
  'sukhothai-celadon': ({ id, feature, accent }) => (
    <G>
      <Path d="M 10 34 q 8 -13 24 -13 q 14 0 18 11 q -4 12 -18 12 q -16 0 -24 -10 z" fill={`url(#${id}-b)`} />
      <Path d="M 52 32 q 9 -8 12 -4 q -2 11 -12 8 z" fill={feature} />
      {/* Crackle glaze, which is the whole reason Sangkhalok is recognisable. */}
      {[[18, 27, 12, 9], [26, 24, 8, 13], [34, 30, 14, 6], [24, 38, 10, 7]].map(([x, y, dx, dy], i) => (
        <Path key={i} d={`M ${x} ${y} l ${dx} ${dy}`} stroke={feature} strokeWidth={0.9} opacity={0.5} />
      ))}
      <Path d="M 30 22 q 2 -7 7 -8 q 0 5 -2 9 z" fill={accent} opacity={0.8} />
      <Eyes y={30} gap={0} r={2.8} />
      <Path d="M 10 36 q 6 3 12 1" stroke="#1d2321" strokeWidth={1.8} fill="none" strokeLinecap="round" />
    </G>
  ),

  /** Mae Hong Son. Bua tong, which turns the hills at Mae U-Kho gold. */
  'maehongson-buatong': ({ id, feature, accent, belly }) => (
    <G>
      <Path d="M 32 46 q 1 8 0 14" stroke={accent} strokeWidth={3} fill="none" strokeLinecap="round" />
      <Path d="M 32 52 q 7 -3 9 1 q -6 3 -9 0 z" fill={accent} />
      {/* Twelve petals, radial, in the body colour with the feature at the tips. */}
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2;
        return (
          <Ellipse
            key={i}
            cx={32 + Math.sin(a) * 14}
            cy={32 + Math.cos(a) * 14}
            rx={4}
            ry={7.5}
            fill={i % 2 === 0 ? belly : feature}
            opacity={i % 2 === 0 ? 0.95 : 0.75}
            transform={`rotate(${-(a * 180) / Math.PI} ${32 + Math.sin(a) * 14} ${32 + Math.cos(a) * 14})`}
          />
        );
      })}
      <Circle cx={32} cy={32} r={11} fill={`url(#${id}-b)`} />
      <Eyes y={30} gap={5} />
      <Smile y={37} w={7} />
    </G>
  ),

  /** Surin. A grey elephant in a silk blanket. */
  'surin-elephant': ({ id, feature, accent, belly }) => (
    <G>
      <Ellipse cx={16} cy={33} rx={9} ry={11} fill={feature} opacity={0.7} />
      <Ellipse cx={48} cy={33} rx={9} ry={11} fill={feature} opacity={0.7} />
      <Circle cx={32} cy={33} r={15} fill={`url(#${id}-b)`} />
      {/* The silk blanket, which is what separates Surin's elephant from Chiang Mai's. */}
      <Path d="M 19 26 q 13 -6 26 0 l -2 6 q -11 -5 -22 0 z" fill={accent} />
      <Path d="M 21 30 q 11 -4 22 0" stroke={belly} strokeWidth={1.2} fill="none" opacity={0.8} />
      <Path
        d="M 32 40 q 2 10 -4 13 q -7 3 -8 -4 q 1 -5 5 -4"
        stroke={feature} strokeWidth={4.6} fill="none" strokeLinecap="round"
      />
      <Eyes y={33} gap={7} r={3} />
      {[-1, 1].map((sx) => (
        <Path key={sx} d={`M ${32 + sx * 7} 43 l ${sx * 1} 5`} stroke={belly} strokeWidth={2.6} strokeLinecap="round" />
      ))}
    </G>
  ),

  /** Buriram. A sandstone sprite, off the lintels at Phanom Rung. */
  'buriram-sandstone': ({ id, feature, accent }) => (
    <G>
      {/* The prang silhouette behind, because the sprite is a piece of it. */}
      <Path d="M 32 4 q 9 6 9 16 l -18 0 q 0 -10 9 -16 z" fill={accent} opacity={0.85} />
      <Path d="M 32 20 q 12 2 12 15 q 0 15 -12 17 q -12 -2 -12 -17 q 0 -13 12 -15 z" fill={`url(#${id}-b)`} />
      {/* Carved bands, three, weathered rather than sharp. */}
      {[28, 36, 44].map((y, i) => (
        <Path key={i} d={`M 21 ${y} q 11 3 22 0`} stroke={feature} strokeWidth={1.6} fill="none" opacity={0.5} />
      ))}
      <Eyes y={31} gap={6} r={2.8} />
      <Path d="M 27 40 q 5 4 10 0" stroke="#1d2321" strokeWidth={1.8} fill="none" strokeLinecap="round" />
    </G>
  ),

  /** Khon Kaen. A silkworm, for the mudmee the province weaves. */
  'khonkaen-silkworm': ({ id, feature, accent }) => (
    <G>
      {/* Six segments, decreasing, which is the whole body language of a larva. */}
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <Ellipse
          key={i}
          cx={14 + i * 8}
          cy={38 - Math.sin((i / 5) * Math.PI) * 6}
          rx={7 - i * 0.5}
          ry={6.5 - i * 0.4}
          fill={i === 5 ? `url(#${id}-b)` : accent}
          opacity={i === 5 ? 1 : 0.9}
        />
      ))}
      <Ellipse cx={54} cy={32} rx={8} ry={7.5} fill={`url(#${id}-b)`} />
      <Path d="M 52 24 q -2 -7 -6 -8" stroke={feature} strokeWidth={1.6} fill="none" strokeLinecap="round" />
      <Path d="M 57 24 q 2 -7 6 -8" stroke={feature} strokeWidth={1.6} fill="none" strokeLinecap="round" />
      <Eyes y={31} gap={4} r={2.2} />
      <Path d="M 51 36 q 3 2 6 0" stroke="#1d2321" strokeWidth={1.6} fill="none" strokeLinecap="round" />
    </G>
  ),

  /** Udon Thani. A Ban Chiang pot, painted in its own spirals. */
  'udon-banchiang': ({ id, feature, accent }) => (
    <G>
      <Path d="M 32 14 q -6 0 -7 4 q -1 4 -6 8 q -6 5 -6 14 q 0 12 19 12 q 19 0 19 -12 q 0 -9 -6 -14 q -5 -4 -6 -8 q -1 -4 -7 -4 z" fill={`url(#${id}-b)`} />
      {/* The spirals. Ban Chiang is its red-on-buff whorls and nothing else. */}
      {[[22, 36], [42, 36], [32, 46]].map(([x, y], i) => (
        <Path
          key={i}
          d={`M ${x} ${y} q 5 -1 5 4 q 0 4 -4 4 q -3 0 -3 -3 q 0 -2 2 -2`}
          stroke={feature} strokeWidth={1.8} fill="none" strokeLinecap="round"
        />
      ))}
      <Path d="M 20 22 q 12 -4 24 0" stroke={accent} strokeWidth={2} fill="none" opacity={0.7} />
      <Eyes y={30} gap={6} r={2.6} />
      <Smile y={38} w={7} />
    </G>
  ),

  /** Samut Prakan. The gulls that come to Bang Pu every winter. */
  'samutprakan-gull': ({ id, feature, accent }) => (
    <G>
      {/* One wing up and one down, so it reads as flying rather than standing. */}
      <Path d="M 24 30 q -14 -10 -20 -6 q 6 10 18 11 z" fill={feature} opacity={0.45} />
      <Path d="M 40 34 q 14 6 20 2 q -7 9 -19 6 z" fill={feature} opacity={0.35} />
      <Ellipse cx={32} cy={34} rx={14} ry={12} fill={`url(#${id}-b)`} />
      <Circle cx={40} cy={23} r={8} fill={`url(#${id}-b)`} />
      <Polygon points="47,22 57,24 47,27" fill={accent} />
      <Path d="M 22 44 q 4 8 0 12" stroke={accent} strokeWidth={2.2} fill="none" strokeLinecap="round" />
      <Eyes y={22} gap={0} r={2.4} />
    </G>
  ),

  /** Rayong. A squid, off the boats at Ban Phe. */
  'rayong-squid': ({ id, feature, accent }) => (
    <G>
      {/* The mantle is a cone; the fins are the two triangles at its top. */}
      <Polygon points="32,6 44,16 20,16" fill={feature} opacity={0.7} />
      <Path d="M 32 10 q 11 2 11 16 q 0 10 -11 12 q -11 -2 -11 -12 q 0 -14 11 -16 z" fill={`url(#${id}-b)`} />
      {/* Eight arms, splayed, which is the silhouette everybody recognises. */}
      {[-3, -2, -1, 0, 1, 2, 3].map((i) => (
        <Path
          key={i}
          d={`M ${32 + i * 3} 38 q ${i * 3} 10 ${i * 5} 18`}
          stroke={accent} strokeWidth={2.2} fill="none" strokeLinecap="round" opacity={0.9}
        />
      ))}
      <Eyes y={26} gap={7} r={3.4} />
      <Path d="M 28 34 q 4 3 8 0" stroke="#1d2321" strokeWidth={1.8} fill="none" strokeLinecap="round" />
    </G>
  ),

  /* ---- The rest of the North ------------------------------------------- */

  /** Lamphun. The longans the rest of the country waits for. */
  'lamphun-longan': ({ id, feature, accent }) => (
    <G>
      <Path d="M 32 15 q 5 -7 13 -6 q -3 8 -11 9 z" fill={accent} />
      <Circle cx={32} cy={35} r={15} fill={`url(#${id}-b)`} />
      <Circle cx={44} cy={41} r={9} fill={`url(#${id}-b)`} opacity={0.9} />
      <Ellipse cx={26} cy={28} rx={5} ry={3.2} fill="#ffffff" opacity={0.28} />
      <Path d="M 20 42 q 12 5 24 0" stroke={feature} strokeWidth={1.4} fill="none" opacity={0.45} />
      <Eyes y={33} gap={6} />
      <Smile y={41} w={8} />
    </G>
  ),

  /** Nan. The bull that carries the relic on the seal. */
  'nan-bull': ({ id, feature, accent, belly }) => (
    <G>
      {/* The chedi it carries, first, so the bull stands under it. */}
      <Path d="M 32 2 l 3 7 l -6 0 z" fill={accent} />
      <Path d="M 27 9 q 5 -2 10 0 l -2 6 q -3 -1 -6 0 z" fill={accent} opacity={0.85} />
      <Path d="M 18 22 q -7 -7 -4 -11 q 6 2 8 8 z" fill={belly} />
      <Path d="M 46 22 q 7 -7 4 -11 q -6 2 -8 8 z" fill={belly} />
      <Ellipse cx={32} cy={36} rx={15} ry={15} fill={`url(#${id}-b)`} />
      <Ellipse cx={32} cy={45} rx={7} ry={5.5} fill={feature} opacity={0.75} />
      <Eyes y={33} gap={7} r={3.2} />
      <Ellipse cx={32} cy={45} rx={2.4} ry={1.8} fill="#1d2321" />
    </G>
  ),

  /** Phayao. The egrets that fish the kwan at dusk. */
  'phayao-egret': ({ id, feature, accent }) => (
    <G>
      <Path d="M 30 52 l 0 9" stroke={accent} strokeWidth={2} strokeLinecap="round" />
      <Path d="M 36 52 l 0 9" stroke={accent} strokeWidth={2} strokeLinecap="round" />
      <Ellipse cx={32} cy={40} rx={13} ry={14} fill={`url(#${id}-b)`} />
      <Path d="M 26 38 q 10 -4 16 4 q -8 6 -16 -4 z" fill={feature} opacity={0.18} />
      <Circle cx={36} cy={20} r={8} fill={`url(#${id}-b)`} />
      <Path d="M 32 14 q -5 -6 -9 -6 q 3 5 7 8 z" fill={feature} opacity={0.5} />
      <Polygon points="43,19 56,22 43,24" fill={accent} />
      <Eyes y={19} gap={0} r={2.2} />
    </G>
  ),

  /** Phrae. The horse on the seal, in mo hom indigo. */
  'phrae-horse': ({ id, feature, accent, belly }) => (
    <G>
      <Path d="M 22 18 l -2 -10 l 7 6 z" fill={feature} />
      <Path d="M 40 18 l 2 -10 l -7 6 z" fill={feature} />
      <Path d="M 18 24 q -8 -4 -10 -12 q 9 2 13 9 z" fill={feature} opacity={0.7} />
      <Ellipse cx={32} cy={34} rx={13} ry={16} fill={`url(#${id}-b)`} />
      <Ellipse cx={32} cy={45} rx={7} ry={6} fill={belly} />
      {/* The mo hom scarf, which is the whole point of the indigo. */}
      <Path d="M 20 50 q 12 5 24 0 l -1 5 q -11 4 -22 0 z" fill={accent} />
      <Eyes y={32} gap={7} r={3.2} />
      <Ellipse cx={32} cy={45} rx={2.4} ry={1.8} fill="#1d2321" />
    </G>
  ),

  /** Uttaradit. The langsat, and the Long Lap Lae durian beside it. */
  'uttaradit-langsat': ({ id, feature, accent }) => (
    <G>
      <Path d="M 32 14 q 5 -6 12 -5 q -3 7 -10 8 z" fill={accent} />
      <Ellipse cx={32} cy={36} rx={15} ry={17} fill={`url(#${id}-b)`} />
      {/* Langsat hang in bunches, so a second and third sit behind. */}
      <Circle cx={19} cy={44} r={7} fill={`url(#${id}-b)`} opacity={0.8} />
      <Circle cx={45} cy={44} r={7} fill={`url(#${id}-b)`} opacity={0.8} />
      <Path d="M 24 30 q 8 -4 16 0" stroke={feature} strokeWidth={1.3} fill="none" opacity={0.4} />
      <Eyes y={34} gap={6} />
      <Smile y={42} w={8} />
    </G>
  ),

  /* ---- The Northeast ---------------------------------------------------- */

  /** Kalasin. Sirindhorna, from the fossils at Phu Kum Khao. */
  'kalasin-dino': ({ id, feature, accent }) => (
    <G>
      <Path d="M 6 44 q 10 -4 14 -12 q 4 -9 14 -9 q 12 0 14 10 q 2 10 -6 14 q -14 6 -36 -3 z" fill={`url(#${id}-b)`} />
      <Path d="M 6 44 q -6 -2 -5 -8 q 6 1 8 5 z" fill={feature} />
      {/* Plates along the spine, which is what makes a shape read as dinosaur. */}
      {[0, 1, 2, 3].map((i) => (
        <Polygon key={i} points={`${20 + i * 6},${26 - i} ${23 + i * 6},${18 - i} ${26 + i * 6},${26 - i}`} fill={accent} />
      ))}
      <Eyes y={30} gap={5} r={2.6} />
      <Path d="M 40 38 q 6 2 10 0" stroke="#1d2321" strokeWidth={1.8} fill="none" strokeLinecap="round" />
    </G>
  ),

  /** Chaiyaphum. The Siam tulip fields at Pa Hin Ngam. */
  'chaiyaphum-krachiao': ({ id, feature, accent, belly }) => (
    <G>
      <Path d="M 32 44 q 1 9 0 16" stroke={accent} strokeWidth={3} fill="none" strokeLinecap="round" />
      <Path d="M 32 50 q -8 -3 -10 1 q 7 3 10 0 z" fill={accent} />
      {/* Krachiao is a tight upright cup, not an open flower. */}
      {[-2, -1, 0, 1, 2].map((i) => (
        <Ellipse
          key={i}
          cx={32 + i * 6}
          cy={30 - Math.abs(i) * 3}
          rx={5}
          ry={13 - Math.abs(i) * 2}
          fill={i === 0 ? belly : feature}
          opacity={i === 0 ? 0.95 : 0.7}
          transform={`rotate(${i * 14} ${32 + i * 6} ${30 - Math.abs(i) * 3})`}
        />
      ))}
      <Ellipse cx={32} cy={34} rx={8} ry={10} fill={`url(#${id}-b)`} />
      <Eyes y={32} gap={4.5} r={2.4} />
      <Smile y={39} w={6} />
    </G>
  ),

  /** Nakhon Phanom. The Mekong softshell turtle. */
  'nakhonphanom-softshell': ({ id, feature, accent }) => (
    <G>
      <Ellipse cx={32} cy={38} rx={20} ry={13} fill={`url(#${id}-b)`} />
      {/* A softshell has no plates: a smooth leathery disc and a long snout. */}
      <Ellipse cx={32} cy={36} rx={14} ry={8} fill={feature} opacity={0.2} />
      <Path d="M 12 33 q -8 -2 -10 2 q 8 5 12 2 z" fill={feature} />
      <Path d="M 50 46 q 8 3 9 7 q -8 1 -11 -4 z" fill={feature} opacity={0.7} />
      <Path d="M 14 47 q -6 3 -6 7 q 7 0 9 -5 z" fill={feature} opacity={0.7} />
      <Eyes y={32} gap={4} r={2.2} />
      <Circle cx={50} cy={24} r={2.4} fill={accent} opacity={0.8} />
    </G>
  ),

  /** Bueng Kan. A stone naga, from the rock formations at Phu Thok. */
  'buengkan-stone-naga': ({ id, feature, accent }) => (
    <G>
      {/* The body coils behind the head, drawn as three narrowing arcs. */}
      {[0, 1, 2].map((i) => (
        <Path
          key={i}
          d={`M ${10 + i * 4} ${50 - i * 7} q ${18 - i * 3} ${-8 + i} ${36 - i * 8} 0`}
          stroke={i === 0 ? feature : accent}
          strokeWidth={7 - i * 1.4}
          fill="none"
          strokeLinecap="round"
          opacity={0.75}
        />
      ))}
      <Ellipse cx={34} cy={24} rx={13} ry={11} fill={`url(#${id}-b)`} />
      <Path d="M 34 13 q -4 -9 0 -11 q 4 2 0 11 z" fill={accent} />
      <Path d="M 26 14 q -3 -7 0 -9 q 3 2 1 9 z" fill={accent} opacity={0.8} />
      <Path d="M 42 14 q 3 -7 0 -9 q -3 2 -1 9 z" fill={accent} opacity={0.8} />
      <Eyes y={23} gap={5.5} r={2.6} />
      <Path d="M 30 30 q 4 3 8 0" stroke="#1d2321" strokeWidth={1.8} fill="none" strokeLinecap="round" />
    </G>
  ),

  /** Maha Sarakham. The scholar owl, for Taksila, the city of learning. */
  'mahasarakham-owl': ({ id, feature, accent, belly }) => (
    <G>
      <Path d="M 20 16 l -2 -9 l 7 5 z" fill={feature} />
      <Path d="M 44 16 l 2 -9 l -7 5 z" fill={feature} />
      <Ellipse cx={32} cy={33} rx={15} ry={16} fill={`url(#${id}-b)`} />
      <Circle cx={25} cy={29} r={7} fill={belly} />
      <Circle cx={39} cy={29} r={7} fill={belly} />
      <Circle cx={25} cy={29} r={3.4} fill="#1d2321" />
      <Circle cx={39} cy={29} r={3.4} fill="#1d2321" />
      <Circle cx={26.2} cy={27.8} r={1.2} fill="#ffffff" />
      <Circle cx={40.2} cy={27.8} r={1.2} fill="#ffffff" />
      <Polygon points="32,33 29,38 35,38" fill={accent} />
      {/* The book, which is the only reason this owl is a scholar. */}
      <Path d="M 18 50 q 14 -4 28 0 l 0 6 q -14 -4 -28 0 z" fill={accent} />
      <Path d="M 32 50 l 0 6" stroke={feature} strokeWidth={1.2} />
    </G>
  ),

  /** Mukdahan. A river clam with a pearl. */
  'mukdahan-clam': ({ id, feature, accent, belly }) => (
    <G>
      <Path d="M 32 42 q -22 0 -24 -8 q 6 -14 24 -14 q 18 0 24 14 q -2 8 -24 8 z" fill={`url(#${id}-b)`} />
      {/* Ribs radiating from the hinge — the only marking a clam has. */}
      {[-3, -2, -1, 0, 1, 2, 3].map((i) => (
        <Path key={i} d={`M 32 40 l ${i * 6.5} -15`} stroke={feature} strokeWidth={1.2} opacity={0.4} />
      ))}
      <Circle cx={32} cy={46} r={6.5} fill={belly} />
      <Circle cx={30} cy={44} r={2} fill="#ffffff" opacity={0.85} />
      <Eyes y={32} gap={6} r={2.4} />
      <Path d="M 20 48 q 12 5 24 0" stroke={accent} strokeWidth={2} fill="none" opacity={0.55} />
    </G>
  ),

  /** Yasothon. A toad, and the rocket Bun Bang Fai sends up for rain. */
  'yasothon-toad': ({ id, feature, accent }) => (
    <G>
      {/* The rocket goes up the left, so the toad is not centred under it. */}
      <Path d="M 52 8 l 3 8 l -6 0 z" fill={accent} />
      <Path d="M 49 16 l 6 0 l 0 16 l -6 0 z" fill={accent} opacity={0.85} />
      <Path d="M 49 32 l -4 6 l 14 0 l -4 -6 z" fill={feature} opacity={0.6} />
      <Ellipse cx={28} cy={42} rx={19} ry={13} fill={`url(#${id}-b)`} />
      <Circle cx={20} cy={31} r={6} fill={`url(#${id}-b)`} />
      <Circle cx={36} cy={31} r={6} fill={`url(#${id}-b)`} />
      <Eyes y={30} gap={8} r={3} />
      <Path d="M 18 44 q 10 5 20 0" stroke="#1d2321" strokeWidth={2} fill="none" strokeLinecap="round" />
      {[14, 24, 34].map((x, i) => (
        <Circle key={i} cx={x} cy={48} r={1.6} fill={feature} opacity={0.5} />
      ))}
    </G>
  ),

  /** Roi Et. A golden barb, from the lake at the city's heart. */
  'roiet-barb': ({ id, feature, accent }) => (
    <G>
      <Path d="M 12 34 q 8 -13 22 -13 q 16 0 20 11 q -4 12 -20 12 q -14 0 -22 -10 z" fill={`url(#${id}-b)`} />
      <Path d="M 54 32 q 9 -8 12 -4 q -2 11 -12 8 z" fill={accent} />
      {/* Scales, two rows, which is all a barb needs to stop being a shape. */}
      {[0, 1].map((r) => (
        <G key={r}>
          {[0, 1, 2, 3].map((c) => (
            <Path
              key={c}
              d={`M ${22 + c * 7} ${29 + r * 8} q 4 4 0 8`}
              stroke={feature} strokeWidth={1.2} fill="none" opacity={0.45}
            />
          ))}
        </G>
      ))}
      <Path d="M 30 21 q 2 -7 7 -8 q 0 5 -2 9 z" fill={accent} opacity={0.8} />
      <Eyes y={30} gap={0} r={2.8} />
      <Path d="M 12 36 q 6 3 12 1" stroke="#1d2321" strokeWidth={1.8} fill="none" strokeLinecap="round" />
    </G>
  ),

  /** Si Sa Ket. The shallot, which the province grows more of than anywhere. */
  'sisaket-shallot': ({ id, feature, accent }) => (
    <G>
      {[-1, 0, 1].map((i) => (
        <Path
          key={i}
          d={`M ${32 + i * 3} 18 q ${i * 8} -12 ${i * 12} -15`}
          stroke={accent} strokeWidth={2.6} fill="none" strokeLinecap="round"
        />
      ))}
      {/* A shallot is a teardrop: wide at the base, drawn to a point on top. */}
      <Path d="M 32 16 q 15 12 15 25 q 0 12 -15 12 q -15 0 -15 -12 q 0 -13 15 -25 z" fill={`url(#${id}-b)`} />
      {[-1, 1].map((i) => (
        <Path key={i} d={`M 32 20 q ${i * 10} 14 ${i * 7} 30`} stroke={feature} strokeWidth={1.3} fill="none" opacity={0.4} />
      ))}
      <Eyes y={37} gap={6} />
      <Smile y={45} w={8} />
    </G>
  ),

  /** Sakon Nakhon. A kingfisher, in the indigo the province dyes with. */
  'sakon-kingfisher': ({ id, feature, accent, belly }) => (
    <G>
      <Path d="M 22 46 q -12 6 -16 2 q 8 -8 16 -6 z" fill={feature} opacity={0.7} />
      <Ellipse cx={32} cy={36} rx={13} ry={15} fill={`url(#${id}-b)`} />
      {/* The orange breast, which is the half of a kingfisher people remember. */}
      <Path d="M 32 34 q 10 2 10 10 q 0 7 -10 8 q -10 -1 -10 -8 q 0 -8 10 -10 z" fill={belly} />
      <Circle cx={34} cy={20} r={9} fill={`url(#${id}-b)`} />
      <Path d="M 30 12 q 3 -7 7 -7 q -1 5 -3 8 z" fill={accent} opacity={0.8} />
      <Polygon points="42,19 58,22 42,25" fill={feature} />
      <Eyes y={19} gap={0} r={2.4} />
    </G>
  ),

  /** Nong Khai. A naga with a fireball, for the lights over the Mekong. */
  'nongkhai-fire-naga': ({ id, feature, accent }) => (
    <G>
      {/* The fireball rises on the right; the naga looks up at it. */}
      <Circle cx={50} cy={13} r={7} fill={accent} />
      <Circle cx={50} cy={13} r={3.4} fill="#ffffff" opacity={0.65} />
      {[0, 1, 2].map((i) => (
        <Path
          key={i}
          d={`M ${8 + i * 3} ${52 - i * 8} q ${16 - i * 2} ${-7 + i} ${32 - i * 7} 0`}
          stroke={i === 0 ? feature : `url(#${id}-b)`}
          strokeWidth={7 - i * 1.3} fill="none" strokeLinecap="round" opacity={0.85}
        />
      ))}
      <Ellipse cx={30} cy={26} rx={13} ry={11} fill={`url(#${id}-b)`} />
      <Polygon points="24,16 27,7 30,16" fill={accent} />
      <Polygon points="30,15 33,5 36,15" fill={accent} />
      <Polygon points="36,16 39,7 42,16" fill={accent} />
      <Eyes y={25} gap={5.5} r={2.6} />
      <Path d="M 26 32 q 4 3 8 0" stroke="#1d2321" strokeWidth={1.8} fill="none" strokeLinecap="round" />
    </G>
  ),

  /** Nong Bua Lamphu. A dragonfly over the lotus pond the province is named for. */
  'nongbua-dragonfly': ({ id, feature, accent, belly }) => (
    <G>
      {/* Four wings, long and narrow, which is the whole silhouette. */}
      {[[-1, -10], [-1, 4], [1, -10], [1, 4]].map(([sx, dy], i) => (
        <Ellipse
          key={i}
          cx={32 + sx * 15}
          cy={30 + dy * 0.6}
          rx={15} ry={4}
          fill={belly} opacity={0.5}
          transform={`rotate(${sx * (dy < 0 ? 12 : -12)} ${32 + sx * 15} ${30 + dy * 0.6})`}
        />
      ))}
      <Circle cx={48} cy={50} r={7} fill={accent} opacity={0.55} />
      {[0, 1, 2, 3].map((i) => (
        <Ellipse key={i} cx={32} cy={34 + i * 6} rx={4.5 - i * 0.7} ry={4} fill={`url(#${id}-b)`} />
      ))}
      <Circle cx={32} cy={26} r={8} fill={`url(#${id}-b)`} />
      <Path d="M 28 19 q -2 -6 -5 -7" stroke={feature} strokeWidth={1.4} fill="none" strokeLinecap="round" />
      <Path d="M 36 19 q 2 -6 5 -7" stroke={feature} strokeWidth={1.4} fill="none" strokeLinecap="round" />
      <Eyes y={25} gap={4.5} r={2.8} />
    </G>
  ),

  /** Amnat Charoen. A slow loris, which is exactly as slow as it looks. */
  'amnat-loris': ({ id, feature, accent, belly }) => (
    <G>
      <Circle cx={19} cy={26} r={5} fill={feature} opacity={0.65} />
      <Circle cx={45} cy={26} r={5} fill={feature} opacity={0.65} />
      <Circle cx={32} cy={34} r={16} fill={`url(#${id}-b)`} />
      {/* The mask around the eyes is what makes a loris a loris. */}
      <Ellipse cx={25} cy={31} rx={7} ry={8} fill={feature} opacity={0.5} />
      <Ellipse cx={39} cy={31} rx={7} ry={8} fill={feature} opacity={0.5} />
      <Circle cx={25} cy={31} r={4.4} fill="#1d2321" />
      <Circle cx={39} cy={31} r={4.4} fill="#1d2321" />
      <Circle cx={26.6} cy={29.4} r={1.5} fill="#ffffff" />
      <Circle cx={40.6} cy={29.4} r={1.5} fill="#ffffff" />
      <Path d="M 32 38 l 2 3 l -4 0 z" fill={feature} />
      <Path d="M 28 45 q 4 3 8 0" stroke="#1d2321" strokeWidth={1.8} fill="none" strokeLinecap="round" />
      <Path d="M 32 18 q -1 -5 2 -7" stroke={belly} strokeWidth={2} fill="none" strokeLinecap="round" opacity={0.7} />
      <Circle cx={52} cy={44} r={2.2} fill={accent} opacity={0.7} />
    </G>
  ),

  /* ---- The Central plain ------------------------------------------------ */

  /** Kamphaeng Phet. Kluai khai, the small sweet banana. */
  'kamphaengphet-banana': ({ id, feature, accent }) => (
    <G>
      {/* Three in a hand, the classic curve, with the stem at the top. */}
      {[-1, 0, 1].map((i) => (
        <Path
          key={i}
          d={`M ${26 + i * 6} 16 q ${10 + i * 2} 12 ${2 + i} 32 q -6 4 -10 -2 q 6 -16 ${-2 - i} -28 z`}
          fill={`url(#${id}-b)`}
          opacity={i === 0 ? 1 : 0.82}
        />
      ))}
      <Path d="M 26 14 q 6 -4 12 0 l 0 4 q -6 -3 -12 0 z" fill={accent} />
      <Path d="M 30 46 q 4 3 7 0" stroke={feature} strokeWidth={1.6} fill="none" opacity={0.6} />
      <Eyes y={30} gap={5} />
      <Smile y={37} w={7} />
    </G>
  ),

  /** Chai Nat. A green parakeet, from the bird park on the river. */
  'chainat-parakeet': ({ id, feature, accent }) => (
    <G>
      <Path d="M 40 44 q 14 8 18 20 q -14 -4 -20 -14 z" fill={feature} opacity={0.65} />
      <Ellipse cx={32} cy={36} rx={13} ry={15} fill={`url(#${id}-b)`} />
      <Circle cx={33} cy={20} r={9} fill={`url(#${id}-b)`} />
      {/* The rose ring and the red beak, which name the species between them. */}
      <Path d="M 25 26 q 8 3 16 0" stroke={accent} strokeWidth={1.8} fill="none" opacity={0.85} />
      <Path d="M 42 18 q 8 1 7 6 q -5 4 -9 -1 z" fill={accent} />
      <Path d="M 22 42 q 8 -3 14 2" stroke={feature} strokeWidth={1.3} fill="none" opacity={0.4} />
      <Eyes y={18} gap={0} r={2.4} />
    </G>
  ),

  /** Nakhon Nayok. The marian plum the orchards send down every spring. */
  'nakhonnayok-mayongchid': ({ id, feature, accent }) => (
    <G>
      <Path d="M 32 15 q 6 -7 13 -6 q -4 8 -11 9 z" fill={accent} />
      <Path d="M 32 14 l 0 -8" stroke={feature} strokeWidth={2} strokeLinecap="round" />
      <Ellipse cx={32} cy={36} rx={15} ry={17} fill={`url(#${id}-b)`} />
      <Ellipse cx={26} cy={27} rx={5} ry={3.4} fill="#ffffff" opacity={0.32} />
      <Eyes y={34} gap={6} />
      <Smile y={43} w={8} />
    </G>
  ),

  /** Nakhon Pathom. A pomelo, under the chedi. */
  'nakhonpathom-pomelo': ({ id, feature, accent }) => (
    <G>
      {/* Phra Pathom Chedi behind, in outline: the tallest stupa in the country. */}
      <Path d="M 32 2 l 2 6 l -4 0 z" fill={accent} opacity={0.9} />
      <Path d="M 26 8 q 6 -3 12 0 q 3 6 3 10 l -18 0 q 0 -4 3 -10 z" fill={accent} opacity={0.75} />
      <Circle cx={32} cy={37} r={17} fill={`url(#${id}-b)`} />
      <Path d="M 17 33 q 15 6 30 0" stroke={feature} strokeWidth={1.3} fill="none" opacity={0.35} />
      <Ellipse cx={25} cy={29} rx={5} ry={3.4} fill="#ffffff" opacity={0.28} />
      <Eyes y={36} gap={6.5} />
      <Smile y={45} w={9} />
    </G>
  ),

  /** Nakhon Sawan. The golden dragon the Chinese new year parade carries. */
  'nakhonsawan-dragon': ({ id, feature, accent, belly }) => (
    <G>
      {[0, 1, 2].map((i) => (
        <Path
          key={i}
          d={`M ${6 + i * 4} ${52 - i * 8} q ${16 - i * 2} ${-8 + i} ${32 - i * 7} 0`}
          stroke={i === 0 ? feature : belly}
          strokeWidth={7 - i * 1.3} fill="none" strokeLinecap="round" opacity={0.85}
        />
      ))}
      <Ellipse cx={34} cy={24} rx={14} ry={12} fill={`url(#${id}-b)`} />
      <Path d="M 26 14 q -4 -9 -1 -11 q 5 3 4 11 z" fill={belly} />
      <Path d="M 42 14 q 4 -9 1 -11 q -5 3 -4 11 z" fill={belly} />
      {/* Whiskers, which is the one thing a Chinese dragon cannot be drawn without. */}
      <Path d="M 22 28 q -9 2 -11 8" stroke={accent} strokeWidth={2} fill="none" strokeLinecap="round" />
      <Path d="M 46 28 q 9 2 11 8" stroke={accent} strokeWidth={2} fill="none" strokeLinecap="round" />
      <Eyes y={22} gap={6} r={2.8} />
      <Path d="M 28 31 q 6 4 12 0" stroke="#1d2321" strokeWidth={2} fill="none" strokeLinecap="round" />
    </G>
  ),

  /** Pathum Thani. The lotus the province is named after. */
  'pathumthani-lotus': ({ id, feature, accent, belly }) => (
    <G>
      <Path d="M 32 46 q 1 8 0 15" stroke={accent} strokeWidth={3} fill="none" strokeLinecap="round" />
      <Path d="M 32 52 q 9 -4 11 1 q -8 4 -11 0 z" fill={accent} />
      {/* Petals, pointed and layered — a lotus is never drawn round. */}
      {[-2, -1, 0, 1, 2].map((i) => (
        <Path
          key={i}
          d={`M 32 44 q ${i * 9 - 5} -14 ${i * 10} -22 q ${5 + i} 9 ${-i * 10 + 5} 22 z`}
          fill={i === 0 ? belly : feature}
          opacity={i === 0 ? 0.95 : 0.7}
        />
      ))}
      <Path d="M 32 44 q -9 -12 -4 -22 q 8 9 4 22 z" fill={belly} />
      <Ellipse cx={32} cy={38} rx={7} ry={7} fill={`url(#${id}-b)`} />
      <Eyes y={37} gap={4} r={2.2} />
      <Smile y={42} w={5} />
    </G>
  ),

  /** Phichit. Chalawan, the crocodile of the old poem. */
  'phichit-crocodile': ({ id, feature, accent }) => (
    <G>
      <Path d="M 4 40 q 12 -3 18 -9 q 6 -6 16 -6 q 14 0 18 8 q 4 9 -4 13 q -16 7 -48 -6 z" fill={`url(#${id}-b)`} />
      {/* Ridges down the back, low and blunt, which is what a crocodile has. */}
      {[0, 1, 2, 3, 4].map((i) => (
        <Polygon key={i} points={`${20 + i * 7},${27} ${23 + i * 7},${21} ${26 + i * 7},${27}`} fill={feature} />
      ))}
      <Path d="M 4 40 q -4 -2 -3 -6 q 5 1 6 4 z" fill={feature} />
      {/* Teeth along the snout: the one detail that makes it read as a jaw. */}
      {[0, 1, 2, 3].map((i) => (
        <Polygon key={i} points={`${8 + i * 5},${40} ${10 + i * 5},${44} ${12 + i * 5},${40}`} fill={accent} opacity={0.9} />
      ))}
      <Eyes y={28} gap={5} r={2.4} />
    </G>
  ),

  /** Phitsanulok. A river otter on the Nan. */
  'phitsanulok-otter': ({ id, feature, accent, belly }) => (
    <G>
      <Path d="M 48 44 q 14 4 16 -6 q -6 12 -18 10 z" fill={feature} opacity={0.75} />
      <Ellipse cx={30} cy={40} rx={20} ry={12} fill={`url(#${id}-b)`} />
      <Circle cx={20} cy={26} r={11} fill={`url(#${id}-b)`} />
      <Circle cx={13} cy={18} r={4} fill={feature} opacity={0.7} />
      <Circle cx={27} cy={17} r={4} fill={feature} opacity={0.7} />
      <Ellipse cx={20} cy={31} rx={7} ry={5} fill={belly} />
      <Ellipse cx={20} cy={29} rx={2.4} ry={1.8} fill="#1d2321" />
      <Eyes y={23} gap={6} r={2.4} />
      {/* The river, which is where an otter belongs and why it is here. */}
      <Path d="M 4 54 q 16 -5 30 0 q 14 5 28 0" stroke={accent} strokeWidth={2.4} fill="none" opacity={0.5} />
    </G>
  ),

  /** Phetchabun. The sweet tamarind the province is known for. */
  'phetchabun-tamarind': ({ id, feature, accent }) => (
    <G>
      {/* A tamarind pod is a bent tube with bulges: three, unevenly spaced. */}
      <Path d="M 12 24 q 12 -6 26 2 q 14 8 16 22 q -10 6 -22 -4 q -12 -10 -20 -20 z" fill={`url(#${id}-b)`} />
      {[[24, 28], [34, 36], [44, 44]].map(([x, y], i) => (
        <Circle key={i} cx={x} cy={y} r={5.5} fill={feature} opacity={0.28} />
      ))}
      <Path d="M 12 24 q -5 -4 -4 -8" stroke={accent} strokeWidth={2.2} fill="none" strokeLinecap="round" />
      <Path d="M 10 18 q 7 -4 11 0 q -6 3 -11 0 z" fill={accent} />
      <Eyes y={30} gap={5} r={2.4} />
      <Smile y={36} w={6} />
    </G>
  ),

  /** Lop Buri. The macaques that run the old town. */
  'lopburi-macaque': ({ id, feature, accent, belly }) => (
    <G>
      <Path d="M 46 46 q 14 6 14 -6" stroke={feature} strokeWidth={3} fill="none" strokeLinecap="round" />
      <Circle cx={17} cy={28} r={7} fill={feature} opacity={0.7} />
      <Circle cx={47} cy={28} r={7} fill={feature} opacity={0.7} />
      <Circle cx={32} cy={34} r={16} fill={`url(#${id}-b)`} />
      <Ellipse cx={32} cy={40} rx={10} ry={8} fill={belly} />
      <Eyes y={30} gap={7} r={3.2} />
      <Ellipse cx={30} cy={39} rx={1.3} ry={1} fill="#1d2321" />
      <Ellipse cx={34} cy={39} rx={1.3} ry={1} fill="#1d2321" />
      <Path d="M 27 44 q 5 4 10 0" stroke="#1d2321" strokeWidth={1.8} fill="none" strokeLinecap="round" />
      {/* The prang it sits on, because in Lop Buri it always is. */}
      <Path d="M 8 56 q 24 -5 48 0 l 0 6 l -48 0 z" fill={accent} opacity={0.5} />
    </G>
  ),

  /** Samut Songkhram. Pla thu, in the round basket it is always sold in. */
  'samutsongkhram-mackerel': ({ id, feature, accent }) => (
    <G>
      <Path d="M 10 32 q 8 -12 22 -12 q 16 0 20 10 q -4 11 -20 11 q -14 0 -22 -9 z" fill={`url(#${id}-b)`} />
      <Path d="M 52 30 q 9 -7 12 -3 q -2 10 -12 7 z" fill={feature} />
      <Path d="M 14 30 q 16 -3 30 2" stroke={feature} strokeWidth={1.3} fill="none" opacity={0.45} />
      <Eyes y={28} gap={0} r={2.6} />
      {/* The basket. A pla thu drawn without one is just a fish. */}
      <Path d="M 10 42 q 22 8 44 0 q -3 12 -22 12 q -19 0 -22 -12 z" fill={accent} />
      {[0, 1, 2, 3].map((i) => (
        <Path key={i} d={`M ${16 + i * 10} 45 q 2 6 0 9`} stroke={feature} strokeWidth={1.2} opacity={0.5} />
      ))}
    </G>
  ),

  /** Samut Sakhon. A blue swimming crab, over the salt pans. */
  'samutsakhon-crab': ({ id, feature, accent }) => (
    <G>
      {/* Salt pans below, drawn as flat squares, because that is what they are. */}
      {[0, 1, 2].map((i) => (
        <Path key={i} d={`M ${8 + i * 18} 54 l 16 0 l 0 5 l -16 0 z`} fill={accent} opacity={0.5} />
      ))}
      {[-1, 1].map((sx) => (
        <G key={sx}>
          {[0, 1, 2].map((i) => (
            <Path
              key={i}
              d={`M ${32 + sx * 12} ${34 + i * 5} q ${sx * 11} ${2 + i * 2} ${sx * 15} ${8 + i * 3}`}
              stroke={feature} strokeWidth={2.2} fill="none" strokeLinecap="round"
            />
          ))}
        </G>
      ))}
      <Path d="M 16 24 q -8 -6 -12 -2 q 3 8 12 8 z" fill={feature} />
      <Path d="M 48 24 q 8 -6 12 -2 q -3 8 -12 8 z" fill={feature} />
      <Ellipse cx={32} cy={34} rx={18} ry={12} fill={`url(#${id}-b)`} />
      <Eyes y={30} gap={7} r={2.6} />
      <Path d="M 27 38 q 5 3 10 0" stroke="#1d2321" strokeWidth={1.8} fill="none" strokeLinecap="round" />
    </G>
  ),

  /** Sing Buri. The lion the province is named after. */
  'singburi-lion': ({ id, feature, accent }) => (
    <G>
      {/* The mane is the whole animal: twelve points around a smaller face. */}
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2;
        return (
          <Ellipse
            key={i}
            cx={32 + Math.sin(a) * 15}
            cy={34 + Math.cos(a) * 15}
            rx={5} ry={7}
            fill={feature} opacity={0.85}
            transform={`rotate(${-(a * 180) / Math.PI} ${32 + Math.sin(a) * 15} ${34 + Math.cos(a) * 15})`}
          />
        );
      })}
      <Circle cx={32} cy={34} r={14} fill={`url(#${id}-b)`} />
      <Eyes y={31} gap={6.5} r={3} />
      <Path d="M 30 38 l 2 2 l 2 -2 z" fill={accent} />
      <Path d="M 27 43 q 5 4 10 0" stroke="#1d2321" strokeWidth={2} fill="none" strokeLinecap="round" />
    </G>
  ),

  /** Suphan Buri. The water buffalo, at the village that keeps them. */
  'suphanburi-buffalo': ({ id, feature, accent, belly }) => (
    <G>
      {/* The horns sweep back in a crescent — a buffalo is its horns. */}
      <Path d="M 18 22 q -14 -4 -16 -14 q 14 2 20 10" stroke={belly} strokeWidth={5} fill="none" strokeLinecap="round" />
      <Path d="M 46 22 q 14 -4 16 -14 q -14 2 -20 10" stroke={belly} strokeWidth={5} fill="none" strokeLinecap="round" />
      <Ellipse cx={32} cy={36} rx={15} ry={16} fill={`url(#${id}-b)`} />
      <Ellipse cx={32} cy={46} rx={8} ry={6} fill={feature} opacity={0.6} />
      <Eyes y={33} gap={7} r={3.2} />
      <Ellipse cx={29} cy={46} rx={1.6} ry={1.2} fill="#1d2321" />
      <Ellipse cx={35} cy={46} rx={1.6} ry={1.2} fill="#1d2321" />
      <Path d="M 6 58 q 26 -6 52 0" stroke={accent} strokeWidth={2.4} fill="none" opacity={0.45} />
    </G>
  ),

  /** Saraburi. The sunflower fields that open every December. */
  'saraburi-sunflower': ({ id, feature, accent, belly }) => (
    <G>
      <Path d="M 32 46 q 1 9 0 16" stroke={accent} strokeWidth={3} fill="none" strokeLinecap="round" />
      <Path d="M 32 52 q 9 -4 11 1 q -8 4 -11 0 z" fill={accent} />
      {Array.from({ length: 14 }, (_, i) => {
        const a = (i / 14) * Math.PI * 2;
        return (
          <Ellipse
            key={i}
            cx={32 + Math.sin(a) * 15}
            cy={32 + Math.cos(a) * 15}
            rx={3.6} ry={8}
            fill={belly}
            transform={`rotate(${-(a * 180) / Math.PI} ${32 + Math.sin(a) * 15} ${32 + Math.cos(a) * 15})`}
          />
        );
      })}
      <Circle cx={32} cy={32} r={11} fill={feature} />
      <Circle cx={32} cy={32} r={9} fill={`url(#${id}-b)`} opacity={0.35} />
      <Eyes y={30} gap={4.5} r={2.4} />
      <Smile y={36} w={6} />
    </G>
  ),

  /** Ang Thong. A Java sparrow with the long drums the province makes. */
  'angthong-sparrow': ({ id, feature, accent, belly }) => (
    <G>
      {/* The drum first, lying down, with the bird on top of it. */}
      <Path d="M 6 48 q 6 -6 14 -6 q 26 0 36 4 q 4 4 0 8 q -12 4 -36 2 q -8 -1 -14 -8 z" fill={accent} />
      <Path d="M 20 42 q 4 6 0 12" stroke={feature} strokeWidth={1.4} fill="none" opacity={0.6} />
      <Ellipse cx={30} cy={26} rx={12} ry={13} fill={`url(#${id}-b)`} />
      <Circle cx={38} cy={16} r={8} fill={belly} />
      {/* The white cheek patch, which is what names a Java sparrow. */}
      <Circle cx={40} cy={17} r={4} fill={belly} />
      <Circle cx={38} cy={16} r={8} fill={feature} opacity={0.18} />
      <Polygon points="45,14 56,17 45,20" fill={accent} />
      <Eyes y={15} gap={0} r={2.2} />
    </G>
  ),

  /** Uthai Thani. A tiger cub, from Huai Kha Khaeng. */
  'uthaithani-tiger': ({ id, feature, accent, belly }) => (
    <G>
      <Path d="M 46 46 q 14 4 12 -8" stroke={accent} strokeWidth={3} fill="none" strokeLinecap="round" />
      <Circle cx={18} cy={25} r={7} fill={accent} opacity={0.8} />
      <Circle cx={46} cy={25} r={7} fill={accent} opacity={0.8} />
      <Circle cx={18} cy={25} r={3.4} fill={feature} opacity={0.5} />
      <Circle cx={46} cy={25} r={3.4} fill={feature} opacity={0.5} />
      <Circle cx={32} cy={34} r={16} fill={`url(#${id}-b)`} />
      {/* Stripes. Four, on the brow and cheeks, where a cub's are strongest. */}
      {[[22, 24, 4, 6], [42, 24, -4, 6], [19, 36, 6, 2], [45, 36, -6, 2]].map(([x, y, dx, dy], i) => (
        <Path key={i} d={`M ${x} ${y} l ${dx} ${dy}`} stroke={feature} strokeWidth={2.6} strokeLinecap="round" />
      ))}
      <Ellipse cx={32} cy={39} rx={8} ry={6} fill={belly} />
      <Eyes y={31} gap={7} r={3.2} />
      <Path d="M 30 38 l 2 2 l 2 -2 z" fill={feature} />
      <Path d="M 27 44 q 5 4 10 0" stroke="#1d2321" strokeWidth={1.8} fill="none" strokeLinecap="round" />
    </G>
  ),

  /* ---- The East, the West, and the deep South --------------------------- */

  /** Chanthaburi. The moon rabbit, holding one of the province's gems. */
  'chanthaburi-rabbit': ({ id, feature, accent, belly }) => (
    <G>
      {/* Long ears, laid back, which is the only silhouette a rabbit needs. */}
      <Ellipse cx={23} cy={15} rx={5} ry={13} fill={`url(#${id}-b)`} transform="rotate(-14 23 15)" />
      <Ellipse cx={41} cy={15} rx={5} ry={13} fill={`url(#${id}-b)`} transform="rotate(14 41 15)" />
      <Ellipse cx={23} cy={16} rx={2.4} ry={8} fill={accent} opacity={0.3} transform="rotate(-14 23 16)" />
      <Ellipse cx={41} cy={16} rx={2.4} ry={8} fill={accent} opacity={0.3} transform="rotate(14 41 16)" />
      <Circle cx={32} cy={36} r={15} fill={`url(#${id}-b)`} />
      <Eyes y={33} gap={6.5} r={3} />
      <Path d="M 30 40 l 2 2 l 2 -2 z" fill={feature} />
      <Path d="M 32 42 l 0 3" stroke={feature} strokeWidth={1.4} />
      {/* The gem, cut, because Chanthaburi cuts them. */}
      <Polygon points="48,44 54,48 48,54 42,48" fill={accent} />
      <Polygon points="48,44 54,48 48,48" fill={belly} opacity={0.6} />
    </G>
  ),

  /** Chachoengsao. Nam dok mai, the mango the orchards send out. */
  'chachoengsao-mango': ({ id, feature, accent }) => (
    <G>
      <Path d="M 34 14 q 7 -7 14 -5 q -5 8 -13 8 z" fill={accent} />
      {/* A mango is a lopsided teardrop, fatter on one side. */}
      <Path d="M 32 14 q 18 6 18 22 q 0 16 -18 17 q -16 -1 -16 -17 q 0 -16 16 -22 z" fill={`url(#${id}-b)`} />
      <Ellipse cx={25} cy={28} rx={5} ry={3.4} fill="#ffffff" opacity={0.3} />
      <Path d="M 18 40 q 14 5 28 0" stroke={feature} strokeWidth={1.3} fill="none" opacity={0.35} />
      <Eyes y={33} gap={6} />
      <Smile y={42} w={8} />
    </G>
  ),

  /** Trat. A hermit crab, from the beaches at Ko Chang. */
  'trat-hermit': ({ id, feature, accent, belly }) => (
    <G>
      {/* The borrowed shell, spiralled, taking up most of the frame. */}
      <Path d="M 42 16 q 14 8 10 24 q -4 14 -20 16 q -12 2 -14 -6 q 10 -1 15 -9 q 5 -9 2 -16 q -3 -9 7 -9 z" fill={accent} opacity={0.9} />
      <Path d="M 40 23 q 8 5 6 14 q -2 9 -12 12" stroke={feature} strokeWidth={1.8} fill="none" opacity={0.55} strokeLinecap="round" />
      <Ellipse cx={17} cy={44} rx={10} ry={8} fill={`url(#${id}-b)`} />
      <Path d="M 8 40 q -6 -4 -8 0 q 4 6 9 4 z" fill={feature} />
      {[0, 1, 2].map((i) => (
        <Path key={i} d={`M ${14 + i * 4} 51 q -2 6 -5 8`} stroke={feature} strokeWidth={1.8} fill="none" strokeLinecap="round" />
      ))}
      <Circle cx={13} cy={35} r={2.4} fill={belly} />
      <Circle cx={21} cy={35} r={2.4} fill={belly} />
      <Eyes y={35} gap={4} r={1.8} />
    </G>
  ),

  /** Prachin Buri. A bamboo shoot, from the forest edge. */
  'prachinburi-bamboo': ({ id, feature, accent }) => (
    <G>
      {/* Overlapping sheaths, each a little shorter, to a point. */}
      {[0, 1, 2, 3].map((i) => (
        <Path
          key={i}
          d={`M 32 ${10 + i * 8} q ${14 - i * 2} ${10 + i * 2} ${12 - i * 2} ${34 - i * 8} l ${-24 + i * 4} 0 q ${-2 + i * 2} ${-24 + i * 6} ${12 - i * 2} ${-34 + i * 8} z`}
          fill={i % 2 === 0 ? `url(#${id}-b)` : accent}
          opacity={i % 2 === 0 ? 1 : 0.55}
        />
      ))}
      {[26, 34, 42].map((y, i) => (
        <Path key={i} d={`M ${22 + i * 2} ${y} q ${10 - i * 2} 3 ${20 - i * 4} 0`} stroke={feature} strokeWidth={1.3} fill="none" opacity={0.45} />
      ))}
      <Eyes y={38} gap={5} r={2.4} />
      <Smile y={45} w={6} />
    </G>
  ),

  /** Sa Kaeo. A butterfly, from Pang Sida. */
  'sakaeo-butterfly': ({ id, feature, accent, belly }) => (
    <G>
      {/* Four wings: two large above, two small below, all with an eyespot. */}
      {[-1, 1].map((sx) => (
        <G key={sx}>
          <Path
            d={`M 32 30 q ${sx * 22} ${-18} ${sx * 26} ${-2} q ${sx * 2} 12 ${-sx * 26} 10 z`}
            fill={`url(#${id}-b)`}
          />
          <Path
            d={`M 32 34 q ${sx * 16} 4 ${sx * 18} 16 q ${-sx * 8} 6 ${-sx * 18} -6 z`}
            fill={feature} opacity={0.8}
          />
          <Circle cx={32 + sx * 17} cy={26} r={3.6} fill={belly} />
          <Circle cx={32 + sx * 17} cy={26} r={1.6} fill={accent} />
        </G>
      ))}
      <Path d="M 29 18 q -3 -8 -7 -10" stroke={feature} strokeWidth={1.6} fill="none" strokeLinecap="round" />
      <Path d="M 35 18 q 3 -8 7 -10" stroke={feature} strokeWidth={1.6} fill="none" strokeLinecap="round" />
      <Ellipse cx={32} cy={36} rx={4} ry={14} fill={feature} />
      <Circle cx={32} cy={22} r={6} fill={feature} />
      <Eyes y={21} gap={3} r={2} />
    </G>
  ),

  /** Tak. A krathong sai lantern, for the lights that float the Ping. */
  'tak-lantern': ({ id, feature, accent, belly }) => (
    <G>
      {/* The flame sits in a coconut shell, which is what a krathong sai is. */}
      <Path d="M 32 8 q 7 8 6 14 q -1 6 -6 6 q -5 0 -6 -6 q -1 -6 6 -14 z" fill={accent} />
      <Path d="M 32 15 q 3 4 2 7 q 0 3 -2 3 q -2 0 -2 -3 q -1 -3 2 -7 z" fill={belly} />
      <Path d="M 14 34 q 18 -6 36 0 q -3 14 -18 14 q -15 0 -18 -14 z" fill={`url(#${id}-b)`} />
      <Path d="M 14 34 q 18 5 36 0" stroke={feature} strokeWidth={1.8} fill="none" opacity={0.6} />
      <Eyes y={39} gap={5.5} r={2.4} />
      <Smile y={44} w={6} />
      {/* The river it floats on. */}
      <Path d="M 2 54 q 15 -5 30 0 q 15 5 30 0" stroke={belly} strokeWidth={2.4} fill="none" opacity={0.55} />
    </G>
  ),

  /** Ratchaburi. The dragon jar, which the province has made for a century. */
  'ratchaburi-jar': ({ id, feature, accent }) => (
    <G>
      <Path d="M 24 12 q 8 -3 16 0 l 0 5 q -8 -3 -16 0 z" fill={feature} opacity={0.8} />
      <Path d="M 32 16 q 20 4 20 20 q 0 18 -20 18 q -20 0 -20 -18 q 0 -16 20 -20 z" fill={`url(#${id}-b)`} />
      {/* The dragon, in one line around the belly, which is the whole jar. */}
      <Path
        d="M 16 36 q 6 -6 12 -2 q 5 4 10 0 q 6 -5 11 2"
        stroke={accent} strokeWidth={2.4} fill="none" strokeLinecap="round"
      />
      <Circle cx={16} cy={36} r={3} fill={accent} />
      <Path d="M 14 44 q 18 5 36 0" stroke={accent} strokeWidth={1.6} fill="none" opacity={0.6} />
      <Eyes y={27} gap={6} r={2.6} />
      <Smile y={32} w={7} />
    </G>
  ),

  /** Narathiwat. A kolae fish, painted the way the boats are. */
  'narathiwat-kolae': ({ id, feature, accent, belly }) => (
    <G>
      <Path d="M 10 34 q 8 -13 22 -13 q 16 0 20 11 q -4 12 -20 12 q -14 0 -22 -10 z" fill={`url(#${id}-b)`} />
      <Path d="M 52 32 q 10 -8 12 -4 q -2 11 -12 8 z" fill={belly} />
      {/* Kolae painting: bands of colour, never a single flat hull. */}
      {[0, 1, 2].map((i) => (
        <Path
          key={i}
          d={`M ${16 + i * 10} 24 q 4 10 0 20`}
          stroke={i % 2 === 0 ? belly : accent} strokeWidth={3.4} fill="none" opacity={0.85}
        />
      ))}
      <Path d="M 30 21 q 2 -7 7 -8 q 0 5 -2 9 z" fill={accent} />
      <Eyes y={30} gap={0} r={2.8} />
      <Path d="M 10 36 q 6 3 12 1" stroke="#1d2321" strokeWidth={1.8} fill="none" strokeLinecap="round" />
    </G>
  ),

  /** Phatthalung. A manora bird, from the dance. */
  'phatthalung-manora': ({ id, feature, accent, belly }) => (
    <G>
      {/* The headdress is taller than the dancer, as it is on stage. */}
      <Path d="M 32 2 l 3 9 l -6 0 z" fill={accent} />
      <Path d="M 24 11 q 8 -4 16 0 q 2 6 1 10 l -18 0 q -1 -4 1 -10 z" fill={accent} opacity={0.9} />
      <Path d="M 22 21 l 20 0 l -2 4 l -16 0 z" fill={feature} />
      {/* Wings, which is the half of manora that is a bird. */}
      <Path d="M 18 34 q -14 2 -16 14 q 14 -2 18 -10 z" fill={belly} opacity={0.8} />
      <Path d="M 46 34 q 14 2 16 14 q -14 -2 -18 -10 z" fill={belly} opacity={0.8} />
      <Ellipse cx={32} cy={38} rx={13} ry={15} fill={`url(#${id}-b)`} />
      <Eyes y={34} gap={6} r={2.8} />
      <Smile y={42} w={7} />
    </G>
  ),

  /** Yala. The zebra dove, which the province competes with. */
  'yala-dove': ({ id, feature, accent }) => (
    <G>
      <Path d="M 44 44 q 14 6 16 16 q -14 -2 -20 -10 z" fill={feature} opacity={0.5} />
      <Ellipse cx={32} cy={36} rx={14} ry={14} fill={`url(#${id}-b)`} />
      <Circle cx={36} cy={20} r={9} fill={`url(#${id}-b)`} />
      {/* The barring across the neck and flank: this is a ZEBRA dove. */}
      {[0, 1, 2, 3, 4].map((i) => (
        <Path key={i} d={`M ${21 + i * 5} ${30 + i} q 3 8 0 14`} stroke={feature} strokeWidth={1.4} fill="none" opacity={0.5} />
      ))}
      <Polygon points="45,19 55,21 45,23" fill={accent} />
      <Path d="M 30 50 q 3 6 0 9" stroke={accent} strokeWidth={1.8} fill="none" strokeLinecap="round" />
      <Eyes y={19} gap={0} r={2.2} />
    </G>
  ),

  /** Satun. An ammonite, from the fossil beds in the geopark. */
  'satun-ammonite': ({ id, feature, accent }) => (
    <G>
      <Circle cx={32} cy={34} r={19} fill={`url(#${id}-b)`} />
      {/* The spiral, and the ribs crossing it. A fossil is its geometry. */}
      <Path
        d="M 32 34 q 0 -12 10 -12 q 12 0 12 12 q 0 16 -16 16 q -19 0 -19 -18"
        stroke={feature} strokeWidth={2.2} fill="none" strokeLinecap="round"
      />
      {Array.from({ length: 9 }, (_, i) => {
        const a = (i / 9) * Math.PI * 2;
        return (
          <Path
            key={i}
            d={`M ${32 + Math.sin(a) * 8} ${34 + Math.cos(a) * 8} L ${32 + Math.sin(a) * 18} ${34 + Math.cos(a) * 18}`}
            stroke={feature} strokeWidth={1.1} opacity={0.4}
          />
        );
      })}
      <Circle cx={32} cy={34} r={4} fill={accent} opacity={0.7} />
      <Eyes y={33} gap={5} r={2.2} />
    </G>
  ),

  /** Pattani. A goat, which the province keeps and races. */
  'pattani-goat': ({ id, feature, accent, belly }) => (
    <G>
      {/* Horns curve back, not up: a goat's, not a bull's. */}
      <Path d="M 22 18 q -10 -6 -10 -14 q 8 4 12 11" stroke={feature} strokeWidth={4} fill="none" strokeLinecap="round" />
      <Path d="M 42 18 q 10 -6 10 -14 q -8 4 -12 11" stroke={feature} strokeWidth={4} fill="none" strokeLinecap="round" />
      <Ellipse cx={14} cy={30} rx={7} ry={4.5} fill={feature} opacity={0.6} transform="rotate(-20 14 30)" />
      <Ellipse cx={50} cy={30} rx={7} ry={4.5} fill={feature} opacity={0.6} transform="rotate(20 50 30)" />
      <Ellipse cx={32} cy={34} rx={13} ry={15} fill={`url(#${id}-b)`} />
      <Ellipse cx={32} cy={44} rx={7} ry={6} fill={belly} />
      <Eyes y={31} gap={6.5} r={3} />
      <Ellipse cx={30} cy={44} rx={1.3} ry={1} fill="#1d2321" />
      <Ellipse cx={34} cy={44} rx={1.3} ry={1} fill="#1d2321" />
      {/* The beard, which is the last thing that makes it unmistakably a goat. */}
      <Path d="M 32 50 q 3 6 0 9 q -3 -3 0 -9 z" fill={accent} opacity={0.8} />
    </G>
  ),
};
