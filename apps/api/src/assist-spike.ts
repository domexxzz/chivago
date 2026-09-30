/**
 * pnpm --filter @chivago/api assist:spike [--photo <jpeg>] [--model <id>]
 *
 * The first real Bedrock call (docs/63, "ลำดับงาน" 1-10 Oct). One photo,
 * one call, through the same bedrockModel and consult() the console uses,
 * and a line for each of the three things nothing but a real call can
 * settle:
 *
 *   1. auth    - does a Bedrock API key work as a Bearer token here?
 *   2. region  - is the model id reachable in CHIVAGO_ASSIST_REGION?
 *   3. shape   - does Converse accept our request, and does the forced tool
 *                come back as input parseAssist can read?
 *
 * Without --photo it makes a plain sand-coloured picture with ffmpeg: a
 * beach with no work on it, so a sane model answers "not_shown" or
 * "unclear", never "shown". That is a fourth, softer check.
 *
 * The key is read from AWS_BEARER_TOKEN_BEDROCK and never printed: an
 * upstream error body is shown to help diagnose, with the key cut out of it.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { SEED_QUESTS, assistToCheck } from '@chivago/core';
import { assistConfig, consult, ffmpegPrepare } from './assist-service.ts';
import { bedrockModel } from './bedrock.ts';
import { FFMPEG } from './transcode.ts';

/** Cut every occurrence of the secret out of text meant for a terminal. */
export function redact(text: string, secret: string): string {
  if (!secret) return text;
  return text.split(secret).join('[redacted]');
}

/** What a failed status most likely means, for the person reading the spike. */
export function diagnose(status: number, body: string): string {
  const b = body.toLowerCase();
  if (status === 401 || status === 403) {
    if (b.includes('access') && b.includes('model')) {
      return 'auth passed, but this account has no access to the model - request model access in the Bedrock console for this region';
    }
    return 'auth: the key was refused - check AWS_BEARER_TOKEN_BEDROCK, that it has not expired, and that it may call bedrock:InvokeModel';
  }
  if (status === 404 || (status === 400 && /model|identifier|inference profile/.test(b))) {
    return 'region/model: the model id is not reachable here - check CHIVAGO_ASSIST_MODEL (often an inference profile id) against CHIVAGO_ASSIST_REGION';
  }
  if (status === 400) return 'shape: Converse refused the request - the body above says which field';
  if (status === 429) return 'throttled: the account is over its rate or quota - wait, or ask for more';
  if (status >= 500) return 'Bedrock itself failed - try again';
  return `unexpected HTTP ${status}`;
}

function samplePhoto(dir: string): string {
  const out = join(dir, 'sand.jpg');
  const r = spawnSync(FFMPEG, [
    '-y', '-f', 'lavfi', '-i', 'color=c=0xd8c08a:s=800x600', '-frames:v', '1', out,
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  if (r.status !== 0) throw new Error(`ffmpeg could not make a sample photo: ${String(r.stderr).split('\n').slice(-2).join(' ')}`);
  return out;
}

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: { photo: { type: 'string' }, model: { type: 'string' } },
  });
  const cfg = assistConfig(process.env);
  const modelId = values.model?.trim() || cfg.modelId;
  if (!cfg.token || !modelId) {
    console.error('[spike] set AWS_BEARER_TOKEN_BEDROCK and CHIVAGO_ASSIST_MODEL (or --model); CHIVAGO_ASSIST_REGION defaults to ap-southeast-1');
    return 1;
  }
  const token = cfg.token;
  const scratch = mkdtempSync(join(tmpdir(), 'chivago-spike-'));
  try {
    const photo = values.photo ?? samplePhoto(scratch);
    const images = [await ffmpegPrepare()(photo)];
    console.log(`[spike] ${modelId} in ${cfg.region} · ${values.photo ? photo : 'generated sand photo (no work on it)'} · ${images[0]!.length} bytes after re-encode`);

    // The real client, with fetch wrapped so a refusal can be read - the
    // client itself only ever reports the status.
    let failure: { status: number; body: string } | null = null;
    const teeFetch: typeof fetch = async (input, init) => {
      const res = await fetch(input, init);
      if (!res.ok) failure = { status: res.status, body: redact(await res.clone().text(), token) };
      return res;
    };
    const model = bedrockModel({ region: cfg.region, modelId, token, fetch: teeFetch });

    const quest = SEED_QUESTS.find((q) => q.code === 'BC-04')!;
    const c = await consult(model, { code: quest.code, name: quest.name, where: quest.where, weightKg: 4 }, images, {
      timeoutMs: 60_000, label: 'spike',
    });

    const f = failure as { status: number; body: string } | null;
    if (f) {
      console.log(`\n✖ HTTP ${f.status}\n${f.body.slice(0, 1200)}\n\n→ ${diagnose(f.status, f.body)}`);
      return 1;
    }
    if (c.error === 'timeout' || c.error === 'model_error') {
      console.log(`\n✖ ${c.error} with no HTTP answer - network, DNS, or a region name that does not exist`);
      return 1;
    }
    console.log('\n✔ auth    the key was accepted');
    console.log('✔ region  the model answered from this region');
    if (!c.assist) {
      console.log('✖ shape   the reply did not parse - the tool input was:');
      console.log(JSON.stringify(c.reply?.raw ?? null, null, 2));
      return 1;
    }
    console.log('✔ shape   Converse took the request and the forced tool came back parseable');
    const check = assistToCheck({ status: 'done', assist: c.assist });
    const sane = values.photo !== undefined || c.assist.work !== 'shown';
    console.log(`${sane ? '✔' : '✖'} sense   work=${c.assist.work} → console check "${check.status}"${values.photo ? '' : ' (an empty beach must not read as shown)'}`);
    console.log(`\n${JSON.stringify(c.assist, null, 2)}`);
    console.log(`\n${c.latencyMs} ms · ${c.attempts} call(s) · tokens in ${c.reply?.inputTokens ?? '?'} / out ${c.reply?.outputTokens ?? '?'}`);
    return sane ? 0 : 2;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

if (process.argv[1]?.endsWith('assist-spike.ts')) {
  // exitCode, not exit(): on Windows exit() races the fetch socket closing and
  // libuv aborts with 127, hiding the real answer.
  main().then((code) => { process.exitCode = code; }, (err) => {
    console.error(`[spike] ${redact((err as Error).message, process.env.AWS_BEARER_TOKEN_BEDROCK ?? '')}`);
    process.exitCode = 1;
  });
}

