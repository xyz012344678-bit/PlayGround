import * as THREE from 'three';
import { createCarModel } from './carModel.js';
import { BODY_CONFIG, vehiclePerformance } from './vehicles.js';
import { clamp, lerp } from '../core/noise.js';

export const CAMERA_MODES = ['CHASE', 'NEAR', 'HOOD', 'COCKPIT', 'CINEMA'];

const UP = new THREE.Vector3(0, 1, 0);

/**
 * Arcade-simulation vehicle controller.
 * A bicycle-style steering model with a real gearbox readout, surface grip,
 * handbrake drift, suspension pitch/roll, light logic and five cameras.
 */
export class PlayerVehicle {
  constructor(world, engine, vehicle, loadout = {}) {
    this.world = world;
    this.engine = engine;
    this.scene = world.scene;
    this.vehicle = vehicle;
    this.loadout = loadout;
    this.perf = vehiclePerformance(vehicle, loadout.upgrades || {});
    this.pos = new THREE.Vector3();
    this.heading = 0;
    this.velForward = 0;
    this.velLateral = 0;
    this.steer = 0;
    this.wheelSpin = 0;
    this.bodyLift = 0;
    this.bodyLiftVel = 0;
    this.pitch = 0;
    this.roll = 0;
    this.gear = 1;
    this.rpm = 900;
    this.speedKmh = 0;
    this.slip = 0;
    this.surface = { y: 0, grip: 1, type: 'terrain', onRoad: false };
    this.surfaceType = 'terrain';
    this.surfaceGrip = 1;
    this.airborne = false;
    this.waterTimer = 0;
    this.shake = 0;
    this.cameraMode = 0;
    this.camTime = 0;
    this.camLook = new THREE.Vector3();
    this.camInit = false;
    this.throttle = 0;
    this.brake = 0;
    this.handbrake = false;
    this.steerScale = 1;
    this.assist = true;
    this.manual = false;
    this.traffic = null;
    this.audio = null;
    this.onImpact = null;
    this.onEvent = null;
    this._fwd = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
    this._tmp2 = new THREE.Vector3();
    this._buildModel();
  }

  _buildModel() {
    if (this.model) {
      this.scene.remove(this.model.root);
      this.model.dispose();
    }
    this.model = createCarModel(this.vehicle, {
      paint: this.loadout.paint ?? this.vehicle.color,
      finish: this.loadout.finish ?? this.vehicle.finish ?? 'metallic',
      rimStyle: this.loadout.rimStyle,
      rimColor: this.loadout.rimColor ?? 0x15171a,
      accent: this.loadout.accent,
      camber: this.loadout.camber ?? -1,
    });
    this.scene.add(this.model.root);
    this.dims = this.model.dims;
    this.rideHeight = this.loadout.rideHeight ?? 0;
    this.model.setRideHeight(this.rideHeight);
    this.baseBodyY = this.model.body.position.y;
    this.camInit = false;
  }

  setVehicle(vehicle, loadout = {}) {
    this.vehicle = vehicle;
    this.loadout = loadout;
    this.perf = vehiclePerformance(vehicle, loadout.upgrades || {});
    this.gear = 1;
    this.velForward = 0;
    this.velLateral = 0;
    this._buildModel();
    this.model.root.position.copy(this.pos);
    this.model.root.rotation.y = this.heading;
  }

  applyLoadout(loadout) {
    this.loadout = loadout;
    this.perf = vehiclePerformance(this.vehicle, loadout.upgrades || {});
    if (!this.model) return;
    this.model.setPaint(loadout.paint ?? this.vehicle.color, loadout.finish ?? this.vehicle.finish);
    if (loadout.accent !== undefined) this.model.setAccent(loadout.accent);
    if (loadout.rimColor !== undefined) this.model.setRimColor(loadout.rimColor);
    this.rideHeight = loadout.rideHeight ?? 0;
    this.model.setRideHeight(this.rideHeight);
    this.baseBodyY = this.model.body.position.y;
    const camber = ((loadout.camber ?? -1) * Math.PI) / 180;
    this.model.wheels.forEach(w => {
      w.camber = camber;
      w.steerRoot.rotation.z = camber;
    });
  }

  spawn(x, z, heading = 0) {
    const s = this.world.surfaceAt(x, z);
    this.pos.set(x, s.y + 0.02, z);
    this.heading = heading;
    this.velForward = 0;
    this.velLateral = 0;
    this.steer = 0;
    this.wheelSpin = 0;
    this.gear = 1;
    this.rpm = 900;
    this.bodyLift = 0;
    this.bodyLiftVel = 0;
    this.waterTimer = 0;
    this.surface = s;
    this.model.root.position.copy(this.pos);
    this.model.root.rotation.set(0, heading, 0);
    this.camInit = false;
  }

  placeAt(x, z, heading = 0) {
    const s = this.world.surfaceAt(x, z);
    this.pos.set(x, s.y + 0.02, z);
    this.heading = heading;
    this.velForward = 0;
    this.velLateral = 0;
    this.waterTimer = 0;
  }

  respawn() {
    const target = this.lastSafe || this.world.spawn || { x: -1496, z: 730, heading: 0 };
    this.spawn(target.x, target.z, target.heading || 0);
    if (this.onEvent) this.onEvent({ type: 'respawn' });
  }

  cycleCamera() {
    this.cameraMode = (this.cameraMode + 1) % CAMERA_MODES.length;
    this.camInit = false;
    return CAMERA_MODES[this.cameraMode];
  }

  get forward() { return this._fwd.set(Math.sin(this.heading), 0, Math.cos(this.heading)); }
  get right() { return this._right.set(Math.cos(this.heading), 0, -Math.sin(this.heading)); }

  update(dt, input) {
    if (!this.model) return;
    this._inputRef = input;
    dt = Math.min(dt, 0.05);
    const perf = this.perf;
    const throttle = clamp(input.throttle || 0, 0, 1);
    const brake = clamp(input.brake || 0, 0, 1);
    const handbrake = !!input.handbrake;
    const steerIn = clamp((input.steer || 0) * this.steerScale, -1, 1);
    this.throttle = throttle;
    this.brake = brake;
    this.handbrake = handbrake;

    const world = this.world;
    const engine = this.engine;
    const surface = world.surfaceAt(this.pos.x, this.pos.z);
    this.surface = surface;
    this.surfaceType = surface.type || 'terrain';
    const wet = engine.weather === 'rain' ? 0.84 : 1;
    this.surfaceGrip = clamp((surface.grip ?? 1) * wet, 0.45, 1.05);

    // grade along the car axis
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const ahead = world.surfaceAt(this.pos.x + fx * 2.2, this.pos.z + fz * 2.2).y;
    const behind = world.surfaceAt(this.pos.x - fx * 2.2, this.pos.z - fz * 2.2).y;
    const slope = clamp((ahead - behind) / 4.4, -0.55, 0.55);

    // throttle / brake / reverse
    const maxSpeed = (perf.top / 3.6) * lerp(0.7, 1, this.surfaceGrip);
    const speedAbs = Math.abs(this.velForward);
    const frac = clamp(speedAbs / Math.max(8, maxSpeed), 0, 1);
    const traction = lerp(0.55, 1.05, this.surfaceGrip) * (this.vehicle.drivetrain === 'AWD' || this.vehicle.drivetrain === '4WD' ? 1.06 : 1);
    const launch = 26 / Math.max(1.9, this.vehicle.accel);

    let driveAccel = 0;
    let reversing = this.velForward < -0.35;
    if (throttle > 0.01) {
      if (this.velForward < -0.6) {
        // braking out of reverse
        driveAccel += (10 + this.vehicle.braking * 8) * throttle;
      } else {
        const curve = Math.max(0.02, 1 - 0.9 * frac * frac);
        driveAccel += throttle * launch * curve * traction * (this.manual ? this._gearFactor(frac) : 1);
        reversing = false;
      }
    }
    if (brake > 0.01) {
      if (this.velForward > 0.7) {
        driveAccel -= brake * (10 + this.vehicle.braking * 13);
      } else {
        reversing = true;
        driveAccel -= brake * 6.2 * traction;
      }
    }
    if (handbrake) {
      driveAccel -= Math.sign(this.velForward) * Math.min(9, 3 + speedAbs * 0.12);
    }
    if (Math.abs(this.velForward) < 0.08 && throttle < 0.01 && brake < 0.01) this.velForward = 0;

    // gravity on grade, drag, rolling resistance
    driveAccel -= 9.81 * slope * 0.72;
    const drag = (0.22 + 0.00028 * this.velForward * this.velForward) * Math.sign(this.velForward || 1);
    const rolling = surface.onRoad ? 0.3 : 1.1;
    if (Math.abs(this.velForward) > 0.05) {
      this.velForward -= (drag + rolling * Math.sign(this.velForward)) * dt;
    }
    this.velForward += driveAccel * dt;
    if (Math.abs(this.velForward) < 1.6 && throttle < 0.01 && brake < 0.01 && Math.abs(slope) < 0.03) this.velForward *= 0.9;
    this.velForward = clamp(this.velForward, -22, maxSpeed);
    if (reversing && this.velForward > 0.5) this.velForward = Math.min(this.velForward, 0.5);

    // steering — speed sensitive and smoothed
    const speedNorm = clamp(Math.abs(this.velForward) / 62, 0, 1);
    const maxSteer = lerp(0.62, 0.11, speedNorm) * (this.assist ? lerp(1, 0.88, speedNorm) : 1);
    const targetSteer = steerIn * maxSteer;
    const steerRate = this.assist ? 11 : 7.5;
    this.steer += (targetSteer - this.steer) * Math.min(1, dt * steerRate);

    const handling = perf.handling;
    let yawRate = (this.velForward / Math.max(1.6, this.dims.wheelbase)) * Math.tan(this.steer);
    yawRate *= lerp(0.82, 1.06, handling) * lerp(0.6, 1, this.surfaceGrip);
    if (handbrake) yawRate *= 1.32;
    if (this.airborne) yawRate *= 0.15;
    const yawCap = lerp(1.35, 0.55, speedNorm) + (handbrake ? 0.25 : 0);
    yawRate = clamp(yawRate, -yawCap, yawCap);
    const dYaw = yawRate * dt;
    this.heading += dYaw;

    // carry momentum while the body rotates, then let the tyres scrub it off
    const cf = Math.cos(dYaw), sf = Math.sin(dYaw);
    const nf = this.velForward * cf + this.velLateral * sf;
    const nl = -this.velForward * sf + this.velLateral * cf;
    this.velForward = nf;
    this.velLateral = nl;

    let gripK = lerp(1.6, 5.8, handling) * this.surfaceGrip;
    if (this.vehicle.drivetrain === 'RWD' && this.vehicle.drift > 0.85) gripK *= 0.84;
    if (handbrake) gripK *= 0.18;
    if (this.airborne) gripK *= 0.12;
    this.velLateral *= Math.exp(-gripK * dt);
    const latCap = Math.abs(this.velForward) * 1.15 + 2.5;
    this.velLateral = clamp(this.velLateral, -latCap, latCap);

    // handbrake drift adds a little rotation kick, scaled by speed
    if (handbrake && speedAbs > 5 && Math.abs(steerIn) > 0.2) {
      this.heading += Math.sign(steerIn) * -0.018 * dt * Math.min(1, speedAbs / 30);
    }

    // move
    const f = this.forward, r = this.right;
    let vx = f.x * this.velForward + r.x * this.velLateral;
    let vz = f.z * this.velForward + r.z * this.velLateral;
    this.pos.x += vx * dt;
    this.pos.z += vz * dt;

    // solid props
    const hit = world.resolveCollisions(this.pos, 1.45);
    if (hit) {
      const len = Math.hypot(hit.nx, hit.nz) || 1;
      const nx = hit.nx / len, nz = hit.nz / len;
      const dot = vx * nx + vz * nz;
      if (dot < 0) { vx -= 1.35 * dot * nx; vz -= 1.35 * dot * nz; }
      this.velForward = clamp(vx * f.x + vz * f.z, -12, maxSpeed);
      this.velLateral = clamp(vx * r.x + vz * r.z, -16, 16);
      this.shake = Math.min(1, this.shake + Math.min(0.6, speedAbs * 0.018));
      this.bodyLiftVel += Math.min(2.2, speedAbs * 0.045);
      if (speedAbs > 4 && this.onImpact) this.onImpact(Math.min(1, speedAbs / 45));
    }

    // moving traffic blocks
    if (this.traffic) {
      const push = this.traffic.hit(this.pos, 2.35);
      if (push) {
        this.pos.x += push.x;
        this.pos.z += push.z;
        vx *= 0.55; vz *= 0.55;
        this.velForward *= 0.55;
        this.velLateral *= 0.6;
        this.shake = Math.min(1, this.shake + 0.35);
        if (this.onImpact) this.onImpact(0.4);
      }
    }

    // world edge
    const edge = world.half - 90;
    if (Math.abs(this.pos.x) > edge || Math.abs(this.pos.z) > edge) {
      this.pos.x = clamp(this.pos.x, -edge, edge);
      this.pos.z = clamp(this.pos.z, -edge, edge);
      this.velForward *= -0.2;
      this.velLateral *= 0.4;
    }

    // water — swim back to the last safe place
    const nowSurface = world.surfaceAt(this.pos.x, this.pos.z);
    this.surface = nowSurface;
    this.surfaceGrip = clamp((nowSurface.grip ?? 1) * wet, 0.45, 1.05);
    if (nowSurface.water) {
      this.waterTimer += dt;
      this.velForward *= Math.exp(-2.2 * dt);
      this.velLateral *= Math.exp(-2.5 * dt);
      if (this.waterTimer > 1.35) {
        this.waterTimer = 0;
        this.respawn();
        if (this.onEvent) this.onEvent({ type: 'water' });
        return;
      }
    } else {
      this.waterTimer = 0;
      this.lastSafe = { x: this.pos.x, z: this.pos.z, heading: this.heading };
    }

    // settle on the surface
    const targetY = nowSurface.y + 0.02;
    if (this.pos.y < targetY - 0.2) this.airborne = true;
    if (this.airborne) {
      this.pos.y = Math.max(targetY, this.pos.y - 18 * dt);
      if (this.pos.y <= targetY + 0.03) {
        this.airborne = false;
        this.bodyLiftVel -= 1.2;
      }
    } else {
      this.pos.y += (targetY - this.pos.y) * Math.min(1, dt * 14);
    }

    this.speedKmh = Math.abs(this.velForward) * 3.6;
    this.slip = Math.abs(this.velLateral);
    this._updateDrivetrain(dt, throttle, brake, speedAbs);

    // visual suspension
    const targetPitch = clamp(-Math.atan(slope) * 0.9, -0.13, 0.13) - driveAccel * 0.003;
    const targetRoll = clamp(-this.velLateral * 0.012 - yawRate * this.velForward * 0.0016, -0.1, 0.1);
    this.pitch += (targetPitch - this.pitch) * Math.min(1, dt * 4.5);
    this.roll += (targetRoll - this.roll) * Math.min(1, dt * 5);
    this.bodyLiftVel += (-this.bodyLift * 95 - this.bodyLiftVel * 10) * dt;
    this.bodyLift = clamp(this.bodyLift + this.bodyLiftVel * dt, -0.12, 0.12);

    // place model
    this.model.root.position.copy(this.pos);
    this.model.root.rotation.set(0, this.heading, 0);
    this.model.body.rotation.x = this.pitch;
    this.model.body.rotation.z = this.roll;
    this.model.body.position.y = this.baseBodyY + this.bodyLift;

    // wheels, steering, lights
    this.wheelSpin -= (this.velForward / Math.max(0.2, this.dims.wheelR)) * dt;
    this.model.wheels.forEach(w => {
      w.spin.rotation.x = this.wheelSpin;
    });
    this.model.updateLights(engine.night, brake > 0.1 || handbrake, this.velForward < -0.3, steerIn, dt);
    this.model.wheels.forEach(w => {
      if (!w.isFront) return;
      w.steerRoot.rotation.set(0, this.steer * 1.55, w.camber);
      w.spin.rotation.x = this.wheelSpin;
    });
    this.model.setSteering(this.steer * 1.2);

    this.shake *= Math.exp(-dt * 5.5);
    this.camTime += dt;

    if (this.audio) {
      this.audio.update(dt, {
        speed: this.speedKmh,
        rpm: this.rpm,
        throttle,
        slip: this.slip,
        surface: this.surfaceType,
        rain: engine.weather === 'rain',
      });
    }
  }

  _gearFactor(frac) {
    const gears = Math.max(1, this.vehicle.gears || 6);
    const lo = (this.gear - 1) / gears, hi = this.gear / gears;
    if (frac < lo * 0.82 || frac > hi * 1.04) return 0.55;
    return 1;
  }

  _updateDrivetrain(dt, throttle, brake, speedAbs) {
    const gears = Math.max(1, this.vehicle.gears || 6);
    const maxSpeed = this.perf.top / 3.6;
    const frac = clamp(Math.abs(this.velForward) / Math.max(8, maxSpeed), 0, 1);

    if (this.vehicle.gears <= 1) {
      this.gear = 1;
      this.rpm = 900 + frac * 8200 + throttle * 350;
      return;
    }
    if (this.manual) {
      const up = this._inputRef?.consume?.('shiftUp');
      const down = this._inputRef?.consume?.('shiftDown');
      if (up) {
        this.gear = Math.min(gears, this.gear + 1);
        this.shake = Math.min(0.3, this.shake + 0.12);
        if (this.audio) this.audio.shift();
      }
      if (down) this.gear = Math.max(1, this.gear - 1);
    } else {
      this.gear = clamp(1 + Math.floor(frac * gears * 0.985), 1, gears);
    }
    const inGear = clamp(frac * gears - (this.gear - 1), 0, 1);
    const targetRpm = 950 + inGear * 6200 + throttle * 450;
    this.rpm += (targetRpm - this.rpm) * Math.min(1, dt * 7);
    if (this.manual && this.gear > 1 && inGear < 0.12 && throttle < 0.2) {
      // avoid lugging at a standstill in a high gear
      this.rpm = Math.max(this.rpm, 1000);
    }
  }

  updateCamera(dt, camera) {
    if (!this.model) return;
    dt = Math.min(dt, 0.05);
    const speed = this.speedKmh;
    const f = this.forward;
    const mode = CAMERA_MODES[this.cameraMode];
    const p = this.pos;
    let desired = this._tmp;
    let look = this._tmp2;
    const baseFov = 58;

    if (mode === 'CHASE' || mode === 'NEAR') {
      const near = mode === 'NEAR';
      const dist = (near ? 5.8 : 8.2) + this.dims.L * 0.28;
      const height = (near ? 2.25 : 3.2) + this.dims.H * 1.15;
      desired.set(p.x - f.x * dist, p.y + height, p.z - f.z * dist);
      // a touch of lateral offset lets the car show its shoulder in a drift
      const side = clamp(this.velLateral * 0.07, -0.9, 0.9);
      desired.x += this.right.x * side;
      desired.z += this.right.z * side;
      look.set(p.x + f.x * (near ? 8 : 11), p.y + 1.15 + this.dims.H * 0.22, p.z + f.z * (near ? 8 : 11));
      const smooth = 1 - Math.exp(-dt * (near ? 7.5 : 5));
      camera.position.lerp(desired, this.camInit ? smooth : 1);
      this.camLook.lerp(look, this.camInit ? 1 - Math.exp(-dt * 8) : 1);
    } else if (mode === 'HOOD') {
      const y = this.pos.y + this.dims.H * 0.78;
      desired.set(p.x + f.x * this.dims.wheelbase * 0.34, y, p.z + f.z * this.dims.wheelbase * 0.34);
      look.set(p.x + f.x * 26, y - 1.1, p.z + f.z * 26);
      camera.position.lerp(desired, this.camInit ? 1 - Math.exp(-dt * 24) : 1);
      this.camLook.lerp(look, this.camInit ? 1 - Math.exp(-dt * 26) : 1);
    } else if (mode === 'COCKPIT') {
      const y = this.pos.y + this.dims.H * 0.66;
      desired.set(p.x + f.x * this.dims.wheelbase * 0.12, y, p.z + f.z * this.dims.wheelbase * 0.12);
      look.set(p.x + f.x * 26, y - 0.75, p.z + f.z * 26);
      camera.position.lerp(desired, this.camInit ? 1 - Math.exp(-dt * 28) : 1);
      this.camLook.lerp(look, this.camInit ? 1 - Math.exp(-dt * 30) : 1);
    } else {
      const t = this.camTime * 0.22;
      const dist = 10.5 + this.dims.L * 0.5;
      desired.set(p.x + Math.cos(t) * dist, p.y + 3.2 + Math.sin(t * 0.7) * 0.9, p.z + Math.sin(t) * dist);
      look.set(p.x, p.y + 1.0, p.z);
      camera.position.lerp(desired, this.camInit ? 1 - Math.exp(-dt * 2.6) : 1);
      this.camLook.lerp(look, this.camInit ? 1 - Math.exp(-dt * 4.2) : 1);
    }

    // never sink through the terrain
    const ground = this.world.surfaceAt(camera.position.x, camera.position.z).y + 1.1;
    if (camera.position.y < ground) camera.position.y = ground;

    if (this.shake > 0.001) {
      const s = this.shake * this.shake * 0.55;
      camera.position.x += (Math.random() - 0.5) * s;
      camera.position.y += (Math.random() - 0.5) * s * 0.6;
      camera.position.z += (Math.random() - 0.5) * s;
    }
    camera.lookAt(this.camLook);
    const fovTarget = baseFov + clamp(speed / 260, 0, 1) * 9 + (mode === 'COCKPIT' ? 4 : 0);
    camera.fov += (fovTarget - camera.fov) * Math.min(1, dt * 2.2);
    camera.updateProjectionMatrix();
    this.camInit = true;
  }

  setManual(on) { this.manual = on; }
  setAssist(on) { this.assist = on; }
  setSteerScale(v) { this.steerScale = clamp(v, 0.3, 1.8); }
  setInputRef(input) { this._inputRef = input; }

  dispose() {
    if (this.model) {
      this.scene.remove(this.model.root);
      this.model.dispose();
      this.model = null;
    }
  }
}
