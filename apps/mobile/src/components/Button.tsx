/**
 * Buttons.
 *
 * The Modernist signature: a button wider than its label starts the text at the
 * left padding edge, with any trailing icon pushed to the right. Centred labels
 * are forbidden by the system, so `justifyContent: space-between` is baked in
 * here rather than left to each caller.
 */

import React from 'react';
import { Pressable, View, type ViewStyle } from 'react-native';
import { ArrowRight } from 'lucide-react-native';
import { color, layout, onFill, radius } from '../theme/index.ts';
import { Body, Heading, Thai } from './Type.tsx';

type Variant = 'primary' | 'secondary' | 'ghost';

interface ButtonProps {
  label: string;
  /** Optional Thai caption, right-aligned inside the button. */
  thai?: string;
  onPress: () => void;
  variant?: Variant;
  height?: number;
  disabled?: boolean;
  /** Trailing icon. Defaults to arrow-right on primary. */
  icon?: React.ReactNode | null;
  style?: ViewStyle;
  /** Inverts to the bg colour, for use on an accent fill. */
  inverted?: boolean;
}

export function Button({
  label, thai, onPress, variant = 'primary', height = 48,
  disabled = false, icon, style, inverted = false,
}: ButtonProps) {
  const [pressed, setPressed] = React.useState(false);

  const palette = (() => {
    if (inverted) {
      return { bg: color.bg, fg: color.text, border: color.bg };
    }
    switch (variant) {
      case 'primary':
        // ORANGE, not green. The primary button is "start something", and
        // green in this product means "a host verified this". A green Start
        // button teaches the traveller that green is just how buttons look,
        // and the Green Points figure loses the only thing it had.
        //
        // The label colour travels WITH the fill rather than staying put:
        // ink on the vivid orange, white on the pressed dark one. Both come
        // from onFill, so the press state cannot land on the 3.04:1 pairing
        // that holding one label colour across both would produce.
        return pressed
          ? { bg: color.ctaDeep, fg: onFill.ctaDeep, border: 'transparent' }
          : { bg: color.cta, fg: onFill.cta, border: 'transparent' };
      case 'secondary':
        return { bg: pressed ? color.neutral200 : 'transparent', fg: color.text, border: color.divider };
      case 'ghost':
        // A text link is the app speaking, so it is brand blue.
        return { bg: 'transparent', fg: color.brand, border: 'transparent' };
    }
  })();

  const trailing =
    icon === null ? null : (icon ?? (variant === 'primary' ? <ArrowRight size={18} color={palette.fg} strokeWidth={2} /> : null));

  if (variant === 'ghost') {
    return (
      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        style={[{ paddingVertical: 4, paddingHorizontal: 4, alignSelf: 'flex-start' }, disabled && { opacity: layout.disabledOpacity }, style]}
      >
        <Heading size={13} colour={palette.fg}>{label}</Heading>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={thai ? `${label}. ${thai}` : label}
      style={[
        {
          height,
          flexDirection: 'row',
          alignItems: 'center',
          // Flush left, never centred. This is the system signature.
          justifyContent: 'space-between',
          paddingLeft: 18,
          paddingRight: 16,
          backgroundColor: palette.bg,
          borderWidth: variant === 'secondary' ? 1 : 0,
          borderColor: palette.border,
          borderRadius: radius.md,
        },
        disabled && { opacity: layout.disabledOpacity },
        style,
      ]}
    >
      <Heading size={16} colour={palette.fg}>{label}</Heading>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {thai ? <Thai size={12} colour={palette.fg}>{thai}</Thai> : null}
        {trailing}
      </View>
    </Pressable>
  );
}

/** A 32x32 square icon button. Used for the push-screen back control. */
export function IconButton({
  children, onPress, size = 32, accessibilityLabel,
}: {
  children: React.ReactNode; onPress: () => void; size?: number; accessibilityLabel: string;
}) {
  const [pressed, setPressed] = React.useState(false);
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      // 32px is below the 44px minimum touch target, so the hit area is
      // expanded rather than the control - the design's proportions hold and
      // the control is still reachable.
      hitSlop={8}
      style={{
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: color.divider,
        borderRadius: radius.md,
        backgroundColor: pressed ? color.neutral200 : 'transparent',
      }}
    >
      {children}
    </Pressable>
  );
}

/**
 * A wrapping tag chip. 1px divider border, uppercase 11px.
 *
 * `points` was called `accent`, and its one caller passes `isPointsRelated` -
 * so a tag meaning "you COULD earn points here" was rendering in the colour
 * that means a host already verified something. Gold: it is the game layer,
 * and it is a promise rather than a receipt.
 */
export function Tag({
  children, points = false,
}: { children: React.ReactNode; points?: boolean }) {
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: points ? color.gold : color.divider,
        borderRadius: radius.sm,
        paddingVertical: 3,
        paddingHorizontal: 8,
      }}
    >
      <Body size={13} colour={points ? color.goldDeep : color.neutral700} style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.66, lineHeight: 14 }}>
        {children}
      </Body>
    </View>
  );
}
