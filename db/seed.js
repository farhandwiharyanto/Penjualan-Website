// Isi database dengan data contoh: 1 admin, beberapa kategori & produk.
// Jalankan dengan: npm run seed
const bcrypt = require('bcryptjs');
const db = require('./db');

function upsertCategory(name, slug) {
  const existing = db.prepare('SELECT id FROM categories WHERE slug = ?').get(slug);
  if (existing) return existing.id;
  const info = db.prepare('INSERT INTO categories (name, slug) VALUES (?, ?)').run(name, slug);
  return info.lastInsertRowid;
}

function upsertProduct(p) {
  const existing = db.prepare('SELECT id, features, free_features FROM products WHERE slug = ?').get(p.slug);
  if (existing) {
    // produk lama dari seed sebelumnya: lengkapi fitur jika masih kosong
    if (!existing.features && p.features) db.prepare('UPDATE products SET features = ? WHERE id = ?').run(p.features, existing.id);
    if (!existing.free_features && p.free_features) db.prepare('UPDATE products SET free_features = ? WHERE id = ?').run(p.free_features, existing.id);
    return;
  }
  db.prepare(`INSERT INTO products
    (title, slug, category_id, short_desc, description, tech_stack, features, free_features, price, thumbnail, demo_url, file_path, is_active)
    VALUES (@title, @slug, @category_id, @short_desc, @description, @tech_stack, @features, @free_features, @price, @thumbnail, @demo_url, @file_path, 1)`
  ).run(p);
}

// Admin default
const adminEmail = 'admin@example.com';
const adminExists = db.prepare('SELECT id FROM users WHERE email = ?').get(adminEmail);
if (!adminExists) {
  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)')
    .run('Admin', adminEmail, hash, 'admin');
  console.log('Admin dibuat -> email: admin@example.com | password: admin123 (SEGERA GANTI setelah login)');
}

const catWeb = upsertCategory('Aplikasi Web', 'aplikasi-web');
const catMobile = upsertCategory('Aplikasi Mobile', 'aplikasi-mobile');
const catAdmin = upsertCategory('Admin & Dashboard', 'admin-dashboard');

upsertProduct({
  title: 'POS Kasir Toko Sederhana',
  slug: 'pos-kasir-toko-sederhana',
  category_id: catWeb,
  short_desc: 'Aplikasi kasir untuk toko retail kecil-menengah, siap pakai.',
  description: 'Source code lengkap aplikasi Point of Sale: manajemen produk, transaksi kasir, laporan penjualan harian/bulanan, cetak struk. Dokumentasi instalasi disertakan.',
  tech_stack: 'Laravel, MySQL, Bootstrap',
  features: [
    'Manajemen produk, kategori & stok',
    'Transaksi kasir cepat dengan pencarian produk & barcode',
    'Cetak struk (printer thermal 58/80mm)',
    'Laporan penjualan harian, bulanan & per kasir',
    'Multi-user dengan role admin & kasir',
    'Dokumentasi instalasi langkah demi langkah',
  ].join('\n'),
  free_features: [
    'Manajemen produk, kategori & stok',
    'Transaksi kasir cepat dengan pencarian produk & barcode',
  ].join('\n'),
  price: 350000,
  thumbnail: '',
  demo_url: 'https://example.com/demo/pos-kasir',
  file_path: '',
});

upsertProduct({
  title: 'Dashboard Admin Analytics',
  slug: 'dashboard-admin-analytics',
  category_id: catAdmin,
  short_desc: 'Template dashboard admin dengan grafik & tabel data siap pakai.',
  description: 'Dashboard admin modern dengan chart interaktif, tabel data (sorting/filter), manajemen user & role. Cocok untuk starter project internal maupun SaaS.',
  tech_stack: 'React, Node.js, PostgreSQL',
  features: [
    'Chart interaktif (line, bar, pie) dengan filter rentang tanggal',
    'Tabel data dengan sorting, filter & pagination server-side',
    'Manajemen user, role & permission',
    'Dark mode & layout responsif',
    'REST API siap pakai + dokumentasi endpoint',
  ].join('\n'),
  free_features: [
    'Chart interaktif (line, bar, pie) dengan filter rentang tanggal',
    'Dark mode & layout responsif',
  ].join('\n'),
  price: 275000,
  thumbnail: '',
  demo_url: 'https://example.com/demo/admin-analytics',
  file_path: '',
});

upsertProduct({
  title: 'Aplikasi Booking Lapangan Olahraga',
  slug: 'aplikasi-booking-lapangan',
  category_id: catMobile,
  short_desc: 'Sistem booking & jadwal lapangan futsal/badminton.',
  description: 'Aplikasi booking lapangan lengkap dengan kalender ketersediaan, konfirmasi pemesanan, dan riwayat transaksi pelanggan.',
  tech_stack: 'Flutter, Firebase',
  features: [
    'Kalender ketersediaan lapangan real-time',
    'Booking per jam dengan konfirmasi otomatis',
    'Notifikasi push pengingat jadwal',
    'Riwayat & status transaksi pelanggan',
    'Panel admin pengelola lapangan',
    'Build Android & iOS dari satu codebase',
  ].join('\n'),
  free_features: [
    'Kalender ketersediaan lapangan real-time',
    'Booking per jam dengan konfirmasi otomatis',
  ].join('\n'),
  price: 420000,
  thumbnail: '',
  demo_url: 'https://example.com/demo/booking-lapangan',
  file_path: '',
});

console.log('Seed selesai.');
