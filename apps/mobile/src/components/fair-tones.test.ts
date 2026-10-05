import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { color } from '@chivago/tokens';
import { zoneTone } from './fair-tones.ts';

/** WCAG 2.1 contrast, measured the way packages/tokens/src/contrast.test.ts measures it. */
const luminance = (hex: string): number => {
  const channels = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
};
const ratio = (a: string, b: string): number => {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

test('every zone colour carries a white label, and none borrows a colour that means something', () => {
  const zones = ['A', 'B', 'C', 'D'];
  const tones = zones.map(zoneTone);
  assert.equal(new Set(tones).size, zones.length, 'four zones, four colours');
  const meaning = new Set<string>([color.accent, color.accent600, color.accent700, color.accent2, color.coral, color.brand]);
  tones.forEach((tone, i) => {
    const under = ratio(tone, '#ffffff');
    assert.ok(under >= 4.5, `zone ${zones[i]} ${tone}: ${under.toFixed(2)}:1 under a white label`);
    assert.ok(!meaning.has(tone), `zone ${zones[i]} ${tone} is not evidence green, danger coral or selection blue`);
  });
});

test('a zone is its letter, either case, and a fifth zone goes round again', () => {
  assert.equal(zoneTone('b'), zoneTone('B'));
  assert.equal(zoneTone('E'), zoneTone('A'));
});
