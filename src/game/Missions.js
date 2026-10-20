// Görev yöneticisi: 5 oynanabilir görev. Her görevin başlangıç tetikleyicisi, hedefi, başarı/başarısızlık koşulu,
// ödülü ve tekrar oynama yolu vardır.
import { CITY, blockContent, lineCoord } from '../world/cityLayout.js';
import { SaveGame } from './Settings.js';

const SP = { x: 0, z: 40 };    // oyuncu doğuş noktası çevresi (şehir merkezi güney kaldırımı)
const startPos = (i) => ({ x: [-22, -12, 12, 22, 34][i], z: 40 });
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

function findGarage() { for (let i = -CITY.N; i <= CITY.N; i++) for (let j = -CITY.N; j <= CITY.N; j++) { const B = blockContent(i, j); const b = B.buildings.find((q) => q.kind === 'garage' && q.name === 'GARAGE'); if (b) return { x: b.x, z: b.z + b.d / 2 + 7 }; } return { x: 300, z: -100 }; }
function parkPickups(n) {
  const pts = []; for (let i = -CITY.N; i <= CITY.N && pts.length < n * 3; i++) for (let j = -CITY.N; j <= CITY.N; j++) { const B = blockContent(i, j); if ((B.district === 'park' || B.district === 'residential') && Math.abs(i) <= 4 && j <= 0) for (const p of B.pois) if (p.kind === 'park' || p.kind === 'home') pts.push({ x: p.x + (pts.length % 3) * 3, z: p.z + 5 }); }
  const out = []; for (let k = 0; k < n; k++) out.push(pts[Math.floor((k * pts.length) / n)]); return out;
}
function findSafehouse() { for (let i = -5; i <= -2; i++) for (let j = -4; j <= -2; j++) { const B = blockContent(i, j); const p = B.pois.find((q) => q.kind === 'home'); if (p) return { x: p.x + 14, z: p.z + 8 }; } return { x: -300, z: -250 }; }

export class Missions {
  constructor(game) {
    this.g = game; this.completed = new Set(); this.active = null; this.cooldown = 0;
    const g = () => this.g;
    this.defs = [
      { id: 'm1', title: 'Hoş geldin Leonida', desc: 'Bir araca bin ve sahildeki iskeleye sür.', reward: 500, start: startPos(0),
        init: (m) => { m.target = { x: 0, z: 628 }; g().markers.add({ id: 'obj', ...m.target, color: 0xffd23f }); m.hint = 'Bir araca bin (E) ve iskeleye sür'; },
        update: (m) => { m.objective = g().player.mode === 'vehicle' ? 'İskeleye sür (sarı işaret)' : 'Bir araca bin (E) — park halindeki herhangi bir araç'; if (g().player.mode === 'vehicle' && dist(g().player.pos, m.target) < 11) return 'win'; } },
      { id: 'm2', title: 'Vale', desc: 'Spor coupe\'yi hasarsız garaja teslim et.', reward: 800, start: startPos(1),
        init: (m) => { const v = g().pop.vehicles.find((q) => q.spec === 'coupe' && q.kind === 3); m.car = v; m.target = findGarage(); if (v) { g().physics.teleport(v.index, [-12, 1.0, 62], Math.PI); g().ai.setKind(v.slot, 4); g().markers.add({ id: 'car', x: -12, z: 62, color: 0x3fa7ff, blip: 'tri' }); } g().markers.add({ id: 'obj', ...m.target, color: 0xffd23f }); m.fail = false; },
        update: (m) => { const p = g().player; const car = m.car; if (!car) return 'fail:Araç bulunamadı'; if ((car.health ?? 100) < 40) return 'fail:Araç çok hasar aldı!'; const inCar = p.mode === 'vehicle' && p.veh === car; if (inCar) g().markers.remove('car'); m.objective = inCar ? 'Coupe\'yi garaja sür (hasar < %60). Araç sağlığı: %' + Math.round(car.health ?? 100) : 'Mavi spor coupe\'ye bin (E)'; if (inCar && dist(p.pos, m.target) < 9) return 'win'; } },
      { id: 'm3', title: 'Koleksiyon', desc: 'Parklara ve mahalleye saçılmış 8 paketi topla.', reward: 600, start: startPos(2),
        init: (m) => { m.pts = parkPickups(8); m.got = 0; m.pts.forEach((p, i) => g().markers.add({ id: 'pk' + i, ...p, color: 0x7dff7d, kind: 'pickup' })); },
        update: (m) => { const p = g().player.pos; m.pts.forEach((q, i) => { if (q && !q.got && dist(p, q) < 3.2) { q.got = true; m.got++; g().markers.remove('pk' + i); g().audio?.click(); g().hud.toast(`Paket toplandı ${m.got}/8`); } }); m.objective = `Paketleri topla: ${m.got}/8 (yeşil işaretler)`; const next = m.pts.find((q) => q && !q.got); if (next) m.target = next; if (m.got >= 8) return 'win'; } },
      { id: 'm4', title: 'Kaçış', desc: 'Polisten kurtul ve güvenli eve ulaş.', reward: 1200, start: startPos(3),
        init: (m) => { m.target = findSafehouse(); g().ai.event({ type: 'crime', crime: 6, x: g().player.pos.x, z: g().player.pos.z }); g().markers.add({ id: 'obj', ...m.target, color: 0x7dff7d }); m.t = 0; },
        update: (m, dt) => { m.t += dt; const w = g().ai.wanted; m.objective = w.level > 0 ? 'Polisten kaç! Görüş alanından çık ve saklan.' : 'Polisi atlattın — güvenli eve git (yeşil işaret)'; if (m.t > 3 && w.level === 0 && dist(g().player.pos, m.target) < 10) return 'win'; if (m.t > 180) return 'fail:Süre doldu'; } },
      { id: 'm5', title: 'Zaman Yarışı', desc: '6 kontrol noktasını 150 saniyede geç.', reward: 1000, start: startPos(4),
        init: (m) => { m.cps = [[7, 6], [7, 9], [10, 9], [10, 6], [10, 3], [7, 3]].map(([a, b]) => ({ x: lineCoord(a), z: lineCoord(b) })); m.i = 0; m.time = 150; g().markers.add({ id: 'obj', ...m.cps[0], color: 0xff7a1a }); },
        update: (m, dt) => { m.time -= dt; m.target = m.cps[m.i]; m.objective = `Kontrol noktası ${m.i + 1}/${m.cps.length} — Araçla geç`; m.timer = `Süre: ${Math.max(0, m.time).toFixed(1)} sn`; if (g().player.mode === 'vehicle' && dist(g().player.pos, m.cps[m.i]) < 14) { m.i++; g().audio?.click(); if (m.i >= m.cps.length) return 'win'; g().markers.add({ id: 'obj', ...m.cps[m.i], color: 0xff7a1a }); g().hud.toast('Kontrol noktası!'); } if (m.time <= 0) return 'fail:Süre doldu'; } },
    ];
  }

  list() { return this.defs.map((d) => ({ id: d.id, title: d.title, desc: d.desc, completed: this.completed.has(d.id), active: this.active?.def.id === d.id })); }
  install() {   // başlangıç işaretçileri ve etkileşimler
    const g = this.g;
    this.defs.forEach((d) => g.interaction.add({ id: 'ms-' + d.id, pos: d.start, radius: 3.2, enabled: () => !this.active && !g.paused && g.player.mode === 'foot', prompt: () => `E — Görevi başlat: ${d.title}${this.completed.has(d.id) ? ' (tekrar)' : ''}`, onUse: () => this.start(d.id, false) }));
    this._startMarkers();
  }
  _startMarkers() { this.g.markers.clear('st-'); if (this.active) return; for (const d of this.defs) this.g.markers.add({ id: 'st-' + d.id, x: d.start.x, z: d.start.z, color: this.completed.has(d.id) ? 0x7dff7d : 0x4fb8ff, blip: 'square' }); }

  start(id, fromMenu) {
    const def = this.defs.find((d) => d.id === id), g = this.g; if (!def) return; if (this.active) this.cleanup();
    if (fromMenu) { g.player.exitVehicleInstant?.(); g.physics.teleport(g.player.char.index, [def.start.x, 1.3, def.start.z + 2]); }
    const m = { def, objective: '', timer: '', target: null }; this.active = m; g.markers.clear('st-'); def.init(m); g.hud.banner(def.title, def.desc, 3);
    g.hud.toast('Görev başladı: ' + def.title); g.audio?.click();
  }
  cleanup() { const g = this.g; g.markers.clear('obj'); g.markers.clear('pk'); g.markers.clear('car'); g.minimap.setRoute(null, null); this.active = null; g.hud.setMission(null); }
  restart() { if (this.failed) { const id = this.failed; this.failed = null; this.start(id, true); } }
  complete() { const m = this.active, g = this.g, d = m.def; const bonus = d.id === 'm5' ? Math.round(Math.max(0, m.time) * 5) : 0; g.state.money += d.reward + bonus; this.completed.add(d.id); this.cleanup(); this._startMarkers(); g.hud.banner('GÖREV TAMAMLANDI', `${d.title} · +$${d.reward + bonus}`, 4); g.audio?.click(); g.save(false); }
  fail(reason) { const m = this.active, g = this.g; this.failed = m.def.id; this.cleanup(); this._startMarkers(); g.hud.banner('GÖREV BAŞARISIZ', reason + ' — R: tekrar dene', 5); }
  update(dt) {
    const g = this.g; g.markers.update(dt); if (!this.active) { g.hud.setMission(null); return; }
    const m = this.active, r = m.def.update(m, dt);
    if (r === 'win') return this.complete(); if (typeof r === 'string' && r.startsWith('fail')) return this.fail(r.split(':')[1] ?? '');
    if (g.player.dead) return this.fail('Öldün');
    g.hud.setMission({ title: m.def.title, objective: m.objective, timer: m.timer });
    if (m.target && g.minimap.target !== m.target) g.minimap.setRoute(g.player.pos, m.target);
  }
  state() { return { completed: [...this.completed], active: this.active ? { id: this.active.def.id } : null }; }
}
