// Mengemas folder project menjadi zip siap jual: membuang data, rahasia & sampah build,
// menambahkan .env.example, dan memberi peringatan bila ada indikasi rahasia yang ikut.
// Dipakai oleh scripts/package-project.js (terminal) dan impor GitHub di panel admin.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const FILES_DIR = path.join(__dirname, '..', 'storage', 'files');

// ---- aturan: apa yang dibuang ----
const DROP_DIRS = new Set(['node_modules', 'vendor', '.git', '.svn', '.idea', '.vscode', 'dist', 'build', '.next', '.nuxt', '.cache', '.turbo', 'coverage',
  '__pycache__', '.venv', 'venv', 'storage/logs', 'storage/framework', 'storage/app', 'public/uploads', 'uploads', 'public/storage', 'bootstrap/cache', 'tmp', 'temp', 'logs']);
const DROP_FILES = [/^\.env(\..+)?$/i, /\.(sqlite|sqlite3|db)$/i, /\.(log|pid|lock)$/i, /\.DS_Store$/, /^Thumbs\.db$/, /\.(bak|swp|orig)$/i, /^npm-debug/, /\.(pem|key|p12|pfx|jks|keystore)$/i,
  /credentials?\.json$/i, /service[-_]?account.*\.json$/i, /firebase.+\.json$/i, /google-services\.json$/i, /GoogleService-Info\.plist$/i, /^id_rsa/];
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
// Peringatan yang dianggap serius: impor/zip ditahan sampai user memaksa (--force / centang konfirmasi)
const BLOCKING_WARNING = /Midtrans|Stripe|AWS|Google API|token|password|URI/;

// Telusuri folder: tentukan file yang ikut, yang dibuang, dan peringatan
function scanProject(srcDir) {
  const dropped = [], warnings = [], kept = [];
  (function walk(dir, rel = '') {
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
  })(srcDir);

  // .env.example: dibuat dari .env asli dengan nilai dikosongkan (jika belum ada)
  let envExample = null;
  const envPath = path.join(srcDir, '.env');
  if (fs.existsSync(envPath) && !fs.existsSync(path.join(srcDir, '.env.example'))) {
    envExample = fs.readFileSync(envPath, 'utf8').split('\n').map(l => {
      const m = l.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/); if (!m) return l;
      const k = m[1]; const keepVal = /^(APP_ENV|APP_DEBUG|APP_PORT|PORT|NODE_ENV|DB_CONNECTION|DB_HOST|DB_PORT|CACHE_DRIVER|SESSION_DRIVER|QUEUE_CONNECTION|LOG_LEVEL|MAIL_MAILER|MAIL_PORT)$/.test(k);
      return keepVal ? l : `${k}=`;
    }).join('\n');
  }

  return { dropped, kept, warnings, envExample, blocking: warnings.filter(w => BLOCKING_WARNING.test(w)) };
}

// Salin file yang lolos scan ke folder sementara lalu zip ke storage/files/<zipName>.
// folderName = nama folder di dalam zip (biasanya nama project).
function buildZip(srcDir, scan, { zipName, folderName }) {
  fs.mkdirSync(FILES_DIR, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pkg-'));
  try {
    const stage = path.join(tmp, folderName); fs.mkdirSync(stage);
    for (const r of scan.kept) { const dst = path.join(stage, r); fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(path.join(srcDir, r), dst); }
    if (scan.envExample) fs.writeFileSync(path.join(stage, '.env.example'), scan.envExample);
    if (!scan.kept.some(k => /^README/i.test(k))) fs.writeFileSync(path.join(stage, 'README.md'), `# ${folderName}\n\n## Instalasi\n1. Salin \`.env.example\` menjadi \`.env\` dan isi konfigurasinya.\n2. Install dependency (\`npm install\` / \`composer install\`).\n3. Jalankan migrasi & seed data contoh.\n4. Jalankan server.\n`);
    const zipPath = path.join(FILES_DIR, zipName); fs.rmSync(zipPath, { force: true });
    execSync(`cd "${tmp}" && zip -qr "${zipPath}" "${folderName}"`);
    return { zipName, zipPath, size: fs.statSync(zipPath).size };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

module.exports = { scanProject, buildZip, FILES_DIR };
