import { CITY, blockContent, chunkColliders, chunkId, inWorld, worldToBlock } from '../world/cityLayout.js';
import { buildChunk } from '../render/CityChunk.js';

// Şehir parçalarını oyuncu çevresinde yükler/boşaltır (görsel + fizik çarpışmaları + kamera çarpışma kutuları).
export class ChunkManager {
  constructor(game) { this.g = game; this.loaded = new Map(); this.radius = 3; this.sigT = 0; this.queue = []; }
  setQuality(q) { this.radius = { low: 2, medium: 3, high: 4 }[q] ?? 3; }
  _load(bi, bj) {
    const id = chunkId(bi, bj), B = blockContent(bi, bj), g = this.g;
    const chunk = buildChunk(B, g.mats, { shadows: g.renderer.cfg.shadow === 1 });
    g.renderer.scene.add(chunk.group); this.loaded.set(id, chunk);
    g.physics.loadChunk(id, chunkColliders(bi, bj)); g.world.addChunk(id, bi, bj);
  }
  _unload(id) { const c = this.loaded.get(id); if (!c) return; this.g.renderer.scene.remove(c.group); c.dispose(); this.loaded.delete(id); this.g.physics.unloadChunk(id); this.g.world.removeChunk(id); }
  /** Başlangıçta yarıçap içindekileri hemen yükle (ilerleme geri çağrısıyla). */
  preload(x, z, onProgress) {
    const [ci, cj] = worldToBlock(x, z), list = [];
    for (let i = -this.radius; i <= this.radius; i++) for (let j = -this.radius; j <= this.radius; j++) if (inWorld(ci + i, cj + j)) list.push([ci + i, cj + j, Math.hypot(i, j)]);
    list.sort((a, b) => a[2] - b[2]); list.forEach(([bi, bj], k) => { this._load(bi, bj); onProgress?.((k + 1) / list.length); });
  }
  update(dt, x, z, simTime) {
    const [ci, cj] = worldToBlock(x, z), want = new Set();
    for (let i = -this.radius; i <= this.radius; i++) for (let j = -this.radius; j <= this.radius; j++) if (inWorld(ci + i, cj + j)) want.add(chunkId(ci + i, cj + j));
    for (const id of this.loaded.keys()) { const [a, b] = id.split(',').map(Number); if (Math.abs(a - ci) > this.radius + 1 || Math.abs(b - cj) > this.radius + 1) this._unload(id); }
    let n = 0; const need = [...want].filter((id) => !this.loaded.has(id)).map((id) => { const [a, b] = id.split(',').map(Number); return [a, b, Math.hypot(a - ci, b - cj)]; }).sort((p, q) => p[2] - q[2]);
    for (const [a, b] of need) { if (n++ >= 1) break; this._load(a, b); }          // kare başına en fazla 1 parça: takılma yok
    this.sigT -= dt;
    for (const [id, c] of this.loaded) { const [a, b] = id.split(',').map(Number), near = Math.hypot(a - ci, b - cj) <= 2.2; c.details.visible = near; if (this.sigT <= 0 && near) c.updateSignals(simTime); }
    if (this.sigT <= 0) this.sigT = 0.4;
  }
}
