// Membuat paket GRATIS (Lite: modul lembur) & PREMIUM (lengkap) dari samples/portal-lembur-it/src,
// menaruh zip ke storage/files dan mengisi produk "portal-lembur-cuti" di database.
//   npm run build:portal            → build kedua paket + pasang ke produk
//   npm run build:portal -- --out <dir> --tier free   → hanya ekstrak ke folder (untuk verifikasi)
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'samples', 'portal-lembur-it', 'src');
const FILES_DIR = path.join(ROOT, 'storage', 'files');
const VERSION = '1.0.0';
const SLUG = 'portal-lembur-cuti';
const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : null; };

// File/folder yang HANYA ada di premium
const PREMIUM_ONLY = [
  'app/Http/Controllers/LeaveController.php', 'app/Http/Controllers/PimpinanLeaveController.php', 'app/Http/Controllers/AdminLeaveController.php',
  'app/Http/Controllers/ReportController.php', 'app/Http/Controllers/PdfUtilityController.php', 'app/Services/LdapService.php',
  'app/Models/Leave.php', 'database/migrations/2026_06_01_111609_create_leaves_table.php',
  'resources/views/user/cuti', 'resources/views/pimpinan/cuti', 'resources/views/admin/cuti', 'resources/views/admin/reports', 'resources/views/pimpinan/reports',
  'resources/views/utility', 'resources/views/pdf/leave-form.blade.php', 'resources/views/pdf/report-recap.blade.php', 'resources/views/pdf/bulk-overtime.blade.php',
];
const MARK = [/\{\{-- PREMIUM:START --\}\}[\s\S]*?\{\{-- PREMIUM:END --\}\}\n?/g, /^[ \t]*\/\/ PREMIUM:START[\s\S]*?\/\/ PREMIUM:END\n?/gm];
const TEXT = /\.(php|js|ts|json|md|txt|env|example|yml|yaml|html|css|xml)$/i;

function copyTree(src, dst, tier) {
  for (const name of fs.readdirSync(src)) {
    if (['node_modules', 'vendor', '.git', '.DS_Store', 'database.sqlite'].includes(name)) continue;
    const s = path.join(src, name), d = path.join(dst, name), rel = path.relative(SRC, s);
    if (tier === 'free' && PREMIUM_ONLY.some(p => rel === p || rel.startsWith(p + '/'))) continue;
    if (fs.statSync(s).isDirectory()) { fs.mkdirSync(d, { recursive: true }); copyTree(s, d, tier); continue; }
    fs.mkdirSync(path.dirname(d), { recursive: true });
    if (TEXT.test(name) || name.startsWith('.env')) {
      let t = fs.readFileSync(s, 'utf8');
      if (tier === 'free') MARK.forEach(re => { t = t.replace(re, ''); });
      else t = t.replace(/^[ \t]*(\{\{-- PREMIUM:(START|END) --\}\}|\/\/ PREMIUM:(START|END).*)\n/gm, ''); // premium: buang penandanya saja
      fs.writeFileSync(d, t);
    } else fs.copyFileSync(s, d);
  }
}
function freeExtras(dst) {
  // Bulk download & print rekap memakai view premium → nonaktifkan tombolnya di Lite
  const strip = (file, patterns) => { const p = path.join(dst, file); if (!fs.existsSync(p)) return; let t = fs.readFileSync(p, 'utf8'); patterns.forEach(re => { t = t.replace(re, ''); }); fs.writeFileSync(p, t); };
  // rute bulk-download (user & admin) dihapus dari routes + tombolnya dari view
  strip('routes/web.php', [/^.*bulk-download.*\n/gm]);
  // form bulk-download membungkus tabel → biarkan, tapi kunci submit-nya sebagai fitur Premium
  const lock = (file, routeName) => { const p = path.join(dst, file); let t = fs.readFileSync(p, 'utf8'); t = t.replace(`action="{{ route('${routeName}') }}"`, 'action="#" data-premium-locked="Rekap lembur massal (PDF)"'); fs.writeFileSync(p, t); };
  lock('resources/views/user/history/index.blade.php', 'user.bulk_download');
  lock('resources/views/admin/overtimes/index.blade.php', 'admin.bulk_download');
  const lockScript = `<script>document.addEventListener('submit',function(e){var f=e.target.closest('[data-premium-locked]');if(f){e.preventDefault();if(confirm(f.dataset.premiumLocked+' tersedia di versi Premium. Buka halaman upgrade?'))window.open('__UPGRADE_URL__','_blank');}});</script>\n</body>`;
  ['user', 'pimpinan', 'admin'].forEach(r => { const p = path.join(dst, `resources/views/${r}/layouts/app.blade.php`); fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace('</body>', lockScript)); });
  ['app/Http/Controllers/UserHistoryController.php', 'app/Http/Controllers/AdminController.php'].forEach(f => strip(f, [/\n    public function bulkDownload\([\s\S]*?\n    \}\n/]));
  // composer: FPDI hanya dipakai utilitas PDF (premium)
  const cj = path.join(dst, 'composer.json'); const c = JSON.parse(fs.readFileSync(cj, 'utf8')); delete c.require['setasign/fpdf']; delete c.require['setasign/fpdi']; fs.writeFileSync(cj, JSON.stringify(c, null, 4) + '\n');
  fs.rmSync(path.join(dst, 'composer.lock'), { force: true });
  // watermark versi Lite di footer
  ['user', 'pimpinan', 'admin'].forEach(r => { const p = path.join(dst, `resources/views/${r}/layouts/app.blade.php`); fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace("{{ config('app.company_name') }}", "{{ config('app.company_name') }} &middot; <a href=\"__UPGRADE_URL__\" target=\"_blank\" class=\"underline\">Versi Lite &mdash; upgrade ke Premium</a>")); });
}
function docs(dst, tier, upgradeUrl) {
  fs.writeFileSync(path.join(dst, 'LICENSE.txt'), tier === 'premium'
    ? 'LISENSI KOMERSIAL — Portal Lembur & Cuti\n\nPembeli berhak menggunakan, memodifikasi, dan memasang source code ini untuk kebutuhan internal\nperusahaan sendiri maupun project klien tanpa batasan jumlah instalasi.\nTidak diperbolehkan menjual kembali / mendistribusikan source code ini (asli maupun modifikasi) sebagai\nproduk source code kepada pihak lain. Disediakan "sebagaimana adanya"; hak update sesuai masa pada pesanan.\n'
    : 'LISENSI PERSONAL — Portal Lembur (Lite)\n\nBoleh digunakan untuk belajar, evaluasi, dan penggunaan internal non-komersial.\nTidak boleh digunakan untuk project klien/komersial, dijual kembali, atau didistribusikan ulang.\nTautan "Versi Lite" di footer tidak boleh dihilangkan. Untuk penggunaan komersial, upgrade ke Premium:\n' + upgradeUrl + '\n');
  fs.writeFileSync(path.join(dst, 'CHANGELOG.md'), `# Changelog\n\n## ${VERSION}\n- Rilis pertama ${tier === 'premium' ? '(Premium)' : '(Lite)'}.\n- Migrasi & query dibuat portabel: SQLite (default), MySQL, PostgreSQL.\n- Seeder data contoh (admin/pimpinan/karyawan).\n`);
  if (tier === 'premium') {
    fs.mkdirSync(path.join(dst, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(dst, 'docs', 'DEPLOY.md'), `# Deploy

## Docker (disarankan)
\`\`\`bash
cp .env.example .env && php artisan key:generate
docker compose up -d --build     # lihat docker-compose.yml & Dockerfile
docker compose exec app php artisan migrate --seed
\`\`\`

## Vercel (serverless PHP)
Sudah ada \`vercel.json\` + \`api/index.php\`. Set env di dashboard Vercel: APP_KEY, APP_URL, DB_* (gunakan DB eksternal,
mis. PostgreSQL Neon/Supabase — SQLite tidak bisa di serverless). Jalankan migrasi dari lokal ke DB tersebut.

## VPS / cPanel
Upload semua file kecuali node_modules; \`composer install --no-dev --optimize-autoloader\`; \`npm run build\`;
arahkan document root ke \`public/\`; set izin tulis \`storage/\` & \`bootstrap/cache\`.

## Kustomisasi
- Nama aplikasi & perusahaan: \`APP_NAME\`, \`APP_COMPANY_NAME\` di .env
- Logo kop PDF: \`public/images/logo-company.png\`
- Kuota cuti tahunan & libur nasional: \`app/Http/Controllers/LeaveController.php\` (konstanta di bagian atas)
- Integrasi LDAP/HRIS: isi \`LDAP_*\` / \`HRIS_*\` di .env, lihat \`app/Services/LdapService.php\`
`);
  }
}

const APP_URL = process.env.APP_URL || 'http://localhost:3000';
const upgradeUrl = `${APP_URL}/product/${SLUG}`;
const tiers = opt('tier') ? [opt('tier')] : ['free', 'premium'];
const outOnly = opt('out');
const result = {};
for (const tier of tiers) {
  const stage = outOnly ? path.resolve(outOnly) : fs.mkdtempSync(path.join(require('os').tmpdir(), 'portal-'));
  const dir = path.join(stage, 'portal-lembur-' + (tier === 'free' ? 'lite' : 'premium'));
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  copyTree(SRC, dir, tier);
  if (tier === 'free') { freeExtras(dir); for (const f of ['user', 'pimpinan', 'admin']) { const p = path.join(dir, `resources/views/${f}/layouts/app.blade.php`); fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace(/__UPGRADE_URL__/g, upgradeUrl)); } }
  docs(dir, tier, upgradeUrl);
  if (outOnly) { console.log(`✔ ${tier} diekstrak ke ${dir}`); continue; }
  fs.mkdirSync(FILES_DIR, { recursive: true });
  const zipName = `portal-lembur-${tier === 'free' ? 'lite' : 'premium'}-v${VERSION}.zip`;
  fs.rmSync(path.join(FILES_DIR, zipName), { force: true });
  execSync(`cd "${stage}" && zip -qr "${path.join(FILES_DIR, zipName)}" "${path.basename(dir)}" -x "*.DS_Store"`);
  fs.rmSync(stage, { recursive: true, force: true });
  result[tier] = zipName;
  console.log(`✔ ${zipName} (${(fs.statSync(path.join(FILES_DIR, zipName)).size / 1024).toFixed(0)} KB)`);
}
if (!outOnly && tiers.length === 2) {
  const db = require('../db/db');
  const cat = db.prepare("SELECT id FROM categories WHERE slug = 'aplikasi-web'").get();
  const premiumFeatures = ['Modul lembur: pengajuan, riwayat, perhitungan jam, tanda tangan digital', 'Persetujuan berjenjang pimpinan → admin (approve / force / reject, massal)', 'Cetak surat tugas lembur & rekap bulanan massal (PDF)', 'Modul cuti: kuota 12 hari, lompat akhir pekan & libur nasional, formulir cuti PDF A4', 'Dashboard per peran dengan grafik (Chart.js)', 'Laporan & ekspor admin', 'Utilitas pisah PDF', 'Integrasi opsional LDAP / database HRIS', 'Manajemen pengguna & role', 'Portabel: SQLite / MySQL / PostgreSQL, Docker & Vercel siap pakai', 'Dokumentasi deploy & kustomisasi'];
  const freeFeatures = ['Modul lembur: pengajuan, riwayat, perhitungan jam, tanda tangan digital', 'Persetujuan berjenjang pimpinan → admin (approve / force / reject, massal)', 'Cetak surat tugas lembur (PDF)', 'Dashboard per peran dengan grafik (Chart.js)', 'Manajemen pengguna & role', 'Portabel: SQLite / MySQL / PostgreSQL, Docker & Vercel siap pakai'];
  const existing = db.prepare('SELECT id FROM products WHERE slug = ?').get(SLUG);
  const data = {
    title: 'Portal Lembur & Cuti Karyawan (Laravel 12)', slug: SLUG, category_id: cat ? cat.id : null,
    short_desc: 'Sistem pengajuan lembur & cuti dengan approval berjenjang, dashboard per peran, dan PDF siap cetak.',
    description: 'Aplikasi HR internal untuk mengelola pengajuan lembur dan cuti karyawan. Alur persetujuan Karyawan → Pimpinan → Admin, tanda tangan digital, dokumen PDF (surat tugas lembur, formulir cuti A4, rekap bulanan), dashboard dengan grafik per peran, serta manajemen pengguna. Dibangun dengan Laravel 12, Tailwind CSS 4, Alpine.js, Chart.js, DomPDF. Default SQLite — jalan tanpa server database; siap deploy via Docker atau Vercel.\n\nVersi Lite berisi modul lembur lengkap untuk dicoba dan dipakai internal non-komersial. Premium menambahkan modul cuti, laporan, rekap PDF massal, utilitas PDF, integrasi LDAP/HRIS, dokumentasi, dan lisensi komersial.',
    tech_stack: 'Laravel 12, PHP 8.2, Tailwind CSS 4, Alpine.js, Chart.js, DomPDF, SQLite/MySQL/PostgreSQL',
    features: premiumFeatures.join('\n'), free_features: freeFeatures.join('\n'), price: 599000, update_months: 12,
    file_path: result.premium, file_name: result.premium, free_file_path: result.free, free_file_name: result.free,
    demo_url: process.env.PORTAL_DEMO_URL || '', is_active: 1,
  };
  if (existing) db.prepare(`UPDATE products SET title=@title, category_id=@category_id, short_desc=@short_desc, description=@description, tech_stack=@tech_stack, features=@features, free_features=@free_features, price=@price, update_months=@update_months, file_path=@file_path, file_name=@file_name, free_file_path=@free_file_path, free_file_name=@free_file_name, demo_url=COALESCE(NULLIF(@demo_url,''), demo_url), is_active=@is_active WHERE slug=@slug`).run(data);
  else db.prepare(`INSERT INTO products (title, slug, category_id, short_desc, description, tech_stack, features, free_features, price, update_months, file_path, file_name, free_file_path, free_file_name, demo_url, is_active) VALUES (@title, @slug, @category_id, @short_desc, @description, @tech_stack, @features, @free_features, @price, @update_months, @file_path, @file_name, @free_file_path, @free_file_name, @demo_url, @is_active)`).run(data);
  console.log(`✔ Produk "${data.title}" ${existing ? 'diperbarui' : 'dibuat'} → /product/${SLUG}`);
}
