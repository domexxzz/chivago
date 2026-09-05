/**
 * The stories waiting for a host.
 *
 * The page a team member has open on stage: what has come in at the places
 * this host reviews, oldest first, each with its poster and its caption and
 * two buttons. Approve puts it on the pin and the big screen; hide keeps it
 * off. Nothing on this page is public until one of those is pressed.
 */

import { esc, html, layout, type Raw } from './html.ts';
import type { Locale } from './i18n.ts';
import type { PendingStory } from '../story-service.ts';

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

export function storiesPage(args: {
  locale: Locale;
  hostName: string;
  reviewer: string | null;
  canModerate: boolean;
  pending: PendingStory[];
  csrf: string;
  open: boolean;
}): string {
  const body = html`
    <h1>Stories waiting <span lang="th" class="muted">· สตอรี่ที่รอตรวจ</span></h1>
    <p class="lede">
      What people at the places you host have sent. Nothing here is on a pin or a screen until you press Approve.
      <span lang="th">สิ่งที่คนที่อยู่ตรงสถานที่ที่คุณดูแลส่งมา จะไม่ขึ้นหมุดหรือจอจนกว่าจะกด Approve</span>
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
