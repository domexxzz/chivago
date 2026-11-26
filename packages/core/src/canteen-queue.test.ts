import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

import {
  FRESH_FOR_MIN, NO_QUEUE_READING, QUEUE_LEVELS, REPORT_EVERY_MIN,
  isQueueLevel, mayReportAgain, readQueue, sayQueue, type QueueLevel, type QueueReport,
} from './canteen-queue.ts';

/**
 * The food court's queue.
 *
 * What these tests guard is the line between an observation and a measurement.
 * A report is somebody's word about a moment, and the app has to keep saying
 * so: whose word, how old, and whether the others agree. The moment it reads
 * as "the queue is long", it is claiming to have looked.
 */

const NOW = Date.parse('2026-11-26T12:05:00.000Z');
const minsAgo = (n: number) => new Date(NOW - n * 60_000).toISOString();
const report = (level: QueueLevel, n: number): QueueReport => ({ placeId: 'rmutt-canteen', level, at: minsAgo(n) });

describe('reading the reports', () => {
  test('nothing reported reads as nothing, not as no queue', () => {
    // The difference that matters: "nobody said" is not "somebody said empty".
    assert.deepEqual(readQueue([], NOW), NO_QUEUE_READING);
    assert.equal(readQueue([], NOW).level, null);
  });

  test('the newest report is the one spoken, with its age', () => {
    const r = readQueue([report('none', 9), report('long', 2)], NOW);
    assert.equal(r.level, 'long');
    assert.equal(r.minAgo, 2);
  });

  test('a report under a minute old is "just now", never "1 min ago"', () => {
    const r = readQueue([{ placeId: 'c', level: 'short', at: new Date(NOW - 50_000).toISOString() }], NOW);
    assert.equal(r.minAgo, 0);
    assert.match(sayQueue(r).en, /just now/);
  });

  test('a report past the fresh window is not the current one', () => {
    const old = readQueue([report('long', FRESH_FOR_MIN + 1)], NOW);
    assert.deepEqual(old, NO_QUEUE_READING, 'a queue from twenty minutes ago is news about then');
    const edge = readQueue([report('long', FRESH_FOR_MIN)], NOW);
    assert.equal(edge.level, 'long', 'the window edge itself still counts');
  });

  test('a stale report cannot swell the count behind a fresh one', () => {
    const r = readQueue([report('long', 1), report('long', 40), report('long', 90)], NOW);
    assert.equal(r.reports, 1, 'only the reports inside the window are counted');
  });

  test('a report from the future is not read', () => {
    // A phone with a wrong clock, or a forged body: neither becomes the answer.
    const r = readQueue([{ placeId: 'c', level: 'long', at: new Date(NOW + 60_000).toISOString() }], NOW);
    assert.deepEqual(r, NO_QUEUE_READING);
  });

  test('an unparseable time is dropped rather than treated as now', () => {
    const r = readQueue([{ placeId: 'c', level: 'short', at: 'not a date' }, report('none', 1)], NOW);
    assert.equal(r.level, 'none');
    assert.equal(r.reports, 1);
  });

  test('agreement is counted, and disagreement is not averaged away', () => {
    const agree = readQueue([report('long', 1), report('long', 3), report('long', 6)], NOW);
    assert.equal(agree.reports, 3);
    assert.equal(agree.disagrees, false);

    const argue = readQueue([report('long', 1), report('none', 3)], NOW);
    assert.equal(argue.level, 'long', 'the newest is what is said');
    assert.equal(argue.disagrees, true);
    assert.equal(argue.reports, 2);
  });
});

describe('what it says out loud', () => {
  test('every sentence names who said it and when - never the app itself', () => {
    for (const level of QUEUE_LEVELS) {
      const said = sayQueue(readQueue([report(level, 3)], NOW));
      for (const lang of ['en', 'th'] as const) {
        assert.match(said[lang], /3/, `the age is missing from the ${lang} sentence`);
      }
      assert.match(said.en, /Somebody there reported/);
      assert.match(said.th, /มีคนที่อยู่ตรงนั้นแจ้งว่า/);
      // The claim is never the app's own observation.
      assert.doesNotMatch(said.en, /^(The|There is a) queue/);
    }
  });

  test('no sentence anywhere offers a wait in minutes', () => {
    // The stall's kitchen owns that number (docs/65). A queue report must not
    // compete with it, or two different "minutes" sit on one screen.
    const cases = [
      sayQueue(NO_QUEUE_READING),
      sayQueue(readQueue([report('long', 2)], NOW)),
      sayQueue(readQueue([report('long', 2), report('none', 4)], NOW)),
      sayQueue(readQueue([report('short', 0), report('short', 1)], NOW)),
    ];
    for (const said of cases) {
      assert.doesNotMatch(said.th, /รอประมาณ|รอ \d+ นาที/, 'a queue report is being worded as a wait');
      assert.doesNotMatch(said.en, /wait|ready in/i, 'a queue report is being worded as a wait');
    }
  });

  test('nothing reported asks for a report, and admits the window', () => {
    const said = sayQueue(NO_QUEUE_READING);
    assert.match(said.en, new RegExp(String(FRESH_FOR_MIN)));
    assert.match(said.th, new RegExp(String(FRESH_FOR_MIN)));
  });

  test('disagreement is said in words, in all three languages', () => {
    const said = sayQueue(readQueue([report('long', 1), report('none', 2)], NOW));
    assert.match(said.en, /do not agree/);
    assert.match(said.th, /ไม่ตรงกัน/);
    assert.ok(said.zh && said.zh.length > 0);
  });

  test('agreement is said only when there is more than one report', () => {
    assert.doesNotMatch(sayQueue(readQueue([report('long', 1)], NOW)).en, /agree/);
    assert.match(sayQueue(readQueue([report('long', 1), report('long', 2)], NOW)).en, /2 reports agree/);
  });
});

describe('one phone is not a crowd', () => {
  test('a first report is always allowed', () => {
    assert.equal(mayReportAgain(null, NOW), true);
  });

  test('a second inside the window is not', () => {
    assert.equal(mayReportAgain(minsAgo(REPORT_EVERY_MIN - 1), NOW), false);
    assert.equal(mayReportAgain(minsAgo(0), NOW), false);
  });

  test('and is allowed again once the window has passed', () => {
    assert.equal(mayReportAgain(minsAgo(REPORT_EVERY_MIN), NOW), true);
    assert.equal(mayReportAgain(minsAgo(REPORT_EVERY_MIN + 10), NOW), true);
  });

  test('an unreadable last-report time does not lock somebody out for ever', () => {
    assert.equal(mayReportAgain('not a date', NOW), true);
  });
});

describe('what arrives off the wire', () => {
  test('only the three levels are levels', () => {
    for (const level of QUEUE_LEVELS) assert.equal(isQueueLevel(level), true);
    for (const no of ['', 'LONG', 'medium', 'none ', 0, null, undefined, {}, ['long']]) {
      assert.equal(isQueueLevel(no), false, `${JSON.stringify(no)} was accepted as a level`);
    }
  });

  test('a prototype key is not a level', () => {
    assert.equal(isQueueLevel('constructor'), false);
    assert.equal(isQueueLevel('__proto__'), false);
  });
});
