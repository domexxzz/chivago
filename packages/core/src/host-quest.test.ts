import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';

import {
  HOST_QUEST_MAX_REWARD, HOST_QUEST_MAX_SEATS, hostQuestProblems, isHostQuestArea, mostItCanPay,
  questEventArrivable, questEventState, type HostQuestInput,
} from './host-quest.ts';

const NOW = new Date('2026-12-01T02:00:00Z');
const good: HostQuestInput = {
  area: 'rmutt',
  nameEn: 'Plant a tree', nameTh: 'ปลูกต้นไม้', whereEn: 'Rajamangala Park', whereTh: 'สวนราชมงคล',
  minutes: 90, rewardPoints: 80, rewardCurrency: 'green',
  lat: 14.0334, lng: 100.7251, radiusM: 120, seats: 20,
  startsAt: '2026-12-04T09:00:00+07:00', endsAt: '2026-12-04T12:00:00+07:00',
};
const wrong = (change: Partial<HostQuestInput>) =>
  hostQuestProblems({ ...good, ...change }, NOW).map((p) => p.en).join(' ');

describe('what a campus activity must say before anybody reviews it', () => {
  test('a complete one has nothing wrong with it', () => {
    assert.deepEqual(hostQuestProblems(good, NOW), []);
  });

  test('only a university: the island keeps its own five', () => {
    assert.equal(isHostQuestArea('rmutt'), true);
    assert.equal(isHostQuestArea('koh-sichang'), false);
    assert.match(wrong({ area: 'koh-sichang' }), /university/);
    assert.match(wrong({ area: 'nowhere' }), /university/);
  });

  test('both languages, and neither blank', () => {
    assert.match(wrong({ nameTh: '  ' }), /Thai name/);
    assert.match(wrong({ whereEn: 'x' }), /English meeting point/);
    assert.match(wrong({ nameEn: 'x'.repeat(81) }), /English name/);
  });

  test('a reward and the seats both have a ceiling', () => {
    assert.match(wrong({ rewardPoints: HOST_QUEST_MAX_REWARD + 1 }), /Points/);
    assert.match(wrong({ rewardPoints: -1 }), /Points/);
    assert.match(wrong({ rewardPoints: 1.5 }), /Points/);
    assert.match(wrong({ seats: 0 }), /Seats/);
    assert.match(wrong({ seats: HOST_QUEST_MAX_SEATS + 1 }), /Seats/);
    assert.match(wrong({ rewardCurrency: 'gold' }), /Green or Trip/);
    assert.equal(mostItCanPay(good), 1600);
  });

  test('the meeting point is on the campus it names', () => {
    assert.match(wrong({ lat: 13.16, lng: 100.81 }), /outside this campus/);
    assert.match(wrong({ lat: Number.NaN }), /outside this campus/);
    assert.match(wrong({ radiusM: 5000 }), /radius/);
  });

  test('it starts before it ends, has not ended, and is not a season', () => {
    assert.match(wrong({ endsAt: good.startsAt }), /end after/);
    assert.match(wrong({ startsAt: 'soon' }), /start and an end/);
    assert.match(wrong({ startsAt: '2026-11-01T09:00:00+07:00', endsAt: '2026-11-01T12:00:00+07:00' }), /already ended/);
    assert.match(wrong({ endsAt: '2027-01-04T12:00:00+07:00' }), /14 days/);
  });
});

describe('what somebody deciding whether to go is told', () => {
  const event = { startsAt: good.startsAt, endsAt: good.endsAt, seats: 20, taken: 5, closed: false };
  const at = (iso: string) => new Date(iso);

  test('open, full, ended and closed', () => {
    assert.equal(questEventState(event, NOW), 'open');
    assert.equal(questEventState({ ...event, taken: 20 }, NOW), 'full');
    assert.equal(questEventState(event, at(good.endsAt)), 'ended');
    assert.equal(questEventState({ ...event, closed: true }, NOW), 'closed');
  });

  test('check-in opens half an hour early and stops at the end', () => {
    assert.equal(questEventArrivable(event, at('2026-12-04T08:29:00+07:00')), false);
    assert.equal(questEventArrivable(event, at('2026-12-04T08:30:00+07:00')), true);
    assert.equal(questEventArrivable(event, at('2026-12-04T11:59:00+07:00')), true);
    assert.equal(questEventArrivable(event, at('2026-12-04T12:00:00+07:00')), false);
  });
});
