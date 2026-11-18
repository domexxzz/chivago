import { strict as assert } from 'node:assert';
import { test, describe, afterEach } from 'node:test';

import {
  __setLocaleForTests, deviceLocale, getLocale, loadLocale, setLocale, subscribe, t,
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
const HAN = /[\u3400-\u9fff]/;
const pair = { en: 'Beach Cleanup', th: 'เก็บขยะชายหาด', zh: '海滩清理' };

afterEach(() => { __setLocaleForTests('en'); });

describe('t() picks the language', () => {
  test('English by default, Thai and Chinese when asked', () => {
    __setLocaleForTests('en');
    assert.equal(t(pair), 'Beach Cleanup');
    __setLocaleForTests('th');
    assert.equal(t(pair), 'เก็บขยะชายหาด');
    __setLocaleForTests('zh');
    assert.equal(t(pair), '海滩清理');
  });

  test('a missing translation falls back to the other language, never to a blank', () => {
    __setLocaleForTests('th');
    assert.equal(t({ en: 'Only English so far', th: '' }), 'Only English so far');
    __setLocaleForTests('en');
    assert.equal(t({ en: '', th: 'มีแต่ไทย' }), 'มีแต่ไทย');
    assert.equal(t(null), '');
  });

  test('the phone chooses a supported first-launch language', () => {
    assert.equal(deviceLocale(['th-TH']), 'th');
    assert.equal(deviceLocale(['en-GB', 'th']), 'en', 'the first language the phone lists wins');
    assert.equal(deviceLocale(['zh-CN']), 'zh');
    assert.equal(deviceLocale(['zh-HK']), 'zh', 'Chinese variants use the available Simplified Chinese UI');
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

  test('first launch follows the device, persists it, and a saved choice wins later', async () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); },
      clear: () => { values.clear(); },
      key: (index: number) => [...values.keys()][index] ?? null,
      get length() { return values.size; },
    } satisfies Storage;
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
    try {
      assert.equal(await loadLocale(['zh-CN']), 'zh');
      assert.equal(values.get('chivago.locale'), 'zh');
      values.set('chivago.locale', 'th');
      assert.equal(await loadLocale(['en-GB']), 'th', 'stored manual preference takes precedence');
    } finally {
      if (original) Object.defineProperty(globalThis, 'localStorage', original);
      else delete (globalThis as { localStorage?: Storage }).localStorage;
    }
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

    __setLocaleForTests('zh');
    const zh = text(h(BilingualTitle, { value: pair }));
    assert.match(zh, HAN);
    assert.doesNotMatch(zh, /Beach Cleanup/);
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

  test('a button and empty state render Chinese rather than English fallback', () => {
    __setLocaleForTests('zh');
    const button = text(h(Button, { label: 'Check in here', thai: 'เช็กอินที่นี่', chinese: '在此签到', onPress: () => {} }));
    assert.match(button, /在此签到/);
    assert.doesNotMatch(button, /Check in here/);
    const empty = text(h(EmptyState, { en: 'No quests today', th: 'วันนี้ไม่มีภารกิจ', zh: '今天没有任务' }));
    assert.match(empty, /今天没有任务/);
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
    //
    // This test was rewritten in #153 to assert the opposite - that the
    // banner follows the selected language, English-only in English. That is
    // not an oversight to leave standing: the rule is written down in three
    // places (`locale.ts`, `Type.tsx`, and the commit that restored it after
    // #150 broke the same thing), and the code never stopped being bilingual.
    // The test is what was wrong, so the test is what moves back.
    for (const locale of ['en', 'th', 'zh'] as const) {
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

describe('the heading face in Thai', () => {
  test('a Heading keeps the heading typeface in Thai - only the leading changes', async () => {
    // The heading face is IBM Plex Sans Thai 700, which carries both scripts.
    // The first version swapped every Heading and Label to the body face in
    // Thai on the belief that the heading face had no Thai glyphs, and every
    // heading, numeral and button lost its weight the moment the language
    // changed - a regression only visible by opening the app in Thai.
    const { create } = await import('react-test-renderer');
    const { Text } = await import('react-native');
    const { Heading, Label } = await import('../src/components/Type.tsx');
    const { font } = await import('../src/theme/index.ts');
    const flat = (style: unknown): Record<string, unknown> =>
      Object.assign({}, ...(Array.isArray(style) ? style.flat(Infinity) : [style]).filter(Boolean));

    __setLocaleForTests('th');
    try {
      const heading = create(h(Heading, { size: 24 }, 'ภารกิจ')).root.findByType(Text as never);
      const hs = flat(heading.props.style);
      assert.equal(hs.fontFamily, font.heading, 'the heading face carries Thai; it must not drop to the body face');
      assert.equal(hs.lineHeight, Math.round(24 * 1.5), 'Thai leading still applies');

      // A Label is set in the body face by the tokens in every language; what
      // Thai must not change is the face it was given.
      const label = create(h(Label, { size: 10 }, 'กระเป๋าแต้ม')).root.findByType(Text as never);
      const ls = flat(label.props.style);
      assert.equal(ls.fontFamily, font.body);
      assert.equal(ls.lineHeight, Math.round(10 * 1.45));
    } finally { __setLocaleForTests('en'); }
  });
});

describe('the heading face in Chinese', () => {
  test('Chinese uses a platform CJK face and generous leading', async () => {
    const { create } = await import('react-test-renderer');
    const { Text } = await import('react-native');
    const { Heading } = await import('../src/components/Type.tsx');
    const { font } = await import('../src/theme/index.ts');
    const flat = (style: unknown): Record<string, unknown> =>
      Object.assign({}, ...(Array.isArray(style) ? style.flat(Infinity) : [style]).filter(Boolean));
    __setLocaleForTests('zh');
    try {
      const heading = create(h(Heading, { size: 24 }, '收藏')).root.findByType(Text as never);
      const style = flat(heading.props.style);
      assert.notEqual(style.fontFamily, font.heading);
      assert.equal(style.fontWeight, '700');
      assert.equal(style.lineHeight, Math.round(24 * 1.5));
    } finally { __setLocaleForTests('en'); }
  });
});
