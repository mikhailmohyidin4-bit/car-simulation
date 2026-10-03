/*
 * Longitudinal vehicle simulation.
 *
 * Model: engine torque curve (+ turbo spool, + hybrid e-motor force) ->
 * dual-clutch gearbox (launch slip, torque cut on upshift, rev-matched
 * downshifts) -> traction limit -> aero drag + rolling resistance + brakes.
 *
 * calibrate() tunes three unknowns per car so the sim reproduces the
 * manufacturer figures:  traction coefficient -> 0-100 km/h,
 * drivetrain efficiency -> 0-200 km/h, aero CdA -> top speed.
 * Brake deceleration comes straight from the official 100-0 distance.
 */
(function () {
  const G = 9.81, RHO = 1.2, CRR = 0.012, RPM2RAD = Math.PI * 2 / 60;
  const DT = 1 / 240;

  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

  function interp(curve, rpm) {
    if (rpm <= curve[0][0]) return curve[0][1];
    for (let i = 1; i < curve.length; i++) {
      if (rpm <= curve[i][0]) {
        const [r0, t0] = curve[i - 1], [r1, t1] = curve[i];
        return t0 + (t1 - t0) * (rpm - r0) / (r1 - r0);
      }
    }
    return curve[curve.length - 1][1];
  }

  // Derive values that are not stored directly in the car data.
  function prepareCar(car) {
    if (car._prepared) return car;
    const e = car.engine, tr = car.trans;
    let maxP = 0;
    for (let r = e.idle; r <= e.limiter; r += 10) maxP = Math.max(maxP, interp(e.curve, r) * r * RPM2RAD);
    e.tScale = (e.powerKw * 1000) / maxP;
    const vmax = (car.perf.vmaxAero || car.perf.vmax) / 3.6;
    const overall = (tr.topGearRpm * RPM2RAD * car.tireRadius) / vmax;
    tr.finalDrive = overall / tr.gears[tr.gears.length - 1];
    tr.ratios = tr.gears.map((g) => g * tr.finalDrive);
    e.inertia = 0.22 + e.displacement * 0.03;
        car._prepared = true;
    return car;
  }

  class Vehicle {
    constructor(car, cal) {
      this.car = prepareCar(car);
      this.cal = cal || { mu: 1.2, eff: 0.85, CdA: 0.8, brakeDecel: 10 };
      this.silent = false;
      this.reset();
    }

    reset() {
      this.v = 0; this.dist = 0; this.rpm = 0; this.gear = 0;
      this.running = false; this.cranking = 0; this.flare = 0;
      this.shiftT = 0; this.shiftDir = 0; this.shiftCool = 0;
      this.boost = 0; this.cut = false; this.clutchSlip = true;
      this.auto = true; this.modeIdx = this.car.dash.defaultMode || 0; this.time = 0; this.accel = 0;
      this.launchCtl = false; this.wheelForce = 0; this.eForce = 0; this.thrS = 0; this.fDriveS = 0;
      this.timer = { armed: true, start: 0, d0: 0, running: false, t100: null, t200: null, last100: null, last200: null,
        tQm: null, vQm: null, lastQm: null, lastTrap: null, last100200: null, peakG: 0, lastPeakG: 0 };
      this.maxV = 0;
      this.oilT = 30; this.waterT = 30;
      this.battery = 0.72;
      this.events = [];
    }

    get modeAggr() {
      const m = this.car.dash.modes[this.modeIdx];
      return m ? m.aggr : 0.5;
    }

    emit(type, data) { if (!this.silent) this.events.push({ type, data }); }

    tq(rpm) {
      const e = this.car.engine;
      let t = interp(e.curve, rpm) * e.tScale;
      if (e.aspiration === 'TT') t *= 0.45 + 0.55 * this.boost;
      return t;
    }

    fric(rpm) { return this.car.engine.displacement * (4 + 0.0028 * rpm); }

    toggleEngine() {
      if (this.running || this.cranking > 0) {
        this.running = false; this.cranking = 0; this.gear = 0; this.clutchSlip = true;
        this.emit('stop');
      } else {
        this.cranking = 0.75 + Math.random() * 0.15; this.gear = 0;
        this.emit('crank');
      }
    }

    setAuto(a) { this.auto = a; this.emit('mode'); }
    cycleMode() { this.modeIdx = (this.modeIdx + 1) % this.car.dash.modes.length; this.emit('mode'); }

    shift(dir, fromUser) {
      if (!this.running) return false;
      if (fromUser && this.auto) this.auto = false; // pulling a paddle switches to manual, like the real cars
      const tr = this.car.trans, n = tr.ratios.length, e = this.car.engine;
      const ng = this.gear + dir;
      if (ng < 0 || ng > n) return false;
      dir = Math.sign(dir);
      if (dir < 0 && ng > 0) {
        const nr = (this.v / this.car.tireRadius) * tr.ratios[ng - 1] / RPM2RAD;
        if (nr > e.limiter - 50) { this.emit('deny'); return false; } // over-rev protection
      }
      this.gear = ng; this.shiftDir = dir;
      if (ng > 0 && this.gear !== 0) {
        this.shiftT = tr.shiftTime; this.shiftCool = 0.35;
      }
      if (ng === 0) this.clutchSlip = true;
      this.emit('shift', dir);
      return true;
    }

    step(dt, thrIn, brkIn) {
      const car = this.car, e = car.engine, tr = car.trans, r = car.tireRadius, m = car.massKg;
      const { mu, eff, CdA } = this.cal;
      const pedal = clamp(thrIn, 0, 1), brk = clamp(brkIn, 0, 1);
      // progressive pedal map (like the cars' drive-by-wire): 25% pedal ≈ 37% torque request
      let thr = 1 - Math.pow(1 - pedal, 1.6);
      this.time += dt;

      // --- ignition ---
      if (this.cranking > 0) {
        this.cranking -= dt;
        this.rpm = 200 + 40 * Math.sin(this.time * 25);
        if (this.cranking <= 0) {
          this.running = true; this.flare = 0.38; this.rpm = e.idle * 0.8; this.clutchSlip = true;
          this.emit('catch');
        }
      }
      if (!this.running) thr = 0;

      // --- launch control: brake + full throttle at standstill ---
      const lc = this.running && brk > 0.5 && thr > 0.6 && this.v < 0.5;
      if (lc && !this.launchCtl) this.emit('lc');
      this.launchCtl = lc;
      if (lc && this.gear === 0 && this.auto) this.gear = 1;

      // --- turbo spool ---
      if (e.aspiration === 'TT') {
        const spool = clamp((this.rpm - 1200) / 1800, 0.3, 1);
        const target = (lc ? 1 : Math.min(1, thr * 1.8)) * spool;
        const tc = target > this.boost ? 0.28 : 0.12;
        if (this.boost > 0.6 && target < 0.2 && thr < 0.1) this.emit('bov', this.boost);
        this.boost += (target - this.boost) * Math.min(1, dt / tc);
      }

      // --- timers ---
      if (this.shiftT > 0) this.shiftT -= dt;
      if (this.shiftCool > 0) this.shiftCool -= dt;
      const shifting = this.shiftT > 0;

      // --- rev limiter (fuel cut with hysteresis) ---
      if (this.rpm >= e.limiter) { if (!this.cut) this.emit('limiter'); this.cut = true; }
      else if (this.rpm < e.limiter - 180) this.cut = false;

      let thrReq = thr;
      if (this.flare > 0 && this.running) { this.flare -= dt; thrReq = Math.max(thrReq, 0.32); }
      // drive-by-wire + intake filling: torque follows the pedal over a few tens of ms
      this.thrS += (thrReq - this.thrS) * Math.min(1, dt / (thrReq > this.thrS ? 0.07 : 0.045));
      let thrEng = this.thrS;
      // upshift: torque dips smoothly while the clutches hand over instead of a hard cut
      if (shifting && this.shiftDir > 0) thrEng *= 1 - 0.7 * Math.sin(Math.PI * clamp(1 - this.shiftT / tr.shiftTime, 0, 1));
      if (this.cut || !this.running) thrEng = 0;

      const ratio = this.gear > 0 ? tr.ratios[this.gear - 1] : 0;
      const coupled = (this.v / r) * ratio / RPM2RAD;
      let fEng = 0;

      if (this.gear > 0 && this.running && !lc) {
        if (this.clutchSlip) {
          // pulling away: clutch slips while engine is held near the target rpm
          const target = lerp(e.idle, tr.launchRpm, Math.min(1, thr * 1.25));
          this.rpm += (target - this.rpm) * Math.min(1, dt * 10);
          const creep = thr < 0.02 && brk < 0.05 ? 45 : 0;
          fEng = (this.tq(this.rpm) * thrEng + creep) * ratio * eff / r;
          if (coupled >= this.rpm * 0.97 && coupled > e.idle * 0.9) this.clutchSlip = false;
        } else {
          const sync = shifting ? Math.min(1, dt / (tr.shiftTime * 0.5)) : 1;
          this.rpm += (coupled - this.rpm) * sync;
          const te = this.tq(this.rpm) * thrEng - this.fric(this.rpm) * (1 - thrEng);
          fEng = te * ratio * (te > 0 ? eff : 1) / r;
          if (coupled < e.idle * 0.85 && thr < 0.05) this.clutchSlip = true;
          if (coupled < e.idle * 0.55) this.clutchSlip = true;
        }
      } else if (this.running) {
        // neutral / launch control: free revving engine
        let thrFree = thrEng;
        if (lc) thrFree = this.rpm < tr.launchRpm ? 1 : 0;
        if (thrFree < 0.05 && this.rpm < e.idle * 1.15) {
          this.rpm += (e.idle - this.rpm) * Math.min(1, dt * 5); // idle speed control
        } else {
          const te = this.tq(this.rpm) * thrFree - this.fric(this.rpm) * (1 - thrFree) * 1.6;
          this.rpm += (te / e.inertia) * dt / RPM2RAD;
        }
        this.clutchSlip = true;
      } else if (this.cranking <= 0) {
        this.rpm = Math.max(0, this.rpm - (this.rpm * 2.5 + 400) * dt);
      }
      if (this.running && this.rpm < 300) this.rpm = 300;

      // --- hybrid e-motor force (fills torque gaps during shifts) ---
      let fE = 0;
      if (e.electricKw && this.running && !lc) {
        const pe = e.electricKw * 1000;
        fE = thr * Math.min(pe / Math.max(this.v, 1), pe / 10) * (this.cut ? 0 : 1);
        this.battery = clamp(this.battery - fE * this.v * dt / 3.6e7 + (brk * this.v * m * this.cal.brakeDecel * dt * 0.15) / 3.6e7, 0, 1);
      }
      this.eForce = fE;

      // --- traction limit ---
      // aero downforce adds grip with speed² (downforceKg quoted at 275 km/h)
      const df = car.downforceKg ? car.downforceKg * G * Math.pow(this.v / (275 / 3.6), 2) : 0;
      const fMax = mu * (m * G + Math.min(df, car.downforceKg ? car.downforceKg * G * 1.2 : 0));
      // driveline compliance (half-shafts, tyre carcass) smooths torque steps
      this.fDriveS += (fEng + fE - this.fDriveS) * Math.min(1, dt / 0.04);
      let fDrive = clamp(this.fDriveS, -fMax, fMax);
      // electronic top-speed limiter (e.g. BMW M5: 250 km/h, 305 with M Driver's Package)
      if (car.speedLimit && fDrive > 0) fDrive *= clamp((car.speedLimit + 0.5 - this.v * 3.6) / 1.5, 0, 1);
      this.wheelForce = fDrive;

      // --- brakes & resistances ---
      const fBrake = this.v > 0 ? brk * m * this.cal.brakeDecel : 0;
      const fDrag = 0.5 * RHO * CdA * this.v * this.v;
      const fRoll = this.v > 0.05 ? CRR * m * G : 0;
      const a = (fDrive - fBrake - fDrag - fRoll) / m;
      this.accel = a;
      this.v = Math.max(0, this.v + a * dt);
      if (this.v === 0 && fDrive <= 0) this.v = 0;
      this.dist += this.v * dt;
      if (this.v > this.maxV) this.maxV = this.v;

      // --- automatic gearbox ---
      if (this.auto && this.running && !lc) {
        const aggr = this.modeAggr, n = tr.ratios.length;
        if (this.gear === 0 && thr > 0.05) this.gear = 1;
        if (this.gear > 0 && !shifting && this.shiftCool <= 0 && !this.clutchSlip) {
          const tUp = Math.max(thr, aggr * 0.55);
          const upRpm = lerp(e.idle + 1500 + aggr * 1800, e.limiter - 120, Math.pow(tUp, 1.3));
          if (this.rpm >= upRpm && this.gear < n) this.shift(1, false);
          else if (this.gear > 1) {
            let downRpm = lerp(e.idle + 300 + aggr * 1500, e.limiter * 0.5, thr);
            if (brk > 0.1) downRpm = Math.max(downRpm, lerp(e.idle + 900, e.limiter * 0.55, aggr));
            const next = this.rpm * tr.ratios[this.gear - 2] / tr.ratios[this.gear - 1];
            if (this.rpm < downRpm && next < Math.min(e.limiter - 600, upRpm * 0.9)) {
              let to = this.gear - 1;
              // skip-shift gearboxes (Koenigsegg LST) jump straight to the best lower gear
              if (tr.skipShift) {
                while (to > 1 && this.rpm * tr.ratios[to - 2] / tr.ratios[this.gear - 1] < Math.min(e.limiter - 600, upRpm * 0.9) &&
                       this.rpm * tr.ratios[to - 1] / tr.ratios[this.gear - 1] < downRpm) to--;
              }
              this.shift(to - this.gear, false);
            }
          }
        }
        if (this.v < 0.3 && this.gear > 1) this.gear = 1;
      }

      // manual mode still drops gears when rolling to a stop (as the real DCTs do)
      if (!this.auto && this.running && this.gear > 1 && !shifting && coupled < e.idle * 1.05) {
        this.gear -= 1; this.shiftDir = -1; this.shiftT = tr.shiftTime; this.emit('shift', -1);
      }

      // --- performance timer (0-100 / 0-200) ---
      const T = this.timer;
      if (this.v < 0.2) { T.armed = true; T.running = false; T.t100 = null; T.t200 = null; T.tQm = null; T.vQm = null; T.peakG = 0; }
      else if (T.armed && !T.running) { T.running = true; T.armed = false; T.start = this.time - dt; T.d0 = this.dist; }
      if (T.running) {
        const el = this.time - T.start;
        T.peakG = Math.max(T.peakG, a / G); T.lastPeakG = T.peakG;
        if (T.t100 == null && this.v >= 100 / 3.6) { T.t100 = el; T.last100 = el; }
        if (T.t200 == null && this.v >= 200 / 3.6) { T.t200 = el; T.last200 = el; T.last100200 = el - T.t100; }
        if (T.tQm == null && this.dist - T.d0 >= 402.336) { T.tQm = el; T.vQm = this.v * 3.6; T.lastQm = el; T.lastTrap = T.vQm; }
        if (T.t200 != null && T.tQm != null) T.running = false;
        if (brk > 0.3) T.running = false;
      }

      // --- cosmetic temperatures ---
      if (this.running) {
        const load = thrEng * this.rpm / e.limiter;
        this.waterT += (Math.min(108, 90 + load * 18) - this.waterT) * dt * 0.02;
        this.oilT += (Math.min(125, 95 + load * 30) - this.oilT) * dt * 0.012;
      }
    }
  }

  // ---------------- calibration ----------------
  function topSpeedCdA(car, eff) {
    const e = car.engine, tr = car.trans, r = car.tireRadius;
    const vt = ((car.perf.vmaxAero || car.perf.vmax) / 3.6) * 1.004;
    let best = 0;
    for (const ratio of tr.ratios) {
      const rpm = (vt / r) * ratio / RPM2RAD;
      if (rpm > e.limiter - 30) continue;
      let f = interp(e.curve, rpm) * e.tScale * ratio * eff / r;
      if (e.electricKw) f += (e.electricKw * 1000) / vt;
      best = Math.max(best, f);
    }
    return (best - CRR * car.massKg * G) / (0.5 * RHO * vt * vt);
  }

  function runAccel(car, cal, maxT) {
    const veh = new Vehicle(car, cal);
    veh.silent = true; veh.running = true; veh.gear = 1; veh.boost = 1; veh.modeIdx = car.dash.modes.length - 1; veh.thrS = 1; // launch control holds the throttle open
    veh.rpm = car.trans.launchRpm;
    let t = 0, t100 = null;
    while (t < maxT) {
      veh.step(DT, 1, 0); t += DT;
      if (t100 == null && veh.v >= 100 / 3.6) t100 = t;
      if (veh.v >= 200 / 3.6) return { t100, t200: t };
    }
    return { t100: t100 == null ? 99 : t100, t200: 99 };
  }

  function runTopSpeed(car, cal) {
    const veh = new Vehicle(car, cal);
    veh.silent = true; veh.running = true; veh.gear = 1; veh.boost = 1; veh.rpm = car.trans.launchRpm;
    for (let t = 0; t < 150; t += DT) veh.step(DT, 1, 0);
    return veh.maxV * 3.6;
  }

  function runBrake(car, cal) {
    const veh = new Vehicle(car, cal);
    veh.silent = true; veh.running = true; veh.v = 100 / 3.6;
    let d = 0;
    while (veh.v > 0) { const d0 = veh.dist; veh.step(DT, 0, 1); d += veh.dist - d0; }
    return d;
  }

  const cache = {};
  function calibrate(car) {
    prepareCar(car);
    if (cache[car.id]) return cache[car.id];
    const p = car.perf;
    let eLo = 0.5, eHi = 1.25, best = null;
    const solveMu = (eff) => {
      const CdA = topSpeedCdA(car, eff);
      let lo = 0.3, hi = 3.0, res = null;
      for (let i = 0; i < 13; i++) {
        const mu = (lo + hi) / 2;
        res = { mu, eff, CdA, ...runAccel(car, { mu, eff, CdA, brakeDecel: 10 }, 20) };
        if (res.t100 > p.t100) lo = mu; else hi = mu;
      }
      return res;
    };
    for (let i = 0; i < 13; i++) {
      const eff = (eLo + eHi) / 2;
      best = solveMu(eff);
      if (best.t200 > p.t200) eLo = eff; else eHi = eff;
    }
    const cal = { mu: best.mu, eff: best.eff, CdA: best.CdA, brakeDecel: 10 };
    // brake decel so that the full 100-0 stop (incl. drag) matches the official distance
    let bLo = 5, bHi = 20;
    for (let i = 0; i < 20; i++) {
      cal.brakeDecel = (bLo + bHi) / 2;
      if (runBrake(car, cal) > p.brake100) bLo = cal.brakeDecel; else bHi = cal.brakeDecel;
    }
    cal.check = { t100: best.t100, t200: best.t200, vmax: runTopSpeed(car, cal), brake100: runBrake(car, cal) };
    cache[car.id] = cal;
    return cal;
  }

  window.Physics = { Vehicle, calibrate, prepareCar, DT, interp };
})();
