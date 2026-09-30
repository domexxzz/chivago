import { strict as assert } from 'node:assert';
import { test, describe, beforeEach } from 'node:test';

import { existsSync, writeFileSync } from 'node:fs';
import { ASSIST_PROMPT_VERSION } from '@chivago/core';
import { openTestDb, type DB } from './db.ts';
import {
  assistConfig, assistStateFor, ffmpegPrepare, requestAssist, staleAssists,
  type AssistDeps, type AssistModel, type AssistModelRequest,
} from './assist-service.ts';
import { reviewItem } from './review-service.ts';

/**
 * The AI half of docs/63. The rule every test here circles: the model's
 * opinion is stored beside a proof and shown to its host, and it changes
 * nothing else - no stage, no wallet, no ledger, no decision.
 */

let db: DB;
const NOW = new Date('2026-10-20T06:00:00Z');
const SITE = { lat: 9.5357, lng: 100.0617 };

const shown = {
  work: 'shown',
  weight: 'consistent',
  concerns: [],
  suggestedReason: null,
  photos: [{ index: 0, en: 'Three bags on the sand', th: 'ถุงขยะ 3 ใบบนหาด' }],
  summary: { en: 'Three bags of litter on a beach.', th: 'เห็นถุงขยะ 3 ใบบนหาด' },
};

/** A model that answers from a script and remembers what it was asked. */
function fakeModel(answer: (req: AssistModelRequest, call: number) => unknown): AssistModel & {
  calls: AssistModelRequest[];
} {
  const calls: AssistModelRequest[] = [];
  return {
    id: 'fake-model-1',
    calls,
    async run(req) {
      calls.push(req);
      const a = answer(req, calls.length);
      if (a instanceof Error) throw a;
      return { raw: a, inputTokens: 1200, outputTokens: 180 };
    },
  };
}

const deps = (model: AssistModel | null, over: Partial<AssistDeps> = {}): AssistDeps => ({
  model,
  prepare: async (path) => Buffer.from(`jpeg:${path}`),
  dailyLimit: 200,
  timeoutMs: 1_000,
  now: () => NOW,
  ...over,
});

beforeEach(() => {
  db = openTestDb();
  const t = '2026-10-01T00:00:00Z';
  db.prepare('INSERT INTO users (id,display_name,created_at) VALUES (?,?,?)').run('u1', 'Somchai Leakcheck', t);
  for (const [id, name] of [['h1', 'Samui Municipality'], ['h2', 'Ocean Lab']]) {
    db.prepare('INSERT INTO hosts (id,name,type) VALUES (?,?,?)').run(id, name, 'municipality');
  }
  db.prepare(
    `INSERT INTO quests (id,code,name_en,name_th,where_label,where_label_th,duration,reward_points,
       host_id,kind,lat,lng,geofence_radius_m)
     VALUES ('q1','BC-04','Beach Cleanup','เก็บขยะชายหาด','Chaweng Beach','หาดเฉวง','45 min',150,'h1','today',?,?,250)`,
  ).run(SITE.lat, SITE.lng);
  db.prepare(
    `INSERT INTO quest_progress (user_id,quest_id,stage,arrived_at)
     VALUES ('u1','q1','host_verification','2026-10-20T05:00:00Z')`,
  ).run();
  db.prepare(
    `INSERT INTO proofs (id,user_id,quest_id,photos,weight_kg,submitted_at)
     VALUES ('p1','u1','q1','[]',4,'2026-10-20T05:30:00Z')`,
  ).run();
  for (const [i, lat] of [[1, 9.5357], [2, 9.5358]] as const) {
    db.prepare(
      `INSERT INTO proof_files (id,proof_id,storage_path,mime_type,byte_size,lat,lng,taken_at,uploaded_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    ).run(`f${i}`, 'p1', `/uploads/f${i}.jpg`, 'image/jpeg', 100, lat, SITE.lng, '2026-10-20T05:20:00Z', `2026-10-20T05:30:0${i}Z`);
  }
});

/** Every table but the AI's own, as it stands. */
function everythingElse(): string {
  const tables = (db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name != 'proof_assists' ORDER BY name",
  ).all() as { name: string }[]).map((r) => r.name);
  return JSON.stringify(tables.map((t) => [t, db.prepare(`SELECT * FROM "${t}"`).all()]));
}

describe('the AI never decides', () => {
  test('the most confident "shown" changes nothing but its own row', async () => {
    const before = everythingElse();
    const status = await requestAssist(db, 'p1', deps(fakeModel(() => shown)));
    assert.equal(status, 'done');
    assert.equal(everythingElse(), before);
    const p = db.prepare('SELECT reviewed_at, approved FROM proofs WHERE id=?').get('p1') as Record<string, unknown>;
    assert.equal(p.reviewed_at, null);
    assert.equal(p.approved, null);
  });

  test('a decided proof is not sent at all - there is nobody left to help', async () => {
    db.prepare("UPDATE proofs SET reviewed_at=?, approved=1 WHERE id='p1'").run(NOW.toISOString());
    const model = fakeModel(() => shown);
    await requestAssist(db, 'p1', deps(model));
    assert.equal(model.calls.length, 0);
  });
});

describe('off unless switched on', () => {
  test('no model means no call and an "off" row', async () => {
    assert.equal(await requestAssist(db, 'p1', deps(null)), 'off');
    assert.deepEqual(assistStateFor(db, 'p1'), { status: 'off' });
  });

  test('the environment switches it on only with every piece present', () => {
    const full = {
      CHIVAGO_ASSIST: 'on',
      CHIVAGO_ASSIST_MODEL: 'apac.anthropic.claude-test',
      AWS_BEARER_TOKEN_BEDROCK: 'tok',
    };
    assert.equal(assistConfig({}).enabled, false);
    assert.equal(assistConfig({ ...full, CHIVAGO_ASSIST: 'yes' }).enabled, false);
    assert.equal(assistConfig({ ...full, CHIVAGO_ASSIST_MODEL: '' }).enabled, false);
    assert.equal(assistConfig({ ...full, AWS_BEARER_TOKEN_BEDROCK: undefined }).enabled, false);
    const on = assistConfig(full);
    assert.equal(on.enabled, true);
    assert.equal(on.region, 'ap-southeast-1');
    assert.equal(on.dailyLimit, 200);
  });

  test('a nonsense limit or region falls back rather than breaking', () => {
    const c = assistConfig({ CHIVAGO_ASSIST_DAILY_LIMIT: '-4', CHIVAGO_ASSIST_REGION: 'x/../evil' });
    assert.equal(c.dailyLimit, 200);
    assert.equal(c.region, 'ap-southeast-1');
    assert.equal(assistConfig({ CHIVAGO_ASSIST_DAILY_LIMIT: '25' }).dailyLimit, 25);
  });
});

describe('what the model is sent', () => {
  test('the quest in both languages, the weight, the photos - and nobody\'s name', async () => {
    const model = fakeModel(() => shown);
    await requestAssist(db, 'p1', deps(model));
    const [req] = model.calls;
    assert.ok(req);
    const text = req.system + req.user;
    for (const s of ['BC-04', 'Beach Cleanup', 'เก็บขยะชายหาด', 'Chaweng Beach', 'หาดเฉวง', '4 kg']) {
      assert.ok(text.includes(s), `missing ${s}`);
    }
    for (const s of ['u1', 'Somchai', 'Leakcheck', 'Samui Municipality', '9.5357', '100.0617']) {
      assert.ok(!text.includes(s), `leaked ${s}`);
    }
  });

  test('photos go through prepare - the step that strips EXIF - in upload order', async () => {
    const prepared: string[] = [];
    const model = fakeModel(() => shown);
    await requestAssist(db, 'p1', deps(model, {
      prepare: async (path) => { prepared.push(path); return Buffer.from('clean'); },
    }));
    assert.deepEqual(prepared, ['/uploads/f1.jpg', '/uploads/f2.jpg']);
    assert.deepEqual(model.calls[0]!.images.map(String), ['clean', 'clean']);
  });
});

describe('the photo door', () => {
  test('re-encodes into a scratch file, returns its bytes, and leaves nothing behind', async () => {
    let scratch = '';
    const prepare = ffmpegPrepare({
      video: async () => ({ durationS: null }),
      photo: async (input, out) => {
        scratch = out;
        assert.equal(input, '/uploads/f1.jpg');
        writeFileSync(out, 'clean-jpeg');
      },
    });
    assert.equal(String(await prepare('/uploads/f1.jpg')), 'clean-jpeg');
    assert.ok(scratch);
    assert.equal(existsSync(scratch), false);
  });

  test('a failed encode still cleans up, and the failure reaches requestAssist', async () => {
    let scratch = '';
    const prepare = ffmpegPrepare({
      video: async () => ({ durationS: null }),
      photo: async (_input, out) => { scratch = out; throw new Error('ffmpeg exited 1'); },
    });
    await assert.rejects(prepare('/uploads/f1.jpg'));
    assert.equal(existsSync(scratch), false);
  });
});

describe('what is kept', () => {
  test('a good answer is stored parsed, with the model, prompt version and cost', async () => {
    await requestAssist(db, 'p1', deps(fakeModel(() => shown)));
    const r = db.prepare('SELECT * FROM proof_assists WHERE proof_id=?').get('p1') as Record<string, unknown>;
    assert.equal(r.status, 'done');
    assert.equal(r.model_id, 'fake-model-1');
    assert.equal(r.prompt_version, ASSIST_PROMPT_VERSION);
    assert.equal(r.input_tokens, 1200);
    assert.equal(r.output_tokens, 180);
    assert.equal(typeof r.latency_ms, 'number');
    assert.equal(r.error, null);
    const state = assistStateFor(db, 'p1');
    assert.equal(state?.status, 'done');
    assert.equal(state?.status === 'done' && state.assist.summary.th, 'เห็นถุงขยะ 3 ใบบนหาด');
  });

  test('an answer that does not parse is "failed", never a guessed opinion', async () => {
    await requestAssist(db, 'p1', deps(fakeModel(() => ({ work: 'approved' }))));
    const r = db.prepare('SELECT status, error, result_json FROM proof_assists WHERE proof_id=?').get('p1') as Record<string, unknown>;
    assert.equal(r.status, 'failed');
    assert.equal(r.error, 'bad_answer');
    assert.equal(r.result_json, null);
  });

  test('a throwing model is retried once, then "failed" with a code - never its message', async () => {
    const model = fakeModel(() => new Error('401 Bearer tok-SECRET-123 rejected'));
    assert.equal(await requestAssist(db, 'p1', deps(model)), 'failed');
    assert.equal(model.calls.length, 2);
    const r = db.prepare('SELECT error FROM proof_assists WHERE proof_id=?').get('p1') as { error: string };
    assert.equal(r.error, 'model_error');
    assert.doesNotMatch(JSON.stringify(db.prepare('SELECT * FROM proof_assists').all()), /SECRET/);
  });

  test('one failure then an answer is "done"', async () => {
    const model = fakeModel((_, n) => (n === 1 ? new Error('blip') : shown));
    assert.equal(await requestAssist(db, 'p1', deps(model)), 'done');
  });

  test('a model that never answers times out as "failed"', async () => {
    const hung: AssistModel = {
      id: 'hung',
      run: (_req, signal) => new Promise((_, reject) => {
        signal.addEventListener('abort', () => reject(new Error('aborted')));
      }),
    };
    assert.equal(await requestAssist(db, 'p1', deps(hung, { timeoutMs: 20 })), 'failed');
    const r = db.prepare('SELECT error FROM proof_assists WHERE proof_id=?').get('p1') as { error: string };
    assert.equal(r.error, 'timeout');
  });

  test('a photo that cannot be prepared fails the run without calling the model', async () => {
    const model = fakeModel(() => shown);
    const status = await requestAssist(db, 'p1', deps(model, {
      prepare: async () => { throw new Error('ffmpeg: not found'); },
    }));
    assert.equal(status, 'failed');
    assert.equal(model.calls.length, 0);
    assert.equal((db.prepare('SELECT error FROM proof_assists').get() as { error: string }).error, 'prepare_failed');
  });

  test('a proof with no uploaded photos has nothing to look at', async () => {
    db.prepare('DELETE FROM proof_files').run();
    const model = fakeModel(() => shown);
    assert.equal(await requestAssist(db, 'p1', deps(model)), 'failed');
    assert.equal(model.calls.length, 0);
    assert.equal((db.prepare('SELECT error FROM proof_assists').get() as { error: string }).error, 'no_photos');
  });

  test('an unknown proof is refused before anything is written', async () => {
    await assert.rejects(requestAssist(db, 'nope', deps(fakeModel(() => shown))));
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM proof_assists').get()!.n, 0);
  });

  test('asking twice for a done proof does not pay for it twice', async () => {
    const model = fakeModel(() => shown);
    await requestAssist(db, 'p1', deps(model));
    await requestAssist(db, 'p1', deps(model));
    assert.equal(model.calls.length, 1);
  });
});

describe('the daily cap', () => {
  const seedRuns = (n: number, hoursAgo: number) => {
    for (let i = 0; i < n; i++) {
      db.prepare(
        `INSERT INTO proofs (id,user_id,quest_id,photos,submitted_at) VALUES (?,?,?,?,?)`,
      ).run(`old${hoursAgo}-${i}`, 'u1', 'q1', '[]', '2026-10-01T00:00:00Z');
      db.prepare(
        `INSERT INTO proof_assists (proof_id,status,attempts,created_at) VALUES (?,?,1,?)`,
      ).run(`old${hoursAgo}-${i}`, i % 2 ? 'done' : 'failed', new Date(NOW.getTime() - hoursAgo * 3_600_000).toISOString());
    }
  };

  test('at the cap: "limit", and the model is not called', async () => {
    seedRuns(3, 2);
    const model = fakeModel(() => shown);
    assert.equal(await requestAssist(db, 'p1', deps(model, { dailyLimit: 3 })), 'limit');
    assert.equal(model.calls.length, 0);
  });

  test('calls older than a day do not count', async () => {
    seedRuns(3, 25);
    assert.equal(await requestAssist(db, 'p1', deps(fakeModel(() => shown), { dailyLimit: 3 })), 'done');
  });

  test('a retry is a call and counts against the cap like one', async () => {
    seedRuns(1, 2);
    await requestAssist(db, 'p1', deps(fakeModel(() => new Error('down'))));
    assert.equal((db.prepare("SELECT attempts FROM proof_assists WHERE proof_id='p1'").get() as { attempts: number }).attempts, 2);
    db.prepare(`INSERT INTO proofs (id,user_id,quest_id,photos,submitted_at) VALUES ('p2','u1','q1','[]',?)`).run(NOW.toISOString());
    assert.equal(await requestAssist(db, 'p2', deps(fakeModel(() => shown), { dailyLimit: 3 })), 'limit');
  });

  test('a stale row picked up again does not count against itself', async () => {
    db.prepare(`INSERT INTO proof_assists (proof_id,status,attempts,created_at) VALUES ('p1','pending',5,?)`).run(NOW.toISOString());
    assert.equal(await requestAssist(db, 'p1', deps(fakeModel(() => shown), { dailyLimit: 3 })), 'done');
  });
});

describe('two runs at one proof', () => {
  test('the upload and the sweep reaching one proof pay once', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const model = fakeModel(() => shown);
    const slow: AssistModel = { id: model.id, run: async (req, s) => { await gate; return model.run(req, s); } };
    const first = requestAssist(db, 'p1', deps(slow));
    assert.equal(await requestAssist(db, 'p1', deps(slow)), 'pending');
    release();
    assert.equal(await first, 'done');
    assert.equal(model.calls.length, 1);
  });

  test('a late answer never overwrites one already settled elsewhere', async () => {
    // Another machine (a rolling deploy) settled the row while this run was
    // still waiting on the model.
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const late: AssistModel = {
      id: 'late',
      run: async (_req, signal) => {
        await gate;
        if (signal.aborted) throw new Error('aborted');
        return { raw: { ...shown, work: 'not_shown' }, inputTokens: 1, outputTokens: 1 };
      },
    };
    const run = requestAssist(db, 'p1', deps(late));
    await new Promise((r) => setImmediate(r));
    db.prepare(
      "UPDATE proof_assists SET status='done', result_json=?, model_id='elsewhere' WHERE proof_id='p1'",
    ).run(JSON.stringify(shown));
    release();
    assert.equal(await run, 'done');
    const r = db.prepare("SELECT model_id, result_json FROM proof_assists WHERE proof_id='p1'").get() as Record<string, string>;
    assert.equal(r.model_id, 'elsewhere');
    assert.equal(JSON.parse(r.result_json).work, 'shown');
  });

  test('a pending row on a proof the host has since decided is settled, not swept forever', async () => {
    db.prepare(`INSERT INTO proof_assists (proof_id,status,created_at) VALUES ('p1','pending','2026-10-20T05:00:00Z')`).run();
    db.prepare("UPDATE proofs SET reviewed_at=?, approved=1 WHERE id='p1'").run(NOW.toISOString());
    const model = fakeModel(() => shown);
    assert.equal(await requestAssist(db, 'p1', deps(model)), 'off');
    assert.equal(model.calls.length, 0);
    assert.deepEqual(staleAssists(db, new Date(NOW.getTime() + 3_600_000)), []);
  });
});

describe('picking up after a restart', () => {
  test('a pending row older than two minutes is stale; a fresh one is not', () => {
    const at = (min: number) => new Date(NOW.getTime() - min * 60_000).toISOString();
    db.prepare(`INSERT INTO proof_assists (proof_id,status,created_at) VALUES ('p1','pending',?)`).run(at(3));
    assert.deepEqual(staleAssists(db, NOW), ['p1']);
    db.prepare(`UPDATE proof_assists SET created_at=? WHERE proof_id='p1'`).run(at(1));
    assert.deepEqual(staleAssists(db, NOW), []);
  });
});

describe('in the console', () => {
  test('the host sees a fourth check, after the three that read numbers', async () => {
    await requestAssist(db, 'p1', deps(fakeModel(() => shown)));
    const item = reviewItem(db, 'h1', 'p1', NOW);
    assert.deepEqual(item?.checks.map((c) => c.key), ['geotag', 'timing', 'weight', 'ai']);
    assert.equal(item?.checks[3]!.status, 'pass');
    assert.equal(item?.assist?.summary.en, 'Three bags of litter on a beach.');
  });

  test('with no opinion yet, the check is unknown and the item has no assist', () => {
    const item = reviewItem(db, 'h1', 'p1', NOW);
    assert.equal(item?.checks[3]!.status, 'unknown');
    assert.equal(item?.assist, null);
  });

  test('another host cannot reach the opinion, as it cannot reach the proof', async () => {
    await requestAssist(db, 'p1', deps(fakeModel(() => shown)));
    assert.equal(reviewItem(db, 'h2', 'p1', NOW), null);
  });
});
