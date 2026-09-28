import { strict as assert } from 'node:assert';
import { test, describe, beforeEach } from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openTestDb, type DB } from './db.ts';
import { seedArea } from './seed-area.ts';
import { KEPT_TABLES, TRAVELLER_TABLES, checkSchema, reset } from './reset-demo.ts';

/**
 * The demo reset runs on production on the morning of an event (docs/46,
 * step 3), and it refuses to run while any table is unclassified - rightly:
 * a table nobody classified is one nobody decided to clear or to keep. Twelve
 * arrived unclassified, one pull request at a time, and nothing said so until
 * somebody ran the reset. This is that refusal, moved to where a pull request
 * sees it.
 */

let db: DB;
beforeEach(() => { db = openTestDb(); });

const count = (table: string) => (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
const AT = '2026-09-29T08:00:00.000Z';

describe('every table is decided', () => {
  test('EVERY TABLE THE SCHEMA HAS IS CLEARED OR KEPT - A NEW ONE FAILS HERE, NOT ON THE MORNING', () => {
    assert.doesNotThrow(() => checkSchema(db));
  });

  test('no table is both cleared and kept', () => {
    const kept = new Set<string>(KEPT_TABLES);
    assert.deepEqual(TRAVELLER_TABLES.filter((t) => kept.has(t)), []);
  });
});

/** Content, one traveller, and a row in every table the classification decided. */
function populated(): void {
  seedArea(db, 'ku-bangkhen');
  const host = 'h-ku-bangkhen-chivago';
  const quest = 'q-ku-bk-walk';
  db.exec(`
    INSERT INTO offers (id, category, name, merchant, merchant_short, cost_points) VALUES ('o1','food','Tea','Shop','Shop',10);
    INSERT INTO users (id, display_name, created_at) VALUES ('u1','Traveller','${AT}');
    INSERT INTO parties (id, name, code_hash, created_by, created_at) VALUES ('p1','Party','hash','u1','${AT}');
    INSERT INTO party_members (party_id, user_id, joined_at) VALUES ('p1','u1','${AT}');
    INSERT INTO party_invites (id, party_id, place_id, from_at, until_at, spaces, created_by, created_at)
      VALUES ('pi1','p1','ku-bk-library','${AT}','${AT}',2,'u1','${AT}');
    INSERT INTO invite_requests (invite_id, user_id, asked_at) VALUES ('pi1','u1','${AT}');
    INSERT INTO listings (id, operator_id, kind, title_en, title_th, where_label, created_at)
      VALUES ('l1','${host}','stay','Room','ห้องพัก','Bangkhen','${AT}');
    INSERT INTO inquiries (id, listing_id, user_id, for_date, party_size, message, sent_at)
      VALUES ('i1','l1','u1','2026-10-01',2,'Is it free?','${AT}');
    INSERT INTO organisations (id, name_en, name_th, kind, created_at) VALUES ('org1','Org','องค์กร','university','${AT}');
    INSERT INTO org_sponsorships (org_id, quest_id, funded_thb, per_verified_thb, started_at)
      VALUES ('org1','${quest}',1000,10,'${AT}');
    INSERT INTO claim_adjustments (id, org_id, quest_id, effective_from, channel, recorded_at)
      VALUES ('ca1','org1','${quest}','${AT}','entered_by_staff','${AT}');
    INSERT INTO quest_plan_locks (id, quest_id, digest, verified_at_lock, locked_at) VALUES ('ql1','${quest}','d',0,'${AT}');
    INSERT INTO tree_plantings (id, org_id, quest_id, trees, partner, planted_at, lat, lng, photo_url, photo_credit, photo_licence, created_at)
      VALUES ('t1','org1','${quest}',3,'Partner','${AT}',13.845,100.57,'/assets/t1.jpg','Partner','Used with permission','${AT}');
    INSERT INTO tree_attributions (planting_id, user_id, trees) VALUES ('t1','u1',1);
    INSERT INTO statements (id, host_id, period_from, period_to, issued_at, body, digest)
      VALUES ('s1','${host}','${AT}','${AT}','${AT}','{}','d');
  `);
}

describe('what a reset clears and what it keeps', () => {
  test('A RESET CLEARS WHAT A TRAVELLER DID AND KEEPS WHAT A PARTNER RECORDED, IN AN ORDER THE FOREIGN KEYS ACCEPT', () => {
    populated();
    reset(db);
    for (const t of ['inquiries', 'invite_requests', 'party_invites', 'party_members', 'parties',
      'tree_attributions', 'statements', 'users']) {
      assert.equal(count(t), 0, `${t} survived the reset`);
    }
    for (const t of ['listings', 'organisations', 'org_sponsorships', 'claim_adjustments', 'tree_plantings',
      'quest_plan_locks', 'places', 'quests', 'offers', 'hosts']) {
      assert.ok(count(t) > 0, `${t} was cleared`);
    }
  });

  test('IT REFUSES TO DELETE A STATEMENT AN AUDITOR HAS COUNTERSIGNED, AND DELETES NOTHING', () => {
    populated();
    db.exec(`INSERT INTO statement_countersignatures (id, statement_id, digest, signer_name, signer_firm, standard, opinion, channel, recorded_at)
      VALUES ('sc1','s1','d','A. Auditor','Firm','isae3000_limited','unmodified','entered_by_staff','${AT}')`);
    assert.throws(() => reset(db), /1 countersignature\(s\) and 0 declared use\(s\)/);
    assert.equal(count('users'), 1, 'it deleted before it refused');
    assert.equal(count('statements'), 1);
  });

  test('or one an organisation has declared it used in a report', () => {
    populated();
    db.exec(`INSERT INTO statement_uses (id, statement_id, digest, org_id, kind, reporting_year, declared_at)
      VALUES ('su1','s1','d','org1','one_report',2026,'${AT}')`);
    assert.throws(() => reset(db), /0 countersignature\(s\) and 1 declared use\(s\)/);
    assert.equal(count('users'), 1, 'it deleted before it refused');
  });
});

describe('the runbook, run', () => {
  /*
    docs/46 steps 2 and 3, exactly: the content seed, then the reset with its
    walk, as separate processes on an empty database. The walk failed on
    Companions from 10 September - one walked leg began hatching every egg -
    and nothing ran it until the 29th, when it also refused twelve tables.
    Either would have failed here the day it happened.

    The reset will not seed a two-stop day in the first minutes of an island
    day (checkInAt), by design, so this does not run then.
  */
  const islandMinutes = (Math.floor(Date.now() / 60_000) + 7 * 60) % (24 * 60);
  test('THE CONTENT SEED, THEN THE RESET WALKED: EVERY SCREEN HAS SOMETHING TO SHOW',
    { skip: islandMinutes < 10 ? 'the reset does not seed in the first minutes of an island day' : false },
    () => {
      const dir = mkdtempSync(join(tmpdir(), 'chivago-walk-'));
      try {
        const env = { ...process.env, CHIVAGO_DB: join(dir, 'walk.db'), NODE_ENV: 'test' };
        const run = (script: string, ...args: string[]) => spawnSync(
          process.execPath, ['--experimental-strip-types', join(import.meta.dirname, script), ...args],
          { env, encoding: 'utf8' },
        );
        const seeded = run('seed-db.ts');
        assert.equal(seeded.status, 0, seeded.stderr);
        const walked = run('reset-demo.ts', '--walk');
        const failed = walked.stdout.split('\n').filter((l) => l.includes('FAIL')).join('\n');
        assert.equal(walked.status, 0, failed || walked.stderr);
        assert.match(walked.stdout, /every screen has something to show/);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
});
