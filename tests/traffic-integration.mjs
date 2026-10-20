// Gerçek fizik + gerçek AI: trafik arabaları yolda kalıyor mu, kırmızıda duruyor mu, ortalama hız, çarpışma.
import { PhysicsWorld } from '../src/physics/PhysicsWorld.js';
import { AiCore, KIND } from '../src/ai/AiCore.js';
import { chunkColliders, chunkId, CITY } from '../src/world/cityLayout.js';
import { PHYSICS_DT } from '../src/config/constants.js';
import { VEHICLES } from '../src/physics/vehicleSpecs.js';
const R = 3, N = +(process.argv[2] ?? 8), SECS = +(process.argv[3] ?? 90);
const pw = await PhysicsWorld.create({ solverIterations: 4 }); pw.loadChunk('ground', [[0, -0.5, -150, 1300, 0.5, 850, 'grass']]);
for (let i = -R; i <= R; i++) for (let j = -R; j <= R; j++) pw.loadChunk(chunkId(i, j), chunkColliders(i, j));
const core = new AiCore(11); core.player = { x: 0, z: 0, vx: 0, vz: 0, yaw: 0, inVeh: false, speed: 0, alive: true };
const specs = ['sedan', 'suv', 'pickup', 'coupe', 'van', 'sedan', 'suv', 'sedan'], cars = []; let idx = 1;
for (let k = 0; k < N; k++) { const sp = specs[k % specs.length], rows = VEHICLES[sp].wheels.map((_, i) => idx + 1 + i); const e = pw.spawn({ index: idx, kind: 'vehicle', spec: sp, position: [0, 3, 0], agent: k, wheelRows: rows }); idx += 6; const a = core.register(k, KIND.CAR, sp); cars.push({ e, a }); }
let impacts = 0, maxOff = 0, offSamples = 0, samples = 0, speedSum = 0, stopSamples = 0, flips = 0;
const yawOf = (q) => Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.x * q.x + q.y * q.y));
const T0 = performance.now(); let nextAi = 0, spawnedAt = 0;
for (let s = 0; s < SECS / PHYSICS_DT; s++) {
  const t = s * PHYSICS_DT;
  if (t >= nextAi) {
    nextAi += 0.1;
    const arr = []; for (const { e, a } of cars) { const tr = e.body.translation(), q = e.body.rotation(), lv = e.body.linvel(), sp = Math.hypot(lv.x, lv.z); arr.push(a.slot, tr.x, tr.z, yawOf(q), sp, lv.x, lv.z, 1 - 2 * (q.x * q.x + q.z * q.z) > 0.3 ? 1 : 0); }
    core.setState(arr, null); core.tick(0.1); pw.agent.set(core.ctl);
  }
  pw.step(); for (const ev of pw.events) if (ev.type === 'impact') impacts++; pw.events.length = 0;
  if (s % 120 === 0 && t > 20) for (const { e, a } of cars) { if (!a.spawned) continue; const tr = e.body.translation(), lv = e.body.linvel(), sp = Math.hypot(lv.x, lv.z); samples++; speedSum += sp; if (sp < 0.4) stopSamples++;
    const rx = ((tr.x / CITY.CELL + 6.5) % 1 + 1) % 1, rz = ((tr.z / CITY.CELL + 6.5) % 1 + 1) % 1, d = Math.min(Math.min(rx, 1 - rx), Math.min(rz, 1 - rz)) * CITY.CELL; maxOff = Math.max(maxOff, d); if (d > 9) offSamples++; if (e.body.rotation && 1 - 2 * (e.body.rotation().x ** 2 + e.body.rotation().z ** 2) < 0.5) flips++; }
}
const el = (performance.now() - T0) / 1000;
console.log(`${N} araç, ${SECS} sn simülasyon (${el.toFixed(0)} sn gerçek): ort. hız ${(speedSum / samples * 3.6).toFixed(1)} km/h, duran örnek %${(stopSamples / samples * 100).toFixed(0)}, yol dışı örnek %${(offSamples / samples * 100).toFixed(1)}, maks sapma ${maxOff.toFixed(1)} m, çarpma olayı ${impacts}, devrilme ${flips}`);
for (const { e, a } of cars.slice(0, 3)) { const tr = e.body.translation(); console.log('slot', a.slot, 'spawned', a.spawned, 'pos', tr.x.toFixed(0), tr.y.toFixed(2), tr.z.toFixed(0), 'ai', a.x.toFixed(0), a.z.toFixed(0), 'thr', a.thr?.toFixed(2), 'brk', a.brk?.toFixed(2), 'steer', a.steer?.toFixed(2), 'speed', a.speed.toFixed(1), 'flags', pw.agent[a.slot * 8], 'disabled', e.disabled, 'parked', e.parked, 'sleep', e.body.isSleeping(), 'wps', a.wps.length, 'next', a.next); }
