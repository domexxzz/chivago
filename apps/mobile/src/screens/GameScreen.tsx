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
 * THE LOOK is a game lobby: a level chip, a row of round doors, one large
 * card for what to do next, and a grid of bright tiles with the character
 * standing over the corner of each. That is the shape party-game apps open on,
 * and it is borrowed because it is legible before anybody reads a word.
 *
 * WHAT IS NOT BORROWED. Those lobbies put a coin balance with a "+" in the
 * corner, and the "+" is a shop. Neither balance is on this screen: Green and
 * Trip are the ledger, the ledger is evidence, and evidence does not wear the
 * game surface (`game-surface.test.ts`). The level is here because EXP is the
 * game layer's own number, earned by activity and never spent.
 *
 * WHAT THIS SCREEN REFUSES TO BECOME. A hub is a list of links, and a list of
 * links is what the wallet already was. So every habitat is a tile you can
 * see from here, found or not, and the creature is ON it — you arrive
 * somewhere rather than at a menu.
 *
 * Nothing here is a claim about the world. Every number on it is a count of
 * things this traveller collected, and the one figure that IS evidence — how
 * many a host verified — is printed as itself rather than folded into a score.
 */

import React from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { Backpack, ChevronRight, PawPrint, Shirt, type LucideIcon } from 'lucide-react-native';
import collectFriends from '../../assets/collect-travel-friends-v1.png';
import chivagoLogo from '../../assets/chivago-logo.png';
import {
  collectionSummary, strings,
  type Companion, type Progression,
} from '@chivago/core';
import { gameRadius, gameShadow } from '@chivago/tokens';
import { api } from '../api/client.ts';
import { useAsync } from '../state/store.tsx';
import { color, gutter, radius, shadow } from '../theme/index.ts';
import { Body, Heading, Label } from '../components/Type.tsx';
import { GameScene, Medal, Tray, TrayLine } from '../components/Game.tsx';
import { Creature } from '../components/Creature.tsx';
import { ErrorState, LoadingState } from '../components/States.tsx';
import { t } from '../i18n/locale.ts';
import { ProfileButton } from '../components/ProfileButton.tsx';
import { TravelHeroBackdrop } from '../components/Shell.tsx';

/**
 * The companion to put on the big card: the one with a step left to take.
 *
 * A hatchling before an egg, because it is the nearer of the two to growing
 * and the step it names is the more satisfying one to take. Null when there is
 * nothing to point at — none found yet, or every one already grown.
 */
export function nextUp(companions: Companion[]): Companion | null {
  const waiting = companions.filter((c) => c.stage !== 'grown' && c.nextStep !== null);
  return waiting.find((c) => c.stage === 'hatchling') ?? waiting[0] ?? null;
}

export function GameScreen({
  onOpenCompanion, onOpenMascots, onOpenParty,
  onOpenProfile, onOpenWallet, onOpenFashion,
}: {
  onOpenCompanion: (companion: Companion) => void;
  onOpenMascots: () => void;
  onOpenParty: () => void;
  onOpenProfile?: () => void;
  onOpenWallet: () => void;
  onOpenFashion: () => void;
}) {
  const held = useAsync(() => api.companions(), []);
  // Only the progression is read from the wallet. Its balances are the ledger
  // and stay on the wallet's own screen; a wallet that fails to load costs
  // this screen its level chip and nothing else.
  const wallet = useAsync(() => api.wallet(), []);
  const data = held.data;
  const companions = data?.companions ?? [];
  const summary = companions.length > 0 ? collectionSummary(companions) : null;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: color.bg }} showsVerticalScrollIndicator={false}>
      <Header
        progression={wallet.data?.progression ?? null}
        onOpenProfile={onOpenProfile}
        onOpenWallet={onOpenWallet}
        onOpenMascots={onOpenMascots}
        onOpenFashion={onOpenFashion}
      />
      <PartyDoor onOpen={onOpenParty} />

      {held.error ? <ErrorState message={held.error} onRetry={held.reload} /> : null}
      {held.loading && !data ? <LoadingState /> : null}

      {data ? (
        <>
          <NextUp companion={nextUp(companions)} anyFound={companions.length > 0} onOpen={onOpenCompanion} />
          {summary ? <Counts found={summary.found} grown={summary.grown} total={summary.total} /> : null}
          <Footnote />
        </>
      ) : null}

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

/** The screen's name and the level, which is the game layer's own number. */
function Header({
  progression, onOpenProfile, onOpenWallet, onOpenMascots, onOpenFashion,
}: {
  progression: Progression | null;
  onOpenProfile?: () => void;
  onOpenWallet: () => void;
  onOpenMascots: () => void;
  onOpenFashion: () => void;
}) {
  return (
    <View style={{
      paddingHorizontal: gutter,
      paddingTop: 20,
      paddingBottom: 20,
      backgroundColor: '#097097',
      borderBottomLeftRadius: 30,
      borderBottomRightRadius: 30,
      overflow: 'hidden',
      shadowColor: '#00263E',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.18,
      shadowRadius: 12,
      elevation: 4,
    }}>
      <TravelHeroBackdrop compact focalPoint="right" />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
          <Label size={10} tracking={0.16} colour="#D5F6FF">
            {t({ en: 'COLLECT & DISCOVER', th: 'สะสมและออกเดินทาง', zh: '收藏与探索' })}
          </Label>
          <Heading size={27} colour="#FFFFFF" style={{ marginTop: 3, fontWeight: '800' }}>
            {t({ en: 'Collect & collections', th: 'สะสม & เก็บคอลเลกชัน', zh: '收集与收藏' })}
          </Heading>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Image source={chivagoLogo} resizeMode="contain" accessibilityLabel="ChivarGo" style={{ width: 62, height: 44 }} />
          <ProfileButton onPress={onOpenProfile} />
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 11 }}>
        {progression ? <View style={{ flexShrink: 0, paddingVertical: 5, paddingHorizontal: 12, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.94)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.8)' }}><Label size={9} tracking={0.08} colour="#08748A">{t(strings.profile.levelChip(progression.level, progression.exp))}</Label></View> : null}
        <HeaderAction icon={Backpack} label="My Backpack" onPress={onOpenWallet} />
        <HeaderAction icon={PawPrint} label="Mascot" onPress={onOpenMascots} />
        <HeaderAction icon={Shirt} label="Fashion" onPress={onOpenFashion} />
      </View>
    </View>
  );
}

function HeaderAction({
  icon: Icon, label, onPress,
}: { icon: LucideIcon; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        flex: 1,
        minWidth: 0,
        minHeight: 44,
        paddingHorizontal: 8,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.52)',
        backgroundColor: pressed ? 'rgba(255,255,255,0.30)' : 'rgba(255,255,255,0.20)',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
      })}
    >
      <Icon size={17} color="#FFFFFF" strokeWidth={2.1} />
      <Text numberOfLines={2} style={{ flexShrink: 1, color: '#FFFFFF', fontSize: 11, lineHeight: 14, fontWeight: '700', textAlign: 'center' }}>
        {label}
      </Text>
    </Pressable>
  );
}

/** The social door stays here; personal awards and documents live on Profile. */
function PartyDoor({ onOpen }: { onOpen: () => void }) {
  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={t({ en: 'Travelling with', th: 'เพื่อนร่วมทาง', zh: '同行的人' })}
      style={[shadow.card, {
        height: 108,
        marginHorizontal: gutter,
        marginTop: 10,
        borderRadius: 22,
        backgroundColor: '#FFF0D7',
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(13,88,122,.08)',
        flexDirection: 'row',
        alignItems: 'center',
      }]}
    >
      <Image source={collectFriends} resizeMode="cover" style={{ width: '42%', height: '100%' }} />
      <View style={{ flex: 1, paddingHorizontal: 16, justifyContent: 'center' }}>
        <Label size={9} tracking={0.12} colour="#B26A18">{t({ en: 'SOCIAL COLLECTION', th: 'คอลเลกชันเพื่อนร่วมทาง', zh: '同行收藏' })}</Label>
        <Heading size={18} colour="#082E53" style={{ marginTop: 4 }}>{t({ en: 'Travelling with', th: 'เพื่อนร่วมทาง', zh: '同行的人' })}</Heading>
      </View>
      <View style={{ width: 38, height: 38, marginRight: 14, borderRadius: 19, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
        <ChevronRight size={19} color="#087DA4" strokeWidth={2.4} />
      </View>
    </Pressable>
  );
}

/**
 * The big card: one thing to do next, in the companion's own words.
 *
 * The step is the one `nextStepFor` wrote in core, so the card can only ever
 * promise what the ledger would actually count.
 */
function NextUp({
  companion, anyFound, onOpen,
}: { companion: Companion | null; anyFound: boolean; onOpen: (c: Companion) => void }) {
  const frame = [
    { marginHorizontal: gutter, marginTop: 16, minHeight: 132, borderRadius: gameRadius.panel, overflow: 'hidden' as const },
    gameShadow.lift,
  ];

  if (!companion) {
    // Nobody found yet, or every one grown: a sentence, never a blank panel.
    const said = anyFound
      ? { en: 'Every companion you have found is grown.', th: 'เพื่อนร่วมทางที่คุณพบโตเต็มวัยครบทุกตัวแล้ว', zh: '你找到的伙伴都已长大。' }
      : {
        en: 'Nothing here yet. A companion arrives on your second day in a habitat.',
        th: 'ยังไม่มีอะไรที่นี่ เพื่อนร่วมทางจะมาถึงในวันที่สองที่คุณอยู่ในถิ่นนั้น',
        zh: '这里还空着。在一处栖息地待到第二天，就会有伙伴出现。',
      };
    return (
      <View style={frame}>
        <GameScene>
          <View style={{ flex: 1, justifyContent: 'center', padding: 18 }}>
            <Body size={14} colour={color.neutral800}>{t(said)}</Body>
          </View>
        </GameScene>
      </View>
    );
  }

  const name = t(companion.species.name);
  return (
    <Pressable
      onPress={() => onOpen(companion)}
      accessibilityRole="button"
      accessibilityLabel={`${t({ en: 'Next up', th: 'ก้าวต่อไป', zh: '下一步' })}: ${name}. ${t(companion.nextStep!)}`}
      style={frame}
    >
      <GameScene>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', padding: 16, gap: 10 }}>
          <View style={{ flex: 1, gap: 4 }}>
            <View
              style={{
                alignSelf: 'flex-start', backgroundColor: color.ctaDeep,
                borderRadius: gameRadius.chip, paddingHorizontal: 8, paddingVertical: 2,
              }}
            >
              <Label size={9} tracking={0.1} colour={color.surface}>{t({ en: 'NEXT UP', th: 'ก้าวต่อไป', zh: '下一步' })}</Label>
            </View>
            <Heading size={19} tracking={-0.2}>{name}</Heading>
            <Body size={13} colour={color.neutral800}>{t(companion.nextStep!)}</Body>
          </View>
          <Creature species={companion.species.key} stage={companion.stage} size={88} />
        </View>
      </GameScene>
    </Pressable>
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
    <Tray style={{ marginHorizontal: gutter, marginTop: 14, borderRadius: gameRadius.panel }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Medal value={found} />
        <View style={{ flex: 1 }}>
          <TrayLine>
            {t({
              en: `${found} of ${total} habitats, ${grown} grown by a verified quest`,
              th: `${found} จาก ${total} ถิ่น · โตแล้ว ${grown} ตัวจากภารกิจที่ผู้จัดตรวจ`,
              zh: `${total} 处栖息地中已发现 ${found} 处 · 其中 ${grown} 只因已验证的任务而长大`,
            })}
          </TrayLine>
        </View>
      </View>
    </Tray>
  );
}

function Footnote() {
  return (
    <View
      style={[
        shadow.card,
        {
          marginHorizontal: gutter, marginTop: 14, padding: 14, borderRadius: radius.md,
          backgroundColor: color.surface, borderWidth: 1, borderColor: '#DCEFF5',
        },
      ]}
    >
      <Body size={13} colour={color.neutral700}>
        {t({
          en: 'Nothing on this screen is a claim about the world. What a host verified is said as itself, on the pages that carry it.',
          th: 'ไม่มีอะไรในหน้านี้ที่เป็นการอ้างเรื่องจริงในโลก สิ่งที่ผู้จัดตรวจแล้วจะบอกตรง ๆ ในหน้าที่มันอยู่',
          zh: '本页上的任何内容都不是对现实世界的主张。主办方验证过的事，会在承载它的页面上如实说明。',
        })}
      </Body>
    </View>
  );
}
