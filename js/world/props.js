import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp, lerp, smoothstep, dist2, mulberry32 } from '../core/noise.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();

function instanced(geo, mat, items, opts = {}) {
  if (!items.length) return null;
  const mesh = new THREE.InstancedMesh(geo, mat, items.length);
  let hasColor = false;
  for (const it of items) if (it.color) { hasColor = true; break; }
  items.forEach((it, i) => {
    _e.set(it.rx || 0, it.ry || 0, it.rz || 0);
    _q.setFromEuler(_e);
    _p.set(it.x, it.y, it.z);
    _s.set(it.sx ?? 1, it.sy ?? 1, it.sz ?? 1);
    _m.compose(_p, _q, _s);
    mesh.setMatrixAt(i, _m);
    if (hasColor) mesh.setColorAt(i, it.color || new THREE.Color(0xffffff));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = !!opts.castShadow;
  mesh.receiveShadow = opts.receiveShadow !== false;
  mesh.frustumCulled = opts.frustumCulled !== false;
  if (opts.name) mesh.name = opts.name;
  return mesh;
}

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function signTexture(lines, bg = '#0b1016', accent = '#ff5a12', w = 512, h = 256) {
  return canvasTexture(w, h, (ctx) => {
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = accent; ctx.lineWidth = 6; ctx.strokeRect(4, 4, w - 8, h - 8);
    ctx.textAlign = 'center';
    let y = h * 0.22;
    lines.forEach((l, i) => {
      ctx.fillStyle = i === 0 ? '#ffffff' : accent;
      ctx.font = `${i === 0 ? '700' : '500'} ${i === 0 ? Math.round(h * .2) : Math.round(h * .09)}px sans-serif`;
      ctx.fillText(l, w / 2, y + (i === 0 ? h * .12 : 0));
      y += i === 0 ? h * .33 : h * .18;
    });
  });
}

function doubleSidedSign(width, height, tex) {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  const front = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
  back.rotation.y = Math.PI;
  back.position.z = -0.02;
  g.add(front, back);
  return g;
}

function facadeTexture(style, seed) {
  const S = 512, N = 6, cell = S / N;
  const rng = mulberry32(seed);
  const c = document.createElement('canvas'); c.width = c.height = S;
  const e = document.createElement('canvas'); e.width = e.height = S;
  const ctx = c.getContext('2d'), ectx = e.getContext('2d');
  const wall = { glass: '#2f3d4a', concrete: '#77736b', brick: '#6d4a3e', modern: '#b7b0a3' }[style];
  const frame = { glass: '#8fa4b5', concrete: '#5a564f', brick: '#4b322a', modern: '#d8d1c4' }[style];
  ctx.fillStyle = wall; ctx.fillRect(0, 0, S, S);
  ectx.fillStyle = '#000'; ectx.fillRect(0, 0, S, S);
  // panel lines
  if (style === 'modern' || style === 'concrete') {
    ctx.strokeStyle = 'rgba(0,0,0,.16)'; ctx.lineWidth = 3;
    for (let i = 0; i <= N; i++) { ctx.beginPath(); ctx.moveTo(0, i * cell); ctx.lineTo(S, i * cell); ctx.stroke(); }
  }
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const x = i * cell, y = j * cell;
      const pad = style === 'glass' ? 3 : (style === 'brick' ? 17 : 11);
      const wx = x + pad, wy = y + pad, ww = cell - pad * 2, wh = cell - pad * 2;
      // frame
      ctx.fillStyle = frame; ctx.fillRect(wx - 2, wy - 2, ww + 4, wh + 4);
      const lit = rng() < (style === 'glass' ? 0.42 : 0.3);
      if (lit) {
        const hue = rng() < 0.2 ? 'rgba(170,220,255,.95)' : (rng() < .5 ? 'rgba(255,216,150,.98)' : 'rgba(255,186,105,.95)');
        ctx.fillStyle = hue; ctx.fillRect(wx, wy, ww, wh);
        ectx.fillStyle = hue; ectx.fillRect(wx, wy, ww, wh);
        ctx.fillStyle = 'rgba(0,0,0,.28)';
        ctx.fillRect(wx, wy, ww, wh * .35);
      } else {
        const g = ctx.createLinearGradient(wx, wy, wx + ww, wy + wh);
        g.addColorStop(0, '#1c2b38'); g.addColorStop(0.5, '#314759'); g.addColorStop(1, '#15212c');
        ctx.fillStyle = g; ctx.fillRect(wx, wy, ww, wh);
        ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fillRect(wx + ww * .1, wy + wh * .1, ww * .22, wh * .65);
      }
      // balcony
      if (style === 'modern' && j % 2 === 0) {
        ctx.fillStyle = 'rgba(235,230,220,.55)'; ctx.fillRect(x + 2, y + cell - 8, cell - 4, 5);
      }
      if (style === 'brick') {
        ctx.fillStyle = 'rgba(255,255,255,.06)';
        for (let b = 0; b < 4; b++) ctx.fillRect(x, y + b * cell / 4, cell, 1);
      }
    }
  }
  // grime gradient
  const g = ctx.createLinearGradient(0, 0, 0, S);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.22)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping; map.anisotropy = 4;
  const em = new THREE.CanvasTexture(e); em.colorSpace = THREE.SRGBColorSpace;
  em.wrapS = em.wrapT = THREE.RepeatWrapping; em.anisotropy = 4;
  return { map, em };
}

function buildingGeo(uRep, vRep) {
  const g = new THREE.BoxGeometry(1, 1, 1);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * uRep, uv.getY(i) * vRep);
  return g;
}

function cityMaterials(world) {
  const styles = [
    { name: 'glass', metal: 0.55, rough: 0.28 },
    { name: 'concrete', metal: 0.12, rough: 0.72 },
    { name: 'brick', metal: 0.05, rough: 0.9 },
    { name: 'modern', metal: 0.2, rough: 0.55 },
  ];
  return styles.map((st, i) => {
    const tex = facadeTexture(st.name, 1442 + i * 17);
    const mat = new THREE.MeshStandardMaterial({
      map: tex.map, emissiveMap: tex.em, emissive: 0xffd6a0, emissiveIntensity: 0.4,
      roughness: st.rough, metalness: st.metal, vertexColors: false,
    });
    world.engine.addLampMaterial(mat);
    return { style: st.name, mat };
  });
}

// ------------------------------------------------------------------ CITY
export function buildCity(world, rng) {
  const scene = world.scene;
  const c = { x: -1780, z: -880 };
  const x0 = c.x - 850, x1 = c.x + 850, z0 = c.z - 720, z1 = c.z + 720;
  const cols = 7, rows = 6;
  const xs = [], zs = [];
  for (let i = 0; i <= cols; i++) xs.push(x0 + (x1 - x0) * i / cols);
  for (let j = 0; j <= rows; j++) zs.push(z0 + (z1 - z0) * j / rows);

  const mats = cityMaterials(world);
  const classes = [
    { id: 'low', minH: 12, maxH: 34, u: 2, v: 1.6 },
    { id: 'mid', minH: 40, maxH: 96, u: 2, v: 4 },
    { id: 'high', minH: 105, maxH: 255, u: 2.4, v: 9 },
  ];
  const geos = classes.map(cl => buildingGeo(cl.u, cl.v));
  const buckets = [];
  for (const m of mats) for (const cl of classes) buckets.push({ style: m.style, mat: m.mat, cl, items: [] });
  const roofs = [];
  const antennas = [];
  const acs = [];
  const baseY = world.terrainHeight(c.x, c.z);
  const parkBlock = { i: 3, j: 3 };

  const addBuilding = (x, z, w, d, h, palette = 0) => {
    const base = world.terrainHeight(x, z) + 0.05;
    const distC = dist2(x, z, c.x, c.z);
    let cl = h > 100 ? classes[2] : h > 38 ? classes[1] : classes[0];
    const idx = mats.findIndex(m => m.style === ['glass', 'modern', 'concrete', 'brick'][palette % 4]);
    const b = buckets[idx * classes.length + classes.indexOf(cl)];
    const color = new THREE.Color().setHSL(0.55 + (rng() - .5) * .12, 0.06 + rng() * .08, 0.82 + rng() * .16);
    b.items.push({ x, y: base + h / 2, z, sx: w, sy: h, sz: d, ry: 0, color });
    // setback crown for towers
    if (h > 100) {
      const h2 = h * (0.22 + rng() * 0.16);
      const w2 = w * (0.58 + rng() * .15), d2 = d * (0.58 + rng() * .15);
      const cl2 = h2 > 38 ? classes[1] : classes[0];
      const b2 = buckets[idx * classes.length + classes.indexOf(cl2)];
      b2.items.push({ x, y: base + h + h2 / 2, z, sx: w2, sy: h2, sz: d2, ry: 0, color });
      roofs.push({ x, y: base + h + h2 + 0.4, z, sx: w2 * 1.04, sy: 0.8, sz: d2 * 1.04, ry: 0 });
      antennas.push({ x: x + (rng() - .5) * w2 * .2, y: base + h + h2 + 8, z, sx: 0.35, sy: 16, sz: 0.35 });
      roofs.push({ x, y: base + h + 0.4, z, sx: w * 1.02, sy: 0.7, sz: d * 1.02 });
    } else {
      roofs.push({ x, y: base + h + 0.35, z, sx: w * 1.02, sy: 0.7, sz: d * 1.02 });
    }
    for (let k = 0; k < 2; k++) {
      if (rng() < .5) acs.push({ x: x + (rng() - .5) * w * .6, y: base + h + 1.2, z: z + (rng() - .5) * d * .6, sx: 1.4 + rng() * 2, sy: 1.2, sz: 1.4 + rng() * 2, ry: rng() * 3 });
    }
    world.addCollision(x, z, w / 2 + 0.4, d / 2 + 0.4, 'building', h);
  };

  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      if (i === parkBlock.i && j === parkBlock.j) continue;
      const bx0 = xs[i] + 24, bx1 = xs[i + 1] - 24, bz0 = zs[j] + 24, bz1 = zs[j + 1] - 24;
      if (bx1 - bx0 < 30 || bz1 - bz0 < 30) continue;
      const cx = (bx0 + bx1) / 2, cz = (bz0 + bz1) / 2;
      const dc = dist2(cx, cz, c.x, c.z);
      const count = dc < 420 ? 1 : (rng() < .6 ? 2 : 1);
      for (let k = 0; k < count; k++) {
        let w, d;
        if (count === 1) { w = (bx1 - bx0) * (0.55 + rng() * .25); d = (bz1 - bz0) * (0.55 + rng() * .25); }
        else { w = (bx1 - bx0) * (0.34 + rng() * .12); d = (bz1 - bz0) * (0.34 + rng() * .12); }
        const x = cx + (rng() - .5) * (count === 1 ? 18 : (bx1 - bx0) * .35);
        const z = cz + (rng() - .5) * (count === 1 ? 18 : (bz1 - bz0) * .35);
        let h;
        if (dc < 260) h = 105 + rng() * 160;
        else if (dc < 520) h = 45 + rng() * 105;
        else h = 15 + rng() * 48;
        if (rng() < 0.08 && dc < 400) h *= 1.5;
        addBuilding(x, z, w, d, h, i + j + k);
      }
    }
  }

  // A few signature towers on the skyline.
  addBuilding(c.x - 110, c.z + 30, 48, 44, 265, 0);
  addBuilding(c.x + 240, c.z - 170, 40, 42, 210, 1);
  addBuilding(c.x - 470, c.z - 330, 44, 44, 178, 3);
  addBuilding(c.x + 50, c.z - 380, 34, 34, 152, 0);

  for (const b of buckets) {
    if (!b.items.length) continue;
    const geo = geos[classes.indexOf(b.cl)];
    const mesh = instanced(geo, b.mat, b.items, { castShadow: true, receiveShadow: false, name: 'buildings-' + b.style });
    if (mesh) scene.add(mesh);
  }
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x3a3e42, roughness: 0.85, metalness: 0.1 });
  const roofMesh = instanced(new THREE.BoxGeometry(1, 1, 1), roofMat, roofs, { castShadow: false });
  if (roofMesh) scene.add(roofMesh);
  const acMat = new THREE.MeshStandardMaterial({ color: 0x7f8589, roughness: 0.7, metalness: 0.35 });
  const acMesh = instanced(new THREE.BoxGeometry(1, 1, 1), acMat, acs);
  if (acMesh) scene.add(acMesh);
  const antMat = new THREE.MeshStandardMaterial({ color: 0x90969c, roughness: 0.5, metalness: 0.8 });
  const antMesh = instanced(new THREE.CylinderGeometry(0.3, 0.6, 1, 5), antMat, antennas);
  if (antMesh) scene.add(antMesh);

  // street corners: benches, planters, bus stops - lightweight detail
  const planters = [];
  for (let i = 1; i < cols; i++) for (let j = 1; j < rows; j += 2) {
    if (rng() < .5) continue;
    const x = xs[i] + 14, z = zs[j] + 14;
    planters.push({ x, y: world.terrainHeight(x, z) + 0.55, z, sx: 2.2, sy: 1.1, sz: 2.2, ry: rng() * 3 });
  }
  const planterMat = new THREE.MeshStandardMaterial({ color: 0x4c4f4a, roughness: 0.9 });
  const planterMesh = instanced(new THREE.BoxGeometry(1, 1, 1), planterMat, planters);
  if (planterMesh) scene.add(planterMesh);

  // Park between the towers.
  const px = (xs[parkBlock.i] + xs[parkBlock.i + 1]) / 2;
  const pz = (zs[parkBlock.j] + zs[parkBlock.j + 1]) / 2;
  const py = world.terrainHeight(px, pz);
  const park = new THREE.Mesh(new THREE.CircleGeometry(85, 32), new THREE.MeshStandardMaterial({ color: 0x4b6a3d, roughness: 1 }));
  park.rotation.x = -Math.PI / 2; park.position.set(px, py + 0.12, pz); park.receiveShadow = true;
  scene.add(park);
  const pond = new THREE.Mesh(new THREE.CircleGeometry(26, 32), new THREE.MeshStandardMaterial({ color: 0x1e5361, roughness: 0.2, metalness: 0.2 }));
  pond.rotation.x = -Math.PI / 2; pond.position.set(px + 6, py + 0.18, pz - 10); scene.add(pond);
  world.park = { x: px, z: pz, r: 85 };
  world.addAnimated((dt) => { pond.material.color.offsetHSL(Math.sin(performance.now() * .0003) * .0001, 0, 0); });

  // Neon advertising boards around downtown.
  const ads = [
    { text: ['APEX', 'HORIZON', 'OWN THE ROAD'], bg: '#120b07', ac: '#ff5a12', x: c.x - 430, z: c.z + 460, ry: 0.3 },
    { text: ['VOLT', 'ELECTRIC', 'SILENT. SAVAGE.'], bg: '#04161b', ac: '#35e6ff', x: c.x + 520, z: c.z + 220, ry: -0.9 },
    { text: ['MERIDIAN', 'CITY', 'NEVER SLEEPS'], bg: '#0b0d14', ac: '#b38cff', x: c.x + 120, z: c.z + 600, ry: 3.1 },
  ];
  for (const ad of ads) {
    const g = new THREE.Group();
    const tex = signTexture(ad.text, ad.bg, ad.ac, 512, 300);
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(18, 10.5), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, toneMapped: false }));
    panel.position.y = 14;
    g.add(panel);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(18.8, 11.2, 0.5), new THREE.MeshStandardMaterial({ color: 0x1a1d21, metalness: .8, roughness: .35 }));
    frame.position.set(0, 14, -0.3); g.add(frame);
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 9, 6), new THREE.MeshStandardMaterial({ color: 0x3b4045, metalness: .7, roughness: .4 }));
      post.position.set(s * 6.5, 4.5, 0); g.add(post);
    }
    g.position.set(ad.x, world.terrainHeight(ad.x, ad.z), ad.z);
    g.rotation.y = ad.ry;
    scene.add(g);
  }
}

// ------------------------------------------------------------------ HOUSES
function houseTexture(seed) {
  return canvasTexture(256, 256, (ctx) => {
    const rng = mulberry32(seed);
    ctx.fillStyle = '#d8d3c7'; ctx.fillRect(0, 0, 256, 256);
    // siding
    ctx.strokeStyle = 'rgba(0,0,0,.08)'; ctx.lineWidth = 2;
    for (let y = 8; y < 256; y += 14) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(256, y); ctx.stroke(); }
    // door
    ctx.fillStyle = '#4a352a'; ctx.fillRect(108, 150, 40, 74);
    ctx.fillStyle = '#c9a24a'; ctx.fillRect(144, 188, 4, 6);
    // windows
    for (const [x, y, w, h] of [[34, 54, 38, 34], [182, 54, 38, 34], [34, 142, 38, 30], [182, 142, 38, 30]]) {
      ctx.fillStyle = '#e9e3d5'; ctx.fillRect(x - 3, y - 3, w + 6, h + 6);
      ctx.fillStyle = rng() < .45 ? '#ffd9a2' : '#2a3b46'; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.fillRect(x, y, w / 2, h);
      ctx.fillStyle = '#e9e3d5'; ctx.fillRect(x + w / 2 - 1, y, 2, h); ctx.fillRect(x, y + h / 2 - 1, w, 2);
    }
    // roof shadow
    const g = ctx.createLinearGradient(0, 0, 0, 40);
    g.addColorStop(0, 'rgba(0,0,0,.25)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 40);
  });
}

export function buildSuburbs(world, rng) {
  const scene = world.scene;
  const bodyGeo = new THREE.BoxGeometry(1, 1, 1);
  const roofGeo = new THREE.ConeGeometry(0.73, 1, 4);
  roofGeo.rotateY(Math.PI / 4);
  const bodyTex = houseTexture(92);
  const bodyMat = new THREE.MeshStandardMaterial({ map: bodyTex, roughness: 0.78, metalness: 0.02, emissive: 0xffb870, emissiveMap: bodyTex, emissiveIntensity: 0.2 });
  world.engine.addLampMaterial(bodyMat);
  const roofMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0.02 });
  const bodies = [], roofs = [], chimneys = [], fences = [], hedges = [];

  const addHouse = (x, z, ry, scale = 1, color = 0xd9d5ca, roofColor = 0x6b3b34) => {
    const y = world.terrainHeight(x, z);
    const w = (9 + rng() * 5) * scale, d = (8 + rng() * 4) * scale, h = (4.2 + rng() * 2.2) * scale;
    bodies.push({ x, y: y + h / 2, z, sx: w, sy: h, sz: d, ry, color: new THREE.Color(color) });
    roofs.push({ x, y: y + h + (2.2 * scale) / 2, z, sx: (w + 2.4) * .75, sy: 2.2 * scale, sz: (d + 2.4) * .75, ry: ry + Math.PI / 4, color: new THREE.Color(roofColor) });
    if (rng() < .7) chimneys.push({ x: x + (rng() - .5) * w * .6, y: y + h + 2.4 * scale, z: z + (rng() - .5) * d * .5, sx: .8, sy: 2.4, sz: .8, ry });
    world.addCollision(x, z, w / 2, d / 2, 'house', h);
    if (rng() < .65) {
      const side = rng() < .5 ? -1 : 1;
      hedges.push({ x: x + side * (w / 2 + 2), y: y + .6, z, sx: 1.2, sy: 1.2, sz: d * .8, ry, color: new THREE.Color(0x35502b) });
    }
    if (rng() < .25) fences.push({ x, y: y + .55, z: z + d / 2 + 2, sx: w, sy: 1.1, sz: .15, ry });
  };

  const palettes = [0xe8e2d6, 0xd8cfc0, 0xc8b7a4, 0xb9c4c6, 0xd6c9b8, 0xbca98f, 0xe2ddd2];
  const roofCols = [0x703f33, 0x4c4e52, 0x5b4638, 0x3f4b50, 0x694a3b];
  // Maple Heights loop and city outskirts
  let placed = 0, attempts = 0;
  while (placed < 150 && attempts < 3000) {
    attempts++;
    const ang = rng() * Math.PI * 2;
    const rad = 330 + rng() * 520;
    const x = -2480 + Math.cos(ang) * rad;
    const z = -1870 + Math.sin(ang) * rad * .85;
    if (dist2(x, z, CITY_CENTERX, CITY_CENTERZ) < 1150) continue;
    if (!world.isFree(x, z, 8, 17)) continue;
    const ry = rng() * Math.PI * 2;
    addHouse(x, z, ry, .9 + rng() * .45, palettes[placed % palettes.length], roofCols[placed % roofCols.length]);
    placed++;
  }
  // outer city ring suburb
  placed = 0; attempts = 0;
  while (placed < 70 && attempts < 2000) {
    attempts++;
    const ang = rng() * Math.PI * 2;
    const rad = 1250 + rng() * 380;
    const x = -1780 + Math.cos(ang) * rad;
    const z = -880 + Math.sin(ang) * rad;
    if (!world.isFree(x, z, 8, 16)) continue;
    addHouse(x, z, rng() * Math.PI * 2, .9 + rng() * .35, palettes[placed % palettes.length], roofCols[placed % roofCols.length]);
    placed++;
  }

  // villages: alpine, forest, desert, coast
  const villages = [
    { x: -190, z: -2870, n: 26, palette: [0x8e6c4f, 0x9c7856, 0x74543e], roof: [0x4a3226, 0x5a3a2c], snow: true },
    { x: -2380, z: 1830, n: 22, palette: [0x8d8a7c, 0xa59c88, 0x766f60], roof: [0x3d453d, 0x4d3a30] },
    { x: 2240, z: 2280, n: 24, palette: [0xd6bf99, 0xc7ab84, 0xe2cbab], roof: [0x8c6a4e, 0x705542] },
    { x: 2600, z: 1870, n: 26, palette: [0xe4d6bd, 0xcbb99c, 0xd9c1a8], roof: [0x9a5c44, 0x6b4a3a] },
  ];
  for (const v of villages) {
    let n = 0, att = 0;
    while (n < v.n && att < 800) {
      att++;
      const ang = rng() * Math.PI * 2, rad = 40 + rng() * 180;
      const x = v.x + Math.cos(ang) * rad, z = v.z + Math.sin(ang) * rad;
      if (!world.isFree(x, z, 7, 12)) continue;
      addHouse(x, z, Math.round(rng() * 4) * Math.PI / 2 + (rng() - .5) * .3, .85 + rng() * .3, v.palette[n % v.palette.length], v.roof[n % v.roof.length]);
      n++;
    }
    // chapel / hall
    if (v.snow) {
      const x = v.x + 60, z = v.z + 30;
      const y = world.terrainHeight(x, z);
      const hall = new THREE.Group();
      const wall = new THREE.Mesh(new THREE.BoxGeometry(20, 9, 12), new THREE.MeshStandardMaterial({ color: 0x8a6d52, roughness: .9 }));
      wall.position.y = 4.5; hall.add(wall);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(13, 7, 4), new THREE.MeshStandardMaterial({ color: 0xe8edf1, roughness: .85 }));
      roof.rotation.y = Math.PI / 4; roof.position.y = 12; hall.add(roof);
      const tower = new THREE.Mesh(new THREE.BoxGeometry(4, 16, 4), new THREE.MeshStandardMaterial({ color: 0x9d7b5b, roughness: .9 }));
      tower.position.set(8, 8, 0); hall.add(tower);
      hall.position.set(x, y, z); scene.add(hall);
      world.addCollision(x, z, 12, 8, 'lodge', 20);
    }
  }

  const bodyMesh = instanced(bodyGeo, bodyMat, bodies, { castShadow: true, receiveShadow: true });
  if (bodyMesh) scene.add(bodyMesh);
  const roofMesh = instanced(roofGeo, roofMat, roofs, { castShadow: true });
  if (roofMesh) scene.add(roofMesh);
  const chimneyMat = new THREE.MeshStandardMaterial({ color: 0x6d5b4c, roughness: .95 });
  const chimneyMesh = instanced(new THREE.BoxGeometry(1, 1, 1), chimneyMat, chimneys, { castShadow: true });
  if (chimneyMesh) scene.add(chimneyMesh);
  const hedgeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
  const hedgeMesh = instanced(new THREE.BoxGeometry(1, 1, 1), hedgeMat, hedges, { castShadow: false });
  if (hedgeMesh) scene.add(hedgeMesh);
  const fenceMat = new THREE.MeshStandardMaterial({ color: 0x9f9784, roughness: .9 });
  const fenceMesh = instanced(new THREE.BoxGeometry(1, 1, 1), fenceMat, fences);
  if (fenceMesh) scene.add(fenceMesh);
}

const CITY_CENTERX = -1780;
const CITY_CENTERZ = -880;

// ------------------------------------------------------------------ VEGETATION
function broadleafGeo() {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.12, 0.22, 1, 5); trunk.translate(0, 0.5, 0);
  const blobs = [];
  for (const [x, y, z, r] of [[0, 1.25, 0, .58], [-.34, 1.05, .12, .42], [.32, 1.08, -.15, .45], [.05, 1.55, .05, .4]]) {
    const g = new THREE.IcosahedronGeometry(r, 1); g.translate(x, y, z); blobs.push(g);
  }
  return { trunk, canopy: mergeGeometries(blobs, false) };
}

function pineGeo() {
  const trunk = new THREE.CylinderGeometry(0.1, 0.2, 1, 5); trunk.translate(0, 0.5, 0);
  const cones = [];
  for (const [y, r, h] of [[.55, .55, .55], [.95, .42, .5], [1.3, .28, .4]]) {
    const g = new THREE.ConeGeometry(r, h, 7); g.translate(0, y + h / 2, 0); cones.push(g);
  }
  return { trunk, canopy: mergeGeometries(cones, false) };
}

function palmGeo() {
  const trunk = new THREE.CylinderGeometry(0.1, 0.18, 1, 6); trunk.translate(0, 0.5, 0);
  const fronds = [];
  for (let i = 0; i < 8; i++) {
    const g = new THREE.BoxGeometry(0.11, 0.02, 1.05);
    g.translate(0, 0, 0.52);
    g.rotateX(-0.55 - Math.random() * .16);
    g.rotateY((i / 8) * Math.PI * 2);
    fronds.push(g);
  }
  const canopy = mergeGeometries(fronds, false);
  canopy.translate(0, 1.0, 0);
  return { trunk, canopy };
}

function cactusGeo() {
  const parts = [];
  const main = new THREE.CylinderGeometry(0.16, 0.2, 1, 7); main.translate(0, .5, 0); parts.push(main);
  const arm = new THREE.CylinderGeometry(0.1, 0.11, .4, 6); arm.translate(.24, .58, 0); arm.rotateZ(.4); parts.push(arm);
  const arm2 = new THREE.CylinderGeometry(0.09, 0.1, .3, 6); arm2.translate(-.23, .45, .05); arm2.rotateZ(-.35); parts.push(arm2);
  return mergeGeometries(parts, false);
}

export function buildVegetation(world, rng) {
  const scene = world.scene;
  const broad = broadleafGeo(), pine = pineGeo(), palm = palmGeo(), cactus = cactusGeo();
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5b4632, roughness: .96 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .88, metalness: 0 });
  const palmLeafMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .82, side: THREE.DoubleSide });
  const cactusMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .9 });
  const rockMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .96 });
  const bushMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .95 });

  const broadItems = [], pineItems = [], palmItems = [], cactusItems = [], rockItems = [], bushItems = [], shadowItems = [];
  const pinesSnow = [];
  const leafColors = [0x3c5b2d, 0x466a34, 0x355028, 0x4f7139, 0x5c7c3c, 0x2f4a26];
  const snowLeaf = [0xdce8e2, 0xc7d8cf, 0xeef3ef];

  const tryPlace = (x, z, minRoad = 9) => world.isFree(x, z, 2.5, minRoad) && Math.abs(x) < 4260 && Math.abs(z) < 4260;

  // Broadleaf woodland
  let n = 0, attempts = 0;
  while (n < 2600 && attempts < 22000) {
    attempts++;
    let x, z;
    if (rng() < .45) { x = -4100 + rng() * 2400; z = 250 + rng() * 3600; }
    else if (rng() < .5) { x = -2200 + rng() * 4200; z = -2200 + rng() * 2600; }
    else { x = -4200 + rng() * 4400; z = -2600 + rng() * 2400; }
    if (dist2(x, z, -1780, -880) < 1100) continue;
    if (!tryPlace(x, z, 10)) continue;
    const y = world.terrainHeight(x, z);
    if (y > 120) continue;
    const h = 5 + rng() * 9;
    const rot = rng() * Math.PI * 2;
    const scale = h;
    const col = new THREE.Color(leafColors[Math.floor(rng() * leafColors.length)]);
    broadItems.push({ x: x, y, z, sx: scale * .95, sy: scale, sz: scale * .95, ry: rot, color: col });
    shadowItems.push({ x, y: y + .06, z, sx: h * .55, sy: 1, sz: h * .55, ry: 0 });
    n++;
  }
  // pines in snow & high ground
  n = 0; attempts = 0;
  while (n < 1750 && attempts < 16000) {
    attempts++;
    const x = -2000 + rng() * 3600;
    const z = -4100 + rng() * 2100;
    if (!tryPlace(x, z, 9)) continue;
    const y = world.terrainHeight(x, z);
    if (z > -1350 && y < 65) continue;
    const h = 6 + rng() * 11;
    const snowy = y > 80 + rng() * 45;
    const col = new THREE.Color(snowy ? snowLeaf[Math.floor(rng() * 3)] : leafColors[Math.floor(rng() * 3)]).multiplyScalar(.85 + rng() * .2);
    pineItems.push({ x, y, z, sx: h * .62, sy: h, sz: h * .62, ry: rng() * 6.28, color: col });
    shadowItems.push({ x, y: y + .05, z, sx: h * .36, sy: 1, sz: h * .36, ry: 0 });
    n++;
  }
  // coast palms
  n = 0; attempts = 0;
  while (n < 230 && attempts < 6000) {
    attempts++;
    const x = 2560 + rng() * 620;
    const z = -3400 + rng() * 7000;
    if (!tryPlace(x, z, 10)) continue;
    const y = world.terrainHeight(x, z);
    if (y < 1 || y > 22) continue;
    const h = 7 + rng() * 6;
    palmItems.push({ x, y, z, sx: h * .35, sy: h, sz: h * .35, ry: rng() * 6.28, color: new THREE.Color(0x4f7438) });
    shadowItems.push({ x, y: y + .05, z, sx: h * .32, sy: 1, sz: h * .32 });
    n++;
  }
  // desert cacti
  n = 0; attempts = 0;
  while (n < 420 && attempts < 7000) {
    attempts++;
    const x = 700 + rng() * 2200;
    const z = 1400 + rng() * 2600;
    if (!tryPlace(x, z, 8)) continue;
    const y = world.terrainHeight(x, z);
    if (y > 110) continue;
    const h = 2.2 + rng() * 3.2;
    cactusItems.push({ x, y, z, sx: h * .5, sy: h, sz: h * .5, ry: rng() * 6.28, color: new THREE.Color(0x4e6a3c) });
    n++;
  }
  // bushes
  n = 0; attempts = 0;
  while (n < 1900 && attempts < 16000) {
    attempts++;
    const x = -4200 + rng() * 8400;
    const z = -4200 + rng() * 8400;
    if (dist2(x, z, -1780, -880) < 900) continue;
    if (!tryPlace(x, z, 7)) continue;
    const y = world.terrainHeight(x, z);
    if (y < 1.2 || y > 150) continue;
    const s = .9 + rng() * 2.2;
    bushItems.push({ x, y: y + s * .2, z, sx: s, sy: s * .7, sz: s, ry: rng() * 6.28, color: new THREE.Color(0x3c5a2e).multiplyScalar(.8 + rng() * .45) });
    n++;
  }
  // rocks in mountains/desert
  n = 0; attempts = 0;
  while (n < 520 && attempts < 8000) {
    attempts++;
    const x = -3600 + rng() * 7200;
    const z = -4000 + rng() * 7600;
    if (!tryPlace(x, z, 8)) continue;
    const y = world.terrainHeight(x, z);
    if (y > 260) continue;
    if (z > -1200 && x < 500 && rng() < .7) continue;
    const s = 1.5 + rng() * 7;
    rockItems.push({ x, y: y + s * .25, z, sx: s * (0.7 + rng() * .7), sy: s * (0.5 + rng() * .6), sz: s * (0.7 + rng() * .6), ry: rng() * 6.28, rx: (rng() - .5) * .3, color: new THREE.Color(0x726f66).multiplyScalar(.75 + rng() * .35) });
    n++;
  }
  // park trees
  if (world.park) {
    for (let i = 0; i < 34; i++) {
      const a = rng() * 6.28, r = rng() * (world.park.r - 12);
      const x = world.park.x + Math.cos(a) * r, z = world.park.z + Math.sin(a) * r;
      if (!world.isFree(x, z, 3, 9)) continue;
      const y = world.terrainHeight(x, z);
      const h = 6 + rng() * 5;
      broadItems.push({ x, y, z, sx: h * .9, sy: h, sz: h * .9, ry: rng() * 6.28, color: new THREE.Color(leafColors[i % leafColors.length]) });
      shadowItems.push({ x, y: y + .06, z, sx: h * .5, sy: 1, sz: h * .5 });
    }
  }

  const bm = instanced(broad.canopy, leafMat, broadItems, { castShadow: false, name: 'broadleaf' });
  const bt = instanced(broad.trunk, trunkMat, broadItems, { castShadow: false });
  if (bm) scene.add(bm); if (bt) scene.add(bt);
  const pm = instanced(pine.canopy, leafMat, pineItems, { castShadow: false, name: 'pines' });
  const pt = instanced(pine.trunk, trunkMat, pineItems, { castShadow: false });
  if (pm) scene.add(pm); if (pt) scene.add(pt);
  const plm = instanced(palm.canopy, palmLeafMat, palmItems, { castShadow: false });
  const plt = instanced(palm.trunk, trunkMat, palmItems, { castShadow: false });
  if (plm) scene.add(plm); if (plt) scene.add(plt);
  const cm = instanced(cactus, cactusMat, cactusItems, { castShadow: false });
  if (cm) scene.add(cm);
  const rm = instanced(new THREE.DodecahedronGeometry(1, 0), rockMat, rockItems, { castShadow: false });
  if (rm) scene.add(rm);
  const bsh = instanced(new THREE.IcosahedronGeometry(1, 0), bushMat, bushItems, { castShadow: false });
  if (bsh) scene.add(bsh);

  const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: .16, depthWrite: false });
  const shadowGeo = new THREE.CircleGeometry(1, 8); shadowGeo.rotateX(-Math.PI / 2);
  const sm = instanced(shadowGeo, shadowMat, shadowItems, { receiveShadow: false });
  if (sm) { sm.renderOrder = 1; scene.add(sm); }

  // Wildflowers as tiny instanced crosses? Keep cheap - skip.
}

// ------------------------------------------------------------------ INDUSTRY
function corrugatedTexture() {
  return canvasTexture(256, 256, (ctx) => {
    ctx.fillStyle = '#8a9296'; ctx.fillRect(0, 0, 256, 256);
    for (let x = 0; x < 256; x += 8) {
      ctx.fillStyle = x % 16 === 0 ? 'rgba(0,0,0,.14)' : 'rgba(255,255,255,.07)';
      ctx.fillRect(x, 0, 3, 256);
    }
    ctx.fillStyle = 'rgba(90,55,35,.18)';
    for (let i = 0; i < 12; i++) ctx.fillRect(Math.random() * 256, Math.random() * 256, 20 + Math.random() * 60, 1 + Math.random() * 4);
  });
}

export function buildIndustry(world, rng) {
  const scene = world.scene;
  const wallMat = new THREE.MeshStandardMaterial({ map: corrugatedTexture(), roughness: .65, metalness: .35 });
  const warehouseGeo = new THREE.BoxGeometry(1, 1, 1);
  const warehouses = [];
  const spots = [
    [1800, 1000, 55, 32, 12], [1920, 860, 42, 26, 10], [2100, 1360, 62, 34, 13], [1740, 1280, 38, 24, 9],
    [1550, 760, 44, 30, 11], [1400, 980, 36, 25, 9], [2320, 1020, 50, 30, 12], [1680, 1120, 34, 22, 8],
  ];
  for (const [x, z, w, d, h] of spots) {
    const y = world.terrainHeight(x, z);
    warehouses.push({ x, y: y + h / 2, z, sx: w, sy: h, sz: d, ry: 0 });
    world.addCollision(x, z, w / 2, d / 2, 'warehouse', h);
    // roof vents
  }
  const wm = instanced(warehouseGeo, wallMat, warehouses, { castShadow: true });
  if (wm) scene.add(wm);

  // chimneys & tanks
  const chimMat = new THREE.MeshStandardMaterial({ color: 0xb8b2a8, roughness: .8 });
  const tankMat = new THREE.MeshStandardMaterial({ color: 0xd3d0c8, roughness: .45, metalness: .5 });
  for (const [x, z, h, r] of [[1500, 1120, 42, 3.2], [1440, 1040, 34, 2.6], [1590, 1240, 48, 3.6]]) {
    const y = world.terrainHeight(x, z);
    const ch = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.3, h, 12), chimMat);
    ch.position.set(x, y + h / 2, z); ch.castShadow = true; scene.add(ch);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.15, r * 1.15, 1.2, 12), new THREE.MeshStandardMaterial({ color: 0xc24a32, roughness: .7 }));
    rim.position.set(x, y + h - 1, z); scene.add(rim);
  }
  for (const [x, z, r, h] of [[1260, 900, 10, 12], [1330, 820, 8, 10], [1200, 720, 7, 9]]) {
    const y = world.terrainHeight(x, z);
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 16), tankMat);
    tank.position.set(x, y + h / 2, z); tank.castShadow = true; tank.receiveShadow = true; scene.add(tank);
    const top = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2), tankMat);
    top.position.set(x, y + h, z); scene.add(top);
    world.addCollision(x, z, r, r, 'tank', h);
  }

  // shipping containers (instanced, colourful)
  const containerItems = [];
  const colors = [0xb5432f, 0x2f6a8a, 0x3f7a4a, 0xb58b32, 0x7a4a6a, 0xa85a2e];
  for (let i = 0; i < 54; i++) {
    const x = 2160 + rng() * 420, z = 940 + rng() * 360;
    if (!world.isFree(x, z, 3, 10)) continue;
    const y = world.terrainHeight(x, z);
    const stack = Math.floor(rng() * 3);
    for (let s = 0; s <= stack; s++) {
      containerItems.push({ x, y: y + 1.35 + s * 2.7, z, sx: 12, sy: 2.6, sz: 2.5, ry: rng() < .5 ? 0 : Math.PI / 2, color: new THREE.Color(colors[Math.floor(rng() * colors.length)]) });
    }
    world.addCollision(x, z, 6.5, 3, 'container', 3 + stack * 2.7);
  }
  const cm = instanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .7, metalness: .4 }), containerItems, { castShadow: true });
  if (cm) scene.add(cm);

  // port cranes
  const craneMat = new THREE.MeshStandardMaterial({ color: 0xd8a52c, roughness: .55, metalness: .5 });
  for (const [x, z] of [[2400, 1180], [2480, 1370], [2260, 1500]]) {
    const y = world.terrainHeight(x, z);
    const g = new THREE.Group();
    const legGeo = new THREE.BoxGeometry(1.4, 34, 1.4);
    for (const dx of [-7, 7]) for (const dz of [-5, 5]) {
      const leg = new THREE.Mesh(legGeo, craneMat); leg.position.set(dx, 17, dz); g.add(leg);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(38, 2.2, 4), craneMat); beam.position.set(4, 35, 0); g.add(beam);
    const beam2 = new THREE.Mesh(new THREE.BoxGeometry(30, 1.6, 3), craneMat); beam2.position.set(10, 28, 0); g.add(beam2);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 4), new THREE.MeshStandardMaterial({ color: 0x2c3338, roughness: .6 })); cabin.position.set(0, 29, 0); g.add(cabin);
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(.06, .06, 14, 4), new THREE.MeshStandardMaterial({ color: 0x1a1d20 })); cable.position.set(16, 22, 0); g.add(cable);
    g.position.set(x, y, z); scene.add(g);
    world.addCollision(x, z, 14, 12, 'crane', 40);
  }

  // cargo ship out in the bay
  const ship = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(28, 9, 84), new THREE.MeshStandardMaterial({ color: 0x1c2b36, roughness: .55, metalness: .4 }));
  hull.position.y = 4; ship.add(hull);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(26, 1, 78), new THREE.MeshStandardMaterial({ color: 0x6e5a4a, roughness: .8 })); deck.position.y = 8.8; ship.add(deck);
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(20, 15, 9), new THREE.MeshStandardMaterial({ color: 0xd8d8d2, roughness: .5 })); bridge.position.set(0, 17, -30); ship.add(bridge);
  for (let i = 0; i < 18; i++) {
    const box = new THREE.Mesh(new THREE.BoxGeometry(8, 4, 3), new THREE.MeshStandardMaterial({ color: colors[i % colors.length], roughness: .7 }));
    box.position.set(-8 + (i % 3) * 8, 12 + Math.floor(i / 9) * 4, -12 + Math.floor((i % 9) / 3) * 4); ship.add(box);
  }
  ship.position.set(3230, 0.3, 1000); ship.rotation.y = -0.4; scene.add(ship);
  world.addAnimated((dt, t) => { ship.rotation.z = Math.sin(t * .35) * .014; ship.position.y = .3 + Math.sin(t * .4) * .3; });
}

// ------------------------------------------------------------------ LANDMARKS
export function buildLandmarks(world, rng) {
  const scene = world.scene;
  buildIndustry(world, rng);

  // wind turbines in the golden fields
  const turbineSpots = [[-3390, 260], [-3120, 620], [-3560, 850], [-2960, 1070], [-3460, -180], [-2790, 430]];
  for (const [x, z] of turbineSpots) {
    const y = world.terrainHeight(x, z);
    const g = new THREE.Group();
    const towerMat = new THREE.MeshStandardMaterial({ color: 0xe4e2da, roughness: .6, metalness: .2 });
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 2.8, 62, 10), towerMat);
    tower.position.y = 31; g.add(tower);
    const nacelle = new THREE.Mesh(new THREE.BoxGeometry(4, 3.4, 7), towerMat);
    nacelle.position.set(0, 63, 1.5); g.add(nacelle);
    const rotor = new THREE.Group();
    rotor.position.set(0, 63, 5.2);
    for (let i = 0; i < 3; i++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(1.2, 28, .35), towerMat);
      blade.position.y = 0; blade.rotation.z = (i / 3) * Math.PI * 2;
      blade.geometry.translate(0, 13, 0);
      rotor.add(blade);
    }
    g.add(rotor);
    g.position.set(x, y, z); scene.add(g);
    world.addCollision(x, z, 3, 3, 'turbine', 60);
    world.addAnimated((dt) => { rotor.rotation.z += dt * 1.1; });
  }

  // radio tower on the snow line
  {
    const x = 250, z = -3170;
    const y = world.terrainHeight(x, z);
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0xa8afb5, roughness: .5, metalness: .7 });
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(.45, 1.1, 92, 6), mat); mast.position.y = 46; g.add(mast);
    for (let i = 1; i < 6; i++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(7 - i * .8, .25, .25), mat);
      bar.position.y = i * 15; g.add(bar);
    }
    const beaconMat = new THREE.MeshStandardMaterial({ color: 0xff2c2c, emissive: 0xff1111, emissiveIntensity: 3 });
    world.engine.addLampMaterial(beaconMat);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(.7, 8, 6), beaconMat); beacon.position.y = 92; g.add(beacon);
    g.position.set(x, y, z); scene.add(g);
    world.addAnimated((dt, t) => { beaconMat.emissiveIntensity = 1.5 + Math.abs(Math.sin(t * 2.4)) * 4; });
  }

  // coastal ferris wheel
  {
    const x = 2610, z = 1950;
    const y = world.terrainHeight(x, z);
    const g = new THREE.Group();
    const steel = new THREE.MeshStandardMaterial({ color: 0xd9d4c9, roughness: .5, metalness: .5 });
    const wheel = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(27, .55, 8, 48), steel); wheel.add(ring);
    const inner = new THREE.Mesh(new THREE.TorusGeometry(20, .22, 6, 48), steel); wheel.add(inner);
    for (let i = 0; i < 16; i++) {
      const spoke = new THREE.Mesh(new THREE.CylinderGeometry(.15, .15, 54, 4), steel);
      spoke.rotation.z = (i / 16) * Math.PI * 2; wheel.add(spoke);
    }
    const cabins = [];
    const cabinMat = new THREE.MeshStandardMaterial({ color: 0xff6a1e, roughness: .5, emissive: 0xff4a00, emissiveIntensity: 1.2 });
    world.engine.addLampMaterial(cabinMat);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const cab = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.8, 2.4), cabinMat);
      cab.position.set(Math.cos(a) * 27, Math.sin(a) * 27, 0);
      cab.userData.a = a; cabins.push(cab); wheel.add(cab);
    }
    wheel.position.y = 32; g.add(wheel);
    for (const s of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(.6, .9, 34, 6), steel);
      leg.position.set(0, 17, s * 6); leg.rotation.x = s * .3; g.add(leg);
    }
    g.position.set(x, y, z); scene.add(g);
    world.addCollision(x, z, 9, 9, 'ferris', 30);
    world.addAnimated((dt, t) => {
      wheel.rotation.z += dt * .16;
      for (const cab of cabins) {
        cab.rotation.z = -wheel.rotation.z;
      }
    });
  }

  // lighthouse
  {
    const x = 2800, z = -2250;
    const y = world.terrainHeight(x, z);
    const g = new THREE.Group();
    const white = new THREE.MeshStandardMaterial({ color: 0xe6e2d8, roughness: .7 });
    const red = new THREE.MeshStandardMaterial({ color: 0xb23a2c, roughness: .65 });
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 5.2, 22, 14), white); tower.position.y = 11; g.add(tower);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(3.9, 4.4, 4.5, 14), red); band.position.y = 8; g.add(band);
    const lantern = new THREE.Mesh(new THREE.CylinderGeometry(2.9, 3.2, 3.6, 10), new THREE.MeshStandardMaterial({ color: 0x22282d, roughness: .4, metalness: .6 })); lantern.position.y = 23.6; g.add(lantern);
    const lightMat = new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffdf8a, emissiveIntensity: 4 });
    world.engine.addLampMaterial(lightMat);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(1.7, 10, 8), lightMat); bulb.position.y = 23.6; g.add(bulb);
    const beam = new THREE.Mesh(new THREE.ConeGeometry(4.5, 70, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xffe3a0, transparent: true, opacity: .08, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    beam.rotation.z = Math.PI / 2; beam.position.set(34, 23.6, 0); g.add(beam);
    g.position.set(x, y, z); scene.add(g);
    world.addCollision(x, z, 5, 5, 'lighthouse', 30);
    world.addAnimated((dt) => { beam.parent.rotation.y += dt * .8; });
  }

  // coast pier
  {
    const x = 2860, z = 1760;
    const y = 4;
    const g = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x8a6a48, roughness: .88 });
    const deck = new THREE.Mesh(new THREE.BoxGeometry(10, .5, 96), wood);
    deck.position.set(0, y + 1.6, 48); g.add(deck);
    for (let i = 0; i < 14; i++) for (const s of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(.25, .3, 7, 5), wood);
      p.position.set(s * 4.3, y - 1, 4 + i * 7); g.add(p);
    }
    const rail = new THREE.Mesh(new THREE.BoxGeometry(10.4, .15, .15), new THREE.MeshStandardMaterial({ color: 0xcfc8b8 }));
    rail.position.set(0, y + 2.4, 93); g.add(rail);
    // umbrellas along shore
    const col = [0xff6a3d, 0x35c7d8, 0xffd05c, 0xf25f7a];
    for (let i = 0; i < 4; i++) {
      const cx = x - 20 - i * 16, cz = z - 20 + (i % 2) * 14;
      const cy = world.terrainHeight(cx, cz);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(.1, .1, 4.5, 5), new THREE.MeshStandardMaterial({ color: 0xeee8da }));
      pole.position.set(cx, cy + 2.2, cz); scene.add(pole);
      const canopy = new THREE.Mesh(new THREE.ConeGeometry(3.6, 1.4, 10), new THREE.MeshStandardMaterial({ color: col[i], roughness: .8, side: THREE.DoubleSide }));
      canopy.position.set(cx, cy + 4.4, cz); scene.add(canopy);
    }
    g.position.set(x, 0, z); scene.add(g);
  }

  // desert mesas
  for (const [x, z, r, h] of [[1520, 1950, 48, 55], [1880, 2620, 62, 72], [2420, 2140, 38, 42], [2730, 2600, 55, 62], [1180, 2500, 32, 36], [1700, 2850, 46, 50]]) {
    const y = world.terrainHeight(x, z);
    const geo = new THREE.CylinderGeometry(r * .72, r, h, 9, 3);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const yy = pos.getY(i);
      if (yy > -h / 2 + 1) {
        pos.setX(i, pos.getX(i) + Math.sin(i * 4.7 + x) * r * .07);
        pos.setZ(i, pos.getZ(i) + Math.cos(i * 2.3 + z) * r * .07);
      }
    }
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ color: 0x9c6748, roughness: .96, flatShading: true });
    const mesa = new THREE.Mesh(geo, mat);
    mesa.position.set(x, y + h / 2 - 2, z); mesa.castShadow = true; mesa.receiveShadow = true;
    scene.add(mesa);
    world.addCollision(x, z, r * .75, r * .75, 'mesa', h);
  }

  // forest logging camp
  {
    const x = -2520, z = 2150;
    const y = world.terrainHeight(x, z);
    const g = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x6b4f37, roughness: .95 });
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(18, 6, 11), wood); cabin.position.y = 3; g.add(cabin);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(13, 5, 4), new THREE.MeshStandardMaterial({ color: 0x3f3a31, roughness: .95 }));
    roof.rotation.y = Math.PI / 4; roof.position.y = 8.5; g.add(roof);
    g.position.set(x, y, z); scene.add(g);
    world.addCollision(x, z, 9, 6, 'cabin', 8);
  }

  // waterfall feeding the mountain lake
  {
    const x = 600, z = -1770;
    const y = world.terrainHeight(x, z);
    const cliffMat = new THREE.MeshStandardMaterial({ color: 0x67665e, roughness: .95, flatShading: true });
    const cliff = new THREE.Mesh(new THREE.DodecahedronGeometry(22, 0), cliffMat);
    cliff.scale.set(1.5, 1.8, .8); cliff.position.set(x, y + 6, z - 12); scene.add(cliff);
    const waterMat = new THREE.MeshBasicMaterial({ color: 0xcfe9ee, transparent: true, opacity: .72, side: THREE.DoubleSide });
    const fall = new THREE.Mesh(new THREE.PlaneGeometry(9, 32, 1, 8), waterMat);
    fall.position.set(x, y + 2, z - 2); scene.add(fall);
    const pool = new THREE.Mesh(new THREE.CircleGeometry(16, 24), new THREE.MeshStandardMaterial({ color: 0x2b6f65, roughness: .2, metalness: .2 }));
    pool.rotation.x = -Math.PI / 2; pool.position.set(x, 13.6, z + 6); scene.add(pool);
    world.addAnimated((dt, t) => { fall.material.opacity = .6 + Math.sin(t * 8) * .08; });
  }

  // roadside scenic viewpoints with benches
  for (const [x, z, r] of [[-1100, 900, 0.4], [2200, 1900, 1.2], [-3100, 1400, 2.4]]) {
    const y = world.terrainHeight(x, z);
    const bench = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x8b6a47, roughness: .9 });
    const seat = new THREE.Mesh(new THREE.BoxGeometry(3.4, .25, 1.2), wood); seat.position.y = .55; bench.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.2, .2), wood); back.position.set(0, 1.1, -.5); bench.add(back);
    for (const s of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(.2, .6, 1), new THREE.MeshStandardMaterial({ color: 0x4b5055, metalness: .6, roughness: .4 }));
      leg.position.set(s * 1.3, .3, 0); bench.add(leg);
    }
    bench.position.set(x, y, z); bench.rotation.y = r; scene.add(bench);
  }
}

// ------------------------------------------------------------------ CIRCUIT
export function buildRaceTrack(world, rng) {
  const scene = world.scene;
  const road = world.roads.byName.get('Meridian Circuit');
  if (!road) return;
  const pts = road.points;
  const curbItems = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], p2 = pts[(i + 1) % pts.length];
    const dx = p2.x - p.x, dz = p2.z - p.z;
    const l = Math.hypot(dx, dz) || 1;
    const ang = Math.atan2(dx, dz);
    const nx = Math.cos(ang), nz = -Math.sin(ang);
    for (const side of [-1, 1]) {
      for (let s = 0; s < 2; s++) {
        const t = s * .5;
        const x = p.x + (p2.x - p.x) * t + nx * side * (road.width / 2 + 1.4);
        const z = p.z + (p2.z - p.z) * t + nz * side * (road.width / 2 + 1.4);
        curbItems.push({ x, y: p.y + .14, z, sx: 1.2, sy: .22, sz: l * .5, ry: ang, color: new THREE.Color((i + s) % 2 ? 0xd8422e : 0xece8de) });
      }
    }
  }
  const curbMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .75, vertexColors: false });
  const curbs = instanced(new THREE.BoxGeometry(1, 1, 1), curbMat, curbItems, { receiveShadow: true });
  if (curbs) scene.add(curbs);

  // tire barrier stacks at the outside of corners
  const tires = [];
  for (let i = 4; i < pts.length - 4; i += 5) {
    const p = pts[i];
    const x = p.x + (rng() - .5) * 24, z = p.z + (rng() - .5) * 24;
    if (world.roads.distanceToRoad(x, z, 20) < 12) continue;
    for (let s = 0; s < 3; s++) tires.push({ x, y: p.y + .35 + s * .55, z, sx: 1, sy: 1, sz: 1, ry: rng() * 3 });
  }
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x16181a, roughness: .95 });
  const tireMesh = instanced(new THREE.CylinderGeometry(.8, .8, .5, 10), tireMat, tires, { castShadow: false });
  if (tireMesh) scene.add(tireMesh);

  const y0 = world.terrainHeight(-260, 2860);
  // grandstand
  {
    const g = new THREE.Group();
    const concrete = new THREE.MeshStandardMaterial({ color: 0xb8b4aa, roughness: .85 });
    for (let i = 0; i < 6; i++) {
      const tier = new THREE.Mesh(new THREE.BoxGeometry(60, 1.4, 2.5), concrete);
      tier.position.set(0, 1.2 + i * 1.4, i * 2.4); g.add(tier);
    }
    const roof = new THREE.Mesh(new THREE.BoxGeometry(64, .5, 18), new THREE.MeshStandardMaterial({ color: 0xd8d4c8, roughness: .6, metalness: .2 }));
    roof.position.set(0, 13.5, 7); roof.rotation.x = .06; g.add(roof);
    for (const s of [-1, 1]) {
      const col = new THREE.Mesh(new THREE.BoxGeometry(1, 12, 1), concrete); col.position.set(s * 29, 6, 14); g.add(col);
    }
    // crowd
    const crowdItems = [];
    for (let i = 0; i < 160; i++) {
      crowdItems.push({ x: -28 + Math.random() * 56, y: 1.8 + Math.floor(Math.random() * 5) * 1.4, z: 1 + Math.random() * 10, sx: .45, sy: 1.3, sz: .45, ry: 0, color: new THREE.Color().setHSL(Math.random(), .5, .5) });
    }
    const crowdMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .9 });
    const crowd = instanced(new THREE.CapsuleGeometry(.5, .8, 3, 5), crowdMat, crowdItems);
    if (crowd) g.add(crowd);
    g.position.set(-690, y0, 2880); g.rotation.y = Math.PI / 2;
    scene.add(g);
    world.addCollision(-690, 2880, 9, 34, 'grandstand', 16);
  }

  // pit building
  {
    const g = new THREE.Group();
    const white = new THREE.MeshStandardMaterial({ color: 0xe6e3da, roughness: .45, metalness: .2 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(80, 9, 14), white); body.position.y = 4.5; g.add(body);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(82, .6, 16), new THREE.MeshStandardMaterial({ color: 0x272c31, roughness: .5, metalness: .5 })); roof.position.y = 9.3; g.add(roof);
    for (let i = 0; i < 7; i++) {
      const door = new THREE.Mesh(new THREE.BoxGeometry(8, 6.6, .3), new THREE.MeshStandardMaterial({ color: 0x24292d, roughness: .3, metalness: .4 }));
      door.position.set(-33 + i * 11, 3.6, 7.1); g.add(door);
    }
    const signTex = signTexture(['MERIDIAN', 'CIRCUIT'], '#0e1318', '#ff5a12', 512, 128);
    const sign = doubleSidedSign(20, 5, signTex);
    sign.position.set(0, 7.4, 7.2); g.add(sign);
    g.position.set(-40, y0, 2530); scene.add(g);
    world.addCollision(-40, 2530, 41, 7, 'pit', 10);
  }

  // start/finish gantry
  {
    const p = pts[0], p2 = pts[1];
    const ang = Math.atan2(p2.x - p.x, p2.z - p.z);
    const g = new THREE.Group();
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x2c3238, metalness: .7, roughness: .35 });
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(.8, 9, .8), frameMat); post.position.set(s * (road.width / 2 + 2), 4.5, 0); g.add(post);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(road.width + 5, 2.5, 1), frameMat); beam.position.y = 8.5; g.add(beam);
    const tex = signTexture(['MERIDIAN', 'CIRCUIT', 'START / FINISH'], '#0b1015', '#ff5a12', 512, 160);
    const banner = doubleSidedSign(road.width + 3, 2.2, tex);
    banner.position.set(0, 8.5, .55); g.add(banner);
    // start lights
    const lightMat = new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff0000, emissiveIntensity: 3 });
    world.engine.addLampMaterial(lightMat);
    for (let i = 0; i < 5; i++) {
      const l = new THREE.Mesh(new THREE.SphereGeometry(.35, 8, 6), lightMat); l.position.set(-3 + i * 1.5, 6.8, .6); g.add(l);
    }
    g.position.set(p.x, p.y, p.z); g.rotation.y = ang;
    scene.add(g);
  }

  // floodlights
  for (const [x, z] of [[-700, 2700], [-520, 3100], [-20, 3180], [260, 2950], [180, 2600], [-320, 2500]]) {
    const y = world.terrainHeight(x, z);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(.25, .5, 26, 6), new THREE.MeshStandardMaterial({ color: 0x8f969c, metalness: .7, roughness: .4 }));
    pole.position.set(x, y + 13, z); scene.add(pole);
    const head = new THREE.Mesh(new THREE.BoxGeometry(5, 1.2, .6), new THREE.MeshStandardMaterial({ color: 0x2b3035, emissive: 0xfff0c0, emissiveIntensity: 2 }));
    world.engine.addLampMaterial(head.material);
    head.position.set(x, y + 26, z); head.rotation.y = Math.atan2(-260 - x, 2860 - z); scene.add(head);
  }

  world.trackCenter = { x: -260, z: 2860 };
}

// ------------------------------------------------------------------ BRIDGE
export function buildBridge(world) {
  const road = world.roads.byName.get('Coastal Run');
  if (!road) return;
  const pts = road.points.filter(p => p.bridge);
  if (pts.length < 2) return;
  const scene = world.scene;
  const concrete = new THREE.MeshStandardMaterial({ color: 0xb3b0a8, roughness: .8 });
  const metal = new THREE.MeshStandardMaterial({ color: 0xc7ccd0, metalness: .8, roughness: .35 });
  // deck underside
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const dx = b.x - a.x, dz = b.z - a.z;
    const l = Math.hypot(dx, dz);
    const ang = Math.atan2(dx, dz);
    const seg = new THREE.Mesh(new THREE.BoxGeometry(road.width + 2, 2.1, l + .2), concrete);
    seg.position.set((a.x + b.x) / 2, (a.y + b.y) / 2 - 1.1, (a.z + b.z) / 2);
    seg.rotation.y = ang; scene.add(seg);
  }
  // pylon towers
  const towerPoints = [pts[Math.floor(pts.length * .22)], pts[Math.floor(pts.length * .78)]];
  towerPoints.forEach((p, idx) => {
    const g = new THREE.Group();
    for (const s of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(2.6, 32, 2.6), concrete);
      leg.position.set(s * (road.width / 2 + 2), 16, 0); g.add(leg);
    }
    const cross = new THREE.Mesh(new THREE.BoxGeometry(road.width + 8, 2, 2), concrete);
    cross.position.y = 26; g.add(cross);
    const cross2 = new THREE.Mesh(new THREE.BoxGeometry(road.width + 5, 1.2, 1.4), concrete);
    cross2.position.y = 31; g.add(cross2);
    g.position.set(p.x, p.y - 1, p.z); g.rotation.y = Math.atan2(pts[0].x - pts[1].x, pts[0].z - pts[1].z);
    scene.add(g);
    world.addCollision(p.x, p.z, road.width / 2 + 4, 2.2, 'bridge-tower', 34);
    // stay cables
    const cableGeos = [];
    for (let i = 0; i < pts.length; i += 2) {
      const q = pts[i];
      const dist = Math.abs(q.z - p.z);
      if (dist > 160 || dist < 8) continue;
      for (const s of [-1, 1]) {
        const start = new THREE.Vector3(p.x + s * (road.width / 2 + 2), p.y + 31, p.z);
        const end = new THREE.Vector3(q.x + s * (road.width / 2 + .7), q.y + .7, q.z);
        const geo = new THREE.BufferGeometry().setFromPoints([start, end]);
        cableGeos.push(geo);
      }
    }
    if (cableGeos.length) {
      const merged = mergeGeometries(cableGeos, false);
      const cables = new THREE.LineSegments(merged, new THREE.LineBasicMaterial({ color: 0xd8dde1 }));
      scene.add(cables);
    }
  });
  // navigation lights
  const lightMat = new THREE.MeshStandardMaterial({ color: 0xff3020, emissive: 0xff2010, emissiveIntensity: 3 });
  world.engine.addLampMaterial(lightMat);
  for (const p of towerPoints) for (const s of [-1, 1]) {
    const l = new THREE.Mesh(new THREE.SphereGeometry(.4, 6, 5), lightMat);
    l.position.set(p.x + s * (road.width / 2 + 2), p.y + 32, p.z); scene.add(l);
  }
}

// ------------------------------------------------------------------ TUNNEL
export function buildTunnel(world) {
  const road = world.roads.byName.get('Cloudline Pass');
  if (!road) return;
  const pts = road.points;
  let best = -1;
  for (let i = 8; i < pts.length - 8; i++) {
    const p = pts[i];
    if (p.z < -2820) { best = i; break; }
  }
  if (best < 0) return;
  const i0 = best, i1 = Math.min(pts.length - 1, best + 13);
  const a = pts[i0], b = pts[i1];
  const mid = new THREE.Vector3((a.x + b.x) / 2, (a.y + b.y) / 2 + 11, (a.z + b.z) / 2);
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  const ang = Math.atan2(b.x - a.x, b.z - a.z);
  const scene = world.scene;
  // rock mass over the road
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x575851, roughness: .98, flatShading: true });
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 1), rockMat);
  rock.scale.set(46, 34, len * .75);
  rock.position.copy(mid); rock.position.y = mid.y - 2;
  rock.rotation.y = ang; scene.add(rock);
  // portals
  const darkMat = new THREE.MeshBasicMaterial({ color: 0x020304, side: THREE.DoubleSide });
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x6b6a60, roughness: .95 });
  for (const [p, s] of [[a, -1], [b, 1]]) {
    const portal = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(8.4, 1.5, 6, 18, Math.PI), stoneMat);
    ring.position.y = 1;
    portal.add(ring);
    for (const side of [-1, 1]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(3, 11, 2.4), stoneMat);
      pillar.position.set(side * 8.4, 5.5, 0); portal.add(pillar);
    }
    const hole = new THREE.Mesh(new THREE.PlaneGeometry(15, 9.5), darkMat);
    hole.position.set(0, 5, .2); portal.add(hole);
    portal.position.set(p.x, p.y, p.z);
    portal.rotation.y = ang + (s < 0 ? Math.PI : 0);
    scene.add(portal);
  }
  // ceiling lights
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: 0xffc070, emissiveIntensity: 3 });
  world.engine.addLampMaterial(lampMat);
  for (let i = i0 + 2; i < i1; i += 2) {
    const p = pts[i];
    const l = new THREE.Mesh(new THREE.BoxGeometry(1.1, .18, .4), lampMat);
    l.position.set(p.x, p.y + 7.2, p.z); l.rotation.y = ang; scene.add(l);
  }
}

// ------------------------------------------------------------------ FESTIVAL
export function buildFestival(world, rng) {
  const scene = world.scene;
  const x = -1500, z = 640;
  const y = world.terrainHeight(x, z);
  const g = new THREE.Group();
  // plaza
  const plazaMat = new THREE.MeshStandardMaterial({ color: 0x2c3034, roughness: .55, metalness: .15 });
  const plaza = new THREE.Mesh(new THREE.CylinderGeometry(108, 108, .4, 48), plazaMat);
  plaza.position.y = .2; g.add(plaza);
  const ringMat = new THREE.MeshStandardMaterial({ color: 0x2a2f34, roughness: .3, metalness: .6 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(70, .35, 6, 64), new THREE.MeshStandardMaterial({ color: 0xff5a12, emissive: 0xff4a00, emissiveIntensity: 2.2 }));
  world.engine.addLampMaterial(ring.material);
  ring.rotation.x = Math.PI / 2; ring.position.y = .55; g.add(ring);
  // central display plinth
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(14, 15, .7, 40), ringMat);
  plinth.position.y = .55; g.add(plinth);
  const plinthGlow = new THREE.Mesh(new THREE.TorusGeometry(14.2, .12, 4, 60), new THREE.MeshStandardMaterial({ color: 0x35e6ff, emissive: 0x35e6ff, emissiveIntensity: 2.6 }));
  world.engine.addLampMaterial(plinthGlow.material);
  plinthGlow.rotation.x = Math.PI / 2; plinthGlow.position.y = .94; g.add(plinthGlow);
  // monument arch
  const arch = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0x20262c, metalness: .8, roughness: .3 });
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(1.4, 20, 1.4), steel); p.position.set(s * 15, 10, 0); arch.add(p);
    const glow = new THREE.Mesh(new THREE.BoxGeometry(.18, 14, .18), new THREE.MeshStandardMaterial({ color: 0xff5a12, emissive: 0xff4a00, emissiveIntensity: 2.2 }));
    world.engine.addLampMaterial(glow.material); glow.position.set(s * 14.5, 10, .7); arch.add(glow);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(32, 2.4, 1.4), steel); beam.position.y = 19; arch.add(beam);
  const brandTex = signTexture(['APEX HORIZON', 'FESTIVAL GROUNDS'], '#080b0f', '#ff5a12', 1024, 220);
  const brand = doubleSidedSign(31, 6.6, brandTex);
  brand.position.set(0, 14.5, 0); arch.add(brand);
  arch.position.set(0, .5, 126); g.add(arch);
  // stage
  const stage = new THREE.Group();
  const stageBody = new THREE.Mesh(new THREE.BoxGeometry(44, 2, 20), new THREE.MeshStandardMaterial({ color: 0x1b2025, roughness: .5 })); stageBody.position.y = 1; stage.add(stageBody);
  const stageRoof = new THREE.Mesh(new THREE.BoxGeometry(48, .8, 24), new THREE.MeshStandardMaterial({ color: 0x2b3238, metalness: .6, roughness: .4 })); stageRoof.position.y = 12; stage.add(stageRoof);
  for (const s of [-1, 1]) for (let i = -1; i <= 1; i++) {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(.6, 12, .6), steel); pillar.position.set(i * 20, 6, s * 10); stage.add(pillar);
  }
  const screenTex = signTexture(['APEX', 'HORIZON', 'LIVE FROM MERIDIAN'], '#120b07', '#ff5a12', 512, 300);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(22, 12.5), new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false }));
  screen.position.set(0, 7, -9.5); screen.rotation.y = Math.PI; stage.add(screen);
  stage.position.set(-38, .4, -52); stage.rotation.y = .2; g.add(stage);
  // tents
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + .3;
    const tx = Math.cos(a) * 86, tz = Math.sin(a) * 86;
    const t = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(9, 3.2, 9), new THREE.MeshStandardMaterial({ color: 0xe8e2d4, roughness: .8 })); base.position.y = 1.6; t.add(base);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(7.4, 3.2, 4), new THREE.MeshStandardMaterial({ color: i % 2 ? 0xff5a12 : 0x1b2025, roughness: .8 }));
    roof.rotation.y = Math.PI / 4; roof.position.y = 4.8; t.add(roof);
    t.position.set(tx, .4, tz); g.add(t);
  }
  // garage showcase building
  {
    const gb = new THREE.Group();
    const glass = new THREE.MeshPhysicalMaterial({ color: 0x2c4a58, metalness: .5, roughness: .08, transparent: true, opacity: .65, envMapIntensity: 1.4 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(32, 11, 20), glass); body.position.y = 5.5; gb.add(body);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(34, .8, 22), new THREE.MeshStandardMaterial({ color: 0x12171b, roughness: .5 })); roof.position.y = 11.3; gb.add(roof);
    const sign = doubleSidedSign(18, 4, signTexture(['GARAGE', 'APEX COLLECTION'], '#0a0d10', '#35e6ff', 512, 128));
    sign.position.set(0, 6.5, 10.2); gb.add(sign);
    gb.position.set(-112, .5, -20); gb.rotation.y = .6; g.add(gb);
    {
      const cos = Math.cos(.6), sin = Math.sin(.6);
      const gx = -112, gz = -20;
      world.addCollision(x + gx * cos + gz * sin, z - gx * sin + gz * cos, 15, 10, 'garage', 12);
    }
  }
  // crowd
  const crowdItems = [];
  for (let i = 0; i < 130; i++) {
    const a = rng() * Math.PI * 2, r = 30 + rng() * 75;
    crowdItems.push({ x: Math.cos(a) * r, y: 1.1, z: Math.sin(a) * r, sx: .55, sy: 1.7, sz: .55, ry: rng() * 6, color: new THREE.Color().setHSL(rng(), .5, .58) });
  }
  const crowd = instanced(new THREE.CapsuleGeometry(.5, 1, 3, 5), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .9 }), crowdItems);
  if (crowd) g.add(crowd);

  g.position.set(x, y, z);
  scene.add(g);
  world.festival = { x, y, z, group: g };
  world.spawn = { x: x + 4, z: z + 90, y: y, heading: 0 };
}

// ------------------------------------------------------------------ ROADSIDE
export function buildRoadside(world, rng) {
  const scene = world.scene;
  // overhead gantry signs on the ring
  const ring = world.roads.byName.get('Horizon Ring');
  if (ring) {
    const shaft = new THREE.MeshStandardMaterial({ color: 0x353b40, metalness: .65, roughness: .4 });
    for (let k = 0; k < 5; k++) {
      const p = ring.points[Math.floor((k + .3) / 5 * ring.points.length)];
      const p2 = ring.points[(Math.floor((k + .3) / 5 * ring.points.length) + 1) % ring.points.length];
      const ang = Math.atan2(p2.x - p.x, p2.z - p.z);
      const g = new THREE.Group();
      for (const s of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(.22, .3, 8, 6), shaft);
        post.position.set(s * (ring.width / 2 + 2), 4, 0); g.add(post);
      }
      const beam = new THREE.Mesh(new THREE.BoxGeometry(ring.width + 6, .35, .35), shaft); beam.position.y = 7.8; g.add(beam);
      const tex = signTexture(['MERIDIAN 12', k % 2 ? 'COAST  34   ▲' : 'CITY  18   ▲', 'HORIZON RING'], '#0d3b2e', '#f2f0e6', 512, 160);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(11, 3.4), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, side: THREE.DoubleSide }));
      sign.position.set(k % 2 ? 5 : -5, 6.3, 0); g.add(sign);
      g.position.set(p.x, p.y, p.z); g.rotation.y = ang;
      scene.add(g);
    }
  }
  // desert billboards
  const billboards = [
    { x: 1050, z: 2100, ry: .8, text: ['MIRAGE', 'FLATS', 'DUST NEVER SLEEPS'], bg: '#1a0f08', ac: '#ffb648' },
    { x: 2650, z: 2400, ry: -1.2, text: ['SUNSET', 'COAST', 'THE LONG WAY HOME'], bg: '#081418', ac: '#35e6ff' },
    { x: -3300, z: 300, ry: .4, text: ['GOLDEN', 'FIELDS', 'GROWN FAST. DRIVEN FASTER.'], bg: '#101408', ac: '#d8e05a' },
  ];
  for (const b of billboards) {
    const g = new THREE.Group();
    const tex = signTexture(b.text, b.bg, b.ac, 512, 300);
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(20, 11.7), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, side: THREE.DoubleSide }));
    panel.position.y = 13; g.add(panel);
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(.35, .5, 9, 6), new THREE.MeshStandardMaterial({ color: 0x4a4f54, metalness: .6, roughness: .5 }));
      post.position.set(s * 7, 4.5, 0); g.add(post);
    }
    g.position.set(b.x, world.terrainHeight(b.x, b.z), b.z); g.rotation.y = b.ry;
    scene.add(g);
  }
}
