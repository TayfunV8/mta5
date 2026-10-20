import * as THREE from 'three';
import { CITY, chunkColliders } from '../world/cityLayout.js';
import { surfaceTexture } from '../render/Textures.js';

// Ana thread'in statik dünya bilgisi: kamera çarpışması için kutu ışın testi + zemin/deniz görselleri.
export class StaticWorld {
  constructor(scene, physics) { this.scene = scene; this.physics = physics; this.boxes = new Map(); this.waterMat = null; }

  build() {
    const { scene, physics } = this;
    // fizik: ana zemin (üst yüzey y=0) ve sahil eğimi + deniz tabanı
    physics.loadChunk('ground', [
      [0, -0.5, -150, 1300, 0.5, 850, 'grass'],
      [0, -0.5, 705, 1300, 0.5, 40, 'sand'],
      [0, -3.0, 747, 1300, 0.5, 37, 'sand', Math.sin(0.0475), 0, 0, Math.cos(0.0475)],     // sahil eğimi (≈5.4°)
      [0, -6.5, 1100, 1500, 0.5, 400, 'sand'],
    ]);
    const g = surfaceTexture('grass'); g.repeat.set(300, 300);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(2600, 2600).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: g, roughness: 1, color: 0xbfd8a8 }));
    ground.position.set(0, -0.02, -250); ground.receiveShadow = true; scene.add(ground);
    const sandTex = surfaceTexture('sand').clone(); sandTex.repeat.set(160, 20); sandTex.needsUpdate = true;
    const sand = new THREE.Mesh(new THREE.PlaneGeometry(2600, 80).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: sandTex, roughness: 1 }));
    sand.position.set(0, -0.01, 705); sand.receiveShadow = true; scene.add(sand);
    this.water = this._water(); scene.add(this.water);
  }

  _water() {
    // Gerstner dalgaları (3 dalga) — köşe gölgelendiricisinde; fizik aynı dalgayı okuyabilir (water.js)
    const geo = new THREE.PlaneGeometry(3400, 1800, 220, 120).rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({ color: 0x1e6d9a, roughness: 0.12, metalness: 0.3, transparent: true, opacity: 0.92 });
    const uniforms = { uTime: { value: 0 }, uAmp: { value: 1 } };
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = uniforms.uTime; sh.uniforms.uAmp = uniforms.uAmp;
      sh.vertexShader = 'uniform float uTime; uniform float uAmp;\n' + sh.vertexShader.replace('#include <begin_vertex>', `
        vec3 transformed = position;
        vec2 p = position.xz;
        float h = 0.0; vec2 d1 = normalize(vec2(1.0, 0.6)), d2 = normalize(vec2(-0.4, 1.0)), d3 = normalize(vec2(0.7, -0.8));
        float k1 = 6.2831 / 38.0, k2 = 6.2831 / 17.0, k3 = 6.2831 / 8.0;
        float t1 = k1 * dot(d1, p) - sqrt(9.80665 * k1) * uTime, t2 = k2 * dot(d2, p) - sqrt(9.80665 * k2) * uTime, t3 = k3 * dot(d3, p) - sqrt(9.80665 * k3) * uTime;
        h += 0.55 * uAmp * sin(t1) + 0.25 * uAmp * sin(t2) + 0.10 * uAmp * sin(t3);
        transformed.xz += d1 * 0.5 * uAmp * cos(t1) * 0.5 + d2 * 0.25 * uAmp * cos(t2) * 0.5 + d3 * 0.1 * uAmp * cos(t3) * 0.5;
        transformed.y += h;`);
    };
    const m = new THREE.Mesh(geo, mat); m.position.set(0, -0.45, 1560); m.userData.uniforms = uniforms; m.receiveShadow = false; return m;
  }

  /** İki katmanlı yüzey: her parça yüklendiğinde kutu listesini kaydet (kamera çarpışması için). */
  addChunk(id, bi, bj) { this.boxes.set(id, chunkColliders(bi, bj).filter((b) => b[1] > 0.5)); }
  removeChunk(id) { this.boxes.delete(id); }

  /** Işın - AABB kesişimi (en yakın t, yoksa maxT). */
  rayBoxes(ox, oy, oz, dx, dy, dz, maxT) {
    let best = maxT;
    const bi = Math.round(ox / CITY.CELL), bj = Math.round(oz / CITY.CELL);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const list = this.boxes.get(`${bi + i},${bj + j}`); if (!list) continue;
      for (const b of list) {
        let t0 = 0, t1 = best, ok = true;
        for (const [o, d, c, h] of [[ox, dx, b[0], b[3]], [oy, dy, b[1], b[4]], [oz, dz, b[2], b[5]]]) {
          if (Math.abs(d) < 1e-6) { if (o < c - h || o > c + h) { ok = false; break; } continue; }
          let a = (c - h - o) / d, e = (c + h - o) / d; if (a > e) { const t = a; a = e; e = t; }
          t0 = Math.max(t0, a); t1 = Math.min(t1, e); if (t0 > t1) { ok = false; break; }
        }
        if (ok && t0 < best) best = t0;
      }
    }
    return best;
  }
  update(simTime, amp = 1) { this.water.userData.uniforms.uTime.value = simTime; this.water.userData.uniforms.uAmp.value = amp; }
}
