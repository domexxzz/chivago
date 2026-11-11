import { strict as assert } from 'node:assert';
import { afterEach, describe, test } from 'node:test';

import { __setLocaleForTests } from '../src/i18n/locale.ts';
import {
  formatCurrency, formatDate, formatDateTime, formatInteger, formatPercentage, formatRelativeTime, formatTime,
} from '../src/i18n/format.ts';

afterEach(() => { __setLocaleForTests('en'); });

describe('locale-aware formatters', () => {
  test('numbers follow the selected locale and keep readable Arabic digits', () => {
    __setLocaleForTests('en');
    assert.equal(formatInteger(1234567), '1,234,567');
    __setLocaleForTests('th');
    assert.match(formatInteger(1234567), /1,234,567/);
    __setLocaleForTests('zh');
    assert.match(formatPercentage(0.25), /25%/);
  });

  test('dates, times and money are formatted without changing their values', () => {
    const instant = new Date('2026-11-04T06:30:00.000Z');
    __setLocaleForTests('th');
    assert.match(formatDate(instant, { timeZone: 'Asia/Bangkok' }), /2569/);
    assert.match(formatDate(instant, { day: 'numeric', month: 'long', timeZone: 'Asia/Bangkok' }), /4/);
    assert.notEqual(formatTime(instant, { timeZone: 'Asia/Bangkok' }), '—');
    assert.match(formatCurrency(1200, 'THB'), /1,200/);
    __setLocaleForTests('zh');
    assert.notEqual(formatDateTime(instant, { timeZone: 'Asia/Bangkok' }), '—');
  });

  test('relative time is translated and invalid dates are safe', () => {
    __setLocaleForTests('zh');
    assert.match(formatRelativeTime(-1, 'day'), /昨|1/);
    assert.equal(formatDate('not-a-date'), '—');
  });
});
