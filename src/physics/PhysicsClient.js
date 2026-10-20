// Ana thread tarafındaki fizik arayüzü: worker'ı yönetir, anlık görüntüyü okur, interpolasyon yapar.
import { MAX_BODIES, PHYSICS_DT, QUALITY, MAX_AGENTS, AGENT_STRIDE } from '../config/constants.js';
import { Snapshot, snapshotByteLength, readSnapshot, HDR, STRIDE, TELE } from './SnapshotLayout.js';
import { INPUT_FLOATS, IN } from './InputLayout.js';
import { VEHICLES } from './vehicleSpecs.js';

export class PhysicsClient {
  constructor({ quality = 'medium' } = {}) {
    this.quality = quality; this.nextIndex = 0;
    this.shared = typeof SharedArrayBuffer !== 'undefined' && globalThis.crossOriginIsolated === true;
    this.local = new Snapshot(new ArrayBuffer(snapshotByteLength(MAX_BODIES)), MAX_BODIES);
    this.remote = null; this.input = new Float32Array(INPUT_FLOATS); this.input[IN.CHAR_INDEX] = -1; this.input[IN.VEH_INDEX] = -1;
    this.alpha = 1; this.listeners = new Map(); this.debugBuffers = null; this.errors = [];
  }

  async init(timeoutMs = 20000) {
    this.worker = new Worker(new URL('./physics.worker.js', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e) => this._onMessage(e.data);
    this.worker.onerror = (e) => { const msg = `Fizik worker hatası: ${e.message} (${e.filename}:${e.lineno})`; console.error(msg); this.errors.push(msg); this._fail?.(new Error(msg)); };
    let snapshotBuffer, inputBuffer;
    if (this.shared) {
      snapshotBuffer = new SharedArrayBuffer(snapshotByteLength(MAX_BODIES)); inputBuffer = new SharedArrayBuffer(INPUT_FLOATS * 4);
      this.remote = new Snapshot(snapshotBuffer, MAX_BODIES); this.input = new Float32Array(inputBuffer); this.input[IN.CHAR_INDEX] = -1; this.input[IN.VEH_INDEX] = -1;
    }
    const ready = new Promise((res, rej) => { this._ready = res; this._fail = rej; setTimeout(() => rej(new Error(`Fizik motoru ${timeoutMs / 1000} sn içinde başlamadı (Rapier WASM yüklenemedi mi?)`)), timeoutMs); });
    this.worker.postMessage({ type: 'init', solverIterations: QUALITY[this.quality].solverIterations, snapshotBuffer, inputBuffer });
    await ready;
  }

  on(type, fn) { (this.listeners.get(type) ?? this.listeners.set(type, []).get(type)).push(fn); }
  _emit(type, data) { for (const fn of this.listeners.get(type) ?? []) fn(data); }
  _onMessage(m) {
    switch (m.type) {
      case 'ready': this._ready(); break;
      case 'started': this._emit('started'); break;
      case 'snapshot': this.remote = new Snapshot(m.buffer, MAX_BODIES); break;
      case 'events': for (const ev of m.events) this._emit(ev.type, ev); break;
      case 'debug': this.debugBuffers = { vertices: m.vertices, colors: m.colors }; break;
      case 'error': console.error('[fizik]', m.message); this.errors.push(m.message); this._emit('error', m); break;
    }
  }

  alloc(n = 1) { if (this.nextIndex + n > MAX_BODIES) throw new Error('MAX_BODIES aşıldı'); const i = this.nextIndex; this.nextIndex += n; return i; }
  spawn(desc) { desc.index = desc.index ?? this.alloc(1); this.worker.postMessage({ type: 'spawn', desc }); return desc.index; }
  spawnChar(o) { const index = this.alloc(1); this.worker.postMessage({ type: 'spawn', desc: { index, kind: 'character', position: o.position, yaw: o.yaw ?? 0, agent: o.agent ?? -1, health: o.health ?? 100 } }); return index; }
  spawnVehicle(spec, o) {
    const n = VEHICLES[spec].wheels.length, index = this.alloc(1 + n), wheelRows = Array.from({ length: n }, (_, i) => index + 1 + i);
    this.worker.postMessage({ type: 'spawn', desc: { index, kind: 'vehicle', spec, position: o.position, yaw: o.yaw ?? 0, agent: o.agent ?? -1, wheelRows } });
    return { index, wheelRows };
  }
  initRagdolls(count) { const rows = Array.from({ length: count }, () => { const s = this.alloc(11); return Array.from({ length: 11 }, (_, i) => s + i); }); this.worker.postMessage({ type: 'ragdolls', count, rows }); this.ragdollRows = rows; return rows; }
  loadChunk(id, boxes) { this.worker.postMessage({ type: 'chunk', id, boxes }); }
  unloadChunk(id) { this.worker.postMessage({ type: 'unchunk', id }); }
  setAgents(ctl) { this.worker.postMessage({ type: 'agents', ctl }, [ctl.buffer]); }
  start() { this.worker.postMessage({ type: 'start' }); }
  teleport(index, position, yaw) { this.worker.postMessage({ type: 'teleport', index, position, yaw }); }
  setLinvel(index, v) { this.worker.postMessage({ type: 'linvel', index, v }); }
  setWind(x, y, z) { this.worker.postMessage({ type: 'wind', x, y, z }); }
  setWet(wet) { this.worker.postMessage({ type: 'weather', wet }); }
  fire(f) { this.worker.postMessage({ type: 'fire', f }); }
  pause(on) { this.worker.postMessage({ type: 'pause', on }); }
  explode(x, y, z, tnt) { this.worker.postMessage({ type: 'explode', x, y, z, tnt }); }
  setDebug(on) { this.worker.postMessage({ type: 'debug', on }); }
  damage(index, amount, cause) { this.worker.postMessage({ type: 'damage', index, amount, cause }); }
  heal(index, amount) { this.worker.postMessage({ type: 'heal', index, amount }); }
  flushInput() { if (!this.shared) this.worker.postMessage({ type: 'input', data: this.input }); }

  update() {
    if (!this.remote || this.nextIndex === 0) return;
    readSnapshot(this.remote, this.local, this.nextIndex);
    const h = this.local.hdr, nowAbs = performance.timeOrigin + performance.now();
    const a = (h[HDR.ACC] + (nowAbs - h[HDR.WALL_ABS]) / 1000) / PHYSICS_DT; this.alpha = a < 0 ? 0 : a > 1 ? 1 : a;
  }
  sample(index, out) {
    const o = index * STRIDE, p = this.local.prev, c = this.local.curr, a = this.alpha;
    out.px = p[o] + (c[o] - p[o]) * a; out.py = p[o + 1] + (c[o + 1] - p[o + 1]) * a; out.pz = p[o + 2] + (c[o + 2] - p[o + 2]) * a;
    let qx = p[o + 3], qy = p[o + 4], qz = p[o + 5], qw = p[o + 6], rx = c[o + 3], ry = c[o + 4], rz = c[o + 5], rw = c[o + 6];
    if (qx * rx + qy * ry + qz * rz + qw * rw < 0) { rx = -rx; ry = -ry; rz = -rz; rw = -rw; }
    qx += (rx - qx) * a; qy += (ry - qy) * a; qz += (rz - qz) * a; qw += (rw - qw) * a;
    const l = Math.hypot(qx, qy, qz, qw) || 1; out.qx = qx / l; out.qy = qy / l; out.qz = qz / l; out.qw = qw / l; out.flags = c[o + 7];
    return out;
  }
  tele(index) { const k = index * TELE, t = this.local.tele; return { rpm: t[k], gear: t[k + 1], slip: t[k + 2], health: t[k + 3], speed: t[k + 4], brake: t[k + 5], steer: t[k + 6], dead: t[k + 7] }; }
  charTele(index) { const k = index * TELE, t = this.local.tele; return { stamina: t[k + 1], health: t[k + 3], dead: t[k + 7] }; }
  get header() { return this.local.hdr; }
  velocity(index, out) { const o = index * STRIDE, p = this.local.prev, c = this.local.curr; out.x = (c[o] - p[o]) / PHYSICS_DT; out.y = (c[o + 1] - p[o + 1]) / PHYSICS_DT; out.z = (c[o + 2] - p[o + 2]) / PHYSICS_DT; }
}
