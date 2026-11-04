import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp, smoothstep } from '../core/noise.js';

export const CITY_CENTER = { x: -1780, z: -880 };
export const CITY_FLAT = 8.2;
export const TRACK_CENTER = { x: -260, z: 2860 };
export const TRACK_FLAT = 22;

export function sampleSpline(points, spacing = 12, closed = false) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(p[0], 0, p[1])), closed, 'catmullrom', 0.25);
  const len = curve.getLength();
  const n = Math.max(8, Math.round(len / spacing));
  const pts = curve.getSpacedPoints(closed ? n : n);
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    if (closed && i === pts.length - 1) break;
    out.push({ x: pts[i].x, z: pts[i].z, y: 0 });
  }
  return out;
}

function line(points, spacing = 12) { return sampleSpline(points, spacing, false); }
function loop(points, spacing = 12) { return sampleSpline(points, spacing, true); }

function makeRoad(name, type, width, points, opts = {}) {
  return {
    name, type, width, points,
    closed: !!opts.closed,
    flatY: opts.flatY,
    rails: opts.rails || false,
    lights: opts.lights || 0,
    smooth: opts.smooth ?? 4,
    grade: opts.grade ?? 0.09,
    minimap: opts.minimap !== false,
    ...opts,
  };
}

function gridRoads() {
  const roads = [];
  const c = CITY_CENTER;
  const x0 = c.x - 850, x1 = c.x + 850, z0 = c.z - 720, z1 = c.z + 720;
  const cols = 7, rows = 6;
  for (let i = 0; i <= cols; i++) {
    const x = x0 + (x1 - x0) * i / cols;
    if (i === 3 || i === 5) continue;
    roads.push(makeRoad(`City Ave ${i}`, 'city', i === 2 ? 18 : 13, line([[x, z0 - 120], [x, z1 + 140]], 14), { flatY: CITY_FLAT, smooth: 0 }));
  }
  for (let j = 0; j <= rows; j++) {
    const z = z0 + (z1 - z0) * j / rows;
    roads.push(makeRoad(`City St ${j}`, 'city', j === 3 ? 18 : 13, line([[x0 - 160, z], [x1 + 160, z]], 14), { flatY: CITY_FLAT, smooth: 0 }));
  }
  // ring boulevard around downtown
  roads.push(makeRoad('Downtown Loop', 'arterial', 18, loop([
    [c.x - 620, c.z - 500], [c.x - 350, c.z - 650], [c.x + 220, c.z - 640], [c.x + 560, c.z - 440],
    [c.x + 660, c.z + 40], [c.x + 470, c.z + 480], [c.x + 60, c.z + 620], [c.x - 420, c.z + 560],
    [c.x - 680, c.z + 260], [c.x - 720, c.z - 160],
  ], 15), { closed: true, flatY: CITY_FLAT, smooth: 0, lights: 45 }));
  return roads;
}

export function buildRoads() {
  const roads = [];
  const add = r => roads.push(r);

  // THE RING — an organic 15 km orbital highway encircling Meridian.
  const ringPts = [];
  for (let i = 0; i < 84; i++) {
    const a = (i / 84) * Math.PI * 2;
    const r = 2830 + Math.sin(a * 3.0 + 0.7) * 170 + Math.cos(a * 5.0 + 1.4) * 85 + Math.sin(a * 8.0) * 28;
    ringPts.push([Math.cos(a) * r, Math.sin(a) * r * 0.94]);
  }
  add(makeRoad('Horizon Ring', 'highway', 27, loop(ringPts, 14), { closed: true, rails: true, lights: 90, smooth: 9, grade: 0.055, lanes: 4 }));

  // Meridian Spine, north to south.
  add(makeRoad('Meridian Spine', 'highway', 25, line([
    [-1180, -3520], [-1120, -3000], [-940, -2400], [-980, -1800], [-900, -1200],
    [-940, -500], [-860, 300], [-900, 1000], [-980, 1800], [-900, 2600], [-970, 3360],
  ], 16), { rails: true, lights: 55, smooth: 10, grade: 0.065, lanes: 4 }));

  // Coast to Country highway (east-west).
  add(makeRoad('Coast & Country', 'highway', 25, line([
    [-3980, 520], [-3400, 470], [-2950, 560], [-2300, 430], [-1600, 520], [-900, 420],
    [-200, 520], [500, 430], [1200, 520], [1900, 470], [2520, 560], [2960, 660],
  ], 16), { rails: true, lights: 60, smooth: 9, grade: 0.055, lanes: 4 }));

  // Coastal highway, following the eastern shore.
  add(makeRoad('Coastal Run', 'highway', 21, line([
    [2790, -3120], [2870, -2650], [2770, -2100], [2900, -1550], [2820, -1000], [2930, -460],
    [2810, 100], [2910, 620], [2830, 1120], [2910, 1620], [2790, 2150], [2850, 2700], [2760, 3220],
  ], 13), { rails: true, lights: 48, smooth: 8, grade: 0.06, lanes: 4, bridges: [{ from: 1150, to: 1430, y: 9.5 }] }));

  // Mountain pass — switchbacks up to the snow line.
  add(makeRoad('Cloudline Pass', 'mountain', 12, line([
    [-940, -1500], [-760, -1680], [-1090, -1860], [-820, -2020], [-1140, -2200],
    [-870, -2360], [-1120, -2520], [-720, -2660], [-920, -2800], [-610, -2880],
    [-420, -2980], [-260, -3120], [-150, -3340], [-40, -3540],
  ], 9), { rails: true, lights: 12, smooth: 6, grade: 0.13, mountain: true }));

  // Suburb loop.
  add(makeRoad('Maple Heights', 'rural', 10, loop([
    [-2840, -2080], [-2440, -2250], [-2130, -2070], [-2070, -1740], [-2320, -1520], [-2680, -1580], [-2890, -1820],
  ], 11), { closed: true, smooth: 3, lights: 25 }));
  add(makeRoad('Maple Connector', 'rural', 9, line([[-2370, -1520], [-2250, -1160], [-2000, -930], [-1900, -820]], 10), { smooth: 3, lights: 8 }));

  // Farm grid (west).
  add(makeRoad('Orchard Lane', 'rural', 8, line([[-3900, 130], [-3200, 80], [-2700, 200], [-2300, 340]], 11), { smooth: 2 }));
  add(makeRoad('Harvest Road', 'rural', 8, line([[-3700, 1100], [-3300, 700], [-3100, 150], [-3000, -500]], 11), { smooth: 2 }));
  add(makeRoad('Windmill Route', 'rural', 8, line([[-3550, -700], [-3300, -1400], [-2950, -1750], [-2800, -2100]], 11), { smooth: 3 }));

  // Desert road and town.
  add(makeRoad('Dune Run', 'rural', 11, line([
    [-960, 1720], [-700, 1840], [-340, 1810], [120, 1960], [600, 2050], [1050, 2170],
    [1460, 2160], [1810, 2320], [2160, 2370], [2540, 2510], [2840, 2720],
  ], 13), { smooth: 4, rails: true, lights: 20 }));
  add(makeRoad('Mirage Loop', 'rural', 8, loop([[2080, 2180], [2320, 2080], [2450, 2260], [2300, 2430], [2110, 2380]], 10), { closed: true, smooth: 2 }));

  // Forest village road and off-road trail.
  add(makeRoad('Cedar Hollow', 'rural', 9, line([[-2780, 760], [-2600, 1040], [-2360, 1200], [-2130, 1460], [-2250, 1760], [-2520, 1960], [-2740, 2240]], 11), { smooth: 3 }));
  add(makeRoad('Timber Trail', 'dirt', 7, line([
    [-2740, 2240], [-2460, 2380], [-2250, 2220], [-2040, 2380], [-1850, 2120], [-2000, 1850], [-1820, 1660], [-2050, 1520], [-2280, 1690],
  ], 9), { closed: true, smooth: 3, dirt: true }));

  // Port and industry connector.
  add(makeRoad('Harbor Approach', 'arterial', 16, line([[2380, 620], [2310, 880], [2200, 1120], [2040, 1200]], 11), { smooth: 3, rails: true, lights: 20 }));
  add(makeRoad('Dock Loop', 'city', 13, loop([[1960, 1080], [2220, 1280], [2060, 1450], [1800, 1320], [1780, 1140]], 10), { closed: true, smooth: 0, flatY: 6, lights: 14 }));
  add(makeRoad('Foundry Row', 'rural', 10, line([[1300, 700], [1500, 900], [1600, 1180], [1500, 1440]], 10), { smooth: 2 }));

  // Race circuit (closed road course).
  const trackPts = [
    [-520, 2700], [-380, 2650], [-120, 2640], [80, 2680], [200, 2790], [230, 2920],
    [150, 3020], [-20, 3070], [-200, 3090], [-380, 3040], [-500, 2940], [-560, 2820],
  ];
  add(makeRoad('Meridian Circuit', 'track', 16, loop(trackPts, 10), { closed: true, flatY: TRACK_FLAT, smooth: 0, minimap: true, track: true }));

  // Alpine village loop.
  add(makeRoad('Alpine Way', 'mountain', 9, line([[-420, -2980], [-160, -3010], [80, -2940], [260, -2820], [330, -2640]], 9), { smooth: 3, mountain: true, lights: 10 }));

  // City grid & suburb streets.
  for (const r of gridRoads()) add(r);

  // Festival connector, a short boulevard from downtown to the festival.
  add(makeRoad('Festival Boulevard', 'arterial', 16, line([[-1650, -300], [-1580, 40], [-1500, 260], [-1450, 520]], 10), { smooth: 2, lights: 18 }));

  return roads;
}

export class RoadNetwork {
  constructor(roads, baseHeight) {
    this.roads = roads;
    this.byName = new Map(roads.map(r => [r.name, r]));
    this._elevate(baseHeight);
    this._hash = new Map();
    this.cell = 90;
    this._buildHash();
  }

  _elevate(baseHeight) {
    for (const road of this.roads) {
      const pts = road.points;
      if (road.flatY !== undefined) {
        pts.forEach(p => p.y = road.flatY);
        continue;
      }
      for (const p of pts) p.y = baseHeight(p.x, p.z);
      // smooth profile
      const passes = road.smooth;
      for (let k = 0; k < passes; k++) {
        const ys = pts.map(p => p.y);
        for (let i = 0; i < pts.length; i++) {
          if (road.closed || (i > 0 && i < pts.length - 1)) {
            const a = ys[(i - 1 + pts.length) % pts.length];
            const b = ys[(i + 1) % pts.length];
            pts[i].y = a * 0.25 + ys[i] * 0.5 + b * 0.25;
          }
        }
      }
      // enforce gentle grade by iterative smoothing of height deltas
      if (road.type !== 'dirt') {
        for (let pass = 0; pass < 7; pass++) {
          for (let i = 0; i < pts.length - (road.closed ? 0 : 1); i++) {
            const j = (i + 1) % pts.length;
            if (!road.closed && j === 0) break;
            const dx = pts[j].x - pts[i].x, dz = pts[j].z - pts[i].z;
            const d = Math.hypot(dx, dz) || 1;
            const max = d * road.grade;
            let dy = pts[j].y - pts[i].y;
            if (Math.abs(dy) > max) {
              const fix = (Math.abs(dy) - max) * Math.sign(dy) * 0.5;
              pts[i].y += fix; pts[j].y -= fix;
            }
          }
        }
      }
      // keep roads above the sea
      for (const p of pts) p.y = Math.max(p.y, 2.2);
      // bridge decks span channels and other depressions
      if (road.bridges) {
        for (const p of pts) {
          for (const b of road.bridges) {
            if (p.z >= b.from && p.z <= b.to) {
              const edge = Math.min(p.z - b.from, b.to - p.z);
              const t = smoothstep(0, 26, edge);
              p.y = Math.max(p.y, b.y - (1 - t) * 1.4);
              p.bridge = edge < 90;
            }
          }
        }
      }
    }
  }

  _buildHash() {
    const cell = this.cell;
    for (const road of this.roads) {
      const n = road.points.length;
      const segCount = road.closed ? n : n - 1;
      road.segments = [];
      for (let i = 0; i < segCount; i++) {
        const a = road.points[i], b = road.points[(i + 1) % n];
        const seg = { ax: a.x, az: a.z, ay: a.y, bx: b.x, bz: b.z, by: b.y, road, i, bridge: !!(a.bridge || b.bridge) };
        road.segments.push(seg);
        const minx = Math.min(a.x, b.x) - 2, maxx = Math.max(a.x, b.x) + 2;
        const minz = Math.min(a.z, b.z) - 2, maxz = Math.max(a.z, b.z) + 2;
        for (let cx = Math.floor(minx / cell); cx <= Math.floor(maxx / cell); cx++) {
          for (let cz = Math.floor(minz / cell); cz <= Math.floor(maxz / cell); cz++) {
            const key = cx + ':' + cz;
            let arr = this._hash.get(key);
            if (!arr) { arr = []; this._hash.set(key, arr); }
            arr.push(seg);
          }
        }
      }
    }
  }

  nearest(x, z, maxDist = 40) {
    const cell = this.cell;
    let best = null, bestD = maxDist * maxDist;
    const r = Math.ceil(maxDist / cell) + 1;
    const cx = Math.floor(x / cell), cz = Math.floor(z / cell);
    const seen = new Set();
    for (let ix = cx - r; ix <= cx + r; ix++) {
      for (let iz = cz - r; iz <= cz + r; iz++) {
        const arr = this._hash.get(ix + ':' + iz);
        if (!arr) continue;
        for (const s of arr) {
          if (seen.has(s)) continue;
          seen.add(s);
          const dx = s.bx - s.ax, dz = s.bz - s.az;
          const l2 = dx * dx + dz * dz;
          let t = l2 > 0 ? ((x - s.ax) * dx + (z - s.az) * dz) / l2 : 0;
          t = clamp(t, 0, 1);
          const px = s.ax + dx * t, pz = s.az + dz * t;
          const d2 = (x - px) ** 2 + (z - pz) ** 2;
          if (d2 < bestD) {
            bestD = d2;
            best = { road: s.road, dist: Math.sqrt(d2), x: px, z: pz, y: s.ay + (s.by - s.ay) * t, t, seg: s };
          }
        }
      }
    }
    return best;
  }

  surfaceAt(x, z) {
    const hit = this.nearest(x, z, 16);
    if (hit && hit.dist <= hit.road.width * 0.5 + 1.2) return { y: hit.y, road: hit.road, dist: hit.dist, onRoad: true, type: hit.road.type };
    return null;
  }

  roadPointAt(name, t) {
    const r = this.byName.get(name);
    if (!r) return null;
    const idx = clamp(Math.floor(t * (r.points.length - 1)), 0, r.points.length - 1);
    return r.points[idx];
  }

  distanceToRoad(x, z, max = 60) { const n = this.nearest(x, z, max); return n ? n.dist : max; }

  buildMeshes(scene) {
    const roadGeos = new Map();
    const shoulderGeos = [];
    const sidewalkGeos = [];
    const texCache = new Map();

    for (const road of this.roads) {
      const matType = road.type;
      if (!roadGeos.has(matType)) roadGeos.set(matType, []);
      const geos = roadGeos.get(matType);
      const surf = this._ribbon(road.points, road.closed, road.width, 0.07, 20);
      geos.push(surf);
      if (road.type !== 'dirt') {
        const shoulder = this._ribbon(road.points, road.closed, road.width + 7.5, 0.035, 20, -0.03);
        shoulderGeos.push(shoulder);
      }
      if (road.type === 'city' || road.type === 'arterial') {
        const walk = this._ribbon(road.points, road.closed, road.width + 17, 0.14, 20, -0.09);
        sidewalkGeos.push(walk);
      }
    }

    const materials = {
      highway: this._asphaltMaterial('highway', 4, '#2a2d31'),
      arterial: this._asphaltMaterial('arterial', 2, '#303338'),
      city: this._asphaltMaterial('city', 2, '#34373c'),
      rural: this._asphaltMaterial('rural', 2, '#3b3a37'),
      mountain: this._asphaltMaterial('rural', 2, '#35383b'),
      dirt: this._dirtMaterial(),
      track: this._asphaltMaterial('track', 1, '#232529'),
    };
    this.materials = materials;
    this.roadMeshes = [];
    for (const [type, geos] of roadGeos) {
      const merged = mergeGeometries(geos, false);
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, materials[type] || materials.rural);
      mesh.receiveShadow = true;
      mesh.name = 'roads-' + type;
      scene.add(mesh);
      this.roadMeshes.push(mesh);
      geos.forEach(g => g.dispose());
    }
    if (shoulderGeos.length) {
      const merged = mergeGeometries(shoulderGeos, false);
      const mat = new THREE.MeshStandardMaterial({ color: 0x5b5b53, roughness: 0.96, metalness: 0 });
      const mesh = new THREE.Mesh(merged, mat);
      mesh.receiveShadow = true;
      scene.add(mesh);
      this.shoulderMaterial = mat;
      shoulderGeos.forEach(g => g.dispose());
    }
    if (sidewalkGeos.length) {
      const merged = mergeGeometries(sidewalkGeos, false);
      const mat = new THREE.MeshStandardMaterial({ color: 0x8b8b86, roughness: 0.9, metalness: 0.03 });
      const mesh = new THREE.Mesh(merged, mat);
      mesh.receiveShadow = true;
      scene.add(mesh);
      this.sidewalkMaterial = mat;
      sidewalkGeos.forEach(g => g.dispose());
    }
    this._buildLights(scene);
    this._buildRails(scene);
  }

  _ribbon(points, closed, width, yOff, uvScale, extraY = 0) {
    const pos = [], uv = [], idx = [];
    const n = points.length;
    let dist = 0;
    for (let i = 0; i < n; i++) {
      const p = points[i];
      const p2 = points[(i + 1) % n];
      const p0 = points[(i - 1 + n) % n];
      let dx = p2.x - p0.x, dz = p2.z - p0.z;
      if (!closed && i === 0) { dx = p2.x - p.x; dz = p2.z - p.z; }
      if (!closed && i === n - 1) { dx = p.x - p0.x; dz = p.z - p0.z; }
      const l = Math.hypot(dx, dz) || 1;
      const nx = -dz / l, nz = dx / l;
      pos.push(p.x + nx * width / 2, p.y + yOff + extraY, p.z + nz * width / 2);
      pos.push(p.x - nx * width / 2, p.y + yOff + extraY, p.z - nz * width / 2);
      if (i > 0) dist += Math.hypot(p.x - p0.x, p.z - p0.z);
      uv.push(0, dist / uvScale, 1, dist / uvScale);
    }
    const segs = closed ? n : n - 1;
    for (let i = 0; i < segs; i++) {
      const a = i * 2, b = i * 2 + 1, c = ((i + 1) % n) * 2, d = ((i + 1) % n) * 2 + 1;
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  _asphaltMaterial(type, lanes, base) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 512;
    const ctx = c.getContext('2d');
    ctx.fillStyle = base; ctx.fillRect(0, 0, 512, 512);
    // aggregate noise
    const img = ctx.getImageData(0, 0, 512, 512);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (Math.random() - 0.5) * 20;
      d[i] += n; d[i + 1] += n; d[i + 2] += n;
    }
    ctx.putImageData(img, 0, 0);
    // faint tar seams & patches
    ctx.strokeStyle = 'rgba(12,13,15,.22)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      const x = Math.random() * 512;
      ctx.moveTo(x, 0);
      ctx.bezierCurveTo(x + (Math.random() - .5) * 80, 170, x + (Math.random() - .5) * 80, 340, x + (Math.random() - .5) * 40, 512);
      ctx.stroke();
    }
    for (let i = 0; i < 12; i++) {
      ctx.fillStyle = `rgba(0,0,0,${0.03 + Math.random() * .05})`;
      ctx.fillRect(Math.random() * 512, Math.random() * 512, 20 + Math.random() * 80, 10 + Math.random() * 40);
    }
    if (type !== 'dirt') {
      const edge = 10;
      ctx.fillStyle = 'rgba(232,230,220,.72)';
      ctx.fillRect(edge, 0, 5, 512); ctx.fillRect(511 - edge, 0, 5, 512);
      if (type !== 'track') {
        const dash = 74, gap = 58;
        for (let lane = 1; lane < lanes; lane++) {
          const x = (512 * lane) / lanes;
          for (let y = 0; y < 512; y += dash + gap) {
            ctx.fillStyle = type === 'rural' ? 'rgba(232,205,130,.72)' : 'rgba(230,232,228,.62)';
            ctx.fillRect(x - 2, y, 4, dash);
          }
        }
      }
      if (type === 'highway' || type === 'track') {
        // darker wheel tracks
        ctx.fillStyle = 'rgba(0,0,0,.08)';
        for (let lane = 0; lane < lanes; lane++) {
          const cx = 512 * (lane + .5) / lanes;
          ctx.fillRect(cx - 32, 0, 22, 512); ctx.fillRect(cx + 10, 0, 22, 512);
        }
      }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: type === 'track' ? 0.68 : 0.88, metalness: 0.03 });
    mat.userData.wetBase = mat.roughness;
    return mat;
  }

  _dirtMaterial() {
    const c = document.createElement('canvas'); c.width = 256; c.height = 256;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#6b5b45'; ctx.fillRect(0, 0, 256, 256);
    const img = ctx.getImageData(0, 0, 256, 256); const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (Math.random() - .5) * 34;
      d[i] += n + 10; d[i + 1] += n + 4; d[i + 2] += n - 6;
    }
    ctx.putImageData(img, 0, 0);
    ctx.fillStyle = 'rgba(50,38,26,.35)';
    ctx.fillRect(55, 0, 28, 256); ctx.fillRect(173, 0, 28, 256);
    for (let i = 0; i < 180; i++) {
      ctx.fillStyle = `rgba(${90 + Math.random() * 40},${75 + Math.random() * 30},${55 + Math.random() * 20},.4)`;
      ctx.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 4, 1 + Math.random() * 3);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return new THREE.MeshStandardMaterial({ map: tex, roughness: 1, metalness: 0 });
  }

  _buildLights(scene) {
    const poles = [];
    const heads = [];
    const poleGeo = new THREE.CylinderGeometry(0.12, 0.18, 8, 5);
    poleGeo.translate(0, 4, 0);
    const headGeo = new THREE.BoxGeometry(0.5, 0.22, 1.5);
    headGeo.translate(0, 7.9, 0.6);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x4a5057, roughness: 0.5, metalness: 0.7 });
    const headMat = new THREE.MeshStandardMaterial({ color: 0x1a1d20, emissive: 0xffc47a, emissiveIntensity: 2.5, roughness: 0.3 });
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3(1, 1, 1);
    for (const road of this.roads) {
      const step = road.lights || 0;
      if (!step) continue;
      const stride = Math.max(2, Math.round(step / 12));
      for (let i = 0; i < road.points.length; i += stride) {
        const p = road.points[i];
        const p2 = road.points[(i + 1) % road.points.length];
        const dx = p2.x - p.x, dz = p2.z - p.z;
        const ang = Math.atan2(dx, dz);
        const side = (i / stride) % 2 === 0 ? 1 : -1;
        const nx = Math.cos(ang) * side, nz = -Math.sin(ang) * side;
        const px = p.x + nx * (road.width / 2 + 2.2);
        const pz = p.z + nz * (road.width / 2 + 2.2);
        q.setFromEuler(new THREE.Euler(0, ang, 0));
        m.compose(new THREE.Vector3(px, p.y, pz), q, s);
        poles.push(m.clone());
        heads.push(m.clone());
      }
    }
    if (!poles.length) return;
    const poleMesh = new THREE.InstancedMesh(poleGeo, poleMat, poles.length);
    const headMesh = new THREE.InstancedMesh(headGeo, headMat, heads.length);
    poles.forEach((mat, i) => { poleMesh.setMatrixAt(i, mat); headMesh.setMatrixAt(i, mat); });
    poleMesh.instanceMatrix.needsUpdate = true; headMesh.instanceMatrix.needsUpdate = true;
    poleMesh.castShadow = true;
    scene.add(poleMesh, headMesh);
    scene.userData.lampMaterials?.push(headMat);
    this.lampMaterial = headMat;
  }

  _buildRails(scene) {
    const pieces = [];
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3(1, 1, 1);
    const m = new THREE.Matrix4();
    for (const road of this.roads) {
      if (!road.rails) continue;
      const pts = road.points;
      for (let side = -1; side <= 1; side += 2) {
        for (let i = 0; i < pts.length; i += 2) {
          const p = pts[i], p2 = pts[(i + 2) % pts.length];
          const dx = p2.x - p.x, dz = p2.z - p.z;
          const l = Math.hypot(dx, dz) || 1;
          const ang = Math.atan2(dx, dz);
          const nx = Math.cos(ang) * side, nz = -Math.sin(ang) * side;
          const px = p.x + nx * (road.width / 2 + 1.1) + dx * 0.5;
          const pz = p.z + nz * (road.width / 2 + 1.1) + dz * 0.5;
          q.setFromEuler(new THREE.Euler(0, ang, 0));
          // rail beam spans two sample segments
          m.compose(new THREE.Vector3(px, p.y + 0.55, pz), q, new THREE.Vector3(0.12, 0.28, l * 1.02));
          pieces.push({ mat: m.clone(), post: false });
          if (i % 6 === 0) {
            m.compose(new THREE.Vector3(p.x + nx * (road.width / 2 + 1.1), p.y + 0.25, p.z + nz * (road.width / 2 + 1.1)), q, new THREE.Vector3(0.12, 0.6, 0.12));
            pieces.push({ mat: m.clone(), post: true });
          }
        }
      }
    }
    if (!pieces.length) return;
    const beamGeo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshStandardMaterial({ color: 0x9aa2a9, roughness: 0.42, metalness: 0.8 });
    const mesh = new THREE.InstancedMesh(beamGeo, mat, pieces.length);
    pieces.forEach((p, i) => mesh.setMatrixAt(i, p.mat));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = false; mesh.receiveShadow = false;
    scene.add(mesh);
  }

  drawMap(ctx, toX, toY, scale, w, h) {
    const colorFor = type => ({
      highway: '#d9d3b8', arterial: '#aaa89a', city: '#85857d', rural: '#79786b',
      mountain: '#9a917f', dirt: '#76624a', track: '#ff8b4a',
    }[type] || '#888');
    for (const road of this.roads) {
      ctx.strokeStyle = colorFor(road.type);
      ctx.lineWidth = Math.max(0.7, road.width * scale * (road.type === 'track' ? 1.25 : 1));
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath();
      for (let i = 0; i < road.points.length; i++) {
        const p = road.points[i];
        const x = toX(p.x), y = toY(p.z);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      if (road.closed) ctx.closePath();
      ctx.stroke();
    }
  }
}

export function createRoadNetwork(baseHeight) {
  return new RoadNetwork(buildRoads(), baseHeight);
}
