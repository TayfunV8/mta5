// Araçlar, yayalar ve polis: fizik cisimleri + görseller + AI ajanları. Oyuncunun sürebileceği park halindeki araçlar,
// trafik, polis arabaları ve yaya havuzu burada oluşturulur ve her karede görsellerle eşitlenir.
import * as THREE from 'three';
import { createVehicleVisual } from '../render/VehicleModels.js';
import { createHumanoid, randomLook, LOOKS } from '../render/Humanoid.js';
import { KIND, ANIM } from '../ai/AiCore.js';
import { VEHICLES } from '../physics/vehicleSpecs.js';
import { mulberry32 } from '../world/rng.js';
import { MAX_AGENTS } from '../config/constants.js';
import { PARTS } from '../physics/Ragdoll.js';

const COUNTS = { low: { parked: 10, traffic: 6, cops: 4, peds: 14 }, medium: { parked: 16, traffic: 10, cops: 6, peds: 24 }, high: { parked: 20, traffic: 14, cops: 6, peds: 36 } };
const MIX = ['sedan', 'sedan', 'suv', 'coupe', 'pickup', 'van', 'sedan', 'suv', 'pickup', 'coupe', 'van', 'bike'];
const rq = (q) => { const yaw = 2 * Math.atan2(q.qy, q.qw); return yaw; };
const yawOf = (q) => Math.atan2(2 * (q.qw * q.qy + q.qx * q.qz), 1 - 2 * (q.qx * q.qx + q.qy * q.qy));

export class Population {
  constructor(game) { this.g = game; this.vehicles = []; this.peds = []; this.chars = []; this.slot = 0; this.tmp = {}; this.wtmp = {}; this.stateT = 0; this.rng = mulberry32(77); this.t = 0; }

  create(quality) {
    const c = COUNTS[quality] ?? COUNTS.medium, g = this.g, reg = [];
    const addVeh = (spec, kind, color, o = {}) => {
      const slot = this.slot++, { index, wheelRows } = g.physics.spawnVehicle(spec, { position: [0, 3, 0], agent: slot });
      const vis = createVehicleVisual(spec, color, g.atmo); g.renderer.scene.add(vis.root); vis.wheels.forEach((w) => g.renderer.scene.add(w));
      vis.root.visible = false; vis.wheels.forEach((w) => (w.visible = false));
      const v = { slot, spec, kind, index, wheelRows, vis, special: o.special ?? null, cop: kind === KIND.COP }; this.vehicles.push(v);
      if (kind === KIND.COP) this._copStyle(v);
      reg.push({ slot, kind, vehicle: spec }); return v;
    };
    for (let i = 0; i < c.parked; i++) { const spec = MIX[i % MIX.length], cols = VEHICLES[spec].colors; addVeh(spec, KIND.PARKED, cols[Math.floor(this.rng() * cols.length)]); }
    for (let i = 0; i < c.traffic; i++) { const spec = MIX[(i * 5 + 3) % (MIX.length - 1)], cols = VEHICLES[spec].colors; addVeh(spec, KIND.CAR, cols[Math.floor(this.rng() * cols.length)]); }
    for (let i = 0; i < c.cops; i++) addVeh('sedan', KIND.COP, 0xf4f6f8);
    for (let i = 0; i < c.peds; i++) {
      const slot = this.slot++, index = g.physics.spawnChar({ position: [0, 3, 0], agent: slot, health: 60 });
      const human = createHumanoid(randomLook(this.rng)); human.root.visible = false; g.renderer.scene.add(human.root);
      this.peds.push({ slot, index, human, px: 0, pz: 0, speed: 0 }); reg.push({ slot, kind: KIND.PED });
    }
    if (this.slot > MAX_AGENTS) throw new Error('MAX_AGENTS aşıldı');
    return reg;
  }

  /** Ragdoll havuzu: fizikte 11 parçalı eklemli gövde; burada her parça için bir mesh. */
  createRagdolls(count) {
    const g = this.g, rows = g.physics.initRagdolls(count); this.rds = [];
    const colorOf = (n, look) => /^head/.test(n) ? look.skin : /^(uarm|torso)/.test(n) ? (look.jacket ?? look.shirt) : /^farm/.test(n) ? (look.longSleeve ? look.shirt : look.skin) : look.pants;
    rows.forEach((r, k) => {
      const meshes = PARTS.map((p) => { const geo = p.s[0] === 'box' ? new THREE.BoxGeometry(p.s[1] * 2, p.s[2] * 2, p.s[3] * 2) : p.s[0] === 'ball' ? new THREE.SphereGeometry(p.s[1], 12, 10) : new THREE.CapsuleGeometry(p.s[2], p.s[1] * 2, 3, 8); const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.8 })); m.castShadow = true; m.visible = false; g.renderer.scene.add(m); return m; });
      this.rds.push({ k, rows: r, meshes, owner: -1, colorOf });
    });
    g.physics.on('ragdoll', (ev) => { const rd = this.rds[ev.rd]; if (!rd) return; rd.owner = ev.index; const human = this.peds.find((q) => q.index === ev.index)?.human ?? Object.values(g.player?.chars ?? {}).find((c) => c.index === ev.index)?.human; const look = human?.look ?? { skin: 0xe0ac82, shirt: 0x888888, pants: 0x333333 }; PARTS.forEach((p, i) => rd.meshes[i].material.color.setHex(colorOf(p.n, look))); });
  }
  /** Ragdoll sahibinin pelvis konumu (kamera/AI için) */
  ragdollPos(charIndex, out) { const rd = this.rds?.find((r) => r.owner === charIndex && r.meshes[0].visible); if (!rd) return null; const m = rd.meshes[0].position; out.x = m.x; out.y = m.y; out.z = m.z; return out; }
  makeChar(look) {
    const g = this.g, index = g.physics.spawnChar({ position: [0, 3, 0], agent: -1, health: 100 }), human = createHumanoid(look); g.renderer.scene.add(human.root);
    const c = { index, human, look, px: 0, pz: 0, speed: 0, seat: null }; this.chars.push(c); return c;
  }

  _copStyle(v) {
    const { l, w, h } = v.vis.spec.size, vis = v.vis, stripe = new THREE.Mesh(new THREE.BoxGeometry(w * 1.005, 0.2, l * 0.5), new THREE.MeshStandardMaterial({ color: 0x14367a })); stripe.position.set(0, vis.rh * -1 + 0.62, 0); vis.body.add(stripe);
    const mk = (c, x) => { const m = new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0 }), b = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.3), m); b.position.set(x, -vis.rh + h * 0.95, -0.1); vis.body.add(b); return m; };
    vis.lightR = mk(0xff1a1a, -0.3); vis.lightB = mk(0x1a3aff, 0.3);
  }

  /** Her kare: görselleri fizik anlık görüntüsüne eşitle. */
  update(dt, camera) {
    const g = this.g, p = g.physics, t = this.tmp, wt = this.wtmp, atmo = g.atmo, wl = g.ai.wanted.level; this.t += dt;
    const cx = camera.position.x, cz = camera.position.z;
    for (const v of this.vehicles) {
      p.sample(v.index, t); const dis = (t.flags & 8) !== 0, far = Math.hypot(t.px - cx, t.pz - cz) > 420;
      const show = !dis && !far; if (v.vis.root.visible !== show) { v.vis.root.visible = show; v.vis.wheels.forEach((w) => (w.visible = show)); }
      if (!show) continue;
      v.vis.root.position.set(t.px, t.py, t.pz); v.vis.root.quaternion.set(t.qx, t.qy, t.qz, t.qw);
      for (let i = 0; i < v.wheelRows.length; i++) { p.sample(v.wheelRows[i], wt); const w = v.vis.wheels[i]; w.position.set(wt.px, wt.py, wt.pz); w.quaternion.set(wt.qx, wt.qy, wt.qz, wt.qw); w.scale.y = (wt.flags & 2) ? 0.82 : 1; }
      const tl = p.tele(v.index); v.vis.setLights(tl.brake > 0.5, atmo.night); v.health = tl.health; v.speed = tl.speed; v.rpm = tl.rpm; v.gear = tl.gear; v.slip = tl.slip;
      if (v.cop && v.vis.lightR) { const on = wl > 0 && v.kind === KIND.COP && !dis, ph = Math.floor(this.t * 6) % 2; v.vis.lightR.emissiveIntensity = on && ph ? 6 : 0; v.vis.lightB.emissiveIntensity = on && !ph ? 6 : 0; }
      if (tl.health < 35 && Math.random() < dt * (tl.health < 12 ? 40 : 14)) g.fx.smoke(t.px, t.py + 0.9, t.pz, tl.health < 12);
    }
    if (this.rds) for (const rd of this.rds) { p.sample(rd.rows[0], t); const vis = !(t.flags & 8); for (let i = 0; i < rd.meshes.length; i++) { const m = rd.meshes[i]; if (m.visible !== vis) m.visible = vis; if (!vis) continue; p.sample(rd.rows[i], wt); m.position.set(wt.px, wt.py, wt.pz); m.quaternion.set(wt.qx, wt.qy, wt.qz, wt.qw); } }
    const anim = g.ai.anim;
    for (const d of this.peds) {
      p.sample(d.index, t); const dis = (t.flags & 8) !== 0, far = Math.hypot(t.px - cx, t.pz - cz) > 260, show = !dis && !far;
      if (d.human.root.visible !== show) d.human.root.visible = show; if (!show) { d.px = t.px; d.pz = t.pz; continue; }
      const sp = Math.hypot(t.px - d.px, t.pz - d.pz) / Math.max(dt, 1e-3); d.speed += (Math.min(sp, 8) - d.speed) * Math.min(1, dt * 8); d.px = t.px; d.pz = t.pz;
      d.human.root.position.set(t.px, t.py - 0.9, t.pz); d.human.root.quaternion.set(0, t.qy, 0, t.qw);
      const a = anim[d.slot] ?? 0;
      d.human.update(dt, { speed: d.speed, crouch: !!(t.flags & 2) || a === ANIM.HIDE, air: !(t.flags & 4), dead: !!(t.flags & 64), phone: a === ANIM.PHONE, gesture: a === ANIM.TALK, sprint: !!(t.flags & 128) });
    }
  }

  /** AI worker'a ajan durumlarını gönder (10 Hz). */
  pushState(player) {
    const p = this.g.physics, t = this.tmp, arr = new Float32Array((this.vehicles.length + this.peds.length) * 8); let o = 0;
    for (const v of this.vehicles) { p.sample(v.index, t); const tl = p.tele(v.index), yaw = yawOf(t), up = 1 - 2 * (t.qx * t.qx + t.qz * t.qz), sp = tl.speed; arr.set([v.slot, t.px, t.pz, yaw, sp, -Math.sin(yaw) * sp, -Math.cos(yaw) * sp, up > 0.3 && tl.health > 0 ? 1 : 0], o); o += 8; }
    for (const d of this.peds) { p.sample(d.index, t); const tl = p.charTele(d.index); arr.set([d.slot, t.px, t.pz, 2 * Math.atan2(t.qy, t.qw), 0, 0, 0, tl.dead ? 0 : 1], o); o += 8; }
    this.g.ai.state(arr, player, this.g.atmo.hour, this.g.quality.pop);
  }
  nearestDrivable(x, z, maxD) {
    let best = null, bd = maxD; const t = this.tmp;
    for (const v of this.vehicles) { if (v.kind === KIND.COP && this.g.ai.wanted.level > 0) { /* polis arabası çalınabilir */ } this.g.physics.sample(v.index, t); if (t.flags & 8) continue; const d = Math.hypot(t.px - x, t.pz - z); if (d < bd && (this.g.physics.tele(v.index).health > 0)) { bd = d; best = v; } }
    return best;
  }
}
