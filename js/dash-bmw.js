/*
 * BMW M5 Competition (F90) Live Cockpit Professional, M view:
 * large speedometer left, tachometer right (with the oil-temperature
 * dependent variable redline), centre panel with the drive-setup icons,
 * MDM / 4WD mode, M button, gear, red light streaks, and the bottom
 * status bar with clock, TOTAL / TRIP km and outside temperature.
 */
(function () {
  const D = window.Dashboards;
  const { W, H, FONT } = D;
  const { clamp, text, fmt } = D.util;
  const TAU = Math.PI * 2;
  const polar = (cx, cy, r, a) => [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  const BMWF = '"Rajdhani", "Segoe UI", system-ui, sans-serif';

  function dialFrame(ctx, cx, cy, R) {
    ctx.beginPath(); ctx.arc(cx, cy, R + 6, 0, TAU);
    const g = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, R + 6);
    g.addColorStop(0, '#0a0a0c'); g.addColorStop(0.85, '#0d0d10'); g.addColorStop(1, '#1a1a1e');
    ctx.fillStyle = g; ctx.fill();
  }

  function needle(ctx, cx, cy, a, len) {
    ctx.save();
    ctx.strokeStyle = '#ff2a1a'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.shadowColor = '#ff2a1a'; ctx.shadowBlur = 14;
    ctx.beginPath(); ctx.moveTo(...polar(cx, cy, -24, a)); ctx.lineTo(...polar(cx, cy, len, a)); ctx.stroke();
    ctx.restore();
    // chrome hub ring
    ctx.beginPath(); ctx.arc(cx, cy, 26, 0, TAU);
    const g = ctx.createLinearGradient(cx - 26, cy - 26, cx + 26, cy + 26);
    g.addColorStop(0, '#f2f2f2'); g.addColorStop(0.5, '#6d6f74'); g.addColorStop(1, '#d8d8da');
    ctx.strokeStyle = g; ctx.lineWidth = 6; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, 20, 0, TAU); ctx.fillStyle = 'rgba(80,0,0,.55)'; ctx.fill();
  }

  function drawM5(ctx, s, car) {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    const mode = car.dash.modes[s.modeIdx];

    // red perspective light streaks in the middle
    ctx.save();
    for (const k of [-1, 1]) {
      const g = ctx.createLinearGradient(800, 380, 800 + k * 300, 560);
      g.addColorStop(0, 'rgba(255,40,30,.85)'); g.addColorStop(1, 'rgba(255,40,30,0)');
      ctx.strokeStyle = g; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(800 + k * 70, 395); ctx.lineTo(800 + k * 330, 540); ctx.stroke();
      ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(800 + k * 120, 395); ctx.lineTo(800 + k * 420, 520); ctx.stroke();
    }
    const glow = ctx.createRadialGradient(800, 392, 2, 800, 392, 120);
    glow.addColorStop(0, 'rgba(255,40,30,.75)'); glow.addColorStop(1, 'rgba(255,40,30,0)');
    ctx.fillStyle = glow; ctx.fillRect(680, 370, 240, 50);
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(520, 392); ctx.lineTo(1080, 392); ctx.stroke();
    ctx.restore();

    // ---------------- speedometer
    const sx = 300, sy = 300, SR = 268, vmax = car.dash.speedoMax || 330;
    const sA = (v) => Math.PI * 0.68 + (clamp(v, 0, vmax) / vmax) * Math.PI * 1.32;
    dialFrame(ctx, sx, sy, SR);
    ctx.strokeStyle = '#d9d9dc'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(sx, sy, SR, sA(0), sA(vmax)); ctx.stroke();
    for (let v = 0; v <= vmax; v += 10) {
      const a = sA(v), major = v % 30 === 0;
      ctx.strokeStyle = '#f2f2f2'; ctx.lineWidth = major ? 4 : 2;
      ctx.beginPath(); ctx.moveTo(...polar(sx, sy, SR - 4, a)); ctx.lineTo(...polar(sx, sy, SR - (major ? 30 : 16), a)); ctx.stroke();
      // red ticks inside the scale every 10 km/h
      ctx.strokeStyle = '#e8261c'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(...polar(sx, sy, SR - 112, a)); ctx.lineTo(...polar(sx, sy, SR - 120, a)); ctx.stroke();
      if (major) { const [x, y] = polar(sx, sy, SR - 66, a); text(ctx, String(v), x, y, 34, '#fff', 'center', 700, BMWF); }
    }
    ctx.strokeStyle = '#9a9ca0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sx, sy, SR - 124, sA(0), sA(vmax)); ctx.stroke();
    text(ctx, 'km/h', sx, sy - 112, 20, '#fff', 'center', 600, BMWF);
    text(ctx, String(Math.round(s.kmh)), sx, sy - 68, 44, '#fff', 'center', 700, BMWF);
    const [ux, uy] = polar(sx, sy, SR + 20, sA(vmax) - 0.08);
    ctx.save(); ctx.translate(ux, uy); ctx.rotate(Math.PI / 2 - 0.15); text(ctx, 'km/h', 0, 0, 16, '#fff', 'center', 600, BMWF); ctx.restore();
    needle(ctx, sx, sy, sA(s.kmh), SR - 8);

    // ---------------- tachometer
    const tx = 1300, ty = 300, TR = 268, max = car.dash.dialMax, red = car.dash.redline;
    const tA = (r) => Math.PI * 0.86 + (clamp(r, 0, max) / max) * Math.PI * 1.42;
    dialFrame(ctx, tx, ty, TR);
    ctx.strokeStyle = '#d9d9dc'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(tx, ty, TR, tA(0), tA(max)); ctx.stroke();
    // variable redline: lowered while the oil is cold, like the real car
    const warm = clamp((s.oilT - 40) / 50, 0, 1);
    const vRed = Math.round((5500 + (red - 5500) * warm) / 100) * 100;
    ctx.lineWidth = 10;
    if (vRed < red) { ctx.strokeStyle = '#ff9800'; ctx.beginPath(); ctx.arc(tx, ty, TR - 8, tA(vRed), tA(red)); ctx.stroke(); }
    ctx.strokeStyle = '#e8261c'; ctx.beginPath(); ctx.arc(tx, ty, TR - 8, tA(red), tA(max)); ctx.stroke();
    for (let r = 0; r <= max; r += 250) {
      const a = tA(r), major = r % 1000 === 0;
      ctx.strokeStyle = '#f2f2f2'; ctx.lineWidth = major ? 4 : 2;
      ctx.beginPath(); ctx.moveTo(...polar(tx, ty, TR - 4, a)); ctx.lineTo(...polar(tx, ty, TR - (major ? 30 : 16), a)); ctx.stroke();
      ctx.strokeStyle = '#e8261c'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(...polar(tx, ty, TR - 112, a)); ctx.lineTo(...polar(tx, ty, TR - 120, a)); ctx.stroke();
      if (major && r > 0) { const [x, y] = polar(tx, ty, TR - 66, a); text(ctx, String(r / 1000), x, y, 40, '#fff', 'center', 700, BMWF); }
    }
    ctx.strokeStyle = '#9a9ca0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(tx, ty, TR - 124, tA(0), tA(max)); ctx.stroke();
    const [lx, ly] = polar(tx, ty, TR + 20, tA(1500));
    ctx.save(); ctx.translate(lx, ly); ctx.rotate(tA(1500) + Math.PI / 2); text(ctx, '1/min x 1000', 0, 0, 16, '#fff', 'center', 600, BMWF); ctx.restore();
    // model badge (text only)
    ctx.save(); ctx.font = `italic 800 40px ${BMWF}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff'; ctx.fillText('M5', tx + 30, ty - 70);
    ctx.font = `italic 600 14px ${BMWF}`; ctx.fillStyle = '#bbb'; ctx.fillText('COMPETITION', tx + 30, ty - 40); ctx.restore();
    text(ctx, s.running ? 'READY' : s.cranking ? 'START' : 'OFF', tx - 130, ty + 18, 22, s.running ? '#fff' : '#ff9800', 'center', 700, BMWF);
    if (vRed < red && s.running) text(ctx, 'ENGINE WARM-UP', tx, ty + 120, 15, '#ff9800', 'center', 700, BMWF);
    needle(ctx, tx, ty, tA(s.rpm), TR - 8);

    // ---------------- centre panel
    const icons = [['⏱', 'Sport'], ['⇕', mode.name === 'COMFORT' ? 'Comfort' : 'Sport'], ['◎', mode.name === 'SPORT+' ? 'Sport' : 'Comfort']];
    icons.forEach(([ic, l], i) => {
      const x = 680 + i * 120;
      text(ctx, s.modeIdx === 0 && i === 0 ? 'Efficient' : mode.name === 'SPORT+' && i === 0 ? 'Sport+' : l, x, 70, 18, '#fff', 'center', 600, BMWF);
      text(ctx, ic, x, 104, 26, '#fff', 'center', 600);
    });
    ctx.strokeStyle = '#6d7076'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(620, 130); ctx.lineTo(980, 130); ctx.stroke();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(700, 134); ctx.lineTo(900, 134); ctx.stroke();
    text(ctx, mode.name === 'SPORT+' ? 'MDM' : 'DSC ON', 800, 168, 24, '#fff', 'center', 700, BMWF);
    text(ctx, mode.name === 'COMFORT' ? '4WD' : '4WD Sport', 800, 198, 24, '#fff', 'center', 700, BMWF);
    // M button roundel
    ctx.beginPath(); ctx.arc(800, 240, 20, 0, TAU); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.save(); ctx.font = `italic 800 20px ${BMWF}`; ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('M' + (s.modeIdx === 2 ? '2' : '1'), 800, 241); ctx.restore();
    // gear indicator: D/M + gear number with the shift-lights bars
    const gl = !s.running ? 'P' : s.gear === 0 ? 'N' : (s.auto ? 'D' : 'M') + s.gear;
    text(ctx, gl, 800, 318, 72, s.cut ? '#ff3b30' : '#fff', 'center', 700, BMWF);
    const near = clamp((s.rpm - (vRed - 1500)) / 1500, 0, 1);
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = near > (i + 1) / 3.2 ? '#ff2a1a' : '#fff';
      ctx.fillRect(870, 300 + i * 12, 28 - i * 4, 6);
    }
    if (s.lc) text(ctx, 'LAUNCH CONTROL', 800, 365, 18, '#ffd21a', 'center', 700, BMWF);

    // ---------------- bottom status bar
    ctx.fillStyle = 'rgba(30,32,36,.9)';
    ctx.beginPath(); ctx.moveTo(430, 546); ctx.lineTo(1170, 546); ctx.lineTo(1190, 588); ctx.lineTo(410, 588); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(430, 546); ctx.lineTo(1170, 546); ctx.stroke();
    text(ctx, new Date().toTimeString().slice(0, 5), 450, 568, 24, '#fff', 'left', 600, BMWF);
    text(ctx, 'TOTAL', 560, 570, 18, '#fff', 'left', 600, BMWF);
    text(ctx, String(Math.floor(s.odoKm)).padStart(5, '0'), 634, 568, 28, '#fff', 'left', 700, BMWF);
    text(ctx, 'km', 722, 572, 16, '#fff', 'left', 600, BMWF);
    text(ctx, 'TRIP', 790, 570, 18, '#fff', 'left', 600, BMWF);
    text(ctx, fmt(s.tripKm, 1).padStart(6, '0'), 850, 568, 28, '#fff', 'left', 700, BMWF);
    text(ctx, 'km', 950, 572, 16, '#fff', 'left', 600, BMWF);
    text(ctx, '+' + fmt(s.ambient, 1) + '°C', 1150, 568, 24, '#fff', 'right', 600, BMWF);
    void FONT;
  }

  D.register('bmw-m', drawM5);
})();
