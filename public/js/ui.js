/* Modal dialog pengganti confirm()/alert() bawaan browser.
   Pakai lewat atribut di <form>:
     data-confirm="Pesan"  data-confirm-title="Judul"  data-confirm-ok="Ya, hapus"  data-confirm-tone="danger|primary|success"
   Atau dari JS:  UI.confirm({title, message, ok, tone}).then(yes => ...)   |   UI.alert({title, message, tone})
*/
(function () {
  var ICONS = {
    danger:  '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
    success: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
    primary: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
    warn:    '<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>',
  };
  function svg(tone) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (ICONS[tone] || ICONS.primary) + '</svg>';
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function open(opts) {
    return new Promise(function (resolve) {
      var tone = opts.tone || 'primary';
      var wrap = document.createElement('div');
      wrap.className = 'modal-backdrop';
      wrap.innerHTML =
        '<div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">' +
          '<div class="modal-icon ' + tone + '">' + svg(tone) + '</div>' +
          '<h3 id="modal-title" class="modal-title">' + esc(opts.title || 'Konfirmasi') + '</h3>' +
          '<p class="modal-msg">' + esc(opts.message || '') + '</p>' +
          '<div class="modal-actions">' +
            (opts.cancel === false ? '' : '<button type="button" class="btn btn-secondary" data-act="cancel">' + esc(opts.cancelLabel || 'Batal') + '</button>') +
            '<button type="button" class="btn ' + (tone === 'danger' ? 'btn-danger' : tone === 'success' ? 'btn-success' : '') + '" data-act="ok">' + esc(opts.ok || 'OK') + '</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(wrap);
      document.body.classList.add('modal-open');
      var prev = document.activeElement;
      requestAnimationFrame(function () { wrap.classList.add('show'); });
      wrap.querySelector('[data-act="ok"]').focus();

      function close(result) {
        wrap.classList.remove('show');
        document.removeEventListener('keydown', onKey);
        setTimeout(function () { wrap.remove(); document.body.classList.remove('modal-open'); if (prev && prev.focus) prev.focus(); }, 180);
        resolve(result);
      }
      function onKey(e) { if (e.key === 'Escape') close(false); }
      document.addEventListener('keydown', onKey);
      wrap.addEventListener('click', function (e) {
        if (e.target === wrap) return close(false);
        var act = e.target.closest('[data-act]');
        if (act) close(act.dataset.act === 'ok');
      });
    });
  }

  window.UI = {
    confirm: function (o) { return open(o); },
    alert: function (o) { return open(Object.assign({ cancel: false, ok: 'Mengerti' }, o)); },
  };

  // Form dengan data-confirm: tahan submit sampai user mengonfirmasi di modal
  document.addEventListener('submit', function (e) {
    var f = e.target;
    if (!f.dataset.confirm || f.dataset.confirmed) return;
    e.preventDefault();
    open({ title: f.dataset.confirmTitle, message: f.dataset.confirm, ok: f.dataset.confirmOk || 'Ya, lanjutkan', tone: f.dataset.confirmTone || 'primary' })
      .then(function (yes) { if (yes) { f.dataset.confirmed = '1'; f.requestSubmit ? f.requestSubmit() : f.submit(); } });
  });

  // Tombol submit dengan data-loading="Teks…": setelah form terkirim, tombol dikunci dan teksnya diganti
  // (untuk proses yang butuh beberapa detik, mis. impor repo GitHub). Dibatalkan kalau halaman dibuka lagi dari bfcache.
  document.addEventListener('submit', function (e) {
    var btn = e.target.querySelector('button[type="submit"][data-loading]');
    if (!btn || e.defaultPrevented) return;
    btn.dataset.original = btn.innerHTML;
    btn.innerHTML = '<span class="spinner"></span> ' + esc(btn.dataset.loading);
    btn.classList.add('is-loading');
    setTimeout(function () { btn.disabled = true; }, 0); // setelah submit terkirim, agar nilai tombol tetap ikut
  });
  window.addEventListener('pageshow', function () {
    document.querySelectorAll('button.is-loading').forEach(function (b) { b.innerHTML = b.dataset.original; b.disabled = false; b.classList.remove('is-loading'); });
  });
})();
