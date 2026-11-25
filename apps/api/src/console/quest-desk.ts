/**
 * Where a campus host writes its own activities, and where somebody else's
 * reviewer publishes them.
 *
 * No script on this page, like the rest of the console: the venue wifi is the
 * reason, and a form that needs JavaScript to say where it happens would fail
 * on the day. The place is chosen from the campus's own list, or typed.
 *
 * The reviewer is shown the most an activity can pay out before they are shown
 * the button. That number is the decision.
 */

import {
  HOST_QUEST_MAX_REWARD, HOST_QUEST_MAX_SEATS, HOST_QUEST_RADIUS_M, HOST_QUEST_STATUS_LABEL, mostItCanPay,
  SMALLEST_AUDIENCE, SMALLEST_GROUP, facultyName, type Area, type Bilingual, type FacultyBands,
} from '@chivago/core';
import type { HostQuest } from '../host-quest-service.ts';
import { FACULTY_NOT_SAID } from '../student-service.ts';
import { html, layout, raw, type Raw } from './html.ts';
import type { Locale } from './i18n.ts';

/** What the form holds: text, because it is redrawn exactly as it was typed. */
export interface QuestForm {
  area: string; placeId: string; lat: string; lng: string; radiusM: string;
  nameEn: string; nameTh: string; whereEn: string; whereTh: string;
  minutes: string; rewardPoints: string; rewardCurrency: string; seats: string;
  startsAt: string; endsAt: string;
}

export const EMPTY_QUEST_FORM: QuestForm = {
  area: '', placeId: '', lat: '', lng: '', radiusM: String(HOST_QUEST_RADIUS_M.usual),
  nameEn: '', nameTh: '', whereEn: '', whereTh: '',
  minutes: '60', rewardPoints: '50', rewardCurrency: 'trip', seats: '20', startsAt: '', endsAt: '',
};

/** Thailand has one clock and no summer time, so a local time is a fixed offset. */
export const toLocalInput = (iso: string): string =>
  new Date(Date.parse(iso) + 7 * 3_600_000).toISOString().slice(0, 16);
export const fromLocalInput = (value: string): string =>
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) ? `${value}:00+07:00` : '';

export const formOf = (q: HostQuest): QuestForm => ({
  area: q.area, placeId: '', lat: String(q.lat), lng: String(q.lng), radiusM: String(q.radiusM),
  nameEn: q.nameEn, nameTh: q.nameTh, whereEn: q.whereEn, whereTh: q.whereTh,
  minutes: String(q.minutes), rewardPoints: String(q.rewardPoints), rewardCurrency: q.rewardCurrency,
  seats: String(q.seats), startsAt: toLocalInput(q.startsAt), endsAt: toLocalInput(q.endsAt),
});

export interface DeskPlace { id: string; areaName: Bilingual; nameEn: string; nameTh: string }

const when = (q: HostQuest): string =>
  `${toLocalInput(q.startsAt).replace('T', ' ')} – ${toLocalInput(q.endsAt).replace('T', ' ')}`;

const post = (action: string, csrf: string, label: string, danger = false): Raw => html`
  <form method="post" action="${action}" style="display:inline-block;margin:0 6px 6px 0">
    <input type="hidden" name="csrf" value="${csrf}">
    <button type="submit" class="${danger ? 'danger' : ''}">${label}</button>
  </form>`;

function ownRow(q: HostQuest, csrf: string, th: boolean): Raw {
  const at = `/console/quest-desk/${encodeURIComponent(q.id)}`;
  const mine = q.status === 'draft' || q.status === 'returned';
  return html`
    <tr>
      <td><strong>${th ? q.nameTh : q.nameEn}</strong><br><span class="muted">${when(q)}</span></td>
      <td>${th ? HOST_QUEST_STATUS_LABEL[q.status].th : HOST_QUEST_STATUS_LABEL[q.status].en}
        ${q.returnReason ? html`<br><span class="muted">${q.returnReason}</span>` : ''}</td>
      <td>${q.taken} / ${q.seats}</td>
      <td>${q.rewardPoints} ${q.rewardCurrency === 'green' ? 'Green' : 'Trip'}</td>
      <td>
        ${mine ? html`<a href="/console/quest-desk?edit=${encodeURIComponent(q.id)}">${th ? 'แก้ไข' : 'Edit'}</a>
          ${post(`${at}/submit`, csrf, th ? 'ส่งขออนุมัติ' : 'Send for approval')}
          ${post(`${at}/discard`, csrf, th ? 'ลบฉบับร่าง' : 'Discard', true)}` : ''}
        ${q.status === 'published' ? post(`${at}/close`, csrf, th ? 'ปิดรับ' : 'Close', true) : ''}
      </td>
    </tr>`;
}

function reviewCard(q: HostQuest, csrf: string, th: boolean): Raw {
  const at = `/console/quest-desk/${encodeURIComponent(q.id)}`;
  return html`
    <section class="panel">
      <h3>${q.nameTh} · ${q.nameEn}</h3>
      <p>${th ? 'เจ้าภาพ' : 'Host'}: <strong>${q.hostName}</strong>${q.writtenBy ? html` · ${q.writtenBy}` : ''}<br>
        ${when(q)} · ${q.minutes} ${th ? 'นาที' : 'min'}<br>
        ${q.whereTh} · ${q.whereEn}<br>
        <span class="muted">${q.lat}, ${q.lng} · ${q.radiusM} m ·
          <a href="https://www.openstreetmap.org/?mlat=${q.lat}&mlon=${q.lng}#map=18/${q.lat}/${q.lng}" target="_blank" rel="noopener noreferrer">${th ? 'ดูจุดบนแผนที่' : 'See it on a map'}</a></span></p>
      <p>${q.rewardPoints} ${q.rewardCurrency === 'green' ? 'Green' : 'Trip'} × ${q.seats} =
        <strong>${th ? 'จ่ายได้มากที่สุด' : 'pays at most'} ${mostItCanPay(q).toLocaleString('en-US')}</strong></p>
      ${post(`${at}/publish`, csrf, th ? 'อนุมัติและเผยแพร่' : 'Approve and publish')}
      <form method="post" action="${at}/return">
        <input type="hidden" name="csrf" value="${csrf}">
        <label>${th ? 'ส่งกลับเพราะ' : 'Send back because'}<br>
          <input name="reason" type="text" required minlength="3" maxlength="300" style="width:100%"></label>
        <p class="actions"><button type="submit" class="danger">${th ? 'ส่งกลับ' : 'Send back'}</button></p>
      </form>
    </section>`;
}

/** `attrs` is written in this file, never taken from a request. */
const field = (label: string, name: string, value: string, attrs: string): Raw => html`
  <p><label>${label}<br><input name="${name}" value="${value}" required style="width:100%" ${raw(attrs)}></label></p>`;

function questForm(args: {
  form: QuestForm; editing: HostQuest | null; areas: readonly Area[]; places: DeskPlace[]; csrf: string; th: boolean;
}): Raw {
  const { form, editing, areas, places, csrf, th } = args;
  const action = editing ? `/console/quest-desk/${encodeURIComponent(editing.id)}/edit` : '/console/quest-desk';
  const on = (value: string, current: string): Raw => raw(value === current ? ' selected' : '');
  return html`
    <form method="post" action="${action}">
      <input type="hidden" name="csrf" value="${csrf}">
      <p><label>${th ? 'มหาวิทยาลัย' : 'University'}<br>
        <select name="area">${areas.map((a) => html`<option value="${a.key}"${on(a.key, form.area)}>${th ? a.name.th : a.name.en}</option>`)}</select></label></p>
      ${field(th ? 'ชื่อกิจกรรม (ไทย)' : 'Name (Thai)', 'nameTh', form.nameTh, 'type="text" minlength="3" maxlength="80"')}
      ${field(th ? 'ชื่อกิจกรรม (อังกฤษ)' : 'Name (English)', 'nameEn', form.nameEn, 'type="text" minlength="3" maxlength="80"')}
      ${field(th ? 'จุดนัดพบ (ไทย)' : 'Meeting point (Thai)', 'whereTh', form.whereTh, 'type="text" minlength="3" maxlength="80"')}
      ${field(th ? 'จุดนัดพบ (อังกฤษ)' : 'Meeting point (English)', 'whereEn', form.whereEn, 'type="text" minlength="3" maxlength="80"')}
      <p><label>${th ? 'ตำแหน่งเช็กอิน' : 'Where check-in happens'}<br>
        <select name="placeId">
          <option value="">${th ? '— ใช้พิกัดด้านล่าง —' : '— use the coordinates below —'}</option>
          ${places.map((p) => html`<option value="${p.id}"${on(p.id, form.placeId)}>${th ? p.areaName.th : p.areaName.en} · ${th ? p.nameTh : p.nameEn}</option>`)}
        </select></label></p>
      <p><label>${th ? 'ละติจูด' : 'Latitude'} <input name="lat" value="${form.lat}" type="number" step="any" style="width:150px"></label>
        <label>${th ? 'ลองจิจูด' : 'Longitude'} <input name="lng" value="${form.lng}" type="number" step="any" style="width:150px"></label>
        <label>${th ? 'รัศมี (เมตร)' : 'Radius, m'} <input name="radiusM" value="${form.radiusM}" type="number" min="${HOST_QUEST_RADIUS_M.min}" max="${HOST_QUEST_RADIUS_M.max}" required style="width:90px"></label></p>
      <p><label>${th ? 'เริ่ม (เวลาไทย)' : 'Starts (Thai time)'} <input name="startsAt" value="${form.startsAt}" type="datetime-local" required></label>
        <label>${th ? 'สิ้นสุด' : 'Ends'} <input name="endsAt" value="${form.endsAt}" type="datetime-local" required></label></p>
      <p><label>${th ? 'ใช้เวลา (นาที)' : 'Takes, minutes'} <input name="minutes" value="${form.minutes}" type="number" min="10" max="480" required style="width:90px"></label>
        <label>${th ? 'จำนวนรับ' : 'Seats'} <input name="seats" value="${form.seats}" type="number" min="1" max="${HOST_QUEST_MAX_SEATS}" required style="width:90px"></label>
        <label>${th ? 'แต้มต่อคน' : 'Points each'} <input name="rewardPoints" value="${form.rewardPoints}" type="number" min="0" max="${HOST_QUEST_MAX_REWARD}" required style="width:90px"></label>
        <select name="rewardCurrency" aria-label="${th ? 'ชนิดแต้ม' : 'Kind of points'}">
          <option value="trip"${on('trip', form.rewardCurrency)}>Trip</option>
          <option value="green"${on('green', form.rewardCurrency)}>Green</option>
        </select></p>
      <p class="note">${th
    ? 'แต้มเขียวใช้กับงานสิ่งแวดล้อมที่เจ้าภาพเห็นผลงานจริงเท่านั้น กิจกรรมที่แค่มาเข้าร่วมให้ใช้แต้มทริป'
    : 'Green is for environmental work the host sees done. An activity somebody only attends pays Trip.'}</p>
      <p class="actions"><button type="submit">${editing ? (th ? 'บันทึกการแก้ไข' : 'Save changes') : (th ? 'บันทึกฉบับร่าง' : 'Save draft')}</button></p>
    </form>`;
}

function facultyPanel(shown: FacultyBands, th: boolean): Raw {
  const name = (key: string): string => {
    if (key === FACULTY_NOT_SAID) return th ? 'ไม่ได้ระบุคณะ' : 'Faculty not said';
    const found = facultyName('rmutt', key);
    return found ? (th ? found.th : found.en) : key;
  };
  return html`
    <section class="panel panel--muted">
      <h2>${th ? 'ผู้เข้าร่วมตามคณะ' : 'Who took part, by faculty'}</h2>
      <div class="scroll"><table><tbody>
        ${shown.bands.map((b) => html`<tr><td>${name(b.key)}</td><td>${b.from}–${b.to}</td></tr>`)}
        ${shown.others ? html`<tr><td>${th ? 'คณะอื่น' : 'Others'}</td><td class="muted">${th ? 'ไม่แสดงจำนวน' : 'not shown'}</td></tr>` : ''}
      </tbody></table></div>
      <p class="note">${th
    ? `โดยประมาณ จากคณะที่ผู้เข้าร่วมแจ้งเอง ไม่ได้ตรวจกับทะเบียน นับเฉพาะกิจกรรมที่จบแล้ว แสดงเมื่อมีตั้งแต่ ${SMALLEST_AUDIENCE} คน และไม่ระบุคณะที่น้อยกว่า ${SMALLEST_GROUP} คน`
    : `Rough, self-declared and not checked against any register. Only activities that are over, only from ${SMALLEST_AUDIENCE} people up, and a faculty under ${SMALLEST_GROUP} is not named.`}</p>
    </section>`;
}

export function questDeskPage(args: {
  locale: Locale; hostName: string; canModerate: boolean; csrf: string;
  own: HostQuest[]; toReview: HostQuest[]; editing: HostQuest | null; form: QuestForm;
  places: DeskPlace[]; problems: Bilingual[]; faculties: FacultyBands | null;
  /** The campus this host writes for, or null when it has not been opened to. */
  campus: Area | null;
}): string {
  const { locale, hostName, canModerate, csrf, own, toReview, problems } = args;
  const th = locale === 'th';
  return layout({
    locale, hostName, title: th ? 'สร้างกิจกรรม' : 'Write activities', signedIn: true,
    activeNav: 'questDesk', canModerate, path: '/console/quest-desk',
  }, html`
    <h1>${th ? 'กิจกรรมของวิทยาเขต' : 'Campus activities'}</h1>
    <p class="muted">${th
    ? 'เขียนแล้วส่งขออนุมัติ ผู้อนุมัติจากหน่วยงานอื่นเป็นคนเผยแพร่ เมื่อเผยแพร่แล้วแก้ชื่อ สถานที่ และแต้มไม่ได้ ปิดรับได้'
    : 'Write it, then send it for approval. A reviewer from another host publishes it. Once published its name, place and points cannot change; it can be closed.'}</p>
    ${problems.length === 0 ? '' : html`<div class="note danger" role="alert" style="padding:12px"><ul>
      ${problems.map((p) => html`<li>${th ? p.th : p.en}</li>`)}</ul></div>`}

    ${canModerate && toReview.length > 0 ? html`
      <h2>${th ? 'รออนุมัติ' : 'Waiting for approval'} (${toReview.length})</h2>
      ${toReview.map((q) => reviewCard(q, csrf, th))}` : ''}

    <h2>${th ? 'ของหน่วยงานนี้' : 'This host’s'}</h2>
    ${own.length === 0 ? html`<p class="note">${th ? 'ยังไม่มีกิจกรรม' : 'None yet.'}</p>` : html`
      <div class="scroll"><table>
        <thead><tr><th>${th ? 'กิจกรรม' : 'Activity'}</th><th>${th ? 'สถานะ' : 'Status'}</th><th>${th ? 'ที่นั่ง' : 'Seats'}</th><th>${th ? 'แต้ม' : 'Points'}</th><th></th></tr></thead>
        <tbody>${own.map((q) => ownRow(q, csrf, th))}</tbody>
      </table></div>`}

    ${args.faculties === null ? '' : facultyPanel(args.faculties, th)}

    ${args.campus === null ? html`<p class="note">${th
    ? 'หน่วยงานนี้ยังไม่ได้รับสิทธิ์เขียนกิจกรรมของวิทยาเขต ติดต่อทีม ChivarGo'
    : 'This host has not been opened to write campus activities. Ask the ChivarGo team.'}</p>` : html`
    <section class="panel">
      <h2>${args.editing ? (th ? 'แก้ไข' : 'Edit') : (th ? 'เขียนกิจกรรมใหม่' : 'Write a new one')}</h2>
      ${questForm({ ...args, areas: [args.campus], th })}
      ${args.editing ? html`<p><a href="/console/quest-desk">${th ? 'ยกเลิกการแก้ไข' : 'Stop editing'}</a></p>` : ''}
    </section>`}`);
}
