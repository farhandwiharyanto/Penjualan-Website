// Membuat paket zip versi GRATIS & PREMIUM dari samples/<slug>/index.html,
// menyimpannya ke storage/files, memasang demo premium di public/demos/<slug>/,
// lalu mengisi kolom file/demo_url produk di database.
// Jalankan: npm run build:samples
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const db = require('../db/db');

const ROOT = path.join(__dirname, '..');
const SAMPLES = path.join(ROOT, 'samples');
const FILES_DIR = path.join(ROOT, 'storage', 'files');
const DEMOS_DIR = path.join(ROOT, 'public', 'demos');
const APP_URL = process.env.APP_URL || 'http://localhost:3000';

const META = {
  'pos-kasir-toko-sederhana': { name: 'POS Kasir Toko Sederhana', locks: { LAPORAN: 'Laporan penjualan & export CSV', PENGGUNA: 'Multi-user & role kasir/admin' },
    free: ['Manajemen produk, kategori & stok', 'Transaksi kasir cepat dengan pencarian produk & barcode', 'Riwayat transaksi'],
    premium: ['Cetak struk (printer thermal 58/80mm)', 'Laporan penjualan harian, mingguan, bulanan & per kasir', 'Export laporan ke CSV', 'Multi-user dengan role admin & kasir'] },
  'dashboard-admin-analytics': { name: 'Dashboard Admin Analytics', locks: { USERS: 'Manajemen user, role & permission', SETTINGS: 'Pengaturan & API key' },
    free: ['Chart interaktif (line, bar, pie)', 'Tabel data dengan sorting, filter & pagination', 'Dark mode & layout responsif'],
    premium: ['Filter rentang tanggal (7/30/90 hari)', 'Export data ke CSV', 'Manajemen user, role & permission', 'Halaman pengaturan + REST API key', 'Dokumentasi endpoint API (docs/API.md)'] },
  'aplikasi-booking-lapangan': { name: 'Aplikasi Booking Lapangan Olahraga', locks: { RIWAYAT: 'Riwayat & pembatalan booking', ADMIN: 'Panel pengelola lapangan' },
    free: ['Kalender ketersediaan lapangan real-time', 'Booking per jam dengan konfirmasi otomatis', 'Multi lapangan dengan harga berbeda'],
    premium: ['Riwayat & pembatalan booking pelanggan', 'Notifikasi pengingat jadwal (browser push)', 'Panel pengelola: kelola lapangan, semua booking, status selesai/batal', 'Statistik booking & pendapatan'] },
};

function build(slug) {
  const meta = META[slug];
  const product = db.prepare('SELECT id, price FROM products WHERE slug = ?').get(slug);
  if (!product) { console.warn(`Lewati ${slug}: produk tidak ada di DB (jalankan npm run seed dulu).`); return; }
  const src = fs.readFileSync(path.join(SAMPLES, slug, 'index.html'), 'utf8');
  const upgradeUrl = `${APP_URL}/product/${slug}`;

  const variants = {
    premium: src.replace(/<!--PREMIUM-->|<!--\/PREMIUM-->/g, '').replace(/__LOCK__/g, '').replace(/__LOCK_[A-Z]+__/g, '').replace(/__FREE_RANGE__|__FREE_MARK__/g, '')
      .replace(/__TIER__/g, 'premium').replace(/__TIER_LABEL__/g, 'PREMIUM').replace(/__TIER_BADGE__/g, 'ok'),
    free: src.replace(/<!--PREMIUM-->[\s\S]*?<!--\/PREMIUM-->/g, '').replace(/__LOCK__/g, 'lock')
      .replace(/__LOCK_([A-Z]+)__/g, (_, k) => lockBox(meta.locks[k] || 'Fitur ini', upgradeUrl))
      .replace(/__FREE_RANGE__/g, '<span class="mu">30 hari terakhir</span>')
      .replace(/__FREE_MARK__/g, `<div class="free-mark">Versi Gratis · <a href="${upgradeUrl}" target="_blank">Upgrade ke Premium →</a></div>`)
      .replace(/__TIER__/g, 'free').replace(/__TIER_LABEL__/g, 'GRATIS').replace(/__TIER_BADGE__/g, 'wn'),
  };
  variants.free = variants.free.replace('__UPGRADE_URL__', upgradeUrl);
  variants.premium = variants.premium.replace('__UPGRADE_URL__', upgradeUrl);

  const out = {};
  for (const tier of ['free', 'premium']) {
    const dir = path.join(SAMPLES, '.build', `${slug}-${tier}`);
    fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(path.join(dir, 'assets'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), variants[tier]);
    fs.copyFileSync(path.join(SAMPLES, '_shared.css'), path.join(dir, 'assets', 'style.css'));
    fs.copyFileSync(path.join(SAMPLES, '_shared.js'), path.join(dir, 'assets', 'shared.js'));
    fs.writeFileSync(path.join(dir, 'README.md'), readme(meta, tier, upgradeUrl));
    fs.writeFileSync(path.join(dir, 'LICENSE.txt'), license(meta, tier));
    if (tier === 'premium') {
      fs.mkdirSync(path.join(dir, 'docs'));
      fs.writeFileSync(path.join(dir, 'docs', 'INSTALL.md'), installDoc(meta));
      fs.writeFileSync(path.join(dir, 'CHANGELOG.md'), `# Changelog\n\n## 1.0.0\n- Rilis pertama: ${[...meta.free, ...meta.premium].join(', ')}.\n`);
      if (slug === 'dashboard-admin-analytics') fs.writeFileSync(path.join(dir, 'docs', 'API.md'), apiDoc());
    }
    const zipName = `${slug}-${tier}-v1.0.0.zip`;
    const zipPath = path.join(FILES_DIR, zipName);
    fs.rmSync(zipPath, { force: true });
    execSync(`cd "${dir}" && zip -qr "${zipPath}" .`);
    out[tier] = zipName;
    // demo live = versi premium, dipasang di /public/demos/<slug>/
    if (tier === 'premium') {
      const demoDir = path.join(DEMOS_DIR, slug);
      fs.rmSync(demoDir, { recursive: true, force: true }); fs.mkdirSync(demoDir, { recursive: true });
      fs.cpSync(dir, demoDir, { recursive: true });
    }
  }
  fs.rmSync(path.join(SAMPLES, '.build'), { recursive: true, force: true });

  db.prepare(`UPDATE products SET file_path = ?, file_name = ?, free_file_path = ?, free_file_name = ?, demo_url = ?, tech_stack = ?, features = ?, free_features = ? WHERE id = ?`)
    .run(out.premium, `${slug}-premium-v1.0.0.zip`, out.free, `${slug}-free-v1.0.0.zip`, `/public/demos/${slug}/`,
      'HTML, CSS, JavaScript, localStorage', [...meta.free, ...meta.premium].join('\n'), meta.free.join('\n'), product.id);
  console.log(`✔ ${meta.name}: ${out.free} (${size(out.free)}), ${out.premium} (${size(out.premium)}), demo → /public/demos/${slug}/`);
}
const lockBox = (feature, url) => `<div class="lockbox"><strong>🔒 ${feature} — fitur Premium</strong>Tersedia di versi Premium beserta dokumentasi, update &amp; lisensi komersial.<br><a href="${url}" target="_blank" class="btn" style="margin-top:12px">Upgrade ke Premium</a></div>`;
const size = f => (fs.statSync(path.join(FILES_DIR, f)).size / 1024).toFixed(1) + ' KB';

function readme(meta, tier, url) {
  return `# ${meta.name} — ${tier === 'premium' ? 'Versi Premium' : 'Versi Gratis'}

Aplikasi web statis: cukup buka \`index.html\` di browser, tidak perlu install apa pun.
Data disimpan di localStorage browser (per perangkat). Untuk produksi multi-perangkat,
hubungkan ke backend/database sesuai kebutuhan (lihat bagian *Pengembangan*).

## Fitur${tier === 'premium' ? '' : ' versi gratis'}
${meta.free.map(f => `- ${f}`).join('\n')}
${tier === 'premium' ? meta.premium.map(f => `- ${f}`).join('\n') : `
## Hanya di Premium
${meta.premium.map(f => `- 🔒 ${f}`).join('\n')}

Upgrade: ${url}`}

## Cara menjalankan
1. Ekstrak zip ini.
2. Buka \`index.html\` dengan Chrome/Edge/Firefox. (Klik dua kali sudah cukup.)
3. Opsional, jalankan lewat server lokal: \`npx serve .\` lalu buka http://localhost:3000

## Struktur
\`\`\`
index.html        — seluruh aplikasi (HTML + JS)
assets/style.css  — gaya
assets/shared.js  — util (penyimpanan, format rupiah, tema)
${tier === 'premium' ? 'docs/INSTALL.md   — panduan deploy & kustomisasi\nCHANGELOG.md\n' : ''}LICENSE.txt
\`\`\`

## Pengembangan
- Semua data lewat objek \`DB\` di \`assets/shared.js\`. Ganti \`DB.get/set\` dengan panggilan API untuk memakai backend.
- Warna utama ada di variabel CSS \`--p\` di \`assets/style.css\`.
${tier === 'premium' ? '- Dukungan: balas email pembelian kamu atau hubungi admin toko.' : '- Versi gratis tidak termasuk dukungan & update.'}
`;
}
function license(meta, tier) {
  return tier === 'premium'
    ? `LISENSI KOMERSIAL — ${meta.name}\n\nPembeli berhak menggunakan, memodifikasi, dan memasang source code ini untuk\nproject pribadi maupun project klien tanpa batasan jumlah, termasuk untuk tujuan komersial.\n\nTidak diperbolehkan: menjual kembali atau mendistribusikan source code ini (asli maupun\nmodifikasi) sebagai produk source code/template kepada pihak lain.\n\nDisediakan "sebagaimana adanya" tanpa jaminan. Hak update sesuai masa yang tertera pada pesanan.\n`
    : `LISENSI PERSONAL — ${meta.name} (Versi Gratis)\n\nBoleh digunakan untuk belajar, evaluasi, dan project pribadi non-komersial.\nTidak boleh digunakan untuk project klien/komersial, dijual kembali, atau didistribusikan ulang.\nWatermark "Versi Gratis" tidak boleh dihilangkan.\n\nUntuk penggunaan komersial, upgrade ke versi Premium.\n`;
}
function installDoc(meta) {
  return `# Panduan Instalasi & Deploy — ${meta.name}

## Lokal
Buka \`index.html\` langsung, atau \`npx serve .\`.

## Deploy (gratis)
- **Netlify**: drag-drop folder ini ke app.netlify.com/drop.
- **Vercel**: \`npx vercel\` di folder ini.
- **GitHub Pages**: push ke repo, aktifkan Pages dari branch main.
- **Hosting cPanel**: upload semua file ke \`public_html\`.

## Menghubungkan ke backend
Semua akses data melalui \`DB.get(key)\` / \`DB.set(key, value)\` di \`assets/shared.js\`.
Ganti implementasinya dengan \`fetch()\` ke API kamu, contoh:

\`\`\`js
const DB = {
  async get(k, d) { const r = await fetch('/api/' + k); return r.ok ? r.json() : d; },
  async set(k, v) { await fetch('/api/' + k, { method: 'PUT', body: JSON.stringify(v) }); },
};
\`\`\`

## Kustomisasi
- Nama/brand: cari elemen \`.brand\` di \`index.html\`.
- Warna: variabel \`--p\` (utama) dan \`--p2\` (hover) di \`assets/style.css\`.
- Tema gelap otomatis mengikuti sistem; tombol 🌓 untuk override.
`;
}
function apiDoc() {
  return `# REST API (contoh kontrak)

Dashboard ini siap dihubungkan ke backend dengan kontrak berikut. Semua request memakai header
\`Authorization: Bearer <API_KEY>\` (lihat halaman Pengaturan).

| Method | Endpoint | Keterangan |
|---|---|---|
| GET | /api/orders?from=YYYY-MM-DD&to=YYYY-MM-DD | daftar pesanan |
| GET | /api/orders/:id | detail pesanan |
| GET | /api/stats?days=30 | ringkasan (revenue, paid, pending, conversion) |
| GET | /api/users | daftar user |
| POST | /api/users | buat user \`{name,email,role,perms[]}\` |
| PATCH | /api/users/:id | ubah role/permission |
| DELETE | /api/users/:id | hapus user |

Format pesanan: \`{ id, customer, product, category, amount, status: "paid"|"pending"|"canceled", date }\`.
`;
}

fs.mkdirSync(FILES_DIR, { recursive: true }); fs.mkdirSync(DEMOS_DIR, { recursive: true });
Object.keys(META).forEach(build);
console.log('Selesai. Buka halaman produk untuk melihat demo live & tombol download.');
