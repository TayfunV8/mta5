// Düşme hasarı çarpma enerjisinden (E = ½ m v²) hesaplanır.
// Karakter yerçekimi 1.9 g: ~3.5 m düşüş ≈ 5 kJ (hasar başlar), ~7 m ≈ 10 kJ (~55 hp), ~10 m ölümcül.
export const FALL_ENERGY_THRESHOLD = 5000; // J
export const JOULES_PER_HP = 90;
export function fallDamage(energyJ) {
  return Math.max(0, (energyJ - FALL_ENERGY_THRESHOLD) / JOULES_PER_HP);
}
