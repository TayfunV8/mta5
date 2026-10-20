# LEONIDA CITY (tarayıcı tabanlı açık dünya sandbox)

## Çalıştırma
```
npm install
npm run dev        # http://localhost:5173
npm run build
npm test           # tarayıcısız fizik testleri (diğer testler: node tests/<ad>-headless.mjs)
```
Kontroller (oyun içinde Esc > Kontroller): WASD, Shift koş, Boşluk zıpla/el freni, C çömel, E bin/in/etkileşim, F korna,
Sol/Sağ tık ateş/nişan, 1-2-3 silah, R şarjör, Tab karakter değiştir (Lucia/Jason), M harita, Esc duraklat, F3 hata ayıklama.

## Mimari
- `src/physics/` Rapier + kendi araç modelimiz (Pacejka lastik, motor/şanzıman/diferansiyel, ABS/TCS, aerodinamik), karakter denetleyici,
  balistik, patlama, aktif ragdoll. Fizik ayrı Web Worker'da 240 Hz sabit adım; SharedArrayBuffer veya postMessage.
- `src/ai/` AI worker: trafik (şerit + ışık), yayalar (davranış ağacı, A*), polis (çıta sistemi). 10 Hz.
- `src/world/` deterministik şehir yerleşimi + yol/kaldırım ağları. `src/render/` Three.js görselleri.
- `src/game/` oyun akışı: şehir parçaları, nüfus, oyuncu, görevler, kayıt. `src/ui/`, `src/audio/`.

## Bilinen sınırlar
Prosedürel (düşük poligon) modeller kullanılır; gerçekçi görünüm için GLB model/animasyon dosyaları gerekir.
Tekne/jet ski/helikopter, çevre yıkımı, su birikintisi/ıslak yansıma, CSM/SSAO/bloom henüz yok.
