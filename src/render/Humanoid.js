// Eklemli insan modeli (kemik hiyerarşisi) + prosedürel animasyon: idle, yürü/koş/sprint, zıpla, düş, çömel,
// otur (araç), yüz (swim), ölü, silah nişanı, telefon, el hareketi (konuşma). Boy 1.78 m, orijin ayak tabanında.
import * as THREE from 'three';

const matCache = new Map();
const M = (c, o = {}) => { const k = c + JSON.stringify(o); let m = matCache.get(k); if (!m) { m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, metalness: 0.02, ...o }); matCache.set(k, m); } return m; };
const geo = {};
const G = (k, f) => geo[k] ?? (geo[k] = f());

export const SKINS = [0xf1c9a5, 0xe0ac82, 0xc68a62, 0x9a6642, 0x6b4430, 0xf6d7bd];
export const SHIRTS = [0xc0392b, 0x2e86c1, 0x27ae60, 0xf1c40f, 0x8e44ad, 0xecf0f1, 0x2c3e50, 0xe67e22, 0x16a085, 0xd35400, 0x34495e];
export const PANTS = [0x2c3e50, 0x34495e, 0x1f2a36, 0x5d4a3a, 0x7f8c8d, 0x3a3f5c, 0x1a1a1a];
export const HAIRS = [0x1a1210, 0x3a2a1c, 0x6a4a2a, 0xb8903a, 0x8a8a8a, 0x0e0e0e, 0x7a2a1a];

function part(parent, geom, mat, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(geom, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; }
const limb = (r, len) => G(`limb${r}_${len}`, () => new THREE.CapsuleGeometry(r, len, 3, 8));

export function createHumanoid(o = {}) {
  const skin = M(o.skin ?? SKINS[0]), shirt = M(o.shirt ?? SHIRTS[0]), pants = M(o.pants ?? PANTS[0]), shoe = M(o.shoes ?? 0x15151a), hair = M(o.hair ?? HAIRS[0]);
  const root = new THREE.Group(), hips = new THREE.Group(); root.add(hips); hips.position.y = 0.94;
  part(hips, G('pel', () => new THREE.BoxGeometry(0.34, 0.2, 0.2)), pants, 0, 0.0, 0);
  const spine = new THREE.Group(); spine.position.y = 0.08; hips.add(spine);
  part(spine, G('tor', () => new THREE.BoxGeometry(0.38, 0.52, 0.22)), shirt, 0, 0.28, 0);
  if (o.jacket) part(spine, G('jac', () => new THREE.BoxGeometry(0.4, 0.34, 0.24)), M(o.jacket), 0, 0.34, 0);
  const neck = new THREE.Group(); neck.position.y = 0.56; spine.add(neck);
  part(neck, G('nk', () => new THREE.CylinderGeometry(0.045, 0.05, 0.08, 8)), skin, 0, 0.02, 0);
  const head = new THREE.Group(); head.position.y = 0.12; neck.add(head);
  part(head, G('hd', () => new THREE.SphereGeometry(0.11, 14, 12)), skin, 0, 0.08, 0).scale.set(0.95, 1.1, 1);
  const hairM = part(head, G('hr', () => new THREE.SphereGeometry(0.118, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55)), hair, 0, 0.1, 0.005);
  if (o.longHair) { part(head, G('hl', () => new THREE.BoxGeometry(0.2, 0.28, 0.08)), hair, 0, -0.02, 0.07); }
  part(head, G('ns', () => new THREE.BoxGeometry(0.03, 0.04, 0.04)), skin, 0, 0.07, -0.115);
  for (const s of [-1, 1]) part(head, G('ey', () => new THREE.SphereGeometry(0.013, 6, 6)), M(0x111111), s * 0.04, 0.1, -0.1);

  const arms = [];
  for (const s of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(s * 0.25, 0.5, 0); spine.add(sh);
    part(sh, G('shd', () => new THREE.SphereGeometry(0.06, 8, 8)), shirt);
    part(sh, limb(0.058, 0.2), shirt, 0, -0.17, 0);
    const el = new THREE.Group(); el.position.y = -0.3; sh.add(el);
    part(el, limb(0.05, 0.18), o.longSleeve ? shirt : skin, 0, -0.14, 0);
    const hand = new THREE.Group(); hand.position.y = -0.3; el.add(hand);
    part(hand, G('hand', () => new THREE.SphereGeometry(0.05, 8, 8)), skin);
    arms.push({ sh, el, hand, s });
  }
  const legs = [];
  for (const s of [-1, 1]) {
    const hp = new THREE.Group(); hp.position.set(s * 0.1, -0.06, 0); hips.add(hp);
    part(hp, limb(0.075, 0.3), pants, 0, -0.22, 0);
    const kn = new THREE.Group(); kn.position.y = -0.44; hp.add(kn);
    part(kn, limb(0.062, 0.3), pants, 0, -0.22, 0);
    const an = new THREE.Group(); an.position.y = -0.44; kn.add(an);
    part(an, G('ft', () => new THREE.BoxGeometry(0.1, 0.07, 0.27)), shoe, 0, -0.03, -0.05);
    legs.push({ hp, kn, an, s });
  }
  // silah (sağ elde, görünürlük kontrollü)
  const gun = new THREE.Group(); gun.visible = false; arms[1].hand.add(gun);
  part(gun, G('gun1', () => new THREE.BoxGeometry(0.04, 0.05, 0.2)), M(0x1b1b1e, { metalness: 0.6 }), 0, 0, -0.12);
  part(gun, G('gun2', () => new THREE.BoxGeometry(0.035, 0.1, 0.045)), M(0x1b1b1e, { metalness: 0.6 }), 0, -0.06, -0.03);
  const rifle = new THREE.Group(); rifle.visible = false; arms[1].hand.add(rifle);
  part(rifle, G('rf1', () => new THREE.BoxGeometry(0.05, 0.07, 0.75)), M(0x24262b, { metalness: 0.6 }), 0, 0, -0.3);
  part(rifle, G('rf2', () => new THREE.BoxGeometry(0.04, 0.12, 0.07)), M(0x24262b), 0, -0.08, -0.1);

  const scale = o.scale ?? 1; root.scale.setScalar(scale);
  const st = { phase: Math.random() * 6, crouch: 0, air: 0, dead: 0, sit: 0, swim: 0, aim: 0, phone: 0, gesture: 0, t: Math.random() * 10, speed: 0, lean: 0 };
  const k = (v, to, dt, r = 12) => v + (to - v) * (1 - Math.exp(-r * dt));

  /** s: {speed, crouch, air, dead, sit, swim, aim, phone, gesture, sprint, weapon:0|1|2, vy} */
  function update(dt, s) {
    st.t += dt; st.speed = k(st.speed, s.speed ?? 0, dt, 10);
    st.crouch = k(st.crouch, s.crouch ? 1 : 0, dt, 14); st.air = k(st.air, s.air ? 1 : 0, dt, 12); st.dead = k(st.dead, s.dead ? 1 : 0, dt, 6);
    st.sit = k(st.sit, s.sit ? 1 : 0, dt, 12); st.swim = k(st.swim, s.swim ? 1 : 0, dt, 8); st.aim = k(st.aim, s.aim ? 1 : 0, dt, 14);
    st.phone = k(st.phone, s.phone ? 1 : 0, dt, 8); st.gesture = k(st.gesture, s.gesture ? 1 : 0, dt, 6);
    gun.visible = s.weapon === 1; rifle.visible = s.weapon === 2;
    const v = st.speed, stride = 0.9 + v * 0.3, moving = Math.min(1, v / 0.4);
    st.phase += (Math.PI * 2 * v / stride) * dt * (st.swim > 0.5 ? 0.5 : 1);
    const ph = st.phase, amp = Math.min(1.05, 0.12 + v * 0.17) * moving * (1 - st.air) * (1 - st.sit);
    const idle = Math.sin(st.t * 1.6) * 0.012;
    hips.position.y = 0.94 - 0.36 * st.crouch - 0.42 * st.sit - 0.12 * st.air + Math.abs(Math.sin(ph)) * 0.03 * moving * (v > 3 ? 1.6 : 1) * (1 - st.crouch);
    hips.position.z = 0.0; spine.rotation.x = -(Math.min(v, 6) * 0.045 + 0.35 * st.crouch) * (1 - st.sit) + idle - 0.1 * st.aim;
    spine.rotation.y = Math.sin(ph) * 0.12 * moving * (1 - st.aim); head.rotation.x = -spine.rotation.x * 0.6; head.rotation.y = Math.sin(st.t * 0.5) * 0.15 * (1 - moving);
    for (const L of legs) {
      const sgn = L.s, sw = Math.sin(ph + (sgn > 0 ? 0 : Math.PI));
      let thigh = sw * amp, knee = Math.max(0, -Math.sin(ph + (sgn > 0 ? 0 : Math.PI) + 0.9)) * amp * 1.2 + 0.02;
      thigh = thigh * (1 - st.crouch) + 1.05 * st.crouch + (sgn > 0 ? 0.9 : 0.2) * st.air * (1 - st.crouch);
      knee = knee * (1 - st.crouch) + 1.3 * st.crouch + 0.9 * st.air;
      thigh = thigh * (1 - st.sit) + 1.45 * st.sit; knee = knee * (1 - st.sit) + 1.45 * st.sit;
      const dead = st.dead; L.hp.rotation.x = thigh * (1 - dead) + 0.2 * dead; L.hp.rotation.z = sgn * (0.03 + 0.12 * st.crouch) * -1; L.kn.rotation.x = -knee; L.an.rotation.x = 0.2 * st.sit + knee * 0.25 * (1 - st.sit);
    }
    for (const A of arms) {
      const sgn = A.s, sw = -Math.sin(ph + (sgn > 0 ? 0 : Math.PI)) * Math.min(0.9, 0.1 + v * 0.15) * moving;
      let up = sw * (1 - st.air) + (-0.6 - sgn * 0.0) * st.air, el = -(0.15 + Math.max(0, v - 2) * 0.22) * moving - 0.1 - 1.0 * (v > 3 ? 1 : 0) * 0.2;
      up = up * (1 - st.crouch * 0.4); let side = sgn * 0.08 + sgn * 0.5 * st.air;
      up = up * (1 - st.sit) + -1.15 * st.sit; el = el * (1 - st.sit) + -0.55 * st.sit;     // direksiyon
      if (sgn > 0) { up = up * (1 - st.aim) + -1.45 * st.aim; el = el * (1 - st.aim) + -0.12 * st.aim; side = side * (1 - st.aim) + 0.04 * st.aim; up = up * (1 - st.phone) + -2.5 * st.phone; el = el * (1 - st.phone) + -1.9 * st.phone; up += Math.sin(st.t * 5) * 0.35 * st.gesture; el -= (0.5 + Math.sin(st.t * 7) * 0.3) * st.gesture; }
      else { up = up * (1 - st.aim) + -1.3 * st.aim; el = el * (1 - st.aim) + -0.25 * st.aim; side = side * (1 - st.aim) + -0.2 * st.aim; }
      A.sh.rotation.set(up, 0, side * -1); A.el.rotation.x = el;
    }
    // yatış: ölü/yüzme
    const lie = Math.max(st.dead, st.swim * 0.85);
    root.rotation.x = -Math.PI / 2 * lie; root.position.y = 0.0 + 0.16 * lie + st.swim * 0.4;
  }
  return { root, update, state: st, head, hips, look: o, parts: { arms, legs } };
}

export function randomLook(rng) {
  const r = rng ?? Math.random, p = (a) => a[Math.floor(r() * a.length) % a.length];
  return { skin: p(SKINS), shirt: p(SHIRTS), pants: p(PANTS), hair: p(HAIRS), jacket: r() < 0.25 ? p(SHIRTS) : undefined, longHair: r() < 0.35, longSleeve: r() < 0.4, scale: 0.94 + r() * 0.12 };
}
export const LOOKS = {
  lucia: { skin: 0xc68a62, shirt: 0xc0392b, pants: 0x2c3e50, hair: 0x1a1210, longHair: true, jacket: 0x1c1c22, longSleeve: true },
  jason: { skin: 0xe0ac82, shirt: 0x2e86c1, pants: 0x34495e, hair: 0x3a2a1c, longSleeve: false },
};
