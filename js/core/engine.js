import * as THREE from 'three';
import { clamp, lerp, smoothstep } from './noise.js';

const SKY_KEYS = [
  // hour, top, horizon, sun, fog, hemi sky, hemi ground, sun intensity, exposure
  { h: 0,    top: 0x03050d, hor: 0x0a1320, sun: 0x223355, fog: 0x0a1119, hs: 0x1b2b45, hg: 0x080a0d, int: 0.18, exp: 0.72 },
  { h: 4.6,  top: 0x050914, hor: 0x14203a, sun: 0x334477, fog: 0x101a26, hs: 0x263653, hg: 0x0c0f13, int: 0.25, exp: 0.8 },
  { h: 6.2,  top: 0x243c66, hor: 0xf0956a, sun: 0xffb27a, fog: 0xc4937c, hs: 0x6d7f9a, hg: 0x3b342d, int: 1.55, exp: 1.0 },
  { h: 8.0,  top: 0x2d6fb5, hor: 0xbdd9ee, sun: 0xfff2d6, fog: 0xa8c0d4, hs: 0x8fb6d9, hg: 0x4d5547, int: 2.55, exp: 0.95 },
  { h: 12.0, top: 0x1f66bd, hor: 0xcfe6fb, sun: 0xfff9ea, fog: 0xb9d3e6, hs: 0xa3c9e8, hg: 0x556048, int: 3.1, exp: 0.94 },
  { h: 16.0, top: 0x2a67a8, hor: 0xe1d9c5, sun: 0xfff0cf, fog: 0xcfc7b4, hs: 0x9db4c8, hg: 0x5a5946, int: 2.5, exp: 0.98 },
  { h: 18.1, top: 0x273c6a, hor: 0xff8b4a, sun: 0xffa25b, fog: 0xd98c67, hs: 0x8c7c91, hg: 0x3d332a, int: 1.7, exp: 1.04 },
  { h: 19.4, top: 0x182747, hor: 0xa95345, sun: 0xff7a45, fog: 0x6c4c4c, hs: 0x4a4e67, hg: 0x201d1c, int: 0.6, exp: 0.9 },
  { h: 20.6, top: 0x080e1c, hor: 0x1a2538, sun: 0x223355, fog: 0x121c29, hs: 0x24334d, hg: 0x0a0c10, int: 0.2, exp: 0.75 },
  { h: 24,   top: 0x03050d, hor: 0x0a1320, sun: 0x223355, fog: 0x0a1119, hs: 0x1b2b45, hg: 0x080a0d, int: 0.18, exp: 0.72 },
];

function keyColor(a, b, t, field) {
  return new THREE.Color(a[field]).lerp(new THREE.Color(b[field]), t);
}

function sampleSky(hour) {
  let a = SKY_KEYS[0], b = SKY_KEYS[1];
  for (let i = 0; i < SKY_KEYS.length - 1; i++) {
    if (hour >= SKY_KEYS[i].h && hour <= SKY_KEYS[i + 1].h) { a = SKY_KEYS[i]; b = SKY_KEYS[i + 1]; break; }
  }
  const t = clamp((hour - a.h) / Math.max(0.001, b.h - a.h), 0, 1);
  return {
    top: keyColor(a, b, t, 'top'),
    hor: keyColor(a, b, t, 'hor'),
    sun: keyColor(a, b, t, 'sun'),
    fog: keyColor(a, b, t, 'fog'),
    hs: keyColor(a, b, t, 'hs'),
    hg: keyColor(a, b, t, 'hg'),
    intensity: lerp(a.int, b.int, t),
    exposure: lerp(a.exp, b.exp, t),
  };
}

const QUALITY = {
  low:    { pr: 0.72, shadows: false, shadowSize: 1024, fog: 0.62, aniso: 2, grass: 0.45, clouds: false },
  medium: { pr: 0.95, shadows: true,  shadowSize: 1024, fog: 0.8,  aniso: 4, grass: 0.7, clouds: true },
  high:   { pr: 1.35, shadows: true,  shadowSize: 2048, fog: 1,    aniso: 8, grass: 1, clouds: true },
  ultra:  { pr: 2,    shadows: true,  shadowSize: 2048, fog: 1.15, aniso: 16, grass: 1.25, clouds: true },
};

export class Engine {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', alpha: false, stencil: false });
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0x0a0f14, 1);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0xa8c0d4, 500, 7000);
    this.camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.4, 16000);
    this.camera.position.set(0, 30, -30);

    this.hour = 17.25;
    this.night = 0;
    this.weather = 'clear';
    this.quality = 'high';
    this.cloudSprites = [];
    this.lampMaterials = [];
    this.baseFogFar = 7000;

    this._setupLights();
    this._setupSky();
    this._buildEnvMaps();
    this.setQuality(this._autoQuality());
    this.setTime(this.hour);

    window.addEventListener('resize', () => this.resize());
  }

  _autoQuality() {
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const small = Math.min(window.innerWidth, window.innerHeight) < 620;
    if (coarse || small) return 'medium';
    if (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) return 'medium';
    return 'high';
  }

  _setupLights() {
    this.hemi = new THREE.HemisphereLight(0x9db4c8, 0x5a5946, 1.2);
    this.scene.add(this.hemi);
    this.ambient = new THREE.AmbientLight(0xffffff, 0.16);
    this.scene.add(this.ambient);
    this.sun = new THREE.DirectionalLight(0xfff0d0, 2.5);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 1200;
    this.sun.shadow.camera.left = -170;
    this.sun.shadow.camera.right = 170;
    this.sun.shadow.camera.top = 170;
    this.sun.shadow.camera.bottom = -170;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.05;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    this.moon = new THREE.DirectionalLight(0x9fb8e8, 0.0);
    this.scene.add(this.moon);
  }

  _setupSky() {
    this.skyUniforms = {
      uTop: { value: new THREE.Color(0x2a67a8) },
      uHorizon: { value: new THREE.Color(0xe1d9c5) },
      uSun: { value: new THREE.Color(0xfff0cf) },
      uSunDir: { value: new THREE.Vector3(0.4, 0.6, 0.2) },
      uNight: { value: 0 },
      uHaze: { value: new THREE.Color(0xcfc7b4) },
    };
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: this.skyUniforms,
      vertexShader: `
        varying vec3 vDir;
        void main(){
          vDir = normalize(position);
          vec4 mv = modelViewMatrix * vec4(position,1.0);
          gl_Position = projectionMatrix * mv;
          gl_Position.z = gl_Position.w;
        }`,
      fragmentShader: `
        varying vec3 vDir;
        uniform vec3 uTop,uHorizon,uSun,uHaze;
        uniform vec3 uSunDir;
        uniform float uNight;
        void main(){
          vec3 d = normalize(vDir);
          float h = clamp(d.y, -0.2, 1.0);
          float t = pow(max(h,0.0), 0.48);
          vec3 col = mix(uHorizon, uTop, t);
          // horizon glow around the sun
          float sd = max(dot(d, normalize(uSunDir)), 0.0);
          float glow = pow(sd, 6.0)*0.32 + pow(sd, 90.0)*1.1;
          col += uSun * glow * (1.0 - uNight*0.65);
          // warm haze band at horizon
          float band = exp(-abs(h)*13.0);
          col = mix(col, uHaze, band*0.32);
          // sun disk
          float disk = smoothstep(0.9993, 0.99975, sd);
          col += uSun * disk * 2.2 * (1.0-uNight*0.8);
          // below the horizon
          if(h < 0.0) col = mix(uHaze*0.55, uHorizon*0.4, smoothstep(-0.2,0.0,h));
          gl_FragColor = vec4(col,1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(9000, 32, 18), skyMat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -100;
    this.scene.add(this.sky);

    // stars
    const starGeo = new THREE.BufferGeometry();
    const pos = [], sizes = [];
    for (let i = 0; i < 1400; i++) {
      const a = Math.random() * Math.PI * 2;
      const e = Math.acos(Math.random() * 0.95);
      const r = 8500;
      pos.push(Math.cos(a) * Math.sin(e) * r, Math.cos(e) * r, Math.sin(a) * Math.sin(e) * r);
      sizes.push(0.7 + Math.random() * 2.2);
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    starGeo.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1));
    this.stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xe8f2ff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.stars.frustumCulled = false;
    this.scene.add(this.stars);

    // sun sprite
    const glowTex = this._radialTexture(128, [[0, 'rgba(255,255,240,1)'], [0.15, 'rgba(255,235,190,.95)'], [0.4, 'rgba(255,170,90,.35)'], [1, 'rgba(255,130,50,0)']]);
    this.sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    this.sunSprite.scale.setScalar(420);
    this.scene.add(this.sunSprite);
    this.moonSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this._radialTexture(64, [[0, 'rgba(235,245,255,1)'], [0.55, 'rgba(205,225,255,.85)'], [1, 'rgba(180,205,255,0)']]), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0 }));
    this.moonSprite.scale.setScalar(190);
    this.scene.add(this.moonSprite);

    // clouds
    const cloudTex = this._cloudTexture();
    for (let i = 0; i < 34; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: 0.0, depthWrite: false, fog: false, color: 0xffffff }));
      const a = Math.random() * Math.PI * 2;
      const r = 1700 + Math.random() * 6200;
      const sc = 650 + Math.random() * 1500;
      s.position.set(Math.cos(a) * r, 750 + Math.random() * 950, Math.sin(a) * r);
      s.scale.set(sc, sc * 0.36, 1);
      s.userData = { speed: 1.5 + Math.random() * 4, baseOp: 0.24 + Math.random() * 0.32 };
      this.cloudSprites.push(s);
      this.scene.add(s);
    }
  }

  _radialTexture(size, stops) {
    const c = document.createElement('canvas'); c.width = c.height = size;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    for (const [p, col] of stops) g.addColorStop(p, col);
    ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }

  _cloudTexture() {
    const c = document.createElement('canvas'); c.width = 512; c.height = 256;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 512, 256);
    for (let i = 0; i < 46; i++) {
      const x = 70 + Math.random() * 372, y = 105 + Math.random() * 65, r = 25 + Math.random() * 70;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,.55)');
      g.addColorStop(0.5, 'rgba(255,255,255,.22)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }

  _buildEnvMaps() {
    const make = (top, hor, sunCol, sunDir, ground) => {
      const c = document.createElement('canvas'); c.width = 1024; c.height = 512;
      const ctx = c.getContext('2d');
      const g = ctx.createLinearGradient(0, 0, 0, 512);
      g.addColorStop(0, top); g.addColorStop(0.45, hor); g.addColorStop(0.52, hor); g.addColorStop(1, ground);
      ctx.fillStyle = g; ctx.fillRect(0, 0, 1024, 512);
      // sun bloom
      const sx = ((Math.atan2(sunDir.x, -sunDir.z) / (Math.PI * 2)) + 0.5) * 1024;
      const sy = 256 - sunDir.y * 180;
      const rg = ctx.createRadialGradient(sx, sy, 0, sx, sy, 150);
      rg.addColorStop(0, 'rgba(255,255,240,1)'); rg.addColorStop(0.18, sunCol); rg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = rg; ctx.fillRect(0, 0, 1024, 512);
      // soft streak reflections
      for (let i = 0; i < 26; i++) {
        const y = 210 + Math.random() * 130;
        ctx.fillStyle = `rgba(255,255,255,${0.012 + Math.random() * 0.02})`;
        ctx.fillRect(0, y, 1024, 1 + Math.random() * 3);
      }
      const tex = new THREE.CanvasTexture(c);
      tex.mapping = THREE.EquirectangularReflectionMapping;
      tex.colorSpace = THREE.SRGBColorSpace;
      const pm = new THREE.PMREMGenerator(this.renderer);
      const env = pm.fromEquirectangular(tex).texture;
      pm.dispose(); tex.dispose();
      return env;
    };
    this.envDay = make('#3a7bc4', '#dbe8f3', 'rgba(255,245,215,.95)', new THREE.Vector3(0.4, 0.7, 0.2), '#4e5346');
    this.envSunset = make('#26365f', '#ff9a5c', 'rgba(255,175,105,.9)', new THREE.Vector3(-0.8, 0.2, 0.3), '#302a24');
    this.envNight = make('#050a16', '#17253d', 'rgba(120,160,255,.35)', new THREE.Vector3(-0.5, 0.45, 0.4), '#070a0c');
    this.scene.environment = this.envSunset;
    this.scene.environmentIntensity = 1.0;
  }

  setQuality(q) {
    if (!QUALITY[q]) q = 'high';
    this.quality = q;
    const cfg = QUALITY[q];
    this.qualityCfg = cfg;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cfg.pr) * (cfg.pr < 1 ? 1 : 1));
    if (cfg.pr <= 1) this.renderer.setPixelRatio(cfg.pr);
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.shadowMap.enabled = cfg.shadows;
    this.sun.castShadow = cfg.shadows;
    if (this.sun.shadow.mapSize.width !== cfg.shadowSize) {
      this.sun.shadow.mapSize.set(cfg.shadowSize, cfg.shadowSize);
      if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    }
    this.baseFogFar = 7000 * cfg.fog;
    this.cloudSprites.forEach(s => s.visible = cfg.clouds);
    this.resize();
  }

  setWeather(w) {
    this.weather = w;
    this.setTime(this.hour, true);
  }

  setTime(hour, force = false) {
    this.hour = ((hour % 24) + 24) % 24;
    const s = sampleSky(this.hour);
    const t = clamp((this.hour - 6) / 12, 0, 1) * Math.PI;
    const el = Math.sin(t);
    const sunDir = new THREE.Vector3(Math.cos(t) * 0.9, el, 0.36).normalize();
    this.sunDir = sunDir;
    this.night = smoothstep(0.12, -0.18, el);
    this.sunDir = sunDir;

    this.skyUniforms.uTop.value.copy(s.top);
    this.skyUniforms.uHorizon.value.copy(s.hor);
    this.skyUniforms.uSun.value.copy(s.sun);
    this.skyUniforms.uSunDir.value.copy(sunDir);
    this.skyUniforms.uNight.value = this.night;
    this.skyUniforms.uHaze.value.copy(s.fog);

    this.scene.fog.color.copy(s.fog);
    if (this.weather === 'rain') {
      this.scene.fog.color.lerp(new THREE.Color(0x5a6670), 0.55);
      this.scene.fog.near = 150;
      this.scene.fog.far = Math.min(2600, this.baseFogFar * 0.45);
    } else {
      this.scene.fog.near = 450;
      this.scene.fog.far = this.baseFogFar;
    }
    this.renderer.setClearColor(this.scene.fog.color, 1);
    this.renderer.toneMappingExposure = s.exposure * (this.weather === 'rain' ? 0.82 : 1);

    this.sun.color.copy(s.sun);
    this.sun.intensity = s.intensity * (this.weather === 'rain' ? 0.35 : 1);
    this.hemi.color.copy(s.hs);
    this.hemi.groundColor.copy(s.hg);
    this.hemi.intensity = lerp(0.22, 1.25, smoothstep(-0.15, 0.35, el)) * (this.weather === 'rain' ? 1.2 : 1);
    this.ambient.intensity = lerp(0.1, 0.35, smoothstep(-0.2, 0.3, el));
    this.moon.intensity = this.night * 0.32;
    this.moon.position.copy(sunDir).multiplyScalar(-700).add(new THREE.Vector3(0, 300, 0));

    this.sun.position.copy(sunDir).multiplyScalar(700);
    this.sun.target.position.set(0, 0, 0);

    const sunDist = 8000;
    this.sunSprite.position.copy(sunDir).multiplyScalar(sunDist);
    this.sunSprite.material.opacity = smoothstep(-0.12, 0.05, el) * (this.weather === 'rain' ? 0.2 : 1);
    this.sunSprite.material.color.copy(s.sun);
    this.moonSprite.position.copy(sunDir).multiplyScalar(-sunDist);
    this.moonSprite.material.opacity = this.night * 0.85;

    this.stars.material.opacity = this.night * (this.weather === 'rain' ? 0.15 : 0.85);
    this.cloudSprites.forEach(c => {
      c.material.opacity = c.userData.baseOp * (0.35 + smoothstep(-0.2, 0.4, el) * 0.9) * (this.weather === 'rain' ? 2.1 : 1);
      c.material.color.copy(s.hor).lerp(new THREE.Color(0xffffff), 0.55 + el * 0.4);
    });

    this.scene.environment = el > 0.22 ? this.envDay : (el > -0.08 ? this.envSunset : this.envNight);
    this.scene.environmentIntensity = lerp(0.55, 1.05, smoothstep(-0.1, 0.4, el));

    // register lamp/emissive materials configured by world
    const lampLevel = this.night;
    for (const m of this.lampMaterials) {
      if (m.emissiveIntensity !== undefined) m.emissiveIntensity = 0.15 + lampLevel * 3.2;
    }
    return this.night;
  }

  addLampMaterial(mat) { this.lampMaterials.push(mat); }

  followSun(target) {
    this.sun.target.position.copy(target);
    this.sun.position.copy(target).addScaledVector(this.sunDir, 600);
  }

  update(dt) {
    const t = performance.now() * 0.001;
    this.sky.position.copy(this.camera.position);
    this.stars.position.copy(this.camera.position);
    this.sunSprite.position.copy(this.camera.position).addScaledVector(this.sunDir, 8000);
    this.moonSprite.position.copy(this.camera.position).addScaledVector(this.sunDir, -8000);
    this.cloudSprites.forEach(c => {
      c.position.x += c.userData.speed * dt;
      if (c.position.x > 8000) c.position.x = -8000;
    });
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  render(scene = this.scene, camera = this.camera) {
    this.renderer.render(scene, camera);
  }
}
