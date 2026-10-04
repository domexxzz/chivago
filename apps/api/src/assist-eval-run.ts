/**
 * pnpm --filter @chivago/api assist:eval
 *
 * Runs the labelled proofs in eval/assist/ through the same `consult` the
 * console path uses - photos through the ffmpeg door, Claude on Bedrock -
 * and prints the report docs/64 asks for. Results and the report are kept
 * in eval/assist/results/ so two models can be put side by side.
 *
 *   --dry-run            check the manifest and that every photo exists; no calls
 *   --model <id>         override CHIVAGO_ASSIST_MODEL, to compare models
 *   --limit <n>          only the first n proofs
 *   --price-in <usd>     USD per million input tokens  } from the Bedrock price
 *   --price-out <usd>    USD per million output tokens } page on the day; with
 *   --thb-per-usd <n>    the exchange rate             } all three, cost in baht
 *   --dir <path>         default eval/assist
 *
 * Needs AWS_BEARER_TOKEN_BEDROCK and a model id; CHIVAGO_ASSIST need not be on,
 * because running an eval is itself the explicit choice to call the model.
 *
 * Exit: 0 ships, 2 does not ship, 1 could not run.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import {
  ASSIST_PROMPT_VERSION, SEED_QUESTS, assistToCheck,
} from '@chivago/core';
import { assistConfig, consult, ffmpegPrepare, type AssistModel } from './assist-service.ts';
import { bedrockModel } from './bedrock.ts';
import {
  renderReport, score, validateManifest, type EvalItem, type EvalResult, type Prices,
} from './assist-eval.ts';

export interface RunDeps {
  model: AssistModel;
  prepare: (path: string) => Promise<Buffer>;
  photoDir: string;
  timeoutMs?: number;
  onProgress?: (done: number, total: number, r: EvalResult) => void;
}

/**
 * One proof at a time. Slower than a burst, and kinder to a quota that the
 * console shares; forty proofs take a few minutes.
 */
export async function runEval(items: EvalItem[], deps: RunDeps): Promise<EvalResult[]> {
  const results: EvalResult[] = [];
  for (const item of items) {
    const quest = SEED_QUESTS.find((q) => q.code === item.quest)!;
    let result: EvalResult;
    try {
      const images = await Promise.all(item.photos.map((p) => deps.prepare(join(deps.photoDir, p))));
      const c = await consult(deps.model, {
        code: quest.code, name: quest.name, where: quest.where, weightKg: item.weightKg,
      }, images, { timeoutMs: deps.timeoutMs, label: item.id });
      const check = c.assist ? assistToCheck({ status: 'done', assist: c.assist }) : null;
      result = {
        id: item.id,
        check: check?.status ?? 'unknown',
        concerns: c.assist?.concerns ?? [],
        error: c.error,
        latencyMs: c.latencyMs,
        inputTokens: c.reply?.inputTokens ?? null,
        outputTokens: c.reply?.outputTokens ?? null,
      };
    } catch (err) {
      console.error(`[eval] ${item.id}: ${(err as Error).message}`);
      result = {
        id: item.id, check: 'unknown', concerns: [], error: 'prepare_failed',
        latencyMs: null, inputTokens: null, outputTokens: null,
      };
    }
    results.push(result);
    deps.onProgress?.(results.length, items.length, result);
  }
  return results;
}

function num(v: string | undefined, name: string): number | undefined {
  if (v === undefined) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw new Error(`--${name} must be a non-negative number`);
  return n;
}

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      'dry-run': { type: 'boolean', default: false },
      model: { type: 'string' },
      limit: { type: 'string' },
      'price-in': { type: 'string' },
      'price-out': { type: 'string' },
      'thb-per-usd': { type: 'string' },
      dir: { type: 'string', default: 'eval/assist' },
    },
  });
  const dir = resolve(values.dir!);
  const photoDir = join(dir, 'photos');
  const manifestPath = join(dir, 'manifest.json');
  if (!existsSync(manifestPath)) {
    console.error(`[eval] no ${manifestPath} - copy manifest.example.json and fill it in (see README.md there)`);
    return 1;
  }

  const { items: all, errors } = validateManifest(JSON.parse(readFileSync(manifestPath, 'utf8')));
  for (const item of all) {
    for (const p of item.photos) {
      if (!existsSync(join(photoDir, p))) errors.push(`${item.id}: photo not found: photos/${p}`);
    }
  }
  if (errors.length > 0) {
    console.error(`[eval] manifest has ${errors.length} problem(s):\n  ${errors.join('\n  ')}`);
    return 1;
  }
  const limit = num(values.limit, 'limit');
  const items = limit === undefined ? all : all.slice(0, limit);
  console.log(`[eval] ${items.length} proofs, ${items.reduce((n, i) => n + i.photos.length, 0)} photos`);
  if (values['dry-run']) {
    console.log('[eval] dry run: manifest and photos are in order; no model was called');
    return 0;
  }

  const cfg = assistConfig(process.env);
  const modelId = values.model?.trim() || cfg.modelId;
  if (!modelId || !cfg.token) {
    console.error('[eval] need AWS_BEARER_TOKEN_BEDROCK and a model (--model or CHIVAGO_ASSIST_MODEL)');
    return 1;
  }
  const pIn = num(values['price-in'], 'price-in');
  const pOut = num(values['price-out'], 'price-out');
  const rate = num(values['thb-per-usd'], 'thb-per-usd');
  const prices: Prices | undefined =
    pIn !== undefined && pOut !== undefined && rate !== undefined
      ? { usdPerMInput: pIn, usdPerMOutput: pOut, thbPerUsd: rate }
      : undefined;

  console.log(`[eval] ${modelId} in ${cfg.region}`);
  const results = await runEval(items, {
    model: bedrockModel({ region: cfg.region, modelId, token: cfg.token }),
    prepare: ffmpegPrepare(),
    photoDir,
    onProgress: (done, total, r) =>
      console.log(`[eval] ${done}/${total} ${r.id}: ${r.check}${r.error ? ` (${r.error})` : ''}`),
  });

  const s = score(items, results, prices);
  const ranAt = new Date().toISOString();
  const report = renderReport(s, { modelId, ranAt, promptVersion: ASSIST_PROMPT_VERSION });
  const outDir = join(dir, 'results');
  mkdirSync(outDir, { recursive: true });
  const stem = `${ranAt.replace(/[:.]/g, '-')}-${modelId.replace(/[^a-zA-Z0-9.-]+/g, '_')}`;
  writeFileSync(join(outDir, `${stem}.json`), JSON.stringify({
    modelId, region: cfg.region, ranAt, promptVersion: ASSIST_PROMPT_VERSION, prices: prices ?? null, results, score: s,
  }, null, 2));
  writeFileSync(join(outDir, `${stem}.md`), report);
  console.log(`\n${report}\n[eval] saved results/${stem}.{json,md}`);
  return s.ship ? 0 : 2;
}

// Run as a script, not when a test imports runEval.
if (process.argv[1]?.endsWith('assist-eval-run.ts')) {
  // exitCode, not exit(): on Windows exit() races the fetch socket closing and
  // libuv aborts with 127, hiding the real answer.
  main().then((code) => { process.exitCode = code; }, (err) => {
    console.error(`[eval] ${(err as Error).message}`);
    process.exitCode = 1;
  });
}
