require('dotenv').config();
const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const methodOverride = require('method-override');
const path = require('path');

const db = require('./db/db'); // memastikan DB & schema siap sebelum route dipakai
const icon = require('./lib/icons');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride('_method'));
app.use('/public', express.static(path.join(__dirname, 'public')));

app.use(session({
  store: new SQLiteStore({ db: 'sessions.sqlite', dir: path.join(__dirname, 'db') }),
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 } // 7 hari
}));

// Label status order yang ramah pengguna (dipakai di semua view)
const STATUS_LABELS = {
  pending:  { label: 'Menunggu Pembayaran', tone: 'warn' },
  paid:     { label: 'Lunas',               tone: 'success' },
  expired:  { label: 'Kedaluwarsa',         tone: 'muted' },
  canceled: { label: 'Dibatalkan',          tone: 'danger' },
  failed:   { label: 'Gagal',               tone: 'danger' },
};

// Flash message sekali tampil (disimpan di session, dihapus setelah dirender)
app.use((req, res, next) => {
  req.flash = (type, message) => { req.session.flash = { type, message }; };
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  next();
});

// Buat data user, cart & helper tersedia di semua view
app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  res.locals.cartCount = (req.session.cart || []).length;
  res.locals.currentPath = req.path;
  res.locals.icon = icon;
  res.locals.rp = n => 'Rp ' + Number(n || 0).toLocaleString('id-ID');
  res.locals.statusInfo = s => STATUS_LABELS[s] || { label: s, tone: 'muted' };
  res.locals.fmtDate = d => new Date(d.includes('T') ? d : d.replace(' ', 'T') + 'Z')
    .toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  next();
});

app.use('/', require('./routes/products'));
app.use('/auth', require('./routes/auth'));
app.use('/cart', require('./routes/cart'));
app.use('/checkout', require('./routes/checkout'));
app.use('/download', require('./routes/download'));
app.use('/admin', require('./routes/admin'));

app.use((req, res) => {
  res.status(404).render('404');
});

app.listen(PORT, () => {
  console.log(`SourceCode Market jalan di http://localhost:${PORT}`);
});
