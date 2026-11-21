import type { AdventureCmsDetail } from '../adventure-cms-service.ts';
import { html, layout } from './html.ts';
import type { Locale } from './i18n.ts';

const hidden = (csrf: string) => html`<input type="hidden" name="csrf" value="${csrf}">`;
const trilingual = (prefix: string, label: string, multiline = false) => html`
  <label>${label} (EN)${multiline ? html`<textarea name="${prefix}En" required></textarea>` : html`<input name="${prefix}En" required>`}</label>
  <label>${label} (TH)${multiline ? html`<textarea name="${prefix}Th" required></textarea>` : html`<input name="${prefix}Th" required>`}</label>
  <label>${label} (ZH)${multiline ? html`<textarea name="${prefix}Zh" required></textarea>` : html`<input name="${prefix}Zh" required>`}</label>`;

export function adventureCmsPage(input: {
  locale: Locale; hostName: string; reviewer: string | null; csrf: string;
  details: AdventureCmsDetail[]; places: Array<{ id: string; name: string }>;
  quests: Array<{ id: string; name: string }>; notice?: string | null; error?: string | null;
}): string {
  return layout({ title: 'Adventure CMS', locale: input.locale, hostName: input.hostName, reviewer: input.reviewer,
    signedIn: true, activeNav: 'admin', canModerate: true, canAdmin: true, path: '/console/admin/adventures' }, html`
    <p><a href="/console/admin">← Administration</a></p>
    <div><p class="kicker">CHIVARGO CONTENT CONTROL</p><h1>Adventure CMS</h1>
      <p class="muted">Draft, validate and publish database-backed adventures. Published content is immutable; clone it before editing.</p></div>
    ${input.notice ? html`<p class="badge badge-ok">${input.notice}</p>` : ''}
    ${input.error ? html`<p class="badge danger">${input.error}</p>` : ''}

    <details open style="border:2px solid var(--color-text);padding:18px;margin:24px 0">
      <summary><strong>Create adventure draft</strong></summary>
      <form method="post" action="/console/admin/adventures" style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:16px">
        ${hidden(input.csrf)}
        <label>ID<input name="id" placeholder="koh-sichang-season-02" required></label>
        <label>Area key<input name="areaKey" placeholder="koh-sichang" required></label>
        <label>Cover place<select name="coverPlaceId"><option value="">—</option>${input.places.map((p) => html`<option value="${p.id}">${p.name}</option>`)}</select></label>
        ${trilingual('title', 'Title')}${trilingual('summary', 'Summary', true)}
        <button class="btn btn-primary" type="submit" style="grid-column:1/-1">Create draft</button>
      </form>
    </details>

    ${input.details.length === 0 ? html`<p class="muted">No Adventure content yet.</p>` : input.details.map((detail) => html`
      <section style="border:2px solid var(--color-text);padding:18px;margin:20px 0">
        <div style="display:flex;justify-content:space-between;gap:16px;align-items:flex-start;flex-wrap:wrap">
          <div><p class="kicker">${detail.arc.areaKey} · VERSION ${detail.arc.version}</p><h2>${detail.arc.titleTh}</h2>
            <p class="muted">${detail.arc.id} · ${detail.arc.status.toUpperCase()} · ${detail.arc.chapterCount} chapters · ${detail.arc.nodeCount} locations</p></div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            ${detail.arc.status === 'draft' ? html`
              <form method="post" action="/console/admin/adventures/${encodeURIComponent(detail.arc.id)}/status">${hidden(input.csrf)}<input type="hidden" name="status" value="published"><button class="btn btn-primary" type="submit">Validate & publish</button></form>
            ` : html`
              <form method="post" action="/console/admin/adventures/${encodeURIComponent(detail.arc.id)}/status">${hidden(input.csrf)}<input type="hidden" name="status" value="archived"><button class="btn" type="submit">Archive</button></form>
              <form method="post" action="/console/admin/adventures/${encodeURIComponent(detail.arc.id)}/clone" style="display:flex;gap:6px">${hidden(input.csrf)}<input name="newId" placeholder="new-draft-id" required><button class="btn" type="submit">Clone to draft</button></form>
            `}
          </div>
        </div>

        ${detail.chapters.map((chapter) => html`
          <details open style="background:#f5fbfd;padding:14px;margin-top:14px">
            <summary><strong>${chapter.position + 1}. ${chapter.title_th}</strong> · ${chapter.nodes.length} locations</summary>
            ${chapter.nodes.map((node) => html`<div class="row"><div><strong>${String(node.title_th)}</strong><div class="muted">${String(node.id)} · ${String(node.place_id)} · ${String(node.verification_kind)}</div></div></div>`)}
            ${detail.arc.status === 'draft' ? html`
              <details style="margin-top:10px"><summary>Add location / clue</summary>
                <form method="post" action="/console/admin/adventures/${encodeURIComponent(detail.arc.id)}/chapters/${encodeURIComponent(chapter.id)}/nodes" style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:12px">
                  ${hidden(input.csrf)}
                  <label>Node ID<input name="id" required></label><label>Position<input name="position" type="number" min="0" required></label>
                  <label>Place<select name="placeId" required>${input.places.map((p) => html`<option value="${p.id}">${p.name}</option>`)}</select></label>
                  <label>Verification<select name="verificationKind"><option value="checkin">GPS check-in</option><option value="quest">Existing Quest</option><option value="qr">Signed QR</option><option value="host">Host approval</option></select></label>
                  <label>Quest (when required)<select name="questId"><option value="">—</option>${input.quests.map((q) => html`<option value="${q.id}">${q.name}</option>`)}</select></label>
                  <label><input type="checkbox" name="optional" value="1"> Optional clue</label>
                  ${trilingual('title', 'Title')}${trilingual('story', 'Story', true)}${trilingual('instruction', 'Instruction', true)}
                  <button class="btn btn-primary" type="submit" style="grid-column:1/-1">Add location</button>
                </form>
              </details>` : ''}
          </details>`)}

        ${detail.arc.status === 'draft' ? html`
          <details style="margin-top:14px"><summary><strong>Add chapter</strong></summary>
            <form method="post" action="/console/admin/adventures/${encodeURIComponent(detail.arc.id)}/chapters" style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:12px">
              ${hidden(input.csrf)}<label>Chapter ID<input name="id" required></label><label>Position<input name="position" type="number" min="0" required></label><span></span>
              ${trilingual('title', 'Title')}${trilingual('summary', 'Summary', true)}
              <button class="btn btn-primary" type="submit" style="grid-column:1/-1">Add chapter</button>
            </form>
          </details>` : ''}
      </section>`)}
  `);
}
