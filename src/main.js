import { Game } from './game/Game.js';
import { Menus } from './ui/Menus.js';
import { Engine } from './core/Engine.js';
import { SaveGame } from './game/Settings.js';

async function boot() {
  const ui = document.getElementById('ui'), hudRoot = document.getElementById('hud'), canvas = document.getElementById('game'), big = document.getElementById('bigmap');
  const menus = new Menus(ui, null); menus.showLoading(); menus.stage(0, 1, 'Uygulama yüklendi');
  const game = new Game(menus); menus.g = game; window.leonida = { game };
  const watchdog = setTimeout(() => menus.fail(game.initStage ?? 0, 'Yükleme zaman aşımı', new Error('Başlatma 60 sn içinde tamamlanmadı. Konsolu (F12) kontrol et.')), 60000);
  window.addEventListener('error', (e) => console.error('[hata]', e.message, e.filename, e.lineno));
  window.addEventListener('unhandledrejection', (e) => console.error('[söz reddedildi]', e.reason));
  try { await game.init(canvas, ui, hudRoot, (i, f, m) => { game.initStage = i; menus.stage(i, f, m); }); }
  catch (e) { clearTimeout(watchdog); console.error(`[BAŞLATMA HATASI] ${e.subsystem ?? ''}:`, e); menus.fail(e.stage ?? 0, e.subsystem ?? 'Bilinmeyen alt sistem', e); return; }
  clearTimeout(watchdog);
  big.addEventListener('mousedown', (ev) => { const r = big.getBoundingClientRect(), x = ((ev.clientX - r.left) / r.width) * big.width, z = ((ev.clientY - r.top) / r.height) * big.height; if (ev.button === 0) game.setWaypoint(game.minimap.bigToWorld(x, z)); else if (ev.button === 2) game.setWaypoint(null); });
  const fit = () => { const s = Math.min(innerWidth, innerHeight) - 40; big.width = big.height = Math.max(400, Math.floor(s)); big.style.width = big.style.height = big.width + 'px'; }; fit(); addEventListener('resize', fit);
  menus.stage(5, 1, 'Hazır');
  new Engine({ ecs: game.ecs, renderer: game.renderer, stats: game.stats, ctx: game, physics: game.physics }).start();
  setTimeout(() => { menus.hideLoading(); const r = SaveGame.read(); menus.showTitle(r.ok, !r.ok && r.reason !== 'kayıt yok' ? r.reason : null); }, 250);
}
boot();
