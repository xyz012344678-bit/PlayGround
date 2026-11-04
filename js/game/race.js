import * as THREE from 'three';
import { clamp } from '../core/noise.js';

/**
 * Checkpoint race director. The player is placed on the event grid,
 * gets a short countdown, then must pass every gate in order.
 */
export class RaceManager {
  constructor(world, save, callbacks = {}) {
    this.world = world;
    this.save = save;
    this.callbacks = callbacks;
    this.state = 'idle';
    this.event = null;
    this.time = 0;
    this.countdown = 0;
    this.cpIndex = 0;
    this.result = null;
    this._lastCount = 0;
    this._buildBeacon();
  }

  _buildBeacon() {
    const g = new THREE.Group();
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0x35e6ff, transparent: true, opacity: 0.18, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 3.2, 44, 16, 1, true), beamMat);
    beam.position.y = 22;
    g.add(beam);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffb648, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(4.4, 0.28, 6, 26), ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 1.3;
    g.add(ring);
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(6.2, 0.14, 5, 30), ringMat);
    ring2.rotation.x = Math.PI / 2;
    ring2.position.y = 1.3;
    g.add(ring2);
    g.visible = false;
    g.renderOrder = 7;
    this.world.scene.add(g);
    this.beacon = g;
    this.beam = beam;
    this.rings = [ring, ring2];
  }

  start(event, player) {
    this.event = event;
    this.player = player;
    this.state = 'countdown';
    this.time = 0;
    this.countdown = 3.65;
    this.cpIndex = 0;
    this.result = null;
    this._lastCount = 4;
    const s = event.start;
    player.placeAt(s.x, s.z, s.heading);
    player.velForward = 0;
    player.velLateral = 0;
    this._placeBeacon(0);
    if (this.callbacks.onStart) this.callbacks.onStart(event);
  }

  _placeBeacon(index) {
    const pts = this.event?.points;
    if (!pts) { this.beacon.visible = false; return; }
    const p = pts[clamp(index, 0, pts.length - 1)];
    this.beacon.visible = true;
    this.beacon.position.set(p.x, p.y || 0.2, p.z);
  }

  update(dt, player) {
    if (this.state === 'idle' || this.state === 'finished') return;
    if (!this.event || !player) return;
    if (this.state === 'countdown') {
      this.countdown -= dt;
      const n = Math.ceil(this.countdown);
      if (n !== this._lastCount && n >= 0 && n <= 3) {
        this._lastCount = n;
        if (this.callbacks.onCountdown) this.callbacks.onCountdown(n);
      }
      if (this.countdown <= 0) {
        this.state = 'racing';
        this.time = 0;
        this.cpIndex = 1;
        this._placeBeacon(1);
        if (this.callbacks.onGo) this.callbacks.onGo(this.event);
      }
      return;
    }

    this.time += dt;

    // animated checkpoint marker
    if (this.beacon.visible) {
      const t = this.time + this.countdown;
      this.rings[0].scale.setScalar(1 + Math.sin(t * 3.2) * 0.08);
      this.rings[1].rotation.z = t * 0.7;
      this.beam.material.opacity = 0.12 + Math.abs(Math.sin(t * 2.4)) * 0.1;
    }

    const pts = this.event.points;
    const next = pts[this.cpIndex];
    if (!next) { this._finish(player); return; }
    const dx = next.x - player.pos.x;
    const dz = next.z - player.pos.z;
    const d = Math.hypot(dx, dz);
    this.nextDistance = d;
    if (d < 21) {
      this.cpIndex++;
      if (this.cpIndex >= pts.length) {
        this._finish(player);
      } else {
        this._placeBeacon(this.cpIndex);
        if (this.callbacks.onCheckpoint) this.callbacks.onCheckpoint(this.cpIndex, pts.length, this.event);
      }
    }
  }

  _finish(player) {
    this.state = 'finished';
    this.beacon.visible = false;
    const event = this.event;
    const time = this.time;
    const target = event.target;
    const grade = time <= target ? 'gold' : time <= target * 1.14 ? 'silver' : 'bronze';
    const mult = grade === 'gold' ? 1 : grade === 'silver' ? 0.65 : 0.4;
    const reward = Math.round(event.reward * mult);
    const prevBest = this.save.bestTimes?.[event.id];
    const newBest = !prevBest || time < prevBest;
    if (newBest) {
      this.save.bestTimes = this.save.bestTimes || {};
      this.save.bestTimes[event.id] = time;
    }
    this.save.credits = (this.save.credits || 0) + reward;
    this.save.wins = (this.save.wins || 0) + (grade === 'gold' ? 1 : 0);
    this.result = { event, time, target, grade, reward, newBest, cp: event.points.length };
    this._placeBeacon(0);
    this.beacon.visible = false;
    if (this.callbacks.onFinish) this.callbacks.onFinish(this.result);
  }

  getHud() {
    if (!this.event) return null;
    const pts = this.event.points;
    const next = pts[Math.min(this.cpIndex, pts.length - 1)];
    const d = next && this.player ? Math.hypot(next.x - this.player.pos.x, next.z - this.player.pos.z) : 0;
    return {
      label: this.event.name.toUpperCase(),
      state: this.state,
      time: this.time,
      countdown: this.countdown,
      cp: Math.max(1, Math.min(this.cpIndex, pts.length - 1)),
      total: pts.length - 1,
      distance: this.state === 'racing' ? d : 0,
      progress: this.state === 'racing' ? clamp((this.cpIndex - 1) / Math.max(1, pts.length - 2), 0, 1) : 0,
    };
  }

  abort() {
    this.state = 'idle';
    this.event = null;
    this.beacon.visible = false;
  }
}
