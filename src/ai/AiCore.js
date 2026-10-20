// Yapay zeka çekirdeği (saf, DOM'suz): trafik, yayalar, polis. ai.worker.js içinde çalışır; çıktısı fizik worker'ına
// ajan kumandaları olarak gider. Girdi: ajanların konum/hız durumu (ana thread 10 Hz gönderir).
import { MAX_AGENTS, AGENT_STRIDE } from '../config/constants.js';
import { VEHICLES } from '../physics/vehicleSpecs.js';
import { CITY, blockContent, worldToBlock, inCity, parkingSpotsAround } from '../world/cityLayout.js';
import { nodeId, nodePos, nodeNeighbors, nearestNode, rightOf, laneEnter, laneExit, intersectionPath, signalState, trafficRoute, pedPos, pedRoute, nearestPedNode } from '../world/nav.js';
import { mulberry32 } from '../world/rng.js';
import { Selector, Sequence, Cond, Act, R as RUN, S as OK } from './bt.js';

export const KIND = { CAR: 0, PED: 1, COP: 2, PARKED: 3, PLAYER: 4 };
export const ANIM = { NONE: 0, PHONE: 1, TALK: 2, FLEE: 3, HIDE: 4 };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const FWD = (yaw) => ({ x: -Math.sin(yaw), z: -Math.cos(yaw) });

export class AiCore {
  constructor(seed = 1) {
    this.rng = mulberry32(seed); this.agents = []; this.bySlot = new Map(); this.t = 0; this.tod = 17.5; this.pop = 1;
    this.player = { x: 0, z: 0, vx: 0, vz: 0, yaw: 0, inVeh: false, speed: 0, alive: true };
    this.ctl = new Float32Array(MAX_AGENTS * AGENT_STRIDE); this.anim = new Float32Array(MAX_AGENTS); this.tc = new Int32Array(MAX_AGENTS);
    this.wanted = { heat: 0, level: 0, seen: false, unseen: 0, lx: 0, lz: 0, searching: false };
    this.events = []; this.parkedUsed = new Set();
  }
  register(slot, kind, vehicle) {
    const a = { slot, kind, vehicle, spec: vehicle ? VEHICLES[vehicle] : null, x: 1e5, z: 1e5, yaw: 0, speed: 0, vx: 0, vz: 0, alive: 1, active: false, wps: [], route: null, node: -1, next: -1,
      stuck: 0, deadT: 0, idle: 0, flee: 0, fleeFrom: null, goal: null, path: [], pi: 0, cruise: 10 + this.rng() * 5, brave: this.rng() < 0.15, filmer: this.rng() < 0.3, anim: ANIM.NONE, spawned: false, tele: false, sprint: false, respawnT: 0 };
    this.agents.push(a); this.bySlot.set(slot, a); return a;
  }
  setState(arr, player) {
    for (let i = 0; i < arr.length; i += 8) { const a = this.bySlot.get(arr[i]); if (!a) continue; a.x = arr[i + 1]; a.z = arr[i + 2]; a.yaw = arr[i + 3]; a.speed = arr[i + 4]; a.vx = arr[i + 5]; a.vz = arr[i + 6]; a.alive = arr[i + 7]; }
    if (player) Object.assign(this.player, player);
  }
  event(e) {
    const w = this.wanted, d = Math.hypot(e.x - this.player.x, e.z - this.player.z);
    if (e.type === 'gunshot' || e.type === 'explosion') for (const a of this.agents) if (a.kind === KIND.PED && a.alive && Math.hypot(a.x - e.x, a.z - e.z) < (e.type === 'explosion' ? 120 : 70)) this._scare(a, e.x, e.z);
    if (e.crime) { w.heat = Math.min(12, w.heat + e.crime); if (d < 200) { w.seen = true; w.unseen = 0; w.lx = this.player.x; w.lz = this.player.z; } }
    if (e.type === 'crash') for (const a of this.agents) if (a.kind === KIND.PED && a.alive && Math.hypot(a.x - e.x, a.z - e.z) < 25 && a.slot !== e.slot) this._scare(a, e.x, e.z);
  }
  _scare(a, x, z) {
    if (a.flee > 0) return;
    if (a.filmer && this.rng() < 0.5) { a.film = 12 + this.rng() * 8; a.fx = x; a.fz = z; a.anim = ANIM.PHONE; return; }
    a.flee = 8 + this.rng() * 8; a.fleeFrom = { x, z }; a.anim = ANIM.FLEE; a.film = 0;
  }
  _teleport(a, x, z, yaw) { a.tele = true; this.tc[a.slot]++; a.x = x; a.z = z; a.yaw = yaw; a.speed = 0; a.spawned = true; a.alive = 1; a.deadT = 0; a.stuck = 0; a.wps = []; a.path = []; a.pi = 0; a.goal = null; a.flee = 0; a.film = 0; }
  _ring(min, max) { const ang = this.rng() * Math.PI * 2, r = min + this.rng() * (max - min); return { x: this.player.x + Math.cos(ang) * r, z: this.player.z + Math.sin(ang) * r }; }

  // ------------------------------------------------------------------ ana döngü
  tick(dt) {
    this.t += dt; const P = this.player, w = this.wanted;
    this._wanted(dt);
    const cars = this.agents.filter((a) => a.kind === KIND.CAR || a.kind === KIND.COP || a.kind === KIND.PLAYER || a.kind === KIND.PARKED);
    let nCops = 0; const want = [0, 2, 3, 4, 5, 6][w.level];
    for (const a of this.agents) {
      switch (a.kind) {
        case KIND.CAR: this._car(a, dt, cars); break;
        case KIND.COP: a.copIdx = nCops++; this._cop(a, dt, cars, want); break;
        case KIND.PED: this._ped(a, dt, cars); break;
        case KIND.PARKED: this._parked(a, dt); break;
        case KIND.PLAYER: break;
      }
    }
    this._write();
  }

  _write() {
    for (const a of this.agents) {
      const o = a.slot * AGENT_STRIDE, c = this.ctl;
      this.anim[a.slot] = a.anim;
      let flags = (this.tc[a.slot] << 3);
      if (a.kind === KIND.PARKED || a.kind === KIND.PLAYER) flags |= a.spawned || a.kind === KIND.PLAYER ? 1 | 4 : 0;
      else flags |= a.active ? 1 : 0;
      c[o] = flags;
      if (a.kind === KIND.PED) { c[o + 1] = a.mx ?? 0; c[o + 2] = -(a.mz ?? 0); /* fizik: yaw=0 iken dünya z = -moveZ */ c[o + 3] = a.sprint ? 1 : 0; c[o + 4] = a.hide ? 1 : 0; }
      else if (a.kind === KIND.CAR || a.kind === KIND.COP) { c[o + 1] = a.thr ?? 0; c[o + 2] = a.brk ?? 0; c[o + 3] = a.steer ?? 0; c[o + 4] = 0; }
      if (a.tele) { c[o + 5] = a.x; c[o + 6] = a.z; c[o + 7] = a.yaw; a.tele = false; a.teleSent = 3; } else if (a.teleSent > 0) { a.teleSent--; }
    }
  }

  // ------------------------------------------------------------------ polis çıta sistemi
  _wanted(dt) {
    const w = this.wanted, P = this.player; let nearest = Infinity;
    for (const a of this.agents) if (a.kind === KIND.COP && a.active) nearest = Math.min(nearest, Math.hypot(a.x - P.x, a.z - P.z));
    const seen = w.heat > 0 && nearest < 75 || w.heat > 0 && this.events.length > 0;
    if (seen) { w.seen = true; w.unseen = 0; w.lx = P.x; w.lz = P.z; } else if (w.heat > 0) { w.seen = false; w.unseen += dt; }
    w.searching = w.heat > 0 && !w.seen && w.unseen > 4;
    if (w.heat > 0 && w.unseen > 18) w.heat = Math.max(0, w.heat - dt * 0.35);        // kayıp süresi dolunca yıldızlar azalır
    w.level = w.heat <= 0 ? 0 : Math.min(5, 1 + Math.floor(w.heat / 2));
    this.events.length = 0;
  }

  // ------------------------------------------------------------------ sürüş kontrolü
  _steerTo(a, tx, tz, speedCmd, dt, o = {}) {
    const spec = a.spec, f = FWD(a.yaw), rx = Math.cos(a.yaw), rz = -Math.sin(a.yaw);
    const dx = tx - a.x, dz = tz - a.z, lon = dx * f.x + dz * f.z, lat = dx * rx + dz * rz, ld2 = Math.max(dx * dx + dz * dz, 4);
    const kappa = (2 * lat) / ld2, angle = Math.atan(spec.wheelbase * kappa), maxSt = spec.steerMax / (1 + Math.abs(a.speed) / spec.steerSpeedScale);
    a.steer = clamp(angle / maxSt, -1, 1) * (lon < -2 ? Math.sign(lat || 1) : 1);
    const vCurve = Math.sqrt(3.2 / Math.max(Math.abs(kappa), 1e-3));
    const vt = Math.min(speedCmd, o.ignoreCurve ? 99 : Math.max(4, vCurve));
    const err = vt - a.speed;
    a.thr = err > 0 ? clamp(err * 0.45, 0, o.maxThr ?? 0.65) : 0; a.brk = err < -0.4 ? clamp(-err * 0.35, 0, 1) : 0;
    if (vt <= 0.1) { a.thr = 0; a.brk = clamp(0.4 + (a.speed * 0.15), 0, 1); }
  }

  /** Öndeki engel: aynı yöne bakan şeritte araç/yaya (mesafe ve yan sapma). */
  _obstacle(a, cars, peds) {
    const f = FWD(a.yaw), rx = Math.cos(a.yaw), rz = -Math.sin(a.yaw); let best = Infinity, bv = 0;
    const look = 10 + a.speed * 1.4, check = (x, z, v, width) => { const dx = x - a.x, dz = z - a.z, lon = dx * f.x + dz * f.z, lat = Math.abs(dx * rx + dz * rz); if (lon > 1 && lon < look && lat < width && lon < best) { best = lon; bv = v; } };
    for (const c of cars) { if (c === a || !c.spawned && c.kind !== KIND.PLAYER) continue; const v = c.speed; if (c.kind === KIND.PARKED && Math.abs((c.x - a.x) * rx + (c.z - a.z) * rz) > 2.6) continue; check(c.x, c.z, v, 2.4); }
    if (this.player.alive) check(this.player.x, this.player.z, this.player.speed ?? 0, this.player.inVeh ? 2.4 : 1.6);
    for (const p of peds) if (p.alive && p.spawned) check(p.x, p.z, 0, 1.6);
    return { gap: best - 4.6, v: bv };
  }

  _spawnRoadPoint(min, max) {
    for (let i = 0; i < 12; i++) {
      const p = this._ring(min, max), n = nearestNode(p.x, p.z), nb = nodeNeighbors(n), b = nb[Math.floor(this.rng() * nb.length)], A = nodePos(n), Bp = nodePos(b);
      if (!inCity(...worldToBlock(A.x, A.z))) continue;
      const dx = Math.sign(Bp.x - A.x), dz = Math.sign(Bp.z - A.z), r = rightOf(dx, dz), t = 0.2 + this.rng() * 0.5;
      const x = A.x + (Bp.x - A.x) * t + r.x * CITY.LANE, z = A.z + (Bp.z - A.z) * t + r.z * CITY.LANE;
      if (Math.hypot(x - this.player.x, z - this.player.z) < min * 0.9) continue;
      if (this.agents.some((o) => o.spawned && o.kind !== KIND.PED && Math.hypot(o.x - x, o.z - z) < 14)) continue;
      return { x, z, yaw: Math.atan2(-dx, -dz), from: n, to: b };
    }
    return null;
  }

  _car(a, dt, cars) {
    const P = this.player, dist = Math.hypot(a.x - P.x, a.z - P.z), peds = this.agents.filter((q) => q.kind === KIND.PED);
    if (!a.spawned || dist > 380 || a.alive === 0) {
      a.respawnT -= dt; if (a.respawnT > 0 && a.spawned) { a.thr = 0; a.brk = 1; return; }
      const sp = this._spawnRoadPoint(220, 330); if (!sp) return;
      this._teleport(a, sp.x, sp.z, sp.yaw); a.node = sp.from; a.next = sp.to; a.active = true; a.prev = sp.from; a.respawnT = 0; a.cruise = 9 + this.rng() * 6;
      a.wps = [laneEnter(sp.from, sp.to)]; a.stopNode = sp.to; return;
    }
    this._followRoute(a, dt, cars, peds, { cruise: a.cruise, obeyLights: true });
  }

  /** A->B şeridinde sürüş: waypoint kuyruğunu doldurur (dönüş seçimi), ışıkta durur, öndeki araca mesafe tutar. */
  _followRoute(a, dt, cars, peds, o) {
    if (a.wps.length < 9) { // sıradaki kavşak ve bir sonraki kenar
      const B = a.next, nb = nodeNeighbors(B).filter((n) => n !== a.node); let C;
      if (o.route && o.route.length > 0) { const i = o.route.indexOf(B); C = i >= 0 && o.route[i + 1] !== undefined ? o.route[i + 1] : nb[Math.floor(this.rng() * nb.length)]; }
      else { const straight = nb.find((n) => { const p = nodePos(a.node), q = nodePos(B), r = nodePos(n); return Math.sign(q.x - p.x) === Math.sign(r.x - q.x) && Math.sign(q.z - p.z) === Math.sign(r.z - q.z); }); C = straight !== undefined && this.rng() < 0.6 ? straight : nb[Math.floor(this.rng() * nb.length)]; }
      if (C === undefined) C = a.node;
      const turn = (() => { const p = nodePos(a.node), q = nodePos(B), r = nodePos(C); return Math.sign(q.x - p.x) !== Math.sign(r.x - q.x) || Math.sign(q.z - p.z) !== Math.sign(r.z - q.z); })();
      for (const p of intersectionPath(a.node, B, C)) a.wps.push(p);
      for (const q of a.wps) if (q.sig === B) q.turn = turn;
      a.wps.push(laneEnter(B, C)); a.stopNode = C; a.node = B; a.next = C; a.passedInt = true;
    }
    // hedef: yeterli ileride waypoint
    while (a.wps.length > 1 && Math.hypot(a.wps[0].x - a.x, a.wps[0].z - a.z) < 4.5) a.wps.shift();
    let ld = clamp(4 + a.speed * 0.5, 5, 11), tgt = a.wps[0];
    for (const p of a.wps) { tgt = p; if (Math.hypot(p.x - a.x, p.z - a.z) >= ld) break; }
    let vmax = o.cruise;
    { const tw = a.wps.find((q) => q.sig !== undefined && q.turn); if (tw && Math.hypot(tw.x - a.x, tw.z - a.z) < 45) vmax = Math.min(vmax, 6.5); }   // dönüş öncesi yavaşla
    // trafik ışığı: bir sonraki kavşağa (a.next) yaklaşırken
    if (o.obeyLights && a.wps.length) {
      const sigNode = a.wps.find((q) => q.sig !== undefined)?.sig ?? a.next, stopAt = nodePos(sigNode), dir = FWD(a.yaw), dd = (stopAt.x - a.x) * dir.x + (stopAt.z - a.z) * dir.z - 12;
      if (dd > -2 && dd < 60) {
        const st = signalState(sigNode, this.t), axis = Math.abs(dir.x) > Math.abs(dir.z) ? 'EW' : 'NS', s = st[axis];
        if ((s === 'red' || s === 'yellow') && !(s === 'yellow' && dd < a.speed * 1.0)) vmax = Math.min(vmax, Math.sqrt(Math.max(0, 2 * 3.5 * Math.max(dd, 0))));
      }
    }
    const ob = this._obstacle(a, cars, peds);
    if (ob.gap < 30) vmax = Math.min(vmax, Math.max(0, ob.v + Math.sqrt(Math.max(0, 2 * 3.5 * Math.max(ob.gap - 1.5, 0)))), ob.gap < 1.5 ? 0 : 99);
    this._steerTo(a, tgt.x, tgt.z, vmax, dt);
    if (a.speed < 0.4 && vmax > 3) { if ((a.stuck += dt) > 10) { a.alive = 0; a.respawnT = 0; a.stuck = 0; } } else a.stuck = 0;
  }

  // ------------------------------------------------------------------ park halindeki araçlar (oyuncunun sürebileceği)
  _parked(a, dt) {
    const P = this.player, d = Math.hypot(a.x - P.x, a.z - P.z);
    if (a.spawned && d < 330 && a.alive) return;
    const spots = parkingSpotsAround(P.x, P.z, 300).filter((s) => Math.hypot(s.x - P.x, s.z - P.z) > (a.spawned ? 90 : 14) && !this._spotTaken(s, a));
    if (!spots.length) return;
    const s = spots[Math.floor(this.rng() * spots.length)];
    this._teleport(a, s.x, s.z, s.yaw); a.active = true; a.thr = a.brk = a.steer = 0;
  }
  _spotTaken(s, self) { return this.agents.some((o) => o !== self && (o.kind === KIND.PARKED || o.kind === KIND.PLAYER) && o.spawned && Math.hypot(o.x - s.x, o.z - s.z) < 5); }

  // ------------------------------------------------------------------ polis arabaları
  _cop(a, dt, cars, want) {
    const P = this.player, w = this.wanted, dist = Math.hypot(a.x - P.x, a.z - P.z), peds = [];
    const active = a.copIdx < want;
    if (!active) { // devriye: trafik gibi sür (sirensiz) veya havuzda bekle
      if (a.copIdx < 1 && w.level === 0) { this._car(a, dt, cars); a.pursuit = false; return; }
      a.active = false; a.pursuit = false; a.spawned = false; a.thr = 0; a.brk = 1; return;
    }
    if (!a.spawned || (dist > 420 && !w.seen)) { // kendi başına, oyuncudan uzak bir yolda başla (ışınlanma yok: görüş dışı)
      const sp = this._spawnRoadPoint(190, 300); if (!sp) return;
      this._teleport(a, sp.x, sp.z, sp.yaw); a.node = sp.from; a.next = sp.to; a.active = true; a.wps = [laneEnter(sp.from, sp.to)]; a.routeT = 0; a.route = null;
    }
    a.pursuit = true;
    const tx = w.seen ? P.x + P.vx * 0.5 : w.lx, tz = w.seen ? P.z + P.vz * 0.5 : w.lz;
    const dd = Math.hypot(tx - a.x, tz - a.z);
    if (dd < 28 && (w.seen || dd < 12)) { // yakın takip / çarpma
      this._steerTo(a, tx, tz, w.seen ? 24 : 9, dt, { ignoreCurve: true, maxThr: 1 });
      if (w.seen && dd < 18) { a.thr = 1; a.brk = 0; }
      if (!w.seen && dd < 9) { a.thr = 0; a.brk = 1; a.steer = 0.6; }       // arama: dairesel dolaş
      a.wps = [];
    } else {
      a.routeT -= dt;
      if (a.routeT <= 0 || !a.route) { a.routeT = 2.5; const nA = nearestNode(a.x, a.z), nB = nearestNode(tx, tz); a.route = trafficRoute(a.next ?? nA, nB); }
      this._followRoute(a, dt, cars, peds, { cruise: w.seen ? 21 : 13, obeyLights: false, route: a.route });
    }
    if (a.speed < 0.5 && (a.stuck += dt) > 8) { a.alive = 0; a.spawned = false; a.stuck = 0; }
  }

  // ------------------------------------------------------------------ yayalar (davranış ağacı)
  _ped(a, dt, cars) {
    const P = this.player, d = Math.hypot(a.x - P.x, a.z - P.z), maxPeds = Math.round(this.agents.filter((q) => q.kind === KIND.PED).length * this.pop);
    const night = this.tod >= 23 || this.tod < 5;
    if (!a.bt) a.bt = this._pedTree(a);
    if (a.alive === 0 || a.dead) { a.dead = true; a.deadT += dt; a.mx = a.mz = 0; a.sprint = false; a.anim = ANIM.NONE; if (a.deadT > 25) { a.dead = false; a.spawned = false; a.alive = 1; } return; }
    const far = !a.spawned || d > 230;
    if (far || (this.agents.filter((q) => q.kind === KIND.PED && q.spawned).length > maxPeds && d > 150)) {
      if (night && this.rng() < 0.7) { a.spawned = false; a.active = false; return; }
      const p = this._ring(30, 170), bi = worldToBlock(p.x, p.z); if (!inCity(...bi)) return;
      const n = nearestPedNode(p.x, p.z), pos = pedPos(n); this._teleport(a, pos.x, pos.z, this.rng() * 6.28); a.active = true; a.node = n; a.film = 0; a.activity = null; return;
    }
    a.bt.tick({ a, dt, cars, P });
  }

  _activity() { const h = this.tod; if (h < 6 || h >= 23) return 'home'; if (h < 9) return 'work'; if (h < 12) return 'shop'; if (h < 14) return 'eat'; if (h < 17) return 'work'; if (h < 20) return 'fun'; return 'home'; }
  _pickGoal(a) {
    const act = this._activity(), [bi, bj] = worldToBlock(a.x, a.z), want = { home: ['home', 'park'], work: ['work', 'shop', 'plaza'], shop: ['shop', 'plaza', 'gas'], eat: ['shop', 'plaza'], fun: ['fun', 'park', 'plaza'] }[act];
    const pois = []; for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) if (inCity(bi + i, bj + j)) for (const p of blockContent(bi + i, bj + j).pois) pois.push(p);
    const f = pois.filter((p) => want.includes(p.kind)), pool = f.length ? f : pois; if (!pool.length) return null;
    const p = pool[Math.floor(this.rng() * pool.length)], n = nearestPedNode(p.x, p.z); return n;
  }

  _pedTree(a) {
    const self = this, walk = (x, speed) => {
      const t = x.a, tgt = t.path[t.pi]; if (!tgt) return OK;
      const p = pedPos(tgt), dx = p.x - t.x, dz = p.z - t.z, dl = Math.hypot(dx, dz);
      if (dl < 1.4) { t.pi++; if (t.pi >= t.path.length) { t.path = []; return OK; } return RUN; }
      let mx = dx / dl, mz = dz / dl;
      for (const o of self.agents) { if (o === t || o.kind !== KIND.PED || !o.spawned) continue; const ox = t.x - o.x, oz = t.z - o.z, od = Math.hypot(ox, oz); if (od < 1.2 && od > 0.01) { mx += (ox / od) * 0.5; mz += (oz / od) * 0.5; } }
      const ml = Math.hypot(mx, mz) || 1; t.mx = mx / ml; t.mz = mz / ml; t.sprint = speed > 2; return RUN;
    };
    return Selector(
      // 1) tehlike: korku/kaçış
      Sequence(Cond((x) => x.a.flee > 0), Act((x) => {
        const t = x.a; t.flee -= x.dt; t.anim = ANIM.FLEE; const fx = t.fleeFrom; let dx = t.x - fx.x, dz = t.z - fx.z; const dl = Math.hypot(dx, dz) || 1;
        t.mx = dx / dl; t.mz = dz / dl; t.sprint = true; t.hide = t.flee < 3 && dl > 40; if (t.flee <= 0) { t.anim = ANIM.NONE; t.sprint = false; t.hide = false; }
        return RUN;
      })),
      // 2) telefonla video çekme
      Sequence(Cond((x) => x.a.film > 0), Act((x) => { const t = x.a; t.film -= x.dt; t.mx = t.mz = 0; t.sprint = false; t.anim = ANIM.PHONE; if (t.film <= 0) t.anim = ANIM.NONE; return RUN; })),
      // 3) araç tehlikesi: yaklaşan hızlı araçtan kaç
      Sequence(Cond((x) => { const t = x.a; for (const c of x.cars) { if (!c.spawned && c.kind !== KIND.PLAYER) continue; const dx = t.x - c.x, dz = t.z - c.z, dl = Math.hypot(dx, dz); if (dl < 14 && c.speed > 5) { const f = FWD(c.yaw); if ((-dx * f.x - dz * f.z) / dl < -0.5) { t.dodge = { x: c.x, z: c.z }; return true; } } } if (x.P.inVeh && Math.hypot(t.x - x.P.x, t.z - x.P.z) < 14 && x.P.speed > 5) { t.dodge = { x: x.P.x, z: x.P.z }; return true; } return false; }),
        Act((x) => { const t = x.a, f = t.dodge, dx = t.x - f.x, dz = t.z - f.z, dl = Math.hypot(dx, dz) || 1; t.mx = -dz / dl * (dx > 0 ? 1 : -1) * 0.7 + dx / dl * 0.6; t.mz = dx / dl * (dz > 0 ? 1 : -1) * 0.7 + dz / dl * 0.6; t.sprint = true; t.anim = ANIM.FLEE; return RUN; })),
      // 4) yürüyüş
      Sequence(Cond((x) => x.a.path.length > 0 && x.a.pi < x.a.path.length), Act((x) => { x.a.anim = ANIM.NONE; x.a.hide = false; return walk(x, 1.4); })),
      // 5) bekleme/konuşma, sonra yeni hedef
      Act((x) => {
        const t = x.a; t.sprint = false; t.mx = t.mz = 0; t.idle -= x.dt;
        if (t.idle > 0) { const near = self.agents.find((o) => o !== t && o.kind === KIND.PED && o.spawned && !o.dead && o.path.length === 0 && Math.hypot(o.x - t.x, o.z - t.z) < 3.2); t.anim = near ? ANIM.TALK : ANIM.NONE; return RUN; }
        const goal = self._pickGoal(t); t.anim = ANIM.NONE;
        if (goal !== null) { const route = pedRoute(nearestPedNode(t.x, t.z), goal); t.path = route ?? []; t.pi = 0; }
        t.idle = 6 + self.rng() * 20; return RUN;
      }),
    );
  }
}
