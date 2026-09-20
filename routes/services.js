const express = require('express');
const router = express.Router();
const db = require('../db/db');
const { requireAuth } = require('./_middleware');

function ownedService(req) {
  return db.prepare(`SELECT s.*, p.title AS product_title, p.slug, o.order_code FROM service_orders s
                     JOIN products p ON p.id = s.product_id JOIN orders o ON o.id = s.order_id
                     WHERE s.id = ? AND s.user_id = ?`).get(req.params.id, req.session.user.id);
}

// Form data pemasangan + status (pembeli)
router.get('/:id', requireAuth, (req, res) => {
  const svc = ownedService(req);
  if (!svc) return res.status(404).render('404');
  res.render('service', { svc });
});

// Pembeli mengirim / memperbarui data pemasangan → status jadi "sedang dipasang"
router.post('/:id', requireAuth, (req, res) => {
  const svc = ownedService(req);
  if (!svc || ['done', 'canceled'].includes(svc.status)) return res.status(404).render('404');
  const { business_name, domain, hosting_info, contact, notes } = req.body;
  if (!business_name || !domain || !hosting_info || !contact) {
    req.flash('error', 'Nama bisnis, domain, akses hosting, dan kontak wajib diisi.');
    return res.redirect(`/service/${svc.id}`);
  }
  const nextStatus = svc.status === 'awaiting_info' ? 'in_progress' : svc.status;
  db.prepare(`UPDATE service_orders SET business_name=?, domain=?, hosting_info=?, contact=?, notes=?, status=?, updated_at=datetime('now') WHERE id=?`)
    .run(business_name, domain, hosting_info, contact, notes || '', nextStatus, svc.id);
  req.flash('success', 'Data pemasangan tersimpan. Kami akan mulai memasang dan mengabari lewat kontak yang kamu isi.');
  res.redirect(`/service/${svc.id}`);
});

// Pembeli menerima hasil → selesai
router.post('/:id/accept', requireAuth, (req, res) => {
  const svc = ownedService(req);
  if (!svc || svc.status !== 'review') return res.status(404).render('404');
  db.prepare(`UPDATE service_orders SET status='done', completed_at=datetime('now'), updated_at=datetime('now') WHERE id=?`).run(svc.id);
  req.flash('success', 'Terima kasih! Pemasangan ditandai selesai.');
  res.redirect(`/service/${svc.id}`);
});

module.exports = router;
