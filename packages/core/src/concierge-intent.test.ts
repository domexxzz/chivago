/**
 * What the classifier understands, measured against labelled traveller speech.
 *
 * WHY A DATASET RATHER THAN A HANDFUL OF ASSERTIONS
 *
 * The other concierge tests check mechanisms: that context merges, that a
 * follow-up inherits an intent, that safety wins. They all passed while the
 * classifier was reading "a great beach" as a restaurant question, because no
 * test asked it what a traveller would actually type.
 *
 * So this is a ground-truth set with a floor, in the shape docs/75 asks for:
 * intent classification at 95% or better. It was 61% when it was written. The
 * failures it printed are what the fixes were aimed at, and each line below
 * that is marked with a reason is one of them - keep them, because they are
 * the cases that regress quietly.
 *
 * A failure here is not necessarily a bug in the classifier. It can equally
 * mean the label is wrong, or that a phrase is genuinely ambiguous and
 * belongs in the "either reading is defensible" set at the bottom. Read the
 * printed line before changing code.
 */

import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';

import { classifyTravel, emptyConversationContext, type TravelIntent } from './concierge-hybrid.ts';

interface Labelled {
  text: string;
  intent: TravelIntent;
  /** Present when this line is here because it once failed. */
  note?: string;
}

const DATASET: Labelled[] = [
  // --- how a specification writes a request -------------------------------
  { text: 'แนะนำที่เที่ยวเกาะสมุยหน่อย', intent: 'TOURISM' },
  { text: 'ไปไหนดี', intent: 'TOURISM' },
  { text: 'recommend places to visit', intent: 'TOURISM' },
  { text: '推荐景点', intent: 'TOURISM' },
  { text: 'ร้านอาหารแนะนำ', intent: 'RESTAURANT' },
  { text: 'where to eat', intent: 'RESTAURANT' },
  { text: '餐厅推荐', intent: 'RESTAURANT' },
  { text: 'ที่พักติดทะเล', intent: 'ACCOMMODATION' },
  { text: 'cheap hotel', intent: 'ACCOMMODATION' },
  { text: 'พรุ่งนี้ฝนตกไหม', intent: 'WEATHER' },
  { text: 'คนเยอะไหม', intent: 'CROWD' },
  { text: 'พาไปหน่อย', intent: 'NAVIGATION' },
  { text: 'จัดทริป 1 วัน', intent: 'TRIP_PLANNING' },
  { text: 'ช่วยด้วย', intent: 'SAFETY' },
  { text: 'สวัสดี', intent: 'GENERAL' },

  // --- how a traveller actually types -------------------------------------
  { text: 'มีที่เที่ยวชิล ๆ มั้ย', intent: 'TOURISM', note: 'the phrase docs/75 names; "ชิล" was in no list' },
  { text: 'any chill spots?', intent: 'TOURISM', note: 'was GENERAL' },
  { text: 'somewhere quiet', intent: 'TOURISM', note: 'was GENERAL' },
  { text: 'หามุมสงบๆ หน่อย', intent: 'TOURISM', note: 'was GENERAL' },
  { text: 'what is there to do here', intent: 'TOURISM', note: 'was GENERAL' },
  { text: 'อยากดูพระอาทิตย์ตก', intent: 'TOURISM', note: 'an activity, not a category noun' },
  { text: 'หิวมาก', intent: 'RESTAURANT', note: 'was GENERAL' },
  { text: 'นอนไหนดี', intent: 'ACCOMMODATION', note: 'a verb, not the noun ที่พัก' },

  // --- a word inside another word -----------------------------------------
  // `eat` sat inside all of these, and every one classified as RESTAURANT at
  // 0.93 - above the threshold that would have asked Groq for a second look.
  { text: 'a great beach', intent: 'TOURISM', note: 'eat inside great' },
  { text: 'great view point', intent: 'TOURISM', note: 'eat inside great' },
  { text: 'nice weather today', intent: 'WEATHER', note: 'eat inside weather' },

  // --- one letter out ------------------------------------------------------
  { text: 'resturant near me', intent: 'RESTAURANT', note: 'typo' },
  { text: 'wheather tomorrow', intent: 'WEATHER', note: 'typo' },
  { text: 'ร้านอาหานแนะนำ', intent: 'RESTAURANT', note: 'Thai typo; food category must not read as TOURISM' },

  // --- two things in one line ----------------------------------------------
  // The ask is the place; the weather or the crowd is the reason for asking.
  { text: 'ร้านกาแฟเงียบๆ ตอนฝนตก', intent: 'RESTAURANT', note: 'was WEATHER' },
  { text: 'หาที่กินข้าวแถวนี้ ฝนตกรึเปล่า', intent: 'RESTAURANT', note: 'was WEATHER' },
  { text: 'ที่เที่ยวคนไม่เยอะ', intent: 'TOURISM', note: 'was CROWD - a crowd check of nothing' },
  { text: 'quiet beach to visit', intent: 'TOURISM' },
  { text: 'ที่พักเงียบๆ ติดทะเล', intent: 'ACCOMMODATION' },

  // --- safety is never outscored -------------------------------------------
  { text: 'มีคนจมน้ำ', intent: 'SAFETY' },
  { text: '救命', intent: 'SAFETY' },
  { text: 'accident, someone is injured', intent: 'SAFETY' },
];

const FLOOR = 0.95;

describe('what the classifier understands', () => {
  test(`intent is right for at least ${Math.round(FLOOR * 100)}% of labelled traveller speech`, () => {
    const wrong: string[] = [];
    for (const row of DATASET) {
      const got = classifyTravel(row.text, emptyConversationContext('th'));
      if (got.intent !== row.intent) {
        wrong.push(`want ${row.intent} / got ${got.intent} @${got.confidence.toFixed(2)} — ${JSON.stringify(row.text)}${row.note ? ` (${row.note})` : ''}`);
      }
    }
    const accuracy = (DATASET.length - wrong.length) / DATASET.length;
    assert.ok(
      accuracy >= FLOOR,
      `intent accuracy ${(accuracy * 100).toFixed(0)}% is under ${FLOOR * 100}%:\n  ${wrong.join('\n  ')}`,
    );
  });

  /*
    A wrong answer given confidently is worse than a wrong answer given
    doubtfully, because the service only asks Groq for a second reading below
    0.86. Everything that classified as GENERAL at 0.45 was recoverable; "a
    great beach" at 0.93 was not.
  */
  test('nothing is confidently wrong: a miss must stay under the threshold that asks for help', () => {
    const SECOND_OPINION = 0.86;
    const confident: string[] = [];
    for (const row of DATASET) {
      const got = classifyTravel(row.text, emptyConversationContext('th'));
      if (got.intent !== row.intent && got.confidence >= SECOND_OPINION) {
        confident.push(`${got.intent} @${got.confidence.toFixed(2)} for ${JSON.stringify(row.text)}`);
      }
    }
    assert.deepEqual(confident, [], `these are wrong AND too sure to be corrected:\n  ${confident.join('\n  ')}`);
  });

  test('a quiet preference survives into the entities, whichever way it is asked', () => {
    for (const text of ['มีที่เที่ยวชิล ๆ มั้ย', 'any chill spots?', 'somewhere quiet', 'ที่เที่ยวคนไม่เยอะ', 'ที่พักเงียบๆ ติดทะเล']) {
      const { entities } = classifyTravel(text, emptyConversationContext('th'));
      assert.equal(entities.quiet, true, `quiet preference lost from ${JSON.stringify(text)}`);
    }
  });

  test('a keyword is a word, not a run of letters inside one', () => {
    // The regression this is here for: every one of these contains "eat".
    for (const text of ['a great beach', 'the theater district', 'cheap seats', 'defeat the heat']) {
      const { intent } = classifyTravel(text, emptyConversationContext('en'));
      assert.notEqual(intent, 'RESTAURANT', `${JSON.stringify(text)} is not a restaurant question`);
    }
  });
});
