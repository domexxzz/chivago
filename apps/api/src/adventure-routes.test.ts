import { strict as assert } from 'node:assert';
import { before, describe, test } from 'node:test';

delete process.env.CHIVAGO_OPEN_IDENTITY;
process.env.CHIVAGO_DB = ':memory:';
process.env.CHIVAGO_QR_SIGNING_SECRET = 'route-test-qr-secret-that-is-more-than-thirty-two-characters';
const { app, db } = await import('./server-node.ts');
const { bootstrapKohSichangAdventure } = await import('./adventure-bootstrap.ts');
const { createActivityQr, setPolicy } = await import('./activity-verification-service.ts');

let deviceKey = '';
let userId = '';
const placeIds = [
  'sc-palace', 'sc-atsadang-bridge', 'sc-chong-khao-khat', 'sc-chao-pho-khao-yai', 'sc-thamphang',
];

before(async () => {
  const insert = db.prepare(
    `INSERT INTO places
     (id,name_en,name_th,short,layer,lat,lng,meta,blurb_en,blurb_th,tags,
      safety_label_en,safety_label_th,crowd_density,aqi,safety_index,walkability)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  );
  placeIds.forEach((id, index) => insert.run(
    id, `Place ${index + 1}`, `สถานที่ ${index + 1}`, id, 'Quest', 13.15 + index / 1000,
    100.8 + index / 1000, 'Koh Sichang', 'A real place', 'สถานที่จริง', '[]',
    'Use care', 'เดินทางอย่างระมัดระวัง', 1, 20, 8, 7,
  ));
  bootstrapKohSichangAdventure(db);
  const registered = await app.request('/devices', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ displayName: 'Adventure traveller', label: 'test phone' }),
  });
  const body = await registered.json() as { data: { deviceKey: string; userId: string } };
  deviceKey = body.data.deviceKey;
  userId = body.data.userId;
});

describe('Adventure HTTP API', () => {
  test('serves a published database-backed route to the authenticated traveller', async () => {
    const response = await app.request('/adventures/current?area=koh-sichang', {
      headers: { 'x-chivago-device-key': deviceKey },
    });
    assert.equal(response.status, 200);
    const body = await response.json() as any;
    assert.equal(body.ok, true);
    assert.equal(body.data.adventure.totalNodes, 5);
    assert.equal(body.data.adventure.chapters[0].nodes[0].state, 'available');
    assert.equal(body.data.adventure.chapters[0].nodes[1].state, 'locked');
  });

  test('does not expose a draft or a fabricated fallback for another area', async () => {
    const response = await app.request('/adventures/current?area=samui', {
      headers: { 'x-chivago-device-key': deviceKey },
    });
    const body = await response.json() as any;
    assert.equal(body.data.adventure, null);
  });

  test('verifies a signed QR through authenticated server context and never accepts user identity or reward input', async () => {
    db.prepare('INSERT INTO hosts (id,name,type) VALUES (?,?,?)').run('adventure-route-host', 'Adventure route host', 'community');
    setPolicy(db, 'adventure-route-host', {
      nodeId: 'ks-memory-route-palace', requiresGps: false, requiresQr: true,
      requiresEvidence: false, requiresHost: false, geofenceRadiusM: 150,
      rewardPoints: 7, rewardExp: 3, rewardCurrency: 'trip',
    });
    const qr = createActivityQr(db, {
      hostId: 'adventure-route-host', nodeId: 'ks-memory-route-palace', type: 'static',
      createdBy: 'adventure-route-host', signingSecret: process.env.CHIVAGO_QR_SIGNING_SECRET!,
    });
    const response = await app.request('/adventure/qr/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-chivago-device-key': deviceKey },
      body: JSON.stringify({
        token: qr.token, clientRequestId: 'route-valid-request', nodeId: 'ks-memory-route-palace',
        userId: 'attacker-chosen-user', rewardPoints: 999999, verificationStatus: 'approved',
      }),
    });
    assert.equal(response.status, 200);
    const body = await response.json() as any;
    assert.equal(body.data.activityVerified, true);
    const reward = db.prepare("SELECT user_id,amount,exp FROM ledger WHERE kind='activity_reward'").get() as
      { user_id: string; amount: number; exp: number };
    assert.equal(reward.user_id, userId);
    assert.equal(reward.amount, 7);
    assert.equal(reward.exp, 3);
  });

  test('records a rejected tampered QR without exposing a success state', async () => {
    const response = await app.request('/adventure/qr/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-chivago-device-key': deviceKey },
      body: JSON.stringify({ token: 'chivago:v1:bad.bad', clientRequestId: 'route-tampered-request' }),
    });
    assert.equal(response.status, 403);
    const body = await response.json() as any;
    assert.equal(body.ok, false);
    assert.equal(body.code, 'QR_SIGNATURE_INVALID');
    assert.equal((db.prepare(
      "SELECT COUNT(*) AS n FROM activity_qr_scans WHERE user_id=? AND status='rejected'",
    ).get(userId) as { n: number }).n, 1);
  });
});
