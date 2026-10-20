// Minimap + tam harita: şehir yerleşiminden bir kez çizilen temel harita, üstüne canlı işaretler, rota çizgisi.
import { CITY, BLOCK_SIZE, blockContent, DISTRICT_NAMES } from '../world/cityLayout.js';

const COL = { downtown: '#8a8f98', commercial: '#9a8f84', residential: '#7aa066', port: '#7d8691', beach: '#e0cd96', park: '#5f9a4c', midrise: '#8e949b', country: '#6fa35c' };
const EXT = 760;    // harita yarıçapı (m): x ∈ [-EXT, EXT], z ∈ [-EXT, +760]

export class Minimap {
  constructor(game, mini, big) {
    this.g = game; this.mini = mini; this.big = big; this.scale = 1; this.range = 130; this.bigOpen = false; this.route = []; this.routeT = 0;
    this.base = document.createElement('canvas'); this.base.width = this.base.height = 2 * EXT; this._bake();
  }
  _bake() {
    const g = this.base.getContext('2d'), S = 2 * EXT, X = (x) => x + EXT, Z = (z) => z + EXT;
    g.fillStyle = '#6fa35c'; g.fillRect(0, 0, S, S);
    g.fillStyle = '#2f7fb0'; g.fillRect(0, Z(CITY.SEA_Z), S, S - Z(CITY.SEA_Z));
    g.fillStyle = '#dcc690'; g.fillRect(0, Z(CITY.SEA_Z - 8), S, 36);
    g.strokeStyle = '#4a4e56'; g.lineWidth = CITY.ROAD;
    for (let k = -CITY.OUTER - 1; k <= CITY.OUTER; k++) { const c = (k + 0.5) * CITY.CELL; if (Math.abs(c) > EXT) continue; g.beginPath(); g.moveTo(X(c), 0); g.lineTo(X(c), Z(CITY.SEA_Z)); g.stroke(); if (c < CITY.SEA_Z) { g.beginPath(); g.moveTo(0, Z(c)); g.lineTo(S, Z(c)); g.stroke(); } }
    for (let i = -CITY.N; i <= CITY.N; i++) for (let j = -CITY.N; j <= CITY.N; j++) {
      const B = blockContent(i, j); g.fillStyle = COL[B.district] ?? '#888'; g.fillRect(X(B.cx - BLOCK_SIZE / 2), Z(B.cz - BLOCK_SIZE / 2), BLOCK_SIZE, BLOCK_SIZE);
      g.fillStyle = 'rgba(40,44,52,0.85)'; for (const b of B.buildings) { if (b.kind === 'container' || b.kind === 'pump') continue; g.fillRect(X(b.x - b.w / 2), Z(b.z - b.d / 2), b.w, b.d); }
    }
    g.fillStyle = 'rgba(255,255,255,0.8)'; g.font = 'bold 26px sans-serif'; g.textAlign = 'center';
    for (const [t, x, z] of [['ŞEHİR MERKEZİ', 0, 0], ['TİCARET', 300, -100], ['MAHALLE', -300, -150], ['LİMAN', 450, 560], ['SAHİL', -200, 600], ['PARK', -640, 0], ['KIRSAL', 0, -700]]) g.fillText(t, X(x), Z(z));
  }

  setRoute(from, to) { if (!to) { this.route = []; return; } this.target = to; this._computeRoute(from); }
  _computeRoute(from) {
    import('../world/nav.js').then((n) => {
      const a = n.nearestNode(from.x, from.z), b = n.nearestNode(this.target.x, this.target.z), r = n.trafficRoute(a, b) ?? [];
      this.route = [{ x: from.x, z: from.z }, ...r.map((id) => n.nodePos(id)), { x: this.target.x, z: this.target.z }];
    });
  }

  draw(player, yaw, blips, wp) {
    this._drawMini(player, yaw, blips, wp);
    if (this.bigOpen) this._drawBig(player, yaw, blips, wp);
    this.routeT -= 1 / 30; if (this.target && this.routeT <= 0) { this.routeT = 2.5; this._computeRoute(player); }
  }
  _blip(g, b, sx, sz, size) {
    g.save(); g.translate(sx, sz); g.fillStyle = b.color; g.strokeStyle = '#000'; g.lineWidth = 2;
    if (b.shape === 'square') g.fillRect(-size, -size, size * 2, size * 2); else if (b.shape === 'tri') { g.beginPath(); g.moveTo(0, -size * 1.3); g.lineTo(size, size); g.lineTo(-size, size); g.closePath(); g.fill(); g.stroke(); } else { g.beginPath(); g.arc(0, 0, size, 0, 6.3); g.fill(); g.stroke(); }
    g.restore();
  }
  _drawMini(player, yaw, blips, wp) {
    const c = this.mini, g = c.getContext('2d'), W = c.width, R = this.range, k = W / (2 * R);
    g.save(); g.clearRect(0, 0, W, W); g.beginPath(); g.arc(W / 2, W / 2, W / 2 - 2, 0, 6.3); g.clip();
    g.fillStyle = '#222'; g.fillRect(0, 0, W, W);
    g.translate(W / 2, W / 2); g.rotate(yaw); g.scale(k, k);            // harita oyuncunun baktığı yöne göre döner (yukarı = ileri)
    g.drawImage(this.base, player.x + EXT - R * 1.5, player.z + EXT - R * 1.5, R * 3, R * 3, -R * 1.5, -R * 1.5, R * 3, R * 3);
    if (this.route.length > 1) { g.strokeStyle = '#ff4fd8'; g.lineWidth = 5 / k * 0.6; g.lineJoin = 'round'; g.beginPath(); this.route.forEach((p, i) => { const x = p.x - player.x, z = p.z - player.z; i ? g.lineTo(x, z) : g.moveTo(x, z); }); g.stroke(); }
    for (const b of blips) { let dx = b.x - player.x, dz = b.z - player.z; const d = Math.hypot(dx, dz); if (d > R * 1.2) { if (!b.edge) continue; dx *= (R * 1.2) / d; dz *= (R * 1.2) / d; } this._blip(g, b, dx, dz, (b.size ?? 5) / k * 0.55); }
    g.restore();
    g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 3; g.beginPath(); g.arc(W / 2, W / 2, W / 2 - 2, 0, 6.3); g.stroke();
    g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 2; g.beginPath(); g.moveTo(W / 2, W / 2 - 11); g.lineTo(W / 2 + 8, W / 2 + 9); g.lineTo(W / 2, W / 2 + 4); g.lineTo(W / 2 - 8, W / 2 + 9); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#ff5050'; g.font = 'bold 13px sans-serif'; g.textAlign = 'center'; g.save(); g.translate(W / 2, W / 2); g.rotate(yaw); g.fillText('K', 0, -W / 2 + 18); g.restore();   // kuzey
  }
  _drawBig(player, yaw, blips, wp) {
    const c = this.big, g = c.getContext('2d'), W = c.width, H = c.height, s = Math.min(W, H) / (2 * EXT); this.bigScale = s;
    g.clearRect(0, 0, W, H); g.fillStyle = '#10151c'; g.fillRect(0, 0, W, H);
    const ox = (W - 2 * EXT * s) / 2, oz = (H - 2 * EXT * s) / 2; this.ox = ox; this.oz = oz;
    g.drawImage(this.base, ox, oz, 2 * EXT * s, 2 * EXT * s);
    const P = (p) => [ox + (p.x + EXT) * s, oz + (p.z + EXT) * s];
    if (this.route.length > 1) { g.strokeStyle = '#ff4fd8'; g.lineWidth = 3; g.beginPath(); this.route.forEach((p, i) => { const [x, z] = P(p); i ? g.lineTo(x, z) : g.moveTo(x, z); }); g.stroke(); }
    for (const b of blips) { const [x, z] = P(b); this._blip(g, b, x, z, b.size ?? 5); }
    if (wp) { const [x, z] = P(wp); g.fillStyle = '#ff4fd8'; g.beginPath(); g.arc(x, z, 8, 0, 6.3); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke(); }
    const [px, pz] = P(player); g.save(); g.translate(px, pz); g.rotate(-yaw + Math.PI); g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.beginPath(); g.moveTo(0, 10); g.lineTo(7, -8); g.lineTo(0, -3); g.lineTo(-7, -8); g.closePath(); g.fill(); g.stroke(); g.restore();
  }
  /** Büyük haritada tıklama -> dünya koordinatı */
  bigToWorld(px, pz) { return { x: (px - this.ox) / this.bigScale - EXT, z: (pz - this.oz) / this.bigScale - EXT }; }
}
export { DISTRICT_NAMES };
