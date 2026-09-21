const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db/db');
const { requireAuth, requireAdmin } = require('./_middleware');
const { ensureServiceOrders } = require('../lib/services');
const { scanProject, buildZip } = require('../lib/packager');
const gh = require('../lib/github');

router.use(requireAuth, requireAdmin);

const UPLOAD_DIR = path.join(__dirname, '..', 'public', 'uploads');   // thumbnail (publik)
const FILES_DIR = path.join(__dirname, '..', 'storage', 'files');      // file produk (privat, hanya via /download)
const ALLOWED_ARCHIVE = /\.(zip|rar|7z|tar|gz|tgz)$/i;

// Thumbnail ke folder publik, file produk ke folder privat
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, file.fieldname === 'thumbnail' ? UPLOAD_DIR : FILES_DIR),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g, '-')),
});
const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB
  fileFilter: (req, file, cb) => {
    if ((file.fieldname === 'product_file' || file.fieldname === 'free_file') && !ALLOWED_ARCHIVE.test(file.originalname)) {
      return cb(new Error('File produk harus berupa arsip (.zip, .rar, .7z, .tar.gz)'));
    }
    cb(null, true);
  },
});
const productUpload = upload.fields([{ name: 'thumbnail', maxCount: 1 }, { name: 'product_file', maxCount: 1 }, { name: 'free_file', maxCount: 1 }]);

function pickFile(req, field) {
  return req.files && req.files[field] && req.files[field][0];
}

function removeProductFile(filename) {
  if (!filename) return;
  fs.unlink(path.join(FILES_DIR, filename), () => {}); // abaikan jika file sudah tidak ada
}

function slugify(text) {
  return text.toString().toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') + '-' + Date.now().toString().slice(-5);
}

router.get('/', (req, res) => {
  const productCount = db.prepare('SELECT COUNT(*) AS c FROM products').get().c;
  const orderCount = db.prepare('SELECT COUNT(*) AS c FROM orders').get().c;
  const paidCount = db.prepare("SELECT COUNT(*) AS c FROM orders WHERE status = 'paid'").get().c;
  const pendingCount = db.prepare("SELECT COUNT(*) AS c FROM orders WHERE status = 'pending'").get().c;
  const buyerCount = db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'buyer'").get().c;
  const downloadCount = db.prepare("SELECT COUNT(*) AS c FROM downloads WHERE tier = 'premium'").get().c;
  const freeDownloadCount = db.prepare("SELECT COUNT(*) AS c FROM downloads WHERE tier = 'free'").get().c;
  // Konversi freemium per produk: user unik yang unduh gratis, dan berapa di antaranya lalu beli premium produk yang sama
  const freemium = db.prepare(`SELECT p.id, p.title,
      COUNT(DISTINCT d.user_id) AS free_users,
      COUNT(DISTINCT CASE WHEN EXISTS (SELECT 1 FROM orders o JOIN order_items oi ON oi.order_id = o.id
                                       WHERE o.user_id = d.user_id AND o.status = 'paid' AND oi.product_id = p.id) THEN d.user_id END) AS converted
    FROM downloads d JOIN products p ON p.id = d.product_id WHERE d.tier = 'free'
    GROUP BY p.id ORDER BY free_users DESC LIMIT 5`).all();
  const freeUsersTotal = freemium.reduce((a, r) => a + r.free_users, 0);
  const convertedTotal = freemium.reduce((a, r) => a + r.converted, 0);
  const freemiumRate = freeUsersTotal ? Math.round(convertedTotal / freeUsersTotal * 100) : null;
  const revenueAll = db.prepare("SELECT COALESCE(SUM(total),0) AS s FROM orders WHERE status = 'paid'").get().s;

  // Pendapatan 30 hari terakhir vs 30 hari sebelumnya (berdasarkan paid_at)
  const revenue30 = db.prepare(`SELECT COALESCE(SUM(total),0) AS s FROM orders
                                WHERE status = 'paid' AND paid_at >= datetime('now', '-30 days')`).get().s;
  const revenuePrev30 = db.prepare(`SELECT COALESCE(SUM(total),0) AS s FROM orders
                                    WHERE status = 'paid' AND paid_at >= datetime('now', '-60 days') AND paid_at < datetime('now', '-30 days')`).get().s;
  const revenueDelta = revenuePrev30 > 0 ? Math.round((revenue30 - revenuePrev30) / revenuePrev30 * 100) : null;

  // Deret harian 30 hari: pendapatan lunas & jumlah order lunas per hari (hari kosong = 0)
  const dailyRows = db.prepare(`SELECT date(paid_at) AS d, SUM(total) AS revenue, COUNT(*) AS orders FROM orders
                                WHERE status = 'paid' AND paid_at >= date('now', '-29 days') GROUP BY d`).all();
  const byDay = Object.fromEntries(dailyRows.map(r => [r.d, r]));
  const daily = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    daily.push({ date: d, revenue: byDay[d] ? byDay[d].revenue : 0, orders: byDay[d] ? byDay[d].orders : 0 });
  }

  // Pesanan per status
  const statusRows = db.prepare('SELECT status, COUNT(*) AS c FROM orders GROUP BY status').all();
  const statusCounts = Object.fromEntries(statusRows.map(r => [r.status, r.c]));
  const conversion = orderCount > 0 ? Math.round(paidCount / orderCount * 100) : 0;

  // Produk terlaris (berdasarkan order lunas)
  const topProducts = db.prepare(`SELECT p.id, p.title, COUNT(oi.id) AS sold, SUM(oi.price) AS revenue
                                  FROM order_items oi JOIN orders o ON o.id = oi.order_id JOIN products p ON p.id = oi.product_id
                                  WHERE o.status = 'paid' GROUP BY p.id ORDER BY sold DESC, revenue DESC LIMIT 5`).all();

  // Hal yang perlu perhatian admin
  const attention = {
    noFile: db.prepare("SELECT id, title FROM products WHERE price > 0 AND (file_path IS NULL OR file_path = '')").all(),
    noDemo: db.prepare("SELECT id, title FROM products WHERE demo_url IS NULL OR demo_url = ''").all(),
    noThumb: db.prepare("SELECT id, title FROM products WHERE thumbnail IS NULL OR thumbnail = ''").all(),
    services: db.prepare("SELECT COUNT(*) AS c FROM service_orders WHERE status IN ('awaiting_info','in_progress')").get().c,
    stalePending: db.prepare(`SELECT id, order_code, total FROM orders WHERE status = 'pending'
                              AND created_at < datetime('now', '-1 day') ORDER BY created_at DESC LIMIT 5`).all(),
  };

  const recentOrders = db.prepare(`SELECT o.*, u.name AS buyer_name FROM orders o LEFT JOIN users u ON u.id = o.user_id
                                   ORDER BY o.created_at DESC LIMIT 8`).all();

  res.render('admin/dashboard', {
    productCount, orderCount, paidCount, pendingCount, buyerCount, downloadCount, freeDownloadCount, freemium, freemiumRate,
    revenueAll, revenue30, revenuePrev30, revenueDelta, daily, statusCounts, conversion,
    topProducts, attention, recentOrders, productsWithoutFile: attention.noFile.length,
  });
});

// -- Produk --
router.get('/products', (req, res) => {
  const products = db.prepare(`SELECT p.*, c.name AS category_name FROM products p
                                LEFT JOIN categories c ON c.id = p.category_id ORDER BY p.created_at DESC`).all();
  res.render('admin/products', { products });
});

router.get('/products/new', (req, res) => {
  const categories = db.prepare('SELECT * FROM categories ORDER BY name').all();
  res.render('admin/product-form', { product: null, categories, importForm: null });
});

// Impor produk dari repo GitHub: unduh tarball, bersihkan dengan aturan packager, simpan zip sebagai file premium,
// lalu buat produk draft (is_active = 0) yang sudah terisi judul/deskripsi/tech stack untuk dilengkapi di form edit.
router.post('/products/import', async (req, res, next) => {
  const { repo_url, ref, force } = req.body;
  const showForm = (error) => {
    const categories = db.prepare('SELECT * FROM categories ORDER BY name').all();
    res.status(400).render('admin/product-form', { product: null, categories, importForm: { repo_url, ref, error } });
  };
  const parsed = gh.parseRepoUrl(repo_url);
  if (!parsed) return showForm('URL repo tidak dikenali. Contoh yang benar: https://github.com/username/nama-repo');

  let repoDir = null;
  try {
    const info = await gh.getRepoInfo(parsed.owner, parsed.repo);
    const useRef = (ref || parsed.ref || info.defaultBranch).trim();
    repoDir = await gh.downloadRepo(info.owner, info.repo, useRef);
    const scan = scanProject(repoDir.dir);
    if (scan.warnings.length && !force) {
      return res.render('admin/product-import-review', { info, ref: useRef, scan, repo_url });
    }

    const languages = await gh.getLanguages(info.owner, info.repo);
    const readme = gh.readReadme(repoDir.dir);
    const title = gh.titleFromRepoName(info.repo);
    const zipName = `${Date.now()}-${info.repo}-premium.zip`;
    const zip = buildZip(repoDir.dir, scan, { zipName, folderName: info.repo });

    const result = db.prepare(`INSERT INTO products (title, slug, short_desc, description, tech_stack, features, price, is_active,
                                 file_path, file_name, source_repo, source_ref)
                               VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?)`)
      .run(title, slugify(title), info.description.slice(0, 140), readme.description || info.description, gh.detectStack(repoDir.dir, languages),
           readme.features, zipName, `${info.repo}-premium.zip`, info.url, useRef);
    req.flash('success', `"${title}" diimpor dari GitHub (${scan.kept.length} file, ${(zip.size / 1048576).toFixed(2)} MB). Periksa isian, lengkapi harga & thumbnail, lalu centang "Tampilkan di katalog".`);
    res.redirect(`/admin/products/${result.lastInsertRowid}/edit`);
  } catch (e) {
    if (e instanceof gh.GitHubError) return showForm(e.message);
    next(e);
  } finally {
    if (repoDir) repoDir.cleanup();
  }
});

router.post('/products', upload.single('thumbnail'), (req, res) => {
  const { title, category_id, short_desc, description, tech_stack, features, price, demo_url } = req.body;
  const slug = slugify(title);
  const thumbnail = req.file ? req.file.filename : '';
  db.prepare(`INSERT INTO products (title, slug, category_id, short_desc, description, tech_stack, price, thumbnail, demo_url, is_active)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`)
    .run(title, slug, category_id || null, short_desc, description, tech_stack, parseInt(price, 10), thumbnail, demo_url);
  res.redirect('/admin/products');
});

router.get('/products/:id/edit', (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).send('Produk tidak ditemukan');
  const categories = db.prepare('SELECT * FROM categories ORDER BY name').all();
  res.render('admin/product-form', { product, categories });
});

router.put('/products/:id', productUpload, (req, res) => {
  const { title, category_id, short_desc, description, tech_stack, features, free_features, price, update_months, setup_price, demo_url, is_active, remove_free_file } = req.body;
  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).send('Produk tidak ditemukan');
  const thumb = pickFile(req, 'thumbnail');
  const file = pickFile(req, 'product_file');
  const freeFile = pickFile(req, 'free_file');
  const thumbnail = thumb ? thumb.filename : existing.thumbnail;
  let filePath = existing.file_path, fileName = existing.file_name;
  if (file) {
    removeProductFile(existing.file_path); // ganti file: hapus yang lama
    filePath = file.filename;
    fileName = file.originalname;
  }
  let freePath = existing.free_file_path, freeName = existing.free_file_name;
  if (freeFile) {
    removeProductFile(existing.free_file_path);
    freePath = freeFile.filename;
    freeName = freeFile.originalname;
  } else if (remove_free_file) {
    removeProductFile(existing.free_file_path);
    freePath = null; freeName = null;
  }
  db.prepare(`UPDATE products SET title=?, category_id=?, short_desc=?, description=?, tech_stack=?, features=?, free_features=?, price=?, update_months=?, setup_price=?, thumbnail=?, demo_url=?,
              file_path=?, file_name=?, free_file_path=?, free_file_name=?, is_active=? WHERE id=?`)
    .run(title, category_id || null, short_desc, description, tech_stack, features, free_features, parseInt(price, 10) || 0, parseInt(update_months, 10) || 12, parseInt(setup_price, 10) || 0, thumbnail, demo_url,
         filePath, fileName, freePath, freeName, is_active ? 1 : 0, req.params.id);
  req.flash('success', `Perubahan "${title}" disimpan.`);
  res.redirect('/admin/products');
});

router.delete('/products/:id', (req, res) => {
  const existing = db.prepare('SELECT file_path, free_file_path FROM products WHERE id = ?').get(req.params.id);
  if (existing) { removeProductFile(existing.file_path); removeProductFile(existing.free_file_path); }
  db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  req.flash('info', 'Produk dihapus.');
  res.redirect('/admin/products');
});

// -- Kategori (cepat, tanpa form terpisah) --
router.post('/categories', (req, res) => {
  const { name } = req.body;
  const slug = slugify(name);
  db.prepare('INSERT INTO categories (name, slug) VALUES (?, ?)').run(name, slug);
  req.flash('success', `Kategori "${name}" ditambahkan.`);
  res.redirect(req.get('Referer') || '/admin/products/new');
});

// -- Pesanan Jasa (Website Jadi) --
router.get('/services', (req, res) => {
  const services = db.prepare(`SELECT s.*, p.title AS product_title, o.order_code, u.name AS buyer_name, u.email AS buyer_email
                               FROM service_orders s JOIN products p ON p.id = s.product_id JOIN orders o ON o.id = s.order_id LEFT JOIN users u ON u.id = s.user_id
                               ORDER BY CASE s.status WHEN 'in_progress' THEN 0 WHEN 'awaiting_info' THEN 1 WHEN 'review' THEN 2 WHEN 'done' THEN 3 ELSE 4 END, s.updated_at DESC`).all();
  const counts = {}; services.forEach(s => { counts[s.status] = (counts[s.status] || 0) + 1; });
  res.render('admin/services', { services, counts, open: req.query.open ? parseInt(req.query.open, 10) : null });
});

router.post('/services/:id', (req, res) => {
  const { status, result_url, admin_notes } = req.body;
  const allowed = ['awaiting_info', 'in_progress', 'review', 'done', 'canceled'];
  if (!allowed.includes(status)) return res.status(400).render('checkout-error', { message: 'Status tidak valid.' });
  db.prepare(`UPDATE service_orders SET status=?, result_url=?, admin_notes=?, updated_at=datetime('now'),
              completed_at = CASE WHEN ? = 'done' THEN COALESCE(completed_at, datetime('now')) ELSE completed_at END WHERE id=?`)
    .run(status, result_url || '', admin_notes || '', status, req.params.id);
  req.flash('success', 'Pesanan jasa diperbarui.');
  res.redirect('/admin/services');
});

// -- Pesanan --
router.get('/orders', (req, res) => {
  const orders = db.prepare(`SELECT o.*, u.name AS buyer_name, u.email AS buyer_email,
                                (SELECT COUNT(*) FROM downloads d WHERE d.order_id = o.id) AS download_count
                              FROM orders o LEFT JOIN users u ON u.id = o.user_id
                              ORDER BY o.created_at DESC`).all();
  res.render('admin/orders', { orders });
});

// Tandai lunas manual (mis. transfer manual, atau testing tanpa webhook Midtrans)
router.post('/orders/:id/mark-paid', (req, res) => {
  db.prepare(`UPDATE orders SET status = 'paid', paid_at = COALESCE(paid_at, ?), midtrans_payment_type = COALESCE(midtrans_payment_type, 'manual')
              WHERE id = ? AND status != 'paid'`).run(new Date().toISOString(), req.params.id);
  ensureServiceOrders(parseInt(req.params.id, 10));
  req.flash('success', 'Pesanan ditandai lunas. Pembeli sekarang bisa download file.');
  res.redirect('/admin/orders');
});

// Error dari multer (tipe/ukuran file) ditampilkan sebagai pesan biasa
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError || /File produk/.test(err.message)) {
    return res.status(400).render('checkout-error', { message: 'Upload gagal: ' + err.message });
  }
  next(err);
});

module.exports = router;
