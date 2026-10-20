import { C } from '../components.js';

export const CameraFollowSystem = {
  order: 5,
  update(dt, ctx) {
    const tr = ctx.ecs.get(ctx.state.playerId, C.Transform);
    if (!tr) return;
    ctx.rig.update(dt, { x: tr.px, y: tr.py, z: tr.pz }, ctx.state.speed);
    ctx.renderer.followSun({ x: tr.px, y: 0, z: tr.pz });
  },
};
