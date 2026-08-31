import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

import { esc, html, raw, Raw } from './html.ts';

describe('escaping', () => {
  test('escapes every dangerous character', () => {
    assert.equal(esc('<script>'), '&lt;script&gt;');
    assert.equal(esc('a & b'), 'a &amp; b');
    assert.equal(esc('say "hi"'), 'say &quot;hi&quot;');
    assert.equal(esc("it's"), 'it&#39;s');
  });

  test('null and undefined render as empty, not as the word', () => {
    assert.equal(esc(null), '');
    assert.equal(esc(undefined), '');
  });
});

describe('the html tag escapes interpolations by default', () => {
  test('a script tag in data cannot break out', () => {
    // A review note is free text typed by a person - exactly the shape of an
    // injection, and it is shown back to other staff.
    const note = '<img src=x onerror="alert(1)">';
    const out = html`<p>${note}</p>`.value;
    assert.ok(!out.includes('<img'), out);
    assert.ok(out.includes('&lt;img'));
  });

  test('an attribute value cannot be escaped with a quote', () => {
    const evil = '" onload="alert(1)';
    const out = html`<div title="${evil}">x</div>`.value;
    // The literal text "onload=" survives inside the escaped value, and that is
    // fine - what matters is that the quotes are escaped, so the parser never
    // leaves the title attribute and never sees an event handler.
    assert.equal(out, '<div title="&quot; onload=&quot;alert(1)">x</div>');
    assert.ok(!/title="[^"]*"\s+onload/.test(out), 'must not break out of the attribute');
  });

  test('a quest name with an ampersand renders correctly', () => {
    assert.equal(html`<h1>${'Sea & Sand'}</h1>`.value, '<h1>Sea &amp; Sand</h1>');
  });
});

describe('composition — the bug that shipped tag soup to the reviewer', () => {
  test('a nested html template composes instead of being escaped', () => {
    // The first version returned a plain string from html`` and escaped it on
    // the way into the parent, so the photo gallery rendered as literal
    // "<div class=..." text on the page.
    const inner = html`<span>ok</span>`;
    const out = html`<div>${inner}</div>`.value;
    assert.equal(out, '<div><span>ok</span></div>');
  });

  test('an array of templates composes', () => {
    const items = ['a', 'b'].map((x) => html`<li>${x}</li>`);
    assert.equal(html`<ul>${items}</ul>`.value, '<ul><li>a</li><li>b</li></ul>');
  });

  test('nested arrays compose', () => {
    const rows = [[html`<i>1</i>`], [html`<i>2</i>`]];
    assert.equal(html`${rows}`.value, '<i>1</i><i>2</i>');
  });

  test('data inside a nested template is still escaped', () => {
    // Composition must not become a hole: only the MARKUP is trusted, never
    // the values interpolated into it.
    const inner = html`<span>${'<b>bad</b>'}</span>`;
    const out = html`<div>${inner}</div>`.value;
    assert.ok(out.includes('&lt;b&gt;bad&lt;/b&gt;'), out);
    assert.ok(!out.includes('<b>bad</b>'));
  });

  test('false and nullish render as nothing, so conditionals read cleanly', () => {
    assert.equal(html`<p>${false}${null}${undefined}</p>`.value, '<p></p>');
  });

  test('zero is not swallowed', () => {
    assert.equal(html`<p>${0}</p>`.value, '<p>0</p>');
  });
});

describe('raw', () => {
  test('raw passes markup through untouched', () => {
    assert.equal(html`${raw('<hr>')}`.value, '<hr>');
  });

  test('a Raw stringifies to its markup', () => {
    assert.equal(String(new Raw('<hr>')), '<hr>');
    assert.equal(`${new Raw('<hr>')}`, '<hr>');
  });
});
