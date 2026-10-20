// Worker protokolü (SharedArrayBuffer + seqlock + interpolasyon) Node worker_threads ile doğrulanır.
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { Snapshot, snapshotByteLength, readSnapshot, HDR, STRIDE } from '../src/physics/SnapshotLayout.js';
import { MAX_BODIES, PHYSICS_DT } from '../src/config/constants.js';
import { INPUT_FLOATS, IN } from '../src/physics/InputLayout.js';

const boot = `
import { parentPort } from 'node:worker_threads';
globalThis.self = globalThis;
globalThis.postMessage = (m, t) => parentPort.postMessage(m, t);
parentPort.on('message', (d) => globalThis.onmessage({ data: d }));
await import(${JSON.stringify(new URL('../src/physics/physics.worker.js', import.meta.url).href)});
parentPort.postMessage({ type: 'booted' });
`;
const w = new Worker(boot, { eval: true });
const wait = (type) => new Promise((res) => { const f = (m) => { if (m.type === type) { w.off('message', f); res(m); } }; w.on('message', f); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (n, c, i = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n}  ${i}`); };

await wait('booted');
const sab = new SharedArrayBuffer(snapshotByteLength(MAX_BODIES)), inb = new SharedArrayBuffer(INPUT_FLOATS * 4);
const remote = new Snapshot(sab, MAX_BODIES), local = new Snapshot(new ArrayBuffer(snapshotByteLength(MAX_BODIES)), MAX_BODIES);
const input = new Float32Array(inb);
w.postMessage({ type: 'init', solverIterations: 4, snapshotBuffer: sab, inputBuffer: inb });
await wait('ready');
w.postMessage({ type: 'spawn', desc: { index: 0, kind: 'static', shape: { type: 'box', hx: 100, hy: 0.5, hz: 100 }, position: [0, -0.5, 0], material: 'asphalt' } });
w.postMessage({ type: 'spawn', desc: { index: 1, kind: 'character', position: [0, 3, 0], yaw: 0 } });
w.postMessage({ type: 'spawn', desc: { index: 2, kind: 'dynamic', shape: { type: 'box', hx: .4, hy: .4, hz: .4 }, position: [3, 5, 0], mass: 20, material: 'wood' } });
w.postMessage({ type: 'start' });
await wait('started');

input[IN.MOVE_Z] = 1;
let torn = 0, reads = 0, lastSim = -1, monotonic = true, alphaOk = true;
const t0 = Date.now();
while (Date.now() - t0 < 3000) {
  reads++;
  if (!readSnapshot(remote, local, 3)) torn++;
  const h = local.hdr;
  if (h[HDR.SIM_TIME] < lastSim) monotonic = false; lastSim = h[HDR.SIM_TIME];
  const a = (h[HDR.ACC] + (performance.timeOrigin + performance.now() - h[HDR.WALL_ABS]) / 1000) / PHYSICS_DT;
  if (!(a >= 0 && a < 50)) alphaOk = false;
  await sleep(4);
}
const h = local.hdr, simT = h[HDR.SIM_TIME], real = (Date.now() - t0) / 1000;
const c = local.curr, p = local.prev;
ok('Sim süresi gerçek süreyle uyumlu (240 Hz sabit adım)', Math.abs(simT - (real + 0.0)) < 0.5, `sim=${simT.toFixed(2)}s gerçek≈${real.toFixed(2)}s`);
ok('Sim zamanı monoton', monotonic);
ok('Alpha makul aralıkta', alphaOk);
ok('Yırtılmış okuma yok / seqlock çalışıyor', torn === 0, `okuma=${reads} yırtık=${torn}`);
ok('Karakter ileri (-Z) yürüdü ve yerde', c[1 * STRIDE + 2] < -4 && (c[1 * STRIDE + 7] & 4) !== 0, `z=${c[1 * STRIDE + 2].toFixed(2)} flags=${c[1 * STRIDE + 7]}`);
ok('Sandık düştü ve duruyor (y≈0.4)', Math.abs(c[2 * STRIDE + 1] - 0.4) < 0.05, `y=${c[2 * STRIDE + 1].toFixed(3)}`);
ok('prev ≈ curr bir adım farkıyla (interpolasyon verisi)', Math.hypot(c[STRIDE + 2] - p[STRIDE + 2]) < 0.2);
ok('Fizik adım süresi ölçülüyor', h[HDR.PHYS_MS_AVG] > 0 && h[HDR.PHYS_MS_AVG] < 4, `ort=${h[HDR.PHYS_MS_AVG].toFixed(3)} ms maks=${h[HDR.PHYS_MS_MAX].toFixed(2)} ms`);
console.log(`\n${pass} geçti, ${fail} kaldı`);
await w.terminate();
process.exit(fail ? 1 : 0);
