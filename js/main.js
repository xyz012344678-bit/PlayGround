import * as THREE from 'three';
import { Engine } from './core/engine.js';
import { World } from './world/world.js';
import { getVehicle, vehiclePerformance } from './vehicles/vehicles.js';
import { PlayerVehicle } from './vehicles/physics.js';
import { Input } from './game/input.js';
import { AudioSystem } from './game/audio.js';
import { EffectsSystem } from './game/effects.js';
import { RaceManager } from './game/race.js';
import { TrafficSystem } from './game/traffic.js';
import { HUD } from './ui/hud.js';
import { WorldMapUI } from './ui/map.js';
import { GarageUI } from './ui/garage.js';
import { clamp, formatNumber, formatTime } from './core/noise.js';

const SAVE_KEY = 'apex-horizon-save-v1';
const BASE_SCREENS = ['loading', 'menu', 'garage', 'map-screen'];
const OVERLAYS = ['settings', 'help', 'pause', 'results'];
const isTouchDevice = () => window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

const $ = (id) => document.getElementById(id);

class App {
  constructor() {
    this.canvas = $('gl');
    this.engine = new Engine(this.canvas);
    this.world = new World(this.engine);
    this.save = null;
    this.input = null;
    this.audio = null;
    this.effects = null;
    this.traffic = null;
    this.player = null;
    this.race = null;
    this.hud = null;
    this.map = null;
    this.garage = null;

    this.base = 'loading';
    this.modal = null;
    this.overlayReturn = null;
    this.interactRequested = false;
    this.nearEvent = null;
    this.nearGarage = false;
    this.garageReturn = 'menu';
    this.mapReturn = 'menu';
    this.lastEvent = null;
    this.lastResult = null;
    this.menuAngle = 0.6;
    this.timeAccumulator = 0;
    this.collectTimer = 0;
    this.saveTimer = 0;
    this.clock = new THREE.Clock();
    this.elapsed = 0;
    this.ready = false;
    this._menuCarId = null;
    if (new URLSearchParams(location.search).has('debug')) window.__APEX = this;

    this.bindUI();
    this.boot().catch((err) => {
      console.error(err);
      this.setLoading(0, 'Unable to start the engine — check the console');
      const step = $('load-step');
      if (step) step.textContent = 'Startup error: ' + (err?.message || err);
    });
  }

  // ------------------------------------------------------------------ save
  defaultSave(quality) {
    return {
      credits: 150000,
      owned: ['apex-gtr', 'kestrel-rs', 'trailblazer-4x4'],
      current: 'apex-gtr',
      favourites: ['apex-gtr'],
      loadouts: {},
      bestTimes: {},
      wins: 0,
      distance: 0,
      topSpeed: 0,
      collected: [],
      lastPos: null,
      settings: {
        quality,
        shadows: true,
        motion: true,
        assist: true,
        manual: false,
        sens: 100,
        touch: isTouchDevice(),
        audio: true,
        daynight: true,
        weather: 'clear',
        time: 17.25,
      },
    };
  }

  loadSave(defaultQuality) {
    const defaults = this.defaultSave(defaultQuality);
    let parsed = null;
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) parsed = JSON.parse(raw);
    } catch (_) { /* corrupt or blocked storage */ }
    if (!parsed || typeof parsed !== 'object') return defaults;

    const save = {
      ...defaults,
      ...parsed,
      owned: Array.isArray(parsed.owned) ? parsed.owned.filter(id => getVehicle(id).id === id) : defaults.owned,
      favourites: Array.isArray(parsed.favourites) ? parsed.favourites : defaults.favourites,
      bestTimes: parsed.bestTimes && typeof parsed.bestTimes === 'object' ? parsed.bestTimes : {},
      loadouts: parsed.loadouts && typeof parsed.loadouts === 'object' ? parsed.loadouts : {},
      collected: Array.isArray(parsed.collected) ? [...new Set(parsed.collected.map(Number))].filter(n => Number.isInteger(n)) : [],
      settings: { ...defaults.settings, ...(parsed.settings || {}) },
    };
    save.credits = Number.isFinite(Number(save.credits)) ? Math.max(0, Number(save.credits)) : defaults.credits;
    save.wins = Number.isFinite(Number(save.wins)) ? Number(save.wins) : 0;
    save.distance = Number.isFinite(Number(save.distance)) ? Number(save.distance) : 0;
    save.topSpeed = Number.isFinite(Number(save.topSpeed)) ? Number(save.topSpeed) : 0;
    save.sens = undefined;
    if (!save.owned.length) save.owned = defaults.owned.slice();
    for (const freeId of ['apex-gtr', 'kestrel-rs', 'trailblazer-4x4']) {
      if (!save.owned.includes(freeId)) save.owned.push(freeId);
    }
    const current = getVehicle(save.current);
    save.current = save.owned.includes(current.id) || current.price === 0 ? current.id : save.owned[0];
    return save;
  }

  saveGame() {
    if (!this.save) return;
    if (this.player) {
      this.save.lastPos = {
        x: Number(this.player.pos.x.toFixed(2)),
        z: Number(this.player.pos.z.toFixed(2)),
        heading: Number(this.player.heading.toFixed(4)),
      };
    }
    if (this.engine) this.save.settings.time = Number(this.engine.hour.toFixed(3));
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.save));
    } catch (_) { /* storage may be disabled */ }
  }

  scheduleSave(delay = 600) {
    if (this._saveTimeout) clearTimeout(this._saveTimeout);
    this._saveTimeout = setTimeout(() => this.saveGame(), delay);
  }

  // ------------------------------------------------------------------ boot
  async boot() {
    const tips = [
      'Use the handbrake mid-corner to start a drift, then feather the throttle to hold it.',
      'Fast travel is free: open the map and tap any point on the island.',
      'Every car has its own engine note, gearbox, grip and top speed.',
      'Golden gears are hidden across all six regions — each one pays credits.',
      'Rain reduces grip. Switch weather in Settings to practise wet-weather lines.',
      'Press C to cycle chase, near, hood, cockpit and cinematic cameras.',
      'The Horizon Ring circles the whole island. It is the fastest way between regions.',
      'Buy upgrades in the garage: engine, brakes, suspension and turbo each change the physics.',
    ];
    const tipEl = $('load-tip');
    if (tipEl) tipEl.textContent = tips[Math.floor(Math.random() * tips.length)];

    const qualityParam = new URLSearchParams(window.location.search).get('quality');
    this.save = this.loadSave(this.engine.quality);
    if (['low', 'medium', 'high', 'ultra'].includes(qualityParam)) {
      this.save.settings.quality = qualityParam;
    }

    await this.world.generate(async (pct, step) => {
      this.setLoading(pct, step);
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });

    this.setLoading(99, 'Fuelling the festival');
    await new Promise(resolve => requestAnimationFrame(resolve));

    this.save.collected = this.save.collected.filter(id => id >= 0 && id < this.world.collectibles.length);
    this.world.restoreCollected(this.save.collected);

    this.input = new Input();
    this.audio = new AudioSystem();
    this.traffic = new TrafficSystem(this.world, this.engine, isTouchDevice() ? 34 : 46);
    this.world.traffic = this.traffic;
    this.effects = new EffectsSystem(this.world.scene, this.engine, this.world);

    const vehicle = getVehicle(this.save.current);
    const loadout = this.getLoadout(vehicle.id);
    this.player = new PlayerVehicle(this.world, this.engine, vehicle, loadout);
    this.player.traffic = this.traffic;
    this.player.audio = this.audio;
    this.player.setInputRef(this.input);
    this.player.onImpact = (strength) => this.audio.impact(strength);
    this.player.onEvent = (evt) => {
      if (evt.type === 'water') this.hud?.toast('Back on dry land. Easy on the throttle.', '', 'wheel');
    };

    this.race = new RaceManager(this.world, this.save, {
      onStart: () => {
        this.hud?.setRacePrompt(false);
        this.hud?.setInteraction(false);
      },
      onCountdown: (n) => {
        this.audio?.countdown(false);
      },
      onGo: () => {
        this.audio?.countdown(true);
      },
      onCheckpoint: () => {
        this.audio?.checkpoint();
      },
      onFinish: (result) => this.showResults(result),
    });

    this.hud = new HUD(this.world, this.engine, this.save);
    this.map = new WorldMapUI(this.world, this.save, {
      getPlayer: () => (this.player ? { x: this.player.pos.x, z: this.player.pos.z, heading: this.player.heading } : null),
      onTravel: (x, z, name) => this.fastTravel(x, z, name),
      onEvent: (event) => this.launchEvent(event),
    });
    this.garage = new GarageUI(this.engine, this.save, {
      onExit: () => this.closeGarage(),
      onDrive: (id) => this.driveFromGarage(id),
      persist: () => {
        this.saveGame();
        this.refreshMenu();
      },
      toast: (text, type, icon) => this.toast(text, type, icon),
      audio: this.audio,
    });

    this.spawnFromSave();
    this.applySettings();
    this.audio.setVehicle(this.player.vehicle);
    this.refreshMenu();
    this.refreshGarageMeta();

    this.setLoading(100, 'Ready to drive');
    await new Promise(resolve => requestAnimationFrame(resolve));

    this.ready = true;
    this.setBaseScreen('menu');
    this.clock.getDelta();

    const loading = $('loading');
    if (loading) loading.classList.add('done');
    this.loop();
  }

  spawnFromSave() {
    const fallback = this.world.spawn || { x: -1496, z: 730, heading: 0 };
    let spot = fallback;
    const last = this.save.lastPos;
    if (last && Number.isFinite(Number(last.x)) && Number.isFinite(Number(last.z))) {
      const surface = this.world.surfaceAt(Number(last.x), Number(last.z));
      if (!surface.water && surface.y > 0.8) {
        spot = { x: Number(last.x), z: Number(last.z), heading: Number(last.heading) || 0 };
      }
    }
    this.player.spawn(spot.x, spot.z, spot.heading || 0);
    this.player.lastSafe = { x: spot.x, z: spot.z, heading: spot.heading || 0 };
    this.player.cameraMode = 0;
  }

  setLoading(pct, step) {
    const p = Math.round(clamp(Number(pct) || 0, 0, 100));
    const pctEl = $('load-pct');
    if (pctEl) pctEl.innerHTML = `${p}<span>%</span>`;
    const bar = $('load-bar');
    if (bar) bar.style.width = p + '%';
    const stepEl = $('load-step');
    if (stepEl && step) stepEl.textContent = step;
  }

  // ------------------------------------------------------------------ loadout
  getLoadout(id) {
    const vehicle = getVehicle(id);
    if (!this.save.loadouts) this.save.loadouts = {};
    if (!this.save.loadouts[id]) {
      this.save.loadouts[id] = {
        paint: vehicle.color,
        finish: vehicle.finish || 'metallic',
        rimStyle: vehicle.body === 'offroad' || vehicle.body === 'pickup' ? 'offroad' : 'split5',
        rimColor: 0x15171a,
        accent: undefined,
        rideHeight: 0,
        camber: -1,
        upgrades: { engine: 0, brakes: 0, suspension: 0, turbo: 0 },
      };
    }
    const loadout = this.save.loadouts[id];
    loadout.upgrades = loadout.upgrades || { engine: 0, brakes: 0, suspension: 0, turbo: 0 };
    for (const key of ['engine', 'brakes', 'suspension', 'turbo']) {
      loadout.upgrades[key] = clamp(Number(loadout.upgrades[key]) || 0, 0, 3);
    }
    return loadout;
  }

  // ------------------------------------------------------------------ screens
  setBaseScreen(name) {
    this.base = name;
    const activeId = { loading: 'loading', menu: 'menu', garage: 'garage', map: 'map-screen' }[name];
    for (const id of BASE_SCREENS) {
      const el = $(id);
      if (el) el.classList.toggle('active', id === activeId);
    }
    if (this.hud) this.hud.show(name === 'driving' && !this.modal);
    if (this.input) this.input.setEnabled(name === 'driving' && !this.modal);
    if (name !== 'driving') {
      this.hud?.setInteraction(false);
      this.hud?.setRacePrompt(false);
    }
  }

  openOverlay(id) {
    if (!OVERLAYS.includes(id)) return;
    if (this.modal === id) return;
    if (this.modal && this.modal !== id) {
      this.overlayReturn = this.modal;
      $(this.modal)?.classList.remove('active');
    }
    $(id)?.classList.add('active');
    this.modal = id;
    this.input?.setEnabled(false);
    this.audio?.setDriving(false);
    this.hud?.setInteraction(false);
    this.hud?.setRacePrompt(false);
    if (id === 'pause') this.refreshPause();
  }

  closeOverlay(id = this.modal) {
    if (!id) return;
    $(id)?.classList.remove('active');
    if (this.modal === id) this.modal = null;
    const previous = this.overlayReturn;
    this.overlayReturn = null;
    if (previous && OVERLAYS.includes(previous)) {
      $(previous)?.classList.add('active');
      this.modal = previous;
      if (previous === 'pause') this.refreshPause();
      this.input?.setEnabled(false);
      this.audio?.setDriving(false);
      return;
    }
    if (this.base === 'driving') {
      this.input?.setEnabled(true);
      this.audio?.setDriving(true);
      this.hud?.show(true);
    }
  }

  // ------------------------------------------------------------------ flow
  startDriving() {
    if (!this.ready) return;
    if (this.modal) this.closeOverlay();
    this.setBaseScreen('driving');
    this.input.setEnabled(true);
    this.input.clearActions();
    this.audio.init();
    this.audio.setDriving(true);
    this.audio.setVehicle(this.player.vehicle);
    this.hud.show(true);
    this.hud.toast(`${this.world.regionAt(this.player.pos.x, this.player.pos.z)} · free roam`, 'cyan', 'flag');
    this.player.camInit = false;
    this.scheduleSave();
  }

  goToMenu() {
    if (this.race && this.race.state !== 'idle') this.race.abort();
    for (const id of OVERLAYS) $(id)?.classList.remove('active');
    this.modal = null;
    this.overlayReturn = null;
    this.garage?.close();
    this.map?.close();
    this.setBaseScreen('menu');
    this.audio?.setDriving(false);
    this.refreshMenu();
    this.saveGame();
  }

  openPause() {
    if (this.base !== 'driving' || this.modal === 'results') return;
    this.openOverlay('pause');
  }

  resumeDriving() {
    if (this.modal === 'pause') this.closeOverlay('pause');
    else if (this.base === 'menu') this.startDriving();
  }

  openGarage() {
    if (!this.ready) return;
    if (this.modal === 'results') return;
    if (this.race && (this.race.state === 'racing' || this.race.state === 'countdown')) {
      this.toast('Finish the event before visiting the garage.', '', 'lock');
      return;
    }
    if (this.base === 'garage') return;
    this.garageReturn = this.base === 'menu' ? 'menu' : 'driving';
    if (this.modal) {
      $(this.modal)?.classList.remove('active');
      this.modal = null;
      this.overlayReturn = null;
    }
    this.map?.close();
    this.setBaseScreen('garage');
    this.audio?.setDriving(false);
    this.input?.clearActions();
    this.garage.open(this.save.current);
  }

  closeGarage() {
    this.garage.close();
    const back = this.garageReturn || 'driving';
    this.setBaseScreen(back);
    if (back === 'menu') {
      this.audio?.setDriving(false);
      this.refreshMenu();
    } else {
      this.input?.setEnabled(true);
      this.audio?.setDriving(true);
      this.hud?.show(true);
      this.player.camInit = false;
    }
    this.refreshGarageMeta();
    this.scheduleSave();
  }

  driveFromGarage(id) {
    const vehicle = getVehicle(id);
    this.save.current = vehicle.id;
    const loadout = this.getLoadout(vehicle.id);
    this.player.setVehicle(vehicle, loadout);
    this.audio.setVehicle(vehicle);
    this.garageReturn = 'driving';
    this.garage.close();
    this.setBaseScreen('driving');
    this.input.setEnabled(true);
    this.audio.init();
    this.audio.setDriving(true);
    this.hud.show(true);
    this.player.camInit = false;
    this.hud.toast(`<b>${vehicle.name}</b> ready to drive.`, 'cyan', 'garage');
    this.toastReadyCar(vehicle);
    this.refreshMenu();
    this.refreshGarageMeta();
    this.saveGame();
  }

  toastReadyCar(vehicle) {
    if (!this.hud) return;
    const perf = vehiclePerformance(vehicle, this.getLoadout(vehicle.id).upgrades);
    this.hud.toast(`${formatNumber(perf.hp)} hp · ${Math.round(perf.top)} km/h top speed`, '', 'speed');
  }

  openMap() {
    if (!this.ready) return;
    if (this.modal === 'results') return;
    if (this.race && (this.race.state === 'racing' || this.race.state === 'countdown')) {
      this.toast('Finish the event before opening the map.', '', 'lock');
      return;
    }
    if (this.base === 'map') return;
    this.mapReturn = this.base === 'menu' ? 'menu' : 'driving';
    if (this.modal) {
      $(this.modal)?.classList.remove('active');
      this.modal = null;
      this.overlayReturn = null;
    }
    this.garage?.close();
    this.setBaseScreen('map');
    this.audio?.setDriving(false);
    this.input?.clearActions();
    this.map.open();
  }

  closeMap() {
    this.map.close();
    const back = this.mapReturn || 'driving';
    this.setBaseScreen(back);
    if (back === 'menu') {
      this.audio?.setDriving(false);
      this.refreshMenu();
    } else {
      this.input?.setEnabled(true);
      this.audio?.setDriving(true);
      this.hud?.show(true);
      this.player.camInit = false;
    }
    this.scheduleSave();
  }

  fastTravel(x, z, name) {
    const spot = this.findSafeSpot(x, z);
    this.map.close();
    this.setBaseScreen('driving');
    this.player.placeAt(spot.x, spot.z, spot.heading);
    this.player.lastSafe = { x: spot.x, z: spot.z, heading: spot.heading };
    this.player.camInit = false;
    this.effects.clearSkids();
    this.input.setEnabled(true);
    this.audio.init();
    this.audio.setDriving(true);
    this.hud.show(true);
    const label = name || this.world.regionAt(spot.x, spot.z);
    this.hud.toast(`Fast travelled to <b>${label}</b>.`, 'cyan', 'map');
    this.scheduleSave();
  }

  findSafeSpot(x, z) {
    const world = this.world;
    const cx = clamp(x, -world.half + 120, world.half - 120);
    const cz = clamp(z, -world.half + 120, world.half - 120);
    const headingAt = (px, pz, fallback = 0) => {
      const near = world.roads.nearest(px, pz, 110);
      if (!near || !near.seg) return fallback;
      return Math.atan2(near.seg.bx - near.seg.ax, near.seg.bz - near.seg.az);
    };
    if (world.isFree(cx, cz, 4, 0)) return { x: cx, z: cz, heading: headingAt(cx, cz) };
    for (let radius = 24; radius <= 420; radius += 24) {
      for (let i = 0; i < 16; i++) {
        const angle = (i / 16) * Math.PI * 2 + radius * 0.01;
        const nx = cx + Math.cos(angle) * radius;
        const nz = cz + Math.sin(angle) * radius;
        if (Math.abs(nx) > world.half - 100 || Math.abs(nz) > world.half - 100) continue;
        if (world.isFree(nx, nz, 4, 0)) return { x: nx, z: nz, heading: headingAt(nx, nz) };
      }
    }
    const fallback = world.spawn || { x: -1496, z: 730, heading: 0 };
    return { x: fallback.x, z: fallback.z, heading: fallback.heading || 0 };
  }

  launchEvent(event) {
    this.map.close();
    this.setBaseScreen('driving');
    this.startRace(event);
  }

  startRace(event) {
    if (!event || !this.player) return;
    if (this.race.state === 'racing' || this.race.state === 'countdown') this.race.abort();
    if (this.modal) {
      $(this.modal)?.classList.remove('active');
      this.modal = null;
      this.overlayReturn = null;
    }
    this.lastEvent = event;
    this.input.setEnabled(true);
    this.audio.init();
    this.audio.setDriving(true);
    this.audio.setVehicle(this.player.vehicle);
    this.hud.show(true);
    this.player.camInit = false;
    this.race.start(event, this.player);
    this.hud.toast(`<b>${event.name}</b> — beat ${formatTime(event.target)}.`, 'gold', 'flag');
    this.scheduleSave();
  }

  showResults(result) {
    this.lastResult = result;
    this.lastEvent = result.event;
    this.overlayReturn = null;
    if (this.modal && this.modal !== 'results') $(this.modal)?.classList.remove('active');
    this.modal = 'results';

    const title = $('result-title');
    const grade = $('result-grade');
    const time = $('result-time');
    const target = $('result-target');
    const reward = $('result-reward');
    const best = $('result-best');
    const medal = $('result-medal');
    if (title) title.textContent = result.event.name;
    if (grade) {
      grade.textContent = result.grade.toUpperCase();
      grade.style.color = result.grade === 'gold' ? '#ffb648' : result.grade === 'silver' ? '#d7e2ea' : '#cd8a58';
    }
    if (time) time.textContent = formatTime(result.time);
    if (target) target.textContent = `TARGET ${formatTime(result.target)}`;
    if (reward) reward.textContent = `C ${formatNumber(result.reward)}`;
    if (best) best.textContent = result.newBest ? 'NEW PERSONAL BEST' : `PERSONAL BEST ${formatTime(this.save.bestTimes?.[result.event.id] || result.time)}`;
    if (medal) {
      medal.style.background = result.grade === 'gold'
        ? 'radial-gradient(circle at 35% 30%,#ffd15c,#d48a00)'
        : result.grade === 'silver'
          ? 'radial-gradient(circle at 35% 30%,#eef6ff,#8da1b0)'
          : 'radial-gradient(circle at 35% 30%,#e5a271,#8b4c25)';
      medal.style.color = result.grade === 'gold' ? '#241700' : '#121619';
    }
    $('results')?.classList.add('active');
    this.input.setEnabled(false);
    this.audio.setDriving(false);
    this.audio.finish(result.grade === 'gold');
    this.hud.setRacePrompt(false);
    this.hud.setInteraction(false);
    this.map.refresh();
    this.garage.refreshCredits();
    this.refreshMenu();
    this.saveGame();
  }

  retryEvent() {
    if (!this.lastEvent) return;
    const event = this.lastEvent;
    $(this.modal)?.classList.remove('active');
    this.modal = null;
    this.overlayReturn = null;
    this.setBaseScreen('driving');
    this.startRace(event);
  }

  continueFreeRoam() {
    $(this.modal)?.classList.remove('active');
    this.modal = null;
    this.overlayReturn = null;
    if (this.race) this.race.abort();
    this.setBaseScreen('driving');
    this.input.setEnabled(true);
    this.audio.setDriving(true);
    this.hud.show(true);
    this.hud.toast('Back to free roam. The island is yours.', 'cyan', 'map');
    this.player.camInit = false;
    this.scheduleSave();
  }

  // ------------------------------------------------------------------ settings
  applySettings() {
    if (!this.save) return;
    const s = this.save.settings;
    const quality = ['low', 'medium', 'high', 'ultra'].includes(s.quality) ? s.quality : this.engine.quality;
    this.engine.setQuality(quality);
    const shadows = !!s.shadows && quality !== 'low';
    this.engine.sun.castShadow = shadows;
    this.engine.renderer.shadowMap.enabled = shadows;
    this.effects?.setMotion(!!s.motion);
    if (this.player) {
      this.player.setAssist(!!s.assist);
      this.player.setManual(!!s.manual);
      this.player.steerScale = 1;
    }
    if (this.input) this.input.sensitivity = clamp((Number(s.sens) || 100) / 100, 0.4, 1.4);
    document.body.classList.toggle('force-touch', !!s.touch && !isTouchDevice());
    document.body.classList.toggle('touch-off', !s.touch);
    this.audio?.setEnabled(!!s.audio);
    this.engine.setWeather(s.weather === 'rain' ? 'rain' : 'clear');
    this.engine.setTime(Number.isFinite(Number(s.time)) ? Number(s.time) : 17.25);
    this.syncSettingsUI();
  }

  syncSettingsUI() {
    const s = this.save.settings;
    document.querySelectorAll('#quality-select button').forEach(b => b.classList.toggle('active', b.dataset.q === s.quality));
    this.setToggle($('set-shadows'), !!s.shadows);
    this.setToggle($('set-motion'), !!s.motion);
    this.setToggle($('set-assist'), !!s.assist);
    this.setToggle($('set-manual'), !!s.manual);
    this.setToggle($('set-touch'), !!s.touch);
    this.setToggle($('set-audio'), !!s.audio);
    this.setToggle($('set-daynight'), !!s.daynight);
    const sens = $('set-sens');
    if (sens) sens.value = String(s.sens);
    const sensVal = $('set-sens-val');
    if (sensVal) sensVal.textContent = `${Math.round(s.sens)}%`;
    const time = $('set-time');
    if (time) time.value = String(s.time);
    document.querySelectorAll('#set-weather button').forEach(b => b.classList.toggle('active', b.dataset.w === s.weather));
  }

  setToggle(el, on) {
    if (el) el.classList.toggle('active', !!on);
  }

  // ------------------------------------------------------------------ UI binding
  bindUI() {
    $('btn-continue')?.addEventListener('click', () => this.startDriving());
    $('result-retry')?.addEventListener('click', () => this.retryEvent());

    document.addEventListener('click', (event) => {
      const close = event.target.closest?.('[data-close]');
      if (close) {
        event.preventDefault();
        this.closeOverlay(close.dataset.close);
        return;
      }
      const action = event.target.closest?.('[data-action]')?.dataset.action;
      if (!action) return;
      event.preventDefault();
      this.audio?.ui();
      switch (action) {
        case 'settings': this.openOverlay('settings'); break;
        case 'garage': this.openGarage(); break;
        case 'map': this.openMap(); break;
        case 'help': this.openOverlay('help'); break;
        case 'pause': this.openPause(); break;
        case 'resume': this.resumeDriving(); break;
        case 'menu': this.goToMenu(); break;
        case 'continue-race': this.continueFreeRoam(); break;
        default: break;
      }
    });

    document.querySelectorAll('#quality-select button').forEach(btn => {
      btn.addEventListener('click', () => {
        this.save.settings.quality = btn.dataset.q;
        this.applySettings();
        this.scheduleSave();
      });
    });

    const bindToggle = (id, key, after) => {
      const el = $(id);
      if (!el) return;
      el.addEventListener('click', () => {
        this.save.settings[key] = !this.save.settings[key];
        after?.();
        this.applySettings();
        this.scheduleSave();
      });
    };
    bindToggle('set-shadows', 'shadows');
    bindToggle('set-motion', 'motion');
    bindToggle('set-assist', 'assist');
    bindToggle('set-manual', 'manual');
    bindToggle('set-touch', 'touch');
    bindToggle('set-audio', 'audio');
    bindToggle('set-daynight', 'daynight');

    $('set-sens')?.addEventListener('input', (e) => {
      this.save.settings.sens = Number(e.target.value);
      if (this.input) this.input.sensitivity = clamp(this.save.settings.sens / 100, 0.4, 1.4);
      const val = $('set-sens-val');
      if (val) val.textContent = `${Math.round(this.save.settings.sens)}%`;
      this.scheduleSave();
    });

    document.querySelectorAll('#set-weather button').forEach(btn => {
      btn.addEventListener('click', () => {
        this.save.settings.weather = btn.dataset.w;
        this.applySettings();
        this.scheduleSave();
      });
    });

    $('set-time')?.addEventListener('input', (e) => {
      const hour = Number(e.target.value);
      this.save.settings.time = hour;
      this.engine.setTime(hour);
      this.scheduleSave();
    });

    $('set-reset')?.addEventListener('click', () => {
      if (!window.confirm('Erase all cars, credits, records and collectibles? This cannot be undone.')) return;
      try { localStorage.removeItem(SAVE_KEY); } catch (_) { /* noop */ }
      window.location.reload();
    });

    window.addEventListener('resize', () => {
      if (this.base === 'map') {
        this.map?._resize();
        this.map?.draw();
      }
    });

    window.addEventListener('beforeunload', () => this.saveGame());
    window.addEventListener('pagehide', () => this.saveGame());

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.saveGame();
        if (this.base === 'driving' && !this.modal) this.openPause();
      }
    });
  }

  refreshMenu() {
    if (!this.save) return;
    const credits = $('menu-credits');
    const owned = $('menu-owned');
    if (credits) credits.textContent = formatNumber(this.save.credits);
    if (owned) owned.textContent = this.save.owned.length;

    const featureId = (this.save.favourites || [])[0] || this.save.current;
    const vehicle = getVehicle(featureId);
    const perf = vehiclePerformance(vehicle, this.getLoadout(vehicle.id).upgrades);
    const name = $('feat-name');
    const klass = $('feat-class');
    const power = $('feat-power');
    const top = $('feat-top');
    const accel = $('feat-accel');
    if (name) name.textContent = vehicle.name;
    if (klass) klass.textContent = `${vehicle.category.toUpperCase()} · ${vehicle.drivetrain}`;
    if (power) power.textContent = formatNumber(perf.hp);
    if (top) top.textContent = Math.round(perf.top);
    if (accel) accel.textContent = perf.accel.toFixed(1);
    this.garage?.refreshCredits();
    this.refreshGarageMeta();
  }

  refreshGarageMeta() {
    if (!this.save) return;
    const credits = $('garage-credits');
    const owned = $('garage-owned');
    if (credits) credits.textContent = formatNumber(this.save.credits);
    if (owned) owned.textContent = this.save.owned.length;
  }

  refreshPause() {
    if (!this.player) return;
    const name = $('pause-car-name');
    const location = $('pause-location');
    const distance = $('pause-distance');
    const top = $('pause-top');
    const wins = $('pause-wins');
    if (name) name.textContent = this.player.vehicle.name;
    if (location) location.textContent = this.world.regionAt(this.player.pos.x, this.player.pos.z);
    if (distance) distance.textContent = `${(this.save.distance || 0).toFixed(1)} km`;
    if (top) top.textContent = `${Math.round(this.save.topSpeed || 0)} km/h`;
    if (wins) wins.textContent = String(this.save.wins || 0);
  }

  toast(text, type = '', icon = 'star') {
    if (this.hud) this.hud.toast(text, type, icon);
  }

  // ------------------------------------------------------------------ hotkeys
  handleHotkeys() {
    if (!this.input) return;
    const pause = this.input.consume('pause');
    const map = this.input.consume('map');
    const garage = this.input.consume('garage');
    const help = this.input.consume('help');
    const camera = this.input.consume('camera');
    const reset = this.input.consume('reset');
    const interact = this.input.consume('interact');

    if (this.modal === 'settings' || this.modal === 'help') {
      if (pause || interact || help) this.closeOverlay(this.modal);
      return;
    }
    if (this.modal === 'pause') {
      if (pause || interact) this.closeOverlay('pause');
      return;
    }
    if (this.modal === 'results') {
      if (pause || interact) this.continueFreeRoam();
      return;
    }

    if (this.base === 'menu') {
      if (interact) this.startDriving();
      else if (map) this.openMap();
      else if (garage) this.openGarage();
      else if (help) this.openOverlay('help');
      return;
    }
    if (this.base === 'garage') {
      if (pause) this.closeGarage();
      else if (help) this.openOverlay('help');
      return;
    }
    if (this.base === 'map') {
      if (pause) this.closeMap();
      else if (help) this.openOverlay('help');
      return;
    }
    if (this.base === 'driving') {
      if (pause) this.openPause();
      else if (map) this.openMap();
      else if (garage) this.openGarage();
      else if (help) this.openOverlay('help');
      else if (camera) this.player.cycleCamera();
      else if (reset) this.player.respawn();
      else if (interact) this.interactRequested = true;
    }
  }

  // ------------------------------------------------------------------ simulation
  simulate(dt) {
    const race = this.race;
    const inCountdown = race.state === 'countdown';
    const inputState = inCountdown
      ? { throttle: 0, brake: 0, steer: 0, handbrake: true }
      : {
          throttle: this.input.throttle,
          brake: this.input.brake,
          steer: this.input.steer,
          handbrake: this.input.handbrake,
          boost: this.input.boost,
        };

    this.player.update(dt, inputState);
    this.player.updateCamera(dt, this.engine.camera);
    race.update(dt, this.player);
    this.effects.update(dt, this.player, this.engine.camera);
    this.world.update(dt, this.engine.camera);
    this.hud.update(dt, this.player, race);
    this.engine.followSun(this.player.pos);
    this.engine.update(dt);

    // distance + top speed records
    this.save.distance = (this.save.distance || 0) + (Math.abs(this.player.velForward) * dt) / 1000;
    if (this.player.speedKmh > (this.save.topSpeed || 0)) this.save.topSpeed = this.player.speedKmh;

    this.updatePrompts();
    this.updateCollectibles(dt);
    this.updateTimeOfDay(dt);

    this.saveTimer += dt;
    if (this.saveTimer > 12) {
      this.saveTimer = 0;
      this.scheduleSave(250);
    }
  }

  updatePrompts() {
    if (this.base !== 'driving' || this.modal || !this.race) {
      this.hud.setInteraction(false);
      this.hud.setRacePrompt(false);
      return;
    }
    const racing = this.race.state === 'racing' || this.race.state === 'countdown';
    if (racing) {
      this.hud.setInteraction(false);
      this.hud.setRacePrompt(false);
      this.interactRequested = false;
      return;
    }

    const event = this.world.eventNear(this.player.pos.x, this.player.pos.z);
    const festival = this.world.festival;
    const nearFestival = festival
      ? Math.hypot(this.player.pos.x - festival.x, this.player.pos.z - festival.z) < 46
      : false;
    this.nearEvent = event;
    this.nearGarage = !event && nearFestival;

    if (event) {
      this.hud.setRacePrompt(true, event.name.toUpperCase(), `${event.roadRef?.name || 'Island route'} · ${event.cps} checkpoints`);
      this.hud.setInteraction(false);
    } else if (this.nearGarage) {
      this.hud.setInteraction(true, 'ENTER GARAGE', 'Festival Garage');
      this.hud.setRacePrompt(false);
    } else {
      this.hud.setInteraction(false);
      this.hud.setRacePrompt(false);
    }

    if (this.interactRequested) {
      this.interactRequested = false;
      if (event) this.startRace(event);
      else if (this.nearGarage) this.openGarage();
    }
  }

  updateCollectibles(dt) {
    this.collectTimer += dt;
    if (this.collectTimer < 0.12) return;
    this.collectTimer = 0;
    const id = this.world.collectNear(this.player.pos.x, this.player.pos.z, 11.5);
    if (id < 0) return;
    if (!this.save.collected.includes(id)) this.save.collected.push(id);
    const reward = 2500;
    this.save.credits = (this.save.credits || 0) + reward;
    this.hud.toast(`Golden gear found · <b>+C ${formatNumber(reward)}</b>`, 'gold', 'star');
    if (this.world.collectedCount === undefined) this.world.collectedCount = 0;
    this.audio.collect();
    this.refreshMenu();
    this.garage.refreshCredits();
    this.saveGame();
  }

  updateTimeOfDay(dt) {
    if (!this.save.settings.daynight) return;
    this.timeAccumulator += dt;
    if (this.timeAccumulator < 0.25) return;
    const step = this.timeAccumulator;
    this.timeAccumulator = 0;
    const hour = (this.engine.hour + step * 0.0065) % 24;
    this.engine.setTime(hour);
    this.save.settings.time = Number(hour.toFixed(3));
  }

  updateMenuCamera(dt) {
    if (!this.player) return;
    this.menuAngle += dt * 0.075;
    const center = this.player.pos;
    const radius = 13.4;
    const x = center.x + Math.cos(this.menuAngle) * radius;
    const z = center.z + Math.sin(this.menuAngle) * radius;
    const ground = this.world.surfaceAt(x, z).y;
    const y = Math.max(center.y + 4.2, ground + 2.4);
    const cam = this.engine.camera;
    cam.position.set(x, y, z);
    cam.fov += (46 - cam.fov) * Math.min(1, dt * 1.4);
    cam.updateProjectionMatrix();
    cam.lookAt(center.x, center.y + 0.85, center.z);
    this.engine.followSun(center);
    this.world.update(dt, cam);
    this.engine.update(dt);
  }

  // ------------------------------------------------------------------ loop
  loop() {
    requestAnimationFrame(() => this.loop());
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.elapsed += dt;
    this.handleHotkeys();

    if (!this.ready) return;
    this.engine.update(dt);

    if (this.base === 'garage') {
      this.garage.draw(dt);
      return;
    }
    if (this.base === 'map') {
      return;
    }
    if (this.base === 'menu') {
      this.updateMenuCamera(dt);
      this.engine.render();
      return;
    }
    if (this.base === 'driving') {
      if (!this.modal) {
        this.simulate(dt);
      } else {
        this.engine.followSun(this.player.pos);
        this.engine.update(dt);
      }
      this.engine.render();
    }
  }
}

new App();
