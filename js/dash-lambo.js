/*
 * Lamborghini clusters modelled on the real screens:
 *   lambo-svj      - Aventador SVJ: wide arc of glossy blocks with an orange
 *                    stepped outline, giant outlined gear, R/1-7 gear row,
 *                    g-meter, ALA aero panel, big speed
 *   lambo-evo      - Huracán EVO: STRADA/SPORT show the round tach with
 *                    water-temp and fuel side arcs; CORSA switches to the
 *                    track view (block arc, oil/fuel/water bar gauges,
 *                    white data strip)
 *   lambo-revuelto - Revuelto: round tach with cyan brackets, outlined gear +
 *                    V12, hex media panel, HV battery gauge, fuel bar and the
 *                    drive-mode / hybrid-mode dials at the bottom
 */
(function () {
  const D = window.Dashboards;
  const { W, H, FONT, DIGI } = D;
  const { clamp, text, roundRect, fmt } = D.util;
  const TAU = Math.PI * 2;

  const polar = (cx, cy, r, a) => [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  const clock = () => new Date().toTimeString().slice(0, 5);
  const gearLabel = (s) => (!s.running ? 'P' : s.gear === 0 ? 'N' : String(s.gear));

  function itxt(ctx, str, x, y, size, o) {
    o = o || {};
    ctx.save();
    ctx.font = `italic ${o.weight || 700} ${size}px ${o.font || DIGI}`;
    ctx.textAlign = o.align || 'center'; ctx.textBaseline = 'middle';
    if (o.fill) { ctx.fillStyle = o.fill; ctx.fillText(str, x, y); }
    if (o.stroke) {
      ctx.lineJoin = 'round'; ctx.lineWidth = o.lw || 3; ctx.strokeStyle = o.stroke;
      if (o.glow) { ctx.shadowColor = o.stroke; ctx.shadowBlur = o.glow; }
      ctx.strokeText(str, x, y);
    }
    ctx.restore();
  }

  const pats = {};
  function hexBg(ctx, color, size) {
    const key = color + size;
    if (!pats[key]) {
      const r = size, w = r * Math.sqrt(3), c = document.createElement('canvas');
      c.width = Math.round(w); c.height = Math.round(r * 3);
      const g = c.getContext('2d'); g.strokeStyle = color; g.lineWidth = 1.2;
      const hex = (x, y) => { g.beginPath(); for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } g.closePath(); g.stroke(); };
      hex(w / 2, 0); hex(0, r * 1.5); hex(w, r * 1.5); hex(w / 2, r * 3);
      pats[key] = ctx.createPattern(c, 'repeat');
    }
    ctx.fillStyle = pats[key]; ctx.fillRect(0, 0, W, H);
  }

  function vignette(ctx, a) {
    const v = ctx.createRadialGradient(800, 330, 120, 800, 330, 900);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, `rgba(0,0,0,${a})`);
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  }

  // ---------------------------------------------------------------- shared block arc (SVJ + EVO Corsa)
  const ARC = { cx: 800, cy: 820, R: 760, a0: Math.PI + 0.62, a1: TAU - 0.62, band: 70 };
  function blockArc(ctx, s, car, st) {
    const { cx, cy, R, a0, a1, band } = ARC, max = car.dash.dialMax, red = car.dash.redline;
    const ang = (r) => a0 + (clamp(r, 0, max) / max) * (a1 - a0);
    for (let r = 0; r < max; r += 400) {
      const aa = ang(r) + 0.0035, ab = ang(r + 400) - 0.0035, mid = (aa + ab) / 2;
      const lit = s.rpm > r + 20, isRed = r + 400 > red;
      ctx.beginPath(); ctx.arc(cx, cy, R, aa, ab); ctx.arc(cx, cy, R - band, ab, aa, true); ctx.closePath();
      const gr = ctx.createLinearGradient(...polar(cx, cy, R, mid), ...polar(cx, cy, R - band, mid));
      const c = isRed ? (lit ? ['#ff4a32', '#b3120a'] : ['#d0170d', '#5c0805']) : lit ? st.lit : st.unlit;
      gr.addColorStop(0, c[0]); gr.addColorStop(1, c[1]);
      ctx.fillStyle = gr; ctx.fill();
    }
    if (st.outer) { ctx.beginPath(); ctx.arc(cx, cy, R + 9, a0 - 0.02, a1 + 0.02); ctx.strokeStyle = st.outer; ctx.lineWidth = 4; ctx.stroke(); }
    // stepped outline that bulges around every numeral
    const oR = R - band - 14, n = max / 1000;
    ctx.beginPath();
    for (let k = 0; k <= n; k++) {
      const aS = Math.max(a0, ang(k * 1000 - 330)), aE = Math.min(a1, ang(k * 1000 + 330));
      ctx.arc(cx, cy, oR, aS, aE);
      if (k < n) ctx.arc(cx, cy, oR - 14, aE + 0.006, ang((k + 1) * 1000 - 330) - 0.006);
    }
    ctx.strokeStyle = st.outline; ctx.lineWidth = 3; ctx.stroke();
    for (let k = 0; k <= n; k++) {
      const [x, y] = polar(cx, cy, oR - 44, ang(k * 1000));
      itxt(ctx, String(k), x, y, 50, { fill: k * 1000 >= red ? '#ff2a1a' : '#f4f4f4', weight: 800 });
    }
    // rpm marker
    const ra = ang(s.rpm);
    ctx.strokeStyle = '#ff2a1a'; ctx.lineWidth = 5; ctx.shadowColor = '#ff2a1a'; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.moveTo(...polar(cx, cy, R + 4, ra)); ctx.lineTo(...polar(cx, cy, R - band - 6, ra)); ctx.stroke();
    ctx.shadowBlur = 0;
  }

  function gMeter(ctx, x, y, s, dark) {
    const c = dark ? '#16181c' : '#f2f2f2';
    const gl = Math.max(0, s.accel / 9.81), gb = Math.max(0, -s.accel / 9.81);
    for (let i = 0; i < 6; i++) {
      const w = 26 + i * 12, yy = y - 30 + i * 12, lit = i < 3 ? gl * 3 > 2 - i : gb * 3 > i - 3;
      ctx.fillStyle = lit ? '#ff3a24' : c; ctx.globalAlpha = lit ? 1 : 0.85;
      ctx.fillRect(x - w / 2, yy, w, 8);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = c;
    for (let i = 0; i < 5; i++) { ctx.fillRect(x - 60 - i * 12, y - 2 + i * 0.5, 9, 10 - i); ctx.fillRect(x + 51 + i * 12, y - 2 + i * 0.5, 9, 10 - i); }
    itxt(ctx, fmt(gl, 1), x, y - 46, 18, { fill: c });
    itxt(ctx, fmt(gb, 1), x, y + 58, 18, { fill: c });
    itxt(ctx, '0.0', x - 128, y + 4, 18, { fill: c });
    itxt(ctx, '0.0', x + 128, y + 4, 18, { fill: c });
  }

  // ================================================================ AVENTADOR SVJ
  function drawSVJ(ctx, s, car) {
    const mode = car.dash.modes[s.modeIdx];
    ctx.fillStyle = '#020203'; ctx.fillRect(0, 0, W, H);
    hexBg(ctx, 'rgba(255,255,255,.07)', 46);
    vignette(ctx, 0.85);

    blockArc(ctx, s, car, { lit: ['#f2f2f3', '#8f9196'], unlit: ['#3b3c40', '#17181b'], outer: '#ff9a1a', outline: '#ffa21f' });
    itxt(ctx, 'RPM', 1500, 430, 18, { fill: '#ddd', weight: 600, font: FONT });
    itxt(ctx, 'x1000', 1500, 452, 18, { fill: '#ddd', weight: 600, font: FONT });

    // gear row + big gear
    const n = car.trans.gears.length;
    itxt(ctx, 'R', 655, 302, 34, { fill: 'rgba(200,200,200,.55)' });
    for (let g = 1; g <= n; g++) {
      itxt(ctx, String(g), 905 + (g - 1) * 26, 302, 34, { fill: g === s.gear ? '#fff' : 'rgba(200,200,200,.55)' });
    }
    ctx.fillStyle = '#050506'; ctx.fillRect(700, 205, 200, 230);
    itxt(ctx, gearLabel(s), 800, 320, 230, { stroke: '#ff2a1a', lw: 6, fill: '#050506', glow: 16, weight: 900 });
    itxt(ctx, mode.name, 560, 375, 36, { fill: mode.name === 'CORSA' ? '#ff2a1a' : mode.color, weight: 600, font: FONT });
    if (/CORSA|EGO/.test(mode.name)) {
      text(ctx, 'ESC', 960, 222, 20, '#ff2a1a', 'center', 700);
      text(ctx, mode.name, 960, 242, 20, '#ff2a1a', 'center', 700);
    }
    if (!s.auto) itxt(ctx, 'M', 960, 250, 22, { fill: '#ffa21f' });
    itxt(ctx, String(Math.floor(s.odoKm)).padStart(6, '0'), 1080, 372, 40, { fill: '#fff', align: 'right' });
    text(ctx, 'km', 1088, 376, 34, '#fff', 'left', 600);
    if (s.lc) text(ctx, 'LAUNCH', 800, 160, 22, '#ffd21a', 'center', 700);
    if (!s.running) text(ctx, s.cranking ? 'START' : 'ENGINE OFF', 800, 160, 22, '#ff8a00', 'center', 700);

    // bottom hex frame lines
    ctx.strokeStyle = 'rgba(160,165,175,.35)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(150, 452); ctx.lineTo(1450, 452); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(560, 470); ctx.lineTo(1040, 470); ctx.lineTo(1080, 530); ctx.lineTo(1040, 590); ctx.lineTo(560, 590); ctx.lineTo(520, 530); ctx.closePath(); ctx.stroke();

    gMeter(ctx, 300, 520, s, false);

    // ALA aero panel: downforce arrows grow with speed
    text(ctx, 'SISTEMA ALA', 800, 486, 16, '#e6e6e6', 'center', 700);
    const df = clamp(s.kmh / 300, 0, 1);
    [[640, 'ANT'], [960, 'POST']].forEach(([x, l]) => {
      text(ctx, l, x + 30, 478, 15, '#e6e6e6', 'left', 700);
      for (let i = 0; i < 6; i++) { ctx.fillStyle = i / 6 < df ? '#ffffff' : '#555'; ctx.fillRect(x + 4 - (6 - i), 470 + i * 7, 2 * (6 - i) + 4, 3); }
      ctx.fillStyle = df > 0.05 ? '#fff' : '#555';
      ctx.beginPath(); ctx.moveTo(x - 6, 514); ctx.lineTo(x + 14, 514); ctx.lineTo(x + 4, 526); ctx.closePath(); ctx.fill();
    });
    text(ctx, 'CARICO', 640, 546, 15, '#e6e6e6', 'center', 700); text(ctx, 'ALA', 640, 562, 15, '#e6e6e6', 'center', 700);
    sideCar(ctx, 800, 548, 1);
    text(ctx, 'Cx', 760, 585, 14, '#e6e6e6', 'center', 700);
    for (let i = 0; i < 5; i++) { ctx.fillStyle = '#ddd'; ctx.save(); ctx.translate(782 + i * 9, 585); ctx.transform(1, 0, -0.5, 1, 0, 0); ctx.fillRect(0, -6, 4, 12); ctx.restore(); }

    itxt(ctx, String(Math.round(s.kmh)), 1400, 515, 96, { fill: '#fff', align: 'right', weight: 900 });
    text(ctx, 'km/h', 1350, 575, 30, '#fff', 'center', 600);
    text(ctx, '≡D', 1420, 150, 24, '#7cff3a', 'center', 700);
  }

  function sideCar(ctx, x, y, k) {
    ctx.save(); ctx.translate(x, y); ctx.scale(k, k);
    ctx.beginPath();
    ctx.moveTo(-90, 10); ctx.lineTo(-86, -4); ctx.lineTo(-40, -12); ctx.lineTo(-6, -30); ctx.lineTo(30, -30); ctx.lineTo(70, -14);
    ctx.lineTo(80, -26); ctx.lineTo(96, -26); ctx.lineTo(92, -10); ctx.lineTo(94, 10); ctx.closePath();
    const g = ctx.createLinearGradient(0, -30, 0, 12); g.addColorStop(0, '#f6f6f6'); g.addColorStop(1, '#9a9da2');
    ctx.fillStyle = g; ctx.fill();
    ctx.fillStyle = '#2b2e33'; ctx.beginPath(); ctx.moveTo(-28, -14); ctx.lineTo(-4, -27); ctx.lineTo(26, -27); ctx.lineTo(48, -14); ctx.closePath(); ctx.fill();
    for (const wx of [-58, 60]) {
      ctx.beginPath(); ctx.arc(wx, 10, 15, 0, TAU); ctx.fillStyle = '#1a1b1e'; ctx.fill();
      ctx.beginPath(); ctx.arc(wx, 10, 8, 0, TAU); ctx.fillStyle = '#aaa'; ctx.fill();
    }
    ctx.restore();
  }

  // ================================================================ HURACÁN EVO
  function drawEVO(ctx, s, car) {
    const mode = car.dash.modes[s.modeIdx];
    if (mode.name === 'CORSA') evoCorsa(ctx, s, car, mode); else evoRound(ctx, s, car, mode);
  }

  function barGauge(ctx, x, y, w, v, lo, mid, hi, label, rev) {
    // horizontal wedge bar used in the EVO Corsa view
    const t = clamp((v - lo) / (hi - lo), 0, 1);
    ctx.fillStyle = 'rgba(255,255,255,.18)';
    ctx.beginPath(); ctx.moveTo(x, y + 12); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + 14); ctx.lineTo(x, y + 14); ctx.closePath(); ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.rect(rev ? x + w * (1 - t) : x, y - 2, w * t, 18); ctx.clip();
    for (let i = 0; i < w; i += 6) { ctx.fillStyle = i / w > 0.75 ? '#e8261c' : '#f4f4f4'; ctx.fillRect(x + i, y + 12 - (i / w) * 12, 3, 2 + (i / w) * 12); }
    ctx.restore();
    const lbl = rev ? [hi, mid, lo] : [lo, mid, hi];
    text(ctx, String(lbl[0]), x, y - 12, 14, '#fff', 'left', 700);
    text(ctx, String(lbl[1]), x + w * 0.5, y - 12, 14, '#fff', 'center', 700);
    text(ctx, String(lbl[2]), x + w, y - 12, 14, '#ff3a24', 'right', 700);
    text(ctx, label, rev ? x + w : x, y + 30, 13, '#ddd', rev ? 'right' : 'left', 600);
  }

  function evoCorsa(ctx, s, car) {
    ctx.fillStyle = '#030405'; ctx.fillRect(0, 0, W, H);
    hexBg(ctx, 'rgba(255,255,255,.06)', 46);
    vignette(ctx, 0.8);
    blockArc(ctx, s, car, { lit: ['#ffffff', '#c9ccd1'], unlit: ['#6d7075', '#33353a'], outer: null, outline: '#e8e8e8' });

    // side panels
    for (const x of [20, 1400]) {
      roundRect(ctx, x, 300, 180, 150, 10);
      const g = ctx.createLinearGradient(x, 0, x + 180, 0);
      g.addColorStop(x < 800 ? 0 : 1, 'rgba(20,40,90,.85)'); g.addColorStop(x < 800 ? 1 : 0, 'rgba(10,14,24,.85)');
      ctx.fillStyle = g; ctx.fill();
    }
    const oilP = s.running ? 1.5 + (s.rpm / car.engine.limiter) * 5 : 0;
    barGauge(ctx, 50, 340, 130, s.oilT, 50, 130, 170, 'Temp. Olio');
    barGauge(ctx, 50, 400, 130, oilP, 0, 5, 10, 'Press. Olio');
    barGauge(ctx, 1420, 340, 130, s.fuel * 100, 0, 50, 100, 'Benzina');
    barGauge(ctx, 1420, 400, 130, s.waterT, 50, 90, 130, 'Temp. Acqua', true);

    // digital rpm band + gear
    const band = ctx.createLinearGradient(0, 270, 0, 330);
    band.addColorStop(0, 'rgba(120,124,130,.15)'); band.addColorStop(0.5, 'rgba(200,204,210,.45)'); band.addColorStop(1, 'rgba(120,124,130,.15)');
    ctx.fillStyle = band; ctx.fillRect(470, 278, 660, 46);
    itxt(ctx, String(Math.round(s.rpm)), 640, 302, 30, { fill: '#111', weight: 700 });
    ctx.fillStyle = '#050506'; ctx.fillRect(720, 215, 160, 215);
    itxt(ctx, gearLabel(s), 800, 322, 210, { stroke: '#ff3a24', lw: 6, fill: '#050506', glow: 14, weight: 900 });
    text(ctx, 'ESC', 950, 225, 18, '#ff3a24', 'center', 700); text(ctx, 'CORSA', 950, 244, 18, '#ff3a24', 'center', 700);
    if (!s.auto) itxt(ctx, 'M', 900, 380, 26, { fill: '#ff3a24' });
    if (!s.running) text(ctx, s.cranking ? 'START' : 'ENGINE OFF', 800, 160, 22, '#ff8a00', 'center', 700);
    if (s.lc) text(ctx, 'LAUNCH', 800, 160, 22, '#ffd21a', 'center', 700);

    // lap / speed data
    text(ctx, 'GIRO 2', 560, 410, 14, '#ddd', 'center', 700);
    itxt(ctx, '1) ' + (s.t100 != null ? '00.00.' + fmt(s.t100, 2).padStart(5, '0') : '00.00.00.00'), 410, 432, 20, { fill: '#fff', align: 'left' });
    text(ctx, 'GIRO 1', 500, 456, 14, '#ddd', 'center', 700);
    text(ctx, 'GIRO 3', 1000, 410, 14, '#ddd', 'center', 700);
    itxt(ctx, String(Math.round(s.maxKmh)), 1030, 432, 22, { fill: '#fff', align: 'right' }); text(ctx, 'km/h', 1034, 436, 12, '#fff', 'left', 600);
    itxt(ctx, String(Math.round(s.avgKmh || 0)), 1140, 432, 22, { fill: '#fff', align: 'right' }); text(ctx, 'km/h', 1144, 436, 12, '#fff', 'left', 600);
    text(ctx, 'V MAX', 1040, 456, 14, '#ddd', 'center', 700); text(ctx, 'V MED', 1150, 456, 14, '#ddd', 'center', 700);
    text(ctx, 'CORSA', 1385, 462, 20, '#ff3a24', 'center', 700);
    text(ctx, 'RPM x 1000', 215, 470, 14, '#e6e6e6', 'left', 700);

    // white data strip with the g-meter notch
    ctx.beginPath();
    ctx.moveTo(240, 478); ctx.lineTo(650, 478); ctx.lineTo(712, 566); ctx.lineTo(888, 566); ctx.lineTo(950, 478); ctx.lineTo(1370, 478);
    ctx.lineTo(1330, 594); ctx.lineTo(270, 594); ctx.closePath();
    const wg = ctx.createLinearGradient(0, 478, 0, 594); wg.addColorStop(0, '#f1f2f4'); wg.addColorStop(1, '#b9bdc3');
    ctx.fillStyle = wg; ctx.fill();
    gMeter(ctx, 800, 518, s, false);
    itxt(ctx, String(Math.floor(s.odoKm)).padStart(6, '0'), 300, 506, 26, { fill: '#111', align: 'left' });
    text(ctx, 'km', 408, 508, 18, '#111', 'left', 700);
    text(ctx, '⛽', 450, 506, 20, '#111', 'center', 600);
    itxt(ctx, String(Math.round(s.rangeKm)), 470, 506, 32, { fill: '#111', align: 'left', weight: 800 });
    text(ctx, 'km', 545, 510, 20, '#111', 'left', 700);
    itxt(ctx, clock(), 310, 556, 34, { fill: '#111', align: 'left', weight: 800 });
    itxt(ctx, fmt(s.ambient, 1), 470, 558, 24, { fill: '#111', align: 'left' }); text(ctx, '°C', 530, 560, 16, '#111', 'left', 700);
    itxt(ctx, String(Math.round(s.kmh)), 1200, 540, 70, { fill: '#111', align: 'right', weight: 900 });
    text(ctx, 'km/h', 1210, 516, 24, '#111', 'left', 700);
    text(ctx, '≡D', 1450, 120, 24, '#7cff3a', 'center', 700);
  }

  function evoRound(ctx, s, car, mode) {
    ctx.fillStyle = '#04060a'; ctx.fillRect(0, 0, W, H);
    hexBg(ctx, 'rgba(120,150,210,.08)', 50);
    // blue side glows
    for (const [x0, x1] of [[0, 520], [1600, 1080]]) {
      const g = ctx.createLinearGradient(x0, 0, x1, 0); g.addColorStop(0, 'rgba(20,50,140,.55)'); g.addColorStop(1, 'rgba(20,50,140,0)');
      ctx.fillStyle = g; ctx.fillRect(Math.min(x0, x1), 120, Math.abs(x1 - x0), 380);
    }
    vignette(ctx, 0.7);
    const acc = mode.color, cx = 800, cy = 290, R = 238, max = car.dash.dialMax, red = car.dash.redline;
    const ang = (r) => Math.PI / 2 + 0.12 + (clamp(r, 0, max) / max) * (TAU - 0.62);

    // side arcs: water temperature (left) and fuel (right)
    sideArc(ctx, cx, cy, 345, Math.PI * 0.86, Math.PI * 1.2, (s.waterT - 50) / 80, ['50', '90°C', '130'], true);
    sideArc(ctx, cx, cy, 345, Math.PI * 0.14, -Math.PI * 0.2, s.fuel, ['0', '50%', '100'], false);
    text(ctx, '🌡 Temp. Acqua', 520, 140, 14, '#ddd', 'center', 600);
    text(ctx, '⛽ Benzina', 1090, 140, 14, '#ddd', 'center', 600);

    // dial
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU);
    const fg = ctx.createRadialGradient(cx, cy, 30, cx, cy, R); fg.addColorStop(0, 'rgba(10,12,18,.95)'); fg.addColorStop(1, 'rgba(26,30,40,.95)');
    ctx.fillStyle = fg; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = '#d8dce2'; ctx.beginPath(); ctx.arc(cx, cy, R, ang(0), ang(red)); ctx.stroke();
    ctx.lineWidth = 9; ctx.strokeStyle = '#e8261c'; ctx.beginPath(); ctx.arc(cx, cy, R - 4, ang(red), ang(max)); ctx.stroke();
    if (s.oilT < 60) { ctx.lineWidth = 9; ctx.strokeStyle = '#2f6bff'; ctx.beginPath(); ctx.arc(cx, cy, R - 4, ang(0), ang(1500)); ctx.stroke(); }
    for (let r = 0; r <= max; r += 250) {
      const a = ang(r), major = r % 1000 === 0;
      ctx.strokeStyle = r >= red ? '#ff3a24' : '#cfd3da'; ctx.lineWidth = major ? 3 : 1.5;
      ctx.beginPath(); ctx.moveTo(...polar(cx, cy, R - 10, a)); ctx.lineTo(...polar(cx, cy, R - (major ? 30 : 20), a)); ctx.stroke();
      if (major) {
        const [x, y] = polar(cx, cy, R - 58, a);
        itxt(ctx, String(r / 1000), x, y, 36, { fill: r >= red ? '#ff3a24' : '#f2f2f2', weight: 700 });
      }
    }
    const na = ang(s.rpm);
    ctx.strokeStyle = '#ff2a1a'; ctx.lineWidth = 5; ctx.shadowColor = '#ff2a1a'; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.moveTo(...polar(cx, cy, R - 70, na)); ctx.lineTo(...polar(cx, cy, R - 2, na)); ctx.stroke(); ctx.shadowBlur = 0;
    text(ctx, 'RPM x 1000', cx, cy - 110, 15, '#ddd', 'center', 600);
    itxt(ctx, gearLabel(s), cx - 10, cy - 20, 120, { stroke: acc, lw: 4, fill: 'rgba(0,0,0,.4)', glow: 8, weight: 800 });
    if (s.running && s.gear > 1) itxt(ctx, String(s.gear - 1), cx - 92, cy + 12, 26, { fill: 'rgba(200,200,200,.45)' });
    itxt(ctx, s.auto ? 'A' : 'M', cx + 66, cy - 56, 34, { stroke: acc, lw: 2.5, weight: 700 });
    itxt(ctx, String(Math.round(s.kmh)).padStart(3, '0'), cx + 40, cy + 92, 66, { fill: '#fff', weight: 800 });
    text(ctx, 'km/h', cx + 150, cy + 102, 20, '#fff', 'left', 600);
    text(ctx, mode.name, cx, cy + 210, 24, acc, 'center', 700);
    if (s.lc) text(ctx, 'LAUNCH', cx, cy + 165, 18, '#ffd21a', 'center', 700);
    if (!s.running) text(ctx, s.cranking ? 'START' : 'ENGINE OFF', cx, cy + 165, 18, '#ff8a00', 'center', 700);

    // far left: oil temperature + pressure mini bars
    const oilP = s.running ? 1.5 + (s.rpm / car.engine.limiter) * 5 : 0;
    miniBar(ctx, 215, 300, (s.oilT - 50) / 120, ['170', '130', '50'], 'Temp. Olio');
    miniBar(ctx, 320, 300, oilP / 10, ['10', '5', '0'], 'Press. Olio');
    itxt(ctx, String(Math.floor(s.odoKm)).padStart(6, '0'), 340, 470, 24, { fill: '#fff', align: 'left' });
    text(ctx, 'km', 448, 472, 16, '#fff', 'left', 700);
    // far right: clock, range, outside temperature
    itxt(ctx, clock(), 1270, 250, 30, { fill: '#fff', align: 'left' });
    text(ctx, '⛽', 1262, 292, 20, '#fff', 'center', 600);
    itxt(ctx, Math.round(s.rangeKm) + 'km', 1280, 292, 30, { fill: '#fff', align: 'left' });
    itxt(ctx, fmt(s.ambient, 1) + '°C', 1270, 334, 26, { fill: '#fff', align: 'left' });
    text(ctx, '≡D', 1040, 80, 22, '#7cff3a', 'center', 700);
  }

  function sideArc(ctx, cx, cy, r, aStart, aEnd, v, labels, left) {
    // blue outline + white track filled from the bottom end, red needle
    const a = (t) => aStart + (aEnd - aStart) * t;
    ctx.lineCap = 'butt';
    ctx.strokeStyle = 'rgba(70,120,255,.9)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(cx, cy, r + 22, Math.min(aStart, aEnd) - 0.05, Math.max(aStart, aEnd) + 0.05); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.15)'; ctx.lineWidth = 12;
    ctx.beginPath(); ctx.arc(cx, cy, r, Math.min(aStart, aEnd), Math.max(aStart, aEnd)); ctx.stroke();
    const t = clamp(v, 0, 1);
    ctx.strokeStyle = '#f2f2f2';
    ctx.beginPath(); ctx.arc(cx, cy, r, Math.min(aStart, a(t)), Math.max(aStart, a(t))); ctx.stroke();
    const top = left ? a(0.85) : a(0.15);
    ctx.strokeStyle = '#e8261c'; ctx.lineWidth = 12;
    ctx.beginPath(); ctx.arc(cx, cy, r, Math.min(top, left ? aEnd : aStart), Math.max(top, left ? aEnd : aStart)); ctx.stroke();
    ctx.strokeStyle = '#ff2a1a'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(...polar(cx, cy, r - 16, a(t))); ctx.lineTo(...polar(cx, cy, r + 16, a(t))); ctx.stroke();
    [0, 0.5, 1].forEach((k, i) => {
      const [x, y] = polar(cx, cy, r - 36, a(k));
      text(ctx, labels[i], x, y, 15, i === 2 && left ? '#ff3a24' : '#fff', 'center', 700);
    });
  }

  function miniBar(ctx, x, y, v, labels, label) {
    ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(x - 5, y - 60, 10, 120);
    const t = clamp(v, 0, 1);
    ctx.fillStyle = '#f2f2f2'; ctx.fillRect(x - 5, y + 60 - 120 * t, 10, 120 * t);
    ctx.fillStyle = '#e8261c'; ctx.fillRect(x - 5, y - 60, 10, 20);
    labels.forEach((l, i) => text(ctx, l, x - 12, y - 56 + i * 56, 12, i === 0 ? '#ff3a24' : '#ddd', 'right', 700));
    text(ctx, label, x, y + 80, 11, '#ddd', 'center', 600);
  }

  // ================================================================ REVUELTO
  function drawRevuelto(ctx, s, car) {
    const mode = car.dash.modes[s.modeIdx], CY = '#40d4dc';
    ctx.fillStyle = '#020304'; ctx.fillRect(0, 0, W, H);
    hexBg(ctx, 'rgba(255,255,255,.05)', 26);
    vignette(ctx, 0.75);
    const cx = 800, cy = 300, R = 238, max = car.dash.dialMax, red = car.dash.redline;
    // 0 at 6 o'clock, 7 at 12 o'clock, 10 just above 3 o'clock
    const ang = (r) => Math.PI / 2 + (clamp(r, 0, max) / 1000) * (Math.PI / 7);

    // cyan X brackets
    ctx.strokeStyle = CY; ctx.lineWidth = 3; ctx.shadowColor = CY; ctx.shadowBlur = 6;
    for (const k of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(cx + k * 370, 40); ctx.lineTo(cx + k * 285, 150); ctx.quadraticCurveTo(cx + k * 262, 180, cx + k * 262, 220);
      ctx.lineTo(cx + k * 262, 360); ctx.quadraticCurveTo(cx + k * 262, 395, cx + k * 290, 420); ctx.lineTo(cx + k * 380, 500); ctx.stroke();
    }
    ctx.shadowBlur = 0;

    // tach
    for (let r = 0; r <= max; r += 100) {
      const a = ang(r), major = r % 1000 === 0, half = r % 500 === 0;
      ctx.strokeStyle = r >= red ? '#ff2a1a' : 'rgba(235,235,235,.85)'; ctx.lineWidth = major ? 3 : 1.2;
      ctx.beginPath(); ctx.moveTo(...polar(cx, cy, R, a)); ctx.lineTo(...polar(cx, cy, R - (major ? 30 : half ? 22 : 14), a)); ctx.stroke();
    }
    ctx.strokeStyle = '#ff2a1a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy, R + 4, ang(red), ang(max)); ctx.stroke();
    ctx.strokeStyle = 'rgba(220,220,220,.7)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, R - 78, ang(0), ang(max)); ctx.stroke();
    for (let k = 1; k <= max / 1000; k++) {
      const [x, y] = polar(cx, cy, R - 52, ang(k * 1000));
      text(ctx, String(k), x, y, 34, k * 1000 >= red ? '#ff2a1a' : '#f4f4f4', 'center', 700, DIGI);
    }
    // white rpm fill along the inner ring + red marker
    if (s.rpm > 20) {
      ctx.strokeStyle = '#f4f4f4'; ctx.lineWidth = 14;
      ctx.beginPath(); ctx.arc(cx, cy, R - 70, ang(0), ang(s.rpm)); ctx.stroke();
    }
    ctx.strokeStyle = '#ff2a1a'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(...polar(cx, cy, R - 86, ang(s.rpm))); ctx.lineTo(...polar(cx, cy, R - 2, ang(s.rpm))); ctx.stroke();
    // inner hybrid scales (recharge / e-power)
    const ePow = clamp(s.eForce * Math.max(s.v, 1) / 1000 / (car.engine.electricKw || 1), 0, 1);
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.beginPath(); ctx.arc(cx, cy, R - 96, Math.PI / 2 - 0.6, Math.PI / 2 - 0.05); ctx.stroke();
    if (s.regen > 0.02) { ctx.strokeStyle = CY; ctx.beginPath(); ctx.arc(cx, cy, R - 96, Math.PI / 2 - 0.05 - 0.55 * s.regen, Math.PI / 2 - 0.05); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.beginPath(); ctx.arc(cx, cy, R + 14, Math.PI / 2 - 0.6, Math.PI / 2 - 0.05); ctx.stroke();
    if (ePow > 0.02) { ctx.strokeStyle = '#3ddc84'; ctx.beginPath(); ctx.arc(cx, cy, R + 14, Math.PI / 2 - 0.05 - 0.55 * ePow, Math.PI / 2 - 0.05); ctx.stroke(); }
    text(ctx, '0', cx + 6, cy + 190, 30, '#fff', 'center', 700, DIGI);
    text(ctx, 'RPM x1000', cx + 30, cy + 192, 16, '#fff', 'left', 600);
    text(ctx, '% RICARICA x10', cx + 20, cy + 158, 15, 'rgba(255,255,255,.55)', 'left', 600);
    text(ctx, '% E - POTENZA x10', cx + 20, cy + 262, 15, 'rgba(255,255,255,.55)', 'left', 600);

    // centre: gear, V12, speed
    itxt(ctx, gearLabel(s), cx - 40, cy - 60, 120, { stroke: CY, lw: 4, weight: 800 });
    itxt(ctx, 'V12', cx + 70, cy - 40, 52, { fill: '#ff2a1a', weight: 800, font: FONT });
    if (!s.auto) text(ctx, 'M', cx + 70, cy - 90, 22, CY, 'center', 700);
    text(ctx, String(Math.round(s.kmh)), cx - 20, cy + 70, 74, '#fff', 'center', 700, FONT);
    text(ctx, 'km/h', cx - 20, cy + 118, 18, '#fff', 'center', 600);
    if (s.running) text(ctx, 'READY', cx + 30, cy + 40, 24, CY, 'left', 700);
    text(ctx, String(Math.round(s.kmh * 0.621371)), cx + 100, cy + 82, 22, '#fff', 'center', 700);
    text(ctx, 'mph', cx + 100, cy + 108, 15, '#fff', 'center', 600);
    if (s.lc) text(ctx, 'LAUNCH', cx, cy - 140, 18, '#ffd21a', 'center', 700);
    if (!s.running && !s.cranking) text(ctx, 'ENGINE OFF', cx, cy - 140, 18, '#ff8a00', 'center', 700);

    // top row
    text(ctx, Math.round(s.ambient) + '°C', 560, 40, 24, '#fff', 'center', 600);
    text(ctx, clock(), 1050, 40, 24, '#fff', 'center', 600);

    // left: HV battery bar + hex media
    vBar(ctx, 120, 140, 300, s.battery, '#ffd21a', ['100', '0 %'], 'left');
    hexOutline(ctx, 370, 280, 180, 150); hexOutline(ctx, 228, 280, 110, 105, 0.4); hexOutline(ctx, 485, 280, 90, 90, 0.4);
    ctx.strokeStyle = '#ddd'; ctx.lineWidth = 3;
    for (const r of [14, 26]) { ctx.beginPath(); ctx.arc(370, 270, r, Math.PI * 1.2, Math.PI * 1.8); ctx.stroke(); }
    ctx.beginPath(); ctx.arc(370, 276, 5, 0, TAU); ctx.fillStyle = '#ddd'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(370, 280); ctx.lineTo(358, 310); ctx.moveTo(370, 280); ctx.lineTo(382, 310); ctx.stroke();
    text(ctx, '♫', 485, 280, 24, '#ccc', 'center', 600);
    text(ctx, 'DYNAMICS', 228, 360, 12, '#777', 'center', 600); text(ctx, 'MEDIA', 485, 345, 12, '#777', 'center', 600);
    text(ctx, 'RADIO', 370, 400, 26, '#fff', 'center', 600);
    ctx.strokeStyle = '#555'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(250, 450); ctx.lineTo(500, 450); ctx.stroke();
    const d = new Date();
    text(ctx, `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`, 370, 478, 24, '#fff', 'center', 600);

    // right: battery charge gauge, fuel bar, odo / range
    const gx = 1270, gy = 270, gr = 105, ga = (t) => Math.PI * 0.75 + clamp(t, 0, 1) * Math.PI * 1.5;
    for (let i = 0; i <= 100; i += 2) {
      ctx.strokeStyle = 'rgba(230,230,230,.75)'; ctx.lineWidth = i % 20 ? 1 : 2.5;
      ctx.beginPath(); ctx.moveTo(...polar(gx, gy, gr, ga(i / 100))); ctx.lineTo(...polar(gx, gy, gr - (i % 20 ? 8 : 14), ga(i / 100))); ctx.stroke();
      if (i % 20 === 0) { const [x, y] = polar(gx, gy, gr + 22, ga(i / 100)); text(ctx, i === 0 ? '0%' : String(i), x, y, 18, '#fff', 'center', 600); }
    }
    ctx.strokeStyle = s.battery < 0.2 ? '#ff2a4a' : CY; ctx.lineWidth = 10;
    ctx.beginPath(); ctx.arc(gx, gy, gr - 18, ga(0), ga(s.battery)); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(gx, gy, 72, 0, TAU); ctx.stroke();
    text(ctx, '🔌', gx, gy - 14, 24, '#fff', 'center', 600);
    text(ctx, Math.round(s.battery * 13) + ' km', gx, gy + 20, 18, '#fff', 'center', 600);
    vBar(ctx, 1480, 140, 300, s.fuel, '#f4f4f4', ['100', '0'], 'right');
    text(ctx, '⛽', 1450, 452, 18, '#ddd', 'center', 600);
    ctx.strokeStyle = '#555'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(1110, 440); ctx.lineTo(1400, 440); ctx.stroke();
    text(ctx, String(Math.floor(s.odoKm)).padStart(6, '0') + 'km  |  ' + Math.round(s.rangeKm) + 'km', 1255, 466, 22, '#fff', 'center', 600);

    // bottom dials: drive mode (left) and hybrid mode (right)
    modeDial(ctx, 520, 600, car.dash.modes.map((m) => m.name), s.modeIdx, '#e8261c', CY);
    modeDial(ctx, 1080, 600, ['RECHARGE', 'HYBRID', 'PERFORMANCE'], 1, '#555', '#fff');
    text(ctx, '≡D', 355, 570, 20, '#7cff3a', 'center', 700);
    if (!s.running) { text(ctx, '🔴', 1270, 560, 16, '#ff2a1a', 'center', 700); text(ctx, 'PARK', 1440, 588, 16, '#ff2a1a', 'center', 700); }
  }

  function hexOutline(ctx, x, y, w, h, alpha) {
    ctx.beginPath();
    ctx.moveTo(x - w / 2, y); ctx.lineTo(x - w / 4, y - h / 2); ctx.lineTo(x + w / 4, y - h / 2); ctx.lineTo(x + w / 2, y);
    ctx.lineTo(x + w / 4, y + h / 2); ctx.lineTo(x - w / 4, y + h / 2); ctx.closePath();
    ctx.fillStyle = `rgba(0,0,0,${alpha ? 0.4 : 0.7})`; ctx.fill();
    ctx.strokeStyle = `rgba(230,230,230,${alpha || 0.9})`; ctx.lineWidth = 2; ctx.stroke();
  }

  function vBar(ctx, x, y, h, v, col, labels, side) {
    ctx.strokeStyle = 'rgba(230,230,230,.7)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + h); ctx.stroke();
    for (let i = 0; i <= 4; i++) { const yy = y + (h * i) / 4; ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + (side === 'left' ? 14 : -14), yy); ctx.stroke(); }
    const t = clamp(v, 0, 1), bx = side === 'left' ? x - 16 : x + 4;
    ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fillRect(bx, y, 12, h);
    ctx.fillStyle = col; ctx.fillRect(bx, y + h * (1 - t), 12, h * t);
    ctx.fillStyle = '#e8261c'; ctx.fillRect(bx, y + h * 0.88, 12, h * 0.12);
    text(ctx, labels[0], x + (side === 'left' ? 30 : -30), y - 18, 20, '#fff', 'center', 600);
    text(ctx, labels[1], x + (side === 'left' ? 10 : -10), y + h + 18, 18, '#ff2a1a', 'center', 600);
  }

  function modeDial(ctx, x, y, names, idx, ring, hi) {
    ctx.beginPath(); ctx.arc(x, y, 112, Math.PI, TAU); ctx.fillStyle = '#0c0d10'; ctx.fill();
    ctx.lineWidth = 6; ctx.strokeStyle = ring; ctx.beginPath(); ctx.arc(x, y, 108, Math.PI + 0.12, TAU - 0.12); ctx.stroke();
    ctx.setLineDash([2, 5]); ctx.lineWidth = 2; ctx.strokeStyle = '#ddd'; ctx.beginPath(); ctx.arc(x, y, 62, Math.PI, TAU); ctx.stroke(); ctx.setLineDash([]);
    ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, 48, Math.PI + 0.3, TAU - 0.3); ctx.stroke();
    names.forEach((n, i) => {
      const a = -Math.PI / 2 + (i - idx) * 0.55;
      if (Math.abs(i - idx) > 1) return;
      const [tx, ty] = polar(x, y, 86, a);
      ctx.save(); ctx.translate(tx, ty); ctx.rotate(a + Math.PI / 2);
      text(ctx, n, 0, 0, i === idx ? 20 : 15, i === idx ? hi : 'rgba(220,220,220,.55)', 'center', 700);
      ctx.restore();
    });
    ctx.fillStyle = hi; ctx.fillRect(x - 16, y - 104, 32, 3);
  }

  D.register('lambo-svj', drawSVJ);
  D.register('lambo-evo', drawEVO);
  D.register('lambo-revuelto', drawRevuelto);
})();
