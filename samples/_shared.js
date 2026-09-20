/* Util bersama: penyimpanan localStorage, format rupiah, tema */
const DB = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(APP_KEY + ':' + k)) ?? d; } catch { return d; } },
  set(k, v) { localStorage.setItem(APP_KEY + ':' + k, JSON.stringify(v)); },
};
const rp = n => 'Rp ' + Number(n || 0).toLocaleString('id-ID');
const uid = () => Math.random().toString(36).slice(2, 9);
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function initTheme() {
  const t = DB.get('theme', matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.dataset.theme = t;
  $('#theme')?.addEventListener('click', () => {
    const n = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = n; DB.set('theme', n);
  });
}
function showPage(id) {
  $$('.page').forEach(p => p.hidden = p.id !== 'page-' + id);
  $$('.nav a').forEach(a => a.classList.toggle('on', a.dataset.page === id));
  location.hash = id;
}
function lockedBox(feature) {
  return `<div class="lockbox"><strong>🔒 ${feature} — fitur Premium</strong>Tersedia di versi Premium beserta dokumentasi, update &amp; lisensi komersial.<br><a href="${UPGRADE_URL}" target="_blank" class="btn" style="margin-top:12px">Upgrade ke Premium</a></div>`;
}
