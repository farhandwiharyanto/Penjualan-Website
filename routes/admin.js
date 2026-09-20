const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db/db');
const { requireAuth, requireAdmin } = require('./_middleware');

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
  res.render('admin/product-form', { product: null, categories });
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
  const { title, category_id, short_desc, description, tech_stack, features, free_features, price, update_months, demo_url, is_active, remove_free_file } = req.body;
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
  db.prepare(`UPDATE products SET title=?, category_id=?, short_desc=?, description=?, tech_stack=?, features=?, free_features=?, price=?, update_months=?, thumbnail=?, demo_url=?,
              file_path=?, file_name=?, free_file_path=?, free_file_name=?, is_active=? WHERE id=?`)
    .run(title, category_id || null, short_desc, description, tech_stack, features, free_features, parseInt(price, 10) || 0, parseInt(update_months, 10) || 12, thumbnail, demo_url,
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
