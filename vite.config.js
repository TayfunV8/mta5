import { defineConfig } from 'vite';

// SharedArrayBuffer için "cross-origin isolation" şart: bu iki başlık dev ve preview sunucusunda açık.
// Canlıya alırken aynı başlıkları sunucunuzda da verin (yoksa oyun otomatik olarak postMessage moduna düşer).
const isolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
  server: { headers: isolation, port: 5173 },
  preview: { headers: isolation },
  worker: { format: 'es' },
  build: { target: 'es2022', chunkSizeWarningLimit: 4000 },
});
