/**
 * `/config` is a public endpoint, and one of its fields was misnamed.
 *
 * `autoApprove` governs stories - clips and photographs people post, which go
 * up with nobody looking at them first. Read cold, over a presenter's
 * shoulder, it says the opposite of what this product claims: that proof is
 * approved without a host. So the field is now `storiesAutoApprove`, and the
 * old name stays beside it as a deprecated alias, because builds and SDKs
 * already in the wild read it.
 *
 * These tests pin the part of that which can quietly rot: the two names
 * drifting apart, or the alias being dropped in a tidy-up.
 */

import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import { publicConfig } from './fence.ts';

const STORIES = 'CHIVAGO_STORIES_AUTO_APPROVE';

const restore = (key: string, before: string | undefined): void => {
  if (before === undefined) delete process.env[key];
  else process.env[key] = before;
};

describe('the public config names what it governs', () => {
  const before = process.env[STORIES];
  afterEach(() => { restore(STORIES, before); });

  test('storiesAutoApprove is the field, and it follows the switch', () => {
    process.env[STORIES] = '1';
    assert.equal(publicConfig().storiesAutoApprove, true);
    delete process.env[STORIES];
    assert.equal(publicConfig().storiesAutoApprove, false);
  });

  test('autoApprove is kept as an alias so older clients still read it', () => {
    process.env[STORIES] = '1';
    const open = publicConfig();
    assert.equal(open.autoApprove, true, 'the deprecated name must still be sent');
    delete process.env[STORIES];
    assert.equal(publicConfig().autoApprove, false);
  });

  test('the two names never disagree', () => {
    // An alias that can say something different from the field it aliases is
    // worse than no alias: whichever a reader picked, one of them lied.
    for (const value of ['1', '0', undefined]) {
      restore(STORIES, value);
      const config = publicConfig();
      assert.equal(
        config.autoApprove,
        config.storiesAutoApprove,
        `the alias drifted from the field with ${STORIES}=${String(value)}`,
      );
    }
  });

  test('neither name is the fence, which is its own field', () => {
    // The whole point of the rename: somebody reading /config must not take
    // either of these for the presence check. They are different switches.
    delete process.env[STORIES];
    const config = publicConfig();
    assert.equal(config.storiesAutoApprove, false);
    assert.equal(typeof config.fenceOff, 'boolean');
  });
});
