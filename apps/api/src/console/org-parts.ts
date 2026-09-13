/**
 * The two pieces the sponsor page and the ESG page both need.
 *
 * They sit here rather than in either file because a funder's name and the
 * standing of their money have to read identically on both - the same
 * organisation seen twice, saying two different things about whether a
 * contract exists, is exactly the drift these pages cannot afford.
 */

import type { FundingBasis, Sponsor } from '@chivago/core';
import { esc, html, type Raw } from './html.ts';

/**
 * Which organisation is being read, when there is more than one.
 *
 * A plain list of links rather than a select: a console page that needs
 * JavaScript to change what it shows is a page that fails on the venue wifi,
 * and every other navigation in this console is a link.
 */
export function orgPicker(organisations: Sponsor[], currentId: string, path: string): Raw {
  if (organisations.length < 2) return html``;
  return html`
    <nav class="orgs" aria-label="Organisation">
      ${organisations.map((o) => (o.id === currentId
    ? html`<span class="orgs__current" aria-current="true">${esc(o.name.en)}</span>`
    : html`<a href="${path}?org=${encodeURIComponent(o.id)}">${esc(o.name.en)}</a>`))}
    </nav>`;
}

/**
 * Whether the money on this page rests on anything.
 *
 * Said at the top, beside the figures, never in a footnote. The whole reason
 * the organisations table was safe to build is that a row can say it is only
 * somebody's entry, and a page that knows that and does not print it has
 * given the reassurance away again.
 */
export function basisNote(basis: FundingBasis): Raw {
  if (basis === 'signed') {
    return html`
      <p class="basis basis--signed">
        Funding figures on this page come from a signed agreement.
        <span lang="th">ตัวเลขงบในหน้านี้มาจากข้อตกลงที่ลงนามแล้ว</span>
      </p>`;
  }
  return html`
    <p class="basis basis--declared">
      <strong>Declared, not signed.</strong>
      The funding figures here were entered in the console and no agreement stands
      behind them. The verified counts below them are read from the ledger and are
      not affected by that.
      <span lang="th">
        <strong>เป็นตัวเลขที่กรอกไว้ ยังไม่มีสัญญา</strong>
        ยอดงบในหน้านี้กรอกผ่านคอนโซล ยังไม่มีข้อตกลงรองรับ ส่วนจำนวนที่ผ่านการตรวจด้านล่างอ่านจากบัญชีจริงและไม่เกี่ยวกัน
      </span>
    </p>`;
}
