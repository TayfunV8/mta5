// Oyuncu: yaya hareketi, araç sürme, araca bin/in (E), kamera, silah girişi, ölüm/yeniden doğuş. İki karakter (Lucia/Jason).
import { IN } from '../physics/InputLayout.js';
import { LOOKS } from '../render/Humanoid.js';
import { KIND } from '../ai/AiCore.js';
import { rideHeight } from '../render/VehicleModels.js';

export const SPAWN = { x: 0, y: 1.3, z: 36 };
export class Player {
  constructor(g) {
    this.g = g; this.mode = 'foot'; this.veh = null; this.active = 'lucia'; this.pos = { x: SPAWN.x, y: SPAWN.y, z: SPAWN.z }; this.speed = 0; this.yaw = 0;
    this.stepT = 0; this.weapon = 0; this.dead = false; this.deadT = 0; this.tmp = {}; this.chars = {}; this.last = { x: 0, z: 0 }; this.health = 100; this.stamina = 1; this.hornT = 0; this.fireT = 0; this.wasGrounded = true; this.burn = 0;
  }
  create() {
    const p = this.g.pop; this.chars.lucia = p.makeChar(LOOKS.lucia); this.chars.jason = p.makeChar(LOOKS.jason);
    this.g.physics.teleport(this.chars.lucia.index, [SPAWN.x, SPAWN.y, SPAWN.z]); this.g.physics.teleport(this.chars.jason.index, [SPAWN.x + 4, SPAWN.y, SPAWN.z + 1]);
    this.chars.lucia.name = 'LUCIA'; this.chars.jason.name = 'JASON'; this.g.physics.input[IN.CHAR_INDEX] = this.char.index;
    this.g.interaction.addProvider((px, pz) => this._interactables(px, pz));
  }
  get char() { return this.chars[this.active]; }
  get other() { return this.chars[this.active === 'lucia' ? 'jason' : 'lucia']; }

  _interactables(px, pz) {
    const g = this.g, out = [];
    if (g.paused || this.dead) return out;
    if (this.mode === 'vehicle') { out.push({ id: 'exit', pos: { x: px, z: pz }, radius: 1, prompt: 'E — Araçtan in', onUse: () => this.exitVehicle() }); return out; }
    const v = g.pop.nearestDrivable(px, pz, 3.6);
    if (v) { g.physics.sample(v.index, this.tmp); out.push({ id: 'veh' + v.slot, pos: { x: this.tmp.px, z: this.tmp.pz }, radius: 3.6, prompt: `E — ${v.vis.spec.label} sür`, onUse: () => this.enterVehicle(v) }); }
    return out;
  }

  enterVehicle(v) {
    const g = this.g; if (this.mode === 'vehicle') return; this.mode = 'vehicle'; this.veh = v;
    g.physics.input[IN.VEH_INDEX] = v.index; g.physics.flushInput(); g.ai.setKind(v.slot, KIND.PLAYER);
    const h = this.char.human, bike = v.spec === 'bike'; v.vis.root.add(h.root); h.root.position.set(bike ? 0 : -0.4, -v.vis.rh + (bike ? 0.12 : 0.1), bike ? 0.15 : 0.12); h.root.quaternion.identity(); h.root.rotation.y = 0; h.state.sit = 1;
    g.rig.setMode('vehicle'); g.hud.showSpeedo(true); g.audio?.click();
    if (v.cop) g.ai.event({ type: 'crime', crime: 2.5, x: this.pos.x, z: this.pos.z });       // polis aracı çalma
    this.stolenT = 0;
  }
  exitVehicle() {
    const g = this.g, v = this.veh; if (!v) return; this.mode = 'foot'; this.veh = null;
    g.physics.input[IN.VEH_INDEX] = -1; g.physics.input[IN.THROTTLE] = 0; g.physics.input[IN.BRAKE] = 0; g.physics.flushInput(); g.ai.setKind(v.slot, KIND.PARKED);
    const h = this.char.human; g.renderer.scene.add(h.root); h.state.sit = 0; g.rig.setMode('foot'); g.hud.showSpeedo(false);
  }
  exitVehicleInstant() { if (this.mode === 'vehicle') this.exitVehicle(); }

  switchChar() {
    if (this.mode === 'vehicle' || this.dead) return; const g = this.g;
    this.active = this.active === 'lucia' ? 'jason' : 'lucia'; g.physics.input[IN.CHAR_INDEX] = this.char.index; g.physics.flushInput();
    g.hud.setChar(this.char.name); g.hud.toast('Karakter: ' + this.char.name); g.audio?.click();
  }

  update(dt) {
    const g = this.g, k = g.input, ph = g.physics, a = ph.input, t = this.tmp, rig = g.rig;
    if (g.paused || !g.started) {
      a[IN.MOVE_X] = a[IN.MOVE_Z] = a[IN.THROTTLE] = a[IN.BRAKE] = a[IN.STEER] = a[IN.HANDBRAKE] = a[IN.JUMP] = a[IN.SPRINT] = 0; ph.flushInput();
      const c0 = this.char; ph.sample(c0.index, this.tmp); this.pos.x = this.tmp.px; this.pos.y = this.tmp.py; this.pos.z = this.tmp.pz;
      if (!g.started) { rig.update(dt, this.pos, 0, undefined, false); this._visuals(dt, this.tmp, ph.charTele(c0.index)); }
      return;
    }
    if (g.input.locked) rig.rotate(k.mouseDX, k.mouseDY);
    const ch = this.char, ct = ph.charTele(ch.index); this.health = ct.health; this.stamina = ct.stamina;
    ph.sample(ch.index, t); const inVeh = this.mode === 'vehicle';
    let vtmp = null;
    if (inVeh) { vtmp = {}; ph.sample(this.veh.index, vtmp); this.pos.x = vtmp.px; this.pos.y = vtmp.py; this.pos.z = vtmp.pz; }
    else { this.pos.x = t.px; this.pos.y = t.py; this.pos.z = t.pz; if ((t.flags & 8) && g.pop.ragdollPos(ch.index, this.rpos ??= {})) { this.pos.x = this.rpos.x; this.pos.y = this.rpos.y; this.pos.z = this.rpos.z; } }

    // ---- ölüm / yeniden doğma
    if (!this.dead && ct.health <= 0) { this.dead = true; this.deadT = 0; g.menus.death('ÖLDÜN'); if (inVeh) this.exitVehicle(); g.audio?.crash(100000); }
    if (this.dead) { this.deadT += dt; a[IN.MOVE_X] = a[IN.MOVE_Z] = 0; ph.flushInput(); if (this.deadT > 3.2) this.respawn(); this._visuals(dt, t, ct); return; }

    const w = k.down('KeyW') ? 1 : 0, s = k.down('KeyS') ? 1 : 0, d = k.down('KeyD') ? 1 : 0, aa = k.down('KeyA') ? 1 : 0;
    if (!inVeh) {
      a[IN.MOVE_X] = d - aa; a[IN.MOVE_Z] = w - s; a[IN.YAW] = rig.yaw; a[IN.SPRINT] = k.down('ShiftLeft') ? 1 : 0; a[IN.CROUCH] = k.down('KeyC') ? 1 : 0; a[IN.JUMP] = k.down('Space') ? 1 : 0;
      a[IN.THROTTLE] = a[IN.BRAKE] = a[IN.STEER] = a[IN.HANDBRAKE] = 0;
      if (k.wasPressed('KeyF')) g.hud.toast('Telefon: (yakında) — görevler için Esc > Görevler');
    } else {
      a[IN.MOVE_X] = a[IN.MOVE_Z] = a[IN.JUMP] = a[IN.SPRINT] = 0; a[IN.THROTTLE] = w; a[IN.BRAKE] = s; a[IN.STEER] = d - aa; a[IN.HANDBRAKE] = k.down('Space') ? 1 : 0;
      if (k.wasPressed('KeyC')) { const cur = rig.baseDist; rig.baseDist = cur > 4.5 ? 2.4 : cur < 3 ? 3.6 : 6; }
      if (k.wasPressed('KeyF')) { g.audio?.honk(); this.hornT = 0.4; }
      if (k.wasPressed('KeyT')) a[IN.TCS] = a[IN.TCS] > 0.5 ? 0.0001 : 1; if (k.wasPressed('KeyY')) a[IN.ABS] = a[IN.ABS] > 0.5 ? 0.0001 : 1;
    }
    ph.flushInput();
    if (k.wasPressed('Tab')) this.switchChar();
    if (g.interaction.current && k.wasPressed('KeyE')) g.interaction.use({});

    // ---- hız, adım sesleri, iniş
    const dx = this.pos.x - this.last.x, dz = this.pos.z - this.last.z; this.last.x = this.pos.x; this.last.z = this.pos.z;
    const sp = Math.hypot(dx, dz) / Math.max(dt, 1e-3); this.speed += (Math.min(sp, 90) - this.speed) * Math.min(1, dt * 8);
    if (!inVeh) {
      const gr = (t.flags & 4) !== 0; this.stepT -= dt;
      if (gr && this.speed > 0.6 && this.stepT <= 0) { this.stepT = Math.max(0.24, 0.62 - this.speed * 0.07); g.audio?.footstep(this.speed > 3.5, 'concrete'); }
      if (!this.wasGrounded && gr) g.audio?.land(2); this.wasGrounded = gr;
      if (k.wasPressed('Space') && gr && !k.down('KeyC')) g.audio?.jump();
    }
    // ---- silah girişi (Weapons modülü varsa)
    g.weapons?.update(dt, inVeh);
    // ---- araç yanıyor: patlama
    if (this.veh && this.mode === 'vehicle' && this.veh.health !== undefined && this.veh.health <= 0) { this.burn += dt; if (this.burn > 4) { this.burn = 0; g.explode(vtmp.px, vtmp.py, vtmp.pz, 80); this.exitVehicle(); g.physics.damage(this.char.index, 75, 'explosion'); } } else this.burn = 0;

    this._visuals(dt, t, ct, vtmp);
    // ---- kamera
    const aim = !inVeh && g.input.mouseRight && this.weapon > 0;
    let vyaw; if (inVeh) vyaw = Math.atan2(2 * (vtmp.qw * vtmp.qy + vtmp.qx * vtmp.qz), 1 - 2 * (vtmp.qx * vtmp.qx + vtmp.qy * vtmp.qy));
    this.yaw = rig.yaw; rig.update(dt, this.pos, this.speed, vyaw, aim);
    this.aiming = aim;
  }

  _visuals(dt, t, ct, vtmp) {
    const g = this.g, inVeh = this.mode === 'vehicle';
    for (const key of ['lucia', 'jason']) {
      const c = this.chars[key], isA = key === this.active; g.physics.sample(c.index, this.tmp2 ??= {}); const s = this.tmp2, hid = (s.flags & 8) !== 0;
      if (inVeh && isA) { c.human.update(dt, { sit: true, speed: 0 }); c.human.root.visible = !g.rig.headHidden || true; continue; }
      c.human.root.visible = !hid && !(isA && g.rig.headHidden && !this.dead);
      const sp = Math.hypot(s.px - c.px, s.pz - c.pz) / Math.max(dt, 1e-3); c.speed += (Math.min(sp, 9) - c.speed) * Math.min(1, dt * 8); c.px = s.px; c.pz = s.pz;
      c.human.root.position.set(s.px, s.py - 0.9, s.pz); c.human.root.quaternion.set(0, s.qy, 0, s.qw);
      c.human.update(dt, { speed: c.speed, crouch: !!(s.flags & 2), air: !(s.flags & 4), dead: !!(s.flags & 64), aim: isA && this.aiming, weapon: isA ? this.weapon : 0, sprint: !!(s.flags & 128) });
    }
  }

  respawn() {
    const g = this.g; this.dead = false; g.menus.clearDeath(); g.physics.heal(this.char.index, 100); g.physics.teleport(this.char.index, [SPAWN.x, SPAWN.y, SPAWN.z]);
    g.state.money = Math.max(0, g.state.money - 100); g.hud.toast('Hastanede uyandın. -$100'); g.ai.worker.postMessage({ type: 'wanted', heat: 0 });
  }
}
