/**
 * The field guide: seventy-seven mascots, one per province, all of them
 * shown.
 *
 * The Samui companions keep their eggs sealed, because an egg that hinted
 * at the species would spend the only surprise the collection has. The
 * mascots are a different thing: a province's emblem is public, printed on
 * its seal and its fruit stalls, and a guide that hid it would be hiding
 * nothing. What the guide DOES record is whether this traveller has been:
 * the passport's verified provinces, and nothing else, stamp a card.
 */

import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { ChevronLeft } from 'lucide-react-native';
import { BASIS_LABEL, MASCOTS, MASCOT_COUNT, REGIONS, mascotFor, provincesIn, strings, type Mascot } from '@chivago/core';
import { api } from '../api/client.ts';
import { useAsync } from '../state/store.tsx';
import { color, gutter, layout, radius, shadow } from '../theme/index.ts';
import { Body, Heading, Label } from '../components/Type.tsx';
import { IconButton } from '../components/Button.tsx';
import { MascotMark } from '../components/MascotMark.tsx';
import { t } from '../i18n/locale.ts';

/** The region's speckle colour, for the stamps. Not the evidence green. */
const REGION_TINT: Record<string, string> = {
  north: '#5f8f4a', northeast: '#c9a24a', central: '#3f8fbf', east: '#e8963b', west: '#a06a3c', south: '#2f7a9f',
};

export function MascotCard({ mascot, met, onOpen }: { mascot: Mascot; met: boolean; onOpen: (code: string) => void }) {
  return (
    <Pressable
      onPress={() => onOpen(mascot.code)}
      accessibilityRole="button"
      accessibilityLabel={`${t(mascot.name)}, ${t(mascot.creature)}. ${met ? t(strings.mascots.met) : t(strings.mascots.notMet)}`}
      style={[shadow.sm, {
        width: '31%', minWidth: 104, backgroundColor: color.surface, borderRadius: radius.md,
        borderWidth: 1, borderColor: met ? color.text : color.neutral300, padding: 10, alignItems: 'center', gap: 4,
      }]}
    >
      <MascotMark mascot={mascot} size={64} />
      <Heading size={13} style={{ textAlign: 'center' }}>{t(mascot.name)}</Heading>
      <Label size={9} tracking={0.08} colour={color.neutral700} style={{ textAlign: 'center', textTransform: 'none' }}>
        {t(mascot.creature)}
      </Label>
      {met ? (
        <View style={{ marginTop: 2, paddingVertical: 2, paddingHorizontal: 6, borderRadius: radius.sm, backgroundColor: color.text }}>
          <Label size={9} tracking={0.1} colour={color.surface}>{t(strings.mascots.met)}</Label>
        </View>
      ) : null}
    </Pressable>
  );
}

/** The grid, pure: given who has been where, draw the seventy-seven. */
export function MascotGrid({ visited, onOpen }: { visited: ReadonlySet<string>; onOpen: (code: string) => void }) {
  return (
    <View>
      {REGIONS.map((region) => {
        const codes = new Set(provincesIn(region.key).map((p) => p.code));
        const here = MASCOTS.filter((m) => codes.has(m.code));
        return (
          <View key={region.key} style={{ paddingHorizontal: gutter, paddingTop: 18 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: REGION_TINT[region.key] ?? color.neutral500 }} />
              <Label size={10} tracking={0.14}>{t(region.name)}</Label>
              <Label size={10} tracking={0.1} colour={color.neutral600}>
                {t(strings.mascots.metCount(here.filter((m) => visited.has(m.code)).length, here.length))}
              </Label>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {here.map((m) => <MascotCard key={m.code} mascot={m} met={visited.has(m.code)} onOpen={onOpen} />)}
            </View>
          </View>
        );
      })}
    </View>
  );
}

export function MascotsScreen({ onBack, onOpen }: { onBack: () => void; onOpen: (code: string) => void }) {
  const passport = useAsync(() => api.passport(), []);
  const visited = React.useMemo(() => new Set(passport.data?.visited ?? []), [passport.data]);
  return (
    <ScrollView style={{ flex: 1, backgroundColor: color.bg }} showsVerticalScrollIndicator={false}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: gutter, paddingTop: 16, paddingBottom: 8 }}>
        <IconButton onPress={onBack} accessibilityLabel="Back">
          <ChevronLeft size={20} color={color.text} strokeWidth={2} />
        </IconButton>
        <View style={{ flex: 1 }}>
          <Heading size={20} tracking={-0.3}>{t(strings.mascots.title)}</Heading>
          <Label size={10} tracking={0.1} colour={color.neutral600}>{t(strings.mascots.metCount(visited.size, MASCOT_COUNT))}</Label>
        </View>
      </View>
      <View style={{ marginHorizontal: gutter, padding: 12, borderRadius: radius.md, borderWidth: layout.ruleHair, borderColor: color.neutral300, backgroundColor: color.surface }}>
        <Body size={13} colour={color.neutral700}>{t(strings.mascots.note)}</Body>
      </View>
      <MascotGrid visited={visited} onOpen={onOpen} />
      <View style={{ height: 36 }} />
    </ScrollView>
  );
}

/** What a mascot's card says under the room: what it is, why, and where that came from. */
export function MascotFacts({ mascot }: { mascot: Mascot }) {
  return (
    <View style={{ paddingHorizontal: gutter, gap: 8 }}>
      <Body size={14}>{t(mascot.why)}</Body>
      <Label size={9} tracking={0.1} colour={color.neutral600} style={{ textTransform: 'none' }}>
        {`${t(strings.mascots.drawnFrom)}: ${t(BASIS_LABEL[mascot.basis])}`}
      </Label>
    </View>
  );
}

export const mascotOrNull = (code: string | null): Mascot | null => (code ? mascotFor(code) : null);
