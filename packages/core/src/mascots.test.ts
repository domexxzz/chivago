import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

import { BASIS_LABEL, MASCOTS, MASCOT_COUNT, mascotFor, mascotSignature } from './mascots.ts';
import { PROVINCES, PROVINCE_COUNT } from './provinces.ts';

/**
 * Seventy-seven emblems, held to being seventy-seven different things.
 */

const THAI_PROVINCES_AS_SET = new Set(PROVINCES.map((p) => p.code));

describe('one mascot per province', () => {
  test('every province has exactly one, and every mascot has a province', () => {
    assert.equal(MASCOT_COUNT, PROVINCE_COUNT);
    const codes = MASCOTS.map((m) => m.code);
    assert.equal(new Set(codes).size, codes.length, 'a province appears twice');
    for (const p of PROVINCES) assert.ok(mascotFor(p.code), `${p.name.en} (${p.code}) has no mascot`);
    for (const m of MASCOTS) assert.ok(THAI_PROVINCES_AS_SET.has(m.code), `${m.key} names a province that does not exist`);
  });

  test('keys and names are unique, and bilingual', () => {
    const keys = MASCOTS.map((m) => m.key);
    assert.equal(new Set(keys).size, keys.length);
    const names = MASCOTS.map((m) => m.name.en.toLowerCase());
    assert.equal(new Set(names).size, names.length, 'two mascots share a name');
    for (const m of MASCOTS) {
      for (const b of [m.name, m.creature, m.why]) {
        assert.ok(b.en.trim() && b.th.trim(), `${m.key} is missing a language`);
        assert.match(b.th, /[฀-๿]/, `${m.key}: the Thai side is not Thai`);
      }
    }
  });
});

describe('no two are the same creature', () => {
  test('the signature - body, outline, crest, colour - differs between every pair', () => {
    const seen = new Map<string, string>();
    for (const m of MASCOTS) {
      const sig = mascotSignature(m);
      assert.ok(!seen.has(sig), `${m.key} is the same creature as ${seen.get(sig)} (${sig})`);
      seen.set(sig, m.key);
    }
  });

  test('every archetype is used, and none is most of the collection', () => {
    const counts = new Map<string, number>();
    for (const m of MASCOTS) counts.set(m.archetype, (counts.get(m.archetype) ?? 0) + 1);
    for (const a of ['bird', 'beast', 'sea', 'naga', 'bug', 'sprite', 'ape', 'shell']) {
      assert.ok((counts.get(a) ?? 0) >= 2, `archetype ${a} is barely used`);
    }
    for (const [a, n] of counts) assert.ok(n < MASCOT_COUNT / 2, `${a} is ${n} of ${MASCOT_COUNT}: half the collection is one body`);
  });
});

describe('what it says about itself', () => {
  test('every basis has a label in both languages, and every mascot has a basis', () => {
    for (const m of MASCOTS) assert.ok(BASIS_LABEL[m.basis], `${m.key}: basis ${m.basis} has no label`);
    for (const label of Object.values(BASIS_LABEL)) assert.ok(label.en && label.th);
  });

  test('no mascot wears the evidence green', () => {
    // Green means a host verified something. A mascot is an emblem.
    const evidence = ['#25874c', '#1f7a44', '#175c33', '#0e3d21', '#3faa6d'];
    for (const m of MASCOTS) {
      for (const [part, hex] of Object.entries(m.colours)) {
        assert.match(hex, /^#[0-9a-f]{6}$/i, `${m.key}.${part} is not a hex colour`);
        assert.ok(!evidence.includes(hex.toLowerCase()), `${m.key}.${part} wears the evidence green`);
      }
    }
  });

  test('the Samui species are not replaced: the mascot for Surat Thani is an emblem, not an animal claim', () => {
    const surat = mascotFor('TH-84')!;
    assert.equal(surat.basis, 'produce');
    assert.notEqual(surat.archetype, 'ape', 'the langur stays a species, not a mascot');
  });
});
