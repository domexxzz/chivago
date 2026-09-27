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

import {
  DECLARED_FACTS_NOTE, FACT_QUESTION, FRAMEWORK_LABEL, MEASURE, PLACEMENT_LIMIT,
  UNIT_UNRECOGNISED, VERDICT_LABEL,
  type ActivityFacts, type DeclaredReview, type Finding, type KpiMeasure, type Placement,
  DECLARED_NOT_VERIFIED,
} from '@chivago/core';
import { esc, html, layout, type Raw } from './html.ts';
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

/**
 * Where they want to file it, and whether it can go there.
 *
 * `docs/60` staged this second on purpose: the rule was built first, and this
 * is where it meets a real file. Two things surfaced immediately and both are
 * visible on the page.
 *
 * THE MEASURE IS READ OFF THEIR UNIT COLUMN AND SHOWN. `measureFromUnit` does
 * not guess, so a sheet in tonnes gets told so rather than silently assessed
 * as kilograms - and the measure it did conclude is printed, so a moderator
 * can see when it concluded the wrong one.
 *
 * ONE OF THE FOUR FACTS IS NOT A QUESTION. A pasted file is self-declared by
 * definition, so `measuredBy` is fixed rather than asked. Asking would invite
 * the answer "verified", which is precisely what `DECLARED_NOT_VERIFIED` at
 * the top of this page exists to refuse.
 */
function placementPanel(
  args: {
    csrf: string; th: boolean; framework: string; line: string;
    facts: ActivityFacts; measure: KpiMeasure | null; placement: Placement | null;
  },
): Raw {
  const { csrf, th, framework, line, facts, measure, placement } = args;
  const sel = (name: string, label: string, thLabel: string,
    options: readonly [string, string, string][], current: string) => html`
    <label>${esc(label)} · ${esc(thLabel)}<br>
      <select name="${esc(name)}">
        ${options.map(([v, en, tha]) => html`
          <option value="${esc(v)}" ${v === current ? 'selected' : ''}>${esc(th ? tha : en)}</option>`)}
      </select></label>`;

  return html`
    <section class="panel">
      <h2>Where they want to file it · เขาจะยื่นตรงไหน</h2>
      <p class="note">${esc(th ? PLACEMENT_LIMIT.th : PLACEMENT_LIMIT.en)}</p>

      <form method="post" action="/console/review">
        <input type="hidden" name="csrf" value="${esc(csrf)}">
        <input type="hidden" name="carry" value="1">
        <p>
          ${sel('framework', 'Standard', 'มาตรฐาน', [
    ['gri', FRAMEWORK_LABEL.gri, FRAMEWORK_LABEL.gri],
    ['ifrs_s', FRAMEWORK_LABEL.ifrs_s, FRAMEWORK_LABEL.ifrs_s],
    ['ghg_protocol', FRAMEWORK_LABEL.ghg_protocol, FRAMEWORK_LABEL.ghg_protocol],
    ['sec_56_1', FRAMEWORK_LABEL.sec_56_1, FRAMEWORK_LABEL.sec_56_1],
  ], framework)}
          <label style="margin-left:12px">Line · รายการ<br>
            <input name="line" type="text" value="${esc(line)}" placeholder="306-3" style="width:110px"></label>
        </p>
        <p>
          ${sel('materialOrigin', 'Whose material', 'วัสดุของใคร', [
    ['unknown', 'Not answered yet', 'ยังไม่ได้ตอบ'],
    ['own_operations', 'Their own operations', 'การดำเนินงานของเขาเอง'],
    ['third_party', 'Somebody else discarded it', 'ผู้อื่นเป็นผู้ทิ้ง'],
    ['mixed', 'Both', 'ทั้งสองอย่าง'],
  ], facts.materialOrigin)}
        </p>
        <p>
          ${sel('organisationRole', 'Their role', 'บทบาทของเขา', [
    ['unknown', 'Not answered yet', 'ยังไม่ได้ตอบ'],
    ['generator', 'Generated the material', 'เป็นผู้ก่อวัสดุ'],
    ['manager', 'Managed somebody else’s', 'จัดการวัสดุของผู้อื่น'],
    ['funder', 'Funded it', 'เป็นผู้ให้ทุน'],
  ], facts.organisationRole)}
        </p>
        <p>
          ${sel('insideBoundary', 'Inside their reported boundary', 'อยู่ในขอบเขตที่รายงาน', [
    ['unknown', 'Not answered yet', 'ยังไม่ได้ตอบ'],
    ['yes', 'Yes', 'อยู่'],
    ['no', 'No', 'ไม่อยู่'],
  ], facts.insideBoundary === true ? 'yes' : facts.insideBoundary === false ? 'no' : 'unknown')}
        </p>
        <p class="note">${esc(th ? DECLARED_FACTS_NOTE.th : DECLARED_FACTS_NOTE.en)}</p>
        <p class="actions"><button type="submit">Check the placement · ตรวจการจัดวาง</button></p>
      </form>

      ${measure === null
    ? html`<p class="note danger" style="padding:12px">
        ${esc(th ? UNIT_UNRECOGNISED.th : UNIT_UNRECOGNISED.en)}
      </p>`
    : html`<p class="note">
        Read from their unit column as
        <strong>${esc(th ? MEASURE[measure].label.th : MEASURE[measure].label.en)}</strong>
        (${esc(th ? MEASURE[measure].unit.th : MEASURE[measure].unit.en)}). If that is the
        wrong reading, the answer below is about the wrong kind of figure.
        <span lang="th">อ่านจากคอลัมน์หน่วยของเขา หากอ่านผิด คำตอบด้านล่างจะเป็นเรื่องตัวเลขคนละชนิด</span>
      </p>`}

      ${placement === null ? '' : html`
      <div style="border-left:6px solid var(--color-text);padding:8px 0 8px 16px;margin:16px 0">
        <p style="margin:0">
          <strong>${esc(th ? VERDICT_LABEL[placement.verdict].th : VERDICT_LABEL[placement.verdict].en)}</strong>
          · ${esc(FRAMEWORK_LABEL[placement.framework])} ${esc(placement.line)}
        </p>
        <p style="margin:6px 0 0">${esc(th ? placement.because.th : placement.because.en)}</p>

        ${placement.ask === null ? '' : html`
        <p style="margin:8px 0 0"><strong>Ask them · ถามเขาว่า</strong><br>
          ${esc(th ? placement.ask.th : placement.ask.en)}</p>`}

        ${placement.conditions.length === 0 ? '' : html`
        <p style="margin:8px 0 2px"><strong>Only if they also state · ต้องระบุด้วยว่า</strong></p>
        <ul>${placement.conditions.map((cnd) => html`<li>${esc(th ? cnd.th : cnd.en)}</li>`)}</ul>`}

        ${placement.insteadTry.length === 0 ? '' : html`
        <p style="margin:8px 0 2px"><strong>Where it could go instead · ใส่ที่ใดได้บ้าง</strong></p>
        <ul>${placement.insteadTry.map((i) => html`<li>${esc(th ? i.th : i.en)}</li>`)}</ul>`}

        ${placement.source === null ? '' : html`
        <p class="note" style="margin:8px 0 0">
          <!--
            The clause travels with the verdict. A refusal a customer cannot
            go and check is an opinion, and this page sells the opposite.
          -->
          “${esc(placement.source.clause)}” — ${esc(placement.source.where)}.
          Read ${esc(placement.source.readOn)} by ${esc(placement.source.readBy)},
          ${esc(placement.readingAgeDays === 1 ? '1 day ago' : `${placement.readingAgeDays} days ago`)}${placement.stale ? html` · <strong>THIS READING IS OUT OF DATE · การอ่านนี้เก่าเกินไปแล้ว</strong>` : ''}.
        </p>
        <p class="note" style="margin:4px 0 0">
          Not checked: ${esc(th ? placement.source.notChecked.th : placement.source.notChecked.en)}
        </p>`}
      </div>`}
    </section>`;
}

export function reviewDeclaredPage(args: {
  locale: Locale;
  hostName: string;
  csrf: string;
  period: { from: string; to: string };
  pasted: string;
  statedTotal: string;
  review: DeclaredReview | null;
  missing: string[];
  /** Where the partner intends to file it. */
  framework: string;
  line: string;
  facts: ActivityFacts;
  /** Read off their unit column, or null when it is not one we measure. */
  measure: KpiMeasure | null;
  placement: Placement | null;
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
    </section>

    ${placementPanel({
    csrf, th, framework: args.framework, line: args.line,
    facts: args.facts, measure: args.measure, placement: args.placement,
  })}`}`);
}
