/*
 * Koenigsegg Jesko: the 5" screen that moves with the steering wheel.
 * Purple segmented arc gauges (water temp, oil pressure, fuel, oil temp),
 * lime inner ring that fills with rpm, gear on top, digital rpm band,
 * POWER (kW) and BOOST (kPa) readouts, speed in kph. The green arrows
 * flash as shift lights near the limiter.
 */
(function () {
  const D = window.Dashboards;
  const { W, H, FONT } = D;
  const { clamp, text, roundRect } = D.util;
  const TAU = Math.PI * 2;
  const polar = (cx, cy, r, a) => [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  const LIME = '#b6f23a', PURPLE = '#5b3fa8', LAV = '#cbb8ff', PINK = '#f3c6e8';

  function itxt(ctx, str, x, y, size, fill, align, weight) {
    ctx.font = `italic ${weight || 800} ${size}px ${FONT}`; ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = fill; ctx.fillText(str, x, y);
  }

  // segmented gauge along an arc; v in 0..1, drawn from a0 to a1
  function segArc(ctx, cx, cy, r, w, a0, a1, n, v, labels) {
    const step = (a1 - a0) / n;
    for (let i = 0; i < n; i++) {
      const aa = a0 + i * step + step * 0.12, ab = a0 + (i + 1) * step - step * 0.12;
      ctx.beginPath(); ctx.arc(cx, cy, r, Math.min(aa, ab), Math.max(aa, ab)); ctx.arc(cx, cy, r - w, Math.max(aa, ab), Math.min(aa, ab), true); ctx.closePath();
      ctx.fillStyle = (i + 0.5) / n <= v ? '#8f73e6' : PURPLE; ctx.globalAlpha = (i + 0.5) / n <= v ? 1 : 0.55; ctx.fill();
    }
    ctx.globalAlpha = 1;
    // lavender drop marker
    const am = a0 + (a1 - a0) * clamp(v, 0, 1), [mx, my] = polar(cx, cy, r - w / 2, am);
    ctx.save(); ctx.translate(mx, my); ctx.rotate(am + (a1 > a0 ? Math.PI / 2 : -Math.PI / 2));
    ctx.beginPath(); ctx.moveTo(0, -w * 0.9); ctx.quadraticCurveTo(w * 0.7, 0, 0, w * 0.7); ctx.quadraticCurveTo(-w * 0.7, 0, 0, -w * 0.9);
    ctx.fillStyle = LAV; ctx.shadowColor = LAV; ctx.shadowBlur = 8; ctx.fill(); ctx.restore();
    if (labels) {
      const [x0, y0] = polar(cx, cy, r + 22, a0), [x1, y1] = polar(cx, cy, r + 22, a1);
      text(ctx, labels[0], x0, y0, 20, LIME, 'center', 700);
      text(ctx, labels[1], x1, y1, 20, LIME, 'center', 700);
    }
  }

  function icon(ctx, x, y, glyph) {
    ctx.beginPath(); ctx.arc(x, y, 24, 0, TAU); ctx.strokeStyle = LIME; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, 19, 0, TAU); ctx.fillStyle = 'rgba(182,242,58,.12)'; ctx.fill();
    text(ctx, glyph, x, y + 1, 20, '#fff', 'center', 600);
  }

  function arrow(ctx, x, y, dir, on) {
    ctx.save(); ctx.translate(x, y); ctx.scale(dir, 1);
    ctx.beginPath(); ctx.moveTo(-34, -9); ctx.lineTo(4, -9); ctx.lineTo(4, -20); ctx.lineTo(34, 0); ctx.lineTo(4, 20); ctx.lineTo(4, 9); ctx.lineTo(-34, 9); ctx.closePath();
    ctx.fillStyle = on ? LIME : 'rgba(182,242,58,.25)'; if (on) { ctx.shadowColor = LIME; ctx.shadowBlur = 16; }
    ctx.fill(); ctx.restore();
  }

  function drawJesko(ctx, s, car) {
    // steering-wheel hub + carbon around the screen
    ctx.fillStyle = '#050506'; ctx.fillRect(0, 0, W, H);
    const cf = ctx.createLinearGradient(0, 0, W, 0);
    cf.addColorStop(0, '#16171a'); cf.addColorStop(0.5, '#0b0b0d'); cf.addColorStop(1, '#16171a');
    ctx.fillStyle = cf; ctx.fillRect(0, 0, W, H);
    for (let x = -600; x < W; x += 14) { ctx.strokeStyle = 'rgba(255,255,255,.025)'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 600, H); ctx.stroke(); }

    // chrome bezel + screen
    roundRect(ctx, 400, 14, 800, 572, 40);
    const bz = ctx.createLinearGradient(400, 14, 1200, 586);
    bz.addColorStop(0, '#e8e8ea'); bz.addColorStop(0.3, '#6c6e73'); bz.addColorStop(0.6, '#f4f4f6'); bz.addColorStop(1, '#55575c');
    ctx.fillStyle = bz; ctx.fill();
    roundRect(ctx, 414, 28, 772, 544, 30);
    const sg = ctx.createRadialGradient(800, 320, 40, 800, 320, 520);
    sg.addColorStop(0, '#1a1638'); sg.addColorStop(0.6, '#0c0a1d'); sg.addColorStop(1, '#050410');
    ctx.fillStyle = sg; ctx.fill();
    ctx.save(); roundRect(ctx, 414, 28, 772, 544, 30); ctx.clip();

    const cx = 800, cy = 318, mode = car.dash.modes[s.modeIdx];
    const max = car.dash.dialMax, red = car.dash.redline;

    // outer purple gauges
    const oilP = s.running ? 1.2 + (s.rpm / car.engine.limiter) * 4.5 : 0;
    segArc(ctx, cx, cy, 262, 26, Math.PI * 1.3, Math.PI * 1.64, 7, clamp((s.waterT - 40) / 80, 0, 1), ['40', '120']);
    segArc(ctx, cx, cy, 262, 26, Math.PI * 0.84, Math.PI * 1.18, 7, clamp(oilP / 6, 0, 1), ['0', '6']);
    segArc(ctx, cx, cy, 262, 26, Math.PI * 2.12, Math.PI * 1.84, 7, clamp(s.fuel, 0, 1), ['E', 'F']);
    segArc(ctx, cx, cy, 262, 26, Math.PI * 0.18, Math.PI * 0.56, 7, clamp((s.oilT - 40) / 100, 0, 1), ['40', '140']);
    icon(ctx, 560, 100, '🌡'); icon(ctx, 470, 300, '🛢'); icon(ctx, 1130, 330, '⛽'); icon(ctx, 1050, 530, '🛢');
    text(ctx, mode.name, 1110, 70, 20, mode.color || LIME, 'center', 700);

    // inner lime ring: thin outline + rpm fill
    const a0 = Math.PI * 0.62, a1 = Math.PI * 2.38, ang = (r) => a0 + (clamp(r, 0, max) / max) * (a1 - a0);
    ctx.lineCap = 'butt';
    ctx.strokeStyle = 'rgba(182,242,58,.35)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy, 214, a0, a1); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,64,129,.6)'; ctx.lineWidth = 8; ctx.beginPath(); ctx.arc(cx, cy, 214, ang(red), a1); ctx.stroke();
    if (s.rpm > 30) {
      ctx.strokeStyle = s.rpm > red - 300 ? '#ff4081' : LIME; ctx.lineWidth = 8; ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.arc(cx, cy, 214, a0, ang(s.rpm)); ctx.stroke(); ctx.shadowBlur = 0;
    }
    // purple sweep rings (decorative, like the real screen)
    for (const [r, wd] of [[190, 22], [164, 14]]) {
      ctx.strokeStyle = 'rgba(91,63,168,.55)'; ctx.lineWidth = wd; ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
    }

    // gear
    const gs = !s.running ? 'N' : s.gear === 0 ? 'N' : String(s.gear);
    ctx.save(); ctx.shadowColor = '#b388ff'; ctx.shadowBlur = 24; itxt(ctx, gs, cx, 150, 74, s.cut ? '#ff4081' : PINK, 'center', 900); ctx.restore();
    if (!s.auto) text(ctx, 'M', cx + 52, 132, 20, LIME, 'center', 700);
    text(ctx, '🔅', cx - 40, 212, 22, LIME, 'center', 600); text(ctx, '🔆', cx + 80, 188, 22, LIME, 'center', 600);

    // shift-light arrows
    const flash = s.rpm > red - 600 && Math.floor(performance.now() / 70) % 2 === 0;
    arrow(ctx, cx + 175, 262, 1, flash || s.rpm > red - 1200);
    arrow(ctx, cx - 175, 346, -1, flash || s.rpm > red - 1200);

    // rpm band
    ctx.save(); ctx.translate(cx, 296); ctx.rotate(-0.08);
    const band = ctx.createLinearGradient(-230, 0, 230, 0);
    band.addColorStop(0, 'rgba(91,63,168,0)'); band.addColorStop(0.15, 'rgba(110,80,200,.9)'); band.addColorStop(0.85, 'rgba(110,80,200,.9)'); band.addColorStop(1, 'rgba(91,63,168,0)');
    ctx.fillStyle = band; ctx.fillRect(-230, -30, 460, 60);
    itxt(ctx, String(Math.round(s.rpm)).padStart(4, '0'), 0, 0, 52, '#fff', 'center', 900);
    text(ctx, 'rpm', 112, 10, 15, LAV, 'left', 600);
    ctx.restore();
    // brand plate
    ctx.save(); ctx.translate(cx, 356); ctx.rotate(-0.08);
    ctx.fillStyle = 'rgba(120,96,200,.75)'; ctx.fillRect(-160, -22, 320, 44);
    itxt(ctx, 'Koenigsegg', 0, 0, 34, '#fff', 'center', 800);
    ctx.fillStyle = '#fff'; ctx.fillRect(-110, 18, 220, 3);
    ctx.restore();

    // power / boost
    const kw = Math.max(0, s.wheelForce * s.v / 1000);
    const kpa = car.engine.aspiration === 'TT' ? Math.round(s.boost * 190 * (s.running ? 1 : 0)) : 0;
    ctx.save(); ctx.translate(cx, 412); ctx.rotate(-0.08);
    itxt(ctx, String(Math.round(kw)).padStart(3, '0'), -70, 0, 40, '#fff', 'center', 900);
    itxt(ctx, String(kpa).padStart(3, '0'), 70, -4, 40, '#fff', 'center', 900);
    text(ctx, 'POWER (kW)', -200, 6, 14, '#ddd', 'center', 700);
    text(ctx, 'BOOST (kPa)', 200, -12, 14, '#ddd', 'center', 700);
    // speed
    ctx.fillStyle = 'rgba(91,63,168,.6)'; ctx.fillRect(-120, 34, 240, 66);
    itxt(ctx, String(Math.round(s.kmh)).padStart(3, '0'), 0, 66, 60, '#fff', 'center', 900);
    text(ctx, 'kph', 0, 108, 15, LAV, 'center', 600);
    ctx.restore();

    if (s.lc) text(ctx, 'LAUNCH', cx, 232, 18, LIME, 'center', 700);
    if (!s.running) text(ctx, s.cranking ? 'START' : 'ENGINE OFF', cx, 232, 18, '#ff4081', 'center', 700);

    // glass reflection
    const gl = ctx.createLinearGradient(700, 28, 1186, 572);
    gl.addColorStop(0, 'rgba(255,255,255,0)'); gl.addColorStop(0.55, 'rgba(160,140,255,.07)'); gl.addColorStop(0.62, 'rgba(255,255,255,0)');
    ctx.fillStyle = gl; ctx.fillRect(414, 28, 772, 544);
    ctx.restore();

    // script badge on the column
    ctx.save(); ctx.translate(1270, 120); ctx.rotate(0.9);
    ctx.font = `italic 600 30px "Brush Script MT", cursive`; ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.textAlign = 'center'; ctx.fillText('Jesko', 0, 0);
    ctx.restore();
  }

  D.register('koenigsegg', drawJesko);
})();
