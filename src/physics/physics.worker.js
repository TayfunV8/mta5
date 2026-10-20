// Fizik worker'ı: sabit 240 Hz adım, anlık görüntüyü SharedArrayBuffer'a (veya transfer ile) yayınlar.
import { PhysicsWorld } from './PhysicsWorld.js';
import { FixedStepper } from './FixedStepper.js';
import { Snapshot, snapshotByteLength, HDR, STRIDE, TELE } from './SnapshotLayout.js';
import { PHYSICS_DT, MAX_BODIES, MAX_STEPS_PER_TICK, MAX_FRAME_TIME } from '../config/constants.js';
import { INPUT_FLOATS } from './InputLayout.js';

let pw = null, snap = null, input = null, sharedMode = false;
const stepper = new FixedStepper(PHYSICS_DT, MAX_STEPS_PER_TICK, MAX_FRAME_TIME);
const prevLocal = new Float32Array(MAX_BODIES * STRIDE), currLocal = new Float32Array(MAX_BODIES * STRIDE), teleLocal = new Float32Array(MAX_BODIES * TELE);
let bodyCount = 0, running = false, dirty = true, last = 0;
let simTime = 0, stepsTotal = 0, emaMs = 0, maxMs = 0, maxWindowStart = 0, maxPublished = 0;
let paused = false, debugOn = false, lastDebug = 0, lastPost = 0, energy = { ke: 0, pe: 0, awake: 0 };

self.onmessage = async (e) => {
  const m = e.data;
  try {
    switch (m.type) {
      case 'init': {
        pw = await PhysicsWorld.create({ solverIterations: m.solverIterations });
        sharedMode = !!m.snapshotBuffer;
        snap = new Snapshot(m.snapshotBuffer ?? new ArrayBuffer(snapshotByteLength(MAX_BODIES)), MAX_BODIES);
        input = new Float32Array(m.inputBuffer ?? new ArrayBuffer(INPUT_FLOATS * 4)); input[6] = -1; input[7] = -1;
        self.postMessage({ type: 'ready', sharedMode });
        break;
      }
      case 'spawn': { const entry = pw.spawn(m.desc); bodyCount = Math.max(bodyCount, m.desc.index + 1 + (m.desc.wheelRows ? 0 : 0)); if (m.desc.wheelRows) bodyCount = Math.max(bodyCount, ...m.desc.wheelRows.map((r) => r + 1)); pw.captureEntry(entry, prevLocal, teleLocal); pw.captureEntry(entry, currLocal, teleLocal); dirty = true; break; }
      case 'ragdolls': pw.initRagdolls(m.count, (k) => m.rows[k]); for (const r of m.rows) bodyCount = Math.max(bodyCount, Math.max(...r) + 1); dirty = true; break;
      case 'remove': pw.remove(m.index); break;
      case 'chunk': pw.loadChunk(m.id, m.boxes); break;
      case 'unchunk': pw.unloadChunk(m.id); break;
      case 'agents': pw.setAgents(m.ctl); break;
      case 'start': {
        pw.world.step(); pw.capture(prevLocal, teleLocal); pw.capture(currLocal, teleLocal);
        running = true; last = performance.now(); maxWindowStart = last; publish(0, true);
        self.postMessage({ type: 'started' }); tick(); break;
      }
      case 'input': if (input) input.set(m.data); break;
      case 'wind': pw.wind = { x: m.x, y: m.y, z: m.z }; break;
      case 'weather': pw.weather.wet = m.wet; break;
      case 'teleport': { pw.teleport(m.index, m.position, m.yaw); const en = pw.entries.get(m.index); if (en) { pw.captureEntry(en, prevLocal, teleLocal); pw.captureEntry(en, currLocal, teleLocal); } dirty = true; break; }
      case 'linvel': pw.setLinvel(m.index, m.v); break;
      case 'damage': { const en = pw.entries.get(m.index); if (en?.char) pw.damageChar(en, m.amount, m.cause ?? 'script', -1); break; }
      case 'heal': { const en = pw.entries.get(m.index); if (en?.char) { en.char.health = Math.min(en.char.maxHealth, en.char.health + m.amount); en.char.dead = false; } if (en?.veh) en.veh.health = Math.min(100, en.veh.health + m.amount); break; }
      case 'debug': debugOn = !!m.on; break;
      case 'pause': paused = !!m.on; last = performance.now(); break;
      case 'fire': pw.fire(m.f); break;
      case 'explode': pw.explode(m.x, m.y, m.z, m.tnt); break;
    }
  } catch (err) { self.postMessage({ type: 'error', message: String((err && err.stack) || err) }); }
};

function tick() {
  if (!running) return;
  try {
    const now = performance.now();
    if (paused) { last = now; setTimeout(tick, 16); return; }
    const steps = stepper.advance((now - last) / 1000); last = now;
    for (let i = 0; i < steps; i++) {
      if (i === steps - 1) pw.capture(prevLocal, teleLocal);
      const s0 = performance.now();
      pw.input.set(input); pw.step();
      const ms = performance.now() - s0; emaMs = emaMs * 0.98 + ms * 0.02; if (ms > maxMs) maxMs = ms;
    }
    if (steps > 0) { pw.capture(currLocal, teleLocal); simTime += steps * PHYSICS_DT; stepsTotal += steps; if ((stepsTotal & 15) < steps) energy = pw.computeEnergy(); }
    if (now - maxWindowStart > 1000) { maxPublished = maxMs; maxMs = 0; maxWindowStart = now; }
    if (sharedMode || now - lastPost > 8) { publish(steps, steps > 0 || dirty); lastPost = now; }
    if (pw.events.length) { self.postMessage({ type: 'events', events: pw.events }); pw.events = []; }
    if (debugOn && now - lastDebug > 100) { lastDebug = now; const b = pw.debugRender(); self.postMessage({ type: 'debug', vertices: b.vertices, colors: b.colors }, [b.vertices.buffer, b.colors.buffer]); }
  } catch (err) { self.postMessage({ type: 'error', message: String((err && err.stack) || err) }); }
  setTimeout(tick, 1);
}

function publish(steps, copyBodies) {
  const n = bodyCount * STRIDE, h = snap.hdr;
  Atomics.add(snap.ctrl, 0, 1);
  if (copyBodies) { snap.prev.set(prevLocal.subarray(0, n)); snap.curr.set(currLocal.subarray(0, n)); snap.tele.set(teleLocal.subarray(0, bodyCount * TELE)); dirty = false; }
  h[HDR.SIM_TIME] = simTime; h[HDR.WALL_ABS] = performance.timeOrigin + performance.now(); h[HDR.ACC] = stepper.acc;
  h[HDR.PHYS_MS_AVG] = emaMs; h[HDR.PHYS_MS_MAX] = maxPublished; h[HDR.KE] = energy.ke; h[HDR.PE] = energy.pe; h[HDR.AWAKE] = energy.awake;
  h[HDR.STEPS_LAST] = steps; h[HDR.DROPPED] = stepper.droppedTime; h[HDR.BODY_COUNT] = bodyCount; h[HDR.STEPS_TOTAL] = stepsTotal;
  Atomics.add(snap.ctrl, 0, 1);
  if (!sharedMode) { const copy = snap.buffer.slice(0); self.postMessage({ type: 'snapshot', buffer: copy }, [copy]); }
}
