import { useEffect, useState } from 'react';
import { getListings } from './services/listings';
import { parseRoute } from './utils/route';

export default function App() {
  const [count, setCount] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    let active = true;
    getListings().then((items) => { if (active) setCount(items.length); }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    const update = () => setHash(window.location.hash);
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  const route = parseRoute(hash);
  return <main className="foundation-shell">
    <a className="wordmark" href="#/">ChivaGo<span className="brand-dot">✳</span></a>
    <p className="eyebrow">THAILAND, AT YOUR OWN PACE</p>
    <h1>A little closer to<br /><em>somewhere good.</em></h1>
    <p className="lead">A thoughtfully paced travel marketplace. Fictional listings, real room to imagine.</p>
    <div className="notice" role="status">{failed ? 'Unable to load demo listings.' : count === null ? 'Loading demo listings…' : `${count} fictional tours, stays, and experiences ready to explore.`}</div>
    {route.kind !== 'home' ? <p>This page is not available yet. <a href="#/">Return home</a></p> : null}
    <p className="muted">Front-end prototype · Nothing can be reserved or charged.</p>
  </main>;
}
