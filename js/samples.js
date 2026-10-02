/*
 * Recorded-sample engine sound (optional).
 *
 * Drop audio files into  sounds/<car-id>/  and the car uses them instead of
 * the synth engine note. Works like racing games do: several steady-rpm
 * loops are pitch-shifted to the live rpm and crossfaded by rpm and by
 * load (on-throttle vs off-throttle recordings).
 *
 * Either describe the files in sounds/<car-id>/sounds.json:
 *   {
 *     "loops": [
 *       { "file": "idle.mp3",    "rpm": 1000, "load": "both" },
 *       { "file": "low_on.mp3",  "rpm": 3000, "load": "on"  },
 *       { "file": "low_off.mp3", "rpm": 3000, "load": "off" }
 *     ],
 *     "startup": "startup.mp3",
 *     "volume": 1.0,
 *     "synthFx": true
 *   }
 * or just use the default file names (see DEFAULTS) without a sounds.json.
 */
(function () {
  // name, rpm as a fraction of the rev limiter (idle uses the idle rpm), load
  const DEFAULTS = [
    ['idle', 0, 'both'],
    ['low_on', 0.35, 'on'], ['low_off', 0.35, 'off'],
    ['mid_on', 0.6, 'on'], ['mid_off', 0.6, 'off'],
    ['high_on', 0.85, 'on'], ['high_off', 0.85, 'off'],
    ['engine', 0.5, 'both'],
  ];

  async function fetchJson(url) {
    try { const r = await fetch(url, { cache: 'no-cache' }); return r.ok ? await r.json() : null; } catch (e) { return null; }
  }

  // Skip encoder padding / silence at the ends so loops don't click or gap.
  function trimPoints(buf) {
    const d = buf.getChannelData(0), th = 0.003;
    let a = 0, b = d.length - 1;
    while (a < b && Math.abs(d[a]) < th) a++;
    while (b > a && Math.abs(d[b]) < th) b--;
    return { start: a / buf.sampleRate, end: (b + 1) / buf.sampleRate };
  }

  class SampleEngine {
    constructor(ctx, dest) {
      this.ctx = ctx;
      this.out = ctx.createGain(); this.out.gain.value = 0;
      this.out.connect(dest);
      this.loops = []; this.startup = null; this.active = false; this.gen = 0;
      this.loadS = 0; this.startupUntil = 0; this.startupSrc = null; this.cfg = null;
    }

    async decode(url) {
      try {
        const r = await fetch(url, { cache: 'no-cache' });
        if (!r.ok) return null;
        return await this.ctx.decodeAudioData(await r.arrayBuffer());
      } catch (e) { return null; }
    }

    unload() {
      this.gen++;
      for (const l of this.loops) { try { l.src.stop(); } catch (e) { /* already stopped */ } l.gain.disconnect(); }
      this.loops = []; this.startup = null; this.active = false;
      this.stopStartup();
      this.out.gain.cancelScheduledValues(this.ctx.currentTime);
      this.out.gain.value = 0;
    }

    // Returns the number of loops loaded (0 = no samples for this car, use the synth).
    async load(car) {
      this.unload();
      const gen = this.gen, base = `sounds/${car.id}/`;
      const e = car.engine;
      let cfg = await fetchJson(base + 'sounds.json');
      if (!cfg) {
        cfg = { loops: DEFAULTS.map(([n, f, l]) => ({ file: n + '.mp3', rpm: f === 0 ? e.idle : Math.round(e.limiter * f), load: l })), startup: 'startup.mp3', optional: true };
      }
      const specs = await Promise.all((cfg.loops || []).map(async (s) => ({ s, buf: await this.decode(base + s.file) })));
      const startup = cfg.startup ? await this.decode(base + cfg.startup) : null;
      if (gen !== this.gen) return 0; // another car was picked meanwhile
      const found = specs.filter((x) => x.buf);
      if (!cfg.optional) specs.filter((x) => !x.buf).forEach((x) => console.warn('Missing sound file', base + x.s.file));
      if (!found.length) return 0;

      const t = this.ctx.currentTime;
      for (const { s, buf } of found) {
        const src = this.ctx.createBufferSource();
        src.buffer = buf; src.loop = true;
        const tp = trimPoints(buf);
        src.loopStart = s.loopStart != null ? s.loopStart : tp.start;
        src.loopEnd = s.loopEnd != null ? s.loopEnd : tp.end;
        const gain = this.ctx.createGain(); gain.gain.value = 0;
        src.connect(gain); gain.connect(this.out);
        src.start(t, src.loopStart);
        this.loops.push({ rpm: s.rpm, load: s.load || 'both', gain, src, vol: s.volume != null ? s.volume : 1 });
      }
      this.loops.sort((a, b) => a.rpm - b.rpm);
      this.startup = startup;
      this.cfg = cfg;
      this.active = true;
      return this.loops.length;
    }

    playStartup() {
      if (!this.active || !this.startup) return;
      this.stopStartup();
      const src = this.ctx.createBufferSource(), g = this.ctx.createGain();
      g.gain.value = this.cfg.startupVolume != null ? this.cfg.startupVolume : 1;
      src.buffer = this.startup; src.connect(g); g.connect(this.out); src.start();
      this.startupSrc = src;
      // let the recording play its own crank + flare, then hand over to the loops
      this.startupUntil = this.ctx.currentTime + Math.max(0.5, this.startup.duration - 0.8);
    }

    stopStartup() {
      if (this.startupSrc) { try { this.startupSrc.stop(); } catch (e) { /* ignore */ } this.startupSrc = null; }
      this.startupUntil = 0;
    }

    static weights(group, rpm) {
      const w = new Map();
      if (!group.length) return w;
      if (rpm <= group[0].rpm) { w.set(group[0], 1); return w; }
      const last = group[group.length - 1];
      if (rpm >= last.rpm) { w.set(last, 1); return w; }
      for (let i = 0; i < group.length - 1; i++) {
        const a = group[i], b = group[i + 1];
        if (rpm >= a.rpm && rpm <= b.rpm) {
          const t = (rpm - a.rpm) / Math.max(1, b.rpm - a.rpm);
          w.set(a, Math.cos(t * Math.PI / 2)); w.set(b, Math.sin(t * Math.PI / 2));
          break;
        }
      }
      return w;
    }

    update(st, volume) {
      if (!this.active) return;
      const t = this.ctx.currentTime;
      const audible = (st.on || st.crank) && t >= this.startupUntil;
      const master = (this.cfg.volume != null ? this.cfg.volume : 1) * volume;
      this.out.gain.setTargetAtTime(master, t, 0.05);
      this.loadS += (st.load - this.loadS) * 0.25;

      let on = this.loops.filter((l) => l.load !== 'off');
      let off = this.loops.filter((l) => l.load !== 'on');
      if (!on.length) on = off;
      if (!off.length) off = on;
      const wOn = SampleEngine.weights(on, st.rpm), wOff = SampleEngine.weights(off, st.rpm);
      const fade = st.on ? 0.03 : 0.12;
      for (const l of this.loops) {
        const w = audible ? ((wOn.get(l) || 0) * this.loadS + (wOff.get(l) || 0) * (1 - this.loadS)) * l.vol : 0;
        l.gain.gain.setTargetAtTime(w, t, fade);
        const rate = Math.min(4, Math.max(0.25, Math.max(st.rpm, 1) / l.rpm));
        l.src.playbackRate.setTargetAtTime(rate, t, 0.015);
      }
    }
  }

  window.SampleEngine = SampleEngine;
})();
