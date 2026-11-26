/**
 * The stories waiting for a host.
 *
 * The page a team member has open on stage: what has come in at the places
 * this host reviews, oldest first, each with its poster and its caption and
 * two buttons. Approve puts it on the pin and the big screen; hide keeps it
 * off. Nothing in that list is public until one of those is pressed.
 *
 * Under it, what is on the board already, and what was taken down. With
 * auto-approve on nothing ever waits, and those two lists are the page.
 */

import { esc, html, layout, type Raw } from './html.ts';
import { formatDateTime, t, tf, type Locale } from './i18n.ts';
import type { DecidedStory, PendingStory } from '../story-service.ts';

const when = (iso: string): string => iso.slice(11, 16);

function card(s: PendingStory, csrf: string): Raw {
  return html`
    <article class="row" style="display:flex;gap:16px;align-items:flex-start;padding:14px 0;border-bottom:1px solid var(--color-neutral-300)">
      <a href="/console/stories/${esc(s.id)}/media" target="_blank" rel="noopener" style="flex:0 0 120px">
        <img src="/console/stories/${esc(s.id)}/poster" alt="" width="120" height="160"
             style="width:120px;height:160px;object-fit:cover;background:var(--color-neutral-200);display:block">
      </a>
      <div style="flex:1;min-width:0">
        <p class="kicker">${esc(s.placeName.en)} · <span lang="th">${esc(s.placeName.th)}</span> · ${esc(when(s.createdAt))}
          · ${s.kind === 'video' ? `${s.durationS === null ? '' : `${Math.round(s.durationS)} s `}video` : 'photo'}</p>
        <p style="margin:6px 0 12px;font-size:16px">${s.caption ? esc(s.caption) : html`<span class="muted">(no caption · ไม่มีคำบรรยาย)</span>`}</p>
        <div class="actions" style="display:flex;gap:8px;flex-wrap:wrap">
          <form method="post" action="/console/stories/${esc(s.id)}/approve">
            <input type="hidden" name="csrf" value="${esc(csrf)}">
            <button class="btn btn-primary" type="submit">Approve · แสดง</button>
          </form>
          <form method="post" action="/console/stories/${esc(s.id)}/hide">
            <input type="hidden" name="csrf" value="${esc(csrf)}">
            <button class="btn btn-secondary" type="submit">Hide · ไม่แสดง</button>
          </form>
        </div>
      </div>
    </article>`;
}

/**
 * A story already decided: one button, the opposite of where it is.
 *
 * The picture of a live one is the PUBLIC poster, not the console's. This
 * page reloads itself, the console's copy is `no-store`, and the public one
 * answers a reload with a 304. A hidden one has no picture at all: hidden
 * bytes are served to nobody, the console included (`locateStoryMedia`).
 */
function decidedCard(s: DecidedStory, locale: Locale, csrf: string): Raw {
  const live = s.status === 'approved';
  const place = locale === 'th' ? s.placeName.th : s.placeName.en;
  return html`
    <article class="row" style="display:flex;gap:16px;align-items:flex-start;padding:14px 0;border-bottom:1px solid var(--color-neutral-300)">
      ${live ? html`
      <a href="${s.media}" target="_blank" rel="noopener" style="flex:0 0 72px">
        <img src="${s.poster}" alt="" width="72" height="96" loading="lazy"
             style="width:72px;height:96px;object-fit:cover;background:var(--color-neutral-200);display:block">
      </a>` : ''}
      <div style="flex:1;min-width:0">
        <p class="kicker">${place} · ${formatDateTime(s.createdAt, locale)}</p>
        <p style="margin:6px 0;font-size:16px;overflow-wrap:anywhere">${s.caption || html`<span class="muted">(${t('storyNoCaption', locale)})</span>`}</p>
        <p class="muted" style="margin:0 0 10px">
          ${s.autoApproved ? `${t('storyAuto', locale)} · ` : ''}${tf('storyExpires', locale, { when: formatDateTime(s.expiresAt, locale) })}
        </p>
        <form method="post" action="/console/stories/${s.id}/${live ? 'hide' : 'approve'}">
          <input type="hidden" name="csrf" value="${csrf}">
          <button class="btn btn-secondary" type="submit">${t(live ? 'storyHide' : 'storyPutBack', locale)}</button>
        </form>
      </div>
    </article>`;
}

function decidedSections(decided: DecidedStory[], locale: Locale, csrf: string): Raw {
  const live = decided.filter((s) => s.status === 'approved');
  const hidden = decided.filter((s) => s.status === 'hidden');
  const list = (stories: DecidedStory[], empty: string): Raw | Raw[] =>
    stories.length === 0 ? html`<p class="empty">${empty}</p>` : stories.map((s) => decidedCard(s, locale, csrf));
  return html`
    <section id="live-stories" style="margin-top:32px">
      <h2>${t('storiesLive', locale)} (${live.length})</h2>
      <p class="note">${t('storiesLiveNote', locale)}</p>
      ${list(live, t('storiesLiveEmpty', locale))}
    </section>
    <section id="hidden-stories" style="margin-top:32px">
      <h2>${t('storiesHidden', locale)} (${hidden.length})</h2>
      ${list(hidden, t('storiesHiddenEmpty', locale))}
    </section>`;
}

export function storiesPage(args: {
  locale: Locale;
  hostName: string;
  reviewer: string | null;
  canModerate: boolean;
  pending: PendingStory[];
  decided: DecidedStory[];
  csrf: string;
  open: boolean;
}): string {
  const body = html`
    <h1>Stories waiting <span lang="th" class="muted">· สตอรี่ที่รอตรวจ</span></h1>
    <p class="lede">
      What people at the places you host have sent. Nothing waiting is on a pin or a screen until you press Approve.
      <span lang="th">สิ่งที่คนที่อยู่ตรงสถานที่ที่คุณดูแลส่งมา อันที่รออยู่จะไม่ขึ้นหมุดหรือจอจนกว่าจะกด Approve</span>
    </p>
    <!--
      The door. Its state for everyone; the handle for a moderator only, as
      one button that does the opposite of the current state, so nobody on a
      stage has to read two.
    -->
    <section class="panel" style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">
      <p style="margin:0;flex:1">
        ${args.open
    ? html`The door is <strong>open</strong>: people at the places can send stories. <span lang="th">ประตูเปิดอยู่ คนที่สถานที่ส่งสตอรี่ได้</span>`
    : html`The door is <strong>closed</strong>: nobody can send a story. <span lang="th">ประตูปิดอยู่ ยังส่งสตอรี่ไม่ได้</span>`}
      </p>
      ${args.canModerate
    ? html`
      <form method="post" action="/console/stories/door">
        <input type="hidden" name="csrf" value="${esc(args.csrf)}">
        <input type="hidden" name="open" value="${args.open ? '0' : '1'}">
        <button class="btn ${args.open ? 'btn-secondary' : 'btn-primary'}" type="submit">
          ${args.open ? 'Close the door · ปิดประตู' : 'Open the door · เปิดประตู'}
        </button>
      </form>`
    : html`<p class="note" style="margin:0">A moderator opens and closes it. <span lang="th">ผู้ดูแลระบบเป็นคนเปิดปิด</span></p>`}
    </section>
    <p class="note">This page refreshes itself every ten seconds. <span lang="th">หน้านี้รีเฟรชเองทุกสิบวินาที</span></p>
    <section>
      ${args.pending.length === 0
    ? html`<p class="empty">Nothing waiting. <span lang="th">ยังไม่มีอะไรรอ</span></p>`
    : args.pending.map((s) => card(s, args.csrf))}
    </section>
    ${decidedSections(args.decided, args.locale, args.csrf)}
    <script>
      // The stage is not the place to press F5. A quiet reload, unless a
      // form is mid-flight.
      setTimeout(function () { if (!document.activeElement || document.activeElement.tagName !== 'BUTTON') location.reload(); }, 10000);
    </script>`;

  return layout(
    {
      title: 'Stories',
      locale: args.locale,
      hostName: args.hostName,
      reviewer: args.reviewer,
      signedIn: true,
      activeNav: 'stories',
      canModerate: args.canModerate,
      path: '/console/stories',
    },
    body,
  );
}
