/**
 * The adventure inventory: the pieces My Backpack is built from.
 *
 * Everything in here is PRESENTATION over data the screen already had. The
 * balances are `wallet.balances`, the rank slots are `progression.ladder`,
 * and the medal slots are `/medals` - the same answer the Medals screen
 * prints. Nothing here decides whether a slot is open; it only draws the
 * answer it was handed, and a slot the server says is locked is drawn
 * locked however empty that leaves the grid.
 *
 * THE LOOK is a premium game inventory: layered frames, metallic gold,
 * glossy highlights, soft depth. What it is NOT is a loot screen. Nothing
 * here spins, flashes or teases, and the glow on an earned slot is a slow
 * breath that stops entirely for anybody who asked their system for less
 * motion (`useReduceMotion`).
 */

import React from 'react';
import {
  Animated, Image, Platform, Pressable, View,
  type ImageSourcePropType, type LayoutChangeEvent,
} from 'react-native';
import Svg, { Circle, Defs, Ellipse, LinearGradient, Path, RadialGradient, Stop } from 'react-native-svg';
import {
  Gift, LockKeyhole, type LucideIcon,
} from 'lucide-react-native';
import { strings, type MedalState, type Progression } from '@chivago/core';
import { Heading, Label } from './Type.tsx';
import { useReduceMotion } from './reduce-motion.ts';
import { t } from '../i18n/locale.ts';
import { formatInteger } from '../i18n/format.ts';
import firstStepsArt from '../../assets/medal-first-steps-v1.png';
import explorerArt from '../../assets/medal-explorer-v1.png';
import samuiCoastArt from '../../assets/medal-samui-coast-v1.png';
import forestWaterArt from '../../assets/medal-forest-water-v1.png';
import allSamuiArt from '../../assets/medal-all-samui-v1.png';
import allCampusArt from '../../assets/medal-all-campus-v1.png';
import hopperArt from '../../assets/medal-hopper-v1.png';
import currencyItems from '../../assets/backpack-currency-items-v1.png';
import rewardItems from '../../assets/backpack-reward-items-v1.png';

/**
 * The generated currency strip contains two equal cells: Star, then Flag.
 * Cropping one bundled image keeps both items on one art direction and avoids
 * six small network/file requests on the inventory's first frame.
 */
function CurrencySprite({ index, size }: { index: 0 | 1; size: number }) {
  return (
    <View accessible={false} style={{ width: size, height: size, overflow: 'hidden' }}>
      <Image
        source={currencyItems}
        resizeMode="stretch"
        style={{ position: 'absolute', width: size * 2, height: size, left: -index * size, top: 0 }}
      />
    </View>
  );
}

/** Six equal cells: binoculars, hat, compass, map, camera, medal. */
function RewardSprite({ index, size, muted = false }: { index: number; size: number; muted?: boolean }) {
  const cell = Math.max(0, Math.min(5, index));
  const column = cell % 3;
  const row = Math.floor(cell / 3);
  return (
    <View accessible={false} style={{ width: size, height: size, overflow: 'hidden' }}>
      <Image
        source={rewardItems}
        resizeMode="stretch"
        style={{
          position: 'absolute', width: size * 3, height: size * 2,
          left: -column * size, top: -row * size,
          opacity: muted ? 0.58 : 1,
          tintColor: muted ? '#6E8EA8' : undefined,
        }}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// The palette, in one place
// ---------------------------------------------------------------------------

/**
 * The inventory's own colours. Named for what they DO on the page, so a
 * reader changing "the locked colour" changes one line and not eleven.
 */
export const INV = {
  navy: '#103B5C',
  ocean: '#164D73',
  sky: '#DDF2FA',
  panel: '#C7E5F5',
  gold: '#F7BD38',
  antique: '#D99A27',
  cream: '#FFF1D6',
  locked: '#244A66',
  lockedRim: '#3A6688',
  lockedInk: '#9FBBD0',
  white: '#FFFFFF',
  goldRim: '#FFE6A0',
  goldInk: '#4A3105',
} as const;

// ---------------------------------------------------------------------------
// Ornament
// ---------------------------------------------------------------------------

/**
 * Four brass corner brackets.
 *
 * The cheapest single detail that turns a rounded rectangle into a framed
 * object. Decoration only: `pointerEvents` none, no accessibility node.
 */
export function GoldCorners({ inset = 6, size = 14, colour = INV.antique }: { inset?: number; size?: number; colour?: string }) {
  const arm = { position: 'absolute' as const, width: size, height: size, borderColor: colour };
  return (
    <>
      <View pointerEvents="none" style={[arm, { top: inset, left: inset, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 6 }]} />
      <View pointerEvents="none" style={[arm, { top: inset, right: inset, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 6 }]} />
      <View pointerEvents="none" style={[arm, { bottom: inset, left: inset, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 6 }]} />
      <View pointerEvents="none" style={[arm, { bottom: inset, right: inset, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 6 }]} />
    </>
  );
}

/**
 * A section's name on a navy capsule, riding over the top edge of its panel.
 *
 * The capsule is what makes a panel read as a piece of game UI rather than a
 * card with a heading in it: the title is an object sitting ON the frame.
 */
export function SectionBanner({ icon: Icon, title }: { icon: LucideIcon; title: string }) {
  return (
    <View
      accessibilityRole="header"
      style={{
        alignSelf: 'flex-start',
        flexDirection: 'row', alignItems: 'center', gap: 9,
        marginTop: -34, marginBottom: 6,
        paddingLeft: 12, paddingRight: 18, paddingVertical: 8,
        borderRadius: 22, borderWidth: 3, borderColor: INV.antique,
        backgroundColor: INV.navy,
        shadowColor: '#061F33', shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3, shadowRadius: 6, elevation: 5,
      }}
    >
      {/* The inner line that makes the capsule read as a raised object. */}
      <View pointerEvents="none" style={{ position: 'absolute', top: 2, left: 2, right: 2, bottom: 2, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,230,160,0.45)' }} />
      <View style={{ width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: INV.gold }}>
        <Icon size={17} color={INV.navy} strokeWidth={2.4} />
      </View>
      <Heading size={18} colour={INV.white}>{title}</Heading>
    </View>
  );
}

// ---------------------------------------------------------------------------
// The two currency emblems, drawn
// ---------------------------------------------------------------------------

/**
 * A metallic gold star on a laurel.
 *
 * SVG rather than an icon font, because the reference wants METAL: a
 * three-stop gradient for the faces, a darker rim, and a highlight. A line
 * icon in white on a yellow circle - what this used to be - reads as a
 * button, not a treasure.
 */
export function StarEmblem({ size = 86 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <RadialGradient id="starHalo" cx="50" cy="46" r="48" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#FFF4C2" stopOpacity="0.95" />
          <Stop offset="1" stopColor="#FFF4C2" stopOpacity="0" />
        </RadialGradient>
        <LinearGradient id="starFace" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFF1A8" />
          <Stop offset="0.45" stopColor="#F7BD38" />
          <Stop offset="1" stopColor="#C27A12" />
        </LinearGradient>
        <LinearGradient id="laurel" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#F5D36A" />
          <Stop offset="1" stopColor="#B57A14" />
        </LinearGradient>
      </Defs>
      <Circle cx="50" cy="46" r="46" fill="url(#starHalo)" />
      {/* The laurel: two branches of leaves curving up from the base. */}
      <Path d="M22 74 C 16 60, 18 46, 26 36" stroke="#B57A14" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <Path d="M78 74 C 84 60, 82 46, 74 36" stroke="#B57A14" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      {[[19, 66, -40], [17, 56, -20], [19, 46, 0], [24, 38, 20]].map(([x, y, r], i) => (
        <Ellipse key={`l${i}`} cx={x} cy={y} rx="4.2" ry="7.5" fill="url(#laurel)" stroke="#9A6510" strokeWidth="0.8" transform={`rotate(${r} ${x} ${y})`} />
      ))}
      {[[81, 66, 40], [83, 56, 20], [81, 46, 0], [76, 38, -20]].map(([x, y, r], i) => (
        <Ellipse key={`r${i}`} cx={x} cy={y} rx="4.2" ry="7.5" fill="url(#laurel)" stroke="#9A6510" strokeWidth="0.8" transform={`rotate(${r} ${x} ${y})`} />
      ))}
      {/* The star, its rim and its highlight. */}
      <Path
        d="M50 10 L61.5 35.5 L89 38.5 L68.5 57 L74.5 84 L50 70 L25.5 84 L31.5 57 L11 38.5 L38.5 35.5 Z"
        fill="url(#starFace)" stroke="#9A5F0B" strokeWidth="3" strokeLinejoin="round"
      />
      <Path d="M50 18 L58 36 L50 33 Z" fill="#FFFBE0" opacity="0.85" />
      <Path d="M50 70 L50 44 L68.5 57 Z" fill="#B06A0E" opacity="0.22" />
    </Svg>
  );
}

/**
 * The traveller's flag: teal cloth on a brass pole, over a small range.
 *
 * Teal and gold, as the brief asks, and the same drawing vocabulary as the
 * star so the two plaques read as a matched pair of resources.
 */
export function FlagEmblem({ size = 86 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <RadialGradient id="flagHalo" cx="50" cy="48" r="48" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#D8F7FB" stopOpacity="0.95" />
          <Stop offset="1" stopColor="#D8F7FB" stopOpacity="0" />
        </RadialGradient>
        <LinearGradient id="cloth" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#5FD8E4" />
          <Stop offset="0.55" stopColor="#1AA2B8" />
          <Stop offset="1" stopColor="#0C6F8A" />
        </LinearGradient>
        <LinearGradient id="pole" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#F5D36A" />
          <Stop offset="1" stopColor="#A9700F" />
        </LinearGradient>
        <LinearGradient id="hills" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#E9D3A2" />
          <Stop offset="1" stopColor="#C9A465" />
        </LinearGradient>
      </Defs>
      <Circle cx="50" cy="48" r="46" fill="url(#flagHalo)" />
      <Path d="M8 88 L30 64 L44 76 L62 56 L92 88 Z" fill="url(#hills)" stroke="#A88449" strokeWidth="1.5" strokeLinejoin="round" />
      <Path d="M30 14 L34 14 L34 88 L30 88 Z" fill="url(#pole)" stroke="#8A5A0C" strokeWidth="1" />
      <Circle cx="32" cy="12" r="5" fill="#F7BD38" stroke="#9A5F0B" strokeWidth="1.6" />
      {/* The cloth, with one wave in it so it reads as moving air. */}
      <Path
        d="M34 18 C 48 12, 58 24, 82 18 L 82 50 C 60 56, 50 44, 34 50 Z"
        fill="url(#cloth)" stroke="#0A5A70" strokeWidth="2.4" strokeLinejoin="round"
      />
      <Path d="M38 22 C 48 18, 56 26, 70 23" stroke="#E4FBFF" strokeWidth="2.2" fill="none" strokeLinecap="round" opacity="0.8" />
      {/* The ChivarGo loop, in gold, on the cloth. */}
      <Path d="M48 34 C 48 28, 56 28, 58 34 C 60 40, 68 40, 68 34 C 68 28, 60 28, 58 34 C 56 40, 48 40, 48 34 Z" fill="none" stroke="#FFE08A" strokeWidth="3" />
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// A currency, as a treasure item
// ---------------------------------------------------------------------------

/**
 * One balance as an item card.
 *
 * Both plaques share the antique-gold frame and cream face because they are
 * the same KIND of thing - a figure the traveller carries. What keeps the
 * two currencies apart is everything that matters: the emblem, the name,
 * and the one line saying where the figure came from. A traveller holding
 * both will otherwise read them as one number split in two, and only one of
 * them belongs in an impact report.
 */
export function CurrencyItemCard({
  figure, label, title, note, kind, compact = false,
}: {
  figure: number;
  /** The currency's real name - Green Points, Trip Points. Always printed. */
  label: string;
  /**
   * The item's name on the card, when it differs from the currency's. The
   * real name is printed under it every time, so the game name can never
   * stand in for the currency on its own.
   */
  title?: string;
  note: string;
  kind: 'star' | 'flag';
  compact?: boolean;
}) {
  // The emblem is the item. In the reference it takes the left third of the
  // plaque, and at 88px it read as an icon beside a number instead.
  const emblem = compact ? 74 : 104;
  return (
    <View
      accessible
      accessibilityLabel={`${formatInteger(figure)} ${label}. ${note}`}
      style={{
        borderRadius: 22,
        borderWidth: 3,
        borderColor: INV.antique,
        backgroundColor: '#E9C77E',
        padding: 4,
        shadowColor: '#5C3D0A', shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.32, shadowRadius: 10, elevation: 6,
      }}
    >
      {/* Second rim: the bevel between the brass frame and the parchment. */}
      <View
        style={{
          borderRadius: 17, borderWidth: 2, borderColor: '#B98025',
          backgroundColor: INV.cream, overflow: 'hidden',
          flexDirection: 'row', alignItems: 'center', gap: compact ? 8 : 12,
          paddingVertical: compact ? 8 : 10, paddingLeft: compact ? 6 : 10, paddingRight: compact ? 12 : 16,
          minHeight: compact ? 92 : 112,
        }}
      >
        {/* A soft top-light, so the parchment has a surface rather than a fill. */}
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '45%', backgroundColor: 'rgba(255,255,255,0.45)' }} />
        <View pointerEvents="none" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 14, backgroundColor: 'rgba(185,128,37,0.12)' }} />
        <GoldCorners inset={5} size={12} />
        <View style={{ width: emblem, height: emblem, alignItems: 'center', justifyContent: 'center' }}>
          <CurrencySprite index={kind === 'star' ? 0 : 1} size={emblem} />
        </View>
        <View style={{ flex: 1, minWidth: 0, alignItems: 'center', gap: 5 }}>
          <View style={{ alignItems: 'center' }}>
            <Heading size={compact ? 15 : 19} colour={INV.navy} style={{ textAlign: 'center' }}>{title ?? label}</Heading>
            {title && title !== label ? (
              <Label size={9} tracking={0.04} colour="#7B5A1E" style={{ textAlign: 'center' }}>{label}</Label>
            ) : null}
          </View>
          {/* The figure on a navy capsule, the way a plaque carries a number. */}
          <View
            style={{
              alignSelf: 'stretch', alignItems: 'center',
              paddingVertical: compact ? 4 : 6, borderRadius: 16,
              borderWidth: 2, borderColor: '#0A2A44', backgroundColor: INV.navy,
              shadowColor: '#061F33', shadowOffset: { width: 0, height: 3 },
              shadowOpacity: 0.35, shadowRadius: 4, elevation: 3,
            }}
          >
            <View pointerEvents="none" style={{ position: 'absolute', top: 2, left: 10, right: 10, height: 2, borderRadius: 1, backgroundColor: 'rgba(255,255,255,0.18)' }} />
            <Heading size={compact ? 22 : 28} tracking={-0.4} colour={INV.white}>{formatInteger(figure)}</Heading>
          </View>
          <Label size={10} tracking={0} colour="#6B5424" style={{ textTransform: 'none', textAlign: 'center' }}>{note}</Label>
        </View>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// The reward inventory
// ---------------------------------------------------------------------------

/** Each medal's own art, by key. The same images the Medals screen uses. */
const MEDAL_ART: Record<string, ImageSourcePropType> = {
  'first-steps': firstStepsArt,
  explorer: explorerArt,
  'samui-coast': samuiCoastArt,
  'forest-and-water': forestWaterArt,
  'all-of-samui': allSamuiArt,
  'all-of-campus': allCampusArt,
  hopper: hopperArt,
};

/*
  Locked and unlocked, SAID rather than coloured.

  A gold slot and a navy one are the same slot to a screen reader and to
  anybody who cannot tell them apart, so each slot carries its state in
  words, and a locked slot carries the condition that opens it. The lock and
  the counter do the same job for a sighted reader; neither state is
  signalled by colour alone.
*/
export const RANK_UNLOCKED = { en: 'Unlocked', th: 'ปลดล็อกแล้ว', zh: '已解锁' };
export const RANK_LOCKED = (level: number) => ({
  en: `Locked until level ${level}`,
  th: `ล็อกอยู่ จนถึงเลเวล ${level}`,
  zh: `锁定，需达到 ${level} 级`,
});

type Slot =
  | { kind: 'rank'; key: string; name: string; earned: boolean; artIndex: number; condition: string; label: string }
  | { kind: 'medal'; key: string; name: string; earned: boolean; art: ImageSourcePropType; condition: string; label: string };

function slotsFor(progression: Progression, medals: readonly MedalState[] | null): Slot[] {
  const ranks: Slot[] = progression.ladder.map((rank, index) => ({
    kind: 'rank',
    key: `rank-${rank.key}`,
    name: t(rank.label),
    earned: rank.earned,
    artIndex: index,
    condition: t({ en: `Lv. ${rank.fromLevel}`, th: `เลเวล ${rank.fromLevel}`, zh: `${rank.fromLevel} 级` }),
    label: `${t(rank.label)}. ${t(rank.earned ? RANK_UNLOCKED : RANK_LOCKED(rank.fromLevel))}`,
  }));
  const earnedMedals: Slot[] = (medals ?? []).map((m) => ({
    kind: 'medal',
    key: `medal-${m.key}`,
    name: t(m.name),
    earned: m.earned,
    art: MEDAL_ART[m.key] ?? firstStepsArt,
    condition: `${m.progress.done} / ${m.progress.total}`,
    label: m.earned
      ? `${t(m.name)}. ${t(RANK_UNLOCKED)}`
      : t({
        en: `${t(m.name)}. Locked, ${m.progress.done} of ${m.progress.total} done. ${t(m.how)}`,
        th: `${t(m.name)} ล็อกอยู่ ทำแล้ว ${m.progress.done} จาก ${m.progress.total} ${t(m.how)}`,
        zh: `${t(m.name)}。锁定，已完成 ${m.progress.done} / ${m.progress.total}。${t(m.how)}`,
      }),
  }));
  return [...ranks, ...earnedMedals];
}

/**
 * One slow breath, shared by every earned slot on the page.
 *
 * Shared so twelve slots do not run twelve loops out of phase with each
 * other, which reads as flicker. Still (a fixed mid value) for anybody who
 * asked for less motion - still, not slower.
 */
function useGlow(): Animated.Value {
  const still = useReduceMotion();
  const glow = React.useRef(new Animated.Value(0.55)).current;
  React.useEffect(() => {
    if (still) { glow.setValue(0.55); return undefined; }
    const native = Platform.OS !== 'web';
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(glow, { toValue: 0.9, duration: 1600, useNativeDriver: native }),
      Animated.timing(glow, { toValue: 0.45, duration: 1600, useNativeDriver: native }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [still, glow]);
  return glow;
}

/** Three small four-pointed glints. Only ever on an earned slot. */
function Glints() {
  const star = 'M5 0 L6.2 3.8 L10 5 L6.2 6.2 L5 10 L3.8 6.2 L0 5 L3.8 3.8 Z';
  return (
    <>
      {[{ top: 7, left: 8, s: 11 }, { top: 14, right: 9, s: 8 }, { bottom: 30, left: 12, s: 7 }].map((g, i) => (
        <View key={i} pointerEvents="none" style={{ position: 'absolute', ...g, width: g.s, height: g.s }}>
          <Svg width={g.s} height={g.s} viewBox="0 0 10 10"><Path d={star} fill="#FFFDF0" /></Svg>
        </View>
      ))}
    </>
  );
}

function RewardSlot({
  slot, width, glow, onOpenMedals,
}: { slot: Slot; width: number; glow: Animated.Value; onOpenMedals?: () => void }) {
  // The medal PNGs carry a wide transparent margin around the medal itself,
  // so they are drawn larger than the rank emblems to read at the same size.
  //
  // A LOCKED slot draws its art smaller, because it carries two lines under
  // it - the name and the condition - where an earned one carries one. At
  // the earned size the silhouette ran into the name.
  const art = Math.round(width * (slot.kind === 'medal'
    ? (slot.earned ? 0.8 : 0.56)
    : (slot.earned ? 0.56 : 0.48)));
  const opens = slot.kind === 'medal' && onOpenMedals !== undefined;
  return (
    <Pressable
      onPress={opens ? onOpenMedals : undefined}
      focusable={opens}
      accessible
      accessibilityRole={opens ? 'button' : undefined}
      accessibilityLabel={slot.label}
      style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => ({
        width,
        height: Math.round(width * 1.16),
        transform: [{ scale: pressed ? 0.98 : hovered ? 1.04 : 1 }],
      })}
    >
      {/* The halo behind an earned slot, breathing. Locked slots have none. */}
      {slot.earned ? (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute', top: -5, left: -5, right: -5, bottom: -5,
            borderRadius: 22, backgroundColor: '#FFD86B', opacity: glow,
          }}
        />
      ) : null}
      <View
        style={{
          flex: 1, borderRadius: 18, borderWidth: 3, overflow: 'hidden',
          borderColor: slot.earned ? INV.goldRim : INV.lockedRim,
          backgroundColor: slot.earned ? INV.gold : INV.locked,
          alignItems: 'center', justifyContent: 'center',
          shadowColor: slot.earned ? '#7A4E05' : '#061F33',
          shadowOffset: { width: 0, height: 5 },
          shadowOpacity: slot.earned ? 0.4 : 0.3, shadowRadius: 8, elevation: slot.earned ? 6 : 3,
        }}
      >
        {/* Bevel: a lit top half and a shaded foot, so the slot has depth. */}
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '48%', backgroundColor: slot.earned ? 'rgba(255,250,215,0.42)' : 'rgba(255,255,255,0.06)' }} />
        <View pointerEvents="none" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '22%', backgroundColor: slot.earned ? 'rgba(160,100,10,0.22)' : 'rgba(0,0,0,0.18)' }} />
        <View pointerEvents="none" style={{ position: 'absolute', top: 3, left: 3, right: 3, bottom: 3, borderRadius: 14, borderWidth: 1, borderColor: slot.earned ? 'rgba(255,255,255,0.6)' : 'rgba(159,187,208,0.18)' }} />
        {slot.earned ? <Glints /> : null}

        <View style={{ alignItems: 'center', justifyContent: 'center', marginTop: slot.earned ? -14 : -26 }}>
          {slot.kind === 'medal' ? (
            <Image
              source={slot.art}
              resizeMode="contain"
              accessible={false}
              style={[
                { width: art, height: art },
                // A locked medal is its own SILHOUETTE: the shape of the thing
                // waiting there, in the slot's ink, with nothing of its face.
                slot.earned ? null : { tintColor: '#5F819C', opacity: 0.9 },
              ]}
            />
          ) : (
            <View
              style={{
                width: art, height: art, borderRadius: art / 2,
                alignItems: 'center', justifyContent: 'center',
                borderWidth: 3,
                borderColor: slot.earned ? '#B97B14' : '#3D6787',
                backgroundColor: slot.earned ? INV.cream : '#1B3B54',
                overflow: 'hidden',
              }}
            >
              <RewardSprite index={slot.artIndex} size={Math.round(art * 0.88)} muted={!slot.earned} />
            </View>
          )}
          {!slot.earned ? (
            <View style={{ position: 'absolute', bottom: -6, alignSelf: 'center', width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0E2A40', borderWidth: 2, borderColor: INV.lockedRim }}>
              <LockKeyhole size={14} color="#D2E1EC" strokeWidth={2.4} />
            </View>
          ) : null}
        </View>

        {/*
          The foot. Every slot says WHAT it is, earned or not: a locked slot
          that only printed "Lv. 10" would make a sighted reader guess which
          rank was waiting there. A locked one then adds the condition that
          opens it, on its own dark capsule, the way the reference counts.
        */}
        <View style={{ position: 'absolute', left: 6, right: 6, bottom: 6, alignItems: 'center', gap: 3 }}>
          {/*
            One line, always. "All of the campus" wrapped at a phone's slot
            width and ran over the lock; the full name is in the slot's
            accessibility label, so truncating here loses nothing.
          */}
          <Label size={9} tracking={0.02} numberOfLines={1} colour={slot.earned ? INV.goldInk : INV.lockedInk} style={{ textTransform: 'none', textAlign: 'center', fontWeight: '700', alignSelf: 'stretch' }}>
            {slot.name}
          </Label>
          {!slot.earned ? (
            <View style={{ alignSelf: 'stretch', alignItems: 'center', paddingVertical: 2, borderRadius: 9, backgroundColor: '#0E2A40' }}>
              <Label size={9} tracking={0} colour="#D2E1EC" style={{ textTransform: 'none' }}>{slot.condition}</Label>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

/**
 * The ranks and the medals, as one inventory.
 *
 * TWELVE SLOTS BECAUSE THERE ARE TWELVE THINGS: five ranks on the ladder
 * and seven medals in the catalogue. Twelve also divides evenly into six,
 * four and three columns, so the grid closes cleanly at every width without
 * a single empty slot drawn to square it off - which is the one move this
 * panel may not make. A slot is a promise that something goes in it.
 *
 * The medals come from `/medals` and may be missing (offline, an older
 * server); the ranks are always there. A missing medal list therefore shows
 * five slots rather than seven invented ones.
 */
export function RewardInventory({
  progression, medals, onOpenMedals,
}: { progression: Progression; medals: readonly MedalState[] | null; onOpenMedals?: () => void }) {
  const glow = useGlow();
  const slots = slotsFor(progression, medals);
  const [inner, setInner] = React.useState(0);
  const columns = inner >= 620 ? 6 : inner >= 400 ? 4 : 3;
  const gap = inner >= 400 ? 12 : 9;
  // Before the first layout pass there is no measured width. Draw at a sane
  // default rather than drawing nothing: a frame of empty panel is a flash on
  // the web, and in a renderer with no layout at all it would be the whole
  // inventory missing.
  //
  // One pixel held back on purpose. `onLayout` reports a rounded width, and
  // a row of 6 x 102 + 5 x 12 = 672 into a measured 671.84 wraps its sixth
  // slot onto a line of its own - the 5 + 5 + 2 the first build shipped.
  const width = inner > 0 ? Math.floor((inner - 1 - gap * (columns - 1)) / columns) : 96;
  const earned = slots.filter((s) => s.earned).length;

  return (
    <View
      style={{
        marginTop: 20,
        borderRadius: 26, borderWidth: 4, borderColor: INV.navy,
        backgroundColor: INV.panel,
        paddingHorizontal: 14, paddingTop: 16, paddingBottom: 16,
        shadowColor: '#061F33', shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.24, shadowRadius: 14, elevation: 7,
      }}
    >
      {/* The stitched inner line: the panel is a case, not a card. */}
      <View pointerEvents="none" style={{ position: 'absolute', top: 6, left: 6, right: 6, bottom: 6, borderRadius: 20, borderWidth: 2, borderStyle: 'dashed', borderColor: 'rgba(22,77,115,0.28)' }} />
      <SectionBanner icon={Gift} title={t({ en: 'Reward Inventory', th: 'ช่องเก็บรางวัล', zh: '奖励物品栏' })} />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 8 }}>
        <Label size={10} tracking={0.06} colour="#3F6782">{t(strings.wallet.ranks)}</Label>
        <Label size={10} tracking={0.02} colour="#3F6782" style={{ textTransform: 'none' }}>
          {t({
            en: `${earned} of ${slots.length} unlocked`,
            th: `ปลดล็อกแล้ว ${earned} จาก ${slots.length}`,
            zh: `已解锁 ${earned} / ${slots.length}`,
          })}
        </Label>
      </View>
      <View
        onLayout={(e: LayoutChangeEvent) => setInner(Math.floor(e.nativeEvent.layout.width))}
        style={{ flexDirection: 'row', flexWrap: 'wrap', gap }}
      >
        {slots.map((slot) => (
          <RewardSlot key={slot.key} slot={slot} width={width} glow={glow} onOpenMedals={onOpenMedals} />
        ))}
      </View>
    </View>
  );
}
