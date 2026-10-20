import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// Sahne, kamera, gökyüzü, güneş + gölge. Kalite: low/medium/high (gölge, çözünürlük, görüş mesafesi).
export class Renderer {
  constructor(canvas, quality = 'medium') {
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: quality !== 'low', powerPreference: 'high-performance' });
    this.gl.toneMapping = THREE.ACESFilmicToneMapping;
    this.gl.shadowMap.type = THREE.PCFShadowMap;
    this.webgpuAvailable = !!navigator.gpu;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0xc4d8ea, 0.0016);
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.1, 2500);
    this.sunDir = new THREE.Vector3(0.4, 0.7, 0.45).normalize();
    this._sky(); this._lights();
    try { const pm = new THREE.PMREMGenerator(this.gl); this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; this.scene.environmentIntensity = 0.55; pm.dispose(); } catch (e) { console.warn('[grafik] ortam haritası oluşturulamadı', e); }
    this.setQuality(quality);
    addEventListener('resize', () => this.resize());
  }

  setQuality(q) {
    this.quality = q;
    const cfg = { low: { pr: 0.75, shadow: 0, map: 1024 }, medium: { pr: 1, shadow: 1, map: 2048 }, high: { pr: Math.min(devicePixelRatio, 2), shadow: 1, map: 4096 } }[q];
    this.cfg = cfg; this.gl.setPixelRatio(cfg.pr);
    this.gl.shadowMap.enabled = !!cfg.shadow; this.sun.castShadow = !!cfg.shadow;
    if (this.sun.shadow.mapSize.x !== cfg.map) { this.sun.shadow.mapSize.set(cfg.map, cfg.map); this.sun.shadow.map?.dispose(); this.sun.shadow.map = null; }
    this.scene.traverse((o) => { if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach((m) => (m.needsUpdate = true)); } });
    this.resize();
  }

  _sky() {
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color(0x3a6aa8) }, mid: { value: new THREE.Color(0xf0b27a) }, low: { value: new THREE.Color(0xffc890) } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: 'varying vec3 vP; uniform vec3 top,mid,low; void main(){ float h = clamp(vP.y,0.0,1.0); vec3 c = mix(low, mid, smoothstep(0.0,0.22,h)); c = mix(c, top, smoothstep(0.15,0.85,h)); gl_FragColor = vec4(c,1.0); }',
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(2000, 32, 16), mat); this.sky.renderOrder = -10;
    this.scene.add(this.sky);
  }

  _lights() {
    this.hemi = new THREE.HemisphereLight(0xbcd3ff, 0x4a4036, 0.9); this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffc088, 2.6);
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.04;
    const sc = this.sun.shadow.camera; sc.left = sc.bottom = -70; sc.right = sc.top = 70; sc.near = 1; sc.far = 400;
    this.scene.add(this.sun, this.sun.target);
  }

  followSun(p) {
    const x = Math.round(p.x), y = Math.round(p.y), z = Math.round(p.z);
    this.sun.target.position.set(x, y, z);
    this.sun.position.set(x + this.sunDir.x * 160, y + this.sunDir.y * 160, z + this.sunDir.z * 160);
    this.sky.position.copy(this.camera.position);
  }

  resize() { const w = innerWidth, h = innerHeight; this.gl.setSize(w, h); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
  render() { this.gl.render(this.scene, this.camera); }
}
