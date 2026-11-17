import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';
import {
  PARTY_QUEST_MODES, PARTY_QUEST_TYPES, isPartyQuestMode, isPartyQuestType,
} from './party-quest.ts';

describe('party quest dimensions', () => {
  test('quest type and mode stay independent', () => {
    assert.deepEqual(PARTY_QUEST_TYPES, ['exploration', 'eco', 'local', 'boss']);
    assert.deepEqual(PARTY_QUEST_MODES, ['individual', 'collective', 'all_members', 'cooperative']);
  });

  test('untrusted values are validated', () => {
    assert.equal(isPartyQuestType('eco'), true);
    assert.equal(isPartyQuestType('today'), false);
    assert.equal(isPartyQuestMode('all_members'), true);
    assert.equal(isPartyQuestMode('race'), false);
  });
});
