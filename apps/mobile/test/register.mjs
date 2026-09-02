import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';
import { transform } from 'sucrase';

import { stubFor } from './stubs.mjs';

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
 * SYNCHRONOUS HOOKS ONLY, and this is the second version of that decision.
 *
 * The first version registered BOTH `module.register()` (async) and
 * `registerHooks()` (sync), on the theory that only the sync hook sees the
 * CommonJS `require` inside react-native-svg. On the machine it was written
 * on that worked. On macOS and Linux with Node 22.20 and 24.11 the two chains
 * interfere: the sync chain's default `next()` returns `source: null` for
 * every CommonJS file and Node refuses it, so nine of the eleven test files
 * could not load at all and "253 mobile tests" was a number nobody else could
 * reproduce. Since Node 22.15 the sync hooks see both `import` and `require`,
 * so the async twin was never needed.
 */

/** Stub imports resolve relative to this directory, not the importer. */
const STUB_BASE = import.meta.url;

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

/**
 * `module.exports = exports.default;` when `exports.default` is null.
 *
 * react-native-web's CommonJS build ends 180 files that way, and a handful of
 * them (NativeAnimatedModule, for one) genuinely export null on web. Plain
 * `require` is fine with that. But once a sync load hook is registered, node
 * routes `require` through its ESM translator, which enumerates the exports
 * object to build a namespace and throws `Cannot convert undefined or null to
 * object` on the first null it meets - inside Animated, on the first screen
 * with a pulse or a sweep.
 *
 * The rewrite keeps `exports` (with `__esModule: true` and `default: null`)
 * as the module's value instead of the bare null. Babel's interop helper reads
 * `.default` off an `__esModule` object, so every consumer still receives
 * null, and the translator has an object to enumerate.
 */
const NULL_DEFAULT = 'module.exports = exports.default;';
const NULL_DEFAULT_SAFE = 'module.exports = exports.default == null ? exports : exports.default;';

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
  const result = next(url, context);
  if (result.format === 'commonjs' && result.source != null) {
    const source = typeof result.source === 'string'
      ? result.source
      : Buffer.from(result.source).toString('utf8');
    if (source.includes(NULL_DEFAULT)) {
      return { ...result, source: source.replace(NULL_DEFAULT, NULL_DEFAULT_SAFE) };
    }
  }
  return result;
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
