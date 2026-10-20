import * as THREE from 'three';

// Parçacıklar: duman/ateş (araç hasarı), yağmur, çarpma kıvılcımı, namlu ateşi çizgileri.
function radial() { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 2, 32, 32, 30); gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); }

export class Fx {
  constructor(scene, camera) {
    this.scene = scene; this.camera = camera; const tex = radial();
    this.sprites = []; this.free = [];
    for (let i = 0; i < 90; i++) { const m = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 }), s = new THREE.Sprite(m); s.visible = false; scene.add(s); this.sprites.push({ s, m, life: 0, max: 1, vx: 0, vy: 0, vz: 0, grow: 1 }); this.free.push(i); }
    this.tracers = []; this.rainOn = false; this.rain = null; this.rainAmt = 0;
    const g = new THREE.BufferGeometry(), N = 2200, pos = new Float32Array(N * 3); for (let i = 0; i < N; i++) { pos[i * 3] = (Math.random() - 0.5) * 60; pos[i * 3 + 1] = Math.random() * 30; pos[i * 3 + 2] = (Math.random() - 0.5) * 60; }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); this.rain = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xaecbe8, size: 0.09, transparent: true, opacity: 0.55, depthWrite: false })); this.rain.frustumCulled = false; this.rain.visible = false; scene.add(this.rain);
  }
  _spawn(x, y, z, col, size, life, v, grow = 1.6) {
    const i = this.free.pop(); if (i === undefined) return; const p = this.sprites[i];
    p.life = p.max = life; p.vx = v[0]; p.vy = v[1]; p.vz = v[2]; p.grow = grow; p.s.position.set(x, y, z); p.s.scale.setScalar(size); p.m.color.setHex(col); p.m.opacity = 0.7; p.s.visible = true; p.idx = i;
  }
  smoke(x, y, z, fire) { if (fire) this._spawn(x + (Math.random() - 0.5) * 0.6, y, z + (Math.random() - 0.5) * 0.6, 0xff7a1a, 0.9, 0.5, [0, 2.2, 0], 0.6); this._spawn(x + (Math.random() - 0.5) * 0.5, y + 0.2, z + (Math.random() - 0.5) * 0.5, fire ? 0x2a2a2a : 0x8a8a8a, 0.8, 1.8, [(Math.random() - 0.5) * 0.4, 1.2, (Math.random() - 0.5) * 0.4], 3); }
  spark(x, y, z, col = 0xffd27a) { for (let i = 0; i < 4; i++) this._spawn(x, y, z, col, 0.18, 0.25, [(Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.5) * 4], 0.4); }
  blood(x, y, z) { for (let i = 0; i < 5; i++) this._spawn(x, y, z, 0x8a0f0f, 0.16, 0.4, [(Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 3], 0.5); }
  explosion(x, y, z) { for (let i = 0; i < 26; i++) this._spawn(x, y, z, i % 3 ? 0xff8a1a : 0x333333, 1.6, 1.0 + Math.random() * 0.8, [(Math.random() - 0.5) * 9, Math.random() * 7, (Math.random() - 0.5) * 9], 3); }
  tracer(a, b) { const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(a.x, a.y, a.z), new THREE.Vector3(b.x, b.y, b.z)]), l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.9 })); this.scene.add(l); this.tracers.push({ l, life: 0.08 }); }
  setRain(on) { this.rainOn = on; this.rain.visible = on; }
  update(dt) {
    for (const p of this.sprites) { if (p.life <= 0) continue; p.life -= dt; if (p.life <= 0) { p.s.visible = false; p.m.opacity = 0; this.free.push(p.idx); continue; } const k = p.life / p.max; p.s.position.x += p.vx * dt; p.s.position.y += p.vy * dt; p.s.position.z += p.vz * dt; p.s.scale.multiplyScalar(1 + (p.grow - 1) * dt); p.m.opacity = 0.7 * k; }
    for (let i = this.tracers.length - 1; i >= 0; i--) { const t = this.tracers[i]; t.life -= dt; if (t.life <= 0) { this.scene.remove(t.l); t.l.geometry.dispose(); t.l.material.dispose(); this.tracers.splice(i, 1); } }
    if (this.rainOn) { const pos = this.rain.geometry.attributes.position, c = this.camera.position; this.rain.position.set(c.x, c.y - 10, c.z); for (let i = 0; i < pos.count; i++) { let y = pos.getY(i) - 30 * dt; if (y < 0) y += 30; pos.setY(i, y); pos.setX(i, pos.getX(i) + 2.5 * dt); } pos.needsUpdate = true; }
  }
}
