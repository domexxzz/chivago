/**
 * One photograph, one case: what the island's queue is allowed to hold.
 *
 * The rules are the four on the proposal's triage board - reporting earns
 * nothing, the position is the phone's own, one pile is one case however many
 * people saw it, and a photograph from somewhere else is sent back - plus the
 * one the PDPA adds: a photograph we refuse is a photograph we do not keep.
 */
import { strict as assert } from 'node:assert';
import { beforeEach, describe, test } from 'node:test';

import { setBlobStore, type BlobStore } from './blob-store.ts';
import { openTestDb, type DB } from './db-node.ts';
import {
  DebrisReportError,
  debrisReportFor,
  debrisReportsOf,
  submitDebrisReport,
} from './debris-report-service.ts';
import { UnsupportedUpload } from './uploads.ts';

const NOW = new Date('2026-11-23T03:30:00.000Z'); // Monday, 10:30 on the island
const at = (h: number) => new Date(NOW.getTime() + h * 3_600_000);
const iso = (h: number) => at(h).toISOString();

const THAM_PHANG = { lat: 13.1454, lng: 100.806835 };
const SI_RACHA = { lat: 13.1676, lng: 100.9253 };
const north = (p: { lat: number; lng: number }, m: number) => ({ lat: p.lat + m / 111_195, lng: p.lng });

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

const blobs = new Map<string, Uint8Array>();
const store: BlobStore = {
  async put(key, bytes) { blobs.set(key, bytes); },
  async get(key) { return blobs.get(key) ?? null; },
  async delete(key) { blobs.delete(key); },
};

let db: DB;

const send = (
  userId: string,
  over: { position?: unknown; takenAt?: unknown; kinds?: unknown; amount?: unknown; access?: unknown } = {},
  when = NOW,
  photo: Buffer | null = JPEG,
) => submitDebrisReport(db, {
  userId,
  raw: {
    position: { ...THAM_PHANG, accuracyM: 8 },
    takenAt: new Date(when.getTime() - 60_000).toISOString(),
    kinds: ['foam', 'net_rope'], amount: 'strand', access: 'climb',
    ...over,
  },
  photo,
}, when);

const count = (sql: string) => (db.prepare(sql).get() as { n: number }).n;

beforeEach(() => {
  blobs.clear();
  setBlobStore(store);
  db = openTestDb();
  for (const u of ['ana', 'bo', 'chai', 'dao']) {
    db.prepare('INSERT INTO users (id, display_name, created_at) VALUES (?,?,?)').run(u, u, NOW.toISOString());
  }
});

describe('a report that opens a case', () => {
  test('the first photograph of a pile becomes KS-2611-0001, open, with one reporter', async () => {
    const view = await send('ana');
    assert.equal(view.verdict, 'opened');
    assert.equal(view.rejectReason, null);
    assert.deepEqual(view.case, { number: 'KS-2611-0001', status: 'open', openedAt: NOW.toISOString(), reporters: 1, collection: null });
    assert.deepEqual(view.kinds, ['foam', 'net_rope']);
    assert.equal(view.access, 'climb');
  });

  test('the photograph is kept, because an officer will need to see it', async () => {
    await send('ana');
    assert.equal(blobs.size, 1);
    const [key] = [...blobs.keys()];
    assert.match(key!, /^debris\/.+\.jpg$/);
  });

  test('case numbers run on within the month', async () => {
    await send('ana');
    const second = await send('bo', { position: { ...north(THAM_PHANG, 400), accuracyM: 8 } });
    assert.equal(second.case?.number, 'KS-2611-0002');
  });
});

describe('a report that joins one', () => {
  test('a second person thirty metres away an hour later joins the same case, and the case now has two reporters', async () => {
    const first = await send('ana');
    const second = await send('bo', { position: { ...north(THAM_PHANG, 30), accuracyM: 8 } }, at(1));
    assert.equal(second.verdict, 'merged');
    assert.equal(second.case?.number, first.case?.number);
    assert.equal(second.case?.reporters, 2);
    assert.equal(count('SELECT COUNT(*) AS n FROM debris_cases'), 1);
  });

  test('the first reporter sees the count go up too: that is how strong the signal is', async () => {
    const first = await send('ana');
    await send('bo', {}, at(0.5));
    await send('chai', {}, at(1));
    assert.equal(debrisReportFor(db, 'ana', first.id)?.case?.reporters, 3);
  });

  test('one person sending the same pile twice is still one reporter', async () => {
    await send('ana');
    const again = await send('ana', {}, at(0.5));
    assert.equal(again.verdict, 'merged');
    assert.equal(again.case?.reporters, 1);
  });

  test('a case an officer has closed takes no more reports: the next one is a new pile', async () => {
    await send('ana');
    db.prepare("UPDATE debris_cases SET status = 'closed'").run();
    const next = await send('bo', {}, at(0.5));
    assert.equal(next.verdict, 'opened');
    assert.equal(next.case?.number, 'KS-2611-0002');
  });

  test('the window follows the latest report, so a pile reported all morning stays one case', async () => {
    await send('ana');
    await send('bo', {}, at(2.5));
    const late = await send('chai', {}, at(5));
    assert.equal(late.verdict, 'merged');
  });
});

describe('a report that is sent back', () => {
  test('a photograph from Si Racha is answered with the reason, joins no case, and is not kept', async () => {
    const view = await send('ana', { position: { ...SI_RACHA, accuracyM: 8 } });
    assert.equal(view.verdict, 'rejected');
    assert.equal(view.rejectReason, 'outside_area');
    assert.equal(view.case, null);
    assert.equal(blobs.size, 0, 'a refused photograph must not be stored');
    assert.equal(count('SELECT COUNT(*) AS n FROM debris_cases'), 0);
  });

  test('a simulated position is refused the same way', async () => {
    const view = await send('ana', { position: { ...THAM_PHANG, mocked: true } });
    assert.equal(view.rejectReason, 'mocked');
    assert.equal(blobs.size, 0);
  });

  test('a photograph from yesterday morning is refused as stale', async () => {
    const view = await send('ana', { takenAt: iso(-26) });
    assert.equal(view.rejectReason, 'stale');
  });

  test('the refusal is still on record, so the triage board can count what it turned away', async () => {
    await send('ana', { position: { ...SI_RACHA, accuracyM: 8 } });
    assert.equal(count("SELECT COUNT(*) AS n FROM debris_reports WHERE verdict = 'rejected' AND photo_path IS NULL"), 1);
  });
});

describe('what a report never does', () => {
  test('it pays nothing: no ledger row, no wallet change, whatever the verdict', async () => {
    const ledgerBefore = count('SELECT COUNT(*) AS n FROM ledger');
    const walletBefore = db.prepare('SELECT * FROM wallets ORDER BY user_id').all();
    await send('ana');
    await send('bo', {}, at(1));
    await send('chai', { position: { ...SI_RACHA, accuracyM: 8 } });
    assert.equal(count('SELECT COUNT(*) AS n FROM ledger'), ledgerBefore);
    assert.deepEqual(db.prepare('SELECT * FROM wallets ORDER BY user_id').all(), walletBefore);
  });

  test('another traveller cannot read your report', async () => {
    const mine = await send('ana');
    assert.equal(debrisReportFor(db, 'bo', mine.id), null);
    assert.equal(debrisReportFor(db, 'ana', mine.id)?.id, mine.id);
  });
});

describe('what is refused before triage', () => {
  test('every field problem comes back at once, and nothing is written', async () => {
    await assert.rejects(send('ana', { amount: 'lots', access: 'teleport' }), (err: unknown) => {
      assert.ok(err instanceof DebrisReportError);
      assert.equal(err.code, 'INVALID_REPORT');
      assert.equal(err.status, 400);
      assert.deepEqual([...(err.problems ?? [])].sort(), ['access', 'amount']);
      return true;
    });
    assert.equal(count('SELECT COUNT(*) AS n FROM debris_reports'), 0);
  });

  test('no photograph, no report', async () => {
    await assert.rejects(send('ana', {}, NOW, null), (err: unknown) =>
      err instanceof DebrisReportError && err.code === 'PHOTO_REQUIRED');
  });

  test('a file that is not an image is refused by its own bytes', async () => {
    await assert.rejects(send('ana', {}, NOW, Buffer.from('%PDF-1.7 not a photo')), UnsupportedUpload);
    assert.equal(count('SELECT COUNT(*) AS n FROM debris_reports'), 0);
  });

  test('the eleventh report in an hour is refused, and refused reports count towards it', async () => {
    for (let i = 0; i < 5; i += 1) await send('dao', { position: { ...north(THAM_PHANG, i * 200), accuracyM: 8 } });
    for (let i = 0; i < 5; i += 1) await send('dao', { position: { ...SI_RACHA, accuracyM: 8 } });
    await assert.rejects(send('dao'), (err: unknown) =>
      err instanceof DebrisReportError && err.code === 'TOO_MANY_REPORTS' && err.status === 429);
    // An hour on, the count starts again.
    const later = await send('dao', {}, at(1.1));
    assert.notEqual(later.verdict, undefined);
  });
});

describe('two phones at once', () => {
  test('two people sending the same pile in the same instant make one case, not two', async () => {
    // Both reach the photo upload before either is written: the race the
    // triage-then-await order used to lose.
    const [a, b] = await Promise.all([send('ana'), send('bo')]);
    assert.equal(count('SELECT COUNT(*) AS n FROM debris_cases'), 1);
    assert.deepEqual([a.verdict, b.verdict].sort(), ['merged', 'opened']);
    assert.equal(debrisReportFor(db, 'ana', a.id)?.case?.reporters, 2);
  });

  test('the hourly cap holds when twelve reports arrive together', async () => {
    const settled = await Promise.allSettled(
      Array.from({ length: 12 }, (_, i) => send('dao', { position: { ...north(THAM_PHANG, i * 200), accuracyM: 8 } })),
    );
    const refused = settled.filter((s) => s.status === 'rejected'
      && s.reason instanceof DebrisReportError && s.reason.code === 'TOO_MANY_REPORTS');
    assert.equal(count("SELECT COUNT(*) AS n FROM debris_reports WHERE user_id = 'dao'"), 10);
    assert.equal(refused.length, 2);
    assert.equal(blobs.size, 10, 'a photo refused by the cap is not left behind');
  });
});

describe('deleting an account', () => {
  test('the photographs go in the deletion queue with the reports', async () => {
    const view = await send('ana');
    const path = (db.prepare('SELECT photo_path FROM debris_reports WHERE id = ?').get(view.id) as { photo_path: string }).photo_path;
    db.prepare("DELETE FROM users WHERE id = 'ana'").run();
    assert.equal(count('SELECT COUNT(*) AS n FROM debris_reports'), 0);
    assert.equal(count(`SELECT COUNT(*) AS n FROM media_deletions WHERE key = '${path}'`), 1);
    // The case is the municipality's record of a pile and names nobody: it stays.
    assert.equal(count('SELECT COUNT(*) AS n FROM debris_cases'), 1);
  });
});

describe('the sender’s own list', () => {
  test('newest first, refused ones included, nobody else’s', async () => {
    await send('ana');
    await send('ana', { position: { ...SI_RACHA, accuracyM: 8 } }, at(0.2));
    await send('bo', { position: { ...north(THAM_PHANG, 400), accuracyM: 8 } }, at(0.3));
    const mine = debrisReportsOf(db, 'ana');
    assert.deepEqual(mine.map((r) => r.verdict), ['rejected', 'opened']);
  });
});
