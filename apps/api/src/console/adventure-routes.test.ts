import { strict as assert } from 'node:assert';
import { beforeEach, describe, test } from 'node:test';
import { bootstrapKohSichangAdventure } from '../adventure-bootstrap.ts';
import {
  createActivityQr, createEvidenceDraft, setPolicy, submitEvidence, verifyActivityQr,
} from '../activity-verification-service.ts';
import { openTestDb, type DB } from '../db-node.ts';
import { hashApiKey, resolveSession, SESSION_COOKIE } from '../host-auth.ts';
import { __csrfFor, consoleRoutes } from './routes.ts';

let db: DB;
let app: ReturnType<typeof consoleRoutes>;
const HOST_KEY = 'chv_ADVEN-TUREH-OSTAA-KEY01';
const OTHER_KEY = 'chv_ADVEN-TUREH-OSTBB-KEY02';
const SECRET = 'console-adventure-qr-secret-longer-than-thirty-two';
const NOW = new Date('2026-11-20T06:00:00.000Z');
const places = ['sc-palace', 'sc-atsadang-bridge', 'sc-chong-khao-khat', 'sc-chao-pho-khao-yai', 'sc-thamphang'];

beforeEach(() => {
  process.env.CHIVAGO_QR_SIGNING_SECRET = SECRET;
  db = openTestDb();
  app = consoleRoutes(db);
  db.prepare('INSERT INTO users (id,display_name,created_at) VALUES (?,?,?)').run('traveller', 'Nina', NOW.toISOString());
  db.prepare('INSERT INTO hosts (id,name,type,api_key_hash,created_at) VALUES (?,?,?,?,?)')
    .run('host-adventure', 'Palace host', 'community', hashApiKey(HOST_KEY), NOW.toISOString());
  db.prepare('INSERT INTO hosts (id,name,type,api_key_hash,created_at) VALUES (?,?,?,?,?)')
    .run('host-other', 'Other host', 'community', hashApiKey(OTHER_KEY), NOW.toISOString());
  const insert = db.prepare(
    `INSERT INTO places (id,name_en,name_th,short,layer,lat,lng,meta,blurb_en,blurb_th,tags,
     safety_label_en,safety_label_th,crowd_density,aqi,safety_index,walkability,photo_url)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  );
  places.forEach((id, index) => insert.run(id, `Place ${index}`, `สถานที่ ${index}`, id, 'Quest',
    13.15 + index / 1000, 100.8 + index / 1000, 'Koh Sichang', 'Real', 'จริง', '[]',
    'Care', 'ระวัง', 1, 20, 8, 7, `/media/${id}.jpg`));
  bootstrapKohSichangAdventure(db);
  setPolicy(db, 'host-adventure', {
    nodeId: 'ks-memory-route-palace', requiresGps: false, requiresQr: true,
    requiresEvidence: true, requiresHost: true, geofenceRadiusM: 150,
    rewardPoints: 30, rewardExp: 5, rewardCurrency: 'trip',
  });
  const qr = createActivityQr(db, {
    hostId: 'host-adventure', nodeId: 'ks-memory-route-palace', type: 'static',
    createdBy: 'host-adventure', signingSecret: SECRET, now: NOW,
  });
  const scan = verifyActivityQr(db, {
    userId: 'traveller', token: qr.token, clientRequestId: 'host-console-scan', signingSecret: SECRET, now: NOW,
  });
  const evidence = createEvidenceDraft(db, {
    userId: 'traveller', nodeId: 'ks-memory-route-palace', clientRequestId: 'host-console-evidence', qrScanId: scan.scanId,
  });
  db.prepare(
    `INSERT INTO adventure_evidence_files (id,evidence_id,storage_path,mime_type,byte_size,uploaded_at)
     VALUES (?,?,?,?,?,?)`,
  ).run('adventure-photo', evidence.id, 'adventure/test.jpg', 'image/jpeg', 100, NOW.toISOString());
  submitEvidence(db, { userId: 'traveller', evidenceId: evidence.id, now: NOW });
});

async function signIn(key: string): Promise<string> {
  const response = await app.request('/login', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ key, reviewer: 'Reviewer' }),
  });
  const token = /chivago_host=([^;]+)/.exec(response.headers.get('set-cookie') ?? '')?.[1];
  assert.ok(token);
  return token;
}

const cookie = (token: string) => ({ cookie: `${SESSION_COOKIE}=${token}` });

describe('Adventure host review console', () => {
  test('renders a usable host-scoped review page with the evidence photo and no other host data', async () => {
    const host = await signIn(HOST_KEY);
    const page = await app.request('/adventure/reviews', { headers: cookie(host) });
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /Nina/);
    assert.match(html, /adventure-photo/);
    assert.match(html, /data-decision="approve"/);

    const other = await signIn(OTHER_KEY);
    const otherHtml = await (await app.request('/adventure/reviews', { headers: cookie(other) })).text();
    assert.doesNotMatch(otherHtml, /Nina/);
    assert.doesNotMatch(otherHtml, /adventure-photo/);
  });

  test('requires CSRF and host ownership, then an approval releases exactly one server reward', async () => {
    const evidenceId = (db.prepare('SELECT id FROM adventure_evidence').get() as { id: string }).id;
    const host = await signIn(HOST_KEY);
    const noCsrf = await app.request(`/adventure/evidence/${evidenceId}/decide`, {
      method: 'POST', headers: { ...cookie(host), 'content-type': 'application/json' },
      body: JSON.stringify({ approved: true }),
    });
    assert.equal(noCsrf.status, 403);

    const other = await signIn(OTHER_KEY);
    const otherSession = resolveSession(db, other)!;
    const forbidden = await app.request(`/adventure/evidence/${evidenceId}/decide`, {
      method: 'POST', headers: {
        ...cookie(other), 'content-type': 'application/json', 'x-csrf-token': __csrfFor(otherSession),
      }, body: JSON.stringify({ approved: true }),
    });
    assert.equal(forbidden.status, 403);

    const session = resolveSession(db, host)!;
    const approved = await app.request(`/adventure/evidence/${evidenceId}/decide`, {
      method: 'POST', headers: {
        ...cookie(host), 'content-type': 'application/json', 'x-csrf-token': __csrfFor(session),
      }, body: JSON.stringify({ approved: true }),
    });
    assert.equal(approved.status, 200);
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM ledger WHERE kind='activity_reward'").get() as { n: number }).n, 1);

    const duplicate = await app.request(`/adventure/evidence/${evidenceId}/decide`, {
      method: 'POST', headers: {
        ...cookie(host), 'content-type': 'application/json', 'x-csrf-token': __csrfFor(session),
      }, body: JSON.stringify({ approved: true }),
    });
    assert.equal(duplicate.status, 409);
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM ledger WHERE kind='activity_reward'").get() as { n: number }).n, 1);
  });
});
