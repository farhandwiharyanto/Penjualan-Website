const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const dbPath = path.join(__dirname, 'market.sqlite');
const isNew = !fs.existsSync(dbPath);

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Always make sure schema exists (safe to run repeatedly, uses IF NOT EXISTS)
const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

// Migrasi ringan untuk DB yang sudah ada: tambah kolom baru jika belum ada
function addColumnIfMissing(table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
  if (!cols.includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}
addColumnIfMissing('products', 'file_name', 'TEXT');
addColumnIfMissing('products', 'features', 'TEXT');  // fitur utama (premium), satu per baris
addColumnIfMissing('products', 'free_file_path', 'TEXT');
addColumnIfMissing('products', 'free_file_name', 'TEXT');
addColumnIfMissing('products', 'free_features', 'TEXT');
addColumnIfMissing('products', 'update_months', 'INTEGER DEFAULT 12');
addColumnIfMissing('downloads', 'tier', "TEXT NOT NULL DEFAULT 'premium'"); // nama asli file yang diupload admin (untuk nama file saat download)

if (isNew) {
  console.log('Database baru dibuat di db/market.sqlite. Jalankan "npm run seed" untuk mengisi data contoh.');
}

module.exports = db;
