/**
 * Text primitives.
 *
 * The app speaks one language at a time (see `i18n/locale.ts`): every string
 * that has both goes through `t()`. In Thai these primitives add the Thai
 * LEADING - tone marks stack above the x-height and clip at Latin line-height
 * - and nothing else. They do NOT switch typeface: the heading face in
 * `packages/tokens` is IBM Plex Sans Thai 700, which carries both scripts.
 * The first version of this file swapped every Heading and Label to the body
 * face on the belief that "Archivo carries no Thai glyphs", which had been
 * true two commits before the tokens replaced Archivo; the effect was that
 * every heading, numeral, button face and the SOS control lost their weight
 * the moment the language changed, and nobody opened the app in Thai to see.
 * The Thai caption survives for the sites that keep both languages on purpose
 * - the SOS surfaces - and for literal copy that has not been paired yet,
 * which it shows only when the app is in Thai.
 */

import React from 'react';
import { Text, View, type TextStyle, type ViewStyle } from 'react-native';
import type { Bilingual } from '@chivago/core';
import { color, font, label as labelStyle, thaiText, type } from '../theme/index.ts';
import { getLocale, t } from '../i18n/locale.ts';

/** Thai line-height. Tone marks stack above the x-height and clip at Latin leading. */
const THAI_LEADING = 1.45;

/** In Thai, the Thai leading; otherwise nothing to add. The face stays. */
const thaiFace = (size: number): TextStyle | null =>
  getLocale() === 'th' ? { lineHeight: Math.round(size * THAI_LEADING) } : null;

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
        thaiFace(size),
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

/**
 * The Thai caption line.
 *
 * Shown when the app is in Thai, or `always`. `always` is for what an
 * emergency responder might read off a traveller's phone - the SOS banner,
 * the Safety screen - where the second language is the point, not padding.
 */
export function Thai({
  children, size = 11, colour = color.neutral700, style, always = false,
}: { children: React.ReactNode; size?: number; colour?: string; style?: TextStyle; always?: boolean }) {
  if (!always && getLocale() !== 'th') return null;
  return <Text style={[thaiText(size, colour), style]}>{children}</Text>;
}

/** Uppercase micro-label. The system's workhorse for section kickers. */
export function Label({
  children, size = 10, tracking = 0.14, colour = color.neutral700, style,
}: {
  children: React.ReactNode; size?: 9 | 10 | 11; tracking?: number;
  colour?: string; style?: TextStyle;
}) {
  return <Text style={[labelStyle(size, tracking, colour), thaiFace(size), style]}>{children}</Text>;
}

/**
 * A title in the current language. It used to be the English with the Thai
 * captioned beneath - the single most repeated pattern in the design, and the
 * single biggest reason every screen ran long.
 */
export function BilingualTitle({
  value, size = 26, colour = color.text, tracking, style,
}: {
  value: Bilingual; size?: number; colour?: string;
  /** Kept for callers; nothing is captioned any more. */
  thaiSize?: number; gap?: number;
  tracking?: number; style?: ViewStyle;
}) {
  return (
    <View style={style}>
      <Heading size={size} colour={colour} tracking={tracking}>{t(value)}</Heading>
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
