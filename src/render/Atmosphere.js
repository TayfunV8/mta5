import * as THREE from 'three';

// Gün/gece döngüsü: güneş yönü, gökyüzü renkleri, sis, ışık şiddeti ve gece yanan pencereler/lambalar.
const lerpC = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t);
const KEYS = [   // saat, gökyüzü üst, orta, alt, güneş rengi, güneş şiddeti, hemi şiddeti, sis
  [0, 0x050818, 0x0a1230, 0x142040, 0x6f86c8, 0.08, 0.25, 0x0a1020],
  [5, 0x0a1230, 0x3b3a6b, 0xc9718a, 0xffa070, 0.4, 0.4, 0x4a3a5a],
  [7, 0x4a78b8, 0x9cc4e6, 0xf0d2a8, 0xfff0d0, 2.0, 0.8, 0xb9cde0],
  [12, 0x2f6fc2, 0x7fb4e8, 0xcfe3f2, 0xffffff, 3.0, 1.0, 0xc4d8ea],
  [17.5, 0x3a6aa8, 0xf0b27a, 0xffc890, 0xffc088, 2.6, 0.85, 0xe0b898],
  [19.5, 0x1d2a5c, 0xc4506f, 0xff8a5a, 0xff7a50, 0.9, 0.5, 0x8a5068],
  [21.5, 0x080d28, 0x1a1f4a, 0x3a3060, 0x6a7fd0, 0.15, 0.3, 0x141830],
  [24, 0x050818, 0x0a1230, 0x142040, 0x6f86c8, 0.08, 0.25, 0x0a1020],
];

export class Atmosphere {
  constructor(renderer) {
    this.r = renderer; this.hour = 17.5; this.night = 0; this.windowMats = []; this.lampMats = []; this.rain = 0; this.wet = 0; this.fogBoost = 0;
  }
  registerWindow(mat) { this.windowMats.push(mat); } registerLamp(mat) { this.lampMats.push(mat); }
  set(hour) {
    this.hour = ((hour % 24) + 24) % 24; const h = this.hour;
    let i = 0; while (i < KEYS.length - 2 && h >= KEYS[i + 1][0]) i++;
    const a = KEYS[i], b = KEYS[i + 1], t = (h - a[0]) / (b[0] - a[0]);
    const r = this.r, u = r.sky.material.uniforms;
    u.top.value.copy(lerpC(a[1], b[1], t)); u.mid.value.copy(lerpC(a[2], b[2], t)); u.low.value.copy(lerpC(a[3], b[3], t));
    r.sun.color.copy(lerpC(a[4], b[4], t)); const si = a[5] + (b[5] - a[5]) * t, hi = a[6] + (b[6] - a[6]) * t;
    const storm = 1 - this.rain * 0.55;
    r.sun.intensity = si * storm; r.hemi.intensity = hi * (1 - this.rain * 0.3);
    const fog = lerpC(a[7], b[7], t); r.scene.fog.color.copy(fog).lerp(new THREE.Color(0x667078), this.rain * 0.6);
    r.scene.fog.density = (0.0016 + this.fogBoost * 0.004) + this.rain * 0.0022;
    // güneş/ay yönü: gün boyunca doğudan batıya yay
    const ang = ((h - 6) / 12) * Math.PI;
    const el = Math.sin(ang), az = Math.cos(ang);
    if (h >= 5.5 && h <= 19.8) r.sunDir.set(az * 0.9, Math.max(0.08, el) , 0.45).normalize(); else r.sunDir.set(-0.3, 0.6, 0.4).normalize();
    this.night = h > 19.5 || h < 5.5 ? 1 : h > 18 ? (h - 18) / 1.5 : h < 7 ? (7 - h) / 1.5 : 0;
    for (const m of this.windowMats) m.emissiveIntensity = this.night * 1.4;
    for (const m of this.lampMats) m.emissiveIntensity = this.night * 3.0;
    r.gl.toneMappingExposure = 0.9 + this.night * 0.25;
  }
}
