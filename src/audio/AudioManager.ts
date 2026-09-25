/**
 * Sons 100 % synthétisés (WebAudio) : pas, jingle de ramassage, moteur, roulement du tricycle,
 * ambiance de ville au petit matin. Le contexte n'est créé qu'après une interaction utilisateur.
 */
const MUTE_KEY = 'gueule-de-bois.muted';

export class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  muted = false;

  // Boucles continues
  private engineOsc: OscillatorNode | null = null;
  private engineOsc2: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private rollGain: GainNode | null = null;
  private rollFilter: BiquadFilterNode | null = null;
  private ambienceGain: GainNode | null = null;
  private birdTimer = 0;
  private hornTimer = 8;
  private squeakTimer = 0;

  constructor() {
    try {
      this.muted = localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      /* pas de stockage */
    }
    const unlock = () => {
      this.ensure();
      if (this.ctx?.state === 'suspended') void this.ctx.resume();
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    window.addEventListener('touchstart', unlock);
  }

  get ready(): boolean {
    return this.ctx !== null && this.ctx.state === 'running';
  }

  private ensure(): void {
    if (this.ctx) return;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    try {
      this.ctx = new Ctor();
    } catch {
      return;
    }
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    this.master.connect(ctx.destination);

    // Bruit blanc réutilisable
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    // Moteur : deux dents de scie légèrement désaccordées, filtrées
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 400;
    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 40;
    this.engineOsc2 = ctx.createOscillator();
    this.engineOsc2.type = 'square';
    this.engineOsc2.frequency.value = 20.5;
    const osc2Gain = ctx.createGain();
    osc2Gain.gain.value = 0.5;
    this.engineOsc.connect(this.engineFilter);
    this.engineOsc2.connect(osc2Gain).connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain).connect(this.master);
    this.engineOsc.start();
    this.engineOsc2.start();

    // Roulement (tricycle / trottinette) : bruit filtré en bande
    const roll = ctx.createBufferSource();
    roll.buffer = this.noise;
    roll.loop = true;
    this.rollFilter = ctx.createBiquadFilter();
    this.rollFilter.type = 'bandpass';
    this.rollFilter.frequency.value = 320;
    this.rollFilter.Q.value = 1.2;
    this.rollGain = ctx.createGain();
    this.rollGain.gain.value = 0;
    roll.connect(this.rollFilter).connect(this.rollGain).connect(this.master);
    roll.start();

    // Ambiance : rumeur lointaine de la ville
    const amb = ctx.createBufferSource();
    amb.buffer = this.noise;
    amb.loop = true;
    const ambF = ctx.createBiquadFilter();
    ambF.type = 'lowpass';
    ambF.frequency.value = 280;
    this.ambienceGain = ctx.createGain();
    this.ambienceGain.gain.value = 0;
    amb.connect(ambF).connect(this.ambienceGain).connect(this.master);
    amb.start();
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    try {
      localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0');
    } catch {
      /* pas de stockage */
    }
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.8, this.ctx.currentTime, 0.05);
    return this.muted;
  }

  private tone(freq: number, start: number, dur: number, type: OscillatorType, gain: number, slideTo?: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, start);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, start + dur);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(gain, start + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g).connect(this.master!);
    o.start(start);
    o.stop(start + dur + 0.05);
  }

  private burst(start: number, dur: number, freq: number, gain: number, type: BiquadFilterType = 'lowpass'): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, start);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    src.connect(f).connect(g).connect(this.master!);
    src.start(start, Math.random() * 1.5);
    src.stop(start + dur + 0.02);
  }

  step(onCarpet = false): void {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    this.burst(t, 0.09, onCarpet ? 350 : 700 + Math.random() * 300, 0.22);
  }

  pickup(): void {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, t + i * 0.08, 0.28, 'triangle', 0.18));
  }

  locked(): void {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    this.burst(t, 0.12, 220, 0.4);
    this.tone(180, t + 0.02, 0.15, 'square', 0.06, 120);
  }

  deny(): void {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    this.tone(330, t, 0.14, 'triangle', 0.12);
    this.tone(247, t + 0.13, 0.2, 'triangle', 0.12);
  }

  door(): void {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    this.burst(t, 0.08, 1800, 0.3, 'bandpass');
    [392, 523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, t + 0.25 + i * 0.12, 0.5, 'triangle', 0.16));
  }

  vehicleIn(): void {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    this.burst(t, 0.15, 400, 0.35);
  }

  /** Mise à jour des boucles continues, à chaque image. */
  update(
    dt: number,
    s: { engine: number | null; roll: number | null; rollPitch: number; onCarpet: boolean; playing: boolean },
  ): void {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    // Moteur : régime selon la vitesse
    if (s.engine !== null) {
      const rpm = 38 + Math.abs(s.engine) * 5;
      this.engineOsc!.frequency.setTargetAtTime(rpm, t, 0.08);
      this.engineOsc2!.frequency.setTargetAtTime(rpm * 0.51, t, 0.08);
      this.engineFilter!.frequency.setTargetAtTime(300 + Math.abs(s.engine) * 60, t, 0.1);
      this.engineGain!.gain.setTargetAtTime(0.09 + Math.min(0.08, Math.abs(s.engine) * 0.006), t, 0.1);
    } else {
      this.engineGain!.gain.setTargetAtTime(0, t, 0.15);
    }
    // Roulement : s'arrête sur la moquette
    const rolling = s.roll !== null && !s.onCarpet ? Math.min(1, Math.abs(s.roll) / 5) : 0;
    this.rollGain!.gain.setTargetAtTime(rolling * 0.35, t, 0.06);
    this.rollFilter!.frequency.setTargetAtTime(s.rollPitch * (0.8 + rolling * 0.6), t, 0.1);
    if (rolling > 0.2 && s.rollPitch < 400) {
      // Petit grincement de pédalier
      this.squeakTimer -= dt;
      if (this.squeakTimer <= 0) {
        this.squeakTimer = 0.9 / rolling;
        this.tone(1400 + Math.random() * 300, t, 0.07, 'sine', 0.02, 1100);
      }
    }
    // Ambiance
    this.ambienceGain!.gain.setTargetAtTime(s.playing ? 0.05 : 0.025, t, 0.5);
    this.birdTimer -= dt;
    if (this.birdTimer <= 0) {
      this.birdTimer = 2.5 + Math.random() * 6;
      const base = 2400 + Math.random() * 1400;
      const n = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) this.tone(base, t + i * 0.11, 0.08, 'sine', 0.025, base * 1.3);
    }
    if (s.playing) {
      this.hornTimer -= dt;
      if (this.hornTimer <= 0) {
        this.hornTimer = 20 + Math.random() * 25;
        this.tone(415, t, 0.35, 'square', 0.012);
        this.tone(349, t + 0.02, 0.35, 'square', 0.01);
      }
    }
  }
}
