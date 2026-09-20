const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const db = require('../db/db');
const { requireAuth } = require('./_middleware');

const FILES_DIR = path.join(__dirname, '..', 'storage', 'files');

// Ambil order 'paid' milik user yang berisi produk ini (null jika belum pernah beli / belum lunas)
function findPaidOrderForProduct(userId, productId) {
  return db.prepare(`SELECT o.id, o.order_code FROM orders o
                     JOIN order_items oi ON oi.order_id = o.id
                     WHERE o.user_id = ? AND o.status = 'paid' AND oi.product_id = ?
                     ORDER BY o.paid_at DESC LIMIT 1`).get(userId, productId) || null;
}

// Apakah user pernah mengunduh versi gratis produk ini
function hasFreeDownload(userId, productId) {
  return !!db.prepare("SELECT id FROM downloads WHERE user_id = ? AND product_id = ? AND tier = 'free' LIMIT 1").get(userId, productId);
}

// GET /download/free/:productId — versi gratis: wajib login (agar kita dapat email pengguna), tanpa bayar
router.get('/free/:productId', requireAuth, (req, res) => {
  const productId = parseInt(req.params.productId, 10);
  const product = db.prepare('SELECT id, title, free_file_path, free_file_name FROM products WHERE id = ? AND is_active = 1').get(productId);
  if (!product || !product.free_file_path || !fs.existsSync(path.join(FILES_DIR, product.free_file_path))) {
    return res.status(404).render('checkout-error', { message: 'Versi gratis untuk produk ini belum tersedia.' });
  }
  db.prepare("INSERT INTO downloads (order_id, product_id, user_id, tier) VALUES (NULL, ?, ?, 'free')").run(productId, req.session.user.id);
  res.download(path.join(FILES_DIR, product.free_file_path), product.free_file_name || product.free_file_path);
});

// GET /download/:orderId/:productId — versi PREMIUM: hanya untuk pemilik order yang sudah lunas
router.get('/:orderId/:productId', requireAuth, (req, res) => {
  const orderId = parseInt(req.params.orderId, 10);
  const productId = parseInt(req.params.productId, 10);
  const userId = req.session.user.id;

  const order = db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(orderId, userId);
  if (!order) return res.status(404).render('404');
  if (order.status !== 'paid') {
    return res.status(403).render('checkout-error', {
      message: `Pesanan ${order.order_code} belum lunas (status: ${order.status}). File bisa didownload setelah pembayaran dikonfirmasi.`,
    });
  }

  const item = db.prepare('SELECT id FROM order_items WHERE order_id = ? AND product_id = ?').get(orderId, productId);
  if (!item) return res.status(404).render('404');

  const product = db.prepare('SELECT title, file_path, file_name FROM products WHERE id = ?').get(productId);
  if (!product || !product.file_path || !fs.existsSync(path.join(FILES_DIR, product.file_path))) {
    return res.status(404).render('checkout-error', {
      message: `File untuk "${product ? product.title : 'produk ini'}" belum diunggah oleh admin. Silakan hubungi admin.`,
    });
  }

  db.prepare("INSERT INTO downloads (order_id, product_id, user_id, tier) VALUES (?, ?, ?, 'premium')").run(orderId, productId, userId);
  res.download(path.join(FILES_DIR, product.file_path), product.file_name || product.file_path);
});

module.exports = router;
module.exports.findPaidOrderForProduct = findPaidOrderForProduct;
module.exports.hasFreeDownload = hasFreeDownload;
