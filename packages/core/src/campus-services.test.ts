import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';

import { campusServicesFor, isCampusLink } from './campus-services.ts';
import {
  bangkokDay, clockOf, hoursNoted, isRoomReminder, reminderTimes, roomPhase, secondsToCollect, type RoomReminder,
} from './room-reminder.ts';

const rmutt = campusServicesFor('rmutt')!;

describe('what RMUTT already runs', () => {
  test('every link goes to the university’s own site', () => {
    const urls = [
      rmutt.rooms.url, rmutt.rooms.rules.source, ...rmutt.rooms.buildings.map((b) => b.url),
      ...rmutt.services.flatMap((s) => [s.link.url, s.source]),
    ];
    for (const url of urls) assert.ok(isCampusLink(rmutt, url), url);
  });

  test('and a look-alike does not count', () => {
    for (const url of [
      'http://booking.rmutt.ac.th/', 'https://rmutt.ac.th.evil.example/', 'https://notrmutt.ac.th/',
      'https://user:pass@booking.rmutt.ac.th/', 'javascript:alert(1)', '',
    ]) assert.equal(isCampusLink(rmutt, url), false, url);
  });

  test('no service line prints an hour nobody has confirmed', () => {
    for (const s of rmutt.services) {
      for (const said of [s.about.en, s.about.th, s.about.zh!]) {
        assert.doesNotMatch(said, /\d{1,2}[:.]\d{2}/, `${s.key}: ${said}`);
      }
    }
  });

  test('the rules that are printed carry the date they were published', () => {
    assert.match(rmutt.rooms.rules.publishedOn, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(rmutt.rooms.buildings.some((b) => b.id === rmutt.rooms.rules.buildingId));
  });

  test('everything is in three languages, and health is marked private', () => {
    for (const s of rmutt.services) {
      for (const words of [s.title, s.about, s.link.label]) assert.ok(words.en && words.th && words.zh, s.key);
    }
    assert.deepEqual(rmutt.services.filter((s) => s.private).map((s) => s.key), ['clinic', 'counselling']);
    assert.equal(new Set(rmutt.rooms.buildings.map((b) => b.url)).size, rmutt.rooms.buildings.length);
    for (const s of rmutt.services) if (s.phone) assert.match(s.phone.dial, /^0\d{8,9}$/);
  });

  test('a campus nobody has read has nothing, rather than RMUTT’s', () => {
    assert.equal(campusServicesFor('ku-sriracha'), null);
    assert.equal(campusServicesFor('koh-sichang'), null);
  });
});

const room = (change: Partial<RoomReminder> = {}): RoomReminder => ({
  id: 'r1', buildingId: 'library', buildingName: { en: 'Library', th: 'หอสมุด' }, room: 'Discussion 4-2',
  startsAt: '2026-11-26T06:00:00Z', endsAt: '2026-11-26T08:00:00Z', collectWithinMin: 15, collected: false, ...change,
});
const at = (hhmm: string) => new Date(`2026-11-26T${hhmm}:00Z`);

describe('a room somebody says they booked', () => {
  test('what to do next, at each point', () => {
    assert.equal(roomPhase(room(), at('05:30')), 'upcoming');
    assert.equal(roomPhase(room(), at('06:02')), 'collect');
    assert.equal(roomPhase(room(), at('06:15')), 'missed');
    assert.equal(roomPhase(room({ collected: true }), at('06:30')), 'using');
    assert.equal(roomPhase(room({ collected: true }), at('07:50')), 'returning');
    assert.equal(roomPhase(room({ collected: true }), at('08:00')), 'over');
  });

  test('where no rule is known, nobody is told they lost a room', () => {
    assert.equal(roomPhase(room({ collectWithinMin: null }), at('06:40')), 'using');
    assert.equal(secondsToCollect(room({ collectWithinMin: null }), at('06:05')), null);
  });

  test('the countdown reaches nought and stops', () => {
    assert.equal(secondsToCollect(room(), at('06:02')), 780);
    assert.equal(clockOf(780), '13:00');
    assert.equal(clockOf(5), '0:05');
    assert.equal(secondsToCollect(room({ collected: true }), at('06:02')), null);
  });

  test('a late booking in Thailand counts on its own Thai day', () => {
    assert.equal(bangkokDay('2026-11-25T18:00:00Z'), '2026-11-26');
    assert.equal(hoursNoted([room(), room({ id: 'r2', buildingId: 'b13' })], 'library', '2026-11-26'), 2);
  });

  test('only speaks about the future', () => {
    assert.deepEqual(reminderTimes(room(), at('05:00')).map((x) => [x.about, x.at.toISOString().slice(11, 16)]), [['leave', '05:45'], ['return', '07:50']]);
    assert.deepEqual(reminderTimes(room(), at('06:00')).map((x) => x.about), ['return']);
    assert.deepEqual(reminderTimes(room(), at('09:00')), []);
  });

  test('what comes back from storage is checked', () => {
    assert.ok(isRoomReminder(room()));
    assert.equal(isRoomReminder({ ...room(), endsAt: '2026-11-26T05:00:00Z' }), false);
    assert.equal(isRoomReminder(null), false);
    assert.equal(isRoomReminder({ id: 'x' }), false);
  });
});
