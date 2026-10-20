// Rapier sarmalayıcı (worker'dan bağımsız, Node'da test edilebilir):
// cisimler, karakter denetleyici, araçlar, şehir parçaları (chunk), AI kumandaları, çarpma/hasar.
import RAPIER from '@dimforge/rapier3d-compat';
import { GRAVITY, PHYSICS_DT, CHAR_GRAVITY_SCALE, AGENT_STRIDE, MAX_AGENTS } from '../config/constants.js';
import { STRIDE, TELE } from './SnapshotLayout.js';
import { MATERIALS } from './materials.js';
import { dragForce } from './aerodynamics.js';
import { fallDamage } from './fallDamage.js';
import { IN, INPUT_FLOATS, AG } from './InputLayout.js';
import { Vehicle } from './Vehicle.js';
import { VEHICLES } from './vehicleSpecs.js';
import { qrot, qaxis, qmul, qyaw } from './vec.js';
import { WEAPONS, PENETRATION } from './weapons.js';
import { RagdollPool } from './Ragdoll.js';
import { AIR_DENSITY } from '../config/constants.js';

// Karakter sabitleri (SI). Boy = 2*halfHeight + 2*radius = 1.8 m.
export const CHAR = {
  radius: 0.3, halfHeight: 0.6, crouchHalfHeight: 0.35, mass: 80,
  jog: 2.8, sprint: 5.0, crouch: 1.3,          // m/s  (10 / 18 / 4.7 km/h — gerçekçi insan hızları)
  accel: 30, decel: 38, airAccel: 4,           // m/s²
  jumpHeight: 0.8, terminalVelocity: 55,       // m, m/s
  coyote: 0.10, jumpBuffer: 0.12,
  maxClimbDeg: 45, slideDeg: 30, stepHeight: 0.35,
  staminaDrain: 0.10, staminaRegen: 0.18,      // 1/s (sprint ≈ 10 sn dayanıklılık)
};
const CROUCH_SHIFT = CHAR.halfHeight - CHAR.crouchHalfHeight;
// çarpışma grupları (üyelik << 16 | filtre)
export const G = { STATIC: 1, VEH: 2, CHAR: 4, DEBRIS: 8, RAGDOLL: 16 };
const grp = (m, f) => ((m << 16) | f) >>> 0;
const ALL = 0xffff;

export class PhysicsWorld {
  static async create(options = {}) { await RAPIER.init(); return new PhysicsWorld(options); }

  constructor({ solverIterations = 4 } = {}) {
    this.R = RAPIER;
    this.world = new RAPIER.World({ x: 0, y: -GRAVITY, z: 0 });
    this.world.timestep = PHYSICS_DT;
    const ip = this.world.integrationParameters;
    if ('numSolverIterations' in ip) ip.numSolverIterations = solverIterations;
    this.entries = new Map(); this.moving = []; this.dynamics = []; this.characters = []; this.vehicles = [];
    this.chunks = new Map(); this.colliderMaterial = new Map(); this.colliderEntry = new Map();
    this.events = []; this.time = 0; this.stepCount = 0;
    this.wind = { x: 0, y: 0, z: 0 }; this.weather = { wet: 0, rain: 0 };
    this.input = new Float32Array(INPUT_FLOATS); this.input[IN.CHAR_INDEX] = -1; this.input[IN.VEH_INDEX] = -1;
    this.agent = new Float32Array(MAX_AGENTS * AGENT_STRIDE); this.agentTele = new Int32Array(MAX_AGENTS);
    this.vehCtl = null;                  // test kancası: tüm araçlara bu kumanda
    this.driven = -1; this._f = { x: 0, y: 0, z: 0 }; this.bullets = [];
    this._standShape = new RAPIER.Capsule(CHAR.halfHeight, CHAR.radius);
    this._hullShape = new RAPIER.Cuboid(1, 0.6, 2);
    this._id = { x: 0, y: 0, z: 0, w: 1 };
    this.rayGroups = grp(G.VEH, G.STATIC | G.VEH | G.DEBRIS);
    this.env = {
      world: this.world, R: RAPIER, rayGroups: this.rayGroups, wet: 0, wind: this.wind,
      surfaceOf: (c) => this.colliderMaterial.get(c.handle) ?? 'asphalt',
      waterDepth: (x, z) => this._puddle(x, z), drowned: false,
    };
  }

  _puddle(x, z) { const w = this.weather.wet; if (w < 0.4) return 0; return Math.max(0, Math.sin(x * 0.071) * Math.sin(z * 0.093) - 0.55) * w * 0.02; }

  // ------------------------------------------------------------------ cisimler
  spawn(d) {
    const R = RAPIER, rot = d.rotation ?? [0, 0, 0, 1];
    let bd;
    if (d.kind === 'static') bd = R.RigidBodyDesc.fixed();
    else if (d.kind === 'dynamic' || d.kind === 'vehicle') bd = R.RigidBodyDesc.dynamic().setCcdEnabled(d.ccd ?? true);
    else bd = R.RigidBodyDesc.kinematicPositionBased();
    if (d.yaw !== undefined && !d.rotation) { const q = qyaw(d.yaw); rot[0] = q.x; rot[1] = q.y; rot[2] = q.z; rot[3] = q.w; }
    bd.setTranslation(d.position[0], d.position[1], d.position[2]).setRotation({ x: rot[0], y: rot[1], z: rot[2], w: rot[3] });
    if (d.linvel) bd.setLinvel(d.linvel[0], d.linvel[1], d.linvel[2]);
    if (d.kind === 'vehicle') bd.setLinearDamping(0.02).setAngularDamping(0.25);
    const body = this.world.createRigidBody(bd);
    const mat = MATERIALS[d.material ?? 'concrete'];
    const e = { index: d.index, kind: d.kind, body, drag: d.drag ?? null, material: d.material ?? 'concrete', agent: d.agent ?? -1, disabled: false, wheelRows: d.wheelRows ?? null };

    if (d.kind === 'vehicle') {
      const spec = VEHICLES[d.spec]; e.spec = spec; const h = spec.hull, m = spec.mass;
      const sz = spec.size, d2 = spec.comY * spec.comY;
      const Ix = (m / 12) * (sz.h * sz.h + sz.l * sz.l) + m * d2, Iy = (m / 12) * (sz.w * sz.w + sz.l * sz.l), Iz = (m / 12) * (sz.w * sz.w + sz.h * sz.h) + m * d2;
      const main = R.ColliderDesc.cuboid(h.hx, h.hy, h.hz).setMassProperties(m, { x: 0, y: spec.comY, z: 0 }, { x: Ix, y: Iy, z: Iz }, { x: 0, y: 0, z: 0, w: 1 })
        .setFriction(0.25).setRestitution(0.1).setCollisionGroups(grp(G.VEH, ALL));
      e.collider = this.world.createCollider(main, body);
      if (!spec.bike) {
        const ch = { hx: h.hx * 0.86, hy: sz.h * 0.17, hz: h.hz * 0.45 };
        const cab = R.ColliderDesc.cuboid(ch.hx, ch.hy, ch.hz).setTranslation(0, h.hy + ch.hy * 0.9, 0.25).setDensity(0).setFriction(0.2).setCollisionGroups(grp(G.VEH, ALL));
        this.world.createCollider(cab, body);
      }
      e.veh = new Vehicle(spec, RAPIER); e.parkT = 0;
      this.vehicles.push(e); this.moving.push(e);
    } else if (d.kind === 'character') {
      const cd = R.ColliderDesc.capsule(CHAR.halfHeight, CHAR.radius).setFriction(0).setCollisionGroups(grp(G.CHAR, G.STATIC | G.DEBRIS));
      e.collider = this.world.createCollider(cd, body);
      e.char = this._makeCharacter(body, e.collider, d.yaw ?? 0, d.health ?? 100);
      this.characters.push(e); this.moving.push(e);
    } else {
      const s = d.shape; let cd;
      if (s.type === 'box') cd = R.ColliderDesc.cuboid(s.hx, s.hy, s.hz);
      else if (s.type === 'sphere') cd = R.ColliderDesc.ball(s.r);
      else if (s.type === 'capsule') cd = R.ColliderDesc.capsule(s.halfHeight, s.radius);
      else throw new Error('Bilinmeyen şekil: ' + s.type);
      cd.setFriction(mat.muK).setRestitution(mat.restitution).setFrictionCombineRule(R.CoefficientCombineRule.Min)
        .setCollisionGroups(grp(d.kind === 'static' ? G.STATIC : G.DEBRIS, ALL));
      if (d.kind === 'dynamic') { if (d.mass) cd.setMass(d.mass); else cd.setDensity(mat.density); }
      e.collider = this.world.createCollider(cd, body);
      this.colliderMaterial.set(e.collider.handle, e.material);
      if (d.kind === 'dynamic') { this.dynamics.push(e); this.moving.push(e); }
    }
    this.colliderEntry.set(e.collider.handle, e);
    this.entries.set(d.index, e);
    return e;
  }

  _makeCharacter(body, collider, yaw, health) {
    const c = this.world.createCharacterController(0.01);
    c.setUp({ x: 0, y: 1, z: 0 }); c.setSlideEnabled(true);
    c.enableAutostep(CHAR.stepHeight, 0.2, false); c.enableSnapToGround(0.3);
    c.setMaxSlopeClimbAngle((CHAR.maxClimbDeg * Math.PI) / 180); c.setMinSlopeSlideAngle((CHAR.slideDeg * Math.PI) / 180);
    if (c.setApplyImpulsesToDynamicBodies) c.setApplyImpulsesToDynamicBodies(true);
    if (c.setCharacterMass) c.setCharacterMass(CHAR.mass);
    return { controller: c, vel: { x: 0, y: 0, z: 0 }, facing: yaw, grounded: false, crouched: false, coyote: 0, jumpBuf: 0, prevJump: false,
      health, maxHealth: health, dead: false, stamina: 1, hidden: false, invuln: 0, knock: 0, swim: false, mx: 0, mz: 0 };
  }

  remove(index) {
    const e = this.entries.get(index); if (!e) return;
    this.world.removeRigidBody(e.body); this.entries.delete(index);
    for (const list of [this.moving, this.dynamics, this.characters, this.vehicles]) { const i = list.indexOf(e); if (i >= 0) list.splice(i, 1); }
  }

  /** Şehir parçası: statik kutular. box: [cx,cy,cz,hx,hy,hz,materyal,(qx,qy,qz,qw)] */
  loadChunk(id, boxes) {
    if (this.chunks.has(id)) return;
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    const handles = [];
    for (const b of boxes) {
      const mat = MATERIALS[b[6]] ?? MATERIALS.concrete;
      const cd = RAPIER.ColliderDesc.cuboid(b[3], b[4], b[5]).setTranslation(b[0], b[1], b[2]).setFriction(mat.muK).setRestitution(mat.restitution)
        .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min).setCollisionGroups(grp(G.STATIC, ALL));
      if (b.length >= 11) cd.setRotation({ x: b[7], y: b[8], z: b[9], w: b[10] });
      const c = this.world.createCollider(cd, body); handles.push(c.handle); this.colliderMaterial.set(c.handle, b[6]);
    }
    this.chunks.set(id, { body, handles });
  }
  unloadChunk(id) {
    const ch = this.chunks.get(id); if (!ch) return;
    for (const h of ch.handles) this.colliderMaterial.delete(h);
    this.world.removeRigidBody(ch.body); this.chunks.delete(id);
  }

  /** rowsFor(k) -> 11 satır indeksi dizisi (anlık görüntü satırları) */
  initRagdolls(count, rowsFor) { this.ragdolls = new RagdollPool(this, count, rowsFor); this.ragdollEntries = []; for (let k = 0; k < count; k++) { const rd = this.ragdolls.list[k]; this.ragdollEntries.push(rd); } }
  setAgents(arr) { this.agent.set(arr.subarray(0, Math.min(arr.length, this.agent.length))); }

  setLinvel(index, v) { const e = this.entries.get(index); if (e && e.kind === 'dynamic') e.body.setLinvel({ x: v[0], y: v[1], z: v[2] }, true); }

  teleport(index, p, yaw) {
    const e = this.entries.get(index); if (!e) return;
    if (e.ragdoll && !e.ragdollOut) this.ragdolls.release(e); e.ragdollOut = false;
    e.body.setTranslation({ x: p[0], y: p[1], z: p[2] }, true);
    if (yaw !== undefined && e.kind !== 'character') { const q = qyaw(yaw); e.body.setRotation(q, true); }
    if (e.char) { e.char.vel.x = e.char.vel.y = e.char.vel.z = 0; if (yaw !== undefined) e.char.facing = yaw; }
    else { e.body.setLinvel({ x: 0, y: 0, z: 0 }, true); e.body.setAngvel({ x: 0, y: 0, z: 0 }, true); }
    if (e.veh) { for (const w of e.veh.wheels) { w.omega = 0; w.compPrev = 0; } e.veh.gear = 1; e.parkT = 0; }
  }

  setEnabled(e, on) { if (e.disabled === !on) return; e.disabled = !on; e.body.setEnabled(on); }

  // ------------------------------------------------------------------ adım
  step() {
    const dt = PHYSICS_DT, inp = this.input;
    this.env.wet = this.weather.wet; this.env.wind = this.wind;
    this._agentTeleports();
    this._enterExit();
    for (const e of this.characters) if (!e.disabled && !e.char.hidden) this._stepCharacter(e, dt);
    const vBefore = [];
    for (const e of this.vehicles) {
      if (e.disabled) { vBefore.push(null); continue; }
      const ctl = this._vehicleCtl(e);
      e.veh.abs = inp[IN.ABS] !== 0 ? inp[IN.ABS] > 0.5 : true; e.veh.tcs = inp[IN.TCS] !== 0 ? inp[IN.TCS] > 0.5 : true;
      if (e.parked && e.body.isSleeping()) { vBefore.push(null); continue; }
      const t = e.body.translation();
      this.env.drowned = false;
      e.veh.update(dt, ctl, this.env, e.body);
      const lv = e.body.linvel(); vBefore.push({ x: lv.x, y: lv.y, z: lv.z });
      if (e.parked) { if (Math.hypot(lv.x, lv.z) < 0.04 && e.veh.onGround >= 3) { if ((e.parkT += dt) > 1) e.body.sleep(); } else e.parkT = 0; }
    }
    for (const e of this.dynamics) {
      if (!e.drag || e.body.isSleeping()) continue;
      const v = e.body.linvel(); dragForce(v.x, v.y, v.z, this.wind, e.drag.cd, e.drag.area, this._f);
      e.body.resetForces(false); e.body.addForce(this._f, false);
    }
    this._stepBullets(dt); this.ragdolls?.update(dt);
    this.world.step();
    this.time += dt; this.stepCount++;
    this._postVehicles(vBefore);
    if ((this.stepCount & 3) === 0) this._vehicleHitsCharacters(dt * 4);
  }

  _vehicleCtl(e) {
    const inp = this.input;
    if (e.index === this.driven) { e.parked = false; return { throttle: inp[IN.THROTTLE], brake: inp[IN.BRAKE], steer: inp[IN.STEER], handbrake: inp[IN.HANDBRAKE] }; }
    if (this.vehCtl) { e.parked = false; if (e.body.isSleeping()) e.body.wakeUp(); return this.vehCtl; }
    if (e.agent >= 0) {
      const a = this.agent, o = e.agent * AGENT_STRIDE;
      if ((a[o + AG.FLAGS] & 1) && a[o + AG.D] < 0.5 && !(a[o + AG.FLAGS] & 4)) { e.parked = false; return { throttle: a[o + AG.A], brake: a[o + AG.B], steer: a[o + AG.C], handbrake: 0 }; }
      if (a[o + AG.FLAGS] & 4) { e.parked = true; return { throttle: 0, brake: 0, steer: 0, handbrake: 1 }; }   // park halinde (bit2)
    }
    e.parked = true; return { throttle: 0, brake: 0, steer: 0, handbrake: 1 };
  }

  _agentTeleports() {
    for (const e of this.entries.values()) {
      if (e.agent < 0) continue;
      const o = e.agent * AGENT_STRIDE, f = this.agent[o + AG.FLAGS], active = (f & 1) !== 0, counter = f >> 3;
      if (counter !== this.agentTele[e.agent]) {
        this.agentTele[e.agent] = counter;
        if (e.char) { e.char.dead = false; e.char.health = e.char.maxHealth; e.char.knock = 0; if (e.ragdoll) this.ragdolls.release(e); }
        if (e.veh) { e.veh.health = 100; for (const w of e.veh.wheels) w.flat = 0; }
        this.setEnabled(e, true);
        this.teleport(e.index, [this.agent[o + AG.X], e.kind === 'vehicle' ? 1.0 : 1.2, this.agent[o + AG.Z]], this.agent[o + AG.YAW]);
        if (e.veh) { e.body.wakeUp(); e.parkT = 0; }
      }
      if (e.index !== this.driven && e.disabled === active) this.setEnabled(e, active);
    }
  }

  _enterExit() {
    const drv = Math.round(this.input[IN.VEH_INDEX]), ci = Math.round(this.input[IN.CHAR_INDEX]);
    if (drv === this.driven) return;
    const pc = this.entries.get(ci), v = this.entries.get(drv), old = this.entries.get(this.driven);
    if (drv >= 0 && v && pc) {
      pc.char.hidden = true; this.setEnabled(pc, false); this.driven = drv; v.parked = false; if (v.body.isSleeping()) v.body.wakeUp();
    } else if (drv < 0) {
      if (old && pc) {
        const t = old.body.translation(), q = old.body.rotation();
        const r = qrot(q, { x: 1, y: 0, z: 0 }), b = qrot(q, { x: 0, y: 0, z: 1 }), sx = (old.spec.size.w / 2 + 0.9);
        const cands = [[-sx, 0], [sx, 0], [0, old.spec.size.l / 2 + 1.0], [0, -(old.spec.size.l / 2 + 1.0)]];
        let pick = null;
        for (const [a, c] of cands) {
          const p = { x: t.x + r.x * a + b.x * c, y: t.y + 0.4, z: t.z + r.z * a + b.z * c };
          if (!this.world.intersectionWithShape(p, this._id, this._standShape, undefined, grp(G.CHAR, G.STATIC | G.VEH | G.DEBRIS), old.collider, old.body)) { pick = p; break; }
        }
        pick = pick ?? { x: t.x + r.x * sx, y: t.y + 1.2, z: t.z + r.z * sx };
        pc.char.hidden = false; this.setEnabled(pc, true); this.teleport(pc.index, [pick.x, pick.y, pick.z]);
        old.parked = false;
      }
      this.driven = -1;
    }
  }

  // ------------------------------------------------------------------ karakter
  _charCtl(e) {
    const inp = this.input;
    if (e.index === Math.round(inp[IN.CHAR_INDEX]) && this.driven < 0) return { mx: inp[IN.MOVE_X], mz: inp[IN.MOVE_Z], yaw: inp[IN.YAW], sprint: inp[IN.SPRINT] > 0.5, crouch: inp[IN.CROUCH] > 0.5, jump: inp[IN.JUMP] > 0.5 };
    if (e.agent >= 0) { const o = e.agent * AGENT_STRIDE, a = this.agent; if (a[o + AG.FLAGS] & 1) return { mx: a[o + AG.A], mz: a[o + AG.B], yaw: 0, sprint: a[o + AG.C] > 0.5, crouch: a[o + AG.D] > 0.5, jump: false }; }
    return { mx: 0, mz: 0, yaw: 0, sprint: false, crouch: false, jump: false };
  }

  _canStand(e) {
    const t = e.body.translation();
    return !this.world.intersectionWithShape(t, this._id, this._standShape, undefined, grp(G.CHAR, G.STATIC | G.DEBRIS), e.collider, e.body);
  }
  _setCrouch(e, on) {
    const c = e.char; if (on === c.crouched) return;
    if (!on && !this._canStand(e)) return;
    e.collider.setHalfHeight(on ? CHAR.crouchHalfHeight : CHAR.halfHeight);
    e.collider.setTranslationWrtParent({ x: 0, y: on ? -CROUCH_SHIFT : 0, z: 0 });
    c.crouched = on;
  }

  _stepCharacter(e, dt) {
    const c = e.char, v = c.vel, ctl = this._charCtl(e), G9 = GRAVITY * CHAR_GRAVITY_SCALE;
    if (c.invuln > 0) c.invuln -= dt;
    if (c.dead) { ctl.mx = ctl.mz = 0; ctl.jump = false; }
    this._setCrouch(e, ctl.crouch && !c.dead);

    const sin = Math.sin(ctl.yaw), cos = Math.cos(ctl.yaw);
    let wx = -sin * ctl.mz + cos * ctl.mx, wz = -cos * ctl.mz - sin * ctl.mx;
    const wl = Math.hypot(wx, wz); if (wl > 1) { wx /= wl; wz /= wl; }
    // dayanıklılık: sprint harcar, dinlenince dolar
    const sprinting = ctl.sprint && wl > 0.1 && !c.crouched && c.stamina > 0.03 && c.grounded;
    c.stamina = Math.max(0, Math.min(1, c.stamina + (sprinting ? -CHAR.staminaDrain : CHAR.staminaRegen * (wl > 0.1 ? 0.6 : 1)) * dt));
    c.sprinting = sprinting;
    const top = c.crouched ? CHAR.crouch : sprinting ? CHAR.sprint : CHAR.jog;
    const tx = wx * top * (c.swim ? 0.55 : 1), tz = wz * top * (c.swim ? 0.55 : 1);
    const rate = (c.grounded || c.swim ? (wl > 0.01 ? CHAR.accel : CHAR.decel) : CHAR.airAccel) * dt;
    let dx = tx - v.x, dz = tz - v.z; const dl = Math.hypot(dx, dz);
    if (dl > rate) { dx = (dx / dl) * rate; dz = (dz / dl) * rate; }
    v.x += dx; v.z += dz;
    if (c.knock > 0) { c.knock -= dt; }

    c.coyote = c.grounded ? CHAR.coyote : Math.max(0, c.coyote - dt);
    c.jumpBuf = ctl.jump && !c.prevJump ? CHAR.jumpBuffer : Math.max(0, c.jumpBuf - dt); c.prevJump = ctl.jump;
    if (c.jumpBuf > 0 && c.coyote > 0 && !c.crouched) { v.y = Math.sqrt(2 * G9 * CHAR.jumpHeight); c.jumpBuf = 0; c.coyote = 0; }
    v.y = Math.max(v.y - G9 * dt, -CHAR.terminalVelocity);
    const vyBefore = v.y;

    const pos = e.body.translation();
    c.controller.computeColliderMovement(e.collider, { x: v.x * dt, y: v.y * dt, z: v.z * dt }, undefined, grp(G.CHAR, G.STATIC | G.DEBRIS));
    const m = c.controller.computedMovement(); const was = c.grounded; c.grounded = c.controller.computedGrounded();
    e.body.setNextKinematicTranslation({ x: pos.x + m.x, y: pos.y + m.y, z: pos.z + m.z });
    if (!c.grounded) { v.x = m.x / dt; v.z = m.z / dt; }
    if (c.grounded && v.y <= 0) v.y = 0; else if (v.y > 0 && m.y < v.y * dt - 1e-4) v.y = 0;

    if (c.grounded && !was && vyBefore < -5) {
      const energy = 0.5 * CHAR.mass * vyBefore * vyBefore, dmg = fallDamage(energy);
      this.events.push({ type: 'landed', index: e.index, speed: -vyBefore, energy, damage: dmg });
      if (dmg > 0) this.damageChar(e, dmg, 'fall', -1);
    }
    if (Math.hypot(v.x, v.z) > 0.25 && !c.dead) {
      const target = Math.atan2(-v.x, -v.z); let diff = target - c.facing; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      c.facing += diff * (1 - Math.exp(-12 * dt));
    }
  }

  damageChar(e, dmg, cause, by) {
    const c = e.char; if (c.dead || c.invuln > 0 && cause !== 'fall') return;
    c.health -= dmg; c.invuln = cause === 'vehicle' ? 0.6 : 0;
    this.events.push({ type: 'hit', index: e.index, damage: dmg, health: c.health, cause, by });
    if (c.health <= 0) { c.dead = true; c.health = 0; this.events.push({ type: 'killed', index: e.index, cause, by }); this.ragdolls?.start(e, { x: c.vel.x, y: Math.max(c.vel.y, 1), z: c.vel.z }, true); }
  }

  // ------------------------------------------------------------------ çarpma / hasar
  _postVehicles(before) {
    let i = 0;
    for (const e of this.vehicles) {
      const b = before[i++]; if (!b || e.disabled) continue;
      const lv = e.body.linvel();
      const dvx = lv.x - b.x, dvy = lv.y - b.y, dvz = lv.z - b.z, dv = Math.hypot(dvx, dvy, dvz);
      if (dv > 2.2 && this.time - (e.lastImpact ?? -1) > 0.12) {
        e.lastImpact = this.time;
        const E = 0.5 * e.spec.mass * dv * dv;
        e.veh.health = Math.max(0, e.veh.health - E / 1600);
        const q = e.body.rotation(), inv = { x: -q.x, y: -q.y, z: -q.z, w: q.w };
        const ld = qrot(inv, { x: dvx / dv, y: dvy / dv, z: dvz / dv });
        if (E > 60000 && !e.veh.wheels.some((w) => w.flat) && Math.random() < 0.4) e.veh.wheels[Math.floor(Math.random() * e.veh.wheels.length)].flat = 1;   // lastik patlaması
        this.events.push({ type: 'impact', index: e.index, energy: E, dv, lx: ld.x, ly: ld.y, lz: ld.z, health: e.veh.health, driven: e.index === this.driven });
      }
    }
  }

  _vehicleHitsCharacters() {
    for (const e of this.vehicles) {
      if (e.disabled) continue; const lv = e.body.linvel(), sp = Math.hypot(lv.x, lv.z);
      if (sp < 2.5) continue;
      const t = e.body.translation(), q = e.body.rotation(), h = e.spec.hull;
      this._hullShape.halfExtents = { x: h.hx + 0.1, y: 0.9, z: h.hz + 0.1 };
      this.world.intersectionsWithShape(t, q, new RAPIER.Cuboid(h.hx + 0.1, 0.9, h.hz + 0.1), (col) => {
        const ce = this.colliderEntry.get(col.handle);
        if (ce && ce.char && !ce.char.dead && !ce.disabled) {
          const ct = ce.body.translation(), rel = Math.hypot(lv.x, lv.z);
          const dmg = (0.5 * CHAR.mass * rel * rel) / 60;
          this.damageChar(ce, dmg, 'vehicle', e.index);
          const k = 0.8; ce.char.vel.x = lv.x * k; ce.char.vel.z = lv.z * k; ce.char.vel.y = 3; ce.char.knock = 0.6; ce.char.grounded = false;
          if (!ce.char.dead && rel > 3.5) this.ragdolls?.start(ce, { x: lv.x * 0.9, y: 3, z: lv.z * 0.9 }, false);
          this.events.push({ type: 'crash', index: ce.index, by: e.index, speed: rel, x: ct.x, z: ct.z, driven: e.index === this.driven });
        }
        return true;
      }, undefined, grp(ALL, G.CHAR));
    }
  }

  // ------------------------------------------------------------------ anlık görüntü
  _q(r) { return r; }
  captureEntry(e, out, tele) {
    const o = e.index * STRIDE; const t = e.body.translation();
    const dis = e.disabled || (e.char && e.char.hidden) ? 8 : 0;
    out[o] = t.x; out[o + 1] = t.y; out[o + 2] = t.z;
    if (e.char) {
      const c = e.char, h = c.facing * 0.5;
      out[o + 3] = 0; out[o + 4] = Math.sin(h); out[o + 5] = 0; out[o + 6] = Math.cos(h);
      out[o + 7] = (c.crouched ? 2 : 0) | (c.grounded ? 4 : 0) | dis | (c.dead ? 64 : 0) | (c.sprinting ? 128 : 0) | (c.swim ? 16 : 0);
      if (tele) { const k = e.index * TELE; tele[k + 3] = c.health; tele[k + 1] = c.stamina; tele[k + 7] = c.dead ? 1 : 0; }
    } else {
      const r = e.body.rotation();
      out[o + 3] = r.x; out[o + 4] = r.y; out[o + 5] = r.z; out[o + 6] = r.w;
      out[o + 7] = (e.body.isSleeping() ? 1 : 0) | dis;
      if (e.veh) {
        const v = e.veh;
        if (tele) { const k = e.index * TELE; tele[k] = v.rpm; tele[k + 1] = v.gear; tele[k + 2] = v.maxSlip; tele[k + 3] = v.health; tele[k + 4] = v.speed; tele[k + 5] = v.brakeLight; tele[k + 6] = v.steerAngle; }
        const rows = e.wheelRows;
        for (let i = 0; i < rows.length; i++) {
          const w = v.wheels[i], ro = rows[i] * STRIDE;
          out[ro] = w.center.x; out[ro + 1] = w.center.y; out[ro + 2] = w.center.z;
          let qq = qmul(r, qaxis(0, 1, 0, -w.steerAng)); qq = qmul(qq, qaxis(1, 0, 0, -w.spin));
          out[ro + 3] = qq.x; out[ro + 4] = qq.y; out[ro + 5] = qq.z; out[ro + 6] = qq.w; out[ro + 7] = dis | (w.flat ? 2 : 0);
        }
      }
    }
  }
  capture(out, tele) {
    for (const e of this.moving) this.captureEntry(e, out, tele);
    if (this.ragdolls) for (const rd of this.ragdolls.list) for (let i = 0; i < rd.bodies.length; i++) {
      const b = rd.bodies[i], o = rd.rows[i] * STRIDE, t = b.translation(), r = b.rotation();
      out[o] = t.x; out[o + 1] = t.y; out[o + 2] = t.z; out[o + 3] = r.x; out[o + 4] = r.y; out[o + 5] = r.z; out[o + 6] = r.w; out[o + 7] = rd.active ? 0 : 8;
    }
  }

  computeEnergy() {
    let ke = 0, pe = 0, awake = 0;
    for (const e of this.dynamics) { const m = e.body.mass(), v = e.body.linvel(); ke += 0.5 * m * (v.x * v.x + v.y * v.y + v.z * v.z); pe += m * GRAVITY * e.body.translation().y; if (!e.body.isSleeping()) awake++; }
    return { ke, pe, awake };
  }
  // ------------------------------------------------------------------ balistik
  /** f: {weapon, ox,oy,oz, dx,dy,dz, shooter(index)}. Mermi: yerçekimi + hava direnci + rüzgar; malzemeye göre delme/seken/durma. */
  fire(f) {
    const W = WEAPONS[f.weapon]; if (!W) return; const shooter = this.entries.get(f.shooter);
    const L = Math.hypot(f.dx, f.dy, f.dz) || 1;
    for (let i = 0; i < W.pellets; i++) {
      let dx = f.dx / L, dy = f.dy / L, dz = f.dz / L; const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * W.spread;
      // dağılım konisi: dik iki eksende rastgele sapma
      const ux = Math.abs(dy) < 0.9 ? { x: -dz, y: 0, z: dx } : { x: 1, y: 0, z: 0 }, ul = Math.hypot(ux.x, ux.y, ux.z) || 1, u = { x: ux.x / ul, y: ux.y / ul, z: ux.z / ul };
      const w = { x: dy * u.z - dz * u.y, y: dz * u.x - dx * u.z, z: dx * u.y - dy * u.x };
      dx += (u.x * Math.cos(a) + w.x * Math.sin(a)) * r; dy += (u.y * Math.cos(a) + w.y * Math.sin(a)) * r; dz += (u.z * Math.cos(a) + w.z * Math.sin(a)) * r; const n = Math.hypot(dx, dy, dz);
      this.bullets.push({ x: f.ox, y: f.oy, z: f.oz, vx: (dx / n) * W.v0, vy: (dy / n) * W.v0, vz: (dz / n) * W.v0, W, shooter, life: 8, bounces: 0 });
    }
    // geri tepme: momentum korunumu (mermi + gaz ≈ 1.5×) — karakter hızına yansır
    if (shooter?.char) { const p = W.mass * W.v0 * 1.5 * W.pellets, dvv = p / (CHAR.mass + W.gunMass); shooter.char.vel.x -= (f.dx / L) * dvv; shooter.char.vel.z -= (f.dz / L) * dvv; }
    this.events.push({ type: 'shot', weapon: f.weapon, x: f.ox, y: f.oy, z: f.oz });
  }
  _stepBullets(dt) {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i]; b.life -= dt; if (b.life <= 0) { this.bullets.splice(i, 1); continue; }
      const rx = b.vx - this.wind.x, ry = b.vy - this.wind.y, rz = b.vz - this.wind.z, sp = Math.hypot(rx, ry, rz), k = -0.5 * AIR_DENSITY * b.W.cd * b.W.area * sp / b.W.mass;
      b.vx += k * rx * dt; b.vy += (k * ry - GRAVITY) * dt; b.vz += k * rz * dt;
      const sx = b.vx * dt, sy = b.vy * dt, sz = b.vz * dt, len = Math.hypot(sx, sy, sz);
      const dir = { x: sx / len, y: sy / len, z: sz / len }, hit = this.world.castRayAndGetNormal(new RAPIER.Ray({ x: b.x, y: b.y, z: b.z }, dir), len, true, undefined, undefined, undefined, b.shooter?.body);
      if (!hit) { b.x += sx; b.y += sy; b.z += sz; if (b.y < -20) this.bullets.splice(i, 1); continue; }
      const toi = hit.timeOfImpact ?? hit.toi, hp = { x: b.x + dir.x * toi, y: b.y + dir.y * toi, z: b.z + dir.z * toi }, e = this.colliderEntry.get(hit.collider.handle), n = hit.normal;
      const E = 0.5 * b.W.mass * (b.vx * b.vx + b.vy * b.vy + b.vz * b.vz);
      if (e && e.char) {
        const head = hp.y > e.body.translation().y + (e.char.crouched ? 0.1 : 0.5), dmg = (E / 24) * (head ? 2.2 : 1);
        this.damageChar(e, dmg, 'bullet', b.shooter?.index ?? -1); this.events.push({ type: 'bulletHit', x: hp.x, y: hp.y, z: hp.z, target: 'char', head, dmg });
        e.char.vel.x += dir.x * 1.2; e.char.vel.z += dir.z * 1.2; this.bullets.splice(i, 1); continue;
      }
      if (e && e.veh) { e.veh.health = Math.max(0, e.veh.health - E / 140); e.body.applyImpulseAtPoint({ x: dir.x * b.W.mass * Math.hypot(b.vx, b.vy, b.vz), y: dir.y * b.W.mass * Math.hypot(b.vx, b.vy, b.vz), z: dir.z * b.W.mass * Math.hypot(b.vx, b.vy, b.vz) }, hp, true); if (Math.random() < 0.12) e.veh.wheels[Math.floor(Math.random() * e.veh.wheels.length)].flat = 1; this.events.push({ type: 'bulletHit', x: hp.x, y: hp.y, z: hp.z, target: 'vehicle' }); this.bullets.splice(i, 1); continue; }
      if (e && e.kind === 'dynamic') { const m = Math.hypot(b.vx, b.vy, b.vz) * b.W.mass; e.body.applyImpulseAtPoint({ x: dir.x * m, y: dir.y * m, z: dir.z * m }, hp, true); }
      const mat = this.colliderMaterial.get(hit.collider.handle) ?? 'concrete';
      // seken: sert malzemede sığ açı
      const cosI = Math.abs(dir.x * n.x + dir.y * n.y + dir.z * n.z);
      if ((mat === 'metal' || mat === 'concrete' || mat === 'asphalt') && cosI < 0.26 && b.bounces < 2) {
        const d2 = 2 * (dir.x * n.x + dir.y * n.y + dir.z * n.z), vs = Math.hypot(b.vx, b.vy, b.vz) * 0.45; b.bounces++;
        b.vx = (dir.x - d2 * n.x) * vs; b.vy = (dir.y - d2 * n.y) * vs; b.vz = (dir.z - d2 * n.z) * vs; b.x = hp.x + n.x * 0.02; b.y = hp.y + n.y * 0.02; b.z = hp.z + n.z * 0.02;
        this.events.push({ type: 'bulletHit', x: hp.x, y: hp.y, z: hp.z, target: 'ricochet', mat }); continue;
      }
      // delme: kalınlık = çıkış ışınıyla; ΔE = σ·A·kalınlık
      const back = this.world.castRay(new RAPIER.Ray({ x: hp.x + dir.x * 1.5, y: hp.y + dir.y * 1.5, z: hp.z + dir.z * 1.5 }, { x: -dir.x, y: -dir.y, z: -dir.z }), 1.5, false);
      const thick = back ? 1.5 - (back.timeOfImpact ?? back.toi) : 1.5, loss = (PENETRATION[mat] ?? 1.6e8) * b.W.area * thick;
      this.events.push({ type: 'bulletHit', x: hp.x, y: hp.y, z: hp.z, target: 'world', mat, penetrated: E > loss });
      if (E > loss && thick < 1.5) { const vs = Math.sqrt((2 * (E - loss)) / b.W.mass), v0 = Math.hypot(b.vx, b.vy, b.vz); b.vx *= vs / v0; b.vy *= vs / v0; b.vz *= vs / v0; b.x = hp.x + dir.x * (thick + 0.02); b.y = hp.y + dir.y * (thick + 0.02); b.z = hp.z + dir.z * (thick + 0.02); } else this.bullets.splice(i, 1);
    }
  }

  /** Patlama: tnt (kg TNT eşdeğeri). Aşırı basınç Kinney-Graham: P(Z), Z = R / tnt^(1/3). Cisimlere itme, karakterlere hasar. */
  explode(x, y, z, tnt) {
    const c3 = Math.cbrt(tnt), over = (R) => { const Z = Math.max(R, 0.5) / c3; return 101.325 * 808 * (1 + (Z / 4.5) ** 2) / Math.sqrt(1 + (Z / 0.048) ** 2) / Math.sqrt(1 + (Z / 0.32) ** 2) / Math.sqrt(1 + (Z / 1.35) ** 2); };   // kPa (Ps/Pa × 101.3)
    for (const e of this.entries.values()) {
      if (e.disabled || e.kind === 'static') continue; const t = e.body.translation(), dx = t.x - x, dy = t.y - y, dz = t.z - z, R = Math.hypot(dx, dy, dz); if (R > 60) continue;
      const P = over(R);
      if (e.char) { if (P > 8) { this.damageChar(e, P * 1.1, 'explosion', -1); e.char.vel.x += (dx / R) * P * 0.12; e.char.vel.z += (dz / R) * P * 0.12; e.char.vel.y = Math.max(e.char.vel.y, 4); e.char.knock = 0.8; } }
      else { const A = e.veh ? 6 : 2, J = P * 1000 * A * 0.004 * c3; e.body.applyImpulse({ x: (dx / R) * J, y: (dy / R) * J + J * 0.35, z: (dz / R) * J }, true); if (e.veh) e.veh.health = Math.max(0, e.veh.health - P * 0.6); }
    }
    this.events.push({ type: 'explosion', x, y, z, tnt });
  }
  debugRender() { return this.world.debugRender(); }
}
