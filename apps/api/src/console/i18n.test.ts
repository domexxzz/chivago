import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

import {
  consoleStrings, DEFAULT_LOCALE, formatDateTime, formatNumber, formatWaiting,
  htmlLang, isLocale, localeFromAcceptLanguage, LOCALE_NAMES, LOCALES, t, tf,
  type ConsoleStringKey,
} from './i18n.ts';
import { REJECTION_REASONS, REJECTION_REASON_KEYS, isRejectionReasonKey, rejectionMessage } from '@chivago/core';

const THAI = /[฀-๿]/;

describe('coverage — no string may be missing a language', () => {
  const keys = Object.keys(consoleStrings) as ConsoleStringKey[];

  test('there is real copy for every key in both languages', () => {
    for (const key of keys) {
      for (const locale of LOCALES) {
        const value = consoleStrings[key][locale];
        assert.ok(value && value.trim().length > 0, `${key}.${locale} is empty`);
      }
    }
  });

  test('no Thai string is silently left in English', () => {
    // The failure mode this catches: a new key added with the English copied
    // into both slots, which looks fine in review and ships untranslated.
    const untranslated = keys.filter((k) => {
      const { th, en } = consoleStrings[k];
      return th === en && !THAI.test(th);
    });
    // Only the brand line may legitimately share a Latin fragment.
    assert.deepEqual(untranslated, [], `these keys have no Thai: ${untranslated.join(', ')}`);
  });

  test('every Thai string actually contains Thai script', () => {
    const suspicious = keys.filter((k) => !THAI.test(consoleStrings[k].th));
    assert.deepEqual(suspicious, [], `no Thai script in: ${suspicious.join(', ')}`);
  });

  test('every English string is free of Thai script', () => {
    const leaked = keys.filter((k) => THAI.test(consoleStrings[k].en));
    assert.deepEqual(leaked, [], `Thai leaked into English: ${leaked.join(', ')}`);
  });
});

describe('locale resolution', () => {
  test('accepts only the two supported locales', () => {
    assert.equal(isLocale('th'), true);
    assert.equal(isLocale('en'), true);
    assert.equal(isLocale('de'), false);
    assert.equal(isLocale(''), false);
    assert.equal(isLocale(undefined), false);
    assert.equal(isLocale('../../etc/passwd'), false);
  });

  test('the default is Thai — most pilot hosts are Thai organisations', () => {
    assert.equal(DEFAULT_LOCALE, 'th');
  });

  test('each locale is named in its own language', () => {
    assert.equal(LOCALE_NAMES.th, 'ไทย');
    assert.equal(LOCALE_NAMES.en, 'English');
  });

  test('the html lang attribute matches, so screen readers pick the right voice', () => {
    assert.equal(htmlLang('th'), 'th');
    assert.equal(htmlLang('en'), 'en');
  });
});

describe('date formatting', () => {
  test('renders in island time, whatever the server timezone', () => {
    // 04:00 UTC is 11:00 on Koh Samui.
    assert.match(formatDateTime('2026-08-31T04:00:00Z', 'en'), /11:00/);
    assert.match(formatDateTime('2026-08-31T04:00:00Z', 'th'), /11:00/);
  });

  test('Thai uses Thai month names', () => {
    assert.ok(THAI.test(formatDateTime('2026-08-31T04:00:00Z', 'th')));
  });

  test('Thai uses the GREGORIAN year, not the Buddhist Era', () => {
    // th-TH defaults to BE, which would render 2026 as 2569. This console sits
    // next to ISO timestamps in the API, the ledger and the app; a queue where
    // one screen says 2569 and the next says 2026 is a support ticket.
    const th = formatDateTime('2026-08-31T04:00:00Z', 'th');
    assert.ok(th.includes('2026'), th);
    assert.ok(!th.includes('2569'), th);
  });
});

describe('relative time', () => {
  test('reads naturally in both languages', () => {
    assert.match(formatWaiting(0.5, 'en'), /minute/);
    assert.match(formatWaiting(3, 'en'), /hour/);
    assert.match(formatWaiting(50, 'en'), /day/);
    for (const hours of [0.5, 3, 50]) {
      assert.ok(THAI.test(formatWaiting(hours, 'th')), `no Thai for ${hours}h`);
    }
  });

  test('never reports "0 minutes ago" for a fresh submission', () => {
    // Intl would happily say "in 0 minutes"; a queue row must read as elapsed.
    assert.doesNotMatch(formatWaiting(0.001, 'en'), /^in /);
    assert.match(formatWaiting(0.001, 'en'), /1 minute ago/);
  });
});

describe('numbers', () => {
  test('group thousands per locale', () => {
    assert.equal(formatNumber(1240, 'en'), '1,240');
    assert.ok(formatNumber(1240, 'th').includes('1'));
  });
});

describe('rejection reasons are keyed, not translated at write time', () => {
  test('every reason has both languages', () => {
    for (const key of REJECTION_REASON_KEYS) {
      assert.ok(REJECTION_REASONS[key].en.length > 0, key);
      assert.ok(THAI.test(REJECTION_REASONS[key].th), `${key} has no Thai`);
    }
  });

  test('a key round-trips to both languages', () => {
    // The point of the whole design: a Thai reviewer picks a reason, and a
    // German volunteer reading English still understands it.
    const msg = rejectionMessage('not_at_site', null)!;
    assert.match(msg.en, /not taken at the quest site/);
    assert.ok(THAI.test(msg.th));
  });

  test('a free-text note is appended untranslated to both', () => {
    const msg = rejectionMessage('not_at_site', 'ดูเหมือนน้ำตกหน้าเมือง')!;
    assert.ok(msg.en.includes('ดูเหมือนน้ำตกหน้าเมือง'), 'note must survive verbatim');
    assert.ok(msg.th.includes('ดูเหมือนน้ำตกหน้าเมือง'));
    assert.notEqual(msg.en, msg.th, 'the preset half still differs');
  });

  test('a note with no preset is shown as typed in both', () => {
    const msg = rejectionMessage(null, 'blurry photos')!;
    assert.equal(msg.en, 'blurry photos');
    assert.equal(msg.th, 'blurry photos');
  });

  test('nothing at all yields null, not an empty banner', () => {
    assert.equal(rejectionMessage(null, null), null);
  });

  test('an unknown key is rejected rather than trusted', () => {
    assert.equal(isRejectionReasonKey('not_at_site'), true);
    assert.equal(isRejectionReasonKey('made_up'), false);
    assert.equal(isRejectionReasonKey(null), false);
    assert.equal(isRejectionReasonKey(undefined), false);
    assert.equal(isRejectionReasonKey(42), false);
  });

  test('inherited Object properties are not valid reason keys', () => {
    // `'__proto__' in obj` is true for every plain object, so a naive `in`
    // check accepts these - and the lookup then returns Object.prototype,
    // whose .en is undefined. The volunteer would be told their proof failed
    // because "undefined".
    for (const key of ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'valueOf']) {
      assert.equal(isRejectionReasonKey(key), false, `${key} was accepted as a reason`);
    }
  });

  test('a rejected key never renders undefined to a volunteer', () => {
    const key = '__proto__';
    const safe = isRejectionReasonKey(key) ? key : null;
    const msg = rejectionMessage(safe, 'the note');
    assert.equal(msg!.en, 'the note');
    assert.ok(!msg!.en.includes('undefined'));
  });
});

describe('t()', () => {
  test('returns the right language', () => {
    assert.equal(t('signIn', 'en'), 'Sign in');
    assert.ok(THAI.test(t('signIn', 'th')));
  });
});

describe('Accept-Language parsing', () => {
  test('picks Thai for a Thai browser', () => {
    assert.equal(localeFromAcceptLanguage('th-TH,th;q=0.9,en;q=0.5'), 'th');
    assert.equal(localeFromAcceptLanguage('th'), 'th');
  });

  test('picks English for an English browser', () => {
    assert.equal(localeFromAcceptLanguage('en-GB,en;q=0.9'), 'en');
    assert.equal(localeFromAcceptLanguage('en-US'), 'en');
  });

  test('respects q-values rather than document order', () => {
    assert.equal(localeFromAcceptLanguage('en;q=0.3,th;q=0.9'), 'th');
    assert.equal(localeFromAcceptLanguage('th;q=0.2,en;q=0.8'), 'en');
  });

  test('ignores region and case', () => {
    assert.equal(localeFromAcceptLanguage('TH-th'), 'th');
    assert.equal(localeFromAcceptLanguage('EN-AU'), 'en');
  });

  test('a language we do not serve yields null, so the caller decides', () => {
    assert.equal(localeFromAcceptLanguage('de-DE,de;q=0.9'), null);
    assert.equal(localeFromAcceptLanguage('ja,ko;q=0.8'), null);
  });

  test('falls through unsupported languages to a supported one', () => {
    assert.equal(localeFromAcceptLanguage('de-DE,de;q=0.9,en;q=0.4'), 'en');
    assert.equal(localeFromAcceptLanguage('fr;q=1.0,th;q=0.1'), 'th');
  });

  test('a substring is not a match', () => {
    // The bug this replaced: /th/.test(header) flipped anything containing
    // "th" into Thai, and the same regex was easy to mangle in a refactor.
    assert.equal(localeFromAcceptLanguage('pt-BR'), null);
    assert.equal(localeFromAcceptLanguage('nl-NL,nl'), null);
  });

  test('q=0 means "not this one"', () => {
    assert.equal(localeFromAcceptLanguage('th;q=0,en;q=0.9'), 'en');
  });

  test('a wildcard takes the default', () => {
    assert.equal(localeFromAcceptLanguage('*'), DEFAULT_LOCALE);
  });

  test('missing, empty or malformed headers yield null rather than throwing', () => {
    assert.equal(localeFromAcceptLanguage(undefined), null);
    assert.equal(localeFromAcceptLanguage(''), null);
    assert.equal(localeFromAcceptLanguage(',,,'), null);
    assert.equal(localeFromAcceptLanguage(';q=x'), null);
  });
});

describe('check explanations are localised, not formatted in the service', () => {
  const CHECK_KEYS = [
    'geotagNone', 'geotagPass', 'geotagWarn', 'geotagFail',
    'timingNone', 'timingPass', 'timingBefore',
    'weightNone', 'weightInvalid', 'weightHigh', 'weightOk',
  ] as const;

  test('every check explanation exists in both languages', () => {
    for (const key of CHECK_KEYS) {
      for (const locale of LOCALES) {
        assert.ok(consoleStrings[key][locale].length > 0, `${key}.${locale}`);
      }
    }
  });

  test('placeholders are substituted in both languages', () => {
    for (const locale of LOCALES) {
      const out = tf('geotagFail', locale, { worst: 11370, radius: 250 });
      assert.ok(out.includes('11370'), `${locale}: ${out}`);
      assert.ok(out.includes('250'), `${locale}: ${out}`);
      assert.ok(!out.includes('{'), `${locale} left a placeholder: ${out}`);
    }
  });

  test('the same placeholders appear in both languages of a template', () => {
    // A translation that drops {worst} silently loses the number the reviewer
    // is deciding on.
    const names = (v: string) => (v.match(/\{(\w+)\}/g) ?? []).sort();
    for (const key of CHECK_KEYS) {
      assert.deepEqual(
        names(consoleStrings[key].th),
        names(consoleStrings[key].en),
        `${key}: Thai and English use different placeholders`,
      );
    }
  });

  test('a missing parameter leaves the placeholder rather than printing undefined', () => {
    assert.equal(tf('weightOk', 'en', {}), '{kg} kg.');
  });

  test('an unknown key degrades to the key instead of throwing', () => {
    // A check that has outrun its copy must not take the whole queue down.
    assert.equal(tf('someFutureCheck', 'en'), 'someFutureCheck');
  });

  test('parameters cannot inject a placeholder that then gets re-substituted', () => {
    const out = tf('weightOk', 'en', { kg: '{radius}' });
    assert.equal(out, '{radius} kg.', 'substitution must be single-pass');
  });
});
