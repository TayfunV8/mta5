// Tüm birimler SI: m, kg, s, N, J, W.
export const GRAVITY = 9.80665;          // m/s²  (standart yerçekimi)
export const AIR_DENSITY = 1.225;        // kg/m³ (deniz seviyesi, 15 °C)
export const WATER_DENSITY = 1000;       // kg/m³ (tatlı su)

export const PHYSICS_HZ = 240;
export const PHYSICS_DT = 1 / PHYSICS_HZ;   // sabit zaman adımı
export const MAX_STEPS_PER_TICK = 24;       // "spiral of death" koruması: tek turda en fazla 0.1 s simüle et
export const MAX_FRAME_TIME = 0.25;         // s — bundan uzun duraklamalar kırpılır

export const MAX_BODIES = 2048;             // paylaşımlı bellekteki cisim sınırı

// Fizik kalite seviyeleri (Rapier çözücü iterasyonu). Adım frekansı sabit kalır.
export const QUALITY = {
  low:    { solverIterations: 2 },
  medium: { solverIterations: 4 },
  high:   { solverIterations: 8 },
};

export const CHAR_GRAVITY_SCALE = 1.9;       // karakter düşüşü "oyun hissi" için gerçek g'nin 1.9 katı (kullanıcı geri bildirimi)
export const AGENT_STRIDE = 8;               // AI -> fizik kumanda satırı
export const MAX_AGENTS = 128;
