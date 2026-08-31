/**
 * Render a component to text, the way a reader meets it.
 *
 * Assertions are then about what a screen SAYS, which is the level at which
 * every bug in docs/21-walking-the-app.md lived: a caption naming one currency
 * over two figures, a reward badge with no currency at all, a map pin labelled
 * with its layer instead of its place.
 */

import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const decode = (s: string): string =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'");

export const html = (element: ReactElement): string => renderToStaticMarkup(element);

/**
 * Everything the component says, as one string.
 *
 * Tags become spaces rather than nothing, so two adjacent elements do not run
 * their words together and produce a match that is not really there.
 */
export const text = (element: ReactElement): string =>
  decode(html(element).replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();

/** Accessibility labels, in order. A screen reader's view of the same tree. */
export const labels = (element: ReactElement): string[] =>
  [...html(element).matchAll(/aria-label="([^"]*)"/g)].map((m) => decode(m[1]!));

export { createElement as h };
