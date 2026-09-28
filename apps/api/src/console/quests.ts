/**
 * What each quest was agreed to be measured by, and what it reads.
 *
 * WHY THIS IS A CONSOLE PAGE AND NOT AN APP SCREEN. A KPI is an agreement
 * between a host and a partner, not a score a traveller plays against. Put
 * "15 kg to target" on a phone and the next weight a host types is under
 * pressure to reach it, which breaks the only measurement on the page. The
 * person who needs the target is the person who enters the number, and they
 * are here.
 *
 * Setting one is a moderator's act, like funding. Reading it is every host's,
 * because a host entering a weight should know what it is being counted for.
 */

import {
  FACT_QUESTION, FRAMEWORK_LABEL, MEASURE, PLACEMENT_LIMIT, QUEST_MEASURES, STANDING_LABEL,
  VALIDATION_LIMIT, VALIDATION_VS_VERIFICATION, VERDICT_LABEL,
  kpiHeadline, type KpiMeasure, type QuestKpiReadingView,
} from './quest-kpi-types.ts';
import { esc, html, layout, type Raw } from './html.ts';
import type { Locale } from './i18n.ts';

const num = (n: number | null): string =>
  n === null ? '—' : n.toLocaleString('en-US', { maximumFractionDigits: 2 });

const pct = (share: number | null): string =>
  share === null ? '—' : `${Math.round(share * 100)}%`;

/**
 * The plan column.
 *
 * A locked plan shows the date and, when it is not zero, the count of
 * activities already verified when it was fixed. That number is the reason
 * the column exists: without it "locked" would read the same whether the plan
 * preceded the results or followed them.
 */
/**
 * The filing cell. One word of verdict and the line it is about.
 *
 * A quest nobody has said where they will report is "not placed", which is a
 * statement about the record and not a grade: most quests will never be
 * filed anywhere, and a column that read as a failure for all of them would
 * teach everybody to ignore it.
 */
function filingCell(q: QuestKpiReadingView, th: boolean): Raw {
  const pf = q.preflight;
  if (pf.state === 'no_intent') return html`<span class="muted">${th ? 'ยังไม่ได้ระบุ' : 'Not placed'}</span>`;
  const where = `${FRAMEWORK_LABEL[pf.intent.framework]} ${pf.intent.line}`;
  if (pf.state === 'no_measure') {
    return html`${esc(where)}<br><span class="muted">${th ? 'ยังไม่มีตัวชี้วัดให้วาง' : 'No KPI to place'}</span>`;
  }
  const v = VERDICT_LABEL[pf.placement.verdict];
  const label = esc(th ? v.th : v.en);
  return html`${esc(where)}<br>${pf.placement.verdict === 'refuses' ? html`<strong>${label}</strong>` : label}`;
}

function planCell(q: QuestKpiReadingView, th: boolean): Raw {
  const label = esc(th ? STANDING_LABEL[q.standing].th : STANDING_LABEL[q.standing].en);
  if (q.standing === 'unfixed') return html`<span class="muted">${label}</span>`;
  const when = q.lockedAt === null ? '' : html`<br><span class="muted">${esc(q.lockedAt.slice(0, 10))}</span>`;
  const after = q.standing === 'fixed_after' && q.verifiedAtLock !== null
    ? html`<br><span class="muted">${esc(String(q.verifiedAtLock))} already verified</span>`
    : '';
  return html`${q.standing === 'fixed_before' ? html`<strong>${label}</strong>` : label}${when}${after}`;
}

export function questsPage(args: {
  locale: Locale;
  hostName: string;
  canModerate: boolean;
  csrf: string;
  quests: QuestKpiReadingView[];
  period: { from: string; to: string };
}): string {
  const { locale, hostName, canModerate, csrf, quests, period } = args;
  const th = locale === 'th';
  const withKpi = quests.filter((q) => q.reading !== null);
  // Only a quest with an indicator has a plan to fix, and only one that is
  // not already locked can be locked. A superseded quest is lockable again.
  const lockable = withKpi.filter((q) => q.standing === 'unfixed' || q.standing === 'superseded');
  // Every quest somebody has said where they will report, placed or not.
  const placed = quests.filter((q) => q.preflight.state !== 'no_intent');
  const locked = quests.filter((q) => q.standing === 'fixed_before' || q.standing === 'fixed_after');

  return layout({
    locale,
    hostName,
    title: 'Quests & KPI',
    signedIn: true,
    activeNav: 'quests',
    canModerate,
    path: '/console/quests',
  }, html`
    <h1>Quests &amp; KPI · ภารกิจและตัวชี้วัด</h1>
    <p class="muted">
      ${esc(period.from)} → ${esc(period.to)} ·
      ${withKpi.length} of ${quests.length} ${quests.length === 1 ? 'quest has' : 'quests have'} an agreed indicator
    </p>

    <!--
      A quest with no agreed indicator is listed first-class rather than
      hidden. It has not failed a measurement; nobody gave it one, and the
      framework note is explicit that the indicator is settled BEFORE the
      project runs. A page that only listed the measured ones would make the
      gap invisible on exactly the screen that can close it.
    -->
    ${quests.length === 0
    ? html`<p class="note">No quests yet. <span lang="th">ยังไม่มีภารกิจ</span></p>`
    : html`
    <div class="scroll">
      <table>
        <thead>
          <tr>
            <th>Quest · ภารกิจ</th>
            <th>Indicator · ตัวชี้วัด</th>
            <th>Baseline</th>
            <th>Measured</th>
            <th>Target</th>
            <th>Of target</th>
            <th>Plan · แผน</th>
            <th>Filed under · จะยื่นที่</th>
          </tr>
        </thead>
        <tbody>
          ${quests.map((q) => q.reading === null
    ? html`
          <tr>
            <td>${esc(th ? q.nameTh : q.nameEn)}<br><code class="muted">${esc(q.questId)}</code></td>
            <!-- Five: indicator, baseline, measured, target, of target. The
                 plan cell that follows is the sixth and keeps its column. -->
            <td colspan="5" class="muted">
              No indicator agreed · ยังไม่ได้ตกลงตัวชี้วัด
            </td>
            <td>${planCell(q, th)}</td>
            <td>${filingCell(q, th)}</td>
          </tr>`
    : html`
          <tr>
            <td>${esc(th ? q.nameTh : q.nameEn)}<br><code class="muted">${esc(q.questId)}</code></td>
            <td>
              ${esc(th ? MEASURE[q.reading.measure].label.th : MEASURE[q.reading.measure].label.en)}
              <span class="muted">· ${esc(th ? q.reading.unit.th : q.reading.unit.en)}</span>
            </td>
            <td>${esc(num(q.reading.baseline))}</td>
            <td><strong>${esc(num(q.reading.observed))}</strong></td>
            <td>${esc(num(q.reading.target))}</td>
            <td>${esc(pct(q.reading.ofTarget))}</td>
            <td>${planCell(q, th)}</td>
            <td>${filingCell(q, th)}</td>
          </tr>`)}
        </tbody>
      </table>
    </div>`}

    ${withKpi.length === 0 ? '' : html`
    <section class="panel panel--muted">
      <h2>What each figure is, and is not · ที่มาและข้อจำกัด</h2>
      <!--
        The refusals travel with the numbers rather than living in a manual.
        A host reading "185 kg" and calling it a carbon saving has been failed
        by the page.
      -->
      ${withKpi.map((q) => html`
        <h3>${esc(th ? q.nameTh : q.nameEn)}</h3>
        <p class="lede">${esc(kpiHeadline(q.reading!, locale))}</p>
        ${q.reading!.notes.map((n) => html`<p class="note">${esc(th ? n.th : n.en)}</p>`)}`)}
    </section>`}

    ${!canModerate ? '' : html`
    <section class="panel">
      <h2>Agree an indicator · ตกลงตัวชี้วัด</h2>
      <p class="note">
        Settled before the project runs, beside the evidence level. A quest
        given a target afterwards has a target chosen to suit the result.
        <span lang="th">ตกลงก่อนเริ่มโครงการ เคียงกับระดับหลักฐาน</span>
      </p>
      <form method="post" action="/console/quests/kpi">
        <input type="hidden" name="csrf" value="${esc(csrf)}">
        <p>
          <label>Quest · ภารกิจ<br>
            <select name="questId">
              ${quests.map((q) => html`
                <option value="${esc(q.questId)}">${esc(th ? q.nameTh : q.nameEn)}</option>`)}
            </select>
          </label>
        </p>
        <p>
          <label>Indicator · ตัวชี้วัด<br>
            <select name="measure">
              <option value="">— none · ไม่ตกลงตัวชี้วัด —</option>
              ${QUEST_MEASURES.map((m: KpiMeasure) => html`
                <option value="${esc(m)}">${esc(th ? MEASURE[m].label.th : MEASURE[m].label.en)}
                  (${esc(th ? MEASURE[m].unit.th : MEASURE[m].unit.en)})</option>`)}
            </select>
          </label>
        </p>
        <p>
          <label>Baseline · ค่าเริ่มต้น <span class="muted">(optional)</span><br>
            <input name="baseline" type="number" step="any" min="0"></label>
        </p>
        <p>
          <label>Target · เป้าหมาย <span class="muted">(optional)</span><br>
            <input name="target" type="number" step="any" min="0"></label>
        </p>
        <p class="actions"><button type="submit">Save · บันทึก</button></p>
      </form>
      <p class="note">
        There is no formula box, on purpose. A free-text formula would let
        <code>attendees × 3.2 kg CO₂e</code> into a contract, and this console
        would print the product of a number it measured and a coefficient it
        has never held.
        <span lang="th">ไม่มีช่องสูตรคำนวณโดยตั้งใจ</span>
      </p>
      <p class="note">
        A quest with a plan locked will refuse this form until the plan is
        superseded below.
        <span lang="th">ภารกิจที่ล็อกแผนไว้แล้วจะไม่รับแบบฟอร์มนี้ จนกว่าจะแทนที่แผนด้านล่าง</span>
      </p>
    </section>

    <section class="panel">
      <h2>Fix the plan · ล็อกแผนการวัด</h2>
      <!--
        The sentence above the indicator form has said since it was written
        that a KPI is settled before the project runs. Nothing enforced it, so
        a target could be chosen once the figure was known and no page could
        tell. This is the enforcement, and the count beside each lock is what
        makes the record worth having.
      -->
      <p class="note">${esc(VALIDATION_VS_VERIFICATION.en)}
        <span lang="th">${esc(VALIDATION_VS_VERIFICATION.th)}</span></p>

      ${lockable.length === 0
    ? html`<p class="note">
        Every quest with an indicator already has its plan locked.
        <span lang="th">ภารกิจที่มีตัวชี้วัดล็อกแผนไว้ครบแล้ว</span>
      </p>`
    : html`
      <form method="post" action="/console/quests/plan/lock">
        <input type="hidden" name="csrf" value="${esc(csrf)}">
        <p>
          <label>Quest · ภารกิจ<br>
            <select name="questId">
              ${lockable.map((q) => html`
                <option value="${esc(q.questId)}">${esc(th ? q.nameTh : q.nameEn)}</option>`)}
            </select>
          </label>
        </p>
        <p class="actions"><button type="submit">Lock the plan · ล็อกแผน</button></p>
      </form>`}

      ${locked.length === 0 ? '' : html`
      <h3>Locked · ที่ล็อกไว้</h3>
      <div class="scroll">
        <table>
          <thead><tr><th>Quest</th><th>Fixed</th><th>Already verified</th><th></th></tr></thead>
          <tbody>
            ${locked.map((q) => html`
              <tr>
                <td>${esc(th ? q.nameTh : q.nameEn)}</td>
                <td>${esc(q.lockedAt?.slice(0, 10) ?? '—')}<br>
                  <span class="muted">${esc(th ? STANDING_LABEL[q.standing].th : STANDING_LABEL[q.standing].en)}</span></td>
                <td>${esc(String(q.verifiedAtLock ?? 0))}</td>
                <td>
                  <form method="post" action="/console/quests/plan/supersede">
                    <input type="hidden" name="csrf" value="${esc(csrf)}">
                    <input type="hidden" name="questId" value="${esc(q.questId)}">
                    <input name="reason" type="text" placeholder="reason · เหตุผล" style="width:150px">
                    <button type="submit" class="danger">Supersede</button>
                  </form>
                </td>
              </tr>`)}
          </tbody>
        </table>
      </div>`}

      <p class="note">${esc(VALIDATION_LIMIT.en)}
        <span lang="th">${esc(VALIDATION_LIMIT.th)}</span></p>
    </section>

    <section class="panel">
      <h2>Where it will be reported · จะยื่นรายงานที่ใด</h2>
      <!--
        Stage three of docs/60. The same rule the review page runs on a pasted
        file, run here while the plan can still change. A wrong line found at
        filing season arrives after the figure exists; found here it costs a
        conversation.

        Three questions, never four. How the figure was measured is not asked:
        on this side every figure is verified by the host who ran it, and that
        is context, not an answer anybody can give differently.
      -->
      <p class="note">${esc(th ? PLACEMENT_LIMIT.th : PLACEMENT_LIMIT.en)}</p>

      ${placed.length === 0 ? '' : placed.map((q) => {
    const pf = q.preflight;
    if (pf.state !== 'placed') {
      return pf.state === 'no_measure' ? html`
      <div style="border-left:6px solid var(--color-text);padding:8px 0 8px 16px;margin:16px 0">
        <p style="margin:0"><strong>${esc(th ? q.nameTh : q.nameEn)}</strong>
          · ${esc(FRAMEWORK_LABEL[pf.intent.framework])} ${esc(pf.intent.line)}</p>
        <p style="margin:6px 0 0">
          A line is named but no KPI is agreed, so there is no figure to place on it yet.
          Agree the indicator above first.
          <span lang="th">ระบุรายการแล้วแต่ยังไม่ได้ตกลงตัวชี้วัด จึงยังไม่มีตัวเลขให้วาง ตกลงตัวชี้วัดด้านบนก่อน</span>
        </p>
      </div>` : '';
    }
    const p = pf.placement;
    const v = VERDICT_LABEL[p.verdict];
    return html`
      <div style="border-left:6px solid var(--color-text);padding:8px 0 8px 16px;margin:16px 0">
        <p style="margin:0"><strong>${esc(th ? q.nameTh : q.nameEn)}</strong>
          · ${esc(FRAMEWORK_LABEL[p.framework])} ${esc(p.line)}
          · <strong>${esc(th ? v.th : v.en)}</strong></p>
        <p style="margin:6px 0 0">${esc(th ? p.because.th : p.because.en)}</p>
        ${p.ask === null ? '' : html`
        <p style="margin:8px 0 0"><strong>${th ? 'ถามเขาว่า' : 'Ask them'}</strong><br>
          ${esc(th ? p.ask.th : p.ask.en)}</p>`}
        ${p.conditions.length === 0 ? '' : html`
        <ul>${p.conditions.map((cnd) => html`<li>${esc(th ? cnd.th : cnd.en)}</li>`)}</ul>`}
        ${p.insteadTry.length === 0 ? '' : html`
        <p style="margin:8px 0 2px"><strong>${th ? 'ใส่ที่ใดได้บ้าง' : 'Where it could go instead'}</strong></p>
        <ul>${p.insteadTry.map((i) => html`<li>${esc(th ? i.th : i.en)}</li>`)}</ul>`}
        ${p.source === null ? '' : html`
        <p class="note" style="margin:6px 0 0">
          “${esc(p.source.clause)}” — ${esc(p.source.where)}.
          ${esc(p.readingAgeDays === 1 ? 'Read 1 day ago' : `Read ${p.readingAgeDays} days ago`)}${p.stale ? html` · <strong>THIS READING IS OUT OF DATE</strong>` : ''}.
        </p>`}
      </div>`;
  })}

      <h3>Say where it will be reported · ระบุที่จะยื่น</h3>
      <form method="post" action="/console/quests/intent">
        <input type="hidden" name="csrf" value="${esc(csrf)}">
        <p>
          <label>Quest · ภารกิจ<br>
            <select name="questId">
              ${quests.map((q) => html`
                <option value="${esc(q.questId)}">${esc(th ? q.nameTh : q.nameEn)}</option>`)}
            </select></label>
        </p>
        <p>
          <label>Standard · มาตรฐาน<br>
            <select name="framework">
              <option value="gri">${esc(FRAMEWORK_LABEL.gri)}</option>
              <option value="ifrs_s">${esc(FRAMEWORK_LABEL.ifrs_s)}</option>
              <option value="ghg_protocol">${esc(FRAMEWORK_LABEL.ghg_protocol)}</option>
              <option value="sec_56_1">${esc(FRAMEWORK_LABEL.sec_56_1)}</option>
            </select></label>
          <!--
            A free-text line, not a dropdown of codes. docs/60 names the
            dropdown as the one thing never to build: the moment a list is
            offered, somebody picks the nearest one and the layer's whole
            contribution - asking whether it belongs there at all - is gone.
          -->
          <label style="margin-left:12px">Line · รายการ<br>
            <input name="line" type="text" placeholder="306-3" style="width:110px" required></label>
        </p>
        <p><label>${esc(th ? FACT_QUESTION.materialOrigin.th : FACT_QUESTION.materialOrigin.en)}<br>
          <select name="materialOrigin">
            <option value="unknown">${th ? 'ยังไม่ได้ตอบ' : 'Not answered yet'}</option>
            <option value="own_operations">${th ? 'การดำเนินงานของเขาเอง' : 'Their own operations'}</option>
            <option value="third_party">${th ? 'ผู้อื่นเป็นผู้ทิ้ง' : 'Somebody else discarded it'}</option>
            <option value="mixed">${th ? 'ทั้งสองอย่าง' : 'Both'}</option>
          </select></label></p>
        <p><label>${esc(th ? FACT_QUESTION.organisationRole.th : FACT_QUESTION.organisationRole.en)}<br>
          <select name="organisationRole">
            <option value="unknown">${th ? 'ยังไม่ได้ตอบ' : 'Not answered yet'}</option>
            <option value="generator">${th ? 'เป็นผู้ก่อวัสดุ' : 'Generated the material'}</option>
            <option value="manager">${th ? 'จัดการวัสดุของผู้อื่น' : 'Managed somebody else’s'}</option>
            <option value="funder">${th ? 'เป็นผู้ให้ทุน' : 'Funded it'}</option>
          </select></label></p>
        <p><label>${esc(th ? FACT_QUESTION.insideBoundary.th : FACT_QUESTION.insideBoundary.en)}<br>
          <select name="insideBoundary">
            <option value="unknown">${th ? 'ยังไม่ได้ตอบ' : 'Not answered yet'}</option>
            <option value="yes">${th ? 'อยู่' : 'Yes'}</option>
            <option value="no">${th ? 'ไม่อยู่' : 'No'}</option>
          </select></label></p>
        <p class="actions"><button type="submit">Check it now · ตรวจตอนนี้</button></p>
      </form>
    </section>`}`);
}

export type { QuestKpiReadingView } from './quest-kpi-types.ts';
export const _pct = pct;
