// Balistik: mermi düşüşü, sürükleme, delme/durma, hasar.
import { PhysicsWorld } from '../src/physics/PhysicsWorld.js';
import { WEAPONS } from '../src/physics/weapons.js';
import { PHYSICS_DT, GRAVITY } from '../src/config/constants.js';
let pass = 0, fail = 0; const ok = (n, c, i = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n}  ${i}`); };
async function arena() { const pw = await PhysicsWorld.create(); pw.spawn({ index: 0, kind: 'static', shape: { type: 'box', hx: 2000, hy: 0.5, hz: 2000 }, position: [0, -0.5, 0], material: 'asphalt' }); return pw; }
function run(pw, s) { for (let i = 0; i < s / PHYSICS_DT; i++) pw.step(); }
for (const [dist, label] of [[100, '100 m'], [300, '300 m']]) {
  const pw = await arena(); pw.spawn({ index: 1, kind: 'static', shape: { type: 'box', hx: 20, hy: 20, hz: 0.5 }, position: [0, 10, -dist], material: 'concrete' });
  W: { const W = WEAPONS[2]; W.spread = 0; pw.fire({ weapon: 2, ox: 0, oy: 1.5, oz: 0, dx: 0, dy: 0, dz: -1, shooter: -1 }); run(pw, 1.2);
    const hit = pw.events.find((e) => e.type === 'bulletHit'); const drop = hit ? 1.5 - hit.y : NaN;
    const t = dist / 900, ideal = 0.5 * GRAVITY * t * t;
    ok(`5.56 mm ${label}: mermi düşüşü ≈ ½gt² (sürüklemeli)`, hit && drop > ideal * 0.9 && drop < ideal * 1.5, `düşüş=${drop.toFixed(3)} m (vakumda ${ideal.toFixed(3)} m)`); }
}
{ // sürükleme: 9mm hızı 100 m'de belirgin azalır
  const pw = await arena(); const b = { x: 0, y: 1.5, z: 0, vx: 0, vy: 0, vz: -360, W: WEAPONS[1], shooter: null, life: 8, bounces: 0 }; pw.bullets.push(b); run(pw, 0.4);
  ok('9mm: hava direnci hızı düşürüyor (0.4 s sonra < 330 m/s)', Math.hypot(b.vx, b.vy, b.vz) < 330 && Math.hypot(b.vx, b.vy, b.vz) > 250, `v=${Math.hypot(b.vx, b.vy, b.vz).toFixed(0)} m/s`);
}
{ // rüzgar mermiyi yanal iter
  const pw = await arena(); pw.wind = { x: 15, y: 0, z: 0 }; const b = { x: 0, y: 1.5, z: 0, vx: 0, vy: 0, vz: -360, W: WEAPONS[1], shooter: null, life: 8, bounces: 0 }; pw.bullets.push(b); run(pw, 0.8);
  ok('Rüzgar mermiyi yanal sürüklüyor', b.x > 0.05, `x=${b.x.toFixed(2)} m`);
}
{ // delme: ahşap levha delinir, beton delinmez
  for (const [mat, expect] of [['wood', true], ['concrete', false]]) {
    const pw = await arena(); pw.spawn({ index: 1, kind: 'static', shape: { type: 'box', hx: 5, hy: 5, hz: 0.04 }, position: [0, 2, -10], material: mat });
    WEAPONS[1].spread = 0; pw.fire({ weapon: 1, ox: 0, oy: 1.5, oz: 0, dx: 0, dy: 0, dz: -1, shooter: -1 }); run(pw, 0.3);
    const h = pw.events.find((e) => e.type === 'bulletHit' && e.target === 'world');
    ok(`Pistol mermisi ${mat} levhayı ${expect ? 'deliyor' : 'delemiyor'}`, h && h.penetrated === expect, `penetrated=${h?.penetrated}`);
  }
}
{ // karakter vurulur: hasar ve ölüm
  const pw = await arena(); const t = pw.spawn({ index: 1, kind: 'character', position: [0, 1.0, -15], yaw: 0, health: 60 }); for (let i = 0; i < 240; i++) pw.step();
  WEAPONS[2].spread = 0; for (let k = 0; k < 3; k++) { pw.fire({ weapon: 2, ox: 0, oy: 1.3, oz: 0, dx: 0, dy: 0, dz: -1, shooter: -1 }); run(pw, 0.2); }
  ok('Tüfek 3 atışta NPC\'yi öldürür', t.char.dead === true, `sağlık=${t.char.health.toFixed(0)}`);
  ok('Hasar enerjiye bağlı (≈ E/24)', pw.events.some((e) => e.type === 'hit' && e.cause === 'bullet' && e.damage > 40), pw.events.filter((e) => e.type === 'hit').map((e) => e.damage.toFixed(0)).join(','));
}
{ // patlama: Kinney-Graham, uzaklıkla azalan hasar ve araç itilmesi
  const pw = await arena(); const a = pw.spawn({ index: 1, kind: 'character', position: [3, 1.0, 0], health: 100 }), b = pw.spawn({ index: 2, kind: 'character', position: [25, 1.0, 0], health: 100 });
  for (let i = 0; i < 120; i++) pw.step(); pw.explode(0, 0.5, 0, 5); pw.step();
  ok('Patlama yakını öldürür, uzağı az etkiler', a.char.dead && b.char.health > 40, `3m: ${a.char.health.toFixed(0)}  25m: ${b.char.health.toFixed(0)}`);
}
console.log(`\n${pass} geçti, ${fail} kaldı`); process.exit(fail ? 1 : 0);
