// Fare hareketi -> kamera yaw/pitch.
export const CameraControlSystem = {
  order: 0,
  update(dt, ctx) { if (ctx.input.locked) ctx.rig.rotate(ctx.input.mouseDX, ctx.input.mouseDY); },
};
