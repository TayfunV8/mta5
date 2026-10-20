// Merkezi etkileşim sistemi: tüm "E" etkileşimleri burada kayıtlı; sadece yakındayken ipucu gösterilir.
export class Interaction {
  constructor() { this.items = []; this.current = null; this.providers = []; }
  /** Sabit etkileşim: {id, pos:{x,z}, radius, prompt:string|fn, enabled:fn, onUse:fn} */
  add(it) { this.items.push(it); return it; }
  remove(id) { this.items = this.items.filter((i) => i.id !== id); }
  /** Dinamik sağlayıcı: fonksiyon (px,pz,state) -> aday listesi (araçlar gibi). */
  addProvider(fn) { this.providers.push(fn); }
  update(px, pz, state) {
    let best = null, bd = Infinity;
    const consider = (it) => { if (it.enabled && !it.enabled(state)) return; const d = Math.hypot(it.pos.x - px, it.pos.z - pz); if (d <= it.radius && d < bd) { best = it; bd = d; } };
    for (const it of this.items) consider(it);
    for (const p of this.providers) for (const it of p(px, pz, state)) consider(it);
    this.current = best; return best;
  }
  prompt(state) { const c = this.current; if (!c) return ''; return typeof c.prompt === 'function' ? c.prompt(state) : c.prompt; }
  use(state) { if (this.current) { this.current.onUse(state); return true; } return false; }
}
