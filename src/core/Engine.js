// Ana döngü: ECS sistemlerini çalıştırır, sonra çizer. Fizik burada DEĞİL, worker'da döner.
export class Engine {
  constructor({ ecs, renderer, stats, ctx, physics }) {
    Object.assign(this, { ecs, renderer, stats, ctx, physics });
    this.last = performance.now();
    this.loop = this.loop.bind(this);
  }
  start() { requestAnimationFrame(this.loop); }
  loop(t) {
    const rawMs = t - this.last; this.last = t;
    const dt = Math.min(rawMs / 1000, 0.1);
    this.ecs.update(dt, this.ctx);
    this.renderer.render();
    this.ctx.input.endFrame();
    const h = this.physics.header;
    this.stats.frame(rawMs, { avg: h[3], max: h[4] }, this.renderer.gl.info.render);
    requestAnimationFrame(this.loop);
  }
}
