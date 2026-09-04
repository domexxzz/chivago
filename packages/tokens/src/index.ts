/**
 * Chiva Go design tokens - ported from the pitch deck's own system.
 *
 * Single source of truth for every colour, space, radius, shadow and type step.
 * Never hard-code a hex, a font name or a px value that a token already carries.
 *
 * The scheme is LIGHT: a pale sky ground carrying a brand blue, one green, one
 * orange and one coral. It was dark-first (ink #071812, lime #B7F04B) until the
 * mockups moved; every screen reads its colour through these names, so the whole
 * theme moved from this file and nowhere else.
 *
 * The neutral ramp keeps its ROLE and inverts its lightness: low numbers sit
 * closest to the ground, high numbers closest to the text. `neutral300` was a
 * hairline on paper and is a hairline on ink; nothing downstream had to change.
 *
 * WHAT EACH COLOUR IS ALLOWED TO MEAN - the rule the screens are held to, and
 * the reason there are five of them rather than one:
 *
 *   accent  green   EVIDENCE. A host verified it, or the island measured it.
 *   brand   blue    The app speaking: nav, selection, links, map, focus.
 *   cta     orange  Start something. The button, and little else.
 *   gold            The game layer: levels, ranks, ratings, Trip Points.
 *   accent2 coral   Danger and warnings, including a live SOS.
 *
 * Green was doing all five of those jobs at once - the primary button, the
 * active tab, a star rating the traveller set themselves, a hotel price
 * FORECAST, and the banner reading "SOS active". A colour that means five
 * things means none of them, and the one it needed to mean is the only claim
 * this product makes. It is now used in 23 places instead of 74.
 */

// ---------------------------------------------------------------------------
// Colour
// ---------------------------------------------------------------------------

export const color = {
  /** App background / screen ground - the light sky the cards sit on */
  bg: '#eef4f5',
  /** Cards and inset panels. White, so a card reads as a card without a border */
  surface: '#ffffff',
  /** Foreground: body + heading text, strong rules, active tab fill, toast */
  text: '#0e2a4f',
  /** Primary action, Green Points value, verified state, score >= 85 pins */
  accent: '#25874c',
  /** Counter-accent: warnings, crowding, the one thing that must not read green */
  accent2: '#d32f24',
  /** Section rules - a cool hairline, not a tinted glow */
  divider: 'rgba(14,42,79,0.10)',

  /**
   * The brand blue. Navigation, chips, links, the map, anything that is the
   * app speaking rather than the island reporting.
   *
   * NEW, and deliberately not `accent`. Making blue the accent would have
   * turned Green Points blue, and the one thing the palette must never do is
   * let the verified currency stop looking verified.
   */
  brand: '#0e7480',
  brandDeep: '#0a4a52',
  brandSoft: '#d7edef',

  /**
   * The call to action. One orange, used sparingly: the button that starts
   * something. Not a warning - warnings are `accent2`, which is red for the
   * same reason it has always been the counter-accent.
   */
  cta: '#f26430',
  /**
   * The same orange, darkened until WHITE text passes on it (4.50 vs 3.16).
   * Two oranges rather than one because the vivid one only works with ink on
   * top, and a design system that leaves that to memory gets white-on-orange
   * buttons at 3.16:1 within a week.
   */
  ctaDeep: '#cc4610',
  ctaSoft: '#ffe6dc',

  /**
   * Points, levels, badges - and Trip Points, the SELF-verified currency.
   *
   * Green Points and Trip Points differ by evidence, and until now they
   * differed by nothing else on screen: both rendered green, so a reward a
   * traveller granted themselves wore the colour that means a host checked.
   * Gold is the game layer. Green is the evidence layer.
   */
  gold: '#f5a623',
  goldSoft: '#fdf0d6',
  /**
   * Gold as TEXT. The bright gold is 2.03:1 on white - unreadable as a label
   * and unreadable under one. Same split as cta/ctaDeep, for the same reason:
   * the vivid value is kept for fills and the readable one carries type.
   */
  goldDeep: '#8f5a00',

  /** Ground-ward end of the ramp. */
  neutral100: '#f5f9f9',
  neutral200: '#e9f1f2',
  neutral300: '#d7e4e6',
  neutral400: '#b9cbcf',
  neutral500: '#8ca2a8',
  neutral600: '#6a808a',
  /** The workhorse secondary text - readable on white at small sizes */
  neutral700: '#526a78',
  neutral800: '#31485a',
  /** Text-ward end. Also the shadow colour, which stays near-black on purpose. */
  neutral900: '#08202a',

  accent100: '#eaf7ef',
  accent200: '#cdebd9',
  accent300: '#9fd8b7',
  accent400: '#66c18d',
  accent500: '#3faa6d',
  accent600: '#25874c',
  /**
   * Accent TEXT on the light ground. DEEP, not bright - the ground inverted.
   * On the dark scheme this was the brightest lime; the role is unchanged and
   * the value flips, which is the whole reason the ramp is named by role.
   */
  accent700: '#1f7a44',
  accent800: '#175c33',
  accent900: '#0e3d21',

  /** Counter-accent ramp, for its soft fills. */
  coral: '#d32f24',
  coralSoft: '#fde7e4',
  coralDeep: '#8f1d15',

  /**
   * The rare INVERTED surface: a hero panel, a profile card, the 3D map.
   * On a dark scheme this was paper; on a light one the inversion is navy.
   * The role is "the surface that is the opposite of the page".
   */
  paper: '#0b5561',
  mist: '#0e2a4f',
} as const;

/**
 * Contrast, measured — and enforced by contrast.test.ts, not by this comment.
 *
 *   text       on bg        12.72:1   any size
 *   text       on surface   14.36:1   any size
 *   neutral700 on surface    5.64:1   body and small labels
 *   neutral600 on surface    4.08:1   LARGE TEXT AND ICONS ONLY
 *   accent700  on surface    5.35:1   accent paragraphs
 *   brand      on surface    4.85:1   links and labels
 *   accent2    on surface    5.00:1   warnings
 *   white      on accent     4.52:1   the Green Points button
 *   white      on brand      4.85:1
 *   white      on ctaDeep    4.72:1
 *   INK        on cta        4.54:1   white is 3.16 and fails
 *
 * That last pair is the trap. The design's orange is vivid and unreadable
 * under white text, so it is kept vivid and the LABEL changes colour — which
 * is why cta and ctaDeep are two tokens rather than one with a note.
 *
 * Four of these were wrong when this comment first claimed them, including
 * both button fills. The numbers are now generated from the values and a test
 * fails if any of them drifts.
 *
 * Green Points still render green — an actual green now rather than a lime,
 * so verified reads as verified to someone who has never seen the app.
 */
/**
 * The label colour for every filled surface, so no screen has to remember.
 *
 * `bg` is a TINTED near-white (#eaf2fc), and using it as a label on a fill
 * costs about half a ratio point: white on `accent` is 4.52:1, but `bg` on
 * `accent` is 4.00:1 and fails. Seventeen call sites were doing exactly that,
 * including the 9px tab label, because "the light colour" and "white" look
 * identical in a diff.
 *
 * Two of these are ink rather than white, and that is the whole reason this
 * map exists: `cta` and `gold` are vivid enough that white drops to 3.16:1
 * and 2.03:1 on them. A system that leaves that to memory ships a gold badge
 * with an unreadable label. Every pair here is asserted in contrast.test.ts.
 */
export const onFill = {
  accent: color.surface,
  /** The ink fill: the toast, the inverted Safety header, the "live near" chip. */
  text: color.surface,
  accent2: color.surface,
  brand: color.surface,
  brandDeep: color.surface,
  ctaDeep: color.surface,
  paper: color.surface,
  /** Ink, not white. Both fills are too light to carry a white label. */
  cta: color.text,
  gold: color.text,
} as const satisfies Record<string, string>;

// ---------------------------------------------------------------------------
// Spacing
// ---------------------------------------------------------------------------

export const space = { s1: 4, s2: 8, s3: 12, s4: 16, s6: 24, s8: 32 } as const;

/** Screen gutter: 18px on every screen; 16px in header bars with a back button. */
export const gutter = 18;
export const headerGutter = 16;

// ---------------------------------------------------------------------------
// Radius - the deck rounds everything. Pills for controls, soft cards for panels.
// ---------------------------------------------------------------------------

/**
 * `sm` chips and small fills, `md` cards and sheets, `lg` full pills.
 *
 * The deck's own values: 12-18px on panels, 99px on anything that reads as a
 * control. A pill radius larger than half the height simply clamps, so `lg`
 * is safe on any button height.
 */
export const radius = { sm: 10, md: 18, lg: 999 } as const;

/** SOS is a physical emergency control and was always round. */
export const SOS_RADIUS = 9999;

// ---------------------------------------------------------------------------
// Elevation: map pin chips (sm), the toast (md), and cards (card). Panels stay flat.
// ---------------------------------------------------------------------------

export const shadow = {
  sm: { shadowColor: color.neutral900, shadowOpacity: 0.45, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  /**
   * A card lifted off the page: soft, wide, barely there. The look the app
   * moved to (docs/36) is white cards on a pale ground, and a card with no
   * edge and no shadow is a white rectangle on a white page.
   */
  card: { shadowColor: color.neutral900, shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 3 },
  md: { shadowColor: color.neutral900, shadowOpacity: 0.5, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
  lg: { shadowColor: color.neutral900, shadowOpacity: 0.6, shadowRadius: 40, shadowOffset: { width: 0, height: 18 }, elevation: 16 },
  /**
   * A light bleeding off an active control - a live SOS, a selected pin.
   *
   * UNUSED, and left that way deliberately. It was written for the dark scheme,
   * where a lime glow read as energy on near-black; on a pale ground it reads as
   * a smudge. It also carries `accent`, so switching it on would put the
   * evidence green around whatever it touched.
   */
  glow: { shadowColor: color.accent, shadowOpacity: 0.55, shadowRadius: 18, shadowOffset: { width: 0, height: 0 }, elevation: 8 },
} as const;

// ---------------------------------------------------------------------------
// Type - IBM Plex Sans Thai (display) + Anuphan (body) + IBM Plex Mono (data)
// ---------------------------------------------------------------------------

/**
 * Both faces carry Latin AND Thai, which the previous pair did not: Archivo had
 * no Thai glyphs, so every Thai string needed a second family and a looser
 * line-height. The names below are kept so no screen had to change, and `thai`
 * now resolves to the same family as `body` - one face, two scripts, no seam
 * where a sentence switches language mid-line.
 *
 * The looser Thai line-height stays: Thai still needs the room for its
 * above- and below-line marks, whatever face draws it.
 */
export const font = {
  heading: 'IBMPlexSansThai_700Bold',
  headingSemi: 'IBMPlexSansThai_600SemiBold',
  body: 'Anuphan_400Regular',
  thai: 'Anuphan_400Regular',
  thaiSemi: 'Anuphan_600SemiBold',
  /** Figures that must line up in columns: scores, codes, ledger amounts. */
  mono: 'IBMPlexMono_500Medium',
} as const;

export const THAI_LINE_HEIGHT_RATIO = 1.45;
export const LATIN_LINE_HEIGHT_RATIO = 1.2;

/** Named type steps, straight out of handoff section 2. */
export const type = {
  screenTitle: { fontFamily: font.heading, fontSize: 26, letterSpacing: -0.52 },
  onboardingTitle: { fontFamily: font.heading, fontSize: 34, letterSpacing: -0.85 },
  walletBalance: { fontFamily: font.heading, fontSize: 56, letterSpacing: -1.68 },
  healthyScore: { fontFamily: font.heading, fontSize: 44, letterSpacing: 0 },
  impactStat: { fontFamily: font.heading, fontSize: 30, letterSpacing: -0.6 },
  listTitleLg: { fontFamily: font.heading, fontSize: 17 },
  listTitle: { fontFamily: font.heading, fontSize: 16 },
  listTitleSm: { fontFamily: font.heading, fontSize: 15 },
  body: { fontFamily: font.body, fontSize: 14 },
  bodySm: { fontFamily: font.body, fontSize: 13 },
  caption: { fontFamily: font.body, fontSize: 11, color: color.neutral700 },
  thaiCaption: {
    fontFamily: font.thai,
    fontSize: 11,
    lineHeight: Math.round(11 * THAI_LINE_HEIGHT_RATIO),
    color: color.neutral700,
  },
} as const;

/** Uppercase micro-labels: 9-11px, tracking 0.10-0.16em. */
export const microLabel = (size: 9 | 10 | 11, trackingEm: number) => ({
  fontFamily: font.body,
  fontSize: size,
  letterSpacing: size * trackingEm,
  textTransform: 'uppercase' as const,
});

// ---------------------------------------------------------------------------
// Motion - every duration the design specifies
// ---------------------------------------------------------------------------

export const motion = {
  toastMs: 2200,
  sosHoldMs: 1200,
  sosTickMs: 600,
  /**
   * The window to take it back.
   *
   * A 1200 ms hold proves intent; it does not prove the intent was right.
   * A pocket press, a hold you meant to abort, a child with the phone - all
   * of them clear the hold and none of them want an ambulance. Five seconds
   * is long enough to notice and stop, short enough that nobody who really
   * needs help is meaningfully delayed. The location fix is fetched during
   * this window, so the wait buys something even when it is not used.
   */
  sosCountdownMs: 5000,
  screenEnterMs: 220,
  screenEnterTranslate: 10,
  scanSweepMs: 1400,
  sosPulseMs: 1400,
} as const;

// ---------------------------------------------------------------------------
// Layout constants - handoff section 3
// ---------------------------------------------------------------------------

export const layout = {
  tabBarHeight: 66,
  tabIconSize: 18,
  tabLabelGap: 6,
  toastBottom: 88,
  toastInset: 16,
  ruleStrong: 2,
  ruleHair: 1,
  disabledOpacity: 0.45,
  futureStepOpacity: 0.4,
} as const;

/** Photography treatment: grayscale(1) contrast(1.08). NEVER tint imagery. */
export const IMAGE_FILTER = { grayscale: 1, contrast: 1.08 } as const;

export type ColorToken = keyof typeof color;
