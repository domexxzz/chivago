import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

import { OPENERS, answer, classify, detectLang, type Context } from './concierge.ts';
import { SEED_PLACES, SEED_QUESTS } from './seed.ts';
import type { ScoredPlace } from './types.ts';

/**
 * The island, scored the way the app scores it.
 *
 * Deliberately the REAL seed rather than invented places: a concierge tested
 * against a fixture island can pass while recommending somewhere that does not
 * exist, which is the exact failure this whole design exists to prevent.
 */
const ctx = (): Context => ({
  places: SEED_PLACES.map((p) => ({
    ...p,
    healthyScore: Math.round(
      100 - p.metrics.aqi * 0.4 - p.metrics.crowdDensity * 4 + p.metrics.walkability,
    ),
    breakdown: [],
    reviews: { count: 0, average: null },
  })) as unknown as ScoredPlace[],
  quests: SEED_QUESTS,
});

describe('it answers in the language it was asked in', () => {
  test('Thai script gets Thai back', () => {
    assert.equal(detectLang('ไปไหนดี'), 'th');
    assert.equal(answer('อยากไปทะเล', ctx()).lang, 'th');
  });

  test('English gets English back', () => {
    assert.equal(detectLang('where should I go'), 'en');
    assert.equal(answer('I want a beach', ctx()).lang, 'en');
  });

  test('a Thai question borrowing an English place name still answers in Thai', () => {
    // Commoner than the reverse, and the half that matters is the half the
    // reader has to understand.
    assert.equal(detectLang('อยากไป Chaweng อากาศดีไหม'), 'th');
  });

  test('every reply is non-empty in both languages', () => {
    for (const q of ['somewhere quiet', 'ที่เงียบ ๆ', 'help', 'ช่วยด้วย', 'blah blah']) {
      assert.ok(answer(q, ctx()).text.length > 20, `"${q}" answered with almost nothing`);
    }
  });
});

describe('an emergency outranks everything, in both languages', () => {
  test('a lone cry for help gets 1669, not a beach', () => {
    for (const cry of ['help', 'Help!', 'ช่วยด้วย', 'ช่วย']) {
      const r = answer(cry, ctx());
      assert.equal(r.intent, 'emergency', `"${cry}" was not treated as an emergency`);
      assert.match(r.text, /1669/);
      assert.equal(r.suggestions.length, 0, 'an emergency must not return sightseeing');
    }
  });

  test('the words that mean trouble are caught in both languages', () => {
    for (const q of ['there has been an accident', 'someone is drowning',
      'เกิดอุบัติเหตุ', 'มีคนจมน้ำ', 'ต้องไปโรงพยาบาล']) {
      assert.equal(answer(q, ctx()).intent, 'emergency', `"${q}" missed`);
    }
  });

  test('it hands over dialable numbers, not just a sentence', () => {
    const r = answer('emergency', ctx());
    const dialed = r.dial.map((d) => d.dial);
    assert.ok(dialed.includes('1669'), 'no ambulance number to press');
    assert.ok(dialed.includes('1155'), 'no English-speaking line to press');
    assert.equal(r.action, 'safety');
  });

  test('"help me find lunch" is lunch, not an emergency', () => {
    // The narrow match earns its keep here. Treating every sentence containing
    // "help" as a 1669 call would train people to ignore the one that matters.
    const r = answer('help me find lunch', ctx());
    assert.equal(r.intent, 'recommend');
    assert.ok(r.suggestions.length > 0);
  });
});

describe('a recommendation carries the measurement it was made from', () => {
  test('asking for quiet ranks by crowding, and says how crowded', () => {
    const r = answer('somewhere quiet please', ctx());
    assert.equal(r.intent, 'recommend');
    const lead = r.suggestions[0]!;
    const quietest = [...ctx().places].sort(
      (a, b) => a.metrics.crowdDensity - b.metrics.crowdDensity,
    )[0]!;
    assert.equal(lead.placeId, quietest.id, 'the quietest place was not offered first');
    assert.match(lead.because.en, /people per 100/, 'no crowding figure in the reason');
    assert.match(lead.because.th, /คนต่อ 100/);
  });

  test('asking about air ranks by AQI, and says the AQI', () => {
    const r = answer('where has the cleanest air', ctx());
    const lead = r.suggestions[0]!;
    const cleanest = [...ctx().places].sort((a, b) => a.metrics.aqi - b.metrics.aqi)[0]!;
    assert.equal(lead.placeId, cleanest.id);
    assert.match(lead.because.en, /AQI/);
  });

  test('the reason answers the question that was asked', () => {
    // Somebody who asked about crowds is told about crowds. A reason that
    // ignores the question is a reason about the system, not about the person.
    assert.match(answer('เงียบ ๆ หน่อย', ctx()).suggestions[0]!.because.th, /คนต่อ/);
    assert.match(answer('อากาศดี ๆ', ctx()).suggestions[0]!.because.th, /AQI/);
  });

  test('no recommendation is ever made without a reason', () => {
    for (const q of ['where should I go', 'ไปไหนดี', 'a beach', 'ร้านอาหาร']) {
      for (const s of answer(q, ctx()).suggestions) {
        assert.ok(s.because.en.length > 8, `${s.placeId} offered with no English reason`);
        assert.ok(s.because.th.length > 8, `${s.placeId} offered with no Thai reason`);
      }
    }
  });

  test('a habitat filter is honoured, not quietly ignored', () => {
    const r = answer('somewhere to eat', ctx());
    assert.ok(r.suggestions.length > 0);
    for (const s of r.suggestions) {
      const place = SEED_PLACES.find((p) => p.id === s.placeId)!;
      assert.equal(place.layer, 'Food', `${s.placeId} is not a Food place`);
    }
  });

  test('asking for something the island lacks says so', () => {
    // The failure mode being guarded: falling back to the unfiltered list, so
    // the answer looks confident and is about a different question.
    const empty: Context = { places: [], quests: [] };
    const r = answer('somewhere to eat', empty);
    assert.equal(r.suggestions.length, 0);
    assert.match(r.text, /Nothing on the island/i);
  });

  test('it never offers more than three at once', () => {
    assert.ok(answer('where should I go', ctx()).suggestions.length <= 3);
  });
});

describe('it hands off rather than pretending', () => {
  test('planning a day opens the planner', () => {
    assert.equal(answer('plan my day', ctx()).action, 'plan');
    assert.equal(answer('จัดแผนวันนี้ให้หน่อย', ctx()).action, 'plan');
  });

  test('a price question promises a band, never a number', () => {
    const r = answer('how much does it cost', ctx());
    assert.equal(r.intent, 'price');
    assert.match(r.text, /band/i);
    assert.doesNotMatch(r.text, /\d+\s*(baht|฿|THB)/i, 'it quoted a figure it cannot know');
  });

  test('the two currencies are explained by evidence, not by amount', () => {
    const r = answer('what are green points', ctx());
    assert.match(r.text, /host approved|approved/i);
    assert.equal(r.action, 'wallet');
    assert.match(answer('แต้มสีเขียวคืออะไร', ctx()).text, /ยืนยัน/);
  });
});

describe('when it does not know', () => {
  test('it says what it CAN answer instead of only apologising', () => {
    // A chat that only says "I do not understand" teaches people to stop
    // typing, and they stop before finding the thing it is good at.
    const r = answer('what is the airspeed velocity of a swallow', ctx());
    assert.equal(r.intent, 'unknown');
    assert.match(r.text, /quiet|air|food|beach/i, 'no examples of what it can do');
    assert.doesNotMatch(r.text, /sorry/i);
  });

  test('the Thai fallback is Thai, not an English string in a Thai reply', () => {
    const r = answer('ราชสีห์บินได้ไหม', ctx());
    assert.equal(r.lang, 'th');
    assert.match(r.text, /[฀-๿]/);
  });
});

describe('the openers are questions it can actually answer', () => {
  test('every opener resolves to something better than unknown', () => {
    // An opening chip that lands on "I do not understand" is worse than no
    // chip: the app suggested the question itself.
    for (const o of OPENERS) {
      assert.notEqual(classify(o.en).intent, 'unknown', `EN opener dead: "${o.en}"`);
      assert.notEqual(classify(o.th).intent, 'unknown', `TH opener dead: "${o.th}"`);
    }
  });

  test('each opener is offered in both languages', () => {
    for (const o of OPENERS) {
      assert.ok(o.en.length > 3 && o.th.length > 3);
      assert.match(o.th, /[฀-๿]/, `"${o.en}" has no Thai`);
    }
  });
});

describe('it is pure, so it behaves the same offline', () => {
  test('the same question twice gives the same answer', () => {
    const a = answer('somewhere quiet', ctx());
    const b = answer('somewhere quiet', ctx());
    assert.deepEqual(a, b);
  });
});
