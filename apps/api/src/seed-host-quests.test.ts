/** Seeding content again keeps what a campus host wrote. Found by restarting a preview, 26 November 2026. */
import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { openDb } from './db-node.ts';
import { createHostQuest, publishHostQuest, setHostCampus, submitHostQuest } from './host-quest-service.ts';
import { getQuest } from './repo.ts';

test('seed-db prunes what the seed dropped, not what a host wrote', () => {
  const dir = mkdtempSync(join(tmpdir(), 'chivago-seed-'));
  const path = join(dir, 'seed.db');
  const seed = () => spawnSync(
    process.execPath, ['--experimental-strip-types', join(import.meta.dirname, 'seed-db.ts')],
    { env: { ...process.env, CHIVAGO_DB: path, NODE_ENV: 'test' }, encoding: 'utf8' },
  );
  const first = seed();
  assert.equal(first.status, 0, first.stderr);
  const db = openDb(path);
  try {
    for (const id of ['h-fac', 'h-dean']) {
      db.prepare('INSERT INTO hosts (id,name,type,created_at) VALUES (?,?,?,?)').run(id, id, 'community', new Date().toISOString());
    }
    setHostCampus(db, 'h-fac', 'rmutt');
    const hour = 3_600_000;
    const q = createHostQuest(db, 'h-fac', null, {
      area: 'rmutt', nameEn: 'Walk', nameTh: 'เดินเล่น', whereEn: 'Park', whereTh: 'สวน', minutes: 60, rewardPoints: 10,
      rewardCurrency: 'trip', lat: 14.0334, lng: 100.7251, radiusM: 100, seats: 3,
      startsAt: new Date(Date.now() + hour).toISOString(), endsAt: new Date(Date.now() + 2 * hour).toISOString(),
    });
    submitHostQuest(db, 'h-fac', q.id);
    publishHostQuest(db, { hostId: 'h-dean', name: null }, q.id);
    const second = seed();
    assert.equal(second.status, 0, second.stderr);
    assert.ok(getQuest(db, q.id), second.stdout);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
