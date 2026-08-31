import { strict as assert } from 'node:assert';
import { test, describe, beforeEach } from 'node:test';

import { openTestDb, type DB } from './db.ts';
import {
  backoffMs, devicesFor, disableDevice, dispatch, enqueue, forgetDevice, inbox,
  InvalidPushToken, markAllRead, markRead, MAX_ATTEMPTS, pending, registerDevice,
  getQuietPreference, setQuietPreference, unreadCount,
} from './notification-service.ts';
import type { PushMessage, PushOutcome, PushTransport } from './push/expo.ts';

let db: DB;
const TOKEN = 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]';
const TOKEN2 = 'ExponentPushToken[bbbbbbbbbbbbbbbbbbbbbb]';

/** A transport that records what it was asked to send and returns a scripted result. */
function fakeTransport(
  reply: (m: PushMessage) => PushOutcome,
): PushTransport & { sent: PushMessage[]; calls: number } {
  const sent: PushMessage[] = [];
  return {
    sent,
    calls: 0,
    async send(messages) {
      this.calls += 1;
      sent.push(...messages);
      return messages.map(reply);
    },
  };
}

const okTransport = () => fakeTransport((m) => ({ token: m.to, status: 'ok', receiptId: 'r1' }));
const retryTransport = () =>
  fakeTransport((m) => ({ token: m.to, status: 'retry', message: 'network down' }));

beforeEach(() => {
  db = openTestDb();
  const now = new Date().toISOString();
  for (const u of ['u1', 'u2']) {
    db.prepare('INSERT INTO users (id, display_name, created_at) VALUES (?,?,?)').run(u, u, now);
  }
});

/**
 * A fixed instant OUTSIDE island quiet hours: 13:00 in Bangkok.
 *
 * Every dispatch test needs one. Quiet hours hold non-urgent pushes between
 * 22:00 and 07:00 island time, so a suite that reads the wall clock would
 * pass all day and fail overnight - the worst kind of flake, because it looks
 * like an unrelated regression at 2am.
 */
const DAY = new Date('2026-08-31T06:00:00Z');

const queueOne = (over: Partial<Parameters<typeof enqueue>[1]> = {}) =>
  enqueue(db, {
    userId: 'u1',
    kind: 'quest_approved',
    params: { host: 'Samui Municipality', quest: 'Beach Cleanup', points: 150 },
    data: { screen: 'wallet', questId: 'q1' },
    dedupeKey: 'quest-approved:q1:u1',
    now: DAY,
    ...over,
  });

describe('device registration', () => {
  test('a valid Expo token registers', () => {
    registerDevice(db, { userId: 'u1', token: TOKEN, locale: 'th', platform: 'ios' });
    const devices = devicesFor(db, 'u1');
    assert.equal(devices.length, 1);
    assert.equal(devices[0]!.token, TOKEN);
    assert.equal(devices[0]!.locale, 'th');
  });

  test('a malformed token is refused, not stored', () => {
    for (const bad of ['', 'abc', 'fcm:xyz', 'ExponentPushToken[]', '<script>']) {
      assert.throws(
        () => registerDevice(db, { userId: 'u1', token: bad, locale: 'en' }),
        InvalidPushToken,
        `"${bad}" was accepted`,
      );
    }
    assert.equal(devicesFor(db, 'u1').length, 0);
  });

  test('re-registering refreshes rather than duplicating', () => {
    registerDevice(db, { userId: 'u1', token: TOKEN, locale: 'en' });
    registerDevice(db, { userId: 'u1', token: TOKEN, locale: 'th' });
    const devices = devicesFor(db, 'u1');
    assert.equal(devices.length, 1);
    assert.equal(devices[0]!.locale, 'th', 'locale must update');
  });

  test('a token moving to another user does not notify the previous owner', () => {
    // A shared or resold phone. The old owner must stop receiving.
    registerDevice(db, { userId: 'u1', token: TOKEN, locale: 'en' });
    registerDevice(db, { userId: 'u2', token: TOKEN, locale: 'en' });
    assert.equal(devicesFor(db, 'u1').length, 0);
    assert.equal(devicesFor(db, 'u2').length, 1);
  });

  test('an unknown locale falls back rather than being stored raw', () => {
    registerDevice(db, { userId: 'u1', token: TOKEN, locale: 'de' });
    assert.equal(devicesFor(db, 'u1')[0]!.locale, 'en');
  });

  test('disabling takes effect immediately but keeps the device known', () => {
    // PDPA: consent is revocable. Disabled rather than deleted, so a later
    // re-grant is recognised as the same device.
    registerDevice(db, { userId: 'u1', token: TOKEN, locale: 'en' });
    disableDevice(db, TOKEN);
    assert.equal(devicesFor(db, 'u1').length, 0);

    registerDevice(db, { userId: 'u1', token: TOKEN, locale: 'en' });
    assert.equal(devicesFor(db, 'u1').length, 1, 're-granting must work');
  });

  test('deleting the user removes their devices', () => {
    registerDevice(db, { userId: 'u1', token: TOKEN, locale: 'en' });
    db.prepare('DELETE FROM users WHERE id = ?').run('u1');
    const n = db.prepare('SELECT COUNT(*) n FROM push_tokens').get() as unknown as { n: number };
    assert.equal(n.n, 0, 'PDPA erasure must take the token with it');
  });
});

describe('enqueue is idempotent', () => {
  test('the same dedupe key queues once', () => {
    const first = queueOne();
    const second = queueOne();
    assert.equal(first.created, true);
    assert.equal(second.created, false);
    assert.equal(second.id, first.id);
    assert.equal(inbox(db, 'u1').length, 1);
  });

  test('a retried host callback cannot notify twice', () => {
    for (let i = 0; i < 5; i += 1) queueOne();
    assert.equal(inbox(db, 'u1').length, 1);
  });

  test('different events queue separately', () => {
    queueOne({ dedupeKey: 'quest-approved:q1:u1' });
    queueOne({ dedupeKey: 'quest-approved:q2:u1' });
    assert.equal(inbox(db, 'u1').length, 2);
  });
});

describe('dispatch', () => {
  test('sends in the DEVICE language, not both', () => {
    // A push is read on a lock screen. Unlike the app, it commits to one
    // language - the one the phone is already set to.
    registerDevice(db, { userId: 'u1', token: TOKEN, locale: 'th' });
    queueOne();
    const transport = okTransport();
    return dispatch(db, transport, DAY).then(() => {
      assert.equal(transport.sent.length, 1);
      assert.ok(/[฀-๿]/.test(transport.sent[0]!.body), `not Thai: ${transport.sent[0]!.body}`);
      assert.ok(transport.sent[0]!.body.includes('150'), 'the points must survive');
    });
  });

  test('two devices on different languages each get their own', () => {
    registerDevice(db, { userId: 'u1', token: TOKEN, locale: 'th' });
    registerDevice(db, { userId: 'u1', token: TOKEN2, locale: 'en' });
    queueOne();
    const transport = okTransport();
    return dispatch(db, transport, DAY).then(() => {
      assert.equal(transport.sent.length, 2);
      const bodies = transport.sent.map((m) => m.body);
      assert.ok(bodies.some((b) => /[฀-๿]/.test(b)), 'no Thai message');
      assert.ok(bodies.some((b) => /Green Points/.test(b)), 'no English message');
    });
  });

  test('carries the deep link so tapping opens the right screen', async () => {
    registerDevice(db, { userId: 'u1', token: TOKEN, locale: 'en' });
    queueOne();
    const transport = okTransport();
    await dispatch(db, transport, DAY);
    assert.equal(transport.sent[0]!.data!.screen, 'wallet');
    assert.equal(transport.sent[0]!.data!.questId, 'q1');
    assert.ok(transport.sent[0]!.data!.notificationId, 'the app needs this to mark it read');
  });

  test('a sent notification is not sent again', async () => {
    registerDevice(db, { userId: 'u1', token: TOKEN, locale: 'en' });
    queueOne();
    const transport = okTransport();
    await dispatch(db, transport, DAY);
    await dispatch(db, transport, DAY);
    assert.equal(transport.sent.length, 1);
  });

  test('one batch per dispatch, not one request per notification', async () => {
    // A hundred approvals after a festival weekend must cost one upstream call.
    registerDevice(db, { userId: 'u1', token: TOKEN, locale: 'en' });
    for (let i = 0; i < 20; i += 1) queueOne({ dedupeKey: `q${i}` });
    const transport = okTransport();
    await dispatch(db, transport, DAY);
    assert.equal(transport.calls, 1);
    assert.equal(transport.sent.length, 20);
  });

  test('a user with no device is not retried forever', async () => {
    // Nobody granted permission. The row stays as the inbox entry, but it must
    // stop occupying the outbox.
    queueOne();
    const transport = okTransport();
    await dispatch(db, transport, DAY);
    assert.equal(transport.sent.length, 0);
    assert.equal(pending(db, DAY).length, 0);
    assert.equal(inbox(db, 'u1').length, 1, 'still visible in the app');
  });

  test('never throws, whatever the transport does', async () => {
    registerDevice(db, { userId: 'u1', token: TOKEN, locale: 'en' });
    queueOne();
    const exploding: PushTransport = {
      async send() { throw new Error('upstream on fire'); },
    };
    await assert.rejects(exploding.send([]), /on fire/);
    // dispatch itself surfaces the rejection to its caller, which swallows it;
    // what must not happen is the notification being lost.
    await dispatch(db, exploding, DAY).catch(() => {});
    assert.equal(pending(db, DAY).length, 1, 'still queued for the next tick');
  });
});

describe('retry and backoff', () => {
  test('a transient failure is retried, not dropped', async () => {
    registerDevice(db, { userId: 'u1', token: TOKEN, locale: 'en' });
    queueOne();
    await dispatch(db, retryTransport(), DAY);

    const r = db.prepare('SELECT attempts, sent_at, last_error FROM notifications').get() as
      unknown as { attempts: number; sent_at: string | null; last_error: string };
    assert.equal(r.attempts, 1);
    assert.equal(r.sent_at, null, 'must not be marked sent');
    assert.match(r.last_error, /network down/);
  });

  test('backoff grows, then plateaus', () => {
    const delays = [0, 1, 2, 3, 4, 5, 99].map(backoffMs);
    for (let i = 1; i < 5; i += 1) {
      assert.ok(delays[i]! > delays[i - 1]!, `attempt ${i} did not back off further`);
    }
    assert.equal(delays[5], delays[6], 'must plateau rather than grow without bound');
  });

  test('a retry is not attempted again immediately', async () => {
    registerDevice(db, { userId: 'u1', token: TOKEN, locale: 'en' });
    queueOne();
    await dispatch(db, retryTransport(), DAY);
    // Straight away: still backing off.
    assert.equal(pending(db, DAY).length, 0);
    // An hour later: due again.
    assert.equal(pending(db, new Date(DAY.getTime() + 3_600_000)).length, 1);
  });

  test('gives up after MAX_ATTEMPTS instead of retrying forever', () => {
    registerDevice(db, { userId: 'u1', token: TOKEN, locale: 'en' });
    queueOne();
    db.prepare('UPDATE notifications SET attempts = ?').run(MAX_ATTEMPTS);
    assert.equal(pending(db, new Date(DAY.getTime() + 86_400_000)).length, 0);
  });

  test('a permanently failed notification still shows in the inbox', async () => {
    registerDevice(db, { userId: 'u1', token: TOKEN, locale: 'en' });
    queueOne();
    await dispatch(db, fakeTransport((m) => ({ token: m.to, status: 'failed', message: 'too big' })), DAY);
    assert.equal(pending(db, DAY).length, 0, 'retired from the outbox');
    assert.equal(inbox(db, 'u1').length, 1, 'the user can still read it');
  });
});

describe('dead tokens are pruned', () => {
  test('a device Expo says is gone is forgotten', async () => {
    registerDevice(db, { userId: 'u1', token: TOKEN, locale: 'en' });
    queueOne();
    const summary = await dispatch(
      db,
      fakeTransport((m) => ({ token: m.to, status: 'unregistered' })),
      DAY,
    );
    assert.equal(summary.pruned, 1);
    assert.equal(devicesFor(db, 'u1').length, 0, 'a dead token must not be retried forever');
  });

  test('every device gone is a permanent outcome, not a retry', async () => {
    registerDevice(db, { userId: 'u1', token: TOKEN, locale: 'en' });
    queueOne();
    await dispatch(db, fakeTransport((m) => ({ token: m.to, status: 'unregistered' })), DAY);
    assert.equal(pending(db, new Date(DAY.getTime() + 86_400_000)).length, 0);
  });

  test('one live device is enough — a stale sibling does not fail the send', async () => {
    registerDevice(db, { userId: 'u1', token: TOKEN, locale: 'en' });
    registerDevice(db, { userId: 'u1', token: TOKEN2, locale: 'en' });
    queueOne();
    await dispatch(
      db,
      fakeTransport((m) =>
        m.to === TOKEN
          ? { token: m.to, status: 'unregistered' }
          : { token: m.to, status: 'ok', receiptId: 'r' },
      ),
      DAY,
    );
    assert.equal(pending(db, DAY).length, 0, 'delivered to the surviving device');
    assert.equal(devicesFor(db, 'u1').length, 1, 'the dead one was pruned');
  });
});

describe('unknown kinds fail closed', () => {
  test('a kind with no template is retired, not retried six times', async () => {
    registerDevice(db, { userId: 'u1', token: TOKEN, locale: 'en' });
    db.prepare(
      `INSERT INTO notifications (id, user_id, kind, params, data, created_at, dedupe_key)
       VALUES (?,?,?,?,?,?,?)`,
    ).run('n1', 'u1', 'from_a_future_release', '{}', '{}', new Date().toISOString(), 'k1');

    const summary = await dispatch(db, okTransport(), DAY);
    assert.equal(summary.failed, 1);
    assert.equal(pending(db, new Date(DAY.getTime() + 86_400_000)).length, 0);
  });

  test('an unrenderable row is hidden from the inbox rather than crashing it', () => {
    db.prepare(
      `INSERT INTO notifications (id, user_id, kind, params, data, created_at, dedupe_key)
       VALUES (?,?,?,?,?,?,?)`,
    ).run('n1', 'u1', 'from_a_future_release', '{}', '{}', new Date().toISOString(), 'k1');
    queueOne();
    const items = inbox(db, 'u1');
    assert.equal(items.length, 1, 'the good one still renders');
    assert.equal(items[0]!.kind, 'quest_approved');
  });
});

describe('the inbox', () => {
  test('renders BOTH languages — inside the app there is room', () => {
    queueOne();
    const item = inbox(db, 'u1')[0]!;
    assert.ok(item.title.en.length > 0);
    assert.ok(/[฀-๿]/.test(item.title.th), 'no Thai title');
    assert.ok(item.body.en.includes('150'));
    assert.ok(item.body.th.includes('150'));
  });

  test('is scoped to the user', () => {
    queueOne({ userId: 'u1', dedupeKey: 'a' });
    queueOne({ userId: 'u2', dedupeKey: 'b' });
    assert.equal(inbox(db, 'u1').length, 1);
    assert.equal(inbox(db, 'u2').length, 1);
  });

  test('newest first', () => {
    enqueue(db, { userId: 'u1', kind: 'quest_approved', params: {}, dedupeKey: 'old',
      now: new Date('2026-08-01T00:00:00Z') });
    enqueue(db, { userId: 'u1', kind: 'quest_rejected', params: {}, dedupeKey: 'new',
      now: new Date('2026-08-30T00:00:00Z') });
    assert.equal(inbox(db, 'u1')[0]!.kind, 'quest_rejected');
  });

  test('unread count tracks reads', () => {
    queueOne({ dedupeKey: 'a' });
    queueOne({ dedupeKey: 'b' });
    assert.equal(unreadCount(db, 'u1'), 2);

    markRead(db, 'u1', inbox(db, 'u1')[0]!.id);
    assert.equal(unreadCount(db, 'u1'), 1);

    markAllRead(db, 'u1');
    assert.equal(unreadCount(db, 'u1'), 0);
  });

  test('one user cannot mark another user notification read', () => {
    queueOne({ userId: 'u2', dedupeKey: 'theirs' });
    const theirs = inbox(db, 'u2')[0]!;
    markRead(db, 'u1', theirs.id);
    assert.equal(unreadCount(db, 'u2'), 1, 'an id alone must not be enough');
  });

  test('marking read twice does not move the timestamp', () => {
    queueOne();
    const id = inbox(db, 'u1')[0]!.id;
    markRead(db, 'u1', id, new Date('2026-08-30T10:00:00Z'));
    markRead(db, 'u1', id, new Date('2026-08-31T10:00:00Z'));
    assert.equal(inbox(db, 'u1')[0]!.readAt, '2026-08-30T10:00:00.000Z');
  });
});

describe('template safety', () => {
  test('a quest name containing a placeholder is not re-substituted', () => {
    // Quest names come from hosts and are not trusted input.
    queueOne({
      params: { host: 'H', quest: '{points}', points: 150 },
      dedupeKey: 'inject',
    });
    const item = inbox(db, 'u1').find((i) => i.body.en.includes('{points}'))!;
    assert.ok(item, 'substitution must be single-pass');
  });

  test('a missing parameter leaves the placeholder rather than printing undefined', () => {
    queueOne({ params: {}, dedupeKey: 'sparse' });
    const item = inbox(db, 'u1')[0]!;
    assert.ok(!item.body.en.includes('undefined'), item.body.en);
  });
});

describe('ordering is deterministic', () => {
  test('two notifications in the same millisecond keep a stable order', () => {
    // Without a rowid tiebreaker the inbox reorders itself between reads, which
    // shows up as a flaky test first and a jumping list second.
    const at = new Date('2026-08-31T04:00:00Z');
    enqueue(db, { userId: 'u1', kind: 'quest_rejected', params: {}, dedupeKey: 'first', now: at });
    enqueue(db, { userId: 'u1', kind: 'quest_approved', params: {}, dedupeKey: 'second', now: at });

    for (let i = 0; i < 20; i += 1) {
      assert.deepEqual(
        inbox(db, 'u1').map((n) => n.kind),
        ['quest_approved', 'quest_rejected'],
        `read ${i} came back in a different order`,
      );
    }
  });

  test('the outbox drains oldest-first, stably', () => {
    const at = new Date('2026-08-31T04:00:00Z');
    enqueue(db, { userId: 'u1', kind: 'quest_approved', params: {}, dedupeKey: 'a', now: at });
    enqueue(db, { userId: 'u1', kind: 'quest_rejected', params: {}, dedupeKey: 'b', now: at });
    for (let i = 0; i < 20; i += 1) {
      assert.deepEqual(pending(db, DAY).map((n) => n.kind), ['quest_approved', 'quest_rejected']);
    }
  });
});

describe('quiet hours', () => {
  /** 02:00 on the island — the middle of the window. */
  const NIGHT = new Date('2026-08-31T19:00:00Z');

  test('an ordinary notification is held overnight, not dropped', async () => {
    registerDevice(db, { userId: 'u1', token: TOKEN, locale: 'en' });
    queueOne();

    const transport = okTransport();
    await dispatch(db, transport, NIGHT);
    assert.equal(transport.sent.length, 0, 'nothing pushed at 02:00');

    // Held, not lost, and no attempt burned - it is simply not eligible yet.
    const row = db.prepare('SELECT attempts, sent_at FROM notifications').get() as
      unknown as { attempts: number; sent_at: string | null };
    assert.equal(row.attempts, 0);
    assert.equal(row.sent_at, null);
    assert.equal(pending(db, NIGHT).length, 0);
  });

  test('and goes out in the morning', async () => {
    registerDevice(db, { userId: 'u1', token: TOKEN, locale: 'en' });
    queueOne();
    await dispatch(db, okTransport(), NIGHT);

    const morning = new Date('2026-09-01T01:00:00Z'); // 08:00 island
    const transport = okTransport();
    await dispatch(db, transport, morning);
    assert.equal(transport.sent.length, 1);
  });

  test('an SOS alert ignores quiet hours entirely', async () => {
    registerDevice(db, { userId: 'u1', token: TOKEN, locale: 'en' });
    enqueue(db, {
      userId: 'u1',
      kind: 'sos_contact_alerted',
      params: { name: 'Somchai', where: 'Bophut' },
      dedupeKey: 'sos:a1:u1',
      now: NIGHT,
    });

    const transport = okTransport();
    await dispatch(db, transport, NIGHT);
    // The whole point of the exception. An emergency at 03:00 is exactly when
    // the notification matters most.
    assert.equal(transport.sent.length, 1);
  });

  test('being told a human picked up an SOS is urgent too', async () => {
    registerDevice(db, { userId: 'u1', token: TOKEN, locale: 'en' });
    enqueue(db, {
      userId: 'u1',
      kind: 'sos_acknowledged',
      params: { operator: 'Ploy' },
      dedupeKey: 'sos-ack:a1',
      now: NIGHT,
    });
    const transport = okTransport();
    await dispatch(db, transport, NIGHT);
    assert.equal(transport.sent.length, 1, 'reassurance cannot wait until morning');
  });

  test('the inbox has it all along, quiet hours or not', () => {
    queueOne();
    // The push is held; the durable record never was. Someone who wakes and
    // opens the app at 04:00 finds their news waiting.
    assert.equal(inbox(db, 'u1').length, 1);
  });

  test('21:59 goes out, 22:01 waits', async () => {
    registerDevice(db, { userId: 'u1', token: TOKEN, locale: 'en' });
    queueOne();
    const justBefore = new Date('2026-08-31T14:59:00Z'); // 21:59 island
    const justAfter = new Date('2026-08-31T15:01:00Z'); // 22:01 island
    assert.equal(pending(db, justBefore).length, 1);
    assert.equal(pending(db, justAfter).length, 0);
  });
});

describe('quiet hours are per person', () => {
  const NIGHT = new Date('2026-08-31T19:00:00Z'); // 02:00 island

  test('somebody who turns them off is woken', async () => {
    registerDevice(db, { userId: 'u1', token: TOKEN, locale: 'en' });
    setQuietPreference(db, 'u1', { enabled: false });
    queueOne();

    const transport = okTransport();
    await dispatch(db, transport, NIGHT);
    // A night-shift worker, or somebody who would rather be woken than miss a
    // quest result. The island default is right for most people, not all.
    assert.equal(transport.sent.length, 1);
  });

  test('a custom window is honoured', async () => {
    registerDevice(db, { userId: 'u1', token: TOKEN, locale: 'en' });
    // Sleeps 01:00-09:00 island time.
    setQuietPreference(db, 'u1', { from: 1, until: 9 });
    queueOne();
    assert.equal(pending(db, NIGHT).length, 0, '02:00 is inside their window');
    // 23:00 island: outside their window, inside the default one.
    assert.equal(pending(db, new Date('2026-08-31T16:00:00Z')).length, 1);
  });

  test('no preference means the island default, not "off"', async () => {
    registerDevice(db, { userId: 'u1', token: TOKEN, locale: 'en' });
    queueOne();
    // A user with no profile row has expressed no preference. Reading that as
    // "off" would wake everybody who never opened settings.
    assert.equal(pending(db, NIGHT).length, 0);
  });

  test('SOS ignores the setting entirely, however it is set', async () => {
    registerDevice(db, { userId: 'u1', token: TOKEN, locale: 'en' });
    setQuietPreference(db, 'u1', { from: 0, until: 23 });
    enqueue(db, {
      userId: 'u1', kind: 'sos_contact_alerted',
      params: { name: 'Somchai', where: 'Bophut' },
      dedupeKey: 'sos:a1:u1', now: NIGHT,
    });
    const transport = okTransport();
    await dispatch(db, transport, NIGHT);
    assert.equal(transport.sent.length, 1, 'nobody can mute an emergency');
  });

  test('nonsense hours fall back to the default rather than being rejected', () => {
    const pref = setQuietPreference(db, 'u1', { from: 99, until: -4 });
    // This arrives from a settings screen; the worst outcome of ignoring
    // nonsense is that they keep the default, which is what they had.
    assert.deepEqual(pref, { enabled: true, from: null, until: null });
    assert.deepEqual(getQuietPreference(db, 'u1'), { enabled: true, from: null, until: null });
  });

  test('one person turning them off does not affect anybody else', async () => {
    registerDevice(db, { userId: 'u1', token: TOKEN, locale: 'en' });
    registerDevice(db, { userId: 'u2', token: 'ExponentPushToken[uuuuuuuuuuuuuuuuuuuuu2]', locale: 'en' });
    setQuietPreference(db, 'u1', { enabled: false });
    queueOne();
    queueOne({ userId: 'u2', dedupeKey: 'quest-approved:q1:u2' });

    const transport = okTransport();
    await dispatch(db, transport, NIGHT);
    assert.equal(transport.sent.length, 1, 'only u1');
  });
});
