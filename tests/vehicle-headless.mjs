// Araç fiziği doğrulaması (tarayıcısız): ivmelenme, fren, viraj tutuşu, kararlılık.
import { PhysicsWorld } from '../src/physics/PhysicsWorld.js';
import { PHYSICS_DT } from '../src/config/constants.js';
import { IN } from '../src/physics/InputLayout.js';
import { VEHICLES } from '../src/physics/vehicleSpecs.js';

let pass = 0, fail = 0;
const ok = (n, c, i = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n}  ${i}`); };
async function arena(wet = 0) {
  const pw = await PhysicsWorld.create({ solverIterations: 4 });
  pw.weather.wet = wet;
  pw.spawn({ index: 0, kind: 'static', shape: { type: 'box', hx: 2000, hy: 0.5, hz: 2000 }, position: [0, -0.5, 0], material: 'asphalt' });
  return pw;
}
function car(pw, name, z = 0) {
  const e = pw.spawn({ index: 1, kind: 'vehicle', spec: name, position: [0, 0.9, z], wheelRows: [2, 3, 4, 5] });
  for (let i = 0; i < 240; i++) pw.step();   // otursun
  return e;
}
const kmh = (e) => Math.abs(e.veh.speed) * 3.6;

for (const name of ['sedan', 'coupe', 'suv', 'pickup', 'van']) {
  const pw = await arena(); const e = car(pw, name);
  const sag = 0.9 - e.body.translation().y;
  let t100 = null, vmax = 0, i = 0;
  for (; i < 240 * 40; i++) {
    pw.vehCtl = { throttle: 1, brake: 0, steer: 0, handbrake: 0 }; pw.step();
    const v = kmh(e); vmax = Math.max(vmax, v);
    if (t100 === null && v >= (name === 'van' ? 90 : 100)) t100 = i * PHYSICS_DT;   // van (2.6 t, 105 kW) için 0-90
  }
  const exp = { sedan: [8, 13], coupe: [4, 8], suv: [8, 15], pickup: [5, 9], van: [11, 32] }[name];
  ok(`${name}: 0-100 km/h`, t100 !== null && t100 >= exp[0] && t100 <= exp[1], `${t100?.toFixed(2)} s (beklenen ${exp[0]}-${exp[1]}) vmax=${vmax.toFixed(0)} km/h gear=${e.veh.gear}`);
  ok(`${name}: yüksek hız kararlı (devrilmedi)`, e.body.translation().y < 2 && Math.abs(e.body.translation().x) < 5, `x=${e.body.translation().x.toFixed(2)} y=${e.body.translation().y.toFixed(2)}`);
}

// fren mesafesi 100 -> 0 (ABS açık), kuru ve ıslak
for (const wet of [0, 1]) {
  const pw = await arena(wet); const e = car(pw, 'sedan');
  e.body.setLinvel({ x: 0, y: 0, z: -100 / 3.6 }, true); for (const w of e.veh.wheels) w.omega = (100 / 3.6) / w.radius;
  let d = 0, i = 0; const z0 = e.body.translation().z;
  for (; i < 240 * 15; i++) { pw.vehCtl = { throttle: 0, brake: 1, steer: 0, handbrake: 0 }; pw.step(); if (kmh(e) < 1) break; }
  d = Math.abs(e.body.translation().z - z0);
  const r = wet ? [50, 80] : [33, 46];
  ok(`sedan fren 100->0 ${wet ? 'ıslak' : 'kuru'}`, d >= r[0] && d <= r[1], `${d.toFixed(1)} m (beklenen ${r[0]}-${r[1]})`);
}

// viraj tutuşu: sabit yarıçapta artan hız -> yanal ivme ~0.8-1.0 g
{
  const pw = await arena(); const e = car(pw, 'sedan');
  let maxG = 0;
  for (let i = 0; i < 240 * 25; i++) {
    const v = kmh(e);
    pw.vehCtl = { throttle: v < 80 ? 0.6 : 0.2, brake: 0, steer: 0.5, handbrake: 0 }; pw.step();
    const lv = e.body.linvel(), av = e.body.angvel(); const a = Math.hypot(lv.x, lv.z) * Math.abs(av.y) / 9.80665; if (i > 240 * 8) maxG = Math.max(maxG, a);
  }
  ok('sedan viraj: yanal ivme 0.6-1.1 g', maxG > 0.6 && maxG < 1.1, `${maxG.toFixed(2)} g`);
  ok('sedan viraj: devrilmedi', e.body.translation().y < 1.5);
}

// el freni: arka tekerlekler kilitlenir, araç dönüş yapar (drift)
{
  const pw = await arena(); const e = car(pw, 'coupe');
  e.body.setLinvel({ x: 0, y: 0, z: -80 / 3.6 }, true); for (const w of e.veh.wheels) w.omega = (80 / 3.6) / w.radius;
  let yaw0 = 0, maxSlipRear = 0;
  for (let i = 0; i < 240 * 2; i++) { pw.vehCtl = { throttle: 0, brake: 0, steer: i > 60 ? 0.6 : 0, handbrake: i > 60 ? 1 : 0 }; pw.step(); maxSlipRear = Math.max(maxSlipRear, e.veh.wheels[2].slip); }
  ok('el freni: arka lastik kayıyor', maxSlipRear > 1.2, `slip=${maxSlipRear.toFixed(2)}`);
}

// ağırlık aktarımı: frende ön tekerlek yükü artar
{
  const pw = await arena(); const e = car(pw, 'sedan');
  e.body.setLinvel({ x: 0, y: 0, z: -80 / 3.6 }, true); for (const w of e.veh.wheels) w.omega = (80 / 3.6) / w.radius;
  const f0 = e.veh.wheels[0].Fz + e.veh.wheels[1].Fz;
  for (let i = 0; i < 120; i++) { pw.vehCtl = { throttle: 0, brake: 1, steer: 0, handbrake: 0 }; pw.step(); }
  const f1 = e.veh.wheels[0].Fz + e.veh.wheels[1].Fz;
  ok('frende ön yük artıyor (ağırlık aktarımı)', f1 > f0 * 1.08, `${f0.toFixed(0)} N -> ${f1.toFixed(0)} N`);
}

// duran araç kayma yapmıyor (eğimsiz zeminde)
{
  const pw = await arena(); const e = car(pw, 'suv');
  const p0 = e.body.translation();
  for (let i = 0; i < 240 * 5; i++) { pw.vehCtl = { throttle: 0, brake: 0, steer: 0, handbrake: 0 }; pw.step(); }
  const p1 = e.body.translation();
  ok('duran araç yerinde kalıyor (5 sn)', Math.hypot(p1.x - p0.x, p1.z - p0.z) < 0.15, `kayma=${Math.hypot(p1.x - p0.x, p1.z - p0.z).toFixed(3)} m`);
}

// motosiklet: düz gidiş + viraj, devrilmeme
{
  const pw = await arena(); const e = pw.spawn({ index: 1, kind: 'vehicle', spec: 'bike', position: [0, 0.8, 0], wheelRows: [2, 3] });
  for (let i = 0; i < 240; i++) { pw.vehCtl = { throttle: 0, brake: 0, steer: 0, handbrake: 0 }; pw.step(); }
  ok('motosiklet durağan ayakta', e.body.translation().y > 0.5, `y=${e.body.translation().y.toFixed(2)} lean=${(e.veh.lean * 57.3).toFixed(1)}°`);
  let maxLean = 0;
  for (let i = 0; i < 240 * 12; i++) { pw.vehCtl = { throttle: 0.7, brake: 0, steer: i > 240 * 5 ? 0.6 : 0, handbrake: 0 }; pw.step(); maxLean = Math.max(maxLean, Math.abs(e.veh.lean)); }
  ok('motosiklet virajda yatıyor ama devrilmiyor', maxLean > 0.1 && maxLean < 1.0 && e.body.translation().y > 0.4, `maxLean=${(maxLean * 57.3).toFixed(0)}° hız=${kmh(e).toFixed(0)} km/h`);
}
console.log(`\n${pass} geçti, ${fail} kaldı`); process.exit(fail ? 1 : 0);
