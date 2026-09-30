/**
 * A second pair of eyes - the API half (docs/63).
 *
 * After a proof's photos are stored, the model is asked what it sees and the
 * answer is kept beside the proof for its host to read. That is all. Nothing
 * here imports resolveVerification, writes to a wallet or the ledger, or
 * touches a proof's review columns: the host decides, and only the host.
 *
 * Every way this can go wrong ends in a row the console shows as `unknown`
 * and a host who carries on exactly as before. The call is never on a
 * request path - not the volunteer's upload, not the host's page.
 */

import {
  ASSIST_MAX_PHOTOS, ASSIST_PROMPT_VERSION,
  assistToolSchema, buildAssistPrompt, parseAssist,
  type Assist, type AssistQuest, type AssistState,
} from '@chivago/core';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { row, rows, type DB } from './db.ts';
import { ffmpegTranscoder, type Transcoder } from './transcode.ts';

export type AssistStatus = 'pending' | 'done' | 'failed' | 'off' | 'limit';

/** Stored in `proof_assists.error`. A code, never an upstream message. */
export type AssistError = 'timeout' | 'model_error' | 'bad_answer' | 'no_photos' | 'prepare_failed';

/** The tool the model must answer through. */
export const ASSIST_TOOL = 'record_opinion';

export interface AssistModelRequest {
  system: string;
  user: string;
  /** JPEGs with their EXIF already gone. */
  images: Buffer[];
  toolName: string;
  toolSchema: object;
}

export interface AssistModelReply {
  /** The tool input, as the model sent it. parseAssist decides what survives. */
  raw: unknown;
  inputTokens: number | null;
  outputTokens: number | null;
}

/** Bedrock in production (bedrock.ts), a script in tests. */
export interface AssistModel {
  readonly id: string;
  run(req: AssistModelRequest, signal: AbortSignal): Promise<AssistModelReply>;
}

export interface AssistDeps {
  /** Null when the assistant is off. */
  model: AssistModel | null;
  /** Stored photo -> a small JPEG with no EXIF. The only way a photo reaches the model. */
  prepare: (storagePath: string) => Promise<Buffer>;
  /** Most model calls in any 24 hours, retries included; beyond it a proof is marked `limit`. */
  dailyLimit: number;
  timeoutMs?: number;
  now?: () => Date;
}

const DEFAULT_TIMEOUT_MS = 30_000;
/** One retry: a blip clears, a dead upstream is not hammered. */
const ATTEMPTS = 2;
/** A pending row this old outlived the process that started it. */
export const STALE_AFTER_MS = 120_000;
const DEFAULT_DAILY_LIMIT = 200;
const DEFAULT_REGION = 'ap-southeast-1';
const DAY_MS = 86_400_000;

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface AssistConfig {
  enabled: boolean;
  modelId: string | null;
  region: string;
  token: string | null;
  dailyLimit: number;
}

/**
 * Off unless every piece is present. A half-configured assistant would fail
 * every proof and fill the console with "AI failed" for nothing.
 */
export function assistConfig(env: Record<string, string | undefined>): AssistConfig {
  const modelId = env.CHIVAGO_ASSIST_MODEL?.trim() || null;
  const token = env.AWS_BEARER_TOKEN_BEDROCK?.trim() || null;
  const regionRaw = env.CHIVAGO_ASSIST_REGION?.trim() ?? '';
  // Goes into a hostname; anything but a region's shape is ignored.
  const region = /^[a-z]{2}(-[a-z]+)+-\d$/.test(regionRaw) ? regionRaw : DEFAULT_REGION;
  const limit = Number(env.CHIVAGO_ASSIST_DAILY_LIMIT);
  const dailyLimit = Number.isInteger(limit) && limit > 0 ? limit : DEFAULT_DAILY_LIMIT;
  return {
    enabled: env.CHIVAGO_ASSIST === 'on' && modelId !== null && token !== null,
    modelId,
    region,
    token,
    dailyLimit,
  };
}

/**
 * The photo door for the model: the same re-encode a public story photo goes
 * through - 720 wide, a fresh JPEG, EXIF and its position gone - into a
 * scratch directory that is removed whatever happens.
 */
export function ffmpegPrepare(transcoder: Transcoder = ffmpegTranscoder) {
  return async (storagePath: string): Promise<Buffer> => {
    const dir = await mkdtemp(join(tmpdir(), 'chivago-assist-'));
    try {
      const out = join(dir, 'photo.jpg');
      await transcoder.photo(storagePath, out);
      return await readFile(out);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  };
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

/** What the console shows for one proof, or null when nobody has asked. */
export function assistStateFor(db: DB, proofId: string): AssistState | null {
  const r = row<{ status: AssistStatus; result_json: string | null }>(
    db.prepare('SELECT status, result_json FROM proof_assists WHERE proof_id = ?').get(proofId),
  );
  if (!r) return null;
  if (r.status !== 'done') return { status: r.status };
  try {
    return { status: 'done', assist: JSON.parse(r.result_json ?? 'null') as Assist };
  } catch {
    return { status: 'failed' };
  }
}

/** Pending rows old enough that whatever started them is gone. */
export function staleAssists(db: DB, now = new Date()): string[] {
  const before = new Date(now.getTime() - STALE_AFTER_MS).toISOString();
  return rows<{ proof_id: string }>(
    db.prepare(
      `SELECT proof_id FROM proof_assists WHERE status = 'pending' AND created_at <= ?
       ORDER BY created_at`,
    ).all(before),
  ).map((r) => r.proof_id);
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

function mark(db: DB, proofId: string, status: AssistStatus, now: Date): void {
  db.prepare(
    `INSERT INTO proof_assists (proof_id, status, created_at) VALUES (?, ?, ?)
     ON CONFLICT(proof_id) DO UPDATE SET
       status = excluded.status, created_at = excluded.created_at,
       model_id = NULL, prompt_version = NULL, result_json = NULL, error = NULL,
       input_tokens = NULL, output_tokens = NULL, latency_ms = NULL, completed_at = NULL`,
  ).run(proofId, status, now.toISOString());
}

function finish(
  db: DB,
  proofId: string,
  fields: {
    status: 'done' | 'failed';
    modelId?: string;
    assist?: Assist;
    error?: AssistError;
    reply?: AssistModelReply;
    latencyMs?: number;
  },
  now: Date,
): AssistStatus {
  const res = db.prepare(
    `UPDATE proof_assists SET status = ?, model_id = ?, prompt_version = ?, result_json = ?,
       error = ?, input_tokens = ?, output_tokens = ?, latency_ms = ?, completed_at = ?
     WHERE proof_id = ? AND status = 'pending'`,
  ).run(
    fields.status,
    fields.modelId ?? null,
    ASSIST_PROMPT_VERSION,
    fields.assist ? JSON.stringify(fields.assist) : null,
    fields.error ?? null,
    fields.reply?.inputTokens ?? null,
    fields.reply?.outputTokens ?? null,
    fields.latencyMs ?? null,
    now.toISOString(),
    proofId,
  );
  // Only a pending row is finished. If another run settled it first, its
  // answer stands and this one's is dropped - a late timeout must never
  // overwrite an opinion the host may already be reading.
  if (Number(res.changes) === 0) return assistStateFor(db, proofId)?.status ?? 'off';
  return fields.status;
}

/**
 * Model calls in the last 24 hours for OTHER proofs - calls, not rows, so a
 * retry is paid for like any other call, and a stale row being picked up
 * again does not count against itself.
 */
function callsToday(db: DB, proofId: string, now: Date): number {
  const since = new Date(now.getTime() - DAY_MS).toISOString();
  return row<{ n: number | null }>(
    db.prepare(
      'SELECT SUM(attempts) AS n FROM proof_assists WHERE created_at > ? AND proof_id != ?',
    ).get(since, proofId),
  )?.n ?? 0;
}

/**
 * Proofs being asked about in this process right now. The upload and the
 * stale sweep can both reach one proof; only the first gets to spend.
 */
const inFlight = new Set<string>();

class Timeout extends Error {}

/** An HTTP refusal that asking again will not change: 4xx, except 408 and 429. */
function refusesAgain(err: unknown): boolean {
  const status = (err as { status?: unknown } | null)?.status;
  return typeof status === 'number' && status >= 400 && status < 500 && status !== 408 && status !== 429;
}

async function askOnce(
  model: AssistModel,
  req: AssistModelRequest,
  timeoutMs: number,
): Promise<AssistModelReply> {
  const ctl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      // Timeout first: abort() makes the model reject synchronously, and the
      // race must settle on why we stopped, not on the model's reaction.
      reject(new Timeout());
      ctl.abort();
    }, timeoutMs);
  });
  try {
    return await Promise.race([model.run(req, ctl.signal), timedOut]);
  } finally {
    clearTimeout(timer);
  }
}

interface ProofForAssist {
  reviewed_at: string | null;
  weight_kg: number | null;
  code: string;
  name_en: string;
  name_th: string;
  where_label: string;
  where_label_th: string | null;
}

/**
 * Ask the model about one proof and keep what survives parsing.
 *
 * The `pending` row is written before the first await, so the console and
 * the stale sweep see it the moment the upload returns. Throws only for a
 * proof that does not exist - every other outcome is a status.
 */
export async function requestAssist(db: DB, proofId: string, deps: AssistDeps): Promise<AssistStatus> {
  const now = deps.now ?? (() => new Date());
  const proof = row<ProofForAssist>(
    db.prepare(
      `SELECT p.reviewed_at, p.weight_kg, q.code, q.name_en, q.name_th, q.where_label, q.where_label_th
       FROM proofs p JOIN quests q ON q.id = p.quest_id WHERE p.id = ?`,
    ).get(proofId),
  );
  if (!proof) throw new Error(`unknown proof: ${proofId}`);

  if (inFlight.has(proofId)) return 'pending';
  const existing = assistStateFor(db, proofId);
  if (existing?.status === 'done') return 'done';
  // Decided already: there is nobody left to help, and no reason to spend.
  // A pending row left by a dead process is settled, or the sweep would
  // find it every minute forever.
  if (proof.reviewed_at !== null) {
    if (existing?.status !== 'pending') return existing?.status ?? 'off';
    mark(db, proofId, 'off', now());
    return 'off';
  }

  if (!deps.model) {
    mark(db, proofId, 'off', now());
    return 'off';
  }
  if (callsToday(db, proofId, now()) >= deps.dailyLimit) {
    mark(db, proofId, 'limit', now());
    return 'limit';
  }
  mark(db, proofId, 'pending', now());
  inFlight.add(proofId);
  try {
    return await ask(db, proofId, proof, deps.model, deps, now);
  } finally {
    inFlight.delete(proofId);
  }
}

/** The part that spends: photos prepared, the model asked, the answer kept. */
async function ask(
  db: DB,
  proofId: string,
  proof: ProofForAssist,
  model: AssistModel,
  deps: AssistDeps,
  now: () => Date,
): Promise<AssistStatus> {
  const files = rows<{ storage_path: string }>(
    db.prepare(
      'SELECT storage_path FROM proof_files WHERE proof_id = ? ORDER BY uploaded_at LIMIT ?',
    ).all(proofId, ASSIST_MAX_PHOTOS),
  );
  if (files.length === 0) return finish(db, proofId, { status: 'failed', error: 'no_photos' }, now());

  let images: Buffer[];
  try {
    images = await Promise.all(files.map((f) => deps.prepare(f.storage_path)));
  } catch (err) {
    console.error('[chivago] assist prepare failed:', (err as Error).message);
    return finish(db, proofId, { status: 'failed', error: 'prepare_failed' }, now());
  }

  const c = await consult(model, {
    code: proof.code,
    name: { en: proof.name_en, th: proof.name_th },
    where: { en: proof.where_label, th: proof.where_label_th ?? proof.where_label },
    weightKg: proof.weight_kg,
  }, images, {
    timeoutMs: deps.timeoutMs,
    label: proofId,
    // Counted before the call: a call that hangs is still a call we pay for.
    onAttempt: () => {
      db.prepare('UPDATE proof_assists SET attempts = attempts + 1 WHERE proof_id = ?').run(proofId);
    },
  });
  return finish(db, proofId, {
    status: c.assist ? 'done' : 'failed',
    modelId: model.id,
    assist: c.assist ?? undefined,
    error: c.error ?? undefined,
    reply: c.reply ?? undefined,
    latencyMs: c.latencyMs,
  }, now());
}

export interface Consultation {
  /** What survived parseAssist; null when nothing did. */
  assist: Assist | null;
  error: AssistError | null;
  /** The last reply, when there was one - its token counts are the cost. */
  reply: AssistModelReply | null;
  latencyMs: number;
  attempts: number;
}

/**
 * One consultation, with no database: prompt, retries, timeout, parsing.
 * The console path above and the eval script (scripts/assist-eval.ts) both
 * run exactly this, so the numbers the eval prints are the numbers a host
 * would get.
 */
export async function consult(
  model: AssistModel,
  quest: AssistQuest,
  images: Buffer[],
  opts: { timeoutMs?: number; label?: string; onAttempt?: () => void } = {},
): Promise<Consultation> {
  const sent = { photoCount: images.length, weightKg: quest.weightKg };
  const { system, user } = buildAssistPrompt(quest, sent.photoCount);
  const req: AssistModelRequest = {
    system, user, images, toolName: ASSIST_TOOL, toolSchema: assistToolSchema,
  };

  const started = Date.now();
  let lastError: AssistError = 'model_error';
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    opts.onAttempt?.();
    try {
      const reply = await askOnce(model, req, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
      const assist = parseAssist(reply.raw, sent);
      return {
        assist,
        error: assist ? null : 'bad_answer',
        reply,
        latencyMs: Date.now() - started,
        attempts: attempt,
      };
    } catch (err) {
      // The message stays in the log, where an operator reads it; the table
      // keeps a code, because an upstream error can echo a header back.
      lastError = err instanceof Timeout ? 'timeout' : 'model_error';
      console.error(`[chivago] assist attempt ${attempt} for ${opts.label ?? '?'}: ${lastError}`);
      // A 4xx other than throttling says the same thing twice: the key, the
      // model id or the request is wrong, and a retry only spends the cap.
      if (refusesAgain(err)) {
        return { assist: null, error: lastError, reply: null, latencyMs: Date.now() - started, attempts: attempt };
      }
    }
  }
  return { assist: null, error: lastError, reply: null, latencyMs: Date.now() - started, attempts: ATTEMPTS };
}

/** What the AI check showed when the host decided (docs/63, measuring agreement). */
export function recordAssistAtDecision(db: DB, proofId: string, aiStatus: string | null): void {
  db.prepare('UPDATE proofs SET assist_at_decision = ? WHERE id = ?').run(aiStatus, proofId);
}
