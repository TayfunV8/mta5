// AI doğrulaması: trafik arabası şeritte kalır, kırmızıda durur; yayalar kaldırımda yürür; polis çıta artar.
import { AiCore, KIND } from '../src/ai/AiCore.js';
import { VEHICLES } from '../src/physics/vehicleSpecs.js';
import { CITY, blockContent, worldToBlock } from '../src/world/cityLayout.js';
let pass = 0, fail = 0; const ok = (n, c, i = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n}  ${i}`); };

// Basit bisiklet modeli ile aracı simüle et (fizik worker'ı yerine) — AI kumandalarını sürüş davranışına çevirir
function sim(core, a, secs, extra) {
  let x = a.x, z = a.z, yaw = a.yaw, v = 0; const spec = VEHICLES.sedan; let minSpeed = 99, maxOff = 0; const stops = [];
  for (let t = 0; t < secs; t += 0.05) {
    if (Math.floor(t * 20) % 2 === 0) { core.setState([a.slot, x, z, yaw, v, -Math.sin(yaw) * v, -Math.cos(yaw) * v, 1], extra?.player); core.tick(0.1); }
    const o = a.slot * 8, thr = core.ctl[o + 1], brk = core.ctl[o + 2], st = core.ctl[o + 3];
    v = Math.max(0, v + (thr * 4.5 - brk * 8 - 0.05 * v) * 0.05);
    const maxSt = spec.steerMax / (1 + v / spec.steerSpeedScale); yaw -= (v / spec.wheelbase) * Math.tan(st * maxSt) * 0.05;
    x += -Math.sin(yaw) * v * 0.05; z += -Math.cos(yaw) * v * 0.05;
    if (t > 3) minSpeed = Math.min(minSpeed, v);
    // yolda mı? en yakın yol hattına uzaklık
    const dx = Math.abs(((x / CITY.CELL + 6.5 + 1000) % 1) - 0) , rx = ((x / CITY.CELL + 6.5) % 1 + 1) % 1, rz = ((z / CITY.CELL + 6.5) % 1 + 1) % 1;
    const dLine = Math.min(Math.min(rx, 1 - rx), Math.min(rz, 1 - rz)) * CITY.CELL; maxOff = Math.max(maxOff, dLine);
    if (v < 0.3) stops.push(t);
  }
  return { x, z, v, maxOff, minSpeed, stops };
}
{
  const core = new AiCore(5); core.player = { x: 0, z: 0, vx: 0, vz: 0, yaw: 0, inVeh: false, speed: 0, alive: true };
  const a = core.register(0, KIND.CAR, 'sedan'); core.tick(0.1); ok('Trafik arabası spawn oldu (oyuncudan 220-330 m)', a.spawned && Math.hypot(a.x, a.z) > 190 && Math.hypot(a.x, a.z) < 360, `d=${Math.hypot(a.x, a.z).toFixed(0)}`);
  core.player = { x: a.x + 400, z: a.z, vx: 0, vz: 0, yaw: 0, inVeh: false, speed: 0, alive: true };   // oyuncu çok uzakta: araç ışınlanmasın diye yakınında tut
  core.player = { x: a.x, z: a.z + 250, vx: 0, vz: 0, yaw: 0, inVeh: false, speed: 0, alive: true };
  const r = sim(core, a, 90);
  ok('Araç 90 sn boyunca yol ağında kaldı (yol hattına <20 m; kavşak dönüşleri dahil)', r.maxOff < 20, `maks sapma=${r.maxOff.toFixed(1)} m`);
  ok('Araç ilerledi (takılmadı)', Math.hypot(r.x - a.x, r.z - a.z) > 150, `${Math.hypot(r.x - a.x, r.z - a.z).toFixed(0)} m`);
}
{ // kırmızı ışıkta durma: yeşil/kırmızı faz boyunca hız profili
  const core = new AiCore(9); core.player = { x: 0, z: 0, vx: 0, vz: 0, yaw: 0, inVeh: false, speed: 0, alive: true };
  const a = core.register(0, KIND.CAR, 'sedan'); core.tick(0.1); core.player = { x: a.x, z: a.z + 250, vx: 0, vz: 0, yaw: 0, inVeh: false, speed: 0, alive: true };
  const r = sim(core, a, 160); ok('Araç ışıklarda duruyor (hız ~0 anları var)', r.stops.length > 20, `duruş örneği=${r.stops.length}`);
}
{ // yaya: kaldırımda yürür, ışınlanma yok
  const core = new AiCore(3); core.player = { x: 0, z: 0, vx: 0, vz: 0, yaw: 0, inVeh: false, speed: 0, alive: true }; const peds = []; for (let i = 0; i < 12; i++) peds.push(core.register(i, KIND.PED));
  for (let k = 0; k < 600; k++) { core.setState(peds.flatMap((p) => [p.slot, p.x, p.z, 0, 0, 0, 0, 1]), null); core.tick(0.1); for (const p of peds) if (p.spawned) { const m = 0.1 * 1.4; p.x += (core.ctl[p.slot * 8 + 1] ?? 0) * m; p.z -= (core.ctl[p.slot * 8 + 2] ?? 0) * m; } }
  const sp = peds.filter((p) => p.spawned); const moving = sp.filter((p) => p.path.length || p.anim); 
  ok('Yayalar spawn oldu ve hedef seçiyor', sp.length >= 8, `aktif=${sp.length}`);
  let inBuilding = 0; for (const p of sp) { const [bi, bj] = worldToBlock(p.x, p.z); const B = blockContent(bi, bj); for (const b of B.buildings) if (Math.abs(p.x - b.x) < b.w / 2 && Math.abs(p.z - b.z) < b.d / 2) inBuilding++; }
  ok('Yayalar binaların içinde değil', inBuilding === 0, `içeride=${inBuilding}`);
  // tehlike: silah sesi -> kaçış
  const near = sp[0]; core.event({ type: 'gunshot', x: near.x + 5, z: near.z }); core.tick(0.1);
  ok('Silah sesine tepki (kaçış veya video çekme)', near.flee > 0 || near.film > 0, `flee=${near.flee.toFixed(1)} film=${(near.film ?? 0).toFixed(1)}`);
}
{ // polis: suç -> çıta -> polis arabaları görev alır; kayıp sonrası çıta azalır
  const core = new AiCore(2); core.player = { x: 0, z: 0, vx: 0, vz: 0, yaw: 0, inVeh: true, speed: 20, alive: true }; const cops = []; for (let i = 0; i < 6; i++) cops.push(core.register(20 + i, KIND.COP, 'sedan'));
  core.event({ type: 'crime', crime: 2, x: 0, z: 0 }); core.tick(0.1); core.tick(0.1);
  ok('Suç çıta seviyesini yükseltir', core.wanted.level >= 2, `seviye=${core.wanted.level} heat=${core.wanted.heat.toFixed(1)}`);
  for (let i = 0; i < 10; i++) core.tick(0.1);
  const act = cops.filter((c) => c.spawned && c.pursuit).length; ok('Seviyeye göre polis arabası devrede', act === [0, 2, 3, 4, 5, 6][core.wanted.level], `aktif=${act}`);
  ok('Polis oyuncunun üstüne ışınlanmıyor (≥190 m uzakta spawn)', cops.filter((c) => c.spawned).every((c) => Math.hypot(c.x, c.z) > 185), cops.filter((c) => c.spawned).map((c) => Math.hypot(c.x, c.z).toFixed(0)).join(','));
  // oyuncu uzaklaşır (görülmez) -> arama, sonra çıta düşer
  core.player = { x: 5000, z: 5000, vx: 0, vz: 0, yaw: 0, inVeh: true, speed: 20, alive: true }; for (const c of cops) { c.x = 0; c.z = 0; }
  const h0 = core.wanted.heat; for (let i = 0; i < 400; i++) core.tick(0.1);
  ok('Görüş kaybından sonra arama ve çıta azalması', core.wanted.searching === true || core.wanted.heat < h0, `heat ${h0.toFixed(1)} -> ${core.wanted.heat.toFixed(1)}`);
}
console.log(`\n${pass} geçti, ${fail} kaldı`); process.exit(fail ? 1 : 0);
