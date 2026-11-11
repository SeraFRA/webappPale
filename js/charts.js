/* charts.js — grafici disegnati a mano su <canvas>, nessuna libreria.
   Espone window.GymCharts con drawLine e drawBar. */
(function (root) {
  'use strict';

  function cssVar(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  function setupCanvas(canvas, heightCss) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || canvas.parentElement.clientWidth || 300;
    const h = heightCss || 190;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.height = h + 'px';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h };
  }

  function niceMax(v) {
    if (v <= 0) return 1;
    const pow = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / pow;
    const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
    return nice * pow;
  }

  function fmt(n) {
    if (Math.abs(n) >= 1000) return (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1).replace('.', ',') + 'k';
    return String(Math.round(n * 10) / 10).replace('.', ',');
  }

  // points: [{label, value}] — linea con punti e etichette asse X
  function drawLine(canvas, points, opts) {
    opts = opts || {};
    const { ctx, w, h } = setupCanvas(canvas, opts.height);
    const color = opts.color || cssVar('--accent', '#4f8cff');
    const grid = cssVar('--border', '#263551');
    const dim = cssVar('--text-dim', '#93a1b8');
    const padL = 34, padR = 8, padT = 10, padB = 22;
    const iw = w - padL - padR, ih = h - padT - padB;

    ctx.clearRect(0, 0, w, h);
    if (!points || !points.length) return false;

    const values = points.map((p) => p.value);
    const max = niceMax(Math.max.apply(null, values.concat([1])));
    const min = 0;

    // griglia orizzontale + etichette Y
    ctx.strokeStyle = grid;
    ctx.fillStyle = dim;
    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.lineWidth = 1;
    const rows = 4;
    for (let i = 0; i <= rows; i++) {
      const y = padT + ih - (ih * i) / rows;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(w - padR, y);
      ctx.stroke();
      ctx.fillText(fmt(min + ((max - min) * i) / rows), padL - 6, y + 3);
    }

    const xFor = (i) => padL + (points.length === 1 ? iw / 2 : (iw * i) / (points.length - 1));
    const yFor = (v) => padT + ih - (ih * (v - min)) / (max - min);

    // etichette X (max 6)
    ctx.textAlign = 'center';
    const step = Math.ceil(points.length / 6);
    points.forEach((p, i) => {
      if (i % step === 0 || i === points.length - 1) {
        ctx.fillText(p.label, xFor(i), h - 6);
      }
    });

    // linea
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    points.forEach((p, i) => {
      const x = xFor(i), y = yFor(p.value);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // area sotto la linea (velatura)
    if (points.length > 1) {
      const grad = ctx.createLinearGradient(0, padT, 0, padT + ih);
      grad.addColorStop(0, color + '55');
      grad.addColorStop(1, color + '00');
      ctx.lineTo(xFor(points.length - 1), padT + ih);
      ctx.lineTo(xFor(0), padT + ih);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();
    }

    // punti
    ctx.fillStyle = color;
    points.forEach((p, i) => {
      ctx.beginPath();
      ctx.arc(xFor(i), yFor(p.value), 3.2, 0, Math.PI * 2);
      ctx.fill();
    });
    return true;
  }

  // bars: [{label, value}] — barre verticali
  function drawBar(canvas, bars, opts) {
    opts = opts || {};
    const { ctx, w, h } = setupCanvas(canvas, opts.height);
    const color = opts.color || cssVar('--accent', '#4f8cff');
    const grid = cssVar('--border', '#263551');
    const dim = cssVar('--text-dim', '#93a1b8');
    const padL = 40, padR = 8, padT = 10, padB = 22;
    const iw = w - padL - padR, ih = h - padT - padB;

    ctx.clearRect(0, 0, w, h);
    if (!bars || !bars.length) return false;

    const max = niceMax(Math.max.apply(null, bars.map((b) => b.value).concat([1])));

    ctx.strokeStyle = grid;
    ctx.fillStyle = dim;
    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.lineWidth = 1;
    const rows = 4;
    for (let i = 0; i <= rows; i++) {
      const y = padT + ih - (ih * i) / rows;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(w - padR, y);
      ctx.stroke();
      ctx.fillText(fmt((max * i) / rows), padL - 6, y + 3);
    }

    const slot = iw / bars.length;
    const barW = Math.max(6, Math.min(34, slot * 0.62));
    ctx.textAlign = 'center';
    bars.forEach((b, i) => {
      const bh = (ih * b.value) / max;
      const x = padL + slot * i + (slot - barW) / 2;
      const y = padT + ih - bh;
      ctx.fillStyle = color;
      ctx.beginPath();
      const r = Math.min(6, barW / 2);
      ctx.moveTo(x, y + r);
      ctx.arcTo(x, y, x + r, y, r);
      ctx.arcTo(x + barW, y, x + barW, y + r, r);
      ctx.lineTo(x + barW, y + bh);
      ctx.lineTo(x, y + bh);
      ctx.closePath();
      ctx.fill();
      if (bars.length <= 12 || i % Math.ceil(bars.length / 12) === 0) {
        ctx.fillStyle = dim;
        ctx.fillText(b.label, x + barW / 2, h - 6);
      }
    });
    return true;
  }

  root.GymCharts = { drawLine, drawBar };
})(typeof self !== 'undefined' ? self : globalThis);
