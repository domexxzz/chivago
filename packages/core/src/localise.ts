/**
 * Reading a `Localised` in one language, and what to do when it is not there.
 *
 * WHY THIS IS ONE FUNCTION AND NOT FOUR
 *
 * When the product had two languages, `value[lang]` was a complete answer and
 * four files wrote their own version of it: the app's `t()`, the console's
 * string lookup, `concierge.ts` and `kpi.ts`. Chinese made every one of them
 * wrong in the same way - an untranslated string is `undefined`, and
 * `undefined` renders as the word "undefined" on a municipal officer's screen
 * rather than failing anywhere a test would catch it.
 *
 * So the fallback lives here, once, and those four call it.
 */

import type { Localised } from './types.ts';

/** The languages the product speaks. */
export type Lang = 'en' | 'th' | 'zh';

export const LANGS: readonly Lang[] = ['en', 'th', 'zh'] as const;

export const isLang = (v: unknown): v is Lang => v === 'en' || v === 'th' || v === 'zh';

/**
 * What to show when the chosen language has nothing.
 *
 * English sits second in both other chains because it is the one language
 * everyone maintaining this can read, so a gap that reaches a user is also
 * legible to whoever has to close it. Thai and Chinese never fall back to each
 * other first: showing Thai to a Chinese reader helps nobody, and it hides the
 * gap behind something that looks deliberate.
 */
const FALLBACK: Record<Lang, readonly (keyof Localised)[]> = {
  en: ['en', 'th', 'zh'],
  th: ['th', 'en', 'zh'],
  zh: ['zh', 'en', 'th'],
};

/**
 * One language out of a `Localised`, falling back rather than returning
 * `undefined`. Empty string only if the value carries no language at all.
 */
export function localise(value: Localised | null | undefined, lang: Lang): string {
  if (!value) return '';
  for (const key of FALLBACK[lang]) {
    const s = value[key];
    if (s) return s;
  }
  return '';
}

/**
 * BCP 47 tags for `Intl`, so dates and numbers follow the language on screen.
 *
 * `en-GB` because the pilot writes dates day-first. `zh-CN` rather than bare
 * `zh` because the product ships Simplified and bare `zh` leaves the choice to
 * the platform. Thai keeps the Gregorian calendar explicitly: `th-TH` defaults
 * to the Buddhist Era, and a screen reading 2569 beside an API timestamp
 * reading 2026 is a support ticket.
 */
export const LANG_TAGS: Record<Lang, string> = {
  en: 'en-GB',
  th: 'th-TH-u-ca-gregory',
  zh: 'zh-CN',
};
