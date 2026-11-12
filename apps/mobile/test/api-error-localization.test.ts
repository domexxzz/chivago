import { strict as assert } from 'node:assert';
import { afterEach, describe, test } from 'node:test';

import { apiErrorMessage, translatedApiErrorCodes } from '../src/i18n/api-errors.ts';
import { __setLocaleForTests } from '../src/i18n/locale.ts';

afterEach(() => { __setLocaleForTests('en'); });

describe('API error localization', () => {
  test('known errors render in every supported language', () => {
    for (const locale of ['en', 'th', 'zh'] as const) {
      __setLocaleForTests(locale);
      assert.ok(apiErrorMessage('LOCATION_REQUIRED').length > 0);
      assert.ok(apiErrorMessage('UNAUTHENTICATED').length > 0);
    }
  });

  test('unknown errors never expose the raw server message', () => {
    for (const locale of ['en', 'th', 'zh'] as const) {
      __setLocaleForTests(locale);
      const shown = apiErrorMessage('SQLITE_CONSTRAINT_SECRET_TOKEN');
      assert.ok(shown.length > 0);
      assert.doesNotMatch(shown, /SQLITE|TOKEN|SECRET/);
    }
  });

  test('the registry contains no accidental duplicate keys', () => {
    assert.equal(new Set(translatedApiErrorCodes).size, translatedApiErrorCodes.length);
  });
});
