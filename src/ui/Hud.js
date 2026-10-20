// Oyun içi HUD (DOM). Tüm değerler gerçek oyun durumundan gelir.
const $ = (h) => { const d = document.createElement('div'); d.innerHTML = h.trim(); return d.firstElementChild; };
export class Hud {
  constructor(root) {
    this.root = root; root.innerHTML = '';
    root.append(
      $(`<div id="hud-tl"><div class="name" id="h-name">LUCIA</div><div class="bar hp"><i id="h-hp"></i><span id="h-hpt">100</span></div><div class="bar st"><i id="h-st"></i></div></div>`),
      $(`<div id="hud-tr"><div id="h-money">$0</div><div id="h-stars"></div><div id="h-dist"></div></div>`),
      $(`<div id="hud-bl"><canvas id="h-mini" width="220" height="220"></canvas><div id="h-arrow"><b></b><span></span></div></div>`),
      $(`<div id="hud-br" class="hide"><div id="h-kmh">0</div><small>km/h</small><div id="h-gear">N</div><div class="rpm"><i id="h-rpm"></i></div><div class="veh"><i id="h-vh"></i></div><div id="h-flags"></div></div>`),
      $(`<div id="hud-mission" class="hide"><div id="m-title"></div><div id="m-obj"></div><div id="m-timer"></div></div>`),
      $(`<div id="h-prompt" class="hide"></div>`), $(`<div id="h-toast"></div>`), $(`<div id="h-banner" class="hide"><h1></h1><p></p></div>`),
      $(`<div id="h-weapon" class="hide"></div>`), $(`<div id="h-cross" class="hide">+</div>`), $(`<div id="h-fps" class="hide"></div>`), $(`<div id="h-vig"></div>`),
    );
    const g = (i) => root.querySelector('#' + i);
    this.e = Object.fromEntries(['h-name', 'h-hp', 'h-hpt', 'h-st', 'h-money', 'h-stars', 'h-dist', 'h-mini', 'h-arrow', 'hud-br', 'h-kmh', 'h-gear', 'h-rpm', 'h-vh', 'h-flags', 'hud-mission', 'm-title', 'm-obj', 'm-timer', 'h-prompt', 'h-toast', 'h-banner', 'h-weapon', 'h-cross', 'h-fps', 'h-vig'].map((k) => [k, g(k)]));
    this.mini = this.e['h-mini']; this.toastT = 0; this.starFlash = 0; this.bannerT = 0;
    this.e['h-stars'].innerHTML = '★★★★★'.split('').map((s) => `<b>${s}</b>`).join('');
  }
  setChar(name) { this.e['h-name'].textContent = name; }
  setHealth(h, max = 100) { const p = Math.max(0, Math.min(100, (h / max) * 100)); this.e['h-hp'].style.width = p + '%'; this.e['h-hpt'].textContent = Math.round(h); this.e['h-hp'].style.background = p < 30 ? '#e53935' : 'linear-gradient(90deg,#ff4fa3,#ffa63d)'; }
  setStamina(s) { this.e['h-st'].style.width = Math.round(s * 100) + '%'; }
  setMoney(m) { this.e['h-money'].textContent = '$' + m.toLocaleString('en-US'); }
  setWanted(level, searching, t) { const stars = this.e['h-stars'].children; for (let i = 0; i < 5; i++) { stars[i].className = i < level ? (searching && Math.floor(t * 3) % 2 ? 'dim' : 'on') : ''; } }
  setDistrict(text) { this.e['h-dist'].textContent = text; }
  showSpeedo(on) { this.e['hud-br'].classList.toggle('hide', !on); }
  setSpeedo(kmh, gear, rpmFrac, vh, abs, tcs) { this.e['h-kmh'].textContent = Math.round(Math.abs(kmh)); this.e['h-gear'].textContent = gear < 0 ? 'R' : gear === 0 ? 'N' : gear; this.e['h-rpm'].style.width = Math.min(100, rpmFrac * 100) + '%'; this.e['h-rpm'].style.background = rpmFrac > 0.9 ? '#ff3b30' : '#7df9ff'; this.e['h-vh'].style.width = Math.max(0, vh) + '%'; this.e['h-vh'].style.background = vh < 30 ? '#e53935' : '#6fd36f'; this.e['h-flags'].textContent = `${abs ? 'ABS ' : ''}${tcs ? 'TCS' : ''}`; }
  setMission(m) { const hud = this.e['hud-mission']; if (!m) { hud.classList.add('hide'); return; } hud.classList.remove('hide'); this.e['m-title'].textContent = m.title; this.e['m-obj'].textContent = m.objective; this.e['m-timer'].textContent = m.timer ?? ''; }
  setPrompt(t) { const p = this.e['h-prompt']; if (t) { p.textContent = t; p.classList.remove('hide'); } else p.classList.add('hide'); }
  setArrow(angle, dist) { const a = this.e['h-arrow']; if (angle === null) { a.style.display = 'none'; return; } a.style.display = 'flex'; a.firstElementChild.style.transform = `rotate(${angle}rad)`; a.lastElementChild.textContent = dist > 999 ? (dist / 1000).toFixed(1) + ' km' : Math.round(dist) + ' m'; }
  setWeapon(text) { const w = this.e['h-weapon']; if (text) { w.textContent = text; w.classList.remove('hide'); } else w.classList.add('hide'); }
  setCross(on) { this.e['h-cross'].classList.toggle('hide', !on); }
  setFps(text) { const f = this.e['h-fps']; if (text) { f.textContent = text; f.classList.remove('hide'); } else f.classList.add('hide'); }
  toast(t, sec = 2.6) { const e = this.e['h-toast']; e.textContent = t; e.style.opacity = 1; this.toastT = sec; }
  banner(h, p, sec = 3.5) { const b = this.e['h-banner']; b.querySelector('h1').textContent = h; b.querySelector('p').textContent = p ?? ''; b.classList.remove('hide'); this.bannerT = sec; }
  flash() { const v = this.e['h-vig']; v.style.opacity = 0.75; setTimeout(() => (v.style.opacity = 0), 120); }
  tick(dt) { if (this.toastT > 0 && (this.toastT -= dt) <= 0) this.e['h-toast'].style.opacity = 0; if (this.bannerT > 0 && (this.bannerT -= dt) <= 0) this.e['h-banner'].classList.add('hide'); }
}
