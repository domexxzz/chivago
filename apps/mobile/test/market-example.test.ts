import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';
import { createElement as h } from 'react';

import { OfferRow } from '../src/screens/MarketScreen.tsx';
import { text } from './render.ts';
import * as fx from './fixtures.ts';

/**
 * A sample offer names a real business that has not joined. The row has to
 * say so, under the merchant's name, or the reader takes it as a partner.
 */
describe('a sample offer says it is one', () => {
  const row = (example: boolean) => text(h(OfferRow, {
    offer: { ...fx.offer(), merchant: 'W Koh Samui', example },
    affordable: true, onRedeem: () => {}, busy: false,
  }));

  test('the sample carries "not a partner yet"', () => {
    assert.match(row(true), /W Koh Samui.*Example · not a partner yet/);
  });

  test('a real offer does not', () => {
    assert.ok(!/not a partner yet/.test(row(false)));
  });
});
