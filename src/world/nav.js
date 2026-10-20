// Trafik şeritleri ve yaya kaldırım ağı + A* yol bulma (saf, AI worker ve testler kullanır).
import { CITY, lineCoord, NL, inCity, blockCenter } from './cityLayout.js';

// ---------------------------------------------------------------- trafik grafiği (kavşaklar)
export const nodeId = (a, b) => a * NL + b;
export const nodePos = (id) => ({ x: lineCoord(Math.floor(id / NL)), z: lineCoord(id % NL) });
export function nodeNeighbors(id) {
  const a = Math.floor(id / NL), b = id % NL, out = [];
  if (a > 0) out.push(nodeId(a - 1, b)); if (a < NL - 1) out.push(nodeId(a + 1, b));
  if (b > 0) out.push(nodeId(a, b - 1)); if (b < NL - 1) out.push(nodeId(a, b + 1));
  return out;
}
export function nearestNode(x, z) { const a = Math.min(NL - 1, Math.max(0, Math.round(x / CITY.CELL + 6.5))), b = Math.min(NL - 1, Math.max(0, Math.round(z / CITY.CELL + 6.5))); return nodeId(a, b); }

/** Sağ şerit ofseti: yön d için sağ vektör (-dz, dx). */
export const rightOf = (dx, dz) => ({ x: -dz, z: dx });

/** Kavşak trafik ışığı fazı: 'NS' veya 'EW' yeşil. Döngü 34 sn: 14 yeşil + 3 sarı. */
export function signalState(id, t) {
  const off = (id * 7) % 34, p = (t + off) % 34;
  if (p < 14) return { NS: 'green', EW: 'red' }; if (p < 17) return { NS: 'yellow', EW: 'red' };
  if (p < 31) return { NS: 'red', EW: 'green' }; return { NS: 'red', EW: 'yellow' };
}

/** A -> B yönlü kenar için şerit noktaları (kavşaktan 10 m önce dur çizgisi, 10 m sonra çıkış). */
export function laneEnter(A, B) {
  const a = nodePos(A), b = nodePos(B), dx = Math.sign(b.x - a.x), dz = Math.sign(b.z - a.z), r = rightOf(dx, dz);
  return { x: b.x - dx * 11 + r.x * CITY.LANE, z: b.z - dz * 11 + r.z * CITY.LANE, dx, dz, sig: B };
}
export function laneExit(B, C) {
  const b = nodePos(B), c = nodePos(C), dx = Math.sign(c.x - b.x), dz = Math.sign(c.z - b.z), r = rightOf(dx, dz);
  return { x: b.x + dx * 11 + r.x * CITY.LANE, z: b.z + dz * 11 + r.z * CITY.LANE, dx, dz };
}
/** Kavşak geçişi: giriş noktasından çıkış noktasına 4 noktalık eğri. */
export function intersectionPath(A, B, C) {
  const e = laneEnter(A, B), x = laneExit(B, C), pts = [];
  const cx = e.dx === x.dx && e.dz === x.dz ? null : { x: e.dx !== 0 ? x.x : e.x, z: e.dx !== 0 ? e.z : x.z };   // dönüşte köşe kontrol noktası
  for (let i = 1; i <= 6; i++) { const t = i / 6; if (!cx) pts.push({ x: e.x + (x.x - e.x) * t, z: e.z + (x.z - e.z) * t, sig: B }); else { const u = 1 - t; pts.push({ x: u * u * e.x + 2 * u * t * cx.x + t * t * x.x, z: u * u * e.z + 2 * u * t * cx.z + t * t * x.z, sig: B }); } }
  return pts;
}

export function astar(start, goal, neighbors, pos, blocked = () => false) {
  const open = new Map([[start, 0]]), came = new Map(), g = new Map([[start, 0]]), closed = new Set();
  const h = (n) => { const p = pos(n), q = pos(goal); return Math.abs(p.x - q.x) + Math.abs(p.z - q.z); };
  while (open.size) {
    let cur = null, best = Infinity; for (const [n] of open) { const f = g.get(n) + h(n); if (f < best) { best = f; cur = n; } }
    if (cur === goal) { const path = [cur]; while (came.has(cur)) { cur = came.get(cur); path.push(cur); } return path.reverse(); }
    open.delete(cur); closed.add(cur);
    for (const nb of neighbors(cur)) {
      if (closed.has(nb) || blocked(nb)) continue;
      const a = pos(cur), b = pos(nb), ng = g.get(cur) + Math.abs(a.x - b.x) + Math.abs(a.z - b.z);
      if (!g.has(nb) || ng < g.get(nb)) { g.set(nb, ng); came.set(nb, cur); open.set(nb, 1); }
    }
  }
  return null;
}
export const trafficRoute = (from, to) => astar(from, to, nodeNeighbors, nodePos);

// ---------------------------------------------------------------- yaya kaldırım ağı
// Düğüm: (bi,bj,cx,cz) bloğun kaldırım köşesi. id = ((bi+8)*17+(bj+8))*4 + corner
const SW = CITY.CELL / 2 - CITY.ROAD / 2 - CITY.SIDEWALK / 2;   // kaldırım orta hattı: blok merkezinden 40 m
const CORNERS = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
export const pedId = (bi, bj, c) => ((bi + 8) * 17 + (bj + 8)) * 4 + c;
export function pedDecode(id) { const c = id % 4, q = Math.floor(id / 4), bj = (q % 17) - 8, bi = Math.floor(q / 17) - 8; return { bi, bj, c }; }
export function pedPos(id) { const { bi, bj, c } = pedDecode(id), p = blockCenter(bi, bj); return { x: p.x + CORNERS[c][0] * SW, z: p.z + CORNERS[c][1] * SW }; }
export function pedNeighbors(id) {
  const { bi, bj, c } = pedDecode(id), out = [];
  out.push(pedId(bi, bj, (c + 1) % 4), pedId(bi, bj, (c + 3) % 4));              // blok çevresinde
  const [sx, sz] = CORNERS[c];
  const cross = (di, dj, cc) => { if (inCity(bi + di, bj + dj)) out.push(pedId(bi + di, bj + dj, cc)); };
  cross(sx, 0, CORNERS.findIndex((k) => k[0] === -sx && k[1] === sz));            // yatay yol karşısı
  cross(0, sz, CORNERS.findIndex((k) => k[0] === sx && k[1] === -sz));            // dikey yol karşısı
  return out.filter((n) => { const d = pedDecode(n); return inCity(d.bi, d.bj); });
}
export const pedRoute = (a, b) => astar(a, b, pedNeighbors, pedPos);
export function nearestPedNode(x, z) {
  const bi = Math.max(-CITY.N, Math.min(CITY.N, Math.round(x / CITY.CELL))), bj = Math.max(-CITY.N, Math.min(CITY.N, Math.round(z / CITY.CELL)));
  const p = blockCenter(bi, bj), c = CORNERS.findIndex((k) => (x - p.x) * k[0] >= 0 && (z - p.z) * k[1] >= 0);
  return pedId(bi, bj, Math.max(0, c));
}
