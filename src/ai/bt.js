// Minimal davranış ağacı (behavior tree): Sequence / Selector / Condition / Action. Her düğüm tick(ctx) -> 'success'|'failure'|'running'.
export const S = 'success', F = 'failure', R = 'running';
export const Sequence = (...c) => ({ tick: (x) => { for (const n of c) { const r = n.tick(x); if (r !== S) return r; } return S; } });
export const Selector = (...c) => ({ tick: (x) => { for (const n of c) { const r = n.tick(x); if (r !== F) return r; } return F; } });
export const Cond = (f) => ({ tick: (x) => (f(x) ? S : F) });
export const Act = (f) => ({ tick: (x) => f(x) ?? S });
