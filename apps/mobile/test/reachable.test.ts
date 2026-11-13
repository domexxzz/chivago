import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Every screen is reachable.
 *
 * The passport shipped built, tested, styled — and wired to nothing. No
 * ScreenKey, no case in App, no door anywhere. It was a complete screen that
 * no traveller could open, and it survived a commit, a review and a palette
 * pass over the whole app, because nothing anywhere fails when a screen is
 * merely absent.
 *
 * Source-level on purpose: rendering App needs fonts, a profile and a network,
 * and the thing being checked is a wiring fact that a mounted tree would only
 * reveal by someone thinking to navigate there.
 */

const ROOT = join(import.meta.dirname, '..');
const app = readFileSync(join(ROOT, 'App.tsx'), 'utf8');
const store = readFileSync(join(ROOT, 'src', 'state', 'store.tsx'), 'utf8');
const shell = readFileSync(join(ROOT, 'src', 'components', 'Shell.tsx'), 'utf8');

/** The union, read out of its own declaration rather than restated here. */
const union = (text: string, name: string): string[] => {
  const decl = new RegExp(`export type ${name} =([\\s\\S]*?);`).exec(text);
  assert.ok(decl, `${name} is no longer declared where this test looks`);
  return [...decl[1]!.matchAll(/'([a-z]+)'/g)].map((m) => m[1]!);
};

describe('nothing is built and left unreachable', () => {
  const screens = union(store, 'ScreenKey');

  test('the union was actually found and is not trivially empty', () => {
    // Guards the regex above: a test that silently matches nothing passes
    // forever and protects nothing.
    assert.ok(screens.length >= 10, `only found ${screens.length} screens`);
    assert.ok(screens.includes('passport'), 'the screen that prompted this test is gone');
  });

  for (const key of union(store, 'ScreenKey')) {
    test(`'${key}' has a case in App`, () => {
      assert.match(
        app,
        new RegExp(`case '${key}':`),
        `ScreenKey '${key}' exists but App renders nothing for it — it is unreachable`,
      );
    });
  }
});

describe('the tab bar and the navigator agree', () => {
  const tabs = union(store, 'TabKey');
  const visibleTabs = ['home', 'map', 'game', 'collect', 'local-picks'];

  test('every tab is a real screen', () => {
    for (const tab of tabs) {
      assert.ok(union(store, 'ScreenKey').includes(tab), `tab '${tab}' is not a ScreenKey`);
    }
  });

  test('every visible mobile destination has an icon', () => {
    // The mobile bar intentionally maps product destinations onto screens:
    // Game opens quests, Collect opens the game/collection hub, and Local
    // Picks is a pushed screen. Assert what a traveller can actually see.
    for (const tab of visibleTabs) {
      assert.match(
        shell,
        new RegExp(`\\{ key: '${tab}',[^\\n]*Icon:`),
        `visible tab '${tab}' has no icon`,
      );
    }
  });

  test('the mobile bar shows the five requested destinations in order', () => {
    const positions = visibleTabs.map((tab) => shell.indexOf(`{ key: '${tab}',`));
    positions.forEach((position, index) => assert.ok(position >= 0, `${visibleTabs[index]} is missing`));
    assert.deepEqual([...positions].sort((a, b) => a - b), positions, 'mobile tab order changed');
  });

  test('five tabs, because a sixth stops being a label and becomes decoration', () => {
    assert.equal(tabs.length, 5, `${tabs.length} tabs — see the note on TabKey in store.tsx`);
  });

  test('a screen with no tab of its own is still owned by one', () => {
    // OWNING_TAB decides which tab stays lit behind a pushed screen. A screen
    // missing from it strands the reader: no tab reads as active, and a tab
    // tap sends them somewhere unrelated. Impact and passport are both in
    // this position now that Home owns them.
    const owning = /const OWNING_TAB: Record<ScreenKey, TabKey> = \{([\s\S]*?)\n\};/.exec(store);
    assert.ok(owning, 'OWNING_TAB moved');
    for (const key of union(store, 'ScreenKey')) {
      assert.match(owning[1]!, new RegExp(`\\b${key}:`), `'${key}' has no owning tab`);
    }
  });
});
