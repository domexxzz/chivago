/*
  No fetch in code that ships to the Worker may ask for `redirect: 'error'`.

  It is a valid value in Node and workerd REFUSES it - "Invalid redirect value,
  must be one of "follow" or "manual"" - before the request ever leaves. Every
  test in this repository runs on Node, so a call written that way passes every
  test and throws on every production request. It has happened three times:

    - 17 Nov: Chivar Bot fell back to rules on every message (groq-concierge.ts)
    - 18 Nov: the coastal current was `unavailable` from the day it shipped
    - 18 Nov: weather, courts, stalls and the LINE login token exchange,
              found only because a production log line named weather

  Each time the fix was one word, and each time it was not carried to the
  other files that had the same line. This test is the carrying.

  Use `redirect: 'manual'` and keep the `if (!res.ok) throw` after it: a 3xx
  comes back as a response whose `ok` is false, so the redirect is still
  refused - just by our code instead of by a runtime that will not do it.
*/
import { strict as assert } from 'node:assert';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { test } from 'node:test';

const root = process.cwd();

/** Everything bundled into the Worker: the API and the packages it imports. */
const SHIPPED_ROOTS = [
  'apps/api/src',
  ...readdirSync(join(root, 'packages'), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => `packages/${d.name}/src`)
    .filter((p) => existsSync(join(root, p))),
];

const sourceFiles = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const path = join(dir, entry.name);
  if (entry.isDirectory()) return sourceFiles(path);
  return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [path] : [];
});

/*
  Comments are removed first, because the files that were fixed explain the
  bug in prose and a guard that fails on its own documentation would be
  turned off by the first person it annoyed.

  Only WHOLE-LINE `//` comments go. A `//` after code on the same line is left
  alone, since that is also how 'https://...' looks inside a string, and
  stripping from there would hide a `redirect: 'error'` later on the line.
*/
export const withoutComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

const REFUSED = /redirect\s*:\s*(['"`])error\1/;

export const asksForRefusedRedirect = (source) => REFUSED.test(withoutComments(source));

test('the detector catches the call and ignores the explanation', () => {
  assert.equal(asksForRefusedRedirect(`await fetch(url, { redirect: 'error' });`), true);
  assert.equal(asksForRefusedRedirect(`fetch(u, {\n  redirect: "error",\n})`), true);
  assert.equal(asksForRefusedRedirect(`fetch('https://x.example', { redirect: 'error' })`), true,
    'a URL on the same line must not hide the call');
  assert.equal(asksForRefusedRedirect(`/* \`redirect: 'error'\` is refused at the edge */`), false);
  assert.equal(asksForRefusedRedirect(`  // never use redirect: 'error' here`), false);
  assert.equal(asksForRefusedRedirect(`await fetch(url, { redirect: 'manual' });`), false);
});

test("no shipped fetch asks for redirect: 'error', which the edge refuses", () => {
  const offenders = SHIPPED_ROOTS
    .flatMap((dir) => sourceFiles(join(root, dir)))
    .filter((file) => asksForRefusedRedirect(readFileSync(file, 'utf8')))
    .map((file) => relative(root, file).replaceAll('\\', '/'));
  assert.deepEqual(offenders, [],
    `workerd refuses redirect: 'error' and throws before the request leaves. Use 'manual' and keep the !res.ok check:\n  ${offenders.join('\n  ')}`);
});
