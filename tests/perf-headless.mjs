// Fizik maliyeti (render'dan bağımsız): şehir parçaları + 20 araç + 24 yaya ile adım başına ms.
import { PhysicsWorld } from '../src/physics/PhysicsWorld.js';
import { chunkColliders, chunkId } from '../src/world/cityLayout.js';
import { VEHICLES } from '../src/physics/vehicleSpecs.js';
import { IN } from '../src/physics/InputLayout.js';
const R = +(process.argv[2] ?? 3);
const pw = await PhysicsWorld.create({ solverIterations: 4 });
pw.loadChunk('ground', [[0, -0.5, -150, 1300, 0.5, 850, 'grass']]);
let n = 0; for (let i = -R; i <= R; i++) for (let j = -R; j <= R; j++) { const b = chunkColliders(i, j); n += b.length; pw.loadChunk(chunkId(i, j), b); }
let idx = 0; const specs = Object.keys(VEHICLES);
for (let k = 0; k < 20; k++) { pw.spawn({ index: idx, kind: 'vehicle', spec: specs[k % specs.length], position: [-40 + k * 6, 1.0, 62], wheelRows: Array.from({ length: VEHICLES[specs[k % specs.length]].wheels.length }, (_, i) => idx + 1 + i), agent: -1 }); idx += 6; }
for (let k = 0; k < 24; k++) { pw.spawn({ index: idx++, kind: 'character', position: [-30 + k * 2.5, 1.2, 36], health: 60 }); }
const player = pw.spawn({ index: idx++, kind: 'character', position: [0, 1.2, 36] }); pw.input[IN.CHAR_INDEX] = player.index;
for (let i = 0; i < 240; i++) pw.step();
const T = performance.now(); const N = 480; for (let i = 0; i < N; i++) { pw.input[IN.MOVE_Z] = 1; pw.step(); } const ms = (performance.now() - T) / N;
console.log(`chunk yarıçapı ${R}: ${n} statik kutu, ${pw.entries.size} cisim -> ${ms.toFixed(3)} ms/adım (bütçe 4.17 ms @240Hz) ${ms < 4.17 ? 'OK' : 'YAVAŞ'}`);
