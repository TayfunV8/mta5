// LEONIDA CITY: deterministik şehir yerleşimi (saf veri, render/fizik/AI hepsi aynı kaynağı kullanır).
// Koordinatlar: x doğu, z güney, y yukarı. Blok (bi,bj) merkezi (bi*CELL, bj*CELL). Yollar blokların arasında (i+0.5)*CELL.
import { mulberry32, hash2, pick, range } from './rng.js';

export const CITY = { CELL: 100, ROAD: 16, SIDEWALK: 4, CURB: 0.15, N: 6, LANE: 4, SEA_Z: 664, OUTER: 9 };
export const BLOCK_SIZE = CITY.CELL - CITY.ROAD;          // 84 m (kaldırım dahil)
export const LOT = BLOCK_SIZE - 2 * CITY.SIDEWALK;        // 76 m iç alan
export const blockCenter = (bi, bj) => ({ x: bi * CITY.CELL, z: bj * CITY.CELL });
export const inCity = (bi, bj) => Math.abs(bi) <= CITY.N && bj >= -CITY.N && bj <= CITY.N;
export const inWorld = (bi, bj) => Math.abs(bi) <= CITY.OUTER && bj >= -CITY.OUTER && bj <= CITY.N;
export const chunkId = (bi, bj) => `${bi},${bj}`;
export const worldToBlock = (x, z) => [Math.round(x / CITY.CELL), Math.round(z / CITY.CELL)];

export function districtOf(bi, bj) {
  if (!inCity(bi, bj)) return 'country';
  if (Math.abs(bi) <= 1 && Math.abs(bj) <= 1) return 'downtown';
  if (bj >= 5) return bi >= 2 ? 'port' : 'beach';
  if (Math.abs(bi) === CITY.N || bj === -CITY.N) return 'park';
  const h = hash2(bi, bj) % 100;
  if (bi >= 2 && bi <= 4 && Math.abs(bj) <= 4) return 'commercial';
  if (h < 7) return 'park';
  if (bi <= -2) return 'residential';
  if (bj <= -2) return 'residential';
  return h < 55 ? 'commercial' : 'midrise';
}
export const DISTRICT_NAMES = { downtown: 'Şehir Merkezi', commercial: 'Ticaret Bölgesi', residential: 'Mahalle', port: 'Liman', beach: 'Sahil', park: 'Park', midrise: 'İş Bölgesi', country: 'Kırsal' };
const SHOP_NAMES = ['MARKET', 'PIZZA', 'CAFE', 'BANK', 'TACOS', 'PHARMACY', 'DINER', 'BOOKS', 'SPORTS', 'BARBER', 'SUSHI', 'BAKERY', 'PUB', 'DELI'];
const COLORS = { house: [0xe9dcc3, 0xcfd8dc, 0xf1c6a8, 0xb8cdb0, 0xe8e2d0, 0xd9b8a0], shop: [0xc6584a, 0x3f7f9a, 0xe0b04a, 0x6a9a58, 0xb86fa6, 0xd9d5cc], warehouse: [0x8d99a6, 0xa5adb5, 0x9a8f7a], container: [0xc0392b, 0x2e86c1, 0x27ae60, 0xd68910, 0x7f8c8d, 0x8e44ad] };

const cache = new Map();
export function blockContent(bi, bj) {
  const id = chunkId(bi, bj); if (cache.has(id)) return cache.get(id);
  const d = districtOf(bi, bj), r = mulberry32(hash2(bi, bj, 7)), { x: cx, z: cz } = blockCenter(bi, bj);
  const B = { bi, bj, id, cx, cz, district: d, buildings: [], props: [], pads: [], spots: [], pois: [], floorMat: 'concrete', padMat: 'concrete' };
  const add = (kind, dx, dz, w, dd, h, extra = {}) => { const b = { kind, x: cx + dx, z: cz + dz, w, d: dd, h, ...extra }; B.buildings.push(b); return b; };
  const prop = (t, dx, dz, extra = {}) => B.props.push({ t, x: cx + dx, z: cz + dz, ...extra });
  const pad = (dx, dz, w, dd, mat, extra = {}) => B.pads.push({ x: cx + dx, z: cz + dz, w, d: dd, mat, ...extra });
  const trees = (n, spread = 34, keep = []) => { for (let i = 0; i < n; i++) { const dx = range(r, -spread, spread), dz = range(r, -spread, spread); if (keep.some((k) => Math.abs(dx - k[0]) < k[2] && Math.abs(dz - k[1]) < k[3])) continue; prop('tree', dx, dz, { s: range(r, 0.8, 1.3) }); } };
  const poi = (dx, dz, kind) => B.pois.push({ x: cx + dx, z: cz + dz, kind });

  if (d === 'country') { B.floorMat = 'grass'; B.padMat = 'grass'; trees(14, 46); }
  else if (d === 'downtown') {
    const center = bi === 0 && bj === 0, v = hash2(bi, bj) % 3;
    pad(0, 0, LOT, LOT, 'plaza');
    if (center) { add('tower', 0, 0, 36, 36, 170, { style: 'glass', color: 0x6f93b3 }); add('office', -30, 28, 14, 14, 22, { style: 'concrete', color: 0xc9c2b5 }); poi(-26, -26, 'plaza'); }
    else if (v === 0) { add('tower', 0, 0, 32, 34, range(r, 90, 140), { style: 'glass', color: 0x7a9db8 }); add('office', 28, -30, 14, 14, 18, { style: 'concrete', color: 0xd0c8b8 }); }
    else if (v === 1) { add('tower', -18, -12, 26, 28, range(r, 60, 105), { style: 'glass', color: 0x86a6a0 }); add('tower', 20, 18, 24, 24, range(r, 45, 80), { style: 'concrete', color: 0xbfc3c7 }); }
    else { add('garage', -8, 0, 52, 48, 21, { style: 'garage', color: 0xb9b6ae }); add('office', 28, -26, 18, 18, range(r, 35, 55), { style: 'glass', color: 0x6f93b3 }); }
    prop('tree', -34, -34, { s: 0.9 }); prop('tree', 34, 34, { s: 0.9 }); poi(0, 36, 'plaza');
  } else if (d === 'commercial' || d === 'midrise') {
    const t = d === 'midrise' ? 'office' : pick(r, ['gas', 'shops', 'shops', 'dealer', 'garage', 'diner']);
    pad(0, 0, LOT, LOT, 'asphalt'); B.padMat = 'asphalt';
    if (t === 'office') { add('office', -10, -8, 34, 28, range(r, 22, 42), { style: 'concrete', color: pick(r, [0xc9c2b5, 0xbfc7cf]) }); add('apt', 22, 26, 26, 18, range(r, 14, 22), { style: 'brick', color: 0xa8523f }); }
    else if (t === 'gas') {
      add('shop', -22, -26, 18, 10, 4.2, { style: 'shop', color: 0xe6e2d8, name: 'GAS' });
      add('canopy', 0, 4, 24, 12, 5.6, { color: 0xd23a2d });
      for (const dx of [-6, 6]) for (const dz of [0, 8]) add('pump', dx, dz, 1.2, 0.7, 1.6, { color: 0xdddddd });
      poi(0, 22, 'gas'); prop('sign', 30, -30, { text: 'GAS $3.89', tall: true });
    } else if (t === 'shops' || t === 'diner') {
      const n = t === 'shops' ? 4 : 2, w = t === 'shops' ? 17 : 30;
      for (let i = 0; i < n; i++) { const nm = pick(r, SHOP_NAMES); add('shop', -35.5 + w / 2 + i * (w + 1), -28, w, 14, range(r, 7, 10), { style: 'shop', color: pick(r, COLORS.shop), name: nm }); poi(-35.5 + w / 2 + i * (w + 1), -18, 'shop'); }
      for (let i = 0; i < 7; i++) B.spots.push({ x: cx - 30 + i * 6, z: cz + 8, yaw: Math.PI / 2, lot: true });
      for (let i = 0; i < 7; i++) B.spots.push({ x: cx - 30 + i * 6, z: cz + 22, yaw: Math.PI / 2, lot: true });
      pad(0, 14, 74, 36, 'asphalt', { lines: true });
    } else if (t === 'dealer') { add('dealer', 0, -24, 52, 22, 6, { style: 'dealer', color: 0xe8edf0, name: 'AUTO' }); for (let i = 0; i < 4; i++) B.spots.push({ x: cx - 21 + i * 14, z: cz + 8, yaw: 0, lot: true }); poi(0, -8, 'shop'); }
    else if (t === 'garage') { add('garage', -20, -26, 28, 16, 7, { style: 'garage', color: 0xb0a899, name: 'GARAGE' }); add('garage', 22, -26, 24, 16, 7, { style: 'shop', color: 0x7a8a99, name: 'AUTO REPAIR' }); poi(0, -6, 'shop'); }
    if (t !== 'office') for (let i = 0; i < 3; i++) prop('lamp', -30 + i * 30, 36, {});
  } else if (d === 'residential') {
    const v = hash2(bi, bj) % 4;
    B.padMat = 'grass';
    if (v === 3) { add('apt', -16, -14, 34, 22, range(r, 14, 20), { style: 'brick', color: pick(r, [0xa8523f, 0x9a6b4a, 0xb88a6a]) }); add('apt', 18, 22, 30, 20, range(r, 12, 18), { style: 'stucco', color: pick(r, COLORS.house) }); add('shop', 30, -30, 14, 10, 4.5, { style: 'shop', color: pick(r, COLORS.shop), name: pick(r, SHOP_NAMES) }); trees(8, 36, [[0, 0, 40, 40]]); }
    else {
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
        if (r() < 0.12) continue;
        const dx = i * 25, dz = j * 25, north = j === -1;
        add('house', dx, dz - (north ? -2 : 2), 11, 9, 6.2, { style: 'stucco', color: pick(r, COLORS.house), roof: pick(r, [0x6b4a3a, 0x4a4f57, 0x7a3b32]), facing: north ? 1 : -1 });
        pad(dx + 6, dz + (north ? 8 : -8), 3.2, 9, 'asphalt');
        prop('mailbox', dx - 5, dz + (north ? 13 : -13)); if (r() < 0.8) prop('tree', dx + range(r, -8, 8), dz + (north ? 10 : -10), { s: range(r, 0.7, 1.1) });
        B.spots.push({ x: cx + dx + 6, z: cz + dz + (north ? 14 : -14), yaw: north ? Math.PI : 0, lot: true, drive: true });
      }
    }
    poi(0, 0, 'home');
  } else if (d === 'port') {
    pad(0, 0, LOT, LOT, 'asphalt'); B.padMat = 'asphalt';
    const v = hash2(bi, bj) % 3;
    if (v === 0) { add('warehouse', -18, -16, 40, 26, 13, { style: 'metal', color: pick(r, COLORS.warehouse) }); add('warehouse', 20, 22, 36, 24, 11, { style: 'metal', color: pick(r, COLORS.warehouse) }); poi(0, 0, 'work'); }
    else if (v === 1) { for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) { const st = 1 + Math.floor(r() * 3); for (let s = 0; s < st; s++) add('container', -28 + i * 24, -30 + j * 7.5, 12, 2.5, 2.6, { y: s * 2.6, color: pick(r, COLORS.container) }); } poi(0, 30, 'work'); }
    else { add('crane', 0, 30, 30, 8, 34, { color: 0xe0a21a }); add('warehouse', 0, -22, 50, 22, 12, { style: 'metal', color: pick(r, COLORS.warehouse) }); poi(0, 6, 'work'); }
    prop('fence', 0, -39, { len: 76 }); prop('fence', -39, 0, { len: 76, rot: 1 });
  } else if (d === 'beach') {
    B.floorMat = 'sand'; B.padMat = 'sand'; pad(0, 0, LOT, LOT, 'sand');
    if (bj === 5) { add('hotel', 0, -8, 46, 28, range(r, 26, 44), { style: 'hotel', color: pick(r, [0xf0e6d2, 0xe9c9b0, 0xcfe0e8]), name: 'HOTEL' }); pad(0, 24, 30, 14, 'concrete'); poi(0, 22, 'fun'); }
    else { pad(0, 33, 80, 6, 'wood', { boardwalk: true }); poi(0, 33, 'fun'); }
    for (let i = 0; i < 10; i++) prop('palm', range(r, -36, 36), bj === 5 ? range(r, 24, 36) : range(r, -30, 28), { s: range(r, 0.8, 1.2) });
  } else if (d === 'park') {
    B.floorMat = 'grass'; B.padMat = 'grass'; pad(0, 0, LOT, LOT, 'grass'); pad(0, 0, 4, LOT, 'dirt'); pad(0, 0, LOT, 4, 'dirt');
    trees(24, 36, [[0, 0, 4, 40], [0, 0, 40, 4]]); prop('bench', 5, 0); prop('bench', -5, 8); poi(0, 0, 'park');
  }
  // sokak ışıkları ve ağaçlar kaldırım hattında
  if (d !== 'country') {
    const e = CITY.CELL / 2 - CITY.ROAD / 2 - 1.2;      // kaldırım dış kenarı yakını (yol kenarından ~1.2 m içeride)
    for (let k = -1; k <= 1; k++) { const o = k * 30; prop('lamp', o, -e, {}); prop('lamp', o, e, {}); prop('lamp', -e, o + 15, {}); prop('lamp', e, o + 15, {}); }
    if (d !== 'port' && d !== 'beach') for (let k = -2; k <= 2; k++) { if (r() < 0.6) prop('tree', k * 17 + 8, e + 0.2, { s: 0.7 }); if (r() < 0.6) prop('tree', k * 17 - 8, -e - 0.2, { s: 0.7 }); }
    // park yerleri: blok kenarında paralel park (kavşak köşelerinden uzak)
    const pe = CITY.ROAD / 2 - 1.6;
    if (d !== 'port' && d !== 'park') for (let k = -2; k <= 2; k++) {
      const o = k * 9.5 + 2; if (r() < 0.28) continue;
      B.spots.push({ x: cx + o, z: cz - CITY.CELL / 2 + pe, yaw: -Math.PI / 2 });      // kuzey yolun güney şeridi: doğuya bakar (sağdan trafik)
      if (r() < 0.8) B.spots.push({ x: cx + o, z: cz + CITY.CELL / 2 - pe, yaw: Math.PI / 2 });
    }
  }
  cache.set(id, B); return B;
}

/** Çarpışma kutuları (worker'a gönderilir): [cx,cy,cz,hx,hy,hz,mat] */
export function chunkColliders(bi, bj) {
  const B = blockContent(bi, bj), { CELL, ROAD, CURB, N } = CITY, out = [];
  // yol şeritleri: bu parçanın batı ve kuzey kenarı (+ dış sınırlarda doğu/güney)
  const road = (x, z, w, d) => out.push([x, 0.02, z, w / 2, 0.02, d / 2, 'asphalt']);
  if (bi >= -CITY.OUTER && bj >= -CITY.OUTER) {
    if (inCity(bi - 1, bj) || inCity(bi, bj) || true) road(B.cx - CELL / 2, B.cz, ROAD, CELL);
    road(B.cx, B.cz - CELL / 2, CELL, ROAD);
    if (bi === N) road(B.cx + CELL / 2, B.cz, ROAD, CELL);
    if (bj === N) road(B.cx, B.cz + CELL / 2, CELL, ROAD);
  }
  if (B.district !== 'country') {
    out.push([B.cx, CURB / 2, B.cz, BLOCK_SIZE / 2, CURB / 2, BLOCK_SIZE / 2, B.floorMat]);
    for (const b of B.buildings) {
      if (b.kind === 'crane') { for (const sx of [-1, 1]) for (const sz of [-1, 1]) out.push([b.x + sx * 12, b.h / 2, b.z + sz * 3, 0.6, b.h / 2, 0.6, 'metal']); out.push([b.x, b.h - 1, b.z, 20, 1, 4, 'metal']); continue; }
      if (b.kind === 'canopy') { for (const sx of [-1, 1]) for (const sz of [-1, 1]) out.push([b.x + sx * (b.w / 2 - 1), b.h / 2, b.z + sz * (b.d / 2 - 1), 0.3, b.h / 2, 0.3, 'metal']); continue; }
      const y = (b.y ?? 0) + CURB; out.push([b.x, y + b.h / 2, b.z, b.w / 2, b.h / 2, b.d / 2, 'concrete']);
    }
    for (const p of B.props) {
      if (p.t === 'lamp') out.push([p.x, 2.5, p.z, 0.15, 2.5, 0.15, 'metal']);
      else if (p.t === 'tree' || p.t === 'palm') out.push([p.x, 1.5, p.z, 0.25, 1.5, 0.25, 'wood']);
      else if (p.t === 'sign') out.push([p.x, 3, p.z, 0.2, 3, 0.2, 'metal']);
      else if (p.t === 'fence') out.push([p.x, 1, p.z, p.rot ? 0.05 : p.len / 2, 1, p.rot ? p.len / 2 : 0.05, 'metal']);
    }
  } else for (const p of B.props) if (p.t === 'tree') out.push([p.x, 1.5, p.z, 0.25, 1.5, 0.25, 'wood']);
  // yol kavşağı trafik ışığı direkleri
  for (const [dx, dz] of [[-1, -1], [1, -1]]) out.push([B.cx + dx * (CELL / 2 - ROAD / 2 - 0.5), 3, B.cz + dz * (CELL / 2 - ROAD / 2 - 0.5), 0.15, 3, 0.15, 'metal']);
  return out;
}

export function parkingSpotsAround(x, z, radius) {
  const [bi0, bj0] = worldToBlock(x, z), out = [], R = Math.ceil(radius / CITY.CELL);
  for (let i = -R; i <= R; i++) for (let j = -R; j <= R; j++) if (inCity(bi0 + i, bj0 + j)) for (const s of blockContent(bi0 + i, bj0 + j).spots) if (Math.hypot(s.x - x, s.z - z) <= radius) out.push(s);
  return out;
}

/** Kavşak koordinatı: hat indeksi k = 0..13 -> (k-6.5)*CELL */
export const lineCoord = (k) => (k - 6.5) * CITY.CELL;
export const NL = 2 * CITY.N + 2;   // 14 hat
