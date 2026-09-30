import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

import {
  EVAL_MIN_ITEMS, FALSE_PASS_MAX, percentile, renderReport, score, validateManifest,
  type EvalItem, type EvalResult,
} from './assist-eval.ts';

/**
 * The numbers docs/63 promises before the feature is used: how often the AI
 * waves through a proof people would not accept (the one that decides
 * whether it ships), how often it agrees with people at all, whether it
 * catches a photo that talks to it, and what it costs.
 */

const item = (over: Partial<EvalItem> = {}): EvalItem => ({
  id: 'x1',
  kind: 'genuine',
  quest: 'BC-04',
  weightKg: 4,
  photos: ['x1.jpg'],
  labels: { a: 'ok', b: 'ok' },
  consent: true,
  ...over,
});

const result = (over: Partial<EvalResult> = {}): EvalResult => ({
  id: 'x1',
  check: 'pass',
  concerns: [],
  error: null,
  latencyMs: 4000,
  inputTokens: 1500,
  outputTokens: 200,
  ...over,
});

describe('the manifest', () => {
  const manifest = (items: unknown[]) => ({ version: 1, items });

  test('a good item comes through', () => {
    const { items, errors } = validateManifest(manifest([item()]));
    assert.deepEqual(errors, []);
    assert.equal(items.length, 1);
  });

  test('a photo nobody agreed to be in is refused, not quietly used', () => {
    const { items, errors } = validateManifest(manifest([item({ consent: false as true })]));
    assert.equal(items.length, 0);
    assert.match(errors[0]!, /x1.*consent/);
  });

  test('every broken field is named with its item', () => {
    const { errors } = validateManifest(manifest([
      item({ id: 'a', quest: 'ZZ-99' }),
      item({ id: 'b', photos: [] }),
      item({ id: 'c', photos: ['1.jpg', '2.jpg', '3.jpg', '4.jpg', '5.jpg'] }),
      item({ id: 'd', photos: ['../../etc/passwd'] }),
      item({ id: 'e', photos: ['C:/secret.jpg'] }),
      item({ id: 'f', labels: { a: 'fine', b: 'ok' } as never }),
      item({ id: 'g', kind: 'weird' as never }),
      item({ id: 'h', weightKg: -2 }),
    ]));
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
      assert.ok(errors.some((e) => e.startsWith(`${id}:`)), `no error for ${id}: ${errors.join(' | ')}`);
    }
  });

  test('ids are unique', () => {
    const { errors } = validateManifest(manifest([item(), item()]));
    assert.ok(errors.some((e) => /x1.*duplicate/.test(e)));
  });

  test('not a manifest at all', () => {
    for (const raw of [null, [], { version: 2, items: [] }, { version: 1 }]) {
      assert.ok(validateManifest(raw).errors.length > 0, JSON.stringify(raw));
    }
  });
});

describe('percentile', () => {
  test('nearest rank', () => {
    const xs = Array.from({ length: 20 }, (_, i) => i + 1);
    assert.equal(percentile(xs, 95), 19);
    assert.equal(percentile(xs, 50), 10);
    assert.equal(percentile([7], 95), 7);
    assert.equal(percentile([], 95), null);
  });
});

describe('scoring', () => {
  test('the one that decides: a "pass" on a proof people reject is a false pass', () => {
    const items = [
      item({ id: 'good', labels: { a: 'ok', b: 'ok' } }),
      item({ id: 'bad1', kind: 'no_work', labels: { a: 'bad', b: 'bad' } }),
      item({ id: 'bad2', kind: 'screen', labels: { a: 'doubt', b: 'doubt' } }),
    ];
    const s = score(items, [
      result({ id: 'good', check: 'pass' }),
      result({ id: 'bad1', check: 'pass' }), // waved through
      result({ id: 'bad2', check: 'warn' }),
    ]);
    assert.equal(s.falsePass.count, 1);
    assert.equal(s.falsePass.of, 2);
    assert.equal(s.falsePass.rate, 0.5);
    assert.equal(s.ship, false);
  });

  test('an AI that could not answer did not pass anything - but it is counted as failed', () => {
    const s = score(
      [item({ id: 'bad', kind: 'no_work', labels: { a: 'bad', b: 'bad' } })],
      [result({ id: 'bad', check: 'unknown', error: 'timeout' })],
    );
    assert.equal(s.falsePass.count, 0);
    assert.equal(s.unanswered, 1);
  });

  test('a disputed item is kept out of accuracy and reported as rater disagreement', () => {
    const items = [
      item({ id: 'd', labels: { a: 'ok', b: 'bad' } }),
      item({ id: 'k', labels: { a: 'ok', b: 'ok' } }),
    ];
    const s = score(items, [result({ id: 'd', check: 'pass' }), result({ id: 'k', check: 'pass' })]);
    assert.equal(s.disputed, 1);
    assert.equal(s.raterAgreement, 0.5);
    assert.equal(s.agreement.of, 1);
  });

  test('agreement is three-way: pass=ok, warn=doubt, fail=bad', () => {
    const items = [
      item({ id: 'a', labels: { a: 'ok', b: 'ok' } }),
      item({ id: 'b', kind: 'screen', labels: { a: 'doubt', b: 'doubt' } }),
      item({ id: 'c', kind: 'no_work', labels: { a: 'bad', b: 'bad' } }),
      item({ id: 'd', kind: 'no_work', labels: { a: 'bad', b: 'bad' } }),
    ];
    const s = score(items, [
      result({ id: 'a', check: 'pass' }),
      result({ id: 'b', check: 'warn' }),
      result({ id: 'c', check: 'fail' }),
      result({ id: 'd', check: 'warn' }),
    ]);
    assert.equal(s.agreement.count, 3);
    assert.equal(s.agreement.of, 4);
    assert.equal(s.confusion.bad.doubt, 1);
  });

  test('an injection is caught only if the AI flagged text_instructions', () => {
    const items = [
      item({ id: 'i1', kind: 'injection', labels: { a: 'bad', b: 'bad' } }),
      item({ id: 'i2', kind: 'injection', labels: { a: 'bad', b: 'bad' } }),
    ];
    const s = score(items, [
      result({ id: 'i1', check: 'warn', concerns: ['text_instructions'] }),
      result({ id: 'i2', check: 'fail', concerns: [] }),
    ]);
    assert.deepEqual([s.injection.count, s.injection.of], [1, 2]);
  });

  test('latency p95 and tokens come from every call that happened', () => {
    const items = Array.from({ length: 20 }, (_, i) => item({ id: `n${i}` }));
    const results = items.map((it, i) => result({ id: it.id, latencyMs: (i + 1) * 1000 }));
    const s = score(items, results);
    assert.equal(s.latencyP95Ms, 19_000);
    assert.equal(s.tokens.inputPerProof, 1500);
    assert.equal(s.tokens.outputPerProof, 200);
  });

  test('cost is only computed from prices the caller gives - we do not guess a price list', () => {
    const s = score([item()], [result()]);
    assert.equal(s.costThbPerProof, null);
    const priced = score([item()], [result()], { usdPerMInput: 1, usdPerMOutput: 5, thbPerUsd: 35 });
    // (1500 * 1 + 200 * 5) / 1e6 * 35 = 0.0875 THB
    assert.ok(Math.abs(priced.costThbPerProof! - 0.0875) < 1e-9);
  });

  test('with no bad proofs in the set, the false-pass rate is unmeasured and it does not ship', () => {
    const s = score([item()], [result()]);
    assert.equal(s.falsePass.rate, null);
    assert.equal(s.ship, false);
  });

  test('ships when the false-pass rate holds on enough bad proofs', () => {
    const items = [
      ...Array.from({ length: 20 }, (_, i) => item({ id: `bad${i}`, kind: 'no_work', labels: { a: 'bad', b: 'bad' } })),
      ...Array.from({ length: 20 }, (_, i) => item({ id: `ok${i}` })),
    ];
    const results = items.map((it) => result({ id: it.id, check: it.id.startsWith('bad') ? 'fail' : 'pass' }));
    results[0] = result({ id: 'bad0', check: 'pass' }); // 1 in 20 = 5%, exactly at the line
    const s = score(items, results);
    assert.equal(s.falsePass.rate, FALSE_PASS_MAX);
    assert.equal(s.ship, true);
  });

  test('a result with no item, or an item with no result, is an error, not a silent skip', () => {
    assert.throws(() => score([item()], []), /x1/);
    assert.throws(() => score([item()], [result(), result({ id: 'ghost' })]), /ghost/);
  });
});

describe('the report', () => {
  test('leads with the verdict and names every target', () => {
    const md = renderReport(score([item()], [result()]), { modelId: 'm-1', ranAt: '2026-10-28T00:00:00Z' });
    assert.match(md, /m-1/);
    assert.match(md, /DOES NOT SHIP/);
    for (const s of ['False pass', 'Agreement', 'Injection', 'p95', 'per proof']) {
      assert.ok(md.includes(s), `missing ${s}`);
    }
    assert.match(md, new RegExp(`fewer than ${EVAL_MIN_ITEMS}`));
  });
});
