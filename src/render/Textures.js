// Prosedürel dokular (yerel, harici dosya yok): cephe, kaldırım, çim, kum, yol işaretleri, tabela yazıları.
import * as THREE from 'three';

const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; };
const toTex = (c, rx = 1, ry = 1, srgb = true) => { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = 4; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
const rnd = (() => { let s = 12345; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); })();
function noise(g, w, h, amt) { const id = g.getImageData(0, 0, w, h); for (let i = 0; i < id.data.length; i += 4) { const n = (rnd() - 0.5) * amt; id.data[i] += n; id.data[i + 1] += n; id.data[i + 2] += n; } g.putImageData(id, 0, 0); }

// Cephe karosu: 4 bay x 4 kat. bay=4 m, kat=3.6 m  ->  16 x 14.4 m
export const FACADE = { w: 16, h: 14.4 };
const facadeCache = new Map();
export function facadeTextures(style) {
  if (facadeCache.has(style)) return facadeCache.get(style);
  const S = 512, bay = S / 4;
  const [c, g] = mk(S, S), [ce, ge] = mk(S, S);
  ge.fillStyle = '#000'; ge.fillRect(0, 0, S, S);
  const win = (x, y, w, h, col, frame) => { if (frame) { g.fillStyle = frame; g.fillRect(x - 4, y - 4, w + 8, h + 8); } g.fillStyle = col; g.fillRect(x, y, w, h); };
  const lit = (x, y, w, h) => { if (rnd() < 0.45) { ge.fillStyle = rnd() < 0.8 ? '#ffd9a0' : '#bcd8ff'; ge.fillRect(x, y, w, h); } };
  if (style === 'glass') {
    const gr = g.createLinearGradient(0, 0, S, S); gr.addColorStop(0, '#9fb8c8'); gr.addColorStop(1, '#6f8ea3'); g.fillStyle = gr; g.fillRect(0, 0, S, S);
    for (let f = 0; f < 4; f++) for (let b = 0; b < 4; b++) { const x = b * bay + 4, y = f * bay + 14, w = bay - 8, h = bay - 36; g.fillStyle = `rgba(20,40,60,${0.55 + rnd() * 0.2})`; g.fillRect(x, y, w, h); g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x, y, w, 6); lit(x, y, w, h); }
    g.fillStyle = '#c8d4dc'; for (let f = 0; f < 4; f++) g.fillRect(0, f * bay, S, 10);
  } else if (style === 'concrete' || style === 'stucco' || style === 'hotel') {
    g.fillStyle = style === 'stucco' ? '#f3ead8' : '#d8d6d0'; g.fillRect(0, 0, S, S); noise(g, S, S, 14);
    for (let f = 0; f < 4; f++) for (let b = 0; b < 4; b++) { const x = b * bay + 22, y = f * bay + 26, w = bay - 44, h = bay - 56; win(x, y, w, h, '#33485a', '#f4f4f0'); g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(x, y, w, h * 0.3); lit(x, y, w, h); if (style === 'hotel') { g.fillStyle = '#c9c4b8'; g.fillRect(b * bay + 6, f * bay + bay - 22, bay - 12, 10); } }
    if (style !== 'stucco') { g.fillStyle = 'rgba(0,0,0,0.08)'; for (let f = 0; f < 4; f++) g.fillRect(0, f * bay, S, 4); }
  } else if (style === 'brick') {
    g.fillStyle = '#b5614a'; g.fillRect(0, 0, S, S);
    for (let y = 0; y < S; y += 16) for (let x = (y / 16) % 2 ? -16 : 0; x < S; x += 32) { g.fillStyle = `rgb(${160 + rnd() * 40},${80 + rnd() * 30},${60 + rnd() * 25})`; g.fillRect(x + 1, y + 1, 30, 14); }
    for (let f = 0; f < 4; f++) for (let b = 0; b < 4; b++) { const x = b * bay + 28, y = f * bay + 24, w = bay - 56, h = bay - 52; win(x, y, w, h, '#2e3f4f', '#eee8dc'); g.fillStyle = '#eee8dc'; g.fillRect(x + w / 2 - 2, y, 4, h); lit(x, y, w, h); g.fillStyle = '#555'; g.fillRect(x - 6, y + h + 6, w + 12, 6); }
  } else if (style === 'metal') {
    g.fillStyle = '#b9bec4'; g.fillRect(0, 0, S, S); for (let x = 0; x < S; x += 8) { g.fillStyle = x % 16 ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.12)'; g.fillRect(x, 0, 4, S); }
    for (let b = 0; b < 4; b++) { win(b * bay + 30, 40, bay - 60, 40, '#3a4650', '#888'); lit(b * bay + 30, 40, bay - 60, 40); }
  } else if (style === 'garage') {
    g.fillStyle = '#c4c1ba'; g.fillRect(0, 0, S, S); noise(g, S, S, 12);
    for (let f = 0; f < 4; f++) { g.fillStyle = '#2b2d30'; g.fillRect(0, f * bay + 30, S, bay - 80); g.fillStyle = '#9d9a93'; for (let b = 0; b < 4; b++) g.fillRect(b * bay + bay / 2 - 6, f * bay + 30, 12, bay - 80); lit(0, f * bay + 30, S, 10); }
  } else if (style === 'dealer') {
    g.fillStyle = '#e9eef1'; g.fillRect(0, 0, S, S); g.fillStyle = 'rgba(40,70,95,0.85)'; for (let b = 0; b < 4; b++) g.fillRect(b * bay + 6, 30, bay - 12, S - 90); g.fillStyle = 'rgba(255,255,255,0.2)'; for (let b = 0; b < 4; b++) g.fillRect(b * bay + 6, 30, bay - 12, 80);
    for (let b = 0; b < 4; b++) { ge.fillStyle = '#fff4dc'; ge.fillRect(b * bay + 6, 30, bay - 12, S - 90); }
  } else { g.fillStyle = '#ccc'; g.fillRect(0, 0, S, S); }
  const r = { map: toTex(c), emissive: toTex(ce) }; facadeCache.set(style, r); return r;
}

const simple = new Map();
export function surfaceTexture(kind) {
  if (simple.has(kind)) return simple.get(kind);
  let t;
  if (kind === 'asphalt') { const [c, g] = mk(256, 256); g.fillStyle = '#3a3d44'; g.fillRect(0, 0, 256, 256); noise(g, 256, 256, 26); t = toTex(c); }
  else if (kind === 'sidewalk') { const [c, g] = mk(256, 256); g.fillStyle = '#b9b7b0'; g.fillRect(0, 0, 256, 256); noise(g, 256, 256, 12); g.strokeStyle = 'rgba(60,60,60,0.35)'; g.lineWidth = 2; g.strokeRect(1, 1, 254, 254); g.beginPath(); g.moveTo(128, 0); g.lineTo(128, 256); g.moveTo(0, 128); g.lineTo(256, 128); g.stroke(); t = toTex(c); }
  else if (kind === 'plaza') { const [c, g] = mk(256, 256); g.fillStyle = '#d9d3c6'; g.fillRect(0, 0, 256, 256); noise(g, 256, 256, 10); g.strokeStyle = 'rgba(120,110,95,0.5)'; g.lineWidth = 3; for (let i = 0; i <= 256; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.moveTo(0, i); g.lineTo(256, i); g.stroke(); } t = toTex(c); }
  else if (kind === 'grass') { const [c, g] = mk(256, 256); g.fillStyle = '#4c8a3c'; g.fillRect(0, 0, 256, 256); noise(g, 256, 256, 40); for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${30 + rnd() * 40},${90 + rnd() * 60},${30 + rnd() * 30},0.5)`; g.fillRect(rnd() * 256, rnd() * 256, 2, 5); } t = toTex(c); }
  else if (kind === 'sand') { const [c, g] = mk(256, 256); g.fillStyle = '#dcc690'; g.fillRect(0, 0, 256, 256); noise(g, 256, 256, 22); t = toTex(c); }
  else if (kind === 'dirt') { const [c, g] = mk(256, 256); g.fillStyle = '#7b6046'; g.fillRect(0, 0, 256, 256); noise(g, 256, 256, 34); t = toTex(c); }
  else if (kind === 'wood') { const [c, g] = mk(256, 256); g.fillStyle = '#9a7650'; g.fillRect(0, 0, 256, 256); for (let y = 0; y < 256; y += 32) { g.fillStyle = `rgba(0,0,0,${0.15 + rnd() * 0.15})`; g.fillRect(0, y, 256, 3); } noise(g, 256, 256, 18); t = toTex(c); }
  else if (kind === 'container') { const [c, g] = mk(128, 128); g.fillStyle = '#fff'; g.fillRect(0, 0, 128, 128); for (let x = 0; x < 128; x += 8) { g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(x, 0, 3, 128); } t = toTex(c); }
  else t = null;
  simple.set(kind, t); return t;
}

const signCache = new Map();
export function signTexture(text, bg = '#12141c', fg = '#ffe27a') {
  const key = text + bg + fg; if (signCache.has(key)) return signCache.get(key);
  const [c, g] = mk(256, 64); g.fillStyle = bg; g.fillRect(0, 0, 256, 64); g.strokeStyle = fg; g.lineWidth = 3; g.strokeRect(3, 3, 250, 58);
  g.fillStyle = fg; g.font = 'bold 34px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 128, 34);
  const t = toTex(c, 1, 1); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; signCache.set(key, t); return t;
}
