const express = require('express');
const router = express.Router();
const midtransClient = require('midtrans-client');
const db = require('../db/db');
const { requireAuth } = require('./_middleware');

// Kode metode Midtrans: other_qris (QRIS), gopay, shopeepay, bca_va, bni_va, bri_va, permata_va, cimb_va,
// other_va (Mandiri/bank lain), echannel (Mandiri Bill), credit_card, dll.
const ENABLED_PAYMENTS = (process.env.MIDTRANS_ENABLED_PAYMENTS || '').split(',').map(s => s.trim()).filter(Boolean);

const snap = new midtransClient.Snap({
  isProduction: process.env.MIDTRANS_IS_PRODUCTION === 'true',
  serverKey: process.env.MIDTRANS_SERVER_KEY,
  clientKey: process.env.MIDTRANS_CLIENT_KEY,
});

function getCartProducts(req) {
  const ids = req.session.cart || [];
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(',');
  const rows = db.prepare(`SELECT * FROM products WHERE id IN (${placeholders})`).all(...ids);
  return ids.map(id => rows.find(r => r.id === id)).filter(Boolean);
}

// Halaman checkout: buat order 'pending' + minta Snap token ke Midtrans
router.get('/', requireAuth, async (req, res) => {
  const items = getCartProducts(req);
  if (items.length === 0) return res.redirect('/cart');

  const total = items.reduce((sum, p) => sum + p.price, 0);
  const orderCode = 'ORDER-' + Date.now() + '-' + req.session.user.id;

  const insertOrder = db.prepare(
    'INSERT INTO orders (order_code, user_id, total, status) VALUES (?, ?, ?, ?)'
  );
  const orderInfo = insertOrder.run(orderCode, req.session.user.id, total, 'pending');
  const orderId = orderInfo.lastInsertRowid;

  const insertItem = db.prepare(
    'INSERT INTO order_items (order_id, product_id, title, price) VALUES (?, ?, ?, ?)'
  );
  for (const p of items) {
    insertItem.run(orderId, p.id, p.title, p.price);
  }

  const parameter = {
    transaction_details: {
      order_id: orderCode,
      gross_amount: total,
    },
    item_details: items.map(p => ({
      id: String(p.id),
      price: p.price,
      quantity: 1,
      name: p.title.substring(0, 50),
    })),
    customer_details: {
      first_name: req.session.user.name,
      email: req.session.user.email,
    },
    // Batasi metode di popup Snap. Atur lewat MIDTRANS_ENABLED_PAYMENTS di .env (pisah koma),
    // kosongkan untuk menampilkan semua metode yang aktif di dashboard Midtrans.
    ...(ENABLED_PAYMENTS.length ? { enabled_payments: ENABLED_PAYMENTS } : {}),
    callbacks: {
      finish: `${process.env.APP_URL}/checkout/finish?order=${orderCode}`,
    },
  };

  try {
    const transaction = await snap.createTransaction(parameter);
    res.render('checkout', {
      snapToken: transaction.token,
      clientKey: process.env.MIDTRANS_CLIENT_KEY,
      isProduction: process.env.MIDTRANS_IS_PRODUCTION === 'true',
      orderCode,
      total,
      items,
    });
  } catch (err) {
    console.error('Midtrans createTransaction error:', err.message);
    res.status(500).render('checkout-error', {
      message: 'Gagal menghubungi layanan pembayaran. Coba lagi beberapa saat, atau hubungi admin jika masalah berlanjut. (Admin: periksa MIDTRANS_SERVER_KEY di .env)',
    });
  }
});

// Halaman setelah user selesai di popup Snap (bukan sumber kebenaran status - hanya UX)
router.get('/finish', requireAuth, (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE order_code = ?').get(req.query.order);
  if (!order) return res.redirect('/');
  req.session.cart = []; // kosongkan keranjang
  res.render('checkout-finish', { order });
});

// Webhook notifikasi dari Midtrans - INI sumber kebenaran status pembayaran.
// Daftarkan URL ini (mis. https://domainmu.com/checkout/notification) di dashboard Midtrans.
router.post('/notification', express.json(), async (req, res) => {
  try {
    const statusResponse = await snap.transaction.notification(req.body);
    const orderCode = statusResponse.order_id;
    const transactionStatus = statusResponse.transaction_status;
    const fraudStatus = statusResponse.fraud_status;

    let newStatus = null;
    if (transactionStatus === 'capture') {
      newStatus = fraudStatus === 'accept' ? 'paid' : 'pending';
    } else if (transactionStatus === 'settlement') {
      newStatus = 'paid';
    } else if (['cancel', 'deny', 'expire'].includes(transactionStatus)) {
      newStatus = transactionStatus === 'expire' ? 'expired' : 'canceled';
    } else if (transactionStatus === 'pending') {
      newStatus = 'pending';
    }

    if (newStatus) {
      const paidAt = newStatus === 'paid' ? new Date().toISOString() : null;
      db.prepare(
        `UPDATE orders SET status = ?, midtrans_transaction_id = ?, midtrans_payment_type = ?, paid_at = COALESCE(?, paid_at)
         WHERE order_code = ?`
      ).run(newStatus, statusResponse.transaction_id, statusResponse.payment_type, paidAt, orderCode);
    }

    res.status(200).send('OK');
  } catch (err) {
    console.error('Midtrans notification error:', err.message);
    res.status(500).send('Error handling notification');
  }
});

// Riwayat pesanan milik user yang login
router.get('/orders', requireAuth, (req, res) => {
  const orders = db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC')
    .all(req.session.user.id);
  // ikutkan file_path produk agar view tahu apakah file sudah bisa didownload
  const items = db.prepare(`SELECT oi.*, p.file_path, p.update_months, p.slug FROM order_items oi
                            LEFT JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ?`);
  const ordersWithItems = orders.map(o => ({ ...o, items: items.all(o.id) }));
  // Produk versi gratis yang pernah diunduh user (untuk unduh ulang + tawaran upgrade)
  const freeDownloads = db.prepare(`SELECT p.id, p.title, p.slug, p.price, p.free_file_path, MAX(d.downloaded_at) AS last_at,
                                      EXISTS(SELECT 1 FROM orders o JOIN order_items oi ON oi.order_id = o.id
                                             WHERE o.user_id = d.user_id AND o.status = 'paid' AND oi.product_id = p.id) AS owns_premium
                                    FROM downloads d JOIN products p ON p.id = d.product_id
                                    WHERE d.user_id = ? AND d.tier = 'free' GROUP BY p.id ORDER BY last_at DESC`).all(req.session.user.id);
  res.render('orders', { orders: ordersWithItems, freeDownloads });
});

module.exports = router;
