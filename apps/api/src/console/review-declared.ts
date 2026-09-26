/**
 * The review of a file somebody else sent.
 *
 * IT MUST NOT LOOK LIKE A STATEMENT. The statement page carries a green id, a
 * digest and a verify link, and that visual weight is earned by a host having
 * approved every line under it. This page carries none of them, on purpose:
 * an imported sheet rendered in the statement's clothes would be level 1
 * evidence dressed as level 3, which is the substitution this whole product
 * exists to refuse.
 *
 * So the refusal leads, in the warning style, before a single figure.
 */

import { DECLARED_NOT_VERIFIED, type DeclaredReview, type Finding } from '@chivago/core';
import { esc, html, layout } from './html.ts';
import type { Locale } from './i18n.ts';

const KIND_LABEL: Record<Finding['kind'], [string, string]> = {
  no_activity: ['No activity named', 'ไม่ได้ระบุกิจกรรม'],
  no_date: ['No readable date', 'ไม่มีวันที่ที่อ่านได้'],
  outside_period: ['Outside the period', 'อยู่นอกช่วงเวลา'],
  future_date: ['Dated after today', 'ลงวันที่หลังวันนี้'],
  duplicate_row: ['Identical rows', 'บรรทัดซ้ำกัน'],
  unit_mismatch: ['Mixed units', 'หน่วยไม่ตรงกัน'],
  total_mismatch: ['Total does not match its rows', 'ยอดรวมไม่ตรงกับบรรทัด'],
};

const lines = (f: Finding): string =>
  f.lines.length === 0 ? 'whole file · ทั้งไฟล์'
    : `line${f.lines.length === 1 ? '' : 's'} ${f.lines.join(', ')}`;

export function reviewDeclaredPage(args: {
  locale: Locale;
  hostName: string;
  csrf: string;
  period: { from: string; to: string };
  pasted: string;
  statedTotal: string;
  review: DeclaredReview | null;
  missing: string[];
}): string {
  const { locale, hostName, csrf, period, pasted, statedTotal, review, missing } = args;
  const th = locale === 'th';

  return layout({
    locale,
    hostName,
    title: 'Review a declared file',
    signedIn: true,
    canModerate: true,
    path: '/console/review',
  }, html`
    <h1>Review a declared file · ทบทวนไฟล์ที่องค์กรส่งมา</h1>
    <p class="muted">
      For a partner who already files. Paste their activity sheet; this reports
      what is wrong on the face of it.
      <span lang="th">สำหรับองค์กรที่มีรายงานอยู่แล้ว วางตารางกิจกรรมของเขา</span>
    </p>

    <p class="note danger" style="padding:12px">
      <strong>${esc(th ? 'ไม่ใช่เอกสารรับรอง' : 'This is not a statement')}</strong><br>
      ${esc(th ? DECLARED_NOT_VERIFIED.th : DECLARED_NOT_VERIFIED.en)}
    </p>

    <section class="panel">
      <h2>The file · ไฟล์</h2>
      <form method="post" action="/console/review">
        <input type="hidden" name="csrf" value="${esc(csrf)}">
        <p>
          <label>Period from · ตั้งแต่
            <input name="from" type="date" value="${esc(period.from)}"></label>
          <label style="margin-left:12px">to · ถึง
            <input name="to" type="date" value="${esc(period.to)}"></label>
        </p>
        <p>
          <label>Total the report states · ยอดที่รายงานระบุ
            <span class="muted">(optional)</span><br>
            <input name="statedTotal" type="number" step="any" value="${esc(statedTotal)}"></label>
        </p>
        <p>
          <label>Paste the sheet · วางตาราง (CSV)<br>
            <textarea name="sheet" rows="10"
              placeholder="activity,date,participants,amount,unit">${esc(pasted)}</textarea></label>
        </p>
        <p class="note">
          Columns are matched by name, in any order, in Thai or English:
          <code>activity / กิจกรรม</code>, <code>date / วันที่</code>,
          <code>participants / ผู้เข้าร่วม</code>, <code>amount / จำนวน</code>,
          <code>unit / หน่วย</code>. Activity and date are required.
        </p>
        <p class="actions"><button type="submit">Review · ทบทวน</button></p>
      </form>
    </section>

    ${missing.length > 0
    ? html`
    <section class="panel">
      <h2>The file could not be read · อ่านไฟล์ไม่ได้</h2>
      <!--
        Refused rather than guessed at. A parser that assumed the third column
        was the date would silently review the wrong numbers, which is the one
        failure worse than saying no.
      -->
      <p class="note danger" style="padding:12px">
        These columns are missing: <strong>${esc(missing.join(', '))}</strong>.
        Nothing was reviewed — guessing which column holds what would review
        the wrong numbers silently.
        <span lang="th">ไม่ได้ทบทวนอะไรเลย การเดาว่าคอลัมน์ไหนคืออะไรจะทำให้ทบทวนตัวเลขผิดโดยเงียบ ๆ</span>
      </p>
    </section>` : ''}

    ${review === null ? '' : html`
    <section class="panel">
      <h2>What the file says about itself · สิ่งที่ไฟล์บอก</h2>
      <section class="figures">
        <div class="figure figure--lead">
          <div class="figure__value">${review.rows}</div>
          <div class="figure__label">Rows read</div>
          <div class="figure__label figure__label--th">บรรทัดที่อ่านได้</div>
        </div>
        <div class="figure">
          <div class="figure__value">${review.findings.length}</div>
          <div class="figure__label">Findings</div>
          <div class="figure__label figure__label--th">ข้อสังเกต</div>
        </div>
        <div class="figure">
          <div class="figure__value">${review.clean}</div>
          <div class="figure__label">Nothing wrong on the face of it</div>
          <div class="figure__label figure__label--th">ไม่พบข้อผิดบนหน้าไฟล์</div>
        </div>
      </section>
      <!--
        "Nothing wrong on the face of it" and not "clean" or "verified". The
        label is the finding: a row this review cannot fault is still a row
        nobody checked.
      -->
      <p class="note">
        A row with nothing wrong on the face of it is still a row nobody
        verified. This review reads the file, not the world.
        <span lang="th">บรรทัดที่ไม่พบข้อผิด ก็ยังเป็นบรรทัดที่ไม่มีใครตรวจสอบ</span>
      </p>
    </section>

    <section class="panel">
      <h2>Findings · ข้อสังเกต</h2>
      ${review.findings.length === 0
    ? html`<p class="note">Nothing wrong on the face of this file.
             <span lang="th">ไม่พบข้อผิดบนหน้าไฟล์นี้</span></p>`
    : html`
      <table>
        <thead><tr><th>What</th><th>Where</th><th>Detail</th></tr></thead>
        <tbody>
          ${review.findings.map((f) => html`
            <tr>
              <td><strong>${esc(th ? KIND_LABEL[f.kind][1] : KIND_LABEL[f.kind][0])}</strong></td>
              <td><code>${esc(lines(f))}</code></td>
              <td>${esc(th ? f.detail.th : f.detail.en)}</td>
            </tr>`)}
        </tbody>
      </table>`}
    </section>`}`);
}
