import { strict as assert } from 'node:assert';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const root = process.cwd();
const apiRoot = join(root, 'apps/api/src');
const registry = readFileSync(join(root, 'apps/mobile/src/i18n/api-errors.ts'), 'utf8');

const sourceFiles = [];
const walk = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) sourceFiles.push(path);
  }
};
walk(apiRoot);

test('every static backend error code has an exact mobile translation entry', () => {
  const codes = new Set();
  const patterns = [
    /\bfail\([^\n]*?'([A-Z][A-Z0-9_]+)'/g,
    /new\s+\w*Error\(\s*'([A-Z][A-Z0-9_]+)'/g,
  ];
  for (const file of sourceFiles) {
    const source = readFileSync(file, 'utf8');
    for (const pattern of patterns) for (const match of source.matchAll(pattern)) codes.add(match[1]);
  }
  assert.ok(codes.size > 0, 'contract scan found no backend error codes');
  const missing = [...codes].filter((code) => !new RegExp(`^\\s{2}${code}:`, 'm').test(registry));
  assert.deepEqual(missing, [], `mobile API error registry is missing: ${missing.join(', ')}`);
});
