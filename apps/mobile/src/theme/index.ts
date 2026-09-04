/**
 * The Modernist system, expressed as React Native primitives.
 *
 * Everything here reads from @chivago/tokens. If a value is not in the tokens,
 * it does not belong in a component - add it to the token sheet first.
 */

import { StyleSheet, type TextStyle, type ViewStyle } from 'react-native';
import {
  color, font, gutter, headerGutter, layout, microLabel, motion, onFill, radius, shadow, space,
  THAI_LINE_HEIGHT_RATIO, type,
} from '@chivago/tokens';

export {
  color, font, gutter, headerGutter, layout, microLabel, motion, onFill, radius, shadow, space, type,
};

/**
 * The two currencies, coloured by the one thing that separates them.
 *
 * Green Points are host-verified; Trip Points are self-verified. That is the
 * whole distinction the product rests on, and every reward badge, ledger row
 * and market price rendered both of them in the SAME GREEN - so a traveller
 * looking at "+120 T" saw the colour that means a host checked it, and nobody
 * had checked anything.
 *
 * A function rather than a ternary at each call site, because the ternary was
 * already copied to four screens and had drifted at two of them.
 *
 * `fill` is a background, `text` is a label on the page, `on` is the label
 * that goes ON the fill - which differ, because bright gold carries ink and
 * green carries white.
 */
export const currency = {
  green: { fill: color.accent, text: color.accent700, on: onFill.accent },
  trip: { fill: color.gold, text: color.goldDeep, on: onFill.gold },
} as const;

export type CurrencyKey = keyof typeof currency;

/** Tolerates the wire's string type without widening every caller. */
export const currencyTone = (c: string) => (c === 'green' ? currency.green : currency.trip);

/**
 * A section rule. This was the Modernist 2px ink rule - "it never softens
 * into a hairline" - until the look moved (docs/36): on a page of white
 * cards a black bar reads as a mistake, so the strong rule is a hairline in
 * the neutral the cards are edged with. The name stays so every caller
 * still means "a section boundary"; what a boundary looks like is decided
 * here, once.
 */
export const ruleStrong: ViewStyle = {
  borderBottomWidth: layout.ruleHair,
  borderBottomColor: color.neutral300,
};

export const ruleStrongTop: ViewStyle = {
  borderTopWidth: layout.ruleHair,
  borderTopColor: color.neutral300,
};

/** A 1px row separator. */
export const ruleHair: ViewStyle = {
  borderBottomWidth: layout.ruleHair,
  borderBottomColor: color.neutral300,
};

/**
 * Thai text needs a looser line-height than Latin and its own family, because
 * Archivo carries no Thai glyphs. Never share a line-height across scripts.
 */
export const thaiText = (size = 11, colour: string = color.neutral700): TextStyle => ({
  fontFamily: font.thai,
  fontSize: size,
  lineHeight: Math.round(size * THAI_LINE_HEIGHT_RATIO),
  color: colour,
});

/** An uppercase micro-label. size 9-11, tracking 0.10-0.16em. */
export const label = (
  size: 9 | 10 | 11,
  trackingEm: number,
  colour: string = color.neutral700,
): TextStyle => ({
  ...microLabel(size, trackingEm),
  color: colour,
});

/**
 * Modernist's button signature: the label sits FLUSH LEFT whenever the button
 * is wider than its text, with any trailing icon pushed to the right edge.
 * Centred button labels are explicitly forbidden by the system.
 */
export const flushLeftButton: ViewStyle = {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  paddingLeft: 18,
  paddingRight: 16,
  borderRadius: radius.md,
};

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  gutter: { paddingHorizontal: gutter },

  /** Section heading: 26px/800, tight tracking. */
  screenTitle: { ...type.screenTitle, color: color.text },

  body: { ...type.body, color: color.neutral800 },
  bodySm: { ...type.bodySm, color: color.neutral800 },

  /** A 2px-bordered card. The only "container" the system allows. */
  boxed: {
    borderWidth: layout.ruleStrong,
    borderColor: color.text,
    borderRadius: radius.md,
  },

  /** Photo placeholder, until real Koh Samui photography is licensed. */
  photoPlaceholder: { backgroundColor: color.neutral300 },

  /**
   * Focus ring. Never the platform default.
   *
   * Brand, not accent: a focus ring is the app pointing at something, and
   * green in this product means a host verified it. A green ring around an
   * empty text field is the interface making a claim it cannot support.
   */
  focusRing: {
    borderWidth: 2,
    borderColor: color.brand,
  },

  disabled: { opacity: layout.disabledOpacity },
});

/**
 * Progress-bar track + fill. Used by the level bar, the community bars and the
 * feed score bars, so they can never drift apart visually.
 */
export const bar = (pct: number, fill: string, height: number) => ({
  track: {
    height,
    backgroundColor: color.neutral300,
    borderRadius: radius.sm,
    overflow: 'hidden' as const,
  },
  fill: {
    width: `${Math.max(0, Math.min(100, pct))}%` as const,
    height: '100%' as const,
    backgroundColor: fill,
  },
});
