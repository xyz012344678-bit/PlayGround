import * as THREE from 'three';
import { clamp } from '../core/noise.js';

const MAX_PARTICLES = 320;
const MAX_SKID = 280;
const MAX_DROPS = 800;

export class EffectsSystem {
  constructor(scene, engine, world) {
    this.scene = scene;
    this.engine = engine;
    this.world = world;
    this.motionEnabled = true;
    this.smokeAcc = 0;
    this.dustAcc = 0;
    this.skidCursor = 0;
    this.skidLast = [null, null];
    this.skidActive = [false, false];
    this.particles = [];
    this._buildSmoke();
    this._buildSkids();
    this._buildRain();
    this.speedEl = document.getElementById('speedlines');
    this.vignetteEl = document.getElementById('vignette');
  }

  _buildSmoke() {
    const geo = new THREE.BufferGeometry();
    this.pPos = new Float32Array(MAX_PARTICLES * 3);
    this.pSize = new Float32Array(MAX_PARTICLES);
    this.pAlpha = new Float32Array(MAX_PARTICLES);
    this.pColor = new Float32Array(MAX_PARTICLES * 3);
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.pPos[i * 3 + 1] = -1000;
      this.pAlpha[i] = 0;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.pSize, 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.pAlpha, 1));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.pColor, 3));
    geo.setDrawRange(0, MAX_PARTICLES);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      uniforms: {},
      vertexShader: `
        attribute float aSize;
        attribute float aAlpha;
        attribute vec3 aColor;
        varying float vAlpha;
        varying vec3 vColor;
        void main(){
          vAlpha = aAlpha;
          vColor = aColor;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * (360.0 / max(1.0, -mv.z));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying float vAlpha;
        varying vec3 vColor;
        void main(){
          vec2 p = gl_PointCoord - .5;
          float d = length(p);
          float a = smoothstep(.5, .06, d) * vAlpha;
          if (a < .004) discard;
          gl_FragColor = vec4(vColor, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.smoke = new THREE.Points(geo, mat);
    this.smoke.frustumCulled = false;
    this.smoke.renderOrder = 5;
    this.scene.add(this.smoke);
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.particles.push({ life: 0, max: 1, vx: 0, vy: 0, vz: 0, size: 1, alpha: 0, grow: 0, drag: 0 });
    }
  }

  _particleColor(c) { return new THREE.Color(c); }

  _spawn(x, y, z, color, size, life, vx, vy, vz, alpha = 0.5, grow = 0.7) {
    const i = this._pCursor = ((this._pCursor ?? -1) + 1) % MAX_PARTICLES;
    const p = this.particles[i];
    p.life = life; p.max = life; p.vx = vx; p.vy = vy; p.vz = vz;
    p.size = size; p.alpha = alpha; p.grow = grow; p.drag = 1.7;
    this.pPos[i * 3] = x; this.pPos[i * 3 + 1] = y; this.pPos[i * 3 + 2] = z;
    const col = color instanceof THREE.Color ? color : this._particleColor(color);
    this.pColor[i * 3] = col.r; this.pColor[i * 3 + 1] = col.g; this.pColor[i * 3 + 2] = col.b;
    this.pSize[i] = size;
    this.pAlpha[i] = alpha;
  }

  _buildSkids() {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(MAX_SKID * 4 * 3);
    for (let i = 0; i < pos.length; i += 3) pos[i + 1] = -1000;
    const idx = new Uint16Array(MAX_SKID * 6);
    for (let i = 0; i < MAX_SKID; i++) {
      const a = i * 4;
      idx[i * 6] = a; idx[i * 6 + 1] = a + 2; idx[i * 6 + 2] = a + 1;
      idx[i * 6 + 3] = a + 1; idx[i * 6 + 4] = a + 2; idx[i * 6 + 5] = a + 3;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.setDrawRange(0, MAX_SKID * 6);
    this.skidPos = pos;
    this.skidGeo = geo;
    const mat = new THREE.MeshBasicMaterial({
      color: 0x050505, transparent: true, opacity: 0.42, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
    });
    this.skids = new THREE.Mesh(geo, mat);
    this.skids.frustumCulled = false;
    this.skids.renderOrder = 3;
    this.scene.add(this.skids);
  }

  _buildRain() {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(MAX_DROPS * 2 * 3);
    for (let i = 0; i < pos.length; i += 3) pos[i + 1] = -1000;
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rainPos = pos;
    this.rainGeo = geo;
    const mat = new THREE.LineBasicMaterial({ color: 0xb4d2e6, transparent: true, opacity: 0.36, depthWrite: false });
    this.rain = new THREE.LineSegments(geo, mat);
    this.rain.frustumCulled = false;
    this.rain.renderOrder = 6;
    this.scene.add(this.rain);
    this.drops = [];
    for (let i = 0; i < MAX_DROPS; i++) {
      this.drops.push({ x: 0, y: -1000, z: 0, v: 26 + Math.random() * 18, len: 0.7 + Math.random() * 1.1 });
    }
    this._rainInit = false;
  }

  update(dt, player, camera) {
    if (!player || !player.model) return;
    const speed = player.speedKmh;
    const slip = player.slip + (player.handbrake ? 5 : 0);
    const surface = player.surface || {};
    const onDirt = !surface.onRoad || surface.type === 'dirt';
    const pos = player.pos;
    const heading = player.heading;
    const right = { x: Math.cos(heading), z: -Math.sin(heading) };
    const fwd = { x: Math.sin(heading), z: Math.cos(heading) };
    const track = player.dims.track;

    // ---- smoke / dust from the rear tyres
    if (!player.airborne && speed > 12) {
      const emitting = slip > 2.2 || (player.handbrake && speed > 8);
      if (emitting || (onDirt && speed > 18)) {
        const rate = emitting ? 24 + Math.min(30, slip * 3) : 8;
        this.smokeAcc += dt * rate;
        while (this.smokeAcc > 1) {
          this.smokeAcc -= 1;
          const side = Math.random() > 0.5 ? 1 : -1;
          const x = pos.x + right.x * side * track * 0.48 - fwd.x * player.dims.wheelbase * 0.46;
          const z = pos.z + right.z * side * track * 0.48 - fwd.z * player.dims.wheelbase * 0.46;
          const y = (surface.y || pos.y) + 0.1 + Math.random() * 0.2;
          const col = emitting ? (surface.type === 'dirt' ? 0x8d7557 : 0xb9bcc0) : 0x9b8465;
          this._spawn(
            x, y, z, col,
            0.75 + Math.random() * 0.55,
            0.7 + Math.random() * 0.8,
            (Math.random() - 0.5) * 2.4 - fwd.x * 2.2,
            0.45 + Math.random() * 1.2,
            (Math.random() - 0.5) * 2.4 - fwd.z * 2.2,
            emitting ? 0.42 : 0.24, 1.7,
          );
        }
      }
    }

    // ---- skid marks
    const skidding = !player.airborne && speed > 8 && (slip > 2.4 || player.handbrake || (surface.type === 'dirt' && slip > 1.2));
    for (let side = 0; side < 2; side++) {
      const s = side === 0 ? 1 : -1;
      const x = pos.x + right.x * s * track * 0.47 - fwd.x * player.dims.wheelbase * 0.47;
      const z = pos.z + right.z * s * track * 0.47 - fwd.z * player.dims.wheelbase * 0.47;
      const y = (surface.y || pos.y) + 0.035;
      if (!skidding) { this.skidActive[side] = false; this.skidLast[side] = null; continue; }
      const last = this.skidLast[side];
      if (!last) { this.skidLast[side] = { x, z, y }; this.skidActive[side] = true; continue; }
      const dx = x - last.x, dz = z - last.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.22) continue;
      if (d > 3.2) { this.skidLast[side] = { x, z, y }; continue; }
      const nx = -dz / d * 0.14, nz = dx / d * 0.14;
      const o = this.skidCursor * 12;
      const p = this.skidPos;
      p[o] = last.x + nx; p[o + 1] = last.y; p[o + 2] = last.z + nz;
      p[o + 3] = last.x - nx; p[o + 4] = last.y; p[o + 5] = last.z - nz;
      p[o + 6] = x + nx; p[o + 7] = y; p[o + 8] = z + nz;
      p[o + 9] = x - nx; p[o + 10] = y; p[o + 11] = z - nz;
      this.skidGeo.attributes.position.needsUpdate = true;
      this.skidCursor = (this.skidCursor + 1) % MAX_SKID;
      this.skidLast[side] = { x, z, y };
    }

    // ---- particles
    const pa = this.smoke.geometry.attributes;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.particles[i];
      if (p.life <= 0) { if (this.pAlpha[i] !== 0) this.pAlpha[i] = 0; continue; }
      p.life -= dt;
      if (p.life <= 0) {
        this.pAlpha[i] = 0;
        this.pPos[i * 3 + 1] = -1000;
        continue;
      }
      const damp = Math.exp(-p.drag * dt);
      p.vx *= damp; p.vz *= damp;
      p.vy = p.vy * damp + 0.65 * dt;
      this.pPos[i * 3] += p.vx * dt;
      this.pPos[i * 3 + 1] += p.vy * dt;
      this.pPos[i * 3 + 2] += p.vz * dt;
      const lifeT = p.life / p.max;
      this.pAlpha[i] = p.alpha * Math.pow(lifeT, 0.8) * Math.min(1, (1 - lifeT) * 8);
      this.pSize[i] = p.size * (1 + (1 - lifeT) * p.grow);
    }
    pa.position.needsUpdate = true;
    pa.aSize.needsUpdate = true;
    pa.aAlpha.needsUpdate = true;
    pa.aColor.needsUpdate = true;

    // ---- rain
    const raining = this.engine.weather === 'rain';
    this.rain.visible = raining;
    if (raining) {
      const cx = camera ? camera.position.x : pos.x;
      const cy = camera ? camera.position.y : pos.y + 3;
      const cz = camera ? camera.position.z : pos.z;
      if (!this._rainInit) {
        for (const d of this.drops) {
          d.x = cx + (Math.random() - 0.5) * 70;
          d.y = cy + Math.random() * 32 - 8;
          d.z = cz + (Math.random() - 0.5) * 70;
        }
        this._rainInit = true;
      }
      for (let i = 0; i < MAX_DROPS; i++) {
        const d = this.drops[i];
        d.y -= d.v * dt;
        d.x += 3.2 * dt;
        if (d.y < cy - 12 || Math.abs(d.x - cx) > 44 || Math.abs(d.z - cz) > 44) {
          d.x = cx + (Math.random() - 0.5) * 66;
          d.y = cy + 14 + Math.random() * 18;
          d.z = cz + (Math.random() - 0.5) * 66;
        }
        const o = i * 6;
        this.rainPos[o] = d.x; this.rainPos[o + 1] = d.y; this.rainPos[o + 2] = d.z;
        this.rainPos[o + 3] = d.x - 0.08; this.rainPos[o + 4] = d.y - d.len; this.rainPos[o + 5] = d.z - 0.03;
      }
      this.rainGeo.attributes.position.needsUpdate = true;
    } else {
      this._rainInit = false;
    }

    // ---- screen speed effects
    if (this.speedEl) {
      const on = this.motionEnabled && speed > 205 && !player.airborne;
      this.speedEl.classList.toggle('on', on);
      if (on) this.speedEl.style.opacity = String(clamp((speed - 205) / 140, 0.1, 0.85));
    }
    if (this.vignetteEl) this.vignetteEl.classList.toggle('hot', this.motionEnabled && speed > 230);
  }

  setMotion(on) {
    this.motionEnabled = on;
    if (!on && this.speedEl) this.speedEl.classList.remove('on');
    if (!on && this.vignetteEl) this.vignetteEl.classList.remove('hot');
  }

  clearSkids() {
    for (let i = 0; i < this.skidPos.length; i += 3) this.skidPos[i + 1] = -1000;
    this.skidGeo.attributes.position.needsUpdate = true;
    this.skidLast = [null, null];
  }
}
