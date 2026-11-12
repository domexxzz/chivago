/**
 * App shell: tab bar, push-screen header, toast, and the global SOS banner.
 */

import React from 'react';
import { Animated, Image, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { ChevronLeft, House, Leaf, Map as MapIcon, MessageCircle, PawPrint, Shield, Sparkles } from 'lucide-react-native';
import { strings } from '@chivago/core';
import { color, gutter, headerGutter, layout, motion, onFill, radius, ruleStrong, ruleStrongTop, shadow } from '../theme/index.ts';
import { Body, Heading, Label, Thai } from './Type.tsx';
import { IconButton } from './Button.tsx';

/**
 * Declared in state/store.tsx and re-exported here rather than written twice.
 *
 * It WAS written twice - the same union in both files, with nothing keeping
 * them equal. Adding Home meant editing both, which is exactly the moment two
 * copies of one fact start to disagree.
 */
export type { TabKey } from '../state/store.tsx';
import type { TabKey } from '../state/store.tsx';
import { t } from '../i18n/locale.ts';
import travelHero from '../../assets/chivago-travel-hero-v2.png';
import aiGuideRobot from '../../assets/chivargo-ai-robot-v1.png';

const TAB_ICONS = {
  home: House, map: MapIcon, quests: Leaf, game: PawPrint, safety: Shield,
} as const;

const TAB_ORDER: TabKey[] = ['home', 'map', 'quests', 'game', 'safety'];

/**
 * Global door to the AI-guide mockup. It floats above, never inside, the
 * five-tab contract.
 *
 * FLOATING ABOVE THE TAB BAR IS NOT THE SAME AS FLOATING ABOVE NOTHING.
 *
 * At `bottom: 82` this sat on top of the rightmost door in Home's door row
 * and swallowed every tap meant for it. Measured on production at 375x812,
 * scrolled to the top, which is where somebody opening the app lands:
 *
 *   AI guide   x 289-359   y 652-730
 *   door row               y 700-796, six doors of 59
 *   last door  x 306-365 - inside the guide's x range from edge to edge
 *
 *   elementFromPoint on that door's icon returned "Open ChivarGo AI Guide".
 *   Scrolled down 120 it returned "Summon", so the door was never broken;
 *   it was covered, on the one screen position nobody has to scroll to.
 *
 * This is older than the door it was found on. With five doors they were 71
 * wide, which put the last one at x 294-365 and its centre at 329 - inside
 * 289-359 as well. `Deals` was unreachable there in the same way and nobody
 * noticed, because the same marketplace has a card lower down the screen.
 *
 * `bottom: 120` lifts it to y 614-692, clear of the row by 8. It then covers
 * 48 of the 212 points of the "see every place" link below the score, which
 * leaves 164 of that link tappable: a wide control losing its right quarter,
 * in exchange for a 59-wide door that had nothing left at all.
 *
 * WHAT THIS IS NOT: a rule. Home is dense from y 550 down and a fixed button
 * over a scrolling screen covers SOMETHING at every height - raising it
 * further only trades the link for the search field. The number is right for
 * the content Home has today, and a screen test cannot hold it there: this
 * harness renders what a screen says, never where it is. If the row above
 * the doors changes height, re-measure. `wide` is untouched: on the
 * dashboard layout the door row is at y 429 and this at 666, far apart.
 */
export function AiGuideButton({ onPress, wide = false }: { onPress: () => void; wide?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t({ en: 'Open ChivarGo AI Guide', th: 'เปิด ChivarGo AI Guide', zh: '打开 ChivarGo AI Guide' })}
      style={({ pressed }) => [
        shadow.md,
        {
          position: 'absolute',
          right: wide ? 28 : 16,
          // 120, not 82: see the note above. 82 put this on top of Home's
          // last door and ate the tap.
          bottom: wide ? 24 : 120,
          zIndex: 50,
          width: 70,
          height: 78,
          borderRadius: 35,
          alignItems: 'center',
          justifyContent: 'flex-end',
          transform: [{ scale: pressed ? 0.96 : 1 }],
        },
      ]}
    >
      <View
        style={{
          width: 60,
          height: 60,
          borderRadius: 30,
          alignItems: 'center',
          justifyContent: 'flex-end',
          paddingBottom: 6,
          backgroundColor: '#009FA3',
          borderWidth: 3,
          borderColor: '#FFFFFF',
          overflow: 'visible',
        }}
      >
        <Image
          source={aiGuideRobot}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
          style={{
            position: 'absolute',
            width: 62,
            height: 66,
            top: -22,
            left: -1,
          }}
        />
        <View style={{ position: 'absolute', right: 1, top: 3 }}>
          <Sparkles size={11} color="#FFE28A" fill="#FFE28A" strokeWidth={2} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
          <MessageCircle size={10} color="#FFFFFF" strokeWidth={2.2} />
          <Label size={9} tracking={0} colour="#FFFFFF" style={{ textTransform: 'none' }}>{t({ en: 'AI Guide', th: 'AI Guide', zh: 'AI Guide' })}</Label>
        </View>
      </View>
    </Pressable>
  );
}

/**
 * Shared Ocean Wave SVG backdrop used across headers, hero banners, and elevated cards.
 */
export function OceanBackdrop({
  subtle = false, compact = false,
}: { subtle?: boolean; compact?: boolean }) {
  const gradId = subtle ? 'sand' : compact ? 'oceanCompact' : 'ocean';
  return (
    <View pointerEvents="none" accessible={false} style={StyleSheet.absoluteFillObject}>
      <Svg width="100%" height="100%" viewBox="0 0 480 340" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="80%">
            <Stop offset="0" stopColor={subtle ? '#FFFFFF' : '#00B4D8'} />
            <Stop offset="1" stopColor={subtle ? '#EDF6F9' : '#004E64'} />
          </LinearGradient>
        </Defs>
        <Rect width="480" height="340" fill={`url(#${gradId})`} />
        <Path
          d="M0 250 Q100 200 220 270 T480 240 V340 H0Z"
          fill="#48CAE4"
          opacity={subtle ? 0.1 : compact ? 0.22 : 0.3}
        />
        <Path
          d="M0 285 Q120 225 260 290 T480 270 V340 H0Z"
          fill={compact ? '#90E0EF' : '#FFFFFF'}
          opacity={subtle ? 0.6 : compact ? 0.18 : 0.55}
        />
        <Path
          d="M0 307 Q120 265 260 310 T480 296 V340 H0Z"
          fill={compact ? '#CAF0F8' : '#EDF6F9'}
          opacity={subtle ? 0.8 : compact ? 0.16 : 1}
        />
      </Svg>
    </View>
  );
}

/**
 * The photographic layer shared by the app's primary headers.
 *
 * The image is bundled with the app, so a weak or offline connection never
 * turns the first impression into an empty grey box. The navy/teal veil is a
 * real accessibility layer rather than text shadow: every crop keeps white
 * labels readable, from a narrow phone to an ultrawide browser.
 */
export function TravelHeroBackdrop({
  compact = false,
  focalPoint = 'center',
}: {
  compact?: boolean;
  focalPoint?: 'left' | 'center' | 'right';
}) {
  const position = focalPoint === 'left' ? '20% center' : focalPoint === 'right' ? '80% center' : 'center';
  return (
    <View pointerEvents="none" accessible={false} style={StyleSheet.absoluteFillObject}>
      <Image
        source={travelHero}
        resizeMode="cover"
        style={[StyleSheet.absoluteFillObject, { width: '100%', height: '100%', objectPosition: position } as never]}
      />
      <View style={[StyleSheet.absoluteFillObject, { backgroundColor: compact ? 'rgba(0,55,73,0.66)' : 'rgba(0,48,70,0.52)' }]} />
      <Svg width="100%" height="100%" viewBox="0 0 480 260" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="travelVeil" x1="0%" y1="15%" x2="100%" y2="90%">
            <Stop offset="0" stopColor="#003B52" stopOpacity={compact ? 0.78 : 0.7} />
            <Stop offset="0.58" stopColor="#006B7D" stopOpacity={compact ? 0.42 : 0.24} />
            <Stop offset="1" stopColor="#00A9C6" stopOpacity={compact ? 0.28 : 0.08} />
          </LinearGradient>
        </Defs>
        <Rect width="480" height="260" fill="url(#travelVeil)" />
        <Path d="M0 224 Q92 188 205 226 T480 214 V260 H0Z" fill="#48CAE4" opacity="0.25" />
        <Path d="M0 242 Q110 215 250 245 T480 232 V260 H0Z" fill="#EDF6F9" opacity="0.18" />
      </Svg>
    </View>
  );
}

/**
 * Five tabs on a soft white surface. Ocean blue and a dot mark the active tab.
 *
 * TWO SHAPES, ONE BAR. On a phone it is the full-width bar wedged against the
 * bottom edge, which is where a thumb is. A wide window has no thumb and no
 * bottom edge worth filling - a bar stretched across 1900 px puts five icons
 * in a corner of an empty white stripe - so past `WIDE_TABS_AT` the same five
 * become a centred pill floating clear of the content. Same tabs, same order,
 * same behaviour: only the container moves.
 */
export const WIDE_TABS_AT = 940;

export function TabBar({
  active, onChange,
}: { active: TabKey; onChange: (tab: TabKey) => void }) {
  const { width } = useWindowDimensions();
  const floating = width >= WIDE_TABS_AT;
  return (
    <View
      style={floating ? {
        flexDirection: 'row', height: layout.tabBarHeight + 6,
        backgroundColor: '#FFFFFF',
        alignSelf: 'center', width: 540, maxWidth: '94%',
        marginBottom: 18, borderRadius: 28,
        borderWidth: layout.ruleHair, borderColor: '#D4E0EC',
        shadowColor: '#005BBB', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.12, shadowRadius: 20, elevation: 8,
      } : {
        flexDirection: 'row', height: layout.tabBarHeight + 8, backgroundColor: '#FFFFFF',
        borderTopWidth: layout.ruleHair, borderTopColor: '#D4E0EC',
        borderTopLeftRadius: 27, borderTopRightRadius: 27,
        shadowColor: '#005BBB', shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 6,
      }}
    >
      {TAB_ORDER.map((key) => {
        const isActive = key === active;
        const Icon = TAB_ICONS[key];
        const fg = isActive ? '#005BBB' : '#52749D';
        return (
          <Pressable
            key={key}
            onPress={() => onChange(key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={t(strings.tabs[key])}
            style={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              paddingTop: 6,
              gap: 3,
            }}
          >
            <Icon size={layout.tabIconSize + 2} color={fg} strokeWidth={isActive ? 2.3 : 1.9} />
            <Label size={10} tracking={0.06} colour={fg} style={{ fontWeight: isActive ? '700' : '500' }}>
              {t(strings.tabs[key])}
            </Label>
            <View style={{ width: 32, height: 3.5, borderRadius: 2, backgroundColor: isActive ? '#005EB9' : 'transparent', marginTop: 2 }} />
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * The same five destinations become a rail once a screen is wide enough to
 * keep them visible beside the content. This is not a second navigation
 * model: order, labels, state and callbacks all come from the mobile bar.
 */
export function NavigationRail({
  active, onChange,
}: { active: TabKey; onChange: (tab: TabKey) => void }) {
  const { width } = useWindowDimensions();
  const expanded = width >= 1200;
  return (
    <View
      accessibilityRole="tablist"
      style={{
        width: expanded ? 220 : 88,
        marginVertical: 18,
        marginLeft: 18,
        paddingHorizontal: expanded ? 12 : 10,
        paddingVertical: 16,
        backgroundColor: 'rgba(255,255,255,0.96)',
        borderRadius: 28,
        borderWidth: 1,
        borderColor: '#D7E8EF',
        ...shadow.card,
      }}
    >
      <View style={{ paddingHorizontal: expanded ? 10 : 0, paddingBottom: 22, alignItems: expanded ? 'flex-start' : 'center' }}>
        <Heading size={expanded ? 20 : 14} colour={color.brandDeep}>ChivarGo</Heading>
        {expanded ? <Label size={9} tracking={0.14} colour={color.neutral600} style={{ marginTop: 3 }}>{t({ en: 'EXPLORE TOGETHER', th: 'ออกเดินทางไปด้วยกัน', zh: '一起探索' })}</Label> : null}
      </View>
      <View style={{ gap: 8 }}>
        {TAB_ORDER.map((key) => {
          const selected = key === active;
          const Icon = TAB_ICONS[key];
          return (
            <Pressable
              key={key}
              onPress={() => onChange(key)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={t(strings.tabs[key])}
              style={({ pressed }) => ({
                minHeight: 52,
                paddingHorizontal: expanded ? 14 : 0,
                borderRadius: 18,
                flexDirection: expanded ? 'row' : 'column',
                alignItems: 'center',
                justifyContent: expanded ? 'flex-start' : 'center',
                gap: expanded ? 12 : 4,
                backgroundColor: selected ? color.brand : pressed ? color.brandSoft : 'transparent',
              })}
            >
              <Icon size={21} color={selected ? onFill.brand : color.neutral700} strokeWidth={selected ? 2.4 : 1.9} />
              <Label size={10} tracking={0.05} colour={selected ? onFill.brand : color.neutral700}>{t(strings.tabs[key])}</Label>
            </Pressable>
          );
        })}
      </View>
      {expanded ? (
        <View style={{ marginTop: 'auto', padding: 12, borderRadius: 16, backgroundColor: color.brandSoft }}>
          <Label size={9} tracking={0.1} colour={color.brand}>ChivarGo</Label>
          <Body size={13} colour={color.neutral700} style={{ marginTop: 4 }}>
            {t({ en: 'Explore local. Travel safely.', th: 'เที่ยวท้องถิ่น เดินทางปลอดภัย', zh: '探索本地，安心旅行。' })}
          </Body>
        </View>
      ) : null}
    </View>
  );
}

/**
 * The header on a pushed screen: back control, uppercase context label.
 * Tab screens do not use this - they carry their own 18px header block.
 */
export function PushHeader({
  context, onBack, right,
}: { context: string; onBack: () => void; right?: React.ReactNode }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: headerGutter,
        paddingVertical: 16,
        backgroundColor: '#028090',
        borderBottomLeftRadius: 24,
        borderBottomRightRadius: 24,
        overflow: 'hidden',
        shadowColor: '#004E64',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 10,
        elevation: 3,
      }}
    >
      <TravelHeroBackdrop compact focalPoint="right" />
      <IconButton inverted onPress={onBack} accessibilityLabel={t(strings.common.back)}>
        <ChevronLeft size={18} color="#FFFFFF" strokeWidth={2} />
      </IconButton>
      <Label size={10} tracking={0.16} colour="#E8FBFF" style={{ flex: 1 }}>{context}</Label>
      {right}
    </View>
  );
}

/**
 * Toast. Ink fill, bg text, clears the tab bar, auto-dismisses at 2200ms.
 * Announced to screen readers, since a toast that only exists visually is
 * invisible to anyone using VoiceOver.
 */
export function Toast({ message }: { message: string | null }) {
  const opacity = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.timing(opacity, {
      toValue: message ? 1 : 0,
      duration: 160,
      useNativeDriver: true,
    }).start();
  }, [message, opacity]);

  if (!message) return null;

  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      style={[
        shadow.md,
        {
          position: 'absolute',
          left: layout.toastInset,
          right: layout.toastInset,
          bottom: layout.toastBottom,
          backgroundColor: color.text,
          paddingVertical: 12,
          paddingHorizontal: 14,
          borderRadius: radius.md,
          opacity,
        },
      ]}
    >
      <Body size={13} colour={onFill.text}>{message}</Body>
    </Animated.View>
  );
}

/**
 * The global SOS banner.
 *
 * Handoff open question 5, resolved AGAINST the prototype: a live alert must
 * follow the user everywhere, not vanish when they navigate. This sits above
 * the tab bar on every screen while an alert is dispatching.
 */
export function SosBanner({ onPress }: { onPress: () => void }) {
  const pulse = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: motion.sosPulseMs / 2, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: motion.sosPulseMs / 2, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="alert"
      accessibilityLabel={`${strings.safety.activeBanner.en}. ${strings.safety.activeBanner.th}`}
      /*
       * Coral, and this was the palette's worst bug. The banner reads "SOS
       * active - your location is being shared" and it was painted in the
       * same green that means a host verified something: the success colour,
       * on a live emergency, pulsing. Whatever else red means to a traveller
       * in trouble, it does not mean everything is fine.
       */
      style={{ backgroundColor: color.accent2, paddingVertical: 10, paddingHorizontal: gutter }}
    >
      <Animated.View style={{ opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.72] }) }}>
        {/* Both languages, always: a responder may be reading this phone. */}
        <Heading size={13} colour={onFill.accent2}>{strings.safety.activeBanner.en}</Heading>
        <Thai always size={11} colour={onFill.accent2} style={{ opacity: 0.9, marginTop: 2 }}>
          {strings.safety.activeBanner.th}
        </Thai>
      </Animated.View>
    </Pressable>
  );
}

/**
 * Screen entry animation: opacity 0->1 with a 10px rise, 220ms.
 * Respects reduce-motion by skipping straight to the settled state.
 */
export function ScreenTransition({
  screenKey, children, reduceMotion = false,
}: { screenKey: string; children: React.ReactNode; reduceMotion?: boolean }) {
  const progress = React.useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;

  React.useEffect(() => {
    if (reduceMotion) { progress.setValue(1); return; }
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: motion.screenEnterMs,
      useNativeDriver: true,
    }).start();
  }, [screenKey, progress, reduceMotion]);

  return (
    <Animated.View
      style={{
        flex: 1,
        opacity: progress,
        transform: [
          { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [motion.screenEnterTranslate, 0] }) },
        ],
      }}
    >
      {children}
    </Animated.View>
  );
}

export { ruleStrong };
