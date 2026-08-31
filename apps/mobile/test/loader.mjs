/**
 * Enough of a bundler to render a screen.
 *
 * Every screen in this app went untested because there was no way to render
 * one outside Metro, and docs/21-walking-the-app.md is the bill for that: five
 * real bugs found by opening the app by hand, three of them plain wrong text
 * that any render-and-read test would have caught.
 *
 * `react-native` resolves to `react-native-web` — the real package ships
 * Flow-typed source node cannot parse, while `react-native-web` is already a
 * dependency, renders through `react-dom/server` with no DOM at all, and
 * produces the same component tree the device runs. `.tsx` goes through
 * sucrase, because node strips TypeScript types but does not transform JSX.
 *
 * WHAT THIS DOES NOT TEST: gestures, native modules, layout, fonts, safe areas,
 * or anything a real device does differently. It tests what a screen SAYS,
 * which is where every text bug in that document lived.
 *
 * See register.mjs for why the synchronous hooks are needed as well.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { transform } from 'sucrase';

import { stubFor } from './stubs.mjs';

/** Stub imports resolve relative to this directory, not the importer. */
const STUB_BASE = import.meta.url;

export function resolve(specifier, context, next) {
  // Not react-native-web directly: see stubs/react-native.mjs for the one
  // substitution that shim makes, and why a sheet is invisible without it.
  if (specifier === 'react-native') {
    return next('./stubs/react-native.mjs', { ...context, parentURL: STUB_BASE });
  }
  const stub = stubFor(specifier);
  if (stub) return next(stub, { ...context, parentURL: STUB_BASE });
  return next(specifier, context);
}

export async function load(url, context, next) {
  if (url.endsWith('.tsx')) {
    const path = fileURLToPath(url);
    const { code } = transform(await readFile(path, 'utf8'), {
      transforms: ['typescript', 'jsx'],
      jsxRuntime: 'automatic',
      filePath: path,
    });
    return { format: 'module', shortCircuit: true, source: code };
  }
  return next(url, context);
}
