/*
 * Procedural engine sound.
 *
 * Every cylinder firing is generated as an individual exhaust pulse at the
 * exact crank angle (4-stroke: cylinders/2 firings per crank revolution), so
 * pitch and harmonics follow the real engine: a V10 at 8000 rpm fires at
 * 667 Hz, a V12 at 8500 rpm at 850 Hz, etc. Pulses excite a bank of exhaust
 * resonators tuned per car, then go through load-dependent filtering and
 * soft saturation. Overrun pops, shift cracks, starter motor, turbo whistle,
 * blow-off and hybrid e-motor whine are layered on top.
 *
 * The synth class runs inside an AudioWorklet (falls back to a
 * ScriptProcessor on old browsers).
 */
(function () {
  function synthSource() {
    class Biquad {
      constructor(sr, f, q) {
        const w = 2 * Math.PI * Math.min(f, sr * 0.45) / sr, al = Math.sin(w) / (2 * q), a0 = 1 + al;
        this.b0 = al / a0; this.b2 = -al / a0; this.a1 = (-2 * Math.cos(w)) / a0; this.a2 = (1 - al) / a0;
        this.x1 = this.x2 = this.y1 = this.y2 = 0;
      }
      run(x) {
        const y = this.b0 * x + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
        this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
        return y;
      }
    }

    class EngineSynth {
      constructor(sr) {
        this.sr = sr; this.cfg = null;
        this.rpm = 0; this.rpmT = 0; this.load = 0; this.loadT = 0; this.boost = 0; this.speed = 0;
        this.on = false; this.crank = false; this.cut = false; this.vol = 0.8;
        this.ph = 0; this.cyl = 0; this.pulseN = 1e9; this.pulseLen = 1; this.pulseAmp = 0;
        this.nEnv = 0; this.nDec = Math.exp(-1 / (sr * 0.0025));
        this.lp = 0; this.lp2 = 0; this.hp = 0; this.hpx = 0;
        this.overrun = 0; this.prevLoad = 0;
        this.popEnv = 0; this.popDec = Math.exp(-1 / (sr * 0.018)); this.popAmp = 0;
        this.bov = 0; this.bovDec = Math.exp(-1 / (sr * 0.25));
        this.wph = 0; this.eph = 0; this.sph = 0;
        this.starter = 0; this.master = 0;
        this.eng = 1; this.engT = 1; this.fx = 1; this.starterOk = true; // eng = synth engine note level
        this.sm = 1 - Math.exp(-1 / (sr * 0.02));
        this.smL = 1 - Math.exp(-1 / (sr * 0.045));
      }

      configure(c) {
        this.cfg = c;
        const sr = this.sr;
        this.res = c.res.map(([f, q, g]) => ({ bq: new Biquad(sr, f, q), g }));
        this.popRes = [new Biquad(sr, 95, 1.5), new Biquad(sr, 1900, 1.2)];
        this.intake = new Biquad(sr, 900, 0.8);
        this.bovF = new Biquad(sr, 2600, 1.5);
        this.mech = new Biquad(sr, 4200, 2);
      }

      msg(d) {
        if (d.type === 'config') this.configure(d.cfg);
        else if (d.type === 'state') {
          this.rpmT = d.rpm; this.loadT = d.load; this.boost = d.boost; this.speed = d.speed;
          this.on = d.on; this.crank = d.crank; this.cut = d.cut; this.vol = d.vol;
          this.engT = d.eng != null ? d.eng : 1; this.fx = d.fx != null ? d.fx : 1; this.starterOk = d.starter !== false;
        } else if (d.type === 'event') {
          if (d.name === 'crack') this.pop(d.amp);
          if (d.name === 'bov') this.bov = Math.max(this.bov, d.amp);
        }
      }

      pop(a) { this.popEnv = 1; this.popAmp = Math.max(this.popAmp * this.popEnv, a); }

      fire() {
        const c = this.cfg, idx = this.cyl;
        this.cyl = (idx + 1) % c.cyl;
        const rn = Math.min(1, this.rpm / c.limiter);
        const jitter = 0.35 * (1 - rn) + 0.05;
        let amp = (0.28 + 0.72 * this.load) * (c.bank[idx] || 1) * (1 + (Math.random() - 0.5) * jitter);
        amp *= 0.55 + 0.45 * rn;
        if (this.cut || (!this.on && !this.crank)) amp *= 0.08;
        if (this.crank) amp *= 0.35;
        const fireRate = Math.max(1, this.rpm / 60 * c.cyl / 2);
        this.pulseAmp = amp;
        this.pulseLen = Math.max(this.sr * 0.0007, Math.min(this.sr * 0.005, 0.42 * this.sr / fireRate));
        this.pulseN = 0;
        this.nEnv = amp * c.noise;
        // overrun crackle / limiter bangs
        if (this.on && this.load < 0.06 && this.rpm > 2600 && this.overrun > 0 && Math.random() < c.pops) {
          this.pop(0.25 + Math.random() * 0.6);
        }
        if (this.cut && Math.random() < c.pops * 1.5) this.pop(0.3 + Math.random() * 0.5);
      }

      render(out) {
        const n = out.length;
        if (!this.cfg) { out.fill(0); return; }
        const c = this.cfg, sr = this.sr;
        // per-block coefficients
        const cut = c.lpBase + this.rpm * c.lpRpm + this.load * c.lpLoad;
        const k1 = 1 - Math.exp(-2 * Math.PI * Math.min(cut, 12000) / sr);
        const k2 = 1 - Math.exp(-2 * Math.PI * Math.min(cut * 2.2, 16000) / sr);
        const hpk = 1 - Math.exp(-2 * Math.PI * 28 / sr);
        const drv = c.drive, dn = Math.tanh(drv);
        const masterT = (this.on || this.crank || this.rpm > 50) ? this.vol : 0;
        if (this.loadT < 0.06 && this.prevLoad > 0.45) this.overrun = 1.6;
        this.prevLoad = this.loadT;
        const dtBlock = n / sr;
        this.overrun = Math.max(0, this.overrun - dtBlock);
        if (this.loadT > 0.2) this.overrun = 0;

        for (let i = 0; i < n; i++) {
          this.rpm += (this.rpmT - this.rpm) * this.sm;
          this.load += (this.loadT - this.load) * this.smL;
          this.master += (masterT - this.master) * 0.0005;
          this.eng += (this.engT - this.eng) * 0.0005;

          let s = 0;
          if (this.rpm > 30) {
            this.ph += (this.rpm / 60) * (c.cyl / 2) / sr;
            if (this.ph >= 1) { this.ph -= 1; this.fire(); }
          }
          let exc = 0;
          if (this.pulseN < this.pulseLen) {
            exc = this.pulseAmp * Math.sin(Math.PI * this.pulseN / this.pulseLen);
            this.pulseN++;
          }
          const nz = Math.random() * 2 - 1;
          exc += nz * this.nEnv;
          this.nEnv *= this.nDec;

          s = exc * c.direct;
          for (let j = 0; j < this.res.length; j++) s += this.res[j].bq.run(exc) * this.res[j].g;

          // intake roar
          const rn = this.rpm / c.limiter;
          s += this.intake.run(nz) * this.load * rn * 0.25;
          // mechanical
          s += this.mech.run(nz) * rn * 0.04;

          s = Math.tanh(s * drv) / dn;
          this.lp += (s - this.lp) * k1;
          this.lp2 += (this.lp - this.lp2) * k2;
          let y = this.lp2 * this.eng;

          // pops / cracks
          if (this.popEnv > 0.001) {
            const pe = this.popEnv * this.popAmp * c.crackGain * this.fx;
            y += Math.tanh((this.popRes[0].run(nz * pe) * 2.5 + this.popRes[1].run(nz * pe) * 1.2) * 1.5);
            this.popEnv *= this.popDec;
          }

          // turbo whistle + blow-off
          if (c.turbo) {
            const wf = 1800 + 5200 * this.boost * Math.min(1, this.rpm / 6500);
            this.wph += wf / sr; if (this.wph > 1) this.wph -= 1;
            y += Math.sin(2 * Math.PI * this.wph) * c.turbo * this.boost * (0.3 + 0.7 * this.load) * this.fx;
            if (this.bov > 0.001) { y += this.bovF.run(nz) * this.bov * 0.35; this.bov *= this.bovDec; }
          }

          // hybrid e-motor whine
          if (c.eWhine && this.speed > 0.3) {
            this.eph += (this.speed * 95) / sr; if (this.eph > 1) this.eph -= 1;
            y += (Math.sin(2 * Math.PI * this.eph) + 0.4 * Math.sin(4 * Math.PI * this.eph)) * c.eWhine * (0.3 + this.load) * Math.min(1, this.speed / 8);
          }

          // starter motor
          this.starter += ((this.crank && this.starterOk ? 1 : 0) - this.starter) * 0.002;
          if (this.starter > 0.002) {
            this.sph += (170 + 25 * Math.sin(this.ph * 6.28)) / sr; if (this.sph > 1) this.sph -= 1;
            y += ((this.sph * 2 - 1) * 0.5 + this.mech.run(nz) * 0.4) * this.starter * 0.18;
          }

          // DC block
          this.hp += (y - this.hp) * hpk;
          out[i] = (y - this.hp) * this.master * 0.55;
        }
      }
    }
    return EngineSynth;
  }

  const SRC = synthSource.toString();

  class EngineAudio {
    constructor() {
      this.ctx = null; this.node = null; this.synth = null; this.ready = false; this.volume = 0.8;
      this.samples = null; this.useSamples = false; this.onSamples = null; // onSamples(count) after each car load
    }

    async init() {
      if (this.ctx) { await this.initP; if (this.ctx.state !== 'running') this.ctx.resume(); return; }
      this.initP = this._init();
      return this.initP;
    }

    async _init() {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC({ latencyHint: 'interactive' });
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -10; comp.knee.value = 8; comp.ratio.value = 6;
      comp.attack.value = 0.003; comp.release.value = 0.15;
      this.out = this.ctx.createGain(); this.out.gain.value = 1;
      comp.connect(this.out); this.out.connect(this.ctx.destination);
      // a little "air": short synthetic room reflection so dry loops/synth don't sound boxy
      const ir = this.ctx.createBuffer(2, Math.round(this.ctx.sampleRate * 0.5), this.ctx.sampleRate);
      for (let c = 0; c < 2; c++) {
        const d = ir.getChannelData(c);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3) * (i < 200 ? i / 200 : 1);
      }
      const verb = this.ctx.createConvolver(); verb.buffer = ir;
      const wet = this.ctx.createGain(); wet.gain.value = 0.1;
      comp.connect(verb); verb.connect(wet); wet.connect(this.out);
      try {
        const code = `const EngineSynth = (${SRC})();\n` +
          `class P extends AudioWorkletProcessor { constructor(){ super(); this.s = new EngineSynth(sampleRate); this.port.onmessage = (e) => this.s.msg(e.data); }` +
          ` process(i, o){ const ch = o[0]; this.s.render(ch[0]); for (let k = 1; k < ch.length; k++) ch[k].set(ch[0]); return true; } }\n` +
          `registerProcessor('engine-synth', P);`;
        const url = URL.createObjectURL(new Blob([code], { type: 'application/javascript' }));
        await this.ctx.audioWorklet.addModule(url);
        this.node = new AudioWorkletNode(this.ctx, 'engine-synth', { outputChannelCount: [2] });
        this.post = (m) => this.node.port.postMessage(m);
      } catch (err) {
        console.warn('AudioWorklet unavailable, using ScriptProcessor', err);
        const Synth = new Function(`return (${SRC})();`)();
        this.synth = new Synth(this.ctx.sampleRate);
        this.node = this.ctx.createScriptProcessor(1024, 0, 2);
        this.node.onaudioprocess = (e) => {
          const L = e.outputBuffer.getChannelData(0);
          this.synth.render(L);
          e.outputBuffer.getChannelData(1).set(L);
        };
        this.post = (m) => this.synth.msg(m);
      }
      this.node.connect(comp);
      if (window.SampleEngine) this.samples = new SampleEngine(this.ctx, comp);
      this.ready = true;
      if (this.ctx.state !== 'running') this.ctx.resume();
    }

    configure(car) {
      if (!this.ready) return;
      const s = car.sound;
      this.post({ type: 'config', cfg: {
        cyl: car.engine.cylinders, limiter: car.engine.limiter, res: s.res, direct: s.direct, drive: s.drive,
        noise: s.noise, lpBase: s.lpBase, lpRpm: s.lpRpm, lpLoad: s.lpLoad, pops: s.pops, crackGain: s.crack,
        turbo: s.turbo || 0, eWhine: s.eWhine || 0, bank: s.bank,
      } });
      this.useSamples = false;
      if (!this.samples) { if (this.onSamples) this.onSamples(0); return; }
      this.samples.load(car).then((n) => {
        this.useSamples = n > 0;
        this.fxMix = n > 0 && this.samples.cfg.synthFx === false ? 0 : 1;
        if (this.onSamples) this.onSamples(n);
      });
    }

    update(st) {
      if (!this.ready) return;
      const smp = this.useSamples;
      this.post(Object.assign({ type: 'state', vol: this.volume, eng: smp ? this.samples.synthMix(st.rpm) : 1, fx: smp ? this.fxMix : 1,
        starter: !(smp && this.samples.startup) }, st));
      if (smp) this.samples.update(st, this.volume);
    }

    event(name, amp) {
      if (!this.ready) return;
      if (this.useSamples && name === 'crank') this.samples.playStartup();
      if (this.useSamples && name === 'stop') this.samples.stopStartup();
      this.post({ type: 'event', name, amp });
    }

    unloadSamples() { this.useSamples = false; if (this.samples) this.samples.unload(); }
    suspend() { if (this.ctx) this.ctx.suspend(); }
    resume() { if (this.ctx) this.ctx.resume(); }
  }

  window.EngineAudio = EngineAudio;
  window.__engineSynthSource = SRC;
})();
