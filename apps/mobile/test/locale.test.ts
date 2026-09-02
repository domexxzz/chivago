import { strict as assert } from 'node:assert';
import { test, describe, afterEach } from 'node:test';

import {
  __setLocaleForTests, deviceLocale, getLocale, setLocale, subscribe, t,
} from '../src/i18n/locale.ts';
import { BilingualTitle, Thai } from '../src/components/Type.tsx';
import { Button } from '../src/components/Button.tsx';
import { EmptyState } from '../src/components/States.tsx';
import { SosBanner } from '../src/components/Shell.tsx';
import { QuestRow } from '../src/screens/MissionsScreen.tsx';
import * as fx from './fixtures.ts';
import { h, labels, text } from './render.ts';

/**
 * One language at a time.
 *
 * The app used to print every line twice. These hold the new rule: a screen
 * speaks the chosen language and only that - except where a responder might be
 * reading a traveller's phone, which stays bilingual on purpose.
 */

const THAI = /[฀-๿]/;
const pair = { en: 'Beach Cleanup', th: 'เก็บขยะชายหาด' };

afterEach(() => { __setLocaleForTests('en'); });

describe('t() picks the language', () => {
  test('English by default, Thai when asked', () => {
    __setLocaleForTests('en');
    assert.equal(t(pair), 'Beach Cleanup');
    __setLocaleForTests('th');
    assert.equal(t(pair), 'เก็บขยะชายหาด');
  });

  test('a missing translation falls back to the other language, never to a blank', () => {
    __setLocaleForTests('th');
    assert.equal(t({ en: 'Only English so far', th: '' }), 'Only English so far');
    __setLocaleForTests('en');
    assert.equal(t({ en: '', th: 'มีแต่ไทย' }), 'มีแต่ไทย');
    assert.equal(t(null), '');
  });

  test('the phone decides the default, and only Thai counts as Thai', () => {
    assert.equal(deviceLocale(['th-TH']), 'th');
    assert.equal(deviceLocale(['en-GB', 'th']), 'en', 'the first language the phone lists wins');
    assert.equal(deviceLocale(['de-DE']), 'en', 'a language the app does not have reads as English');
    assert.equal(deviceLocale([]), 'en');
  });

  test('changing the language tells whoever is listening, once', () => {
    let calls = 0;
    const stop = subscribe(() => { calls += 1; });
    setLocale('th');
    setLocale('th');
    assert.equal(getLocale(), 'th');
    assert.equal(calls, 1, 'setting the same language again is not a change');
    stop();
    setLocale('en');
    assert.equal(calls, 1, 'an unsubscribed listener stays quiet');
  });
});

describe('what a screen prints', () => {
  test('a title is one line in the chosen language', () => {
    __setLocaleForTests('en');
    const en = text(h(BilingualTitle, { value: pair }));
    assert.match(en, /Beach Cleanup/);
    assert.doesNotMatch(en, THAI, 'the Thai caption used to sit under every title');

    __setLocaleForTests('th');
    const th = text(h(BilingualTitle, { value: pair }));
    assert.match(th, /เก็บขยะชายหาด/);
    assert.doesNotMatch(th, /Beach Cleanup/);
  });

  test('a Thai caption stays quiet in English and speaks in Thai', () => {
    __setLocaleForTests('en');
    assert.equal(text(h(Thai, null, 'ข้อความ')), '');
    __setLocaleForTests('th');
    assert.match(text(h(Thai, null, 'ข้อความ')), /ข้อความ/);
  });

  test('a button shows one language, and the Thai replaces the English rather than joining it', () => {
    const props = { label: 'Check in here', thai: 'เช็กอินที่นี่', onPress: () => {} };
    __setLocaleForTests('en');
    const en = text(h(Button, props));
    assert.match(en, /Check in here/);
    assert.doesNotMatch(en, THAI);

    __setLocaleForTests('th');
    const th = text(h(Button, props));
    assert.match(th, /เช็กอินที่นี่/);
    assert.doesNotMatch(th, /Check in here/);
  });

  test('an empty state explains itself in one language', () => {
    __setLocaleForTests('th');
    const out = text(h(EmptyState, { en: 'No quests today', th: 'วันนี้ไม่มีภารกิจ' }));
    assert.match(out, /วันนี้ไม่มีภารกิจ/);
    assert.doesNotMatch(out, /No quests today/);
  });

  test('a mission card in English carries no Thai at all', () => {
    __setLocaleForTests('en');
    const out = text(h(QuestRow, { quest: fx.quest(), progress: null, onPress: () => {} }));
    assert.match(out, /Beach Cleanup/);
    assert.doesNotMatch(out, THAI);
  });

  test('and in Thai, its name is the Thai name', () => {
    __setLocaleForTests('th');
    const out = text(h(QuestRow, { quest: fx.quest(), progress: null, onPress: () => {} }));
    assert.match(out, /เก็บขยะชายหาด/);
    assert.doesNotMatch(out, /Beach Cleanup/);
  });
});

describe('what stays bilingual, on purpose', () => {
  test('the SOS banner keeps both languages whatever the app is set to', () => {
    // A Thai responder reading an English tourist's phone is exactly the
    // moment the second language was for.
    for (const locale of ['en', 'th'] as const) {
      __setLocaleForTests(locale);
      const out = text(h(SosBanner, { onPress: () => {} }));
      assert.match(out, /SOS|Live|active/i, `the English line, in ${locale}`);
      assert.match(out, THAI, `the Thai line, in ${locale}`);
    }
  });

  test('a bilingual button keeps its caption', () => {
    __setLocaleForTests('en');
    const out = text(h(Button, { label: 'Call 1669', thai: 'โทร 1669', bilingual: true, onPress: () => {} }));
    assert.match(out, /Call 1669/);
    assert.match(out, /โทร 1669/);
    const spoken = labels(h(Button, { label: 'Call 1669', thai: 'โทร 1669', bilingual: true, onPress: () => {} })).join(' ');
    assert.match(spoken, /Call 1669\. โทร 1669/);
  });
});
