import { strict as assert } from 'node:assert';
import { test, describe, beforeEach } from 'node:test';

import { openTestDb, type DB } from './db.ts';
import {
  acknowledgeAlert, activeAlert, addContact, alertByShareToken, cancelAlert,
  fireAlert, listContacts, liveAlerts, normalisePhone, publicView,
  removeContact, resolveAlert, updatePosition,
} from './sos-service.ts';
import { inbox } from './notification-service.ts';

let db: DB;
const CHAWENG = { lat: 9.5357, lng: 100.0617 };

beforeEach(() => {
  db = openTestDb();
  const now = new Date().toISOString();
  for (const [id, name] of [['u1', 'John'], ['fam', 'Mae'], ['u2', 'Other']]) {
    db.prepare('INSERT INTO users (id, display_name, created_at) VALUES (?,?,?)').run(id, name, now);
  }
});

const fire = (over = {}) =>
  fireAlert(db, {
    userId: 'u1', ...CHAWENG, locationLabel: 'Chaweng, 120 m', ...over,
  });

describe('phone normalisation', () => {
  test('Thai mobile numbers become E.164', () => {
    assert.equal(normalisePhone('081 234 5678'), '+66812345678');
    assert.equal(normalisePhone('081-234-5678'), '+66812345678');
  });

  test('an international number is kept as given', () => {
    assert.equal(normalisePhone('+49 170 1234567'), '+491701234567');
  });

  test('something unusable returns null rather than a broken number', () => {
    assert.equal(normalisePhone('call me'), null);
    assert.equal(normalisePhone('123'), null);
  });
});

describe('contacts', () => {
  test('are scoped to their owner', () => {
    addContact(db, { userId: 'u1', name: 'Mae', phone: '0812345678' });
    addContact(db, { userId: 'u2', name: 'Somebody else' });
    assert.equal(listContacts(db, 'u1').length, 1);
    assert.equal(listContacts(db, 'u1')[0]!.name, 'Mae');
  });

  test('one user cannot delete another user contact', () => {
    const theirs = addContact(db, { userId: 'u2', name: 'Theirs' });
    removeContact(db, 'u1', theirs.id);
    assert.equal(listContacts(db, 'u2').length, 1, 'an id alone must not be enough');
  });

  test('deleting the user takes their contacts with them', () => {
    addContact(db, { userId: 'u1', name: 'Mae' });
    db.prepare('DELETE FROM users WHERE id = ?').run('u1');
    const n = db.prepare('SELECT COUNT(*) n FROM emergency_contacts').get() as unknown as { n: number };
    assert.equal(n.n, 0, 'PDPA erasure must reach an emergency list too');
  });
});

describe('firing an alert', () => {
  test('records where and when', () => {
    const alert = fire();
    assert.equal(alert.status, 'dispatching');
    assert.equal(alert.lat, CHAWENG.lat);
    assert.equal(alert.locationLabel, 'Chaweng, 120 m');
    assert.ok(alert.firedAt);
  });

  test('panic taps produce ONE alert, not several', () => {
    // Two dispatches for one emergency splits whatever attention exists.
    const first = fire();
    const second = fire();
    const third = fire();
    assert.equal(second.id, first.id);
    assert.equal(third.id, first.id);
    assert.equal(liveAlerts(db).length, 1);
  });

  test('always produces a shareable live link', () => {
    // The one channel that needs no provider and no app on the other end.
    const alert = fire();
    assert.match(alert.shareUrl, /\/sos\/live\/[A-Za-z0-9_-]{40,}$/);
  });

  test('share tokens are unguessable and unique per alert', () => {
    const a = fire();
    cancelAlert(db, 'u1');
    const b = fire();
    assert.notEqual(a.shareUrl, b.shareUrl);
    const token = a.shareUrl.split('/').pop()!;
    assert.ok(token.length >= 40, 'the URL is the entire access control');
  });
});

describe('the count is COUNTED, never asserted', () => {
  // The prototype states "Live location shared with 2 contacts" as fixed copy,
  // and the first API stored contacts_notified = 2 regardless. In a safety
  // feature that tells someone in trouble help was reached when nothing was
  // sent. Every number here comes from a real attempt.

  test('no contacts means zero reached, not two', () => {
    const alert = fire();
    assert.equal(alert.contactsTotal, 0);
    assert.equal(alert.contactsReached, 0);
  });

  test('a contact who uses the app is pushed and counted', () => {
    addContact(db, { userId: 'u1', name: 'Mae', linkedUserId: 'fam' });
    // They list each other: that is the consent a push needs.
    addContact(db, { userId: 'fam', name: 'John', linkedUserId: 'u1' });
    const alert = fire();
    assert.equal(alert.contactsTotal, 1);
    assert.equal(alert.contactsReached, 1);
    // And they actually got something.
    const theirs = inbox(db, 'fam');
    assert.equal(theirs.length, 1);
    assert.equal(theirs[0]!.kind, 'sos_contact_alerted');
    assert.match(theirs[0]!.body.en, /John/);
    assert.match(theirs[0]!.body.en, /Chaweng/);
  });

  test('a contact reachable only by SMS is NOT counted when SMS is unconfigured', () => {
    // The honest outcome. Counting them would be the lie this test exists for.
    delete process.env.CHIVAGO_SMS_PROVIDER;
    addContact(db, { userId: 'u1', name: 'Papa', phone: '0812345678' });
    const alert = fire();
    assert.equal(alert.contactsTotal, 1);
    assert.equal(alert.contactsReached, 0, 'nothing was actually sent');

    const sms = alert.dispatches.find((d) => d.channel === 'sms')!;
    assert.equal(sms.status, 'unavailable');
    assert.match(sms.detail!, /send the link yourself/);
  });

  test('mixed contacts report a mixed, truthful result', () => {
    delete process.env.CHIVAGO_SMS_PROVIDER;
    addContact(db, { userId: 'u1', name: 'Mae', linkedUserId: 'fam' });
    // They list each other: that is the consent a push needs.
    addContact(db, { userId: 'fam', name: 'John', linkedUserId: 'u1' });
    addContact(db, { userId: 'u1', name: 'Papa', phone: '0812345678' });
    const alert = fire();
    assert.equal(alert.contactsTotal, 2);
    assert.equal(alert.contactsReached, 1, 'one push, one unreachable');
  });

  test('every channel attempted is recorded, including the ones that failed', () => {
    addContact(db, { userId: 'u1', name: 'Papa', phone: '0812345678' });
    const channels = fire().dispatches.map((d) => d.channel).sort();
    assert.deepEqual(channels, ['operator', 'share_link', 'sms']);
  });
});

describe('live position', () => {
  test('the alert follows the person, not the firing point', () => {
    // Someone in trouble may be walking to a road or on the back of a pickup.
    fire();
    const moved = updatePosition(db, 'u1', { lat: 9.5400, lng: 100.0650 })!;
    assert.equal(moved.lat, 9.5400);
    assert.ok(moved.lastPositionAt);
  });

  test('updating with no live alert is refused rather than creating one', () => {
    assert.equal(updatePosition(db, 'u1', CHAWENG), null);
  });
});

describe('acknowledgement is what makes it real', () => {
  test('a fresh alert is explicitly NOT picked up', () => {
    const alert = fire();
    assert.equal(alert.status, 'dispatching');
    assert.equal(alert.acknowledgedBy, null);
    const operator = alert.dispatches.find((d) => d.channel === 'operator')!;
    assert.match(operator.detail!, /Not yet acknowledged/);
  });

  test('acknowledging names a person and tells them', () => {
    const alert = fire();
    const acked = acknowledgeAlert(db, alert.id, 'Nok Suwannee')!;
    assert.equal(acked.status, 'acknowledged');
    assert.equal(acked.acknowledgedBy, 'Nok Suwannee');

    // Being told a human has you is the most reassuring thing available.
    const theirs = inbox(db, 'u1');
    assert.equal(theirs[0]!.kind, 'sos_acknowledged');
    assert.match(theirs[0]!.body.en, /Nok Suwannee/);
  });

  test('acknowledging twice does not re-notify or overwrite the first responder', () => {
    const alert = fire();
    acknowledgeAlert(db, alert.id, 'Nok');
    acknowledgeAlert(db, alert.id, 'Somchai');
    assert.equal(activeAlert(db, 'u1')!.acknowledgedBy, 'Nok');
    assert.equal(inbox(db, 'u1').filter((n) => n.kind === 'sos_acknowledged').length, 1);
  });

  test('a cancelled alert cannot be acknowledged', () => {
    const alert = fire();
    cancelAlert(db, 'u1');
    assert.equal(acknowledgeAlert(db, alert.id, 'Nok'), null);
  });
});

describe('the public share link', () => {
  const tokenOf = (url: string) => url.split('/').pop()!;

  test('shows the location while the alert is live', () => {
    const alert = fire();
    const view = publicView(db, tokenOf(alert.shareUrl))!;
    assert.equal(view.live, true);
    assert.equal(view.name, 'John');
    assert.equal(view.lat, CHAWENG.lat);
    assert.equal(view.locationLabel, 'Chaweng, 120 m');
  });

  test('follows the person as they move', () => {
    const alert = fire();
    updatePosition(db, 'u1', { lat: 9.5400, lng: 100.0650 });
    assert.equal(publicView(db, tokenOf(alert.shareUrl))!.lat, 9.5400);
  });

  test('STOPS reporting position once the alert ends', () => {
    // The link existed to show where someone was during an emergency. It must
    // not become a permanent tracker on the family group chat.
    const alert = fire();
    const token = tokenOf(alert.shareUrl);
    cancelAlert(db, 'u1');

    const view = publicView(db, token)!;
    assert.equal(view.live, false);
    assert.equal(view.lat, null, 'position must be withheld');
    assert.equal(view.lng, null);
    assert.equal(view.locationLabel, '');
    assert.equal(view.lastPositionAt, null);
  });

  test('a resolved alert also stops reporting', () => {
    const alert = fire();
    const token = tokenOf(alert.shareUrl);
    resolveAlert(db, alert.id, 'Nok');
    assert.equal(publicView(db, token)!.live, false);
    // Null, not 0: (0, 0) is a real place in the Gulf of Guinea.
    assert.equal(publicView(db, token)!.lat, null);
  });

  test('exposes only what a family member needs, and nothing else', () => {
    // Anyone holding the URL sees this. It must not become a profile.
    addContact(db, { userId: 'u1', name: 'Mae', linkedUserId: 'fam' });
    // They list each other: that is the consent a push needs.
    addContact(db, { userId: 'fam', name: 'John', linkedUserId: 'u1' });
    const alert = fire({ note: 'motorbike accident' });
    const view = publicView(db, tokenOf(alert.shareUrl))!;

    const keys = Object.keys(view).sort();
    assert.deepEqual(keys, [
      'acknowledgedBy', 'firedAt', 'lastPositionAt', 'lat', 'live', 'lng',
      'locationLabel', 'name', 'nearestHospital', 'note', 'status',
    ]);
    // No user id, no contacts, no points, no quest history.
    assert.ok(!('userId' in view));
    assert.ok(!('dispatches' in view));
  });

  test('an unknown token reveals nothing', () => {
    assert.equal(publicView(db, 'not-a-real-token'), null);
    assert.equal(alertByShareToken(db, ''), null);
  });

  test('the note reaches the reader while live and is withheld after', () => {
    const alert = fire({ note: 'motorbike accident' });
    const token = tokenOf(alert.shareUrl);
    assert.equal(publicView(db, token)!.note, 'motorbike accident');
    cancelAlert(db, 'u1');
    assert.equal(publicView(db, token)!.note, null);
  });
});

describe('the duty desk sees every alert, not just its own hosts', () => {
  test('alerts from different users all appear', () => {
    // An emergency does not belong to whichever municipality posted the quest
    // someone happened to be doing at the time.
    fireAlert(db, { userId: 'u1', ...CHAWENG, locationLabel: 'Chaweng' });
    fireAlert(db, { userId: 'u2', lat: 9.4611, lng: 99.9908, locationLabel: 'Na Muang' });
    assert.equal(liveAlerts(db).length, 2);
  });

  test('oldest first — the one waiting longest is at the top', () => {
    fireAlert(db, {
      userId: 'u1', ...CHAWENG, locationLabel: 'older',
      now: new Date(Date.now() - 600_000),
    });
    fireAlert(db, { userId: 'u2', ...CHAWENG, locationLabel: 'newer' });
    assert.equal(liveAlerts(db)[0]!.locationLabel, 'older');
  });

  test('cancelled and resolved alerts leave the live list', () => {
    fire();
    cancelAlert(db, 'u1');
    assert.equal(liveAlerts(db).length, 0);
  });
});

describe('a linked contact is only pushed with their say-so', () => {
  test('somebody who has NOT listed you back is recorded as unavailable, not pushed', () => {
    // Anyone can type anyone's user id into a contact. Without this rule that
    // was a way to push an emergency at a stranger through their quiet hours.
    addContact(db, { userId: 'u1', name: 'Stranger', linkedUserId: 'fam' });
    const alert = fireAlert(db, { userId: 'u1', ...CHAWENG, locationLabel: 'Chaweng' });
    const push = alert.dispatches.find((d) => d.channel === 'push');
    assert.ok(push, 'the attempt is still recorded so the traveller sees it was not reached');
    assert.equal(push.status, 'unavailable');
    assert.match(push.detail ?? '', /not added you/);
    assert.equal(alert.contactsReached, 0);
    assert.equal(inbox(db, 'fam').length, 0, 'nothing was pushed at them');
  });
});
