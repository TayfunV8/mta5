// Silah girişi (1/2/3 seç, sol tık ateş, R şarjör). Mermi fiziği fizik worker'ında (balistik, delme, hasar).
import { WEAPONS } from '../physics/weapons.js';
export class Weapons {
  constructor(g) { this.g = g; this.ammo = { 1: 12, 2: 30, 3: 6 }; this.reserve = { 1: 96, 2: 180, 3: 30 }; this.cool = 0; this.rel = 0; this.cur = 0; }
  label(p) { if (!this.cur || p.mode === 'vehicle') return null; const W = WEAPONS[this.cur]; return this.rel > 0 ? `${W.name} · şarjör değişiyor…` : `${W.name}  ${this.ammo[this.cur]} / ${this.reserve[this.cur]}`; }
  update(dt, inVeh) {
    const g = this.g, k = g.input, p = g.player; p.weapon = inVeh ? 0 : this.cur;
    if (inVeh || g.paused || p.dead) return;
    for (const n of [1, 2, 3]) if (k.wasPressed('Digit' + n)) { this.cur = this.cur === n ? 0 : n; p.weapon = this.cur; g.audio.click(); }
    this.cool -= dt; if (this.rel > 0 && (this.rel -= dt) <= 0) { const W = WEAPONS[this.cur], need = W.mag - this.ammo[this.cur], take = Math.min(need, this.reserve[this.cur]); this.ammo[this.cur] += take; this.reserve[this.cur] -= take; }
    if (!this.cur) return; const W = WEAPONS[this.cur];
    if (k.wasPressed('KeyR') && !g.missions.failed && this.rel <= 0 && this.ammo[this.cur] < W.mag && this.reserve[this.cur] > 0) { this.rel = W.reload; g.audio.click(); }
    const want = k.mouseLeft && g.input.locked && (W.auto || !this._held); if (!k.mouseLeft) this._held = false;
    if (want && this.cool <= 0 && this.rel <= 0) { if (this.ammo[this.cur] <= 0) { if (this.reserve[this.cur] > 0) this.rel = W.reload; this.cool = 0.3; g.audio.click(); return; } this._fire(W); this._held = true; }
  }
  _fire(W) {
    const g = this.g, p = g.player, rig = g.rig, cam = rig.camera.position;
    const cy = Math.cos(rig.yaw), sy = Math.sin(rig.yaw), cp = Math.cos(rig.pitch), sp = Math.sin(rig.pitch), f = { x: -sy * cp, y: sp, z: -cy * cp };
    const t = Math.min(150, g.world.rayBoxes(cam.x, cam.y, cam.z, f.x, f.y, f.z, 150)), aim = { x: cam.x + f.x * t, y: cam.y + f.y * t, z: cam.z + f.z * t };
    const mx = p.pos.x + cy * 0.25, my = p.pos.y + 0.25, mz = p.pos.z - sy * 0.25;
    let dx = aim.x - mx, dy = aim.y - my, dz = aim.z - mz; const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
    g.physics.fire({ weapon: this.cur, ox: mx + dx * 0.6, oy: my + dy * 0.6, oz: mz + dz * 0.6, dx, dy, dz, shooter: p.char.index });
    this.ammo[this.cur]--; this.cool = 1 / W.rate; g.audio.shot(this.cur, 0, true); g.fx.tracer({ x: mx + dx * 0.8, y: my + dy * 0.8, z: mz + dz * 0.8 }, { x: mx + dx * Math.min(l, 60), y: my + dy * Math.min(l, 60), z: mz + dz * Math.min(l, 60) });
    rig.pitch = Math.min(1, rig.pitch + W.recoilKick); rig.yaw += (Math.random() - 0.5) * W.recoilKick * 0.8; rig.shake = Math.max(rig.shake, 0.15);
    let near = 1e9; for (const d of g.pop.peds) near = Math.min(near, Math.hypot(d.px - p.pos.x, d.pz - p.pos.z));
    g.ai.event({ type: 'gunshot', x: p.pos.x, z: p.pos.z, crime: near < 55 ? 0.3 : 0 });
  }
}
