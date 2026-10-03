/*
 * Input: keyboard + any Gamepad API device (DualSense, DualShock 4,
 * PXN V9 / other wheels). Every action can be rebound; bindings are saved
 * per device id in localStorage.
 *
 * Binding formats:
 *   keyboard: KeyboardEvent.code strings
 *   gamepad : { type: 'button', index } | { type: 'axis', index, rest, full }
 */
(function () {
  const ACTIONS = [
    { id: 'throttle', label: 'Throttle / Gas', analog: true },
    { id: 'brake', label: 'Brake', analog: true },
    { id: 'shiftUp', label: 'Shift up (+)' },
    { id: 'shiftDown', label: 'Shift down (−)' },
    { id: 'engine', label: 'Engine start / stop' },
    { id: 'trans', label: 'Auto / Manual' },
    { id: 'mode', label: 'Drive mode' },
    { id: 'trip', label: 'Reset trip' },
    { id: 'option', label: 'Car option (fuel / limiter)' },
  ];

  const KEY_DEFAULTS = {
    throttle: ['ArrowUp', 'KeyW'], brake: ['ArrowDown', 'KeyS'],
    shiftUp: ['KeyE', 'ShiftRight'], shiftDown: ['KeyQ', 'ControlRight'],
    engine: ['KeyI', 'Enter'], trans: ['KeyM'], mode: ['KeyN'], trip: ['KeyT'], option: ['KeyO'],
  };

  // Standard mapping = DualSense / DualShock 4 / Xbox in Chrome, Edge, Firefox
  const PAD_DEFAULTS = {
    throttle: [{ type: 'button', index: 7 }], brake: [{ type: 'button', index: 6 }],
    shiftUp: [{ type: 'button', index: 5 }], shiftDown: [{ type: 'button', index: 4 }],
    engine: [{ type: 'button', index: 9 }], trans: [{ type: 'button', index: 3 }],
    mode: [{ type: 'button', index: 2 }], trip: [{ type: 'button', index: 8 }],
  };

  const LS_KEY = 'carsim.bindings.v1';

  function loadStore() {
    try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch (e) { return {}; }
  }
  function saveStore(s) { try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch (e) { /* ignore */ } }

  function padKind(id) {
    const s = id.toLowerCase();
    if (s.includes('dualsense') || s.includes('0ce6')) return 'DualSense';
    if (s.includes('dualshock') || s.includes('05c4') || s.includes('09cc') || s.includes('wireless controller')) return 'PS4 controller';
    if (s.includes('pxn') || s.includes('v9') || s.includes('11ff') || s.includes('wheel') || s.includes('racing')) return 'Steering wheel';
    if (s.includes('xbox') || s.includes('xinput')) return 'Xbox controller';
    return 'Controller';
  }

  class Input {
    constructor() {
      this.store = loadStore();
      this.keys = this.store.keys || JSON.parse(JSON.stringify(KEY_DEFAULTS));
      // actions added in newer versions get their default keys
      for (const k in KEY_DEFAULTS) if (!this.keys[k]) this.keys[k] = KEY_DEFAULTS[k].slice();
      this.pads = this.store.pads || {};
      this.down = new Set();
      this.tapped = new Set(); // keydowns since last poll, so quick taps are never missed
      this.kbThr = 0; this.kbBrk = 0;
      this.prev = {};
      this.capture = null;
      this.lastDevice = 'Keyboard';
      window.addEventListener('keydown', (e) => this.onKey(e, true));
      window.addEventListener('keyup', (e) => this.onKey(e, false));
      window.addEventListener('blur', () => this.down.clear());
    }

    save() { this.store.keys = this.keys; this.store.pads = this.pads; saveStore(this.store); }

    onKey(e, isDown) {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
      if (this.capture && isDown && this.capture.source === 'keyboard') {
        e.preventDefault();
        if (e.code !== 'Escape') {
          const list = this.keys[this.capture.action] || (this.keys[this.capture.action] = []);
          if (!list.includes(e.code)) list.push(e.code);
          this.save();
        }
        const cb = this.capture.done; this.capture = null; cb && cb();
        return;
      }
      const used = Object.values(this.keys).some((l) => l.includes(e.code));
      if (used) e.preventDefault();
      if (isDown) { if (!e.repeat) this.tapped.add(e.code); this.down.add(e.code); this.lastDevice = 'Keyboard'; } else this.down.delete(e.code);
    }

    gamepads() { return Array.from(navigator.getGamepads ? navigator.getGamepads() : []).filter(Boolean); }

    padBindings(gp) {
      if (!this.pads[gp.id]) this.pads[gp.id] = gp.mapping === 'standard' ? JSON.parse(JSON.stringify(PAD_DEFAULTS)) : {};
      return this.pads[gp.id];
    }

    resetPad(id) { delete this.pads[id]; this.save(); }
    resetKeys() { this.keys = JSON.parse(JSON.stringify(KEY_DEFAULTS)); this.save(); }
    clear(source, action, padId) {
      if (source === 'keyboard') this.keys[action] = [];
      else if (this.pads[padId]) this.pads[padId][action] = [];
      this.save();
    }

    static readBinding(gp, b) {
      if (b.type === 'button') {
        const btn = gp.buttons[b.index];
        return btn ? (typeof btn === 'object' ? btn.value || (btn.pressed ? 1 : 0) : btn) : 0;
      }
      const v = gp.axes[b.index];
      if (v == null) return 0;
      const span = b.full - b.rest;
      if (Math.abs(span) < 0.05) return 0;
      const x = (v - b.rest) / span;
      return x < 0.02 ? 0 : x > 1 ? 1 : x;
    }

    // Start listening for the next input to bind to `action`.
    startCapture(source, action, padId, done, progress) {
      if (source === 'keyboard') { this.capture = { source, action, done }; return; }
      const gp = this.gamepads().find((g) => g.id === padId);
      if (!gp) { done && done('Controller not connected'); return; }
      this.capture = {
        source, action, padId, done, progress, t0: performance.now(),
        baseAxes: gp.axes.slice(), baseBtn: gp.buttons.map((b) => b.value || (b.pressed ? 1 : 0)),
        axis: null, extreme: 0,
      };
    }

    cancelCapture() { this.capture = null; }

    pollCapture() {
      const c = this.capture;
      if (!c || c.source !== 'pad') return;
      const gp = this.gamepads().find((g) => g.id === c.padId);
      if (!gp) return;
      const finish = (binding, msg) => {
        const map = this.padBindings(gp);
        const list = map[c.action] || (map[c.action] = []);
        list.push(binding);
        this.save();
        this.capture = null;
        c.done && c.done(null, msg);
      };
      if (c.axis == null) {
        for (let i = 0; i < gp.buttons.length; i++) {
          const v = gp.buttons[i].value || (gp.buttons[i].pressed ? 1 : 0);
          if (v > 0.5 && c.baseBtn[i] < 0.5) { finish({ type: 'button', index: i }, 'Button ' + i); return; }
        }
        for (let i = 0; i < gp.axes.length; i++) {
          if (Math.abs(gp.axes[i] - c.baseAxes[i]) > 0.35) { c.axis = i; c.tAxis = performance.now(); c.extreme = gp.axes[i]; break; }
        }
        if (performance.now() - c.t0 > 15000) { this.capture = null; c.done && c.done('Timed out'); }
      } else {
        // keep sampling so we capture the fully pressed position
        const v = gp.axes[c.axis], rest = c.baseAxes[c.axis];
        if (Math.abs(v - rest) > Math.abs(c.extreme - rest)) c.extreme = v;
        c.progress && c.progress(`Axis ${c.axis}: press fully… ${Math.round(Math.abs(c.extreme - rest) * 50)}%`);
        if (performance.now() - c.tAxis > 1500) {
          finish({ type: 'axis', index: c.axis, rest, full: c.extreme }, `Axis ${c.axis} (${rest.toFixed(2)} → ${c.extreme.toFixed(2)})`);
        }
      }
    }

    // Returns analog values + edge-triggered digital actions for this frame.
    poll(dt) {
      this.pollCapture();
      const st = { throttle: 0, brake: 0, pressed: {}, device: this.lastDevice };
      const raw = {};
      for (const a of ACTIONS) raw[a.id] = 0;

      // keyboard (analog pedals ramp like a real foot)
      const tapped = {};
      for (const a of ACTIONS) {
        const keys = this.keys[a.id] || [];
        if (keys.some((k) => this.down.has(k))) raw[a.id] = 1;
        if (keys.some((k) => this.tapped.has(k))) tapped[a.id] = true;
      }
      this.tapped.clear();
      const ramp = (cur, tgt, up, dn) => (tgt > cur ? Math.min(tgt, cur + dt / up) : Math.max(tgt, cur - dt / dn));
      this.kbThr = ramp(this.kbThr, raw.throttle, 0.18, 0.1);
      this.kbBrk = ramp(this.kbBrk, raw.brake, 0.12, 0.08);
      raw.throttle = this.kbThr; raw.brake = this.kbBrk;

      if (!this.capture) {
        for (const gp of this.gamepads()) {
          const map = this.padBindings(gp);
          for (const a of ACTIONS) {
            for (const b of map[a.id] || []) {
              const v = Input.readBinding(gp, b);
              if (v > 0.08 && v > raw[a.id]) { raw[a.id] = v; this.lastDevice = padKind(gp.id); }
            }
          }
        }
      }

      st.throttle = raw.throttle; st.brake = raw.brake;
      for (const a of ACTIONS) {
        if (a.analog) continue;
        const on = raw[a.id] > 0.5;
        if ((on && !this.prev[a.id]) || tapped[a.id]) st.pressed[a.id] = true;
        this.prev[a.id] = on;
      }
      st.device = this.lastDevice;
      return st;
    }

    describePad(b) { return b.type === 'button' ? `Btn ${b.index}` : `Axis ${b.index}${b.full < b.rest ? '−' : '+'}`; }
  }

  Input.ACTIONS = ACTIONS;
  Input.padKind = padKind;
  window.Input = Input;
})();
