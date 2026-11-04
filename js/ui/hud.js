import { clamp, formatTime } from '../core/noise.js';

const $ = (id) => document.getElementById(id);

export class HUD {
  constructor(world, engine, save) {
    this.world = world;
    this.engine = engine;
    this.save = save;
    this.el = $('hud');
    this.speedCanvas = $('speedo');
    this.minimap = $('minimap');
    this.ctxSpeed = this.speedCanvas.getContext('2d');
    this.ctxMap = this.minimap.getContext('2d');
    this._speedKey = '';
    this._mapKey = '';
    this._mapTimer = 0;
    this._countdownValue = null;
    this.countdownEl = document.createElement('div');
    this.countdownEl.className = 'race-countdown';
    this.el.appendChild(this.countdownEl);
    this.collectTotal = world.collectibles.length || 24;
    const totalSmall = document.querySelector('#collect-count + small');
    if (totalSmall) totalSmall.textContent = '/ ' + this.collectTotal;
  }

  show(on) {
    this.el.classList.toggle('active', on);
  }

  setInteraction(show, title = '', sub = '') {
    const el = $('interaction');
    if (!el) return;
    el.classList.toggle('show', show);
    if (show) { $('interaction-title').textContent = title; $('interaction-sub').textContent = sub; }
  }

  setRacePrompt(show, title = '', sub = '') {
    const el = $('race-enter');
    if (!el) return;
    el.classList.toggle('show', show);
    if (show) { $('race-enter-title').textContent = title; el.querySelector('small').textContent = sub; }
  }

  update(dt, player, race) {
    this.updateWorldInfo(player);
    if (player) this.drawSpeedo(player);
    this._mapTimer += dt;
    if (this._mapTimer > 0.06) { this._mapTimer = 0; this.drawMinimap(player, race); }
    this.updateRace(race, player);
  }

  updateWorldInfo(player) {
    if (!player) return;
    const region = this.world.regionAt(player.pos.x, player.pos.z);
    if (region !== this._region) {
      this._region = region;
      $('region-name').textContent = region;
      $('minimap-region').textContent = region.toUpperCase();
    }
    const hour = this.engine.hour;
    const hh = Math.floor(hour);
    const mm = Math.floor((hour - hh) * 60);
    const time = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    if (time !== this._time) { this._time = time; $('time-of-day').textContent = time; }
    const weather = this.engine.weather === 'rain' ? 'RAIN' : 'CLEAR';
    if (weather !== this._weather) { this._weather = weather; $('weather-label').textContent = weather; }
    const collected = this.world.collectibles.filter(c => c.userData.collected).length;
    if (collected !== this._collected) {
      this._collected = collected;
      $('collect-count').textContent = collected;
    }
    const carName = player.vehicle.name;
    if (carName !== this._carName) {
      this._carName = carName;
      $('hud-car-name').textContent = carName;
      $('hud-car-class').textContent = player.vehicle.category.toUpperCase();
    }
  }

  updateRace(race, player) {
    const hud = $('race-hud');
    if (!race || race.state === 'idle' || !race.event || race.state === 'finished') {
      hud.classList.remove('show');
      this.countdownEl.classList.remove('show');
      this._countdownValue = null;
      return;
    }
    const info = race.getHud();
    if (!info) return;
    hud.classList.add('show');
    $('race-label').textContent = info.label;
    $('race-timer').textContent = formatTime(info.state === 'racing' ? info.time : 0);
    $('race-cp').textContent = info.state === 'countdown' ? 'GET READY' :
      (info.cp >= info.total ? 'FINAL GATE' : `CHECKPOINT ${info.cp} / ${info.total}`);
    $('race-dist').textContent = info.distance > 999 ? (info.distance / 1000).toFixed(2) + ' km' : Math.round(info.distance) + ' m';
    $('race-progress').style.width = (info.progress * 100).toFixed(1) + '%';

    let label = null;
    if (info.state === 'countdown') label = info.countdown > 0.35 ? String(Math.ceil(info.countdown)) : 'GO';
    if (label !== this._countdownValue) {
      this._countdownValue = label;
      if (label) {
        this.countdownEl.textContent = label;
        this.countdownEl.classList.add('show');
        this.countdownEl.classList.toggle('go', label === 'GO');
      } else {
        this.countdownEl.classList.remove('show');
      }
    }
  }

  drawSpeedo(player) {
    const c = this.speedCanvas;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = c.clientWidth || 220;
    const h = c.clientHeight || 220;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
    const ctx = this.ctxSpeed;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2 + h * 0.03;
    const r = Math.min(w, h) * 0.41;
    const start = Math.PI * 0.75;
    const end = Math.PI * 2.25;
    const sweep = end - start;
    const speed = clamp(player.speedKmh, 0, 400);
    const top = 400;
    const frac = speed / top;

    // glass disc
    const disc = ctx.createRadialGradient(cx, cy - r * 0.2, r * 0.1, cx, cy, r * 1.2);
    disc.addColorStop(0, 'rgba(18,25,31,.82)');
    disc.addColorStop(1, 'rgba(6,9,12,.7)');
    ctx.fillStyle = disc;
    ctx.beginPath(); ctx.arc(cx, cy, r * 1.16, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.11)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // ticks
    ctx.save();
    ctx.translate(cx, cy);
    for (let s = 0; s <= top; s += 20) {
      const a = start + (s / top) * sweep;
      const major = s % 100 === 0;
      const inner = r * (major ? 0.80 : 0.87);
      const outer = r * 0.94;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
      ctx.lineTo(Math.cos(a) * outer, Math.sin(a) * outer);
      ctx.strokeStyle = s <= 200 ? 'rgba(230,238,242,.55)' : 'rgba(255,120,70,.62)';
      ctx.lineWidth = major ? 1.8 : 0.9;
      ctx.stroke();
      if (major) {
        ctx.fillStyle = 'rgba(210,220,226,.55)';
        ctx.font = '600 8px "Chakra Petch", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(s), Math.cos(a) * r * 0.69, Math.sin(a) * r * 0.69);
      }
    }
    ctx.restore();

    // active arc
    const grad = ctx.createLinearGradient(cx - r, cy, cx + r, cy);
    grad.addColorStop(0, '#ffb648');
    grad.addColorStop(0.55, '#ff5a12');
    grad.addColorStop(1, '#35e6ff');
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.985, start, start + sweep * clamp(frac, 0.001, 1));
    ctx.strokeStyle = grad;
    ctx.lineWidth = 3.4;
    ctx.lineCap = 'round';
    ctx.shadowColor = '#ff5a12';
    ctx.shadowBlur = 14;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // needle
    const angle = start + sweep * frac;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(-r * 0.12, -2);
    ctx.lineTo(r * 0.72, 0);
    ctx.lineTo(-r * 0.12, 2);
    ctx.closePath();
    ctx.fillStyle = '#ff7a30';
    ctx.shadowColor = '#ff5a12';
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.restore();

    // hub
    ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#0b0f13'; ctx.fill();
    ctx.strokeStyle = '#ff7a30'; ctx.lineWidth = 1.4; ctx.stroke();

    // digits
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f4f7f8';
    ctx.font = '700 30px "Chakra Petch", sans-serif';
    ctx.fillText(String(Math.round(speed)), cx, cy + r * 0.40);
    ctx.fillStyle = 'rgba(190,201,208,.75)';
    ctx.font = '600 7px "Chakra Petch", sans-serif';
    ctx.fillText('KM/H', cx, cy + r * 0.56);

    // gear + rpm
    ctx.fillStyle = '#ff5a12';
    ctx.font = '700 13px "Chakra Petch", sans-serif';
    ctx.fillText(player.vehicle.gears > 1 ? String(player.gear) : 'D', cx, cy + r * 0.85);
    ctx.fillStyle = 'rgba(255,255,255,.35)';
    ctx.font = '500 6px "Chakra Petch", sans-serif';
    ctx.fillText('GEAR', cx, cy + r * 0.98);
    const rpmFrac = clamp((player.rpm - 800) / 7200, 0, 1);
    const bw = r * 1.14;
    ctx.fillStyle = 'rgba(255,255,255,.1)';
    ctx.fillRect(cx - bw / 2, cy + r * 0.68, bw, 2);
    ctx.fillStyle = rpmFrac > 0.86 ? '#ff3b2f' : '#35e6ff';
    ctx.fillRect(cx - bw / 2, cy + r * 0.68, bw * rpmFrac, 2);
  }

  drawMinimap(player, race) {
    const c = this.minimap;
    if (!player || !this.world.mapCanvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = c.clientWidth || 170, h = c.clientHeight || 170;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
      c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    }
    const ctx = this.ctxMap;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.beginPath(); ctx.arc(w / 2, h / 2, Math.min(w, h) / 2, 0, Math.PI * 2); ctx.clip();

    const half = this.world.half;
    const span = 1700;
    const scale = this.world.mapCanvas.width / (half * 2);
    const sx = (player.pos.x + half) * scale - (span / 2) * scale;
    const sy = (player.pos.z + half) * scale - (span / 2) * scale;
    const sw = span * scale;
    ctx.fillStyle = '#14262c';
    ctx.fillRect(0, 0, w, h);
    try {
      ctx.drawImage(this.world.mapCanvas, sx, sy, sw, sw, 0, 0, w, h);
    } catch (_) { /* map not ready */ }

    const toX = x => ((x - player.pos.x) / span + 0.5) * w;
    const toY = z => ((z - player.pos.z) / span + 0.5) * h;
    // event gates
    for (const e of this.world.events) {
      const x = toX(e.start.x), y = toY(e.start.z);
      if (x < 0 || x > w || y < 0 || y > h) continue;
      ctx.beginPath(); ctx.arc(x, y, 3.2, 0, Math.PI * 2);
      ctx.fillStyle = '#ff5a12'; ctx.fill();
      ctx.strokeStyle = 'rgba(255,90,18,.4)'; ctx.lineWidth = 3; ctx.stroke();
    }
    // collectibles
    for (const col of this.world.collectibles) {
      if (col.userData.collected) continue;
      const x = toX(col.position.x), y = toY(col.position.z);
      if (x < 0 || x > w || y < 0 || y > h) continue;
      ctx.beginPath(); ctx.arc(x, y, 2.1, 0, Math.PI * 2);
      ctx.fillStyle = '#ffb648'; ctx.fill();
    }
    // next race checkpoint
    if (race && race.state === 'racing' && race.event) {
      const p = race.event.points[race.cpIndex];
      if (p) {
        const x = toX(p.x), y = toY(p.z);
        if (x > 0 && x < w && y > 0 && y < h) {
          ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2);
          ctx.strokeStyle = '#35e6ff'; ctx.lineWidth = 2; ctx.stroke();
        }
      }
    }

    // player arrow
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(Math.PI - player.heading);
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 6);
    ctx.lineTo(0, 3.2);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fillStyle = '#35e6ff';
    ctx.shadowColor = '#35e6ff';
    ctx.shadowBlur = 8;
    ctx.fill();
    ctx.restore();
    ctx.restore();

    // ring
    ctx.beginPath(); ctx.arc(w / 2, h / 2, Math.min(w, h) / 2 - 1, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,.08)'; ctx.lineWidth = 1; ctx.stroke();
  }

  toast(text, type = '', icon = 'star') {
    const wrap = $('toasts');
    if (!wrap) return;
    while (wrap.children.length > 3) wrap.firstChild.remove();
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.innerHTML = `<svg><use href="#i-${icon}"/></svg><div>${text}</div>`;
    wrap.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 350);
    }, 3400);
  }
}
