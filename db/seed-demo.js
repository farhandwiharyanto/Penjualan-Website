// Buat data DEMO untuk melihat dashboard: beberapa pembeli + pesanan acak 30 hari terakhir.
// Jalankan: npm run seed:demo   |  Hapus lagi: npm run seed:demo -- --clear
const bcrypt = require('bcryptjs');
const db = require('./db');

const DEMO_TAG = '@demo.test'; // semua akun demo pakai email domain ini agar mudah dibersihkan

function clearDemo() {
  const users = db.prepare(`SELECT id FROM users WHERE email LIKE '%${DEMO_TAG}'`).all().map(u => u.id);
  if (users.length) {
    const ph = users.map(() => '?').join(',');
    const orders = db.prepare(`SELECT id FROM orders WHERE user_id IN (${ph})`).all(...users).map(o => o.id);
    if (orders.length) {
      const oph = orders.map(() => '?').join(',');
      db.prepare(`DELETE FROM downloads WHERE order_id IN (${oph})`).run(...orders);
      db.prepare(`DELETE FROM order_items WHERE order_id IN (${oph})`).run(...orders);
      db.prepare(`DELETE FROM orders WHERE id IN (${oph})`).run(...orders);
    }
    db.prepare(`DELETE FROM users WHERE id IN (${ph})`).run(...users);
  }
  console.log(`Data demo dihapus (${users.length} pembeli demo beserta pesanannya).`);
}

if (process.argv.includes('--clear')) { clearDemo(); process.exit(0); }

const products = db.prepare('SELECT id, title, price FROM products WHERE is_active = 1').all();
if (!products.length) { console.error('Belum ada produk. Jalankan "npm run seed" dulu.'); process.exit(1); }

const names = ['Budi Santoso', 'Sari Dewi', 'Andi Wijaya', 'Rina Putri', 'Dimas Pratama', 'Maya Lestari', 'Fajar Nugroho', 'Lina Kusuma'];
const hash = bcrypt.hashSync('demo123', 10);
const buyers = names.map((n, i) => {
  const email = n.toLowerCase().replace(/\s+/g, '.') + DEMO_TAG;
  const ex = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (ex) return ex.id;
  return db.prepare('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)').run(n, email, hash, 'buyer').lastInsertRowid;
});

const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = arr => arr[rand(0, arr.length - 1)];
const insOrder = db.prepare('INSERT INTO orders (order_code, user_id, total, status, midtrans_payment_type, created_at, paid_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
const insItem = db.prepare('INSERT INTO order_items (order_id, product_id, title, price) VALUES (?, ?, ?, ?)');
const insDl = db.prepare('INSERT INTO downloads (order_id, product_id, user_id, downloaded_at) VALUES (?, ?, ?, ?)');

let count = 0;
for (let day = 44; day >= 0; day--) {
  const n = rand(0, 3); // 0-3 pesanan per hari
  for (let k = 0; k < n; k++) {
    const created = new Date(Date.now() - day * 86400000 - rand(0, 86400000));
    const items = [pick(products)];
    if (Math.random() < 0.25) { const p2 = pick(products); if (p2.id !== items[0].id) items.push(p2); }
    const total = items.reduce((s, p) => s + p.price, 0);
    const r = Math.random();
    const status = day === 0 && r < 0.5 ? 'pending' : r < 0.7 ? 'paid' : r < 0.85 ? 'expired' : r < 0.95 ? 'canceled' : 'pending';
    const paidAt = status === 'paid' ? new Date(created.getTime() + rand(60, 3600) * 1000) : null;
    const userId = pick(buyers);
    const code = 'DEMO-' + created.getTime() + '-' + userId;
    const orderId = insOrder.run(code, userId, total, status, status === 'paid' ? pick(['qris', 'bank_transfer', 'gopay', 'credit_card']) : null,
      created.toISOString().replace('T', ' ').slice(0, 19), paidAt ? paidAt.toISOString() : null).lastInsertRowid;
    for (const p of items) {
      insItem.run(orderId, p.id, p.title, p.price);
      if (status === 'paid' && Math.random() < 0.8) insDl.run(orderId, p.id, userId, paidAt.toISOString().replace('T', ' ').slice(0, 19));
    }
    count++;
  }
}
console.log(`Data demo dibuat: ${buyers.length} pembeli, ${count} pesanan (45 hari terakhir). Hapus dengan: npm run seed:demo -- --clear`);
