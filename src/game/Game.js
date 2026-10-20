// Oyun orkestratörü: tüm modülleri kurar (aşamalı, hata yönetimli), olayları bağlar ve her kare sistemleri çalıştırır.
import * as THREE from 'three';
import { Renderer } from '../render/Renderer.js';
import { Atmosphere } from '../render/Atmosphere.js';
import { CityMaterials } from '../render/CityChunk.js';
import { CameraRig } from '../render/CameraRig.js';
import { Fx } from '../render/Fx.js';
import { Input } from '../core/Input.js';
import { Stats } from '../core/Stats.js';
import { World } from '../ecs/World.js';
import { PhysicsClient } from '../physics/PhysicsClient.js';
import { HDR } from '../physics/SnapshotLayout.js';
import { IN } from '../physics/InputLayout.js';
import { AiClient } from './AiClient.js';
import { StaticWorld } from './StaticWorld.js';
import { ChunkManager } from './ChunkManager.js';
import { Population } from './Population.js';
import { Player, SPAWN } from './Player.js';
import { Interaction } from './Interaction.js';
import { Missions } from './Missions.js';
import { Markers } from './Markers.js';
import { Settings, SaveGame } from './Settings.js';
import { AudioEngine } from '../audio/AudioEngine.js';
import { Hud } from '../ui/Hud.js';
import { Minimap } from '../ui/Minimap.js';
import { DebugOverlay } from '../ui/DebugOverlay.js';
import { districtOf, DISTRICT_NAMES, worldToBlock } from '../world/cityLayout.js';
import { Weapons } from './Weapons.js';
import { Assets } from '../render/AssetLoader.js';

const QUALITY_POP = { low: 0.5, medium: 0.8, high: 1 };

export class Game {
  constructor(menus) { this.menus = menus; this.paused = true; this.started = false; this.state = { money: 0 }; this.simTime = 0; this.t = 0; this.saveT = 0; this.stateT = 0; this.waypoint = null; this.mapOpen = false; this.debug = false; this.eventLog = []; }

  async init(canvas, uiRoot, hudRoot, stage) {
    const S = Settings.load(); this.quality = { name: S.quality, pop: QUALITY_POP[S.quality] ?? 0.8 };
    // ---- 1: grafikler
    stage(1, 0, 'Grafikler başlatılıyor');
    try {
      this.renderer = new Renderer(canvas, S.quality); this.atmo = new Atmosphere(this.renderer); this.mats = new CityMaterials(this.atmo);
      this.fx = new Fx(this.renderer.scene, this.renderer.camera); this.input = new Input(canvas); this.stats = new Stats(); this.interaction = new Interaction(); this.markers = new Markers(this.renderer.scene);
      this.hud = new Hud(hudRoot); this.audio = new AudioEngine(); this.overlay = new DebugOverlay(); this.ecs = new World();
      this.world = new StaticWorld(this.renderer.scene, null); this.rig = new CameraRig(this.renderer.camera, this.world); this.applySettings();
      const gl = this.renderer.gl.getContext(); if (!gl) throw new Error('WebGL kullanılamıyor');
    } catch (e) { throw Object.assign(e, { subsystem: 'Grafik (Three.js / WebGL)', stage: 1 }); }
    // ---- 2: fizik + AI
    stage(2, 0, 'Fizik motoru (Rapier WASM) ve yapay zeka başlatılıyor');
    try {
      this.physics = new PhysicsClient({ quality: S.quality }); await this.physics.init(); this.world.physics = this.physics; stage(2, 0.5);
      this.ai = new AiClient(this.physics); await this.ai.init();
    } catch (e) { throw Object.assign(e, { subsystem: 'Fizik / Yapay zeka (Web Worker)', stage: 2 }); }
    // ---- 3: dünya
    stage(3, 0, 'Şehir oluşturuluyor');
    try {
      this.world.build(); this.chunks = new ChunkManager(this); this.chunks.setQuality(S.quality); this.minimap = new Minimap(this, this.hud.mini, document.getElementById('bigmap'));
      this.chunks.preload(SPAWN.x, SPAWN.z, (f) => stage(3, f, 'Şehir parçaları yükleniyor'));
    } catch (e) { throw Object.assign(e, { subsystem: 'Dünya (şehir üretimi)', stage: 3 }); }
    // ---- 4: oyuncu + nüfus
    stage(4, 0, 'Modeller kontrol ediliyor, karakterler ve araçlar hazırlanıyor');
    try { const rep = await Assets.loadAll((f) => stage(4, f * 0.3)); if (rep.length) console.info('[model]', rep.join(', ')); } catch (e) { console.warn('[model] yükleyici hatası, prosedürel modeller kullanılıyor', e); }
    try {
      this.pop = new Population(this); const reg = this.pop.create(S.quality); this.pop.createRagdolls(S.quality === 'low' ? 4 : 8); this.player = new Player(this); this.player.create(); this.missions = new Missions(this); this.missions.install(); this.weapons = new Weapons(this);
      this.ai.register(reg); stage(4, 0.8); this._wireEvents();
    } catch (e) { throw Object.assign(e, { subsystem: 'Oyuncu / nüfus', stage: 4 }); }
    // ---- 5: başlat
    stage(5, 0, 'Simülasyon başlatılıyor');
    try {
      const started = new Promise((res, rej) => { this.physics.on('started', res); setTimeout(() => rej(new Error('Fizik simülasyonu başlamadı')), 15000); });
      this.physics.start(); await started; this.ai.start();
      this._registerSystems(); this.hud.setChar('LUCIA'); this.hud.setMoney(0); this.setHour(S.hour); this.setRain(S.rain);
      this.input.onLockChange = (l) => { if (!l && this.started && !this.menus.open && !this.mapOpen && !this.player.dead) this.menus.pause(); };
      // birkaç kare ısıt: parçalar/araçlar yerleşsin
      await new Promise((r) => setTimeout(r, 400));
    } catch (e) { throw Object.assign(e, { subsystem: 'Simülasyon başlatma', stage: 5 }); }
  }

  applySettings() { const S = Settings.data; this.rig.sens = S.sens; this.rig.baseDist = S.camDist; this.rig.invertY = S.invertY; this.audio?.applySettings(); }
  setHour(h) { this.atmo.set(h); }
  setRain(on) { this.fx.setRain(on); this.rainTarget = on ? 1 : 0; }
  setPaused(p) { this.paused = p; this.physics.pause(p); p ? this.ai.worker.postMessage({ type: 'stop' }) : this.ai.worker.postMessage({ type: 'start' }); if (p) document.exitPointerLock?.(); }
  lockPointer() { if (this.started && !this.paused) document.getElementById('game').requestPointerLock?.(); }
  toggleMap(on) {
    this.mapOpen = on ?? !this.mapOpen; const el = document.getElementById('bigmap'); el.classList.toggle('hide', !this.mapOpen); this.minimap.bigOpen = this.mapOpen;
    if (this.mapOpen) { document.exitPointerLock?.(); this.setPaused(true); } else { this.setPaused(false); this.lockPointer(); }
  }
  setWaypoint(p) {
    this.waypoint = p; this.markers.remove('wp'); if (!p) { if (!this.missions.active) this.minimap.setRoute(null, null); this.hud.toast('Hedef işareti kaldırıldı'); return; }
    this.markers.add({ id: 'wp', x: p.x, z: p.z, color: 0xff4fd8, blip: 'circle' }); this.minimap.setRoute(this.player.pos, p); this.hud.toast('Hedef işaretlendi');
  }

  // ------------------------------------------------------------------ oyun akışı
  startNew() { SaveGame.reset(); this.state.money = 0; this._begin(); }
  startContinue() {
    const r = SaveGame.read(); if (!r.ok) { this.startNew(); return; } const d = r.data; this.state.money = d.player.money; this.missions.completed = new Set(d.completed);
    this.physics.teleport(this.player.chars[d.player.char].index, [d.player.x, d.player.y + 0.5, d.player.z]); this.player.active = d.player.char; this.physics.input[IN.CHAR_INDEX] = this.player.char.index;
    if (d.player.health < 100) this.physics.damage(this.player.char.index, 100 - d.player.health, 'load');
    Settings.set('hour', d.hour); this.setHour(d.hour); this.hud.setChar(this.player.char.name); this.missions._startMarkers();
    this._begin(); if (d.active) this.missions.start(d.active.id, false);
  }
  _begin() {
    this.started = true; document.body.classList.add('playing'); this.audio.init(); this.setPaused(false); this.hud.setMoney(this.state.money); this.lockPointer(); this.hud.toast('Hoş geldin Leonida City\'ye — mavi işaretlerde görevler var (E)', 5);
    this.save(false);
  }
  save(toast) {
    if (!this.started) return false; const p = this.player, ok = SaveGame.write({ player: { x: p.pos.x, y: p.mode === 'vehicle' ? SPAWN.y : p.pos.y, z: p.pos.z, health: Math.max(1, p.health), money: this.state.money, char: p.active }, ...this.missions.state(), hour: this.atmo.hour, time: this.simTime });
    if (toast) this.hud.toast(ok ? 'Oyun kaydedildi' : 'Kaydedilemedi (depolama dolu/engelli)'); return ok;
  }
  resetSave() { SaveGame.reset(); this.hud.toast('Kayıt silindi'); }
  restartNew() { SaveGame.reset(); location.reload(); }
  explode(x, y, z, tnt) { this.physics.explode(x, y, z, tnt); }

  // ------------------------------------------------------------------ olaylar
  _wireEvents() {
    const p = this.physics, byV = new Map(this.pop.vehicles.map((v) => [v.index, v])), crime = (c, x, z, extra = {}) => this.ai.event({ type: 'crime', crime: c, x, z, ...extra });
    const player = () => this.player, pc = (i) => i === this.player.chars.lucia.index || i === this.player.chars.jason.index;
    p.on('landed', (ev) => { if (pc(ev.index) && ev.damage > 0) { this.hud.toast(`Düşme: ${ev.speed.toFixed(1)} m/s · ${(ev.energy / 1000).toFixed(1)} kJ`); this.hud.flash(); this.audio.land(ev.speed); } });
    p.on('hit', (ev) => { if (pc(ev.index)) { this.hud.flash(); this.rig.shake = Math.max(this.rig.shake, 0.6); } else { const d = this.pop.peds.find((q) => q.index === ev.index); if (d && ev.cause === 'vehicle' && ev.by === p.driven) crime(1.0, d.px, d.pz); } });
    p.on('killed', (ev) => { const d = this.pop.peds.find((q) => q.index === ev.index); if (d) { this.fx.blood(d.px, 1, d.pz); if (ev.by === p.driven || ev.cause === 'bullet') crime(1.6, d.px, d.pz); } });
    p.on('crash', (ev) => { this.ai.event({ type: 'crash', x: ev.x, z: ev.z, slot: -1 }); if (ev.driven) this.audio.crash(60000); });
    p.on('impact', (ev) => { const v = byV.get(ev.index); if (!v) return; v.vis.impact(ev.lx, ev.ly, ev.lz, ev.energy); this.pop.tmp && p.sample(ev.index, this.pop.tmp);
      const dx = this.pop.tmp.px - this.renderer.camera.position.x, dz = this.pop.tmp.pz - this.renderer.camera.position.z; if (Math.hypot(dx, dz) < 60) this.audio.crash(ev.energy); if (ev.driven) { this.rig.shake = Math.max(this.rig.shake, Math.min(1.5, ev.energy / 80000)); this.hud.flash(); }
      if (v.cop && this.player.mode === 'vehicle' && Math.hypot(dx - (this.player.pos.x - this.renderer.camera.position.x), dz - (this.player.pos.z - this.renderer.camera.position.z)) < 12 && this.t - (this._copHit ?? -9) > 3) { this._copHit = this.t; crime(1.5, this.player.pos.x, this.player.pos.z); } });
    p.on('explosion', (ev) => { this.fx.explosion(ev.x, ev.y, ev.z); const d = Math.hypot(ev.x - this.player.pos.x, ev.z - this.player.pos.z); this.audio.explosion(d); this.rig.shake = Math.max(this.rig.shake, Math.min(2, 60 / Math.max(10, d))); crime(3, ev.x, ev.z); this.ai.event({ type: 'explosion', x: ev.x, z: ev.z }); });
    p.on('bulletHit', (ev) => { this.fx.spark(ev.x, ev.y, ev.z, ev.target === 'char' ? 0x8a0f0f : 0xffd27a); if (ev.target === 'char') this.fx.blood(ev.x, ev.y, ev.z); });
    p.on('error', (m) => this.hud.toast('Fizik hatası (konsola bak)', 4));
  }

  // ------------------------------------------------------------------ sistemler (ECS sistem listesi)
  _registerSystems() {
    const g = this, add = (order, name, fn) => this.ecs.addSystem({ order, name, update: (dt) => fn.call(g, dt) });
    add(0, 'input', this.sysInput); add(1, 'physics', this.sysPhysics); add(2, 'chunks', this.sysChunks); add(3, 'population', this.sysPopulation); add(4, 'player', this.sysPlayer);
    add(5, 'missions', this.sysMissions); add(6, 'atmosphere', this.sysAtmosphere); add(7, 'audio', this.sysAudio); add(8, 'hud', this.sysHud); add(9, 'save', this.sysSave);
  }
  sysInput(dt) {
    const k = this.input; this.t += dt;
    if (k.wasPressed('KeyM') && this.started && !this.menus.open) this.toggleMap();
    if (k.wasPressed('Escape') && this.mapOpen) this.toggleMap(false);
    if (k.wasPressed('F3')) { this.debug = !this.debug; this.overlay.setVisible(this.debug); }
    if (k.wasPressed('F4')) { this.stats.startReport(10); this.hud.toast('10 sn performans raporu toplanıyor…', 10); }
    if (k.wasPressed('KeyR') && this.missions.failed && !this.paused) this.missions.restart();
    if (!this.started) { this.rig.yaw += dt * 0.12; }
  }
  sysPhysics() { this.physics.update(); this.simTime = this.physics.header[HDR.SIM_TIME]; this.world.update(this.simTime, 1 + (this.atmo.rain ?? 0) * 0.8); }
  sysChunks(dt) { const p = this.player.pos; this.chunks.update(dt, p.x, p.z, this.simTime); this.renderer.followSun({ x: p.x, y: 0, z: p.z }); }
  sysPopulation(dt) {
    this.pop.update(dt, this.renderer.camera); this.fx.update(dt); this.stateT -= dt;
    if (this.stateT <= 0 && !this.paused) { this.stateT = 0.1; const p = this.player, v = p.veh, sp = p.speed; this.pop.pushState({ x: p.pos.x, z: p.pos.z, vx: 0, vz: 0, yaw: p.yaw, inVeh: p.mode === 'vehicle', speed: sp, alive: !p.dead }); }
  }
  sysPlayer(dt) { this.player.update(dt); this.interaction.update(this.player.pos.x, this.player.pos.z, {}); }
  sysMissions(dt) { if (this.started && !this.paused) { this.missions.update(dt); this._wpCheck(); } else this.markers.update(dt); }
  _wpCheck() { if (this.waypoint && Math.hypot(this.waypoint.x - this.player.pos.x, this.waypoint.z - this.player.pos.z) < 14) { this.hud.toast('Hedefe ulaştın'); this.setWaypoint(null); } }
  sysAtmosphere(dt) {
    if (Settings.data.autoTime && !this.paused) { const h = this.atmo.hour + dt / 120; Settings.data.hour = h; this.atmo.set(h); }
    this.atmo.rain += ((this.rainTarget ?? 0) - this.atmo.rain) * Math.min(1, dt * 0.4); this.physics.setWet(this.atmo.rain); this.atmo.wet = this.atmo.rain;
    this._atT = (this._atT ?? 0) - dt; if (this._atT <= 0) { this._atT = 0.5; this.atmo.set(this.atmo.hour); }
  }
  sysAudio(dt) {
    const p = this.player, v = p.veh, st = { inVeh: p.mode === 'vehicle', rpm: 0, load: 0, slip: 0, speed: p.speed, rain: this.atmo.rain > 0.3, cops: 0, copDist: 999, others: [] };
    if (v) { const tl = this.physics.tele(v.index); st.rpm = tl.rpm; st.slip = tl.slip; st.load = Math.min(1, this.physics.input[IN.THROTTLE] ?? 0); }
    const cam = this.renderer.camera.position, t = this.pop.tmp, others = [];
    for (const q of this.pop.vehicles) { if (q === v) continue; this.physics.sample(q.index, t); if (t.flags & 8) continue; const dx = t.px - p.pos.x, dz = t.pz - p.pos.z, d = Math.hypot(dx, dz); if (q.cop && this.ai.wanted.level > 0 && d < 200) { st.cops++; st.copDist = Math.min(st.copDist, d); } if (d < 70) { const sp = q.speed ?? 0; const yaw = Math.atan2(2 * (t.qw * t.qy + t.qx * t.qz), 1 - 2 * (t.qx * t.qx + t.qy * t.qy)); const vr = ((-Math.sin(yaw) * sp) * dx + (-Math.cos(yaw) * sp) * dz) / Math.max(d, 1) * -1; others.push({ dist: d, vr, pan: dx * Math.cos(this.rig.yaw) - dz * Math.sin(this.rig.yaw) > 0 ? Math.min(1, Math.abs(dx) / 30) : -Math.min(1, Math.abs(dx) / 30), rpm: q.rpm ?? 1500 }); } }
    others.sort((a, b) => a.dist - b.dist); st.others = others.slice(0, 3); this.audio.update(dt, st);
  }
  sysHud(dt) {
    const h = this.hud, p = this.player, S = Settings.data; h.tick(dt);
    h.setHealth(p.health ?? 100); h.setStamina(p.stamina ?? 1); h.setMoney(this.state.money); h.setWanted(this.ai.wanted.level, this.ai.wanted.searching, this.t);
    const [bi, bj] = worldToBlock(p.pos.x, p.pos.z), hr = this.atmo.hour, hh = Math.floor(hr), mm = Math.floor((hr - hh) * 60); h.setDistrict(`${DISTRICT_NAMES[districtOf(bi, bj)]} · ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}${this.atmo.rain > 0.3 ? ' · yağmur' : ''}`);
    if (p.mode === 'vehicle') { const tl = this.physics.tele(p.veh.index), sp = p.veh.vis.spec; h.setSpeedo(Math.abs(tl.speed) * 3.6, tl.gear, tl.rpm / sp.engine.redline, tl.health, this.physics.input[IN.ABS] !== 0.0001, this.physics.input[IN.TCS] !== 0.0001); }
    h.setWeapon(this.weapons?.label(p) ?? null); h.setCross(!!p.aiming);
    this.interaction.update(p.pos.x, p.pos.z, {}); h.setPrompt(this.paused ? '' : this.interaction.prompt({}));
    // hedef oku: görev hedefi ya da hedef işareti
    const tgt = this.missions.active?.target ?? this.waypoint; if (tgt) { const dx = tgt.x - p.pos.x, dz = tgt.z - p.pos.z, d = Math.hypot(dx, dz), y = this.rig.yaw, side = (dx * Math.cos(y) - dz * Math.sin(y)) / d, fw = (-dx * Math.sin(y) - dz * Math.cos(y)) / d; h.setArrow(Math.atan2(side, fw), d); } else h.setArrow(null);
    // minimap
    const blips = this.markers.blips(); const t = this.pop.tmp;
    for (const v of this.pop.vehicles) { this.physics.sample(v.index, t); if (t.flags & 8) continue; const d = Math.hypot(t.px - p.pos.x, t.pz - p.pos.z); if (v.cop && this.ai.wanted.level > 0) blips.push({ x: t.px, z: t.pz, color: Math.floor(this.t * 4) % 2 ? '#ff3030' : '#3a6aff', shape: 'tri', size: 6, edge: true }); else if (d < 130 && v !== p.veh) blips.push({ x: t.px, z: t.pz, color: '#cfd3d8', shape: 'square', size: 3 }); }
    this.minimap.draw(p.pos, this.rig.yaw, blips, this.waypoint);
    const fps = this.stats.fps; if (S.fps) h.setFps(`${fps.toFixed(0)} FPS · ${this.stats.frameMs.toFixed(1)} ms · fizik ${this.physics.header[HDR.PHYS_MS_AVG].toFixed(2)} ms`); else h.setFps(null);
    if (this.debug) this.overlay.update(dt, this);
  }
  sysSave(dt) { if (!this.started || this.paused) return; this.saveT += dt; if (this.saveT > 25) { this.saveT = 0; this.save(false); } }
}
