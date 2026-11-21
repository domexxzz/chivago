import { strict as assert } from 'node:assert';
import { beforeEach, describe, test } from 'node:test';
import { bootstrapKohSichangAdventure } from './adventure-bootstrap.ts';
import {
  ActivityVerificationError, createActivityQr, createEvidenceDraft, pendingEvidenceForHost,
  prepareEvidenceSubmission, recordRejectedQrAttempt, reviewEvidence, revokeActivityQr, setPolicy, submitEvidence,
  verifyActivityQr,
} from './activity-verification-service.ts';
import { openTestDb, type DB } from './db-node.ts';
import { petMemoriesFor, travelEventsFor, travelJournalFor } from './travel-event-service.ts';
import { reverseMovement } from './wallet-service.ts';

let db: DB;
const USER = 'activity-user';
const OTHER_USER = 'activity-other';
const HOST = 'activity-host';
const OTHER_HOST = 'activity-other-host';
const NODE = 'ks-memory-route-palace';
const PLACE = 'sc-palace';
const SECRET = 'phase-three-test-signing-secret-is-long-enough';
const NOW = new Date('2026-11-20T04:00:00.000Z');
const position = { lat: 13.15, lng: 100.8, accuracyM: 10, mocked: false };
const placeIds = [
  'sc-palace', 'sc-atsadang-bridge', 'sc-chong-khao-khat', 'sc-chao-pho-khao-yai', 'sc-thamphang',
];

beforeEach(() => {
  db = openTestDb();
  db.prepare('INSERT INTO users (id,display_name,created_at) VALUES (?,?,?)')
    .run(USER, 'Activity traveller', NOW.toISOString());
  db.prepare('INSERT INTO users (id,display_name,created_at) VALUES (?,?,?)')
    .run(OTHER_USER, 'Other traveller', NOW.toISOString());
  db.prepare('INSERT INTO hosts (id,name,type) VALUES (?,?,?)').run(HOST, 'Palace host', 'community');
  db.prepare('INSERT INTO hosts (id,name,type) VALUES (?,?,?)').run(OTHER_HOST, 'Other host', 'community');
  const insert = db.prepare(
    `INSERT INTO places
     (id,name_en,name_th,short,layer,lat,lng,meta,blurb_en,blurb_th,tags,
      safety_label_en,safety_label_th,crowd_density,aqi,safety_index,walkability,photo_url)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  );
  placeIds.forEach((id, index) => insert.run(
    id, `Place ${index + 1}`, `สถานที่ ${index + 1}`, id, 'Quest', 13.15 + index / 1000,
    100.8 + index / 1000, 'Koh Sichang', 'A real place', 'สถานที่จริง', '[]',
    'Use care', 'เดินทางอย่างระมัดระวัง', 1, 20, 8, 7, `/media/places/${id}.jpg`,
  ));
  assert.equal(bootstrapKohSichangAdventure(db).skipped, false);
});

const configure = (overrides: Partial<{
  requiresGps: boolean; requiresQr: boolean; requiresEvidence: boolean; requiresHost: boolean;
  rewardPoints: number; rewardExp: number;
}> = {}) => setPolicy(db, HOST, {
  nodeId: NODE, requiresGps: false, requiresQr: true, requiresEvidence: false,
  requiresHost: false, geofenceRadiusM: 150, rewardPoints: 25, rewardExp: 10,
  rewardCurrency: 'trip', ...overrides,
});

const makeQr = (type: 'static' | 'dynamic' = 'static', at = NOW) => createActivityQr(db, {
  hostId: HOST, nodeId: NODE, type, createdBy: HOST, signingSecret: SECRET, now: at,
  ttlSeconds: 60,
});

const addPhoto = (evidenceId: string) => db.prepare(
  `INSERT INTO adventure_evidence_files
   (id,evidence_id,storage_path,mime_type,byte_size,uploaded_at) VALUES (?,?,?,?,?,?)`,
).run(`photo-${evidenceId}`, evidenceId, `evidence/${evidenceId}.jpg`, 'image/jpeg', 123, NOW.toISOString());

const count = (sql: string): number => (db.prepare(sql).get() as { n: number }).n;

describe('signed Adventure QR verification', () => {
  test('a valid static QR verifies once per traveller and retry is idempotent', () => {
    configure();
    const qr = makeQr();
    const first = verifyActivityQr(db, {
      userId: USER, token: qr.token, clientRequestId: 'static-first-request', signingSecret: SECRET, now: NOW,
    });
    const retry = verifyActivityQr(db, {
      userId: USER, token: qr.token, clientRequestId: 'static-retry-request', signingSecret: SECRET, now: NOW,
    });

    assert.equal(first.activityVerified, true);
    assert.equal(retry.replayed, true);
    assert.equal(retry.scanId, first.scanId);
    assert.equal(count("SELECT COUNT(*) AS n FROM ledger WHERE kind='activity_reward'"), 1);
    assert.equal(count('SELECT COUNT(*) AS n FROM activity_verifications'), 1);
    assert.ok(travelEventsFor(db, USER).some((event) => event.type === 'STORY_UNLOCKED'));
    assert.deepEqual(
      new Set(petMemoriesFor(db, USER).map((memory) => memory.memoryType)),
      new Set(['verified_visit', 'story_unlock']),
    );
    assert.equal(travelJournalFor(db, USER).length, 2);
  });

  test('invalid signatures are rejected and rejected attempts are rate limited and audited', () => {
    configure();
    const qr = makeQr();
    const tampered = `${qr.token.slice(0, -1)}${qr.token.endsWith('a') ? 'b' : 'a'}`;
    assert.throws(() => verifyActivityQr(db, {
      userId: USER, token: tampered, clientRequestId: 'bad-signature-000', signingSecret: SECRET, now: NOW,
    }), (error: unknown) => error instanceof ActivityVerificationError && error.code === 'QR_SIGNATURE_INVALID');
    recordRejectedQrAttempt(db, { userId: USER, clientRequestId: 'bad-signature-000', errorCode: 'QR_SIGNATURE_INVALID', now: NOW });
    assert.equal(count("SELECT COUNT(*) AS n FROM activity_qr_scans WHERE status='rejected'"), 1);
    assert.equal(count("SELECT COUNT(*) AS n FROM activity_verification_audit WHERE event_type='QR_REJECTED'"), 1);
    recordRejectedQrAttempt(db, { userId: USER, clientRequestId: 'bad-signature-000', errorCode: 'QR_SIGNATURE_INVALID', now: NOW });
    assert.equal(count("SELECT COUNT(*) AS n FROM activity_qr_scans WHERE status='rejected'"), 2,
      'an attacker cannot hide repeated failures behind one client request id');
  });

  test('dynamic QR expires and cannot be replayed by a second traveller', () => {
    configure();
    const qr = makeQr('dynamic');
    verifyActivityQr(db, {
      userId: USER, token: qr.token, clientRequestId: 'dynamic-first-request', signingSecret: SECRET, now: NOW,
    });
    assert.throws(() => verifyActivityQr(db, {
      userId: OTHER_USER, token: qr.token, clientRequestId: 'dynamic-replay-other', signingSecret: SECRET, now: NOW,
    }), (error: unknown) => error instanceof ActivityVerificationError && error.code === 'QR_REPLAYED');

    const expired = makeQr('dynamic', new Date(NOW.getTime() - 120_000));
    assert.throws(() => verifyActivityQr(db, {
      userId: OTHER_USER, token: expired.token, clientRequestId: 'dynamic-expired-req', signingSecret: SECRET, now: NOW,
    }), (error: unknown) => error instanceof ActivityVerificationError && error.code === 'QR_EXPIRED');
  });

  test('revocation, activity binding and server GPS policy fail closed', () => {
    configure({ requiresGps: true });
    const revoked = makeQr();
    assert.equal(revokeActivityQr(db, HOST, revoked.id, HOST), true);
    assert.throws(() => verifyActivityQr(db, {
      userId: USER, token: revoked.token, clientRequestId: 'revoked-qr-request', signingSecret: SECRET, now: NOW,
    }), (error: unknown) => error instanceof ActivityVerificationError && error.code === 'QR_REVOKED');

    const live = makeQr();
    assert.throws(() => verifyActivityQr(db, {
      userId: USER, token: live.token, clientRequestId: 'wrong-node-request', signingSecret: SECRET,
      expectedNodeId: 'ks-memory-route-atsadang', fix: position, now: NOW,
    }), (error: unknown) => error instanceof ActivityVerificationError && error.code === 'QR_ACTIVITY_MISMATCH');
    assert.throws(() => verifyActivityQr(db, {
      userId: USER, token: live.token, clientRequestId: 'missing-location-request', signingSecret: SECRET, now: NOW,
    }), (error: unknown) => error instanceof ActivityVerificationError && error.code === 'LOCATION_REQUIRED');
    const verified = verifyActivityQr(db, {
      userId: USER, token: live.token, clientRequestId: 'gps-valid-request', signingSecret: SECRET, fix: position, now: NOW,
    });
    assert.equal(verified.activityVerified, true);
  });
});

describe('evidence and host approval', () => {
  test('preflights GPS and the cumulative photo quota before any blob is stored', () => {
    setPolicy(db, HOST, {
      nodeId: NODE, requiresGps: true, requiresQr: false, requiresEvidence: true,
      requiresHost: true, geofenceRadiusM: 150, rewardPoints: 0, rewardExp: 0,
      rewardCurrency: 'trip',
    });
    const draft = createEvidenceDraft(db, {
      userId: USER, nodeId: NODE, clientRequestId: 'preflight-draft-request',
    });
    assert.throws(() => prepareEvidenceSubmission(db, {
      userId: USER, evidenceId: draft.id, incomingPhotos: 1, maxPhotos: 3,
      fix: { lat: 14, lng: 101, accuracyM: 10, mocked: false }, now: NOW,
    }), (error: unknown) => error instanceof ActivityVerificationError && error.code === 'OUTSIDE_GEOFENCE');
    assert.equal(count('SELECT COUNT(*) AS n FROM adventure_evidence_files'), 0);
    addPhoto(draft.id);
    db.prepare(`INSERT INTO adventure_evidence_files
      (id,evidence_id,storage_path,mime_type,byte_size,uploaded_at) VALUES (?,?,?,?,?,?)`)
      .run(`photo-2-${draft.id}`, draft.id, `evidence/2-${draft.id}.jpg`, 'image/jpeg', 123, NOW.toISOString());
    db.prepare(`INSERT INTO adventure_evidence_files
      (id,evidence_id,storage_path,mime_type,byte_size,uploaded_at) VALUES (?,?,?,?,?,?)`)
      .run(`photo-3-${draft.id}`, draft.id, `evidence/3-${draft.id}.jpg`, 'image/jpeg', 123, NOW.toISOString());
    assert.throws(() => prepareEvidenceSubmission(db, {
      userId: USER, evidenceId: draft.id, incomingPhotos: 1, maxPhotos: 3,
      fix: position, now: NOW,
    }), (error: unknown) => error instanceof ActivityVerificationError && error.code === 'TOO_MANY_PHOTOS');
  });

  test('pending evidence has no reward; only the owning host can approve it once', () => {
    configure({ requiresEvidence: true, requiresHost: true });
    const qr = makeQr();
    const scan = verifyActivityQr(db, {
      userId: USER, token: qr.token, clientRequestId: 'evidence-qr-request', signingSecret: SECRET, now: NOW,
    });
    assert.equal(scan.activityVerified, false);
    const draft = createEvidenceDraft(db, {
      userId: USER, nodeId: NODE, clientRequestId: 'evidence-draft-request', qrScanId: scan.scanId,
    });
    addPhoto(draft.id);
    const pending = submitEvidence(db, { userId: USER, evidenceId: draft.id, now: NOW });
    assert.equal(pending.status, 'pending_review');
    assert.equal(pendingEvidenceForHost(db, HOST).length, 1);
    assert.equal(count("SELECT COUNT(*) AS n FROM ledger WHERE kind='activity_reward'"), 0);

    assert.throws(() => reviewEvidence(db, {
      hostId: OTHER_HOST, reviewer: OTHER_HOST, evidenceId: draft.id, approved: true, now: NOW,
    }), (error: unknown) => error instanceof ActivityVerificationError && error.code === 'FORBIDDEN');
    const approved = reviewEvidence(db, {
      hostId: HOST, reviewer: HOST, evidenceId: draft.id, approved: true, now: NOW,
    });
    assert.equal(approved.status, 'approved');
    assert.equal(count("SELECT COUNT(*) AS n FROM ledger WHERE kind='activity_reward'"), 1);
    assert.throws(() => reviewEvidence(db, {
      hostId: HOST, reviewer: HOST, evidenceId: draft.id, approved: true, now: NOW,
    }), (error: unknown) => error instanceof ActivityVerificationError && error.code === 'ALREADY_DECIDED');
    assert.equal(count("SELECT COUNT(*) AS n FROM ledger WHERE kind='activity_reward'"), 1);
  });

  test('rejection requires a reason and never awards; reversal keeps audit but hides derived progress', () => {
    configure({ requiresEvidence: true, requiresHost: true });
    const qr = makeQr();
    const scan = verifyActivityQr(db, {
      userId: USER, token: qr.token, clientRequestId: 'reject-qr-request', signingSecret: SECRET, now: NOW,
    });
    const rejectedDraft = createEvidenceDraft(db, {
      userId: USER, nodeId: NODE, clientRequestId: 'reject-draft-request', qrScanId: scan.scanId,
    });
    addPhoto(rejectedDraft.id);
    submitEvidence(db, { userId: USER, evidenceId: rejectedDraft.id, now: NOW });
    assert.throws(() => reviewEvidence(db, {
      hostId: HOST, reviewer: HOST, evidenceId: rejectedDraft.id, approved: false, now: NOW,
    }), (error: unknown) => error instanceof ActivityVerificationError && error.code === 'REASON_REQUIRED');
    const rejected = reviewEvidence(db, {
      hostId: HOST, reviewer: HOST, evidenceId: rejectedDraft.id, approved: false,
      reason: 'Photo does not show the requested activity', now: NOW,
    });
    assert.equal(rejected.status, 'rejected');
    assert.equal(count("SELECT COUNT(*) AS n FROM ledger WHERE kind='activity_reward'"), 0);

    // A separate database run proves reversal without trying to reuse rejected evidence.
    db = openTestDb();
    db.prepare('INSERT INTO users (id,display_name,created_at) VALUES (?,?,?)').run(USER, 'Activity traveller', NOW.toISOString());
    db.prepare('INSERT INTO hosts (id,name,type) VALUES (?,?,?)').run(HOST, 'Palace host', 'community');
    const insert = db.prepare(
      `INSERT INTO places (id,name_en,name_th,short,layer,lat,lng,meta,blurb_en,blurb_th,tags,
       safety_label_en,safety_label_th,crowd_density,aqi,safety_index,walkability,photo_url)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    );
    placeIds.forEach((id, index) => insert.run(id, id, id, id, 'Quest', 13.15 + index / 1000, 100.8 + index / 1000,
      'Koh Sichang', 'Real', 'จริง', '[]', 'Care', 'ระวัง', 1, 20, 8, 7, `/media/${id}.jpg`));
    bootstrapKohSichangAdventure(db);
    configure();
    const verifiedQr = makeQr();
    verifyActivityQr(db, {
      userId: USER, token: verifiedQr.token, clientRequestId: 'reverse-valid-request', signingSecret: SECRET, now: NOW,
    });
    const source = (db.prepare("SELECT source_ref FROM ledger WHERE kind='activity_reward'").get() as { source_ref: string }).source_ref;
    reverseMovement(db, { userId: USER, originalSourceRef: source, reason: 'host withdrew verification' });
    assert.equal((db.prepare('SELECT invalidated_at IS NOT NULL AS invalid FROM activity_verifications').get() as { invalid: number }).invalid, 1);
    assert.ok(travelEventsFor(db, USER).every((event) => event.invalidatedAt !== null));
    assert.equal(petMemoriesFor(db, USER).length, 0);
    assert.equal(travelJournalFor(db, USER).length, 0);
  });
});
