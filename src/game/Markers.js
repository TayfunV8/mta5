import * as THREE from 'three';
// 3B hedef işaretleri (ışık sütunu + halka) ve minimap noktaları.
export class Markers {
  constructor(scene) { this.scene = scene; this.items = new Map(); this.beam = new THREE.CylinderGeometry(1.4, 1.4, 60, 16, 1, true); this.ring = new THREE.TorusGeometry(2.2, 0.12, 8, 28); this.cube = new THREE.BoxGeometry(0.7, 0.7, 0.7); this.t = 0; }
  add(m) {   // {id, x, z, color, kind:'beam'|'pickup', label, blip:{shape}}
    this.remove(m.id); const g = new THREE.Group(), c = new THREE.Color(m.color);
    if (m.kind === 'pickup') { const mesh = new THREE.Mesh(this.cube, new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1.6 })); mesh.position.y = 1.2; g.add(mesh); const glow = new THREE.Mesh(this.beam, new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false })); glow.scale.set(0.4, 0.4, 0.4); glow.position.y = 12; g.add(glow); }
    else { const b = new THREE.Mesh(this.beam, new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false })); b.position.y = 30; g.add(b); const r = new THREE.Mesh(this.ring, new THREE.MeshBasicMaterial({ color: c })); r.rotation.x = Math.PI / 2; r.position.y = 0.4; g.add(r); }
    g.position.set(m.x, (m.y ?? 0.2), m.z); this.scene.add(g); this.items.set(m.id, { ...m, g }); return m;
  }
  remove(id) { const it = this.items.get(id); if (it) { this.scene.remove(it.g); it.g.traverse((o) => { if (o.material && o.material.dispose) o.material.dispose(); }); this.items.delete(id); } }
  clear(prefix) { for (const id of [...this.items.keys()]) if (!prefix || id.startsWith(prefix)) this.remove(id); }
  update(dt) { this.t += dt; for (const it of this.items.values()) { if (it.kind === 'pickup') { it.g.children[0].rotation.y += dt * 2; it.g.children[0].position.y = 1.2 + Math.sin(this.t * 3 + it.x) * 0.2; } else it.g.children[1].scale.setScalar(1 + Math.sin(this.t * 3) * 0.08); } }
  blips() { return [...this.items.values()].map((m) => ({ x: m.x, z: m.z, color: '#' + new THREE.Color(m.color).getHexString(), shape: m.blip ?? 'circle', size: m.kind === 'pickup' ? 4 : 7, edge: m.kind !== 'pickup' })); }
}
