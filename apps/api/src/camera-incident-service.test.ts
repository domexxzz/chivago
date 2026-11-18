import { strict as assert } from 'node:assert';
import { test, describe, beforeEach } from 'node:test';

import { openTestDb, type DB } from './db-node.ts';
import {
  ForbiddenIncidentKind, IncidentAlreadyStored, InvalidIncident, UnknownIncident,
  evidenceStateOf, incidentCounts, pendingIncidents, receiveCameraIncident, reviewIncident,
  sendPendingOutcomes, type OutcomeReport, type OutcomeTransport,
} from './camera-incident-service.ts';

let db: DB;

const NOW = new Date('2026-11-18T07:05:00Z');

/** The payload from answer 2, which is a real capture off their sender. */
const SAMPLE = {
  incidentId: 'sen-7c58fb58af74f42875fc780a',
  source: 'sentiara',
  detectorVersion: 'frigate-car',
  kind: 'vehicle_obstruction',
  observedAt: '2026-11-18T14:02:11+07:00',
  camera: { id: 'pier_01', owner: 'เทศบาล', lat: 13.15, lng: 100.81 },
  location: { lat: 13.15, lng: 100.81, accuracy: 'camera_only' },
  confidence: 0.8,
  provenance: 'ai_estimate',
  verified: false,
  description: 'กล้อง pier_01 ตรวจพบรถยนต์ · รถจอดกีดขวาง',
  evidence: [{
    kind: 'image',
    ref: 'https://sentiara.example/v1/incidents/evidence/sen-7c58fb58af74f42875fc780a?exp=1&sig=2',
    expiresAt: '2026-11-19T14:02:11+07:00',
  }],
};

/** The same event, re-identified after their 10-minute window rolled over. */
const straddle = (minutesLater: number, id: string) => ({
  ...SAMPLE,
  incidentId: id,
  evidence: [],
  observedAt: new Date(new Date(SAMPLE.observedAt).getTime() + minutesLater * 60_000).toISOString(),
});

const row = (id: string) =>
  db.prepare('SELECT * FROM camera_incidents WHERE id = ?').get(id) as Record<string, unknown>;

beforeEach(() => {
  db = openTestDb();
  delete process.env.CHIVAGO_SENTIARA_MERGE_SEC;
});

describe('receiveCameraIncident', () => {
  test('stores the sample payload and reports it as unreviewed', () => {
    const receipt = receiveCameraIncident(db, SAMPLE, NOW);

    assert.deepEqual(receipt, {
      incidentId: SAMPLE.incidentId,
      mergedInto: null,
      reviewState: 'unreviewed',
      evidence: 'available',
    });
    const stored = row(SAMPLE.incidentId);
    assert.equal(stored.kind, 'vehicle_obstruction');
    assert.equal(stored.camera_id, 'pier_01');
    assert.equal(stored.confidence, 0.8);
    assert.equal(stored.review_state, 'unreviewed');
  });

  test('normalises the observed instant to UTC', () => {
    receiveCameraIncident(db, SAMPLE, NOW);
    // Their sender speaks +07:00. Stored as the same instant in UTC, because
    // merging compares these as strings and '…T14:02+07:00' sorts as 14:02Z.
    assert.equal(row(SAMPLE.incidentId).observed_at, '2026-11-18T07:02:11.000Z');
  });

  test('never records the sender claiming a human confirmed it', () => {
    receiveCameraIncident(db, { ...SAMPLE, verified: true }, NOW);
    const stored = row(SAMPLE.incidentId);
    assert.equal(stored.review_state, 'unreviewed');
    assert.equal(stored.reviewed_by, null);
  });

  test('keeps no imagery, only the link and its expiry', () => {
    receiveCameraIncident(db, SAMPLE, NOW);
    const evidence = db
      .prepare('SELECT ref, expires_at FROM camera_incident_evidence WHERE incident_id = ?')
      .all(SAMPLE.incidentId) as unknown as { ref: string; expires_at: string }[];
    assert.equal(evidence.length, 1);
    assert.match(evidence[0].ref, /^https:\/\//);
    assert.equal(evidence[0].expires_at, '2026-11-19T07:02:11.000Z');
  });

  test('refuses an id it has already stored', () => {
    receiveCameraIncident(db, SAMPLE, NOW);
    assert.throws(() => receiveCameraIncident(db, SAMPLE, NOW), IncidentAlreadyStored);
    // One row, and the retry wrote nothing - the route turns this into the 409
    // their outbox reads as delivered.
    assert.equal(incidentCounts(db).unreviewed, 1);
  });

  test('refuses plate reading however it is spelled, and stores nothing', () => {
    for (const kind of ['license_plate', 'plate_read', 'ANPR', 'lpr']) {
      assert.throws(
        () => receiveCameraIncident(db, { ...SAMPLE, incidentId: `sen-${kind}0000000`, kind }, NOW),
        ForbiddenIncidentKind,
        `accepted ${kind}`,
      );
    }
    assert.equal(incidentCounts(db).unreviewed, 0);
  });

  test('refuses payloads that would be just as wrong next time', () => {
    const bad: [string, unknown][] = [
      ['no id', { ...SAMPLE, incidentId: undefined }],
      ['short id', { ...SAMPLE, incidentId: 'sen-1' }],
      ['no kind', { ...SAMPLE, kind: undefined }],
      ['no camera', { ...SAMPLE, camera: {} }],
      ['no observedAt', { ...SAMPLE, observedAt: undefined }],
      ['unparseable observedAt', { ...SAMPLE, observedAt: 'yesterday' }],
      ['confidence above one', { ...SAMPLE, confidence: 1.4 }],
      ['confidence as text', { ...SAMPLE, confidence: '0.8' }],
      ['plaintext evidence', { ...SAMPLE, evidence: [{ kind: 'image', ref: 'http://x/y' }] }],
      ['evidence not a list', { ...SAMPLE, evidence: 'none' }],
      ['not an object', 'sen-1'],
    ];
    for (const [why, payload] of bad) {
      assert.throws(() => receiveCameraIncident(db, payload, NOW), InvalidIncident, why);
    }
  });

  test('accepts an incident from a camera whose position nobody recorded', () => {
    receiveCameraIncident(
      db,
      { ...SAMPLE, camera: { id: 'pier_01' }, location: { accuracy: 'unknown' } },
      NOW,
    );
    const stored = row(SAMPLE.incidentId);
    // Null, never (0, 0): the desk says "position unknown" rather than
    // dropping a pin in the Gulf of Guinea.
    assert.equal(stored.lat, null);
    assert.equal(stored.lng, null);
  });
});

describe('merging across their window seam', () => {
  test('folds a later report on the same camera into the open one', () => {
    receiveCameraIncident(db, SAMPLE, NOW);
    const second = receiveCameraIncident(db, straddle(11, 'sen-second00000000000000'), NOW);

    assert.equal(second.mergedInto, SAMPLE.incidentId);
    // On file in full, but not a second job for the officer.
    assert.equal(pendingIncidents(db).length, 1);
    assert.equal(incidentCounts(db).merged, 1);
  });

  test('does not fold a report that arrives after somebody looked', () => {
    receiveCameraIncident(db, SAMPLE, NOW);
    reviewIncident(db, SAMPLE.incidentId, 'confirmed', 'operator@chivargo', NOW);

    const second = receiveCameraIncident(db, straddle(11, 'sen-afterreview000000000'), NOW);
    // A reviewed incident is closed, so the next report is genuinely news.
    assert.equal(second.mergedInto, null);
    assert.equal(pendingIncidents(db).length, 1);
  });

  test('does not fold a report from beyond the window', () => {
    receiveCameraIncident(db, SAMPLE, NOW);
    const later = receiveCameraIncident(db, straddle(45, 'sen-muchlater0000000000'), NOW);
    assert.equal(later.mergedInto, null);
    assert.equal(pendingIncidents(db).length, 2);
  });

  test('does not fold a different kind on the same camera', () => {
    receiveCameraIncident(db, SAMPLE, NOW);
    const other = receiveCameraIncident(
      db,
      { ...straddle(5, 'sen-otherkind000000000'), kind: 'smoke' },
      NOW,
    );
    assert.equal(other.mergedInto, null);
  });

  test('keeps a long stay as one job, measuring from the last report', () => {
    receiveCameraIncident(db, SAMPLE, NOW);
    const second = receiveCameraIncident(db, straddle(25, 'sen-second00000000000000'), NOW);
    const third = receiveCameraIncident(db, straddle(50, 'sen-third000000000000000'), NOW);

    assert.equal(second.mergedInto, SAMPLE.incidentId);
    // 50 minutes past the first, so outside its window, but 25 minutes past
    // the second. A car that never moves is one job, not three - and both
    // point at the job itself, so the chain stays one hop deep.
    assert.equal(third.mergedInto, SAMPLE.incidentId);
    assert.equal(pendingIncidents(db).length, 1);
  });
});

describe('evidenceStateOf', () => {
  test('says none, available or expired, and nothing else', () => {
    assert.equal(evidenceStateOf([], NOW), 'none');
    assert.equal(evidenceStateOf([{ expiresAt: '2026-11-19T00:00:00Z' }], NOW), 'available');
    assert.equal(evidenceStateOf([{ expiresAt: '2026-11-17T00:00:00Z' }], NOW), 'expired');
    assert.equal(evidenceStateOf([{ expiresAt: null }], NOW), 'available');
  });

  test('one live link is still evidence', () => {
    const mixed = [{ expiresAt: '2026-11-17T00:00:00Z' }, { expiresAt: '2026-11-19T00:00:00Z' }];
    assert.equal(evidenceStateOf(mixed, NOW), 'available');
  });

  test('an incident with no links reads as none on the queue', () => {
    // Today's normal case: their evidence proxy does not exist yet, so the
    // array arrives empty and the desk must say so rather than show a frame.
    receiveCameraIncident(db, { ...SAMPLE, evidence: [] }, NOW);
    assert.equal(pendingIncidents(db)[0].evidence, 'none');
  });

  test('an expired link reads as expired on the queue', () => {
    receiveCameraIncident(db, SAMPLE, NOW);
    const afterExpiry = new Date('2026-11-20T00:00:00Z');
    assert.equal(pendingIncidents(db, 50, afterExpiry)[0].evidence, 'expired');
  });
});

describe('reviewIncident', () => {
  test('records the decision and claims nothing about reporting it', () => {
    receiveCameraIncident(db, SAMPLE, NOW);
    reviewIncident(db, SAMPLE.incidentId, 'false_alarm', 'operator@chivargo', NOW);

    const stored = row(SAMPLE.incidentId);
    assert.equal(stored.review_state, 'false_alarm');
    assert.equal(stored.reviewed_by, 'operator@chivargo');
    // The decision is made; telling Sentiara has not happened. Two facts.
    assert.equal(stored.outcome_sent_at, null);
    assert.equal(incidentCounts(db).awaitingReport, 1);
  });

  test('takes a reviewed incident off the queue', () => {
    receiveCameraIncident(db, SAMPLE, NOW);
    reviewIncident(db, SAMPLE.incidentId, 'confirmed', 'operator@chivargo', NOW);
    assert.equal(pendingIncidents(db).length, 0);
  });

  test('refuses an outcome Sentiara has no word for', () => {
    receiveCameraIncident(db, SAMPLE, NOW);
    assert.throws(
      () => reviewIncident(db, SAMPLE.incidentId, 'dispatched' as never, 'operator@chivargo', NOW),
      InvalidIncident,
    );
  });

  test('refuses an id it does not hold', () => {
    assert.throws(
      () => reviewIncident(db, 'sen-nothinghere00000000', 'confirmed', 'operator@chivargo', NOW),
      UnknownIncident,
    );
  });

  test('a corrected decision is reported again', async () => {
    receiveCameraIncident(db, SAMPLE, NOW);
    reviewIncident(db, SAMPLE.incidentId, 'confirmed', 'operator@chivargo', NOW);
    await sendPendingOutcomes(db, accepting());
    assert.notEqual(row(SAMPLE.incidentId).outcome_sent_at, null);

    reviewIncident(db, SAMPLE.incidentId, 'false_alarm', 'operator@chivargo', NOW);
    assert.equal(row(SAMPLE.incidentId).outcome_sent_at, null);
    assert.equal(incidentCounts(db).awaitingReport, 1);
  });
});

describe('incidentCounts', () => {
  test('has no false-alarm rate until somebody has reviewed something', () => {
    receiveCameraIncident(db, SAMPLE, NOW);
    // Null, not zero. The only rate we have is 62% from a test house on the
    // mainland; inventing one from no reviews would be worse than saying none.
    assert.equal(incidentCounts(db).falseAlarmRate, null);
  });

  test('counts the island\'s own rate from decisions people made', () => {
    receiveCameraIncident(db, SAMPLE, NOW);
    receiveCameraIncident(db, { ...straddle(90, 'sen-two00000000000000000') }, NOW);
    reviewIncident(db, SAMPLE.incidentId, 'false_alarm', 'operator@chivargo', NOW);
    reviewIncident(db, 'sen-two00000000000000000', 'confirmed', 'operator@chivargo', NOW);

    const counts = incidentCounts(db);
    assert.equal(counts.reviewed, 2);
    assert.equal(counts.falseAlarm, 1);
    assert.equal(counts.falseAlarmRate, 0.5);
  });
});

/** A transport that accepts everything, and remembers what it was handed. */
function accepting(): OutcomeTransport & { sent: OutcomeReport[] } {
  const sent: OutcomeReport[] = [];
  return { sent, async send(report) { sent.push(report); return true; } };
}

describe('sendPendingOutcomes', () => {
  beforeEach(() => {
    receiveCameraIncident(db, SAMPLE, NOW);
    reviewIncident(db, SAMPLE.incidentId, 'false_alarm', 'operator@chivargo', NOW);
  });

  test('marks a decision reported only when the call succeeded', async () => {
    const transport = accepting();
    const result = await sendPendingOutcomes(db, transport, 20, NOW);

    assert.deepEqual(result, { sent: 1, failed: 0, skipped: 0 });
    assert.deepEqual(transport.sent, [{
      incidentId: SAMPLE.incidentId,
      outcome: 'false_alarm',
      reviewedAt: NOW.toISOString(),
    }]);
    assert.equal(row(SAMPLE.incidentId).outcome_sent_at, NOW.toISOString());
    assert.equal(incidentCounts(db).awaitingReport, 0);
  });

  test('leaves a failed call unreported and counts the attempt', async () => {
    const result = await sendPendingOutcomes(db, { async send() { return false; } }, 20, NOW);

    assert.deepEqual(result, { sent: 0, failed: 1, skipped: 0 });
    const stored = row(SAMPLE.incidentId);
    assert.equal(stored.outcome_sent_at, null);
    assert.equal(stored.outcome_attempts, 1);
    assert.equal(stored.outcome_error, 'callback failed');
  });

  test('a deployment with no callback URL skips, and is not a failure', async () => {
    const result = await sendPendingOutcomes(db, { async send() { return null; } }, 20, NOW);

    assert.deepEqual(result, { sent: 0, failed: 0, skipped: 1 });
    const stored = row(SAMPLE.incidentId);
    assert.equal(stored.outcome_sent_at, null);
    // Nobody wired up a callback. That is not an attempt, so it is not counted
    // as one, and the row is still waiting rather than marked as having failed.
    assert.equal(stored.outcome_attempts, 0);
    assert.equal(stored.outcome_error, null);
  });

  test('reports nothing twice', async () => {
    const transport = accepting();
    await sendPendingOutcomes(db, transport, 20, NOW);
    const second = await sendPendingOutcomes(db, transport, 20, NOW);

    assert.deepEqual(second, { sent: 0, failed: 0, skipped: 0 });
    assert.equal(transport.sent.length, 1);
  });

  test('says nothing about unreviewed incidents', async () => {
    receiveCameraIncident(db, straddle(90, 'sen-unreviewed000000000'), NOW);
    const transport = accepting();
    await sendPendingOutcomes(db, transport, 20, NOW);

    assert.equal(transport.sent.length, 1);
    assert.equal(transport.sent[0].incidentId, SAMPLE.incidentId);
  });
});
