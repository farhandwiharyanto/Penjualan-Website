/* Chart ringan tanpa library: area/line (pendapatan harian) & bar horizontal.
   Warna diambil dari CSS variable agar ikut light/dark mode. */
(function () {
  var NS = 'http://www.w3.org/2000/svg';
  function el(name, attrs, parent) {
    var e = document.createElementNS(NS, name);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function rp(n) { return 'Rp ' + Number(n || 0).toLocaleString('id-ID'); }
  function compact(n) { return n >= 1e6 ? (n / 1e6).toFixed(n % 1e6 ? 1 : 0) + ' jt' : n >= 1e3 ? Math.round(n / 1e3) + ' rb' : String(n); }
  function niceMax(v) { if (v <= 0) return 1; var p = Math.pow(10, Math.floor(Math.log10(v))); var m = v / p; var n = m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10; return n * p; }
  function fmtDay(iso) { var d = new Date(iso + 'T00:00:00'); return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }); }
  function tooltip(container) {
    var t = document.createElement('div'); t.className = 'chart-tip'; t.hidden = true; container.appendChild(t); return t;
  }

  /* ---------- Area + line: pendapatan harian ---------- */
  function revenueChart(container) {
    var data = JSON.parse(container.dataset.series);
    var W = container.clientWidth || 800, H = 240, padL = 56, padR = 16, padT = 16, padB = 32;
    var innerW = W - padL - padR, innerH = H - padT - padB;
    var maxV = niceMax(Math.max.apply(null, data.map(function (d) { return d.revenue; })));
    var x = function (i) { return padL + (data.length === 1 ? innerW / 2 : i * innerW / (data.length - 1)); };
    var y = function (v) { return padT + innerH - (v / maxV) * innerH; };

    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, width: '100%', height: H, role: 'img', 'aria-label': 'Pendapatan harian 30 hari terakhir' }, container);
    // gridlines + y ticks (4 garis)
    for (var g = 0; g <= 4; g++) {
      var v = maxV * g / 4, yy = y(v);
      el('line', { x1: padL, x2: W - padR, y1: yy, y2: yy, class: 'grid' }, svg);
      el('text', { x: padL - 8, y: yy + 4, 'text-anchor': 'end', class: 'tick' }, svg).textContent = compact(v);
    }
    // x ticks tiap ~6 hari
    data.forEach(function (d, i) {
      if (i % 6 === 0 || i === data.length - 1) el('text', { x: x(i), y: H - 8, 'text-anchor': 'middle', class: 'tick' }, svg).textContent = fmtDay(d.date);
    });
    // area + line
    var pts = data.map(function (d, i) { return x(i) + ',' + y(d.revenue); });
    el('path', { d: 'M' + pts.join(' L') + ' L' + x(data.length - 1) + ',' + y(0) + ' L' + x(0) + ',' + y(0) + ' Z', class: 'area' }, svg);
    el('path', { d: 'M' + pts.join(' L'), class: 'line' }, svg);
    // end marker (nilai terakhir)
    var last = data[data.length - 1];
    el('circle', { cx: x(data.length - 1), cy: y(last.revenue), r: 4, class: 'dot' }, svg);
    // hover layer
    var cross = el('line', { y1: padT, y2: padT + innerH, class: 'cross' }, svg); cross.style.display = 'none';
    var hdot = el('circle', { r: 5, class: 'dot' }, svg); hdot.style.display = 'none';
    var tip = tooltip(container);
    var hit = el('rect', { x: padL, y: padT, width: innerW, height: innerH, fill: 'transparent' }, svg);
    hit.addEventListener('mousemove', function (ev) {
      var rect = svg.getBoundingClientRect(), scale = W / rect.width;
      var mx = (ev.clientX - rect.left) * scale;
      var i = Math.round((mx - padL) / innerW * (data.length - 1)); i = Math.max(0, Math.min(data.length - 1, i));
      var d = data[i];
      cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.style.display = '';
      hdot.setAttribute('cx', x(i)); hdot.setAttribute('cy', y(d.revenue)); hdot.style.display = '';
      tip.innerHTML = '<strong>' + fmtDay(d.date) + '</strong><br>' + rp(d.revenue) + ' &middot; ' + d.orders + ' pesanan';
      tip.hidden = false;
      var left = x(i) / scale; tip.style.left = Math.min(left, rect.width - tip.offsetWidth - 8) + 'px'; tip.style.top = (y(d.revenue) / scale - 12) + 'px';
    });
    hit.addEventListener('mouseleave', function () { cross.style.display = 'none'; hdot.style.display = 'none'; tip.hidden = true; });
  }

  /* ---------- Bar horizontal ---------- */
  function barChart(container) {
    var data = JSON.parse(container.dataset.series), unit = container.dataset.unit || '';
    var maxV = Math.max.apply(null, data.map(function (d) { return d.value; })) || 1;
    var list = document.createElement('div'); list.className = 'hbars'; container.appendChild(list);
    var tip = tooltip(container);
    data.forEach(function (d) {
      var row = document.createElement('div'); row.className = 'hbar-row';
      row.innerHTML = '<span class="hbar-label" title="' + d.label + '">' + d.label + '</span>' +
        '<span class="hbar-track"><span class="hbar-fill" style="width:' + (d.value / maxV * 100) + '%"></span></span>' +
        '<span class="hbar-value">' + d.value + (unit ? ' ' + unit : '') + '</span>';
      row.addEventListener('mousemove', function (ev) {
        tip.innerHTML = '<strong>' + d.label + '</strong><br>' + d.value + (unit ? ' ' + unit : ' pesanan') + (d.sub ? ' &middot; ' + d.sub : '');
        tip.hidden = false; var r = container.getBoundingClientRect();
        tip.style.left = Math.min(ev.clientX - r.left + 12, r.width - tip.offsetWidth - 8) + 'px'; tip.style.top = (ev.clientY - r.top - 36) + 'px';
      });
      row.addEventListener('mouseleave', function () { tip.hidden = true; });
      list.appendChild(row);
    });
  }

  function render() {
    var r = document.getElementById('chart-revenue'); if (r) { r.innerHTML = ''; revenueChart(r); }
    document.querySelectorAll('.chart-bars').forEach(function (c) { c.innerHTML = ''; barChart(c); });
  }
  render();
  var t; window.addEventListener('resize', function () { clearTimeout(t); t = setTimeout(render, 150); });

  document.querySelectorAll('[data-toggle-table]').forEach(function (b) {
    b.addEventListener('click', function () { var tb = document.getElementById(b.dataset.toggleTable); tb.hidden = !tb.hidden; });
  });
})();
