// Mengemas project/website yang sudah ada menjadi zip siap jual: membuang data, rahasia & sampah build,
// menambahkan .env.example, lalu (opsional) langsung memasangnya ke produk di toko.
// Aturan pembersihannya ada di lib/packager.js (dipakai juga oleh impor GitHub di panel admin).
//
//   npm run package -- <folder-project> [--slug <slug-produk>] [--tier premium|free] [--name <nama-zip>] [--dry]
//
// Contoh:
//   npm run package -- ~/projects/toko-online --slug toko-online-laravel --tier premium
//   npm run package -- ~/projects/toko-online --dry        # hanya tampilkan apa yang akan dibuang/diperingatkan
const fs = require('fs');
const path = require('path');
const { scanProject, buildZip } = require('../lib/packager');

const args = process.argv.slice(2);
const src = args.find(a => !a.startsWith('--'));
const opt = k => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : null; };
const dry = args.includes('--dry');
if (!src) { console.error('Pakai: npm run package -- <folder-project> [--slug x] [--tier premium|free] [--dry]'); process.exit(1); }
const SRC = path.resolve(src.replace(/^~/, process.env.HOME));
if (!fs.existsSync(SRC)) { console.error('Folder tidak ditemukan:', SRC); process.exit(1); }

const scan = scanProject(SRC);
const { dropped, kept, warnings, envExample } = scan;

// ---- laporan ----
const name = path.basename(SRC);
console.log(`\nProject: ${SRC}`);
console.log(`Dibuang (${dropped.length}):`); dropped.slice(0, 40).forEach(d => console.log('  - ' + d)); if (dropped.length > 40) console.log(`  … +${dropped.length - 40} lagi`);
console.log(`Ikut (${kept.length} file)`);
if (envExample) console.log('  + .env.example (dibuat otomatis dari .env, nilai rahasia dikosongkan)');
if (warnings.length) { console.log(`\n⚠ PERIKSA (${warnings.length}):`); warnings.forEach(w => console.log('  ! ' + w)); }
else console.log('\n✔ Tidak ada indikasi rahasia/data di file yang ikut.');
if (dry) { console.log('\n(--dry: tidak ada zip yang dibuat)'); process.exit(0); }
if (scan.blocking.length && !args.includes('--force')) {
  console.log('\n✖ Ada indikasi rahasia di file yang akan ikut. Bersihkan dulu, atau tambahkan --force jika yakin itu hanya contoh.');
  process.exit(2);
}

// ---- zip ----
const tier = opt('tier') || 'premium';
const zipName = (opt('name') || `${name}-${tier}-${new Date().toISOString().slice(0, 10)}`).replace(/[^a-z0-9._-]+/gi, '-') + '.zip';
const zip = buildZip(SRC, scan, { zipName, folderName: name });
console.log(`\n✔ Zip dibuat: storage/files/${zipName} (${(zip.size / 1048576).toFixed(2)} MB)`);

// ---- pasang ke produk ----
const slug = opt('slug');
if (slug) {
  const db = require('../db/db');
  const p = db.prepare('SELECT id, title FROM products WHERE slug = ?').get(slug);
  if (!p) { console.log(`Produk dengan slug "${slug}" tidak ada — buat dulu di admin, lalu jalankan lagi, atau upload zip lewat form Edit Produk.`); process.exit(0); }
  const cols = tier === 'free' ? ['free_file_path', 'free_file_name'] : ['file_path', 'file_name'];
  db.prepare(`UPDATE products SET ${cols[0]} = ?, ${cols[1]} = ? WHERE id = ?`).run(zipName, zipName, p.id);
  console.log(`✔ Dipasang sebagai file ${tier.toUpperCase()} untuk produk "${p.title}".`);
} else {
  console.log('Untuk memasang ke produk: tambahkan --slug <slug-produk> [--tier premium|free], atau upload lewat Admin → Produk → Edit.');
}
