/**
 * The game layer, one tap from anywhere.
 *
 * Before this screen existed, everything on it was buried. A companion was
 * three taps down behind the wallet; the seventy-seven and the medals hung off
 * the passport, which hung off Home. That is a strange place to keep the part
 * of a product people open it for, and it happened the way these things always
 * happen — each door was reasonable on the day it was added.
 *
 * So the game took the wallet's cell on the tab bar. The wallet already had a
 * door on Home showing both balances, so its tab was a second route to a
 * screen one tap away; the game layer had no door at all. `store.tsx` carries
 * the argument in full.
 *
 * WHAT THIS SCREEN REFUSES TO BECOME. A hub is a list of links, and a list of
 * links is what the wallet already was. So the companions are ON it, at the
 * size they deserve, and the doors are underneath — you arrive somewhere
 * rather than at a menu.
 *
 * It wears the game surface, which it is allowed to: nothing here is a claim
 * about the world. Every number on it is a count of things this traveller
 * collected, and the one figure that IS evidence — how many a host verified —
 * is printed as itself rather than folded into a score.
 */

import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { collectionSummary, type Companion } from '@chivago/core';
import { gameRadius, gameShadow } from '@chivago/tokens';
import { api } from '../api/client.ts';
import { useAsync } from '../state/store.tsx';
import { color, gutter, radius } from '../theme/index.ts';
import { Body, Heading, Label } from '../components/Type.tsx';
import { Chunk, GameScene, Medal, Tray, TrayLine } from '../components/Game.tsx';
import { Creature } from '../components/Creature.tsx';
import { ErrorState, LoadingState } from '../components/States.tsx';
import { t } from '../i18n/locale.ts';

export function GameScreen({
  onOpenCompanion, onOpenMascots, onOpenMedals, onOpenPassport, onOpenParty,
}: {
  onOpenCompanion: (companion: Companion) => void;
  onOpenMascots: () => void;
  onOpenMedals: () => void;
  onOpenPassport: () => void;
  onOpenParty: () => void;
}) {
  const held = useAsync(() => api.companions(), []);
  const data = held.data;
  const companions = data?.companions ?? [];
  const summary = companions.length > 0 ? collectionSummary(companions) : null;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: color.bg }} showsVerticalScrollIndicator={false}>
      <View style={{ paddingHorizontal: gutter, paddingTop: 18, paddingBottom: 6 }}>
        <Heading size={26} tracking={-0.5}>{t({ en: 'What you have collected', th: 'ของที่คุณสะสมไว้' })}</Heading>
      </View>

      {held.error ? <ErrorState message={held.error} onRetry={held.reload} /> : null}
      {held.loading && !data ? <LoadingState /> : null}

      {data ? (
        <>
          <Shelf companions={companions} onOpen={onOpenCompanion} />
          {summary ? <Counts found={summary.found} grown={summary.grown} total={summary.total} /> : null}
          <Doors
            onOpenMascots={onOpenMascots}
            onOpenMedals={onOpenMedals}
            onOpenPassport={onOpenPassport}
            onOpenParty={onOpenParty}
          />
        </>
      ) : null}

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

/**
 * The creatures, on the screen rather than behind a link.
 *
 * An empty shelf says so in a sentence instead of showing nothing: a traveller
 * who has collected nothing yet has not failed at anything, and a blank panel
 * reads as a screen that did not load.
 */
function Shelf({
  companions, onOpen,
}: { companions: Companion[]; onOpen: (c: Companion) => void }) {
  if (companions.length === 0) {
    return (
      <View style={{ marginHorizontal: gutter, marginTop: 8 }}>
        <View style={[{ borderRadius: gameRadius.panel, overflow: 'hidden', height: 180 }, gameShadow.lift]}>
          <GameScene>
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 }}>
              <Body size={14} colour={color.neutral800}>
                {t({
                  en: 'Nothing here yet. A companion arrives on your second day in a habitat.',
                  th: 'ยังไม่มีอะไรที่นี่ เพื่อนร่วมทางจะมาถึงในวันที่สองที่คุณอยู่ในถิ่นนั้น',
                })}
              </Body>
            </View>
          </GameScene>
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: gutter, paddingTop: 8, gap: 10 }}
    >
      {companions.map((c) => (
        <Pressable
          key={c.species.key}
          onPress={() => onOpen(c)}
          accessibilityRole="button"
          accessibilityLabel={`${t(c.species.name)}, ${c.stage}. Visit its home.`}
          style={[
            {
              width: 132, height: 170, borderRadius: gameRadius.panel, overflow: 'hidden',
            },
            gameShadow.lift,
          ]}
        >
          <GameScene>
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 10 }}>
              <Creature species={c.species.key} stage={c.stage} size={78} />
              <View
                style={{
                  marginTop: 6, backgroundColor: color.surface,
                  borderRadius: gameRadius.chip, paddingHorizontal: 8, paddingVertical: 3,
                }}
              >
                <Label size={9} tracking={0.08} colour={color.neutral800}>{t(c.species.name)}</Label>
              </View>
            </View>
          </GameScene>
        </Pressable>
      ))}
    </ScrollView>
  );
}

/**
 * Three counts, in a tray.
 *
 * `grown` is the only one that is evidence — a companion grows when a host
 * verifies a quest — so it is named as such rather than left to look like the
 * same kind of number as the others.
 */
function Counts({ found, grown, total }: { found: number; grown: number; total: number }) {
  return (
    <Tray style={{ marginHorizontal: gutter, marginTop: 12, borderRadius: gameRadius.panel }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Medal value={found} />
        <View style={{ flex: 1 }}>
          <TrayLine>
            {t({
              en: `${found} of ${total} habitats, ${grown} grown by a verified quest`,
              th: `${found} จาก ${total} ถิ่น · โตแล้ว ${grown} ตัวจากภารกิจที่ผู้จัดตรวจ`,
            })}
          </TrayLine>
        </View>
      </View>
    </Tray>
  );
}

/** The rest of the game layer, as controls rather than a list of links. */
function Doors({
  onOpenMascots, onOpenMedals, onOpenPassport, onOpenParty,
}: {
  onOpenMascots: () => void;
  onOpenMedals: () => void;
  onOpenPassport: () => void;
  onOpenParty: () => void;
}) {
  return (
    <View style={{ paddingHorizontal: gutter, paddingTop: 16, gap: 10 }}>
      <Label size={10} tracking={0.14}>{t({ en: 'ALSO YOURS', th: 'ของคุณเช่นกัน' })}</Label>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Chunk
          label="The 77"
          thai={t({ en: 'The 77', th: 'ครบ 77 จังหวัด' })}
          tone="game"
          onPress={onOpenMascots}
          style={{ flex: 1 }}
          accessibilityLabel="The seventy-seven province emblems"
        />
        <Chunk
          label="Medals"
          thai={t({ en: 'Medals', th: 'เหรียญตรา' })}
          tone="game"
          onPress={onOpenMedals}
          style={{ flex: 1 }}
        />
      </View>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Chunk
          label="Passport"
          thai={t({ en: 'Passport', th: 'พาสปอร์ต' })}
          tone="quiet"
          onPress={onOpenPassport}
          style={{ flex: 1 }}
        />
        <Chunk
          label="Travelling with"
          thai={t({ en: 'Travelling with', th: 'ไปกับใคร' })}
          tone="quiet"
          onPress={onOpenParty}
          style={{ flex: 1 }}
        />
      </View>

      <View
        style={{
          marginTop: 6, padding: 12, borderRadius: radius.md,
          backgroundColor: color.neutral100,
        }}
      >
        <Body size={13} colour={color.neutral700}>
          {t({
            en: 'Nothing on this screen is a claim about the world. What a host verified is said as itself, on the pages that carry it.',
            th: 'ไม่มีอะไรในหน้านี้ที่เป็นการอ้างเรื่องจริงในโลก สิ่งที่ผู้จัดตรวจแล้วจะบอกตรง ๆ ในหน้าที่มันอยู่',
          })}
        </Body>
      </View>
    </View>
  );
}
