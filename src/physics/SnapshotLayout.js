// Worker -> ana thread anlık görüntü yerleşimi (SharedArrayBuffer veya transfer edilen ArrayBuffer).
//
//  bayt 0..31    Int32[8]    ctrl   (ctrl[0] = seqlock sayacı; tek sayı = yazılıyor)
//  bayt 32..159  Float64[16] hdr    (süre, istatistik, enerji ...)
//  bayt 160..    Float32[N*8] prev  (bir önceki adımın durumu)
//                Float32[N*8] curr  (son adımın durumu)
//
// Cisim satırı (STRIDE=8): px py pz qx qy qz qw flags
// flags: bit0 = uyuyor, bit1 = çömelmiş, bit2 = yerde (karakter)
export const STRIDE = 8;
export const HDR = {
  SIM_TIME: 0,      // s   — simüle edilen toplam süre
  WALL_ABS: 1,      // ms  — yayın anındaki mutlak saat (timeOrigin + now)
  ACC: 2,           // s   — biriktirici kalanı (interpolasyon için)
  PHYS_MS_AVG: 3,   // ms  — adım başına ortalama fizik süresi
  PHYS_MS_MAX: 4,   // ms  — son 1 sn'deki en kötü adım
  KE: 5,            // J   — dinamik cisimlerin öteleme kinetik enerjisi
  PE: 6,            // J   — potansiyel enerji (m·g·h)
  STEPS_LAST: 7,    //     — son turda atılan adım sayısı
  DROPPED: 8,       // s   — spiral of death yüzünden atılan süre
  BODY_COUNT: 9,
  STEPS_TOTAL: 10,
  AWAKE: 11,        //     — uyanık dinamik cisim sayısı
};

export const TELE = 8;   // telemetri satırı: [0]rpm/sağlık [1]vites/stamina [2]kayma [3]sağlık [4]hız [5]fren/gaz [6]direksiyon [7]ölü/hasar
export function snapshotByteLength(maxBodies) {
  return 160 + maxBodies * STRIDE * 4 * 2 + maxBodies * TELE * 4;
}

export class Snapshot {
  constructor(buffer, maxBodies) {
    this.buffer = buffer;
    this.maxBodies = maxBodies;
    this.ctrl = new Int32Array(buffer, 0, 8);
    this.hdr = new Float64Array(buffer, 32, 16);
    this.prev = new Float32Array(buffer, 160, maxBodies * STRIDE);
    this.curr = new Float32Array(buffer, 160 + maxBodies * STRIDE * 4, maxBodies * STRIDE);
    this.tele = new Float32Array(buffer, 160 + maxBodies * STRIDE * 8, maxBodies * TELE);
  }
}

/** Seqlock ile tutarlı okuma: src (paylaşımlı) -> dst (yerel). Başarılıysa true. */
export function readSnapshot(src, dst, bodyCount) {
  const n = bodyCount * STRIDE;
  for (let attempt = 0; attempt < 4; attempt++) {
    const s1 = Atomics.load(src.ctrl, 0);
    if (s1 & 1) continue;
    dst.prev.set(src.prev.subarray(0, n));
    dst.curr.set(src.curr.subarray(0, n));
    dst.tele.set(src.tele.subarray(0, bodyCount * TELE));
    dst.hdr.set(src.hdr);
    if (Atomics.load(src.ctrl, 0) === s1) return true;
  }
  return false;
}
