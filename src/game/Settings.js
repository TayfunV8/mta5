// Ayarlar + kayıt (localStorage). Bozuk/uyumsuz veri güvenle yok sayılır.
const SKEY = 'leonida.settings.v1', GKEY = 'leonida.save.v1';
export const DEFAULTS = { master: 0.8, sfx: 1, ambient: 0.6, mute: false, quality: 'medium', sens: 1, camDist: 3.6, fps: false, hour: 17.5, autoTime: false, rain: false, invertY: false };
export const Settings = {
  data: { ...DEFAULTS },
  load() { try { const j = JSON.parse(localStorage.getItem(SKEY) ?? 'null'); if (j && typeof j === 'object') for (const k of Object.keys(DEFAULTS)) if (typeof j[k] === typeof DEFAULTS[k]) this.data[k] = j[k]; } catch (e) { console.warn('[ayarlar] bozuk kayıt yok sayıldı', e); } return this.data; },
  save() { try { localStorage.setItem(SKEY, JSON.stringify(this.data)); } catch (e) { console.warn('[ayarlar] kaydedilemedi', e); } },
  set(k, v) { this.data[k] = v; this.save(); },
};

const num = (v, d, lo = -1e9, hi = 1e9) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
export const SaveGame = {
  VERSION: 1,
  exists() { try { return !!localStorage.getItem(GKEY); } catch { return false; } },
  /** {ok, data} | {ok:false, reason} — veriyi doğrular. */
  read() {
    let raw; try { raw = localStorage.getItem(GKEY); } catch (e) { return { ok: false, reason: 'depolama erişilemedi' }; }
    if (!raw) return { ok: false, reason: 'kayıt yok' };
    try {
      const j = JSON.parse(raw);
      if (!j || j.v !== this.VERSION) return { ok: false, reason: 'uyumsuz sürüm' };
      const p = j.player ?? {};
      const data = { v: 1, player: { x: num(p.x, 0, -2000, 2000), y: num(p.y, 1.2, -50, 400), z: num(p.z, 40, -2000, 2000), health: num(p.health, 100, 1, 100), money: Math.floor(num(p.money, 0, 0, 1e9)), char: p.char === 'jason' ? 'jason' : 'lucia' },
        completed: Array.isArray(j.completed) ? j.completed.filter((x) => typeof x === 'string').slice(0, 20) : [], active: j.active && typeof j.active.id === 'string' ? { id: j.active.id, state: j.active.state ?? null } : null, hour: num(j.hour, 17.5, 0, 24), time: num(j.time, 0) };
      return { ok: true, data };
    } catch (e) { return { ok: false, reason: 'bozuk veri (' + e.message + ')' }; }
  },
  write(d) { try { localStorage.setItem(GKEY, JSON.stringify({ ...d, v: this.VERSION })); return true; } catch (e) { console.warn('[kayıt] yazılamadı', e); return false; } },
  reset() { try { localStorage.removeItem(GKEY); } catch {} },
};
