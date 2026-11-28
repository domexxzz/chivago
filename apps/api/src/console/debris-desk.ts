/**
 * The debris desk's pages: the day's queue (boards ก ข ค of the Ko Sichang
 * proposal) and one case (F4).
 *
 * The queue is a list to act on, not a dashboard: what to send people to
 * first, then what only the boat team can reach, then who is already out.
 * The funnel above it answers the question every officer is asked - "how do
 * you know people aren't making it up?" - with today's numbers.
 */

import {
  DEBRIS_ACCESS_LABEL, DEBRIS_AMOUNTS, DEBRIS_AMOUNT_LABEL, DEBRIS_KINDS, DEBRIS_KIND_LABEL,
  type DebrisAccess, type DebrisCaseStatus, type Localised,
} from '@chivago/core';
import type { DebrisDesk, DebrisDeskCase, DebrisDeskCaseDetail } from '../debris-desk-service.ts';
import { html, layout, type Raw } from './html.ts';
import type { Locale } from './i18n.ts';

interface Chrome { locale: Locale; hostName: string; reviewer: string | null; canModerate: boolean }

const say = (locale: Locale, s: Localised): string => (locale === 'en' ? s.en : locale === 'zh' ? (s.zh ?? s.en) : s.th);
const L = (locale: Locale, en: string, th: string, zh?: string) => say(locale, { en, th, zh });

const islandTime = (iso: string, locale: Locale): string =>
  new Intl.DateTimeFormat(locale === 'th' ? 'th-TH' : locale === 'zh' ? 'zh-CN' : 'en-GB', {
    timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso));

const mapsUrl = (lat: number, lng: number) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

/** A count taken off the total: "−2", but a plain "0" when nothing was. */
const minus = (n: number): string => (n > 0 ? `−${n}` : '0');

/** What the hardest reported way in means for who to send. */
const ACCESS_MEANS: Record<DebrisAccess, Localised> = {
  walk: { en: 'A person can walk to it.', th: 'คนเดินเข้าถึงได้', zh: '步行可到达。' },
  climb: { en: 'The truck cannot reach the spot: park and walk, and send two people.', th: 'รถเข้าไม่ถึงตัวจุด ต้องจอดแล้วเดิน และใช้คนสองคนขึ้นไป', zh: '车辆无法到达：需停车步行，并派两人前往。' },
  boat_only: { en: 'Only a boat reaches it: the boat team’s job, nobody on foot.', th: 'ต้องใช้เรือเท่านั้น เป็นงานของทีมเรือ คนเดินเข้าไม่ได้', zh: '只能乘船到达：由船队处理，步行无法到达。' },
};

const STATUS: Record<DebrisCaseStatus, Localised> = {
  open: { en: 'Open', th: 'เปิดอยู่', zh: '待处理' },
  assigned: { en: 'Team assigned', th: 'มอบหมายทีมแล้ว', zh: '已指派' },
  // "Closed", not "Collected": a part-collection is closed too, and the card
  // under it says how much came away and where the rest went.
  closed: { en: 'Closed', th: 'ปิดงานแล้ว', zh: '已结案' },
  dismissed: { en: 'Dismissed', th: 'ปิดโดยไม่เก็บ', zh: '已驳回' },
};

const chrome = (c: Chrome, title: string, path: string, body: Raw): string =>
  layout({
    title, locale: c.locale, hostName: c.hostName, reviewer: c.reviewer,
    signedIn: true, activeNav: 'debris', canModerate: c.canModerate, debrisDesk: true, path,
  }, body);

/* ---------------------------------------------------------------- queue -- */

function caseRows(cases: DebrisDeskCase[], locale: Locale, withPriority: boolean): Raw {
  return html`
    <table class="table" style="width:100%">
      <thead><tr>
        <th>${L(locale, 'Case', 'เคส', '案件')}</th>
        <th>${L(locale, 'How much', 'มากแค่ไหน', '数量')}</th>
        <th>${L(locale, 'People', 'คนที่เห็น', '人数')}</th>
        <th>${L(locale, 'Way in', 'การเข้าถึง', '到达方式')}</th>
        <th>${L(locale, 'Last report', 'รายงานล่าสุด', '最新报告')}</th>
        ${withPriority ? html`<th>${L(locale, 'Score', 'คะแนน', '分数')}</th>` : ''}
      </tr></thead>
      <tbody>${cases.map((c) => html`<tr>
        <td><a href="/console/debris/${c.id}"><strong>${c.number}</strong></a></td>
        <td>${say(locale, DEBRIS_AMOUNT_LABEL[c.amount])}</td>
        <td>${c.reporters}</td>
        <td>${say(locale, DEBRIS_ACCESS_LABEL[c.access])}</td>
        <td>${islandTime(c.lastReportAt, locale)}</td>
        ${withPriority ? html`<td>${Number.isInteger(c.priority) ? c.priority : c.priority.toFixed(1)}</td>` : ''}
      </tr>`)}</tbody>
    </table>`;
}

const section = (title: string, note: string, cases: DebrisDeskCase[], empty: string, locale: Locale, withPriority = false): Raw => html`
  <div class="card" style="margin-top:20px">
    <div class="kicker">${title}</div>
    <div class="muted" style="margin:4px 0 12px">${note}</div>
    ${cases.length === 0 ? html`<div class="muted">${empty}</div>` : caseRows(cases, locale, withPriority)}
  </div>`;

export function debrisDeskPage(c: Chrome & { desk: DebrisDesk }): string {
  const { locale, desk } = c;
  const f = desk.funnel;
  const usable = f.opened + f.merged;
  const body = html`
    <h1>${L(locale, 'Debris reports', 'รายงานขยะ', '垃圾报告')}</h1>
    <p class="muted">${L(locale,
      'Ranked by severity × people × access. The desk suggests an order; you decide, and you can always change it.',
      'เรียงตาม ความรุนแรง × จำนวนคนที่เห็น × การเข้าถึง ระบบเสนอ ไม่ได้สั่ง เจ้าหน้าที่เป็นคนตัดสินและเปลี่ยนลำดับได้เสมอ',
      '按 严重程度 × 人数 × 到达难度 排序。系统只提出建议，由您决定，并可随时调整。')}</p>

    <div class="card">
      <div class="kicker">${L(locale, `Today, ${f.day}`, `วันนี้ ${f.day}`, `今天 ${f.day}`)}</div>
      <div class="grid" style="margin-top:10px">
        <div><div class="stat">${f.received}</div><div class="muted">${L(locale, 'reports received', 'รายงานที่เข้ามา', '收到的报告')}</div></div>
        <div><div class="stat">${minus(f.merged)}</div><div class="muted">${L(locale, 'same spot, merged', 'ซ้ำจุดเดียวกัน รวมแล้ว', '同一地点，已合并')}</div></div>
        <div><div class="stat">${minus(f.rejected.stale)}</div><div class="muted">${L(locale, 'older than a day', 'เก่ากว่า 24 ชม.', '超过一天')}</div></div>
        <div><div class="stat">${minus(f.rejected.outside_area)}</div><div class="muted">${L(locale, 'outside the island', 'พิกัดนอกเขตเกาะ', '岛外位置')}</div></div>
        <div><div class="stat">${minus(f.rejected.mocked)}</div><div class="muted">${L(locale, 'simulated position', 'ตำแหน่งจำลอง', '模拟位置')}</div></div>
        <div><div class="stat">${f.opened}</div><div class="muted">${L(locale, 'new cases', 'เคสใหม่', '新案件')}</div></div>
      </div>
      <p class="muted" style="margin-top:12px">${L(locale,
        `${usable} of ${f.received} became usable. Reporting earns nothing, so nobody has a reason to press it for the sake of it; four people at one pile are one case, and how many saw it is how strong the signal is.`,
        `${f.received} รายงาน ใช้งานได้ ${usable} การรายงานไม่ได้แต้ม จึงไม่มีเหตุผลให้กดมั่ว สี่คนรายงานจุดเดียวกันคือเคสเดียว และจำนวนคนที่เห็นคือความแรงของสัญญาณ`,
        `${f.received} 份报告中 ${usable} 份可用。报告不得积分，所以没有人有理由乱按；四个人报告同一堆垃圾算一个案件，看到的人数就是信号强度。`)}</p>
    </div>

    ${section(
      L(locale, 'Send people here first', 'ควรไปก่อน', '优先前往'),
      L(locale, 'Reachable by truck or on foot, highest score first.', 'รถหรือคนเดินเข้าถึงได้ เรียงจากคะแนนสูงสุด', '车辆或步行可达，按分数从高到低。'),
      desk.land, L(locale, 'Nothing open on land.', 'ไม่มีเคสบนบกที่เปิดอยู่', '陆上没有待处理案件。'), locale, true,
    )}
    ${section(
      L(locale, 'Boat team', 'ทีมเรือ', '船队'),
      L(locale, 'Only a boat reaches these. Travellers cannot help here; it may wait for the next boat round, and the reporter is shown that it is waiting.', 'ต้องใช้เรือเท่านั้น นักท่องเที่ยวช่วยไม่ได้ อาจต้องรอรอบเรือถัดไป และผู้รายงานจะเห็นว่ายังรออยู่', '只有船能到达。游客无法协助；可能要等下一轮船，报告人会看到正在等待。'),
      desk.boat, L(locale, 'Nothing waiting for the boat.', 'ไม่มีเคสที่รอทีมเรือ', '没有等待船队的案件。'), locale,
    )}
    ${section(
      L(locale, 'Somebody is going', 'มอบหมายแล้ว', '已指派'),
      L(locale, 'Assigned, oldest first.', 'มอบหมายแล้ว เรียงจากเก่าสุด', '已指派，按时间先后。'),
      desk.assigned, L(locale, 'Nobody out right now.', 'ยังไม่มีทีมออกไป', '目前没有人外出。'), locale,
    )}

    <div class="card" style="margin-top:20px">
      <div class="kicker">${L(locale, 'What this desk cannot catch', 'สิ่งที่ระบบยังจับไม่ได้', '本系统无法识别的情况')}</div>
      <p class="muted">${L(locale,
        'Somebody photographing the same spot for days to make it look worse than it is. Only the officer who goes there can see that.',
        'คนที่ถ่ายรูปจุดเดิมซ้ำหลายวันเพื่อให้ดูแย่กว่าจริง ต้องให้เจ้าหน้าที่ดูเองตอนไปถึง',
        '有人连续多天拍摄同一地点，使其看起来比实际更糟。只有到场的工作人员才能判断。')}</p>
    </div>`;
  return chrome(c, L(locale, 'Debris reports', 'รายงานขยะ', '垃圾报告'), '/console/debris', body);
}

/* ------------------------------------------------------------- one case -- */

export function debrisCasePage(c: Chrome & { detail: DebrisDeskCaseDetail; csrf: string; problem?: string }): string {
  const { locale, detail: d } = c;
  const decided = d.status === 'dismissed' || d.status === 'closed';
  const body = html`
    <p><a href="/console/debris">← ${L(locale, 'All cases', 'ทุกเคส', '全部案件')}</a></p>
    <h1>${d.number}</h1>
    <p class="muted">${say(locale, STATUS[d.status])} · ${L(locale, 'opened', 'เปิดเคส', '立案于')} ${islandTime(d.openedAt, locale)}</p>
    ${d.followUpOf ? html`<p>${L(locale, 'Opened for what was left after', 'เปิดสำหรับส่วนที่เหลือจาก', '为剩余部分开立，原案件')} <a href="/console/debris/${d.followUpOf.id}">${d.followUpOf.number}</a>.</p>` : ''}
    ${c.problem ? html`<div class="card" style="border-color:var(--color-accent);color:var(--color-accent-700)">${c.problem}</div>` : ''}

    <div class="card" style="margin-top:16px">
      <div class="kicker">${L(locale, 'What the reporters sent', 'สิ่งที่ผู้รายงานส่งมา', '报告人提交的内容')}</div>
      <table class="table" style="width:100%;margin-top:8px"><tbody>
        <tr><th>${L(locale, 'Where', 'พิกัด', '位置')}</th><td><a href="${mapsUrl(d.lat, d.lng)}" target="_blank" rel="noopener noreferrer">${d.lat.toFixed(5)}, ${d.lng.toFixed(5)}</a></td></tr>
        <tr><th>${L(locale, 'People who saw it', 'คนที่เห็นและส่ง', '看到的人数')}</th><td>${d.reporters} (${d.reportCount} ${L(locale, 'reports', 'รายงาน', '份报告')})</td></tr>
        <tr><th>${L(locale, 'How much', 'มากแค่ไหน', '数量')}</th><td>${say(locale, DEBRIS_AMOUNT_LABEL[d.amount])}</td></tr>
        <tr><th>${L(locale, 'What', 'ชนิดที่รายงาน', '种类')}</th><td>${d.kinds.length ? d.kinds.map((k) => say(locale, DEBRIS_KIND_LABEL[k])).join(' · ') : '—'}</td></tr>
        <tr><th>${L(locale, 'Way in', 'การเข้าถึง', '到达方式')}</th><td><strong>${say(locale, DEBRIS_ACCESS_LABEL[d.access])}</strong><div class="muted">${say(locale, ACCESS_MEANS[d.access])}</div></td></tr>
      </tbody></table>
      <p class="muted">${L(locale,
        'From the people standing there. Where they disagree, this is the hardest way in anybody reported and the biggest pile anybody saw.',
        'จากคนที่ยืนอยู่ตรงนั้น ถ้าตอบไม่ตรงกัน ใช้คำตอบที่เข้าถึงยากที่สุดและกองใหญ่ที่สุด',
        '来自现场的人。若回答不一致，取最难的到达方式和最大的数量。')}</p>
    </div>

    <div class="card" style="margin-top:16px">
      <div class="kicker">${L(locale, 'Photographs', 'รูปถ่าย', '照片')}</div>
      <p class="muted">${L(locale, 'For this desk only. They are never shown publicly.', 'ใช้ภายในเท่านั้น ไม่แสดงต่อสาธารณะ', '仅供本工作台使用，绝不公开。')}</p>
      <div style="display:flex;flex-wrap:wrap;gap:12px">${d.reports.map((r) => html`
        <figure style="margin:0;width:220px">
          ${r.hasPhoto
            ? html`<img src="/console/debris/photo/${r.id}" alt="${L(locale, 'Reported rubbish', 'ขยะที่ถูกรายงาน', '被报告的垃圾')}" loading="lazy" style="width:220px;height:165px;object-fit:cover;display:block">`
            : ''}
          <figcaption class="muted" style="font-size:12px;margin-top:4px">
            ${islandTime(r.takenAt, locale)}${r.accuracyM != null ? ` · ±${Math.round(r.accuracyM)} m` : ''} ·
            ${say(locale, DEBRIS_ACCESS_LABEL[r.access])}
          </figcaption>
        </figure>`)}</div>
    </div>

    ${decided ? '' : html`
      <div class="card" style="margin-top:16px">
        <div class="kicker">${L(locale, 'Decide', 'ตัดสินใจ', '决定')}</div>
        <p class="muted">${L(locale,
          'The desk does not send anybody. You do, and your name goes on the record with what you chose.',
          'ระบบไม่ได้สั่งงาน เจ้าหน้าที่เป็นคนตัดสิน และชื่อของคุณจะถูกบันทึกพร้อมสิ่งที่เลือก',
          '系统不会派人。由您决定，您的名字会和您的选择一起记录。')}</p>
        ${d.status === 'open' ? html`
          <form method="post" action="/console/debris/${d.id}/assign" style="margin-top:10px">
            <input type="hidden" name="csrf" value="${c.csrf}">
            <label class="muted" for="note">${L(locale, 'Who is going, and when (optional)', 'ใครไป และไปเมื่อไหร่ (ไม่บังคับ)', '谁去、何时去（可选）')}</label>
            <textarea id="note" name="note" maxlength="300" rows="2" style="width:100%"></textarea>
            <button class="btn btn-primary" type="submit" style="margin-top:6px">${L(locale, 'Assign', 'มอบหมาย', '指派')}</button>
          </form>` : ''}
        ${closeForm(d, c.csrf, locale)}
        <form method="post" action="/console/debris/${d.id}/dismiss" style="margin-top:16px">
          <input type="hidden" name="csrf" value="${c.csrf}">
          <label class="muted" for="reason">${L(locale, 'Close without collecting - why (required: the reporter is shown that it was closed)', 'ปิดโดยไม่เก็บ เพราะอะไร (ต้องกรอก ผู้รายงานจะเห็นว่าเคสถูกปิด)', '不清理直接结案——原因（必填：报告人会看到已结案）')}</label>
          <textarea id="reason" name="reason" maxlength="300" rows="2" style="width:100%" required></textarea>
          <button class="btn danger" type="submit" style="margin-top:6px">${L(locale, 'Dismiss', 'ปิดเคส', '驳回')}</button>
        </form>
      </div>`}

    ${d.collection ? collectionCard(d, locale) : ''}

    <div class="card" style="margin-top:16px">
      <div class="kicker">${L(locale, 'Record', 'บันทึกการตัดสินใจ', '记录')}</div>
      ${d.events.length === 0
        ? html`<div class="muted">${L(locale, 'No decision yet.', 'ยังไม่มีการตัดสินใจ', '尚无决定。')}</div>`
        : html`<ul>${d.events.map((e) => html`<li>${islandTime(e.at, locale)} · <strong>${e.actor}</strong> · ${say(locale, STATUS[e.action])}${e.note ? html` — ${e.note}` : ''}</li>`)}</ul>`}
    </div>`;
  return chrome(c, d.number, `/console/debris/${d.id}`, body);
}

/* ------------------------------------------------------- closing the job -- */

/**
 * The field team's form (board F7). Laid out for a phone held on a beach:
 * the photo first, because the camera is already in the hand; the weight,
 * because the scale is; then what was really there, and whether it all came.
 */
function closeForm(d: DebrisDeskCaseDetail, csrf: string, locale: Locale): Raw {
  return html`
    <form method="post" action="/console/debris/${d.id}/close" enctype="multipart/form-data" style="margin-top:18px;padding-top:14px;border-top:2px solid var(--color-divider)">
      <input type="hidden" name="csrf" value="${csrf}">
      <div class="kicker">${L(locale, 'Close the job: on the beach', 'ปิดงาน: ที่หน้างาน', '结案：在现场')}</div>
      <label class="muted" for="afterPhoto" style="display:block;margin-top:8px">${L(locale, 'Photo after', 'ถ่ายรูปหลังเก็บ', '清理后照片')}</label>
      <input id="afterPhoto" name="afterPhoto" type="file" accept="image/jpeg,image/png,image/webp" capture="environment">
      <label class="muted" for="weightKg" style="display:block;margin-top:10px">${L(locale, 'Weight, as the scale read (kg)', 'น้ำหนักที่ชั่งได้ (กก.)', '秤上读数（公斤）')}</label>
      <input id="weightKg" name="weightKg" type="number" inputmode="decimal" step="0.1" min="0.1" max="1000" required style="width:10em">
      <fieldset style="margin-top:10px;border:0;padding:0">
        <legend class="muted">${L(locale, 'What was really there', 'เจอจริงคืออะไร', '实际发现')}</legend>
        ${DEBRIS_KINDS.map((k) => html`<label style="display:inline-flex;align-items:center;gap:8px;min-height:44px;margin-right:16px"><input type="checkbox" name="foundKinds" value="${k}" style="width:20px;height:20px"> ${say(locale, DEBRIS_KIND_LABEL[k])}</label>`)}
      </fieldset>
      <p class="muted" style="font-size:12px">${L(locale,
        'Kept beside what the reporters said, so the island learns how well a traveller’s report matches the beach.',
        'บันทึกคู่กับสิ่งที่ผู้รายงานบอก เพื่อรู้ว่ารายงานจากคนทั่วไปแม่นแค่ไหน',
        '与报告人所说的内容一并保存，以了解游客报告与现场的吻合程度。')}</p>
      <!--
        ONE question, no default. It was a radio button and a list beside it,
        and a tap on the list left the radio on "all": the job closed as done
        with a heap still on the sand, and the heap fell off the queue.
      -->
      <label class="muted" style="display:block;margin-top:10px">${L(locale, 'What is left on the sand?', 'เหลืออะไรอยู่บนหาด?', '沙滩上还剩什么？')}<br>
        <select name="left" required>
          <option value="" selected disabled>${L(locale, 'Choose…', 'เลือก…', '请选择…')}</option>
          <option value="none">${L(locale, 'Nothing - all of it came away', 'ไม่เหลือ เก็บหมดแล้ว', '没有——已全部清理')}</option>
          ${DEBRIS_AMOUNTS.map((a) => html`<option value="${a}">${L(locale, 'Some left: ', 'เหลือ: ', '还剩：')}${say(locale, DEBRIS_AMOUNT_LABEL[a])}</option>`)}
        </select>
      </label>
      <p class="muted" style="font-size:12px">${L(locale,
        'A case closed while rubbish is still on the sand makes every number after it wrong, so the rest goes back on the queue.',
        'ใบที่ปิดทั้งที่ของยังอยู่ ทำให้ตัวเลขทั้งระบบผิด ส่วนที่เหลือจึงกลับเข้าคิว',
        '垃圾还在沙滩上就结案，会让之后的每个数字都出错，所以剩余部分会重新排队。')}</p>
      <button class="btn btn-primary" type="submit" style="margin-top:6px">${L(locale, 'Close the job', 'ปิดงาน', '结案')}</button>
    </form>`;
}

function collectionCard(d: DebrisDeskCaseDetail, locale: Locale): Raw {
  const k = d.collection!;
  const kinds = (list: readonly (keyof typeof DEBRIS_KIND_LABEL)[]) =>
    list.length ? list.map((x) => say(locale, DEBRIS_KIND_LABEL[x])).join(' · ') : '—';
  return html`
    <div class="card" style="margin-top:16px">
      <div class="kicker">${k.outcome === 'all' ? L(locale, 'Collected', 'เก็บแล้ว', '已清理') : L(locale, 'Part collected', 'เก็บบางส่วน', '部分清理')}</div>
      <div class="stat" style="margin-top:6px">${k.weightKg} kg</div>
      <p class="muted">${islandTime(k.at, locale)} · ${L(locale, 'closed by', 'ปิดโดย', '结案人')} <strong>${k.by}</strong></p>
      <table class="table" style="width:100%"><tbody>
        <tr><th>${L(locale, 'Reporters said', 'ผู้รายงานบอก', '报告人说')}</th><td>${kinds(d.kinds)}</td></tr>
        <tr><th>${L(locale, 'Found', 'เจอจริง', '实际发现')}</th><td>${kinds(k.foundKinds)}</td></tr>
      </tbody></table>
      ${k.afterPhoto ? html`<img src="/console/debris/after/${d.id}" alt="${L(locale, 'After collection', 'หลังเก็บ', '清理后')}" loading="lazy" style="width:220px;height:165px;object-fit:cover;display:block;margin-top:10px">` : ''}
      ${k.followUp ? html`<p style="margin-top:10px">${L(locale, 'What was left is', 'ส่วนที่เหลือคือ', '剩余部分为')} <a href="/console/debris/${k.followUp.id}">${k.followUp.number}</a>.</p>` : ''}
    </div>`;
}

/* ------------------------------------------------------------ refusals -- */

/** For a login with no island: a municipality not yet tied to one, or anybody who is not a municipality. */
export function debrisNotYoursPage(c: Chrome & { municipality: boolean }): string {
  const { locale } = c;
  const body = html`
    <h1>${L(locale, 'Debris reports', 'รายงานขยะ', '垃圾报告')}</h1>
    <p>${c.municipality
      ? L(locale,
        'This municipality login is not tied to an island yet, so there is no queue to show. The platform team sets which island a municipality reads.',
        'บัญชีเทศบาลนี้ยังไม่ได้ผูกกับเกาะ จึงยังไม่มีคิวให้แสดง ทีมแพลตฟอร์มเป็นผู้กำหนดว่าเทศบาลไหนอ่านคิวของเกาะใด',
        '此市政账号尚未关联岛屿，因此没有可显示的队列。由平台团队设定市政负责哪个岛屿。')
      : L(locale,
        'This desk is for the island’s municipality. Reports carry photographs that only they see.',
        'หน้านี้สำหรับเทศบาลของเกาะเท่านั้น รายงานมีรูปถ่ายที่เห็นได้เฉพาะเจ้าหน้าที่',
        '此工作台仅供岛屿所属市政使用。报告中的照片只有他们能看到。')}</p>`;
  return layout({
    title: L(locale, 'Debris reports', 'รายงานขยะ', '垃圾报告'), locale, hostName: c.hostName, reviewer: c.reviewer,
    signedIn: true, canModerate: c.canModerate, path: '/console/debris',
  }, body);
}
