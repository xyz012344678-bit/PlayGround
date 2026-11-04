import * as THREE from 'three';
import { createCarModel } from '../vehicles/carModel.js';
import { CATEGORIES, VEHICLES, PAINT_COLORS, RIM_STYLES, RIM_COLORS, getVehicle, vehiclePerformance } from '../vehicles/vehicles.js';
import { clamp, formatNumber } from '../core/noise.js';

const $ = id => document.getElementById(id);
const ACCENTS = [0x111417, 0xff5a12, 0x35e6ff, 0xf2f0e4, 0xffb648, 0xc41d22, 0x22c7d8, 0x8a9095];
const UPGRADE_BASE = { engine: 18000, brakes: 12000, suspension: 15000, turbo: 20000 };

export class GarageUI {
  constructor(engine, save, callbacks = {}) {
    this.engine = engine;
    this.save = save;
    this.callbacks = callbacks;
    this.el = $('garage');
    this.active = false;
    this.filter = 'All';
    this.selectedId = null;
    this.drag = null;
    this.autoRotate = true;
    this.zoom = 1;
    this.turntableAngle = 0;
    this._buildScene();
    this._bind();
    this._buildFilters();
    this._buildSwatches();
    this._buildRims();
  }

  _buildScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05070a);
    this.scene.environment = this.engine.envSunset;
    this.scene.environmentIntensity = 1.1;
    this.scene.fog = new THREE.Fog(0x05070a, 18, 46);
    this.camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 120);
    this.camera.position.set(4.6, 2.8, 7.2);
    this.camera.lookAt(0, 0.9, 0);

    // backdrop gradient
    const bg = new THREE.Mesh(
      new THREE.SphereGeometry(48, 32, 20),
      new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false, fog: false,
        vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: `varying vec3 vP; void main(){
          float h = normalize(vP).y;
          vec3 top = vec3(.010,.016,.023);
          vec3 mid = vec3(.037,.053,.066);
          vec3 low = vec3(.008,.011,.014);
          vec3 c = mix(low, mid, smoothstep(-.35,.12,h));
          c = mix(c, top, smoothstep(.12,.7,h));
          float glow = exp(-abs(h-.02)*20.0);
          c += vec3(.10,.035,.008) * glow * .55;
          gl_FragColor = vec4(c,1.0);
        }`,
      }),
    );
    this.scene.add(bg);

    const floorMat = new THREE.MeshStandardMaterial({ color: 0x0c1115, roughness: 0.3, metalness: 0.62, envMapIntensity: 1.2 });
    const floor = new THREE.Mesh(new THREE.CircleGeometry(16, 72), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    const grid = new THREE.GridHelper(30, 30, 0x27323b, 0x141b21);
    grid.position.y = 0.012;
    grid.material.transparent = true;
    grid.material.opacity = 0.35;
    this.scene.add(grid);

    // lit turntable
    this.turntable = new THREE.Group();
    this.scene.add(this.turntable);
    const platform = new THREE.Mesh(
      new THREE.CylinderGeometry(3.35, 3.55, 0.12, 72),
      new THREE.MeshStandardMaterial({ color: 0x141b20, roughness: 0.24, metalness: 0.8 }),
    );
    platform.position.y = 0.06;
    platform.receiveShadow = true;
    this.turntable.add(platform);
    const plinthRing = new THREE.Mesh(
      new THREE.TorusGeometry(3.38, 0.025, 6, 96),
      new THREE.MeshStandardMaterial({ color: 0xff5a12, emissive: 0xff4a00, emissiveIntensity: 2.4 }),
    );
    plinthRing.rotation.x = Math.PI / 2;
    plinthRing.position.y = 0.13;
    this.turntable.add(plinthRing);
    const plinthRing2 = new THREE.Mesh(
      new THREE.TorusGeometry(2.1, 0.012, 5, 80),
      new THREE.MeshStandardMaterial({ color: 0x35e6ff, emissive: 0x35e6ff, emissiveIntensity: 1.8 }),
    );
    plinthRing2.rotation.x = Math.PI / 2;
    plinthRing2.position.y = 0.132;
    this.turntable.add(plinthRing2);
    this.carHolder = new THREE.Group();
    this.turntable.add(this.carHolder);

    this.scene.add(new THREE.HemisphereLight(0x9db7c9, 0x1b1511, 0.9));
    const key = new THREE.SpotLight(0xfff0df, 130, 26, 0.62, 0.55, 1.5);
    key.position.set(-3.5, 8.5, 5.2);
    key.target.position.set(0, 0.6, 0);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.bias = -0.0008;
    this.scene.add(key, key.target);
    const fill = new THREE.PointLight(0x35e6ff, 28, 20, 1.6);
    fill.position.set(6, 2.2, -3.2);
    this.scene.add(fill);
    const rim = new THREE.SpotLight(0xff5a12, 120, 24, 0.55, 0.6, 1.4);
    rim.position.set(4.5, 4.5, -6);
    rim.target.position.set(0, 1, 0);
    this.scene.add(rim, rim.target);
    const front = new THREE.PointLight(0xffd9b0, 20, 18, 1.5);
    front.position.set(0, 1.3, 7);
    this.scene.add(front);

    // vertical light bars
    for (const s of [-1, 1]) {
      const bar = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 4.6, 0.06),
        new THREE.MeshStandardMaterial({ color: s < 0 ? 0xff5a12 : 0x35e6ff, emissive: s < 0 ? 0xff4a00 : 0x35e6ff, emissiveIntensity: 2.4 }),
      );
      bar.position.set(s * 8.4, 2.3, -7.5);
      this.scene.add(bar);
    }
  }

  _bind() {
    $('garage-back').addEventListener('click', () => { if (this.callbacks.onExit) this.callbacks.onExit(); });
    this.el.addEventListener('pointerdown', (e) => {
      if (e.target !== this.el) return;
      this.drag = { x: e.clientX, id: e.pointerId, angle: this.turntableAngle };
      this.autoRotate = false;
      try { this.el.setPointerCapture(e.pointerId); } catch (_) { /* noop */ }
    });
    this.el.addEventListener('pointermove', (e) => {
      if (!this.drag || this.drag.id !== e.pointerId) return;
      this.turntableAngle = this.drag.angle + (e.clientX - this.drag.x) * 0.009;
    });
    const end = () => { this.drag = null; };
    this.el.addEventListener('pointerup', end);
    this.el.addEventListener('pointercancel', end);
    this.el.addEventListener('dblclick', (e) => {
      if (e.target !== this.el) return;
      this.turntableAngle = 0;
      this.zoom = 1;
      this.autoRotate = true;
    });
    this.el.addEventListener('wheel', (e) => {
      if (e.target.closest('.garage-left,.garage-right')) return;
      e.preventDefault();
      this.zoom = clamp(this.zoom + (e.deltaY > 0 ? 0.08 : -0.08), 0.62, 1.6);
    }, { passive: false });
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
    });
    $('garage-select').addEventListener('click', () => {
      if (this._owned(this.selectedId)) {
        if (this.callbacks.onDrive) this.callbacks.onDrive(this.selectedId);
      } else if (this._buy(this.selectedId)) {
        if (this.callbacks.onDrive) this.callbacks.onDrive(this.selectedId);
      }
    });
    $('garage-buy').addEventListener('click', () => this._buy(this.selectedId));
    $('garage-fav').addEventListener('click', () => this._toggleFav());
    document.querySelectorAll('.custom-tabs button').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.custom-tabs button').forEach(b => b.classList.toggle('active', b === btn));
        document.querySelectorAll('.custom-panel').forEach(p => p.classList.toggle('active', p.dataset.panel === btn.dataset.tab));
      });
    });
    $('ride-height').addEventListener('input', (e) => {
      const l = this._loadout(this.selectedId);
      l.rideHeight = Number(e.target.value);
      $('ride-height-val').textContent = l.rideHeight;
      if (this.model) this.model.setRideHeight(l.rideHeight);
      this._saveLoadout();
    });
    $('camber').addEventListener('input', (e) => {
      const l = this._loadout(this.selectedId);
      l.camber = Number(e.target.value);
      $('camber-val').textContent = l.camber;
      if (this.model) {
        const rad = l.camber * Math.PI / 180;
        this.model.wheels.forEach(w => { w.camber = rad; w.steerRoot.rotation.z = rad; });
      }
      this._saveLoadout();
    });
    document.querySelectorAll('.up-btn').forEach(btn => btn.addEventListener('click', () => {
      const type = btn.id.replace('up-', '').replace('-btn', '').replace('susp', 'suspension');
      this._upgrade(type);
    }));
    document.querySelectorAll('#paint-finishes button').forEach(btn => {
      btn.addEventListener('click', () => {
        const l = this._loadout(this.selectedId);
        l.finish = btn.dataset.finish;
        document.querySelectorAll('#paint-finishes button').forEach(b => b.classList.toggle('active', b === btn));
        if (this.model) this.model.setPaint(l.paint, l.finish);
        this._saveLoadout();
      });
    });
  }

  _buildFilters() {
    const wrap = $('garage-filters');
    wrap.innerHTML = '';
    for (const c of CATEGORIES) {
      const b = document.createElement('button');
      b.textContent = c.toUpperCase();
      b.dataset.cat = c;
      b.classList.toggle('active', c === this.filter);
      b.addEventListener('click', () => {
        this.filter = c;
        wrap.querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
        this._renderList();
      });
      wrap.appendChild(b);
    }
  }

  _buildSwatches() {
    const wrap = $('paint-swatches');
    wrap.innerHTML = '';
    PAINT_COLORS.forEach((p) => {
      const b = document.createElement('button');
      b.className = 'swatch';
      b.style.background = '#' + p.hex.toString(16).padStart(6, '0');
      b.title = p.name;
      b.dataset.hex = p.hex;
      b.addEventListener('click', () => {
        const l = this._loadout(this.selectedId);
        l.paint = p.hex;
        l.finish = p.finish;
        if (this.model) this.model.setPaint(p.hex, p.finish);
        $('paint-name').textContent = p.name;
        document.querySelectorAll('#paint-swatches .swatch').forEach(x => x.classList.toggle('active', x === b));
        document.querySelectorAll('#paint-finishes button').forEach(x => x.classList.toggle('active', x.dataset.finish === p.finish));
        this._saveLoadout();
      });
      wrap.appendChild(b);
    });
    const accents = $('paint-accents');
    accents.innerHTML = '';
    ACCENTS.forEach((hex) => {
      const b = document.createElement('button');
      b.style.background = '#' + hex.toString(16).padStart(6, '0');
      b.dataset.hex = hex;
      b.addEventListener('click', () => {
        const l = this._loadout(this.selectedId);
        l.accent = hex;
        if (this.model) this.model.setAccent(hex);
        accents.querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
        this._saveLoadout();
      });
      accents.appendChild(b);
    });
    const rimWrap = $('rim-swatches');
    rimWrap.innerHTML = '';
    RIM_COLORS.forEach((c) => {
      const b = document.createElement('button');
      b.className = 'swatch';
      b.style.background = '#' + c.hex.toString(16).padStart(6, '0');
      b.title = c.name;
      b.dataset.hex = c.hex;
      b.addEventListener('click', () => {
        const l = this._loadout(this.selectedId);
        l.rimColor = c.hex;
        if (this.model) this.model.setRimColor(c.hex);
        rimWrap.querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
        this._saveLoadout();
      });
      rimWrap.appendChild(b);
    });
  }

  _buildRims() {
    const wrap = $('rim-list');
    wrap.innerHTML = '';
    for (const r of RIM_STYLES) {
      const b = document.createElement('button');
      b.className = 'rim-item';
      b.dataset.rim = r.id;
      b.innerHTML = `<svg><use href="#i-wheel"/></svg><div><b>${r.name.toUpperCase()}</b><small>${r.spokes ? r.spokes + ' SPOKE' : 'DISC'}</small></div>`;
      b.addEventListener('click', () => {
        const l = this._loadout(this.selectedId);
        l.rimStyle = r.id;
        this._saveLoadout();
        this._renderCar();
        this._syncRimList();
      });
      wrap.appendChild(b);
    }
  }

  _owned(id) {
    const v = getVehicle(id);
    return v.price === 0 || this.save.owned.includes(id);
  }

  _loadout(id) {
    const v = getVehicle(id);
    if (!this.save.loadouts) this.save.loadouts = {};
    if (!this.save.loadouts[id]) {
      this.save.loadouts[id] = {
        paint: v.color, finish: v.finish || 'metallic', rimStyle: v.body === 'offroad' || v.body === 'pickup' ? 'offroad' : 'split5',
        rimColor: 0x15171a, accent: undefined, rideHeight: 0, camber: -1,
        upgrades: { engine: 0, brakes: 0, suspension: 0, turbo: 0 },
      };
    }
    const l = this.save.loadouts[id];
    l.upgrades = l.upgrades || { engine: 0, brakes: 0, suspension: 0, turbo: 0 };
    return l;
  }

  _saveLoadout() {
    if (this.callbacks.persist) this.callbacks.persist();
  }

  _upgrade(type) {
    const l = this._loadout(this.selectedId);
    const lvl = l.upgrades[type] || 0;
    if (lvl >= 3) return;
    const cost = Math.round(UPGRADE_BASE[type] * (1 + lvl * 0.8));
    if (this.save.credits < cost) {
      if (this.callbacks.toast) this.callbacks.toast('Not enough credits for that upgrade.', '', 'lock');
      return;
    }
    this.save.credits -= cost;
    l.upgrades[type] = lvl + 1;
    this._saveLoadout();
    if (this.callbacks.audio) this.callbacks.audio.ui();
    if (this.callbacks.toast) this.callbacks.toast(`<b>${type.toUpperCase()}</b> upgraded to stage ${lvl + 1}.`, 'cyan', 'check');
    this._updateMeta();
    this._renderStats(getVehicle(this.selectedId));
  }

  _buy(id) {
    if (this._owned(id)) return true;
    const v = getVehicle(id);
    if (this.save.credits < v.price) {
      if (this.callbacks.toast) this.callbacks.toast(`You need <b>C ${formatNumber(v.price - this.save.credits)}</b> more.`, '', 'lock');
      return false;
    }
    this.save.credits -= v.price;
    this.save.owned.push(id);
    this._saveLoadout();
    if (this.callbacks.audio) this.callbacks.audio.collect();
    if (this.callbacks.toast) this.callbacks.toast(`<b>${v.name}</b> added to your collection.`, 'gold', 'garage');
    this._updateMeta();
    this._renderList();
    this._renderStats(v);
    this._updateButtons();
    return true;
  }

  _toggleFav() {
    const id = this.selectedId;
    const arr = this.save.favourites || (this.save.favourites = []);
    const i = arr.indexOf(id);
    if (i >= 0) arr.splice(i, 1); else arr.push(id);
    this._saveLoadout();
    $('garage-fav').classList.toggle('active', arr.includes(id));
    this._renderList();
  }

  open(preferredId) {
    this.active = true;
    this._resize();
    this.filter = 'All';
    this.el.querySelectorAll('#garage-filters button').forEach(b => b.classList.toggle('active', b.dataset.cat === 'All'));
    this.selectedId = preferredId || this.selectedId || this.save.current;
    this.turntableAngle = -0.55;
    this.autoRotate = true;
    this.zoom = 1;
    this._renderList();
    this._select(preferredId || this.selectedId, true);
    this._updateMeta();
    this.draw(0);
  }

  close() { this.active = false; this.drag = null; }

  _resize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }

  _select(id, rebuild = true) {
    this.selectedId = id;
    if (rebuild) this._renderCar();
    const v = getVehicle(id);
    const l = this._loadout(id);
    $('garage-tag').textContent = v.category.toUpperCase();
    $('garage-car-name').textContent = v.name;
    $('garage-car-sub').textContent = `${v.drivetrain} drive · ${v.gears > 1 ? v.gears + '-speed' : 'single-speed'} · ${v.engine.note}`;
    $('paint-name').textContent = (PAINT_COLORS.find(p => p.hex === l.paint) || PAINT_COLORS[0]).name;
    $('ride-height').value = l.rideHeight;
    $('ride-height-val').textContent = l.rideHeight;
    $('camber').value = l.camber;
    $('camber-val').textContent = l.camber;
    this._renderStats(v);
    this._updateButtons();
    this._syncSwatches();
    this._syncRimList();
    this._syncUpgrades();
    $('garage-fav').classList.toggle('active', (this.save.favourites || []).includes(id));
    const cards = this.el.querySelectorAll('.car-card');
    cards.forEach(c => {
      const active = c.dataset.id === id;
      c.classList.toggle('active', active);
      if (active) c.scrollIntoView({ block: 'nearest' });
    });
  }

  _renderCar() {
    const v = getVehicle(this.selectedId);
    const l = this._loadout(this.selectedId);
    if (this.model) {
      this.carHolder.remove(this.model.root);
      this.model.dispose();
    }
    this.model = createCarModel(v, {
      paint: l.paint, finish: l.finish, rimStyle: l.rimStyle, rimColor: l.rimColor,
      accent: l.accent, camber: l.camber,
    });
    this.model.setRideHeight(l.rideHeight);
    this.model.root.position.y = 0.13;
    this.model.root.traverse(o => { if (o.isMesh) o.castShadow = true; });
    this.carHolder.add(this.model.root);
    const size = this.model.dims.L;
    this.camera.position.set(size * 0.88, 2.35, size * 1.38);
    this.camera.lookAt(0, this.model.dims.H * 0.45, 0);
  }

  _renderList() {
    const wrap = $('garage-cars');
    wrap.innerHTML = '';
    const vehicles = VEHICLES;
    for (const v of vehicles) {
      if (this.filter !== 'All' && v.category !== this.filter) continue;
      const owned = this._owned(v.id);
      const b = document.createElement('button');
      b.className = 'car-card' + (v.id === this.selectedId ? ' active' : '');
      b.dataset.id = v.id;
      b.innerHTML = `<span class="car-ico"><svg viewBox="0 0 64 28"><path d="M3 20h3l4-3 8-1 7-8h16l7 8 10 1 4 3h2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><circle cx="15" cy="21" r="4" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="48" cy="21" r="4" fill="none" stroke="currentColor" stroke-width="1.7"/></svg></span>
        <span class="cc-info"><b>${v.name}</b><small>${v.category} · ${v.grade}</small></span>
        ${(this.save.favourites || []).includes(v.id) ? '<svg class="fav"><use href="#i-star"/></svg>' : ''}
        ${owned ? '<span class="owned-dot"></span>' : '<span class="lock"><svg><use href="#i-lock"/></svg></span>'}`;
      b.addEventListener('click', () => this._select(v.id));
      wrap.appendChild(b);
    }
  }

  _updateMeta() {
    $('garage-credits').textContent = formatNumber(this.save.credits);
    $('garage-owned').textContent = this.save.owned.length;
    $('menu-credits').textContent = formatNumber(this.save.credits);
    $('menu-owned').textContent = this.save.owned.length;
  }

  _renderStats(v) {
    const l = this._loadout(v.id);
    const perf = vehiclePerformance(v, l.upgrades);
    $('stat-power').textContent = formatNumber(perf.hp);
    $('stat-top').textContent = Math.round(perf.top);
    $('stat-accel').textContent = perf.accel.toFixed(1);
    $('stat-weight').textContent = formatNumber(perf.weight);
    $('bar-accel').style.width = clamp((8.5 - perf.accel) / 6.2 * 100, 4, 100) + '%';
    $('bar-handling').style.width = clamp(perf.handling * 100, 4, 100) + '%';
    $('bar-braking').style.width = clamp(perf.braking * 100, 4, 100) + '%';
    $('bar-drift').style.width = clamp(v.drift * 100, 4, 100) + '%';
    this._updateButtons(perf);
  }

  _updateButtons(perf) {
    const id = this.selectedId;
    const v = getVehicle(id);
    const owned = this._owned(id);
    $('garage-buy').classList.toggle('hidden', owned);
    $('garage-buy-label').textContent = `BUY · C ${formatNumber(v.price)}`;
    $('garage-select').querySelector('span').textContent = owned ? 'SELECT & DRIVE' : 'BUY & DRIVE';
    $('garage-fav').classList.toggle('active', (this.save.favourites || []).includes(id));
  }

  _syncSwatches() {
    const l = this._loadout(this.selectedId);
    document.querySelectorAll('#paint-swatches .swatch').forEach(b => b.classList.toggle('active', Number(b.dataset.hex) === l.paint));
    document.querySelectorAll('#paint-finishes button').forEach(b => b.classList.toggle('active', b.dataset.finish === l.finish));
    document.querySelectorAll('#paint-accents button').forEach(b => b.classList.toggle('active', Number(b.dataset.hex) === l.accent));
    document.querySelectorAll('#rim-swatches .swatch').forEach(b => b.classList.toggle('active', Number(b.dataset.hex) === l.rimColor));
  }

  _syncRimList() {
    const l = this._loadout(this.selectedId);
    document.querySelectorAll('#rim-list .rim-item').forEach(b => b.classList.toggle('active', b.dataset.rim === (l.rimStyle || 'split5')));
  }

  _syncUpgrades() {
    const l = this._loadout(this.selectedId);
    const map = { engine: 'engine', brakes: 'brakes', suspension: 'susp', turbo: 'turbo' };
    for (const [type, short] of Object.entries(map)) {
      const lvl = l.upgrades[type] || 0;
      const label = lvl === 0 ? 'STOCK' : `STAGE ${lvl}`;
      $(`up-${short}-lvl`).textContent = label;
      const btn = $(`up-${short}-btn`);
      if (lvl >= 3) {
        btn.textContent = 'MAXED';
        btn.disabled = true;
      } else {
        const cost = Math.round(UPGRADE_BASE[type] * (1 + lvl * 0.8));
        btn.textContent = `UPGRADE · ${formatNumber(cost)}`;
        btn.disabled = this.save.credits < cost;
      }
    }
  }

  draw(dt = 0) {
    if (!this.active) return;
    if (this.autoRotate && !this.drag) this.turntableAngle += dt * 0.16;
    this.turntable.rotation.y = this.turntableAngle;
    // subtle turntable bob for the showcase
    this.carHolder.position.y = Math.sin(performance.now() * 0.0007) * 0.012;
    const size = this.model ? this.model.dims.L : 4.7;
    const dist = size * 1.38 * this.zoom;
    const height = 2.35 * Math.max(0.85, this.zoom);
    this.camera.position.set(Math.sin(0.62) * dist, height, Math.cos(0.62) * dist);
    this.camera.lookAt(0, (this.model?.dims.H || 1.2) * 0.45, 0);
    this.engine.render(this.scene, this.camera);
  }

  refreshCredits() { this._updateMeta(); this._syncUpgrades(); }
}
