/**
 * Cutting text another service wrote, so that what is left still reads.
 */

/**
 * Whole characters as a reader sees them. Cutting by UTF-16 unit would split
 * an emoji into a lone surrogate, and cutting by code point would strip a
 * Thai vowel or tone mark off the consonant it sits on. Hermes has no
 * Segmenter; code points are the fallback there.
 */
export function graphemes(s: string): string[] {
  const Seg = (Intl as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
  if (!Seg) return Array.from(s);
  return Array.from(new Seg(undefined, { granularity: 'grapheme' }).segment(s), (x) => x.segment);
}

/** At most `max` UTF-16 units, cut between whole characters, with "…" where it was cut. */
export function capText(s: string, max: number): string {
  if (s.length <= max) return s;
  let out = '';
  for (const ch of graphemes(s)) {
    if (out.length + ch.length > max - 1) break;
    out += ch;
  }
  return `${out}…`;
}
