export const HudSystem = {
  order: 7,
  update(dt, ctx) { ctx.hud.update(dt, ctx.state, ctx.input.locked); },
};
