import type { Localised } from '@chivago/core';
import type { AdminPlace, AdminPost, AdminUser } from '../admin-service.ts';
import { html, layout } from './html.ts';
import { formatDateTime, formatNumber, type Locale } from './i18n.ts';

type Copy = {
  title: string; subtitle: string; users: string; places: string; posts: string; grants: string;
  search: string; save: string; disable: string; enable: string; hide: string; restore: string;
  addPlace: string; grant: string; audit: string;
};
const COPY: Record<Locale, Copy> = {
  en: { title: 'Administration', subtitle: 'Manage people, places, community posts and inventory.', users: 'Users', places: 'Places', posts: 'Community posts', grants: 'Rewards & inventory', search: 'Search', save: 'Save', disable: 'Disable', enable: 'Enable', hide: 'Hide', restore: 'Restore', addPlace: 'Add or update a place', grant: 'Grant to user', audit: 'Every change is written to the admin audit log.' },
  th: { title: 'ระบบผู้ดูแล', subtitle: 'จัดการผู้ใช้ สถานที่ โพสต์คอมมูนิตี้ และไอเทม', users: 'ผู้ใช้', places: 'สถานที่', posts: 'โพสต์คอมมูนิตี้', grants: 'รางวัลและไอเทม', search: 'ค้นหา', save: 'บันทึก', disable: 'ระงับ', enable: 'เปิดใช้งาน', hide: 'ซ่อน', restore: 'นำกลับ', addPlace: 'เพิ่มหรือแก้ไขสถานที่', grant: 'เพิ่มของให้ผู้ใช้', audit: 'ทุกการเปลี่ยนแปลงจะถูกบันทึกใน Admin Audit Log' },
  zh: { title: '管理系统', subtitle: '管理用户、地点、社区帖子与物品。', users: '用户', places: '地点', posts: '社区帖子', grants: '奖励与物品', search: '搜索', save: '保存', disable: '停用', enable: '启用', hide: '隐藏', restore: '恢复', addPlace: '新增或更新地点', grant: '发放给用户', audit: '所有变更都会写入管理员审计日志。' },
};

const loc = (v: Localised, locale: Locale): string => v[locale] || v.en;
const hidden = (csrf: string) => html`<input type="hidden" name="csrf" value="${csrf}">`;

export function adminPage(input: {
  locale: Locale; hostName: string; reviewer: string | null; csrf: string; query: string;
  users: AdminUser[]; places: AdminPlace[]; posts: AdminPost[];
  items: { key: string; kind: string; rarity: string; name: Localised }[];
  counts: { users: number; places: number; posts: number; grants: number };
  notice?: string | null;
}): string {
  const c = COPY[input.locale];
  return layout({ title: c.title, locale: input.locale, hostName: input.hostName, reviewer: input.reviewer,
    signedIn: true, activeNav: 'admin', canModerate: true, canAdmin: true, path: '/console/admin' }, html`
    <div style="display:flex;justify-content:space-between;gap:24px;align-items:flex-end;flex-wrap:wrap">
      <div><p class="kicker">CHIVARGO CONTROL CENTRE</p><h1>${c.title}</h1><p class="muted">${c.subtitle}</p></div>
      <p class="muted">${c.audit}</p>
    </div>
    ${input.notice ? html`<p class="badge badge-ok" style="margin:12px 0">${input.notice}</p>` : ''}
    <div class="grid" style="margin:24px 0">
      <div><div class="kicker">${c.users}</div><div class="stat">${formatNumber(input.counts.users, input.locale)}</div></div>
      <div><div class="kicker">${c.places}</div><div class="stat">${formatNumber(input.counts.places, input.locale)}</div></div>
      <div><div class="kicker">${c.posts}</div><div class="stat">${formatNumber(input.counts.posts, input.locale)}</div></div>
    </div>
    <form method="get" action="/console/admin" style="display:flex;gap:8px;max-width:640px;margin-bottom:28px">
      <input class="input" type="text" name="q" value="${input.query}" placeholder="${c.search}" style="flex:1">
      <button class="btn" type="submit">${c.search}</button>
    </form>
    <p style="display:flex;gap:8px;flex-wrap:wrap"><a class="btn btn-primary" href="/console/admin/adventures">Adventure CMS →</a><a class="btn" href="/console/admin/seasons">Season CMS →</a></p>

    <section id="users"><h2>${c.users}</h2>
      ${input.users.length === 0 ? html`<p class="muted">—</p>` : input.users.map((u) => html`
        <form method="post" action="/console/admin/users/${encodeURIComponent(u.id)}" class="row">
          ${hidden(input.csrf)}
          <div style="flex:1;display:grid;grid-template-columns:minmax(160px,2fr) minmax(130px,1fr) auto;gap:10px;align-items:end">
            <div><label class="kicker">${u.email ?? u.phone ?? u.id}</label><input type="text" name="displayName" value="${u.displayName}" required></div>
            <div><label class="kicker">TYPE</label><select name="accountType"><option value="traveller" ${u.accountType === 'traveller' ? 'selected' : ''}>Traveller</option><option value="operator" ${u.accountType === 'operator' ? 'selected' : ''}>Operator</option></select></div>
            <label><input type="checkbox" name="disabled" value="1" ${u.disabledAt ? 'checked' : ''}> ${u.disabledAt ? c.disable : 'Active'}</label>
          </div>
          <div style="min-width:170px"><div class="muted">T ${formatNumber(u.trip,input.locale)} · G ${formatNumber(u.green,input.locale)} · EXP ${formatNumber(u.exp,input.locale)}</div><button class="btn" type="submit">${c.save}</button></div>
        </form>`)}
    </section>

    <section id="places" style="margin-top:48px"><h2>${c.places}</h2>
      <details style="border:2px solid var(--color-text);padding:16px;margin:16px 0"><summary><strong>${c.addPlace}</strong></summary>
        <form method="post" action="/console/admin/places" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:16px">
          ${hidden(input.csrf)}
          <input type="text" name="id" placeholder="place-id" required><input type="text" name="layer" placeholder="culture" required>
          <input type="text" name="nameEn" placeholder="English name" required><input type="text" name="nameTh" placeholder="ชื่อภาษาไทย" required>
          <input type="text" name="province" placeholder="TH-20"><input type="text" name="lat" placeholder="13.1600" required>
          <input type="text" name="lng" placeholder="100.8100" required><button class="btn btn-primary" type="submit">${c.save}</button>
        </form>
      </details>
      ${input.places.map((p) => html`<div class="row"><div style="flex:1"><strong>${p.nameTh}</strong> · ${p.nameEn}<div class="muted">${p.id} · ${p.layer} · ${p.lat}, ${p.lng}</div></div><form method="post" action="/console/admin/places/${encodeURIComponent(p.id)}/visibility">${hidden(input.csrf)}<input type="hidden" name="hidden" value="${p.hiddenAt ? '0' : '1'}"><button class="btn ${p.hiddenAt ? '' : 'danger'}" type="submit">${p.hiddenAt ? c.restore : c.hide}</button></form></div>`)}
    </section>

    <section id="posts" style="margin-top:48px"><h2>${c.posts}</h2>
      ${input.posts.map((p) => html`<div class="row"><div style="flex:1"><strong>${p.author}</strong><p>${p.body.slice(0,240) || '[media]'}</p><div class="muted">${formatDateTime(p.createdAt,input.locale)} · ♥ ${p.likes} · 💬 ${p.comments}</div></div><form method="post" action="/console/admin/posts/${encodeURIComponent(p.id)}/visibility">${hidden(input.csrf)}<input type="hidden" name="hidden" value="${p.hiddenAt ? '0' : '1'}"><button class="btn ${p.hiddenAt ? '' : 'danger'}" type="submit">${p.hiddenAt ? c.restore : c.hide}</button></form></div>`)}
    </section>

    <section id="grants" style="margin-top:48px"><h2>${c.grants}</h2>
      <form method="post" action="/console/admin/grants" style="border:2px solid var(--color-text);padding:18px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px">
        ${hidden(input.csrf)}
        <input type="text" name="userId" placeholder="User ID" required>
        <select name="kind"><option value="trip">Trip Points</option><option value="green">Green Points</option><option value="exp">EXP</option><option value="item">Mascot / Fashion item</option></select>
        <input type="text" name="amount" placeholder="Amount">
        <select name="itemKey"><option value="">— item —</option>${input.items.map((item) => html`<option value="${item.key}">${loc(item.name,input.locale)} · ${item.kind} · ${item.rarity}</option>`)}</select>
        <input type="text" name="note" placeholder="Reason / note" style="grid-column:1/-1">
        <button class="btn btn-primary" type="submit" style="grid-column:1/-1">${c.grant}</button>
      </form>
    </section>
  `);
}
