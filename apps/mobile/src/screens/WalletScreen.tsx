/**
 * The wallet.
 *
 * Two balances, a level, a rank ladder and the ledger. Every ledger entry
 * names the host that verified it - that is what makes a point feel earned
 * rather than granted.
 *
 * The two balances are shown SIDE BY SIDE with what each one means, because a
 * traveller holding both will otherwise read them as one number split in two.
 * Green is what a host vouched for; Trip is what the phone saw. Only one of
 * those belongs in an impact report.
 *
 * Ranks render as NUMERALS. The prototype carries emoji; Modernist forbids
 * them and the design already renders the numeral instead. Handoff open
 * question 7, resolved: ship the numeral.
 */

import React from 'react';
import { Animated, Image, ImageBackground, Platform, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { Award, Backpack, Camera, ChevronRight, Compass, Flag, Footprints, Gift, LockKeyhole, Map as MapIcon, MapPin, Scale, Sparkles, Star, Ticket } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { tint, type TintKey } from '@chivago/tokens';
import {
  ledgerDate, featuredMascot, provinceCompanions,
  ledgerLine,
  formatAmount, levelProgressPct, strings,
  type MedalState,
  type ProvinceCompanion,
  type Wallet,
  type Companion,
} from '@chivago/core';
import { api, type InboxItem } from '../api/client.ts';
import { STAGE_LABEL } from './CompanionHome.tsx';
import { useAsync } from '../state/store.tsx';
import { color, currencyTone, gutter, layout, onFill, radius, shadow } from '../theme/index.ts';
import { AccentNumeral, Body, Heading, Label } from '../components/Type.tsx';
import { Creature } from '../components/Creature.tsx';
import { Button } from '../components/Button.tsx';
import { OceanBackdrop } from '../components/Shell.tsx';
import { EmptyState, ErrorState, LoadingState } from '../components/States.tsx';
import { MyCollection } from '../components/MyCollection.tsx';
import { CurrencyItemCard, RewardInventory } from '../components/AdventureInventory.tsx';
import { MascotPortrait } from '../components/MascotPortrait.tsx';
import { useReduceMotion } from '../components/reduce-motion.ts';
import { t } from '../i18n/locale.ts';
import { formatInteger } from '../i18n/format.ts';
import adventureDuo from '../../assets/backpack-adventure-duo-v1.png';
import backpackWorld from '../../assets/backpack-tropical-world-v1.png';

export function WalletScreen({
  onOpenCompanion,
  onOpenMarket, onOpenAccount, refreshKey, notifications, unread, onMarkRead, onMarkAllRead,
  onOpenQuest, onOpenMascots = () => {}, onOpenSummon = () => {}, onOpenCollect, onOpenMedals,
}: {
  onOpenMarket: () => void;
  onOpenAccount: () => void;
  refreshKey: number;
  notifications: InboxItem[];
  unread: number;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onOpenQuest: (id: string) => void;
  onOpenCompanion: (c: Companion) => void;
  onOpenMascots?: () => void;
  onOpenSummon?: () => void;
  /** The Collect lobby, behind "View all" on the collection rail. */
  onOpenCollect?: () => void;
  /** The Medals screen, behind every medal slot in the reward inventory. */
  onOpenMedals?: () => void;
}) {
  const wallet = useAsync(() => api.wallet(), [refreshKey]);
  const companions = useAsync(() => api.companions(), [refreshKey]);
  /*
    The passport, for ONE thing: which province emblem belongs on the
    companions card. It is read separately and allowed to fail - a backpack
    whose mascot is missing still shows every balance, rank and collectible
    on it, the same bargain the companion fetch already makes.
  */
  const passport = useAsync(() => api.passport(), [refreshKey]);
  const province = React.useMemo<ProvinceCompanion | null>(
    () => (passport.data ? featuredMascot(provinceCompanions(passport.data.evidence ?? [])) : null),
    [passport.data],
  );
  /*
    The medals, for the reward inventory. Read on their own and allowed to
    fail: without them the inventory shows the five rank slots it always had
    and no medal slots at all, rather than seven drawn locked on a guess.
  */
  const medals = useAsync(() => api.medals(), [refreshKey]);
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const phone = width < 560;

  return (
    <ImageBackground source={backpackWorld} resizeMode="cover" imageStyle={{ opacity: 0.9 }} style={{ flex: 1, backgroundColor: '#CDEFFC' }}>
      <View pointerEvents="none" style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(210,241,251,0.48)' }} />
    <ScrollView style={{ flex: 1, backgroundColor: 'transparent' }} showsVerticalScrollIndicator={false}>
      <BackpackHeader wallet={wallet.data} />

      {wallet.loading ? <LoadingState /> : null}
      {wallet.error ? <ErrorState message={wallet.error} onRetry={wallet.reload} /> : null}
      {wallet.data ? (
        <View style={{ width: '100%', maxWidth: 1320, alignSelf: 'center', paddingBottom: 34 }}>
          <ImageBackground
            source={backpackWorld}
            resizeMode="cover"
            imageStyle={{ borderRadius: 27, opacity: 0.48 }}
            style={{
            marginHorizontal: phone ? 10 : gutter,
            marginTop: 18,
            padding: wide ? 18 : phone ? 10 : 12,
            borderRadius: 30,
            borderWidth: 3,
            borderColor: '#0B3B68',
            backgroundColor: '#EAF9FF',
            shadowColor: '#06335A',
            shadowOffset: { width: 0, height: 10 },
            shadowOpacity: 0.2,
            shadowRadius: 22,
            elevation: 7,
            overflow: 'hidden',
          }}>
            <View pointerEvents="none" style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(218,246,255,0.72)' }} />
            <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 22, right: 22, height: 5, borderRadius: 3, backgroundColor: '#F3C64F' }} />
            {wide ? (
              <View style={{ flexDirection: 'row', gap: 18 }}>
                <View style={{ flex: 0.72, minWidth: 0, gap: 14 }}>
                  <Balances wallet={wallet.data} embedded />
                  <TravelCompanions
                    companions={companions.data?.companions ?? null}
                    province={province}
                    onOpenCompanion={onOpenCompanion}
                    onOpenMascots={onOpenMascots}
                  />
                </View>
                <View style={{ flex: 1.28, minWidth: 0, gap: 14 }}>
                  <RankLadder wallet={wallet.data} embedded medals={medals.data?.medals ?? null} onOpenMedals={onOpenMedals} />
                  <LevelBlock wallet={wallet.data} embedded />
                </View>
              </View>
            ) : (
              <View style={{ gap: phone ? 12 : 14 }}>
                <Balances wallet={wallet.data} embedded />
                <RankLadder wallet={wallet.data} embedded medals={medals.data?.medals ?? null} onOpenMedals={onOpenMedals} />
                <LevelBlock wallet={wallet.data} embedded />
                <TravelCompanions
                  companions={companions.data?.companions ?? null}
                  province={province}
                  onOpenCompanion={onOpenCompanion}
                  onOpenMascots={onOpenMascots}
                />
              </View>
            )}
          </ImageBackground>
          {companions.data ? (
            <MyCollection
              companions={companions.data.companions}
              onOpenCompanion={onOpenCompanion}
              onOpenMascots={onOpenMascots}
              onOpenSummon={onOpenSummon}
              onOpenCollect={onOpenCollect}
            />
          ) : null}
          <Inbox
            items={notifications}
            unread={unread}
            onMarkRead={onMarkRead}
            onMarkAllRead={onMarkAllRead}
            onOpenQuest={onOpenQuest}
          />
          <Companions data={companions.data} onOpenCompanion={onOpenCompanion} />
          <Ledger wallet={wallet.data} onOpenMarket={onOpenMarket} />
          <AccountRow onOpenAccount={onOpenAccount} />
        </View>
      ) : null}
    </ScrollView>
    </ImageBackground>
  );
}

/**
 * The capsule at the top: who this backpack belongs to, and how far along.
 *
 * The level block drops BELOW the title under 540px rather than shrinking
 * beside it. A progress bar squeezed into a third of a 375px screen is a bar
 * nobody can read, and the two lines it carries - "Level 3" and "60 / 1,200
 * EXP" - wrap into each other long before the bar itself runs out of room.
 */
function BackpackHeader({ wallet }: { wallet: Wallet | null }) {
  const progression = wallet?.progression ?? null;
  const pct = progression ? levelProgressPct(progression.exp) : 0;
  const { width } = useWindowDimensions();
  const stacked = width < 540;
  return (
    <View style={{
      marginHorizontal: stacked ? 10 : gutter,
      marginTop: stacked ? 8 : 10,
      paddingHorizontal: stacked ? 14 : 20,
      paddingVertical: stacked ? 14 : 18,
      borderRadius: 26,
      borderWidth: 3,
      borderColor: '#0B3B68',
      borderBottomColor: '#E8B943',
      borderBottomWidth: 5,
      backgroundColor: '#BDEEFF',
      overflow: 'hidden',
      shadowColor: '#075076',
      shadowOffset: { width: 0, height: 7 },
      shadowOpacity: 0.24,
      shadowRadius: 14,
      elevation: 6,
    }}>
      <OceanBackdrop subtle />
      <Image source={backpackWorld} resizeMode="cover" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.22 }} />
      <View pointerEvents="none" style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(211,243,252,0.58)' }} />
      <View pointerEvents="none" style={{ position: 'absolute', width: 220, height: 220, borderRadius: 110, right: -58, top: -98, borderWidth: 3, borderColor: 'rgba(13,137,166,0.12)' }} />
      <View pointerEvents="none" style={{ position: 'absolute', width: 150, height: 150, borderRadius: 75, right: -12, top: -52, borderWidth: 2, borderColor: 'rgba(232,185,67,0.18)' }} />
      <View style={{ flexDirection: stacked ? 'column' : 'row', alignItems: stacked ? 'stretch' : 'center', gap: stacked ? 12 : 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, flex: stacked ? undefined : 1, minWidth: 0 }}>
          <View style={{ width: stacked ? 50 : 58, height: stacked ? 50 : 58, borderRadius: stacked ? 17 : 20, borderWidth: 3, borderColor: '#F4D06B', backgroundColor: '#0B5F82', alignItems: 'center', justifyContent: 'center', shadowColor: '#075076', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.24, shadowRadius: 8, elevation: 4 }}>
            <Backpack size={stacked ? 25 : 29} color="#F7D66F" strokeWidth={2.2} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Label size={10} tracking={0.18} colour="#0B6B89">
              {t({ en: 'CHIVARGO ADVENTURE INVENTORY', th: 'คลังไอเทมนักผจญภัย CHIVARGO', zh: 'CHIVARGO 冒险物品栏' })}
            </Label>
            <Heading size={stacked ? 25 : 34} tracking={-0.7} colour="#082E53" style={{ marginTop: 3 }}>
              {t(strings.tabs.backpack)}
            </Heading>
          </View>
        </View>
        {progression ? (
          <View
            accessible
            accessibilityLabel={`${t(strings.wallet.level(progression.level))}. ${t(strings.wallet.levelBar(progression.intoLevel, progression.levelSpan))}`}
            style={{
              width: stacked ? undefined : 190,
              maxWidth: stacked ? undefined : '42%',
              padding: 10,
              borderRadius: 17,
              borderWidth: 2,
              borderColor: '#0B3B68',
              backgroundColor: 'rgba(255,255,255,0.9)',
              shadowColor: '#075076',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.18,
              shadowRadius: 8,
              elevation: 3,
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <Heading size={14} colour="#8A5A00">{t(strings.wallet.level(progression.level))}</Heading>
              <Label size={9} tracking={0} colour="#082E53" style={{ textTransform: 'none' }}>
                {t(strings.wallet.levelBar(progression.intoLevel, progression.levelSpan))}
              </Label>
            </View>
            <View style={{ height: 9, borderRadius: 5, overflow: 'hidden', backgroundColor: '#CFE4ED', marginTop: 7 }}>
              <View style={{ width: `${pct}%`, height: '100%', borderRadius: 4, backgroundColor: '#35D3D0' }} />
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
}

/**
 * The two faces in the backpack: a province emblem and the traveller's pet.
 *
 * NEITHER IS INVENTED. The mascot is whichever province this traveller has
 * the most evidence in (`featuredMascot`), and when they have been nowhere
 * the tile says so and still opens the collection - a backpack showing an
 * emblem for a province nobody visited would be picturing a trip that did not
 * happen. The pet is the first companion they actually hold, and an empty
 * collection gets a stated locked state rather than a silhouette to guess at.
 *
 * An egg keeps its species hidden here exactly as it does everywhere else:
 * the tile reads the egg's name, never the animal's.
 */
/**
 * The ChivarGo traveller and his dog, breathing slightly.
 *
 * DECORATION, and marked as such: no accessibility node, no press target.
 * They are the brand's own characters, not this traveller's mascot or pet -
 * those are the two tiles beside them, which come from real evidence. Making
 * the dog pressable would make it look like the traveller's pet, and their
 * pet may well be an unhatched beach egg.
 *
 * The float is four pixels over 2.6 seconds and stops entirely for anybody
 * who asked their system for less motion.
 */
function FloatingDuo({ compact }: { compact: boolean }) {
  const still = useReduceMotion();
  const lift = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    if (still) { lift.setValue(0); return undefined; }
    const native = Platform.OS !== 'web';
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(lift, { toValue: -4, duration: 1300, useNativeDriver: native }),
      Animated.timing(lift, { toValue: 0, duration: 1300, useNativeDriver: native }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [still, lift]);
  // The float lives on a wrapping view, not on `Animated.Image`: the plain
  // `Image` is the one every renderer in this repo knows how to resolve.
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: compact ? -10 : -20,
        bottom: compact ? -13 : -24,
        width: compact ? '48%' : '59%',
        height: compact ? 192 : 272,
        zIndex: 2,
        transform: [{ translateY: lift }],
      }}
    >
      <Image source={adventureDuo} resizeMode="contain" accessible={false} style={{ width: '100%', height: '100%' }} />
    </Animated.View>
  );
}

function TravelCompanions({
  companions,
  province,
  onOpenCompanion,
  onOpenMascots,
}: {
  companions: Companion[] | null;
  province: ProvinceCompanion | null;
  onOpenCompanion: (companion: Companion) => void;
  onOpenMascots: () => void;
}) {
  const pet = companions?.[0] ?? null;
  const mascotName = province ? t(province.mascot.name) : '';
  const provinceName = province ? t(province.province.name) : '';
  const { width } = useWindowDimensions();
  const compact = width < 560;
  return (
    <View style={{
      minHeight: compact ? 228 : 286,
      padding: 15,
      borderRadius: 24,
      borderWidth: 3,
      borderColor: '#123E68',
      backgroundColor: '#DDF4FC',
      shadowColor: '#082E53',
      shadowOffset: { width: 0, height: 5 },
      shadowOpacity: 0.15,
      shadowRadius: 10,
      elevation: 4,
      overflow: 'visible',
    }}>
      <View pointerEvents="none" style={{ position: 'absolute', inset: 7, borderRadius: 17, borderWidth: 1, borderColor: 'rgba(255,255,255,0.9)' }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Compass size={18} color="#C78B13" />
        <Heading size={17} colour="#082E53">{t({ en: 'Travel companions', th: 'เพื่อนร่วมเดินทาง', zh: '旅行伙伴' })}</Heading>
      </View>
      {/*
        The duo is decorative key art. The two interactive tiles remain the
        only claims about what this traveller actually owns; their labels and
        empty states still come entirely from province/companion evidence.
      */}
      <FloatingDuo compact={compact} />
      <View style={{
        marginTop: 12,
        marginLeft: compact ? '43%' : '49%',
        gap: 10,
        zIndex: 3,
      }}>
        <Pressable
          onPress={onOpenMascots}
          accessibilityRole="button"
          accessibilityLabel={province
            ? t({
              en: `${mascotName}, the emblem of ${provinceName}. Open the Mascot collection.`,
              th: `${mascotName} มาสคอตประจำ${provinceName} เปิดคอลเลกชันมาสคอต`,
              zh: `${mascotName}，${provinceName}的吉祥物。打开吉祥物收藏。`,
            })
            : t({
              en: 'No province mascot yet. Open the Mascot collection.',
              th: 'ยังไม่มีมาสคอตประจำจังหวัด เปิดคอลเลกชันมาสคอต',
              zh: '还没有府吉祥物。打开吉祥物收藏。',
            })}
          style={({ pressed }) => ({
            minHeight: compact ? 78 : 96,
            padding: 10,
            borderRadius: 18,
            borderWidth: 3,
            borderColor: province ? '#E2B13E' : '#7592AA',
            backgroundColor: pressed
              ? (province ? '#FFF0BD' : '#DFE8EE')
              : (province ? '#FFF8DE' : '#EAF1F5'),
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: province ? '#8B650E' : '#183B59',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.18,
            shadowRadius: 7,
            elevation: 3,
          })}
        >
          {province
            ? <MascotPortrait mascot={province.mascot} size={58} />
            : <Compass size={42} color="#607A91" />}
          <Label size={9} tracking={0.08} colour={province ? '#7B5714' : '#607A91'}>
            {province
              ? t({ en: 'MASCOT', th: 'มาสคอต', zh: '吉祥物' })
              : t({ en: 'NO MASCOT YET', th: 'ยังไม่มีมาสคอต', zh: '尚无吉祥物' })}
          </Label>
        </Pressable>
        {pet ? (
          <Pressable
            onPress={() => onOpenCompanion(pet)}
            accessibilityRole="button"
            accessibilityLabel={`${t(pet.stage === 'egg' ? pet.species.eggName : pet.species.name)}, ${t(STAGE_LABEL[pet.stage])}`}
            style={({ pressed }) => ({
              minHeight: compact ? 78 : 96,
              padding: 10,
              borderRadius: 18,
              borderWidth: 3,
              borderColor: '#19769A',
              backgroundColor: pressed ? '#D7F2FA' : '#EAF8FC',
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: '#07566F',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.18,
              shadowRadius: 7,
              elevation: 3,
            })}
          >
            <Creature species={pet.species.key} stage={pet.stage} size={58} />
            <Label size={9} tracking={0.08} colour="#0B6386">{t({ en: 'PET', th: 'สัตว์เลี้ยง', zh: '伙伴' })}</Label>
          </Pressable>
        ) : (
          <View
            accessible
            accessibilityLabel={t({
              en: 'No travel pet yet. Check in anywhere to find your first egg.',
              th: 'ยังไม่มีสัตว์เลี้ยงร่วมทาง เช็กอินที่ไหนก็ได้เพื่อพบไข่ใบแรก',
              zh: '还没有旅行伙伴。在任何地方签到，找到你的第一颗蛋。',
            })}
            style={{ minHeight: compact ? 78 : 96, padding: 10, borderRadius: 18, borderWidth: 3, borderColor: '#7592AA', backgroundColor: '#EAF1F5', alignItems: 'center', justifyContent: 'center', gap: 6, shadowColor: '#183B59', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.16, shadowRadius: 7, elevation: 3 }}
          >
            <LockKeyhole size={30} color="#607A91" />
            <Label size={9} tracking={0.08} colour="#607A91">{t({ en: 'PET LOCKED', th: 'ยังไม่มีสัตว์เลี้ยง', zh: '伙伴未解锁' })}</Label>
          </View>
        )}
      </View>
    </View>
  );
}

/**
 * The way to a second phone.
 *
 * At the bottom of the wallet on purpose: everything above it is what the
 * traveller would lose if this phone were their only one, so the invitation to
 * add another reads as a consequence of the list rather than a settings item.
 */
function AccountRow({ onOpenAccount }: { onOpenAccount: () => void }) {
  return (
    <Pressable
      onPress={onOpenAccount}
      accessibilityRole="button"
      accessibilityLabel={t({
        en: 'Your account. Add another phone, or see which phones are signed in.',
        th: 'บัญชีของคุณ เพิ่มเครื่องอื่น หรือดูว่าเครื่องใดลงชื่อเข้าใช้อยู่',
        zh: '你的账号。添加另一部手机，或查看哪些手机已登录。',
      })}
      style={[
        shadow.card,
        {
          marginHorizontal: gutter, marginTop: 18, marginBottom: 28,
          padding: 16, minHeight: 44,
          flexDirection: 'row', alignItems: 'center', gap: 12,
          borderWidth: 1, borderColor: '#DCEFF5', borderRadius: radius.md,
          backgroundColor: color.surface,
        },
      ]}
    >
      <View style={{ flex: 1 }}>
        <Heading size={15}>{t({ en: 'Your account', th: 'บัญชีของคุณ', zh: '你的账号' })}</Heading>
        <Label size={9} tracking={0.04} colour={color.neutral600} style={{ marginTop: 5, textTransform: 'none' }}>
          {t({
            en: 'Add another phone so none of this depends on keeping this one.',
            th: 'เพิ่มอีกเครื่อง เพื่อไม่ให้ทุกอย่างขึ้นกับเครื่องนี้เครื่องเดียว',
            zh: '再添加一部手机，这样这一切就不必只靠这一部。',
          })}
        </Label>
      </View>
      <ChevronRight size={18} color={color.brand} strokeWidth={2} />
    </Pressable>
  );
}

/**
 * The two balances.
 *
 * Green leads: it is the harder currency to earn and the only one that means
 * anything outside the app. Each carries a one-line note saying where it comes
 * from, because two numbers with no explanation read as one number split in
 * two, and the difference between them is the whole design.
 */
export function Balances({ wallet, embedded = false }: { wallet: Wallet; embedded?: boolean }) {
  const { width } = useWindowDimensions();
  const compact = width < 560;
  return (
    /*
      TWO PLAQUES ON THE SKY, not two rows in a panel.

      The card that used to box them in made the pair read as one component
      with a divider. They are two separate things a traveller carries, and
      standing them apart on the background is what says so before a word is
      read.
    */
    /*
      STACKED AT EVERY WIDTH. Side by side on a phone gave each plaque about
      170px, and an emblem worth looking at plus a figure worth reading do
      not fit in that - the figure was the thing that shrank. Stacked, both
      keep their size and the page simply grows.
    */
    <View
      style={{
        gap: compact ? 10 : 14,
        flexDirection: 'column',
        marginHorizontal: embedded ? 0 : gutter,
        marginTop: embedded ? 0 : 16,
      }}
    >
      <CurrencyItemCard
        kind="star"
        figure={wallet.balances.green}
        label={t(strings.common.greenPoints)}
        title={t({ en: 'Star Points', th: 'แต้มดาว', zh: '星星点数' })}
        note={t(strings.common.greenPointsNote)}
        compact={compact}
      />
      <CurrencyItemCard
        kind="flag"
        figure={wallet.balances.trip}
        label={t(strings.common.tripPoints)}
        title={t({ en: 'Travel Flags', th: 'ธงเดินทาง', zh: '旅行旗帜' })}
        note={t(strings.common.tripPointsNote)}
        compact={compact}
      />
    </View>
  );
}

export function Purse({
  figure, label, displayLabel, note, accent = false, icon: Icon, compact = false,
}: { figure: number; label: string; displayLabel?: string; note: string; accent?: boolean; icon?: LucideIcon; compact?: boolean }) {
  /*
    A PARCHMENT PLAQUE, not a tile.

    Both purses wear the same weathered card because they are the same kind
    of object - a figure the traveller carries - and the design asks for them
    to read as two items in a pack rather than two panels in a dashboard.

    What stays DIFFERENT is everything that matters: the emblem (a gold star
    against a teal flag), the frame it sits in, the name, and the one line
    saying where the figure came from. The two currencies have to survive
    being read quickly, and a traveller holding both will otherwise take them
    for one number split in two.
  */
  const frame = accent ? '#C9962F' : '#1C7E9C';
  return (
    <View
      accessible
      accessibilityLabel={`${formatInteger(figure)} ${label}. ${note}`}
      style={{
        flex: compact ? 1 : undefined,
        minWidth: 0,
        minHeight: compact ? 116 : 104,
        padding: compact ? 4 : 6,
        borderRadius: compact ? 18 : 20,
        borderWidth: 3,
        borderColor: frame,
        backgroundColor: '#EFDDB2',
        shadowColor: '#6B4C14',
        shadowOffset: { width: 0, height: 5 },
        shadowOpacity: 0.26,
        shadowRadius: 9,
        elevation: 4,
      }}
    >
      {/* The inner rule. A plaque has a face inset from its edge. */}
      <View
        style={{
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          gap: compact ? 7 : 12,
          paddingHorizontal: compact ? 7 : 10,
          paddingVertical: compact ? 7 : 9,
          borderRadius: compact ? 14 : 15,
          borderWidth: 1,
          borderColor: accent ? '#D9B868' : '#8FBDCE',
          backgroundColor: '#F7ECCE',
        }}
      >
        <View
          style={{
            width: compact ? 44 : 62,
            height: compact ? 44 : 62,
            borderRadius: compact ? 22 : 31,
            borderWidth: 3,
            borderColor: accent ? '#E8C25C' : '#53C6D6',
            backgroundColor: accent ? '#F5C53F' : '#17A2B6',
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: accent ? '#9A6A0B' : '#07586E',
            shadowOffset: { width: 0, height: 3 },
            shadowOpacity: 0.3,
            shadowRadius: 5,
            elevation: 3,
          }}
        >
          {Icon ? <Icon size={compact ? 24 : 34} color="#FFFFFF" fill={accent ? '#FFFFFF' : 'transparent'} strokeWidth={2.2} /> : null}
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', gap: 7 }}>
            <Label size={compact ? 9 : 11} tracking={compact ? 0.03 : 0.08} colour="#4A3410">{displayLabel ?? label}</Label>
            {displayLabel && displayLabel !== label ? (
              <Label size={9} tracking={0.03} colour="#7B673F" style={{ textTransform: 'none', fontSize: 8 }}>{label}</Label>
            ) : null}
          </View>
          {/* The figure in a navy capsule, the way a plaque carries a number. */}
          <View style={{ alignSelf: 'flex-start', minWidth: compact ? 58 : 96, paddingHorizontal: compact ? 9 : 14, paddingVertical: 4, borderRadius: 13, backgroundColor: '#0E3A63' }}>
            {/*
              White on the navy capsule, in both purses. `accent700` is a dark
              gold and reads as a smudge against this background; the accent
              survives on the emblem and the frame, where it has the contrast
              to mean something.
            */}
            {accent ? (
              <AccentNumeral size={compact ? 21 : 26} style={{ color: '#FFFFFF' }}>{formatInteger(figure)}</AccentNumeral>
            ) : (
              <Heading size={compact ? 21 : 26} tracking={-0.6} colour="#FFFFFF">{formatInteger(figure)}</Heading>
            )}
          </View>
          <Label size={9} tracking={0} colour="#6B5424" style={{ textTransform: 'none', fontSize: compact ? 7 : 9 }}>
            {note}
          </Label>
        </View>
      </View>
    </View>
  );
}

/**
 * Level and EXP.
 *
 * Measures progress WITHIN the current level, against that level's own span.
 * The prototype uses `points / 2500`, which pins at 100% forever once a user
 * passes it - and worse, fell when they spent. EXP cannot fall, so this bar
 * only ever moves one way.
 */
export function LevelBlock({ wallet, embedded = false }: { wallet: Wallet; embedded?: boolean }) {
  const { progression: p } = wallet;
  const pct = levelProgressPct(p.exp);
  return (
    <View
      style={[shadow.card, {
        marginHorizontal: embedded ? 0 : gutter,
        marginTop: embedded ? 0 : 12,
        padding: 16,
        backgroundColor: color.surface,
        borderRadius: radius.md,
        borderWidth: 2,
        borderColor: '#123E68',
      }]}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
          <Heading size={14}>{t(strings.wallet.level(p.level))}</Heading>
          <Label size={11} tracking={0.1}>{t(p.rank.label)}</Label>
        </View>
        <Label size={11} tracking={0} style={{ textTransform: 'none' }}>
          {t(strings.wallet.levelBar(p.intoLevel, p.levelSpan))}
        </Label>
      </View>
      {/*
        Gold. A level is earned by activity, not granted by a host - it is the
        game layer, and painting it in the verified green made progression look
        like proof. The two things a judge must be able to tell apart at a
        glance are exactly these.
      */}
      <View style={{ height: 10, borderRadius: 5, overflow: 'hidden', backgroundColor: color.neutral200, marginTop: 10 }}>
        <View style={{ width: `${pct}%`, height: '100%', borderRadius: 5, backgroundColor: color.gold }} />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
        <Label size={9} tracking={0.06} colour={color.neutral600}>
          {t(strings.wallet.expNote)}
        </Label>
        <Label size={9} tracking={0.06} colour={color.neutral600}>
          {p.nextRank
            ? t(strings.wallet.toNextRank(p.nextRankAtLevel! - p.level, t(p.nextRank.label)))
            : t(strings.wallet.topRank)}
        </Label>
      </View>
    </View>
  );
}

/**
 * The reward inventory: the five ranks and the seven medals, as one case.
 *
 * Kept under its old name because it is still the rank ladder - the first
 * five slots are `progression.ladder`, in order - and because the screen
 * tests read it by that name. `medals` is optional so a caller that only has
 * the wallet still gets the ladder; it simply gets no medal slots rather
 * than invented ones.
 */
export function RankLadder({
  wallet, medals = null, onOpenMedals,
}: { wallet: Wallet; embedded?: boolean; medals?: readonly MedalState[] | null; onOpenMedals?: () => void }) {
  return <RewardInventory progression={wallet.progression} medals={medals} onOpenMedals={onOpenMedals} />;
}
/**
 * What kind of line a ledger entry is, said with an icon on a flat tint.
 *
 * The icon names the KIND of entry - a quest, a check-in, a voucher - and
 * nothing about whether it was verified: that is the amount's colour, one
 * column over, and it stays the only place the verified green appears.
 */
const ENTRY_LOOK: Record<Wallet['ledger'][number]['kind'], { Icon: LucideIcon; tone: TintKey }> = {
  quest_reward: { Icon: Sparkles, tone: 'lilac' },
  checkin: { Icon: MapPin, tone: 'sky' },
  walk: { Icon: Footprints, tone: 'teal' },
  review: { Icon: Star, tone: 'peach' },
  redemption: { Icon: Ticket, tone: 'sand' },
  adjustment: { Icon: Scale, tone: 'rose' },
};

export function Ledger({ wallet, onOpenMarket }: { wallet: Wallet; onOpenMarket: () => void }) {
  const now = React.useMemo(() => new Date(), []);
  return (
    <View style={{ paddingHorizontal: gutter, paddingVertical: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Label size={10} tracking={0.14}>{t(strings.wallet.ledger)}</Label>
        <Button label={t(strings.wallet.spendPoints)} onPress={onOpenMarket} variant="ghost" />
      </View>

      {wallet.ledger.length === 0 ? (
        <EmptyState en={t(strings.wallet.emptyLedger)} th={strings.wallet.emptyLedger.th} />
      ) : null}

      {wallet.ledger.length > 0 ? (
        <View
          style={[
            shadow.card,
            {
              marginTop: 8,
              paddingHorizontal: 14,
              paddingVertical: 4,
              backgroundColor: color.surface,
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: '#DCEFF5',
            },
          ]}
        >
          {wallet.ledger.map((entry, idx) => {
            const look = ENTRY_LOOK[entry.kind] ?? ENTRY_LOOK.adjustment;
            const tone = tint[look.tone];
            return (
              <View
                key={entry.id}
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 12,
                  paddingVertical: 12,
                  borderBottomWidth: idx < wallet.ledger.length - 1 ? 1 : 0,
                  borderBottomColor: color.neutral200,
                }}
              >
                <View
                  style={{
                    width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
                    backgroundColor: tone.fill,
                  }}
                >
                  <look.Icon size={18} color={tone.ink} strokeWidth={2} />
                </View>
                <View style={{ flex: 1 }}>
                  <Heading size={14}>{t(ledgerLine(entry))}</Heading>
                  <Label size={11} tracking={0} style={{ textTransform: 'none', marginTop: 2 }}>
                    {`${t(ledgerDate(entry.occurredAt, now))} · ${entry.host}`}
                  </Label>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 5 }}>
                  <Heading
                    size={15}
                    colour={
                      entry.amount < 0
                        ? color.neutral600
                        : currencyTone(entry.currency).text
                    }
                  >
                    {formatAmount(entry.amount)}
                  </Heading>
                  <Label size={10} tracking={0.1} colour={color.neutral600}>
                    {entry.currency === 'green' ? 'G' : 'T'}
                  </Label>
                </View>
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

/**
 * The in-app inbox.
 *
 * Lives on the wallet because that is where a volunteer goes to check whether
 * their points arrived - the exact question the notification answers.
 *
 * This is the SOURCE OF TRUTH, not the push. A push can be denied, expired, or
 * arrive while the phone is in a bag for a day; these rows are written when the
 * host decides and survive every delivery failure. Someone who declined
 * notifications still finds out here.
 */
function Inbox({
  items, unread, onMarkRead, onMarkAllRead, onOpenQuest,
}: {
  items: InboxItem[];
  unread: number;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onOpenQuest: (id: string) => void;
}) {
  if (items.length === 0) return null;
  const now = new Date();

  return (
    <View
      style={{
        paddingHorizontal: gutter,
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: color.neutral300,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Label size={10} tracking={0.14}>{t(strings.notifications.title)}</Label>
          {unread > 0 ? (
            <View style={{ backgroundColor: color.brand, paddingHorizontal: 6, paddingVertical: 2 }}>
              <Heading size={11} colour={onFill.brand}>{unread}</Heading>
            </View>
          ) : null}
        </View>
        {unread > 0 ? (
          <Button label={t(strings.notifications.markAllRead)} onPress={onMarkAllRead} variant="ghost" />
        ) : null}
      </View>

      {items.slice(0, 5).map((item) => {
        const questId = typeof item.data.questId === 'string' ? item.data.questId : null;
        const isUnread = item.readAt === null;
        return (
          <Pressable
            key={item.id}
            onPress={() => {
              if (isUnread) onMarkRead(item.id);
              if (questId && item.data.screen === 'quest') onOpenQuest(questId);
            }}
            accessibilityRole="button"
            accessibilityLabel={`${t(item.title)}. ${t(item.body)}`}
            style={{
              flexDirection: 'row',
              gap: 12,
              paddingVertical: 12,
              borderBottomWidth: 1,
              borderBottomColor: color.neutral300,
            }}
          >
            {/* An unread marker, not a dot on a badge - Modernist has no radii. */}
            <View
              style={{
                width: 8,
                height: 8,
                marginTop: 6,
                backgroundColor: isUnread ? color.brand : 'transparent',
              }}
            />
            <View style={{ flex: 1 }}>
              <Heading size={14}>{t(item.title)}</Heading>
              <Body size={13} colour={color.neutral800} style={{ marginTop: 6 }}>{t(item.body)}</Body>
              <Label size={10} tracking={0.1} style={{ marginTop: 6 }}>
                {t(ledgerDate(item.createdAt, now))}
              </Label>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * The companion collection - one creature per habitat.
 *
 * Deliberately NOT a shop and NOT a gacha. Each stage is a picture of the
 * evidence behind it: an egg means you were somewhere, a hatchling means you
 * covered the habitat, and a grown animal means a host verified work you did
 * there. Nothing here can be bought, rolled for, or granted by any route.
 *
 * The species are real Samui animals with their binomials and one true fact,
 * so the collection teaches something even to somebody who never checks in
 * again.
 */
function Companions({
  onOpenCompanion,
  data,
}: {
  data: {
    companions: Companion[];
    summary: { found: number; total: number; grown: number };
    speciesAsOf: string;
  } | null;
  onOpenCompanion: (c: Companion) => void;
}) {
  if (!data) return null;
  const { companions, summary } = data;

  return (
    <View style={{ borderTopWidth: layout.ruleHair, borderTopColor: color.neutral300, paddingTop: 18 }}>
      <View style={{
        flexDirection: 'row', justifyContent: 'space-between',
        alignItems: 'baseline', paddingHorizontal: gutter,
      }}>
        <Label size={10} tracking={0.16}>{t(strings.profile.companions)}</Label>
        <Label size={10} tracking={0.12} colour={color.neutral600}>
          {`${summary.found}/${summary.total} · ${summary.grown} ${t(strings.profile.companionsGrown)}`}
        </Label>
      </View>

      {companions.length === 0 ? (
        // Not five locked slots. An empty collection with a lever you cannot
        // see is the shape of a slot machine.
        <View style={{ paddingHorizontal: gutter, paddingTop: 12 }}>
          <Body size={13} colour={color.neutral700}>{t(strings.profile.companionsEmpty)}</Body>
        </View>
      ) : null}

      {companions.map((c) => (
        <Pressable
          key={c.species.key}
          onPress={() => onOpenCompanion(c)}
          accessibilityRole="button"
          accessibilityLabel={`${t(c.species.name)}, ${t(STAGE_LABEL[c.stage])}. ${t(strings.place.visitItsHome)}`}
          style={[
            shadow.card,
            {
              marginTop: 12,
              marginHorizontal: gutter,
              padding: 16,
              backgroundColor: color.surface,
              borderWidth: c.stage === 'grown' ? layout.ruleStrong : 1,
              borderColor: c.stage === 'grown' ? color.accent : '#DCEFF5',
              borderRadius: radius.md,
            },
          ]}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            {/*
              The animal, before its name. A collection of five creatures that
              showed none of them was asking the reader to do the imagining on
              the one screen whose whole job is to be a reward.
            */}
            <Creature species={c.species.key} stage={c.stage} size={52} />
            <View style={{ flex: 1 }}>
              <Heading size={16} colour={c.stage === 'grown' ? color.accent : color.text}>
                {c.stage === 'egg' ? t(c.species.eggName) : t(c.species.name)}
              </Heading>
            </View>
            <Label size={9} tracking={0.12} colour={color.neutral600}>
              {t(STAGE_LABEL[c.stage])}
            </Label>
          </View>

          {/* An egg keeps the species hidden - that is the whole point of one. */}
          {c.stage !== 'egg' ? (
            <>
              <Label
                size={9}
                tracking={0.06}
                colour={color.neutral500}
                style={{ marginTop: 8, textTransform: 'none' }}
              >
                {`${c.species.scientific} · IUCN ${c.species.status}`}
              </Label>
              <Body size={13} colour={color.neutral600} style={{ marginTop: 6 }}>
                {t(c.species.fact)}
              </Body>
            </>
          ) : null}

          {/* What would move it on. Never a locked slot with no explanation. */}
          {c.nextStep ? (
            <Body size={13} colour={color.accent700} style={{ marginTop: 10 }}>
              {t(c.nextStep)}
            </Body>
          ) : null}
        </Pressable>
      ))}

      <View style={{ paddingHorizontal: gutter, paddingTop: 12 }}>
        <Label size={9} tracking={0.06} colour={color.neutral500} style={{ textTransform: 'none' }}>
          {t({
            en: `Species and conservation status recorded ${data.speciesAsOf}.`,
            th: `ข้อมูลชนิดพันธุ์และสถานะการอนุรักษ์ บันทึกเมื่อ ${data.speciesAsOf}`,
            zh: `物种与保护状况记录于 ${data.speciesAsOf}。`,
          })}
        </Label>
      </View>
    </View>
  );
}
