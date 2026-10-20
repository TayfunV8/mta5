import { IN } from '../../physics/InputLayout.js';

// Girdiyi fizik worker'ının girdi dizisine yazar (paylaşımlı bellek veya postMessage).
export const PlayerInputSystem = {
  order: 1,
  update(dt, ctx) {
    const { input: k, physics, rig } = ctx, a = physics.input;
    a[IN.MOVE_X] = (k.down('KeyD') ? 1 : 0) - (k.down('KeyA') ? 1 : 0);
    a[IN.MOVE_Z] = (k.down('KeyW') ? 1 : 0) - (k.down('KeyS') ? 1 : 0);
    a[IN.YAW] = rig.yaw;
    a[IN.SPRINT] = k.down('ShiftLeft') ? 1 : 0;
    a[IN.CROUCH] = k.down('KeyC') || k.down('ControlLeft') ? 1 : 0;
    a[IN.JUMP] = k.down('Space') ? 1 : 0;
    physics.flushInput();
  },
};
