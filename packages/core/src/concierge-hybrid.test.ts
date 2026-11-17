import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  classifyTravel, emptyConversationContext, mergeConversationContext, quickRepliesFor,
} from './concierge-hybrid.ts';

describe('hybrid concierge NLU', () => {
  test('classifies all nine intents in Thai, English and Chinese', () => {
    const cases = [
      ['TOURISM', ['แนะนำที่เที่ยวธรรมชาติ', 'Recommend a nature attraction', '推荐自然景点']],
      ['WEATHER', ['วันนี้อากาศเป็นอย่างไร', 'What is the weather today?', '今天天气怎么样？']],
      ['CROWD', ['ที่ไหนคนน้อย', 'Which place is not crowded?', '哪里人少？']],
      ['RESTAURANT', ['หาร้านอาหาร', 'Find a restaurant', '找餐厅']],
      ['ACCOMMODATION', ['หาโรงแรม', 'Find a hotel', '找酒店']],
      ['TRIP_PLANNING', ['ช่วยจัดทริป', 'Plan a trip', '规划行程']],
      ['NAVIGATION', ['ไปยังไง', 'How to get there?', '怎么去？']],
      ['GENERAL', ['สวัสดี', 'Hello', '你好']],
      ['SAFETY', ['ช่วยด้วย มีคนบาดเจ็บ', 'Emergency, someone is injured', '紧急，有人受伤']],
    ] as const;

    for (const [intent, messages] of cases) {
      for (const message of messages) assert.equal(classifyTravel(message).intent, intent, message);
    }
  });

  test('groups natural variants into the same tourism intent and extracts entities', () => {
    for (const message of ['มีที่เที่ยวแถวนี้ไหม', 'แถวนี้ไปเที่ยวไหนดี', 'มีอะไรน่าเที่ยวใกล้ฉันบ้าง']) {
      const result = classifyTravel(message);
      assert.equal(result.intent, 'TOURISM', message);
      assert.ok(result.confidence >= 0.8, message);
    }
    const nature = classifyTravel('พรุ่งนี้อยากเที่ยวธรรมชาติ งบ 500 บาท');
    assert.equal(nature.entities.category, 'nature');
    assert.equal(nature.entities.time, 'tomorrow');
    assert.equal(nature.entities.budgetBaht, 500);
  });

  test('weather, crowd, food, lodging, route and safety take distinct paths', () => {
    assert.equal(classifyTravel('วันนี้ฝนตกไหม').intent, 'WEATHER');
    assert.equal(classifyTravel('ที่ไหนคนน้อย').intent, 'CROWD');
    assert.equal(classifyTravel('หาร้านอาหารใกล้ฉัน').intent, 'RESTAURANT');
    assert.equal(classifyTravel('หารีสอร์ต').intent, 'ACCOMMODATION');
    assert.equal(classifyTravel('เดินทางไปยังไง').intent, 'NAVIGATION');
    assert.equal(classifyTravel('ช่วยด้วย มีคนบาดเจ็บ').intent, 'SAFETY');
  });

  test('short follow-ups resolve against the previous search without crossing contexts', () => {
    const first = classifyTravel('แนะนำที่เที่ยวธรรมชาติ');
    const context = mergeConversationContext(emptyConversationContext(), first, { resultPlaceIds: ['waterfall-1'] });
    const follow = classifyTravel('แล้วพรุ่งนี้ล่ะ', context);
    assert.equal(follow.contextReference, 'previous_search');
    assert.equal(follow.entities.time, 'tomorrow');
    assert.deepEqual(emptyConversationContext().lastSearchResults, []);
  });

  test('extracts time, budget, category, proximity and transport without inventing a destination', () => {
    const result = classifyTravel('พรุ่งนี้เที่ยวธรรมชาติใกล้ฉัน งบไม่เกิน 1,200 บาท เดินเท้า');
    assert.equal(result.intent, 'TOURISM');
    assert.equal(result.entities.category, 'nature');
    assert.equal(result.entities.time, 'tomorrow');
    assert.equal(result.entities.budgetBaht, 1_200);
    assert.equal(result.entities.nearMe, true);
    assert.equal(result.entities.travelMode, 'walk');
    assert.equal(result.entities.placeName, null);
  });

  test('handles mixed language, ambiguity and missing entities conservatively', () => {
    const mixed = classifyTravel('พรุ่งนี้ weather ดีไหม');
    assert.equal(mixed.intent, 'WEATHER');
    assert.equal(mixed.language, 'th');
    assert.equal(mixed.entities.time, 'tomorrow');

    const ambiguous = classifyTravel('ช่วยแนะนำหน่อย');
    assert.equal(ambiguous.intent, 'GENERAL');
    assert.ok(ambiguous.confidence < 0.86);

    const missing = classifyTravel('แนะนำที่เที่ยว');
    assert.equal(missing.intent, 'TOURISM');
    assert.equal(missing.entities.category, null);
    assert.equal(missing.entities.time, null);
    assert.equal(missing.entities.budgetBaht, null);
    assert.equal(missing.needsClarification, false);
  });

  test('quick replies change with intent and language', () => {
    assert.notDeepEqual(quickRepliesFor('WEATHER', 'th'), quickRepliesFor('TOURISM', 'th'));
    assert.ok(quickRepliesFor('NAVIGATION', 'zh').every((item) => /[一-鿿]/.test(item)));
  });

  /**
   * MEASURED 17 November, against the island: three natural ways of asking
   * for more in a row, none of which counted.
   *
   *   "แล้วที่อื่นล่ะ"  "ขอเพิ่มอีก"  "มีอีกไหม"
   *
   * The list held "ที่อื่นอีก", "ขออีก" and "เพิ่มเติม" - near-misses of all
   * three - so pagination never engaged and the same three places came back
   * for as long as anybody kept asking. Nothing failed; it just repeated.
   */
  test('recognises the ways a Thai speaker asks for more', () => {
    const first = classifyTravel('มีที่เที่ยวอะไรบ้าง');
    const context = mergeConversationContext(emptyConversationContext('th'), first, { resultPlaceIds: ['p1', 'p2', 'p3'] });

    for (const phrase of ['แล้วที่อื่นล่ะ', 'ขอเพิ่มอีก', 'มีอีกไหม', 'อีกมั้ย', 'ขอที่เหลือ', 'อย่างอื่นมีไหม']) {
      const more = classifyTravel(phrase, context);
      assert.equal(more.entities.showMore, true, `"${phrase}" did not count as asking for more`);
      assert.equal(more.intent, 'TOURISM', `"${phrase}" lost the thread`);
    }

    // And the words that only look like it.
    for (const phrase of ['ที่นี่ดีไหม', 'ไปยังไง', 'อากาศเป็นไง']) {
      assert.equal(
        classifyTravel(phrase, context).entities.showMore, false,
        `"${phrase}" was read as a request for more`,
      );
    }
  });
  test('understands recommendation refinements without losing the tourism context', () => {
    const first = classifyTravel('Recommend places to visit');
    const context = mergeConversationContext(emptyConversationContext('en'), first, { resultPlaceIds: ['p1', 'p2'] });
    const more = classifyTravel('Show more', context);
    assert.equal(more.intent, 'TOURISM');
    assert.equal(more.entities.showMore, true);
    assert.equal(more.contextReference, 'previous_search');

    const closest = classifyTravel('Which one is closest?', context);
    assert.equal(closest.intent, 'TOURISM');
    assert.equal(closest.entities.closest, true);
    assert.equal(closest.contextReference, 'previous_search');

    for (const message of ['เหมาะกับเด็กและครอบครัว', 'family-friendly places', '适合儿童的景点']) {
      const family = classifyTravel(message, context);
      assert.equal(family.intent, 'TOURISM', message);
      assert.equal(family.entities.familyFriendly, true, message);
    }
    assert.ok(quickRepliesFor('TOURISM', 'en').includes('Show more places'));
  });

  test('understands Thai negative crowd phrasing and numbered pagination', () => {
    const first = classifyTravel('แนะนำที่เที่ยวเกาะสีชังหน่อย');
    let context = mergeConversationContext(emptyConversationContext(), first, { resultPlaceIds: ['p1', 'p2', 'p3'] });

    const quiet = classifyTravel('มีที่ไหนคนไม่เยอะบ้าง', context);
    assert.equal(quiet.intent, 'CROWD');
    assert.equal(quiet.entities.quiet, true);
    assert.equal(quiet.contextReference, 'previous_search');

    context = mergeConversationContext(context, quiet, { resultPlaceIds: ['p2', 'p1'] });
    const more = classifyTravel('ขออีก 3 ที่', context);
    assert.equal(more.intent, 'TOURISM', 'pagination should continue the underlying place search');
    assert.equal(more.entities.showMore, true);
    assert.equal(more.contextReference, 'previous_search');
  });

  test('persists the named map area independently from the currently open screen', () => {
    const analysis = classifyTravel('แนะนำที่เที่ยวเกาะสมุย');
    const context = mergeConversationContext(emptyConversationContext(), analysis, { selectedArea: 'samui' });
    assert.equal(context.selectedArea, 'samui');
    assert.equal(classifyTravel('ขอแบบธรรมชาติ', context).intent, 'TOURISM');
  });
});
