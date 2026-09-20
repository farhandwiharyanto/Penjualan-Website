const db = require('../db/db');

const SERVICE_STATUS = {
  awaiting_info: { label: 'Menunggu data pembeli', tone: 'warn' },
  in_progress:   { label: 'Sedang dipasang',       tone: 'info' },
  review:        { label: 'Menunggu konfirmasi',   tone: 'warn' },
  done:          { label: 'Selesai',               tone: 'success' },
  canceled:      { label: 'Dibatalkan',            tone: 'danger' },
};

// Dipanggil setiap kali order berubah menjadi 'paid' (webhook Midtrans maupun tandai lunas manual).
// Idempoten: item yang sudah punya service_order tidak dibuat lagi.
function ensureServiceOrders(orderId) {
  const order = db.prepare('SELECT id, user_id, status FROM orders WHERE id = ?').get(orderId);
  if (!order || order.status !== 'paid') return;
  const items = db.prepare(`SELECT oi.id, oi.product_id FROM order_items oi
                            WHERE oi.order_id = ? AND oi.with_setup = 1
                              AND NOT EXISTS (SELECT 1 FROM service_orders s WHERE s.order_item_id = oi.id)`).all(orderId);
  const ins = db.prepare('INSERT INTO service_orders (order_id, order_item_id, product_id, user_id) VALUES (?, ?, ?, ?)');
  for (const it of items) ins.run(orderId, it.id, it.product_id, order.user_id);
}

module.exports = { SERVICE_STATUS, ensureServiceOrders };
