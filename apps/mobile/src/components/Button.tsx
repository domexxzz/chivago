/**
 * Buttons.
 *
 * A capsule with a centred label and, on the primary, a trailing arrow. This
 * was the Modernist flush-left button - text at the left edge, icon pushed
 * right - until the look moved (docs/36): the reference the product now
 * follows is a travel app of white cards and teal capsules, and a flush-left
 * label inside a capsule reads as a mistake. The rule that survives is the
 * one about colour: the primary is the brand speaking, never the evidence
 * green.
 */

import React from 'react';
import { Pressable, View, type ViewStyle } from 'react-native';
import { ArrowRight } from 'lucide-react-native';
import { color, layout, onFill, radius } from '../theme/index.ts';
import { Body, Heading, Thai } from './Type.tsx';
import { getLocale } from '../i18n/locale.ts';

type Variant = 'primary' | 'secondary' | 'ghost';

interface ButtonProps {
  label: string;
  /** The Thai for `label`. Shown INSTEAD of it when the app is in Thai. */
  thai?: string;
  /**
   * Keep both languages on the face of the button. Only for what an emergency
   * responder might read off a traveller's phone.
   */
  bilingual?: boolean;
  onPress: () => void;
  variant?: Variant;
  height?: number;
  disabled?: boolean;
  /** Trailing icon. Defaults to arrow-right on primary. */
  icon?: React.ReactNode | null;
  style?: ViewStyle;
  /** Inverts to the bg colour, for use on an accent fill. */
  inverted?: boolean;
  /** What a screen reader says. Required in practice when `label` is empty. */
  accessibilityLabel?: string;
}

export function Button({
  label, thai, onPress, variant = 'primary', height = 48,
  disabled = false, icon, style, inverted = false, accessibilityLabel, bilingual = false,
}: ButtonProps) {
  const [pressed, setPressed] = React.useState(false);
  // One language at a time (see i18n/locale.ts). The Thai replaces the
  // English rather than sitting beside it.
  const text = !bilingual && thai && getLocale() === 'th' ? thai : label;
  const caption = bilingual ? thai : undefined;

  const palette = (() => {
    if (inverted) {
      return { bg: color.bg, fg: color.text, border: color.bg };
    }
    switch (variant) {
      case 'primary':
        // BRAND, not green. The primary button is "start something", and
        // green in this product means "a host verified this". A green Start
        // button teaches the traveller that green is just how buttons look,
        // and the Green Points figure loses the only thing it had. It was
        // orange for the same reason; the teal is the reference's, and the
        // measured white-on-brand pair comes from onFill.
        return pressed
          ? { bg: color.brandDeep, fg: onFill.brandDeep, border: 'transparent' }
          : { bg: color.brand, fg: onFill.brand, border: 'transparent' };
      case 'secondary':
        return { bg: pressed ? color.neutral200 : color.surface, fg: color.brand, border: color.neutral300 };
      case 'ghost':
        // A text link is the app speaking, so it is brand blue.
        return { bg: 'transparent', fg: color.brand, border: 'transparent' };
    }
  })();

  const trailing =
    icon === null ? null : (icon ?? (variant === 'primary' ? <ArrowRight size={18} color={palette.fg} strokeWidth={2} /> : null));

  if (variant === 'ghost') {
    // A ghost with an icon and no label is an icon button - the camera tile on
    // the proof form. It used to render nothing at all: the icon was assembled
    // above and then never placed, so the tile was an empty 64px square with
    // no name for a screen reader.
    return (
      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? (caption ? `${label}. ${caption}` : text || undefined)}
        style={[{ paddingVertical: 4, paddingHorizontal: 4, alignSelf: 'flex-start' }, disabled && { opacity: layout.disabledOpacity }, style]}
      >
        {text ? <Heading size={13} colour={palette.fg}>{text}</Heading> : null}
        {trailing}
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
      accessibilityLabel={accessibilityLabel ?? (caption ? `${label}. ${caption}` : text)}
      style={[
        {
          height,
          flexDirection: 'row',
          alignItems: 'center',
          // Centred in a capsule, with the arrow beside the label.
          justifyContent: 'center',
          gap: 8,
          paddingHorizontal: 20,
          backgroundColor: palette.bg,
          borderWidth: variant === 'secondary' ? 1 : 0,
          borderColor: palette.border,
          borderRadius: radius.lg,
        },
        disabled && { opacity: layout.disabledOpacity },
        style,
      ]}
    >
      <Heading size={16} colour={palette.fg}>{text}</Heading>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {caption ? <Thai always size={12} colour={palette.fg}>{caption}</Thai> : null}
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
