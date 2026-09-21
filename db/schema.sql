CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'buyer', -- 'buyer' or 'admin'
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  category_id INTEGER REFERENCES categories(id),
  short_desc TEXT,
  description TEXT,
  tech_stack TEXT,           -- e.g. "Laravel, React, MySQL"
  features TEXT,             -- fitur utama, satu per baris
  price INTEGER NOT NULL,    -- in IDR, integer (no decimals)
  thumbnail TEXT,            -- image filename in /public/uploads
  demo_url TEXT,             -- URL to embed in <iframe> on product page
  file_path TEXT,            -- PREMIUM: stored filename in /storage/files (delivered after payment)
  file_name TEXT,            -- PREMIUM: original filename shown to buyer on download
  free_file_path TEXT,       -- FREE tier: stored filename (downloadable after login, no payment)
  free_file_name TEXT,       -- FREE tier: original filename
  free_features TEXT,        -- fitur versi gratis, satu per baris
  update_months INTEGER DEFAULT 12, -- premium: lama hak update (bulan)
  setup_price INTEGER DEFAULT 0,    -- jasa pasang "Website Jadi" (0 = tidak ditawarkan)
  source_repo TEXT,          -- URL repo GitHub asal, jika file premium diimpor dari GitHub
  source_ref TEXT,           -- branch/tag yang diimpor
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_code TEXT UNIQUE NOT NULL,   -- sent to Midtrans as order_id
  user_id INTEGER REFERENCES users(id),
  total INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, paid, failed, expired, canceled
  midtrans_transaction_id TEXT,
  midtrans_payment_type TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  paid_at TEXT
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER REFERENCES orders(id),
  product_id INTEGER REFERENCES products(id),
  title TEXT NOT NULL,     -- snapshot of product title at purchase time
  price INTEGER NOT NULL,  -- snapshot of price at purchase time (premium)
  with_setup INTEGER DEFAULT 0,   -- 1 = pembeli memilih "Website Jadi" (jasa pasang)
  setup_price INTEGER DEFAULT 0   -- snapshot harga jasa pasang
);

-- Pesanan jasa pasang "Website Jadi": dibuat otomatis saat order lunas untuk item with_setup = 1
CREATE TABLE IF NOT EXISTS service_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER REFERENCES orders(id),
  order_item_id INTEGER REFERENCES order_items(id),
  product_id INTEGER REFERENCES products(id),
  user_id INTEGER REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'awaiting_info', -- awaiting_info, in_progress, review, done, canceled
  business_name TEXT, domain TEXT, hosting_info TEXT, contact TEXT, notes TEXT, -- diisi pembeli
  result_url TEXT, admin_notes TEXT,                                            -- diisi admin
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT
);

-- Log setiap download file produk oleh pembeli (untuk audit admin)
CREATE TABLE IF NOT EXISTS downloads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER REFERENCES orders(id),   -- NULL untuk download versi gratis
  tier TEXT NOT NULL DEFAULT 'premium',     -- 'free' | 'premium'
  product_id INTEGER REFERENCES products(id),
  user_id INTEGER REFERENCES users(id),
  downloaded_at TEXT DEFAULT (datetime('now'))
);
