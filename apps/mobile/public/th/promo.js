// The static preview runs beside the development app; production uses the same origin.
import { config } from './config.js';
const { appBase, serviceBase } = config;
document.querySelectorAll('[data-app]').forEach(a => { a.href = new URL(a.getAttribute('href'), appBase).href; });
document.querySelectorAll('[data-service]').forEach(a => { a.href = new URL(a.getAttribute('href'), serviceBase).href; });
const language = document.querySelector('#language');
document.querySelector('.account-link').setAttribute('aria-label', { th:'บัญชีของฉัน / เข้าสู่ระบบ', en:'My account / Sign in', zh:'我的账户 / 登录' }[document.documentElement.lang]);
language.addEventListener('change', () => {
 try { localStorage.setItem('chivago.locale', language.value); } catch {}
 location.assign((language.value === 'th' ? './' : language.value + '.html') + location.hash);
});
const toggle = document.querySelector('.menu-toggle');
const nav = document.querySelector('#navigation');
function closeMenu() { toggle.setAttribute('aria-expanded', 'false'); nav.classList.remove('open'); }
toggle.addEventListener('click', () => { const open = toggle.getAttribute('aria-expanded') !== 'true'; toggle.setAttribute('aria-expanded', String(open)); nav.classList.toggle('open', open); });
nav.addEventListener('click', e => { if (e.target.closest('a')) closeMenu(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') { closeMenu(); toggle.focus(); } });
document.addEventListener('click', e => { if (!e.target.closest('header')) closeMenu(); });
if ('IntersectionObserver' in window) {
 const observer = new IntersectionObserver(entries => entries.forEach(entry => {
  if (!entry.isIntersecting) return;
  nav.querySelectorAll('a').forEach(a => { if (a.hash === '#' + entry.target.id) a.setAttribute('aria-current','location'); else a.removeAttribute('aria-current'); });
 }), { rootMargin: '-15% 0px -65% 0px' });
 nav.querySelectorAll('a').forEach(a => { const section = document.querySelector(a.hash); if (section) observer.observe(section); });
}
function online() { document.querySelector('#offline').hidden = navigator.onLine; }
window.addEventListener('online', online); window.addEventListener('offline', online); online();
document.querySelectorAll('img').forEach(img => {
 img.addEventListener('error', () => { img.classList.add('image-unavailable'); img.removeAttribute('src'); }, { once:true });
});
