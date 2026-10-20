// Araç modelleri: yan siluet profilinin ekstrüzyonu + cam + tekerlek + farlar. Gövde sık üçgenlere bölünür,
// böylece çarpmada tepe noktaları içeri doğru ezilebilir (gerçek zamanlı deformasyon).
import * as THREE from 'three';
import { TessellateModifier } from 'three/addons/modifiers/TessellateModifier.js';
import { VEHICLES } from '../physics/vehicleSpecs.js';
import { Assets } from './AssetLoader.js';

// normalize profil: [u (öne=0 -> arkaya=1), v (0 etek -> 1 tavan)]
const PROFILES = {
  sedan: { body: [[0, 0], [0, .30], [.05, .42], [.30, .47], [.35, .50], [.50, 1], [.72, 1], [.86, .56], [.98, .52], [1, .40], [1, 0]], glass: [[.37, .53], [.51, .93], [.71, .93], [.84, .58]] },
  coupe: { body: [[0, 0], [0, .30], [.05, .45], [.36, .49], [.40, .51], [.53, 1], [.68, 1], [.90, .58], [1, .50], [1, 0]], glass: [[.41, .54], [.54, .93], [.67, .93], [.86, .60]] },
  suv: { body: [[0, 0], [0, .32], [.04, .42], [.30, .46], [.36, .49], [.45, 1], [.90, 1], [.97, .55], [1, .45], [1, 0]], glass: [[.37, .52], [.46, .93], [.89, .93], [.94, .56]] },
  pickup: { body: [[0, 0], [0, .30], [.04, .43], [.30, .50], [.34, .52], [.42, 1], [.60, 1], [.64, .58], [.66, .54], [1, .54], [1, 0]], glass: [[.35, .54], [.43, .93], [.59, .93], [.63, .57]] },
  van: { body: [[0, 0], [0, .22], [.04, .42], [.12, .66], [.17, 1], [.985, 1], [1, .92], [1, 0]], glass: [[.13, .62], [.18, .93], [.30, .93], [.30, .62]] },
};
const mats = {};
const M = (k, f) => mats[k] ?? (mats[k] = f());
const dark = () => M('dark', () => new THREE.MeshStandardMaterial({ color: 0x141518, roughness: 0.6, metalness: 0.2 }));
const glassM = () => M('glass', () => new THREE.MeshStandardMaterial({ color: 0x0d1822, roughness: 0.05, metalness: 0.9, transparent: true, opacity: 0.55, depthWrite: false }));
const tireM = () => M('tire', () => new THREE.MeshStandardMaterial({ color: 0x16161a, roughness: 0.9 }));
const rimM = () => M('rim', () => new THREE.MeshStandardMaterial({ color: 0xbfc4ca, roughness: 0.25, metalness: 0.9 }));
const chrome = () => M('chrome', () => new THREE.MeshStandardMaterial({ color: 0xcfd3d8, roughness: 0.2, metalness: 0.9 }));

function extrudeProfile(pts, L, H, width, y0, bevel = 0.03) {
  const sh = new THREE.Shape(); pts.forEach(([u, v], i) => { const x = (u - 0.5) * L, y = v * H; i ? sh.lineTo(x, y) : sh.moveTo(x, y); });
  const g = new THREE.ExtrudeGeometry(sh, { depth: width - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 1 });
  g.translate(0, 0, -(width - bevel * 2) / 2); g.rotateY(-Math.PI / 2); g.translate(0, y0, 0);   // shape X -> car Z (ön = -Z)
  return g;
}
const tess = (g, e = 0.42) => { const t = new TessellateModifier(e, 6); return t.modify(g.index ? g.toNonIndexed() : g); };
export const rideHeight = (spec) => { const k = (spec.mass / spec.wheels.length) * Math.pow(2 * Math.PI * spec.suspFreq, 2); return -spec.mountY + (spec.L0 - ((spec.mass / spec.wheels.length) * 9.80665) / k) + spec.wheels[0].radius; };

export function createVehicleVisual(specName, color, atmo) {
  const spec = VEHICLES[specName], { l: L, w: W, h: H } = spec.size, rh = rideHeight(spec);
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const deform = [], ground = -rh, sill = ground + (spec.bike ? 0.25 : 0.2);
  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.32, metalness: 0.55 });
  const headMat = new THREE.MeshStandardMaterial({ color: 0xfff6dd, emissive: 0xfff2c8, emissiveIntensity: 0.6 }), tailMat = new THREE.MeshStandardMaterial({ color: 0x8a0a0a, emissive: 0xff1a10, emissiveIntensity: 0.6 });
  const add = (g, m, x = 0, y = 0, z = 0, shadow = true) => { const me = new THREE.Mesh(g, m); me.position.set(x, y, z); me.castShadow = shadow; me.receiveShadow = true; body.add(me); return me; };
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

  const glb = Assets.vehicle(specName, color);
  if (glb) { body.add(glb.holder); }
  else if (spec.bike) {
    // motosiklet: şase, depo, koltuk, far, sürücü yeri (sürücü ayrı humanoid ile oturtulur)
    const frame = new THREE.MeshStandardMaterial({ color: 0x222226, roughness: 0.4, metalness: 0.7 });
    add(box(0.18, 0.28, 0.9), frame, 0, ground + 0.5, 0.05); add(box(0.3, 0.26, 0.55), paint, 0, ground + 0.78, -0.2); add(box(0.24, 0.1, 0.55), dark(), 0, ground + 0.78, 0.38);
    add(box(0.16, 0.5, 0.06), frame, 0, ground + 0.55, -0.62).rotation.x = 0.3; add(box(0.46, 0.04, 0.04), frame, 0, ground + 0.92, -0.6);
    add(box(0.22, 0.2, 0.18), paint, 0, ground + 0.78, -0.66); add(box(0.12, 0.1, 0.05), headMat, 0, ground + 0.82, -0.78); add(box(0.14, 0.06, 0.1), tailMat, 0, ground + 0.82, 0.78);
    add(box(0.08, 0.1, 0.9), chrome(), 0.15, ground + 0.3, 0.3);
  } else {
    const pr = PROFILES[specName], bodyH = H - (sill - ground) - 0.02;
    const bg = tess(extrudeProfile(pr.body, L, bodyH, W * 0.99, sill), 0.42); const bm = add(bg, paint); deform.push(bm);
    // cam: aynı siluetin cam bandı, gövdeden hafif geniş
    const gl = tess(extrudeProfile(pr.glass.concat([]), L, bodyH, W * 1.003, sill, 0.01), 0.42); const gm = add(gl, glassM(), 0, 0, 0, false); gm.renderOrder = 2; deform.push(gm);
    // ön/arka tampon, ızgara, farlar, stop lambaları, plaka, aynalar, kapı çizgileri
    add(box(W * 0.98, 0.22, 0.3), dark(), 0, sill + 0.14, -L / 2 + 0.05); add(box(W * 0.98, 0.22, 0.3), dark(), 0, sill + 0.14, L / 2 - 0.05);
    add(box(W * 0.46, 0.14, 0.08), dark(), 0, sill + 0.5, -L / 2 + 0.01); add(box(0.5, 0.12, 0.02), M('plate', () => new THREE.MeshStandardMaterial({ color: 0xf3f0d8 })), 0, sill + 0.36, -L / 2 - 0.1); add(box(0.5, 0.12, 0.02), M('plate', () => new THREE.MeshStandardMaterial({ color: 0xf3f0d8 })), 0, sill + 0.4, L / 2 + 0.1);
    for (const s of [-1, 1]) {
      add(box(0.3, 0.1, 0.06), headMat, s * (W / 2 - 0.3), sill + (spec.name === 'pickup' ? 0.62 : 0.52), -L / 2 - 0.0);
      add(box(0.3, 0.1, 0.05), tailMat, s * (W / 2 - 0.28), sill + (spec.name === 'van' ? 0.7 : 0.55), L / 2 + 0.0);
      add(box(0.12, 0.08, 0.16), paint, s * (W / 2 + 0.07), sill + bodyH * 0.55, -L * (spec.name === 'van' ? 0.36 : 0.16));
      add(box(0.02, bodyH * 0.45, 0.02), dark(), s * (W / 2 + 0.005), sill + bodyH * 0.32, L * 0.0); add(box(0.02, bodyH * 0.45, 0.02), dark(), s * (W / 2 + 0.005), sill + bodyH * 0.32, -L * 0.16);
    }
    if (specName === 'pickup') { for (const [w, h, d, x, y, z] of [[0.08, 0.5, 2.3, W / 2 - 0.05, sill + 0.8, L * 0.17], [0.08, 0.5, 2.3, -W / 2 + 0.05, sill + 0.8, L * 0.17], [W, 0.5, 0.08, 0, sill + 0.8, L / 2 - 0.1], [W, 0.5, 0.08, 0, sill + 0.8, L * 0.17 - 1.1]]) add(box(w, h, d), paint, x, y, z); }
    if (specName === 'sedan' || specName === 'coupe') add(box(W * 0.7, 0.04, 0.3), paint, 0, sill + bodyH * 0.62, L * 0.4);   // spoiler/bagaj kenarı
    if (specName === 'coupe') add(box(W * 0.8, 0.05, 0.28), dark(), 0, sill + bodyH * 0.66, L * 0.47);
    if (specName === 'suv') add(box(W * 0.7, 0.05, 1.8), dark(), 0, sill + bodyH + 0.04, L * 0.12);   // tavan rayı
    // tekerlek yuvası gölgeleri
    for (const w of spec.wheels) add(new THREE.CylinderGeometry(w.radius + 0.05, w.radius + 0.05, 0.02, 14).rotateZ(Math.PI / 2), dark(), w.x + Math.sign(w.x) * (W / 2 - Math.abs(w.x) + 0.01), w.y + 0.0, w.z, false);
  }
  // tekerlekler: dünya dönüşünü fizikten alır (sahneye ayrı eklenir)
  const wheels = spec.wheels.map((w) => {
    const g = new THREE.Group(), R = w.radius, tw = w.width;
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(R, R, tw, 20).rotateZ(Math.PI / 2), tireM()); tire.castShadow = true; g.add(tire);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.62, R * 0.62, tw + 0.01, 14).rotateZ(Math.PI / 2), rimM()); g.add(rim);
    for (let i = 0; i < 5; i++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(tw + 0.02, R * 1.1, R * 0.1), dark()); sp.rotation.x = (i / 5) * Math.PI; g.add(sp); }
    return g;
  });

  const vis = {
    spec, root, body, wheels, deform, rh, headMat, tailMat, damage: 0, smoke: 0,
    orig: deform.map((m) => m.geometry.attributes.position.array.slice()), glb: !!glb,
    setLights(brake, night) { if (this.glb) return; this.tailMat.emissiveIntensity = brake ? 3.2 : 0.5 + night * 1.0; this.headMat.emissiveIntensity = 0.5 + night * 3; },
    /** Yerel çarpma: (lx,ly,lz)= hız değişimi yönü (gövde içine doğru), energy (J). Tepe noktaları içeri ezilir. */
    impact(lx, ly, lz, energy) {
      if (this.glb) { this.body.rotation.z = Math.min(0.03, (this.body.rotation.z ?? 0) + energy / 4e7); return; }
      const { hx, hy, hz } = spec.hull, d = new THREE.Vector3(lx, ly, lz).normalize();
      let t = Infinity; for (const [a, h] of [[d.x, W / 2], [d.y, H / 2], [d.z, L / 2]]) if (Math.abs(a) > 1e-3) t = Math.min(t, h / Math.abs(a));
      const c = new THREE.Vector3(0, sill + H * 0.35, 0), hit = c.clone().addScaledVector(d, -t);
      const rad = 0.6 + 0.9 * Math.sqrt(energy / 80000), depth = Math.min(0.5, energy / 450000);
      for (let mi = 0; mi < deform.length; mi++) {
        const g = deform[mi].geometry, p = g.attributes.position; let ch = false;
        for (let i = 0; i < p.count; i++) {
          const dx = p.getX(i) - hit.x, dy = p.getY(i) - hit.y, dz = p.getZ(i) - hit.z, dist = Math.hypot(dx, dy, dz);
          if (dist < rad) { const f = Math.pow(1 - dist / rad, 1.5) * depth * (0.8 + Math.random() * 0.4); p.setXYZ(i, p.getX(i) + d.x * f, p.getY(i) + d.y * f, p.getZ(i) + d.z * f); ch = true; }
        }
        if (ch) { p.needsUpdate = true; g.computeVertexNormals(); g.computeBoundingSphere(); }
      }
    },
    repair() { deform.forEach((m, i) => { m.geometry.attributes.position.array.set(this.orig[i]); m.geometry.attributes.position.needsUpdate = true; m.geometry.computeVertexNormals(); }); this.damage = 0; },
    setColor(c) { paint.color.setHex(c); },
    dispose() { deform.forEach((m) => m.geometry.dispose()); },
  };
  return vis;
}
