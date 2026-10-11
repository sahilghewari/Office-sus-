import Phaser from 'phaser';
import {
  BASE_SPEED,
  BASE_VISION,
  EMERGENCY_RANGE,
  FURNITURE,
  INTERACT_RANGE,
  KILL_RANGES,
  LIGHTS_OUT_VISION_FACTOR,
  MAP,
  REPORT_RANGE,
  STATIONS,
  STATION_BY_ID,
  TASK_INFO,
  TICK_DT,
  TICK_MS,
  VENTS,
  VENT_BY_ID,
  VENT_RANGE,
  createColliders,
  dist,
  isInMatch,
  isMeetingPhase,
  lineOfSight,
  roomAt,
  roomName,
  stepMovement,
  type BodyView,
  type MoveState,
  type ServerMessage,
  type SnapMsg,
  type StateMsg,
  type Station,
} from '@corp/shared';
import { useGame } from '../stores/game';
import { useActions, type UseAction } from '../stores/actions';
import { useSettings } from '../stores/settings';
import type { GameConnection } from '../networking/connection';
import { audio, sfx, type Ambience } from '../audio/audio';
import { CharacterView } from './CharacterView';
import { createIncident, makeEffectTextures, playElimination, sparkle, ventPuff } from './effects';
import { HH, HW, WORLD_H, WORLD_W, ZH, depthOf, iso, screenToWorld } from './iso';
import { buildPieces, drawFloor, makeFxTextures, type Piece } from './officeArt';
import { moveIntent } from './input';

interface Sample {
  t: number;
  x: number;
  y: number;
  a: number;
}

const INTERP_DELAY = 110;

export class OfficeScene extends Phaser.Scene {
  private conn!: GameConnection;
  private cols = createColliders();
  private chars = new Map<string, CharacterView>();
  private buffers = new Map<string, Sample[]>();
  private visibleIds = new Set<string>();
  // local prediction
  private pred: MoveState = { x: 16, y: 34, vx: 0, vy: 0 };
  private prevPred: MoveState = { ...this.pred };
  private hasServerPos = false;
  private acc = 0;
  private seq = 0;
  private pending: { seq: number; mx: number; my: number }[] = [];
  private err = { x: 0, y: 0 };
  private renderPos = { x: 16, y: 34 };
  // world objects
  private pieces: { img: Phaser.GameObjects.Image; piece: Piece; cx: number; cy: number; depth: number }[] = [];
  private bodies = new Map<string, Phaser.GameObjects.Container>();
  private bodyData = new Map<string, BodyView>();
  private markers: Phaser.GameObjects.GameObject[] = [];
  private markerKey = '';
  private lockBars: Phaser.GameObjects.Image[] = [];
  private beacons: Phaser.GameObjects.Image[] = [];
  private leds: { img: Phaser.GameObjects.Image; base: number }[] = [];
  private glows: Phaser.GameObjects.Image[] = [];
  private emergencyBtn!: Phaser.GameObjects.Image;
  private darkness!: Phaser.GameObjects.Image;
  private darkRects: Phaser.GameObjects.Rectangle[] = [];
  private redTint!: Phaser.GameObjects.Rectangle;
  private prompt!: Phaser.GameObjects.Text;
  private camTarget = { x: 0, y: 0 };
  private freeCam: { x: number; y: number } | null = null;
  private zoom = 1.5;
  private unsub: (() => void)[] = [];
  private lastActionsAt = 0;
  private lastFootstep = 0;
  private lastAmbienceAt = 0;
  private elimPlaying = new Set<string>();
  private prevState: StateMsg | null = null;
  private fpsText: Phaser.GameObjects.Text | null = null;

  constructor() {
    super('office');
  }

  init(data: { conn: GameConnection }) {
    this.conn = data.conn;
  }

  create() {
    const quality = useSettings.getState().quality;
    // --- textures
    for (const [k, cv] of Object.entries(makeFxTextures())) if (!this.textures.exists(`fx-${k}`)) this.textures.addCanvas(`fx-${k}`, cv);
    makeEffectTextures(this);
    if (!this.textures.exists('floor')) this.textures.addCanvas('floor', drawFloor(quality));
    this.add.image(0, 0, 'floor').setOrigin(0, 0).setDepth(-1_000_000);

    // --- static pieces (walls + furniture)
    const pieces = buildPieces();
    let n = 0;
    for (const p of pieces) {
      const key = `piece-${p.canvas.dataset.k ?? (p.canvas.dataset.k = String(n++))}`;
      if (!this.textures.exists(key)) this.textures.addCanvas(key, p.canvas);
      const img = this.add.image(p.sx, p.sy, key).setOrigin(0, 0);
      const depth = depthOf(p.depthX, p.depthY);
      img.setDepth(depth);
      this.pieces.push({ img, piece: p, cx: p.sx + p.canvas.width / 2, cy: p.sy + p.canvas.height, depth });
    }

    this.buildAnimatedDetails(quality);

    // --- lock bars over lockable doors
    for (const [doorId, boxes] of MAP.lockColliders) {
      void doorId;
      for (const b of boxes) {
        const [sx, sy] = iso((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, 0);
        const img = this.add.image(sx, sy, 'fx-lockBar').setOrigin(0.5, 0.85).setDepth(depthOf((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2) + 1).setVisible(false);
        img.setScale(b.x1 - b.x0 > b.y1 - b.y0 ? 1 : -1, 1);
        this.lockBars.push(img);
      }
    }

    // --- darkness / vision
    this.makeVisionTexture();
    this.darkness = this.add.image(0, 0, 'vision').setDepth(8_800_000).setOrigin(0.5);
    for (let i = 0; i < 4; i++) this.darkRects.push(this.add.rectangle(0, 0, 10, 10, 0x05061a, 0.93).setOrigin(0, 0).setDepth(8_800_000));
    this.redTint = this.add.rectangle(0, 0, 4000, 3000, 0xff2030, 0).setScrollFactor(0).setDepth(8_850_000).setOrigin(0, 0);
    this.prompt = this.add
      .text(0, 0, '', { fontFamily: 'Fredoka', fontSize: '13px', fontStyle: '700', color: '#141a3d', backgroundColor: '#ffd23f', padding: { x: 8, y: 4 }, resolution: 2 })
      .setOrigin(0.5, 1)
      .setDepth(9_100_000)
      .setVisible(false);

    // --- camera
    const cam = this.cameras.main;
    cam.setBounds(0, 0, WORLD_W, WORLD_H);
    cam.setZoom(this.zoom);
    cam.setBackgroundColor('#0b0f2b');
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => {
      this.zoom = Phaser.Math.Clamp(this.zoom * (dy > 0 ? 0.9 : 1.1), 0.8, 2.6);
      cam.setZoom(this.zoom);
    });
    // spectators can drag the camera
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!p.isDown || !this.isSpectating()) return;
      if (!this.freeCam) this.freeCam = { x: cam.midPoint.x, y: cam.midPoint.y };
      this.freeCam.x -= (p.x - p.prevPosition.x) / cam.zoom;
      this.freeCam.y -= (p.y - p.prevPosition.y) / cam.zoom;
    });

    // --- networking
    this.unsub.push(this.conn.onSnap((m) => this.onSnap(m)));
    this.unsub.push(this.conn.onEvent((m) => this.onEvent(m)));
    this.unsub.push(useGame.subscribe((s) => s.state !== this.prevState && this.onState(s.state)));
    this.onState(useGame.getState().state);
    this.events.once('shutdown', () => this.cleanup());
    this.events.once('destroy', () => this.cleanup());
    if (useSettings.getState().showFps) this.fpsText = this.add.text(8, 8, '', { fontFamily: 'monospace', fontSize: '12px', color: '#3ddc97' }).setScrollFactor(0).setDepth(9_999_999);
  }

  private cleanup() {
    this.unsub.forEach((u) => u());
    this.unsub = [];
    for (const c of this.chars.values()) c.destroy();
    this.chars.clear();
    audio.setAmbience('none');
  }

  // -------------------------------------------------------------------------
  // World details
  // -------------------------------------------------------------------------

  private buildAnimatedDetails(quality: 'high' | 'low') {
    const high = quality === 'high';
    for (const f of FURNITURE) {
      const z = f.z ?? 0.8;
      if (f.kind === 'serverRack' || f.kind === 'networkRack') {
        const count = high ? 6 : 3;
        for (let i = 0; i < count; i++) {
          const u = 0.15 + ((i * 37) % 70) / 100;
          const v = 0.15 + ((i * 53) % 75) / 100;
          const [sx, sy] = iso(f.x + u * f.w, f.y + f.h, z * (1 - v));
          const img = this.add.image(sx, sy, 'fx-led').setDepth(depthOf(f.x + f.w / 2, f.y + f.h / 2) + 2).setTint([0x3ddc97, 0x2ee6f0, 0xffd23f][i % 3]);
          this.leds.push({ img, base: [0x3ddc97, 0x2ee6f0, 0xffd23f][i % 3] });
          this.tweens.add({ targets: img, alpha: 0.15, duration: 200 + ((i * 97) % 900), yoyo: true, repeat: -1, delay: (i * 131) % 700 });
        }
      }
      if (high && (f.kind === 'desk' && f.variant?.endsWith('-s'))) {
        for (const off of [0.41, 1.07]) {
          const [sx, sy] = iso(f.x + off, f.y + 0.24, 0.85);
          const g = this.add.image(sx, sy, 'fx-glow').setTint(0x2ee6f0).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.22).setScale(0.55, 0.4).setDepth(depthOf(f.x + f.w / 2, f.y + f.h / 2) + 3);
          this.glows.push(g);
          this.tweens.add({ targets: g, alpha: 0.1, duration: 1800 + Math.random() * 1200, yoyo: true, repeat: -1 });
        }
      }
      if (f.kind === 'coffeeMachine' && high) {
        const [sx, sy] = iso(f.x + f.w / 2, f.y + 0.7, 1.15);
        this.time.addEvent({
          delay: 450,
          loop: true,
          callback: () => {
            const s = this.add.image(sx + Phaser.Math.Between(-3, 3), sy, 'fx-steam').setDepth(depthOf(f.x + 1, f.y + 1) + 5).setAlpha(0.6).setScale(0.6);
            this.tweens.add({ targets: s, y: sy - 40, x: s.x + Phaser.Math.Between(-8, 8), alpha: 0, scale: 1.4, duration: 1600, onComplete: () => s.destroy() });
          },
        });
      }
      if ((f.kind === 'neonSign' || f.kind === 'logoWall' || f.kind === 'tv' || f.kind === 'bigScreen' || f.kind === 'arcade' || f.kind === 'monitorWall') && high) {
        const [sx, sy] = iso(f.x + f.w / 2, f.y + f.h, z * 0.6);
        const tint = f.kind === 'neonSign' || f.kind === 'arcade' ? 0xff6fb5 : f.kind === 'logoWall' ? 0x2ee6f0 : 0x6c8cff;
        const g = this.add.image(sx, sy, 'fx-glow').setTint(tint).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.16).setScale(Math.min(3, f.w * 0.55), 0.8).setDepth(depthOf(f.x + f.w / 2, f.y + f.h / 2) + 2);
        this.glows.push(g);
        this.tweens.add({ targets: g, alpha: 0.12, duration: f.kind === 'neonSign' ? 90 : 2200, yoyo: true, repeat: -1, repeatDelay: f.kind === 'neonSign' ? 3000 : 0 });
      }
    }
    // Emergency button on the conference table
    const [ex, ey] = iso(32, 19, 0.56);
    this.emergencyBtn = this.add.image(ex, ey, 'fx-emergency').setOrigin(0.5, 0.8).setDepth(depthOf(32, 19) + 5);
    const eg = this.add.image(ex, ey - 6, 'fx-glow').setTint(0xff3040).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.4).setDepth(depthOf(32, 19) + 6);
    this.tweens.add({ targets: eg, alpha: 0.1, scale: 1.4, duration: 900, yoyo: true, repeat: -1 });
    // Alarm beacons (shown during critical sabotage)
    for (const st of STATIONS.filter((s) => s.kind === 'fix' && (s.fix === 'fireA' || s.fix === 'fireB' || s.fix === 'serverA' || s.fix === 'serverB'))) {
      const [bx, by] = iso(st.x, st.y, 1.7);
      this.beacons.push(this.add.image(bx, by, 'fx-beacon').setDepth(8_700_000).setBlendMode(Phaser.BlendModes.ADD).setVisible(false).setScale(2));
    }
  }

  private makeVisionTexture() {
    if (this.textures.exists('vision')) return;
    const w = 1024;
    const h = 512;
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const c = cv.getContext('2d')!;
    c.fillStyle = 'rgba(5,6,26,0.93)';
    c.fillRect(0, 0, w, h);
    c.globalCompositeOperation = 'destination-out';
    c.save();
    c.translate(w / 2, h / 2);
    c.scale(1, 0.5);
    const g = c.createRadialGradient(0, 0, 0, 0, 0, w / 2);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(0.72, 'rgba(0,0,0,1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.beginPath();
    c.arc(0, 0, w / 2, 0, Math.PI * 2);
    c.fill();
    c.restore();
    this.textures.addCanvas('vision', cv);
  }

  // -------------------------------------------------------------------------
  // Server state
  // -------------------------------------------------------------------------

  private myId(): string | null {
    return useGame.getState().state?.you.id ?? null;
  }

  private isSpectating(): boolean {
    const s = useGame.getState().state;
    return !!s?.you.spectator;
  }

  private onState(s: StateMsg | null) {
    const prev = this.prevState;
    this.prevState = s;
    if (!s) return;
    // characters for every listed player
    for (const p of s.players) {
      let c = this.chars.get(p.id);
      if (!c) {
        c = new CharacterView(this, p.id, p.appearance, p.name, p.id === s.you.id);
        this.chars.set(p.id, c);
        if (p.id !== s.you.id) c.container.setAlpha(0);
      } else c.setAppearance(p.appearance, p.name);
      c.setTeammateMarker(p.id !== s.you.id && p.role === 'manager' && s.you.role === 'manager' && s.phase !== 'GAME_OVER');
      c.setSpeaking(!!useGame.getState().voice.speaking.includes(p.id));
    }
    for (const [id, c] of this.chars) {
      if (!s.players.some((p) => p.id === id)) {
        c.destroy();
        this.chars.delete(id);
        this.buffers.delete(id);
      }
    }
    // phase changes: drop stale prediction so teleports snap cleanly
    if (!prev || prev.phase !== s.phase) {
      this.pending = [];
      this.hasServerPos = false;
      if (s.phase === 'ACTIVE' && prev?.phase === 'ROLE_REVEAL') this.freeCam = null;
      if (s.phase === 'WAITING') {
        for (const b of this.bodies.values()) b.destroy();
        this.bodies.clear();
      }
    }
    // doors
    const locked = !!s.doorsLockedUntil;
    for (const [doorId, boxes] of MAP.lockColliders) this.cols.setDynamic(doorId, locked ? boxes : null);
    this.lockBars.forEach((b) => b.setVisible(locked));
    if (locked && !prev?.doorsLockedUntil) sfx('doorLock');
    // sabotage visuals
    const sab = s.sabotage;
    const critical = !!sab?.critical && s.phase === 'ACTIVE';
    this.beacons.forEach((b) => b.setVisible(critical));
    if (critical) audio.startAlarm();
    else audio.stopAlarm();
    const power = sab?.kind === 'power' && s.phase === 'ACTIVE';
    const outage = sab?.kind === 'outage' || sab?.kind === 'server';
    this.glows.forEach((g) => g.setVisible(!power).setTint(outage ? 0xff3040 : g.tintTopLeft));
    this.leds.forEach((l) => l.img.setTint(sab?.kind === 'server' ? 0xff3040 : l.base));
    this.markerKey = '';
  }

  private onEvent(m: ServerMessage) {
    switch (m.t) {
      case 'elim': {
        const [sx, sy] = iso(m.x, m.y);
        const victim = this.chars.get(m.victimId);
        this.elimPlaying.add(m.victimId);
        sfx('elim');
        void playElimination(this, sx, sy, m.variant, victim?.container ?? null, useSettings.getState().reducedMotion).then(() => {
          this.elimPlaying.delete(m.victimId);
          if (victim) victim.container.setAlpha(m.victimId === this.myId() ? 1 : 0);
        });
        break;
      }
      case 'ventFx': {
        const v = VENT_BY_ID[m.vent];
        const [sx, sy] = iso(v.x, v.y);
        ventPuff(this, sx, sy);
        sfx('vent');
        break;
      }
      case 'taskResult':
        if (m.ok) {
          const [sx, sy] = iso(this.renderPos.x, this.renderPos.y);
          sparkle(this, sx, sy - 40);
        }
        break;
      default:
        break;
    }
  }

  private onSnap(m: SnapMsg) {
    const now = performance.now();
    const myId = this.myId();
    const seen = new Set<string>();
    for (const p of m.p) {
      seen.add(p.i);
      let buf = this.buffers.get(p.i);
      if (!buf) {
        buf = [];
        this.buffers.set(p.i, buf);
      }
      const last = buf[buf.length - 1];
      // teleport (meeting respawn / vent): reset the buffer instead of sliding
      if (last && Math.hypot(last.x - p.x, last.y - p.y) > 3) buf.length = 0;
      buf.push({ t: now, x: p.x, y: p.y, a: p.a });
      if (buf.length > 30) buf.splice(0, buf.length - 30);
    }
    this.visibleIds = seen;
    // bodies
    const bodyIds = new Set(m.b.map((b) => b.id));
    for (const b of m.b) {
      this.bodyData.set(b.id, b);
      if (!this.bodies.has(b.id)) {
        const s = useGame.getState().state;
        const victim = s?.players.find((p) => p.id === b.victimId);
        const [sx, sy] = iso(b.x, b.y);
        const delay = this.elimPlaying.has(b.victimId) ? 900 : 0;
        const c = createIncident(this, sx, sy, depthOf(b.x, b.y) - 1, b.variant, victim?.appearance ?? null, victim?.name ?? '???');
        c.setAlpha(0);
        this.tweens.add({ targets: c, alpha: 1, delay, duration: 300 });
        this.bodies.set(b.id, c);
      }
    }
    for (const [id, c] of this.bodies) {
      if (!bodyIds.has(id)) {
        c.destroy();
        this.bodies.delete(id);
        this.bodyData.delete(id);
      }
    }
    // reconcile local prediction
    if (m.me && myId) {
      const [x, y, vx, vy] = m.me;
      this.pending = this.pending.filter((p) => p.seq > m.ack);
      let s: MoveState = { x, y, vx, vy };
      const speed = this.mySpeed();
      const ghost = this.amGhost();
      for (const p of this.pending) s = stepMovement(s, p.mx, p.my, speed, TICK_DT, this.cols, ghost);
      const dx = this.pred.x - s.x;
      const dy = this.pred.y - s.y;
      if (!this.hasServerPos || Math.hypot(dx, dy) > 2.5) {
        this.pred = { ...s };
        this.prevPred = { ...s };
        this.err = { x: 0, y: 0 };
        this.hasServerPos = true;
      } else if (Math.hypot(dx, dy) > 0.001) {
        // keep the visual where it was and ease the correction in
        this.err.x += dx;
        this.err.y += dy;
        this.prevPred = { ...this.prevPred, x: this.prevPred.x - dx, y: this.prevPred.y - dy };
        this.pred = s;
      }
    }
  }

  private mySpeed(): number {
    const s = useGame.getState().state;
    if (!s) return BASE_SPEED;
    return BASE_SPEED * s.settings.playerSpeed * (this.amGhost() ? 1.15 : 1);
  }

  private amGhost(): boolean {
    const s = useGame.getState().state;
    return !!s && isInMatch(s.phase) && !s.you.alive;
  }

  private canMove(): boolean {
    const g = useGame.getState();
    const s = g.state;
    if (!s || s.you.spectator) return false;
    if (!(s.phase === 'WAITING' || s.phase === 'ACTIVE' || s.phase === 'GAME_OVER')) return false;
    if (s.you.inVent) return false;
    if (g.task || g.fix || g.cctv || g.mapOpen || g.settingsOpen || g.customizeOpen || g.sabotageOpen) return false;
    if (g.died && Date.now() - g.died.at < 2500) return false;
    return true;
  }

  // -------------------------------------------------------------------------
  // Frame loop
  // -------------------------------------------------------------------------

  override update(_time: number, delta: number) {
    const dt = Math.min(delta, 100);
    const g = useGame.getState();
    const s = g.state;
    if (!s) return;
    const myId = s.you.id;

    // --- fixed-step local simulation (matches the server tick)
    this.acc += dt;
    while (this.acc >= TICK_MS) {
      this.acc -= TICK_MS;
      this.fixedStep();
    }
    const alpha = this.acc / TICK_MS;
    const k = Math.min(1, dt / 90);
    this.err.x -= this.err.x * k;
    this.err.y -= this.err.y * k;
    this.renderPos.x = this.prevPred.x + (this.pred.x - this.prevPred.x) * alpha + this.err.x;
    this.renderPos.y = this.prevPred.y + (this.pred.y - this.prevPred.y) * alpha + this.err.y;

    // --- characters
    const renderT = performance.now() - INTERP_DELAY;
    const over = s.phase === 'GAME_OVER';
    const winners = new Set(s.gameOver?.players.filter((p) => p.won).map((p) => p.id) ?? []);
    for (const [id, c] of this.chars) {
      if (this.elimPlaying.has(id)) continue; // the elimination tween owns this sprite right now
      if (id === myId) {
        if (s.you.spectator) {
          c.container.setVisible(false);
          c.label.setVisible(false);
          continue;
        }
        const [sx, sy] = iso(this.renderPos.x, this.renderPos.y);
        c.mode = over ? (winners.has(id) ? 'cheer' : 'sad') : this.amGhost() ? 'ghost' : g.task || g.fix?.station ? 'working' : 'normal';
        c.visibleTarget = !s.you.inVent;
        c.update(sx, sy, depthOf(this.renderPos.x, this.renderPos.y) + 1, dt);
        continue;
      }
      const buf = this.buffers.get(id);
      if (!buf || !buf.length) {
        c.visibleTarget = false;
        c.update(c.container.x, c.container.y, c.container.depth, dt, false);
        continue;
      }
      let x = buf[buf.length - 1].x;
      let y = buf[buf.length - 1].y;
      let a = buf[buf.length - 1].a;
      for (let i = buf.length - 1; i > 0; i--) {
        const b0 = buf[i - 1];
        const b1 = buf[i];
        if (b0.t <= renderT && b1.t >= renderT) {
          const t = (renderT - b0.t) / Math.max(1, b1.t - b0.t);
          x = b0.x + (b1.x - b0.x) * t;
          y = b0.y + (b1.y - b0.y) * t;
          a = b1.a;
          break;
        }
        if (i === 1 && renderT < b0.t) {
          x = b0.x;
          y = b0.y;
        }
      }
      c.mode = over ? (winners.has(id) ? 'cheer' : 'sad') : a === 2 ? 'ghost' : a === 1 ? 'working' : 'normal';
      c.visibleTarget = this.visibleIds.has(id);
      const [sx, sy] = iso(x, y);
      c.update(sx, sy, depthOf(x, y) + 1, dt, c.visibleTarget);
    }

    // --- camera
    const cam = this.cameras.main;
    let target: [number, number];
    if (s.you.spectator) {
      const follow = g.spectateTarget ? this.chars.get(g.spectateTarget) : null;
      if (this.freeCam && !follow) target = [this.freeCam.x, this.freeCam.y];
      else if (follow) target = [follow.container.x, follow.container.y - 30];
      else target = iso(32, 19);
      const [mx, my] = moveIntent();
      if (mx || my) {
        if (!this.freeCam) this.freeCam = { x: cam.midPoint.x, y: cam.midPoint.y };
        this.freeCam.x += mx * dt * 0.6;
        this.freeCam.y += my * dt * 0.6;
        useGame.getState().set({ spectateTarget: null });
      }
    } else {
      const [sx, sy] = iso(this.renderPos.x, this.renderPos.y);
      target = [sx, sy - 30];
    }
    if (!this.camTarget.x) this.camTarget = { x: target[0], y: target[1] };
    const ck = Math.min(1, dt / 120);
    this.camTarget.x += (target[0] - this.camTarget.x) * ck;
    this.camTarget.y += (target[1] - this.camTarget.y) * ck;
    cam.centerOn(this.camTarget.x, this.camTarget.y);

    this.updateOcclusion(s);
    this.updateVision(s, cam);
    this.updateMarkers(s);
    this.updateActions(s);

    // footsteps + ambience
    const moving = Math.hypot(this.pred.vx, this.pred.vy) > 0.5;
    if (moving && !this.amGhost() && performance.now() - this.lastFootstep > 290) {
      this.lastFootstep = performance.now();
      sfx('footstep');
    }
    if (performance.now() - this.lastAmbienceAt > 600) {
      this.lastAmbienceAt = performance.now();
      const r = roomAt(this.renderPos.x, this.renderPos.y);
      const amb: Ambience = isMeetingPhase(s.phase) ? 'none' : r === 'server' || r === 'it' ? 'server' : r === 'cafeteria' ? 'cafeteria' : r === 'gaming' ? 'gaming' : r === 'maintenance' ? 'maintenance' : 'office';
      audio.setAmbience(amb);
    }
    if (this.fpsText) this.fpsText.setText(`${Math.round(this.game.loop.actualFps)} fps`);
  }

  private fixedStep() {
    this.prevPred = { ...this.pred };
    if (!this.hasServerPos) return;
    let mx = 0;
    let my = 0;
    if (this.canMove()) {
      const [sx, sy] = moveIntent();
      [mx, my] = screenToWorld(sx, sy);
    }
    const idle = mx === 0 && my === 0 && this.pred.vx === 0 && this.pred.vy === 0;
    if (idle) return;
    this.seq++;
    this.pred = stepMovement(this.pred, mx, my, this.mySpeed(), TICK_DT, this.cols, this.amGhost());
    this.pending.push({ seq: this.seq, mx, my });
    if (this.pending.length > 60) this.pending.shift();
    this.conn.send({ t: 'input', seq: this.seq, mx: Math.round(mx * 1000) / 1000, my: Math.round(my * 1000) / 1000 });
  }

  /** Walls and tall furniture fade when they hide the local player. */
  private updateOcclusion(s: StateMsg) {
    if (s.you.spectator) {
      for (const p of this.pieces) p.img.setAlpha(1);
      return;
    }
    const [px, py] = iso(this.renderPos.x, this.renderPos.y);
    const myDepth = depthOf(this.renderPos.x, this.renderPos.y);
    for (const p of this.pieces) {
      if (!p.piece.tall) continue;
      let target = 1;
      if (p.depth > myDepth) {
        const dx = Math.abs(p.cx - px);
        const dy = p.cy - py;
        if (dx < p.piece.canvas.width / 2 + 26 && dy > -10 && dy < 120) target = 0.28;
      }
      const a = p.img.alpha + (target - p.img.alpha) * 0.2;
      p.img.setAlpha(a);
    }
  }

  private updateVision(s: StateMsg, cam: Phaser.Cameras.Scene2D.Camera) {
    const dark = isInMatch(s.phase) && !isMeetingPhase(s.phase) && s.you.alive && !s.you.spectator && s.phase !== 'ROLE_REVEAL';
    this.darkness.setVisible(dark);
    this.darkRects.forEach((r) => r.setVisible(dark));
    const power = s.sabotage?.kind === 'power' && s.phase === 'ACTIVE';
    const lightsOut = power && s.you.role !== 'manager';
    const reduced = useSettings.getState().reducedMotion;
    this.redTint.setFillStyle(0xff2030, power ? (reduced ? 0.06 : 0.05 + Math.sin(performance.now() / 600) * 0.03) : 0);
    if (!dark) return;
    const base = BASE_VISION * (s.you.role === 'manager' ? s.settings.managerVision : s.settings.employeeVision) * (lightsOut ? LIGHTS_OUT_VISION_FACTOR : 1);
    // iso circle of radius r → ellipse half-width r·HW·√2; the texture's clear core is 72% of its half-width
    const halfW = (base * HW * Math.SQRT2) / 0.86;
    const [sx, sy] = iso(this.renderPos.x, this.renderPos.y);
    const w = halfW * 2;
    const h = w / 2;
    this.darkness.setPosition(sx, sy - 10).setDisplaySize(w, h).setAlpha(1);
    const view = cam.worldView;
    const pad = 400;
    const L = sx - w / 2;
    const R = sx + w / 2;
    const T = sy - 10 - h / 2;
    const B = sy - 10 + h / 2;
    const vx0 = view.x - pad;
    const vy0 = view.y - pad;
    const vx1 = view.right + pad;
    const vy1 = view.bottom + pad;
    this.darkRects[0].setPosition(vx0, vy0).setSize(vx1 - vx0, Math.max(0, T - vy0));
    this.darkRects[1].setPosition(vx0, B).setSize(vx1 - vx0, Math.max(0, vy1 - B));
    this.darkRects[2].setPosition(vx0, T).setSize(Math.max(0, L - vx0), h);
    this.darkRects[3].setPosition(R, T).setSize(Math.max(0, vx1 - R), h);
    const dk = lightsOut ? 0.97 : 0.93;
    this.darkRects.forEach((r) => r.setFillStyle(0x05061a, dk));
  }

  /** Floor rings + bobbing chevrons over my task / repair stations. */
  private updateMarkers(s: StateMsg) {
    const active = s.phase === 'ACTIVE';
    const tasks = active ? s.you.tasks.filter((t) => !t.done).map((t) => t.stationId) : [];
    const fixes: string[] = [];
    if (active && s.sabotage && s.you.alive) {
      for (const st of STATIONS) if (st.kind === 'fix' && st.fix && s.sabotage.pending.includes(st.fix)) fixes.push(st.id);
    }
    if (active && s.doorsLockedUntil && s.you.alive) fixes.push('fix-doors');
    const key = `${tasks.join(',')}|${fixes.join(',')}`;
    if (key === this.markerKey) return;
    this.markerKey = key;
    this.markers.forEach((m) => m.destroy());
    this.markers = [];
    const mk = (st: Station, tint: number) => {
      const [sx, sy] = iso(st.x, st.y);
      const ring = this.add.image(sx, sy, 'fx-ring').setTint(tint).setDepth(depthOf(st.x, st.y) - 50).setScale(0.55);
      this.tweens.add({ targets: ring, scale: 0.7, alpha: 0.4, duration: 900, yoyo: true, repeat: -1 });
      const chev = this.add.image(sx, sy - 76, 'fx-chevron').setTint(tint).setDepth(8_700_000).setScale(0.8);
      this.tweens.add({ targets: chev, y: sy - 86, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      this.markers.push(ring, chev);
    };
    for (const id of new Set(tasks)) mk(STATION_BY_ID[id], 0xffd23f);
    for (const id of fixes) mk(STATION_BY_ID[id], 0xff4050);
  }

  private disabledReason(s: StateMsg, st: Station): string | undefined {
    const k = s.sabotage?.kind;
    if (k === 'outage' && (st.electronic || st.kind === 'cctv')) return 'System outage';
    if (k === 'wifi' && (st.network || st.taskType === 'wifi')) return 'Wi-Fi down';
    if (k === 'cctv' && st.kind === 'cctv') return 'Cameras offline';
    return undefined;
  }

  private updateActions(s: StateMsg) {
    const now = performance.now();
    if (now - this.lastActionsAt < 100) return;
    this.lastActionsAt = now;
    const x = this.renderPos.x;
    const y = this.renderPos.y;
    let use: UseAction | null = null;
    let report: { bodyId: string; name: string } | null = null;
    let kill: { targetId: string; name: string } | null = null;
    const active = s.phase === 'ACTIVE' && !s.you.spectator;
    if (active && !s.you.inVent) {
      let best = Infinity;
      const consider = (a: UseAction, d: number) => {
        if (d < best) {
          best = d;
          use = a;
        }
      };
      for (const t of s.you.tasks) {
        if (t.done) continue;
        if (!s.you.alive && s.you.role === 'manager') continue;
        const st = STATION_BY_ID[t.stationId];
        const d = dist(x, y, st.x, st.y);
        if (d <= INTERACT_RANGE) consider({ kind: 'task', id: st.id, label: TASK_INFO[t.type].title, disabled: this.disabledReason(s, st) }, d);
      }
      if (s.you.alive) {
        for (const st of STATIONS) {
          if (st.kind === 'fix' && st.fix) {
            const relevant = st.fix === 'doorsOverride' ? !!s.doorsLockedUntil : !!s.sabotage?.pending.includes(st.fix);
            if (!relevant) continue;
            const d = dist(x, y, st.x, st.y);
            if (d <= INTERACT_RANGE) consider({ kind: 'fix', id: st.id, label: `Repair: ${st.name}` }, d - 0.5);
          }
          if (st.kind === 'emergency') {
            const d = dist(x, y, st.x, st.y);
            if (d <= EMERGENCY_RANGE) consider({ kind: 'emergency', id: st.id, label: 'Emergency HR Meeting', disabled: s.you.emergencyLeft <= 0 ? 'No meetings left' : s.sabotage?.critical ? 'Fix the emergency first' : undefined }, d + 0.6);
          }
        }
      }
      const cctv = STATION_BY_ID.cctv;
      const dc = dist(x, y, cctv.x, cctv.y);
      if (dc <= INTERACT_RANGE) consider({ kind: 'cctv', id: 'cctv', label: 'Security Cameras', disabled: s.cctvOnline ? undefined : 'Cameras offline' }, dc + 0.2);
      if (s.you.role === 'manager' && s.you.alive) {
        for (const v of VENTS) {
          const d = dist(x, y, v.x, v.y);
          if (d <= VENT_RANGE + 0.3) consider({ kind: 'vent', id: v.id, label: 'Maintenance Passage' }, d + 0.1);
        }
      }
      if (s.you.alive) {
        for (const [id, b] of this.bodyData) {
          if (dist(x, y, b.x, b.y) <= REPORT_RANGE) {
            const victim = s.players.find((p) => p.id === b.victimId);
            report = { bodyId: id, name: victim?.name ?? 'a coworker' };
          }
        }
      }
      if (s.you.role === 'manager' && s.you.alive) {
        const range = KILL_RANGES[s.settings.killRange];
        let bestK = Infinity;
        for (const p of s.players) {
          if (p.id === s.you.id || s.you.teammates.includes(p.id) || !this.visibleIds.has(p.id)) continue;
          const buf = this.buffers.get(p.id);
          const last = buf?.[buf.length - 1];
          if (!last || last.a === 2) continue;
          const d = dist(x, y, last.x, last.y);
          if (d <= range && d < bestK && lineOfSight(x, y, last.x, last.y)) {
            bestK = d;
            kill = { targetId: p.id, name: p.name };
          }
        }
      }
    }
    const room = roomName(roomAt(x, y));
    useActions.getState().set({ use, report, kill, room, myPos: [x, y] });
    // floating prompt over the current interactable
    const u = use as UseAction | null;
    if (u && !useGame.getState().task && !useGame.getState().fix) {
      const st = u.kind === 'vent' ? VENT_BY_ID[u.id] : STATION_BY_ID[u.id];
      const [sx, sy] = iso(st.x, st.y, 1.9);
      this.prompt.setText(u.disabled ? `⛔ ${u.disabled}` : `E · ${u.label}`).setPosition(sx, sy).setVisible(true);
      this.prompt.setBackgroundColor(u.disabled ? '#ef3e4a' : u.kind === 'fix' || u.kind === 'emergency' ? '#ff8a3d' : '#ffd23f');
    } else this.prompt.setVisible(false);
  }
}

// keep projection constants referenced for tree-shakers
void HH;
void ZH;
