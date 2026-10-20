// Araç tanımları (SI). Güç/tork/kütle değerleri gerçek modellere yakın yaklaşık fabrika verileridir.
const DEG = Math.PI / 180;

function build(o) {
  const wbHalf = o.wheelbase / 2, tr = o.track / 2;
  const fz = -wbHalf, rz = wbHalf;
  const wheels = [
    { x: -tr, z: fz, steer: true, front: true, hand: false, side: -1 },
    { x: tr, z: fz, steer: true, front: true, hand: false, side: 1 },
    { x: -tr, z: rz, steer: false, front: false, hand: true, side: -1 },
    { x: tr, z: rz, steer: false, front: false, hand: true, side: 1 },
  ];
  const frontShare = o.drive === 'FWD' ? 1 : o.drive === 'RWD' ? 0 : o.frontShare ?? 0.4;
  wheels.forEach((w) => { w.y = o.mountY; w.radius = o.wheelR; w.width = o.wheelW; w.axleShare = w.front ? frontShare : 1 - frontShare; w.I = o.wheelI ?? 1.4; });
  const peak = Math.max(...o.engine.curve.map((c) => c[1]));
  return { suspFreq: 1.4, zeta: 0.4, L0: 0.34, arb: 12000, steerSpeedScale: 22, reverseRatio: 3.2, diff: 'open', cl: 0, tireMu: 1.0,
    ...o, wheels, frontShare, peakTorque: peak,
    // gövde çarpışma kutusu (yarı boyutlar) ve kütle merkezi y ofseti
    hull: { hx: o.size.w / 2 * 0.96, hy: o.size.h * 0.22, hz: o.size.l / 2 * 0.96 }, cabin: o.cabin };
}

export const VEHICLES = {
  // Honda Civic 2.0 benzeri: 118 kW @6500, 187 N·m @4200, 1280 kg, FWD
  sedan: build({
    name: 'sedan', label: 'Kompakt Sedan', mass: 1280, size: { l: 4.55, w: 1.80, h: 1.42 }, wheelbase: 2.70, track: 1.55, wheelR: 0.31, wheelW: 0.21, mountY: -0.12,
    comY: -0.28, drive: 'FWD', diff: 'open', cd: 0.29, area: 2.15, brakeTorque: 1500, steerMax: 33 * DEG,
    engine: { idle: 800, redline: 6800, shiftUp: 6000, shiftDown: 2200, inertia: 0.12, brake: 24,
      curve: [[800, 110], [1500, 150], [2500, 172], [4200, 187], [5500, 180], [6500, 174], [7000, 120]] },
    gears: [3.64, 2.08, 1.36, 1.03, 0.82, 0.69], final: 4.11, colors: [0x2c5fa8, 0xb8bcc4, 0x9a1f2b, 0x1d1f24],
  }),
  // Nissan Z benzeri: 298 kW @6400, 475 N·m @1600-5600, 1540 kg, RWD, LSD
  coupe: build({
    name: 'coupe', label: 'Spor Coupe', mass: 1540, size: { l: 4.38, w: 1.84, h: 1.32 }, wheelbase: 2.55, track: 1.58, wheelR: 0.335, wheelW: 0.26, mountY: -0.10,
    comY: -0.26, drive: 'RWD', diff: 'lsd', cd: 0.30, area: 2.0, cl: 0.12, brakeTorque: 2000, steerMax: 30 * DEG, suspFreq: 1.8, zeta: 0.45,
    engine: { idle: 850, redline: 7000, shiftUp: 6500, shiftDown: 2600, inertia: 0.14, brake: 30,
      curve: [[1000, 330], [1600, 475], [5600, 475], [6400, 445], [7000, 330], [7400, 200]] },
    gears: [3.62, 2.19, 1.62, 1.27, 1.0, 0.82, 0.65, 0.51], final: 3.69, colors: [0xe0b800, 0xc2272d, 0x101216, 0xf2f2f2],
  }),
  // Toyota RAV4 2.5 benzeri: 151 kW @6600, 243 N·m @4800, 1600 kg, AWD
  suv: build({
    name: 'suv', label: 'SUV', mass: 1650, size: { l: 4.60, w: 1.86, h: 1.69 }, wheelbase: 2.69, track: 1.60, wheelR: 0.36, wheelW: 0.235, mountY: -0.08,
    comY: -0.22, drive: 'AWD', frontShare: 0.45, diff: 'open', cd: 0.33, area: 2.7, brakeTorque: 1900, steerMax: 33 * DEG, suspFreq: 1.3,
    engine: { idle: 750, redline: 6600, shiftUp: 5800, shiftDown: 2000, inertia: 0.16, brake: 28,
      curve: [[800, 150], [1500, 200], [3000, 232], [4800, 243], [6000, 225], [6600, 205], [7000, 140]] },
    gears: [3.54, 2.05, 1.40, 1.0, 0.72, 0.58], final: 3.99, colors: [0x2f4a3a, 0xc9ccd1, 0x44505e, 0x701b1b],
  }),
  // Ford F-150 3.5 EcoBoost benzeri: 298 kW @5000, 678 N·m @3500, 2300 kg, AWD
  pickup: build({
    name: 'pickup', label: 'Pickup', mass: 2300, size: { l: 5.90, w: 2.03, h: 1.96 }, wheelbase: 3.68, track: 1.74, wheelR: 0.40, wheelW: 0.265, mountY: -0.05,
    comY: -0.18, drive: 'AWD', frontShare: 0.4, diff: 'open', cd: 0.40, area: 3.3, brakeTorque: 2600, steerMax: 32 * DEG, suspFreq: 1.2, zeta: 0.38,
    engine: { idle: 700, redline: 5700, shiftUp: 5000, shiftDown: 1800, inertia: 0.22, brake: 40,
      curve: [[1000, 350], [1500, 560], [2500, 670], [3500, 678], [4500, 600], [5000, 569], [5700, 420], [6000, 250]] },
    gears: [4.69, 2.98, 2.14, 1.76, 1.52, 1.29, 1.0, 0.85, 0.69, 0.64], final: 3.55, colors: [0xb02a2a, 0x2a3f6b, 0xd7d9dc, 0x23262b],
  }),
  // Mercedes Sprinter benzeri: 105 kW @3800, 330 N·m @1400-2400, 2600 kg yüklü, RWD
  van: build({
    name: 'van', label: 'Teslimat Vanı', mass: 2600, size: { l: 5.93, w: 2.02, h: 2.60 }, wheelbase: 3.66, track: 1.74, wheelR: 0.36, wheelW: 0.235, mountY: -0.05,
    comY: -0.10, drive: 'RWD', diff: 'open', cd: 0.36, area: 4.6, brakeTorque: 2400, steerMax: 35 * DEG, suspFreq: 1.15, zeta: 0.4,
    engine: { idle: 750, redline: 4600, shiftUp: 3900, shiftDown: 1500, inertia: 0.2, brake: 45,
      curve: [[800, 220], [1400, 330], [2400, 330], [3200, 290], [3800, 265], [4300, 200], [4700, 120]] },
    gears: [4.38, 2.86, 1.92, 1.37, 1.0, 0.82, 0.73], final: 3.923, colors: [0xf2f2f2, 0x2d6fb5, 0xe08a1e, 0x2b7a3f],
  }),
  // Yamaha R6 benzeri (+sürücü): 87 kW @14500, 62 N·m @10500, 265 kg
  bike: build({
    name: 'bike', label: 'Motosiklet', mass: 265, size: { l: 2.07, w: 0.70, h: 1.1 }, wheelbase: 1.375, track: 0, wheelR: 0.31, wheelW: 0.18, mountY: 0.0, wheelI: 0.9,
    comY: -0.05, drive: 'RWD', diff: 'open', cd: 0.6, area: 0.5, brakeTorque: 700, steerMax: 22 * DEG, suspFreq: 2.2, zeta: 0.5, L0: 0.28, steerSpeedScale: 12,
    engine: { idle: 1300, redline: 15500, shiftUp: 14200, shiftDown: 6000, inertia: 0.04, brake: 6,
      curve: [[1300, 25], [4000, 38], [7000, 48], [10500, 62], [12000, 60], [14500, 57.3], [16000, 35]] },
    gears: [2.583, 2.0, 1.667, 1.444, 1.286, 1.136], final: 2.073 * 2.81, colors: [0x1a4fd0, 0xd01a1a, 0x111111], bike: true,
  }),
};

// İki tekerlekli aracın tekerlekleri tek eksende (x=0) durur.
VEHICLES.bike.wheels = [
  { x: 0, y: 0, z: -VEHICLES.bike.wheelbase / 2, steer: true, front: true, hand: false, side: 0, radius: 0.31, width: 0.12, axleShare: 0, I: 0.9 },
  { x: 0, y: 0, z: VEHICLES.bike.wheelbase / 2, steer: false, front: false, hand: true, side: 0, radius: 0.31, width: 0.18, axleShare: 1, I: 0.9 },
];
VEHICLES.bike.hull = { hx: 0.25, hy: 0.45, hz: 0.95 };
