// Kara aracı: kendi raycast süspansiyonu + Pacejka lastik + motor/kavrama/şanzıman/diferansiyel + ABS/TCS.
// Rapier sadece gövdeyi (rigid body) ve çarpışmayı çözer; tekerlek kuvvetleri burada hesaplanır.
import { GRAVITY, AIR_DENSITY } from '../config/constants.js';
import { MATERIALS } from './materials.js';
import { combinedSlip, aquaplaning, TIRE_DEFAULT } from './tire.js';
import { qrot, clamp, dot, cross, qaxis, qmul } from './vec.js';

const RPM2RAD = Math.PI / 30;
const ETA = 0.92;         // aktarma verimi

function curve(c, rpm) {
  if (rpm <= c[0][0]) return c[0][1];
  for (let i = 1; i < c.length; i++) if (rpm <= c[i][0]) { const t = (rpm - c[i - 1][0]) / (c[i][0] - c[i - 1][0]); return c[i - 1][1] + (c[i][1] - c[i - 1][1]) * t; }
  return 0;
}

export class Vehicle {
  constructor(spec, R) {
    this.spec = spec; this.R = R;
    const mc = spec.mass / spec.wheels.length;
    const wn = 2 * Math.PI * spec.suspFreq;
    this.k = mc * wn * wn; this.c = 2 * spec.zeta * Math.sqrt(this.k * mc);
    this.mc = mc;
    this.tire = { ...TIRE_DEFAULT, ...(spec.tire ?? {}) };
    this.wheels = spec.wheels.map((w) => ({ ...w, omega: 0, spin: 0, comp: 0, compPrev: 0, contact: false, Fz: 0, kappa: 0, absRel: 1, flat: 0, center: { x: 0, y: 0, z: 0 }, steerAng: 0, slip: 0 }));
    this.gear = 1; this.engOmega = spec.engine.idle * RPM2RAD; this.shiftT = 0; this.steerAngle = 0;
    this.abs = true; this.tcs = true; this.rpm = spec.engine.idle; this.speed = 0; this.maxSlip = 0; this.health = 100;
    this.brakeLight = 0; this.lean = 0; this.leanRate = 0; this.tcsCut = 1; this._o = { fx: 0, fy: 0 }; this._o2 = { fx: 0, fy: 0 };
    this.onGround = 0;
  }

  /** ctl: {throttle, brake, steer, handbrake}; env: {world, wet, wind, surfaceOf(collider), waterDepth(x,z), drowned, rayGroups} */
  update(dt, ctl, env, body) {
    const spec = this.spec, world = env.world, R = this.R;
    const t = body.translation(), q = body.rotation(), lv = body.linvel(), av = body.angvel(), com = body.worldCom();
    const right = qrot(q, { x: 1, y: 0, z: 0 }), up = qrot(q, { x: 0, y: 1, z: 0 }), fwd = qrot(q, { x: 0, y: 0, z: -1 });
    const vF = dot(lv, fwd); this.speed = vF;
    body.resetForces(true); body.resetTorques(true);

    // ---- kumanda ve yön mantığı (S: önce fren, durunca geri vites)
    let thr = clamp(ctl.throttle, 0, 1), brk = clamp(ctl.brake, 0, 1); const hb = ctl.handbrake > 0.5;
    if (env.drowned) thr = 0;
    if (this.health <= 0) thr = 0;
    if (this.gear > 0 && brk > 0.05 && thr < 0.05 && vF < 0.7) this.gear = -1;
    else if (this.gear < 0 && thr > 0.05 && brk < 0.05 && vF > -0.7) this.gear = 1;
    const drive = this.gear < 0 ? brk : thr, brake = this.gear < 0 ? thr : brk;
    this.brakeLight = brake > 0.05 || hb ? 1 : 0;

    // ---- direksiyon: hıza duyarlı açı, sınırlı dönme hızı
    const maxSt = spec.steerMax / (1 + Math.abs(vF) / spec.steerSpeedScale);
    const target = clamp(ctl.steer, -1, 1) * maxSt;
    const rate = 2.2 * dt;
    this.steerAngle += clamp(target - this.steerAngle, -rate, rate);

    // ---- 1. geçiş: raycast + süspansiyon
    const down = { x: -up.x, y: -up.y, z: -up.z };
    const L0 = spec.L0, ws = this.wheels;
    let contacts = 0;
    for (const w of ws) {
      const Rw = w.radius * (1 - 0.15 * w.flat);
      const m = qrot(q, { x: w.x, y: w.y, z: w.z });
      const origin = { x: t.x + m.x, y: t.y + m.y, z: t.z + m.z };
      w.origin = origin;
      const hit = world.castRayAndGetNormal(new R.Ray(origin, down), L0 + Rw, true, undefined, env.rayGroups, undefined, body);
      w.contact = !!hit;
      if (hit) {
        const toi = hit.timeOfImpact ?? hit.toi;
        const dist = toi - Rw;
        const x = L0 - dist;
        const xdot = (x - w.compPrev) / dt;
        let Fs = this.k * x + this.c * (xdot > 0 ? xdot : xdot * 0.6);
        const travel = L0 * 0.9; if (x > travel) Fs += this.k * 12 * (x - travel);
        w.comp = x; w.compPrev = x; w.Fz = Math.max(0, Fs);
        w.n = hit.normal; w.P = { x: origin.x + down.x * toi, y: origin.y + down.y * toi, z: origin.z + down.z * toi };
        w.collider = hit.collider;
        w.center = { x: origin.x + down.x * dist, y: origin.y + down.y * dist, z: origin.z + down.z * dist };
        contacts++;
      } else {
        w.comp = 0; w.compPrev = 0; w.Fz = 0;
        w.center = { x: origin.x + down.x * L0, y: origin.y + down.y * L0, z: origin.z + down.z * L0 };
      }
    }
    this.onGround = contacts;

    // anti-roll: aynı aksın iki tekerleği arasındaki sıkışma farkı yük aktarır
    if (!spec.bike) for (const a of ws) if (a.side < 0) { const b = ws.find((o) => o.side > 0 && o.z === a.z); if (b) { const d = (a.comp - b.comp) * spec.arb; if (a.contact) a.Fz = Math.max(0, a.Fz + d); if (b.contact) b.Fz = Math.max(0, b.Fz - d); } }

    // ---- motor / kavrama / şanzıman
    // Kilitli aktarma: motor devri tekerlek devrinden türer (ω_e = ω_in). Kalkışta kavrama patinajı: motor
    // ω_launch devrinde sabit tutulur. Motorun atalet momenti tekerleklere yansıtılır (I_e·oran²).
    const e = spec.engine;
    const total = (this.gear > 0 ? spec.gears[this.gear - 1] : spec.reverseRatio) * spec.final * (this.gear < 0 ? -1 : 1);
    let wd = 0, sh = 0; for (const w of ws) if (w.axleShare > 0) { wd += w.omega * w.axleShare; sh += w.axleShare; }
    const omegaIn = Math.abs(total) * (sh ? Math.abs(wd / sh) : 0) * Math.sign(total * (sh ? wd / sh : 0) || 1);
    const omegaLaunch = (e.idle + (e.shiftDown + 400 - e.idle) * Math.min(1, drive * 1.2)) * RPM2RAD;
    const slipping = Math.abs(omegaIn) < omegaLaunch && this.shiftT <= 0;
    this.engOmega = this.shiftT > 0 ? Math.max(Math.abs(omegaIn), e.idle * RPM2RAD) : slipping ? omegaLaunch : Math.abs(omegaIn);
    this.engOmega = clamp(this.engOmega, e.idle * RPM2RAD * 0.9, e.redline * RPM2RAD * 1.1);
    this.rpm = this.engOmega / RPM2RAD;
    let Te = curve(e.curve, this.rpm) * drive * this.tcsCut;
    if (!slipping) Te -= (1 - drive) * e.brake * (this.rpm / e.redline) * 3;     // motor freni
    if (this.rpm > e.redline) Te = Math.min(Te, 0);
    if (this.shiftT > 0) { Te = 0; this.shiftT -= dt; }
    if (this.shiftT <= 0 && this.gear > 0) {
      if (this.rpm > e.shiftUp && this.gear < spec.gears.length && drive > 0.15) { this.gear++; this.shiftT = 0.2; }
      else if (this.rpm < e.shiftDown && this.gear > 1 && !slipping) { this.gear--; this.shiftT = 0.12; }
      else if (drive > 0.7 && this.gear > 1 && !slipping && curve(e.curve, this.rpm) < 0.72 * spec.peakTorque &&
               this.rpm * spec.gears[this.gear - 2] / spec.gears[this.gear - 1] < e.shiftUp * 0.9 &&
               curve(e.curve, this.rpm * spec.gears[this.gear - 2] / spec.gears[this.gear - 1]) > 1.15 * curve(e.curve, this.rpm)) { this.gear--; this.shiftT = 0.12; }   // kick-down (tork belirgin artıyorsa)
    }
    const Tdrv = Te * total * ETA;
    this.dbg = { Te, Tdrv, slipping, drive, total, omegaIn };
    const Iref = slipping || this.shiftT > 0 ? 0 : e.inertia * total * total * ETA;      // yansıtılan motor ataleti
    // diferansiyel: eksen payı + sol/sağ bağlama torku
    const axle = (front) => ws.filter((w) => w.front === front);
    const wheelT = new Map();
    for (const front of [true, false]) {
      const pair = axle(front), share = pair[0]?.axleShare ?? 0; if (!share) { pair.forEach((w) => wheelT.set(w, 0)); continue; }
      const Ta = Tdrv * share;
      if (pair.length === 1) { wheelT.set(pair[0], Ta); continue; }
      const [a, b] = pair; let k = 0, lim = 0;
      if (spec.diff === 'lsd') { k = 120; lim = 250 + 0.4 * Math.abs(Ta); } else if (spec.diff === 'locked') { k = 600; lim = 4000; }
      const tc = clamp(k * (b.omega - a.omega), -lim, lim);
      wheelT.set(a, Ta / 2 + tc); wheelT.set(b, Ta / 2 - tc);
    }

    // ---- 2. geçiş: lastik kuvvetleri
    let maxSlip = 0, maxKappaDrive = 0;
    const o = this._o, o2 = this._o2;
    for (const w of ws) {
      const Rw = w.radius * (1 - 0.15 * w.flat);
      const steer = w.steer ? this.steerAngle : 0; w.steerAng = steer;
      if (!w.contact) { w.omega += (dt / w.I) * ((wheelT.get(w) ?? 0) * 0.2); w.spin += w.omega * dt; w.slip = 0; continue; }
      const n = w.n;
      // tekerlek yönü: araç ileri vektörü direksiyon açısıyla döndürülür, zemine izdüşürülür
      const cs = Math.cos(steer), sn = Math.sin(steer);
      let f = { x: fwd.x * cs + right.x * sn, y: fwd.y * cs + right.y * sn, z: fwd.z * cs + right.z * sn };
      const fn = dot(f, n); f = { x: f.x - n.x * fn, y: f.y - n.y * fn, z: f.z - n.z * fn };
      const fl = Math.hypot(f.x, f.y, f.z) || 1; f = { x: f.x / fl, y: f.y / fl, z: f.z / fl };
      const s = cross(f, n);
      const rr = { x: w.P.x - com.x, y: w.P.y - com.y, z: w.P.z - com.z };
      const vp = { x: lv.x + av.y * rr.z - av.z * rr.y, y: lv.y + av.z * rr.x - av.x * rr.z, z: lv.z + av.x * rr.y - av.y * rr.x };
      const vlong = dot(vp, f), vlat = dot(vp, s);
      // yüzey sürtünmesi (kuru/ıslak karışımı), kaçak lastik, aquaplaning
      const name = env.surfaceOf(w.collider);
      const base = MATERIALS[name] ?? MATERIALS.asphalt, wetM = MATERIALS.wet_asphalt;
      const paved = name === 'asphalt' || name === 'concrete';
      let muS = base.muS, muK = base.muK, rrc = base.rr;
      if (paved && env.wet > 0) { muS += (wetM.muS - muS) * env.wet; muK += (wetM.muK - muK) * env.wet; }
      muS *= spec.tireMu; muK *= spec.tireMu;
      if (w.flat) { muS *= 0.55; muK *= 0.55; rrc += 0.04; }
      const ap = aquaplaning(Math.hypot(vp.x, vp.z), env.waterDepth ? env.waterDepth(w.P.x, w.P.z) : 0, this.tire.pressurePsi);
      muS *= ap; muK *= ap;

      const vden = Math.max(Math.abs(vlong), 3.5);
      const kappa = (w.omega * Rw - vlong) / vden, tanA = vlat / vden; w.kappa = kappa;
      combinedSlip(kappa, tanA, w.Fz, muS, muK, this.tire, o);
      let Fx = o.fx, Fy = -o.fy;
      // yerçekimi başına kararlılık: kuvvet, hızı sıfırı aşacak şekilde değiştirmemeli (köşe kütlesi)
      const lim = (this.mc * 0.9) / dt;
      const Tdr0 = wheelT.get(w) ?? 0;
      if (Fx * vlong < 0 && Math.abs(Tdr0) < 1) Fx = clamp(Fx, -lim * Math.abs(vlong), lim * Math.abs(vlong));   // sadece frenleme/serbest yuvarlanmada
      Fy = clamp(Fy, -lim * Math.abs(vlat), lim * Math.abs(vlat));
      // yuvarlanma direnci
      const Frr = -rrc * w.Fz * Math.tanh(vlong / 0.5);
      const Fvec = { x: f.x * (Fx + Frr) + s.x * Fy, y: f.y * (Fx + Frr) + s.y * Fy, z: f.z * (Fx + Frr) + s.z * Fy };
      body.addForceAtPoint(Fvec, w.P, true);
      body.addForceAtPoint({ x: up.x * w.Fz, y: up.y * w.Fz, z: up.z * w.Fz }, w.center, true);

      // tekerlek dönüşü: sürüş torku + fren, tepkime (zımni, kararlı)
      combinedSlip(kappa + Rw / vden, tanA, w.Fz, muS, muK, this.tire, o2);
      const K = Math.max(0, o2.fx - o.fx);                                   // dFx/dω (ω'ya +1 rad/s)
      const Tdrive = wheelT.get(w) ?? 0;
      const Ieff = w.I + (w.axleShare > 0 ? Iref * w.axleShare / (w.front ? 2 : 2) / (spec.bike ? 0.5 : 1) : 0);
      let dw = (dt * (Tdrive - Rw * Fx)) / (Ieff + dt * Rw * K);
      w.omega += dw;
      let Tb = brake * spec.brakeTorque * (w.front ? 0.62 : 0.38) * (this.abs ? w.absRel : 1);
      if (hb && w.hand) Tb = 4000;
      const dbr = (dt * Tb) / w.I;
      if (Math.abs(w.omega) <= dbr) w.omega = 0; else w.omega -= Math.sign(w.omega) * dbr;
      // ABS / TCS
      if (this.abs && brake > 0.05) w.absRel = kappa < -0.14 ? Math.max(0.1, w.absRel - 0.2) : Math.min(1, w.absRel + 0.1); else w.absRel = 1;
      if (w.axleShare > 0 && kappa > maxKappaDrive) maxKappaDrive = kappa;
      w.spin += w.omega * dt; w.slip = Math.min(1.5, Math.hypot(kappa / this.tire.kappaPeak, tanA / this.tire.alphaPeak));
      if (w.slip > maxSlip) maxSlip = w.slip;
    }
    this.maxSlip = maxSlip;
    const tcsT = this.tcs && drive > 0.05 ? clamp(1 - (maxKappaDrive - 0.11) / 0.10, 0.2, 1) : 1;
    this.tcsCut += (tcsT - this.tcsCut) * 0.35;

    // ---- aerodinamik: sürükleme ve yere basma kuvveti (hava yoğunluğu 1.225)
    const vr = { x: lv.x - (env.wind?.x ?? 0), y: lv.y - (env.wind?.y ?? 0), z: lv.z - (env.wind?.z ?? 0) };
    const sp = Math.hypot(vr.x, vr.y, vr.z), kd = -0.5 * AIR_DENSITY * spec.cd * spec.area * sp;
    body.addForce({ x: kd * vr.x, y: kd * vr.y, z: kd * vr.z }, true);
    if (spec.cl) { const fd = -0.5 * AIR_DENSITY * spec.cl * spec.area * vF * vF; body.addForce({ x: up.x * fd, y: up.y * fd, z: up.z * fd }, true); }

    // ---- jiroskopik tork: τ = -Ω × (I ω a)   (dönen tekerlekler)
    let gx = 0, gy = 0, gz = 0;
    for (const w of ws) { const ax = right; const h = w.I * w.omega; gx += ax.x * h; gy += ax.y * h; gz += ax.z * h; }
    // Ω × L
    const tq = { x: -(av.y * gz - av.z * gy), y: -(av.z * gx - av.x * gz), z: -(av.x * gy - av.y * gx) };
    body.addTorque(tq, true);

    // ---- motosiklet: dönüş için yatma kontrolü (PD) — dikey kalması için kontrol torku
    if (spec.bike) {
      const lean = -Math.asin(clamp(right.y, -1, 1));                         // sağa yatma +
      const fwdAxis = fwd;
      const rollRate = dot(av, fwdAxis);
      const want = clamp(ctl.steer, -1, 1) * 0.7 * clamp(Math.abs(vF) / 8, 0, 1);
      const inertiaRoll = spec.mass * 0.35;
      const tqc = (60 * (want - lean) - 9 * rollRate) * inertiaRoll;      // +f ekseni etrafında dönüş = sağa yatma
      body.addTorque({ x: fwdAxis.x * tqc, y: fwdAxis.y * tqc, z: fwdAxis.z * tqc }, true);
      this.lean = lean;
    }
  }
}
