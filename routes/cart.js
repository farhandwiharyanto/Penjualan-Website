const express = require('express');
const router = express.Router();
const db = require('../db/db');
const { findPaidOrderForProduct } = require('./download');

function getCartProducts(req) {
  const ids = req.session.cart || [];
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(',');
  const rows = db.prepare(`SELECT * FROM products WHERE id IN (${placeholders})`).all(...ids);
  // preserve cart order
  return ids.map(id => rows.find(r => r.id === id)).filter(Boolean);
}

router.get('/', (req, res) => {
  const setup = req.session.cartSetup || {};
  const items = getCartProducts(req).map(p => ({ ...p, with_setup: !!setup[p.id] && p.setup_price > 0 }));
  const total = items.reduce((sum, p) => sum + p.price + (p.with_setup ? p.setup_price : 0), 0);
  res.render('cart', { items, total });
});

// Masukkan produk ke keranjang; return product atau null jika tidak valid / sudah dibeli
function addToCart(req, productId) {
  const product = db.prepare('SELECT id, slug, title, price, setup_price FROM products WHERE id = ? AND is_active = 1').get(productId);
  if (!product) return { product: null };
  if (!(product.price > 0)) {
    req.flash('info', `"${product.title}" hanya tersedia versi gratis — download langsung dari halaman produk.`);
    return { product, owned: true }; // perlakukan seperti "tidak perlu beli": kembali ke halaman produk
  }
  if (req.session.user && findPaidOrderForProduct(req.session.user.id, productId)) {
    req.flash('info', `Kamu sudah memiliki "${product.title}". Download-nya ada di Pesanan Saya.`);
    return { product, owned: true };
  }
  if (!req.session.cart) req.session.cart = [];
  // source code = satu lisensi per pembelian, jadi tidak ada qty > 1
  if (!req.session.cart.includes(productId)) req.session.cart.push(productId);
  // "Website Jadi": tandai item ini ikut jasa pasang (hanya jika produk menawarkannya)
  if (!req.session.cartSetup) req.session.cartSetup = {};
  if (req.body && req.body.setup === '1' && product.setup_price > 0) req.session.cartSetup[productId] = true;
  return { product };
}

router.post('/add/:id', (req, res) => {
  const productId = parseInt(req.params.id, 10);
  const { product, owned } = addToCart(req, productId);
  if (!product) return res.status(404).render('404');
  if (owned) return res.redirect('/product/' + product.slug);
  req.flash('success', `"${product.title}"${req.body.setup === '1' ? ' + jasa pasang' : ''} ditambahkan ke keranjang.`);
  res.redirect('/product/' + product.slug); // tetap di halaman produk agar user bisa lanjut belanja
});

// Beli sekarang: masukkan ke keranjang lalu langsung ke pembayaran
router.post('/buy-now/:id', (req, res) => {
  const productId = parseInt(req.params.id, 10);
  const { product, owned } = addToCart(req, productId);
  if (!product) return res.status(404).render('404');
  if (owned) return res.redirect('/product/' + product.slug);
  res.redirect('/checkout');
});

router.post('/remove/:id', (req, res) => {
  const productId = parseInt(req.params.id, 10);
  req.session.cart = (req.session.cart || []).filter(id => id !== productId);
  if (req.session.cartSetup) delete req.session.cartSetup[productId];
  req.flash('info', 'Produk dihapus dari keranjang.');
  res.redirect('/cart');
});

// Toggle jasa pasang untuk item di keranjang
router.post('/setup/:id', (req, res) => {
  const productId = parseInt(req.params.id, 10);
  if (!req.session.cartSetup) req.session.cartSetup = {};
  if (req.session.cartSetup[productId]) delete req.session.cartSetup[productId]; else req.session.cartSetup[productId] = true;
  res.redirect('/cart');
});

module.exports = router;
