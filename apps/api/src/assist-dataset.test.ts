import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

import {
  DERIVED_LABEL, SHOTS, deriveItems, mergeLabels, planManifest, shotListMarkdown,
  type PlannedManifest,
} from './assist-dataset.ts';
import { EVAL_KINDS, EVAL_MIN_ITEMS, validateManifest } from './assist-eval.ts';

/**
 * Building the eval set (docs/64) without inventing any of it: the plan says
 * what to shoot, people label what was shot, and only the variants whose
 * answer follows from how they were made are labelled by construction.
 */

describe('the plan', () => {
  test('asks for enough proofs, of every kind, once four genuine proofs have made their variants', () => {
    const planned = planManifest();
    // Once people have called the genuine ones ok and vouched for them.
    const labelled = planned.items.map((i) => (i.kind === 'genuine'
      ? { ...i, labels: { a: 'ok' as const, b: 'ok' as const }, consent: true } : i));
    const all = [...planned.items, ...deriveItems(labelled.slice(0, 4))];
    assert.ok(all.length >= EVAL_MIN_ITEMS, `${all.length} < ${EVAL_MIN_ITEMS}`);
    for (const kind of EVAL_KINDS.filter((k) => k !== 'other')) {
      assert.ok(all.some((i) => i.kind === kind), `no ${kind}`);
    }
  });

  test('every shot is one people must label and consent to - none arrives pre-labelled', () => {
    for (const item of planManifest().items) {
      assert.equal(item.labels, null, item.id);
      assert.equal(item.consent, false, item.id);
    }
  });

  test('so the eval refuses to run on the plan alone', () => {
    const { errors } = validateManifest(planManifest());
    assert.ok(errors.length > 0);
  });

  test('ids are unique and every quest is a real one', () => {
    const ids = SHOTS.map((s) => s.id);
    assert.equal(new Set(ids).size, ids.length);
    const withLabels = planManifest();
    for (const i of withLabels.items) {
      (i as { labels: unknown }).labels = { a: 'ok', b: 'ok' };
      (i as { consent: boolean }).consent = true;
    }
    assert.deepEqual(validateManifest(withLabels).errors, []);
  });

  test('the shot list a person prints names every shot, in Thai', () => {
    const md = shotListMarkdown();
    for (const s of SHOTS) assert.ok(md.includes(s.id), s.id);
    assert.match(md, /ถ่าย/);
  });
});

describe('derived variants', () => {
  const genuine = {
    id: 'bc-genuine-01', kind: 'genuine' as const, quest: 'BC-04', weightKg: 4,
    photos: ['bc-genuine-01a.jpg', 'bc-genuine-01b.jpg'],
    labels: { a: 'ok' as const, b: 'ok' as const }, consent: true as const,
  };

  test('three per genuine proof, each labelled by how it was made, and saying so', () => {
    const d = deriveItems([genuine]);
    assert.deepEqual(d.map((i) => [i.id, i.kind]), [
      ['bc-genuine-01-dup', 'same_photo_twice'],
      ['bc-genuine-01-over', 'weight_overclaim'],
      ['bc-genuine-01-inj', 'injection'],
    ]);
    for (const i of d) {
      assert.deepEqual(i.labels, { a: DERIVED_LABEL[i.kind as keyof typeof DERIVED_LABEL], b: DERIVED_LABEL[i.kind as keyof typeof DERIVED_LABEL] });
      assert.match(i.note ?? '', /by construction/);
    }
  });

  test('the duplicate sends the first photo twice; the overclaim multiplies the weight', () => {
    const [dup, over, inj] = deriveItems([genuine]);
    assert.deepEqual(dup!.photos, ['bc-genuine-01a.jpg', 'bc-genuine-01a.jpg']);
    assert.equal(over!.weightKg, 20);
    assert.deepEqual(over!.photos, genuine.photos);
    assert.deepEqual(inj!.photos, ['derived/bc-genuine-01-inj.jpg']);
  });

  test('a genuine proof with no weight claimed gets no overclaim - there is nothing to inflate', () => {
    const d = deriveItems([{ ...genuine, weightKg: null }]);
    assert.ok(!d.some((i) => i.kind === 'weight_overclaim'));
  });

  test('only a genuine proof people agreed was ok is a base for variants', () => {
    assert.deepEqual(deriveItems([{ ...genuine, labels: { a: 'ok', b: 'doubt' } }]), []);
    assert.deepEqual(deriveItems([{ ...genuine, labels: null } as never]), []);
    assert.deepEqual(deriveItems([{ ...genuine, consent: false } as never]), []);
  });
});

describe('merging the two people\'s labels', () => {
  const manifest = (): PlannedManifest => ({
    version: 1,
    items: [
      { id: 'a1', kind: 'genuine', quest: 'BC-04', weightKg: 4, photos: ['a1.jpg'], labels: null, consent: false },
      { id: 'a2', kind: 'no_work', quest: 'BC-04', weightKg: null, photos: ['a2.jpg'], labels: null, consent: false },
      { id: 'd1', kind: 'injection', quest: 'BC-04', weightKg: 4, photos: ['derived/d1.jpg'], labels: { a: 'doubt', b: 'doubt' }, consent: true },
    ],
  });

  test('each person\'s answer lands in their own slot, disagreement kept', () => {
    const { manifest: m, errors } = mergeLabels(manifest(), { a1: 'ok', a2: 'bad' }, { a1: 'doubt', a2: 'bad' });
    assert.deepEqual(errors, []);
    assert.deepEqual(m.items[0]!.labels, { a: 'ok', b: 'doubt' });
    assert.deepEqual(m.items[1]!.labels, { a: 'bad', b: 'bad' });
  });

  test('a label for an item that does not exist, or that is not a label, is an error', () => {
    const { errors } = mergeLabels(manifest(), { ghost: 'ok', a1: 'fine' as never }, {});
    assert.ok(errors.some((e) => e.includes('ghost')));
    assert.ok(errors.some((e) => e.includes('a1')));
  });

  test('a constructed label is never overwritten by a person', () => {
    const { manifest: m, errors } = mergeLabels(manifest(), { d1: 'ok' }, {});
    assert.deepEqual(m.items[2]!.labels, { a: 'doubt', b: 'doubt' });
    assert.ok(errors.some((e) => e.includes('d1')));
  });

  test('an item only one person labelled stays unlabelled, so the eval will say so', () => {
    const { manifest: m } = mergeLabels(manifest(), { a1: 'ok' }, {});
    assert.equal(m.items[0]!.labels, null);
  });

  test('merging does not touch consent - that is a fact about people, not a label', () => {
    const { manifest: m } = mergeLabels(manifest(), { a1: 'ok' }, { a1: 'ok' });
    assert.equal(m.items[0]!.consent, false);
  });
});
