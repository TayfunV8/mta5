import { CITY, blockContent, chunkColliders, inCity, districtOf, BLOCK_SIZE, parkingSpotsAround, lineCoord, NL } from '../src/world/cityLayout.js';
import { nodeId, nodePos, trafficRoute, pedRoute, pedPos, pedId, nearestPedNode, pedNeighbors, intersectionPath, laneEnter, laneExit, signalState } from '../src/world/nav.js';
let pass = 0, fail = 0; const ok = (n, c, i = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n}  ${i}`); };
// bölge dağılımı
const cnt = {}; let blocks = 0, buildings = 0, props = 0, colliders = 0, maxCol = 0;
for (let i = -CITY.N; i <= CITY.N; i++) for (let j = -CITY.N; j <= CITY.N; j++) { const B = blockContent(i, j); cnt[B.district] = (cnt[B.district] ?? 0) + 1; blocks++; buildings += B.buildings.length; props += B.props.length; const c = chunkColliders(i, j).length; colliders += c; maxCol = Math.max(maxCol, c); }
ok('Tüm istenen bölgeler var', ['downtown', 'commercial', 'residential', 'port', 'beach', 'park'].every((d) => cnt[d] > 0), JSON.stringify(cnt));
console.log(`INFO  ${blocks} blok, ${buildings} bina, ${props} prop, ${colliders} çarpışma kutusu (blok başına maks ${maxCol})`);
// binalar bloğun iç alanını aşmıyor ve yollara taşmıyor
let overflow = 0; for (let i = -CITY.N; i <= CITY.N; i++) for (let j = -CITY.N; j <= CITY.N; j++) { const B = blockContent(i, j); for (const b of B.buildings) { if (Math.abs(b.x - B.cx) + b.w / 2 > BLOCK_SIZE / 2 - CITY.SIDEWALK + 0.01 || Math.abs(b.z - B.cz) + b.d / 2 > BLOCK_SIZE / 2 - CITY.SIDEWALK + 0.01) { overflow++; if (overflow < 4) console.log('  taşma', B.district, b.kind, b.x - B.cx, b.z - B.cz, b.w, b.d); } } }
ok('Binalar kaldırım içinde kalıyor (yola taşmıyor)', overflow === 0, `taşan=${overflow}`);
// bina çakışması (aynı blok)
let overlap = 0; for (let i = -CITY.N; i <= CITY.N; i++) for (let j = -CITY.N; j <= CITY.N; j++) { const bs = blockContent(i, j).buildings.filter((b) => !['container', 'pump', 'canopy', 'crane'].includes(b.kind)); for (let a = 0; a < bs.length; a++) for (let c = a + 1; c < bs.length; c++) if (Math.abs(bs[a].x - bs[c].x) < (bs[a].w + bs[c].w) / 2 - 0.1 && Math.abs(bs[a].z - bs[c].z) < (bs[a].d + bs[c].d) / 2 - 0.1) overlap++; }
ok('Binalar birbiriyle çakışmıyor', overlap === 0, `çakışan=${overlap}`);
// park yerleri bina içinde değil
let bad = 0, total = 0; for (let i = -CITY.N; i <= CITY.N; i++) for (let j = -CITY.N; j <= CITY.N; j++) { const B = blockContent(i, j); for (const s of B.spots) { total++; for (const b of B.buildings) if (Math.abs(s.x - b.x) < b.w / 2 + 1.2 && Math.abs(s.z - b.z) < b.d / 2 + 1.2 && !['pump', 'canopy'].includes(b.kind)) bad++; } }
ok('Park yerleri binaların içinde değil', bad === 0, `yer=${total} hatalı=${bad}`);
// trafik rotası
const A = nodeId(0, 0), Bn = nodeId(13, 13), route = trafficRoute(A, Bn);
ok('Trafik rotası köşeden köşeye bulunuyor', route && route.length === 27, `uzunluk=${route?.length}`);
const p3 = intersectionPath(route[0], route[1], route[2]); ok('Kavşak geçişi 6 noktalı eğri', p3.length === 6);
const e = laneEnter(nodeId(5, 5), nodeId(6, 5)); ok('Sağ şerit: doğuya giderken güney (z+) tarafta', e.dx === 1 && e.z > nodePos(nodeId(6, 5)).z, `z ofset=${(e.z - nodePos(nodeId(6, 5)).z).toFixed(1)}`);
ok('Işık fazları çakışmıyor', [0, 5, 10, 20, 30].every((t) => { const s = signalState(7, t); return !(s.NS === 'green' && s.EW === 'green'); }));
// yaya ağı
const pa = nearestPedNode(-250, -250), pb = nearestPedNode(300, 400), path = pedRoute(pa, pb);
ok('Yaya rotası bulunuyor', path && path.length > 5, `düğüm=${path?.length}`);
let cross = 0; for (let k = 0; k < path.length - 1; k++) { const a = pedPos(path[k]), b = pedPos(path[k + 1]); if (Math.hypot(a.x - b.x, a.z - b.z) < 30 && Math.hypot(a.x - b.x, a.z - b.z) > 6) cross++; }
ok('Yaya düğümleri komşuları tutarlı (köşe 4 komşu)', pedNeighbors(pedId(0, 0, 0)).length >= 3, `komşu=${pedNeighbors(pedId(0, 0, 0)).length}`);
console.log(`\n${pass} geçti, ${fail} kaldı`); process.exit(fail ? 1 : 0);
