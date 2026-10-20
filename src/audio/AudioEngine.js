// Web Audio ile üretilen sesler (harici dosya yok): motor, lastik, rüzgar, ortam, siren, adım, çarpma, silah, UI.
// Tarayıcı engellemesin diye ilk kullanıcı etkileşiminde başlar; hata olursa oyun sessiz devam eder.
import { Settings } from '../game/Settings.js';
const noiseBuf = (ctx, sec = 2) => { const b = ctx.createBuffer(1, ctx.sampleRate * sec, ctx.sampleRate), d = b.getChannelData(0); let l = 0; for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; l = (l + 0.02 * w) / 1.02; d[i] = l * 3.5 + w * 0.15; } return b; };

export class AudioEngine {
  constructor() { this.ctx = null; this.ok = false; this.voices = []; }
  init() {
    if (this.ctx) { this.ctx.resume?.(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; const c = (this.ctx = new AC());
      this.master = c.createGain(); this.sfx = c.createGain(); this.amb = c.createGain(); this.sfx.connect(this.master); this.amb.connect(this.master); this.master.connect(c.destination);
      this.noise = noiseBuf(c, 3);
      const loop = (filterType, f, q = 1) => { const s = c.createBufferSource(); s.buffer = this.noise; s.loop = true; const fl = c.createBiquadFilter(); fl.type = filterType; fl.frequency.value = f; fl.Q.value = q; const g = c.createGain(); g.gain.value = 0; s.connect(fl); fl.connect(g); s.start(); return { s, fl, g }; };
      this.city = loop('lowpass', 520); this.city.g.connect(this.amb); this.wind = loop('bandpass', 700, 0.6); this.wind.g.connect(this.sfx); this.tire = loop('bandpass', 1900, 3); this.tire.g.connect(this.sfx); this.rain = loop('highpass', 2500); this.rain.g.connect(this.amb);
      // motor: testere + kare dalga
      this.eng = { o1: c.createOscillator(), o2: c.createOscillator(), f: c.createBiquadFilter(), g: c.createGain() };
      this.eng.o1.type = 'sawtooth'; this.eng.o2.type = 'square'; this.eng.f.type = 'lowpass'; this.eng.f.frequency.value = 900; this.eng.g.gain.value = 0;
      this.eng.o1.connect(this.eng.f); this.eng.o2.connect(this.eng.f); this.eng.f.connect(this.eng.g); this.eng.g.connect(this.sfx); this.eng.o1.start(); this.eng.o2.start();
      // siren
      this.sir = { o: c.createOscillator(), g: c.createGain() }; this.sir.o.type = 'sawtooth'; this.sir.g.gain.value = 0; const sf = c.createBiquadFilter(); sf.type = 'lowpass'; sf.frequency.value = 1800; this.sir.o.connect(sf); sf.connect(this.sir.g); this.sir.g.connect(this.sfx); this.sir.o.start();
      // diğer araçlar için Doppler'lı motor sesleri (en yakın 3)
      for (let i = 0; i < 3; i++) { const o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain(), p = c.createStereoPanner(); o.type = 'sawtooth'; f.type = 'lowpass'; f.frequency.value = 500; g.gain.value = 0; o.connect(f); f.connect(g); g.connect(p); p.connect(this.sfx); o.start(); this.voices.push({ o, g, p }); }
      this.reverb = c.createConvolver(); const len = c.sampleRate * 1.6, ir = c.createBuffer(2, len, c.sampleRate); for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); } this.reverb.buffer = ir; this.rvG = c.createGain(); this.rvG.gain.value = 0.35; this.reverb.connect(this.rvG); this.rvG.connect(this.sfx);
      this.ok = true; this.applySettings(); this.horn = null;
    } catch (e) { console.warn('[ses] başlatılamadı, sessiz devam ediliyor:', e); this.ok = false; }
  }
  applySettings() { if (!this.ok) return; const S = Settings.data, t = this.ctx.currentTime; this.master.gain.setTargetAtTime(S.mute ? 0 : S.master, t, 0.05); this.sfx.gain.setTargetAtTime(S.sfx, t, 0.05); this.amb.gain.setTargetAtTime(S.ambient, t, 0.05); }
  _burst(dur, freq, type, vol, q = 1, dest) { if (!this.ok) return; const c = this.ctx, s = c.createBufferSource(); s.buffer = this.noise; const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; const g = c.createGain(), t = c.currentTime; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); s.connect(f); f.connect(g); g.connect(dest ?? this.sfx); s.start(t, Math.random() * 1.5, dur); }
  _tone(freq, dur, vol, type = 'sine', slide) { if (!this.ok) return; const c = this.ctx, o = c.createOscillator(), g = c.createGain(), t = c.currentTime; o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); o.connect(g); g.connect(this.sfx); o.start(t); o.stop(t + dur + 0.02); }
  footstep(sprint, surface) { this._burst(0.08, surface === 'grass' ? 500 : 1100, 'bandpass', sprint ? 0.5 : 0.28, 1.2); }
  jump() { this._burst(0.12, 800, 'bandpass', 0.22); } land(p) { this._burst(0.18, 300, 'lowpass', Math.min(0.9, 0.2 + p * 0.1)); this._tone(70, 0.2, Math.min(0.6, p * 0.06), 'sine', 40); }
  crash(e) { const v = Math.min(1, e / 150000); this._burst(0.5, 700, 'lowpass', 0.3 + v * 0.7); this._tone(90, 0.35, 0.3 + v * 0.4, 'square', 40); this._burst(0.25, 3000, 'highpass', 0.3 * v); }
  click() { this._tone(880, 0.07, 0.15, 'square'); } honk() { if (!this.ok) return; this._tone(420, 0.35, 0.18, 'square'); this._tone(530, 0.35, 0.14, 'square'); }
  shot(kind, dist = 0, urban = true) { if (!this.ok) return; const k = kind === 2 ? 1 : 0.7, att = 1 / (1 + dist / 30); this._burst(kind === 2 ? 0.28 : 0.2, kind === 2 ? 1400 : 1800, 'lowpass', 0.9 * k * att, 0.8); this._tone(120, 0.15, 0.5 * att, 'sine', 40); if (urban) { const c = this.ctx, s = c.createBufferSource(); s.buffer = this.noise; const g = c.createGain(); g.gain.value = 0.5 * att; s.connect(g); g.connect(this.reverb); s.start(c.currentTime, Math.random(), 0.15); } }
  explosion(dist = 0) { const a = 1 / (1 + dist / 60); this._burst(1.4, 300, 'lowpass', 1.0 * a); this._tone(55, 0.9, 0.9 * a, 'sine', 28); }
  update(dt, s) {
    if (!this.ok) return; const c = this.ctx, t = c.currentTime;
    this.city.g.gain.setTargetAtTime(0.35 * (0.6 + 0.4 * Math.sin(performance.now() / 5000)), t, 0.5);
    this.rain.g.gain.setTargetAtTime(s.rain ? 0.25 : 0, t, 0.5);
    const e = this.eng; const on = s.inVeh && s.rpm > 0;
    if (on) { const f = 18 + (s.rpm / 60) * 1.0 * (s.cyl ?? 2) * 0.5; e.o1.frequency.setTargetAtTime(Math.max(20, f), t, 0.04); e.o2.frequency.setTargetAtTime(Math.max(10, f * 0.5), t, 0.04); e.f.frequency.setTargetAtTime(300 + s.rpm * 0.35 + s.load * 700, t, 0.06); e.g.gain.setTargetAtTime(0.12 + s.load * 0.1, t, 0.06); } else e.g.gain.setTargetAtTime(0, t, 0.1);
    this.tire.g.gain.setTargetAtTime(on ? Math.min(0.5, Math.max(0, s.slip - 0.9) * 0.6) : 0, t, 0.04); this.tire.fl.frequency.setTargetAtTime(1500 + s.speed * 15, t, 0.1);
    this.wind.g.gain.setTargetAtTime(Math.min(0.35, s.speed / 70), t, 0.2); this.wind.fl.frequency.setTargetAtTime(400 + s.speed * 18, t, 0.2);
    // siren: yakın polis varsa iki tonlu salınım
    const sirenOn = s.cops > 0; this.sir.g.gain.setTargetAtTime(sirenOn ? 0.05 * Math.min(1, 80 / Math.max(20, s.copDist)) : 0, t, 0.2); if (sirenOn) this.sir.o.frequency.setTargetAtTime(Math.floor(performance.now() / 600) % 2 ? 960 : 700, t, 0.02);
    // diğer araçlar (Doppler: f' = f·c/(c - v_radyal))
    this.voices.forEach((v, i) => { const o = s.others?.[i]; if (!o) { v.g.gain.setTargetAtTime(0, t, 0.1); return; } const base = 22 + o.rpm / 60 * 1.0, doppler = 343 / (343 - Math.max(-60, Math.min(60, o.vr))); v.o.frequency.setTargetAtTime(base * doppler, t, 0.05); v.g.gain.setTargetAtTime(Math.min(0.1, 3 / (o.dist + 6)), t, 0.1); v.p.pan.setTargetAtTime(Math.max(-1, Math.min(1, o.pan)), t, 0.1); });
  }
}
