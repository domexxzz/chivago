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
  MEASURE, QUEST_MEASURES, STANDING_LABEL, VALIDATION_LIMIT, VALIDATION_VS_VERIFICATION,
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
    </section>`}`);
}

export type { QuestKpiReadingView } from './quest-kpi-types.ts';
export const _pct = pct;
