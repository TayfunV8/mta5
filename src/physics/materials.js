// Malzeme ve yüzey tablosu (SI). muS/muK = statik/kinetik Coulomb katsayısı.
// NOT: Rapier tek bir sürtünme katsayısı kullanır (biz muK veriyoruz). muS ve rr (yuvarlanma direnci)
// araç lastik modelinde (3. aşama) kullanılacak.
export const MATERIALS = {
  // --- Yüzeyler (zemin) ---
  asphalt:     { muS: 1.00, muK: 0.85, restitution: 0.05, density: 2400, rr: 0.015, color: 0x3b3e46 },
  wet_asphalt: { muS: 0.65, muK: 0.50, restitution: 0.05, density: 2400, rr: 0.018, color: 0x2a2d37 },
  sand:        { muS: 0.55, muK: 0.45, restitution: 0.02, density: 1600, rr: 0.300, color: 0xd9c08a },
  mud:         { muS: 0.40, muK: 0.30, restitution: 0.01, density: 1700, rr: 0.250, color: 0x5a4632 },
  grass:       { muS: 0.45, muK: 0.35, restitution: 0.02, density: 1200, rr: 0.080, color: 0x3f7a3a },
  ice:         { muS: 0.10, muK: 0.04, restitution: 0.05, density:  917, rr: 0.005, color: 0xbfe6f5 },
  // --- Cisim malzemeleri ---
  concrete:    { muS: 0.75, muK: 0.60, restitution: 0.10, density: 2400, rr: 0.020, color: 0x8d8f94 },
  wood:        { muS: 0.50, muK: 0.40, restitution: 0.30, density:  600, rr: 0.020, color: 0xb98a55 },
  metal:       { muS: 0.55, muK: 0.40, restitution: 0.15, density: 7850, rr: 0.020, color: 0x7d8794 },
  rubber:      { muS: 1.00, muK: 0.80, restitution: 0.70, density: 1100, rr: 0.020, color: 0xe0457b },
};
