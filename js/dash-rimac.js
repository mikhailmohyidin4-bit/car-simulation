/*
 * Rimac Nevera R driver display: dark teal screen, power arc (left) with
 * regen readout, battery arc (right) with range, centre speed in outlined
 * octagon digits, P R N D, door status with a top-view car, and the
 * "real time wheel torque distribution" panel with all four motors.
 */
(function () {
  const D = window.Dashboards;
  const { W, H } = D;
  const { clamp, text, fmt } = D.util;
  const TEAL = '#43e0a8', DIM = 'rgba(67,224,168,.35)', TXT = '#bff5e2';
  const F = '"Rajdhani", "Orbitron", "Segoe UI", system-ui, sans-serif';

  function octagon(ctx, x, y, w, h, c) {
    const k = h * 0.28;
    ctx.beginPath();
    ctx.moveTo(x + k, y); ctx.lineTo(x + w - k, y); ctx.lineTo(x + w, y + k); ctx.lineTo(x + w, y + h - k);
    ctx.lineTo(x + w - k, y + h); ctx.lineTo(x + k, y + h); ctx.lineTo(x, y + h - k); ctx.lineTo(x, y + k); ctx.closePath();
  }

  // speed digits drawn as outlined octagons: unused leading digits stay as empty outlines
  function speedDigits(ctx, cx, cy, kmh) {
    const s = String(Math.round(kmh)), digits = s.padStart(3, ' ');
    const w = 84, h = 64, gap = 14, x0 = cx - (w * 3 + gap * 2) / 2;
    for (let i = 0; i < 3; i++) {
      const x = x0 + i * (w + gap), d = digits[i];
      octagon(ctx, x, cy - h / 2, w, h);
      ctx.lineWidth = d === ' ' ? 3 : 5; ctx.strokeStyle = d === ' ' ? DIM : TEAL; ctx.stroke();
      if (d !== ' ') text(ctx, d, x + w / 2, cy + 2, 60, '#eafff6', 'center', 700, F);
    }
    text(ctx, 'km/h', cx, cy + 62, 22, TEAL, 'center', 500, F);
  }

  function carTop(ctx, x, y, s, doorsOpen) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    const g = ctx.createLinearGradient(-40, 0, 40, 0);
    g.addColorStop(0, '#1d4a3d'); g.addColorStop(0.5, '#6fc7a6'); g.addColorStop(1, '#1d4a3d');
    ctx.beginPath(); ctx.moveTo(-26, -78); ctx.quadraticCurveTo(0, -92, 26, -78); ctx.lineTo(38, -30); ctx.lineTo(36, 66);
    ctx.quadraticCurveTo(0, 82, -36, 66); ctx.lineTo(-38, -30); ctx.closePath(); ctx.fillStyle = g; ctx.fill();
    ctx.fillStyle = '#0c1d18'; ctx.beginPath(); ctx.moveTo(-22, -38); ctx.lineTo(22, -38); ctx.lineTo(18, 4); ctx.lineTo(-18, 4); ctx.closePath(); ctx.fill();
    if (doorsOpen) {
      ctx.fillStyle = 'rgba(111,199,166,.75)';
      ctx.beginPath(); ctx.moveTo(-38, -30); ctx.lineTo(-70, -48); ctx.lineTo(-64, -2); ctx.lineTo(-38, 8); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(38, -30); ctx.lineTo(70, -48); ctx.lineTo(64, -2); ctx.lineTo(38, 8); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  function chassis(ctx, x, y) {
    ctx.strokeStyle = 'rgba(191,245,226,.45)'; ctx.lineWidth = 2;
    ctx.strokeRect(x - 26, y - 70, 52, 140);
    ctx.fillStyle = 'rgba(191,245,226,.25)';
    for (const [dx, dy] of [[-40, -52], [28, -52], [-40, 30], [28, 30]]) ctx.fillRect(x + dx, y + dy, 12, 26);
    ctx.fillStyle = 'rgba(67,224,168,.5)';
    for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(x - 60, y - 60 + i * 24, 3, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(x + 60, y - 60 + i * 24, 3, 0, Math.PI * 2); ctx.fill(); }
  }

  function drawNevera(ctx, s, car) {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    // curved screen
    ctx.beginPath(); ctx.moveTo(40, 70); ctx.quadraticCurveTo(800, 10, 1560, 70); ctx.lineTo(1520, 560); ctx.lineTo(80, 560); ctx.closePath();
    const bg = ctx.createRadialGradient(800, 300, 50, 800, 300, 900);
    bg.addColorStop(0, '#0f2620'); bg.addColorStop(1, '#040b09');
    ctx.fillStyle = bg; ctx.fill();

    const mode = car.dash.modes[s.modeIdx];
    const kw = Math.max(0, s.wheelForce * s.v / 1000), regen = s.regenKw || 0;

    // power arc (left): dotted line rising to the centre, solid fill with power
    const pFrac = clamp(kw / car.engine.powerKw, 0, 1);
    ctx.setLineDash([3, 6]); ctx.strokeStyle = DIM; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(110, 205); ctx.quadraticCurveTo(330, 130, 640, 120); ctx.stroke(); ctx.setLineDash([]);
    if (pFrac > 0.003) {
      ctx.strokeStyle = TEAL; ctx.lineWidth = 5; ctx.beginPath();
      for (let t = 0; t <= pFrac; t += 0.01) {
        const x = (1 - t) * (1 - t) * 110 + 2 * (1 - t) * t * 330 + t * t * 640, y = (1 - t) * (1 - t) * 205 + 2 * (1 - t) * t * 130 + t * t * 120;
        t === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    text(ctx, String(Math.round(kw)).padStart(4, '0'), 650, 92, 34, '#eafff6', 'right', 600, F);
    text(ctx, 'kW', 660, 96, 18, TEAL, 'left', 600, F);
    text(ctx, regen > 1 ? `REGEN ${Math.round(regen)} kW` : 'NO REGEN', 690, 132, 18, regen > 1 ? '#7cffcf' : TEAL, 'right', 500, F);
    // centre status line
    ctx.strokeStyle = 'rgba(191,245,226,.6)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(700, 102); ctx.lineTo(980, 98); ctx.stroke();
    text(ctx, mode.name, 840, 80, 20, '#eafff6', 'center', 700, F);
    text(ctx, s.lc ? 'LAUNCH CONTROL' : s.running ? 'READY' : s.cranking ? 'STARTING' : 'OFF', 840, 122, 16, s.lc ? '#ffd166' : TEAL, 'center', 600, F);

    // battery arc (right)
    const bat = clamp(s.battery, 0, 1);
    text(ctx, String(Math.round(bat * 100)).padStart(3, ' ') + '%', 1080, 90, 34, '#eafff6', 'right', 600, F);
    ctx.strokeStyle = DIM; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(1010, 112); ctx.lineTo(1100, 110); ctx.stroke();
    ctx.strokeStyle = 'rgba(67,224,168,.18)'; ctx.lineWidth = 9;
    ctx.beginPath(); ctx.moveTo(1100, 110); ctx.quadraticCurveTo(1300, 112, 1440, 210); ctx.stroke();
    ctx.strokeStyle = TEAL; ctx.beginPath();
    for (let t = 0; t <= bat; t += 0.01) {
      const x = (1 - t) * (1 - t) * 1100 + 2 * (1 - t) * t * 1300 + t * t * 1440, y = (1 - t) * (1 - t) * 110 + 2 * (1 - t) * t * 112 + t * t * 210;
      t === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    text(ctx, Math.round(bat * (car.ev.rangeKm || 490)) + ' km', 1010, 140, 22, TXT, 'left', 600, F);

    // doors / car (left)
    const open = !s.running && s.kmh < 1;
    text(ctx, open ? 'OPEN DOORS' : 'DOORS CLOSED', 360, 196, 22, '#eafff6', 'center', 700, F);
    carTop(ctx, 360, 320, 1.15, open);
    text(ctx, 'L DOOR', 230, 270, 16, TEAL, 'center', 500, F); text(ctx, open ? 'Open' : 'Closed', 230, 296, 20, '#eafff6', 'center', 600, F);
    text(ctx, 'R DOOR', 495, 262, 16, TEAL, 'center', 500, F); text(ctx, open ? 'Open' : 'Closed', 495, 288, 20, '#eafff6', 'center', 600, F);
    ctx.strokeStyle = TEAL; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(195, 308); ctx.lineTo(290, 308); ctx.lineTo(305, 318); ctx.moveTo(530, 300); ctx.lineTo(440, 300); ctx.lineTo(425, 310); ctx.stroke();

    // speed + gear selector
    speedDigits(ctx, 800, 300, s.kmh);
    const sel = !s.running ? 'P' : s.kmh < 0.5 && s.gear === 0 ? 'N' : 'D';
    ['P', 'R', 'N', 'D'].forEach((g, i) => text(ctx, g, 740 + i * 42, 455, g === sel ? 34 : 20, g === sel ? TEAL : 'rgba(67,224,168,.3)', 'center', 700, F));

    // torque distribution (right)
    text(ctx, 'REAL TIME WHEEL', 1000, 238, 21, '#eafff6', 'left', 700, F);
    text(ctx, 'TORQUE DISTRIBUTION', 1000, 262, 21, '#eafff6', 'left', 700, F);
    const front = mode.front != null ? mode.front : 0.4;
    const wheelNm = Math.max(0, s.wheelForce) * car.tireRadius;
    const yaw = Math.sin(performance.now() / 900) * 0.04 * (s.kmh > 20 ? 1 : 0); // torque vectoring wobble
    const tq = [wheelNm * front / 2 * (1 + yaw), wheelNm * front / 2 * (1 - yaw), wheelNm * (1 - front) / 2 * (1 + yaw), wheelNm * (1 - front) / 2 * (1 - yaw)];
    chassis(ctx, 1190, 380);
    const lbl = [['FL TORQUE', 1000, 318, 'left'], ['FR TORQUE', 1380, 318, 'right'], ['RL TORQUE', 1000, 410, 'left'], ['RR TORQUE', 1380, 410, 'right']];
    lbl.forEach(([l, x, y, al], i) => {
      text(ctx, l, x, y, 15, TEAL, al, 500, F);
      ctx.strokeStyle = TEAL; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(al === 'left' ? 1000 : 1260, y + 12); ctx.lineTo(al === 'left' ? 1120 : 1380, y + 12); ctx.stroke();
      text(ctx, Math.round(tq[i]) + 'Nm', x, y + 32, 20, '#eafff6', al, 600, F);
    });

    // bottom row
    text(ctx, Math.floor(s.odoKm).toLocaleString('en').replace(/,/g, ' ') + ' km', 200, 470, 20, TXT, 'left', 600, F);
    text(ctx, new Date().toTimeString().slice(0, 5), 560, 470, 20, '#eafff6', 'center', 600, F);
    text(ctx, fmt(s.ambient, 0) + ' °C', 1000, 470, 20, '#eafff6', 'left', 600, F);
    if (!s.running) { text(ctx, 'Ⓟ', 470, 520, 24, '#ff4d4d', 'center', 700, F); text(ctx, 'PARK', 470, 545, 14, '#ff4d4d', 'center', 700, F); }
    text(ctx, (car.option ? s.optName || '' : ''), 1380, 470, 16, TEAL, 'right', 600, F);
  }

  D.register('rimac', drawNevera);
})();
