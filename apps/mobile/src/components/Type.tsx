/**
 * Text primitives.
 *
 * The app speaks one language at a time (see `i18n/locale.ts`): every string
 * that has both goes through `t()`. In Thai and Chinese these primitives add
 * that script's LEADING - Thai tone marks clip at Latin line-height, and Han
 * glyphs fill the em box so consecutive lines touch - and nothing else. They
 * do NOT switch typeface: the heading face in
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
import { getLocale, t, type Locale } from '../i18n/locale.ts';

/**
 * Line-height per script, as a multiple of the font size.
 *
 * Thai: tone marks stack above the x-height and clip at Latin leading.
 *
 * Chinese: Han glyphs fill the full em box, top to bottom, where Latin
 * lowercase leaves daylight above and below. At Latin leading, consecutive
 * lines of Hanzi touch. 1.5 is the floor most CJK type guidance gives for
 * body text, and it is a little looser than the Thai because the Thai is
 * buying room for one mark while this is buying room for the whole line.
 */
const SCRIPT_LEADING: Partial<Record<Locale, number>> = { th: 1.45, zh: 1.5 };

/** The script's leading, where it needs one; otherwise nothing to add. The face stays. */
const scriptLeading = (size: number): TextStyle | null => {
  const factor = SCRIPT_LEADING[getLocale()];
  return factor ? { lineHeight: Math.round(size * factor) } : null;
};

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
        scriptLeading(size),
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
  /**
   * Two sizes, and 13 is the floor on purpose.
   *
   * Thai stacks a tone mark above the consonant and a vowel below it, so a
   * line of Thai needs more height than the same line of English to stay
   * readable. Below 13 the marks start touching. A supporting line that
   * wants to be smaller than the body text is a `Label`, which has its own
   * floor at 9 because it is set in caps with tracking.
   */
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
 * the Safety screen, the emergency numbers - where the second language is
 * the point, not padding. See the rule in `i18n/locale.ts`.
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
  return <Text style={[labelStyle(size, tracking, colour), scriptLeading(size), style]}>{children}</Text>;
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
