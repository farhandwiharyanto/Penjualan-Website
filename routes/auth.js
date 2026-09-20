const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const db = require('../db/db');

router.get('/register', (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.render('register', { error: null });
});

router.post('/register', (req, res) => {
  const { name, email, password } = req.body;
  const values = { name, email };
  if (!name || !email || !password || password.length < 6) {
    return res.render('register', { error: 'Semua field wajib diisi, password minimal 6 karakter.', values });
  }
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    return res.render('register', { error: 'Email sudah terdaftar. Silakan masuk.', values });
  }
  const hash = bcrypt.hashSync(password, 10);
  const info = db.prepare('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)')
    .run(name, email, hash, 'buyer');
  req.session.user = { id: info.lastInsertRowid, name, email, role: 'buyer' };
  req.flash('success', `Selamat datang, ${name}! Akunmu sudah aktif.`);
  const redirectTo = req.session.redirectTo || '/';
  delete req.session.redirectTo;
  res.redirect(redirectTo);
});

router.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/');
  // Jika diarahkan ke sini dari halaman yang butuh login, beri tahu user
  if (req.session.redirectTo && !res.locals.flash) {
    res.locals.flash = { type: 'info', message: 'Masuk dulu untuk melanjutkan.' };
  }
  res.render('login', { error: null });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.render('login', { error: 'Email atau password salah.' });
  }
  req.session.user = { id: user.id, name: user.name, email: user.email, role: user.role };
  req.flash('success', `Halo, ${user.name.split(' ')[0]}! Kamu sudah masuk.`);
  const redirectTo = req.session.redirectTo || (user.role === 'admin' ? '/admin' : '/');
  delete req.session.redirectTo;
  res.redirect(redirectTo);
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

module.exports = router;
