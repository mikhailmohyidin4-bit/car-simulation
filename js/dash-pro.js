/*
 * Car-specific instrument clusters modelled on the real cars' screens:
 *   ferrari-296  - 296 GTB 16" HMI: yellow ring tach with speed/gear boxes,
 *                  map + media on the left, menu on the right, status bar
 *   ferrari-f8   - F8 Tributo: analogue-look yellow tach in the middle,
 *                  turbo-efficiency gauge left, analogue speedo right
 *   lambo-sto    - Huracán STO: wide outlined arc tach, giant outlined gear
 *                  with prev/next gear, lap/vmax data, TPMS + BTM panels
 * All drawn on the shared 1600x600 logical canvas.
 */
(function () {
  const D = window.Dashboards;
  const { W, H, FONT, DIGI } = D;
  const { clamp, text, roundRect, fmt } = D.util;
  const TAU = Math.PI * 2;

  function polar(cx, cy, r, a) { return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; }
  function gearLabel(s) { return !s.running ? 'P' : s.gear === 0 ? 'N' : String(s.gear); }
  function clock() { return new Date().toTimeString().slice(0, 5); }

  let carbon = null;
  function carbonPattern(ctx) {
    if (carbon) return carbon;
    const c = document.createElement('canvas'); c.width = c.height = 12;
    const g = c.getContext('2d');
    g.fillStyle = '#0b0c0e'; g.fillRect(0, 0, 12, 12);
    g.fillStyle = '#15171a'; g.fillRect(0, 0, 6, 6); g.fillRect(6, 6, 6, 6);
    g.fillStyle = '#101113'; g.fillRect(0, 2, 6, 2); g.fillRect(8, 6, 2, 6);
    carbon = ctx.createPattern(c, 'repeat');
    return carbon;
  }

  // Manettino label colours as shown on the Ferrari HMI
  function modeColor(name) {
    return { WET: '#7fe0ff', SPORT: '#ffd400', RACE: '#ffd400', 'CT OFF': '#ff9800', 'ESC OFF': '#ff3b30' }[name] || '#ffd400';
  }

  // ================================================================ FERRARI 296 GTB / SF90 STRADALE
  function drawHMI(ctx, s, car) {
    const sf = car.dash.variant === 'sf90';
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    // screen glass with carbon weave
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(110, 150); ctx.lineTo(560, 150); ctx.quadraticCurveTo(800, -10, 1040, 150);
    ctx.lineTo(1500, 150); ctx.quadraticCurveTo(1540, 150, 1540, 190); ctx.lineTo(1520, 560);
    ctx.lineTo(80, 560); ctx.lineTo(70, 190); ctx.quadraticCurveTo(70, 150, 110, 150); ctx.closePath();
    ctx.fillStyle = carbonPattern(ctx); ctx.fill();
    const vg = ctx.createRadialGradient(800, 300, 100, 800, 300, 900);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.65)');
    ctx.fillStyle = vg; ctx.fill();
    ctx.restore();

    const cx = 800, cy = 288, max = car.dash.dialMax, red = car.dash.redline;
    // 0 rpm at 6 o'clock, sweeping clockwise; 8000 rpm at 12 o'clock
    const ang = (r) => Math.PI / 2 + (clamp(r, 0, max) / 8000) * Math.PI;

    // header strips: eManettino (left) and Manettino (right)
    const mode = car.dash.modes[s.modeIdx].name;
    ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(470, 92); ctx.lineTo(600, 92); ctx.moveTo(1000, 92); ctx.lineTo(1130, 92); ctx.stroke();
    text(ctx, 'HYBRID', 545, 76, 22, '#7cff3a', 'center', 700);
    ctx.strokeStyle = '#7cff3a'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(600, 92); ctx.lineTo(612, 64); ctx.stroke();
    const mc = modeColor(mode);
    text(ctx, mode, 1060, 76, 22, mc, 'center', 700);
    ctx.strokeStyle = mc; ctx.beginPath(); ctx.moveTo(1000, 92); ctx.lineTo(988, 64); ctx.stroke();

    // outer ring + fine ticks
    ctx.beginPath(); ctx.arc(cx, cy, 250, 0, TAU); ctx.fillStyle = '#0b0b0c'; ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy, 250, 0, TAU); ctx.strokeStyle = '#2a2b2e'; ctx.lineWidth = 3; ctx.stroke();
    for (let r = 0; r <= max; r += 250) {
      const a = ang(r), major = r % 1000 === 0;
      const [x1, y1] = polar(cx, cy, 246, a), [x2, y2] = polar(cx, cy, major ? 226 : 236, a);
      ctx.strokeStyle = r >= red ? '#ff2a1a' : '#8d9096'; ctx.lineWidth = major ? 3 : 1.5;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }
    // hybrid BOOST / CHARGE arcs on the lower ring
    const boost = clamp(s.eForce * Math.max(s.v, 1) / 1000 / (car.engine.electricKw || 1), 0, 1);
    const charge = clamp(s.regen || 0, 0, 1);
    ctx.lineWidth = 6; ctx.lineCap = 'butt';
    ctx.beginPath(); ctx.arc(cx, cy, 240, Math.PI / 2 + 0.12, Math.PI / 2 + 0.72); ctx.strokeStyle = '#1d2a1d'; ctx.stroke();
    if (boost > 0.01) { ctx.beginPath(); ctx.arc(cx, cy, 240, Math.PI / 2 + 0.12, Math.PI / 2 + 0.12 + 0.6 * boost); ctx.strokeStyle = '#7cff3a'; ctx.stroke(); }
    ctx.beginPath(); ctx.arc(cx, cy, 240, Math.PI / 2 - 0.72, Math.PI / 2 - 0.12); ctx.strokeStyle = '#1d2433'; ctx.stroke();
    if (charge > 0.01) {
      if (sf) {
        // SF90: segmented yellow-green charge bar
        const n = Math.round(10 * charge);
        for (let i = 0; i < n; i++) {
          const aE = Math.PI / 2 - 0.12 - i * 0.06;
          ctx.beginPath(); ctx.arc(cx, cy, 238, aE - 0.05, aE); ctx.lineWidth = 16; ctx.strokeStyle = '#c6ff3a'; ctx.stroke();
        }
        ctx.lineWidth = 6;
      } else { ctx.beginPath(); ctx.arc(cx, cy, 240, Math.PI / 2 - 0.12 - 0.6 * charge, Math.PI / 2 - 0.12); ctx.strokeStyle = '#4fc3f7'; ctx.stroke(); }
    }
    curvedLabel(ctx, 'BOOST', cx, cy, 259, Math.PI / 2 + 0.45, 15, '#c8c8c8');
    curvedLabel(ctx, 'CHARGE', cx, cy, 259, Math.PI / 2 - 0.45, 15, '#c8c8c8');

    if (sf) sf90Dial(ctx, s, cx, cy, ang, max, red);
    else yellowDial(ctx, s, cx, cy, ang, max, red);
    // speed + gear boxes over the right half
    roundRect(ctx, cx + 6, cy - 60, 214, 82, 6); ctx.fillStyle = 'rgba(32,33,36,.94)'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 1.5; ctx.stroke();
    if (sf) {
      text(ctx, String(Math.round(s.kmh)), cx + 150, cy - 18, 60, '#fff', 'right', 700, FONT);
      text(ctx, 'km/h', cx + 156, cy - 6, 17, '#fff', 'left', 600);
    } else {
      text(ctx, String(Math.round(s.kmh)), cx + 150, cy - 30, 54, '#fff', 'right', 700, FONT);
      text(ctx, 'km/h', cx + 156, cy - 22, 17, '#fff', 'left', 600);
      text(ctx, String(Math.round(s.kmh * 0.621371)), cx + 150, cy + 6, 22, '#fff', 'right', 600, FONT);
      text(ctx, 'mph', cx + 156, cy + 8, 15, '#ccc', 'left', 600);
    }
    roundRect(ctx, cx + 6, cy + 30, 200, 112, 6); ctx.fillStyle = 'rgba(32,33,36,.94)'; ctx.fill(); ctx.stroke();
    text(ctx, gearLabel(s), cx + 106, cy + 74, 76, s.cut ? '#ff3b30' : '#fff', 'center', 700, FONT);
    text(ctx, s.auto ? 'AUTO' : 'MANUAL', cx + 106, cy + 124, 18, '#fff', 'center', 600);
    if (s.lc) text(ctx, 'LAUNCH', cx - 60, cy, 18, '#ffd400', 'center', 700);

    if (sf) { navMap(ctx, s); tripPanel(ctx, s); mediaPanel(ctx, s, car); } else { lightMap(ctx, s); radioPanel(ctx, car); vehicleMenu(ctx, s); }
    // climate box
    ctx.beginPath(); ctx.moveTo(1262, 486); ctx.lineTo(1500, 486); ctx.lineTo(1496, 526); ctx.lineTo(1238, 526); ctx.closePath();
    ctx.fillStyle = 'rgba(30,31,34,.92)'; ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.2)'; ctx.lineWidth = 1.5; ctx.stroke();
    text(ctx, sf ? '🚗   23.5°C   ⤲' : '22.0°C   A   ❄ 1', 1370, 507, 20, '#fff', 'center', 600);
    statusBar(ctx, s, car);
  }

  function yellowDial(ctx, s, cx, cy, ang, max, red) {
    // yellow ring
    ctx.beginPath(); ctx.arc(cx, cy, 222, 0, TAU); ctx.arc(cx, cy, 118, 0, TAU, true);
    const yg = ctx.createRadialGradient(cx, cy - 40, 120, cx, cy, 222);
    yg.addColorStop(0, '#ffd21a'); yg.addColorStop(1, '#f2b705');
    ctx.fillStyle = yg; ctx.fill('evenodd');
    // red sector at the top end of the ring
    ctx.beginPath(); ctx.arc(cx, cy, 220, ang(red), ang(max)); ctx.arc(cx, cy, 206, ang(max), ang(red), true); ctx.closePath();
    ctx.fillStyle = 'rgba(220,20,10,.85)'; ctx.fill();
    for (let r = 0; r <= max; r += 500) {
      const a = ang(r), [x1, y1] = polar(cx, cy, 220, a), [x2, y2] = polar(cx, cy, r % 1000 ? 210 : 202, a);
      ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = r % 1000 ? 1.5 : 3; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }
    // numbers: heavy black with a soft light edge, 9-10 in red
    for (let k = 0; k <= max / 1000; k++) {
      const [x, y] = polar(cx, cy, 166, ang(k * 1000));
      ctx.font = `italic 800 56px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,240,180,.7)'; ctx.strokeText(String(k), x, y);
      ctx.fillStyle = k * 1000 >= red + 400 ? '#d0140c' : '#141414'; ctx.fillText(String(k), x, y);
    }
    // dark centre
    ctx.beginPath(); ctx.arc(cx, cy, 118, 0, TAU);
    const cg = ctx.createRadialGradient(cx, cy, 10, cx, cy, 118); cg.addColorStop(0, '#1b1c1f'); cg.addColorStop(1, '#060607');
    ctx.fillStyle = cg; ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy, 118, 0, TAU); ctx.strokeStyle = '#2b2c30'; ctx.lineWidth = 3; ctx.stroke();
    // needle (red line from the hub edge to the outer ring)
    const na = ang(s.rpm), [n1x, n1y] = polar(cx, cy, 70, na), [n2x, n2y] = polar(cx, cy, 238, na);
    ctx.strokeStyle = '#ff1a0a'; ctx.lineWidth = 5; ctx.shadowColor = '#ff1a0a'; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.moveTo(n1x, n1y); ctx.lineTo(n2x, n2y); ctx.stroke(); ctx.shadowBlur = 0;
  }

  function lightMap(ctx, s) {
    ctx.save();
    ctx.beginPath(); ctx.moveTo(176, 214); ctx.lineTo(430, 196); ctx.lineTo(440, 470); ctx.lineTo(190, 470); ctx.closePath();
    ctx.clip();
    ctx.fillStyle = '#c9ced4'; ctx.fillRect(170, 190, 280, 290);
    ctx.strokeStyle = '#e9ecef'; ctx.lineWidth = 9;
    ctx.beginPath(); ctx.moveTo(170, 300); ctx.lineTo(450, 250); ctx.moveTo(250, 480); ctx.lineTo(300, 190); ctx.stroke();
    // route scrolls with distance travelled
    const off = ((s.tripKm || 0) * 400) % 60;
    ctx.strokeStyle = '#3d4a5c'; ctx.lineWidth = 4; ctx.beginPath();
    for (let y = 190 - 60 + off; y < 480; y += 6) { const x = 360 + Math.sin(y / 38) * 30; y === 190 - 60 + off ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#e8261c'; ctx.beginPath(); ctx.moveTo(360, 420); ctx.lineTo(346, 448); ctx.lineTo(360, 440); ctx.lineTo(374, 448); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillRect(196, 204, 52, 18); text(ctx, Math.floor(s.odoKm % 100000).toString(), 222, 213, 13, '#222', 'center', 700);
  }

  function radioPanel(ctx, car) {
    roundRect(ctx, 452, 214, 150, 256, 8); ctx.fillStyle = 'rgba(14,15,17,.92)'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.lineWidth = 1.5; ctx.stroke();
    roundRect(ctx, 482, 236, 90, 78, 4); ctx.fillStyle = '#d9d9d9'; ctx.fill();
    roundRect(ctx, 488, 242, 78, 66, 3); ctx.fillStyle = '#2a2b2e'; ctx.fill();
    ctx.strokeStyle = '#ddd'; ctx.lineWidth = 3;
    for (const r of [10, 18]) { ctx.beginPath(); ctx.arc(527, 268, r, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke(); }
    ctx.beginPath(); ctx.arc(527, 270, 4, 0, TAU); ctx.fillStyle = '#ddd'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(527, 274); ctx.lineTo(519, 296); ctx.moveTo(527, 274); ctx.lineTo(535, 296); ctx.stroke();
    text(ctx, 'FM 98.8', 527, 350, 24, '#fff', 'center', 700);
    text(ctx, 'Now playing:', 527, 388, 15, '#cfcfcf', 'center', 600);
    text(ctx, 'V' + car.engine.cylinders + ' symphony', 527, 408, 15, '#cfcfcf', 'center', 600);
  }

  function vehicleMenu(ctx, s) {
    const items = ['Vehicle', 'Audio', 'Navigation', 'Phone', 'Settings'];
    items.forEach((it, i) => {
      const y = 214 + i * 36, sel = i === 0;
      ctx.beginPath(); ctx.moveTo(1050, y); ctx.lineTo(1262, y); ctx.lineTo(1256, y + 30); ctx.lineTo(1046, y + 30); ctx.closePath();
      ctx.fillStyle = sel ? 'rgba(90,10,10,.9)' : 'rgba(40,41,45,.9)'; ctx.fill();
      if (sel) { ctx.strokeStyle = '#e8261c'; ctx.lineWidth = 2; ctx.stroke(); }
      text(ctx, it, 1094, y + 16, 19, sel ? '#ff3b30' : '#fff', 'left', 600);
      ctx.fillStyle = sel ? '#ff3b30' : '#ddd'; ctx.beginPath(); ctx.arc(1072, y + 15, 6, 0, TAU); ctx.fill();
    });
    // vehicle page: performance data in place of the car render
    const rows = [['0-100 km/h', s.t100 != null ? fmt(s.t100, 2) + ' s' : '--'], ['0-200 km/h', s.t200 != null ? fmt(s.t200, 2) + ' s' : '--'],
      ['V MAX', Math.round(s.maxKmh) + ' km/h'], ['TRIP', fmt(s.tripKm, 1) + ' km'], ['BATTERY', Math.round(s.battery * 100) + ' %']];
    rows.forEach((r, i) => {
      text(ctx, r[0], 1290, 222 + i * 32, 15, '#9a9ca2', 'left', 700);
      text(ctx, r[1], 1500, 222 + i * 32, 19, '#fff', 'right', 600);
    });
  }

  function statusBar(ctx, s, car) {
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(80, 556, 1440, 38);
    text(ctx, '≡D', 196, 570, 20, '#fff', 'center', 700); text(ctx, 'AUTO', 196, 586, 11, '#fff', 'center', 700);
    text(ctx, '⛽', 232, 574, 18, '#fff', 'center', 600);
    for (let i = 0; i < 10; i++) {
      ctx.fillStyle = i / 10 < s.fuel ? '#ff9800' : '#333';
      ctx.fillRect(252 + i * 13, 566, 11, 12);
    }
    text(ctx, 'odo', 410, 574, 17, '#fff', 'left', 600);
    text(ctx, Math.floor(s.odoKm) + ' km', 455, 574, 17, '#fff', 'left', 600);
    text(ctx, '⛽ ' + Math.round(s.rangeKm) + ' km', 590, 574, 17, '#ff9800', 'left', 700);
    text(ctx, '⚡ ' + Math.round(s.battery * (car.dash.variant === 'sf90' ? 25 : 25)) + ' km', 690, 574, 17, '#7cff3a', 'left', 700);
    text(ctx, Math.round(s.ambient) + '°C', 790, 574, 17, '#fff', 'left', 600);
    ctx.beginPath(); ctx.moveTo(850, 556); ctx.lineTo(1010, 556); ctx.lineTo(1000, 592); ctx.lineTo(860, 592); ctx.closePath();
    ctx.fillStyle = '#121316'; ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.15)'; ctx.stroke();
    roundRect(ctx, 912, 564, 32, 22, 5); ctx.strokeStyle = s.running ? '#7cff3a' : '#ff3b30'; ctx.lineWidth = 3; ctx.stroke();
    text(ctx, clock(), 1040, 574, 18, '#fff', 'left', 600);
    text(ctx, 'ᛒ   ▮▯   ▂▄▆   SE', 1330, 574, 17, '#fff', 'left', 600);
    // telltales under the screen
    if (!s.running) {
      text(ctx, '⚙', 130, 520, 20, '#ff9800', 'center', 700);
      text(ctx, 'Ⓟ', 1500, 462, 22, '#ff2a1a', 'center', 700);
    }
  }

  function sf90Dial(ctx, s, cx, cy, ang, max, red) {
    // dark face, white numerals, red top-end arc, needle from the centre
    ctx.beginPath(); ctx.arc(cx, cy, 224, 0, TAU);
    const fg = ctx.createRadialGradient(cx, cy, 40, cx, cy, 224);
    fg.addColorStop(0, '#0b0c0e'); fg.addColorStop(0.6, '#15171a'); fg.addColorStop(1, '#202226');
    ctx.fillStyle = fg; ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy, 238, ang(red - 500), ang(max)); ctx.strokeStyle = '#e8160c'; ctx.lineWidth = 12; ctx.stroke();
    for (let r = 0; r <= max; r += 100) {
      const a = ang(r), major = r % 1000 === 0, half = r % 500 === 0;
      const [x1, y1] = polar(cx, cy, 224, a), [x2, y2] = polar(cx, cy, major ? 200 : half ? 208 : 214, a);
      ctx.strokeStyle = r >= red ? '#ff3b30' : '#e6e6e6'; ctx.lineWidth = major ? 3 : 1.3;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }
    for (let k = 0; k <= max / 1000; k++) {
      const [x, y] = polar(cx, cy, 166, ang(k * 1000));
      text(ctx, String(k), x, y, 50, k * 1000 >= red ? '#ff2a1a' : '#f4f4f4', 'center', 700, FONT);
    }
    for (const r of [118, 84]) { ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.lineWidth = 1.5; ctx.stroke(); }
    const na = ang(s.rpm), [n1x, n1y] = polar(cx, cy, 18, na), [n2x, n2y] = polar(cx, cy, 222, na);
    ctx.strokeStyle = '#ff1a0a'; ctx.lineWidth = 5; ctx.shadowColor = '#ff1a0a'; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.moveTo(n1x, n1y); ctx.lineTo(n2x, n2y); ctx.stroke(); ctx.shadowBlur = 0;
    ctx.beginPath(); ctx.arc(cx, cy, 9, 0, TAU); ctx.fillStyle = '#2a2b2e'; ctx.fill();
  }

  function navMap(ctx, s) {
    ctx.save();
    ctx.beginPath(); ctx.moveTo(120, 214); ctx.lineTo(300, 200); ctx.lineTo(310, 470); ctx.lineTo(132, 470); ctx.closePath(); ctx.clip();
    ctx.fillStyle = '#0c1a33'; ctx.fillRect(110, 190, 210, 290);
    const off = ((s.tripKm || 0) * 600) % 46;
    ctx.strokeStyle = '#2d4f86'; ctx.lineWidth = 2;
    for (let y = 150 + off; y < 480; y += 46) { ctx.beginPath(); ctx.moveTo(110, y); ctx.lineTo(320, y - 18); ctx.stroke(); }
    for (let x = 120; x < 320; x += 42) { ctx.beginPath(); ctx.moveTo(x, 190); ctx.lineTo(x + 10, 480); ctx.stroke(); }
    ctx.strokeStyle = '#4a77c4'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(205, 190); ctx.lineTo(214, 480); ctx.stroke();
    ctx.fillStyle = '#9fb8e0'; ctx.font = `600 10px ${FONT}`;
    ['MAIN ST', '7TH AVE', 'PARK RD', '5TH ST'].forEach((t, i) => ctx.fillText(t, 130 + (i % 2) * 90, 230 + i * 60 + off * 0.5));
    ctx.restore();
    ctx.fillStyle = '#e8261c'; ctx.beginPath(); ctx.moveTo(210, 418); ctx.lineTo(196, 446); ctx.lineTo(210, 438); ctx.lineTo(224, 446); ctx.closePath(); ctx.fill();
  }

  function tripPanel(ctx, s) {
    roundRect(ctx, 318, 214, 238, 256, 8); ctx.fillStyle = 'rgba(28,30,34,.92)'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.1)'; ctx.lineWidth = 1.5; ctx.stroke();
    const t = Math.floor((s.sessionT || 0) / 60);
    const rows = [['Trip', null], ['Maximum speed', Math.round(s.maxKmh) + ' km/h'], ['Average speed', Math.round(s.avgKmh || 0) + ' km/h'],
      ['Distance', fmt(s.tripKm, 1) + ' km'], ['Time', String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0') + ' hh:mm']];
    let y = 238;
    rows.forEach(([k, v]) => {
      text(ctx, k, 437, y, k === 'Trip' ? 20 : 18, '#fff', 'center', 600); y += 22;
      if (v) { text(ctx, v, 437, y, 18, '#e6e6e6', 'center', 500); y += 28; } else y += 6;
    });
  }

  function mediaPanel(ctx, s, car) {
    text(ctx, '♫', 1052, 214, 20, '#fff', 'center', 600);
    text(ctx, '⏚ USB', 1100, 248, 18, '#fff', 'left', 600);
    const sec = Math.floor((s.sessionT || 0) + 250) % 600;
    text(ctx, Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'), 1100, 272, 16, '#ddd', 'left', 600);
    text(ctx, 'Engine soundtrack', 1270, 334, 22, '#fff', 'center', 600);
    text(ctx, car.engine.layout.split(' ')[0] + ' — various revs', 1250, 360, 17, '#cfcfcf', 'center', 500);
    roundRect(ctx, 1408, 300, 84, 84, 4); ctx.fillStyle = '#e8e8e8'; ctx.fill();
    roundRect(ctx, 1414, 306, 72, 72, 3);
    const g = ctx.createRadialGradient(1450, 330, 4, 1450, 342, 50); g.addColorStop(0, '#666'); g.addColorStop(1, '#111');
    ctx.fillStyle = g; ctx.fill();
    text(ctx, '♪', 1450, 342, 34, '#ddd', 'center', 700);
    text(ctx, '2:41', 1060, 458, 17, '#ddd', 'left', 600);
    text(ctx, '⤨', 1140, 458, 20, '#ddd', 'center', 600);
  }

  function curvedLabel(ctx, str, cx, cy, r, mid, size, color) {
    ctx.save(); ctx.font = `600 ${size}px ${FONT}`; ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const step = (size * 0.72) / r, a0 = mid + ((str.length - 1) / 2) * step;
    for (let i = 0; i < str.length; i++) {
      const a = a0 - i * step, [x, y] = polar(cx, cy, r, a);
      ctx.save(); ctx.translate(x, y); ctx.rotate(a - Math.PI / 2); ctx.fillText(str[i], 0, 0); ctx.restore();
    }
    ctx.restore();
  }

  // ================================================================ FERRARI F8 TRIBUTO
  function drawF8(ctx, s, car) {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    // binnacle
    const bz = ctx.createLinearGradient(0, 40, 0, 600);
    bz.addColorStop(0, '#1e1e20'); bz.addColorStop(1, '#0a0a0b');
    roundRect(ctx, 60, 70, 1480, 510, 80); ctx.fillStyle = bz; ctx.fill();

    const cx = 800, cy = 310, R = 258, max = car.dash.dialMax, red = car.dash.redline;
    // 0 at 6 o'clock, clockwise, 10 at 3 o'clock (270 deg)
    const ang = (r) => Math.PI / 2 + (clamp(r, 0, max) / max) * Math.PI * 1.5;

    // F8: turbo screen left, speedo right. 812: speedo left, temperatures right.
    const v812 = car.dash.variant === '812';
    if (v812) { speedoScreen(ctx, s, 120, true); tempsScreen(ctx, s, car, 1060); telltales(ctx, s); }
    else { turboScreen(ctx, s, car, 120); speedoScreen(ctx, s, 1060, false); }

    // ---- central tach: deep bezel, mustard-yellow face
    ctx.beginPath(); ctx.arc(cx, cy, R + 30, 0, TAU);
    const bez = ctx.createLinearGradient(cx, cy - R, cx, cy + R);
    bez.addColorStop(0, '#2b2223'); bez.addColorStop(1, '#151213');
    ctx.fillStyle = bez; ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy, R + 4, 0, TAU); ctx.fillStyle = '#0c0c0c'; ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU);
    const face = ctx.createRadialGradient(cx - 30, cy - 50, 20, cx, cy, R);
    face.addColorStop(0, '#d8b630'); face.addColorStop(0.7, '#c49e1c'); face.addColorStop(1, '#8e7210');
    ctx.fillStyle = face; ctx.fill();
    // red zone on the outer edge
    ctx.beginPath(); ctx.arc(cx, cy, R - 10, ang(red), ang(max)); ctx.strokeStyle = '#d4140c'; ctx.lineWidth = 16; ctx.stroke();
    for (let r = 0; r <= max; r += 200) {
      const a = ang(r), major = r % 1000 === 0, half = r % 500 === 0 && !major;
      const len = major ? 26 : half ? 18 : 10, [x1, y1] = polar(cx, cy, R - 3, a), [x2, y2] = polar(cx, cy, R - 3 - len, a);
      ctx.strokeStyle = r >= red ? '#ffd0c8' : '#f4efe0'; ctx.lineWidth = major ? 4 : 2;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }
    for (let k = 0; k <= max / 1000; k++) {
      const [x, y] = polar(cx, cy, R - 66, ang(k * 1000));
      text(ctx, String(k), x, y, k === 10 ? 50 : 56, k * 1000 >= red ? '#e3160c' : '#f6f1e2', 'center', 700, FONT);
    }
    text(ctx, 'RPM', cx + 92, cy - 2, 17, '#f6f1e2', 'center', 700);
    text(ctx, 'x1000', cx + 92, cy + 18, 13, '#f6f1e2', 'center', 600);
    // inner thin ring with a gap where the gear window sits
    ctx.beginPath(); ctx.arc(cx, cy, R * 0.47, Math.PI * 0.55, Math.PI * 2.1); ctx.strokeStyle = 'rgba(250,236,170,.75)'; ctx.lineWidth = 3; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, R * 0.47 - 8, Math.PI * 0.55, Math.PI * 2.1); ctx.strokeStyle = 'rgba(250,236,170,.35)'; ctx.lineWidth = 1.5; ctx.stroke();
    // gear window (bottom right of the hub)
    roundRect(ctx, cx + 46, cy + 52, 92, 86, 10); ctx.fillStyle = '#3d0807'; ctx.fill();
    ctx.strokeStyle = '#a3140f'; ctx.lineWidth = 3; ctx.stroke();
    text(ctx, gearLabel(s), cx + 92, cy + 86, 50, s.cut ? '#fff' : '#ff3a2a', 'center', 700, FONT);
    text(ctx, s.auto ? 'auto' : 'man', cx + 92, cy + 122, 16, '#ff3a2a', 'center', 700);
    if (s.lc) text(ctx, 'LAUNCH', cx, cy + 165, 18, '#3d0807', 'center', 700);
    // needle
    const na = ang(s.rpm);
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(na);
    ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 5;
    ctx.beginPath(); ctx.moveTo(-34, -6); ctx.lineTo(R - 34, -2.5); ctx.lineTo(R - 22, 0); ctx.lineTo(R - 34, 2.5); ctx.lineTo(-34, 6); ctx.closePath();
    const ng = ctx.createLinearGradient(0, -6, 0, 6); ng.addColorStop(0, '#ff4a3a'); ng.addColorStop(1, '#b8100a');
    ctx.fillStyle = ng; ctx.fill(); ctx.restore();
    ctx.beginPath(); ctx.arc(cx, cy, 30, 0, TAU);
    const hub = ctx.createRadialGradient(cx - 8, cy - 8, 2, cx, cy, 30); hub.addColorStop(0, '#3a3a3a'); hub.addColorStop(1, '#050505');
    ctx.fillStyle = hub; ctx.fill();
    // glass glare
    ctx.beginPath(); ctx.ellipse(cx - 60, cy - 120, 170, 70, -0.5, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,.035)'; ctx.fill();
    // telltales
    if (!s.running && car.dash.variant !== '812') text(ctx, 'Ⓟ', 1040, 120, 22, '#ff2a1a', 'center', 700);
  }

  function turboScreen(ctx, s, car, x) {
    ctx.save(); ctx.translate(x - 120, 0);
    screenBox(ctx, 120, 150, 420, 330);
    const mode = car.dash.modes[s.modeIdx].name;
    manettinoTag(ctx, mode, 136, 164);
    text(ctx, '≡D', 300, 180, 20, '#cfd8dc', 'center', 700);
    text(ctx, Math.round(s.ambient) + '°', 520, 180, 20, '#fff', 'right', 600);
    const turbo = clamp(s.boost, 0, 1);
    analogGauge(ctx, 330, 320, 92, 0, 100, turbo * 100, [0, 100], 0, '%', '#fff');
    text(ctx, Math.round(turbo * 100), 330, 312, 34, '#fff', 'center', 700);
    text(ctx, '%', 330, 342, 16, '#bbb', 'center', 600);
    text(ctx, 'TURBO', 330, 388, 14, '#ddd', 'center', 700);
    text(ctx, 'EFFICIENCY', 330, 404, 14, '#ddd', 'center', 700);
    text(ctx, '● ○ ○', 330, 424, 12, '#aaa', 'center', 600);
    ctx.fillStyle = '#1a1a1a'; ctx.fillRect(132, 440, 396, 30);
    for (let i = 0; i < 10; i++) { ctx.fillStyle = i / 10 < s.fuel ? '#ff7a00' : '#3a3a3a'; ctx.fillRect(140 + i * 13, 448, 10, 14); }
    text(ctx, 'km/h', 380, 448, 13, '#bbb', 'center', 600);
    text(ctx, String(Math.round(s.avgKmh || 0)), 380, 462, 15, '#fff', 'center', 700);
    text(ctx, 'km tot', 500, 448, 13, '#bbb', 'right', 600);
    text(ctx, fmt(s.tripKm, 1), 520, 462, 16, '#fff', 'right', 700);

    ctx.restore();
  }

  function manettinoTag(ctx, mode, x, y) {
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 126, y); ctx.lineTo(x + 114, y + 30); ctx.lineTo(x, y + 30); ctx.closePath();
    ctx.fillStyle = '#e6e6e6'; ctx.fill();
    text(ctx, mode, x + 58, y + 16, 20, '#111', 'center', 700);
  }

  function speedoScreen(ctx, s, x, withClock) {
    ctx.save(); ctx.translate(x - 1060, 0);
    screenBox(ctx, 1060, 150, 420, 330);
    const scx = 1270, scy = 318, sr = 118, vmax = 360;
    const sAng = (v) => Math.PI * 0.75 + (clamp(v, 0, vmax) / vmax) * Math.PI * 1.5;
    ctx.beginPath(); ctx.arc(scx, scy, sr + 6, 0, TAU); ctx.fillStyle = '#060708'; ctx.fill();
    ctx.beginPath(); ctx.arc(scx, scy, sr + 6, Math.PI * 0.75, Math.PI * 2.25); ctx.strokeStyle = '#ddd'; ctx.lineWidth = 2; ctx.stroke();
    for (let v = 0; v <= vmax; v += 10) {
      const a = sAng(v), major = v % 30 === 0, [x1, y1] = polar(scx, scy, sr + 4, a), [x2, y2] = polar(scx, scy, major ? sr - 12 : sr - 4, a);
      ctx.strokeStyle = '#eee'; ctx.lineWidth = major ? 2.5 : 1; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      if (major && v > 0) { const [tx, ty] = polar(scx, scy, sr - 30, a); text(ctx, String(v), tx, ty, 15, '#fff', 'center', 700); }
    }
    text(ctx, 'km/h', scx, scy - 36, 15, '#fff', 'center', 600);
    text(ctx, String(Math.round(s.kmh)), scx, scy + 52, 22, '#fff', 'center', 700, FONT);
    const sa = sAng(s.kmh), [sx, sy] = polar(scx, scy, sr - 8, sa), [tx2, ty2] = polar(scx, scy, -16, sa);
    ctx.strokeStyle = '#f2f2f2'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(tx2, ty2); ctx.lineTo(sx, sy); ctx.stroke();
    ctx.beginPath(); ctx.arc(scx, scy, 9, 0, TAU); ctx.fillStyle = '#2a2a2a'; ctx.fill();
    ctx.strokeStyle = '#e8261c'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(1080, 452); ctx.lineTo(1460, 452); ctx.stroke();
    text(ctx, 'ODO ' + Math.floor(s.odoKm) + ' km', 1090, 466, 14, '#ccc', 'left', 600);
    text(ctx, clock(), 1460, 466, 14, '#ccc', 'right', 600);
    text(ctx, '0-100 ' + (s.t100 != null ? fmt(s.t100, 2) + 's' : '--'), 1090, 176, 15, '#ccc', 'left', 600);
    text(ctx, 'VMAX ' + Math.round(s.maxKmh), 1460, 176, 15, '#ccc', 'right', 600);

    if (withClock) { ctx.fillStyle = '#07080a'; ctx.fillRect(1074, 162, 220, 26); text(ctx, clock(), 1090, 176, 17, '#fff', 'left', 600); }
    ctx.restore();
  }

  // 812: oil + coolant temperature gauges, Manettino tag, fuel / avg speed / odo strip
  function tempsScreen(ctx, s, car, x) {
    ctx.save(); ctx.translate(x - 1060, 0);
    screenBox(ctx, 1060, 150, 420, 330);
    manettinoTag(ctx, car.dash.modes[s.modeIdx].name, 1076, 164);
    text(ctx, Math.round(s.ambient) + '°C', 1462, 180, 20, '#fff', 'right', 600);
    tempGauge(ctx, 1185, 318, 82, s.oilT, 'OIL');
    tempGauge(ctx, 1355, 318, 82, s.waterT, 'H2O');
    text(ctx, '● ○ ○', 1270, 418, 12, '#aaa', 'center', 600);
    ctx.fillStyle = '#e8e8e8'; ctx.fillRect(1072, 436, 396, 34);
    ctx.fillStyle = '#1a1a1a'; ctx.fillRect(1076, 440, 120, 26);
    for (let i = 0; i < 8; i++) { ctx.fillStyle = i / 8 < s.fuel ? '#ff7a00' : '#3a3a3a'; ctx.fillRect(1080 + i * 14, 444, 11, 12); }
    text(ctx, '0', 1082, 462, 10, '#bbb', 'center', 600); text(ctx, '1/2', 1136, 462, 10, '#bbb', 'center', 600);
    roundRect(ctx, 1222, 442, 26, 20, 4); ctx.strokeStyle = '#e8261c'; ctx.lineWidth = 2.5; ctx.stroke();
    text(ctx, 'km/h', 1330, 446, 12, '#333', 'center', 700);
    text(ctx, String(Math.round(s.avgKmh || 0)), 1330, 461, 15, '#111', 'center', 700);
    text(ctx, 'km', 1450, 446, 12, '#333', 'right', 700);
    text(ctx, String(Math.floor(s.odoKm)), 1460, 461, 15, '#111', 'right', 700);
    ctx.restore();
  }

  function tempGauge(ctx, cx, cy, r, v, label) {
    const lo = 40, hi = 150, a0 = Math.PI * 0.8, a1 = Math.PI * 2.2;
    const a = (t) => a0 + ((clamp(t, lo, hi) - lo) / (hi - lo)) * (a1 - a0);
    ctx.lineWidth = 9; ctx.lineCap = 'butt';
    ctx.beginPath(); ctx.arc(cx, cy, r, a0, a(70)); ctx.strokeStyle = '#2f6bff'; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, r, a(70), a(130)); ctx.strokeStyle = '#d9dde3'; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, r, a(130), a1); ctx.strokeStyle = '#ff2a1a'; ctx.stroke();
    const [mx, my] = polar(cx, cy, r - 14, a(v)), [mx2, my2] = polar(cx, cy, r + 8, a(v));
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(mx2, my2); ctx.stroke();
    text(ctx, String(Math.round(v)), cx, cy - 6, 34, '#fff', 'center', 700);
    text(ctx, '°C', cx, cy + 22, 15, '#ccc', 'center', 600);
    text(ctx, label === 'OIL' ? '🛢' : '🌡', cx, cy + 58, 20, '#ddd', 'center', 600);
  }

  // warning lights in the binnacle above the screens while the engine is off
  function telltales(ctx, s) {
    if (s.running) return;
    const L = [['⚙', '#ff9800', 470], ['⚠', '#ff2a1a', 510], ['Ⓟ', '#ff2a1a', 1090], ['▭', '#ff2a1a', 1130], ['🛢', '#ff2a1a', 1170]];
    L.forEach(([g, c, x]) => text(ctx, g, x, 120, 20, c, 'center', 700));
  }

  function screenBox(ctx, x, y, w, h) {
    roundRect(ctx, x, y, w, h, 14);
    const g = ctx.createLinearGradient(x, y, x, y + h); g.addColorStop(0, '#0d0f12'); g.addColorStop(1, '#050607');
    ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = '#26282c'; ctx.lineWidth = 2; ctx.stroke();
  }

  function analogGauge(ctx, cx, cy, r, lo, hi, v) {
    const a = (x) => Math.PI * 0.75 + ((clamp(x, lo, hi) - lo) / (hi - lo)) * Math.PI * 1.5;
    ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI * 0.75, Math.PI * 2.25); ctx.strokeStyle = '#2b2e33'; ctx.lineWidth = 10; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI * 0.75, a(v)); ctx.strokeStyle = '#e8e8e8'; ctx.lineWidth = 10; ctx.stroke();
    for (let x = lo; x <= hi; x += (hi - lo) / 10) {
      const [x1, y1] = polar(cx, cy, r + 9, a(x)), [x2, y2] = polar(cx, cy, r + 15, a(x));
      ctx.strokeStyle = '#999'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }
    const [lx, ly] = polar(cx, cy, r + 26, a(lo)), [hx, hy] = polar(cx, cy, r + 26, a(hi));
    text(ctx, String(lo), lx, ly, 13, '#aaa', 'center', 600); text(ctx, String(hi), hx, hy, 13, '#aaa', 'center', 600);
  }

  // ================================================================ LAMBORGHINI HURACÁN STO
  let hexPat = null;
  function hexPattern(ctx) {
    if (hexPat) return hexPat;
    const c = document.createElement('canvas'); c.width = 52; c.height = 90;
    const g = c.getContext('2d'); g.strokeStyle = 'rgba(255,255,255,.045)'; g.lineWidth = 1.2;
    const hex = (x, y) => { g.beginPath(); for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; g.lineTo(x + Math.cos(a) * 26, y + Math.sin(a) * 26); } g.closePath(); g.stroke(); };
    hex(26, 0); hex(0, 45); hex(52, 45); hex(26, 90);
    hexPat = ctx.createPattern(c, 'repeat');
    return hexPat;
  }

  function italicText(ctx, str, x, y, size, opts) {
    const o = opts || {};
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

  function drawSTO(ctx, s, car) {
    const mode = car.dash.modes[s.modeIdx], acc = mode.color;
    ctx.fillStyle = '#030405'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = hexPattern(ctx); ctx.fillRect(0, 0, W, H);
    const vg = ctx.createRadialGradient(800, 380, 80, 800, 380, 900);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.8)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);

    const max = car.dash.dialMax, red = car.dash.redline;
    const cx = 800, cy = 640, R = 560;
    const a0 = Math.PI + 0.42, a1 = TAU - 0.42;
    const ang = (r) => a0 + (clamp(r, 0, max) / max) * (a1 - a0);

    // dotted ruler on the outside
    for (let r = 0; r <= max; r += 100) {
      const a = ang(r), major = r % 1000 === 0, [x1, y1] = polar(cx, cy, R + 14, a), [x2, y2] = polar(cx, cy, R + (major ? 26 : 19), a);
      ctx.strokeStyle = r >= red ? 'rgba(255,60,40,.9)' : 'rgba(255,255,255,.75)'; ctx.lineWidth = major ? 3.5 : 1.6;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }
    // band (dot-mesh look) between R-50 and R
    ctx.beginPath(); ctx.arc(cx, cy, R, a0, a1); ctx.arc(cx, cy, R - 50, a1, a0, true); ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,.05)'; ctx.fill();
    ctx.save(); ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,.09)';
    for (let r = R - 48; r < R; r += 7) for (let a = a0; a < a1; a += 5 / r) { const [x, y] = polar(cx, cy, r, a); ctx.fillRect(x, y, 1.6, 1.6); }
    ctx.restore();
    // red zone
    ctx.beginPath(); ctx.arc(cx, cy, R, ang(red), a1); ctx.arc(cx, cy, R - 50, a1, ang(red), true); ctx.closePath();
    const rz = ctx.createLinearGradient(...polar(cx, cy, R, ang(red)), ...polar(cx, cy, R, a1));
    rz.addColorStop(0, 'rgba(255,40,20,.15)'); rz.addColorStop(1, 'rgba(255,40,20,.6)');
    ctx.fillStyle = rz; ctx.fill();
    // lit sector: yellow -> mode colour
    const ra = ang(s.rpm);
    if (s.rpm > 30) {
      ctx.beginPath(); ctx.arc(cx, cy, R - 2, a0, ra); ctx.arc(cx, cy, R - 48, ra, a0, true); ctx.closePath();
      const lg = ctx.createLinearGradient(...polar(cx, cy, R, a0), ...polar(cx, cy, R, a1));
      lg.addColorStop(0, '#ffd21a'); lg.addColorStop(0.45, s.rpm > red - 300 ? '#ff2a1a' : '#ff9a1a'); lg.addColorStop(1, '#ff2a1a');
      ctx.globalAlpha = 0.75; ctx.fillStyle = lg; ctx.fill(); ctx.globalAlpha = 1;
    }
    // rpm marker
    const [m1x, m1y] = polar(cx, cy, R + 2, ra), [m2x, m2y] = polar(cx, cy, R - 60, ra);
    ctx.strokeStyle = '#ff2a1a'; ctx.lineWidth = 5; ctx.shadowColor = '#ff2a1a'; ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.moveTo(m1x, m1y); ctx.lineTo(m2x, m2y); ctx.stroke(); ctx.shadowBlur = 0;
    // stepped inner outline (white) with notches at every number
    ctx.beginPath();
    for (let k = 0; k <= max / 1000; k++) {
      const aS = ang(k * 1000 - 380), aE = ang(k * 1000 + 380);
      ctx.arc(cx, cy, R - 56, Math.max(a0, aS), Math.min(a1, aE));
      if (k < max / 1000) ctx.arc(cx, cy, R - 64, Math.min(a1, aE) + 0.004, ang((k + 1) * 1000 - 380) - 0.004);
    }
    ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 2.5; ctx.stroke();
    // outlined numbers
    for (let k = 0; k <= max / 1000; k++) {
      const [x, y] = polar(cx, cy, R - 108, ang(k * 1000));
      const isRed = k * 1000 >= red;
      italicText(ctx, String(k), x, y, 52, { stroke: isRed ? '#ff3a24' : '#f2f2f2', lw: 3, fill: 'rgba(0,0,0,.6)', glow: isRed ? 8 : 0 });
    }
    text(ctx, 'RPM x 1000', 262, 464, 15, '#e6e6e6', 'left', 700);
    if (/TROFEO/.test(mode.name)) {
      const [ex, ey] = polar(cx, cy, R + 44, ang(8900));
      text(ctx, 'ESC', ex - 10, ey - 12, 18, '#ff3a24', 'center', 700);
      text(ctx, 'TROFEO', ex - 10, ey + 8, 18, '#ff3a24', 'center', 700);
    }

    // big outlined gear with previous / next gear
    const g = s.gear, n = car.trans.gears.length;
    const gs = !s.running ? 'P' : g === 0 ? 'N' : String(g);
    italicText(ctx, gs, cx, 345, 210, { stroke: acc, lw: 6, fill: '#050505', glow: 18, font: DIGI, weight: 900 });
    if (s.running) {
      const prev = g <= 1 ? 'N' : String(g - 1), next = g >= n ? '' : String(g === 0 ? 1 : g + 1);
      italicText(ctx, prev, cx - 120, 368, 42, { fill: 'rgba(200,200,200,.55)' });
      italicText(ctx, next, cx + 120, 368, 42, { fill: 'rgba(200,200,200,.55)' });
    }
    text(ctx, mode.name, cx - 240, 368, 34, acc, 'center', 700);
    if (!s.auto) text(ctx, 'M', cx + 220, 368, 28, acc, 'center', 700);
    if (s.lc) text(ctx, 'LAUNCH', cx, 160, 22, '#ffd21a', 'center', 700);
    if (!s.running) text(ctx, s.cranking ? 'START' : 'ENGINE OFF', cx, 160, 22, '#ff8a00', 'center', 700);

    // lap-timer style data (0-100 / 0-200 here) and V MAX / V MED
    text(ctx, '0-100', 600, 408, 14, '#ddd', 'center', 700);
    italicText(ctx, '1) ' + lapTime(s.t100), 500, 432, 22, { fill: '#fff', align: 'left' });
    text(ctx, '0-200  ' + (s.t200 != null ? fmt(s.t200, 2) + ' s' : '--'), 580, 458, 14, '#ddd', 'center', 700);
    text(ctx, 'SESSION', 960, 408, 14, '#ddd', 'center', 700);
    italicText(ctx, Math.round(s.maxKmh) + '', 960, 434, 26, { fill: '#fff', align: 'right' });
    text(ctx, 'km/h', 964, 438, 13, '#fff', 'left', 600); text(ctx, 'V MAX', 975, 458, 14, '#ddd', 'center', 700);
    italicText(ctx, Math.round(s.avgKmh || 0) + '', 1075, 434, 26, { fill: '#fff', align: 'right' });
    text(ctx, 'km/h', 1079, 438, 13, '#fff', 'left', 600); text(ctx, 'V MED', 1090, 458, 14, '#ddd', 'center', 700);

    // bottom outline strip with the g-meter notch
    ctx.strokeStyle = 'rgba(160,200,255,.75)'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(240, 478); ctx.lineTo(640, 478); ctx.lineTo(718, 572); ctx.lineTo(882, 572); ctx.lineTo(960, 478); ctx.lineTo(1360, 478); ctx.stroke();
    // g-meter
    const gl = Math.max(0, s.accel / 9.81), gb = Math.max(0, -s.accel / 9.81);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(770, 528); ctx.lineTo(830, 528); ctx.lineTo(852, 548); ctx.lineTo(748, 548); ctx.closePath(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(712, 538); ctx.lineTo(748, 538); ctx.moveTo(852, 538); ctx.lineTo(888, 538); ctx.stroke();
    roundRect(ctx, 782, 532, 36, 12, 3); ctx.fillStyle = '#fff'; ctx.fill();
    italicText(ctx, fmt(gl, 1), 800, 508, 16, { fill: '#fff' });
    italicText(ctx, fmt(gb, 1), 800, 564, 16, { fill: '#fff' });
    italicText(ctx, '0.0', 690, 530, 16, { fill: '#fff' });
    italicText(ctx, '0.0', 910, 530, 16, { fill: '#fff' });
    // odo / range / clock / temp
    italicText(ctx, String(Math.floor(s.odoKm)).padStart(6, '0'), 250, 512, 28, { fill: '#fff', align: 'left' });
    text(ctx, 'km', 390, 514, 18, '#fff', 'left', 700);
    text(ctx, '⛽', 440, 512, 22, '#fff', 'center', 600);
    italicText(ctx, String(Math.round(s.rangeKm)), 462, 512, 40, { fill: '#fff', align: 'left', weight: 800 });
    text(ctx, 'km', 580, 516, 22, '#fff', 'left', 700);
    italicText(ctx, clock(), 260, 558, 38, { fill: '#fff', align: 'left', weight: 800 });
    italicText(ctx, fmt(s.ambient, 1), 470, 560, 24, { fill: '#fff', align: 'left' });
    text(ctx, '°C', 545, 562, 16, '#fff', 'left', 700);
    // big speed
    italicText(ctx, String(Math.round(s.kmh)), 1230, 528, 84, { fill: '#fff', align: 'right', weight: 900 });
    text(ctx, 'km/h', 1240, 500, 26, '#fff', 'left', 700);

    // left: TPMS
    stoPanel(ctx, 30, 240, 210, 230);
    text(ctx, 'TPMS', 135, 262, 16, '#fff', 'center', 700);
    carTop(ctx, 135, 362, 0.9);
    const p = (s.tirePsi || [2.2, 2.2, 2.1, 2.1]).map((v) => v.toFixed(1)), tt = (s.tireT || [30, 29, 31, 29]).map((v) => Math.round(v));
    tpmsBox(ctx, 135, 300, `${p[0]} bar ${p[1]}`, `${tt[0]}  °C  ${tt[1]}`);
    tpmsBox(ctx, 135, 426, `${p[2]} bar ${p[3]}`, `${tt[2]}  °C  ${tt[3]}`);
    // stop-start disabled icon next to the arc start
    text(ctx, 'Ⓐ', 345, 438, 26, '#e8e8e8', 'center', 600);
    ctx.strokeStyle = '#e8e8e8'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(332, 452); ctx.lineTo(358, 424); ctx.stroke();

    // right: BTM (brake temperature monitor)
    stoPanel(ctx, 1380, 240, 200, 230);
    text(ctx, 'BTM', 1480, 262, 16, '#fff', 'center', 700);
    const bt = clamp(((s.brakeT || 40) - 40) / 600, 0, 1);
    const bcol = bt < 0.15 ? '#3ddc84' : bt < 0.5 ? '#c6ff00' : bt < 0.8 ? '#ff9800' : '#ff2a1a';
    ctx.beginPath(); ctx.arc(1480, 340, 46, 0, TAU); ctx.strokeStyle = bcol; ctx.lineWidth = 6; ctx.stroke();
    ctx.beginPath(); ctx.arc(1480, 340, 36, 0, TAU); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.beginPath(); ctx.arc(1480, 340, 14, 0, TAU); ctx.stroke();
    for (let i = 0; i < 6; i++) { const [x, y] = polar(1480, 340, 24, i * Math.PI / 3); ctx.beginPath(); ctx.arc(x, y, 3, 0, TAU); ctx.stroke(); }
    ctx.beginPath(); ctx.arc(1480, 340, 52, Math.PI * 0.75, Math.PI * 1.25); ctx.strokeStyle = '#fff'; ctx.lineWidth = 8; ctx.stroke();
    text(ctx, Math.round(s.brakeT || 40) + '°C', 1480, 404, 16, bcol, 'center', 700);
    ctx.beginPath(); ctx.arc(1480, 438, 18, 0, TAU); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(1480, 426); ctx.quadraticCurveTo(1476, 440, 1480, 448); ctx.quadraticCurveTo(1454, 440, 1480, 426);
    ctx.fillStyle = s.oilT > 80 ? '#3ddc84' : '#4fc3f7'; ctx.fill();
  }

  function lapTime(t) {
    if (t == null) return '00.00.00.00';
    const m = Math.floor(t / 60), sec = t - m * 60;
    return `00.${String(m).padStart(2, '0')}.${sec.toFixed(2).padStart(5, '0')}`;
  }

  function stoPanel(ctx, x, y, w, h) {
    roundRect(ctx, x, y, w, h, 10); ctx.fillStyle = 'rgba(12,14,18,.9)'; ctx.fill();
    ctx.strokeStyle = 'rgba(160,200,255,.25)'; ctx.lineWidth = 1.5; ctx.stroke();
  }

  function tpmsBox(ctx, x, y, l1, l2) {
    roundRect(ctx, x - 86, y - 24, 172, 50, 18); ctx.fillStyle = 'rgba(20,24,30,.92)'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.font = `italic 700 17px ${FONT}`; ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(l1, x, y - 9); ctx.fillText(l2, x, y + 12);
  }

  function carTop(ctx, x, y, k) {
    ctx.save(); ctx.translate(x, y); ctx.scale(k, k);
    ctx.beginPath(); ctx.moveTo(-28, -70); ctx.quadraticCurveTo(0, -84, 28, -70); ctx.lineTo(36, -20); ctx.lineTo(34, 60);
    ctx.quadraticCurveTo(0, 74, -34, 60); ctx.lineTo(-36, -20); ctx.closePath();
    const g = ctx.createLinearGradient(-36, 0, 36, 0); g.addColorStop(0, '#9aa0a8'); g.addColorStop(0.5, '#f2f4f6'); g.addColorStop(1, '#9aa0a8');
    ctx.fillStyle = g; ctx.fill();
    ctx.fillStyle = '#20242a'; ctx.beginPath(); ctx.moveTo(-22, -34); ctx.lineTo(22, -34); ctx.lineTo(18, -6); ctx.lineTo(-18, -6); ctx.closePath(); ctx.fill();
    ctx.fillRect(-16, 26, 32, 20);
    ctx.restore();
  }

  D.register('ferrari-296', drawHMI);
  D.register('ferrari-hmi', drawHMI);
  D.register('ferrari-f8', drawF8);
  D.register('ferrari-analog', drawF8);
  D.register('lambo-sto', drawSTO);
})();
