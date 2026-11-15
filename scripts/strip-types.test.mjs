/**
 * TypeScript this repository is allowed to WRITE, and TypeScript Node can RUN.
 *
 * Everything here executes under `node --experimental-strip-types`: the API
 * server, the core package's tests, the mobile harness. Strip-only mode
 * ERASES types. It does not compile them. So a construct that needs code
 * EMITTED for it is valid TypeScript, passes `tsc --noEmit` without a
 * murmur, and then takes the process down at import time.
 *
 * That is exactly how it got in. A parameter property reached
 * `apps/api/src/summon-service.ts`:
 *
 *     constructor(readonly category: SummonCategory, ...)
 *
 * `pnpm typecheck` was green. The API server died at boot with
 *
 *     SyntaxError [ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX]:
 *     TypeScript parameter property is not supported in strip-only mode
 *
 * and stayed down - not that one route, the whole server, because the file
 * cannot be loaded at all. The typechecker is the wrong instrument for this
 * class of bug, which is why the check lives here instead.
 *
 * WHAT IS FORBIDDEN, and the one-line replacement for each:
 *
 *   - parameter properties  ->  declare the field, assign it in the body
 *   - enum / const enum     ->  `as const` object, or a union of literals
 *   - namespace / module    ->  a module, which is what files already are
 *
 * This greps source rather than parsing it, so it is deliberately strict
 * about shape. COMMENTS ARE STRIPPED FIRST, which is not fussiness: the
 * first version of this file flagged `summon-service.ts` for the example
 * written in the comment that explains the rule. A guard that fails on
 * prose about itself is a guard somebody deletes.
 *
 * A false positive still costs only a rename; a false negative costs the
 * server.
 */

import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROOTS = ['apps/api/src', 'apps/mobile/src', 'packages/core/src'];

/**
 * The file with its comments blanked out, newlines kept so line numbers in
 * a failure still point at the real line.
 *
 * Crude on purpose - it does not know a `//` inside a string literal from a
 * real comment - but it is looking for declarations, and a declaration does
 * not live inside a string.
 */
const blank = (s) => s.replace(/[^\n]/g, ' ');
const code = (text) => text
  .replace(/\/\*[\s\S]*?\*\//g, blank)
  // `[^:]` before the slashes so a `https://` inside a string survives.
  .replace(/(^|[^:])\/\/[^\n]*/gm, (m, p) => p + blank(m.slice(p.length)));

/** Every .ts/.tsx file under the directories Node actually executes. */
function sources() {
  const found = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // a package that is not checked out is not a failure here
    }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules') continue;
        walk(path);
      } else if (/\.tsx?$/.test(entry.name)) {
        found.push({ path: relative(ROOT, path), text: code(readFileSync(path, 'utf8')) });
      }
    }
  };
  for (const r of ROOTS) walk(join(ROOT, r));
  return found;
}

/**
 * A constructor whose parameter list carries an accessibility or `readonly`
 * modifier. Matched across lines, because a long signature is wrapped.
 */
const PARAMETER_PROPERTY = /constructor\s*\([^)]*\b(?:readonly|private|public|protected)\s+\w/s;
const ENUM = /^\s*(?:export\s+)?(?:declare\s+)?(?:const\s+)?enum\s+\w/m;
const NAMESPACE = /^\s*(?:export\s+)?(?:declare\s+)?namespace\s+\w/m;

const hits = (pattern) => sources()
  .filter(({ text }) => pattern.test(text))
  .map(({ path, text }) => {
    const line = text.split('\n').findIndex((l) => pattern.test(l)) + 1;
    return line > 0 ? `${path}:${line}` : path;
  });

describe('every source file can be run by node --experimental-strip-types', () => {
  test('it reads the directories it is meant to guard', () => {
    // A guard that silently read nothing would pass for ever.
    const files = sources();
    assert.ok(files.length > 200, `only ${files.length} source files were read`);
    assert.ok(files.some((f) => f.path.includes('summon-service')), 'the API was not read');
    assert.ok(files.some((f) => f.path.includes('WalletScreen')), 'the app was not read');
  });

  test('NO PARAMETER PROPERTIES — they need emitted code, and take the server down at boot', () => {
    const found = hits(PARAMETER_PROPERTY);
    assert.deepEqual(
      found, [],
      `declare the field and assign it in the constructor body instead:\n  ${found.join('\n  ')}`,
    );
  });

  test('no enums — use an `as const` object or a union of string literals', () => {
    const found = hits(ENUM);
    assert.deepEqual(found, [], `enum is not erasable:\n  ${found.join('\n  ')}`);
  });

  test('no namespaces — a file is already a module', () => {
    const found = hits(NAMESPACE);
    assert.deepEqual(found, [], `namespace is not erasable:\n  ${found.join('\n  ')}`);
  });
});
