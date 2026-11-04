import { clamp } from '../core/noise.js';

/**
 * Lightweight synthesised engine + tyre + wind + rain audio.
 * No audio files, everything is generated with Web Audio so the game
 * remains a single static deployment.
 */
export class AudioSystem {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.started = false;
    this.driving = false;
    this.vehicle = null;
    this.master = null;
    this._lastSpeed = 0;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
    } catch (_) {
      return;
    }
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.0001;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 20;
    comp.ratio.value = 5;
    comp.attack.value = 0.004;
    comp.release.value = 0.25;
    this.master.connect(comp);
    comp.connect(ctx.destination);

    this._noise = this._makeNoise(2.0);

    // ---- engine
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0.0001;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 1200;
    this.engineFilter.Q.value = 0.8;
    this.engineGain.connect(this.engineFilter);
    this.engineFilter.connect(this.master);

    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      const x = (i / 1023) * 2 - 1;
      curve[i] = Math.tanh(x * 2.2) * 0.75;
    }
    shaper.curve = curve;
    shaper.oversample = '2x';
    this.engineFilter.disconnect();
    this.engineFilter.connect(shaper);
    shaper.connect(this.master);

    this.osc1 = ctx.createOscillator();
    this.osc1.type = 'sawtooth';
    this.osc1.frequency.value = 70;
    this.osc1Gain = ctx.createGain();
    this.osc1Gain.gain.value = 0.32;
    this.osc1.connect(this.osc1Gain);
    this.osc1Gain.connect(this.engineGain);
    this.osc1.start();

    this.osc2 = ctx.createOscillator();
    this.osc2.type = 'square';
    this.osc2.frequency.value = 105;
    this.osc2.detune.value = 7;
    this.osc2Gain = ctx.createGain();
    this.osc2Gain.gain.value = 0.13;
    this.osc2.connect(this.osc2Gain);
    this.osc2Gain.connect(this.engineGain);
    this.osc2.start();

    this.osc3 = ctx.createOscillator();
    this.osc3.type = 'sine';
    this.osc3.frequency.value = 35;
    this.osc3Gain = ctx.createGain();
    this.osc3Gain.gain.value = 0.22;
    this.osc3.connect(this.osc3Gain);
    this.osc3Gain.connect(this.master);
    this.osc3.start();

    // exhaust rasp
    this.exhaust = ctx.createBufferSource();
    this.exhaust.buffer = this._noise;
    this.exhaust.loop = true;
    this.exhaustFilter = ctx.createBiquadFilter();
    this.exhaustFilter.type = 'bandpass';
    this.exhaustFilter.frequency.value = 240;
    this.exhaustFilter.Q.value = 0.7;
    this.exhaustGain = ctx.createGain();
    this.exhaustGain.gain.value = 0.0001;
    this.exhaust.connect(this.exhaustFilter);
    this.exhaustFilter.connect(this.exhaustGain);
    this.exhaustGain.connect(this.master);
    this.exhaust.start();

    // tyre scrub
    this.tyre = ctx.createBufferSource();
    this.tyre.buffer = this._noise;
    this.tyre.loop = true;
    this.tyreFilter = ctx.createBiquadFilter();
    this.tyreFilter.type = 'bandpass';
    this.tyreFilter.frequency.value = 900;
    this.tyreFilter.Q.value = 1.1;
    this.tyreGain = ctx.createGain();
    this.tyreGain.gain.value = 0.0001;
    this.tyre.connect(this.tyreFilter);
    this.tyreFilter.connect(this.tyreGain);
    this.tyreGain.connect(this.master);
    this.tyre.start();

    // wind
    this.wind = ctx.createBufferSource();
    this.wind.buffer = this._noise;
    this.wind.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'lowpass';
    this.windFilter.frequency.value = 520;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.0001;
    this.wind.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.master);
    this.wind.start();

    // rain
    this.rain = ctx.createBufferSource();
    this.rain.buffer = this._noise;
    this.rain.loop = true;
    this.rainFilter = ctx.createBiquadFilter();
    this.rainFilter.type = 'highpass';
    this.rainFilter.frequency.value = 1400;
    this.rainGain = ctx.createGain();
    this.rainGain.gain.value = 0.0001;
    this.rain.connect(this.rainFilter);
    this.rainFilter.connect(this.rainGain);
    this.rainGain.connect(this.master);
    this.rain.start();

    this.started = true;
    const target = this.enabled ? 0.72 : 0.0001;
    this.master.gain.setTargetAtTime(target, ctx.currentTime, 0.2);
  }

  _makeNoise(seconds) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = 0.96 * last + 0.04 * white;
      d[i] = last * 2.4 + white * 0.35;
    }
    return buf;
  }

  setEnabled(on) {
    this.enabled = on;
    if (!this.ctx) return;
    this.master.gain.setTargetAtTime(on ? 0.72 : 0.0001, this.ctx.currentTime, 0.15);
  }

  setDriving(on) {
    this.driving = on;
    if (!on && this.ctx) {
      const t = this.ctx.currentTime;
      this.engineGain.gain.setTargetAtTime(0.0001, t, 0.1);
      this.exhaustGain.gain.setTargetAtTime(0.0001, t, 0.1);
      this.tyreGain.gain.setTargetAtTime(0.0001, t, 0.1);
      this.windGain.gain.setTargetAtTime(0.0001, t, 0.1);
    }
  }

  setVehicle(vehicle) {
    this.vehicle = vehicle;
    if (!this.ctx) return;
    const cylinders = vehicle?.engine?.cylinders || 6;
    this.cylinders = cylinders;
    this.osc2.type = cylinders >= 10 ? 'sawtooth' : 'square';
    this.osc1.detune.value = cylinders === 0 ? 1200 : 0;
    this.osc3Gain.gain.setTargetAtTime(cylinders === 0 ? 0.04 : 0.2, this.ctx.currentTime, 0.2);
  }

  update(dt, state) {
    if (!this.ctx || !this.started || !this.enabled) return;
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    const t = this.ctx.currentTime;
    const v = this.vehicle || {};
    const cylinders = v.engine?.cylinders || this.cylinders || 6;
    const ev = cylinders === 0;
    const rpmNorm = clamp(((state.rpm || 900) - 800) / 7200, 0, 1);
    const speedNorm = clamp((state.speed || 0) / 330, 0, 1);
    const firing = ev ? 50 + rpmNorm * 210 : (34 + rpmNorm * 120) * (cylinders / 6);
    const active = this.driving;

    this.osc1.frequency.setTargetAtTime(firing, t, 0.045);
    this.osc2.frequency.setTargetAtTime(firing * 1.5 + 2, t, 0.05);
    this.osc3.frequency.setTargetAtTime(firing * 0.5, t, 0.06);
    this.engineFilter.frequency.setTargetAtTime(520 + rpmNorm * 2200 + (state.throttle || 0) * 900, t, 0.08);
    const engineVol = active ? (0.026 + (state.throttle || 0) * 0.045 + rpmNorm * 0.016) : 0.0001;
    this.engineGain.gain.setTargetAtTime(engineVol, t, 0.07);
    this.exhaustGain.gain.setTargetAtTime(active ? 0.012 + (state.throttle || 0) * 0.028 : 0.0001, t, 0.08);
    this.exhaustFilter.frequency.setTargetAtTime(180 + rpmNorm * 600, t, 0.08);

    const dirt = state.surface === 'dirt' || state.surface === 'terrain' ? 1.25 : 1;
    const slip = clamp((state.slip || 0) / 16, 0, 1);
    const tyreVol = active ? clamp(speedNorm * 0.018 + slip * 0.1, 0, 0.12) * dirt : 0.0001;
    this.tyreGain.gain.setTargetAtTime(tyreVol, t, 0.06);
    this.tyreFilter.frequency.setTargetAtTime(700 + slip * 1600 + speedNorm * 500, t, 0.08);

    const windVol = active ? speedNorm * speedNorm * 0.07 : 0.0001;
    this.windGain.gain.setTargetAtTime(windVol, t, 0.1);
    this.windFilter.frequency.setTargetAtTime(300 + speedNorm * 950, t, 0.1);
    this.rainGain.gain.setTargetAtTime(state.rain ? 0.032 : 0.0001, t, 0.25);

    if (Math.abs((state.speed || 0) - this._lastSpeed) > 45) this._lastSpeed = state.speed || 0;
  }

  beep(freq = 880, dur = 0.09, type = 'sine', vol = 0.08) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.03);
  }

  ui() { this.beep(680, 0.045, 'triangle', 0.035); }
  shift() { this.beep(240, 0.035, 'square', 0.03); }
  countdown(final = false) {
    this.beep(final ? 1320 : 760, final ? 0.3 : 0.12, 'sine', final ? 0.12 : 0.07);
  }
  checkpoint() { this.beep(1040, 0.08, 'triangle', 0.06); setTimeout(() => this.beep(1380, 0.1, 'triangle', 0.05), 70); }
  collect() {
    this.beep(880, 0.08, 'triangle', 0.055);
    setTimeout(() => this.beep(1320, 0.12, 'triangle', 0.05), 80);
  }
  finish(gold = false) {
    const notes = gold ? [660, 880, 1100, 1480] : [520, 660, 880];
    notes.forEach((n, i) => setTimeout(() => this.beep(n, 0.18, 'triangle', 0.07), i * 110));
  }
  impact(strength = 0.5) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(80, t);
    o.frequency.exponentialRampToValueAtTime(28, t + 0.25);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12 * clamp(strength, 0.1, 1), t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + 0.32);
  }
}
