import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type {
  ActivityQrType, ActivityQrVerification, AdventureEvidence,
  AdventureVerification, AdventureVerificationPolicy, Currency, Fix,
} from '@chivago/core';
import { row, rows, transact, type DB } from './db.ts';
import { adventureOverviewFor } from './adventure-service.ts';
import { distanceMetres } from './quest-service.ts';
import { assertPresence, recordFix } from './presence-service.ts';
import { awardActivityReward } from './wallet-service.ts';
import { recordActivityTravelCycle, recordTravelEvent } from './travel-event-service.ts';

export class ActivityVerificationError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
    this.name = 'ActivityVerificationError';
  }
}

interface NodeRow {
  id: string; place_id: string; verification_kind: AdventureVerification;
  quest_id: string | null; area_key: string; name_en: string; lat: number; lng: number;
}

interface PolicyRow {
  node_id: string; host_id: string | null; requires_gps: number; requires_qr: number;
  requires_evidence: number; requires_host: number; geofence_radius_m: number;
  reward_points: number; reward_exp: number; reward_currency: Currency;
}

interface QrPayload {
  v: 1; jti: string; qid: string; typ: ActivityQrType; nid: string; pid: string;
  iat: string; exp?: string;
}

const nodeFor = (db: DB, nodeId: string): NodeRow | null => row<NodeRow>(db.prepare(
  `SELECT n.id,n.place_id,n.verification_kind,n.quest_id,a.area_key,
          p.name_en,p.lat,p.lng
   FROM adventure_nodes n
   JOIN adventure_chapters c ON c.id=n.chapter_id
   JOIN adventure_arcs a ON a.id=c.arc_id
   JOIN places p ON p.id=n.place_id
   WHERE n.id=? AND a.status='published'`,
).get(nodeId)) ?? null;

const publicPolicy = (p: PolicyRow): AdventureVerificationPolicy => ({
  nodeId: p.node_id,
  requiresGps: p.requires_gps === 1,
  requiresQr: p.requires_qr === 1,
  requiresEvidence: p.requires_evidence === 1,
  requiresHost: p.requires_host === 1,
  geofenceRadiusM: p.geofence_radius_m,
});

export function policyFor(db: DB, nodeId: string): PolicyRow {
  const stored = row<PolicyRow>(db.prepare(
    `SELECT node_id,host_id,requires_gps,requires_qr,requires_evidence,requires_host,
            geofence_radius_m,reward_points,reward_exp,reward_currency
     FROM adventure_verification_policies WHERE node_id=?`,
  ).get(nodeId));
  if (stored) return stored;
  const node = nodeFor(db, nodeId);
  if (!node) throw new ActivityVerificationError('NODE_NOT_FOUND', 'Adventure activity not found.', 404);
  return {
    node_id: node.id,
    host_id: null,
    requires_gps: node.verification_kind === 'quest' ? 0 : 1,
    requires_qr: node.verification_kind === 'qr' ? 1 : 0,
    requires_evidence: node.verification_kind === 'host' ? 1 : 0,
    requires_host: node.verification_kind === 'host' ? 1 : 0,
    geofence_radius_m: 150,
    reward_points: 0,
    reward_exp: 0,
    reward_currency: 'trip',
  };
}

export function publicPolicyFor(db: DB, nodeId: string): AdventureVerificationPolicy {
  return publicPolicy(policyFor(db, nodeId));
}

/** Host-owned policy update. Green rewards require a named approving host. */
export function setPolicy(db: DB, hostId: string, input: {
  nodeId: string; requiresGps: boolean; requiresQr: boolean; requiresEvidence: boolean;
  requiresHost: boolean; geofenceRadiusM: number; rewardPoints: number;
  rewardExp: number; rewardCurrency: Currency;
}): AdventureVerificationPolicy {
  const node = nodeFor(db, input.nodeId);
  if (!node) throw new ActivityVerificationError('NODE_NOT_FOUND', 'Adventure activity not found.', 404);
  if (input.rewardCurrency === 'green' && !input.requiresHost) {
    throw new ActivityVerificationError('HOST_REQUIRED', 'Green rewards require host approval.');
  }
  if (input.geofenceRadiusM < 20 || input.geofenceRadiusM > 2000) {
    throw new ActivityVerificationError('BAD_GEOFENCE', 'Geofence must be between 20 and 2000 metres.');
  }
  db.prepare(
    `INSERT INTO adventure_verification_policies
       (node_id,host_id,requires_gps,requires_qr,requires_evidence,requires_host,
        geofence_radius_m,reward_points,reward_exp,reward_currency,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(node_id) DO UPDATE SET
       host_id=excluded.host_id,requires_gps=excluded.requires_gps,
       requires_qr=excluded.requires_qr,requires_evidence=excluded.requires_evidence,
       requires_host=excluded.requires_host,geofence_radius_m=excluded.geofence_radius_m,
       reward_points=excluded.reward_points,reward_exp=excluded.reward_exp,
       reward_currency=excluded.reward_currency,updated_at=excluded.updated_at`,
  ).run(
    input.nodeId, hostId, Number(input.requiresGps), Number(input.requiresQr),
    Number(input.requiresEvidence), Number(input.requiresHost), input.geofenceRadiusM,
    Math.max(0, Math.floor(input.rewardPoints)), Math.max(0, Math.floor(input.rewardExp)),
    input.rewardCurrency, new Date().toISOString(),
  );
  return publicPolicy(policyFor(db, input.nodeId));
}

function audit(db: DB, args: {
  actorType: 'traveller' | 'host' | 'system'; actorId: string; eventType: string;
  sourceKind: string; sourceRef: string; userId?: string | null; nodeId?: string | null;
  detail?: Record<string, unknown>; occurredAt?: string;
}): void {
  db.prepare(
    `INSERT OR IGNORE INTO activity_verification_audit
       (id,actor_type,actor_id,event_type,source_kind,source_ref,user_id,node_id,occurred_at,detail_json)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    randomUUID(), args.actorType, args.actorId, args.eventType, args.sourceKind, args.sourceRef,
    args.userId ?? null, args.nodeId ?? null, args.occurredAt ?? new Date().toISOString(),
    JSON.stringify(args.detail ?? {}),
  );
}

const encode = (payload: QrPayload, secret: string): string => {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', secret).update(`v1.${body}`).digest('base64url');
  return `chivago:v1:${body}.${signature}`;
};

const decode = (token: string, secret: string): QrPayload => {
  const matched = /^chivago:v1:([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(token);
  if (!matched) throw new ActivityVerificationError('QR_INVALID', 'This is not a ChivaGo activity QR.');
  // Compare the canonical base64url text, not merely decoded bytes. Some
  // decoders accept alternate final characters whose unused trailing bits
  // decode to the same digest; accepting those gives one signature several
  // textual tokens and weakens replay/audit identity.
  const expected = Buffer.from(createHmac('sha256', secret).update(`v1.${matched[1]}`).digest('base64url'));
  const actual = Buffer.from(matched[2]!);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new ActivityVerificationError('QR_SIGNATURE_INVALID', 'QR signature is invalid.', 403);
  }
  try {
    const parsed = JSON.parse(Buffer.from(matched[1]!, 'base64url').toString('utf8')) as QrPayload;
    if (parsed.v !== 1 || !parsed.jti || !parsed.qid || !parsed.nid || !parsed.pid) throw new Error();
    return parsed;
  } catch {
    throw new ActivityVerificationError('QR_PAYLOAD_INVALID', 'QR payload is invalid.');
  }
};

export function createActivityQr(db: DB, args: {
  hostId: string; nodeId: string; type: ActivityQrType; createdBy: string;
  signingSecret: string; ttlSeconds?: number; now?: Date;
}): { id: string; token: string; expiresAt: string | null } {
  if (args.signingSecret.length < 32) {
    throw new ActivityVerificationError('QR_SECRET_UNSAFE', 'QR signing secret must be at least 32 characters.', 500);
  }
  const node = nodeFor(db, args.nodeId);
  if (!node) throw new ActivityVerificationError('NODE_NOT_FOUND', 'Adventure activity not found.', 404);
  const policy = policyFor(db, node.id);
  if (policy.host_id !== args.hostId || policy.requires_qr !== 1) {
    throw new ActivityVerificationError('FORBIDDEN', 'This host does not manage QR for that activity.', 403);
  }
  const now = args.now ?? new Date();
  const ttl = args.type === 'dynamic' ? Math.min(3600, Math.max(30, args.ttlSeconds ?? 300)) : null;
  const expiresAt = ttl ? new Date(now.getTime() + ttl * 1000).toISOString() : null;
  const id = randomUUID();
  const tokenId = randomUUID();
  const payload: QrPayload = {
    v: 1, jti: tokenId, qid: id, typ: args.type, nid: node.id, pid: node.place_id,
    iat: now.toISOString(), ...(expiresAt ? { exp: expiresAt } : {}),
  };
  db.prepare(
    `INSERT INTO activity_qr_codes
       (id,token_id,qr_type,signature_version,host_id,node_id,place_id,issued_at,expires_at,created_by)
     VALUES (?,?,?,1,?,?,?,?,?,?)`,
  ).run(id, tokenId, args.type, args.hostId, node.id, node.place_id, now.toISOString(), expiresAt, args.createdBy);
  audit(db, { actorType: 'host', actorId: args.createdBy, eventType: 'QR_CREATED', sourceKind: 'qr', sourceRef: id, nodeId: node.id });
  return { id, token: encode(payload, args.signingSecret), expiresAt };
}

export function revokeActivityQr(db: DB, hostId: string, qrId: string, actor: string): boolean {
  const now = new Date().toISOString();
  const changed = Number(db.prepare(
    `UPDATE activity_qr_codes SET revoked_at=? WHERE id=? AND host_id=? AND revoked_at IS NULL`,
  ).run(now, qrId, hostId).changes ?? 0) > 0;
  if (changed) audit(db, { actorType: 'host', actorId: actor, eventType: 'QR_REVOKED', sourceKind: 'qr', sourceRef: qrId, occurredAt: now });
  return changed;
}

export function qrCodesForHost(db: DB, hostId: string): {
  id: string; type: ActivityQrType; nodeId: string; placeId: string; issuedAt: string;
  expiresAt: string | null; revokedAt: string | null; consumedAt: string | null; scans: number;
}[] {
  return rows<{
    id: string; qr_type: ActivityQrType; node_id: string; place_id: string; issued_at: string;
    expires_at: string | null; revoked_at: string | null; consumed_at: string | null; scans: number;
  }>(db.prepare(
    `SELECT q.id,q.qr_type,q.node_id,q.place_id,q.issued_at,q.expires_at,q.revoked_at,q.consumed_at,
            (SELECT COUNT(*) FROM activity_qr_scans s WHERE s.qr_id=q.id) AS scans
     FROM activity_qr_codes q WHERE q.host_id=? ORDER BY q.issued_at DESC`,
  ).all(hostId)).map((item) => ({
    id: item.id, type: item.qr_type, nodeId: item.node_id, placeId: item.place_id,
    issuedAt: item.issued_at, expiresAt: item.expires_at, revokedAt: item.revoked_at,
    consumedAt: item.consumed_at, scans: item.scans,
  }));
}

function ensureAvailable(db: DB, userId: string, node: NodeRow): void {
  const projected = adventureOverviewFor(db, userId, node.area_key).adventure
    ?.chapters.flatMap((chapter) => chapter.nodes).find((item) => item.id === node.id);
  if (!projected) throw new ActivityVerificationError('NODE_NOT_FOUND', 'Adventure activity not found.', 404);
  if (projected.state === 'locked') throw new ActivityVerificationError('NODE_LOCKED', 'Finish the preceding clue first.', 409);
}

function validateGps(db: DB, userId: string, node: NodeRow, policy: PolicyRow, fix: Fix, now: Date): void {
  const metres = distanceMetres(fix, node);
  if (metres > policy.geofence_radius_m) {
    throw new ActivityVerificationError('OUTSIDE_GEOFENCE', `You are ${Math.round(metres)} m from this activity.`, 403);
  }
  assertPresence(db, { userId, fix, radiusM: policy.geofence_radius_m, now });
  recordFix(db, userId, fix, now);
}

function scanRateLimit(db: DB, userId: string, now: Date): void {
  const since = new Date(now.getTime() - 60_000).toISOString();
  const count = row<{ n: number }>(db.prepare(
    'SELECT COUNT(*) AS n FROM activity_qr_scans WHERE user_id=? AND scanned_at>=?',
  ).get(userId, since))?.n ?? 0;
  if (count >= 12) throw new ActivityVerificationError('RATE_LIMITED', 'Too many QR attempts. Try again shortly.', 429);
}

/**
 * Persist a failed scan without trusting anything in the unverified payload.
 * This closes the cheap-signature-bruteforce gap: rejected scans count towards
 * the same rate limit as successful ones while keeping nullable QR bindings.
 */
export function recordRejectedQrAttempt(db: DB, args: {
  userId: string; clientRequestId: string; errorCode: string; now?: Date;
}): void {
  const now = args.now ?? new Date();
  const safeCode = args.errorCode.slice(0, 80) || 'QR_REJECTED';
  // A rejected token is untrusted and its client request id is therefore not
  // an idempotency key. Give every attempt a server id so a caller cannot
  // reuse one value to disappear from the rate-limit window.
  const attemptId = randomUUID();
  try {
    db.prepare(
      `INSERT INTO activity_qr_scans
         (id,qr_id,user_id,node_id,place_id,client_request_id,status,error_code,scanned_at)
       VALUES (?,NULL,?,NULL,NULL,?,'rejected',?,?)`,
    ).run(attemptId, args.userId, `rejected:${attemptId}`, safeCode, now.toISOString());
    audit(db, {
      actorType: 'system', actorId: 'verification-engine', eventType: 'QR_REJECTED',
      sourceKind: 'qr_attempt', sourceRef: attemptId,
      userId: args.userId, occurredAt: now.toISOString(),
      detail: { errorCode: safeCode, clientRequestId: args.clientRequestId.slice(0, 100) },
    });
  } catch {
    // A rejection must never replace the original, more useful verification error.
  }
}

/**
 * Fail cheap checks before the route persists any potentially large blobs.
 * The same check is run again after upload so concurrent submissions cannot
 * push a draft over its cumulative photo quota.
 */
export function prepareEvidenceSubmission(db: DB, args: {
  userId: string; evidenceId: string; incomingPhotos: number; maxPhotos: number;
  fix?: Fix | null; now?: Date;
}): void {
  const now = args.now ?? new Date();
  const found = row<{ node_id: string; status: string; photo_count: number }>(db.prepare(
    `SELECT e.node_id,e.status,
            (SELECT COUNT(*) FROM adventure_evidence_files f WHERE f.evidence_id=e.id) AS photo_count
     FROM adventure_evidence e WHERE e.id=? AND e.user_id=?`,
  ).get(args.evidenceId, args.userId));
  if (!found) throw new ActivityVerificationError('EVIDENCE_NOT_FOUND', 'Evidence not found.', 404);
  if (found.status !== 'draft') throw new ActivityVerificationError('EVIDENCE_NOT_DRAFT', 'Evidence is no longer editable.', 409);
  const incoming = Math.max(0, Math.floor(args.incomingPhotos));
  if (found.photo_count + incoming > args.maxPhotos) {
    throw new ActivityVerificationError('TOO_MANY_PHOTOS', `At most ${args.maxPhotos} photos.`, 413);
  }
  const node = nodeFor(db, found.node_id);
  if (!node) throw new ActivityVerificationError('NODE_NOT_FOUND', 'Adventure activity not found.', 404);
  const policy = policyFor(db, node.id);
  if (policy.requires_evidence === 1 && found.photo_count + incoming < 1) {
    throw new ActivityVerificationError('PHOTO_REQUIRED', 'At least one photo is required.');
  }
  if (policy.requires_gps === 1) {
    if (!args.fix) throw new ActivityVerificationError('LOCATION_REQUIRED', 'Location is required to submit evidence.');
    validateGps(db, args.userId, node, policy, args.fix, now);
  }
}

export function verifyActivityQr(db: DB, args: {
  userId: string; token: string; clientRequestId: string; signingSecret: string;
  expectedNodeId?: string | null; fix?: Fix | null; now?: Date;
}): ActivityQrVerification {
  const now = args.now ?? new Date();
  scanRateLimit(db, args.userId, now);
  const payload = decode(args.token, args.signingSecret);
  const qr = row<{
    id: string; token_id: string; qr_type: ActivityQrType; node_id: string; place_id: string;
    revoked_at: string | null; expires_at: string | null; consumed_at: string | null; consumed_by: string | null;
  }>(db.prepare(
    `SELECT id,token_id,qr_type,node_id,place_id,revoked_at,expires_at,consumed_at,consumed_by
     FROM activity_qr_codes WHERE id=?`,
  ).get(payload.qid));
  if (!qr || qr.token_id !== payload.jti || qr.node_id !== payload.nid || qr.place_id !== payload.pid || qr.qr_type !== payload.typ) {
    throw new ActivityVerificationError('QR_MISMATCH', 'QR is not registered for this activity.', 403);
  }
  if (args.expectedNodeId && qr.node_id !== args.expectedNodeId) {
    throw new ActivityVerificationError('QR_ACTIVITY_MISMATCH', 'QR belongs to another activity.', 409);
  }
  if (qr.revoked_at) throw new ActivityVerificationError('QR_REVOKED', 'This QR has been revoked.', 410);
  if (qr.expires_at && Date.parse(qr.expires_at) <= now.getTime()) {
    throw new ActivityVerificationError('QR_EXPIRED', 'This QR has expired.', 410);
  }
  const existing = row<{ id: string; scanned_at: string }>(db.prepare(
    `SELECT id,scanned_at FROM activity_qr_scans
     WHERE qr_id=? AND user_id=? AND status='verified' ORDER BY scanned_at DESC LIMIT 1`,
  ).get(qr.id, args.userId));
  if (existing) {
    return {
      scanId: existing.id, qrId: qr.id, nodeId: qr.node_id, placeId: qr.place_id,
      verifiedAt: existing.scanned_at, replayed: true,
      activityVerified: Boolean(row(db.prepare(
        'SELECT 1 FROM activity_verifications WHERE user_id=? AND node_id=? AND invalidated_at IS NULL',
      ).get(args.userId, qr.node_id))),
    };
  }
  if (qr.qr_type === 'dynamic' && qr.consumed_at) {
    throw new ActivityVerificationError('QR_REPLAYED', 'This one-time QR has already been used.', 409);
  }
  const node = nodeFor(db, qr.node_id)!;
  const policy = policyFor(db, node.id);
  ensureAvailable(db, args.userId, node);
  if (policy.requires_qr !== 1) throw new ActivityVerificationError('QR_NOT_ALLOWED', 'This activity does not accept QR.');
  if (policy.requires_gps === 1) {
    if (!args.fix) throw new ActivityVerificationError('LOCATION_REQUIRED', 'Location is required with this QR.');
    validateGps(db, args.userId, node, policy, args.fix, now);
  }

  return transact(db, () => {
    if (qr.qr_type === 'dynamic') {
      const claimed = db.prepare(
        `UPDATE activity_qr_codes SET consumed_at=?,consumed_by=?
         WHERE id=? AND consumed_at IS NULL AND revoked_at IS NULL`,
      ).run(now.toISOString(), args.userId, qr.id);
      if (Number(claimed.changes) !== 1) throw new ActivityVerificationError('QR_REPLAYED', 'This one-time QR has already been used.', 409);
    }
    const scanId = randomUUID();
    db.prepare(
      `INSERT INTO activity_qr_scans
         (id,qr_id,user_id,node_id,place_id,client_request_id,status,error_code,scanned_at)
       VALUES (?,?,?,?,?,?,'verified',NULL,?)`,
    ).run(scanId, qr.id, args.userId, node.id, node.place_id, args.clientRequestId, now.toISOString());
    audit(db, { actorType: 'traveller', actorId: args.userId, eventType: 'QR_SCANNED', sourceKind: 'qr_scan', sourceRef: scanId, userId: args.userId, nodeId: node.id, occurredAt: now.toISOString() });
    audit(db, { actorType: 'system', actorId: 'verification-engine', eventType: 'QR_VERIFIED', sourceKind: 'qr_scan', sourceRef: scanId, userId: args.userId, nodeId: node.id, occurredAt: now.toISOString() });
    let activityVerified = false;
    if (policy.requires_evidence === 0 && policy.requires_host === 0) {
      finalizeActivity(db, { userId: args.userId, nodeId: node.id, qrScanId: scanId, evidenceId: null, now });
      activityVerified = true;
    }
    return { scanId, qrId: qr.id, nodeId: node.id, placeId: node.place_id, verifiedAt: now.toISOString(), replayed: false, activityVerified };
  });
}

const toEvidence = (db: DB, id: string): AdventureEvidence | null => {
  const found = row<{
    id: string; node_id: string; place_id: string; status: AdventureEvidence['status'];
    submitted_at: string | null; reviewed_at: string | null; rejection_reason: string | null;
    created_at: string; photo_count: number;
  }>(db.prepare(
    `SELECT e.id,e.node_id,e.place_id,e.status,e.submitted_at,e.reviewed_at,e.rejection_reason,e.created_at,
            (SELECT COUNT(*) FROM adventure_evidence_files f WHERE f.evidence_id=e.id) AS photo_count
     FROM adventure_evidence e WHERE e.id=?`,
  ).get(id));
  return found ? {
    id: found.id, nodeId: found.node_id, placeId: found.place_id, status: found.status,
    photoCount: found.photo_count, submittedAt: found.submitted_at, reviewedAt: found.reviewed_at,
    rejectionReason: found.rejection_reason, createdAt: found.created_at,
  } : null;
};

export function createEvidenceDraft(db: DB, args: {
  userId: string; nodeId: string; clientRequestId: string; qrScanId?: string | null;
}): AdventureEvidence {
  const existing = row<{ id: string }>(db.prepare(
    'SELECT id FROM adventure_evidence WHERE user_id=? AND client_request_id=?',
  ).get(args.userId, args.clientRequestId));
  if (existing) return toEvidence(db, existing.id)!;
  const node = nodeFor(db, args.nodeId);
  if (!node) throw new ActivityVerificationError('NODE_NOT_FOUND', 'Adventure activity not found.', 404);
  ensureAvailable(db, args.userId, node);
  const policy = policyFor(db, node.id);
  if (policy.requires_evidence !== 1 && policy.requires_host !== 1) {
    throw new ActivityVerificationError('EVIDENCE_NOT_REQUIRED', 'This activity does not accept evidence.');
  }
  if (policy.requires_qr === 1) {
    const scan = args.qrScanId ? row<{ id: string }>(db.prepare(
      `SELECT id FROM activity_qr_scans WHERE id=? AND user_id=? AND node_id=? AND status='verified'`,
    ).get(args.qrScanId, args.userId, node.id)) : null;
    if (!scan) throw new ActivityVerificationError('QR_REQUIRED', 'Verify this activity QR first.', 409);
  }
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO adventure_evidence
       (id,user_id,node_id,place_id,host_id,qr_scan_id,client_request_id,status,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,'draft',?,?)`,
  ).run(id, args.userId, node.id, node.place_id, policy.host_id, args.qrScanId ?? null, args.clientRequestId, now, now);
  return toEvidence(db, id)!;
}

export function submitEvidence(db: DB, args: {
  userId: string; evidenceId: string; fix?: Fix | null; now?: Date;
}): AdventureEvidence {
  const now = args.now ?? new Date();
  const found = row<{ node_id: string; status: string; photo_count: number }>(db.prepare(
    `SELECT e.node_id,e.status,(SELECT COUNT(*) FROM adventure_evidence_files f WHERE f.evidence_id=e.id) AS photo_count
     FROM adventure_evidence e WHERE e.id=? AND e.user_id=?`,
  ).get(args.evidenceId, args.userId));
  if (!found) throw new ActivityVerificationError('EVIDENCE_NOT_FOUND', 'Evidence not found.', 404);
  if (found.status !== 'draft') return toEvidence(db, args.evidenceId)!;
  const node = nodeFor(db, found.node_id)!;
  const policy = policyFor(db, node.id);
  if (policy.requires_evidence === 1 && found.photo_count < 1) {
    throw new ActivityVerificationError('PHOTO_REQUIRED', 'At least one photo is required.');
  }
  if (policy.requires_gps === 1) {
    if (!args.fix) throw new ActivityVerificationError('LOCATION_REQUIRED', 'Location is required to submit evidence.');
    validateGps(db, args.userId, node, policy, args.fix, now);
  }
  const next = policy.requires_host === 1 ? 'pending_review' : 'approved';
  return transact(db, () => {
    db.prepare(
      `UPDATE adventure_evidence SET status=?,lat=?,lng=?,accuracy_m=?,mocked=?,submitted_at=?,updated_at=?
       WHERE id=? AND user_id=? AND status='draft'`,
    ).run(next, args.fix?.lat ?? null, args.fix?.lng ?? null, args.fix?.accuracyM ?? null, Number(args.fix?.mocked === true), now.toISOString(), now.toISOString(), args.evidenceId, args.userId);
    audit(db, { actorType: 'traveller', actorId: args.userId, eventType: 'EVIDENCE_SUBMITTED', sourceKind: 'evidence', sourceRef: args.evidenceId, userId: args.userId, nodeId: node.id, occurredAt: now.toISOString() });
    if (next === 'approved') finalizeActivity(db, { userId: args.userId, nodeId: node.id, evidenceId: args.evidenceId, qrScanId: null, now });
    return toEvidence(db, args.evidenceId)!;
  });
}

export function cancelEvidence(db: DB, userId: string, evidenceId: string): AdventureEvidence {
  const changed = db.prepare(
    `UPDATE adventure_evidence SET status='cancelled',updated_at=?
     WHERE id=? AND user_id=? AND status IN ('draft','submitted','pending_review')`,
  ).run(new Date().toISOString(), evidenceId, userId);
  if (Number(changed.changes) !== 1) throw new ActivityVerificationError('CANNOT_CANCEL', 'Evidence cannot be cancelled.', 409);
  audit(db, { actorType: 'traveller', actorId: userId, eventType: 'EVIDENCE_CANCELLED', sourceKind: 'evidence', sourceRef: evidenceId, userId });
  return toEvidence(db, evidenceId)!;
}

export function evidenceForUser(db: DB, userId: string): AdventureEvidence[] {
  return rows<{ id: string }>(db.prepare(
    'SELECT id FROM adventure_evidence WHERE user_id=? ORDER BY created_at DESC',
  ).all(userId)).map((item) => toEvidence(db, item.id)!);
}

export interface HostAdventureEvidence extends AdventureEvidence {
  userDisplayName: string;
  nodeTitle: { en: string; th: string; zh: string };
  placeName: { en: string; th: string };
  photoIds: string[];
}

export function pendingEvidenceForHost(db: DB, hostId: string, limit = 50): HostAdventureEvidence[] {
  const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
  return rows<{
    id: string; node_id: string; place_id: string; status: AdventureEvidence['status'];
    submitted_at: string | null; reviewed_at: string | null; rejection_reason: string | null;
    created_at: string; user_display_name: string; title_en: string; title_th: string; title_zh: string;
    place_en: string; place_th: string; photo_ids: string | null;
  }>(db.prepare(
    `SELECT e.id,e.node_id,e.place_id,e.status,e.submitted_at,e.reviewed_at,e.rejection_reason,e.created_at,
            u.display_name AS user_display_name,n.title_en,n.title_th,n.title_zh,
            p.name_en AS place_en,p.name_th AS place_th,GROUP_CONCAT(f.id) AS photo_ids
     FROM adventure_evidence e
     JOIN users u ON u.id=e.user_id
     JOIN adventure_nodes n ON n.id=e.node_id
     JOIN places p ON p.id=e.place_id
     LEFT JOIN adventure_evidence_files f ON f.evidence_id=e.id
     WHERE e.host_id=? AND e.status='pending_review'
     GROUP BY e.id ORDER BY e.submitted_at LIMIT ?`,
  ).all(hostId, safeLimit)).map((item) => ({
    id: item.id, nodeId: item.node_id, placeId: item.place_id, status: item.status,
    photoCount: item.photo_ids ? item.photo_ids.split(',').length : 0,
    photoIds: item.photo_ids ? item.photo_ids.split(',') : [], submittedAt: item.submitted_at,
    reviewedAt: item.reviewed_at, rejectionReason: item.rejection_reason, createdAt: item.created_at,
    userDisplayName: item.user_display_name,
    nodeTitle: { en: item.title_en, th: item.title_th, zh: item.title_zh },
    placeName: { en: item.place_en, th: item.place_th },
  }));
}

export function reviewEvidence(db: DB, args: {
  hostId: string; reviewer: string; evidenceId: string; approved: boolean; reason?: string | null; now?: Date;
}): AdventureEvidence {
  const now = args.now ?? new Date();
  const found = row<{ user_id: string; node_id: string; status: string; qr_scan_id: string | null }>(db.prepare(
    'SELECT user_id,node_id,status,qr_scan_id FROM adventure_evidence WHERE id=? AND host_id=?',
  ).get(args.evidenceId, args.hostId));
  if (!found) throw new ActivityVerificationError('FORBIDDEN', 'This evidence belongs to another host.', 403);
  if (found.status !== 'pending_review') throw new ActivityVerificationError('ALREADY_DECIDED', 'Evidence has already been decided.', 409);
  if (!args.approved && !(args.reason?.trim())) throw new ActivityVerificationError('REASON_REQUIRED', 'A rejection reason is required.');
  return transact(db, () => {
    const status = args.approved ? 'approved' : 'rejected';
    db.prepare(
      `UPDATE adventure_evidence SET status=?,reviewed_at=?,reviewed_by=?,rejection_reason=?,updated_at=?
       WHERE id=? AND host_id=? AND status='pending_review'`,
    ).run(status, now.toISOString(), args.reviewer, args.approved ? null : args.reason!.trim().slice(0, 500), now.toISOString(), args.evidenceId, args.hostId);
    audit(db, { actorType: 'host', actorId: args.reviewer, eventType: args.approved ? 'EVIDENCE_APPROVED' : 'EVIDENCE_REJECTED', sourceKind: 'evidence', sourceRef: args.evidenceId, userId: found.user_id, nodeId: found.node_id, occurredAt: now.toISOString() });
    if (args.approved) {
      audit(db, { actorType: 'host', actorId: args.reviewer, eventType: 'HOST_VERIFIED', sourceKind: 'evidence', sourceRef: args.evidenceId, userId: found.user_id, nodeId: found.node_id, occurredAt: now.toISOString() });
      finalizeActivity(db, { userId: found.user_id, nodeId: found.node_id, evidenceId: args.evidenceId, qrScanId: found.qr_scan_id, now });
    }
    return toEvidence(db, args.evidenceId)!;
  });
}

function finalizeActivity(db: DB, args: {
  userId: string; nodeId: string; qrScanId: string | null; evidenceId: string | null; now: Date;
}): void {
  const existing = row<{ id: string }>(db.prepare(
    'SELECT id FROM activity_verifications WHERE user_id=? AND node_id=? AND invalidated_at IS NULL',
  ).get(args.userId, args.nodeId));
  if (existing) return;
  const node = nodeFor(db, args.nodeId)!;
  const policy = policyFor(db, node.id);
  if (policy.requires_qr === 1) {
    const scan = row(db.prepare(
      `SELECT 1 FROM activity_qr_scans WHERE id=? AND user_id=? AND node_id=? AND status='verified'`,
    ).get(args.qrScanId, args.userId, node.id));
    if (!scan) throw new ActivityVerificationError('QR_REQUIRED', 'QR verification is incomplete.', 409);
  }
  if (policy.requires_evidence === 1 || policy.requires_host === 1) {
    const evidence = row<{ status: string; photo_count: number }>(db.prepare(
      `SELECT e.status,(SELECT COUNT(*) FROM adventure_evidence_files f WHERE f.evidence_id=e.id) AS photo_count
       FROM adventure_evidence e WHERE e.id=? AND e.user_id=? AND e.node_id=?`,
    ).get(args.evidenceId, args.userId, node.id));
    if (!evidence || evidence.status !== 'approved' || (policy.requires_evidence === 1 && evidence.photo_count < 1)) {
      throw new ActivityVerificationError('EVIDENCE_PENDING', 'Evidence has not been approved.', 409);
    }
  }
  const host = policy.host_id
    ? row<{ name: string }>(db.prepare('SELECT name FROM hosts WHERE id=?').get(policy.host_id))?.name ?? 'ChivaGo host'
    : 'ChivaGo verification engine';
  const movement = awardActivityReward(db, {
    userId: args.userId, nodeId: node.id, label: node.name_en, host,
    points: policy.reward_points, currency: policy.reward_currency,
    exp: policy.reward_exp, occurredAt: args.now.toISOString(),
  });
  if (!movement.entry) throw new Error('activity ledger row was not recorded');
  db.prepare(
    `INSERT OR IGNORE INTO activity_verifications
       (id,user_id,node_id,place_id,qr_scan_id,evidence_id,ledger_source_ref,verified_at)
     VALUES (?,?,?,?,?,?,?,?)`,
  ).run(randomUUID(), args.userId, node.id, node.place_id, args.qrScanId, args.evidenceId, movement.entry.sourceRef, args.now.toISOString());
  audit(db, { actorType: 'system', actorId: 'verification-engine', eventType: 'ACTIVITY_VERIFIED', sourceKind: 'ledger', sourceRef: movement.entry.sourceRef, userId: args.userId, nodeId: node.id, occurredAt: args.now.toISOString() });
  recordTravelEvent(db, {
    userId: args.userId, type: 'CLUE_DISCOVERED', sourceKind: 'ledger',
    sourceRef: movement.entry.sourceRef, placeId: node.place_id, questId: node.quest_id,
    occurredAt: args.now.toISOString(), metadata: { nodeId: node.id },
  });
  recordActivityTravelCycle(db, { userId: args.userId, nodeId: node.id, ledgerSourceRef: movement.entry.sourceRef });
}
