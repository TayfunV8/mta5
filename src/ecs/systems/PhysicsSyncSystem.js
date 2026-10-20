import { C } from '../components.js';

// Fizik anlık görüntüsünü okur, interpolasyonlu durumu Transform'a yazar. Statik cisimler atlanır.
export const PhysicsSyncSystem = {
  order: 2,
  update(dt, ctx) {
    const { physics, ecs } = ctx;
    physics.update();
    ecs.each([C.PhysicsBody, C.Transform], (id, pb, tr) => { if (pb.kind !== 'static') physics.sample(pb.index, tr); });
  },
};
