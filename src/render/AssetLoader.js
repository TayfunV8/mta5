// İsteğe bağlı GLB modelleri: public/models/... altında varsa yüklenir, yoksa prosedürel modeller kullanılmaya devam eder.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VEHICLES } from '../physics/vehicleSpecs.js';
import { rideHeight } from './VehicleModels.js';

const loader = new GLTFLoader(), cache = new Map();
async function exists(url) { try { const r = await fetch(url); const ct = r.headers.get('content-type') ?? ''; const ok = r.ok && !ct.includes('text/html'); r.body?.cancel?.(); return ok; } catch { return false; } }

export const Assets = {
  vehicles: new Map(),     // spec -> {scene, wheels:{fl,fr,rl,rr}}
  characters: new Map(),   // ad -> gltf
  report: [],
  async loadAll(onProgress) {
    const jobs = [...Object.keys(VEHICLES).map((n) => ['vehicle', n, `/models/vehicles/${n}.glb`]), ...['lucia', 'jason'].map((n) => ['character', n, `/models/characters/${n}.glb`])];
    let k = 0;
    for (const [kind, name, url] of jobs) {
      try {
        if (await exists(url)) { const gltf = await loader.loadAsync(url); (kind === 'vehicle' ? this.vehicles : this.characters).set(name, gltf); this.report.push(`${kind}:${name} yüklendi`); }
      } catch (e) { console.warn(`[model] ${url} yüklenemedi, prosedürel model kullanılacak:`, e.message); this.report.push(`${kind}:${name} HATA`); }
      onProgress?.(++k / jobs.length);
    }
    return this.report;
  },
  /** Araç GLB'sini spec boyutuna ölçekleyip {root,paint,wheelNodes} döndürür (yoksa null). */
  vehicle(specName, color) {
    const g = this.vehicles.get(specName); if (!g) return null;
    const spec = VEHICLES[specName], root = g.scene.clone(true), box = new THREE.Box3().setFromObject(root), size = box.getSize(new THREE.Vector3());
    const s = spec.size.l / (size.z || 1); root.scale.multiplyScalar(s);
    const b2 = new THREE.Box3().setFromObject(root), c = b2.getCenter(new THREE.Vector3());
    const holder = new THREE.Group(); root.position.set(-c.x, -b2.min.y - rideHeight(spec) + 0.0, -c.z); holder.add(root);
    const wheelNodes = {}; const paint = [];
    root.traverse((o) => { o.castShadow = true; o.receiveShadow = true; const n = (o.name ?? '').toLowerCase(); for (const k of ['fl', 'fr', 'rl', 'rr', 'f', 'r']) if (n === 'wheel_' + k) wheelNodes[k] = o; if (o.material && /paint/i.test(o.material.name ?? '')) { o.material = o.material.clone(); o.material.color.setHex(color); paint.push(o.material); } });
    return { holder, wheelNodes, paint };
  },
};
