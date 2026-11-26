import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promoScreen } from './promo-link.ts';
test('marketing links only admit supported standalone screens', () => {
 assert.equal(promoScreen('?screen=adventure&area=koh-sichang'), 'adventure');
 assert.equal(promoScreen('?screen=wallet&lang=zh'), 'wallet');
 for (const query of ['?screen=place', '?screen=quest', '?screen=shopManage', '?screen=https://evil.test', '?screen=__proto__', '']) {
  assert.equal(promoScreen(query), null);
 }
});
