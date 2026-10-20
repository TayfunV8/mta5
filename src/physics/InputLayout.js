// Ana thread -> fizik worker'ı girdi dizisi (Float32Array).
export const IN = { MOVE_X: 0, MOVE_Z: 1, YAW: 2, SPRINT: 3, CROUCH: 4, JUMP: 5, CHAR_INDEX: 6, VEH_INDEX: 7,
  THROTTLE: 8, BRAKE: 9, STEER: 10, HANDBRAKE: 11, ABS: 12, TCS: 13 };
export const INPUT_FLOATS = 16;
// AI -> fizik: ajan başına 8 float. flags = aktif(bit0) + 2*ışınlanma sayacı
export const AG = { FLAGS: 0, A: 1, B: 2, C: 3, D: 4, X: 5, Z: 6, YAW: 7 };
