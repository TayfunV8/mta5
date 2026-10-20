import { C } from '../components.js';

// F3: hata ayıklama (çarpışma kutuları, hız vektörleri, enerji grafiği). F4: performans raporu.
export const DebugSystem = {
  order: 6,
  update(dt, ctx) {
    const { input, state, physics, debug, overlay, stats, ecs } = ctx;
    if (input.wasPressed('F3')) setDebug(ctx, !state.debug);
    if (input.wasPressed('F4')) { stats.startReport(10); ctx.hud.toast('10 sn performans raporu toplanıyor…', 10); }
    if (stats.lastReport && !stats._shown) { stats._shown = true; ctx.hud.toast('Rapor hazır (F3 paneli / konsol)', 4); }
    if (stats.capture) stats._shown = false;
    if (!state.debug) return;
    if (physics.debugBuffers) { debug.setColliders(physics.debugBuffers); physics.debugBuffers = null; }
    debug.updateVelocities(ecs, physics, C);
    overlay.update(dt, ctx);
  },
};

export function setDebug(ctx, on) {
  ctx.state.debug = on; ctx.debug.setVisible(on); ctx.overlay.setVisible(on); ctx.physics.setDebug(on);
}
