import { readFileSync } from 'node:fs';
import { register, registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { transform } from 'sucrase';

import { stubFor } from './stubs.mjs';

const here = pathToFileURL(`${import.meta.dirname}/`);

/** Stub imports resolve relative to this directory, not the importer. */
const STUB_BASE = import.meta.url;

/**
 * BOTH hook APIs, deliberately.
 *
 * `register` handles ESM. `registerHooks` is synchronous and is the only one
 * that sees CommonJS `require` — and the app reaches `react-native` through a
 * CJS require inside `react-native-svg`, so the async hook alone leaves the
 * real Flow-typed package to load and fail to parse.
 */
register('./loader.mjs', here);

const resolveSync = (specifier, context, next) => {
  // Not react-native-web directly: see stubs/react-native.mjs for the one
  // substitution that shim makes, and why a sheet is invisible without it.
  if (specifier === 'react-native') {
    return next('./stubs/react-native.mjs', { ...context, parentURL: STUB_BASE });
  }
  const stub = stubFor(specifier);
  if (stub) return next(stub, { ...context, parentURL: STUB_BASE });
  return next(specifier, context);
};

const loadSync = (url, context, next) => {
  if (url.endsWith('.tsx')) {
    const path = fileURLToPath(url);
    const { code } = transform(readFileSync(path, 'utf8'), {
      transforms: ['typescript', 'jsx'],
      jsxRuntime: 'automatic',
      filePath: path,
    });
    return { format: 'module', shortCircuit: true, source: code };
  }
  return next(url, context);
};

registerHooks({ resolve: resolveSync, load: loadSync });

/**
 * The browser frame clock, which node does not have.
 *
 * `Animated` schedules through it, so any screen with an animation - the quest
 * verification sweep, the SOS pulse - throws ReferenceError on mount without
 * this. The timers are unref'd because a running `Animated.loop` would
 * otherwise hold the process open after the last test finished.
 */
globalThis.requestAnimationFrame ??= (cb) => {
  const timer = setTimeout(() => cb(Date.now()), 16);
  timer.unref?.();
  return timer;
};
globalThis.cancelAnimationFrame ??= (timer) => clearTimeout(timer);
