import { C } from '../components.js';

// Oyuncu durumu: hız, çömelme görseli, yeniden doğma, hata ayıklama ışınlanması, sandık fırlatma.
export const PlayerStateSystem = {
  order: 3,
  _last: null,
  update(dt, ctx) {
    const { ecs, input, physics, state, hud } = ctx;
    const tr = ecs.get(state.playerId, C.Transform), pl = ecs.get(state.playerId, C.Player);
    if (!tr) return;

    // yatay hız (görüntülenen konumdan)
    if (this._last && dt > 0) {
      const s = Math.hypot(tr.px - this._last.x, tr.pz - this._last.z) / dt;
      state.speed += (Math.min(s, 80) - state.speed) * (1 - Math.exp(-10 * dt));
    }
    this._last = { x: tr.px, z: tr.pz };
    state.crouched = (tr.flags & 2) !== 0; state.grounded = (tr.flags & 4) !== 0;

    // çömelme: gövdeyi ölçekle, ayaklar sabit kalsın (kapsül 1.8 m -> 1.3 m)
    const want = state.crouched ? 1.3 / 1.8 : 1;
    pl.crouchScale += (want - pl.crouchScale) * (1 - Math.exp(-18 * dt));
    const body = pl.mesh.userData.body;
    body.scale.y = pl.crouchScale; body.position.y = -0.9 + 0.9 * pl.crouchScale;

    if (input.wasPressed('KeyR') || state.health <= 0) { physics.teleport(state.playerIndex, state.spawn); if (state.health <= 0) hud.toast('Öldün — yeniden doğuyorsun'); state.health = 100; }
    if (state.debug) {
      for (const [code, h] of [['Digit1', 3], ['Digit2', 8], ['Digit3', 15]])
        if (input.wasPressed(code)) physics.teleport(state.playerIndex, [tr.px, tr.py + h, tr.pz]);
    }
    if (input.wasPressed('KeyG')) for (const i of state.sliders) physics.setLinvel(i, [0, 0, -5]);
  },
};
