// AI worker: AiCore'u 10 Hz çalıştırır. Girdi ana thread'den (ajan durumları), çıktı ajan kumandaları.
import { AiCore } from './AiCore.js';
let core = null, timer = null, last = 0;
self.onmessage = (e) => {
  const m = e.data;
  try {
    switch (m.type) {
      case 'init': core = new AiCore(m.seed ?? 1); self.postMessage({ type: 'ready' }); break;
      case 'register': for (const a of m.list) core.register(a.slot, a.kind, a.vehicle); break;
      case 'state': core.setState(m.agents, m.player); core.tod = m.tod; core.pop = m.pop ?? 1; break;
      case 'event': core.event(m.event); break;
      case 'start': last = performance.now(); timer = setInterval(() => {
        const now = performance.now(), dt = Math.min(0.25, (now - last) / 1000); last = now;
        core.tick(dt);
        self.postMessage({ type: 'ctl', ctl: core.ctl.slice(), anim: core.anim.slice(), wanted: { ...core.wanted } });
      }, 100); break;
      case 'wanted': core.wanted.heat = m.heat; core.wanted.level = 0; core.wanted.unseen = 0; break;
      case 'stop': clearInterval(timer); break;
      case 'kind': { const a = core.bySlot.get(m.slot); if (a) { a.kind = m.kind; if (m.kind === 3 || m.kind === 4) { a.spawned = true; a.active = true; } } break; }
    }
  } catch (err) { self.postMessage({ type: 'error', message: String(err && err.stack || err) }); }
};
