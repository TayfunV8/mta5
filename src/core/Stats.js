// FPS, kare süresi, bellek ve 10 sn'lik performans raporu (F4).
export class Stats {
  constructor() {
    this.ring = new Float32Array(300); this.n = 0; this.i = 0;
    this.fps = 0; this.frameMs = 0; this.capture = null; this.lastReport = null;
  }
  frame(dtMs, physHdr, renderInfo) {
    this.ring[this.i] = dtMs; this.i = (this.i + 1) % this.ring.length; this.n = Math.min(this.n + 1, this.ring.length);
    let sum = 0; const k = Math.min(this.n, 60);
    for (let j = 0; j < k; j++) sum += this.ring[(this.i - 1 - j + this.ring.length) % this.ring.length];
    this.frameMs = sum / k; this.fps = 1000 / this.frameMs;
    if (this.capture) {
      const c = this.capture;
      c.frames.push(dtMs); c.phys.push(physHdr.avg); c.physMax = Math.max(c.physMax, physHdr.max);
      c.draw = renderInfo.calls; c.tris = renderInfo.triangles;
      if (performance.now() - c.t0 >= c.seconds * 1000) this._finish();
    }
  }
  memoryMB() { return performance.memory ? performance.memory.usedJSHeapSize / 1048576 : null; }
  startReport(seconds = 10) {
    this.capture = { seconds, t0: performance.now(), frames: [], phys: [], physMax: 0, mem0: this.memoryMB(), draw: 0, tris: 0 };
  }
  _finish() {
    const c = this.capture, f = c.frames.slice().sort((a, b) => a - b);
    const avg = f.reduce((a, b) => a + b, 0) / f.length;
    const p99 = f[Math.min(f.length - 1, Math.floor(f.length * 0.99))];
    const r = {
      sure_s: c.seconds, ortalama_fps: +(1000 / avg).toFixed(1), yuzde1_dusuk_fps: +(1000 / p99).toFixed(1),
      kare_ms_ort: +avg.toFixed(2), fizik_ms_ort: +(c.phys.reduce((a, b) => a + b, 0) / c.phys.length).toFixed(3),
      fizik_ms_maks: +c.physMax.toFixed(3), bellek_basi_MB: c.mem0 && +c.mem0.toFixed(1), bellek_sonu_MB: this.memoryMB() && +this.memoryMB().toFixed(1),
      cizim_cagrisi: c.draw, ucgen: c.tris,
    };
    this.lastReport = r; this.capture = null;
    console.log('%cPERFORMANS RAPORU', 'font-weight:bold'); console.table(r);
  }
}
