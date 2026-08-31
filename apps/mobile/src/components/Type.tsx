/**
 * Bilingual text primitives.
 *
 * The app shows English AND Thai together - English as the primary line, Thai
 * as a caption underneath. Every screen uses these rather than raw <Text>, so
 * the two scripts can never accidentally share a font or a line-height.
 */

import React from 'react';
import { Text, View, type TextStyle, type ViewStyle } from 'react-native';
import type { Bilingual } from '@chivago/core';
import { color, font, label as labelStyle, thaiText, type } from '../theme/index.ts';

interface HeadingProps {
  children: React.ReactNode;
  style?: TextStyle | TextStyle[];
  size?: number;
  colour?: string;
  tracking?: number;
}

/** Archivo 800. Every heading, list title and display numeral. */
export function Heading({ children, style, size = 26, colour = color.text, tracking }: HeadingProps) {
  return (
    <Text
      style={[
        { fontFamily: font.heading, fontSize: size, color: colour, lineHeight: Math.round(size * 1.12) },
        tracking !== undefined && { letterSpacing: tracking },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

interface BodyProps {
  children: React.ReactNode;
  style?: TextStyle | TextStyle[];
  size?: 13 | 14;
  colour?: string;
}

export function Body({ children, style, size = 14, colour = color.neutral800 }: BodyProps) {
  return (
    <Text style={[{ fontFamily: font.body, fontSize: size, color: colour, lineHeight: Math.round(size * 1.5) }, style]}>
      {children}
    </Text>
  );
}

/** The Thai caption line. Noto Sans Thai, 1.45 line-height. */
export function Thai({
  children, size = 11, colour = color.neutral700, style,
}: { children: React.ReactNode; size?: number; colour?: string; style?: TextStyle }) {
  return <Text style={[thaiText(size, colour), style]}>{children}</Text>;
}

/** Uppercase micro-label. The system's workhorse for section kickers. */
export function Label({
  children, size = 10, tracking = 0.14, colour = color.neutral700, style,
}: {
  children: React.ReactNode; size?: 9 | 10 | 11; tracking?: number;
  colour?: string; style?: TextStyle;
}) {
  return <Text style={[labelStyle(size, tracking, colour), style]}>{children}</Text>;
}

/**
 * An English title with its Thai caption underneath - the single most repeated
 * pattern in the design. Extracted so the pairing (sizes, gap, colours) is
 * defined once.
 */
export function BilingualTitle({
  value, size = 26, colour = color.text, thaiSize = 11, tracking, gap = 3, style,
}: {
  value: Bilingual; size?: number; colour?: string; thaiSize?: number;
  tracking?: number; gap?: number; style?: ViewStyle;
}) {
  return (
    <View style={style}>
      <Heading size={size} colour={colour} tracking={tracking}>{value.en}</Heading>
      {value.th ? <Thai size={thaiSize} style={{ marginTop: gap }}>{value.th}</Thai> : null}
    </View>
  );
}

/**
 * A display numeral in the accent.
 *
 * Uses accent-700 at paragraph sizes and accent at display sizes, enforcing
 * Modernist's contrast rule in one place rather than trusting every caller to
 * remember it. The raw accent on the ground is only >= 3:1 - fine for a 44px
 * score, not for 13px text.
 */
export function AccentNumeral({
  children, size, style,
}: { children: React.ReactNode; size: number; style?: TextStyle }) {
  return (
    <Text
      style={[
        {
          fontFamily: font.heading,
          fontSize: size,
          color: color.accent700,
          lineHeight: Math.round(size * 1.05),
        },
        size >= 40 && { letterSpacing: -size * 0.02 },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

export { type };
