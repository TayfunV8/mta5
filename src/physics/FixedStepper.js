// Sabit zaman adımı biriktiricisi (accumulator). Render hızından bağımsız.
// Spiral of death: çok geç kalındıysa fazla adımlar atılır (simülasyon yavaşlar ama donmaz).
export class FixedStepper {
  constructor(dt, maxSteps, maxFrame) {
    this.dt = dt;
    this.maxSteps = maxSteps;
    this.maxFrame = maxFrame;
    this.acc = 0;            // henüz simüle edilmemiş süre (s)
    this.droppedTime = 0;    // spiral koruması yüzünden atılan toplam süre (s)
  }

  /** Geçen gerçek süreyi (s) ekler, bu turda atılacak adım sayısını döndürür. */
  advance(frameSeconds) {
    this.acc += Math.min(Math.max(frameSeconds, 0), this.maxFrame);
    let steps = Math.floor(this.acc / this.dt + 1e-9);
    if (steps > this.maxSteps) {
      const dropped = (steps - this.maxSteps) * this.dt;
      this.acc -= dropped;
      this.droppedTime += dropped;
      steps = this.maxSteps;
    }
    this.acc -= steps * this.dt;
    if (this.acc < 0) this.acc = 0;
    return steps;
  }

  get alpha() { return this.acc / this.dt; }
}
