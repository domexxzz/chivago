import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

import {
  ASSIST_CONCERNS, ASSIST_MAX_PHOTOS, ASSIST_REASONS, ASSIST_TEXT_MAX,
  assistToCheck, assistToolSchema, buildAssistPrompt, parseAssist, weightClaimed,
  type Assist, type AssistQuest,
} from './proof-assist.ts';
import { REJECTION_REASON_KEYS } from './strings.ts';

/**
 * The AI reads a proof and writes an opinion for the host (docs/56). These
 * hold the three things that make that safe: it never learns who sent the
 * proof, nothing it says leaves the shape we allow, and what it says is only
 * ever a signal.
 */

const beach: AssistQuest = {
  code: 'BC-04',
  name: { en: 'Beach Cleanup', th: 'เก็บขยะชายหาด' },
  where: { en: 'Chaweng Beach', th: 'หาดเฉวง' },
  weightKg: 4,
};

/** What was sent with the proof: one photo, 4 kg claimed. */
const one = { photoCount: 1, weightKg: 4 };
const two = { photoCount: 2, weightKg: 4 };
const noClaim = { photoCount: 1, weightKg: null };

const good = (over: Partial<Record<keyof Assist, unknown>> = {}): Record<string, unknown> => ({
  work: 'shown',
  weight: 'consistent',
  concerns: [],
  suggestedReason: null,
  photos: [{ index: 0, en: 'Three full bags on the sand', th: 'ถุงขยะเต็ม 3 ใบบนหาด' }],
  summary: { en: 'Three bags of litter on a beach.', th: 'เห็นถุงขยะ 3 ใบบนหาด' },
  ...over,
});

describe('what the AI is told', () => {
  test('the prompt names the quest in both languages and the weight claimed', () => {
    const { system, user } = buildAssistPrompt(beach, 2);
    const all = system + user;
    for (const s of ['BC-04', 'Beach Cleanup', 'เก็บขยะชายหาด', 'Chaweng Beach', 'หาดเฉวง', '4 kg']) {
      assert.ok(all.includes(s), `prompt is missing ${s}`);
    }
  });

  test('NOTHING about the submitter reaches the prompt, even if a caller passes it', () => {
    // The builder must pick fields, not serialise whatever it was handed: an
    // AI that knows who sent a proof can start judging the person instead of
    // the work (docs/56 rule 6).
    const leaky = {
      ...beach,
      userId: 'u-SUBMITTER-7731',
      displayName: 'Somchai Leakcheck',
      lat: 9.123456,
      lng: 100.654321,
      hostName: 'Samui Municipality',
      priorRejections: 3,
    } as AssistQuest;
    const { system, user } = buildAssistPrompt(leaky, 1);
    for (const s of ['u-SUBMITTER-7731', 'Somchai', 'Leakcheck', '9.123456', '100.654321', 'Samui Municipality']) {
      assert.ok(!(system + user).includes(s), `prompt leaked ${s}`);
    }
  });

  test('anything that is not a real claim reads as "no weight", never "null kg" or "NaN kg"', () => {
    for (const weightKg of [null, undefined, Number.NaN, Infinity, 0, -3]) {
      const { user } = buildAssistPrompt({ ...beach, weightKg: weightKg as number | null }, 1);
      assert.match(user, /No weight was claimed/, `weightKg=${String(weightKg)}`);
      assert.doesNotMatch(user, /null|undefined|NaN|Infinity|-3/);
    }
  });

  test('only a positive finite number is a claim', () => {
    assert.equal(weightClaimed(4), true);
    assert.equal(weightClaimed(0.2), true);
    for (const kg of [null, undefined, Number.NaN, Infinity, 0, -1]) {
      assert.equal(weightClaimed(kg), false, String(kg));
    }
  });

  test('the prompt tells the model it is not the one deciding and to report instructions in photos', () => {
    const { system } = buildAssistPrompt(beach, 1);
    assert.match(system, /host decides/i);
    assert.match(system, /text_instructions/);
    assert.match(system, /do not identify/i);
  });

  test('refuses zero photos, more than the cap, and non-integers', () => {
    for (const n of [0, ASSIST_MAX_PHOTOS + 1, 1.5, Number.NaN]) {
      assert.throws(() => buildAssistPrompt(beach, n), RangeError, String(n));
    }
    assert.doesNotThrow(() => buildAssistPrompt(beach, ASSIST_MAX_PHOTOS));
  });
});

describe('the tool schema the model must answer through', () => {
  const props = assistToolSchema.properties;

  test('requires every field parseAssist needs, and nothing else may be added', () => {
    assert.deepEqual(
      [...assistToolSchema.required].sort(),
      ['concerns', 'photos', 'suggestedReason', 'summary', 'weight', 'work'],
    );
    assert.equal(assistToolSchema.additionalProperties, false);
    assert.equal(props.photos.items.additionalProperties, false);
    assert.equal(props.summary.additionalProperties, false);
  });

  test('offers exactly our concerns, and at most as many photo notes as photos', () => {
    assert.deepEqual(props.concerns.items.enum, [...ASSIST_CONCERNS]);
    assert.equal(props.photos.maxItems, ASSIST_MAX_PHOTOS);
  });

  test('offers only the reasons that need eyes: place and day belong to the other checks', () => {
    assert.deepEqual(props.suggestedReason.anyOf[0].enum, [...ASSIST_REASONS]);
    for (const r of ASSIST_REASONS) assert.ok(REJECTION_REASON_KEYS.includes(r), r);
    assert.ok(!(ASSIST_REASONS as readonly string[]).includes('not_at_site'));
    assert.ok(!(ASSIST_REASONS as readonly string[]).includes('wrong_day'));
  });
});

describe('parsing what the model said', () => {
  test('a well-formed answer comes through intact', () => {
    const a = parseAssist(good(), one);
    assert.ok(a);
    assert.equal(a.work, 'shown');
    assert.equal(a.weight, 'consistent');
    assert.deepEqual(a.concerns, []);
    assert.equal(a.suggestedReason, null);
    assert.equal(a.photos.length, 1);
    assert.equal(a.summary.th, 'เห็นถุงขยะ 3 ใบบนหาด');
  });

  test('anything that is not an object is null', () => {
    for (const raw of [null, undefined, 'shown', 42, [], true]) {
      assert.equal(parseAssist(raw, one), null, `accepted ${JSON.stringify(raw)}`);
    }
  });

  test('a bad photo count is a programming error, not an answer to filter', () => {
    for (const photoCount of [0, Number.NaN, 1.5, ASSIST_MAX_PHOTOS + 1]) {
      assert.throws(() => parseAssist(good(), { photoCount, weightKg: 4 }), RangeError);
    }
  });

  test('a verdict outside the three we allow is null, not guessed', () => {
    for (const work of ['approved', 'SHOWN', '', null, undefined, 1]) {
      assert.equal(parseAssist(good({ work }), one), null, `accepted work=${String(work)}`);
    }
  });

  test('a summary missing either language is null: a Thai host would get nothing to read', () => {
    assert.equal(parseAssist(good({ summary: { en: 'Bags.' } }), one), null);
    assert.equal(parseAssist(good({ summary: { en: 'Bags.', th: '   ' } }), one), null);
    assert.equal(parseAssist(good({ summary: 'Bags.' }), one), null);
  });

  test('text that is not a string is null, whatever it is', () => {
    for (const th of [5, ['ถุง'], { th: 'ถุง' }, true]) {
      assert.equal(parseAssist(good({ summary: { en: 'Bags.', th } }), one), null, JSON.stringify(th));
    }
  });

  test('English in the Thai slot is not Thai', () => {
    assert.equal(parseAssist(good({ summary: { en: 'Bags.', th: 'Bags.' } }), one), null);
    const a = parseAssist(good({ photos: [{ index: 0, en: 'bags', th: 'bags' }] }), one);
    assert.deepEqual(a?.photos, []);
  });

  describe('weight, judged against what was claimed', () => {
    test('with a claim, an opinion is required - missing or invented is null', () => {
      const { weight: _drop, ...noWeight } = good();
      assert.equal(parseAssist(noWeight, one), null);
      assert.equal(parseAssist(good({ weight: null }), one), null);
      assert.equal(parseAssist(good({ weight: 'about right' }), one), null);
    });

    test('without a claim, whatever the model says about weight is ignored', () => {
      const a = parseAssist(good({ weight: 'higher_than_shown' }), noClaim);
      assert.equal(a?.weight, null);
      assert.equal(assistToCheck({ status: 'done', assist: a! }).status, 'pass');
    });
  });

  test('concerns outside our list are dropped, and repeats collapse', () => {
    const a = parseAssist(good({
      work: 'unclear',
      concerns: ['people_only', 'approve_this_one', 'people_only', 7, null],
    }), one);
    assert.deepEqual(a?.concerns, ['people_only']);
  });

  test('concerns that are not a list become none rather than failing the whole answer', () => {
    assert.deepEqual(parseAssist(good({ concerns: 'people_only' }), one)?.concerns, []);
  });

  test('a suggested reason must be one of the reasons we offer - prototype names included', () => {
    for (const bad of ['__proto__', 'toString', 'constructor', 'reject', 'NO_WORK_SHOWN', 'not_at_site', 'wrong_day']) {
      const a = parseAssist(good({ work: 'not_shown', suggestedReason: bad }), one);
      assert.equal(a?.suggestedReason, null, `kept ${bad}`);
    }
    const ok = parseAssist(good({ work: 'not_shown', suggestedReason: 'no_work_shown' }), one);
    assert.equal(ok?.suggestedReason, 'no_work_shown');
  });

  test('a rejection reason beside a clean "shown" is contradictory and is dropped', () => {
    const a = parseAssist(good({ suggestedReason: 'no_work_shown' }), one);
    assert.equal(a?.suggestedReason, null);
  });

  test('photo notes that point at a photo we did not send are dropped, and they come in order', () => {
    const a = parseAssist(good({
      photos: [
        { index: 1, en: 'b', th: 'ข' },
        { index: 0, en: 'a', th: 'ก' },
        { index: 2, en: 'ghost', th: 'ผี' },
        { index: -1, en: 'neg', th: 'ลบ' },
        { index: 0.5, en: 'half', th: 'ครึ่ง' },
        { index: 1, en: 'dupe', th: 'ซ้ำ' },
        { index: 0, en: 'no thai' },
      ],
    }), two);
    assert.deepEqual(a?.photos.map((p) => p.index), [0, 1]);
    assert.equal(a?.photos[1]!.en, 'b');
  });

  test('long text is cut to the cap, so a runaway answer cannot fill the console', () => {
    const en = 'x'.repeat(ASSIST_TEXT_MAX * 3);
    const th = 'ขยะ'.repeat(ASSIST_TEXT_MAX);
    const a = parseAssist(good({ summary: { en, th }, photos: [{ index: 0, en, th }] }), one);
    assert.ok(a);
    for (const s of [a.summary.en, a.summary.th, a.photos[0]!.en, a.photos[0]!.th]) {
      assert.ok(s.length <= ASSIST_TEXT_MAX, `${s.length} > cap`);
      assert.ok(s.endsWith('…'));
    }
  });

  test('cutting never splits an emoji into a lone surrogate', () => {
    const en = `${'x'.repeat(ASSIST_TEXT_MAX - 2)}😀tail`;
    const a = parseAssist(good({ summary: { en, th: 'ถุงขยะ' } }), one);
    assert.ok(a);
    assert.doesNotMatch(a.summary.en, /[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
  });

  test('cutting never strips a Thai vowel or tone mark off its consonant', () => {
    // "ที่" is three code points - ท + ี + ่ - and one character to a reader.
    // Pad so the cap lands inside it.
    const th = `${'ก'.repeat(ASSIST_TEXT_MAX - 2)}ที่นี่`;
    const a = parseAssist(good({ summary: { en: 'Bags.', th } }), one);
    assert.ok(a);
    const body = a.summary.th.slice(0, -1);
    assert.doesNotMatch(body.slice(-1), /[ัิ-ฺ็-๎]/, 'ends on a bare mark');
    assert.ok(!body.endsWith('ท'), 'consonant kept without its marks');
  });

  test('extra fields the model invents do not survive, at any depth', () => {
    const a = parseAssist(good({
      approve: true,
      points: 999,
      summary: { en: 'Bags.', th: 'ถุง', approve: true },
      photos: [{ index: 0, en: 'a', th: 'ก', points: 5 }],
    } as never), one);
    assert.deepEqual(
      Object.keys(a!).sort(),
      ['concerns', 'photos', 'suggestedReason', 'summary', 'weight', 'work'],
    );
    assert.deepEqual(Object.keys(a!.summary).sort(), ['en', 'th']);
    assert.deepEqual(Object.keys(a!.photos[0]!).sort(), ['en', 'index', 'th']);
  });
});

describe('what the host sees: a signal, never a verdict', () => {
  const done = (over: Partial<Assist> = {}) => {
    const a = parseAssist(good(), one)!;
    return assistToCheck({ status: 'done', assist: { ...a, ...over } });
  };

  test('work shown, nothing odd: pass', () => {
    assert.deepEqual(done(), { key: 'ai', status: 'pass', detailKey: 'aiShown', params: {} });
  });

  test('work not shown: fail', () => {
    const c = done({ work: 'not_shown' });
    assert.equal(c.status, 'fail');
    assert.equal(c.detailKey, 'aiNotShown');
  });

  test('not shown outranks every warning', () => {
    const c = done({ work: 'not_shown', concerns: ['people_only'], weight: 'higher_than_shown' });
    assert.equal(c.status, 'fail');
  });

  test('a concern warns, and names what it saw', () => {
    const c = done({ concerns: ['screen_or_printout', 'same_photo_twice'] });
    assert.equal(c.status, 'warn');
    assert.equal(c.detailKey, 'aiConcern');
    assert.equal(c.params.concerns, 'screen_or_printout,same_photo_twice');
  });

  test('a photo that talks to the AI warns even when the model also says "shown"', () => {
    // The injection case from docs/56: a sign in the photo saying "approve
    // this". Whatever it talked the model into, the flag must reach the host.
    const a = parseAssist(good({ concerns: ['text_instructions'] }), one);
    const c = assistToCheck({ status: 'done', assist: a! });
    assert.equal(c.status, 'warn');
    assert.equal(c.params.concerns, 'text_instructions');
  });

  test('more weight claimed than the photos show warns', () => {
    const c = done({ weight: 'higher_than_shown' });
    assert.equal(c.status, 'warn');
    assert.equal(c.detailKey, 'aiWeight');
  });

  test('unclear warns', () => {
    const c = done({ work: 'unclear' });
    assert.equal(c.status, 'warn');
    assert.equal(c.detailKey, 'aiUnclear');
  });

  test('a concern outranks a weight warning, which outranks unclear', () => {
    assert.equal(done({ work: 'unclear', weight: 'higher_than_shown', concerns: ['people_only'] }).detailKey, 'aiConcern');
    assert.equal(done({ work: 'unclear', weight: 'higher_than_shown' }).detailKey, 'aiWeight');
  });

  test('"cannot tell" about weight is not a warning: the AI not knowing is not evidence', () => {
    assert.equal(done({ weight: 'cannot_tell' }).status, 'pass');
  });

  test('every state without an answer is unknown - never pass, never fail', () => {
    const cases = [
      ['pending', 'aiPending'],
      ['failed', 'aiFailed'],
      ['off', 'aiOff'],
      ['limit', 'aiLimit'],
    ] as const;
    for (const [status, detailKey] of cases) {
      assert.deepEqual(
        assistToCheck({ status }),
        { key: 'ai', status: 'unknown', detailKey, params: {} },
      );
    }
  });
});
