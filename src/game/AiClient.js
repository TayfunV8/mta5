// Ana thread <-> AI worker köprüsü: ajan durumlarını 10 Hz gönderir, kumandaları fizik worker'ına iletir.
export class AiClient {
  constructor(physics) { this.physics = physics; this.anim = new Float32Array(128); this.wanted = { heat: 0, level: 0, seen: false, searching: false, unseen: 0 }; this.errors = []; this.ready = false; }
  async init(timeoutMs = 15000) {
    this.worker = new Worker(new URL('../ai/ai.worker.js', import.meta.url), { type: 'module' });
    const ready = new Promise((res, rej) => { this._res = res; this._rej = rej; setTimeout(() => rej(new Error('Yapay zeka (AI worker) başlamadı')), timeoutMs); });
    this.worker.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'ready') { this.ready = true; this._res(); }
      else if (m.type === 'ctl') { this.anim = m.anim; this.wanted = m.wanted; this.physics.setAgents(m.ctl); }
      else if (m.type === 'error') { console.error('[ai]', m.message); this.errors.push(m.message); }
    };
    this.worker.onerror = (e) => { const msg = `AI worker hatası: ${e.message}`; console.error(msg); this.errors.push(msg); this._rej?.(new Error(msg)); };
    this.worker.postMessage({ type: 'init', seed: 20261017 }); await ready;
  }
  register(list) { this.worker.postMessage({ type: 'register', list }); }
  start() { this.worker.postMessage({ type: 'start' }); }
  state(agents, player, tod, pop) { this.worker.postMessage({ type: 'state', agents, player, tod, pop }); }
  event(event) { this.worker.postMessage({ type: 'event', event }); }
  setKind(slot, kind) { this.worker.postMessage({ type: 'kind', slot, kind }); }
}
