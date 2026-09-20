function requireAuth(req, res, next) {
  if (!req.session.user) {
    req.session.redirectTo = req.originalUrl;
    return res.redirect('/auth/login');
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).send('Akses ditolak. Halaman ini khusus admin.');
  }
  next();
}

module.exports = { requireAuth, requireAdmin };
