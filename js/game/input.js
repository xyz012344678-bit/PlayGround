import { clamp } from '../core/noise.js';

const KEY_ACTIONS = {
  KeyW: 'throttle', ArrowUp: 'throttle',
  KeyS: 'brake', ArrowDown: 'brake',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  Space: 'handbrake',
  ShiftLeft: 'boost', ShiftRight: 'boost',
  KeyC: 'camera',
  KeyM: 'map',
  KeyG: 'garage',
  KeyH: 'help',
  KeyR: 'reset',
  Escape: 'pause',
  KeyE: 'interact',
  Enter: 'interact',
  KeyQ: 'shiftDown',
  KeyF: 'favourite',
};

const TOUCH_ACTIONS = ['left', 'right', 'gas', 'brake', 'handbrake'];

export class Input {
  constructor() {
    this.keys = new Set();
    this.touch = new Map();          // action -> pointerId
    this.held = new Set();           // keyboard + touch held actions
    this.queued = new Set();
    this.enabled = true;
    this.sensitivity = 1;
    this.isTouch = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    if (this.isTouch) document.body.classList.add('touch');
    this._bindKeyboard();
    this._bindTouch();
    this._padPrev = {};
    this.pad = null;
  }

  _bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable)) return;
      const action = KEY_ACTIONS[e.code];
      if (!action) return;
      if (action === 'map' || action === 'garage' || action === 'pause' || action === 'help' || action === 'interact' || action === 'camera' || action === 'reset') {
        e.preventDefault();
      }
      if (!e.repeat) {
        this.queued.add(action);
        this.held.add(action);
      }
      this.keys.add(e.code);
    }, { passive: false });

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      const action = KEY_ACTIONS[e.code];
      if (action) this.held.delete(action);
    });

    window.addEventListener('blur', () => {
      this.keys.clear();
      this.held.clear();
      this.touch.clear();
    });
  }

  _bindTouch() {
    const buttons = document.querySelectorAll('[data-touch]');
    buttons.forEach(btn => {
      const action = btn.dataset.touch;
      const down = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const id = e.pointerId;
        if (action === 'camera') {
          this.queued.add('camera');
          btn.classList.add('down');
          setTimeout(() => btn.classList.remove('down'), 120);
          return;
        }
        if (this.touch.has(action)) return;
        this.touch.set(action, id);
        this.held.add(action === 'gas' ? 'throttle' : action === 'brake' ? 'brake' : action);
        btn.classList.add('down');
        try { btn.setPointerCapture(id); } catch (_) { /* noop */ }
      };
      const up = (e) => {
        e.preventDefault();
        if (this.touch.get(action) === e.pointerId) {
          this.touch.delete(action);
          const mapped = action === 'gas' ? 'throttle' : action === 'brake' ? 'brake' : action;
          if (![...this.touch.keys()].some(a => (a === 'gas' ? 'throttle' : a === 'brake' ? 'brake' : a) === mapped)) {
            this.held.delete(mapped);
          }
          btn.classList.remove('down');
        }
      };
      btn.addEventListener('pointerdown', down);
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointercancel', up);
      btn.addEventListener('pointerleave', (e) => {
        if (btn.hasPointerCapture && btn.hasPointerCapture(e.pointerId)) return;
        up(e);
      });
      btn.addEventListener('contextmenu', e => e.preventDefault());
    });
    // The canvas and HUD buttons can steal focus; keep touch class in sync.
    window.addEventListener('touchstart', () => {
      if (!document.body.classList.contains('touch')) document.body.classList.add('touch');
    }, { passive: true, once: true });
  }

  setEnabled(on) {
    this.enabled = on;
    if (!on) {
      this.held.clear();
      this.keys.clear();
      this.touch.clear();
      document.querySelectorAll('.touch-btn.down').forEach(b => b.classList.remove('down'));
    }
  }

  pollGamepad() {
    if (!navigator.getGamepads) return;
    const pads = navigator.getGamepads();
    let gp = null;
    for (const p of pads) if (p && p.connected) { gp = p; break; }
    this.pad = gp;
    if (!gp) return;
    const dead = 0.16;
    const ax = gp.axes[0] || 0;
    const steer = Math.abs(ax) > dead ? Math.sign(ax) * ((Math.abs(ax) - dead) / (1 - dead)) : 0;
    if (steer < -0.05) this.held.add('left'); else this.held.delete('left');
    if (steer > 0.05) this.held.add('right'); else this.held.delete('right');
    const rt = gp.buttons[7]?.value || 0;
    const lt = gp.buttons[6]?.value || 0;
    if (rt > 0.08) this.held.add('throttle'); else this.held.delete('throttle');
    if (lt > 0.08) this.held.add('brake'); else this.held.delete('brake');
    if (gp.buttons[0]?.pressed) this.held.add('handbrake'); else this.held.delete('handbrake');
    const edges = { 3: 'camera', 1: 'reset', 9: 'pause', 8: 'map', 2: 'garage' };
    for (const [idx, action] of Object.entries(edges)) {
      const pressed = !!gp.buttons[idx]?.pressed;
      if (pressed && !this._padPrev[idx]) this.queued.add(action);
      this._padPrev[idx] = pressed;
    }
    this.padSteer = steer;
  }

  update() {
    this.pollGamepad();
  }

  get throttle() {
    if (!this.enabled) return 0;
    return this.held.has('throttle') ? 1 : 0;
  }
  get brake() {
    if (!this.enabled) return 0;
    return this.held.has('brake') ? 1 : 0;
  }
  get steer() {
    if (!this.enabled) return 0;
    let v = 0;
    if (this.held.has('left')) v -= 1;
    if (this.held.has('right')) v += 1;
    if (this.padSteer && Math.abs(this.padSteer) > Math.abs(v)) v = this.padSteer;
    return clamp(v * this.sensitivity, -1, 1);
  }
  get handbrake() { return this.enabled && this.held.has('handbrake'); }
  get boost() { return this.enabled && this.held.has('boost'); }
  get anyDrivingInput() {
    return this.throttle > 0 || this.brake > 0 || Math.abs(this.steer) > 0.01 || this.handbrake;
  }

  consume(action) {
    if (!this.queued.has(action)) return false;
    this.queued.delete(action);
    return true;
  }
  clearActions() { this.queued.clear(); }
}
