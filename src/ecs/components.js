// Bileşen tipleri ve fabrikaları. Bileşenler sadece veridir; davranış sistemlerdedir.
export const C = {
  Transform: 'Transform',       // interpolasyonlu dünya durumu (render için)
  Renderable: 'Renderable',     // three.js nesnesi
  PhysicsBody: 'PhysicsBody',   // fizik worker'ındaki cismin indeksi
  Player: 'Player',             // oyuncu karakteri
  Health: 'Health',
};
export const transform = (p = [0, 0, 0], q = [0, 0, 0, 1]) => ({ px: p[0], py: p[1], pz: p[2], qx: q[0], qy: q[1], qz: q[2], qw: q[3], flags: 0 });
