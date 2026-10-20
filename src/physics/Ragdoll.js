// Aktif ragdoll (Euphoria'dan esinlenen, basitleştirilmiş): 11 parçalı eklemli insan (küre/menteşe eklemleri, gerçek
// insan eklem sınırları) + "refleksler": düşerken kolları hareket yönüne uzatma, kafayı koruma, bacakları yere indirme,
// sonra ayağa kalkma. Ölünce tamamen pasif (gevşek) olur. Havuz: önceden oluşturulur, devre dışı bekler.
import { qrot, qyaw } from './vec.js';
import { G } from './PhysicsWorld.js';

// parça: ad, şekil (capsule: yarı-silindir, yarıçap | box: yarı boyutlar), kütle (kg, toplam ≈ 80), duruş merkezi (ayak orijinli)
export const PARTS = [
  { n: 'pelvis', s: ['box', 0.16, 0.09, 0.1], m: 12, p: [0, 0.95, 0] },
  { n: 'torso', s: ['box', 0.19, 0.25, 0.11], m: 30, p: [0, 1.31, 0] },
  { n: 'head', s: ['ball', 0.11], m: 5, p: [0, 1.66, 0] },
  { n: 'uarmL', s: ['cap', 0.1, 0.05], m: 2.2, p: [-0.27, 1.4, 0] }, { n: 'farmL', s: ['cap', 0.1, 0.045], m: 1.6, p: [-0.27, 1.12, 0] },
  { n: 'uarmR', s: ['cap', 0.1, 0.05], m: 2.2, p: [0.27, 1.4, 0] }, { n: 'farmR', s: ['cap', 0.1, 0.045], m: 1.6, p: [0.27, 1.12, 0] },
  { n: 'thighL', s: ['cap', 0.16, 0.075], m: 8, p: [-0.1, 0.7, 0] }, { n: 'shinL', s: ['cap', 0.16, 0.06], m: 4, p: [-0.1, 0.28, 0] },
  { n: 'thighR', s: ['cap', 0.16, 0.075], m: 8, p: [0.1, 0.7, 0] }, { n: 'shinR', s: ['cap', 0.16, 0.06], m: 4, p: [0.1, 0.28, 0] },
];
const IDX = Object.fromEntries(PARTS.map((p, i) => [p.n, i]));
// eklem: [ebeveyn, çocuk, ebeveyndeki bağlantı noktası (yerel), çocuktaki, tip, eksen/limit]
const JOINTS = [
  ['pelvis', 'torso', [0, 0.1, 0], [0, -0.22, 0], 'sph'], ['torso', 'head', [0, 0.26, 0], [0, -0.12, 0], 'sph'],
  ['torso', 'uarmL', [-0.21, 0.2, 0], [0, 0.14, 0], 'sph'], ['uarmL', 'farmL', [0, -0.14, 0], [0, 0.14, 0], 'rev', [1, 0, 0], [-2.4, 0]],
  ['torso', 'uarmR', [0.21, 0.2, 0], [0, 0.14, 0], 'sph'], ['uarmR', 'farmR', [0, -0.14, 0], [0, 0.14, 0], 'rev', [1, 0, 0], [-2.4, 0]],
  ['pelvis', 'thighL', [-0.1, -0.09, 0], [0, 0.22, 0], 'sph'], ['thighL', 'shinL', [0, -0.22, 0], [0, 0.22, 0], 'rev', [1, 0, 0], [0, 2.3]],
  ['pelvis', 'thighR', [0.1, -0.09, 0], [0, 0.22, 0], 'sph'], ['thighR', 'shinR', [0, -0.22, 0], [0, 0.22, 0], 'rev', [1, 0, 0], [0, 2.3]],
];

export class RagdollPool {
  constructor(pw, count, rowsFor) {
    this.pw = pw; this.list = [];
    for (let k = 0; k < count; k++) this.list.push(this._make(k, rowsFor(k)));
  }
  _make(k, rows) {
    const { world, R } = this.pw, bodies = [], groups = ((G.RAGDOLL << 16) | (G.STATIC | G.VEH | G.DEBRIS)) >>> 0;
    PARTS.forEach((p, i) => {
      const bd = R.RigidBodyDesc.dynamic().setTranslation(0, -100 - k * 5, i * 0.5).setCcdEnabled(false).setLinearDamping(0.05).setAngularDamping(0.8), body = world.createRigidBody(bd);
      let cd = p.s[0] === 'box' ? R.ColliderDesc.cuboid(p.s[1], p.s[2], p.s[3]) : p.s[0] === 'ball' ? R.ColliderDesc.ball(p.s[1]) : R.ColliderDesc.capsule(p.s[1], p.s[2]);
      cd.setMass(p.m).setFriction(0.8).setRestitution(0.05).setCollisionGroups(groups); world.createCollider(cd, body); body.setEnabled(false); bodies.push(body);
    });
    for (const [a, b, pa, pb, type, axis, lim] of JOINTS) {
      const A = { x: pa[0], y: pa[1], z: pa[2] }, B = { x: pb[0], y: pb[1], z: pb[2] };
      const jd = type === 'sph' ? R.JointData.spherical(A, B) : R.JointData.revolute(A, B, { x: axis[0], y: axis[1], z: axis[2] });
      const j = world.createImpulseJoint(jd, bodies[IDX[a]], bodies[IDX[b]], true);
      if (type === 'rev') j.setLimits(lim[0], lim[1]);          // gerçek insan eklem açı sınırı
      if (j.setContactsEnabled) j.setContactsEnabled(false);
    }
    return { k, rows, bodies, active: false, t: 0, dead: false, owner: null };
  }
  free() { return this.list.find((r) => !r.active); }

  /** char: PhysicsWorld girdisi; vel: {x,y,z}; dead: ölü mü */
  start(ch, vel, dead = false) {
    const rd = this.free(); if (!rd || ch.ragdoll) return null; const t = ch.body.translation(), yaw = ch.char.facing, q = qyaw(yaw), feet = t.y - 0.9;
    PARTS.forEach((p, i) => { const o = qrot(q, { x: p.p[0], y: 0, z: p.p[2] }), b = rd.bodies[i]; b.setEnabled(true); b.setTranslation({ x: t.x + o.x, y: feet + p.p[1], z: t.z + o.z }, true); b.setRotation(q, true); b.setLinvel({ x: vel.x, y: vel.y, z: vel.z }, true); b.setAngvel({ x: (Math.random() - 0.5) * 3, y: 0, z: (Math.random() - 0.5) * 3 }, true); });
    rd.active = true; rd.t = 0; rd.dead = dead; rd.owner = ch; ch.ragdoll = rd; ch.char.hidden = true; this.pw.setEnabled(ch, false); this.pw.events.push({ type: 'ragdoll', index: ch.index, rd: rd.k, dead });
    return rd;
  }
  release(ch) { const rd = ch.ragdoll; if (!rd) return; rd.active = false; rd.owner = null; ch.ragdoll = null; rd.bodies.forEach((b, i) => b.setEnabled(false)); ch.char.hidden = false; }

  update(dt) {
    for (const rd of this.list) {
      if (!rd.active) continue; rd.t += dt; const b = rd.bodies, ch = rd.owner; if (!ch) continue;
      if (ch.char.dead) rd.dead = true;
      const pel = b[0], v = pel.linvel(), sp = Math.hypot(v.x, v.y, v.z), pt = pel.translation();
      if (!rd.dead && rd.t < 4) this._reflex(rd, v, sp, dt);
      // ayağa kalkma: sakinleştiyse ve ölü değilse
      if (!rd.dead && rd.t > 1.4 && sp < 0.8) {
        const w = this.pw.world; ch.ragdollOut = true; const yawv = Math.atan2(-v.x, -v.z);
        this.release(ch); this.pw.setEnabled(ch, true); this.pw.teleport(ch.index, [pt.x, Math.max(pt.y, 0) + 0.95, pt.z]); ch.char.knock = 0.5; ch.char.invuln = 1.2;
      }
    }
  }
  /** Euphoria benzeri refleksler: PD torkları (torque = Kp·(hedef×mevcut) − Kd·ω). */
  _reflex(rd, v, sp, dt) {
    const b = rd.bodies, tor = (body, cur, tgt, kp, kd) => { const cx = cur.y * tgt.z - cur.z * tgt.y, cy = cur.z * tgt.x - cur.x * tgt.z, cz = cur.x * tgt.y - cur.y * tgt.x, w = body.angvel(); body.resetTorques(false); body.addTorque({ x: kp * cx - kd * w.x, y: kp * cy - kd * w.y, z: kp * cz - kd * w.z }, true); };
    const dirN = sp > 0.5 ? { x: v.x / sp, y: v.y / sp, z: v.z / sp } : { x: 0, y: -1, z: 0 };
    const falling = v.y < -1.5;
    for (const side of ['L', 'R']) {
      const ua = b[IDX['uarm' + side]], q = ua.rotation(), axis = qrot(q, { x: 0, y: -1, z: 0 });
      // kolları hareket yönüne / düşme yönüne uzat (korunma refleksi)
      const tgt = falling ? { x: dirN.x * 0.6, y: -0.3, z: dirN.z * 0.6 } : { x: dirN.x, y: 0.2, z: dirN.z };
      const tl = Math.hypot(tgt.x, tgt.y, tgt.z) || 1; tor(ua, axis, { x: tgt.x / tl, y: tgt.y / tl, z: tgt.z / tl }, 14, 1.2);
      const th = b[IDX['thigh' + side]], ta = qrot(th.rotation(), { x: 0, y: -1, z: 0 });
      if (falling) tor(th, ta, { x: 0, y: -1, z: 0 }, 40, 3);                    // iniş için bacakları aşağı indir
    }
    const head = b[IDX.head], hu = qrot(head.rotation(), { x: 0, y: 1, z: 0 }), tu = qrot(b[IDX.torso].rotation(), { x: 0, y: 1, z: 0 });
    tor(head, hu, { x: tu.x * 0.7, y: 0.7 + tu.y * 0.3, z: tu.z * 0.7 }, 8, 0.9);        // kafa dik kalsın (başı koru)
  }
}
