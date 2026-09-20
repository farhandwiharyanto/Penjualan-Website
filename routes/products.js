const express = require('express');
const router = express.Router();
const db = require('../db/db');
const { findPaidOrderForProduct, hasFreeDownload } = require('./download');

// Home: daftar produk (bisa difilter kategori/pencarian)
router.get('/', (req, res) => {
  const { category, q } = req.query;
  const sort = ['newest', 'cheapest', 'priciest', 'name'].includes(req.query.sort) ? req.query.sort : 'newest';
  let sql = `SELECT p.*, c.name AS category_name FROM products p
             LEFT JOIN categories c ON c.id = p.category_id
             WHERE p.is_active = 1`;
  const params = [];
  if (category) {
    sql += ' AND c.slug = ?';
    params.push(category);
  }
  if (q) {
    sql += ' AND (p.title LIKE ? OR p.short_desc LIKE ?)';
    params.push(`%${q}%`, `%${q}%`);
  }
  const orderBy = { newest: 'p.created_at DESC', cheapest: 'p.price ASC', priciest: 'p.price DESC', name: 'p.title ASC' };
  sql += ' ORDER BY ' + orderBy[sort];
  const products = db.prepare(sql).all(...params);
  const categories = db.prepare('SELECT * FROM categories ORDER BY name').all();
  res.render('index', { products, categories, activeCategory: category || '', q: q || '', sort });
});

// Detail produk + demo (iframe)
router.get('/product/:slug', (req, res) => {
  const product = db.prepare(`SELECT p.*, c.name AS category_name, c.slug AS category_slug
                               FROM products p LEFT JOIN categories c ON c.id = p.category_id
                               WHERE p.slug = ? AND p.is_active = 1`).get(req.params.slug);
  if (!product) return res.status(404).render('404');
  const paidOrder = req.session.user ? findPaidOrderForProduct(req.session.user.id, product.id) : null;
  const gotFree = req.session.user ? hasFreeDownload(req.session.user.id, product.id) : false;
  const inCart = (req.session.cart || []).includes(product.id);
  const hasFree = !!product.free_file_path;
  const hasPremium = product.price > 0 && !!product.file_path; // premium hanya bisa dibeli jika file-nya sudah diunggah admin
  res.render('product-detail', { product, paidOrder, inCart, hasFree, hasPremium, gotFree });
});

module.exports = router;
