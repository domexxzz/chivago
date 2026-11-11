import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Nothing from Node may reach the Worker.
 *
 * `worker.ts` is bundled for a runtime with no filesystem, no child
 * processes and no `node:sqlite`. An import that reaches any of those fails
 * at deploy or, worse, at the first request - and it would arrive the
 * ordinary way: somebody adds a helper to a service the Worker already
 * imports, and that helper reads a file.
 *
 * This walks the runtime import graph from the entry point and fails on the
 * first `node:` specifier, naming the path that got there. It is the same
 * argument as `game-surface.test.ts` on the mobile side: a rule in a comment
 * lasts until somebody is in a hurry, and this one has a whole platform
 * behind it.
 *
 * TYPE IMPORTS ARE NOT RUNTIME IMPORTS. `import type { DB } from './db.ts'`
 * is erased before the bundler sees it, so `migrations.ts` can keep naming
 * the Node driver's type without pulling the driver in. Only `import ...` and
 * `export ... from` count, which is why both forms are matched below.
 */

const SRC = dirname(fileURLToPath(import.meta.url));
const ENTRY = resolve(SRC, 'worker.ts');

/** Every runtime specifier in a file: `import … from 'x'` and `export … from 'x'`. */
const specifiers = (source: string): string[] => {
  const found: string[] = [];
  const re = /^(?:import|export)\s+(type\s+)?([\s\S]*?)\s+from\s+['"]([^'"]+)['"];/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const typeOnly = Boolean(m[1]);
    const clause = m[2] ?? '';
    const spec = m[3] ?? '';
    // `import { type A, type B }` is also erased; `import { type A, b }` is not.
    const names = clause.replace(/^[\s{]*|[\s}]*$/g, '').split(',').map((s) => s.trim()).filter(Boolean);
    const allTypes = names.length > 0 && names.every((n) => n.startsWith('type '));
    if (typeOnly || (clause.includes('{') && allTypes)) continue;
    found.push(spec);
  }
  return found;
};

/** Walks the graph. Returns the first path that reaches a `node:` module, or null. */
function reachesNode(entry: string): string[] | null {
  const seen = new Set<string>();
  const walk = (file: string, path: string[]): string[] | null => {
    if (seen.has(file)) return null;
    seen.add(file);
    let source: string;
    try { source = readFileSync(file, 'utf8'); } catch { return null; }
    for (const spec of specifiers(source)) {
      if (spec.startsWith('node:')) return [...path, spec];
      if (!spec.startsWith('.')) continue; // hono, @chivago/core and friends
      const next = resolve(dirname(file), spec);
      const found = walk(next, [...path, spec]);
      if (found) return found;
    }
    return null;
  };
  return walk(entry, ['worker.ts']);
}

describe('the Worker carries nothing from Node', () => {
  test('no runtime import from worker.ts reaches a node: module', () => {
    const path = reachesNode(ENTRY);
    assert.equal(
      path, null,
      `the Worker now reaches Node: ${path?.join(' -> ')}\n`
      + 'Either the new import belongs behind the Node driver, or it needs a '
      + 'Workers equivalent. See docs/74 for which of the two each remaining '
      + 'case is.',
    );
  });

  test('the walker can actually see a node: import', () => {
    // A guard that cannot fail protects nothing. `db.ts` is the Node driver
    // and must always trip this, or the walker above is lying.
    const path = reachesNode(resolve(SRC, 'db.ts'));
    assert.ok(path !== null, 'the walker found no Node import in the Node driver, so it is not walking');
  });

  test('a type-only import is not counted', () => {
    assert.deepEqual(specifiers("import type { DB } from './db.ts';"), []);
    assert.deepEqual(specifiers("import { type DB, type Row } from './db.ts';"), []);
    assert.deepEqual(specifiers("import { openDb } from './db.ts';"), ['./db.ts']);
    assert.deepEqual(specifiers("import { type DB, openDb } from './db.ts';"), ['./db.ts']);
  });
});
