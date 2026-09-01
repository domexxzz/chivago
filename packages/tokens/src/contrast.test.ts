import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

import { color } from './index.ts';

/**
 * The palette's contrast claims, enforced.
 *
 * The comment in index.ts used to state ratios that had never been measured,
 * and four of them were wrong - white on the green button was 3.41, white on
 * the orange was 3.16, and both would have shipped. A design system that
 * asserts its own accessibility in prose is asserting it nowhere.
 *
 * WCAG 2.1 relative luminance, the same formula a checker uses.
 */
const luminance = (hex: string): number => {
  const channels = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
};

export const ratio = (a: string, b: string): number => {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

const AA_TEXT = 4.5;
const AA_LARGE = 3;

describe('text is readable on the ground it sits on', () => {
  const cases: [string, string, string, number][] = [
    ['body text on the page', color.text, color.bg, AA_TEXT],
    ['body text on a card', color.text, color.surface, AA_TEXT],
    ['secondary text on a card', color.neutral700, color.surface, AA_TEXT],
    ['accent text on a card', color.accent700, color.surface, AA_TEXT],
    ['brand text on a card', color.brand, color.surface, AA_TEXT],
    ['the counter-accent on a card', color.accent2, color.surface, AA_TEXT],
    ['text on the inverted panel', color.surface, color.paper, AA_TEXT],
  ];

  for (const [what, fg, bg, min] of cases) {
    test(what, () => {
      const r = ratio(fg, bg);
      assert.ok(r >= min, `${what}: ${fg} on ${bg} is ${r.toFixed(2)}:1, needs ${min}`);
    });
  }

  test('the muted tier is honest about being large-text only', () => {
    // neutral600 sits below AA for body copy and is used for icons and 13px+
    // labels. Asserting the bound stops it drifting into paragraphs.
    const r = ratio(color.neutral600, color.surface);
    assert.ok(r >= AA_LARGE, `neutral600 is ${r.toFixed(2)}:1`);
    assert.ok(r < AA_TEXT, 'neutral600 now passes AA for body — promote it and delete this test');
  });
});

describe('a filled button can carry a label', () => {
  test('white on the brand fill', () => {
    assert.ok(ratio(color.surface, color.brand) >= AA_TEXT);
  });

  test('white on the accent fill — the Green Points button', () => {
    // Was 3.41 at the first-drafted green. The value moved, not the claim.
    assert.ok(ratio(color.surface, color.accent) >= AA_TEXT);
  });

  test('white on the deep call-to-action', () => {
    assert.ok(ratio(color.surface, color.ctaDeep) >= AA_TEXT);
  });

  test('INK on the vivid call-to-action, because white fails on it', () => {
    // The design's orange is 3.16:1 against white and 4.54:1 against ink. It
    // is kept at full vividness and the label colour is what changes - which
    // is the whole reason `cta` and `ctaDeep` are two different tokens.
    assert.ok(ratio(color.text, color.cta) >= AA_TEXT, 'ink no longer passes on cta');
    assert.ok(ratio(color.surface, color.cta) < AA_TEXT, 'white now passes on cta — merge the two oranges');
  });
});

describe('the ramp still runs the way its names say', () => {
  test('neutral100 is nearest the page and neutral900 nearest the text', () => {
    // The scheme flipped from dark to light. The names are roles, so the order
    // has to survive the flip or every screen quietly inverts.
    const ramp = [
      color.neutral100, color.neutral200, color.neutral300, color.neutral400,
      color.neutral500, color.neutral600, color.neutral700, color.neutral800,
      color.neutral900,
    ];
    for (let i = 1; i < ramp.length; i += 1) {
      assert.ok(
        luminance(ramp[i]!) < luminance(ramp[i - 1]!),
        `neutral${(i + 1) * 100} is lighter than neutral${i * 100} — the ramp is out of order`,
      );
    }
  });

  test('the accent ramp darkens the same way', () => {
    const ramp = [
      color.accent100, color.accent200, color.accent300, color.accent400,
      color.accent500, color.accent600, color.accent700, color.accent800, color.accent900,
    ];
    for (let i = 1; i < ramp.length; i += 1) {
      assert.ok(luminance(ramp[i]!) < luminance(ramp[i - 1]!), `accent ramp breaks at ${i}`);
    }
  });
});
