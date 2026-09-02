/**
 * The statement page, and the public page an auditor opens.
 *
 * The ESG page answers a funder in filing season. This answers the narrower
 * question a hotel's sustainability lead asks: what can I attach to the report
 * I already file, and what happens when somebody checks it?
 *
 * So there are two pages here. The console one drafts, issues and lists. The
 * public one, at /verify/:id, is the same record laid out for a stranger: no
 * nav, no session, the digest in full, and the four refusals with the same
 * weight as the figures. A reader who takes the verified count and calls it
 * a carbon saving has been failed by the page.
 */

import {
  PILLAR_LABEL, statementHeadline, type ActivityStatement, type StatementBody,
} from '@chivago/core';
import { esc, html, layout, type Raw } from './html.ts';
import type { Locale } from './i18n.ts';

const kg = (n: number | null): string =>
  n === null ? '—' : `${n.toLocaleString('en-US', { maximumFractionDigits: 1 })} kg`;

function figure(value: string, label: string, thai: string, tone: 'lead' | 'plain' = 'plain'): Raw {
  return html`
    <div class="figure ${tone === 'lead' ? 'figure--lead' : ''}">
      <div class="figure__value">${value}</div>
      <div class="figure__label">${label}</div>
      <div class="figure__label figure__label--th">${thai}</div>
    </div>`;
}

function figures(s: StatementBody): Raw {
  return html`
    <section class="figures" style="display:flex;gap:24px;flex-wrap:wrap;margin:16px 0">
      ${figure(String(s.verified), 'Activities verified', 'กิจกรรมที่ตรวจผ่าน', 'lead')}
      ${figure(String(s.participants), 'People, counted once', 'จำนวนคน นับคนละครั้ง')}
      ${figure(String(s.refused), 'Proofs refused', 'หลักฐานที่ไม่ผ่าน')}
      ${figure(kg(s.weightKg), 'On approved proofs', 'น้ำหนักบนหลักฐานที่ผ่าน')}
    </section>`;
}

function lines(s: StatementBody): Raw {
  if (s.lines.length === 0) {
    return html`<p class="note">No verified activity in this period. <span lang="th">ยังไม่มีกิจกรรมที่ตรวจผ่านในช่วงนี้</span></p>`;
  }
  return html`
    <table>
      <thead>
        <tr><th>Day</th><th>Activity</th><th>Pillar</th><th>Verified</th><th>Weight</th></tr>
      </thead>
      <tbody>
        ${s.lines.map((l) => html`
          <tr>
            <td>${esc(l.day)}</td>
            <td>${esc(l.name.en)} · <span lang="th">${esc(l.name.th)}</span></td>
            <td>${l.pillar ? esc(PILLAR_LABEL[l.pillar].en) : '—'}</td>
            <td><strong>${l.verified}</strong></td>
            <td>${kg(l.weightKg)}</td>
          </tr>`)}
      </tbody>
    </table>`;
}

/**
 * Equal weight with the figures, never a footnote. Four here: the ESG three
 * and the one a hotel most needs to hear.
 */
function refusals(s: StatementBody): Raw {
  return html`
    <section class="panel panel--muted">
      <h2>What this statement does not claim · สิ่งที่รายการนี้ไม่ได้อ้าง</h2>
      <ul>
        ${s.notClaimable.map((n) => html`
          <li>${esc(n.en)} <span lang="th" class="note">${esc(n.th)}</span></li>`)}
      </ul>
    </section>`;
}

function boundary(s: StatementBody): Raw {
  return html`
    <section class="panel panel--muted">
      <h2>What is counted · ขอบเขต</h2>
      <p>${esc(s.boundary.en)} <span lang="th">${esc(s.boundary.th)}</span></p>
      <p class="note">${esc(s.assurance.en)} <span lang="th">${esc(s.assurance.th)}</span></p>
    </section>`;
}

const publicUrl = (origin: string, id: string): string => `${origin}/verify/${encodeURIComponent(id)}`;

export function statementPage(args: {
  locale: Locale;
  hostName: string;
  reviewer: string | null;
  canModerate: boolean;
  draft: StatementBody;
  issued: ActivityStatement[];
  csrf: string;
  origin: string;
  /** The id just issued, so the row is pointed at rather than hunted for. */
  justIssued: string | null;
}): string {
  const { locale, draft } = args;
  const th = locale === 'th';
  const headline = statementHeadline(draft);

  const body = html`
    <h1>Statement of verified activity <span lang="th" class="muted">· รายการกิจกรรมที่ตรวจผ่าน</span></h1>
    <p class="lede">
      What ${esc(draft.host.name)} verified, for a period, as a record anyone can check.
      A hotel attaches it to the report it already files; it replaces nothing there.
      <span lang="th">สิ่งที่ ${esc(draft.host.name)} ตรวจผ่านในช่วงเวลาหนึ่ง เป็นบันทึกที่ใครก็ตรวจสอบได้ โรงแรมใช้แนบกับรายงานที่ทำอยู่แล้ว ไม่ได้แทนที่อะไรในนั้น</span>
    </p>

    <!--
      The period first, as a form, because the draft below is meaningless
      without it and the reader is about to choose it.
    -->
    <form method="get" action="/console/statement" style="display:flex;gap:12px;align-items:end;flex-wrap:wrap;margin:16px 0">
      <div class="field">
        <label for="from">From · ตั้งแต่</label>
        <input class="input" type="date" id="from" name="from" value="${esc(draft.period.from)}" required>
      </div>
      <div class="field">
        <label for="to">To · ถึง</label>
        <input class="input" type="date" id="to" name="to" value="${esc(draft.period.to)}" required>
      </div>
      <button class="btn btn-secondary" type="submit">Show · แสดง</button>
    </form>

    <section class="panel">
      <p class="kicker">Draft · ฉบับร่าง — nothing is on record until it is issued</p>
      <p class="lede"><strong>${esc(draft.period.from)} → ${esc(draft.period.to)}</strong></p>
      <p class="lede">${esc(th ? headline.th : headline.en)}</p>
      ${figures(draft)}
      ${lines(draft)}
    </section>

    ${boundary(draft)}
    ${refusals(draft)}

    <!--
      Issuing is a POST with the period repeated, so the thing issued is the
      thing on screen and not whatever the query string says by then.
    -->
    <form method="post" action="/console/statement" style="margin:24px 0">
      <input type="hidden" name="csrf" value="${esc(args.csrf)}">
      <input type="hidden" name="from" value="${esc(draft.period.from)}">
      <input type="hidden" name="to" value="${esc(draft.period.to)}">
      <button class="btn btn-primary" type="submit">Issue this statement · ออกรายการนี้</button>
      <p class="note" style="margin-top:8px">
        Issuing writes it down for good, with a public id and a digest. It cannot be edited afterwards — only followed by another.
        <span lang="th">เมื่อออกแล้วจะบันทึกถาวร พร้อมรหัสสาธารณะและค่า digest แก้ไขภายหลังไม่ได้ ทำได้เพียงออกรายการใหม่</span>
      </p>
    </form>

    <section class="panel">
      <h2>Issued · ที่ออกแล้ว</h2>
      ${args.issued.length === 0
    ? html`<p class="note">Nothing issued yet. <span lang="th">ยังไม่มีรายการที่ออก</span></p>`
    : html`
      <table>
        <thead>
          <tr><th>Id</th><th>Period</th><th>Issued</th><th>Verified</th><th>Digest</th><th>Check</th></tr>
        </thead>
        <tbody>
          ${args.issued.map((s) => html`
            <tr ${s.id === args.justIssued ? 'style="outline:2px solid var(--color-text)"' : ''}>
              <td><code>${esc(s.id)}</code></td>
              <td>${esc(s.period.from)} → ${esc(s.period.to)}</td>
              <td>${esc(s.issuedAt.slice(0, 10))}${s.issuedBy ? html` · ${esc(s.issuedBy)}` : ''}</td>
              <td><strong>${s.verified}</strong></td>
              <td><code title="${esc(s.digest)}">${esc(s.digest.slice(0, 12))}…</code></td>
              <td><a href="${esc(publicUrl(args.origin, s.id))}">${esc(publicUrl(args.origin, s.id))}</a></td>
            </tr>`)}
        </tbody>
      </table>
      <p class="note">
        Print the id and the full digest on the report. Anyone who opens the link can compare.
        <span lang="th">พิมพ์รหัสและค่า digest เต็มลงในรายงาน ใครเปิดลิงก์ก็เทียบได้</span>
      </p>`}
    </section>`;

  return layout(
    {
      title: 'Statement',
      locale,
      hostName: args.hostName,
      reviewer: args.reviewer,
      signedIn: true,
      activeNav: 'statement',
      canModerate: args.canModerate,
      path: '/console/statement',
    },
    body,
  );
}

/**
 * The public page. No session, no nav: a stranger holding a hotel's report
 * and an id. Bilingual inline rather than switchable, because the language
 * cookie lives under /console and this page does not.
 */
export function verifyPage(locale: Locale, s: ActivityStatement, origin: string): string {
  const headline = statementHeadline(s);
  const body = html`
    <p class="kicker">ChivaGo · Statement of verified activity · รายการกิจกรรมที่ตรวจผ่าน</p>
    <h1>${esc(s.host.name)}</h1>
    <p class="lede"><strong>${esc(s.period.from)} → ${esc(s.period.to)}</strong> · <code>${esc(s.id)}</code></p>
    <p class="lede">${esc(headline.en)} <span lang="th">${esc(headline.th)}</span></p>

    ${figures(s)}
    <section class="panel">
      <h2>Every line · รายบรรทัด</h2>
      ${lines(s)}
    </section>

    ${boundary(s)}
    ${refusals(s)}

    <section class="panel">
      <h2>How to check this · วิธีตรวจสอบ</h2>
      <p>
        Compare the id and the digest printed on the report with the ones here. The digest is
        SHA-256 of the canonical JSON at <a href="${esc(`${origin}/statements/${encodeURIComponent(s.id)}`)}">${esc(`${origin}/statements/${s.id}`)}</a>,
        which anyone can fetch and recompute.
        <span lang="th">เทียบรหัสและค่า digest ที่พิมพ์ในรายงานกับที่แสดงตรงนี้ ค่า digest คือ SHA-256 ของ JSON มาตรฐานตามลิงก์ ซึ่งใครก็ดึงมาคำนวณซ้ำได้</span>
      </p>
      <p><code style="display:block;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;line-height:1.6;word-break:break-all;padding:10px 12px;border:1px solid var(--color-neutral-400)">${esc(s.digest)}</code></p>
      <p class="note">
        Issued ${esc(s.issuedAt)}${s.issuedBy ? html` by ${esc(s.issuedBy)}` : ''}. A statement is never edited; a correction is a new statement with a new id.
        What the digest proves is that the paper matches this record. What the record rests on is a named reviewer approving geotagged proof, and that is stated above, not assumed.
        <span lang="th">ออกเมื่อ ${esc(s.issuedAt)} รายการไม่มีการแก้ไข การแก้คือการออกรายการใหม่ digest พิสูจน์ว่ากระดาษตรงกับบันทึกนี้ ส่วนบันทึกนี้ตั้งอยู่บนการที่ผู้ตรวจที่ระบุชื่อได้อนุมัติหลักฐานที่มีพิกัด ซึ่งระบุไว้ข้างต้น ไม่ได้สมมติเอา</span>
      </p>
    </section>`;

  return layout({ title: `Statement ${s.id}`, locale, hostName: s.host.name, signedIn: false, publicPage: true }, body);
}

export function statementMissingPage(locale: Locale, id: string): string {
  const body = html`
    <p class="kicker">ChivaGo · Statement of verified activity</p>
    <h1>No statement has this id</h1>
    <p class="lede"><code>${esc(id)}</code></p>
    <p>
      Check the id on the report for a misread character: the alphabet has no I, L, O or U.
      A statement that was never issued has no page, and one that was issued is never removed.
      <span lang="th">ตรวจรหัสในรายงานอีกครั้ง ตัวอักษรชุดนี้ไม่มี I, L, O และ U รายการที่ไม่เคยออกจะไม่มีหน้า และรายการที่ออกแล้วจะไม่ถูกลบ</span>
    </p>`;
  return layout({ title: 'No such statement', locale, hostName: 'Statement', signedIn: false, publicPage: true }, body);
}
