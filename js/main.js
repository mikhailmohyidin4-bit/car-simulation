(function () {
  const $ = (id) => document.getElementById(id);
  const { Vehicle, calibrate, DT } = window.Physics;
  const input = new Input();
  const audio = new EngineAudio();

  let car = null, veh = null, raf = 0, last = 0, acc = 0, blip = 0, odoBase = 0, tripBase = 0, saveT = 0;
  const ctx = $('dash').getContext('2d');

  // ---------------- garage ----------------
  let brandFilter = 'All';
  function renderGarage() {
    const brands = ['All', ...new Set(CARS.map((c) => c.brand))];
    $('brandTabs').innerHTML = '';
    brands.forEach((b) => {
      const el = document.createElement('button');
      el.textContent = b; el.className = b === brandFilter ? 'active' : '';
      el.onclick = () => { brandFilter = b; renderGarage(); };
      $('brandTabs').appendChild(el);
    });
    $('carGrid').innerHTML = '';
    CARS.filter((c) => brandFilter === 'All' || c.brand === brandFilter).forEach((c) => {
      const el = document.createElement('div');
      el.className = 'card'; el.style.setProperty('--c', c.color);
      const hp = Math.round((c.engine.powerKw + (c.engine.electricKw || 0)) * 1.3596);
      el.innerHTML = `<div class="brand">${c.brand.toUpperCase()}</div><div class="model">${c.model}</div>
        <div class="eng">${c.engine.displacement}L ${c.engine.layout} · ${c.drive}</div>
        <dl><dt>POWER</dt><dd>${hp} CV</dd><dt>TOP SPEED</dt><dd>${c.perf.vmax} km/h</dd>
        <dt>0-100</dt><dd>${c.perf.t100} s</dd><dt>0-200</dt><dd>${c.perf.t200} s</dd></dl>`;
      el.onclick = () => selectCar(c);
      $('carGrid').appendChild(el);
    });
  }

  function lsGet(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } }

  function selectCar(c) {
    // never block the UI on audio: some browsers keep resume() pending until a gesture
    audio.init().then(() => { if (car) audio.configure(car); }).catch((e) => console.warn('audio init failed', e));
    car = c;
    const cal = calibrate(car);
    veh = new Vehicle(car, cal);
    resetCosmetics();
    renderButtons();
    odoBase = lsGet('carsim.odo.' + car.id, 0);
    tripBase = lsGet('carsim.trip.' + car.id, 0);
    $('carTitle').textContent = `${car.brand.toUpperCase()} ${car.model.toUpperCase()}`;
    renderSpecs(cal);
    renderHint();
    $('garage').classList.remove('active'); $('drive').classList.add('active');
    resize();
    last = performance.now(); acc = 0;
    cancelAnimationFrame(raf); raf = requestAnimationFrame(loop);
  }

  function back() {
    persistOdo();
    cancelAnimationFrame(raf);
    if (veh) { veh.running = false; veh.rpm = 0; }
    audio.update({ rpm: 0, load: 0, boost: 0, speed: 0, on: false, crank: false, cut: false });
    audio.unloadSamples();
    car = null; veh = null;
    $('drive').classList.remove('active'); $('garage').classList.add('active');
  }

  function persistOdo() {
    if (!veh || !car) return;
    lsSet('carsim.odo.' + car.id, odoBase + veh.dist / 1000);
    lsSet('carsim.trip.' + car.id, tripBase + veh.dist / 1000);
  }

  function renderSpecs(cal) {
    const c = car, k = cal.check;
    const items = [
      ['ENGINE', `${c.engine.displacement}L ${c.engine.layout}`],
      ['POWER', `${Math.round(c.engine.powerKw * 1.3596)} CV @ ${c.engine.powerRpm}` + (c.engine.electricKw ? ` + ${Math.round(c.engine.electricKw * 1.3596)} CV e` : '')],
      ['TORQUE', `${c.engine.torqueNm} Nm @ ${c.engine.torqueRpm}`],
      ['GEARBOX', c.trans.name],
      ['REDLINE', `${c.engine.limiter} rpm`],
      ['MASS', `${c.dryKg} kg dry`],
      ['0-100 km/h', `${c.perf.t100} s<i>sim ${k.t100.toFixed(2)}</i>`],
      ['0-200 km/h', `${c.perf.t200} s<i>sim ${k.t200.toFixed(2)}</i>`],
      ['TOP SPEED', `${c.perf.vmax} km/h<i>sim ${k.vmax.toFixed(0)}</i>`],
      ['BRAKING 100-0', `${c.perf.brake100} m<i>sim ${k.brake100.toFixed(1)}</i>`],
      ['SOUND', '<em id="sndSrc">Synth</em>'],
    ];
    $('specs').innerHTML = items.map(([a, b]) => `<div class="spec"><b>${a}</b><span>${b}</span></div>`).join('');
  }

  function keyName(code) { return code.replace(/^Key/, '').replace(/^Arrow/, '').replace(/^Digit/, ''); }
  function renderHint() {
    const k = (a) => (input.keys[a] || []).map((c) => `<kbd>${keyName(c)}</kbd>`).join(' ') || '—';
    $('hint').innerHTML = `Keyboard: Engine ${k('engine')} · Gas ${k('throttle')} · Brake ${k('brake')} · Shift ${k('shiftDown')} / ${k('shiftUp')} ·
      Auto/Manual ${k('trans')} · Mode ${k('mode')} · Reset trip ${k('trip')}<br>
      DualSense / PS4: <kbd>R2</kbd> gas · <kbd>L2</kbd> brake · <kbd>R1</kbd>/<kbd>L1</kbd> shift · <kbd>Options</kbd> engine · <kbd>△</kbd> auto/manual · <kbd>□</kbd> mode.
      Wheels (PXN V9 etc.): open <b>Controls</b> and bind pedals + paddles.<br>
      Launch control: hold brake + full throttle, then release the brake. Pulling a paddle in Auto switches to Manual.`;
  }

  // ---------------- loop ----------------
  function loop(now) {
    raf = requestAnimationFrame(loop);
    let dt = (now - last) / 1000; last = now;
    if (dt > 0.1) dt = 0.1;
    const inp = input.poll(dt);
    const p = inp.pressed;
    if (p.engine) veh.toggleEngine();
    if (p.shiftUp) veh.shift(1, true);
    if (p.shiftDown) veh.shift(-1, true);
    if (p.trans) veh.setAuto(!veh.auto);
    if (p.mode) { veh.cycleMode(); toast('Mode: ' + car.dash.modes[veh.modeIdx].name); }
    if (p.trip) resetTrip();
    if (ui.thr != null) { inp.throttle = Math.max(inp.throttle, ui.thr); }

    acc += dt;
    while (acc >= DT) { veh.step(DT, inp.throttle, inp.brake); acc -= DT; }

    for (const ev of veh.events) {
      if (ev.type === 'shift') {
        if (ev.data > 0) audio.event('crack', 0.35 + 0.65 * veh.modeAggr * Math.min(1, inp.throttle + 0.2));
        else blip = 0.18;
      } else if (ev.type === 'bov') audio.event('bov', ev.data);
      else if (ev.type === 'catch') audio.event('crack', 0.25);
      else if (ev.type === 'deny') toast('Over-rev protection: downshift refused');
      else if (ev.type === 'crank' || ev.type === 'stop') audio.event(ev.type);
    }
    if (veh.events.length) renderButtons();
    veh.events.length = 0;

    blip = Math.max(0, blip - dt);
    const upCut = veh.shiftT > 0 && veh.shiftDir > 0;
    let load = veh.running && !veh.cut && !upCut ? inp.throttle : 0;
    if (veh.flare > 0) load = Math.max(load, 0.35);
    if (veh.launchCtl) load = veh.rpm < car.trans.launchRpm ? 1 : 0.1;
    if (blip > 0 && veh.running) load = Math.max(load, 0.7);
    audio.update({ rpm: veh.rpm, load, boost: veh.boost, speed: veh.v, on: veh.running, crank: veh.cranking > 0, cut: veh.cut });

    $('thrBar').style.width = (inp.throttle * 100).toFixed(0) + '%';
    $('brkBar').style.width = (inp.brake * 100).toFixed(0) + '%';
    $('devName').textContent = '🎮 ' + inp.device;

    updateCosmetics(dt, inp);
    const T = veh.timer;
    Dashboards.draw(ctx, {
      rpm: veh.rpm, kmh: veh.v * 3.6, v: veh.v, gear: veh.gear, auto: veh.auto, modeIdx: veh.modeIdx,
      running: veh.running, cranking: veh.cranking > 0, cut: veh.cut, lc: veh.launchCtl,
      tripKm: tripBase + veh.dist / 1000, odoKm: odoBase + veh.dist / 1000,
      t100: T.t100 != null ? T.t100 : T.last100, t200: T.t200 != null ? T.t200 : T.last200,
      maxKmh: veh.maxV * 3.6, oilT: veh.oilT, waterT: veh.waterT, accel: veh.accel,
      battery: veh.battery, eForce: veh.eForce, wheelForce: veh.wheelForce, boost: veh.boost,
      fuel: cos.fuel, rangeKm: cos.fuel * 520, avgKmh: cos.moveT > 1 ? (veh.dist / cos.moveT) * 3.6 : 0,
      brakeT: cos.brakeT, tireT: cos.tireT, tirePsi: cos.tireT.map((t, i) => (i < 2 ? 2.2 : 2.1) + (t - 30) * 0.006),
      ambient: cos.ambient, regen: cos.regen, sessionT: cos.runT,
    }, car);

    saveT += dt;
    if (saveT > 5) { saveT = 0; persistOdo(); }
  }

  // cosmetic values for the clusters: fuel, brake / tyre temperatures, average speed
  const cos = { fuel: 0.72, brakeT: 40, tireT: [30, 29, 31, 29], moveT: 0, runT: 0, ambient: 31.5, regen: 0 };
  function resetCosmetics() { Object.assign(cos, { fuel: 0.72, brakeT: 40, tireT: [30, 29, 31, 29], moveT: 0, runT: 0, regen: 0 }); }
  function updateCosmetics(dt, inp) {
    const m = car.massKg, p = Math.max(0, veh.wheelForce * veh.v);
    cos.fuel = Math.max(0, cos.fuel - (p * dt) / 8e8 - (veh.running ? dt * 2e-6 : 0));
    const brakeHeat = inp.brake * m * veh.cal.brakeDecel * veh.v * dt;
    cos.brakeT += brakeHeat / 4000 - (cos.brakeT - cos.ambient) * dt * 0.015 * (1 + veh.v / 25);
    const tgt = 30 + Math.abs(veh.accel) * 3 + veh.v * 0.12;
    cos.tireT = cos.tireT.map((t, i) => t + (tgt + (i % 2 ? -1 : 0) - t) * dt * 0.02);
    if (veh.v > 0.5) cos.moveT += dt;
    if (veh.running) cos.runT += dt;
    cos.regen += ((inp.brake > 0.05 && veh.v > 1 ? inp.brake : 0) - cos.regen) * Math.min(1, dt * 8);
  }

  function resetTrip() {
    tripBase = -veh.dist / 1000;
    lsSet('carsim.trip.' + car.id, 0);
    veh.maxV = 0; veh.timer.last100 = null; veh.timer.last200 = null;
    toast('Trip reset');
  }

  function renderButtons() {
    if (!veh) return;
    const on = veh.running || veh.cranking > 0;
    $('engineBtn').textContent = on ? '⏻ STOP ENGINE' : '⏻ START ENGINE';
    $('engineBtn').classList.toggle('on', on);
    $('transBtn').textContent = veh.auto ? 'AUTO' : 'MANUAL';
    $('modeBtn').textContent = 'MODE: ' + car.dash.modes[veh.modeIdx].name;
  }

  function resize() {
    const c = $('dash'), dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = c.clientWidth || 1200;
    c.width = Math.round(w * dpr); c.height = Math.round(w * dpr * Dashboards.H / Dashboards.W);
    const s = c.width / Dashboards.W;
    ctx.setTransform(s, 0, 0, s, 0, 0);
  }
  window.addEventListener('resize', () => { if (car) resize(); });

  let toastT = 0;
  function toast(msg) {
    const t = $('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 1800);
  }

  audio.onSamples = (n) => {
    const el = $('sndSrc');
    if (el) el.textContent = n ? `Recorded (${n} loop${n > 1 ? 's' : ''})` : 'Synth';
    if (n) toast(`🔊 Using your recorded sounds (${n} loop${n > 1 ? 's' : ''})`);
  };

  // on-screen buttons (useful on touch / mouse)
  const ui = { thr: null };
  $('backBtn').onclick = back;
  $('engineBtn').onclick = () => { veh.toggleEngine(); renderButtons(); };
  $('transBtn').onclick = () => { veh.setAuto(!veh.auto); renderButtons(); };
  $('modeBtn').onclick = () => { veh.cycleMode(); renderButtons(); };
  $('upBtn').onclick = () => { veh.shift(1, true); renderButtons(); };
  $('downBtn').onclick = () => { veh.shift(-1, true); renderButtons(); };
  $('tripBtn').onclick = resetTrip;
  $('vol').oninput = (e) => { audio.volume = parseFloat(e.target.value); };
  document.querySelectorAll('button').forEach((b) => b.addEventListener('keydown', (e) => { if (e.code === 'Space' || e.code === 'Enter') e.preventDefault(); }));

  window.addEventListener('gamepadconnected', (e) => { toast(`${Input.padKind(e.gamepad.id)} connected`); refreshDevices(); });
  window.addEventListener('gamepaddisconnected', (e) => { toast(`${Input.padKind(e.gamepad.id)} disconnected`); refreshDevices(); });
  window.addEventListener('beforeunload', persistOdo);

  // ---------------- controls modal ----------------
  let rawTimer = 0;
  function openControls() {
    $('controls').classList.add('open');
    refreshDevices();
    clearInterval(rawTimer);
    rawTimer = setInterval(showRaw, 100);
  }
  function closeControls() {
    input.cancelCapture();
    $('controls').classList.remove('open');
    clearInterval(rawTimer);
    renderHint();
  }
  $('controlsBtn').onclick = openControls;
  $('closeControls').onclick = closeControls;
  $('controls').onclick = (e) => { if (e.target === $('controls')) closeControls(); };

  function refreshDevices() {
    const sel = $('devSelect'), cur = sel.value;
    sel.innerHTML = '<option value="keyboard">Keyboard</option>';
    input.gamepads().forEach((g) => {
      const o = document.createElement('option'); o.value = g.id;
      o.textContent = `${Input.padKind(g.id)} — ${g.id.slice(0, 60)}`; sel.appendChild(o);
    });
    if ([...sel.options].some((o) => o.value === cur)) sel.value = cur;
    renderBindRows();
  }
  $('devSelect').onchange = renderBindRows;
  $('resetBinds').onclick = () => {
    const d = $('devSelect').value;
    if (d === 'keyboard') input.resetKeys(); else input.resetPad(d);
    renderBindRows();
  };

  function renderBindRows() {
    const dev = $('devSelect').value;
    const isKb = dev === 'keyboard';
    const gp = isKb ? null : input.gamepads().find((g) => g.id === dev);
    $('devNote').innerHTML = isKb
      ? 'Click <b>Bind</b> then press a key. Esc cancels. Multiple keys per action are allowed.'
      : gp && gp.mapping === 'standard'
        ? 'Standard layout detected (DualSense / DualShock 4 / Xbox). Defaults are pre-assigned — rebind anything you like.'
        : 'Non-standard device (e.g. PXN V9 wheel). Click <b>Bind</b>, then press the button or push the pedal <b>all the way</b> and hold for ~1.5 s. ' +
          'If your pedals show as one combined axis, bind throttle and brake to the same axis in opposite directions — it works.';
    const rows = Input.ACTIONS.map((a) => {
      let cur;
      if (isKb) cur = (input.keys[a.id] || []).map(keyName).join(', ');
      else if (gp) cur = ((input.padBindings(gp)[a.id]) || []).map((b) => input.describePad(b)).join(', ');
      return `<tr><td>${a.label}</td><td class="cur">${cur || '—'}</td>
        <td class="btns"><button data-bind="${a.id}">Bind</button> <button class="ghost" data-clear="${a.id}">Clear</button></td></tr>`;
    });
    $('bindRows').innerHTML = rows.join('');
    $('bindRows').querySelectorAll('[data-bind]').forEach((b) => (b.onclick = () => startBind(b.dataset.bind)));
    $('bindRows').querySelectorAll('[data-clear]').forEach((b) => (b.onclick = () => { input.clear(isKb ? 'keyboard' : 'pad', b.dataset.clear, dev); renderBindRows(); }));
  }

  function startBind(action) {
    const dev = $('devSelect').value, isKb = dev === 'keyboard';
    const label = Input.ACTIONS.find((a) => a.id === action).label;
    $('captureMsg').textContent = isKb ? `Press a key for “${label}”…` : `Press the button / pedal for “${label}”…`;
    input.startCapture(isKb ? 'keyboard' : 'pad', action, dev, (err, msg) => {
      $('captureMsg').textContent = err ? '⚠ ' + err : `✓ ${label} → ${msg || 'bound'}`;
      renderBindRows();
    }, (m) => { $('captureMsg').textContent = m; });
  }

  function showRaw() {
    const pads = input.gamepads();
    if (!pads.length) { $('raw').textContent = 'No controller detected. Plug it in and press any button (browsers hide controllers until you press something).'; return; }
    if (!car) input.pollCapture();
    $('raw').textContent = pads.map((g) => {
      const ax = g.axes.map((v, i) => `A${i}:${v.toFixed(2)}`).join('  ');
      const bt = g.buttons.map((b, i) => ((b.value || b.pressed) ? `B${i}:${(b.value || 1).toFixed(2)}` : null)).filter(Boolean).join('  ');
      return `${g.id}\nmapping: ${g.mapping || 'non-standard'}\n${ax}\npressed: ${bt || '-'}`;
    }).join('\n\n');
  }

  renderGarage();
  renderButtons();
})();
