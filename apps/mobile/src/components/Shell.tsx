/**
 * App shell: tab bar, push-screen header, toast, and the global SOS banner.
 */

import React from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { ChevronLeft, House, Leaf, Map as MapIcon, PawPrint, Shield } from 'lucide-react-native';
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

const TAB_ICONS = {
  home: House, map: MapIcon, quests: Leaf, game: PawPrint, safety: Shield,
} as const;

const TAB_ORDER: TabKey[] = ['home', 'map', 'quests', 'game', 'safety'];

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
 * Five tabs on a soft white surface. Ocean blue and a dot mark the active tab.
 */
export function TabBar({
  active, onChange,
}: { active: TabKey; onChange: (tab: TabKey) => void }) {
  return (
    <View
      style={{
        flexDirection: 'row', height: layout.tabBarHeight + 4, backgroundColor: 'rgba(255,255,255,0.96)',
        borderTopWidth: layout.ruleHair, borderTopColor: '#DCEFF5',
        borderTopLeftRadius: 20, borderTopRightRadius: 20,
        shadowColor: '#0077B6', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.06, shadowRadius: 14, elevation: 5,
      }}
    >
      {TAB_ORDER.map((key) => {
        const isActive = key === active;
        const Icon = TAB_ICONS[key];
        // The active tab is the brand speaking, on the white bar; the rest
        // are quiet. No filled block: the reference's bar is icons on white.
        const fg = isActive ? '#0077B6' : '#48616F';
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
              gap: layout.tabLabelGap,
            }}
          >
            <Icon size={layout.tabIconSize + 2} color={fg} strokeWidth={isActive ? 2.4 : 2} />
            <Label size={9} tracking={0.1} colour={fg}>{t(strings.tabs[key])}</Label>
            <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: isActive ? '#00B4D8' : 'transparent' }} />
          </Pressable>
        );
      })}
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
      <OceanBackdrop compact />
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
