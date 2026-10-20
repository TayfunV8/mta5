# Model klasörü (GLB)

Dosya yoksa oyun otomatik olarak prosedürel (kodla üretilmiş) modelleri kullanır.

## Araçlar: public/models/vehicles/<ad>.glb
Adlar: sedan, coupe, suv, pickup, van, bike
- Ölçü: metre. Araç ileri yönü -Z, yukarı +Y olmalı (Blender: Forward -Z, Up Y ile dışa aktar).
- Orijin: aracın alt-orta noktası (yerle temas düzlemi). Oyun boyutu spec'e göre otomatik ölçekler.
- Tekerlek düğümlerini şöyle adlandır: wheel_fl, wheel_fr, wheel_rl, wheel_rr (bike için wheel_f, wheel_r).
  Düğüm orijini tekerlek merkezi olsun. Adlandırma yoksa oyunun kendi tekerlekleri kullanılır, gövdeye eklenir.
- Gövde boyası değişsin istiyorsan malzemenin adı "paint" olsun.
- Öneri: araç başına ≤ 25 bin üçgen, tek 2K doku, Draco/Meshopt sıkıştırma.

## İnsan: public/models/characters/<ad>.glb  (ad: lucia, jason, npc1..npc6)
- Mixamo'dan "Y Bot" ya da başka karakter + animasyonlar. Animasyon klip adları: idle, walk, run, jump, crouch, sit, death.
- Mixamo FBX'ini Blender'da GLB'ye çevir (ya da `fbx2gltf`). İskelet adları "mixamorig:" öneki taşıyabilir, sorun değil.
