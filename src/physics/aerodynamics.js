import { AIR_DENSITY, GRAVITY } from '../config/constants.js';

/** Aerodinamik sürükleme: F = -½ ρ Cd A |v_rel| v_rel,  v_rel = v - rüzgar. */
export function dragForce(vx, vy, vz, wind, cd, area, out, rho = AIR_DENSITY) {
  const rx = vx - wind.x, ry = vy - wind.y, rz = vz - wind.z;
  const k = -0.5 * rho * cd * area * Math.sqrt(rx * rx + ry * ry + rz * rz);
  out.x = k * rx; out.y = k * ry; out.z = k * rz;
  return out;
}

/** Son hız: sürükleme ağırlığa eşitlenince v = sqrt(2 m g / (ρ Cd A)). */
export function terminalVelocity(mass, cd, area, rho = AIR_DENSITY) {
  return Math.sqrt((2 * mass * GRAVITY) / (rho * cd * area));
}
