import * as THREE from 'three';
import { clamp } from '../core/noise.js';

const TRAFFIC_COLORS = [0xd7d9da, 0x1b1e22, 0x9aa0a5, 0x7e2d2d, 0x2d466d, 0xd9c7a2, 0x485b4a, 0xbc5b28, 0xe7e9ea, 0x33383d, 0x8e2f59, 0x2b6d70];

/** Low-poly ambient traffic cruising the island's highway and city network. */
export class TrafficSystem {
  constructor(world, engine, count = 44) {
    this.world = world;
    this.engine = engine;
    this.count = count;
    this.cars = [];
    this._mat = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3(1, 1, 1);
    this._build();
  }

  _routes() {
    const roads = this.world.roads.roads.filter(r => ['highway', 'arterial', 'city', 'rural'].includes(r.type) && r.points.length > 6);
    const ring = this.world.roads.byName.get('Horizon Ring');
    const out = [];
    for (let i = 0; i < this.count; i++) {
      const road = i < this.count * 0.34 && ring ? ring : roads[Math.floor(Math.random() * roads.length)];
      out.push(road);
    }
    return out;
  }

  _build() {
    const bodyGeo = new THREE.BoxGeometry(1.78, 0.62, 4.0);
    bodyGeo.translate(0, 0.58, 0);
    const cabinGeo = new THREE.BoxGeometry(1.6, 0.54, 2.0);
    cabinGeo.translate(0, 1.13, -0.18);
    const wheelGeo = [];
    const wheel = new THREE.CylinderGeometry(0.31, 0.31, 0.2, 9);
    wheel.rotateZ(Math.PI / 2);
    for (const x of [-0.79, 0.79]) for (const z of [-1.28, 1.28]) {
      const g = wheel.clone();
      g.translate(x, 0.31, z);
      wheelGeo.push(g);
    }
    const wheelsGeo = mergeSimple(wheelGeo);
    const headGeo = new THREE.BoxGeometry(1.25, 0.09, 0.05);
    headGeo.translate(0, 0.62, 2.02);
    const tailGeo = new THREE.BoxGeometry(1.3, 0.075, 0.05);
    tailGeo.translate(0, 0.66, -2.02);

    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.38, metalness: 0.55 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x101820, roughness: 0.14, metalness: 0.55 });
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x0b0d0f, roughness: 0.92 });
    const headMat = new THREE.MeshStandardMaterial({ color: 0xe8f4ff, emissive: 0xbddfff, emissiveIntensity: 1.8 });
    const tailMat = new THREE.MeshStandardMaterial({ color: 0x5b0909, emissive: 0xff160c, emissiveIntensity: 1.4 });
    this.engine.addLampMaterial(headMat);
    this.engine.addLampMaterial(tailMat);

    this.bodyMesh = new THREE.InstancedMesh(bodyGeo, bodyMat, this.count);
    this.cabinMesh = new THREE.InstancedMesh(cabinGeo, glassMat, this.count);
    this.wheelMesh = new THREE.InstancedMesh(wheelsGeo, wheelMat, this.count);
    this.headMesh = new THREE.InstancedMesh(headGeo, headMat, this.count);
    this.tailMesh = new THREE.InstancedMesh(tailGeo, tailMat, this.count);
    [this.bodyMesh, this.cabinMesh, this.wheelMesh, this.headMesh, this.tailMesh].forEach(m => {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      m.castShadow = false;
      m.receiveShadow = false;
    });
    this.bodyMesh.castShadow = true;
    this.routes = this._routes();
    for (let i = 0; i < this.count; i++) {
      const road = this.routes[i];
      const type = road.type;
      const speed = type === 'highway' ? 24 + Math.random() * 12 :
        type === 'arterial' ? 15 + Math.random() * 8 :
        type === 'city' ? 8 + Math.random() * 7 : 12 + Math.random() * 9;
      const car = {
        road,
        seg: Math.floor(Math.random() * (road.closed ? road.points.length : road.points.length - 1)),
        frac: Math.random(),
        speed,
        dir: Math.random() > 0.5 ? 1 : -1,
        lane: (Math.random() > 0.5 ? 1 : -1) * road.width * 0.21,
        color: new THREE.Color(TRAFFIC_COLORS[i % TRAFFIC_COLORS.length]),
        x: 0, y: 0, z: 0, heading: 0,
      };
      this.bodyMesh.setColorAt(i, car.color);
      this.cars.push(car);
    }
    this.bodyMesh.instanceColor.needsUpdate = true;
    this.world.scene.add(this.bodyMesh, this.cabinMesh, this.wheelMesh, this.headMesh, this.tailMesh);
    for (let i = 0; i < this.count; i++) this._place(i);
    [this.bodyMesh, this.cabinMesh, this.wheelMesh, this.headMesh, this.tailMesh].forEach(m => { m.instanceMatrix.needsUpdate = true; });
  }

  _place(i) {
    const c = this.cars[i];
    const pts = c.road.points;
    const n = pts.length;
    const a = pts[c.seg % n], b = pts[(c.seg + 1) % n];
    const dx = b.x - a.x, dz = b.z - a.z;
    const len = Math.hypot(dx, dz) || 1;
    const px = a.x + (b.x - a.x) * c.frac;
    const pz = a.z + (b.z - a.z) * c.frac;
    const py = a.y + (b.y - a.y) * c.frac;
    const heading = Math.atan2(dx, dz) + (c.dir < 0 ? Math.PI : 0);
    const rx = Math.cos(heading), rz = -Math.sin(heading);
    c.x = px + rx * c.lane;
    c.z = pz + rz * c.lane;
    c.y = py + 0.08;
    c.heading = heading;
    c.len = len;
    this._q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), heading);
    this._p.set(c.x, c.y, c.z);
    this._s.set(1, 1, 1);
    this._mat.compose(this._p, this._q, this._s);
    this.bodyMesh.setMatrixAt(i, this._mat);
    this.cabinMesh.setMatrixAt(i, this._mat);
    this.wheelMesh.setMatrixAt(i, this._mat);
    this.headMesh.setMatrixAt(i, this._mat);
    this.tailMesh.setMatrixAt(i, this._mat);
  }

  update(dt) {
    if (!this.cars.length) return;
    for (let i = 0; i < this.cars.length; i++) {
      const c = this.cars[i];
      const pts = c.road.points;
      const n = pts.length;
      c.frac += (c.dir * c.speed * dt) / Math.max(1, c.len);
      if (c.road.closed) {
        while (c.frac >= 1) {
          c.frac -= 1;
          c.seg = (c.seg + 1) % n;
        }
        while (c.frac < 0) {
          c.frac += 1;
          c.seg = (c.seg - 1 + n) % n;
        }
      } else {
        // Open roads have n-1 segments. Bounce off the ends instead of
        // wrapping from the last point back to the first.
        while (c.frac >= 1) {
          c.frac -= 1;
          c.seg += 1;
          if (c.seg >= n - 1) {
            c.seg = Math.max(0, n - 2);
            c.frac = 1 - c.frac;
            c.dir = -1;
          }
        }
        while (c.frac < 0) {
          c.frac += 1;
          c.seg -= 1;
          if (c.seg < 0) {
            c.seg = 0;
            c.frac = -c.frac;
            c.dir = 1;
          }
        }
      }
      const a = pts[c.seg % n], b = pts[(c.seg + 1) % n];
      c.len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      this._place(i);
    }
    this.bodyMesh.instanceMatrix.needsUpdate = true;
    this.cabinMesh.instanceMatrix.needsUpdate = true;
    this.wheelMesh.instanceMatrix.needsUpdate = true;
    this.headMesh.instanceMatrix.needsUpdate = true;
    this.tailMesh.instanceMatrix.needsUpdate = true;
  }

  /** Returns a push vector if the player overlaps a traffic car. */
  hit(pos, radius = 2.3) {
    for (const c of this.cars) {
      const dx = pos.x - c.x, dz = pos.z - c.z;
      const d = Math.hypot(dx, dz);
      if (d < radius + 1.15) {
        const overlap = (radius + 1.15 - d);
        if (d < 0.001) return { x: overlap, z: 0 };
        return { x: (dx / d) * overlap, z: (dz / d) * overlap };
      }
    }
    return null;
  }
}

function mergeSimple(geos) {
  const merged = new THREE.BufferGeometry();
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];
  let offset = 0;
  for (const g of geos) {
    const p = g.attributes.position;
    const n = g.attributes.normal;
    const u = g.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      positions.push(p.getX(i), p.getY(i), p.getZ(i));
      if (n) normals.push(n.getX(i), n.getY(i), n.getZ(i));
      if (u) uvs.push(u.getX(i), u.getY(i));
    }
    const idx = g.index;
    if (idx) for (let i = 0; i < idx.count; i++) indices.push(idx.getX(i) + offset);
    else for (let i = 0; i < p.count; i++) indices.push(i + offset);
    offset += p.count;
    g.dispose();
  }
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  if (normals.length) merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  if (uvs.length) merged.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  merged.setIndex(indices);
  merged.computeBoundingSphere();
  return merged;
}
