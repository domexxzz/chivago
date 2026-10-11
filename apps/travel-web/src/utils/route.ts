export type Route = { kind: 'home' } | { kind: 'listing'; id: string } | { kind: 'not-found' };
export function parseRoute(hash: string): Route {
  if (!hash || hash === '#' || hash === '#/') return { kind: 'home' };
  const match = /^#\/listing\/([^/]+)$/.exec(hash);
  if (!match) return { kind: 'not-found' };
  try { return { kind: 'listing', id: decodeURIComponent(match[1]) }; }
  catch { return { kind: 'not-found' }; }
}
