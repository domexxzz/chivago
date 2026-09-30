/**
 * Loading, error and empty states.
 *
 * The prototype has none of these - it is a self-contained demo. A real app on
 * a beach with one bar of signal spends real time in all three, so they are
 * first-class here rather than an afterthought.
 */

import React from 'react';
import { ActivityIndicator, Animated, View, type DimensionValue } from 'react-native';
import { strings } from '@chivago/core';
import { color, gutter, radius } from '../theme/index.ts';
import { Body, Label } from './Type.tsx';
import { Button } from './Button.tsx';
import { useReduceMotion } from './reduce-motion.ts';
import { t } from '../i18n/locale.ts';

export function LoadingState({ label }: { label?: string }) {
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label ?? t(strings.common.loading)}
      style={{ paddingVertical: 48, alignItems: 'center', gap: 12 }}
    >
      <ActivityIndicator color={color.brand} />
      <Label size={10} tracking={0.14}>{label ?? t(strings.common.loading)}</Label>
    </View>
  );
}

/**
 * An error the user can act on.
 * Never shows a status code or a stack - it tells them what happened and gives
 * them the one button that might fix it.
 */
export function ErrorState({
  message, onRetry,
}: { message: string; onRetry?: () => void }) {
  return (
    <View style={{ paddingHorizontal: gutter, paddingVertical: 32 }}>
      <Body colour={color.text}>{message}</Body>

      {onRetry ? (
        <Button
          label={t(strings.common.retry)}
          onPress={onRetry}
          variant="secondary"
          height={44}
          style={{ marginTop: 16 }}
        />
      ) : null}
    </View>
  );
}

export function EmptyState({ en, th }: { en: string; th: string }) {
  return (
    <View style={{ paddingHorizontal: gutter, paddingVertical: 40 }}>
      <Body colour={color.neutral700}>{t({ en, th })}</Body>
    </View>
  );
}

/**
 * One grey bar that breathes while its content loads.
 *
 * A centred spinner tells a traveller on one bar of signal only "wait"; a
 * skeleton the SHAPE of what is coming tells them what to expect and holds the
 * layout still, so nothing jumps when the real rows land. It breathes rather
 * than shimmers - one property, opacity - and holds STILL for anyone who asked
 * their system for less motion (see reduce-motion.ts).
 */
function Skeleton({ width, height, style }: { width: DimensionValue; height: number; style?: object }) {
  const still = useReduceMotion();
  const pulse = React.useRef(new Animated.Value(0.45)).current;
  React.useEffect(() => {
    if (still) return undefined;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0.45, duration: 700, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [still, pulse]);
  return (
    <Animated.View
      style={[
        { width, height, borderRadius: radius.sm, backgroundColor: color.neutral200, opacity: still ? 0.6 : pulse },
        style,
      ]}
    />
  );
}

/**
 * A list's worth of skeleton rows, shaped like a listing: a kicker, a title,
 * a supporting line. Announced to a screen reader as loading, so it replaces a
 * spinner without losing what the spinner said.
 */
export function SkeletonList({ rows = 4 }: { rows?: number }) {
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={t(strings.common.loading)}
      style={{ paddingHorizontal: gutter, paddingTop: 8 }}
    >
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i} style={{ paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: color.neutral200 }}>
          <Skeleton width={64} height={9} />
          <Skeleton width="70%" height={15} style={{ marginTop: 8 }} />
          <Skeleton width="45%" height={12} style={{ marginTop: 8 }} />
        </View>
      ))}
    </View>
  );
}
