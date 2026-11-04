import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BODY_CONFIG, PROFILES, RIM_STYLES } from './vehicles.js';

const TAU = Math.PI * 2;

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

function sampleProfile(profile, count = 30) {
  const out = [];
  const n = profile.length;
  for (let i = 0; i < count; i++) {
    const u = (i / (count - 1)) * (n - 1);
    const i0 = Math.min(n - 1, Math.floor(u));
    const t = u - i0;
    const p0 = profile[Math.max(0, i0 - 1)];
    const p1 = profile[i0];
    const p2 = profile[Math.min(n - 1, i0 + 1)];
    const p3 = profile[Math.min(n - 1, i0 + 2)];
    out.push([0, 1, 2, 3, 4, 5].map(k => catmull(p0[k], p1[k], p2[k], p3[k], t)));
  }
  out[0][0] = -0.5; out[out.length - 1][0] = 0.5;
  return out;
}

function makePaint(hex, finish) {
  const mat = new THREE.MeshPhysicalMaterial({
    color: hex, metalness: finish === 'chrome' ? 1 : finish === 'matte' ? 0.18 : 0.62,
    roughness: finish === 'matte' ? 0.72 : finish === 'chrome' ? 0.08 : 0.24,
    clearcoat: finish === 'matte' ? 0.08 : 1,
    clearcoatRoughness: finish === 'matte' ? 0.6 : 0.12,
    envMapIntensity: 1.25,
  });
  mat.name = 'paint';
  return mat;
}

let blobShadowTexture = null;
function getBlobShadowTexture() {
  if (blobShadowTexture) return blobShadowTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 6, 64, 64, 64);
  g.addColorStop(0, 'rgba(0,0,0,0.62)');
  g.addColorStop(0.5, 'rgba(0,0,0,0.34)');
  g.addColorStop(0.82, 'rgba(0,0,0,0.1)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  blobShadowTexture = new THREE.CanvasTexture(c);
  blobShadowTexture.colorSpace = THREE.SRGBColorSpace;
  return blobShadowTexture;
}

function wheelGeometry(R, W, rimStyle, rimColor) {
  const tireGeo = new THREE.CylinderGeometry(R, R, W, 24, 1);
  tireGeo.rotateZ(Math.PI / 2);
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x101214, roughness: 0.94, metalness: 0.02 });
  const rimMat = new THREE.MeshStandardMaterial({ color: rimColor, roughness: 0.24, metalness: 0.92 });
  const barrelGeo = new THREE.CylinderGeometry(R * 0.66, R * 0.66, W * 0.72, 20);
  barrelGeo.rotateZ(Math.PI / 2);
  const lipGeo = new THREE.TorusGeometry(R * 0.64, R * 0.035, 5, 24);
  lipGeo.rotateY(Math.PI / 2);
  const spokes = [];
  const style = RIM_STYLES.find(s => s.id === rimStyle) || RIM_STYLES[0];
  if (style.spokes > 0) {
    for (let i = 0; i < style.spokes; i++) {
      const a = (i / style.spokes) * TAU;
      const g = new THREE.BoxGeometry(W * 0.16, R * 0.56, style.width * R);
      g.translate(0, R * 0.30, 0);
      g.rotateX(a);
      spokes.push(g);
    }
    if (style.id === 'twin') {
      for (let i = 0; i < style.spokes; i++) {
        const a = (i / style.spokes) * TAU + .16;
        const g = new THREE.BoxGeometry(W * 0.14, R * 0.52, style.width * R * .7);
        g.translate(0, R * 0.30, 0);
        g.rotateX(a);
        spokes.push(g);
      }
    }
  }
  const hub = new THREE.CylinderGeometry(R * 0.16, R * 0.16, W * 0.4, 10);
  hub.rotateZ(Math.PI / 2);
  const spokeGeo = spokes.length ? mergeGeometries(spokes, false) : new THREE.BufferGeometry();

  return { tireGeo, tireMat, rimMat, barrelGeo, lipGeo, spokeGeo, hub };
}

function buildWheel(cfg, style, rimColor, isFront) {
  const R = cfg.wheelR;
  const W = cfg.wheelW;
  const w = wheelGeometry(R, W, style, rimColor);
  const root = new THREE.Group();
  const spin = new THREE.Group();
  const tire = new THREE.Mesh(w.tireGeo, w.tireMat);
  spin.add(tire);
  const barrel = new THREE.Mesh(w.barrelGeo, w.rimMat);
  barrel.position.x = W * 0.36;
  spin.add(barrel);
  for (const side of [-1, 1]) {
    const lip = new THREE.Mesh(w.lipGeo, w.rimMat);
    lip.position.x = side * W * 0.42;
    spin.add(lip);
    if (w.spokeGeo.attributes.position) {
      const spokes = new THREE.Mesh(w.spokeGeo, w.rimMat);
      spokes.position.x = side * W * 0.4;
      spin.add(spokes);
    }
    const hub = new THREE.Mesh(w.hub, w.rimMat);
    hub.position.x = side * W * 0.42;
    spin.add(hub);
  }
  const brakeGeo = new THREE.CylinderGeometry(R * 0.5, R * 0.5, W * 0.16, 20);
  brakeGeo.rotateZ(Math.PI / 2);
  const brakeMat = new THREE.MeshStandardMaterial({ color: 0x2a2c2e, roughness: 0.55, metalness: 0.7 });
  const disc = new THREE.Mesh(brakeGeo, brakeMat);
  disc.position.x = W * 0.05;
  root.add(disc);
  const caliperMat = new THREE.MeshStandardMaterial({ color: 0xb8321c, roughness: 0.5, metalness: 0.3 });
  const caliper = new THREE.Mesh(new THREE.BoxGeometry(W * 0.16, R * 0.34, R * 0.28), caliperMat);
  caliper.position.set(W * 0.12, R * 0.34, 0);
  root.add(caliper);
  root.add(spin);
  const wheel = { root, spin, tire, rimMat: w.rimMat, brakeMat, caliperMat, isFront };
  root.userData.spin = spin;
  spin.userData.tireMat = w.tireMat;
  return wheel;
}

export function createCarModel(vehicle, opts = {}) {
  const cfg = BODY_CONFIG[vehicle.body] || BODY_CONFIG.sport;
  const L = cfg.length, Wd = cfg.width, H = cfg.height, CL = cfg.clearance;
  const wheelR = cfg.wheelR;
  const profile = sampleProfile(PROFILES[cfg.profile] || PROFILES.sport, 32);
  const paintHex = opts.paint ?? vehicle.color ?? 0xff5a12;
  const finish = opts.finish ?? vehicle.finish ?? 'metallic';
  const rimStyle = opts.rimStyle ?? (cfg.wheelR > .4 ? 'offroad' : 'split5');
  const rimColor = opts.rimColor ?? 0x15171a;
  const accentHex = opts.accent ?? (vehicle.stripes ? 0xf2f0e4 : 0x111417);

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  // Soft contact shadow keeps the car grounded on every quality preset.
  const shadowMat = new THREE.MeshBasicMaterial({
    map: getBlobShadowTexture(), transparent: true, opacity: 0.9, depthWrite: false,
    toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4,
  });
  shadowMat.name = 'blobShadow';
  const blobShadow = new THREE.Mesh(new THREE.PlaneGeometry(Wd * 1.36, L * 1.16), shadowMat);
  blobShadow.rotation.x = -Math.PI / 2;
  blobShadow.position.y = 0.045;
  blobShadow.renderOrder = 1;
  blobShadow.userData.blobShadow = true;
  root.add(blobShadow);

  const paintMat = makePaint(paintHex, finish);
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x081116, metalness: 0.1, roughness: 0.04, transparent: true, opacity: 0.66,
    envMapIntensity: 2.2, clearcoat: 1, clearcoatRoughness: 0.03, side: THREE.DoubleSide,
  });
  const carbonMat = new THREE.MeshStandardMaterial({ color: 0x121417, roughness: 0.42, metalness: 0.55 });
  const blackMat = new THREE.MeshStandardMaterial({ color: 0x0c0e10, roughness: 0.72, metalness: 0.15 });
  const chromeMat = new THREE.MeshStandardMaterial({ color: 0xdce1e5, roughness: 0.09, metalness: 1 });
  const interiorMat = new THREE.MeshStandardMaterial({ color: 0x171a1e, roughness: 0.78, metalness: 0.1 });
  const accentMat = new THREE.MeshPhysicalMaterial({ color: accentHex, roughness: 0.35, metalness: .35, clearcoat: .7 });
  const headlightMat = new THREE.MeshStandardMaterial({ color: 0xf6fbff, emissive: 0xdfefff, emissiveIntensity: 2.2, roughness: .1, metalness: .2 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x5e0808, emissive: 0xff1208, emissiveIntensity: .9, roughness: .22, metalness: .2 });
  const indicatorMat = new THREE.MeshStandardMaterial({ color: 0x6b3c00, emissive: 0xff8a00, emissiveIntensity: 0.2, roughness: .3 });
  const reverseMat = new THREE.MeshStandardMaterial({ color: 0xbfc6cc, emissive: 0xe8f4ff, emissiveIntensity: 0.0, roughness: .2 });

  // ---------- body shell via lofted cross sections
  const ring = [];
  for (const s of profile) {
    const [zf, wf, ybf, ysf, ytf, twf] = s;
    const w = (Wd / 2) * Math.max(.16, wf);
    const b = CL + Math.max(.015, ybf) * (H - CL);
    const sh = CL + Math.max(.06, ysf) * (H - CL);
    const top = CL + Math.max(.09, ytf) * (H - CL);
    const tw = (Wd / 2) * Math.max(.14, twf);
    const z = zf * L;
    const pts = [
      [0, b], [w * .55, b], [w * .90, b + (sh - b) * .05], [w, b + (sh - b) * .30],
      [w, sh], [w * .92, sh + (top - sh) * .45], [tw, top], [0, top],
      [-tw, top], [-w * .92, sh + (top - sh) * .45], [-w, sh],
      [-w, b + (sh - b) * .30], [-w * .90, b + (sh - b) * .05], [-w * .55, b],
    ];
    ring.push({ z, pts, w, top, sh, b, tw });
  }
  const positions = [];
  const indicesPaint = [];
  const indicesGlass = [];
  const rings = ring.map(r => r.pts.map(([x, y]) => new THREE.Vector3(x, y, r.z)));
  const ringLen = rings[0].length;
  rings.forEach(r => r.forEach(p => positions.push(p.x, p.y, p.z)));
  const normalsApprox = [];
  const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), tmpC = new THREE.Vector3();
  for (let j = 0; j < rings.length - 1; j++) {
    const zA = ring[j].z, zB = ring[j + 1].z;
    const topSlope = Math.abs(ring[j].top - ring[j + 1].top) / Math.max(.001, Math.abs(zB - zA));
    for (let i = 0; i < ringLen; i++) {
      const i2 = (i + 1) % ringLen;
      const a = j * ringLen + i, b = j * ringLen + i2;
      const c = (j + 1) * ringLen + i, d = (j + 1) * ringLen + i2;
      const pA = rings[j][i], pB = rings[j][i2], pC = rings[j + 1][i];
      tmpA.copy(pB).sub(pA); tmpB.copy(pC).sub(pA); tmpC.crossVectors(tmpA, tmpB).normalize();
      const ny = Math.abs(tmpC.y);
      const zc = (zA + zB) / 2;
      const yc = (ring[j].pts[i][1] + ring[j].pts[i2][1] + ring[j + 1].pts[i][1] + ring[j + 1].pts[i2][1]) / 4;
      const shc = (ring[j].sh + ring[j + 1].sh) / 2;
      const topc = (ring[j].top + ring[j + 1].top) / 2;
      const cabin = zc > cfg.cabinRear * L && zc < cfg.cabinFront * L;
      const nearRoof = topSlope < .22 && yc > topc - .035;
      const greenhouse = cabin && yc > shc - .015 && !nearRoof && (ny < .92 || topSlope > .22);
      const idx = greenhouse ? indicesGlass : indicesPaint;
      idx.push(a, c, b, b, c, d);
      normalsApprox.push(tmpC.clone());
    }
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const paintCount = indicesPaint.length;
  const allIdx = indicesPaint.concat(indicesGlass);
  geom.setIndex(allIdx);
  geom.addGroup(0, paintCount, 0);
  geom.addGroup(paintCount, indicesGlass.length, 1);
  geom.computeVertexNormals();
  geom.computeBoundingSphere();
  const shell = new THREE.Mesh(geom, [paintMat, glassMat]);
  shell.castShadow = true;
  shell.receiveShadow = true;
  body.add(shell);

  const topYAt = (z) => {
    const zf = clamp01((z / L) + .5);
    for (let i = 0; i < ring.length - 1; i++) {
      const a = ring[i].pts[0] ? ring[i].z : 0;
      const b = ring[i + 1].z;
      if (z >= a && z <= b) {
        const t = (z - a) / Math.max(.0001, b - a);
        return ring[i].top + (ring[i + 1].top - ring[i].top) * t;
      }
    }
    return H;
  };

  // underbody / rockers
  const under = new THREE.Mesh(new THREE.BoxGeometry(Wd * 0.86, 0.12, L * 0.82), blackMat);
  under.position.y = CL + 0.01; body.add(under);
  for (const s of [-1, 1]) {
    const rocker = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.16, L * 0.48), carbonMat);
    rocker.position.set(s * (Wd / 2 - .015), CL + .14, 0); body.add(rocker);
  }

  // wheel arch flares
  const archMat = new THREE.MeshStandardMaterial({ color: 0x0d0f11, roughness: .8, metalness: .1 });
  for (const z of [cfg.wheelbase / 2, -cfg.wheelbase / 2]) {
    for (const s of [-1, 1]) {
      const arch = new THREE.Mesh(new THREE.TorusGeometry(wheelR * 1.08, .055, 5, 18, Math.PI), archMat);
      arch.rotation.y = Math.PI / 2;
      arch.position.set(s * (cfg.track / 2 + .015), wheelR, z);
      body.add(arch);
    }
  }

  // splitter / diffuser
  if (cfg.splitter) {
    const splitter = new THREE.Mesh(new THREE.BoxGeometry(Wd * .96, .045, .34), carbonMat);
    splitter.position.set(0, CL + .035, L / 2 - .08); body.add(splitter);
    for (const s of [-1, 1]) {
      const canard = new THREE.Mesh(new THREE.BoxGeometry(.05, .03, .18), carbonMat);
      canard.position.set(s * Wd * .46, CL + .18, L / 2 - .18); canard.rotation.z = s * .2; body.add(canard);
    }
  }
  const diffuser = new THREE.Mesh(new THREE.BoxGeometry(Wd * .72, .09, .26), carbonMat);
  diffuser.position.set(0, CL + .08, -L / 2 + .06); body.add(diffuser);
  for (let i = -2; i <= 2; i++) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(.025, .12, .28), carbonMat);
    fin.position.set(i * Wd * .11, CL + .1, -L / 2 + .09); body.add(fin);
  }

  // grille / intake
  if (cfg.ev) {
    const lightbar = new THREE.Mesh(new THREE.BoxGeometry(Wd * .62, .055, .035), headlightMat);
    lightbar.position.set(0, CL + (H - CL) * .50, L / 2 - .008); body.add(lightbar);
  } else {
    const grille = new THREE.Mesh(new THREE.BoxGeometry(Wd * (cfg.bullbar ? .28 : .45), .15, .05), blackMat);
    grille.position.set(0, CL + (H - CL) * .36, L / 2 - .005); body.add(grille);
    for (let i = -2; i <= 2; i++) {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(.025, .115, .02), carbonMat);
      slat.position.set(i * Wd * .07, CL + (H - CL) * .36, L / 2 + .02); body.add(slat);
    }
    const lower = new THREE.Mesh(new THREE.BoxGeometry(Wd * .68, .1, .04), blackMat);
    lower.position.set(0, CL + .16, L / 2 + .005); body.add(lower);
  }

  // lights
  const headlightMats = [];
  const indicatorMats = [];
  const tailMats = [];
  const lightGroup = new THREE.Group(); body.add(lightGroup);
  const isRound = vehicle.body === 'classic';
  for (const s of [-1, 1]) {
    if (isRound) {
      const hl = new THREE.Mesh(new THREE.CylinderGeometry(.105, .105, .06, 14), headlightMat);
      hl.rotation.x = Math.PI / 2;
      hl.position.set(s * Wd * .31, CL + (H - CL) * .53, L / 2 - .01);
      lightGroup.add(hl);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(.115, .018, 5, 14), chromeMat);
      ring.rotation.x = Math.PI / 2; ring.position.copy(hl.position); lightGroup.add(ring);
    } else {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(Wd * .17, .075, .045), headlightMat);
      hl.position.set(s * Wd * .30, CL + (H - CL) * .53, L / 2 - .005);
      hl.rotation.z = s * -.05;
      lightGroup.add(hl);
      const drl = new THREE.Mesh(new THREE.BoxGeometry(Wd * .13, .018, .02), headlightMat);
      drl.position.set(s * Wd * .30, CL + (H - CL) * .46, L / 2 + .015);
      lightGroup.add(drl);
    }
    // indicators front
    const ind = new THREE.Mesh(new THREE.BoxGeometry(.07, .045, .03), indicatorMat);
    ind.position.set(s * (Wd * .40), CL + (H - CL) * .43, L / 2 + .02);
    lightGroup.add(ind);
  }
  // tail bar
  const tail = new THREE.Mesh(new THREE.BoxGeometry(Wd * .48, .07, .04), tailMat);
  tail.position.set(0, CL + (H - CL) * .58, -L / 2 + .005); lightGroup.add(tail);
  for (const s of [-1, 1]) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(Wd * .14, .055, .035), tailMat);
    t.position.set(s * Wd * .32, CL + (H - CL) * .58, -L / 2 + .005); lightGroup.add(t);
    const rev = new THREE.Mesh(new THREE.BoxGeometry(.06, .035, .02), reverseMat);
    rev.position.set(s * Wd * .22, CL + (H - CL) * .50, -L / 2 - .01); lightGroup.add(rev);
    const ind = new THREE.Mesh(new THREE.BoxGeometry(.07, .045, .03), indicatorMat);
    ind.position.set(s * Wd * .40, CL + (H - CL) * .48, -L / 2 - .01); lightGroup.add(ind);
  }
  headlightMats.push(headlightMat);
  indicatorMats.push(indicatorMat);
  tailMats.push(tailMat);

  // mirrors
  for (const s of [-1, 1]) {
    const stalk = new THREE.Mesh(new THREE.BoxGeometry(.08, .03, .12), blackMat);
    stalk.position.set(s * (Wd / 2 + .035), CL + (H - CL) * .64, cfg.cabinFront * L * .78);
    body.add(stalk);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(.16, .09, .17), paintMat);
    cap.position.set(s * (Wd / 2 + .09), CL + (H - CL) * .65, cfg.cabinFront * L * .76);
    body.add(cap);
  }

  // door handles
  for (const s of [-1, 1]) {
    for (const z of [cfg.cabinFront * L * .45, -cfg.cabinRear * L * .1]) {
      const h = new THREE.Mesh(new THREE.BoxGeometry(.03, .035, .16), chromeMat);
      h.position.set(s * (Wd / 2 + .015), CL + (H - CL) * .55, z); body.add(h);
    }
  }

  // exhausts
  if (cfg.exhaust > 0) {
    for (let i = 0; i < cfg.exhaust; i++) {
      const ex = new THREE.Mesh(new THREE.CylinderGeometry(.055, .065, .18, 10), chromeMat);
      ex.rotation.x = Math.PI / 2;
      ex.position.set((i - (cfg.exhaust - 1) / 2) * .28, CL + .13, -L / 2 - .08);
      body.add(ex);
      const inner = new THREE.Mesh(new THREE.CylinderGeometry(.038, .038, .04, 8), blackMat);
      inner.rotation.x = Math.PI / 2; inner.position.copy(ex.position); inner.position.z -= .02; body.add(inner);
    }
  }

  // spoiler
  if (cfg.wing || cfg.spoiler) {
    const wingY = cfg.wing ? topYAt(-L * .38) + .26 : topYAt(-L * .4) + .13;
    for (const s of [-1, 1]) {
      const sup = new THREE.Mesh(new THREE.BoxGeometry(.06, cfg.wing ? .26 : .13, .1), carbonMat);
      sup.position.set(s * Wd * .30, wingY - (cfg.wing ? .13 : .065), -L * .40); body.add(sup);
    }
    const wing = new THREE.Mesh(new THREE.BoxGeometry(Wd * (cfg.wing ? .92 : .78), .035, cfg.wing ? .38 : .24), cfg.wing ? carbonMat : paintMat);
    wing.position.set(0, wingY, -L * .42); wing.rotation.x = -.12; body.add(wing);
    for (const s of [-1, 1]) {
      const plate = new THREE.Mesh(new THREE.BoxGeometry(.02, cfg.wing ? .13 : .07, cfg.wing ? .38 : .24), carbonMat);
      plate.position.set(s * Wd * (cfg.wing ? .46 : .39), wingY, -L * .42); body.add(plate);
    }
  }

  // offroad accessories
  if (cfg.rack) {
    const railMat = carbonMat;
    for (const s of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(.05, .05, L * .34), railMat);
      rail.position.set(s * Wd * .33, topYAt(0) + .08, -.05 * L); body.add(rail);
    }
    for (const z of [-L * .16, 0, L * .13]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(Wd * .72, .04, .05), railMat);
      bar.position.set(0, topYAt(0) + .1, z); body.add(bar);
    }
    if (cfg.lightpod) {
      const pod = new THREE.Mesh(new THREE.BoxGeometry(Wd * .44, .1, .14), blackMat);
      pod.position.set(0, topYAt(0) + .21, L * .16); body.add(pod);
      for (let i = 0; i < 4; i++) {
        const l = new THREE.Mesh(new THREE.CylinderGeometry(.055, .055, .03, 10), headlightMat);
        l.rotation.x = Math.PI / 2; l.position.set((i - 1.5) * Wd * .095, topYAt(0) + .22, L * .16 + .08); body.add(l);
      }
    }
  }
  if (cfg.bullbar) {
    for (const s of [-1, 1]) {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(.035, .035, .55, 8), blackMat);
      bar.position.set(s * Wd * .3, CL + .3, L / 2 + .16); body.add(bar);
    }
    const cross = new THREE.Mesh(new THREE.BoxGeometry(Wd * .7, .06, .06), blackMat);
    cross.position.set(0, CL + .42, L / 2 + .16); body.add(cross);
    const cross2 = new THREE.Mesh(new THREE.BoxGeometry(Wd * .7, .06, .06), blackMat);
    cross2.position.set(0, CL + .18, L / 2 + .16); body.add(cross2);
    const snorkel = new THREE.Mesh(new THREE.CylinderGeometry(.045, .05, .55, 8), blackMat);
    snorkel.position.set(Wd * .46, CL + (H - CL) * .63, L * .2); body.add(snorkel);
    const head = new THREE.Mesh(new THREE.BoxGeometry(.12, .1, .18), blackMat);
    head.position.set(Wd * .46, CL + (H - CL) * .82, L * .2); body.add(head);
  }
  if (cfg.scoop) {
    const scoop = new THREE.Mesh(new THREE.BoxGeometry(Wd * .30, .11, .38), blackMat);
    scoop.position.set(0, topYAt(L * .25) + .02, L * .25); body.add(scoop);
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(Wd * .26, .06, .02), carbonMat);
    mouth.position.set(0, topYAt(L * .25) + .03, L * .25 + .2); body.add(mouth);
  }
  if (cfg.bed) {
    const bedFloor = new THREE.Mesh(new THREE.BoxGeometry(Wd * .82, .05, L * .36), blackMat);
    bedFloor.position.set(0, topYAt(-L * .30) + .01, -L * .33); body.add(bedFloor);
    for (const s of [-1, 1]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(.07, .22, L * .38), paintMat);
      wall.position.set(s * Wd * .44, topYAt(-L * .30) + .1, -L * .33); body.add(wall);
    }
    const tailgate = new THREE.Mesh(new THREE.BoxGeometry(Wd * .9, .24, .07), paintMat);
    tailgate.position.set(0, topYAt(-L * .30) + .11, -L * .50); body.add(tailgate);
  }
  if (cfg.chrome) {
    for (const z of [L / 2 - .01, -L / 2 + .01]) {
      const bumper = new THREE.Mesh(new THREE.BoxGeometry(Wd * .94, .12, .1), chromeMat);
      bumper.position.set(0, CL + .2, z); body.add(bumper);
    }
  }
  if (cfg.ev) {
    const charge = new THREE.Mesh(new THREE.BoxGeometry(.12, .08, .02), accentMat);
    charge.position.set(Wd * .34, CL + (H - CL) * .40, L / 2 + .01); body.add(charge);
  }
  if (vehicle.body === 'bus') {
    const door = new THREE.Mesh(new THREE.BoxGeometry(.06, 1.9, 1.1), glassMat);
    door.position.set(Wd / 2 + .005, CL + 1.15, L * .28); body.add(door);
    const dest = new THREE.Mesh(new THREE.BoxGeometry(Wd * .55, .26, .04), new THREE.MeshBasicMaterial({ color: 0xffb648, toneMapped: false }));
    dest.position.set(0, H - .33, L / 2 + .01); body.add(dest);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(Wd + .01, .13, L * .82), accentMat);
    stripe.position.set(0, CL + .65, 0); body.add(stripe);
  }

  // racing stripes
  if (vehicle.stripes || opts.stripes) {
    for (const s of [-1, 1]) {
      for (const [z0, z1] of [[L * .28, L * .46], [-L * .10, L * .17], [-L * .43, -L * .28]]) {
        const zc = (z0 + z1) / 2;
        const strip = new THREE.Mesh(new THREE.BoxGeometry(Wd * .075, .012, Math.abs(z1 - z0)), accentMat);
        strip.position.set(s * Wd * .085, topYAt(zc) + .012, zc);
        body.add(strip);
      }
    }
  }

  // interior
  const cabinFrontZ = cfg.cabinFront * L;
  const dash = new THREE.Mesh(new THREE.BoxGeometry(Wd * .82, .12, .26), interiorMat);
  dash.position.set(0, CL + (H - CL) * .57, cabinFrontZ - .48); body.add(dash);
  const dashTop = new THREE.Mesh(new THREE.BoxGeometry(Wd * .8, .05, .18), carbonMat);
  dashTop.position.set(0, CL + (H - CL) * .60, cabinFrontZ - .50); body.add(dashTop);
  const consoleBox = new THREE.Mesh(new THREE.BoxGeometry(Wd * .18, .16, .55), interiorMat);
  consoleBox.position.set(0, CL + (H - CL) * .46, cabinFrontZ - 1.0); body.add(consoleBox);
  for (const s of [-1, 1]) {
    const seatBase = new THREE.Mesh(new THREE.BoxGeometry(Wd * .27, .14, .5), interiorMat);
    seatBase.position.set(s * Wd * .19, CL + (H - CL) * .38, -L * .03); body.add(seatBase);
    const seatBack = new THREE.Mesh(new THREE.BoxGeometry(Wd * .27, .48, .12), interiorMat);
    seatBack.position.set(s * Wd * .19, CL + (H - CL) * .52, -L * .08); seatBack.rotation.x = -.16; body.add(seatBack);
  }
  const swGroup = new THREE.Group();
  swGroup.position.set(-Wd * .17, CL + (H - CL) * .60, cabinFrontZ - .66);
  swGroup.rotation.x = -.38;
  const swWheel = new THREE.Group();
  const swRing = new THREE.Mesh(new THREE.TorusGeometry(.145, .022, 6, 18), interiorMat);
  swWheel.add(swRing);
  for (let i = 0; i < 3; i++) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(.20, .022, .02), chromeMat);
    spoke.rotation.z = (i / 3) * Math.PI;
    swWheel.add(spoke);
  }
  const hubMesh = new THREE.Mesh(new THREE.CylinderGeometry(.04, .04, .03, 8), chromeMat);
  hubMesh.rotation.x = Math.PI / 2; swWheel.add(hubMesh);
  swGroup.add(swWheel); body.add(swGroup);

  // wheels + suspension roots
  const wheels = [];
  const wheelZ = cfg.wheelbase / 2;
  for (const [z, isFront] of [[wheelZ, true], [-wheelZ, false]]) {
    for (const s of [-1, 1]) {
      const wheel = buildWheel(cfg, rimStyle, rimColor, isFront);
      const rootW = new THREE.Group();
      rootW.position.set(s * cfg.track / 2, wheelR, z);
      rootW.add(wheel.root);
      root.add(rootW);
      wheel.root = rootW;
      wheel.steerRoot = rootW;
      wheel.baseX = s * cfg.track / 2;
      wheel.baseZ = z;
      wheel.camber = (opts.camber ?? -1) * Math.PI / 180;
      wheel.radius = wheelR;
      rootW.rotation.z = wheel.camber;
      wheels.push(wheel);
    }
  }

  // brake / reverse / indicator helper functions
  function setPaint(hex, finish2) {
    paintMat.color.set(hex);
    const f = finish2 || finish;
    paintMat.metalness = f === 'chrome' ? 1 : f === 'matte' ? 0.18 : 0.62;
    paintMat.roughness = f === 'matte' ? .72 : f === 'chrome' ? .08 : .24;
    paintMat.clearcoat = f === 'matte' ? .08 : 1;
    paintMat.needsUpdate = true;
  }
  function setAccent(hex) { accentMat.color.set(hex); }
  function setRimColor(hex) { wheels.forEach(w => w.rimMat.color.set(hex)); }
  function setRideHeight(v) { body.position.y = (v || 0) * .01; }
  let blink = 0;
  function updateLights(night, braking, reversing, steering, dt) {
    headlightMat.emissiveIntensity = 1.6 + night * 2.4;
    const brake = braking ? 3.4 : 1.1;
    tailMat.emissiveIntensity += (brake - tailMat.emissiveIntensity) * Math.min(1, dt * 12);
    reverseMat.emissiveIntensity = reversing ? 2.2 : 0;
    const indOn = Math.abs(steering) > .55 && (blink % 1) < .5;
    indicatorMat.emissiveIntensity = indOn ? 3.2 : .25;
    blink += dt * 2.4;
    wheels.forEach(w => {
      w.steerRoot.rotation.set(0, w.isFront ? steering * .62 : 0, w.camber);
      w.spin.rotation.x -= 0; // driven by physics
    });
  }
  function setSteering(angle) { swWheel.rotation.z = -angle * 1.8; }
  function dispose() {
    const geos = new Set(), mats = new Set();
    root.traverse(o => {
      if (o.geometry) geos.add(o.geometry);
      if (o.material) {
        if (Array.isArray(o.material)) o.material.forEach(m => mats.add(m)); else mats.add(o.material);
      }
    });
    geos.forEach(g => g.dispose());
    mats.forEach(m => { if (m.map && m.name !== 'blobShadow') m.map.dispose(); m.dispose(); });
  }

  root.traverse(o => { if (o.isMesh && !o.userData.blobShadow) { o.castShadow = true; o.receiveShadow = false; } });
  glassMat.depthWrite = false;
  const api = {
    root, body, wheels, paintMat, glassMat, accentMat, headlightMat, tailMat, indicatorMat, reverseMat,
    setPaint, setAccent, setRimColor, setRideHeight, updateLights, setSteering, dispose,
    dims: { L, W: Wd, H, wheelR, wheelbase: cfg.wheelbase, track: cfg.track },
    steeringWheel: swWheel,
  };
  return api;
}

function clamp01(v) { return Math.max(0, Math.min(1, v)); }
