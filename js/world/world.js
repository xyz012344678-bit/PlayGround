import * as THREE from 'three';
import { Engine } from '../core/engine.js';
import { clamp, lerp, smoothstep, dist2, fbm, ridged, mulberry32, cellPattern } from '../core/noise.js';
import { createRoadNetwork, CITY_CENTER, CITY_FLAT, TRACK_CENTER, TRACK_FLAT } from './roads.js';
import { buildCity, buildSuburbs, buildVegetation, buildLandmarks, buildRaceTrack, buildFestival, buildBridge, buildTunnel, buildRoadside } from './props.js';

const WORLD_SIZE = 9000;
const HALF = WORLD_SIZE / 2;
const SEGMENTS = 300;

export const REGION_COLORS = {
  city: '#6d7370', suburb: '#5e7a4a', farm: '#8e9359', forest: '#405b37',
  mountain: '#7b7c75', snow: '#e5edf2', desert: '#b5a071', coast: '#7a9b73', sea: '#173d55',
};

export const TRAVEL_POINTS = [
  { id: 'festival', name: 'Festival Grounds', x: -1500, z: 640, region: 'Festival Grounds' },
  { id: 'downtown', name: 'Meridian City', x: -1780, z: -880, region: 'Meridian City' },
  { id: 'harbor', name: 'Harbor District', x: 2040, z: 1180, region: 'Harbor District' },
  { id: 'cedar', name: 'Cedar Hollow', x: -2380, z: 1810, region: 'Cedar Hollow' },
  { id: 'alpine', name: 'Alpine Village', x: -190, z: -2880, region: 'Cloudline Pass' },
  { id: 'mirage', name: 'Mirage Flats', x: 2190, z: 2270, region: 'Mirage Flats' },
  { id: 'pier', name: 'Sunset Pier', x: 2650, z: 1690, region: 'Sunset Coast' },
  { id: 'circuit', name: 'Meridian Circuit', x: -330, z: 2880, region: 'Meridian Circuit' },
];

const COLLECTIBLE_SPOTS = [
  [-1450, 560], [-1720, -1050], [-1980, -520], [-2380, -960], [-2720, -1900], [-2860, -120],
  [-3280, 830], [-3000, 1900], [-2320, 2050], [-1960, 1580], [-940, -1660], [-640, -2380],
  [-120, -3020], [330, -2680], [160, -1950], [760, -1520], [1120, -820], [1580, 260],
  [2100, 1180], [2480, 1950], [2150, 2380], [2760, 2700], [2860, -880], [2620, -2320],
];

export class World {
  constructor(engine) {
    this.engine = engine;
    this.scene = engine.scene;
    this.rng = mulberry32(20260417);
    this.size = WORLD_SIZE;
    this.half = HALF;
    this.segments = SEGMENTS;
    this.cell = WORLD_SIZE / SEGMENTS;
    this.collisions = new Map();
    this.collisionCell = 110;
    this.animated = [];
    this.animatedWater = [];
    this.collectibles = [];
    this.eventGates = [];
    this.region = 'Festival Grounds';
    this.traffic = null;
    this.time = 0;
    this.heightGrid = new Float32Array((SEGMENTS + 1) * (SEGMENTS + 1));
  }

  async generate(progress = async () => {}) {
    await progress(4, 'Charting the island of Meridian');
    this.roads = createRoadNetwork((x, z) => this.baseHeight(x, z));
    this.roads.buildMeshes(this.scene);
    this.scene.userData.lampMaterials = this.engine.lampMaterials;
    if (this.roads.lampMaterial) this.engine.addLampMaterial(this.roads.lampMaterial);
    this.engine.setTime(this.engine.hour, true);

    await progress(13, 'Sculpting terrain and coastline');
    await this._buildTerrain(progress);
    await progress(47, 'Filling oceans and lakes');
    this._buildWater();
    await progress(51, 'Raising the skyline');
    buildCity(this, this.rng);
    await progress(60, 'Building neighbourhoods');
    buildSuburbs(this, this.rng);
    await progress(68, 'Planting forests and dunes');
    buildVegetation(this, this.rng);
    await progress(79, 'Constructing landmarks');
    buildLandmarks(this, this.rng);
    buildRaceTrack(this, this.rng);
    buildBridge(this);
    buildTunnel(this);
    buildFestival(this, this.rng);
    buildRoadside(this, this.rng);
    await progress(88, 'Placing collectibles and events');
    this._buildCollectibles();
    this._buildEvents();
    await progress(93, 'Painting the world map');
    this._buildMapCanvas();
    await progress(98, 'Warming tyres');
    this.engine.setTime(this.engine.hour, true);
  }

  // ---------------------------------------------------------------- terrain
  baseHeight(x, z) {
    const n1 = fbm(x * 0.00038 + 4.1, z * 0.00038 - 2.7, 4);
    const n2 = fbm(x * 0.00155 + 31.3, z * 0.00155 - 17.8, 3);
    const n3 = fbm(x * 0.0062 - 8.4, z * 0.0062 + 3.9, 2);
    let h = 18 + n1 * 33 + n2 * 6.5 + n3 * 1.4;

    const mt = smoothstep(-1450, -3300, z);
    if (mt > 0.001) {
      const ridge = ridged(x * 0.00115 + 3.2, z * 0.00115 - 8.4, 5);
      const ridge2 = ridged(x * 0.0024 - 2.2, z * 0.0024 + 4.4, 4);
      h += mt * (ridge * 205 + ridge2 * 95 + 26) * smoothstep(0.0, 0.55, mt);
    }
    // western highlands
    const west = smoothstep(-2700, -4200, x) * smoothstep(-400, 900, z) * 0.6;
    h += west * (ridged(x * 0.0018, z * 0.0018, 4) * 85);

    // desert dunes in the south east
    const dm = smoothstep(350, 1500, x) * smoothstep(700, 1600, z);
    if (dm > 0.001) {
      const dune = (Math.sin(x * 0.0052 + z * 0.0026) * 0.5 + 0.5) * 15 + ridged(x * 0.0031, z * 0.0031, 3) * 11;
      h = lerp(h, 12 + dune, dm * 0.8);
    }

    // east coast drops away to the sea
    const coast = smoothstep(2700, 3700, x);
    h = lerp(h, -17 + n2 * 2.5, coast);

    // tidal bay / channel crossed by the coastal bridge
    const bay = (1 - smoothstep(30, 145, Math.abs(z - 1290))) * smoothstep(2250, 2480, x);
    h = lerp(h, -6 + n2, bay * 0.97);

    // flattened plates: city, suburb, circuit, port, villages
    const flatten = (cx, cz, r0, r1, level, strength = 1) => {
      const d = dist2(x, z, cx, cz);
      h = lerp(h, level, (1 - smoothstep(r0, r1, d)) * strength);
    };
    flatten(CITY_CENTER.x, CITY_CENTER.z, 700, 1140, CITY_FLAT, 1);
    flatten(-2480, -1870, 410, 760, 15, 0.85);
    flatten(TRACK_CENTER.x, TRACK_CENTER.z, 290, 460, TRACK_FLAT, 1);
    flatten(2050, 1200, 220, 430, 6, 0.95);
    flatten(-180, -2870, 150, 320, 72, 0.95);
    flatten(-2380, 1830, 120, 280, 28, 0.9);
    flatten(2240, 2280, 130, 300, 24, 0.9);
    flatten(2620, 1860, 90, 220, 14, 0.75);
    flatten(-1500, 620, 150, 300, 17, 0.9);

    // mountain lake basin
    const lake = dist2(x, z, 600, -1500);
    h = lerp(h, 7, 1 - smoothstep(170, 310, lake));

    // rocky rim towards the far edges hides the end of the world
    const rim = Math.max(
      smoothstep(4080, 4480, Math.abs(z)) * (z < 0 ? 1.4 : 0.8),
      smoothstep(3900, 4400, -x) * 0.7
    );
    h += rim * (60 + ridged(x * .002, z * .002, 3) * 110);

    // fine surface detail
    h += n3 * 0.9;
    return clamp(h, -32, 360);
  }

  _buildTerrainMesh() {
    const seg = SEGMENTS;
    const verts = (seg + 1) * (seg + 1);
    const positions = new Float32Array(verts * 3);
    const colors = new Float32Array(verts * 3);
    const uvs = new Float32Array(verts * 2);
    const indices = new Uint32Array(seg * seg * 6);
    const c = new THREE.Color();
    let vi = 0, ci = 0, ui = 0;

    for (let j = 0; j <= seg; j++) {
      for (let i = 0; i <= seg; i++) {
        const x = -HALF + (i / seg) * WORLD_SIZE;
        const z = -HALF + (j / seg) * WORLD_SIZE;
        const y = this.heightGrid[j * (seg + 1) + i];
        positions[vi++] = x; positions[vi++] = y; positions[vi++] = z;
        uvs[ui++] = x / 42; uvs[ui++] = z / 42;

        // slope from grid neighbours
        const hL = this.heightGrid[j * (seg + 1) + Math.max(0, i - 1)];
        const hR = this.heightGrid[j * (seg + 1) + Math.min(seg, i + 1)];
        const hD = this.heightGrid[Math.max(0, j - 1) * (seg + 1) + i];
        const hU = this.heightGrid[Math.min(seg, j + 1) * (seg + 1) + i];
        const slope = Math.hypot(hR - hL, hU - hD) / (2 * this.cell);
        const col = this.terrainColor(x, z, y, slope, c);
        colors[ci++] = col.r; colors[ci++] = col.g; colors[ci++] = col.b;
      }
    }
    let k = 0;
    for (let j = 0; j < seg; j++) {
      for (let i = 0; i < seg; i++) {
        const a = j * (seg + 1) + i, b = a + 1, c2 = a + seg + 1, d = c2 + 1;
        indices[k++] = a; indices[k++] = c2; indices[k++] = b;
        indices[k++] = b; indices[k++] = c2; indices[k++] = d;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(new THREE.BufferAttribute(indices, 1));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.97, metalness: 0.02 });
    this.terrainMaterial = mat;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.name = 'terrain';
    this.scene.add(mesh);
    this.terrain = mesh;
  }

  terrainColor(x, z, y, slope, target) {
    const n = fbm(x * 0.014, z * 0.014, 2) * 0.5 + 0.5;
    const n2 = fbm(x * 0.0022 + 9, z * 0.0022, 3) * 0.5 + 0.5;
    const cityD = dist2(x, z, CITY_CENTER.x, CITY_CENTER.z);
    const snowLine = 128 + fbm(x * 0.01, z * 0.01, 2) * 18;
    const coastal = x > 2820 && y < 30;
    const lakeD = dist2(x, z, 600, -1500);

    if (coastal) {
      const sand = new THREE.Color(0xc7b184).multiplyScalar(0.82 + n * 0.25);
      if (lakeD < 340) return target.copy(new THREE.Color(0x8e9c6b)).multiplyScalar(0.9 + n * 0.15);
      return target.copy(sand);
    }
    if (y < 2.4 && x > 2400) {
      return target.copy(new THREE.Color(0x9a8f6e)).multiplyScalar(0.8 + n * 0.2);
    }
    if (z < -1500 && y > snowLine) {
      const snow = new THREE.Color(0xe9f1f6).multiplyScalar(0.86 + n * 0.18);
      return target.copy(snow);
    }
    if (y > 240) {
      return target.copy(new THREE.Color(0xd8e6ee)).multiplyScalar(0.84 + n * 0.16);
    }
    if (slope > 0.55 || (y > 130 && slope > 0.38)) {
      const rock = new THREE.Color(0x79766d).lerp(new THREE.Color(0x554f47), n);
      return target.copy(rock).multiplyScalar(0.82 + n2 * 0.25);
    }
    if (cityD < 1120) {
      const urban = new THREE.Color(0x6d716d).lerp(new THREE.Color(0x83837b), n * 0.5);
      return target.copy(urban).multiplyScalar(0.85 + n2 * 0.18);
    }
    if (x > 1450 && z > 1500) {
      const sand = new THREE.Color(0xb4a06f).lerp(new THREE.Color(0xc8b17d), n);
      return target.copy(sand).multiplyScalar(0.88 + n2 * 0.18);
    }
    if (x < -1750 && z > 950 && z < 2450) {
      const forest = new THREE.Color(0x405c37).lerp(new THREE.Color(0x2e4729), n);
      return target.copy(forest).multiplyScalar(0.9 + n2 * 0.2);
    }
    if (x < -2150 || (z < -1150 && x < -900)) {
      const farm = cellPattern(x + 500, z + 300, 230);
      const palettes = [0x929a52, 0x7f8d48, 0xa39a58, 0x6d7f3e, 0xb0a168, 0x879052];
      const base = new THREE.Color(palettes[Math.floor(farm.id * palettes.length) % palettes.length]);
      const row = Math.sin((x + z * 0.4) * 0.19) * 0.05 + 0.97;
      return target.copy(base).multiplyScalar((0.9 + n * 0.16) * row);
    }
    if (z < -1850 && x > -900 && x < 1100) {
      const alpine = new THREE.Color(0x6d7c55).lerp(new THREE.Color(0x52623f), n);
      return target.copy(alpine).multiplyScalar(0.9 + n2 * 0.18);
    }
    const grass = new THREE.Color(0x55713f).lerp(new THREE.Color(0x415c34), n);
    return target.copy(grass).multiplyScalar(0.88 + n2 * 0.22);
  }

  async _buildTerrain(progress) {
    const seg = SEGMENTS;
    const stride = seg + 1;
    for (let j = 0; j <= seg; j++) {
      const z = -HALF + (j / seg) * WORLD_SIZE;
      for (let i = 0; i <= seg; i++) {
        const x = -HALF + (i / seg) * WORLD_SIZE;
        let h = this.baseHeight(x, z);
        const near = this.roads.nearest(x, z, 62);
        if (near) {
          const corridor = near.road.width / 2 + 20;
          if (near.dist < corridor) {
            const bridge = near.seg?.bridge || (near.road.bridge && near.road.bridge);
            if (!(bridge && near.dist > near.road.width / 2 + 2)) {
              const t = 1 - smoothstep(near.road.width / 2 + 1.5, corridor, near.dist);
              h = lerp(h, near.y - 0.12, t * 0.94);
            }
          }
        }
        this.heightGrid[j * stride + i] = h;
      }
      if (j % 30 === 0) await progress(13 + (j / seg) * 30, 'Sculpting terrain and coastline');
    }
    this._buildTerrainMesh();
  }

  terrainHeight(x, z) {
    const seg = SEGMENTS;
    const gx = clamp(((x + HALF) / WORLD_SIZE) * seg, 0, seg - 0.0001);
    const gz = clamp(((z + HALF) / WORLD_SIZE) * seg, 0, seg - 0.0001);
    const x0 = Math.floor(gx), z0 = Math.floor(gz);
    const tx = gx - x0, tz = gz - z0;
    const s = seg + 1;
    const h00 = this.heightGrid[z0 * s + x0], h10 = this.heightGrid[z0 * s + x0 + 1];
    const h01 = this.heightGrid[(z0 + 1) * s + x0], h11 = this.heightGrid[(z0 + 1) * s + x0 + 1];
    return lerp(lerp(h00, h10, tx), lerp(h01, h11, tx), tz);
  }

  surfaceAt(x, z) {
    const r = this.roads.surfaceAt(x, z);
    if (r) return { y: r.y + 0.12, onRoad: true, type: r.road.type, road: r.road, grip: r.road.type === 'dirt' ? 0.72 : 1 };
    const y = this.terrainHeight(x, z);
    const lake = dist2(x, z, 600, -1500) < 310;
    const sea = y < 0.4 && (x > 2450 || (x > 2250 && Math.abs(z - 1290) < 160));
    return { y: y + 0.03, onRoad: false, type: 'terrain', grip: 0.86, water: sea || (lake && y < 13), lake };
  }

  heightAt(x, z) { return this.surfaceAt(x, z).y; }

  slopeAt(x, z) {
    const h = 2;
    const dx = this.heightAt(x + h, z) - this.heightAt(x - h, z);
    const dz = this.heightAt(x, z + h) - this.heightAt(x, z - h);
    return Math.hypot(dx, dz) / (2 * h);
  }

  normalAt(x, z, out = new THREE.Vector3()) {
    const h = 1.4;
    const hl = this.surfaceAt(x - h, z).y, hr = this.surfaceAt(x + h, z).y;
    const hd = this.surfaceAt(x, z - h).y, hu = this.surfaceAt(x, z + h).y;
    return out.set(hl - hr, 2 * h, hd - hu).normalize();
  }

  // ---------------------------------------------------------------- water
  _buildWater() {
    const seaMat = this._waterMaterial(new THREE.Color(0x082431), new THREE.Color(0x1e6173), 1);
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(18000, 18000), seaMat);
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = 0.15;
    sea.receiveShadow = false;
    sea.renderOrder = 2;
    this.scene.add(sea);
    this.water = sea;

    const lakeMat = this._waterMaterial(new THREE.Color(0x0a2a2c), new THREE.Color(0x2b6f65), 0.45);
    const lake = new THREE.Mesh(new THREE.CircleGeometry(306, 64), lakeMat);
    lake.rotation.x = -Math.PI / 2;
    lake.position.set(600, 13.4, -1500);
    lake.receiveShadow = false;
    this.scene.add(lake);
    this.lake = lake;
    this.animatedWater.push(seaMat, lakeMat);
  }

  _waterMaterial(deep, shallow, scale) {
    const uniforms = {
      uTime: { value: 0 },
      uDeep: { value: deep },
      uShallow: { value: shallow },
      uSunDir: { value: this.engine.sunDir || new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Color(0xfff0d0) },
      uSky: { value: new THREE.Color(0x9fc4dc) },
      uScale: { value: scale },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, uniforms]), fog: true, transparent: false,
      vertexShader: `
        uniform float uTime; uniform float uScale;
        varying vec3 vWorld; varying vec2 vUv;
        #include <fog_pars_vertex>
        void main(){
          vUv = uv;
          vec3 p = position;
          float w = sin(p.x*0.035 + uTime*1.1) * 0.28 + sin(p.z*0.05 - uTime*0.8) * 0.18;
          w += sin((p.x+p.z)*0.014 + uTime*0.4) * 0.35;
          p.y += w * uScale;
          vec4 worldPosition = modelMatrix * vec4(p,1.0);
          vWorld = worldPosition.xyz;
          vec4 mvPosition = viewMatrix * worldPosition;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `
        uniform float uTime; uniform vec3 uDeep,uShallow,uSunColor,uSky,uSunDir; uniform float uScale;
        varying vec3 vWorld; varying vec2 vUv;
        #include <fog_pars_fragment>
        float wave(vec2 p, float t){
          return sin(p.x*0.07 + t) * 0.5 + sin(p.y*0.09 - t*0.7)*0.35 + sin((p.x+p.y)*0.03 + t*0.3)*0.3;
        }
        void main(){
          vec2 p = vWorld.xz;
          float e = 1.4;
          float h = wave(p, uTime);
          float hx = wave(p + vec2(e,0.0), uTime);
          float hz = wave(p + vec2(0.0,e), uTime);
          vec3 n = normalize(vec3((h-hx)*0.55, 1.0, (h-hz)*0.55));
          vec3 viewDir = normalize(cameraPosition - vWorld);
          float fres = pow(1.0 - max(dot(n, viewDir), 0.0), 3.0);
          vec3 col = mix(uDeep, uShallow, 0.22 + fres*0.6);
          col = mix(col, uSky, fres*0.38);
          vec3 sun = normalize(uSunDir);
          vec3 hf = normalize(sun + viewDir);
          float spec = pow(max(dot(n, hf), 0.0), 180.0);
          col += uSunColor * spec * 2.2;
          float sparkle = smoothstep(0.82, 1.0, wave(p*2.6, uTime*1.4));
          col += uSunColor * sparkle * 0.035;
          float foam = smoothstep(0.72, 1.0, sin(p.x*0.08 + p.y*0.11 + uTime*1.2)*0.5+0.5);
          col = mix(col, vec3(0.55,0.66,0.66), foam*0.045);
          gl_FragColor = vec4(col, 1.0);
          #include <fog_fragment>
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    return mat;
  }

  // ---------------------------------------------------------------- animation
  addAnimated(fn) { if (typeof fn === 'function') this.animated.push(fn); return fn; }

  // ---------------------------------------------------------------- collision
  addCollision(x, z, hw, hd, tag = 'solid', height = 20) {
    const key = Math.floor(x / this.collisionCell) + ':' + Math.floor(z / this.collisionCell);
    let arr = this.collisions.get(key);
    if (!arr) { arr = []; this.collisions.set(key, arr); }
    const box = { x, z, hw, hd, tag, height };
    arr.push(box);
    return box;
  }

  isFree(x, z, r = 3, roadClear = 8) {
    if (Math.abs(x) > HALF - 40 || Math.abs(z) > HALF - 40) return false;
    if (this.roads.distanceToRoad(x, z, roadClear) < roadClear) return false;
    const s = this.surfaceAt(x, z);
    if (s.water || s.y < 1.4) return false;
    const cell = this.collisionCell;
    const cx = Math.floor(x / cell), cz = Math.floor(z / cell);
    for (let ix = cx - 1; ix <= cx + 1; ix++) for (let iz = cz - 1; iz <= cz + 1; iz++) {
      const arr = this.collisions.get(ix + ':' + iz);
      if (!arr) continue;
      for (const b of arr) {
        if (Math.abs(x - b.x) < b.hw + r && Math.abs(z - b.z) < b.hd + r) return false;
      }
    }
    return true;
  }

  resolveCollisions(pos, radius = 1.3) {
    const cell = this.collisionCell;
    const cx = Math.floor(pos.x / cell), cz = Math.floor(pos.z / cell);
    let hit = false, nx = 0, nz = 0;
    for (let ix = cx - 1; ix <= cx + 1; ix++) for (let iz = cz - 1; iz <= cz + 1; iz++) {
      const arr = this.collisions.get(ix + ':' + iz);
      if (!arr) continue;
      for (const b of arr) {
        const dx = pos.x - b.x, dz = pos.z - b.z;
        const px = b.hw + radius - Math.abs(dx);
        const pz = b.hd + radius - Math.abs(dz);
        if (px > 0 && pz > 0) {
          if (px < pz) { pos.x += Math.sign(dx || 1) * px; nx += Math.sign(dx || 1); }
          else { pos.z += Math.sign(dz || 1) * pz; nz += Math.sign(dz || 1); }
          hit = true;
        }
      }
    }
    return hit ? { nx, nz } : null;
  }

  // ---------------------------------------------------------------- naming
  regionAt(x, z) {
    if (dist2(x, z, -1500, 640) < 260) return 'Festival Grounds';
    if (dist2(x, z, TRACK_CENTER.x, TRACK_CENTER.z) < 520) return 'Meridian Circuit';
    if (dist2(x, z, CITY_CENTER.x, CITY_CENTER.z) < 1080) return 'Meridian City';
    if (dist2(x, z, 2050, 1200) < 480) return 'Harbor District';
    if (dist2(x, z, -2480, -1870) < 700) return 'Maple Heights';
    if (dist2(x, z, 2240, 2280) < 420) return 'Mirage Flats';
    if (x > 2600) return 'Sunset Coast';
    if (z < -1850) return this.terrainHeight(x, z) > 135 ? 'Frostline Peaks' : 'Cloudline Pass';
    if (x > 1500 && z > 1500) return 'Mirage Flats';
    if (dist2(x, z, -2380, 1830) < 520) return 'Cedar Hollow';
    if (x < -2200) return 'Golden Fields';
    return 'Meridian Valley';
  }

  getTravelPoints() { return TRAVEL_POINTS; }

  // ---------------------------------------------------------------- collectibles
  _buildCollectibles() {
    const ringGeo = new THREE.TorusGeometry(2.1, 0.22, 8, 24);
    const starGeo = new THREE.OctahedronGeometry(0.85, 0);
    const ringMat = new THREE.MeshStandardMaterial({ color: 0xffb648, emissive: 0xff9500, emissiveIntensity: 2.4, metalness: 0.8, roughness: 0.25 });
    const starMat = new THREE.MeshStandardMaterial({ color: 0xffe6a8, emissive: 0xffc44d, emissiveIntensity: 3.2, metalness: 0.6, roughness: 0.2 });
    const glowTex = this.engine._radialTexture(128, [[0, 'rgba(255,200,90,.9)'], [0.35, 'rgba(255,160,40,.3)'], [1, 'rgba(255,120,0,0)']]);
    this.engine.addLampMaterial(ringMat);
    this.engine.addLampMaterial(starMat);
    COLLECTIBLE_SPOTS.forEach(([x0, z0], i) => {
      let x = x0, z = z0;
      let ok = this.isFree(x, z, 4, 7);
      if (!ok) {
        search:
        for (let r = 24; r <= 300; r += 24) {
          for (let a = 0; a < 12; a++) {
            const ang = (a / 12) * Math.PI * 2 + i;
            const nx = x0 + Math.cos(ang) * r;
            const nz = z0 + Math.sin(ang) * r;
            if (this.isFree(nx, nz, 4, 7)) { x = nx; z = nz; ok = true; break search; }
          }
        }
      }
      if (!ok) {
        // last resort: step inland from the coast so the gear is always reachable
        for (let k = 0; k < 40; k++) {
          const nx = clamp(x0 - k * 14, -4100, 4100);
          const nz = clamp(z0 - k * 6, -4100, 4100);
          if (!this.surfaceAt(nx, nz).water && this.terrainHeight(nx, nz) > 1.5) { x = nx; z = nz; break; }
        }
      }
      const s = this.surfaceAt(x, z);
      const y = s.y + 4.2;
      const g = new THREE.Group();
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI / 2.6;
      const star = new THREE.Mesh(starGeo, starMat);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.9 }));
      glow.scale.setScalar(12);
      g.add(ring, star, glow);
      g.position.set(x, y, z);
      g.userData = { id: i, baseY: y, phase: i * 0.63, collected: false, spin: 0.7 + (i % 5) * 0.1 };
      this.scene.add(g);
      this.collectibles.push(g);
    });
  }

  collectNear(x, z, radius = 11) {
    for (const c of this.collectibles) {
      if (c.userData.collected) continue;
      const dx = c.position.x - x, dz = c.position.z - z;
      if (dx * dx + dz * dz < radius * radius) {
        c.userData.collected = true;
        c.visible = false;
        return c.userData.id;
      }
    }
    return -1;
  }

  restoreCollected(ids) {
    for (const id of ids) {
      const c = this.collectibles[id];
      if (c) { c.userData.collected = true; c.visible = false; }
    }
  }

  // ---------------------------------------------------------------- events
  _buildEvents() {
    const defs = [
      { id: 'city', name: 'City Sprint', road: 'Downtown Loop', closed: true, from: 0.02, to: 0.985, cps: 10, target: 118, reward: 24000 },
      { id: 'coast', name: 'Coastal Rush', road: 'Coastal Run', closed: false, from: 0.10, to: 0.72, cps: 9, target: 148, reward: 26000 },
      { id: 'alpine', name: 'Alpine Ascent', road: 'Cloudline Pass', closed: false, from: 0.03, to: 0.965, cps: 10, target: 175, reward: 30000 },
      { id: 'desert', name: 'Desert Storm', road: 'Dune Run', closed: false, from: 0.04, to: 0.93, cps: 9, target: 155, reward: 22000 },
      { id: 'ring', name: 'Ring Blast', road: 'Horizon Ring', closed: true, from: 0.0, to: 0.97, cps: 14, target: 235, reward: 35000 },
      { id: 'gravel', name: 'Gravel Grind', road: 'Timber Trail', closed: true, from: 0.01, to: 0.99, cps: 9, target: 140, reward: 28000 },
    ];
    this.events = defs.map(d => {
      const road = this.roads.byName.get(d.road);
      const pts = [];
      for (let i = 0; i < d.cps; i++) {
        const t = lerp(d.from, d.to, i / (d.cps - 1));
        const idx = Math.floor(t * road.points.length) % road.points.length;
        const p = road.points[idx];
        pts.push({ x: p.x, z: p.z, y: p.y + 0.2 });
      }
      const start = pts[0];
      const next = pts[1];
      const heading = Math.atan2(next.x - start.x, next.z - start.z);
      return { ...d, points: pts, start: { ...start, heading }, roadRef: road };
    });
    for (const e of this.events) this._buildEventGate(e);
  }

  _buildEventGate(e) {
    const g = new THREE.Group();
    const postMat = new THREE.MeshStandardMaterial({ color: 0x1a2026, roughness: 0.4, metalness: 0.75 });
    const accentMat = new THREE.MeshStandardMaterial({ color: 0x35e6ff, emissive: 0x35e6ff, emissiveIntensity: 2.6, roughness: 0.3, metalness: 0.4 });
    this.engine.addLampMaterial(accentMat);
    const postGeo = new THREE.BoxGeometry(0.7, 7.5, 0.7);
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(s * 7.5, 3.75, 0);
      g.add(post);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.12, 5.5, 0.1), accentMat);
      strip.position.set(s * 7.2, 3, 0.36);
      g.add(strip);
    }
    // banner canvas
    const c = document.createElement('canvas'); c.width = 512; c.height = 128;
    const ctx = c.getContext('2d');
    ctx.fillStyle = 'rgba(6,10,14,.94)'; ctx.fillRect(0, 0, 512, 128);
    ctx.strokeStyle = '#35e6ff'; ctx.lineWidth = 6; ctx.strokeRect(6, 6, 500, 116);
    ctx.fillStyle = '#ffffff'; ctx.font = '700 46px "Chakra Petch", sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(e.name.toUpperCase(), 256, 62);
    ctx.fillStyle = '#35e6ff'; ctx.font = '500 17px "Chakra Petch", sans-serif';
    ctx.fillText('APEX HORIZON EVENT  ·  PRESS E TO RACE', 256, 96);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(15, 3.7), new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, toneMapped: false }));
    banner.position.set(0, 6.2, 0);
    g.add(banner);
    g.position.set(e.start.x, e.start.y, e.start.z);
    g.rotation.y = e.start.heading;
    this.scene.add(g);
    e.gate = g;
    this.eventGates.push(g);
  }

  eventNear(x, z) {
    for (const e of this.events) {
      if (dist2(x, z, e.start.x, e.start.z) < 20) return e;
    }
    return null;
  }

  // ---------------------------------------------------------------- map
  _buildMapCanvas() {
    const size = 1024;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(size, size);
    const data = img.data;
    const col = new THREE.Color();
    const scale = size / WORLD_SIZE;
    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++) {
        const x = -HALF + px / scale;
        const z = -HALF + py / scale;
        const y = this.terrainHeight(x, z);
        if (y < 0.4 || (x > 2450 && y < 0.6)) {
          const depth = clamp(-y / 30, 0, 1);
          const r = lerp(38, 14, depth), g = lerp(91, 48, depth), b = lerp(114, 70, depth);
          const i = (py * size + px) * 4;
          data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
          continue;
        }
        // cheap slope approximation
        const hL = this.terrainHeight(x - 12, z), hR = this.terrainHeight(x + 12, z);
        const hD = this.terrainHeight(x, z - 12), hU = this.terrainHeight(x, z + 12);
        const slope = Math.hypot(hR - hL, hU - hD) / 24;
        this.terrainColor(x, z, y, slope, col);
        // darken for map contrast
        const i = (py * size + px) * 4;
        data[i] = col.r * 155;
        data[i + 1] = col.g * 150;
        data[i + 2] = col.b * 145;
        data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    // water overlay sheen
    const grad = ctx.createLinearGradient(0, 0, size, size);
    grad.addColorStop(0, 'rgba(80,140,165,.06)');
    grad.addColorStop(1, 'rgba(0,0,0,.12)');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, size, size);
    const toX = x => (x + HALF) * scale;
    const toY = z => (z + HALF) * scale;
    // subtle region bands
    ctx.globalAlpha = 0.28;
    this.roads.drawMap(ctx, toX, toY, scale, size, size);
    ctx.globalAlpha = 1;
    // route markers
    for (const e of this.events) {
      const x = toX(e.start.x), y = toY(e.start.z);
      ctx.fillStyle = '#ff5a12';
      ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,90,18,.45)'; ctx.lineWidth = 9; ctx.stroke();
    }
    this.mapCanvas = c;
    this.mapScale = scale;
  }

  // ---------------------------------------------------------------- update
  update(dt, camera) {
    this.time += dt;
    const t = this.time;
    for (const m of this.animatedWater) {
      m.uniforms.uTime.value = t;
      if (this.engine.sunDir) m.uniforms.uSunDir.value.copy(this.engine.sunDir);
      m.uniforms.uSunColor.value.copy(this.engine.sun.color);
      if (this.engine.scene.fog) m.uniforms.uSky.value.copy(this.engine.scene.fog.color).lerp(new THREE.Color(0x9fc4dc), 0.35);
    }
    for (const c of this.collectibles) {
      if (c.userData.collected) continue;
      c.rotation.y += dt * c.userData.spin;
      c.position.y = c.userData.baseY + Math.sin(t * 1.7 + c.userData.phase) * 0.6;
      c.children[1].rotation.y -= dt * 1.6;
      c.children[1].rotation.x += dt * 0.7;
    }
    for (const fn of this.animated) fn(dt, t);
    if (this.traffic) this.traffic.update(dt);
  }
}
