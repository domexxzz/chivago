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
import { Image, Pressable, ScrollView, View } from 'react-native';
import { ChevronLeft } from 'lucide-react-native';
import { BASIS_LABEL, MASCOTS, MASCOT_COUNT, REGIONS, mascotFor, provincesIn, strings, type Mascot } from '@chivago/core';
import { api } from '../api/client.ts';
import { mascotBeachUri } from '../api/photos.ts';
import { useAsync } from '../state/store.tsx';
import { color, gutter, layout, radius, shadow } from '../theme/index.ts';
import { gameRadius, gameRegion, gameShadow } from '@chivago/tokens';
import { GameBar, Medal, Tray, TrayLine } from '../components/Game.tsx';
import { Body, Heading, Label } from '../components/Type.tsx';
import { IconButton } from '../components/Button.tsx';
import { OceanBackdrop, TravelHeroBackdrop } from '../components/Shell.tsx';
import { MascotPortrait } from '../components/MascotPortrait.tsx';
import { t } from '../i18n/locale.ts';

/** The region's speckle colour, for the stamps. Not the evidence green. */
const REGION_TINT: Record<string, string> = {
  north: '#5f8f4a', northeast: '#c9a24a', central: '#3f8fbf', east: '#e8963b', west: '#a06a3c', south: '#2f7a9f',
};

/**
 * One province's card, on its region's ground.
 *
 * Reached is stamped in gold, the game layer's colour: a check-in is a
 * geofence the traveller walked into, not something a host vouched for, so it
 * must not wear the verified green.
 */
export function MascotCard({
  mascot, met, onOpen, ground = color.surface,
}: { mascot: Mascot; met: boolean; onOpen: (code: string) => void; ground?: string }) {
  return (
    <Pressable
      onPress={() => onOpen(mascot.code)}
      accessibilityRole="button"
      accessibilityLabel={`${t(mascot.name)}, ${t(mascot.creature)}. ${met ? t(strings.mascots.met) : t(strings.mascots.notMet)}`}
      style={[met ? gameShadow.lift : shadow.sm, {
        width: '31%', minWidth: 104, backgroundColor: ground, borderRadius: gameRadius.panel,
        borderWidth: met ? 2 : 0, borderColor: color.gold, padding: 10, alignItems: 'center', gap: 4,
      }]}
    >
      <MascotPortrait mascot={mascot} size={64} />
      <Heading size={13} style={{ textAlign: 'center' }}>{t(mascot.name)}</Heading>
      <Label size={9} tracking={0.08} colour={color.neutral700} style={{ textAlign: 'center', textTransform: 'none' }}>
        {t(mascot.creature)}
      </Label>
      {met ? (
        <View
          style={{
            marginTop: 2, paddingVertical: 2, paddingHorizontal: 6, borderRadius: radius.sm,
            backgroundColor: color.goldSoft, borderWidth: 1, borderColor: color.gold,
          }}
        >
          <Label size={9} tracking={0.1} colour={color.goldDeep}>{t(strings.mascots.met)}</Label>
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
              {here.map((m) => (
                <MascotCard
                  key={m.code}
                  mascot={m}
                  met={visited.has(m.code)}
                  onOpen={onOpen}
                  ground={gameRegion[region.key as keyof typeof gameRegion]}
                />
              ))}
            </View>
          </View>
        );
      })}
    </View>
  );
}

export function MascotsScreen({
  onBack, onOpen, now = new Date(),
}: {
  onBack: () => void;
  onOpen: (code: string) => void;
  now?: Date;
}) {
  const passport = useAsync(() => api.passport(), []);
  const visited = React.useMemo(() => new Set(passport.data?.visited ?? []), [passport.data]);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: color.bg }} showsVerticalScrollIndicator={false}>
      <View
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 12,
          paddingHorizontal: gutter, paddingTop: 14, paddingBottom: 14, marginBottom: 8,
          backgroundColor: '#028090',
          borderBottomLeftRadius: 24, borderBottomRightRadius: 24,
          overflow: 'hidden',
        }}
      >
        <TravelHeroBackdrop compact focalPoint="right" />
        <IconButton inverted onPress={onBack} accessibilityLabel={t(strings.common.back)}>
          <ChevronLeft size={20} color="#FFFFFF" strokeWidth={2} />
        </IconButton>
        <View style={{ flex: 1 }}>
          <Heading size={20} tracking={-0.3} colour="#FFFFFF">{t(strings.mascots.title)}</Heading>
        </View>
      </View>

      {/* The count, in the tray the rest of the game layer uses. */}
      <Tray style={{ marginHorizontal: gutter, marginTop: 4, marginBottom: 12, borderRadius: gameRadius.panel }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Medal value={visited.size} />
          <View style={{ flex: 1, gap: 8 }}>
            <TrayLine>{t(strings.mascots.metCount(visited.size, MASCOT_COUNT))}</TrayLine>
            <View style={{ flexDirection: 'row' }}>
              <GameBar pct={(visited.size / MASCOT_COUNT) * 100} height={10} />
            </View>
          </View>
        </View>
      </Tray>

      {/* Hero Cover of the Island Companions */}
      <View
        style={[
          shadow.card,
          {
            marginHorizontal: gutter,
            marginTop: 4,
            marginBottom: 12,
            borderRadius: radius.md,
            overflow: 'hidden',
            backgroundColor: color.surface,
            borderWidth: 1,
            borderColor: '#DCEFF5',
          },
        ]}
      >
        <View style={{ position: 'relative' }}>
          <Image
            source={{ uri: mascotBeachUri(now) }}
            style={{ width: '100%', aspectRatio: 16 / 10 }}
            resizeMode="cover"
            accessibilityLabel={t(strings.common.companionsAlt)}
          />
          {/* The time-of-day chip went with the second illustration (docs in
              api/photos.ts). One picture has no hour to announce. */}
        </View>
        <View style={{ padding: 12, backgroundColor: color.surface }}>
          <Heading size={14} tracking={-0.2}>
            {/* One island named here, in a guide of 77 provinces, was always wrong
                for 76 of them. */}
            {t({ en: 'Island Companions', th: 'แก๊งเพื่อนร่วมทาง', zh: '岛屿伙伴' })}
          </Heading>
          <Body size={13} colour={color.neutral700} style={{ marginTop: 2 }}>
            {t({
              en: 'Explore local habitats, hatch companion eggs through verified journeys, and uncover the seventy-seven provincial mascots.',
              th: 'ออกเดินทางสำรวจถิ่นที่อยู่ ฟักไข่เพื่อนร่วมทางจากการท่องเที่ยวจริง และค้นหามาสคอตทั้ง 77 จังหวัดทั่วไทย',
              zh: '探索本地栖息地，用已验证的真实行程孵化伙伴蛋，并集齐七十七府的吉祥物。',
            })}
          </Body>
        </View>
      </View>

      <View style={[shadow.card, { marginHorizontal: gutter, padding: 14, borderRadius: radius.md, borderWidth: 1, borderColor: '#DCEFF5', backgroundColor: color.surface }]}>
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
