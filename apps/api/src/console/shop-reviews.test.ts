import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { openTestDb } from '../db.ts';
import { hashApiKey, SESSION_COOKIE } from '../host-auth.ts';
import { consoleRoutes } from './routes.ts';

test('shop review reports are moderator-only and hiding removes the rating', async () => {
  const db = openTestDb();
  try {
    const app = consoleRoutes(db);
    const now = new Date().toISOString();
    const modKey = 'chv_SHOPM-SHOPM-SHOPM-SHOPM';
    const hostKey = 'chv_SHOPH-SHOPH-SHOPH-SHOPH';
    db.prepare('INSERT INTO hosts(id,name,type,role,api_key_hash,created_at) VALUES(?,?,?,?,?,?)').run('mod', 'Moderator', 'platform', 'moderator', hashApiKey(modKey), now);
    db.prepare('INSERT INTO hosts(id,name,type,role,api_key_hash,created_at) VALUES(?,?,?,?,?,?)').run('host', 'Host', 'hotel', 'host', hashApiKey(hostKey), now);
    for (const id of ['owner', 'reader']) db.prepare('INSERT INTO users(id,display_name,created_at) VALUES(?,?,?)').run(id, id, now);
    db.prepare(`INSERT INTO local_shops(id,owner_id,name,category,area_key,lat,lng,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)`).run('shop', 'owner', 'Cafe', 'Food', 'koh-sichang', 13.1599, 100.8096, now, now);
    db.prepare('INSERT INTO local_shop_reviews(id,shop_id,user_id,rating,body,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run('review', 'shop', 'reader', 1, 'Needs attention', now, now);
    db.prepare('INSERT INTO local_shop_review_reports(id,review_id,reporter_id,reason,created_at) VALUES(?,?,?,?,?)').run('report', 'review', 'owner', 'abusive', now);
    const signIn = async (key: string) => {
      const result = await app.request('/login', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ key, reviewer: 'Nok' }) });
      const token = /chivago_host=([^;]+)/.exec(result.headers.get('set-cookie') ?? '')?.[1];
      assert.ok(token);
      return token;
    };
    const host = await signIn(hostKey);
    assert.equal((await app.request('/shop-reviews', { headers: { cookie: `${SESSION_COOKIE}=${host}` } })).status, 403);
    const moderator = await signIn(modKey);
    const cookie = `${SESSION_COOKIE}=${moderator}`;
    const page = await app.request('/shop-reviews', { headers: { cookie } });
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Needs attention/);
    const csrf = Buffer.from(moderator).toString('base64url').slice(0, 32);
    const decided = await app.request('/shop-reviews/report/decide', { method: 'POST', headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ csrf, decision: 'hide' }) });
    assert.equal(decided.status, 303);
    const hidden = db.prepare('SELECT hidden_at FROM local_shop_reviews WHERE id=?').get('review') as { hidden_at: string | null };
    assert.ok(hidden.hidden_at);
    const remaining = db.prepare("SELECT COUNT(*) AS count FROM local_shop_review_reports WHERE status='pending'").get() as { count: number };
    assert.equal(remaining.count, 0);
  } finally { db.close(); }
});
