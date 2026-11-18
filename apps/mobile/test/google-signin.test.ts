import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { googleFailureMessage, insideAppBrowser } from '../src/api/google-signin.ts';

/*
  Google refuses to sign anybody in from inside another app's browser, and on
  Ko Sichang most links arrive in a LINE chat. These are real user agents: the
  first three must be caught before a traveller is sent to Google's refusal,
  the last three must be let through.
*/
describe('insideAppBrowser', () => {
  it("catches LINE's, Facebook's and Instagram's built-in browsers", () => {
    for (const ua of [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/14.19.0',
      'Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0 Mobile Safari/537.36 [FBAN/EMA;FBLC/th_TH;FBAV/420.0.0.0]',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0.0',
    ]) assert.equal(insideAppBrowser(ua), true, ua);
  });

  it('lets Safari, Chrome and a missing user agent through', () => {
    for (const ua of [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
      undefined,
    ]) assert.equal(insideAppBrowser(ua), false, String(ua));
  });

  it('is not fooled by the word "online" in a user agent', () => {
    assert.equal(insideAppBrowser('Mozilla/5.0 SomeOnlineReader/2.0 Safari/604.1'), false);
  });
});

describe('googleFailureMessage', () => {
  it('names every way a return can fail, in all three languages', () => {
    for (const kind of ['cancelled', 'clash', 'unavailable', 'failed'] as const) {
      const m = googleFailureMessage(kind);
      assert.ok(m.en && m.th && m.zh, kind);
    }
    assert.notEqual(googleFailureMessage('unavailable').th, googleFailureMessage('failed').th,
      'not switched on yet is a different thing from went wrong');
  });
});
