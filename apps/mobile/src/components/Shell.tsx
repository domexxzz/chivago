/**
 * App shell: tab bar, push-screen header, toast, and the global SOS banner.
 */

import React from 'react';
import { Animated, Pressable, View } from 'react-native';
import { ChevronLeft, House, Leaf, Map as MapIcon, Shield, Wallet } from 'lucide-react-native';
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
  home: House, map: MapIcon, quests: Leaf, wallet: Wallet, safety: Shield,
} as const;

const TAB_ORDER: TabKey[] = ['home', 'map', 'quests', 'wallet', 'safety'];

/**
 * Five tabs, 66px, 2px ink top rule.
 * Active = solid ink fill with bg glyph and label. Inactive = transparent with
 * neutral-700. The fill is the whole cell, not a pill - Modernist has no radii.
 */
export function TabBar({
  active, onChange,
}: { active: TabKey; onChange: (tab: TabKey) => void }) {
  return (
    <View
      style={{
        flexDirection: 'row', height: layout.tabBarHeight, backgroundColor: color.surface,
        borderTopWidth: layout.ruleHair, borderTopColor: color.neutral300,
      }}
    >
      {TAB_ORDER.map((key) => {
        const isActive = key === active;
        const Icon = TAB_ICONS[key];
        // The active tab is the brand speaking, on the white bar; the rest
        // are quiet. No filled block: the reference's bar is icons on white.
        const fg = isActive ? color.brand : color.neutral600;
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
        paddingVertical: 12,
      }}
    >
      <IconButton onPress={onBack} accessibilityLabel={t(strings.common.back)}>
        <ChevronLeft size={18} color={color.text} strokeWidth={2} />
      </IconButton>
      <Label size={10} tracking={0.16} style={{ flex: 1 }}>{context}</Label>
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
