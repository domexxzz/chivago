import { strict as assert } from 'node:assert';
import { test, describe, afterEach } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createElement as h } from 'react';
import type { ReactTestInstance } from 'react-test-renderer';

import { color, currencyTone } from '../src/theme/index.ts';
import { QuestRow } from '../src/screens/QuestsScreen.tsx';
import { OfferRow } from '../src/screens/MarketScreen.tsx';
import { mount } from './interact.ts';
import * as fx from './fixtures.ts';

/**
 * What the colours are allowed to MEAN.
 *
 * The palette's rule is one sentence: green is evidence a host verified, and
 * nothing else may wear it. That rule lived in a comment, and by the time
 * anyone measured it green was doing five jobs — the primary button, the
 * active tab, the star rating a traveller set themselves, a hotel price
 * FORECAST, and a live SOS banner reading "your location is being shared".
 *
 * Everything below renders the real components and reads the style the way a
 * screen actually receives it, rather than trusting the source to still say
 * what it said the day it was written.
 */

let restore: (() => void) | null = null;
afterEach(() => { restore?.(); restore = null; });

/** Every backgroundColor in the mounted tree, in render order. */
const fills = (root: ReactTestInstance): string[] => {
  const found: string[] = [];
  const walk = (node: ReactTestInstance) => {
    const style = node.props?.style as unknown;
    const flat = Array.isArray(style) ? style : [style];
    for (const s of flat) {
      const bg = (s as { backgroundColor?: unknown } | null)?.backgroundColor;
      if (typeof bg === 'string') found.push(bg);
    }
    node.children.forEach((c) => { if (typeof c !== 'string') walk(c); });
  };
  walk(root);
  return found;
};

describe('the two currencies do not wear the same colour', () => {
  // The product's whole claim is that Green Points and Trip Points differ by
  // EVIDENCE. On screen they differed by nothing: both badges rendered green,
  // so a reward the traveller granted themselves looked host-verified.

  test('a Green reward badge is green', async () => {
    const m = await mount(h(QuestRow, {
      quest: fx.quest({ rewardCurrency: 'green' }), progress: null, onPress: () => {},
    }));
    restore = m.unmount;
    assert.ok(fills(m.root).includes(color.accent), 'the verified currency lost its green');
  });

  test('a Trip reward badge is NOT green', async () => {
    const m = await mount(h(QuestRow, {
      quest: fx.quest({ rewardCurrency: 'trip' }), progress: null, onPress: () => {},
    }));
    restore = m.unmount;
    const painted = fills(m.root);
    assert.ok(
      !painted.includes(color.accent),
      'a self-verified reward is rendering in the colour that means a host checked it',
    );
    assert.ok(painted.includes(color.gold), 'the trip currency has no colour of its own');
  });

  test('the market prices an offer in its own currency, not in green', async () => {
    const m = await mount(h(OfferRow, {
      offer: fx.offer({ currency: 'trip' }), affordable: true, onRedeem: () => {}, busy: false,
    }));
    restore = m.unmount;
    // The border and label here are the price. Green would say a host priced it.
    const src = readFileSync(
      join(import.meta.dirname, '..', 'src', 'screens', 'MarketScreen.tsx'), 'utf8',
    );
    assert.ok(src.includes('currencyTone(offer.currency)'), 'the price stopped following its currency');
    assert.ok(m.text().includes('180'), 'the price vanished');
  });

  test('the mapping is the one the product describes', () => {
    assert.equal(currencyTone('green').fill, color.accent);
    assert.equal(currencyTone('trip').fill, color.gold);
    assert.notEqual(currencyTone('green').fill, currencyTone('trip').fill);
    // Anything unrecognised is treated as the WEAKER claim, never the stronger
    // one: a currency this build has not heard of has not been verified by it.
    assert.equal(currencyTone('sponsor-credit').fill, color.gold);
  });
});

/**
 * Source-level guards.
 *
 * Two rules that cannot be reached by rendering one component, because they
 * are about what must be absent across every screen at once.
 */
const SRC = join(import.meta.dirname, '..', 'src');

const sources = (dir: string): { path: string; text: string }[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return sources(p);
    if (!/\.tsx?$/.test(e.name) || e.name.includes('.test.')) return [];
    return [{ path: p, text: readFileSync(p, 'utf8') }];
  });

describe('the palette rules hold across every screen', () => {
  test('the page tint is never used as a label on a fill', () => {
    // `bg` is a TINTED near-white (#eaf2fc), not white. As a label on the green
    // fill it measures 4.00:1 and fails AA; white measures 4.52:1 and passes.
    // Seventeen call sites had it, including the 9px tab label, because the two
    // are indistinguishable in a diff. `onFill` carries the measured pairing.
    const offenders = sources(SRC).flatMap(({ path, text }) =>
      text.split('\n').flatMap((line, i) =>
        /(?:colour|color)=\{[^}]*\bcolor\.bg\b/.test(line) || /\bfg:\s*color\.bg\b/.test(line)
          ? [`${path.replace(SRC, 'src')}:${i + 1}`]
          : []));
    assert.deepEqual(offenders, [], `use onFill.<fill> instead of color.bg:\n  ${offenders.join('\n  ')}`);
  });

  test('the SOS control is never painted in the success colour', () => {
    // It sat green at rest, turned coral while counting down, then went GREEN
    // again once armed — so the palette's strongest "this went well" colour
    // marked a live emergency with a pulsing banner.
    const safety = readFileSync(join(SRC, 'screens', 'SafetyScreen.tsx'), 'utf8');
    const shell = readFileSync(join(SRC, 'components', 'Shell.tsx'), 'utf8');

    const sosBanner = shell.slice(shell.indexOf('activeBanner'), shell.indexOf('activeBanner') + 400);
    assert.ok(!/color\.accent\b/.test(sosBanner), 'the live-SOS banner is green again');

    // The button's own fill and ring. `accent700`/`accent200` are the same
    // green family and were the resting face of the control.
    const button = safety.slice(safety.indexOf('borderRadius: SOS_RADIUS'));
    const head = button.slice(0, button.indexOf('DispatchPanel'));
    assert.ok(
      !/color\.(accent|accent200|accent700)\b/.test(head),
      'the SOS button is wearing the verified green again',
    );
  });
});
