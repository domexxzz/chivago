import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';

import { AREAS } from '@chivago/core';
import { areaWords } from './area-words.ts';

describe('what a screen calls the place it is about', () => {
  for (const area of AREAS.filter((a) => a.university)) {
    test(`${area.key} is never called an island, in any language`, () => {
      for (const words of Object.values(areaWords(area))) {
        assert.doesNotMatch(words.en, /island/i);
        assert.doesNotMatch(words.th, /เกาะ/);
        assert.doesNotMatch(words.zh ?? '', /岛/);
      }
    });
  }

  test('every phrase is written in all three languages', () => {
    for (const area of AREAS) {
      for (const [key, words] of Object.entries(areaWords(area))) {
        assert.ok(words.en && words.th && words.zh, `${area.key}.${key}`);
      }
    }
  });

  test('an island keeps its own words, whichever map draws it', () => {
    const islands = AREAS.filter((a) => !a.university);
    assert.deepEqual(islands.map((a) => a.key).sort(), ['koh-sichang', 'samui']);
    for (const island of islands) assert.match(areaWords(island).homeTagline.th, /เกาะ/, island.key);
  });
});
