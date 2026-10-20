// Lastik modeli: Pacejka "Magic Formula" + birleşik kayma (sürtünme çemberi) + statik/kinetik Coulomb
// geçişi + aquaplaning. Eğri tepe noktası s=1 olacak şekilde normalize edilir.
const PAC = { B: 7, C: 1.5, E: 0.4 };
const raw = (s) => { const bs = PAC.B * s; return Math.sin(PAC.C * Math.atan(bs - PAC.E * (bs - Math.atan(bs)))); };
let SP = 1, FP = 1;
(() => { let best = 0; for (let s = 0.001; s < 2; s += 0.001) { const f = raw(s); if (f > best) { best = f; SP = s; } } FP = best; })();
/** Normalize Magic Formula: pacejka(1) = 1 (tepe), sonrasında azalır. */
export const pacejka = (s) => raw(s * SP) / FP;

export const TIRE_DEFAULT = { kappaPeak: 0.12, alphaPeak: 0.16, Fz0: 4000, loadSens: 0.1, pressurePsi: 32 };

/**
 * kappa: boylamasına kayma oranı, tanA: yanal kayma (tan α), Fz: dikey yük (N),
 * muS/muK: statik/kinetik sürtünme. out.fx (ileri +), out.fy (kayma yönünde; kuvvet bunun TERSİDİR)
 */
export function combinedSlip(kappa, tanA, Fz, muS, muK, tire, out) {
  const kx = kappa / tire.kappaPeak, ky = tanA / tire.alphaPeak;
  const s = Math.hypot(kx, ky);
  if (s < 1e-6 || Fz <= 0) { out.fx = 0; out.fy = 0; return out; }
  const load = 1 - tire.loadSens * (Fz / tire.Fz0 - 1);                 // yük arttıkça μ hafif düşer
  const D = muS * Fz * Math.max(0.6, load);
  const slide = 1 - (1 - muK / muS) * Math.min(1, Math.max(0, (s - 1) / 1.5));   // statik -> kinetik
  const f = pacejka(s) * slide;
  out.fx = (D * f * kx) / s; out.fy = (D * f * ky) / s;
  return out;
}

/** Su filminde lastik tutuşu: v_ap ≈ 6.36·√p (knot, p psi) — su derinliği arttıkça düşer. */
export function aquaplaning(speed, depthM, psi = 32) {
  if (depthM <= 0.0005) return 1;
  const vap = 6.36 * Math.sqrt(psi) * 0.5144 / Math.pow(Math.max(depthM / 0.002, 0.5), 0.3);  // m/s
  const x = (speed - 0.7 * vap) / (0.5 * vap);
  return 1 - 0.9 * Math.min(1, Math.max(0, x)) * Math.min(1, depthM / 0.002);
}
