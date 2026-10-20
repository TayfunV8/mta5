import { C } from '../components.js';

// Transform -> three.js nesnesi (statik olmayanlar).
export const RenderSyncSystem = {
  order: 4,
  update(dt, ctx) {
    ctx.ecs.each([C.Transform, C.Renderable], (id, tr, r) => {
      if (r.static) return;
      r.mesh.position.set(tr.px, tr.py, tr.pz);
      r.mesh.quaternion.set(tr.qx, tr.qy, tr.qz, tr.qw);
    });
  },
};
