import * as THREE from 'three';

// Üçüncü şahıs kamera: fare, yumuşak takip, ayarlanabilir mesafe/hassasiyet, duvar çarpışması, araç modu geçişi.
export class CameraRig {
  constructor(camera, world) {
    this.camera = camera; this.world = world; this.yaw = 0; this.pitch = -0.1; this.dist = 4; this.targetDist = 4; this.pos = new THREE.Vector3(); this.target = new THREE.Vector3();
    this.fov = 70; this.init = false; this.sens = 1; this.baseDist = 3.6; this.mode = 'foot'; this.sinceMouse = 9; this.lookH = 0.55; this.shake = 0; this.aim = 0; this.invertY = false;
  }
  rotate(dx, dy) { this.yaw -= dx * 0.0022 * this.sens; this.pitch = Math.max(-1.15, Math.min(1.0, this.pitch - dy * 0.0022 * this.sens * (this.invertY ? -1 : 1))); if (dx || dy) this.sinceMouse = 0; }
  setMode(m) { this.mode = m; }
  update(dt, p, speed, vehicleYaw, aiming) {
    this.sinceMouse += dt;
    const veh = this.mode === 'vehicle';
    this.targetDist = (veh ? this.baseDist * 1.9 + 1.2 : this.baseDist) * (aiming ? 0.62 : 1);
    this.dist += (this.targetDist - this.dist) * (1 - Math.exp(-5 * dt));
    if (veh && vehicleYaw !== undefined && speed > 4 && this.sinceMouse > 1.2) { let d = vehicleYaw - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); this.yaw += d * (1 - Math.exp(-1.6 * dt)); }
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw), cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const fx = -sy * cp, fy = sp, fz = -cy * cp, rx = cy, rz = -sy;
    const sh = veh ? 0 : 0.45 * (aiming ? 1.2 : 1);
    const goal = new THREE.Vector3(p.x + rx * sh, p.y + (veh ? 1.0 : this.lookH + 0.15), p.z + rz * sh);
    if (!this.init) { this.target.copy(goal); this.init = true; }
    this.target.lerp(goal, 1 - Math.exp(-(veh ? 14 : 28) * dt));
    // kamera çarpışması: hedeften geriye ışın at, duvara çarparsa yaklaş
    let d = this.dist; const bx = -fx, by = -fy, bz = -fz;
    const t = this.world.rayBoxes(this.target.x, this.target.y, this.target.z, bx, by, bz, d + 0.3);
    if (t < d + 0.3) d = Math.max(0.6, t - 0.3);
    if (this.target.y + by * d < 0.25) d = Math.max(0.6, (this.target.y - 0.25) / Math.max(-by, 1e-3));   // yerin altına girme
    this.pos.set(this.target.x + bx * d, this.target.y + by * d, this.target.z + bz * d);
    this.camera.position.copy(this.pos);
    if (this.shake > 0) { this.shake = Math.max(0, this.shake - dt * 3); this.camera.position.x += (Math.random() - 0.5) * this.shake * 0.15; this.camera.position.y += (Math.random() - 0.5) * this.shake * 0.15; }
    this.camera.lookAt(this.target.x + fx * 8, this.target.y + fy * 8, this.target.z + fz * 8);
    const wantFov = 68 + Math.min(speed, veh ? 45 : 7) * (veh ? 0.35 : 0.8) - (aiming ? 14 : 0);
    this.fov += (wantFov - this.fov) * (1 - Math.exp(-6 * dt)); if (Math.abs(this.camera.fov - this.fov) > 0.02) { this.camera.fov = this.fov; this.camera.updateProjectionMatrix(); }
    this.headHidden = d < 1.2;      // kamera kafaya çok yaklaştıysa karakteri gizle
  }
}
