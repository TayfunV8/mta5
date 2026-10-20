// F3: istatistik paneli + enerji grafiği (KE, PE, toplam).
import { HDR } from '../physics/SnapshotLayout.js';

export class DebugOverlay {
  constructor() {
    this.el = document.getElementById('debug');
    this.text = document.createElement('pre'); this.el.appendChild(this.text);
    this.cv = document.createElement('canvas'); this.cv.width = 300; this.cv.height = 90; this.el.appendChild(this.cv);
    this.g = this.cv.getContext('2d'); this.hist = []; this.acc = 0; this.visible = false;
  }
  setVisible(v) { this.visible = v; this.el.style.display = v ? 'block' : 'none'; }
  update(dt, ctx) {
    if (!this.visible) return;
    this.acc += dt; if (this.acc < 1 / 30) return; this.acc = 0;
    const h = ctx.physics.header, s = ctx.stats, mem = s.memoryMB(), info = ctx.renderer.gl.info;
    this.hist.push([h[HDR.KE], h[HDR.PE]]); if (this.hist.length > 300) this.hist.shift();
    const rep = s.lastReport;
    this.text.textContent =
`FPS ${s.fps.toFixed(0)}  (${s.frameMs.toFixed(1)} ms)   bellek ${mem ? mem.toFixed(0) + ' MB' : 'n/a'}
fizik ${h[HDR.PHYS_MS_AVG].toFixed(3)} ms/adım  maks ${h[HDR.PHYS_MS_MAX].toFixed(2)} ms
adım/tur ${h[HDR.STEPS_LAST]}  toplam ${h[HDR.STEPS_TOTAL]}  atılan ${h[HDR.DROPPED].toFixed(2)} s
cisim ${h[HDR.BODY_COUNT]}  uyanık ${h[HDR.AWAKE]}  alpha ${ctx.physics.alpha.toFixed(2)}
mod: ${ctx.physics.shared ? 'SharedArrayBuffer' : 'postMessage (COOP/COEP yok)'}  WebGPU: ${ctx.renderer.webgpuAvailable ? 'var' : 'yok'}
çizim ${info.render.calls}  üçgen ${info.render.triangles}
${rep ? 'RAPOR ort ' + rep.ortalama_fps + ' fps, %1 düşük ' + rep.yuzde1_dusuk_fps + ', fizik ' + rep.fizik_ms_ort + ' ms' : 'F4: 10 sn performans raporu'}
[1][2][3]: +3/+8/+15 m yüksekliğe ışınlan (düşme hasarı testi)`;
    const { g, cv } = this, W = cv.width, H = cv.height;
    g.clearRect(0, 0, W, H); g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, 0, W, H);
    let max = 1; for (const [k, p] of this.hist) max = Math.max(max, k + p, p, k);
    const line = (fn, col) => { g.strokeStyle = col; g.beginPath(); this.hist.forEach((v, i) => { const y = H - 4 - (fn(v) / max) * (H - 8); i ? g.lineTo(i, y) : g.moveTo(i, y); }); g.stroke(); };
    line((v) => v[0], '#ffa63d'); line((v) => v[1], '#38f2ff'); line((v) => v[0] + v[1], '#ffffff');
    g.fillStyle = '#ccc'; g.font = '10px monospace'; g.fillText('KE turuncu · PE camgöbeği · toplam beyaz', 4, 11);
  }
}
