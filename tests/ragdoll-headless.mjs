// Aktif ragdoll: eklemler bütünlüğünü korur, düşünce ayakta durmaya çalışır, kalkar; ölünce gevşek kalır.
import { PhysicsWorld } from '../src/physics/PhysicsWorld.js';
import { PARTS } from '../src/physics/Ragdoll.js';
import { PHYSICS_DT } from '../src/config/constants.js';
let pass = 0, fail = 0; const ok = (n, c, i = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n}  ${i}`); };
async function arena() { const pw = await PhysicsWorld.create(); pw.spawn({ index: 0, kind: 'static', shape: { type: 'box', hx: 500, hy: 0.5, hz: 500 }, position: [0, -0.5, 0], material: 'asphalt' }); pw.initRagdolls(3, (k) => Array.from({ length: 11 }, (_, i) => 100 + k * 11 + i)); return pw; }
const run = (pw, s) => { for (let i = 0; i < s / PHYSICS_DT; i++) pw.step(); };
const pos = (rd, i) => rd.bodies[i].translation(), dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
{ // araç çarpması -> ragdoll -> kalkış
  const pw = await arena(); const c = pw.spawn({ index: 1, kind: 'character', position: [0, 1.0, 0], health: 100 }); run(pw, 1);
  const rd = pw.ragdolls.start(c, { x: 0, y: 3, z: -8 }, false); ok('Ragdoll havuzdan başladı, karakter gizlendi', !!rd && c.char.hidden && c.disabled);
  let maxStretch = 0, kneeMin = 9, kneeMax = -9, maxSp = 0;
  for (let i = 0; i < 240 * 1.2; i++) { pw.step(); maxStretch = Math.max(maxStretch, dist(pos(rd, 0), pos(rd, 1)) - 0.32, dist(pos(rd, 7), pos(rd, 8)) - 0.44); }
  ok('Eklemler kopmuyor (parçalar ayrışmıyor)', maxStretch < 0.12, `maks uzama=${maxStretch.toFixed(3)} m`);
  run(pw, 0.3); const speedAfter = Math.hypot(rd.bodies[0].linvel().x, rd.bodies[0].linvel().z);
  run(pw, 4);
  ok('Hayatta kalan ragdoll sakinleşince ayağa kalkar (karakter geri geldi)', !c.char.hidden && !c.disabled && c.ragdoll === null, `hidden=${c.char.hidden} y=${c.body.translation().y.toFixed(2)}`);
  ok('Ayağa kalkınca zemine yakın (yeraltına/havaya gitmedi)', Math.abs(c.body.translation().y - 0.9) < 0.3, `y=${c.body.translation().y.toFixed(2)}`);
}
{ // ölü ragdoll: gevşek, yerde kalır, uyumaz-kalkmaz
  const pw = await arena(); const c = pw.spawn({ index: 1, kind: 'character', position: [0, 1.0, 0], health: 20 }); run(pw, 1);
  pw.damageChar(c, 50, 'bullet', -1); run(pw, 5); const rd = c.ragdoll;
  ok('Ölünce ragdoll aktif kalır (kalkmaz)', c.char.dead && rd && rd.active);
  const torso = pos(rd, 1), head = pos(rd, 2); ok('Ölü ragdoll yere uzanmış (gövde < 0.4 m)', torso.y < 0.4, `torso y=${torso.y.toFixed(2)}`);
}
{ // yüksekten düşen refleks: kollar düşme yönüne, bacaklar aşağı
  const pw = await arena(); const c = pw.spawn({ index: 1, kind: 'character', position: [0, 6.0, 0], health: 100 }); const rd = pw.ragdolls.start(c, { x: 0, y: -2, z: -4 }, false);
  run(pw, 0.35); const th = rd.bodies[7], ax = th.rotation(); // uyluk aşağı bakıyor mu
  const qrot = (q, v) => { const tx = 2 * (q.y * v.z - q.z * v.y), ty = 2 * (q.z * v.x - q.x * v.z), tz = 2 * (q.x * v.y - q.y * v.x); return { x: v.x + q.w * tx + (q.y * tz - q.z * ty), y: v.y + q.w * ty + (q.z * tx - q.x * tz), z: v.z + q.w * tz + (q.x * ty - q.y * tx) }; };
  const down = qrot(ax, { x: 0, y: -1, z: 0 }); ok('Düşerken bacaklar aşağıya yöneliyor (refleks)', down.y < -0.5, `uyluk ekseni y=${down.y.toFixed(2)}`);
  const ua = rd.bodies[3], a2 = qrot(ua.rotation(), { x: 0, y: -1, z: 0 }); ok('Kollar hareket yönüne (öne, -z) uzanıyor', a2.z < -0.1, `kol ekseni z=${a2.z.toFixed(2)}`);
}
{ // diz yalnızca bir yöne bükülür (insan eklem sınırı)
  const pw = await arena(); const c = pw.spawn({ index: 1, kind: 'character', position: [0, 3.0, 0], health: 100 }); const rd = pw.ragdolls.start(c, { x: 0, y: 0, z: -6 }, true); let minA = 9, maxA = -9;
  for (let i = 0; i < 240 * 2; i++) { pw.step(); const t = rd.bodies[7].rotation(), q = rd.bodies[8].rotation(); const ci = { x: -t.x, y: -t.y, z: -t.z, w: t.w };
    const rel = { w: ci.w * q.w - ci.x * q.x - ci.y * q.y - ci.z * q.z, x: ci.w * q.x + ci.x * q.w + ci.y * q.z - ci.z * q.y }; if (rel.w < 0) { rel.w = -rel.w; rel.x = -rel.x; } let a = 2 * Math.atan2(rel.x, rel.w); minA = Math.min(minA, a); maxA = Math.max(maxA, a); }
  ok('Diz eklemi tek yönde ve sınırlı (0..2.3 rad; hiperekstansiyon yok)', minA > -0.12 && maxA < 2.45, `aralık=${minA.toFixed(2)}..${maxA.toFixed(2)} rad`);
}
console.log(`\n${pass} geçti, ${fail} kaldı`); process.exit(fail ? 1 : 0);
