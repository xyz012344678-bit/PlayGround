import { clamp, formatTime } from '../core/noise.js';

const $ = id => document.getElementById(id);

export class WorldMapUI {
  constructor(world, save, callbacks = {}) {
    this.world = world;
    this.save = save;
    this.callbacks = callbacks;
    this.canvas = $('worldmap');
    this.stage = this.canvas.parentElement;
    this.ctx = this.canvas.getContext('2d');
    this.active = false;
    this.zoom = 1.8;
    this.center = { x: 0, z: 0 };
    this.pan = { x: 0, y: 0 };
    this.destination = null;
    this.pointer = null;
    this._bind();
    this._buildEvents();
    this._resize();
  }

  _bind() {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => {
      this.pointer = {
        id: e.pointerId, sx: e.clientX, sy: e.clientY,
        px: this.pan.x, py: this.pan.y, moved: false,
      };
      c.setPointerCapture(e.pointerId);
    });
    c.addEventListener('pointermove', (e) => {
      if (this.pointer && this.pointer.id === e.pointerId) {
        const dx = e.clientX - this.pointer.sx, dy = e.clientY - this.pointer.sy;
        if (Math.abs(dx) + Math.abs(dy) > 4) this.pointer.moved = true;
        if (this.pointer.moved) {
          this.pan.x = this.pointer.px + dx;
          this.pan.y = this.pointer.py + dy;
          this._clampPan();
        }
      }
      this._hover(e);
    });
    const up = (e) => {
      if (!this.pointer || this.pointer.id !== e.pointerId) return;
      const moved = this.pointer.moved;
      this.pointer = null;
      if (!moved) this._selectAt(e);
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', () => { this.pointer = null; });
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      this._zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.15 : 0.87);
    }, { passive: false });
    $('map-zoom-in').addEventListener('click', () => this._zoomAt(this.canvas.clientWidth / 2, this.canvas.clientHeight / 2, 1.32));
    $('map-zoom-out').addEventListener('click', () => this._zoomAt(this.canvas.clientWidth / 2, this.canvas.clientHeight / 2, 0.76));
    $('map-reset').addEventListener('click', () => {
      this.zoom = 1.8;
      this.center = this._playerCenter();
      this.pan = { x: 0, y: 0 };
    });
    $('map-travel-btn').addEventListener('click', () => {
      if (!this.destination) return;
      if (this.callbacks.onTravel) this.callbacks.onTravel(this.destination.x, this.destination.z, this.destination.name);
    });
  }

  _buildEvents() {
    const wrap = $('map-events');
    if (!wrap) return;
    wrap.innerHTML = '';
    for (const e of this.world.events) {
      const best = this.save.bestTimes?.[e.id];
      const row = document.createElement('button');
      row.className = 'map-event';
      row.innerHTML = `<span class="ev-ico"><svg><use href="#i-flag"/></svg></span>
        <div><b>${e.name}</b><small>${e.cps} checkpoints · ${e.roadRef?.name || 'Island route'}</small></div>
        <span class="ev-best">${best ? `<b>${formatTime(best)}</b>` : '<b>—</b>'}<br>BEST</span>`;
      row.addEventListener('click', () => {
        if (this.callbacks.onEvent) this.callbacks.onEvent(e);
      });
      wrap.appendChild(row);
    }
  }

  refresh() {
    this._buildEvents();
    this._updateSide();
  }

  _playerCenter() {
    const p = this.callbacks.getPlayer?.();
    return p ? { x: p.x, z: p.z } : { x: -1500, z: 640 };
  }

  open() {
    this.active = true;
    this.zoom = Math.max(1.55, this.zoom);
    this.center = this._playerCenter();
    this.pan = { x: 0, y: 0 };
    this._resize();
    this.refresh();
    this.draw();
  }
  close() { this.active = false; this.pointer = null; }

  _resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = this.stage.clientWidth || window.innerWidth;
    const h = this.stage.clientHeight || window.innerHeight;
    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) {
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
    }
    this.w = w; this.h = h; this.dpr = dpr;
    this.fit = Math.min(w, h) * 0.93 / this.world.size;
  }

  get viewScale() { return this.fit * this.zoom; }

  _clampPan() {
    const maxX = Math.max(0, this.w * 0.45);
    const maxY = Math.max(0, this.h * 0.45);
    this.pan.x = clamp(this.pan.x, -maxX, maxX);
    this.pan.y = clamp(this.pan.y, -maxY, maxY);
    const worldSpan = this.w / this.viewScale;
    const worldSpanY = this.h / this.viewScale;
    this.center.x = clamp(this.center.x, -this.world.half + worldSpan * 0.1, this.world.half - worldSpan * 0.1);
    this.center.z = clamp(this.center.z, -this.world.half + worldSpanY * 0.1, this.world.half - worldSpanY * 0.1);
  }

  _zoomAt(sx, sy, factor) {
    const before = this._toWorld(sx, sy);
    this.zoom = clamp(this.zoom * factor, 0.8, 7);
    const after = this._toWorld(sx, sy);
    this.center.x += before.x - after.x;
    this.center.z += before.z - after.z;
    this._clampPan();
    this.draw();
  }

  _toWorld(sx, sy) {
    const r = this.canvas.getBoundingClientRect();
    const x = sx - r.left, y = sy - r.top;
    return {
      x: this.center.x + (x - this.w / 2 - this.pan.x) / this.viewScale,
      z: this.center.z + (y - this.h / 2 - this.pan.y) / this.viewScale,
    };
  }

  _toScreen(x, z) {
    return {
      x: this.w / 2 + (x - this.center.x) * this.viewScale + this.pan.x,
      y: this.h / 2 + (z - this.center.z) * this.viewScale + this.pan.y,
    };
  }

  _hover(e) {
    if (!this.active) return;
    const p = this._toWorld(e.clientX, e.clientY);
    let label = this.world.regionAt(p.x, p.z);
    for (const ev of this.world.events) {
      const s = this._toScreen(ev.start.x, ev.start.z);
      if (Math.hypot(s.x - (e.clientX - this.canvas.getBoundingClientRect().left), s.y - (e.clientY - this.canvas.getBoundingClientRect().top)) < 16) {
        label = ev.name; break;
      }
    }
    const tip = $('map-tooltip');
    const r = this.canvas.getBoundingClientRect();
    tip.textContent = label;
    tip.style.left = (e.clientX - r.left) + 'px';
    tip.style.top = (e.clientY - r.top) + 'px';
    tip.classList.add('show');
    $('map-coords').textContent = `X ${p.x.toFixed(0)} · Z ${p.z.toFixed(0)}`;
    $('map-region-name').textContent = label;
    $('map-coords').dataset.x = p.x;
    $('map-coords').dataset.z = p.z;
  }

  _selectAt(e) {
    const p = this._toWorld(e.clientX, e.clientY);
    // snap to an event start when clicking close to its marker
    let dest = { x: p.x, z: p.z, name: this.world.regionAt(p.x, p.z) };
    for (const ev of this.world.events) {
      const s = this._toScreen(ev.start.x, ev.start.z);
      const r = this.canvas.getBoundingClientRect();
      if (Math.hypot(s.x - (e.clientX - r.left), s.y - (e.clientY - r.top)) < 17) {
        dest = { x: ev.start.x, z: ev.start.z, name: ev.name };
        break;
      }
    }
    this.destination = dest;
    this._updateSide();
    this.draw();
  }

  _updateSide() {
    const name = $('travel-name'), coords = $('travel-coords');
    if (!name) return;
    if (this.destination) {
      name.textContent = this.destination.name;
      coords.textContent = `X ${this.destination.x.toFixed(0)} · Z ${this.destination.z.toFixed(0)}`;
    } else {
      name.textContent = 'Tap the map';
      coords.textContent = '—';
    }
    const collected = this.world.collectibles.filter(c => c.userData.collected).length;
    $('map-collect').textContent = `${collected} / ${this.world.collectibles.length}`;
    $('map-collect-bar').style.width = (collected / Math.max(1, this.world.collectibles.length) * 100) + '%';
  }

  draw() {
    if (!this.active) return;
    const ctx = this.ctx;
    const w = this.w, h = this.h;
    if (!w || !h) return;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#081014';
    ctx.fillRect(0, 0, w, h);

    const scale = this.viewScale;
    const dw = this.world.size * scale;
    const dx = w / 2 + this.pan.x - (this.center.x + this.world.half) * scale;
    const dy = h / 2 + this.pan.y - (this.center.z + this.world.half) * scale;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.world.mapCanvas, dx, dy, dw, dw);

    // faint longitude / latitude grid
    ctx.strokeStyle = 'rgba(180,210,225,.055)';
    ctx.lineWidth = 1;
    const grid = 1000 * scale;
    const gx = ((dx % grid) + grid) % grid;
    const gy = ((dy % grid) + grid) % grid;
    for (let x = gx; x < w; x += grid) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = gy; y < h; y += grid) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }

    // events
    for (const ev of this.world.events) {
      const s = this._toScreen(ev.start.x, ev.start.z);
      if (s.x < -30 || s.x > w + 30 || s.y < -30 || s.y > h + 30) continue;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 7, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,90,18,.16)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,90,18,.4)';
      ctx.lineWidth = 1.4; ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(s.x, s.y - 5); ctx.lineTo(s.x + 5, s.y); ctx.lineTo(s.x, s.y + 5); ctx.lineTo(s.x - 5, s.y); ctx.closePath();
      ctx.fillStyle = '#ff5a12'; ctx.shadowColor = '#ff5a12'; ctx.shadowBlur = 10; ctx.fill(); ctx.shadowBlur = 0;
    }

    // collectibles
    for (const col of this.world.collectibles) {
      if (col.userData.collected) continue;
      const s = this._toScreen(col.position.x, col.position.z);
      if (s.x < 0 || s.x > w || s.y < 0 || s.y > h) continue;
      ctx.beginPath(); ctx.arc(s.x, s.y, 2.3, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,182,72,.85)'; ctx.fill();
    }

    // destination
    if (this.destination) {
      const s = this._toScreen(this.destination.x, this.destination.z);
      ctx.beginPath(); ctx.arc(s.x, s.y, 6, 0, Math.PI * 2);
      ctx.fillStyle = '#35e6ff'; ctx.shadowColor = '#35e6ff'; ctx.shadowBlur = 16; ctx.fill(); ctx.shadowBlur = 0;
      ctx.beginPath(); ctx.arc(s.x, s.y, 13, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(53,230,255,.35)'; ctx.lineWidth = 1; ctx.stroke();
    }

    // player
    const pl = this.callbacks.getPlayer?.();
    if (pl) {
      const s = this._toScreen(pl.x, pl.z);
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(Math.PI - (pl.heading || 0));
      ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(6, 8); ctx.lineTo(0, 4); ctx.lineTo(-6, 8); ctx.closePath();
      ctx.fillStyle = '#35e6ff'; ctx.shadowColor = '#35e6ff'; ctx.shadowBlur = 14; ctx.fill();
      ctx.restore();
      ctx.beginPath(); ctx.arc(s.x, s.y, 17, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(53,230,255,.22)'; ctx.stroke();
    }

    // corner labels
    ctx.fillStyle = 'rgba(180,200,210,.35)';
    ctx.font = '600 8px "Chakra Petch", sans-serif';
    ctx.textAlign = 'left';
    if (this.destination) {
      ctx.fillStyle = 'rgba(200,215,222,.6)';
      ctx.fillText('HOLD AND DRAG TO PAN · SCROLL TO ZOOM', 16, 18);
    }
  }
}
