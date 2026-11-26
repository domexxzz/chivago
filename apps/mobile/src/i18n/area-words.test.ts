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

  test('a campus is never told to wait for the municipality', () => {
    // It has none. The university is its own authority, and a student sent to
    // the municipal desk is sent to the wrong building in another district.
    for (const area of AREAS.filter((a) => a.university)) {
      const { dropOffHost } = areaWords(area);
      assert.doesNotMatch(dropOffHost.en, /municipality/i);
      assert.doesNotMatch(dropOffHost.th, /เทศบาล/);
      assert.match(dropOffHost.en, /university/i);
      assert.match(dropOffHost.th, /มหาวิทยาลัย/);
    }
  });

  test('an island still names the municipality, which is who signs there', () => {
    for (const area of AREAS.filter((a) => !a.university)) {
      assert.match(areaWords(area).dropOffHost.th, /เทศบาล/);
    }
  });

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
