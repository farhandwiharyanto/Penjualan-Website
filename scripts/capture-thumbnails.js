// Memotret demo aplikasi dengan Chrome headless → public/uploads/thumb-<slug>.png (1280×800, rasio 16:10)
// lalu mengisi kolom thumbnail produk. Jalankan: npm run thumbs   (server toko harus jalan di APP_URL)
//   npm run thumbs -- --only <slug>      → hanya satu produk
//   npm run thumbs -- --url <slug>=<url> → pakai URL lain untuk slug tsb (mis. halaman yang butuh login, disimpan sebagai file HTML)
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const db = require('../db/db');

const CHROME = process.env.CHROME_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(fs.existsSync);
if (!CHROME) { console.error('Chrome/Chromium tidak ditemukan. Set CHROME_BIN=/path/ke/chrome'); process.exit(1); }
const APP_URL = process.env.APP_URL || 'http://localhost:3000';
const OUT = path.join(__dirname, '..', 'public', 'uploads');
const args = process.argv.slice(2);
const only = (i => i >= 0 ? args[i + 1] : null)(args.indexOf('--only'));
const overrides = Object.fromEntries(args.flatMap((a, i) => a === '--url' ? [args[i + 1].split(/=(.+)/).slice(0, 2)] : []));

const products = db.prepare("SELECT id, slug, title, demo_url FROM products WHERE is_active = 1").all().filter(p => !only || p.slug === only);
for (const p of products) {
  const url = overrides[p.slug] || (p.demo_url ? (p.demo_url.startsWith('/') ? APP_URL + p.demo_url : p.demo_url) : null);
  if (!url) { console.log(`- ${p.slug}: tidak ada demo_url, lewati (pakai --url ${p.slug}=<url>)`); continue; }
  const file = `thumb-${p.slug}.png`;
  try {
    execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files', '--window-size=1280,800', '--virtual-time-budget=4000',
      `--screenshot=${path.join(OUT, file)}`, url], { stdio: 'ignore', timeout: 60000 });
    db.prepare('UPDATE products SET thumbnail = ? WHERE id = ?').run(file, p.id);
    console.log(`✔ ${p.slug} → public/uploads/${file} (${(fs.statSync(path.join(OUT, file)).size / 1024).toFixed(0)} KB)`);
  } catch (e) { console.log(`✖ ${p.slug}: gagal memotret ${url} — ${e.message.split('\n')[0]}`); }
}
