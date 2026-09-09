/**
 * The monsters on Home: the island's problems, wearing a face.
 *
 * Built for a thumb. One card per monster, tall enough to tap anywhere on,
 * with the name, the reason it is standing there IN NUMBERS, and a bar that
 * says how far the island has pushed it back. Tapping opens the place, which
 * is where the work is.
 *
 * Two rules the design has to keep, both from packages/core/src/monsters.ts:
 *
 * The reason is never hidden. A card that showed a smog monster without
 * "measured at 140 AQI here" would be asking to be believed rather than
 * read, and this app's whole claim is that its numbers came from somewhere.
 *
 * And it never suggests that pushing one back cleaned anything. The line
 * saying so sits under the list, once, rather than on every card - it is a
 * fact about the mechanic, and repeating it five times would turn a piece of
 * honesty into nagging.
 */

import React from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Circle, Ellipse, Path } from 'react-native-svg';
import { MONSTERS, strings, type MonsterKey } from '@chivago/core';
import type { Bilingual } from '@chivago/core';
import { color, gutter, radius, shadow } from '../theme/index.ts';
import { Body, Heading, Label } from './Type.tsx';
import { t } from '../i18n/locale.ts';

export interface StandingMonster {
  key: MonsterKey;
  placeId: string;
  placeName: Bilingual;
  because: Bilingual;
  progress: number;
  needed: number;
  restingUntil: string | null;
}

/** Each one gets its own ink, so a glance separates them before any reading. */
const INK: Record<MonsterKey, string> = {
  smog: '#7a6f86',
  plastic: '#2f7f8c',
};

/**
 * A mark, not a mascot.
 *
 * Deliberately flat and simple: these are a haze and a bag, the two things
 * the data is actually about. Giving them eyes would make them animals,
 * which is the one thing the design says they are not.
 */
function MonsterMark({ kind }: { kind: MonsterKey }) {
  const ink = INK[kind];
  return (
    <Svg width={44} height={44} viewBox="0 0 44 44">
      {kind === 'smog' ? (
        <>
          <Ellipse cx={22} cy={26} rx={16} ry={9} fill={ink} opacity={0.28} />
          <Ellipse cx={16} cy={20} rx={10} ry={7} fill={ink} opacity={0.45} />
          <Ellipse cx={28} cy={19} rx={11} ry={8} fill={ink} opacity={0.35} />
          <Path d="M8 33h28" stroke={ink} strokeWidth={2.4} strokeLinecap="round" opacity={0.5} />
        </>
      ) : (
        <>
          <Path d="M12 15h20l-2.5 20h-15z" fill={ink} opacity={0.34} />
          <Path d="M12 15h20l-2.5 20h-15z" stroke={ink} strokeWidth={2} fill="none" />
          <Path d="M17 15c0-4 2-6 5-6s5 2 5 6" stroke={ink} strokeWidth={2} fill="none" strokeLinecap="round" />
          <Circle cx={22} cy={25} r={2.4} fill={ink} opacity={0.55} />
        </>
      )}
    </Svg>
  );
}

/** How far back it has been pushed. Work done, never damage dealt. */
function PushedBar({ progress, needed, ink }: { progress: number; needed: number; ink: string }) {
  const done = needed > 0 ? Math.max(0, Math.min(1, progress / needed)) : 0;
  return (
    <View
      accessibilityLabel={t(strings.monsters.pushedBack(progress, needed))}
      style={{ height: 8, borderRadius: 4, backgroundColor: color.neutral200, overflow: 'hidden', marginTop: 8 }}
    >
      <View style={{ width: `${done * 100}%`, height: '100%', backgroundColor: ink, borderRadius: 4 }} />
    </View>
  );
}

function MonsterCard({ monster, onOpenPlace }: { monster: StandingMonster; onOpenPlace: (id: string) => void }) {
  const species = MONSTERS[monster.key];
  const ink = INK[monster.key];
  const resting = monster.restingUntil !== null;

  return (
    <Pressable
      onPress={() => onOpenPlace(monster.placeId)}
      accessibilityRole="button"
      accessibilityLabel={`${t(species.name)}, ${t(monster.placeName)}. ${t(monster.because)} ${t(strings.monsters.pushedBack(monster.progress, monster.needed))}`}
      style={[shadow.card, {
        flexDirection: 'row', gap: 12, padding: 14, marginBottom: 10,
        backgroundColor: color.surface, borderRadius: radius.md,
        // A rested monster is still on the list, because it is still true
        // that the reading summoned it. It simply stops shouting.
        opacity: resting ? 0.62 : 1,
      }]}
    >
      <MonsterMark kind={monster.key} />

      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
          <Heading size={15} colour={ink}>{t(species.name)}</Heading>
          <Label size={9} tracking={0.1} colour={color.neutral600} style={{ flex: 1, textTransform: 'none' }}>
            {t(monster.placeName)}
          </Label>
        </View>

        {/* The number that summoned it. Never omitted. */}
        <Body size={13} colour={color.neutral800} style={{ marginTop: 2 }}>{t(monster.because)}</Body>

        <PushedBar progress={monster.progress} needed={monster.needed} ink={ink} />

        <Label size={9} tracking={0.06} colour={color.neutral600} style={{ marginTop: 6, textTransform: 'none' }}>
          {resting
            ? t(strings.monsters.resting)
            : `${t(strings.monsters.pushedBack(monster.progress, monster.needed))} · ${t(species.cleansedBy)}`}
        </Label>
      </View>
    </Pressable>
  );
}

export function MonsterFeed({
  monsters, loading, error, onRetry, onOpenPlace,
}: {
  monsters: StandingMonster[] | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onOpenPlace: (placeId: string) => void;
}) {
  return (
    <View style={{ paddingHorizontal: gutter, paddingTop: 22 }}>
      <Heading size={17}>{t(strings.monsters.title)}</Heading>
      <Body size={13} colour={color.neutral600} style={{ marginTop: 2, marginBottom: 12 }}>
        {t(strings.monsters.subtitle)}
      </Body>

      {error ? (
        <Pressable onPress={onRetry} accessibilityRole="button">
          <Body size={13} colour={color.accent2}>{error}</Body>
        </Pressable>
      ) : loading && !monsters ? (
        <Body size={13} colour={color.neutral600}>{t(strings.monsters.loading)}</Body>
      ) : !monsters || monsters.length === 0 ? (
        /*
          A clean island is the best outcome this feature has, so it is said
          as news rather than as an empty list. Nothing is invented to fill
          the space - that is the entire point of the mechanic.
        */
        <Body size={13} colour={color.accent}>{t(strings.monsters.none)}</Body>
      ) : (
        <>
          {monsters.map((m) => (
            <MonsterCard key={`${m.key}:${m.placeId}`} monster={m} onOpenPlace={onOpenPlace} />
          ))}
          {/* Once, under the list. It is a fact about the mechanic. */}
          <Body size={13} colour={color.neutral600} style={{ marginTop: 2 }}>
            {t(strings.monsters.doesNotFixIt)}
          </Body>
        </>
      )}
    </View>
  );
}
