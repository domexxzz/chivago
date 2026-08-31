import { strict as assert } from 'node:assert';
import { test, describe, beforeEach } from 'node:test';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openTestDb, type DB } from './db.ts';
import { MAX_BYTES, readPhotoForHost, sniff, storePhoto, UnsupportedUpload } from './uploads.ts';

let db: DB;

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 7)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 7)]);
const WEBP = Buffer.concat([
  Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(64, 7),
]);

beforeEach(() => {
  process.env.CHIVAGO_UPLOADS = mkdtempSync(join(tmpdir(), 'chivago-up-'));
  db = openTestDb();
  const now = new Date().toISOString();
  db.prepare('INSERT INTO hosts (id,name,type,created_at) VALUES (?,?,?,?)').run(
    'h-muni', 'Samui Municipality', 'municipality', now);
  db.prepare('INSERT INTO hosts (id,name,type,created_at) VALUES (?,?,?,?)').run(
    'h-lab', 'Ocean Lab', 'hotel', now);
  for (const [id, host] of [['q-muni', 'h-muni'], ['q-lab', 'h-lab']]) {
    db.prepare(
      `INSERT INTO quests (id,code,name_en,name_th,where_label,duration,reward_points,
         host_id,kind,lat,lng,geofence_radius_m) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(id, id, id, id, 'x', '1h', 100, host, 'today', 9.5, 100.0, 250);
  }
  db.prepare('INSERT INTO users (id,display_name,created_at) VALUES (?,?,?)').run('u1', 'u1', now);
  for (const [id, quest] of [['p-muni', 'q-muni'], ['p-lab', 'q-lab']]) {
    db.prepare(
      'INSERT INTO proofs (id,user_id,quest_id,photos,weight_kg,submitted_at) VALUES (?,?,?,?,?,?)',
    ).run(id, 'u1', quest, '[]', 1, now);
  }
});

describe('content sniffing — the declared type is not trusted', () => {
  test('accepts real JPEG, PNG and WebP by magic bytes', () => {
    assert.equal(sniff(JPEG).mime, 'image/jpeg');
    assert.equal(sniff(PNG).mime, 'image/png');
    assert.equal(sniff(WEBP).mime, 'image/webp');
  });

  test('rejects anything that is not an image, whatever it claims to be', () => {
    // A client can set Content-Type to image/jpeg on an HTML file or a script;
    // the first bytes are harder to lie about.
    assert.throws(() => sniff(Buffer.from('<html><script>alert(1)</script>')), UnsupportedUpload);
    assert.throws(() => sniff(Buffer.from('%PDF-1.7')), UnsupportedUpload);
    assert.throws(() => sniff(Buffer.from('MZ\x90\x00')), UnsupportedUpload);
    assert.throws(() => sniff(Buffer.from('GIF89a')), UnsupportedUpload);
  });

  test('rejects an empty file', () => {
    assert.throws(() => sniff(Buffer.alloc(0)), /empty/);
  });

  test('rejects a file over the size cap', () => {
    const big = Buffer.concat([JPEG, Buffer.alloc(MAX_BYTES)]);
    assert.throws(() => sniff(big), /under \d+ MB/);
  });
});

describe('storage', () => {
  test('writes the bytes and records the row', () => {
    const stored = storePhoto(db, {
      proofId: 'p-muni', bytes: JPEG, lat: 9.5357, lng: 100.0617, takenAt: '2026-08-31T04:00:00Z',
    });
    assert.equal(stored.mime, 'image/jpeg');
    assert.equal(stored.byteSize, JPEG.length);
    assert.deepEqual(readFileSync(stored.storagePath), JPEG);

    const rowCount = db.prepare('SELECT COUNT(*) n FROM proof_files WHERE proof_id=?')
      .get('p-muni') as unknown as { n: number };
    assert.equal(rowCount.n, 1);
  });

  test('the stored filename is generated, never taken from the client', () => {
    // A client-supplied name is a path-traversal vector and carries nothing the
    // database does not already hold.
    const stored = storePhoto(db, { proofId: 'p-muni', bytes: PNG, lat: null, lng: null, takenAt: null });
    assert.match(stored.storagePath, /[0-9a-f-]{36}\.png$/);
    assert.ok(!stored.storagePath.includes('..'));
  });

  test('EXIF coordinates are preserved for the geotag check', () => {
    storePhoto(db, {
      proofId: 'p-muni', bytes: JPEG, lat: 9.5357, lng: 100.0617, takenAt: '2026-08-31T04:00:00Z',
    });
    const r = db.prepare('SELECT lat, lng, taken_at FROM proof_files WHERE proof_id=?')
      .get('p-muni') as unknown as { lat: number; lng: number; taken_at: string };
    assert.equal(r.lat, 9.5357);
    assert.equal(r.taken_at, '2026-08-31T04:00:00Z');
  });

  test('a photo with no EXIF still stores', () => {
    assert.ok(storePhoto(db, { proofId: 'p-muni', bytes: JPEG, lat: null, lng: null, takenAt: null }).id);
  });

  test('deleting the proof removes its files rows', () => {
    storePhoto(db, { proofId: 'p-muni', bytes: JPEG, lat: null, lng: null, takenAt: null });
    db.prepare('DELETE FROM proofs WHERE id=?').run('p-muni');
    const n = db.prepare('SELECT COUNT(*) n FROM proof_files').get() as unknown as { n: number };
    assert.equal(n.n, 0, 'orphaned file rows would outlive the erasure request');
  });
});

describe('photo access is host-scoped in the SQL, not the route', () => {
  test('the owning host can read its photo', () => {
    const stored = storePhoto(db, { proofId: 'p-muni', bytes: JPEG, lat: null, lng: null, takenAt: null });
    const blob = readPhotoForHost(db, 'h-muni', stored.id);
    assert.ok(blob);
    assert.deepEqual(blob.bytes, JPEG);
  });

  test('another host cannot, even knowing the exact id', () => {
    // Photos of volunteers are personal data under Thailand's PDPA. A guessable
    // id must not be enough to see one.
    const stored = storePhoto(db, { proofId: 'p-muni', bytes: JPEG, lat: null, lng: null, takenAt: null });
    assert.equal(readPhotoForHost(db, 'h-lab', stored.id), null);
  });

  test('an unknown photo id returns null rather than throwing', () => {
    assert.equal(readPhotoForHost(db, 'h-muni', 'nope'), null);
  });

  test('a row whose file vanished from disk returns null', () => {
    db.prepare(
      `INSERT INTO proof_files (id,proof_id,storage_path,mime_type,byte_size,uploaded_at)
       VALUES (?,?,?,?,?,?)`,
    ).run('ghost', 'p-muni', '/no/such/file.jpg', 'image/jpeg', 1, new Date().toISOString());
    assert.equal(readPhotoForHost(db, 'h-muni', 'ghost'), null);
  });
});
