import { html, layout } from './html.ts';
import type { Locale } from './i18n.ts';

const hidden = (csrf: string) => html`<input type="hidden" name="csrf" value="${csrf}">`;
const localised = (prefix: string, label: string, area = false) => html`
  <label>${label} EN${area ? html`<textarea name="${prefix}En" required></textarea>` : html`<input name="${prefix}En" required>`}</label>
  <label>${label} TH${area ? html`<textarea name="${prefix}Th" required></textarea>` : html`<input name="${prefix}Th" required>`}</label>
  <label>${label} ZH${area ? html`<textarea name="${prefix}Zh" required></textarea>` : html`<input name="${prefix}Zh" required>`}</label>`;

export function seasonCmsPage(input: {
  locale: Locale; hostName: string; reviewer: string | null; csrf: string;
  seasons: Array<Record<string, unknown>>; quests: Array<{ id: string; name: string }>;
  notice?: string | null; error?: string | null;
}): string {
  return layout({ title: 'Season CMS', locale: input.locale, hostName: input.hostName, reviewer: input.reviewer,
    signedIn: true, activeNav: 'admin', canModerate: true, canAdmin: true, path: '/console/admin/seasons' }, html`
    <p><a href="/console/admin">← Administration</a></p><p class="kicker">CHIVARGO LIVE CONTENT</p><h1>Season & collection</h1>
    <p class="muted">Season progress is accepted only from verified Travel Events. Memory Coins are derived from those events and exchanges.</p>
    ${input.notice ? html`<p class="badge badge-ok">${input.notice}</p>` : ''}${input.error ? html`<p class="badge danger">${input.error}</p>` : ''}
    <details open style="border:2px solid var(--color-text);padding:18px;margin:20px 0"><summary><strong>Create season draft</strong></summary>
      <form method="post" action="/console/admin/seasons" style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:12px">${hidden(input.csrf)}
        <label>ID<input name="id" required></label><label>Theme<input name="theme" required></label><span></span>${localised('name','Name')}${localised('description','Description',true)}
        <label>Starts<input type="datetime-local" name="startsAt" required></label><label>Ends<input type="datetime-local" name="endsAt" required></label>
        <button class="btn btn-primary" type="submit">Create draft</button>
      </form></details>
    ${input.seasons.map((season) => html`<section style="border:2px solid var(--color-text);padding:18px;margin:18px 0">
      <h2>${String(season.name_th)}</h2><p class="muted">${String(season.id)} · ${String(season.status).toUpperCase()} · ${String(season.quest_count)} quests · ${String(season.item_count)} items</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap">${['scheduled','active','ended','archived'].map((status) => html`<form method="post" action="/console/admin/seasons/${encodeURIComponent(String(season.id))}/status">${hidden(input.csrf)}<input type="hidden" name="status" value="${status}"><button class="btn" type="submit">${status}</button></form>`)}</div>
      <details style="margin-top:12px"><summary>Bind existing Quest</summary><form method="post" action="/console/admin/seasons/${encodeURIComponent(String(season.id))}/quests" style="display:flex;gap:8px;margin-top:10px">${hidden(input.csrf)}<select name="questId" required>${input.quests.map((q) => html`<option value="${q.id}">${q.name}</option>`)}</select><input name="coinReward" type="number" min="0" value="0" required><button class="btn" type="submit">Bind</button></form></details>
      <details style="margin-top:12px"><summary>Add collection item</summary><form method="post" action="/console/admin/seasons/${encodeURIComponent(String(season.id))}/items" style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:10px">${hidden(input.csrf)}
        <label>ID<input name="id" required></label><label>Kind<select name="kind"><option value="stamp">Stamp</option><option value="pet_costume">Pet costume</option><option value="mascot_costume">Mascot costume</option><option value="memory">Memory</option><option value="achievement">Achievement</option><option value="limited_item">Limited item</option></select></label><label>Required quests<input name="requiredProgress" type="number" min="1" value="1"></label>
        ${localised('name','Name')}${localised('description','Description',true)}<label>Catch-up coin cost<input name="coinCost" type="number" min="0" value="0"></label><label><input type="checkbox" name="catchUpAllowed" value="1"> Available after season</label><button class="btn btn-primary" type="submit">Add item</button>
      </form></details>
    </section>`)}
  `);
}
