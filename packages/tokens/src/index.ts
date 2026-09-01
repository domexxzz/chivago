/**
 * Chiva Go design tokens - ported from the pitch deck's own system.
 *
 * Single source of truth for every colour, space, radius, shadow and type step.
 * Never hard-code a hex, a font name or a px value that a token already carries.
 *
 * The deck is DARK-FIRST: a deep green-black ground (#071812) carrying one
 * bright accent (lime #B7F04B) and one warm counter-accent (coral #F87153).
 * The app follows it. Every screen reads its colour through these names, so
 * the whole theme moves from this file and nowhere else.
 *
 * The neutral ramp keeps its ROLE and inverts its lightness: low numbers sit
 * closest to the ground, high numbers closest to the text. `neutral300` was a
 * hairline on paper and is a hairline on ink; nothing downstream had to change.
 */

// ---------------------------------------------------------------------------
// Colour
// ---------------------------------------------------------------------------

export const color = {
  /** App background / screen ground - the deck's --ink */
  bg: '#071812',
  /** Inset panels (proof-upload box) - --ink-2 */
  surface: '#0c2419',
  /** Foreground: body + heading text, strong rules, active tab fill, toast */
  text: '#edf3ec',
  /** Primary action, Green Points value, verified state, score >= 85 pins */
  accent: '#b7f04b',
  /** Counter-accent: warnings, crowding, the one thing that must not read green */
  accent2: '#f87153',
  /** Section rules - the deck's --line-d, lime at low alpha */
  divider: 'rgba(183,240,75,0.16)',

  /** Ground-ward end of the ramp. */
  neutral100: '#0a1f17',
  neutral200: '#10291d',
  neutral300: '#1c3a2b',
  neutral400: '#2b4c3a',
  neutral500: '#5b7466',
  neutral600: '#7e9a8a',
  /** The workhorse secondary text - the deck's --sage */
  neutral700: '#8fa89a',
  neutral800: '#b9cbbf',
  /** Text-ward end. Also the shadow colour, which stays near-black on purpose. */
  neutral900: '#03110b',

  accent100: '#12300a',
  accent200: '#1c4a10',
  accent300: '#2f6b17',
  accent400: '#4f951b',
  accent500: '#7fbf1f',
  accent600: '#9ad935',
  /** Accent TEXT on the dark ground. Bright, not deep - the ground inverted. */
  accent700: '#b7f04b',
  accent800: '#cef47e',
  accent900: '#eafbc9',

  /** Coral ramp, for the counter-accent's soft fills. */
  coral: '#f87153',
  coralSoft: '#fde6df',
  coralDeep: '#8a2f1c',

  /** Paper, for the rare inverted surface (a voucher, a printed thing). */
  paper: '#f5f7f2',
  mist: '#eaf6da',
} as const;

/**
 * Contrast rule:
 * lime on the ink ground is ~11:1 - safe at ANY size, unlike the old mono-red
 * which was fill-only. `accent700` is kept as the paragraph-accent name so no
 * screen had to change, and now resolves to the same bright lime.
 *
 * Green Points finally render GREEN. The deck's whole identity is the lime, so
 * the eco opt-in that existed to escape a mono-red palette is now the default
 * and the flag is gone.
 */
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
// Elevation - ONLY on map pin chips (sm) and the toast (md). Everything else flat.
// ---------------------------------------------------------------------------

export const shadow = {
  sm: { shadowColor: color.neutral900, shadowOpacity: 0.45, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  md: { shadowColor: color.neutral900, shadowOpacity: 0.5, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
  lg: { shadowColor: color.neutral900, shadowOpacity: 0.6, shadowRadius: 40, shadowOffset: { width: 0, height: 18 }, elevation: 16 },
  /**
   * The deck's signature: lime light bleeding off an active control.
   * Only ever on something the traveller can act on RIGHT NOW - a live SOS,
   * the primary CTA, a selected pin. A glow on a static panel is noise.
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
