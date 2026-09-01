/**
 * The sponsor's page.
 *
 * A sponsor funds quests and is entitled to know what the money did. Every
 * platform in this space answers that with reach and joins, because those
 * arrive early and look large. This page answers it with the number they are
 * actually buying — a submission a named host approved — and puts the large
 * numbers below it, labelled as not that.
 *
 * `sponsorOutcome` in core does the arithmetic and refuses to inflate; this
 * file only lays it out. The ordering here is the argument: verified first,
 * money to hosts second, joins last, and what is NOT measured on the same page
 * rather than in a footnote nobody scrolls to.
 */

import { sponsorHeadline, type SponsorOutcome } from '@chivago/core';
import { esc, html, layout, type Raw } from './html.ts';
import type { Locale } from './i18n.ts';

const baht = (n: number): string => `${n.toLocaleString('en-US')} THB`;

/** A figure with its label, and nothing implied about it. */
function figure(value: string, label: string, thai: string, tone: 'lead' | 'plain' = 'plain'): Raw {
  return html`
    <div class="figure ${tone === 'lead' ? 'figure--lead' : ''}">
      <div class="figure__value">${value}</div>
      <div class="figure__label">${label}</div>
      <div class="figure__label figure__label--th">${thai}</div>
    </div>`;
}

export function sponsorPage(
  locale: Locale,
  hostName: string,
  reviewer: string | null,
  outcome: SponsorOutcome,
  questRows: { questId: string; name: string; joined: number; verified: number; fundedTHB: number }[],
): string {
  const th = locale === 'th';
  const headline = sponsorHeadline(outcome);

  const body = html`
    <h1>${esc(outcome.sponsor.name[locale])}</h1>
    <p class="lede">${esc(th ? headline.th : headline.en)}</p>

    <!--
      Verified leads, and it is the only figure given the lead treatment. The
      three below it are context. A page that gave "started" the same weight
      would be describing effort as though it were delivery.
    -->
    <section class="figures">
      ${figure(String(outcome.verified), 'Verified by a host', 'ผ่านการตรวจโดยผู้จัด', 'lead')}
      ${figure(baht(outcome.toCommunityTHB), 'Reached hosts', 'ถึงมือผู้จัด')}
      ${figure(
    outcome.costPerVerifiedTHB === null ? '—' : baht(outcome.costPerVerifiedTHB),
    'Per verified action', 'ต่อหนึ่งภารกิจที่ผ่าน',
  )}
      ${figure(String(outcome.joined), 'Started', 'เริ่มแล้ว')}
    </section>

    <section class="panel">
      <h2>Where the money is · เงินอยู่ที่ไหน</h2>
      <table>
        <tbody>
          <tr><th>Committed · ที่ให้ไว้</th><td>${baht(outcome.fundedTHB)}</td></tr>
          <tr><th>Paid out on approvals · จ่ายตามการอนุมัติ</th><td>${baht(outcome.toCommunityTHB)}</td></tr>
          <tr><th>Not yet spent · ยังไม่ถูกใช้</th><td>${baht(outcome.unspentTHB)}</td></tr>
        </tbody>
      </table>
      <p class="note">
        Paid out is counted from approvals, never from the budget. A quest cannot
        pay a host more than its sponsor committed.
        <span lang="th">จ่ายจริงนับจากการอนุมัติ ไม่ได้นับจากงบ</span>
      </p>
    </section>

    <section class="panel">
      <h2>Per quest · รายภารกิจ</h2>
      ${questRows.length === 0
    ? html`<p class="note">No quests funded yet. <span lang="th">ยังไม่มีภารกิจที่สนับสนุน</span></p>`
    : html`
      <table>
        <thead>
          <tr>
            <th>Quest</th><th>Funded</th><th>Started</th><th>Verified</th><th>Completion</th>
          </tr>
        </thead>
        <tbody>
          ${questRows.map((q) => {
    const rate = q.joined > 0 ? Math.round((q.verified / q.joined) * 100) : null;
    return html`
            <tr>
              <td>${esc(q.name)}</td>
              <td>${baht(q.fundedTHB)}</td>
              <td>${q.joined}</td>
              <td><strong>${q.verified}</strong></td>
              <!--
                Shown even when it is bad, and especially then. A quest
                everybody starts and nobody finishes needs changing, and
                hiding the ratio is how a platform keeps billing for it.
              -->
              <td>${rate === null ? '—' : `${rate}%`}</td>
            </tr>`;
  })}
        </tbody>
      </table>`}
    </section>

    <!--
      On the page, not in a footnote. A sponsor reading a number is entitled to
      know which numbers are missing, and this is also the honest answer to
      "why is your engagement figure lower than everyone else's".
    -->
    <section class="panel panel--muted">
      <h2>What this report does not measure · สิ่งที่รายงานนี้ไม่ได้วัด</h2>
      <ul>
        ${outcome.notMeasured.map((n) => html`
          <li>
            ${esc(n.en)}
            <span lang="th" class="note">${esc(n.th)}</span>
          </li>`)}
      </ul>
    </section>`;

  return layout(
    {
      title: 'Sponsor',
      locale,
      hostName,
      reviewer,
      signedIn: true,
      activeNav: 'sponsor',
      path: '/console/sponsor',
    },
    body,
  );
}
