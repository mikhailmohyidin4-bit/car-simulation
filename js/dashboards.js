/*
 * Instrument clusters drawn on a 1600x600 logical canvas.
 *   lambo            - Huracán / Aventador / Revuelto style digital TFT
 *                      (round segmented tach, hex tiles, Corsa/Trofeo
 *                      mode switches to the horizontal "track" rev bar)
 *   ferrari-classic  - F8 Tributo / 812: yellow central tach flanked by
 *                      two TFT screens, LED shift lights on top
 *   ferrari-digital  - SF90 / 296: curved 16" HMI with central round tach
 */
(function () {
  const W = 1600, H = 600;
  const FONT = '"Rajdhani", "Orbitron", "Segoe UI", system-ui, sans-serif';
  const DIGI = '"Orbitron", "Rajdhani", "Segoe UI", system-ui, sans-serif';
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

  function font(sz, w, f) { return `${w || 600} ${sz}px ${f || FONT}`; }
  function text(ctx, s, x, y, sz, color, align, w, f) {
    ctx.font = font(sz, w, f); ctx.fillStyle = color; ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(s, x, y);
  }
  function hexPath(ctx, x, y, w, h, cut) {
    cut = cut == null ? h * 0.3 : cut;
    ctx.beginPath();
    ctx.moveTo(x + cut, y); ctx.lineTo(x + w - cut, y); ctx.lineTo(x + w, y + h / 2);
    ctx.lineTo(x + w - cut, y + h); ctx.lineTo(x + cut, y + h); ctx.lineTo(x, y + h / 2); ctx.closePath();
  }
  function fmt(n, d) { return n == null ? '--' : n.toFixed(d); }
  function gearStr(s) { return s.gear === 0 ? 'N' : String(s.gear); }

  // ------------------------------------------------------------------ LAMBORGHINI
  function drawLambo(ctx, s, car) {
    const mode = car.dash.modes[s.modeIdx], acc = mode.color;
    const track = /CORSA|TROFEO/.test(mode.name);
    const bg = ctx.createRadialGradient(W / 2, H / 2, 50, W / 2, H / 2, 900);
    bg.addColorStop(0, '#15171c'); bg.addColorStop(1, '#030304');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

    // hex grid backdrop
    ctx.save(); ctx.globalAlpha = 0.06; ctx.strokeStyle = acc; ctx.lineWidth = 1;
    for (let y = 0; y < H + 40; y += 34) for (let x = (y / 34) % 2 ? 0 : 30; x < W; x += 60) { hexPath(ctx, x, y, 50, 30, 12); ctx.stroke(); }
    ctx.restore();

    const max = car.dash.dialMax, red = car.dash.redline;
    if (!track) drawLamboRound(ctx, s, car, acc, max, red);
    else drawLamboTrack(ctx, s, car, acc, max, red);

    // side tiles
    const tiles = [
      ['TRIP', fmt(s.tripKm, 1) + ' km'], ['ODO', Math.floor(s.odoKm) + ' km'],
      ['OIL', Math.round(s.oilT) + '°C'], ['H₂O', Math.round(s.waterT) + '°C'],
    ];
    const tilesR = [
      ['0-100', s.t100 != null ? fmt(s.t100, 2) + ' s' : '--'], ['0-200', s.t200 != null ? fmt(s.t200, 2) + ' s' : '--'],
      ['V MAX', Math.round(s.maxKmh) + ' km/h'], [car.dash.hybrid ? 'BATT' : 'G-LONG', car.dash.hybrid ? Math.round(s.battery * 100) + '%' : fmt(s.accel / 9.81, 2) + ' g'],
    ];
    const tileX = track ? [60, 1260] : [70, 1250], ty = track ? 150 : 120, tg = track ? 88 : 92;
    tiles.forEach((t, i) => lamboTile(ctx, tileX[0], ty + i * tg, 280, 70, t[0], t[1], acc));
    tilesR.forEach((t, i) => lamboTile(ctx, tileX[1], ty + i * tg, 280, 70, t[0], t[1], acc));

    // bottom bar: ANIMA mode + gearbox
    hexPath(ctx, 600, 535, 400, 50, 20); ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fill();
    ctx.strokeStyle = acc; ctx.lineWidth = 2; ctx.stroke();
    text(ctx, (car.model.includes('STO') ? '' : 'ANIMA  ') + mode.name, 800, 560, 26, acc, 'center', 700);
    text(ctx, s.auto ? 'A' : 'M', 1040, 560, 34, s.auto ? '#fff' : acc, 'center', 700);
    text(ctx, s.auto ? 'AUTO' : 'MANUAL', 1100, 560, 16, '#9aa', 'left', 600);
    if (!track) {
      text(ctx, car.brand.toUpperCase(), 140, 40, 18, '#7a7a7a', 'left', 700);
      text(ctx, car.model.toUpperCase(), 140, 64, 14, '#555', 'left', 600);
      clockAndWarnings(ctx, s, 1460, 52, acc);
    } else clockAndWarnings(ctx, s, 1530, 560, acc);
    if (car.dash.hybrid) text(ctx, s.eForce > 1 ? '⚡ e-AXLE' : 'HPEV', 560, 560, 16, '#3ddc84', 'center', 700);
  }

  function lamboTile(ctx, x, y, w, h, label, val, acc) {
    hexPath(ctx, x, y, w, h, 22);
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, 'rgba(255,255,255,.06)'); g.addColorStop(1, 'rgba(255,255,255,.01)');
    ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.15)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = acc; ctx.fillRect(x + 22, y + 2, 30, 3);
    text(ctx, label, x + 34, y + h / 2, 17, '#8b9099', 'left', 700);
    text(ctx, val, x + w - 34, y + h / 2, 28, '#fff', 'right', 600);
  }

  function drawLamboRound(ctx, s, car, acc, max, red) {
    const cx = 800, cy = 305, R = 255;
    const a0 = Math.PI * 0.78, a1 = Math.PI * 2.22;
    const ang = (r) => a0 + (a1 - a0) * clamp(r / max, 0, 1);
    // outer hex ring
    ctx.save(); ctx.translate(cx, cy);
    ctx.beginPath();
    for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; ctx.lineTo(Math.cos(a) * (R + 30), Math.sin(a) * (R + 30)); }
    ctx.closePath(); ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
    // segments
    const segs = max / 200;
    for (let i = 0; i < segs; i++) {
      const r0 = i * 200, aa = ang(r0) + 0.008, ab = ang(r0 + 200) - 0.008;
      const lit = s.rpm > r0;
      const isRed = r0 >= red;
      ctx.beginPath(); ctx.arc(cx, cy, R, aa, ab); ctx.arc(cx, cy, R - 34, ab, aa, true); ctx.closePath();
      if (lit) {
        ctx.fillStyle = isRed ? '#ff2a1f' : (s.rpm > red - 600 ? '#ff8a00' : acc);
        ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 14;
      } else { ctx.fillStyle = isRed ? 'rgba(255,40,30,.28)' : 'rgba(255,255,255,.07)'; ctx.shadowBlur = 0; }
      ctx.fill(); ctx.shadowBlur = 0;
    }
    // numbers & ticks
    for (let k = 0; k <= max / 1000; k++) {
      const a = ang(k * 1000);
      ctx.strokeStyle = k * 1000 >= red ? '#ff3b30' : '#ddd'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * (R - 40), cy + Math.sin(a) * (R - 40));
      ctx.lineTo(cx + Math.cos(a) * (R - 54), cy + Math.sin(a) * (R - 54)); ctx.stroke();
      text(ctx, String(k), cx + Math.cos(a) * (R - 78), cy + Math.sin(a) * (R - 78), 30, k * 1000 >= red ? '#ff3b30' : '#e6e6e6', 'center', 700);
    }
    // needle line
    const na = ang(s.rpm);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.shadowColor = acc; ctx.shadowBlur = 18;
    ctx.beginPath(); ctx.moveTo(cx + Math.cos(na) * (R - 36), cy + Math.sin(na) * (R - 36));
    ctx.lineTo(cx + Math.cos(na) * (R + 8), cy + Math.sin(na) * (R + 8)); ctx.stroke(); ctx.shadowBlur = 0;
    // centre: gear + speed
    hexPath(ctx, cx - 95, cy - 120, 190, 150, 40); ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fill();
    ctx.strokeStyle = acc; ctx.lineWidth = 2.5; ctx.stroke();
    text(ctx, gearStr(s), cx, cy - 42, 130, s.cut ? '#ff3b30' : '#fff', 'center', 700, DIGI);
    text(ctx, String(Math.round(s.kmh)), cx, cy + 82, 78, '#fff', 'center', 600, DIGI);
    text(ctx, 'km/h', cx, cy + 128, 20, '#9aa0a6', 'center', 600);
    text(ctx, 'RPM ×1000', cx, cy + 162, 14, '#6d727a', 'center', 600);
    if (s.lc) text(ctx, 'LAUNCH', cx, cy - 145, 22, '#ffcc00', 'center', 700);
    if (!s.running) text(ctx, s.cranking ? 'START…' : 'ENGINE OFF', cx, cy + 195, 22, '#ff8a00', 'center', 700);
  }

  function drawLamboTrack(ctx, s, car, acc, max, red) {
    // horizontal hexagon rev bar across the top (track view)
    const x0 = 120, x1 = 1480, y = 18, n = max / 250, cw = (x1 - x0) / n;
    for (let i = 0; i < n; i++) {
      const r0 = i * 250, lit = s.rpm > r0, isRed = r0 >= red;
      const hgt = 30 + (i / n) * 40;
      hexPath(ctx, x0 + i * cw + 2, y + 70 - hgt, cw - 4, hgt, 6);
      if (lit) {
        ctx.fillStyle = isRed ? '#ff2a1f' : s.rpm > red - 500 ? '#ffffff' : acc;
        ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 16;
      } else { ctx.fillStyle = isRed ? 'rgba(255,40,30,.25)' : 'rgba(255,255,255,.07)'; ctx.shadowBlur = 0; }
      ctx.fill(); ctx.shadowBlur = 0;
      if (i % 4 === 0) text(ctx, String(r0 / 1000), x0 + i * cw + 4, y + 88, 20, isRed ? '#ff3b30' : '#bbb', 'left', 700);
    }
    // shift flash
    if (s.rpm > red - 250) { ctx.fillStyle = 'rgba(255,40,30,.12)'; ctx.fillRect(0, 0, W, H); }
    const cx = 800;
    hexPath(ctx, cx - 160, 160, 320, 260, 70); ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fill();
    ctx.strokeStyle = acc; ctx.lineWidth = 3; ctx.stroke();
    text(ctx, gearStr(s), cx, 290, 230, s.cut ? '#ff3b30' : '#fff', 'center', 700, DIGI);
    text(ctx, String(Math.round(s.kmh)), cx, 470, 64, '#fff', 'center', 600, DIGI);
    text(ctx, 'km/h', cx + 120, 480, 20, '#9aa0a6', 'left', 600);
    text(ctx, String(Math.round(s.rpm)), cx, 512, 22, acc, 'center', 700, DIGI);
    if (s.lc) text(ctx, 'LAUNCH', cx, 140, 24, '#ffcc00', 'center', 700);
    if (!s.running) text(ctx, s.cranking ? 'START…' : 'ENGINE OFF', cx, 140, 24, '#ff8a00', 'center', 700);
  }

  function clockAndWarnings(ctx, s, x, y, acc) {
    const d = new Date();
    text(ctx, d.toTimeString().slice(0, 5), x, y, 24, '#ddd', 'right', 600);
    if (s.running && s.oilT < 60) text(ctx, '❄ COLD', x - 90, y, 16, '#4fc3f7', 'right', 700);
    if (!s.running) text(ctx, '⏻', x - 90, y, 22, '#ff3b30', 'right', 700);
  }

  // ------------------------------------------------------------------ FERRARI (F8 / 812)
  function drawFerrariClassic(ctx, s, car) {
    ctx.fillStyle = '#050505'; ctx.fillRect(0, 0, W, H);
    const max = car.dash.dialMax, red = car.dash.redline;
    // binnacle
    const bez = ctx.createLinearGradient(0, 0, 0, H);
    bez.addColorStop(0, '#1b1b1b'); bez.addColorStop(1, '#090909');
    ctx.fillStyle = bez; roundRect(ctx, 20, 30, W - 40, H - 50, 60); ctx.fill();

    shiftLights(ctx, s, car, 800, 22);

    // side screens
    screen(ctx, 70, 90, 450, 430);
    screen(ctx, 1080, 90, 450, 430);

    // left screen: speed + manettino
    const mode = car.dash.modes[s.modeIdx];
    text(ctx, String(Math.round(s.kmh)), 295, 230, 120, '#fff', 'center', 600, DIGI);
    text(ctx, 'km/h', 295, 310, 26, '#aaa', 'center', 600);
    // manettino strip
    car.dash.modes.forEach((m, i) => {
      const x = 105 + i * 82, on = i === s.modeIdx;
      roundRect(ctx, x, 380, 74, 40, 8); ctx.fillStyle = on ? '#ffcc00' : '#1d1d1d'; ctx.fill();
      text(ctx, m.name, x + 37, 400, 15, on ? '#000' : '#888', 'center', 700);
    });
    text(ctx, 'MANETTINO', 295, 355, 16, '#777', 'center', 700);
    text(ctx, s.auto ? 'AUTO' : 'MANUAL', 295, 460, 26, s.auto ? '#4fc3f7' : '#ffcc00', 'center', 700);
    if (s.lc) text(ctx, 'LAUNCH CONTROL', 295, 130, 22, '#ffcc00', 'center', 700);

    // right screen: trip computer
    const rows = [
      ['TRIP', fmt(s.tripKm, 1) + ' km'], ['ODOMETER', Math.floor(s.odoKm) + ' km'],
      ['0-100 km/h', s.t100 != null ? fmt(s.t100, 2) + ' s' : '--'], ['0-200 km/h', s.t200 != null ? fmt(s.t200, 2) + ' s' : '--'],
      ['TOP SPEED', Math.round(s.maxKmh) + ' km/h'], ['OIL / WATER', Math.round(s.oilT) + '° / ' + Math.round(s.waterT) + '°'],
    ];
    rows.forEach((r, i) => {
      text(ctx, r[0], 1110, 140 + i * 58, 20, '#8a8a8a', 'left', 600);
      text(ctx, r[1], 1500, 140 + i * 58, 28, '#fff', 'right', 600);
      ctx.fillStyle = '#1e1e1e'; ctx.fillRect(1110, 166 + i * 58, 390, 1);
    });
    text(ctx, new Date().toTimeString().slice(0, 5), 1500, 480, 22, '#bbb', 'right', 600);

    // central yellow tach
    const cx = 800, cy = 320, R = 255;
    const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
    const ang = (r) => a0 + (a1 - a0) * clamp(r / max, 0, 1.02);
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, R + 18, 0, Math.PI * 2);
    const ring = ctx.createLinearGradient(cx, cy - R, cx, cy + R);
    ring.addColorStop(0, '#d8d8d8'); ring.addColorStop(0.5, '#555'); ring.addColorStop(1, '#bbb');
    ctx.fillStyle = ring; ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2);
    const face = ctx.createRadialGradient(cx, cy - 60, 30, cx, cy, R);
    face.addColorStop(0, '#ffe14d'); face.addColorStop(1, '#f2b800');
    ctx.fillStyle = face; ctx.fill();
    // red zone
    ctx.beginPath(); ctx.arc(cx, cy, R - 14, ang(red), ang(max)); ctx.strokeStyle = '#d40000'; ctx.lineWidth = 22; ctx.stroke();
    // ticks
    for (let r = 0; r <= max; r += 250) {
      const a = ang(r), major = r % 1000 === 0, half = r % 500 === 0;
      const l = major ? 34 : half ? 22 : 12;
      ctx.strokeStyle = '#111'; ctx.lineWidth = major ? 5 : 2.5;
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * (R - 6), cy + Math.sin(a) * (R - 6));
      ctx.lineTo(cx + Math.cos(a) * (R - 6 - l), cy + Math.sin(a) * (R - 6 - l)); ctx.stroke();
      if (major && r > 0) text(ctx, String(r / 1000), cx + Math.cos(a) * (R - 72), cy + Math.sin(a) * (R - 72), 44, '#111', 'center', 700);
    }
    text(ctx, 'RPM x 1000', cx, cy - 95, 18, '#222', 'center', 700);
    // digital window
    roundRect(ctx, cx - 85, cy + 70, 170, 110, 14); ctx.fillStyle = '#0b0b0b'; ctx.fill();
    text(ctx, gearStr(s), cx - 40, cy + 125, 76, s.cut ? '#ff3b30' : '#fff', 'center', 700, DIGI);
    text(ctx, s.auto ? 'AUTO' : 'M', cx + 42, cy + 105, 18, s.auto ? '#4fc3f7' : '#ffcc00', 'center', 700);
    text(ctx, String(Math.round(s.kmh)), cx + 42, cy + 140, 30, '#fff', 'center', 600, DIGI);
    if (!s.running) text(ctx, s.cranking ? 'START' : 'ENGINE OFF', cx, cy + 210, 18, '#7a0000', 'center', 700);
    // needle
    const na = ang(s.rpm);
    ctx.translate(cx, cy); ctx.rotate(na);
    ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 4;
    ctx.beginPath(); ctx.moveTo(-40, -5); ctx.lineTo(R - 20, -2); ctx.lineTo(R - 20, 2); ctx.lineTo(-40, 5); ctx.closePath();
    ctx.fillStyle = '#e00000'; ctx.fill();
    ctx.restore();
    ctx.beginPath(); ctx.arc(cx, cy, 26, 0, Math.PI * 2); ctx.fillStyle = '#111'; ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy, 10, 0, Math.PI * 2); ctx.fillStyle = '#333'; ctx.fill();
    text(ctx, car.model.toUpperCase(), 800, 580, 14, '#444', 'center', 700);
    void mode;
  }

  function shiftLights(ctx, s, car, cx, y) {
    const n = 10, red = car.dash.redline, start = red - 2400;
    const blink = s.rpm > red - 200 && Math.floor(performance.now() / 70) % 2 === 0;
    for (let i = 0; i < n; i++) {
      const thr = start + (i / n) * 2200;
      const col = i < 3 ? '#00e676' : i < 7 ? '#ff1744' : '#2979ff';
      const lit = s.rpm > thr && !(s.rpm > red - 200 && !blink);
      ctx.beginPath(); ctx.arc(cx - 225 + i * 50, y + 18, 11, 0, Math.PI * 2);
      ctx.fillStyle = lit ? col : '#1a1a1a'; ctx.shadowColor = col; ctx.shadowBlur = lit ? 16 : 0; ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  function screen(ctx, x, y, w, h) {
    roundRect(ctx, x, y, w, h, 24);
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, '#101317'); g.addColorStop(1, '#07080a');
    ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = '#222'; ctx.lineWidth = 2; ctx.stroke();
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  // ------------------------------------------------------------------ FERRARI DIGITAL (SF90 / 296)
  function drawFerrariDigital(ctx, s, car) {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    // curved panel
    ctx.beginPath(); ctx.moveTo(30, 70); ctx.quadraticCurveTo(800, 10, 1570, 70); ctx.lineTo(1570, 560);
    ctx.quadraticCurveTo(800, 600, 30, 560); ctx.closePath();
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#0f1114'); g.addColorStop(1, '#040506');
    ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = '#1d2026'; ctx.lineWidth = 2; ctx.stroke();

    shiftLights(ctx, s, car, 800, 40);
    const max = car.dash.dialMax, red = car.dash.redline;
    const cx = 800, cy = 320, R = 235;
    const a0 = Math.PI * 0.8, a1 = Math.PI * 2.2;
    const ang = (r) => a0 + (a1 - a0) * clamp(r / max, 0, 1);
    // background arc
    ctx.lineCap = 'butt';
    ctx.beginPath(); ctx.arc(cx, cy, R, a0, a1); ctx.strokeStyle = '#1a1c20'; ctx.lineWidth = 28; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, R, ang(red), a1); ctx.strokeStyle = '#4a0b0b'; ctx.lineWidth = 28; ctx.stroke();
    // value arc
    const grd = ctx.createLinearGradient(cx - R, 0, cx + R, 0);
    grd.addColorStop(0, '#ffffff'); grd.addColorStop(0.75, '#ffd400'); grd.addColorStop(1, '#ff1a1a');
    ctx.beginPath(); ctx.arc(cx, cy, R, a0, ang(s.rpm)); ctx.strokeStyle = s.rpm > red ? '#ff1a1a' : grd; ctx.lineWidth = 28;
    ctx.shadowColor = '#ffd400'; ctx.shadowBlur = 12; ctx.stroke(); ctx.shadowBlur = 0;
    for (let r = 0; r <= max; r += 500) {
      const a = ang(r), major = r % 1000 === 0;
      ctx.strokeStyle = r >= red ? '#ff3b30' : '#cfd3da'; ctx.lineWidth = major ? 4 : 2;
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * (R - 22), cy + Math.sin(a) * (R - 22));
      ctx.lineTo(cx + Math.cos(a) * (R - (major ? 42 : 32)), cy + Math.sin(a) * (R - (major ? 42 : 32))); ctx.stroke();
      if (major) text(ctx, String(r / 1000), cx + Math.cos(a) * (R - 68), cy + Math.sin(a) * (R - 68), 30, r >= red ? '#ff3b30' : '#e9ecf1', 'center', 600);
    }
    // marker
    const na = ang(s.rpm);
    ctx.strokeStyle = '#ff1a1a'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(cx + Math.cos(na) * (R - 20), cy + Math.sin(na) * (R - 20));
    ctx.lineTo(cx + Math.cos(na) * (R + 24), cy + Math.sin(na) * (R + 24)); ctx.stroke();
    text(ctx, String(Math.round(s.kmh)), cx, cy - 10, 110, '#fff', 'center', 600, DIGI);
    text(ctx, 'km/h', cx, cy + 60, 22, '#9aa0a6', 'center', 600);
    roundRect(ctx, cx - 50, cy + 90, 100, 90, 12); ctx.fillStyle = '#ffd400'; ctx.fill();
    text(ctx, gearStr(s), cx, cy + 137, 68, '#000', 'center', 700, DIGI);
    text(ctx, s.auto ? 'AUTO' : 'MAN', cx + 80, cy + 137, 18, s.auto ? '#4fc3f7' : '#ffd400', 'left', 700);
    if (s.lc) text(ctx, 'LAUNCH', cx, cy - 110, 22, '#ffd400', 'center', 700);
    if (!s.running) text(ctx, s.cranking ? 'START' : 'ENGINE OFF', cx, cy - 110, 22, '#ff8a00', 'center', 700);

    // left: hybrid power / battery
    text(ctx, 'POWER', 120, 150, 18, '#8a8f98', 'left', 700);
    const pw = clamp((s.wheelForce * s.v) / 1000 / (car.engine.powerKw + (car.engine.electricKw || 0)), -0.3, 1);
    bar(ctx, 120, 170, 360, 18, Math.max(0, pw), '#ffd400');
    text(ctx, Math.round(Math.max(0, s.wheelForce * s.v / 1000)) + ' kW', 480, 215, 22, '#fff', 'right', 600);
    text(ctx, 'eDRIVE', 120, 270, 18, '#8a8f98', 'left', 700);
    bar(ctx, 120, 290, 360, 18, clamp(s.eForce * Math.max(s.v, 1) / 1000 / (car.engine.electricKw || 1), 0, 1), '#3ddc84');
    text(ctx, 'BATTERY', 120, 350, 18, '#8a8f98', 'left', 700);
    bar(ctx, 120, 370, 360, 18, s.battery, '#4fc3f7');
    text(ctx, Math.round(s.battery * 100) + '%', 480, 415, 22, '#fff', 'right', 600);
    text(ctx, 'eManettino  HYBRID', 120, 470, 18, '#3ddc84', 'left', 700);

    // right: manettino + trip
    const mode = car.dash.modes[s.modeIdx];
    text(ctx, mode.name, 1480, 150, 34, '#ffd400', 'right', 700);
    const rows = [
      ['TRIP', fmt(s.tripKm, 1) + ' km'], ['ODO', Math.floor(s.odoKm) + ' km'],
      ['0-100', s.t100 != null ? fmt(s.t100, 2) + ' s' : '--'], ['0-200', s.t200 != null ? fmt(s.t200, 2) + ' s' : '--'],
      ['V MAX', Math.round(s.maxKmh) + ' km/h'],
    ];
    rows.forEach((r, i) => {
      text(ctx, r[0], 1120, 215 + i * 55, 18, '#8a8f98', 'left', 700);
      text(ctx, r[1], 1480, 215 + i * 55, 26, '#fff', 'right', 600);
    });
    text(ctx, new Date().toTimeString().slice(0, 5), 1480, 510, 20, '#bbb', 'right', 600);
    text(ctx, car.model.toUpperCase(), 800, 560, 14, '#555', 'center', 700);
  }

  function bar(ctx, x, y, w, h, v, col) {
    roundRect(ctx, x, y, w, h, h / 2); ctx.fillStyle = '#1c1f24'; ctx.fill();
    if (v > 0.005) { roundRect(ctx, x, y, Math.max(h, w * clamp(v, 0, 1)), h, h / 2); ctx.fillStyle = col; ctx.fill(); }
  }

  const STYLES = { lambo: drawLambo, 'ferrari-classic': drawFerrariClassic, 'ferrari-digital': drawFerrariDigital };

  window.Dashboards = {
    W, H, FONT, DIGI,
    util: { clamp, font, text, hexPath, fmt, gearStr, roundRect, bar },
    // car-specific clusters live in their own files and register here
    register(name, fn) { STYLES[name] = fn; },
    draw(ctx, state, car) { (STYLES[car.dash.style] || drawLambo)(ctx, state, car); },
  };
})();
