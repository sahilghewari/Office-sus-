import { useSettings } from '../stores/settings';

/**
 * Fully procedural, original audio: every sound effect and music loop is
 * synthesised with the Web Audio API at runtime (no sample files, no licensing).
 * The context is created lazily on the first user gesture, as browsers require.
 */

export type SfxName =
  | 'click'
  | 'hover'
  | 'open'
  | 'taskDone'
  | 'error'
  | 'chat'
  | 'footstep'
  | 'computer'
  | 'doorOpen'
  | 'doorLock'
  | 'printer'
  | 'coffee'
  | 'alarm'
  | 'serverFail'
  | 'powerDown'
  | 'report'
  | 'meeting'
  | 'vote'
  | 'terminate'
  | 'elim'
  | 'winEmployees'
  | 'winManagers'
  | 'warning'
  | 'fixed'
  | 'vent'
  | 'roleEmployee'
  | 'roleManager'
  | 'tick'
  | 'cable'
  | 'paper'
  | 'stamp'
  | 'beep';

export type Mood = 'none' | 'menu' | 'game' | 'meeting' | 'gameover';
export type Ambience = 'none' | 'office' | 'server' | 'cafeteria' | 'gaming' | 'maintenance';

class Engine {
  ctx: AudioContext | null = null;
  master!: GainNode;
  musicBus!: GainNode;
  sfxBus!: GainNode;
  ambBus!: GainNode;
  voiceVolume = 1;
  private noiseBuf: AudioBuffer | null = null;
  private mood: Mood = 'none';
  private musicTimer: number | null = null;
  private nextBeat = 0;
  private beat = 0;
  private musicGain: GainNode | null = null;
  private amb: { kind: Ambience; nodes: AudioNode[]; gain: GainNode } | null = null;
  private alarm: { stop: () => void } | null = null;

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.musicBus = this.ctx.createGain();
    this.sfxBus = this.ctx.createGain();
    this.ambBus = this.ctx.createGain();
    // Gentle master compression keeps stacked effects from clipping.
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 3;
    this.musicBus.connect(comp);
    this.sfxBus.connect(comp);
    this.ambBus.connect(comp);
    comp.connect(this.master);
    this.applyVolumes();
    useSettings.subscribe(() => this.applyVolumes());
    const pending = this.mood;
    this.mood = 'none';
    if (pending !== 'none') this.setMood(pending);
  }

  applyVolumes() {
    if (!this.ctx) return;
    const s = useSettings.getState();
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(s.muted ? 0 : s.master, t, 0.05);
    this.musicBus.gain.setTargetAtTime(s.music * 0.55, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(s.sfx, t, 0.05);
    this.ambBus.gain.setTargetAtTime(s.sfx * 0.5, t, 0.05);
    this.voiceVolume = s.muted ? 0 : s.voice * s.master;
  }

  private noise(): AudioBuffer {
    if (this.noiseBuf) return this.noiseBuf;
    const ctx = this.ctx!;
    const b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = b;
    return b;
  }

  // ---------------------------------------------------------------- primitives

  tone(
    freq: number,
    dur: number,
    opts: { type?: OscillatorType; vol?: number; at?: number; slideTo?: number; attack?: number; bus?: AudioNode; detune?: number; release?: number } = {},
  ) {
    const ctx = this.ctx!;
    const t0 = (opts.at ?? ctx.currentTime) + 0.001;
    const o = ctx.createOscillator();
    o.type = opts.type ?? 'sine';
    o.frequency.setValueAtTime(freq, t0);
    if (opts.detune) o.detune.value = opts.detune;
    if (opts.slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, opts.slideTo), t0 + dur);
    const g = ctx.createGain();
    const vol = opts.vol ?? 0.2;
    const atk = opts.attack ?? 0.005;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + (opts.release ?? 0));
    o.connect(g).connect(opts.bus ?? this.sfxBus);
    o.start(t0);
    o.stop(t0 + dur + (opts.release ?? 0) + 0.05);
  }

  noiseBurst(dur: number, opts: { freq?: number; q?: number; type?: BiquadFilterType; vol?: number; at?: number; bus?: AudioNode; slideTo?: number } = {}) {
    const ctx = this.ctx!;
    const t0 = (opts.at ?? ctx.currentTime) + 0.001;
    const src = ctx.createBufferSource();
    src.buffer = this.noise();
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = opts.type ?? 'bandpass';
    f.frequency.setValueAtTime(opts.freq ?? 1200, t0);
    if (opts.slideTo) f.frequency.exponentialRampToValueAtTime(opts.slideTo, t0 + dur);
    f.Q.value = opts.q ?? 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(opts.vol ?? 0.2, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(opts.bus ?? this.sfxBus);
    src.start(t0, Math.random());
    src.stop(t0 + dur + 0.05);
  }

  chord(freqs: number[], dur: number, opts: Parameters<Engine['tone']>[2] = {}) {
    freqs.forEach((f) => this.tone(f, dur, { ...opts, vol: (opts.vol ?? 0.15) / Math.sqrt(freqs.length) }));
  }

  // ---------------------------------------------------------------- effects

  play(name: SfxName) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    switch (name) {
      case 'click':
        this.tone(880, 0.05, { type: 'triangle', vol: 0.12 });
        break;
      case 'hover':
        this.tone(1400, 0.03, { type: 'sine', vol: 0.04 });
        break;
      case 'open':
        this.tone(420, 0.14, { type: 'triangle', slideTo: 900, vol: 0.12 });
        this.noiseBurst(0.12, { freq: 3000, vol: 0.04 });
        break;
      case 'taskDone':
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, 0.22, { type: 'triangle', at: t + i * 0.07, vol: 0.16 }));
        this.tone(1568, 0.5, { type: 'sine', at: t + 0.3, vol: 0.06 });
        break;
      case 'error':
        this.tone(140, 0.12, { type: 'square', vol: 0.08 });
        this.tone(110, 0.16, { type: 'square', at: t + 0.12, vol: 0.08 });
        break;
      case 'chat':
        this.tone(1200, 0.06, { type: 'sine', slideTo: 1600, vol: 0.07 });
        break;
      case 'footstep':
        this.noiseBurst(0.05, { freq: 260 + Math.random() * 120, q: 2.5, vol: 0.06, type: 'lowpass' });
        break;
      case 'computer':
        for (let i = 0; i < 4; i++) this.noiseBurst(0.025, { freq: 3500 + Math.random() * 1500, q: 4, vol: 0.05, at: t + i * 0.06 + Math.random() * 0.02 });
        break;
      case 'cable':
        this.tone(300, 0.05, { type: 'square', vol: 0.06 });
        this.tone(1200, 0.08, { type: 'sine', at: t + 0.04, vol: 0.08 });
        break;
      case 'paper':
        this.noiseBurst(0.18, { freq: 5000, q: 0.6, vol: 0.06, slideTo: 2500 });
        break;
      case 'stamp':
        this.tone(90, 0.25, { type: 'sine', slideTo: 40, vol: 0.4 });
        this.noiseBurst(0.08, { freq: 800, vol: 0.2, type: 'lowpass' });
        break;
      case 'beep':
        this.tone(1320, 0.08, { type: 'square', vol: 0.06 });
        break;
      case 'doorOpen':
        this.noiseBurst(0.35, { freq: 600, slideTo: 2400, q: 0.8, vol: 0.12 });
        break;
      case 'doorLock':
        this.tone(120, 0.15, { type: 'square', vol: 0.15, slideTo: 70 });
        this.noiseBurst(0.08, { freq: 400, vol: 0.2, type: 'lowpass' });
        this.tone(880, 0.08, { type: 'square', at: t + 0.2, vol: 0.06 });
        this.tone(660, 0.12, { type: 'square', at: t + 0.3, vol: 0.06 });
        break;
      case 'printer':
        for (let i = 0; i < 6; i++) this.noiseBurst(0.06, { freq: 900 + (i % 2) * 300, q: 6, vol: 0.1, at: t + i * 0.09 });
        this.tone(70, 0.6, { type: 'sawtooth', vol: 0.05 });
        break;
      case 'coffee':
        this.noiseBurst(1.1, { freq: 4500, q: 0.5, vol: 0.07, type: 'highpass' });
        for (let i = 0; i < 8; i++) this.tone(300 + Math.random() * 300, 0.05, { at: t + 0.2 + i * 0.1, vol: 0.05, slideTo: 600 });
        break;
      case 'alarm':
        for (let i = 0; i < 4; i++) {
          this.tone(880, 0.22, { type: 'square', at: t + i * 0.5, vol: 0.08 });
          this.tone(660, 0.22, { type: 'square', at: t + i * 0.5 + 0.25, vol: 0.08 });
        }
        break;
      case 'serverFail':
        [800, 600, 420, 260, 140].forEach((f, i) => this.tone(f, 0.12, { type: 'sawtooth', at: t + i * 0.09, vol: 0.08 }));
        this.noiseBurst(0.5, { freq: 200, vol: 0.12, at: t + 0.4, type: 'lowpass' });
        break;
      case 'powerDown':
        this.tone(440, 1.1, { type: 'sawtooth', slideTo: 40, vol: 0.1 });
        this.noiseBurst(0.15, { freq: 1200, vol: 0.12, at: t + 1.0 });
        break;
      case 'report':
        this.tone(330, 0.25, { type: 'sawtooth', vol: 0.12 });
        this.tone(415, 0.25, { type: 'sawtooth', vol: 0.12, at: t + 0.22 });
        this.tone(494, 0.5, { type: 'sawtooth', vol: 0.12, at: t + 0.44 });
        break;
      case 'meeting':
        for (let i = 0; i < 6; i++) this.tone(1046, 0.08, { type: 'triangle', at: t + i * 0.11, vol: 0.12 });
        this.chord([196, 233, 294], 0.8, { type: 'sawtooth', at: t + 0.7, vol: 0.18, attack: 0.02 });
        break;
      case 'vote':
        this.tone(160, 0.12, { type: 'sine', slideTo: 60, vol: 0.3 });
        this.noiseBurst(0.05, { freq: 1500, vol: 0.08 });
        break;
      case 'terminate':
        // sad trombone
        [392, 370, 349, 330].forEach((f, i) => this.tone(f, i === 3 ? 0.9 : 0.32, { type: 'sawtooth', at: t + i * 0.36, vol: 0.12, attack: 0.04, detune: i === 3 ? 0 : 0 }));
        break;
      case 'elim':
        this.noiseBurst(0.25, { freq: 400, slideTo: 3000, vol: 0.15 });
        this.tone(220, 0.15, { type: 'square', slideTo: 90, at: t + 0.25, vol: 0.12 });
        break;
      case 'winEmployees':
        [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.18, { type: 'square', at: t + i * 0.12, vol: 0.08 }));
        this.chord([523, 659, 784, 1047], 1.2, { type: 'triangle', at: t + 0.5, vol: 0.25 });
        break;
      case 'winManagers':
        this.chord([110, 130.8, 164.8], 1.6, { type: 'sawtooth', vol: 0.2, attack: 0.05 });
        this.chord([103.8, 123.5, 155.6], 1.8, { type: 'sawtooth', vol: 0.2, at: t + 0.8, attack: 0.05 });
        this.tone(55, 2.4, { type: 'sine', vol: 0.3 });
        break;
      case 'warning':
        this.tone(988, 0.1, { type: 'square', vol: 0.07 });
        this.tone(988, 0.1, { type: 'square', at: t + 0.16, vol: 0.07 });
        break;
      case 'fixed':
        this.chord([523, 784, 1047], 0.5, { type: 'triangle', vol: 0.18 });
        break;
      case 'vent':
        this.tone(180, 0.18, { type: 'square', slideTo: 90, vol: 0.12 });
        this.noiseBurst(0.2, { freq: 900, q: 8, vol: 0.1 });
        break;
      case 'roleEmployee':
        this.chord([392, 494, 587], 0.9, { type: 'triangle', vol: 0.22, attack: 0.02 });
        this.chord([523, 659, 784], 1.3, { type: 'triangle', at: t + 0.45, vol: 0.22, attack: 0.02 });
        break;
      case 'roleManager':
        this.tone(55, 1.8, { type: 'sawtooth', vol: 0.22 });
        this.chord([146.8, 174.6, 207.6], 1.6, { type: 'sawtooth', vol: 0.2, attack: 0.03 });
        this.noiseBurst(0.6, { freq: 150, vol: 0.2, type: 'lowpass' });
        break;
      case 'tick':
        this.tone(1800, 0.03, { type: 'square', vol: 0.05 });
        break;
    }
  }

  startAlarm() {
    if (!this.ctx || this.alarm) return;
    const id = window.setInterval(() => this.play('alarm'), 2000);
    this.play('alarm');
    this.alarm = { stop: () => clearInterval(id) };
  }
  stopAlarm() {
    this.alarm?.stop();
    this.alarm = null;
  }

  // ---------------------------------------------------------------- music

  setMood(mood: Mood) {
    if (mood === this.mood) return;
    this.mood = mood;
    if (!this.ctx) return;
    const ctx = this.ctx;
    if (this.musicGain) {
      const g = this.musicGain;
      g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.4);
      setTimeout(() => g.disconnect(), 2000);
    }
    if (this.musicTimer) clearInterval(this.musicTimer);
    this.musicTimer = null;
    if (mood === 'none' || mood === 'gameover') {
      this.musicGain = null;
      return;
    }
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    g.gain.setTargetAtTime(1, ctx.currentTime + 0.3, 0.6);
    g.connect(this.musicBus);
    this.musicGain = g;
    this.beat = 0;
    this.nextBeat = ctx.currentTime + 0.1;
    this.musicTimer = window.setInterval(() => this.schedule(), 80);
  }

  private schedule() {
    const ctx = this.ctx!;
    const bus = this.musicGain!;
    if (!bus) return;
    const bpm = this.mood === 'menu' ? 96 : this.mood === 'meeting' ? 122 : 84;
    const step = 60 / bpm / 2; // eighth notes
    while (this.nextBeat < ctx.currentTime + 0.35) {
      const b = this.beat;
      const at = this.nextBeat;
      if (this.mood === 'menu') this.menuStep(b, at, step, bus);
      else if (this.mood === 'game') this.gameStep(b, at, step, bus);
      else if (this.mood === 'meeting') this.meetingStep(b, at, step, bus);
      // light swing on menu music
      const swing = this.mood === 'menu' ? (b % 2 === 0 ? 1.18 : 0.82) : 1;
      this.nextBeat += step * swing;
      this.beat++;
    }
  }

  private menuStep(b: number, at: number, step: number, bus: AudioNode) {
    // Elevator bossa: Fmaj9 – Em7 – Dm9 – G13, rhodes-ish chords + walking bass.
    const prog = [
      [174.6, 220, 261.6, 329.6, 392],
      [164.8, 196, 246.9, 293.7],
      [146.8, 174.6, 220, 261.6, 329.6],
      [98, 174.6, 246.9, 329.6],
    ];
    const bass = [87.3, 82.4, 73.4, 98];
    const bar = Math.floor(b / 8) % 4;
    const pos = b % 8;
    if (pos === 0 || pos === 3 || pos === 6) {
      prog[bar].forEach((f) => {
        this.tone(f * 2, step * (pos === 0 ? 3 : 1.6), { type: 'sine', vol: 0.05, at, bus, attack: 0.01, release: 0.2 });
        this.tone(f * 4, step * 0.8, { type: 'triangle', vol: 0.008, at, bus });
      });
    }
    if (pos % 2 === 0) {
      const walk = [1, 1.5, 1.25, 1.125][(pos / 2) % 4];
      this.tone(bass[bar] * (pos === 0 ? 1 : walk), step * 1.6, { type: 'triangle', vol: 0.14, at, bus, attack: 0.01 });
    }
    // brushes
    this.noiseBurst(0.06, { freq: 7000, type: 'highpass', vol: pos % 2 ? 0.012 : 0.02, at, bus });
    // occasional vibraphone melody
    if ((b % 32 === 4 || b % 32 === 20) && Math.random() < 0.8) {
      const scale = [523.3, 587.3, 659.3, 784, 880];
      for (let i = 0; i < 4; i++) this.tone(scale[Math.floor(Math.random() * scale.length)], 0.5, { type: 'sine', vol: 0.035, at: at + i * step, bus, release: 0.4 });
    }
  }

  private gameStep(b: number, at: number, step: number, bus: AudioNode) {
    // Suspense office ambience: drone + sparse plucks + ticking clock.
    const bar = Math.floor(b / 16) % 4;
    const roots = [110, 87.3, 98, 82.4];
    if (b % 16 === 0) {
      this.tone(roots[bar] / 2, step * 16, { type: 'sawtooth', vol: 0.035, at, bus, attack: 1.2, release: 1 });
      this.tone(roots[bar], step * 16, { type: 'triangle', vol: 0.04, at, bus, attack: 1.5, release: 1 });
      this.tone(roots[bar] * 1.5, step * 16, { type: 'sine', vol: 0.025, at, bus, attack: 2, release: 1 });
    }
    if (b % 2 === 0) this.tone(b % 4 === 0 ? 2400 : 2000, 0.02, { type: 'square', vol: 0.006, at, bus });
    if (b % 8 === 5 && Math.random() < 0.6) {
      const pent = [220, 261.6, 293.7, 329.6, 392, 440];
      this.tone(pent[Math.floor(Math.random() * pent.length)], 0.4, { type: 'triangle', vol: 0.04, at, bus, release: 0.5 });
    }
  }

  private meetingStep(b: number, at: number, step: number, bus: AudioNode) {
    // Dramatic HR meeting: pulsing bass, staccato stabs, timpani on the one.
    const bar = Math.floor(b / 8) % 4;
    const roots = [73.4, 73.4, 65.4, 82.4];
    this.tone(roots[bar], step * 0.7, { type: 'sawtooth', vol: 0.07, at, bus });
    if (b % 8 === 0) this.tone(roots[bar] / 2, 0.6, { type: 'sine', vol: 0.25, at, bus, slideTo: roots[bar] / 2.6 });
    if (b % 8 === 3 || b % 8 === 6) {
      const stab = bar === 2 ? [261.6, 311.1, 392] : bar === 3 ? [329.6, 415.3, 493.9] : [293.7, 349.2, 440];
      stab.forEach((f) => this.tone(f, step * 0.5, { type: 'sawtooth', vol: 0.025, at, bus }));
    }
    if (b % 4 === 2) this.noiseBurst(0.04, { freq: 8000, type: 'highpass', vol: 0.02, at, bus });
  }

  // ---------------------------------------------------------------- ambience

  setAmbience(kind: Ambience) {
    if (!this.ctx) return;
    if (this.amb?.kind === kind) return;
    const ctx = this.ctx;
    if (this.amb) {
      const old = this.amb;
      old.gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.5);
      setTimeout(() => old.nodes.forEach((n) => { try { (n as any).stop?.(); n.disconnect(); } catch {} }), 2500);
    }
    this.amb = null;
    if (kind === 'none') return;
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    gain.gain.setTargetAtTime(1, ctx.currentTime, 0.8);
    gain.connect(this.ambBus);
    const nodes: AudioNode[] = [gain];
    const noise = (freq: number, q: number, vol: number, type: BiquadFilterType = 'bandpass', lfoRate = 0) => {
      const src = ctx.createBufferSource();
      src.buffer = this.noise();
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = vol;
      src.connect(f).connect(g).connect(gain);
      src.start();
      nodes.push(src, f, g);
      if (lfoRate) {
        const lfo = ctx.createOscillator();
        const lg = ctx.createGain();
        lfo.frequency.value = lfoRate;
        lg.gain.value = vol * 0.8;
        lfo.connect(lg).connect(g.gain);
        lfo.start();
        nodes.push(lfo, lg);
      }
    };
    const hum = (freq: number, vol: number) => {
      const o = ctx.createOscillator();
      o.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = vol;
      o.connect(g).connect(gain);
      o.start();
      nodes.push(o, g);
    };
    switch (kind) {
      case 'office':
        noise(500, 0.4, 0.02, 'lowpass');
        break;
      case 'server':
        noise(300, 0.7, 0.06, 'lowpass');
        noise(5000, 2, 0.008);
        hum(60, 0.02);
        hum(120, 0.012);
        break;
      case 'cafeteria':
        noise(700, 1.2, 0.05, 'bandpass', 0.7);
        noise(1500, 2, 0.02, 'bandpass', 1.3);
        break;
      case 'gaming':
        noise(400, 0.5, 0.015, 'lowpass');
        {
          const id = window.setInterval(() => {
            if (this.amb?.kind !== 'gaming') return clearInterval(id);
            const n = [523, 659, 784, 988, 1175];
            this.tone(n[Math.floor(Math.random() * n.length)], 0.07, { type: 'square', vol: 0.012, bus: gain });
          }, 260);
        }
        break;
      case 'maintenance':
        noise(150, 1, 0.06, 'lowpass', 0.2);
        hum(50, 0.025);
        break;
    }
    this.amb = { kind, nodes, gain };
  }
}

export const audio = new Engine();

export function sfx(name: SfxName) {
  audio.play(name);
}

export function unlockAudio() {
  audio.unlock();
}
