/**
 * The Summoning - the screen a charm is spent on.
 *
 * Everything this screen says about odds comes from the SERVER's `rules`
 * block, never from the client's own copy of `spirits.ts`. A phone that had
 * not been updated would otherwise print last month's rates beside this
 * month's roll, which is a false statement about a draw and the one thing
 * this mechanic cannot afford to make. See docs/68.
 *
 * Three things are on the screen before the button, in this order, because
 * the order is the argument:
 *
 *   WHERE THE CHARM CAME FROM - a verified quest, or a day you checked in.
 *   Not a price. A traveller should be able to read what they did to get here.
 *
 *   WHAT THIS IS NOT - the server's own notice, in the traveller's language:
 *   no money, no points, no vouchers, no prizes.
 *
 *   THE TABLE - the four rates, both floors, and how far each floor is away.
 *   Open by default rather than behind a tap: a rate a player has to go
 *   looking for is a rate they were not shown.
 */

import React from 'react';
import {
  Animated, Easing, Image, ImageBackground, Modal, Platform, Pressable, ScrollView, Vibration, View, useWindowDimensions,
} from 'react-native';
import { ChevronLeft, Compass, Flag, Gift, Shirt, Sparkles } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import {
  COURT_LABEL, RARITIES, RARITY_LABEL, strings, type SpiritRarity,
} from '@chivago/core';
import {
  api,
  newGachaIdempotencyKey,
  type FashionCard, type PullResult, type SpiritCard, type SummonReceipt, type SummonResult, type SummonState,
} from '../api/client.ts';
import { useAsync } from '../state/store.tsx';
import { color, gutter, radius, shadow } from '../theme/index.ts';
import { gameRadius, gameShadow, gameTray } from '@chivago/tokens';
import { GameBar, Tray, TrayLine } from '../components/Game.tsx';
import { Body, Heading, Label } from '../components/Type.tsx';
import { Button, IconButton } from '../components/Button.tsx';
import { ErrorState, LoadingState } from '../components/States.tsx';
import { MascotMark } from '../components/MascotMark.tsx';
import { t } from '../i18n/locale.ts';
import { formatDate, formatInteger } from '../i18n/format.ts';
import { useRequireAccount } from '../components/GuestActionGate.tsx';
import { useReduceMotion } from '../components/reduce-motion.ts';
import { announceTravelReward } from '../state/travel-companion-events.ts';
import travelHero from '../../assets/chivago-travel-hero-v2.png';
import summonPetStyleMachine from '../../assets/summon-pet-style-machine-v1.png';

/** The day a round opened, in the reader's own calendar conventions. */
const openedOn = (iso: string): string =>
  formatDate(iso);

/** Keep a fast local/demo response on screen long enough for the machine to perform. */
const MINIMUM_DRAW_MS = 1_650;

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** Lightweight generated cues: no network asset and no delay on the draw. */
function playCue(kind: 'machine' | 'rare' | 'mythic'): void {
  if (Platform.OS !== 'web') {
    Vibration.vibrate(kind === 'mythic' ? [0, 45, 35, 90] : kind === 'rare' ? 65 : 35);
    return;
  }
  if (typeof window === 'undefined') return;
  const AudioCtor = window.AudioContext
    ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtor) return;
  const ctx = new AudioCtor();
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = kind === 'machine' ? 'square' : 'sine';
  oscillator.frequency.setValueAtTime(kind === 'mythic' ? 520 : kind === 'rare' ? 390 : 120, ctx.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(kind === 'machine' ? 82 : 880, ctx.currentTime + 0.18);
  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.22);
  oscillator.connect(gain); gain.connect(ctx.destination);
  oscillator.start(); oscillator.stop(ctx.currentTime + 0.23);
  oscillator.addEventListener('ended', () => { void ctx.close(); });
}

/**
 * A rarity's colour.
 *
 * None of them is the evidence green, for the same reason no spirit wears it
 * in its own palette: green in this product means a host verified something,
 * and a mythic is not evidence of anything.
 */
/*
  Dark enough to carry WHITE at 9px.

  The first version used light tints on a tinted fill, which read on the
  white card and vanished on the tray's ink ground - and the tray is where
  the odds table is, which is the one thing on this screen nobody may have
  trouble reading. A solid fill with white on it works on both grounds, so
  the pill looks the same wherever it is drawn.
*/
const RARITY_TINT: Record<SpiritRarity, string> = {
  common: '#5c6672',
  uncommon: '#2d6f9e',
  rare: '#6b3fb0',
  mythic: '#a06a08',
};

function RarityPill({ rarity }: { rarity: SpiritRarity }) {
  return (
    <View
      style={{
        paddingVertical: 2, paddingHorizontal: 7, borderRadius: radius.sm,
        backgroundColor: RARITY_TINT[rarity],
      }}
    >
      <Label size={9} tracking={0.1} colour="#FFFFFF">{t(RARITY_LABEL[rarity])}</Label>
    </View>
  );
}

/** One card in the guide. A spirit nobody has met has no name to print. */
export function SpiritCardView({ card, onOpen }: { card: SpiritCard; onOpen?: (key: string) => void }) {
  const met = card.held > 0;
  return (
    <Pressable
      onPress={met && onOpen ? () => onOpen(card.key) : undefined}
      accessibilityRole={met && onOpen ? 'button' : undefined}
      accessibilityLabel={met
        ? `${t(card.name!)}, ${t(card.creature!)}`
        : t({
          en: `Not yet met. ${t(RARITY_LABEL[card.rarity])}, ${t(COURT_LABEL[card.court])} court.`,
          th: `ยังไม่ได้พบ ${t(RARITY_LABEL[card.rarity])} สำนัก${t(COURT_LABEL[card.court])}`,
          zh: `尚未遇见。${t(RARITY_LABEL[card.rarity])}，${t(COURT_LABEL[card.court])}宗。`,
        })}
      style={[met ? gameShadow.lift : shadow.sm, {
        width: '31%', minWidth: 104, backgroundColor: color.surface, borderRadius: gameRadius.panel,
        borderWidth: met ? 2 : 1, borderColor: met ? RARITY_TINT[card.rarity] : color.neutral300,
        padding: 10, alignItems: 'center', gap: 4, opacity: met ? 1 : 0.72,
      }]}
    >
      {met && card.form
        ? <MascotMark mascot={card.form} size={56} />
        : <Unmet tint={RARITY_TINT[card.rarity]} />}
      <Heading size={13} style={{ textAlign: 'center' }}>{met ? t(card.name!) : '???'}</Heading>
      <Label size={9} tracking={0.08} colour={color.neutral700} style={{ textAlign: 'center', textTransform: 'none' }}>
        {met ? t(card.creature!) : t(COURT_LABEL[card.court])}
      </Label>
      <RarityPill rarity={card.rarity} />
      {card.held > 1 ? (
        <Label size={9} tracking={0.1} colour={color.neutral600}>{`×${card.held}`}</Label>
      ) : null}
    </Pressable>
  );
}

function FashionCardView({ card }: { card: FashionCard }) {
  const owned = card.held > 0;
  return (
    <View
      accessible
      accessibilityLabel={owned
        ? `${t(card.name)}, ${t(RARITY_LABEL[card.rarity])}`
        : t({ en: `Locked fashion, ${t(RARITY_LABEL[card.rarity])}`, th: `แฟชั่นยังล็อก ระดับ${t(RARITY_LABEL[card.rarity])}`, zh: `未解锁时装，${t(RARITY_LABEL[card.rarity])}` })}
      style={[owned ? gameShadow.lift : shadow.sm, {
        width: '31%', minWidth: 104, backgroundColor: color.surface, borderRadius: gameRadius.panel,
        borderWidth: owned ? 2 : 1, borderColor: owned ? RARITY_TINT[card.rarity] : color.neutral300,
        padding: 10, alignItems: 'center', gap: 5, opacity: owned ? 1 : 0.64,
      }]}
    >
      <View style={{ width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: owned ? '#DDF3F8' : '#D9E0E5' }}>
        <Shirt size={26} color={owned ? '#0E7E9E' : '#667782'} strokeWidth={2} />
      </View>
      <Heading size={13} style={{ textAlign: 'center' }}>{owned ? t(card.name) : 'LOCKED'}</Heading>
      <RarityPill rarity={card.rarity} />
      {card.held > 1 ? <Label size={9} tracking={0.1} colour={color.neutral600}>{`×${card.held}`}</Label> : null}
    </View>
  );
}

/** The silhouette. Deliberately one shape for all of them: it says nothing. */
function Unmet({ tint }: { tint: string }) {
  return (
    <View
      style={{
        width: 56, height: 56, borderRadius: 28, backgroundColor: `${tint}22`,
        alignItems: 'center', justifyContent: 'center',
      }}
    >
      <Sparkles size={22} color={tint} strokeWidth={1.6} />
    </View>
  );
}

/**
 * The whole published table, printed.
 *
 * Exported for the same reason `SpiritCardView` is: what this panel says is
 * the product's promise about a draw, and a test holds it to the numbers the
 * server handed it rather than to a screenshot somebody took once.
 */
export function RulesPanel({ rules }: { rules: SummonState['rules'] }) {
  return (
    <Tray style={{ marginHorizontal: gutter, marginTop: 10, borderRadius: gameRadius.panel }}>
      <View style={{ gap: 10 }}>
        <TrayLine>
          {t({ en: 'Published base drop rates', th: 'อัตราสุ่มพื้นฐานที่ประกาศไว้', zh: '公布的基础掉落概率' })}
        </TrayLine>
        {RARITIES.map((r) => (
          <View key={r} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 86 }}><RarityPill rarity={r} /></View>
            {/*
              A ROW, not a bare flex:1 box. `GameBar` is `{ flex: 1, height }`,
              and flex:1 inside a COLUMN parent grows the height from a basis
              of zero - so the bar laid out 178px wide and 0px tall, and the
              published odds had no bars at all. Found in the browser, not by
              a test: the tree was correct and the layout was not.
            */}
            <View style={{ flex: 1, flexDirection: 'row' }}><GameBar pct={rules.rates[r]} height={8} /></View>
            <Label size={10} tracking={0.06} colour={gameTray.text}>{`${rules.rates[r]}%`}</Label>
          </View>
        ))}
        <Body size={13} style={{ color: gameTray.muted }}>
          {t({
            en: `Guaranteed: a rare within ${rules.pity.rare} summons, a mythic within ${rules.pity.mythic}. `
              + 'There is no other weighting — these numbers are the whole of it.',
            th: `รับประกัน: ได้ระดับหายากภายใน ${rules.pity.rare} ครั้ง และระดับเทพภายใน ${rules.pity.mythic} ครั้ง `
              + 'ไม่มีการถ่วงน้ำหนักอื่นใด ตัวเลขเหล่านี้คือทั้งหมด',
            zh: `保底：${rules.pity.rare} 次召唤内必出稀有，${rules.pity.mythic} 次内必出传说。`
              + '没有其他权重 — 这些数字就是全部。',
          })}
        </Body>
        <Body size={13} style={{ color: gameTray.muted }}>
          {t({
            en: 'Pity guarantees are applied separately and can only lift a result.',
            th: 'ระบบการันตีทำงานแยกจากอัตราพื้นฐาน และจะยกระดับผลลัพธ์เท่านั้น',
            zh: '保底机制与基础概率分开计算，并且只会提升结果。',
          })}
        </Body>
        <Body size={13} style={{ color: gameTray.muted }}>
          {t({
            en: `A duplicate becomes stardust (${RARITIES.map((r) => `${t(RARITY_LABEL[r])} ${rules.dustFromDuplicate[r]}`).join(', ')}), `
              + `and stardust buys any spirit outright (${RARITIES.map((r) => `${t(RARITY_LABEL[r])} ${rules.dustToForge[r]}`).join(', ')}) — `
              + 'so nothing in the collection is behind luck alone.',
            th: `ตัวซ้ำจะกลายเป็นผงดาว (${RARITIES.map((r) => `${t(RARITY_LABEL[r])} ${rules.dustFromDuplicate[r]}`).join(', ')}) `
              + `และผงดาวใช้แลกภูตตัวใดก็ได้โดยตรง (${RARITIES.map((r) => `${t(RARITY_LABEL[r])} ${rules.dustToForge[r]}`).join(', ')}) — `
              + 'จึงไม่มีอะไรในคอลเลกชันที่ขึ้นกับโชคเพียงอย่างเดียว',
            zh: `重复的精灵会化为星尘（${RARITIES.map((r) => `${t(RARITY_LABEL[r])} ${rules.dustFromDuplicate[r]}`).join(', ')}），`
              + `星尘可以直接兑换任意精灵（${RARITIES.map((r) => `${t(RARITY_LABEL[r])} ${rules.dustToForge[r]}`).join(', ')}） — `
              + '所以收藏里没有任何一样东西只靠运气。',
          })}
        </Body>
      </View>
    </Tray>
  );
}

/**
 * One of the two buttons at the box.
 *
 * Dimensional, because the mockup asks for a game surface, and still a plain
 * accessible control underneath: a `button` role, a localized label that says
 * the price out loud, and a disabled state announced rather than only
 * greyed - the price is the whole decision and it cannot be carried by
 * colour and shadow alone.
 */
function PullButton({
  tone, title, cost, affordable, busy, locked, onPress,
}: {
  tone: 'teal' | 'gold';
  title: string;
  cost: number;
  affordable: boolean;
  busy: boolean;
  locked: boolean;
  onPress: () => void;
}) {
  const gold = tone === 'gold';
  const off = !affordable || locked;
  const priced = t({
    en: `${title}, ${formatInteger(cost)} Trip Points`,
    th: `${title} ${formatInteger(cost)} แต้มทริป`,
    zh: `${title}，${formatInteger(cost)} 旅行积分`,
  });
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityState={{ disabled: off, busy }}
      accessibilityLabel={affordable
        ? priced
        : t({
          en: `${priced}. Not enough Trip Points yet.`,
          th: `${priced} แต้มทริปยังไม่พอ`,
          zh: `${priced}。旅行积分还不够。`,
        })}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 72,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
        paddingHorizontal: 12,
        paddingVertical: 12,
        borderRadius: 20,
        borderWidth: 3,
        borderColor: off ? '#9FB4C2' : (gold ? '#FFE7A3' : '#7FE3E0'),
        backgroundColor: off ? '#C9D7E0' : (gold ? '#E8A72A' : '#0E7E9E'),
        opacity: pressed ? 0.92 : 1,
        shadowColor: gold ? '#7A4E05' : '#063E54',
        shadowOffset: { width: 0, height: 5 },
        shadowOpacity: off ? 0.1 : 0.3,
        shadowRadius: 8,
        elevation: off ? 1 : 5,
      })}
    >
      <Heading size={17} colour={off ? '#4C606D' : '#FFFFFF'}>{title}</Heading>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, paddingVertical: 3, borderRadius: 11, backgroundColor: off ? 'rgba(255,255,255,0.45)' : 'rgba(4,34,50,0.35)' }}>
        <Flag size={13} color={off ? '#4C606D' : '#BFF1FF'} strokeWidth={2.4} />
        <Label size={11} tracking={0} colour={off ? '#4C606D' : '#FFFFFF'} style={{ textTransform: 'none' }}>
          {t({
            en: `${formatInteger(cost)} Trip Points`,
            th: `${formatInteger(cost)} แต้มทริป`,
            zh: `${formatInteger(cost)} 旅行积分`,
          })}
        </Label>
      </View>
      {busy ? (
        <Label size={9} tracking={0.08} colour="#FFFFFF">{t({ en: 'DRAWING', th: 'กำลังสุ่ม', zh: '抽取中' })}</Label>
      ) : null}
    </Pressable>
  );
}

/** A figure the traveller carries, on a capsule. Trip Points, and stardust. */
function Chip({
  icon: Icon, label, figure, tone,
}: { icon: LucideIcon; label: string; figure: number; tone: 'teal' | 'gold' }) {
  const gold = tone === 'gold';
  return (
    <View
      accessible
      accessibilityLabel={`${formatInteger(figure)} ${label}`}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 7,
        paddingHorizontal: 13, paddingVertical: 7,
        borderRadius: 18, borderWidth: 2,
        borderColor: gold ? '#F2CE6A' : '#6FD8E6',
        backgroundColor: 'rgba(255,255,255,0.92)',
        shadowColor: '#073454', shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.13, shadowRadius: 7, elevation: 3,
      }}
    >
      <Icon size={15} color={gold ? '#D39A13' : '#0898B5'} strokeWidth={2.3} />
      <Label size={10} tracking={0.04} colour="#406276" style={{ textTransform: 'none' }}>{label}</Label>
      <Heading size={14} colour="#082F58">{formatInteger(figure)}</Heading>
    </View>
  );
}

type RewardCategory = 'mascot' | 'fashion';

/** The tabs filter the preview only; every pull still draws from the whole published box. */
function RewardTabs({
  value, onChange,
}: { value: RewardCategory; onChange: (next: RewardCategory) => void }) {
  return (
    <View
      style={{
        flexDirection: 'row', alignSelf: 'center', width: '100%', maxWidth: 520,
        padding: 5, borderRadius: 24, borderWidth: 2, borderColor: '#8ED7E5',
        backgroundColor: 'rgba(247,253,255,0.92)',
        shadowColor: '#073454', shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15, shadowRadius: 9, elevation: 3,
      }}
    >
      {(['mascot', 'fashion'] as const).map((kind) => {
        const active = kind === value;
        const Icon = kind === 'mascot' ? Sparkles : Shirt;
        const title = kind === 'mascot' ? 'Mascot' : 'Fashion';
        return (
          <Pressable
            key={kind}
            onPress={() => onChange(kind)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={t({
              en: `${title} reward preview`,
              th: `ดูตัวอย่างรางวัล ${title}`,
              zh: `${title} 奖励预览`,
            })}
            style={({ pressed }) => ({
              flex: 1, minHeight: 52, borderRadius: 19,
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9,
              backgroundColor: active ? '#069CAB' : 'transparent',
              borderWidth: active ? 2 : 0,
              borderColor: active ? '#F4D36D' : 'transparent',
              opacity: pressed ? 0.88 : 1,
              shadowColor: active ? '#07506B' : 'transparent',
              shadowOffset: { width: 0, height: 4 }, shadowOpacity: active ? 0.28 : 0,
              shadowRadius: 7, elevation: active ? 4 : 0,
            })}
          >
            <Icon size={21} color={active ? '#FFFFFF' : '#123E68'} strokeWidth={2.3} />
            <Heading size={18} colour={active ? '#FFFFFF' : '#123E68'}>{title}</Heading>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * The box itself, rendered as one bundled illustration rather than a stack
 * of circles. Keeping it in the app means the hero remains available offline.
 *
 * The Pet & Style machine makes the two reward families visible without
 * pretending to reveal the next result. While the server works it gives one
 * short, physical shake and glow — never a spinning reel, flashing light or
 * near-miss. The server remains the only source of the actual draw.
 */
function TheBox({ busy, wide }: { busy: boolean; wide: boolean }) {
  const machineWidth = wide ? 340 : 224;
  const still = useReduceMotion();
  const motion = React.useRef(new Animated.Value(0)).current;
  const charge = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    motion.stopAnimation();
    charge.stopAnimation();
    if (still) {
      motion.setValue(0);
      charge.setValue(busy ? 1 : 0);
      return undefined;
    }
    if (!busy) {
      charge.setValue(0);
      const idle = Animated.loop(Animated.sequence([
        Animated.timing(motion, { toValue: 0.16, duration: 1_800, easing: Easing.inOut(Easing.sin), useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(motion, { toValue: -0.12, duration: 2_100, easing: Easing.inOut(Easing.sin), useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(motion, { toValue: 0, duration: 1_700, easing: Easing.inOut(Easing.sin), useNativeDriver: Platform.OS !== 'web' }),
      ]));
      idle.start();
      return () => idle.stop();
    }
    charge.setValue(0);
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(motion, { toValue: 1, duration: 110, easing: Easing.out(Easing.quad), useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(motion, { toValue: -1, duration: 160, easing: Easing.inOut(Easing.quad), useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(motion, { toValue: 0.55, duration: 130, easing: Easing.inOut(Easing.quad), useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(motion, { toValue: 0, duration: 150, easing: Easing.out(Easing.quad), useNativeDriver: Platform.OS !== 'web' }),
      Animated.delay(260),
    ]));
    loop.start();
    Animated.timing(charge, {
      toValue: 1, duration: MINIMUM_DRAW_MS - 120,
      easing: Easing.inOut(Easing.cubic), useNativeDriver: Platform.OS !== 'web',
    }).start();
    return () => { loop.stop(); charge.stopAnimation(); };
  }, [busy, charge, motion, still]);

  const shake = motion.interpolate({ inputRange: [-1, 0, 1], outputRange: ['-3.2deg', '0deg', '3.2deg'] });
  const swell = motion.interpolate({ inputRange: [-1, 0, 1], outputRange: [1.035, 1, 1.065] });
  const halo = motion.interpolate({ inputRange: [-1, 0, 1], outputRange: [0.38, 0.16, 0.62] });
  const sparkleScale = motion.interpolate({ inputRange: [-1, 0, 1], outputRange: [0.72, 1, 1.32] });
  return (
    <View
      accessible
      accessibilityLabel={t({
        en: 'The traveller’s box. What is inside is not shown until it is drawn.',
        th: 'ตู้สุ่มนักเดินทาง ข้างในจะยังไม่ถูกเปิดเผยจนกว่าจะสุ่มได้',
        zh: '旅人扭蛋机。抽到之前不会显示里面是什么。',
      })}
      style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: wide ? 8 : 2, position: 'relative' }}
    >
      {busy ? (
        <>
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute', width: machineWidth * 0.94, height: machineWidth * 0.94,
              borderRadius: machineWidth, backgroundColor: '#FFF1A8', opacity: still ? 0.24 : halo,
              shadowColor: '#FFD75E', shadowOpacity: 0.95, shadowRadius: 34,
              transform: [{ scale: still ? 1 : swell }],
            }}
          />
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute', width: machineWidth * 1.04, height: machineWidth * 1.04,
              borderRadius: machineWidth, borderWidth: 4, borderColor: '#FFE37D',
              opacity: still ? 0.48 : halo,
              transform: [{ scale: still ? 1 : sparkleScale }],
            }}
          />
          <Animated.View pointerEvents="none" style={{ position: 'absolute', top: '18%', left: '13%', opacity: still ? 0.8 : halo, transform: [{ scale: still ? 1 : sparkleScale }, { rotate: '-14deg' }] }}>
            <Sparkles size={wide ? 34 : 26} color="#FFF2A6" strokeWidth={2.4} />
          </Animated.View>
          <Animated.View pointerEvents="none" style={{ position: 'absolute', top: '28%', right: '11%', opacity: still ? 0.8 : halo, transform: [{ scale: still ? 1 : sparkleScale }, { rotate: '18deg' }] }}>
            <Sparkles size={wide ? 30 : 23} color="#FFFFFF" strokeWidth={2.4} />
          </Animated.View>
        </>
      ) : null}
      <Animated.View
        style={{
          width: machineWidth, height: machineWidth * 1.5,
          opacity: 1,
          transform: !still ? [{ rotate: shake }, { scale: swell }] : [{ scale: 1 }],
        }}
      >
        <Image
          source={summonPetStyleMachine}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
          style={{ width: '100%', height: '100%' }}
        />
      </Animated.View>
      {busy ? (
        <View style={{ position: 'absolute', bottom: wide ? 26 : 12, alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 18, borderWidth: 2, borderColor: '#FFE18A', backgroundColor: 'rgba(8,47,88,0.94)' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
            <Sparkles size={15} color="#FFE18A" strokeWidth={2.2} />
            <Label size={10} tracking={0.08} colour="#FFFFFF">
              {t({ en: 'OPENING THE BOX', th: 'กำลังเปิดตู้สุ่ม', zh: '正在开启' })}
            </Label>
          </View>
          <View style={{ width: 112, height: 4, borderRadius: 2, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.24)' }}>
            <Animated.View style={{ width: '100%', height: '100%', borderRadius: 2, backgroundColor: '#FFE37D', transform: [{ scaleX: charge }] }} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

/**
 * The headline entries, and the honesty rule they have to survive.
 *
 * A spirit nobody has met is a SILHOUETTE with its rarity and its court and
 * no name — the same rule the guide follows, and it cannot be relaxed here
 * just because this panel is the one trying to be attractive. A featured
 * grid of named mythics nobody owns would be showing the reader creatures
 * the box has not given them, which is the shape of a near-miss.
 *
 * Fashion is named, because a costume has nothing to withhold.
 */
function Featured({
  spirits, fashion, category,
}: { spirits: SpiritCard[]; fashion: FashionCard[]; category: RewardCategory }) {
  const featuredSpirits = [...spirits]
    .sort((a, b) => RARITY_ORDER[b.rarity] - RARITY_ORDER[a.rarity])
    .slice(0, category === 'mascot' ? 2 : 1);
  const featuredFashion = [...fashion]
    .sort((a, b) => RARITY_ORDER[b.rarity] - RARITY_ORDER[a.rarity])
    .slice(0, category === 'fashion' ? 3 : 2);
  // Banners are independent: the preview must show only what the selected
  // pull can actually return.
  const top = category === 'mascot' ? featuredSpirits : featuredFashion;
  if (top.length === 0) return null;

  return (
    <View style={{ gap: 9 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9 }}>
        {top.map((entry) => {
          const spirit = 'court' in entry ? entry : null;
          const met = spirit ? spirit.held > 0 : true;
          const rarity = entry.rarity;
          const gold = rarity === 'mythic';
          return (
            <View
              key={entry.key}
              accessible
              accessibilityLabel={spirit && !met
                ? t({
                  en: `Not yet met. ${t(RARITY_LABEL[rarity])}, ${t(COURT_LABEL[spirit.court])} court.`,
                  th: `ยังไม่ได้พบ ${t(RARITY_LABEL[rarity])} สำนัก${t(COURT_LABEL[spirit.court])}`,
                  zh: `尚未遇见。${t(RARITY_LABEL[rarity])}，${t(COURT_LABEL[spirit.court])}宗。`,
                })
                : `${t(spirit ? spirit.name! : (entry as FashionCard).name)}, ${t(RARITY_LABEL[rarity])}`}
              style={{
                width: '47.5%', minWidth: 132, flexGrow: 1,
                alignItems: 'center', justifyContent: 'center', gap: 5,
                paddingVertical: 13, paddingHorizontal: 9,
                borderRadius: 18, borderWidth: 3,
                borderColor: gold ? '#FFE9A8' : '#9ED8E8',
                backgroundColor: gold ? '#F3C44D' : '#EAF8FC',
                shadowColor: gold ? '#8A5B06' : '#0B5A74',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: gold ? 0.3 : 0.16,
                shadowRadius: 8,
                elevation: gold ? 5 : 2,
              }}
            >
              {spirit
                ? (met && spirit.form
                  ? <MascotMark mascot={spirit.form} size={52} />
                  : <Unmet tint={RARITY_TINT[rarity]} />)
                : (
                  <View style={{ width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(14,126,158,0.12)' }}>
                    <Shirt size={26} color="#0E7E9E" strokeWidth={2} />
                  </View>
                )}
              <Heading size={13} colour={gold ? '#4A3105' : '#07335A'} style={{ textAlign: 'center' }}>
                {spirit
                  ? (met ? t(spirit.name!) : '???')
                  : t((entry as FashionCard).name)}
              </Heading>
              <RarityPill rarity={rarity} />
            </View>
          );
        })}
      </View>
    </View>
  );
}

const RARITY_ORDER: Record<SpiritRarity, number> = { common: 0, uncommon: 1, rare: 2, mythic: 3 };

/**
 * The rates, in one line, and the floor that backs them.
 *
 * The EFFECTIVE table, never the roll band: the right-hand column of
 * docs/68's two tables is the one printed above a button, because a rate
 * shown next to a price is a promise about what will happen. `RulesPanel`
 * below still prints both in full, for a reader who wants to follow the
 * arithmetic.
 */
function RatesAndFloor({ s, category }: { s: SummonState; category: RewardCategory }) {
  const pity = s.banners?.[category]?.pity ?? s.pity;
  const toRare = Math.max(0, s.rules.pity.rare - pity.sinceRare);
  const toMythic = Math.max(0, s.rules.pity.mythic - pity.sinceMythic);
  return (
    <View style={{ gap: 9 }}>
      <View
        style={{
          flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center',
          gap: 8, paddingHorizontal: 12, paddingVertical: 9,
          borderRadius: 15, borderWidth: 2, borderColor: '#9ED8E8', backgroundColor: '#EAF8FC',
        }}
      >
        {RARITIES.map((rarity) => (
          <View key={rarity} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <View style={{ width: 9, height: 9, borderRadius: 2, backgroundColor: RARITY_TINT[rarity], transform: [{ rotate: '45deg' }] }} />
            <Label size={10} tracking={0} colour="#2A5068" style={{ textTransform: 'none' }}>
              {`${t(RARITY_LABEL[rarity])} ${s.rules.rates[rarity]}%`}
            </Label>
          </View>
        ))}
      </View>

      {/* The nearer floor, as a bar. Both numbers are printed, not just drawn. */}
      <View
        accessible
        accessibilityLabel={t({
          en: `A rare is guaranteed within ${toRare} pulls, a mythic within ${toMythic}.`,
          th: `รับประกันระดับหายากภายใน ${toRare} ครั้ง ระดับเทพภายใน ${toMythic} ครั้ง`,
          zh: `${toRare} 次内必出稀有，${toMythic} 次内必出传说。`,
        })}
        style={{ gap: 6, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 15, borderWidth: 2, borderColor: '#2A5278', backgroundColor: '#123E68' }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <Label size={10} tracking={0.04} colour="#CFE2EE" style={{ textTransform: 'none' }}>
            {t({
              en: `${toRare} more for a guaranteed ${t(RARITY_LABEL.rare)}`,
              th: `อีก ${toRare} ครั้ง การันตี${t(RARITY_LABEL.rare)}`,
              zh: `再 ${toRare} 次必出${t(RARITY_LABEL.rare)}`,
            })}
          </Label>
          <Label size={10} tracking={0.04} colour="#9AB7CA" style={{ textTransform: 'none' }}>
            {t({
              en: `${toMythic} for a ${t(RARITY_LABEL.mythic)}`,
              th: `${toMythic} ครั้ง การันตี${t(RARITY_LABEL.mythic)}`,
              zh: `${toMythic} 次必出${t(RARITY_LABEL.mythic)}`,
            })}
          </Label>
        </View>
        <GameBar pct={(pity.sinceRare / Math.max(1, s.rules.pity.rare)) * 100} height={9} />
      </View>
    </View>
  );
}

/** The last few that came out, smallest possible: a mark and its rarity. */
function RecentPulls({ history }: { history: SummonReceipt[] }) {
  const recent = history.slice(0, 5);
  if (recent.length === 0) return null;
  return (
    <View style={{ gap: 7, paddingTop: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
        <Gift size={15} color="#C78B13" strokeWidth={2.2} />
        <Label size={10} tracking={0.08} colour="#2A5068">
          {t({ en: 'Latest from the box', th: 'รางวัลล่าสุด', zh: '最近抽到' })}
        </Label>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
        {recent.map((r) => (
          <View
            key={r.id}
            accessible
            accessibilityLabel={`${t(RARITY_LABEL[r.rarity])}${r.duplicate ? `, ${t({ en: 'a duplicate', th: 'ตัวซ้ำ', zh: '重复' })}` : ''}`}
            style={{
              width: 48, height: 48, borderRadius: 14,
              alignItems: 'center', justifyContent: 'center',
              borderWidth: 2, borderColor: RARITY_TINT[r.rarity],
              backgroundColor: r.rarity === 'mythic' ? '#FBEFD2' : '#FFFFFF',
              opacity: r.duplicate ? 0.65 : 1,
            }}
          >
            <Sparkles size={19} color={RARITY_TINT[r.rarity]} strokeWidth={1.9} />
          </View>
        ))}
      </View>
    </View>
  );
}

export function SummonScreen({ onBack }: { onBack: () => void }) {
  const requireAccount = useRequireAccount();
  const state = useAsync(() => api.summon(), []);
  const guide = useAsync(() => api.spirits(), []);
  const history = useAsync(() => api.summonHistory(), []);
  const { width } = useWindowDimensions();
  const wide = width >= 960;
  const [previewCategory, setPreviewCategory] = React.useState<RewardCategory>('mascot');
  const [pulling, setPulling] = React.useState<1 | 10 | null>(null);
  const [last, setLast] = React.useState<SummonResult[]>([]);
  const [lastPull, setLastPull] = React.useState<PullResult | null>(null);
  const [revealOpen, setRevealOpen] = React.useState(false);
  const [toast, setToast] = React.useState<string | null>(null);
  const pendingRequest = React.useRef<{ signature: string; key: string } | null>(null);
  const reduceMotion = useReduceMotion();

  const pull = React.useCallback(async (pulls: 1 | 10) => {
    if (requireAccount({ en: 'Please sign in or create an account to collect a spirit.', th: 'กรุณาสมัครสมาชิกหรือเข้าสู่ระบบเพื่อรับมาสคอต', zh: '请先登录或注册账号，才能收集精灵。' })) return;
    setPulling(pulls);
    setToast(null);
    playCue('machine');
    const startedAt = Date.now();
    const signature = `${previewCategory}:${pulls}`;
    if (pendingRequest.current?.signature !== signature) {
      pendingRequest.current = { signature, key: newGachaIdempotencyKey() };
    }
    const res = await api.pull(previewCategory, pulls, pendingRequest.current.key);
    if (!res.ok) {
      if (res.code !== 'NETWORK' && res.code !== 'TIMEOUT') pendingRequest.current = null;
      setPulling(null); setToast(res.error); return;
    }
    pendingRequest.current = null;
    // Static demo builds before the multi-pull API returned one SummonResult
    // directly. Accept that envelope as well so the reveal stage cannot turn
    // a successful draw into an error screen while old demos are still live.
    const payload = res.data as PullResult | SummonResult;
    const results = 'results' in payload ? payload.results : [payload];
    // A demo response often arrives in one frame. Without this floor the
    // busy state begins and ends before the display paints, so the animation
    // technically runs but nobody can see it. A slow network adds no delay;
    // only a fast response is held until the physical box performance ends.
    if (!reduceMotion && results.length > 0) {
      await wait(Math.max(0, MINIMUM_DRAW_MS - (Date.now() - startedAt)));
    }
    if (results.some((result) => result.rarity === 'mythic')) playCue('mythic');
    else if (results.some((result) => result.rarity === 'rare')) playCue('rare');
    setPulling(null);
    setLast(results);
    setLastPull('results' in payload ? payload : null);
    setRevealOpen(results.length > 0);
    if (results.some((result) => result.isNew)) announceTravelReward();
    state.reload();
    guide.reload();
    history.reload();
  }, [state, guide, history, reduceMotion, requireAccount, previewCategory]);

  if (state.loading && !state.data) return <LoadingState label={t({ en: 'The summoning', th: 'การอัญเชิญ', zh: '召唤' })} />;
  if (state.error && !state.data) return <ErrorState message={state.error} onRetry={state.reload} />;
  const s = state.data!;
  const activeBanner = s.banners?.[previewCategory] ?? {
    pity: s.pity, collected: s.collected, total: s.total, active: s.total,
  };

  return (
    <>
    <ScrollView style={{ flex: 1, backgroundColor: '#DDF3FC' }} showsVerticalScrollIndicator={false}>
      {/*
        THE HEADER, and the two figures a pull depends on.

        Deep navy under a gold rule, the same capsule My Backpack wears, so
        the two screens that hold what a traveller owns read as one place.
        The figures are up here because the price is on the buttons below:
        somebody deciding whether to tap needs both numbers in one glance.
      */}
      <ImageBackground
        source={travelHero}
        resizeMode="cover"
        imageStyle={{ opacity: 0.34 }}
        style={{
          paddingHorizontal: wide ? 28 : gutter, paddingTop: 16, paddingBottom: 18, marginBottom: 4,
          backgroundColor: '#9FE5F1',
          borderBottomLeftRadius: 26, borderBottomRightRadius: 26, overflow: 'hidden',
          borderBottomWidth: 3, borderBottomColor: '#E8B943',
        }}
      >
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(182,239,247,0.56)' }} />
        <View style={{ flexDirection: wide ? 'row' : 'column', alignItems: wide ? 'center' : 'stretch', justifyContent: 'space-between', gap: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: wide ? 1 : undefined }}>
            <IconButton inverted onPress={onBack} accessibilityLabel={t(strings.common.back)}>
              <ChevronLeft size={20} color="#FFFFFF" strokeWidth={2} />
            </IconButton>
            <View style={{ width: 50, height: 50, borderRadius: 17, borderWidth: 2, borderColor: '#F4D06B', backgroundColor: '#087F96', alignItems: 'center', justifyContent: 'center' }}>
              <Compass size={27} color="#FFE08B" strokeWidth={2.2} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Heading size={wide ? 30 : 21} tracking={-0.5} colour="#082F58">
                {t({ en: 'The traveller’s box', th: 'ตู้สุ่มนักเดินทาง', zh: '旅人扭蛋机' })}
              </Heading>
              <Body size={wide ? 14 : 13} style={{ color: '#315B70', marginTop: 2 }}>
                {t({
                  en: 'Choose a Mascot or Fashion banner for the next adventure.',
                  th: 'เลือกตู้มาสคอตหรือแฟชั่นสำหรับการผจญภัยครั้งใหม่',
                  zh: '为下一场冒险选择伙伴或时装卡池。',
                })}
              </Body>
            </View>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9, justifyContent: wide ? 'flex-end' : 'flex-start' }}>
            <Chip icon={Flag} tone="teal" label={t(strings.common.tripPoints)} figure={s.tripPoints} />
            <Chip icon={Sparkles} tone="gold" label={t({ en: 'Stardust', th: 'ผงดาว', zh: '星尘' })} figure={s.dust} />
          </View>
        </View>
      </ImageBackground>

      {/*
        THE DASHBOARD: the box on one side, what it holds on the other.

        Two columns once there is room for them, stacked below 900px with the
        box first - on a phone the machine is the thing somebody came to tap,
        and the rates read better underneath it than above it.
      */}
      <View style={{ width: '100%', maxWidth: 1320, alignSelf: 'center', paddingBottom: 8 }}>
        <View style={{ flexDirection: wide ? 'row' : 'column', gap: 18, paddingHorizontal: wide ? 24 : gutter, paddingTop: 18 }}>
          <ImageBackground
            source={travelHero}
            resizeMode="cover"
            imageStyle={{ borderRadius: 27, opacity: 0.72 }}
            style={{
              flex: wide ? 1.08 : undefined, minWidth: 0, minHeight: wide ? 615 : undefined,
              borderRadius: 27, borderWidth: 3, borderColor: '#0D4D73', overflow: 'hidden',
              backgroundColor: '#8FE0EA',
              shadowColor: '#082E53', shadowOffset: { width: 0, height: 7 },
              shadowOpacity: 0.2, shadowRadius: 14, elevation: 5,
            }}
          >
            <View pointerEvents="none" style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(195,245,249,0.35)' }} />
            <View style={{ flex: 1, padding: wide ? 18 : 12, gap: 11, justifyContent: 'space-between' }}>
              <RewardTabs value={previewCategory} onChange={setPreviewCategory} />
              <TheBox busy={pulling !== null} wide={wide} />
              <View style={{ padding: 12, borderRadius: 20, borderWidth: 2, borderColor: 'rgba(255,255,255,0.88)', backgroundColor: 'rgba(247,253,255,0.9)' }}>
                <RecentPulls history={history.data?.summons ?? []} />
                {history.data?.summons.length ? null : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Gift size={16} color="#C78B13" strokeWidth={2.2} />
                    <Label size={10} tracking={0.05} colour="#315B70" style={{ textTransform: 'none' }}>
                      {t({ en: 'Your latest rewards will appear here.', th: 'รางวัลล่าสุดของคุณจะแสดงที่นี่', zh: '你最近获得的奖励会显示在这里。' })}
                    </Label>
                  </View>
                )}
              </View>
            </View>
          </ImageBackground>

          <View
            style={{
              flex: wide ? 1 : undefined, minWidth: 0, minHeight: wide ? 615 : undefined,
              paddingHorizontal: wide ? 18 : 13, paddingTop: 18, paddingBottom: 16,
              borderRadius: 27, borderWidth: 3, borderColor: '#0D4D73', backgroundColor: 'rgba(247,253,255,0.96)',
              shadowColor: '#082E53', shadowOffset: { width: 0, height: 7 },
              shadowOpacity: 0.18, shadowRadius: 14, elevation: 5, gap: 12,
            }}
          >
            <View style={{ alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 18, paddingVertical: 9, borderRadius: 20, borderWidth: 2, borderColor: '#E8B943', backgroundColor: '#0E3A63' }}>
              <Gift size={18} color="#F6CF61" strokeWidth={2.2} />
              <Heading size={wide ? 20 : 17} colour="#FFFFFF">{t({ en: 'Featured rewards', th: 'รางวัลเด่น', zh: '精选奖励' })}</Heading>
            </View>
            <Featured
              spirits={guide.data?.spirits ?? []}
              fashion={guide.data?.fashion ?? []}
              category={previewCategory}
            />
            <RatesAndFloor s={s} category={previewCategory} />

            {/* The server owns both prices; the screen only presents them. */}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 'auto' }}>
              <PullButton
                tone="teal"
                title={t({ en: 'Pull once', th: 'สุ่ม 1 ครั้ง', zh: '抽 1 次' })}
                cost={s.price.one}
                affordable={s.tripPoints >= s.price.one}
                busy={pulling === 1}
                locked={pulling !== null}
                onPress={() => { void pull(1); }}
              />
              <PullButton
                tone="gold"
                title={t({ en: `Pull ${s.price.tenSize}`, th: `สุ่ม ${s.price.tenSize} ครั้ง`, zh: `抽 ${s.price.tenSize} 次` })}
                cost={s.price.ten}
                affordable={s.tripPoints >= s.price.ten}
                busy={pulling === 10}
                locked={pulling !== null}
                onPress={() => { void pull(10); }}
              />
            </View>

            <Label size={10} tracking={0.03} colour="#315B70" style={{ textTransform: 'none', textAlign: 'center' }}>
              {t({
                en: 'Paid with Trip Points earned from missions. Never with money, and never with Green Points. No real-money purchase is available.',
                th: 'ใช้แต้มทริปที่ได้จากภารกิจ ไม่มีการซื้อด้วยเงินจริง และใช้แต้มสีเขียวไม่ได้',
                zh: '使用任务获得的旅行积分。不能用真钱购买，也不能使用绿色积分。',
              })}
            </Label>
            {toast ? <Body size={13} style={{ color: color.neutral800 }}>{toast}</Body> : null}
          </View>
        </View>
      </View>

      {last.map((result) => <Outcome key={result.id} result={result} />)}

      {/* How far each floor is. Printed because it is published. */}
      <Tray style={{ marginHorizontal: gutter, marginTop: 12, borderRadius: gameRadius.panel }}>
        <View style={{ gap: 8 }}>
          <TrayLine>{t({ en: `Collected ${activeBanner.collected} of ${activeBanner.total}`, th: `สะสมแล้ว ${activeBanner.collected} จาก ${activeBanner.total}`, zh: `已收集 ${activeBanner.collected} / ${activeBanner.total}` })}</TrayLine>
          <View style={{ flexDirection: 'row' }}>
            <GameBar pct={(activeBanner.collected / Math.max(1, activeBanner.total)) * 100} height={10} />
          </View>
          <Label size={10} tracking={0.06} colour={gameTray.muted}>
            {t({
              en: `A rare is guaranteed in ${Math.max(0, s.rules.pity.rare - activeBanner.pity.sinceRare)}`
                + ` · a mythic in ${Math.max(0, s.rules.pity.mythic - activeBanner.pity.sinceMythic)}`,
              th: `รับประกันระดับหายากในอีก ${Math.max(0, s.rules.pity.rare - activeBanner.pity.sinceRare)} ครั้ง`
                + ` · ระดับเทพในอีก ${Math.max(0, s.rules.pity.mythic - activeBanner.pity.sinceMythic)} ครั้ง`,
              zh: `再 ${Math.max(0, s.rules.pity.rare - activeBanner.pity.sinceRare)} 次必出稀有`
                + ` · 再 ${Math.max(0, s.rules.pity.mythic - activeBanner.pity.sinceMythic)} 次必出传说`,
            })}
          </Label>
        </View>
      </Tray>

      <RulesPanel rules={s.rules} />

      {/* The commitment, in full. It is the whole claim this screen makes. */}
      <View style={{ paddingHorizontal: gutter, paddingTop: 12 }}>
        <Label size={9} tracking={0.1} colour={color.neutral600}>
          {t({
            en: `Seed commitment ${s.epoch.commitment.slice(0, 16)}… published ${openedOn(s.epoch.openedAt)}`,
            th: `ลายนิ้วมือเมล็ดสุ่ม ${s.epoch.commitment.slice(0, 16)}… ประกาศเมื่อ ${openedOn(s.epoch.openedAt)}`,
            zh: `随机种子指纹 ${s.epoch.commitment.slice(0, 16)}… 于 ${openedOn(s.epoch.openedAt)} 公布`,
          })}
        </Label>
        {/*
          "Within N hours", not "when this round closes". The old wording was
          true of the code and useless to a reader, and for a while it was not
          even true of the running server: nothing closed a round, so the seed
          was never published and no receipt could be checked (docs/68).
        */}
        <Body size={13} style={{ color: color.neutral600, paddingTop: 4 }}>
          {t({
            en: 'Every roll is computed from a seed whose fingerprint was published before any of them '
              + 'were made. When this round closes the seed is published too, and any summon can be '
              + 'recomputed from its receipt.',
            th: 'ทุกการสุ่มคำนวณจากเมล็ดสุ่มที่ประกาศลายนิ้วมือไว้ก่อนการสุ่มทั้งหมด '
              + 'เมื่อรอบนี้ปิด เมล็ดสุ่มจะถูกประกาศด้วย และทุกการอัญเชิญสามารถคำนวณซ้ำได้จากใบรับ',
            zh: '每一次抽取都由一枚随机种子算出，而这枚种子的指纹在所有抽取之前就已公布。'
              + '本轮结束时种子本身也会公布，届时任何一次召唤都可以凭回执重新算出。',
          })}
        </Body>
      </View>

      <View style={{ paddingHorizontal: gutter, paddingTop: 20, paddingBottom: 8 }}>
        <Heading size={16}>{t({ en: 'Collection Book', th: 'สมุดสะสม', zh: '收藏图鉴' })}</Heading>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: gutter, paddingBottom: 32 }}>
        {previewCategory === 'mascot'
          ? (guide.data?.spirits ?? []).map((card) => <SpiritCardView key={card.key} card={card} />)
          : (guide.data?.fashion ?? []).map((card) => <FashionCardView key={card.key} card={card} />)}
      </View>

      <View style={{ paddingHorizontal: gutter, paddingBottom: 40, gap: 10 }}>
        <Heading size={16}>{t({ en: 'Gacha History', th: 'ประวัติการสุ่ม', zh: '抽取记录' })}</Heading>
        {(history.data?.summons ?? []).slice(0, 20).map((entry) => (
          <View key={entry.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 11, borderRadius: 16, borderWidth: 1, borderColor: '#A9D5E2', backgroundColor: 'rgba(255,255,255,0.9)' }}>
            <Sparkles size={18} color={RARITY_TINT[entry.rarity]} />
            <View style={{ flex: 1 }}>
              <Heading size={13}>{entry.item ? t(entry.item.kind === 'spirit' ? entry.item.spirit.name : entry.item.costume.name) : entry.spiritKey}</Heading>
              <Label size={9} tracking={0.03} colour="#526A78" style={{ textTransform: 'none' }}>
                {formatDate(entry.at) + ' · ' + (entry.category ?? 'mascot') + (entry.pointsSpent ? ' · ' + entry.pointsSpent + ' Trip Points' : '')}
              </Label>
            </View>
            <RarityPill rarity={entry.rarity} />
          </View>
        ))}
      </View>
    </ScrollView>
    <SummonReveal
      visible={revealOpen}
      results={last}
      pull={lastPull}
      onClose={() => setRevealOpen(false)}
      onPullAgain={() => {
        setRevealOpen(false);
        if (last.length === 1 || last.length === 10) void pull(last.length as 1 | 10);
      }}
    />
    </>
  );
}

/**
 * The result stage appears only after the server has committed the draw.
 * It celebrates what actually arrived; it never cycles through unowned
 * creatures or manufactures a near-miss while the request is in flight.
 */
function SummonReveal({
  visible, results, pull, onClose, onPullAgain,
}: {
  visible: boolean;
  results: SummonResult[];
  pull: PullResult | null;
  onClose: () => void;
  onPullAgain: () => void;
}) {
  const still = useReduceMotion();
  const curtain = React.useRef(new Animated.Value(0)).current;
  const prize = React.useRef(new Animated.Value(0)).current;
  const [phase, setPhase] = React.useState<'release' | 'opening' | 'reveal' | 'summary'>('release');
  const [revealedCount, setRevealedCount] = React.useState(0);

  React.useEffect(() => {
    if (!visible) return;
    curtain.stopAnimation();
    prize.stopAnimation();
    if (still) {
      curtain.setValue(1);
      prize.setValue(1);
      return;
    }
    curtain.setValue(0);
    prize.setValue(0);
    Animated.parallel([
      Animated.timing(curtain, {
        toValue: 1, duration: 240, easing: Easing.out(Easing.cubic),
        useNativeDriver: Platform.OS !== 'web',
      }),
      Animated.sequence([
        Animated.delay(120),
        Animated.spring(prize, {
          toValue: 1, friction: 6, tension: 72,
          useNativeDriver: Platform.OS !== 'web',
        }),
      ]),
    ]).start();
  }, [curtain, prize, still, visible, results]);

  React.useEffect(() => {
    if (!visible || results.length === 0) return undefined;
    if (still) {
      setPhase('summary');
      setRevealedCount(results.length);
      return undefined;
    }
    setPhase('release');
    setRevealedCount(0);
    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(setTimeout(() => setPhase('opening'), 420));
    timers.push(setTimeout(() => setPhase('reveal'), 920));
    results.forEach((result, index) => {
      const dramatic = result.rarity === 'mythic' ? 650 : result.rarity === 'rare' ? 430 : 260;
      const previous = results.slice(0, index).reduce((sum, entry) => (
        sum + (entry.rarity === 'mythic' ? 650 : entry.rarity === 'rare' ? 430 : 260)
      ), 0);
      timers.push(setTimeout(() => {
        setRevealedCount(index + 1);
        if (index === results.length - 1) setPhase('summary');
      }, 980 + previous + dramatic));
    });
    return () => timers.forEach(clearTimeout);
  }, [results, still, visible]);

  if (results.length === 0) return null;
  const hero = results[0]!;
  const tint = RARITY_TINT[hero.rarity];
  const mythic = hero.rarity === 'mythic';
  const skip = () => {
    setRevealedCount(results.length);
    setPhase('summary');
  };
  const hide = () => {
    if (still) { onClose(); return; }
    Animated.parallel([
      Animated.timing(prize, { toValue: 0, duration: 120, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(curtain, { toValue: 0, duration: 160, useNativeDriver: Platform.OS !== 'web' }),
    ]).start(onClose);
  };

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={hide}>
      <Animated.View
        accessibilityViewIsModal
        style={{
          flex: 1, justifyContent: 'center', alignItems: 'center', padding: 18,
          backgroundColor: 'rgba(3,20,42,0.88)', opacity: curtain,
        }}
      >
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute', width: 360, height: 360, borderRadius: 180,
            borderWidth: mythic ? 6 : 3, borderColor: mythic ? '#FFE27A' : `${tint}AA`,
            backgroundColor: mythic ? 'rgba(255,213,83,0.18)' : `${tint}24`,
            opacity: prize,
            transform: [{ scale: prize.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1.15] }) }],
          }}
        />
        <Animated.View
          style={{
            width: '100%', maxWidth: 520, maxHeight: '90%', padding: 18,
            borderRadius: 30, borderWidth: 3, borderColor: mythic ? '#FFE08B' : tint,
            backgroundColor: '#F8FDFF',
            shadowColor: mythic ? '#FFD75E' : '#000000', shadowOpacity: 0.46,
            shadowRadius: 28, shadowOffset: { width: 0, height: 12 }, elevation: 16,
            opacity: prize,
            transform: [
              { translateY: prize.interpolate({ inputRange: [0, 1], outputRange: [36, 0] }) },
              { scale: prize.interpolate({ inputRange: [0, 1], outputRange: [0.72, 1] }) },
            ],
          }}
        >
          <View style={{ alignItems: 'center', gap: 5, marginBottom: 13 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
              <Sparkles size={18} color={mythic ? '#D99A0A' : tint} strokeWidth={2.3} />
              <Label size={11} tracking={0.13} colour="#315B70">
                {phase === 'release'
                  ? t({ en: 'CAPSULE RELEASE', th: 'ปล่อยแคปซูล', zh: '胶囊释放' })
                  : phase === 'opening'
                    ? t({ en: 'CAPSULE OPENING', th: 'กำลังเปิดแคปซูล', zh: '胶囊开启' })
                    : phase === 'reveal'
                      ? t({ en: 'REWARD REVEAL', th: 'เปิดเผยรางวัล', zh: '奖励揭晓' })
                      : t({ en: 'SUMMON COMPLETE', th: 'สุ่มสำเร็จ', zh: '召唤完成' })}
              </Label>
              <Sparkles size={18} color={mythic ? '#D99A0A' : tint} strokeWidth={2.3} />
            </View>
            <Heading size={results.length > 1 ? 23 : 27} colour="#082F58" style={{ textAlign: 'center' }}>
              {revealedCount === 0
                ? t({ en: 'The capsule is glowing…', th: 'แคปซูลกำลังเปล่งแสง…', zh: '胶囊正在发光…' })
                : results.length > 1 && phase === 'summary'
                ? t({ en: `${results.length} rewards arrived!`, th: `ได้รับรางวัล ${results.length} ชิ้น!`, zh: `获得了 ${results.length} 件奖励！` })
                : t(hero.item.kind === 'spirit' ? hero.item.spirit.name : hero.item.costume.name)}
            </Heading>
          </View>

          {revealedCount === 0 ? (
            results.length > 1 ? (
              <Animated.View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, paddingHorizontal: 20, transform: [{ scale: prize }] }}>
                {results.map((result, index) => (
                  <View key={result.id} style={{ width: 48, height: 48, borderRadius: 24, borderWidth: 3, borderColor: '#8BD8E7', backgroundColor: '#E7FAFF', transform: [{ translateY: index % 2 === 0 ? 4 : -4 }] }}>
                    <View style={{ position: 'absolute', left: -3, right: -3, top: 20, height: 6, backgroundColor: '#0E7E9E' }} />
                  </View>
                ))}
              </Animated.View>
            ) : (
              <Animated.View style={{ alignSelf: 'center', width: 128, height: 128, borderRadius: 64, borderWidth: 6, borderColor: mythic ? '#FFD65A' : '#8BD8E7', backgroundColor: mythic ? '#FFF0A8' : '#E7FAFF', transform: [{ scale: prize }] }}>
                <View style={{ position: 'absolute', left: -6, right: -6, top: 55, height: 10, backgroundColor: mythic ? '#E5A619' : '#0E7E9E' }} />
                <Sparkles size={36} color={mythic ? '#D99A0A' : '#0E7E9E'} style={{ alignSelf: 'center', marginTop: 40 }} />
              </Animated.View>
            )
          ) : null}

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10, paddingVertical: 4 }}>
            {results.slice(0, revealedCount).map((result, index) => (
              <RevealTile key={result.id} result={result} featured={results.length === 1 || index === 0} />
            ))}
          </ScrollView>

          {phase !== 'summary' ? (
            <Pressable onPress={skip} accessibilityRole="button" accessibilityLabel={t({ en: 'Skip animation', th: 'ข้ามแอนิเมชัน', zh: '跳过动画' })} style={{ alignSelf: 'center', paddingHorizontal: 16, paddingVertical: 9 }}>
              <Label size={10} tracking={0.04} colour="#315B70">{t({ en: 'SKIP ANIMATION', th: 'ข้ามแอนิเมชัน', zh: '跳过动画' })}</Label>
            </Pressable>
          ) : null}

          {phase === 'summary' && pull ? (
            <View style={{ padding: 10, borderRadius: 14, backgroundColor: '#EAF8FC', gap: 3 }}>
              <Body size={13} style={{ color: '#315B70', textAlign: 'center' }}>
                {`${results.length} rewards · ${formatInteger(pull.cost)} Trip Points spent · ${formatInteger(pull.tripPoints)} remaining`}
              </Body>
            </View>
          ) : null}

          <View style={{ flexDirection: 'row', gap: 9 }}>
          <Pressable
            onPress={hide}
            accessibilityRole="button"
            accessibilityLabel={t({ en: 'Keep in collection', th: 'เก็บเข้าคอลเลกชัน', zh: '收入收藏' })}
            style={({ pressed }) => ({
              flex: 1, minHeight: 54, marginTop: 15, borderRadius: 18, borderWidth: 2,
              borderColor: '#FFE08B', backgroundColor: pressed ? '#0A6880' : '#0E7E9E',
              alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8,
              shadowColor: '#073454', shadowOpacity: 0.3, shadowRadius: 8,
              shadowOffset: { width: 0, height: 4 }, elevation: 5,
            })}
          >
            <Gift size={19} color="#FFE08B" strokeWidth={2.2} />
            <Heading size={17} colour="#FFFFFF">
              {t({ en: 'Keep in collection', th: 'เก็บเข้าคอลเลกชัน', zh: '收入收藏' })}
            </Heading>
          </Pressable>
          {phase === 'summary' ? (
            <Pressable
              onPress={onPullAgain}
              accessibilityRole="button"
              accessibilityLabel={t({ en: 'Pull again', th: 'สุ่มอีกครั้ง', zh: '再次抽取' })}
              style={({ pressed }) => ({ flex: 1, minHeight: 54, marginTop: 15, borderRadius: 18, borderWidth: 2, borderColor: '#D9A72A', backgroundColor: pressed ? '#D49318' : '#E8A72A', alignItems: 'center', justifyContent: 'center' })}
            >
              <Heading size={16} colour="#FFFFFF">{t({ en: 'Pull again', th: 'สุ่มอีกครั้ง', zh: '再次抽取' })}</Heading>
            </Pressable>
          ) : null}
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

function RevealTile({ result, featured }: { result: SummonResult; featured: boolean }) {
  const size = featured ? 108 : 70;
  const tint = RARITY_TINT[result.rarity];
  return (
    <View
      accessible
      accessibilityLabel={`${t(result.item.kind === 'spirit' ? result.item.spirit.name : result.item.costume.name)}, ${t(RARITY_LABEL[result.rarity])}`}
      style={{
        width: featured ? '100%' : '29%', minWidth: featured ? 0 : 92,
        alignItems: 'center', gap: 6, padding: featured ? 15 : 9,
        borderRadius: featured ? 24 : 17, borderWidth: featured ? 3 : 2, borderColor: tint,
        backgroundColor: result.rarity === 'mythic' ? '#FFF3C9' : `${tint}12`,
      }}
    >
      {result.item.kind === 'spirit'
        ? <MascotMark mascot={result.item.spirit.form} size={size} />
        : (
          <View style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: '#DDF3F8', borderWidth: 2, borderColor: '#8BCBDC' }}>
            <Shirt size={featured ? 48 : 30} color="#0E7E9E" strokeWidth={2} />
          </View>
        )}
      <Heading size={featured ? 19 : 12} colour="#082F58" style={{ textAlign: 'center' }}>
        {t(result.item.kind === 'spirit' ? result.item.spirit.name : result.item.costume.name)}
      </Heading>
      <RarityPill rarity={result.rarity} />
      {!result.duplicate ? (
        <Label size={9} tracking={0.08} colour="#0E7E9E">NEW</Label>
      ) : null}
      {featured ? (
        <Body size={13} style={{ color: '#526A78', textAlign: 'center' }}>
          {t(result.item.kind === 'spirit' ? result.item.spirit.lore : result.item.costume.why)}
        </Body>
      ) : null}
      {result.byPity ? (
        <Label size={9} tracking={0.05} colour={result.rarity === 'mythic' ? '#9A6500' : '#6B3FB0'}>
          {result.byPity === 'mythic' ? 'MYTHIC GUARANTEE' : 'RARE GUARANTEE'}
        </Label>
      ) : null}
      {result.duplicate ? (
        <Label size={9} tracking={0.03} colour="#526A78" style={{ textTransform: 'none', textAlign: 'center' }}>
          {t({ en: `Duplicate · +${result.dustGained} stardust`, th: `ตัวซ้ำ · +${result.dustGained} ผงดาว`, zh: `重复 · +${result.dustGained} 星尘` })}
        </Label>
      ) : null}
      {result.coupon ? <Label size={9} tracking={0.03} colour="#8A5A00" style={{ textTransform: 'none', textAlign: 'center' }}>{t({ en: `Coupon added · ${result.coupon.merchant}`, th: `เพิ่มคูปองแล้ว · ${result.coupon.merchant}`, zh: `优惠券已加入 · ${result.coupon.merchant}` })}</Label> : null}
    </View>
  );
}

/** What just arrived. A duplicate says so, warmly, and says what it became. */
function Outcome({ result }: { result: SummonResult }) {
  return (
    <View
      style={[shadow.card, {
        marginHorizontal: gutter, marginTop: 12, padding: 14, borderRadius: gameRadius.panel,
        backgroundColor: color.surface, borderWidth: 2, borderColor: RARITY_TINT[result.rarity],
        flexDirection: 'row', alignItems: 'center', gap: 14,
      }]}
    >
      {/*
        A costume has no `form` to draw, because it is worn rather than met.
        It gets the same card with its own line: what it is, and the sentence
        in `costumes.ts` that opens by saying it is decoration.
      */}
      {result.item.kind === 'spirit'
        ? <MascotMark mascot={result.item.spirit.form} size={72} />
        : (
          <View style={{ width: 72, height: 72, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EAF7FB', borderWidth: 2, borderColor: '#9ED8E8' }}>
            <Shirt size={34} color="#0E7E9E" strokeWidth={2} />
          </View>
        )}
      <View style={{ flex: 1, gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Heading size={18}>
            {t(result.item.kind === 'spirit' ? result.item.spirit.name : result.item.costume.name)}
          </Heading>
          <RarityPill rarity={result.rarity} />
        </View>
        <Label size={10} tracking={0.06} colour={color.neutral700} style={{ textTransform: 'none' }}>
          {result.item.kind === 'spirit'
            ? t(result.item.spirit.creature)
            : t({ en: 'Fashion', th: 'แฟชั่น', zh: '时装' })}
        </Label>
        <Body size={13} style={{ color: color.neutral800 }}>
          {t(result.item.kind === 'spirit' ? result.item.spirit.lore : result.item.costume.why)}
        </Body>
        {result.byPity ? (
          <Label size={9} tracking={0.1} colour={color.neutral600}>
            {result.byPity === 'mythic'
              ? t({ en: 'The mythic floor', th: 'เพดานรับประกันระดับเทพ', zh: '传说保底' })
              : t({ en: 'The rare floor', th: 'เพดานรับประกันระดับหายาก', zh: '稀有保底' })}
          </Label>
        ) : null}
        {result.duplicate ? (
          <Label size={10} tracking={0.06} colour={color.neutral700} style={{ textTransform: 'none' }}>
            {t({
              en: `Already yours — it became ${result.dustGained} stardust.`,
              th: `คุณมีอยู่แล้ว — แปลงเป็นผงดาว ${result.dustGained} หน่วย`,
              zh: `你已经有了 — 它化为 ${result.dustGained} 点星尘。`,
            })}
          </Label>
        ) : null}
        {result.coupon ? <View style={{ padding: 9, borderRadius: 12, backgroundColor: '#FFF4C7' }}><Label size={10} tracking={0.03} colour="#7B5100" style={{ textTransform: 'none' }}>{t({ en: `Coupon saved to Backpack · ${result.coupon.merchant}`, th: `บันทึกคูปองลงกระเป๋าแล้ว · ${result.coupon.merchant}`, zh: `优惠券已保存到背包 · ${result.coupon.merchant}` })}</Label></View> : null}
      </View>
    </View>
  );
}
