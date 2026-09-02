import { strict as assert } from 'node:assert';
import { test, describe, beforeEach } from 'node:test';

import { openTestDb, type DB } from './db.ts';
import {
  dueRungs, escalationsFor, firedRungs, fireRung, isEscalated, LADDER,
  minutesOpen, sweep, unansweredSeconds,
} from './escalation-service.ts';
import { acknowledgeAlert, activeAlert, addContact, cancelAlert, fireAlert } from './sos-service.ts';
import { inbox } from './notification-service.ts';
import type { OncallPage, OncallTransport } from './push/webhook.ts';

let db: DB;
const CHAWENG = { lat: 9.5357, lng: 100.0617 };

/** A pager that records what it was asked to send. */
function fakeOncall(result: boolean | null = true): OncallTransport & { pages: OncallPage[] } {
  const pages: OncallPage[] = [];
  return {
    pages,
    async page(p) { pages.push(p); return result; },
  };
}
/** No webhook configured in this deployment. */
const noOncall = (): OncallTransport => ({ async page() { return null; } });

const ago = (seconds: number) => new Date(Date.now() - seconds * 1000);

beforeEach(() => {
  db = openTestDb();
  const now = new Date().toISOString();
  for (const [id, name] of [['u1', 'John'], ['fam', 'Mae']]) {
    db.prepare('INSERT INTO users (id, display_name, created_at) VALUES (?,?,?)').run(id, name, now);
  }
});

const fireOld = (secondsAgo: number) =>
  fireAlert(db, {
    userId: 'u1', ...CHAWENG, locationLabel: 'Chaweng, 120 m', now: ago(secondsAgo),
  });

describe('the ladder', () => {
  test('rungs are ordered and distinct', () => {
    const times = LADDER.map((r) => r.afterSeconds);
    assert.deepEqual([...times].sort((a, b) => a - b), times, 'rungs must be in time order');
    assert.equal(new Set(LADDER.map((r) => r.rung)).size, LADDER.length);
  });

  test('the first nudge is deliberately early', () => {
    // Two minutes of silence is a long time in an emergency. The cost of
    // nudging early is one notification.
    assert.ok(LADDER[0]!.afterSeconds <= 180, 'first rung should be minutes, not tens of minutes');
  });
});

describe('what is due', () => {
  test('nothing is due immediately', () => {
    const alert = fireOld(0);
    assert.deepEqual(dueRungs(alert, new Date(), new Set()), []);
  });

  test('the first nudge comes due after its interval', () => {
    const alert = fireOld(LADDER[0]!.afterSeconds + 5);
    assert.deepEqual(dueRungs(alert, new Date(), new Set()), ['nudge_1']);
  });

  test('a long silence makes every rung due at once', () => {
    const alert = fireOld(LADDER[LADDER.length - 1]!.afterSeconds + 60);
    assert.deepEqual(dueRungs(alert, new Date(), new Set()), ['nudge_1', 'oncall', 'nudge_2']);
  });

  test('an already-fired rung is not due again', () => {
    const alert = fireOld(LADDER[1]!.afterSeconds + 5);
    assert.deepEqual(dueRungs(alert, new Date(), new Set(['nudge_1'])), ['oncall']);
  });
});

describe('escalation stops when it should', () => {
  test('acknowledging stops the ladder dead', () => {
    // Escalation exists to break silence. Once a named human has the alert,
    // there is nothing left to escalate.
    const alert = fireOld(LADDER[2]!.afterSeconds + 60);
    acknowledgeAlert(db, alert.id, 'Nok');
    const acked = activeAlert(db, 'u1')!;
    assert.deepEqual(dueRungs(acked, new Date(), new Set()), []);
  });

  test('a cancelled alert escalates no further', async () => {
    fireOld(LADDER[0]!.afterSeconds + 5);
    cancelAlert(db, 'u1');
    const summary = await sweep(db, fakeOncall());
    assert.equal(summary.alertsChecked, 0);
    assert.equal(summary.rungsFired, 0);
  });

  test('acknowledging mid-ladder stops the remaining rungs', async () => {
    const alert = fireOld(LADDER[0]!.afterSeconds + 5);
    await sweep(db, fakeOncall());
    assert.deepEqual(escalationsFor(db, alert.id).map((e) => e.rung), ['nudge_1']);

    acknowledgeAlert(db, alert.id, 'Nok');
    // Even with enough time elapsed for every rung.
    db.prepare('UPDATE sos_alerts SET fired_at = ? WHERE id = ?')
      .run(ago(LADDER[2]!.afterSeconds + 120).toISOString(), alert.id);
    await sweep(db, fakeOncall());
    assert.equal(escalationsFor(db, alert.id).length, 1, 'no further rungs after acknowledgement');
  });
});

describe('idempotency — the ticker runs every 30 seconds', () => {
  test('a rung fires exactly once, however many sweeps run', async () => {
    // Without the UNIQUE claim, a rung due at T+120s would re-fire on every
    // tick for the rest of the emergency, burying the person in trouble in
    // identical notifications at the worst possible moment.
    const alert = fireOld(LADDER[0]!.afterSeconds + 5);
    for (let i = 0; i < 10; i += 1) await sweep(db, fakeOncall());

    assert.equal(escalationsFor(db, alert.id).length, 1);
    const nudges = inbox(db, 'u1').filter((n) => n.kind === 'sos_unacknowledged');
    assert.equal(nudges.length, 1, 'the traveller must be told once, not ten times');
  });

  test('overlapping sweeps do not double-fire', async () => {
    const alert = fireOld(LADDER[0]!.afterSeconds + 5);
    // Concurrent ticks, as happens when one sweep runs long.
    await Promise.all([
      sweep(db, fakeOncall()), sweep(db, fakeOncall()), sweep(db, fakeOncall()),
    ]);
    assert.equal(escalationsFor(db, alert.id).length, 1);
  });

  test('firing the same rung directly twice is refused', async () => {
    const alert = fireOld(LADDER[0]!.afterSeconds + 5);
    const first = await fireRung(db, alert, 'nudge_1', fakeOncall());
    const second = await fireRung(db, alert, 'nudge_1', fakeOncall());
    assert.ok(first);
    assert.equal(second, null, 'the second claim must fail');
  });

  test('each rung is tracked separately', async () => {
    const alert = fireOld(LADDER[2]!.afterSeconds + 60);
    await sweep(db, fakeOncall());
    assert.deepEqual(
      escalationsFor(db, alert.id).map((e) => e.rung),
      ['nudge_1', 'oncall', 'nudge_2'],
    );
    assert.deepEqual([...firedRungs(db, alert.id)].sort(), ['nudge_1', 'nudge_2', 'oncall']);
  });
});

describe('what each rung actually does', () => {
  test('nudge 1 tells the traveller and names 1669', async () => {
    // The entire point of the ladder: when our channel fails, say so and push
    // them to the service that works.
    fireOld(LADDER[0]!.afterSeconds + 5);
    await sweep(db, fakeOncall());

    const nudge = inbox(db, 'u1').find((n) => n.kind === 'sos_unacknowledged')!;
    assert.ok(nudge, 'no nudge sent');
    assert.match(nudge.body.en, /1669/);
    assert.match(nudge.body.th, /1669/);
    assert.match(nudge.body.en, /after \d+ min\./);
  });

  test('nudge 1 re-alerts contacts who use the app', async () => {
    addContact(db, { userId: 'u1', name: 'Mae', linkedUserId: 'fam' });
    fireOld(LADDER[0]!.afterSeconds + 5);
    await sweep(db, fakeOncall());

    const kinds = inbox(db, 'fam').map((n) => n.kind);
    assert.ok(kinds.includes('sos_contact_alerted'), 'the original alert');
    assert.ok(kinds.includes('sos_contact_escalated'), 'the re-alert');
  });

  test('the on-call page carries everything a responder needs', async () => {
    const alert = fireOld(LADDER[1]!.afterSeconds + 5);
    const oncall = fakeOncall(true);
    await sweep(db, oncall);

    assert.equal(oncall.pages.length, 1);
    const page = oncall.pages[0]!;
    assert.match(page.text, /unacknowledged/i);
    assert.equal(page.alertId, alert.id);
    assert.equal(page.locationLabel, 'Chaweng, 120 m');
    assert.match(page.mapsUrl, /9\.5357/);
    assert.match(page.liveUrl, /\/sos\/live\//);
    assert.match(page.deskUrl, /\/console\/sos$/);
    assert.ok(page.minutesOpen >= 5);
  });

  test('nudge 2 is blunter and still names the number', async () => {
    fireOld(LADDER[2]!.afterSeconds + 5);
    await sweep(db, fakeOncall());
    const final = inbox(db, 'u1').find((n) => n.kind === 'sos_still_unacknowledged')!;
    assert.match(final.body.en, /1669/);
    assert.match(final.body.en, /cannot send help/i);
  });
});

describe('a missing or broken pager does not stop the ladder', () => {
  test('no webhook configured is recorded honestly, not as success', async () => {
    // "Nobody configured a pager" and "the pager failed" are different facts.
    const alert = fireOld(LADDER[1]!.afterSeconds + 5);
    await sweep(db, noOncall());
    const oncallRung = escalationsFor(db, alert.id).find((e) => e.rung === 'oncall')!;
    assert.match(oncallRung.detail, /no on-call webhook configured/);
  });

  test('a failing webhook is recorded as failed, and the traveller is still told', async () => {
    // Notifying the person in trouble matters more than notifying us.
    const alert = fireOld(LADDER[2]!.afterSeconds + 60);
    await sweep(db, fakeOncall(false));

    const oncallRung = escalationsFor(db, alert.id).find((e) => e.rung === 'oncall')!;
    assert.match(oncallRung.detail, /FAILED/);
    assert.ok(inbox(db, 'u1').some((n) => n.kind === 'sos_still_unacknowledged'));
  });

  test('a pager that throws does not take the sweep down', async () => {
    const exploding: OncallTransport = { async page() { throw new Error('webhook on fire'); } };
    fireOld(LADDER[2]!.afterSeconds + 60);
    const summary = await sweep(db, exploding);
    // The oncall rung is claimed and lost, but the sweep survives and the other
    // rungs still fired.
    assert.ok(summary.rungsFired >= 1);
    assert.ok(inbox(db, 'u1').some((n) => n.kind === 'sos_unacknowledged'));
  });
});

describe('helpers', () => {
  test('minutes open never reads as zero', () => {
    // "open 0 minutes with no response" reads as a bug to someone in distress.
    assert.equal(minutesOpen(fireOld(5), new Date()), 1);
    // Cancel first: re-firing while one is live deliberately returns the SAME
    // alert (the panic-tap guard), so a second fireOld would measure the first.
    cancelAlert(db, 'u1');
    assert.equal(minutesOpen(fireOld(400), new Date()), 7);
  });

  test('unanswered seconds stops counting once acknowledged', () => {
    const alert = fireOld(300);
    assert.ok(unansweredSeconds(alert) >= 300);
    acknowledgeAlert(db, alert.id, 'Nok');
    assert.equal(unansweredSeconds(activeAlert(db, 'u1')!), 0);
  });

  test('an alert with no escalations is not flagged', async () => {
    const alert = fireOld(0);
    assert.equal(isEscalated(db, alert.id), false);
    db.prepare('UPDATE sos_alerts SET fired_at = ? WHERE id = ?')
      .run(ago(LADDER[0]!.afterSeconds + 5).toISOString(), alert.id);
    await sweep(db, fakeOncall());
    assert.equal(isEscalated(db, alert.id), true);
  });
});

describe('copy holds up at every duration', () => {
  test('never reads "1 minutes"', async () => {
    // minutesOpen floors at 1, so this case genuinely occurs. The templates
    // abbreviate to "min" rather than carrying plural machinery for one word.
    fireOld(LADDER[0]!.afterSeconds + 1);
    await sweep(db, fakeOncall());
    for (const n of inbox(db, 'u1')) {
      assert.ok(!/\b1 minutes\b/.test(n.body.en), `bad grammar: ${n.body.en}`);
    }
  });

  test('every escalation message names an emergency number', async () => {
    // If our channel has failed, the message must point at the one that works.
    fireOld(LADDER[2]!.afterSeconds + 60);
    await sweep(db, fakeOncall());
    const nudges = inbox(db, 'u1').filter((n) => n.kind.startsWith('sos_'));
    assert.ok(nudges.length >= 2);
    for (const n of nudges) {
      assert.match(n.body.en, /1669|1155/, `no number in: ${n.body.en}`);
      assert.match(n.body.th, /1669|1155/, `no number in Thai: ${n.body.th}`);
    }
  });

  test('the duration substitutes in both languages', async () => {
    fireOld(LADDER[0]!.afterSeconds + 200);
    await sweep(db, fakeOncall());
    const nudge = inbox(db, 'u1').find((n) => n.kind === 'sos_unacknowledged')!;
    assert.ok(!nudge.body.en.includes('{minutes}'), nudge.body.en);
    assert.ok(!nudge.body.th.includes('{minutes}'), nudge.body.th);
  });
});

describe('what a contact is told, by name', () => {
  test('the re-alert names the TRAVELLER, not the place they are at', async () => {
    // The template reads "{name}'s alert has been open {minutes} min". The
    // first version filled {name} with the location label, so a mother read
    // that "Chaweng, 120 m's alert" was unanswered and had to work out whose.
    addContact(db, { userId: 'u1', name: 'Mae', linkedUserId: 'fam' });
    const alert = fireOld(130);
    await fireRung(db, alert, 'nudge_1', noOncall());

    const theirs = inbox(db, 'fam').find((n) => n.kind === 'sos_contact_escalated');
    assert.ok(theirs, 'the contact was not re-alerted');
    assert.match(theirs.body.en, /^John's alert/);
    assert.doesNotMatch(theirs.body.en, /Chaweng/);
  });
});
