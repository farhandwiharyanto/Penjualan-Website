// Mengemas project/website yang sudah ada menjadi zip siap jual: membuang data, rahasia & sampah build,
// menambahkan .env.example, lalu (opsional) langsung memasangnya ke produk di toko.
//
//   npm run package -- <folder-project> [--slug <slug-produk>] [--tier premium|free] [--name <nama-zip>] [--dry]
//
// Contoh:
//   npm run package -- ~/projects/toko-online --slug toko-online-laravel --tier premium
//   npm run package -- ~/projects/toko-online --dry        # hanya tampilkan apa yang akan dibuang/diperingatkan
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const args = process.argv.slice(2);
const src = args.find(a => !a.startsWith('--'));
const opt = k => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : null; };
const dry = args.includes('--dry');
if (!src) { console.error('Pakai: npm run package -- <folder-project> [--slug x] [--tier premium|free] [--dry]'); process.exit(1); }
const SRC = path.resolve(src.replace(/^~/, process.env.HOME));
if (!fs.existsSync(SRC)) { console.error('Folder tidak ditemukan:', SRC); process.exit(1); }

// ---- aturan: apa yang dibuang ----
const DROP_DIRS = new Set(['node_modules', 'vendor', '.git', '.svn', '.idea', '.vscode', 'dist', 'build', '.next', '.nuxt', '.cache', '.turbo', 'coverage',
  '__pycache__', '.venv', 'venv', 'storage/logs', 'storage/framework', 'storage/app', 'public/uploads', 'uploads', 'public/storage', 'bootstrap/cache', 'tmp', 'temp', 'logs']);
const DROP_FILES = [/^\.env(\..+)?$/i, /\.(sqlite|sqlite3|db)$/i, /\.(log|pid|lock)$/i, /\.DS_Store$/, /^Thumbs\.db$/, /\.(bak|swp|orig)$/i, /^npm-debug/, /\.(pem|key|p12|pfx|jks|keystore)$/i,
  /credentials?\.json$/i, /service[-_]?account.*\.json$/i, /firebase.*\.json$/i, /google-services\.json$/i, /GoogleService-Info\.plist$/i, /^id_rsa/];
const KEEP_FILES = [/\.env\.example$/i, /package-lock\.json$/, /composer\.lock$/, /yarn\.lock$/, /pnpm-lock\.yaml$/]; // lock file boleh ikut
const DATA_DUMPS = /\.(sql|dump|csv|xlsx)$/i; // tidak otomatis dibuang, tapi diperingatkan

// pola rahasia di isi file (untuk peringatan)
const SECRET_PATTERNS = [
  [/(SB-|Mid-)(server|client)-[A-Za-z0-9_-]{10,}/, 'Midtrans key'],
  [/sk_(live|test)_[A-Za-z0-9]{10,}/, 'Stripe/Secret key'],
  [/AKIA[0-9A-Z]{16}/, 'AWS access key'],
  [/AIza[0-9A-Za-z_-]{30,}/, 'Google API key'],
  [/xox[bp]-[0-9A-Za-z-]{20,}/, 'Slack token'],
  [/ghp_[A-Za-z0-9]{30,}/, 'GitHub token'],
  [/(password|passwd|db_pass|secret)\s*[:=]\s*['"][^'"\s]{6,}['"]/i, 'password/secret hardcoded'],
  [/mongodb(\+srv)?:\/\/[^\s'"]+:[^\s'"]+@/i, 'MongoDB URI berisi password'],
  [/mysql:\/\/[^\s'"]+:[^\s'"]+@/i, 'MySQL URI berisi password'],
  [/(08|\+62)\d{8,12}/, 'nomor telepon (WA?)'],
];
const TEXT_EXT = /\.(js|ts|jsx|tsx|vue|php|py|rb|go|java|kt|dart|json|yml|yaml|toml|ini|env|html|htm|ejs|blade\.php|twig|md|txt|xml|cfg|conf|sh)$/i;

const dropped = [], warnings = [], kept = [];
function walk(dir, rel = '') {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name), r = rel ? rel + '/' + name : name;
    const st = fs.lstatSync(full);
    if (st.isSymbolicLink()) { dropped.push(r + ' (symlink)'); continue; }
    if (st.isDirectory()) {
      if (DROP_DIRS.has(name) || DROP_DIRS.has(r)) { dropped.push(r + '/'); continue; }
      walk(full, r); continue;
    }
    if (KEEP_FILES.some(p => p.test(name))) { kept.push(r); continue; }
    if (DROP_FILES.some(p => p.test(name))) { dropped.push(r); continue; }
    if (DATA_DUMPS.test(name)) warnings.push(`${r} — dump/data? pastikan hanya berisi data CONTOH, bukan data pelanggan`);
    if (st.size > 25 * 1024 * 1024) warnings.push(`${r} — ${(st.size / 1048576).toFixed(1)} MB, yakin perlu ikut?`);
    if (TEXT_EXT.test(name) && st.size < 2 * 1024 * 1024) {
      const txt = fs.readFileSync(full, 'utf8');
      for (const [re, label] of SECRET_PATTERNS) { const m = txt.match(re); if (m) { warnings.push(`${r} — kemungkinan ${label}: "${m[0].slice(0, 40)}…"`); break; } }
    }
    kept.push(r);
  }
}
walk(SRC);

// ---- .env.example: dibuat dari .env asli dengan nilai dikosongkan (jika belum ada) ----
let envExample = null;
const envPath = path.join(SRC, '.env');
if (fs.existsSync(envPath) && !fs.existsSync(path.join(SRC, '.env.example'))) {
  envExample = fs.readFileSync(envPath, 'utf8').split('\n').map(l => {
    const m = l.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/); if (!m) return l;
    const k = m[1]; const keepVal = /^(APP_ENV|APP_DEBUG|APP_PORT|PORT|NODE_ENV|DB_CONNECTION|DB_HOST|DB_PORT|CACHE_DRIVER|SESSION_DRIVER|QUEUE_CONNECTION|LOG_LEVEL|MAIL_MAILER|MAIL_PORT)$/.test(k);
    return keepVal ? l : `${k}=`;
  }).join('\n');
}

// ---- laporan ----
const name = path.basename(SRC);
console.log(`\nProject: ${SRC}`);
console.log(`Dibuang (${dropped.length}):`); dropped.slice(0, 40).forEach(d => console.log('  - ' + d)); if (dropped.length > 40) console.log(`  … +${dropped.length - 40} lagi`);
console.log(`Ikut (${kept.length} file)`);
if (envExample) console.log('  + .env.example (dibuat otomatis dari .env, nilai rahasia dikosongkan)');
if (warnings.length) { console.log(`\n⚠ PERIKSA (${warnings.length}):`); warnings.forEach(w => console.log('  ! ' + w)); }
else console.log('\n✔ Tidak ada indikasi rahasia/data di file yang ikut.');
if (dry) { console.log('\n(--dry: tidak ada zip yang dibuat)'); process.exit(0); }
if (warnings.some(w => /Midtrans|Stripe|AWS|Google API|token|password|URI/.test(w)) && !args.includes('--force')) {
  console.log('\n✖ Ada indikasi rahasia di file yang akan ikut. Bersihkan dulu, atau tambahkan --force jika yakin itu hanya contoh.');
  process.exit(2);
}

// ---- salin ke folder sementara & zip ----
const tier = opt('tier') || 'premium';
const zipName = (opt('name') || `${name}-${tier}-${new Date().toISOString().slice(0, 10)}`).replace(/[^a-z0-9._-]+/gi, '-') + '.zip';
const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'pkg-'));
const stage = path.join(tmp, name); fs.mkdirSync(stage);
for (const r of kept) { const dst = path.join(stage, r); fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(path.join(SRC, r), dst); }
if (envExample) fs.writeFileSync(path.join(stage, '.env.example'), envExample);
if (!kept.some(k => /^README/i.test(k))) fs.writeFileSync(path.join(stage, 'README.md'), `# ${name}\n\n## Instalasi\n1. Salin \`.env.example\` menjadi \`.env\` dan isi konfigurasinya.\n2. Install dependency (\`npm install\` / \`composer install\`).\n3. Jalankan migrasi & seed data contoh.\n4. Jalankan server.\n`);
const FILES_DIR = path.join(__dirname, '..', 'storage', 'files'); fs.mkdirSync(FILES_DIR, { recursive: true });
const zipPath = path.join(FILES_DIR, zipName); fs.rmSync(zipPath, { force: true });
execSync(`cd "${tmp}" && zip -qr "${zipPath}" "${name}"`);
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n✔ Zip dibuat: storage/files/${zipName} (${(fs.statSync(zipPath).size / 1048576).toFixed(2)} MB)`);

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
