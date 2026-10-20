// Bir şehir bloğunun (parça) görsel geometrisi: kaldırımlar, yol şeritleri + işaretler, binalar (cephe dokulu),
// ağaç/palmiye/lamba (instancing), trafik ışıkları. Aynı materyale ait geometriler tek mesh'te birleştirilir.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CITY, BLOCK_SIZE, LOT } from '../world/cityLayout.js';
import { nodeId } from '../world/nav.js';
import { mulberry32, hash2 } from '../world/rng.js';
import { facadeTextures, surfaceTexture, signTexture, FACADE } from './Textures.js';

const CURB = CITY.CURB, ROAD_Y = 0.045;
const { CELL, ROAD, SIDEWALK } = CITY;

/** Paylaşılan materyaller (tüm parçalar aynı örnekleri kullanır). */
export class CityMaterials {
  constructor(atmo) {
    this.atmo = atmo; this.cache = new Map();
    this.lamp = new THREE.MeshStandardMaterial({ color: 0xfff2cc, emissive: 0xffd9a0, emissiveIntensity: 0 }); atmo.registerLamp(this.lamp);
    this.signal = { red: new THREE.Color(0xff2a1a), yellow: new THREE.Color(0xffc21a), green: new THREE.Color(0x2aff5a), off: new THREE.Color(0x201010) };
  }
  get(key, make) { let m = this.cache.get(key); if (!m) { m = make(); this.cache.set(key, m); } return m; }
  solid(color, o = {}) { return this.get('s' + color + JSON.stringify(o), () => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.05, ...o })); }
  facade(style, color) {
    return this.get('f' + style + color, () => {
      const t = facadeTextures(style), glassy = style === 'glass' || style === 'dealer';
      const m = new THREE.MeshStandardMaterial({ map: t.map, emissiveMap: t.emissive, emissive: 0xffffff, emissiveIntensity: 0, color, roughness: glassy ? 0.25 : 0.85, metalness: glassy ? 0.55 : 0.05 });
      this.atmo.registerWindow(m); return m;
    });
  }
  surface(kind, o = {}) { return this.get('p' + kind + JSON.stringify(o), () => new THREE.MeshStandardMaterial({ map: surfaceTexture(kind), roughness: kind === 'asphalt' ? 0.95 : 0.9, ...o })); }
  sign(text, bg, fg) { return this.get('n' + text + bg, () => new THREE.MeshBasicMaterial({ map: signTexture(text, bg, fg), toneMapped: false })); }
  container(color) { return this.get('c' + color, () => new THREE.MeshStandardMaterial({ map: surfaceTexture('container'), color, roughness: 0.6, metalness: 0.3 })); }
  paint(color) { return this.get('v' + color, () => new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.6 })); }
}

// -------------------------------------------------------------- geometri yardımcıları
function boxGeo(w, h, d, tw = FACADE.w, th = FACADE.h) {
  const g = new THREE.BoxGeometry(w, h, d), p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    if (Math.abs(n.getX(i)) > 0.5) uv.setXY(i, p.getZ(i) / tw, (p.getY(i) + h / 2) / th);
    else if (Math.abs(n.getZ(i)) > 0.5) uv.setXY(i, p.getX(i) / tw, (p.getY(i) + h / 2) / th);
    else uv.setXY(i, p.getX(i) / tw, p.getZ(i) / th);
  }
  return g;
}
function planeGeo(w, d, tile = 8) { const g = new THREE.PlaneGeometry(w, d); g.rotateX(-Math.PI / 2); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / tile, uv.getY(i) * d / tile); return g; }
const place = (g, x, y, z) => { g.translate(x, y, z); return g; };
const nonIdx = (g) => (g.index ? g.toNonIndexed() : g);

// paylaşılan instancing geometrileri
let SHARED = null;
function shared() {
  if (SHARED) return SHARED;
  const pole = mergeGeometries([place(new THREE.CylinderGeometry(0.09, 0.13, 6.4, 8).toNonIndexed(), 0, 3.2, 0), place(new THREE.BoxGeometry(1.6, 0.1, 0.1).toNonIndexed(), 0.7, 6.35, 0)]);
  const head = place(new THREE.BoxGeometry(0.7, 0.14, 0.32).toNonIndexed(), 1.35, 6.28, 0);
  const trunk = place(new THREE.CylinderGeometry(0.16, 0.24, 3, 7).toNonIndexed(), 0, 1.5, 0);
  const crown = place(nonIdx(new THREE.IcosahedronGeometry(1.9, 1)), 0, 4.4, 0);
  const cp = crown.attributes.position; for (let i = 0; i < cp.count; i++) { const k = (Math.sin(i * 12.9898) * 43758.5453) % 1; cp.setXYZ(i, cp.getX(i) * (1 + k * 0.08), cp.getY(i) * (0.9 + k * 0.1), cp.getZ(i) * (1 + k * 0.08)); } crown.computeVertexNormals();
  const palmTrunk = place(new THREE.CylinderGeometry(0.14, 0.26, 7.5, 7).toNonIndexed(), 0, 3.75, 0);
  const palmCrown = mergeGeometries([0, 1, 2, 3, 4, 5].map((i) => { const g = new THREE.ConeGeometry(0.55, 4.2, 4).toNonIndexed(); g.rotateZ(Math.PI / 2 + 0.45); g.translate(1.5, 0, 0); g.rotateY((i / 6) * Math.PI * 2); g.translate(0, 7.4, 0); return g; }));
  SHARED = { pole, head, trunk, crown, palmTrunk, palmCrown, disc: new THREE.CircleGeometry(0.17, 10), signalBox: null };
  return SHARED;
}

function instanced(geo, mat, items, o = {}) {
  const m = new THREE.InstancedMesh(geo, mat, items.length), d = new THREE.Object3D();
  items.forEach((it, i) => { d.position.set(it.x, it.y ?? CURB, it.z); d.rotation.set(0, it.rot ?? 0, 0); d.scale.setScalar(it.s ?? 1); d.updateMatrix(); m.setMatrixAt(i, d.matrix); if (it.color !== undefined && m.setColorAt) m.setColorAt(i, new THREE.Color(it.color)); });
  m.castShadow = !!o.shadow; m.receiveShadow = true; m.frustumCulled = true; return m;
}

// -------------------------------------------------------------- parça oluşturucu
export function buildChunk(B, mats, cfg = {}) {
  const group = new THREE.Group(), details = new THREE.Group(); group.add(details);
  const buckets = new Map(), r = mulberry32(hash2(B.bi, B.bj, 99));
  const put = (mat, geo) => { let b = buckets.get(mat); if (!b) buckets.set(mat, (b = { mat, geos: [] })); b.geos.push(nonIdx(geo)); };
  const bx = B.cx, bz = B.cz;

  // ---- zemin: blok kaidesi, kaldırım halkası, iç saha, ek yamalar
  const slabMat = mats.solid(0x9c9a94);
  if (B.district !== 'country') {
    put(slabMat, place(new THREE.BoxGeometry(BLOCK_SIZE, CURB, BLOCK_SIZE), bx, CURB / 2, bz));
    const sw = mats.surface('sidewalk'), y = CURB + 0.004, e = BLOCK_SIZE / 2 - SIDEWALK / 2;
    put(sw, place(planeGeo(BLOCK_SIZE, SIDEWALK, 4), bx, y, bz - e)); put(sw, place(planeGeo(BLOCK_SIZE, SIDEWALK, 4), bx, y, bz + e));
    put(sw, place(planeGeo(SIDEWALK, LOT, 4), bx - e, y, bz)); put(sw, place(planeGeo(SIDEWALK, LOT, 4), bx + e, y, bz));
    put(mats.surface(B.padMat, B.padMat === 'sand' ? {} : {}), place(planeGeo(LOT, LOT, 8), bx, CURB + 0.006, bz));
    B.pads.forEach((p, i) => put(mats.surface(p.mat), place(planeGeo(p.w, p.d, p.mat === 'wood' ? 4 : 8), p.x, CURB + 0.009 + i * 0.0008, p.z)));
    const white = mats.solid(0xf0f0ea, { roughness: 0.7 });
    for (const s of B.spots) if (s.lot) { const g = new THREE.BoxGeometry(0.12, 0.01, 5); place(g, s.x - 1.5, CURB + 0.02, s.z); put(white, g); }
  } else put(mats.surface('grass'), place(planeGeo(CELL, CELL, 8), bx, 0.003, bz));

  // ---- yollar (kuzey ve batı kenarı), işaretler
  const asph = mats.surface('asphalt'), yellow = mats.solid(0xe8b923, { roughness: 0.7 }), whiteM = mats.solid(0xf0f0ea, { roughness: 0.7 });
  const strip = (x, z, w, d) => put(asph, place(planeGeo(w, d, 10), x, ROAD_Y, z));
  strip(bx - CELL / 2, bz, ROAD, CELL); strip(bx, bz - CELL / 2, CELL, ROAD);
  if (B.bi === CITY.N) strip(bx + CELL / 2, bz, ROAD, CELL); if (B.bj === CITY.N) strip(bx, bz + CELL / 2, CELL, ROAD);
  const mark = (m, x, z, w, d) => put(m, place(new THREE.BoxGeometry(w, 0.012, d), x, ROAD_Y + 0.008, z));
  const ix = bx - CELL / 2, iz = bz - CELL / 2;
  // N-S yol (x=ix): çift sarı çizgi ve kenar çizgileri, kavşak karesini (±8) atla
  for (const [a, b] of [[iz + ROAD / 2, bz + CELL / 2 - ROAD / 2]]) { const len = b - a, c = (a + b) / 2; mark(yellow, ix - 0.18, c, 0.13, len); mark(yellow, ix + 0.18, c, 0.13, len); mark(whiteM, ix - 7.4, c, 0.14, len); mark(whiteM, ix + 7.4, c, 0.14, len); }
  { const a = ix + ROAD / 2, b = bx + CELL / 2 - ROAD / 2, len = b - a, c = (a + b) / 2; mark(yellow, c, iz - 0.18, len, 0.13); mark(yellow, c, iz + 0.18, len, 0.13); mark(whiteM, c, iz - 7.4, len, 0.14); mark(whiteM, c, iz + 7.4, len, 0.14); }
  // yaya geçitleri (zebra) + dur çizgileri: kuzeybatı kavşağında 4 yön
  for (let k = -5; k <= 5; k++) {
    const o = k * 1.3;
    mark(whiteM, ix + o, iz - 10.5, 0.7, 3.4); mark(whiteM, ix + o, iz + 10.5, 0.7, 3.4);
    mark(whiteM, ix - 10.5, iz + o, 3.4, 0.7); mark(whiteM, ix + 10.5, iz + o, 3.4, 0.7);
  }
  mark(whiteM, ix + 3.6, iz - 13.2, 7, 0.4); mark(whiteM, ix - 3.6, iz + 13.2, 7, 0.4); mark(whiteM, ix - 13.2, iz - 3.6, 0.4, 7); mark(whiteM, ix + 13.2, iz + 3.6, 0.4, 7);

  // ---- binalar
  const rooftop = (b, top) => {
    const roof = mats.solid(0x55585e), n = 2 + Math.floor(r() * 3);
    put(roof, place(new THREE.BoxGeometry(b.w + 0.5, 0.5, b.d + 0.5), b.x, top + 0.25, b.z));
    for (let i = 0; i < n; i++) put(mats.solid(0xa9adb2, { metalness: 0.3 }), place(new THREE.BoxGeometry(1.6 + r() * 2, 1.2 + r(), 1.4 + r() * 2), b.x + (r() - 0.5) * (b.w - 5), top + 1.1, b.z + (r() - 0.5) * (b.d - 5)));
  };
  const sign = (text, x, y, z, w, ry = 0, bg, fg) => { const g = new THREE.PlaneGeometry(w, w / 4); g.rotateY(ry); g.translate(x, y, z); put(mats.sign(text, bg ?? '#12141c', fg ?? '#ffe27a'), g); };
  const walls = (b, style, base, h = b.h) => { const g = boxGeo(b.w, h, b.d); g.translate(b.x, base + h / 2, b.z); put(mats.facade(style, b.color ?? 0xffffff), g); };
  for (const b of B.buildings) {
    const base = (b.y ?? 0) + CURB;
    switch (b.kind) {
      case 'tower': {
        const pod = 5; put(mats.facade('dealer', 0xdfe6ea), place(boxGeo(b.w + 3, pod, b.d + 3), b.x, base + pod / 2, b.z));
        const hh = b.h - pod; const g = boxGeo(b.w, hh, b.d); g.translate(b.x, base + pod + hh / 2, b.z); put(mats.facade(b.style, b.color), g);
        const top = base + b.h; rooftop(b, top);
        if (b.h > 100) put(mats.solid(0xcc2222), place(new THREE.CylinderGeometry(0.15, 0.2, 18, 6), b.x, top + 9, b.z));
        break;
      }
      case 'office': case 'apt': case 'hotel': { walls(b, b.style, base); rooftop(b, base + b.h); if (b.kind === 'hotel') sign(b.name, b.x, base + b.h - 3, b.z + b.d / 2 + 0.2, 10, 0, '#10253a', '#7df9ff'); else put(mats.facade('dealer', 0xdfe6ea), place(boxGeo(b.w + 0.4, 4, b.d + 0.4), b.x, base + 2, b.z)); break; }
      case 'garage': {
        if (b.name) {   // tamir atölyesi
          walls(b, b.style, base); rooftop(b, base + b.h);
          for (let i = 0; i < 2; i++) put(mats.solid(0x8f959c, { metalness: 0.4 }), place(new THREE.BoxGeometry(4, 3.3, 0.2), b.x - 5 + i * 10, base + 1.65, b.z + b.d / 2 + 0.05));
          sign(b.name, b.x, base + b.h + 1.5, b.z + b.d / 2 + 0.3, 8);
        } else { walls(b, 'garage', base); rooftop(b, base + b.h); }
        break;
      }
      case 'house': {
        walls(b, 'stucco', base); const f = b.facing ?? 1;
        const rh = 2.6, shape = new THREE.Shape([new THREE.Vector2(-b.d / 2 - 0.5, 0), new THREE.Vector2(b.d / 2 + 0.5, 0), new THREE.Vector2(0, rh)]);
        const g = new THREE.ExtrudeGeometry(shape, { depth: b.w + 1, bevelEnabled: false }); g.translate(0, 0, -(b.w + 1) / 2); g.rotateY(Math.PI / 2); g.translate(b.x, base + b.h, b.z); put(mats.solid(b.roof ?? 0x6b4a3a, { roughness: 0.9 }), g);
        put(mats.solid(0x4a3426), place(new THREE.BoxGeometry(1.1, 2.2, 0.15), b.x - 2, base + 1.1, b.z + f * (b.d / 2 + 0.05)));
        put(mats.solid(0xdedad2), place(new THREE.BoxGeometry(3.2, 2.4, 0.15), b.x + 3.3, base + 1.2, b.z + f * (b.d / 2 + 0.05)));
        put(mats.solid(0x8a5a44), place(new THREE.BoxGeometry(0.8, 2.2, 0.8), b.x + b.w / 3, base + b.h + 2.2, b.z));
        break;
      }
      case 'shop': {
        walls(b, b.style === 'shop' ? 'stucco' : b.style, base);
        put(mats.solid(b.color ?? 0xcc5544), place(new THREE.BoxGeometry(b.w + 0.3, 0.9, b.d + 0.3), b.x, base + b.h + 0.45, b.z));
        put(mats.get('glassdark', () => new THREE.MeshStandardMaterial({ color: 0x1b2f3d, roughness: 0.08, metalness: 0.85 })), place(new THREE.BoxGeometry(b.w - 2, 2.8, 0.15), b.x, base + 1.8, b.z + b.d / 2 + 0.06));
        put(mats.solid(b.color ?? 0xcc5544), place(new THREE.BoxGeometry(b.w - 1, 0.12, 1.6), b.x, base + 3.5, b.z + b.d / 2 + 0.8));
        sign(b.name ?? 'SHOP', b.x, base + 4.3, b.z + b.d / 2 + 0.2, Math.min(b.w - 3, 8)); rooftop(b, base + b.h + 0.9); break;
      }
      case 'dealer': { walls(b, 'dealer', base); rooftop(b, base + b.h); sign('AUTO MALL', b.x, base + b.h + 2, b.z + b.d / 2 + 0.2, 10, 0, '#10253a', '#7df9ff'); break; }
      case 'canopy': {
        put(mats.solid(b.color), place(new THREE.BoxGeometry(b.w, 0.7, b.d), b.x, base + b.h, b.z)); put(mats.solid(0xf2f2ee), place(new THREE.BoxGeometry(b.w + 0.2, 0.2, b.d + 0.2), b.x, base + b.h - 0.45, b.z));
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(mats.solid(0xdadada), place(new THREE.BoxGeometry(0.5, b.h, 0.5), b.x + sx * (b.w / 2 - 1), base + b.h / 2, b.z + sz * (b.d / 2 - 1)));
        break;
      }
      case 'pump': put(mats.solid(b.color), place(new THREE.BoxGeometry(b.w, b.h, b.d), b.x, base + b.h / 2, b.z)); break;
      case 'warehouse': {
        walls(b, 'metal', base); put(mats.solid(0x666b70, { metalness: 0.4 }), place(new THREE.BoxGeometry(b.w + 0.6, 0.6, b.d + 0.6), b.x, base + b.h + 0.3, b.z));
        for (let i = 0; i < 3; i++) put(mats.solid(0x7a8087, { metalness: 0.5 }), place(new THREE.BoxGeometry(5, 5, 0.2), b.x - b.w / 3 + i * (b.w / 3), base + 2.5, b.z + b.d / 2 + 0.05)); break;
      }
      case 'container': { const g = boxGeo(b.w, b.h, b.d, 12, 2.6); g.translate(b.x, base + (b.y ?? 0) * 0 + b.h / 2 + (b.y ?? 0) - (b.y ?? 0) + 0, b.z); g.translate(0, (b.y ?? 0) - (b.y ?? 0), 0); put(mats.container(b.color), g); break; }
      case 'crane': {
        const y = mats.solid(b.color, { roughness: 0.5 });
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(y, place(new THREE.BoxGeometry(1.2, b.h, 1.2), b.x + sx * 12, base + b.h / 2, b.z + sz * 3));
        put(y, place(new THREE.BoxGeometry(46, 2, 3), b.x - 10, base + b.h, b.z)); put(y, place(new THREE.BoxGeometry(24, 1.4, 1.4), b.x + 6, base + b.h - 4, b.z - 3)); put(mats.solid(0x333333), place(new THREE.BoxGeometry(4, 3, 3), b.x, base + b.h + 2, b.z)); break;
      }
    }
  }

  // ---- propler: küçük birleşik geometriler + instancing
  const lamps = [], trees = [], palms = [];
  for (const p of B.props) {
    const base = B.district === 'country' ? 0 : CURB;
    if (p.t === 'lamp') lamps.push({ x: p.x, z: p.z, rot: p.z < bz ? 0 : Math.PI, y: base });
    else if (p.t === 'tree') trees.push({ x: p.x, z: p.z, s: p.s ?? 1, y: base, color: [0x3f7a35, 0x4a8a3c, 0x2f6a30, 0x558f3a][Math.floor(r() * 4)], rot: r() * 6 });
    else if (p.t === 'palm') palms.push({ x: p.x, z: p.z, s: p.s ?? 1, y: base, rot: r() * 6 });
    else if (p.t === 'bench') { put(mats.solid(0x7a5a3a), place(new THREE.BoxGeometry(1.8, 0.1, 0.5), p.x, base + 0.5, p.z)); put(mats.solid(0x7a5a3a), place(new THREE.BoxGeometry(1.8, 0.5, 0.08), p.x, base + 0.8, p.z - 0.25)); }
    else if (p.t === 'mailbox') { put(mats.solid(0x2a4a8a), place(new THREE.BoxGeometry(0.3, 0.3, 0.5), p.x, base + 1.1, p.z)); put(mats.solid(0x555555), place(new THREE.BoxGeometry(0.06, 1, 0.06), p.x, base + 0.5, p.z)); }
    else if (p.t === 'sign') { put(mats.solid(0x666666), place(new THREE.CylinderGeometry(0.1, 0.1, 6, 6), p.x, base + 3, p.z)); sign(p.text, p.x, base + 5.6, p.z + 0.2, 4); }
    else if (p.t === 'fence') { const len = p.len, rot = !!p.rot; const g = new THREE.BoxGeometry(rot ? 0.06 : len, 1.8, rot ? len : 0.06); put(mats.get('chain', () => new THREE.MeshStandardMaterial({ color: 0x8a9096, transparent: true, opacity: 0.35, metalness: 0.5 })), place(g, p.x, base + 1, p.z)); for (let i = 0; i <= 8; i++) put(mats.solid(0x777b80), place(new THREE.BoxGeometry(0.12, 2.1, 0.12), rot ? p.x : p.x - len / 2 + (i * len) / 8, base + 1.05, rot ? p.z - len / 2 + (i * len) / 8 : p.z)); }
  }
  const S = shared(), shadows = !!cfg.shadows;
  if (lamps.length) { details.add(instanced(S.pole, mats.solid(0x4b5058, { metalness: 0.5 }), lamps)); details.add(instanced(S.head, mats.lamp, lamps)); }
  if (trees.length) { details.add(instanced(S.trunk, mats.solid(0x5b4129), trees, { shadow: shadows })); const c = instanced(S.crown, mats.solid(0xffffff, { roughness: 0.95, flatShading: true }), trees, { shadow: shadows }); details.add(c); }
  if (palms.length) { details.add(instanced(S.palmTrunk, mats.solid(0x8a6a48), palms)); details.add(instanced(S.palmCrown, mats.solid(0x3f8a3a, { side: THREE.DoubleSide }), palms)); }

  // ---- trafik ışıkları: her blok köşesindeki direk, yaklaşan trafiğe bakan 2 kafa
  const signalHeads = [], pole = mats.solid(0x333639, { metalness: 0.6 }), box = mats.solid(0x1a1a1c);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const px = bx + sx * 41.5, pz = bz + sz * 41.5, ia = Math.round((bx + sx * 50) / CELL + 6.5), ib = Math.round((bz + sz * 50) / CELL + 6.5);
    if (ia < 0 || ib < 0 || ia > 13 || ib > 13) continue;
    put(pole, place(new THREE.CylinderGeometry(0.1, 0.12, 5.2, 8), px, CURB + 2.6, pz));
    for (const axis of ['EW', 'NS']) {
      const hx = axis === 'EW' ? px - sx * 0.55 : px, hz = axis === 'NS' ? pz - sz * 0.55 : pz;
      put(box, place(axis === 'EW' ? new THREE.BoxGeometry(0.35, 1.1, 0.35) : new THREE.BoxGeometry(0.35, 1.1, 0.35), hx, CURB + 4.6, hz));
      for (let k = 0; k < 3; k++) signalHeads.push({ id: nodeId(ia, ib), axis, x: hx + (axis === 'EW' ? -sx * 0.2 : 0), y: CURB + 4.95 - k * 0.33, z: hz + (axis === 'NS' ? -sz * 0.2 : 0), lamp: k, ry: axis === 'EW' ? (-sx > 0 ? Math.PI / 2 : -Math.PI / 2) : (-sz > 0 ? 0 : Math.PI) });
    }
  }
  const sigMesh = new THREE.InstancedMesh(S.disc, new THREE.MeshBasicMaterial({ toneMapped: false }), Math.max(1, signalHeads.length));
  const d = new THREE.Object3D(); signalHeads.forEach((h, i) => { d.position.set(h.x, h.y, h.z); d.rotation.set(0, h.ry, 0); d.updateMatrix(); sigMesh.setMatrixAt(i, d.matrix); sigMesh.setColorAt(i, mats.signal.off); }); sigMesh.count = signalHeads.length; group.add(sigMesh);

  // ---- birleştir
  const meshes = [];
  for (const { mat, geos } of buckets.values()) {
    const g = mergeGeometries(geos); if (!g) continue;
    const m = new THREE.Mesh(g, mat); m.castShadow = shadows && mat !== slabMat; m.receiveShadow = true; group.add(m); meshes.push(m);
  }
  const chunk = {
    group, details, signalHeads, sigMesh, id: B.id, B,
    updateSignals(t) {
      let ch = false;
      for (let i = 0; i < signalHeads.length; i++) {
        const h = signalHeads[i], st = signalStateCached(h.id, t)[h.axis], on = (st === 'red' && h.lamp === 0) || (st === 'yellow' && h.lamp === 1) || (st === 'green' && h.lamp === 2);
        sigMesh.setColorAt(i, on ? mats.signal[st] : mats.signal.off); ch = true;
      }
      if (ch && sigMesh.instanceColor) sigMesh.instanceColor.needsUpdate = true;
    },
    dispose() { for (const m of meshes) m.geometry.dispose(); group.traverse((o) => { if (o.isInstancedMesh) o.dispose(); }); },
  };
  return chunk;
}
import { signalState } from '../world/nav.js';
const sigCache = new Map();
function signalStateCached(id, t) { const k = id + ':' + Math.floor(t); let s = sigCache.get(k); if (!s) { if (sigCache.size > 4000) sigCache.clear(); s = signalState(id, t); sigCache.set(k, s); } return s; }
