import { strict as assert } from 'node:assert';
import { test, describe, beforeEach } from 'node:test';

import { openTestDb, row, type DB } from './db.ts';
import { verifyApiKey } from './host-auth.ts';
import {
  InvalidApplication, applicationById, applicationsWaiting, approveApplication,
  decidedApplications, pendingApplications, rejectApplication, submitApplication,
} from './operator-application-service.ts';

let db: DB;

const BOATS = {
  businessName: 'สหกรณ์เรือท้องครุฏ',
  kind: 'transfer',
  whereLabel: 'ท่าเรือท้องครุฏ',
  contactName: 'สมชาย',
  contactPhone: '081 234 5678',
};

beforeEach(() => {
  db = openTestDb();
});

describe('submitting', () => {
  test('a submission is pending and nothing else', () => {
    const app = submitApplication(db, BOATS);
    assert.equal(app.state, 'pending');
    assert.equal(app.hostId, null);
    assert.equal(app.decidedAt, null);
    assert.equal(app.decidedBy, null);
  });

  test('IT CREATES NO ACCOUNT. A form is not a login', () => {
    submitApplication(db, BOATS);
    const hosts = db.prepare('SELECT COUNT(*) n FROM hosts').get() as unknown as { n: number };
    assert.equal(hosts.n, 0, 'a pending application must not have made a host');
  });

  test('every problem is reported, not just the first', () => {
    // No name and no usable phone. A form that named one of them would send
    // the applicant back twice.
    assert.throws(
      () => submitApplication(db, { ...BOATS, businessName: '  ', contactPhone: '12' }),
      (err: Error) => {
        assert.ok(err instanceof InvalidApplication);
        assert.match(err.message, /ชื่อธุรกิจ/);
        assert.match(err.message, /เบอร์โทร/);
        return true;
      },
    );
  });

  test('a tour with no stated licence number is refused at the door', () => {
    assert.throws(
      () => submitApplication(db, { ...BOATS, kind: 'tour', licenceNo: '  ' }),
      /ใบอนุญาต/,
    );
    assert.equal(pendingApplications(db).length, 0);
  });

  test('a tour that states one is taken, and it is only ever stated', () => {
    const app = submitApplication(db, { ...BOATS, kind: 'tour', licenceNo: '14/01234' });
    assert.equal(app.licenceNo, '14/01234');
    // Nothing on the row claims it was checked, because nothing checked it.
    assert.equal(Object.keys(app).includes('licenceVerified'), false);
  });

  test('an unknown kind is refused', () => {
    assert.throws(() => submitApplication(db, { ...BOATS, kind: 'hotel' }), /not a kind of listing/);
  });

  test('an empty optional field is null, not an empty string', () => {
    const app = submitApplication(db, { ...BOATS, contactEmail: '', note: '   ' });
    assert.equal(app.contactEmail, null);
    assert.equal(app.note, null);
  });

  test('oldest waits first', () => {
    const first = submitApplication(db, BOATS, new Date('2026-10-01T00:00:00Z'));
    const second = submitApplication(db, { ...BOATS, businessName: 'Second' },
      new Date('2026-10-02T00:00:00Z'));
    assert.deepEqual(pendingApplications(db).map((a) => a.id), [first.id, second.id]);
    assert.equal(applicationsWaiting(db), 2);
  });
});

describe('approving', () => {
  test('it creates an OPERATOR account and hands back a key once', () => {
    const app = submitApplication(db, BOATS);
    const { application, key } = approveApplication(db, {
      id: app.id, hostId: 'op-thong-krut-boats', by: 'Nok',
    });

    assert.equal(application.state, 'approved');
    assert.equal(application.hostId, 'op-thong-krut-boats');
    assert.equal(application.decidedBy, 'Nok');

    const host = row<{ name: string; type: string; role: string; api_key_hash: string | null }>(
      db.prepare('SELECT name, type, role, api_key_hash FROM hosts WHERE id = ?')
        .get('op-thong-krut-boats'),
    )!;
    // `operator` is what closes the SOS desk and the review queue to it
    // (docs/62). A business typed anything else gets the whole console.
    assert.equal(host.type, 'operator');
    assert.equal(host.role, 'host');
    assert.equal(host.name, BOATS.businessName);
    assert.ok(verifyApiKey(key, host.api_key_hash));
  });

  test('THE KEY IS STORED ONLY AS A HASH, nowhere in plaintext', () => {
    const app = submitApplication(db, BOATS);
    const { key } = approveApplication(db, { id: app.id, hostId: 'op-boats', by: 'Nok' });

    // Every text column of both tables. A key that reappears anywhere is a
    // key the console could show twice, and the page promises it cannot.
    for (const table of ['hosts', 'operator_applications']) {
      const dump = JSON.stringify(db.prepare(`SELECT * FROM ${table}`).all());
      assert.ok(!dump.includes(key), `${key} is readable in ${table}`);
    }
  });

  test('the contact email is carried onto the account', () => {
    const app = submitApplication(db, { ...BOATS, contactEmail: 'somchai@example.com' });
    approveApplication(db, { id: app.id, hostId: 'op-boats', by: 'Nok' });
    const host = row<{ contact_email: string | null }>(
      db.prepare('SELECT contact_email FROM hosts WHERE id = ?').get('op-boats'),
    )!;
    assert.equal(host.contact_email, 'somchai@example.com');
  });

  test('AN APPLICATION IS APPROVED ONCE. A second approval mints no second key', () => {
    const app = submitApplication(db, BOATS);
    approveApplication(db, { id: app.id, hostId: 'op-boats', by: 'Nok' });
    assert.throws(
      () => approveApplication(db, { id: app.id, hostId: 'op-boats-again', by: 'Nok' }),
      /already been decided/,
    );
    const hosts = db.prepare('SELECT COUNT(*) n FROM hosts').get() as unknown as { n: number };
    assert.equal(hosts.n, 1);
  });

  test('an id already taken is refused, and the application stays waiting', () => {
    db.prepare('INSERT INTO hosts (id,name,type,created_at) VALUES (?,?,?,?)')
      .run('op-boats', 'Someone else', 'operator', new Date().toISOString());
    const app = submitApplication(db, BOATS);
    assert.throws(() => approveApplication(db, { id: app.id, hostId: 'op-boats', by: 'Nok' }),
      /already taken/);
    assert.equal(applicationById(db, app.id)!.state, 'pending');
  });

  test('an id that is not op- shaped is refused before anything is written', () => {
    const app = submitApplication(db, BOATS);
    for (const hostId of ['boats', 'h-boats', 'op-', 'op-Boats!', '../op-boats']) {
      assert.throws(() => approveApplication(db, { id: app.id, hostId, by: 'Nok' }),
        /operator id/, hostId);
    }
    const hosts = db.prepare('SELECT COUNT(*) n FROM hosts').get() as unknown as { n: number };
    assert.equal(hosts.n, 0);
  });

  test('an approval is recorded against a name', () => {
    const app = submitApplication(db, BOATS);
    assert.throws(() => approveApplication(db, { id: app.id, hostId: 'op-boats', by: '  ' }),
      /against a name/);
  });

  test('an unknown application cannot be approved', () => {
    assert.throws(() => approveApplication(db, { id: 'nope', hostId: 'op-boats', by: 'Nok' }),
      /No application has that id/);
  });
});

describe('refusing', () => {
  test('a refusal carries a reason and the name of whoever decided', () => {
    const app = submitApplication(db, BOATS);
    const refused = rejectApplication(db, {
      id: app.id, reason: 'ติดต่อเจ้าของไม่ได้', by: 'Nok',
    });
    assert.equal(refused.state, 'rejected');
    assert.equal(refused.reason, 'ติดต่อเจ้าของไม่ได้');
    assert.equal(refused.decidedBy, 'Nok');
    assert.equal(refused.hostId, null);
  });

  test('A REFUSAL WITHOUT A REASON IS NOT ALLOWED — the business is owed a sentence', () => {
    const app = submitApplication(db, BOATS);
    assert.throws(() => rejectApplication(db, { id: app.id, reason: '   ', by: 'Nok' }), /Say why/);
    assert.equal(applicationById(db, app.id)!.state, 'pending');
  });

  test('a refused application is not approved afterwards', () => {
    const app = submitApplication(db, BOATS);
    rejectApplication(db, { id: app.id, reason: 'no', by: 'Nok' });
    assert.throws(() => approveApplication(db, { id: app.id, hostId: 'op-boats', by: 'Nok' }),
      /already been decided/);
  });

  test('a decision is kept, not deleted', () => {
    const app = submitApplication(db, BOATS);
    rejectApplication(db, { id: app.id, reason: 'no', by: 'Nok' });
    assert.equal(pendingApplications(db).length, 0);
    assert.deepEqual(decidedApplications(db).map((a) => a.id), [app.id]);
  });
});

describe('what the database refuses on its own', () => {
  test('the trigger stops a decided row changing, whatever the caller does', () => {
    const app = submitApplication(db, BOATS);
    rejectApplication(db, { id: app.id, reason: 'no', by: 'Nok' });
    // Straight past the service, the way a script or a console would.
    assert.throws(
      () => db.prepare("UPDATE operator_applications SET state = 'pending' WHERE id = ?")
        .run(app.id),
      /does not change again/,
    );
  });

  test('no path can insert an unlicensed tour', () => {
    assert.throws(
      () => db.prepare(
        `INSERT INTO operator_applications
           (id, business_name, kind, where_label, contact_name, contact_phone, submitted_at)
         VALUES ('x','X','tour','pier','a','0812345678','2026-10-01T00:00:00Z')`,
      ).run(),
      /CHECK/,
    );
  });
});
