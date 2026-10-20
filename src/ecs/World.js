// Minimal ECS: varlık = sayı, bileşen = tipe göre Map<varlık, veri>, sistem = {order, update(dt, ctx)}.
export class World {
  constructor() { this.nextId = 1; this.stores = new Map(); this.systems = []; this._tmp = []; }

  create() { return this.nextId++; }
  _store(type) { let s = this.stores.get(type); if (!s) this.stores.set(type, (s = new Map())); return s; }
  add(id, type, data) { this._store(type).set(id, data); return data; }
  get(id, type) { return this.stores.get(type)?.get(id); }
  has(id, type) { return !!this.stores.get(type)?.has(id); }
  remove(id, type) { this.stores.get(type)?.delete(id); }
  destroy(id) { for (const s of this.stores.values()) s.delete(id); }
  count(type) { return this.stores.get(type)?.size ?? 0; }

  /** types içindeki tüm bileşenlere sahip varlıklar için cb(id, a, b, c, d) çağırır (en küçük depoyu gezer). */
  each(types, cb) {
    let small = null;
    for (const t of types) { const s = this.stores.get(t); if (!s) return; if (!small || s.size < small.size) small = s; }
    const tmp = this._tmp;
    outer: for (const id of small.keys()) {
      for (let i = 0; i < types.length; i++) { const c = this.stores.get(types[i]).get(id); if (c === undefined) continue outer; tmp[i] = c; }
      cb(id, tmp[0], tmp[1], tmp[2], tmp[3]);
    }
  }

  addSystem(sys) { this.systems.push(sys); this.systems.sort((a, b) => a.order - b.order); return this; }
  update(dt, ctx) { for (const s of this.systems) s.update(dt, ctx); }
}
