import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { runEval } from './assist-eval-run.ts';
import type { AssistModel } from './assist-service.ts';
import type { EvalItem } from './assist-eval.ts';

/** The glue between the manifest and `consult`, against a scripted model. */

const item = (id: string, over: Partial<EvalItem> = {}): EvalItem => ({
  id, kind: 'genuine', quest: 'BC-04', weightKg: 4, photos: [`${id}.jpg`],
  labels: { a: 'ok', b: 'ok' }, consent: true, ...over,
});

const answer = (over: Record<string, unknown> = {}) => ({
  work: 'shown', weight: 'consistent', concerns: [], suggestedReason: null, photos: [],
  summary: { en: 'Bags on a beach.', th: 'ถุงขยะบนหาด' }, ...over,
});

test('each proof becomes the console check its answer would, with its cost', async () => {
  const seen: string[] = [];
  const model: AssistModel = {
    id: 'fake',
    run: async (req) => {
      seen.push(req.user);
      const inj = req.user.includes('Mangrove');
      return {
        raw: inj ? answer({ concerns: ['text_instructions'] }) : answer(),
        inputTokens: 1000, outputTokens: 100,
      };
    },
  };
  const results = await runEval(
    [item('a'), item('b', { quest: 'MG-11', kind: 'injection' })],
    { model, prepare: async (p) => Buffer.from(p), photoDir: '/eval/photos' },
  );
  assert.deepEqual(results.map((r) => [r.id, r.check, r.concerns]), [
    ['a', 'pass', []],
    ['b', 'warn', ['text_instructions']],
  ]);
  assert.equal(results[0]!.inputTokens, 1000);
  // The quest is named from the seed, in both languages, for the model.
  assert.match(seen[0]!, /Beach Cleanup \/ เก็บขยะชายหาด/);
});

test('photos are read from the photo folder', async () => {
  const paths: string[] = [];
  const model: AssistModel = { id: 'fake', run: async () => ({ raw: answer(), inputTokens: 1, outputTokens: 1 }) };
  await runEval([item('a', { photos: ['beach/1.jpg', 'beach/2.jpg'] })], {
    model, prepare: async (p) => { paths.push(p.replace(/\\/g, '/')); return Buffer.from('x'); },
    photoDir: '/eval/photos',
  });
  assert.deepEqual(paths, ['/eval/photos/beach/1.jpg', '/eval/photos/beach/2.jpg']);
});

test('a photo that will not encode is "unknown" for that proof, and the run goes on', async () => {
  const model: AssistModel = { id: 'fake', run: async () => ({ raw: answer(), inputTokens: 1, outputTokens: 1 }) };
  const results = await runEval([item('broken'), item('fine')], {
    model,
    prepare: async (p) => { if (p.includes('broken')) throw new Error('ffmpeg exited 1'); return Buffer.from('x'); },
    photoDir: '/eval/photos',
  });
  assert.deepEqual(results.map((r) => [r.id, r.check, r.error]), [
    ['broken', 'unknown', 'prepare_failed'],
    ['fine', 'pass', null],
  ]);
});

test('an answer that does not parse is "unknown", never a guessed pass', async () => {
  const model: AssistModel = { id: 'fake', run: async () => ({ raw: { work: 'approved' }, inputTokens: 1, outputTokens: 1 }) };
  const [r] = await runEval([item('a')], { model, prepare: async () => Buffer.from('x'), photoDir: '/p' });
  assert.equal(r!.check, 'unknown');
  assert.equal(r!.error, 'bad_answer');
});
