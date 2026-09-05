/**
 * The board: the screen in the room.
 *
 * One HTML page, no session, no build step, opened on the projector at the
 * pitch: every approved story in the area, newest first and largest, polled
 * from `/areas/:key/stories` every three seconds so a story approved on the
 * stage is on the wall before the sentence about it ends. Muted, because a
 * room full of phones is loud enough. Dark, because projectors are.
 *
 * It shows only what a host approved - the feed it reads carries nothing
 * else - and says at the top whether the door is open.
 */

import type { Area } from '@chivago/core';

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function boardPage(area: Area): string {
  const feed = `/areas/${encodeURIComponent(area.key)}/stories`;
  return `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(area.name.th)} · ChivaGo Stories</title>
<style>
  :root { --bg: #0b1418; --ink: #f2f4f1; --dim: #8fa3a8; --gold: #e0a92a; --teal: #0e7480; --card: #142026; }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink); font-family: "Noto Sans Thai", "Anuphan", system-ui, sans-serif; }
  header { display: flex; justify-content: space-between; align-items: baseline; padding: 22px 32px 10px; border-bottom: 1px solid #22323a; }
  h1 { margin: 0; font-size: 28px; letter-spacing: -0.01em; }
  h1 small { color: var(--dim); font-weight: 400; font-size: 16px; margin-left: 10px; }
  .status { font-size: 14px; color: var(--dim); display: flex; gap: 14px; align-items: center; }
  .door { padding: 3px 10px; border-radius: 999px; font-weight: 700; font-size: 12px; letter-spacing: .08em; text-transform: uppercase; }
  .door.open { background: var(--gold); color: #1a1200; }
  .door.shut { background: #22323a; color: var(--dim); }
  main { padding: 18px 32px 40px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); grid-auto-rows: 1fr; gap: 14px; }
  .card { position: relative; background: var(--card); border-radius: 14px; overflow: hidden; aspect-ratio: 9 / 16; box-shadow: 0 0 0 3px transparent; }
  .card.newest { grid-column: span 2; grid-row: span 2; box-shadow: 0 0 0 3px var(--gold); }
  .card video, .card img { width: 100%; height: 100%; object-fit: cover; display: block; background: #000; }
  .card .cap { position: absolute; left: 0; right: 0; bottom: 0; padding: 40px 14px 12px; background: linear-gradient(transparent, rgba(0,0,0,.78)); }
  .card .cap b { display: block; font-size: 16px; }
  .card .cap span { color: var(--dim); font-size: 12px; }
  .empty { color: var(--dim); font-size: 18px; padding: 60px 0; text-align: center; }
  footer { position: fixed; bottom: 10px; right: 20px; color: var(--dim); font-size: 12px; }
</style>
</head>
<body>
<header>
  <h1>${esc(area.name.th)} <small>${esc(area.name.en)} · ChivaGo Stories</small></h1>
  <div class="status"><span id="count">…</span><span id="door" class="door shut">closed</span></div>
</header>
<main>
  <div id="grid" class="grid"></div>
  <p id="empty" class="empty" hidden>ยังไม่มีสตอรี่ · No stories yet. Tap the QR, stand at a place, tell one.</p>
</main>
<footer>updates every 3 s · <span id="at"></span> · shown with the teller's consent, for 7 days · แสดงโดยความยินยอมของผู้เล่า และอยู่ 7 วัน</footer>
<script>
  const feed = ${JSON.stringify(feed)};
  const grid = document.getElementById('grid');
  const empty = document.getElementById('empty');
  const count = document.getElementById('count');
  const door = document.getElementById('door');
  const at = document.getElementById('at');
  const shown = new Map();
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const card = (s) => {
    const el = document.createElement('article');
    el.className = 'card';
    el.dataset.id = s.id;
    const media = s.kind === 'video'
      ? '<video src="' + esc(s.media) + '" poster="' + esc(s.poster) + '" muted autoplay loop playsinline></video>'
      : '<img src="' + esc(s.media) + '" alt="">';
    el.innerHTML = media + '<div class="cap">' + (s.caption ? '<b>' + esc(s.caption) + '</b>' : '')
      + '<span>' + esc(s.placeName.th) + ' · ' + esc(s.placeName.en) + ' · ' + esc(s.createdAt.slice(11, 16)) + '</span></div>';
    return el;
  };
  async function tick() {
    try {
      const res = await fetch(feed, { cache: 'no-store' });
      const body = await res.json();
      const stories = (body.data && body.data.stories) || [];
      door.textContent = body.data && body.data.open ? 'open · เปิดรับ' : 'closed · ปิดรับ';
      door.className = 'door ' + (body.data && body.data.open ? 'open' : 'shut');
      count.textContent = stories.length + (stories.length === 1 ? ' story' : ' stories');
      empty.hidden = stories.length > 0;
      // Newest first, and only the changes: a card that stays is not rebuilt,
      // so its video does not restart on every tick.
      const ids = new Set(stories.map((s) => s.id));
      for (const [id, el] of shown) if (!ids.has(id)) { el.remove(); shown.delete(id); }
      stories.forEach((s, i) => {
        let el = shown.get(s.id);
        if (!el) { el = card(s); shown.set(s.id, el); }
        el.classList.toggle('newest', i === 0);
        if (grid.children[i] !== el) grid.insertBefore(el, grid.children[i] || null);
      });
      at.textContent = new Date().toLocaleTimeString();
    } catch (e) {
      at.textContent = 'offline · ' + new Date().toLocaleTimeString();
    }
  }
  tick();
  setInterval(tick, 3000);
</script>
</body>
</html>`;
}
