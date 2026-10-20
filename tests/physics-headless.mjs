// Fizik çekirdeğinin tarayıcısız doğrulaması:  npm run test:physics
import { PhysicsWorld, CHAR } from '../src/physics/PhysicsWorld.js';
import { FixedStepper } from '../src/physics/FixedStepper.js';
import { terminalVelocity } from '../src/physics/aerodynamics.js';
import { PHYSICS_DT, GRAVITY, MAX_STEPS_PER_TICK, MAX_FRAME_TIME } from '../src/config/constants.js';
import { IN } from '../src/physics/InputLayout.js';

let pass = 0, fail = 0;
const ok = (name, cond, info = '') => { (cond ? pass++ : fail++); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}  ${info}`); };
const near = (a, b, tol) => Math.abs(a - b) <= tol;
let idx = 0;
const quatX = (deg) => { const h = (deg * Math.PI) / 360; return [Math.sin(h), 0, 0, Math.cos(h)]; };

async function arena() {
  const pw = await PhysicsWorld.create({ solverIterations: 4 });
  idx = 0;
  pw.spawn({ index: idx++, kind: 'static', shape: { type: 'box', hx: 200, hy: 0.5, hz: 200 }, position: [0, -0.5, 0], material: 'asphalt' });
  return pw;
}
const spawnPlayer = (pw, y = 1.5, x = 0, z = 0) => { const e = pw.spawn({ index: idx++, kind: 'character', position: [x, y, z], yaw: 0 }); pw.playerIdx = e.index; return e; };
function run(pw, seconds, setIn, onStep) {
  const n = Math.round(seconds / PHYSICS_DT);
  for (let i = 0; i < n; i++) { pw.input.fill(0); pw.input[IN.VEH_INDEX] = -1; pw.input[IN.CHAR_INDEX] = pw.playerIdx ?? -1; if (setIn) setIn(pw.input, i); pw.step(); if (onStep) onStep(i); }
}

// 1) Sabit adım / spiral of death
{
  const s = new FixedStepper(PHYSICS_DT, MAX_STEPS_PER_TICK, MAX_FRAME_TIME);
  ok('FixedStepper 1/60 s -> 4 adım', s.advance(1 / 60) === 4);
  const s2 = new FixedStepper(PHYSICS_DT, MAX_STEPS_PER_TICK, MAX_FRAME_TIME);
  const n = s2.advance(5);
  ok('Spiral of death: 5 s duraklama sınırlı', n <= MAX_STEPS_PER_TICK && s2.droppedTime > 0, `adım=${n} atılan=${s2.droppedTime.toFixed(2)}s`);
}

// 2) Karakter yere iner ve ayakta durur
{
  const pw = await arena(); const p = spawnPlayer(pw, 1.5);
  run(pw, 2);
  const y = p.body.translation().y;
  ok('Karakter yerde duruyor (merkez y ≈ 0.9)', near(y, 0.9, 0.03) && p.char.grounded, `y=${y.toFixed(3)}`);
  // 3) Yürüme hızı
  run(pw, 3, (i) => { i[IN.MOVE_Z] = 1; });
  const sp = Math.hypot(p.char.vel.x, p.char.vel.z), z = p.body.translation().z;
  ok('Koşu hızı ≈ 2.8 m/s (10 km/h)', near(sp, CHAR.jog, 0.1) && z < -6, `hız=${sp.toFixed(2)} z=${z.toFixed(2)}`);
  // 4) Zıplama tepe noktası
  run(pw, 1);
  const base = p.body.translation().y; let apex = base;
  run(pw, 1.2, (i, k) => { i[IN.JUMP] = k === 0 ? 1 : 0; }, () => { apex = Math.max(apex, p.body.translation().y); });
  ok('Zıplama yüksekliği ≈ 0.8 m', near(apex - base, CHAR.jumpHeight, 0.1), `h=${(apex - base).toFixed(3)}`);
}

// 5) Merdiven çıkar, 60° rampa çıkamaz
{
  const pw = await arena();
  const rise = 0.18, runD = 0.28;
  for (let i = 0; i < 12; i++) {
    const hy = (rise * (i + 1)) / 2;
    pw.spawn({ index: idx++, kind: 'static', shape: { type: 'box', hx: 1.5, hy, hz: runD / 2 }, position: [0, hy, -5 - (i + 0.5) * runD], material: 'concrete' });
  }
  // üstte sahanlık: karakter basamakları çıkınca aşağı düşmesin
  pw.spawn({ index: idx++, kind: 'static', shape: { type: 'box', hx: 1.5, hy: (rise * 12) / 2, hz: 2 }, position: [0, (rise * 12) / 2, -5 - 12 * runD - 2], material: 'concrete' });
  const p = spawnPlayer(pw, 1.0, 0, -2);
  run(pw, 4, (i) => { i[IN.MOVE_Z] = 1; });
  ok('Merdiven (12 basamak, 2.16 m) tırmanılıyor', p.body.translation().y > 2.5, `y=${p.body.translation().y.toFixed(2)}`);

  const pw2 = await arena();
  const a = 60, L = 8, t = 0.4, r = (a * Math.PI) / 180;
  pw2.spawn({ index: idx++, kind: 'static', shape: { type: 'box', hx: 2, hy: t / 2, hz: L / 2 }, rotation: quatX(a),
    position: [0, (L / 2) * Math.sin(r) - (t / 2) * Math.cos(r), -5 - ((t / 2) * Math.sin(r) + (L / 2) * Math.cos(r))], material: 'concrete' });
  const q = spawnPlayer(pw2, 1.0, 0, -2);
  run(pw2, 5, (i) => { i[IN.MOVE_Z] = 1; });
  ok('60° rampa tırmanılamıyor', q.body.translation().y < 1.6, `y=${q.body.translation().y.toFixed(2)}`);
}

// 6) Düşme hasarı enerjisi (8 m)
{
  const pw = await arena(); const p = spawnPlayer(pw, 8.9);
  run(pw, 3);
  const ev = pw.events.find((e) => e.type === 'landed');
  const expected = CHAR.mass * GRAVITY * 1.9 * 8;
  ok('8 m düşüş: enerji ≈ m·(1.9g)·h (11.9 kJ)', ev && near(ev.energy, expected, expected * 0.08), ev ? `E=${ev.energy.toFixed(0)} J hasar=${ev.damage.toFixed(1)}` : 'olay yok');
}

// 7) Çömelip alçak tavanın altında kalkamama
{
  const pw = await arena();
  pw.spawn({ index: idx++, kind: 'static', shape: { type: 'box', hx: 3, hy: 0.25, hz: 3 }, position: [0, 1.5 + 0.25, 0], material: 'concrete' });
  const p = spawnPlayer(pw, 0.95, 0, 0); // çömelik boy 1.3 m < 1.5 m tavan
  run(pw, 0.5, (i) => { i[IN.CROUCH] = 1; });
  run(pw, 0.5, (i) => { i[IN.CROUCH] = 0; });
  ok('Alçak tavan altında ayağa kalkılamıyor', p.char.crouched === true);
}

// 8) Serbest düşüş (sürüklemesiz)
{
  const pw = await arena();
  const b = pw.spawn({ index: idx++, kind: 'dynamic', shape: { type: 'sphere', r: 0.1 }, position: [0, 100, 0], mass: 1, material: 'metal' });
  run(pw, 2);
  const v = b.body.linvel().y, fall = 100 - b.body.translation().y;
  ok('Serbest düşüş: v(2s) ≈ -19.61 m/s', near(v, -2 * GRAVITY, 0.2), `v=${v.toFixed(3)}`);
  ok('Serbest düşüş: yol ≈ ½gt² (19.61 m)', near(fall, 0.5 * GRAVITY * 4, 0.2), `s=${fall.toFixed(3)}`);
}

// 9) Son hız (aerodinamik sürükleme)
{
  const pw = await arena();
  const r = 0.11, m = 0.43, cd = 0.47, area = Math.PI * r * r;
  const b = pw.spawn({ index: idx++, kind: 'dynamic', shape: { type: 'sphere', r }, position: [0, 3000, 0], mass: m, drag: { cd, area }, material: 'rubber' });
  run(pw, 14);
  const vt = terminalVelocity(m, cd, area), v = -b.body.linvel().y;
  ok(`Son hız ≈ ${vt.toFixed(1)} m/s (½ρCdAv² = mg)`, near(v, vt, vt * 0.03), `v=${v.toFixed(2)}`);
}

// 10) CCD: 1000 m/s'lik mermi ince duvarı delip geçmemeli
for (const ccd of [true, false]) {
  const pw = await arena();
  pw.spawn({ index: idx++, kind: 'static', shape: { type: 'box', hx: 5, hy: 5, hz: 0.01 }, position: [0, 5, -5], material: 'concrete' });
  const b = pw.spawn({ index: idx++, kind: 'dynamic', shape: { type: 'sphere', r: 0.01 }, position: [0, 3, -0.1], mass: 0.01, ccd, linvel: [0, 0, -1000], material: 'metal' });
  run(pw, 0.2);
  const z = b.body.translation().z;
  if (ccd) ok('CCD açık: mermi duvardan geçmedi', z > -5.1, `z=${z.toFixed(2)}`);
  else console.log(`INFO  CCD kapalı kontrol: z=${z.toFixed(2)} (${z < -5.1 ? 'duvardan geçti' : 'geçmedi'})`);
}

// 11) Ahşap sandık yığını kararlı mı?
{
  const pw = await arena();
  const cs = [0, 1, 2].map((i) => pw.spawn({ index: idx++, kind: 'dynamic', shape: { type: 'box', hx: 0.4, hy: 0.4, hz: 0.4 }, position: [0, 0.4 + i * 0.8, 0], mass: 20, material: 'wood' }));
  run(pw, 5);
  const top = cs[2].body.translation();
  ok('3 sandıklık yığın 5 sn sonra duruyor', near(top.y, 2.0, 0.05) && Math.hypot(top.x, top.z) < 0.05, `y=${top.y.toFixed(3)}`);
  ok('Yığın uykuya geçti (performans)', cs.every((c) => c.body.isSleeping()));
}

console.log(`\n${pass} geçti, ${fail} kaldı`);
process.exit(fail ? 1 : 0);
