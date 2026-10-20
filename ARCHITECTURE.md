# Leonida — Mimari (1. Aşama)

## Çalıştırma
```
npm install
npm run dev          # http://localhost:5173  (?quality=low|medium|high  &debug=1)
npm test             # fizik çekirdeği + worker protokolü (tarayıcısız)
npm run build
```
Dev/preview sunucusu `COOP/COEP` başlıklarını verir (SharedArrayBuffer için). Canlıya alırken aynı başlıkları verin;
yoksa oyun otomatik olarak `postMessage` moduna düşer (F3 panelinde görünür).

## Thread modeli
```
ANA THREAD (render + girdi)                         FİZİK WORKER (240 Hz sabit adım)
 Input ─► PlayerInputSystem ─► Float32Array(girdi) ══SAB══► PhysicsWorld.step()
 Engine.loop (rAF)                                           ├─ karakter denetleyici (kapsül, autostep, eğim)
  ├ PhysicsSyncSystem ◄══ Snapshot (prev/curr, seqlock) ◄════┤ ├─ aerodinamik sürükleme F=½ρCdAv²
  │   interpolasyon: lerp/nlerp, alpha = (acc + Δt)/dt       │ └─ Rapier (CCD açık, SI birimleri)
  ├ RenderSyncSystem → three.js                              └─ spiral-of-death korumalı FixedStepper
  └ DebugSystem (F3/F4)  ◄── 'debug' (collider çizgileri, ~20 Hz), 'events' (iniş/hasar)
```
* Cisim indeksini ana thread atar; ECS `PhysicsBody.index` = anlık görüntü satırı.
* Anlık görüntü satırı: `px py pz qx qy qz qw flags` (flags: uyuyor / çömelik / yerde).
* Seqlock: worker yazarken sayaç tek sayı olur; ana thread tutarsız okursa tekrar dener.

## Klasör yapısı
```
src/
  config/constants.js         SI sabitleri, 240 Hz, kalite seviyeleri
  core/        Engine.js (döngü) · Input.js · Stats.js (FPS, bellek, F4 raporu)
  ecs/         World.js · components.js · systems/*  (sıra: kamera→girdi→fizik→oyuncu→render→takip→debug→HUD)
  physics/     PhysicsWorld.js (Rapier sarmalayıcı) · physics.worker.js · PhysicsClient.js
               FixedStepper.js · SnapshotLayout.js · InputLayout.js
               materials.js · aerodynamics.js · fallDamage.js
  render/      Renderer.js · CameraRig.js · ProceduralMeshes.js · DebugDraw.js
  game/        entities.js (fizik+görsel+ECS birleştirici) · Level.js (deneme alanı)
  ui/          Hud.js · DebugOverlay.js (istatistik + enerji grafiği)
tests/         physics-headless.mjs · worker-protocol.mjs
```
Bağımlılık yönü: `game → ecs/render/physics(client) → config`. `physics/PhysicsWorld.js` DOM'a ve three.js'e bağımlı değildir.

## Bilinen sınırlar (sonraki aşamalarda)
* Rapier tek sürtünme katsayısı kullanır (kinetik = `muK`, çift kuralı Min). Statik/kinetik ayrımı ve yuvarlanma
  direnci (`muS`, `rr`) araç lastik modelinde (3. aşama) kullanılacak.
* Jiroskopik etki, Pacejka lastik, motor/şanzıman: 3. aşama. Debug'daki kuvvet vektörleri/temas noktaları: araçlarla birlikte.
* Enerji grafiğinde dönme kinetik enerjisi yok (öteleme KE + PE).
* Kamera çarpışması için fizik worker'ına sorgu kanalı (raycast) eklenecek.
* Gölge: tek yönlü ışık gölgesi. CSM, SSAO, bloom, WebGPU yolu sonraki aşamalarda.
* Çömelme ayağa kalkış kontrolü var; çömelme animasyonu şimdilik gövde ölçeklemesi.
