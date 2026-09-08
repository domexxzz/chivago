import { strict as assert } from 'node:assert';
import { test, describe, beforeEach } from 'node:test';

import { h, html, text } from './render.ts';
import { server } from './interact.ts';
import { UnfencedBand } from '../src/components/UnfencedBand.tsx';
import { HereNow } from '../src/components/PlaceLive.tsx';
import { FENCED, serverConfig, __resetServerConfig } from '../src/state/server-config.ts';

/**
 * The band, and the promise it keeps.
 *
 * `CHIVAGO_FENCE_OFF=1` on the server accepts a check-in from anywhere. That
 * switch is allowed to exist only because the app is required to say so where
 * a reader can see it - see apps/api/src/fence.ts. These hold that half of
 * the bargain, which is the half a refactor is most likely to drop, because
 * nothing breaks when a warning quietly stops rendering.
 */
describe('when the server has stopped checking where anyone is', () => {
  beforeEach(() => { __resetServerConfig(); });

  test('the band says what is off, and that it applies to anyone', () => {
    const said = text(h(UnfencedBand));
    assert.match(said, /OFF/);
    assert.match(said, /anywhere/i);
  });

  test('a screen reader is told it is an alert, not decoration', () => {
    assert.match(html(h(UnfencedBand)), /role="alert"/);
  });

  test('until the server answers, the count still claims its fence', () => {
    // The safe default runs the other way from convenience: a screen drawn
    // before the answer arrives is drawn as a fenced server, because that is
    // what almost every server is.
    const crowd = { checkinsLastHour: 3, windowMinutes: 60, countedAt: '2026-09-08T03:00:00.000Z' };
    assert.match(text(h(HereNow, { crowd })), /geofenced/i);
  });
});

/** What the app believes before the server answers, and if it never does. */
describe("reading the server's own description", () => {
  beforeEach(() => { __resetServerConfig(); });

  test('an unreachable server is treated as fenced, never as open', async () => {
    // The dangerous default is the other one: a failed request read as "no
    // fence" would raise a false alarm on a server that is enforcing one.
    const fake = server({ 'GET /config': { __throws: 'NETWORK' } });
    try {
      assert.deepEqual(await serverConfig(), FENCED);
    } finally { fake.restore(); }
  });

  test('a server that says the fence is open is believed', async () => {
    const fake = server({ 'GET /config': { fenceOff: true } });
    try {
      assert.deepEqual(await serverConfig(), { fenceOff: true });
    } finally { fake.restore(); }
  });

  test('one launch asks once, however many components need the answer', async () => {
    const fake = server({ 'GET /config': { fenceOff: false } });
    try {
      await Promise.all([serverConfig(), serverConfig(), serverConfig()]);
      assert.equal(fake.calls.filter((c) => c.path === '/config').length, 1);
    } finally { fake.restore(); }
  });
});

/**
 * The blank screen this shipped as, for eleven minutes.
 *
 * `useServerConfig` was added BELOW the loading early-return in App.tsx, so
 * the first render called one fewer hook than the second. React counts hooks
 * per render and throws #310, which renders as a white page with the whole
 * app gone - no message, no fallback, on the live server.
 *
 * The rule is not "this hook goes at the top". It is that EVERY hook in a
 * component goes above every conditional return, and this is the cheapest
 * place to state it in a form that fails.
 */
describe('hooks in the app shell', () => {
  test('every hook is called above the loading early-return', async () => {
    const { readFile } = await import('node:fs/promises');
    const src = await readFile(new URL('../App.tsx', import.meta.url), 'utf8');
    const guard = src.indexOf('if (!fontsReady');
    assert.ok(guard > 0, 'the loading guard moved - update this test with it');
    const after = src.slice(guard);
    // The shell renders screens after this point; a `use*(` there is a hook
    // that only runs on some renders.
    const strays = [...after.matchAll(/\n\s+const [^\n]*\buse[A-Z]\w*\(/g)].map((m) => m[0].trim());
    assert.deepEqual(strays, [], `hooks below the early return: ${strays.join(' | ')}`);
  });
});
