// Menüler: yükleme ekranı (aşamalar + hata/yeniden dene), başlık, duraklatma, ayarlar, görevler, kontroller, harita, ölüm.
import { Settings } from '../game/Settings.js';
const el = (html) => { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstElementChild; };
export const STAGES = ['Uygulama yükleniyor', 'Grafikler başlatılıyor', 'Fizik motoru başlatılıyor', 'Dünya yükleniyor', 'Oyuncu ve nüfus hazırlanıyor', 'Oyun hazırlanıyor'];

export class Menus {
  constructor(root, game) { this.root = root; this.g = game; this.stack = []; this.open = false; }

  // ---------------------------------------------------------- yükleme
  showLoading() {
    this.loading = el(`<div class="screen" id="loading"><div class="panel wide"><h1>LEONIDA CITY</h1><ol id="l-stages">${STAGES.map((s, i) => `<li data-i="${i}"><span class="dot"></span>${s}<em></em></li>`).join('')}</ol><div class="pbar"><i id="l-bar"></i></div><div id="l-msg">Başlatılıyor…</div><div id="l-err" class="hide"></div></div></div>`);
    this.root.append(this.loading); this.done = 0;
  }
  stage(i, frac = 0, msg) {
    const lis = this.loading.querySelectorAll('li'); lis.forEach((li, k) => { li.className = k < i ? 'ok' : k === i ? 'run' : ''; });
    this.loading.querySelector('#l-bar').style.width = Math.round(((i + frac) / STAGES.length) * 100) + '%';
    if (msg) this.loading.querySelector('#l-msg').textContent = msg;
  }
  hideLoading() { this.loading?.remove(); this.loading = null; }
  fail(stageIdx, subsystem, err) {
    if (!this.loading) this.showLoading();
    const li = this.loading.querySelector(`li[data-i="${stageIdx}"]`); if (li) li.className = 'err';
    const box = this.loading.querySelector('#l-err'); box.classList.remove('hide');
    box.innerHTML = `<b>Hata: ${subsystem}</b><p>${String(err?.message ?? err)}</p><pre>${String(err?.stack ?? '').split('\n').slice(0, 5).join('\n')}</pre><button id="l-retry">Yeniden dene</button> <button id="l-reset">Kaydı sıfırla ve yeniden dene</button>`;
    box.querySelector('#l-retry').onclick = () => location.reload();
    box.querySelector('#l-reset').onclick = () => { import('../game/Settings.js').then((m) => { m.SaveGame.reset(); location.reload(); }); };
    this.loading.querySelector('#l-msg').textContent = 'Başlatma başarısız — ayrıntılar konsolda (F12).';
  }

  // ---------------------------------------------------------- başlık
  showTitle(hasSave, saveProblem) {
    this.title = el(`<div class="screen" id="title"><div class="panel"><h1>LEONIDA CITY</h1><p class="sub">Açık dünya suç sandbox'ı</p>
      ${saveProblem ? `<p class="warn">Kayıt okunamadı (${saveProblem}). Yeni oyun başlatabilirsin.</p>` : ''}
      <button id="t-new">Yeni Oyun</button>${hasSave ? '<button id="t-cont">Devam Et</button>' : ''}<button id="t-set">Ayarlar</button><button id="t-ctl">Kontroller</button><p class="hint">Oynamak için bir seçenek seç; fare oyuna kilitlenir. Esc: duraklat.</p></div></div>`);
    this.root.append(this.title);
    this.title.querySelector('#t-new').onclick = () => { this.title.remove(); this.g.startNew(); };
    this.title.querySelector('#t-cont')?.addEventListener('click', () => { this.title.remove(); this.g.startContinue(); });
    this.title.querySelector('#t-set').onclick = () => this.settings(() => {}); this.title.querySelector('#t-ctl').onclick = () => this.controls();
  }

  // ---------------------------------------------------------- panel yardımcıları
  _panel(html, onClose) { const p = el(`<div class="screen dim"><div class="panel wide">${html}</div></div>`); this.root.append(p); this.stack.push(p); p._close = onClose; return p; }
  closeTop() { const p = this.stack.pop(); if (p) { p.remove(); p._close?.(); } }
  closeAll() { while (this.stack.length) this.closeTop(); }

  pause() {
    if (this.open) return; this.open = true; this.g.setPaused(true);
    const p = this._panel(`<h2>DURAKLATILDI</h2><button id="p-res">Oyuna dön</button><button id="p-mis">Görevler</button><button id="p-map">Harita</button><button id="p-set">Ayarlar</button><button id="p-ctl">Kontroller</button><button id="p-save">Kaydet</button><button id="p-rst">Kaydı sıfırla</button><button id="p-new">Yeniden başlat (yeni oyun)</button>`, () => {});
    p.querySelector('#p-res').onclick = () => this.resume();
    p.querySelector('#p-mis').onclick = () => this.missions(); p.querySelector('#p-map').onclick = () => { this.resume(); this.g.toggleMap(true); };
    p.querySelector('#p-set').onclick = () => this.settings(); p.querySelector('#p-ctl').onclick = () => this.controls();
    p.querySelector('#p-save').onclick = () => { this.g.save(true); };
    p.querySelector('#p-rst').onclick = () => { if (confirm('Kayıtlı oyun silinsin mi?')) { this.g.resetSave(); } };
    p.querySelector('#p-new').onclick = () => { if (confirm('Yeni oyun başlatılsın mı? (mevcut ilerleme silinir)')) this.g.restartNew(); };
  }
  resume() { this.closeAll(); this.open = false; this.g.setPaused(false); this.g.lockPointer(); }

  settings() {
    const S = Settings.data, p = this._panel(`<h2>AYARLAR</h2><div class="grid">
      <label>Ana ses <input type="range" id="s-master" min="0" max="1" step="0.05" value="${S.master}"></label>
      <label>Efekt sesi <input type="range" id="s-sfx" min="0" max="1" step="0.05" value="${S.sfx}"></label>
      <label>Ortam sesi <input type="range" id="s-amb" min="0" max="1" step="0.05" value="${S.ambient}"></label>
      <label>Sesi kapat <input type="checkbox" id="s-mute" ${S.mute ? 'checked' : ''}></label>
      <label>Fare hassasiyeti <input type="range" id="s-sens" min="0.3" max="2.5" step="0.1" value="${S.sens}"></label>
      <label>Kamera mesafesi <input type="range" id="s-cam" min="2" max="7" step="0.2" value="${S.camDist}"></label>
      <label>Y ekseni ters <input type="checkbox" id="s-inv" ${S.invertY ? 'checked' : ''}></label>
      <label>Grafik kalitesi <select id="s-q"><option value="low">Düşük</option><option value="medium">Orta</option><option value="high">Yüksek</option></select></label>
      <label>FPS göstergesi <input type="checkbox" id="s-fps" ${S.fps ? 'checked' : ''}></label>
      <label>Saat <input type="range" id="s-hour" min="0" max="24" step="0.25" value="${S.hour}"><output id="s-hout">${S.hour}</output></label>
      <label>Zaman akışı (oto) <input type="checkbox" id="s-auto" ${S.autoTime ? 'checked' : ''}></label>
      <label>Yağmur <input type="checkbox" id="s-rain" ${S.rain ? 'checked' : ''}></label></div><button id="s-back">Geri</button>`);
    p.querySelector('#s-q').value = S.quality; const g = this.g, q = (id) => p.querySelector('#' + id);
    q('s-master').oninput = (e) => { Settings.set('master', +e.target.value); g.audio?.applySettings(); };
    q('s-sfx').oninput = (e) => { Settings.set('sfx', +e.target.value); g.audio?.applySettings(); };
    q('s-amb').oninput = (e) => { Settings.set('ambient', +e.target.value); g.audio?.applySettings(); };
    q('s-mute').onchange = (e) => { Settings.set('mute', e.target.checked); g.audio?.applySettings(); };
    q('s-sens').oninput = (e) => { Settings.set('sens', +e.target.value); g.applySettings?.(); };
    q('s-cam').oninput = (e) => { Settings.set('camDist', +e.target.value); g.applySettings?.(); };
    q('s-inv').onchange = (e) => { Settings.set('invertY', e.target.checked); g.applySettings?.(); };
    q('s-fps').onchange = (e) => { Settings.set('fps', e.target.checked); };
    q('s-hour').oninput = (e) => { Settings.set('hour', +e.target.value); q('s-hout').textContent = e.target.value; g.setHour?.(+e.target.value); };
    q('s-auto').onchange = (e) => { Settings.set('autoTime', e.target.checked); };
    q('s-rain').onchange = (e) => { Settings.set('rain', e.target.checked); g.setRain?.(e.target.checked); };
    q('s-q').onchange = (e) => { Settings.set('quality', e.target.value); g.save?.(false); if (g.started) { alert('Kalite değişti: nüfus ve görüş mesafesi için oyun yeniden yüklenecek.'); location.reload(); } else g.renderer?.setQuality(e.target.value); };
    q('s-back').onclick = () => this.closeTop();
  }

  controls() {
    const p = this._panel(`<h2>KONTROLLER</h2><table class="ctl"><tr><td>W A S D</td><td>Yürü / araç sür</td></tr><tr><td>Fare</td><td>Kamera</td></tr><tr><td>Shift</td><td>Koş (dayanıklılık harcar)</td></tr><tr><td>Boşluk</td><td>Zıpla · araçta el freni</td></tr><tr><td>C</td><td>Çömel · araçta kamera mesafesi</td></tr><tr><td>E</td><td>Araca bin/in · etkileşim · görev başlat</td></tr><tr><td>F</td><td>Araçta korna · yürürken ikincil etkileşim (telefon)</td></tr><tr><td>Sol tık / Sağ tık</td><td>Ateş et / nişan al</td></tr><tr><td>1 2 3 / R</td><td>Silah seç · şarjör doldur (görev başarısız olunca R = yeniden dene)</td></tr><tr><td>Tab</td><td>Karakter değiştir (Lucia / Jason)</td></tr><tr><td>M</td><td>Harita (tıkla: hedef işareti)</td></tr><tr><td>Esc</td><td>Duraklat / menü</td></tr><tr><td>F3</td><td>Fizik hata ayıklama</td></tr></table><button id="c-back">Geri</button>`);
    p.querySelector('#c-back').onclick = () => this.closeTop();
  }

  missions() {
    const ms = this.g.missions.list(), p = this._panel(`<h2>GÖREVLER</h2><table class="ctl">${ms.map((m) => `<tr><td><b>${m.title}</b><br><small>${m.desc}</small></td><td>${m.completed ? '✔ tamamlandı' : m.active ? '▶ aktif' : ''}</td><td><button data-id="${m.id}">${m.completed ? 'Tekrar oyna' : 'Başlat'}</button></td></tr>`).join('')}</table><button id="m-back">Geri</button>`);
    p.querySelectorAll('button[data-id]').forEach((b) => (b.onclick = () => { this.resume(); this.g.missions.start(b.dataset.id, true); }));
    p.querySelector('#m-back').onclick = () => this.closeTop();
  }

  death(text) { this.deathEl?.remove(); this.deathEl = el(`<div class="screen wasted"><h1>${text}</h1></div>`); this.root.append(this.deathEl); }
  clearDeath() { this.deathEl?.remove(); this.deathEl = null; }
}
