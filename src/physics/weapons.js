// Silah verileri (SI). Namlu çıkış hızı, mermi kütlesi, kesit alanı ve sürükleme katsayısıyla balistik hesabı.
const circ = (d) => Math.PI * (d / 2) ** 2;
export const WEAPONS = {
  1: { name: 'PİSTOL 9mm', mass: 0.008, v0: 360, cd: 0.30, area: circ(0.009), rate: 4, auto: false, mag: 12, reload: 1.5, spread: 0.012, recoilKick: 0.012, pellets: 1, gunMass: 0.9 },
  2: { name: 'TÜFEK 5.56', mass: 0.004, v0: 940, cd: 0.28, area: circ(0.0056), rate: 10, auto: true, mag: 30, reload: 2.2, spread: 0.006, recoilKick: 0.01, pellets: 1, gunMass: 3.4 },
  3: { name: 'POMPALI', mass: 0.0035, v0: 400, cd: 0.45, area: circ(0.0085), rate: 1.2, auto: false, mag: 6, reload: 2.6, spread: 0.05, recoilKick: 0.04, pellets: 9, gunMass: 3.6 },
};
// kalınlık başına enerji kaybı katsayısı σ (Pa): ΔE = σ · A · kalınlık
export const PENETRATION = { wood: 2.0e7, concrete: 1.6e8, metal: 6.0e8, asphalt: 1.6e8, grass: 4e7, sand: 8e7 };
