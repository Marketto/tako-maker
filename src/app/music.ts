/* Musica rilassante generata in tempo reale con Web Audio.
   Nessun file audio: niente diritti d'autore, niente download, funziona offline.
   - "pad": accordi lenti e morbidi (Fmaj7 → Em7 → Dm7 → Cmaj7), 8 secondi ciascuno
   - "carillon": note sparse della scala pentatonica, con eco
   Parte solo dopo un gesto dell'utente, come richiedono i browser. */

const CHORDS: number[][] = [
  [53, 57, 60, 64], // Fmaj7
  [52, 55, 59, 62], // Em7
  [50, 53, 57, 60], // Dm7
  [48, 52, 55, 59], // Cmaj7
];
const PENTA = [72, 74, 76, 79, 81, 84, 86, 88];
const CHORD_S = 8;

const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

export class AmbientMusic {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private padBus!: GainNode;
  private bellBus!: GainNode;
  private timer = 0;
  private nextChordAt = 0;
  private nextBellAt = 0;
  private chord = 0;
  private volume = 0.4;
  playing = false;

  private setup() {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(ctx.destination);

    // Pad attraverso un filtro passa-basso: suono ovattato
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    this.padBus = ctx.createGain();
    this.padBus.gain.value = 0.22;
    this.padBus.connect(lp).connect(this.master);

    // Carillon con eco (delay con retroazione filtrata)
    this.bellBus = ctx.createGain();
    this.bellBus.gain.value = 0.16;
    const delay = ctx.createDelay(2);
    delay.delayTime.value = 0.42;
    const fb = ctx.createGain();
    fb.gain.value = 0.38;
    const dlp = ctx.createBiquadFilter();
    dlp.type = 'lowpass';
    dlp.frequency.value = 2400;
    this.bellBus.connect(this.master);
    this.bellBus.connect(delay);
    delay.connect(dlp).connect(fb).connect(delay);
    dlp.connect(this.master);

    document.addEventListener('visibilitychange', () => {
      if (!this.playing || !this.ctx) return;
      if (document.hidden) void this.ctx.suspend();
      else void this.ctx.resume();
    });
  }

  private pad(notes: number[], at: number) {
    const ctx = this.ctx!;
    for (const n of notes) {
      for (const detune of [-6, 6]) {
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = hz(n);
        o.detune.value = detune;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, at);
        g.gain.linearRampToValueAtTime(0.18, at + 2.2);
        g.gain.setValueAtTime(0.18, at + CHORD_S - 0.5);
        g.gain.linearRampToValueAtTime(0, at + CHORD_S + 2.5);
        o.connect(g).connect(this.padBus);
        o.start(at);
        o.stop(at + CHORD_S + 2.6);
      }
    }
  }

  private bell(note: number, at: number) {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(0.5, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0008, at + 2.2);
    g.connect(this.bellBus);
    for (const [mult, amp] of [[1, 1], [2, 0.25], [3.01, 0.08]] as const) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = hz(note) * mult;
      const og = ctx.createGain();
      og.gain.value = amp;
      o.connect(og).connect(g);
      o.start(at);
      o.stop(at + 2.3);
    }
  }

  private schedule = () => {
    const ctx = this.ctx!;
    const horizon = ctx.currentTime + 0.6;
    while (this.nextChordAt < horizon) {
      this.pad(CHORDS[this.chord % CHORDS.length], this.nextChordAt);
      this.chord++;
      this.nextChordAt += CHORD_S;
    }
    while (this.nextBellAt < horizon) {
      if (Math.random() < 0.7) this.bell(PENTA[Math.floor(Math.random() * PENTA.length)], this.nextBellAt);
      this.nextBellAt += 0.6 + Math.random() * 1.4;
    }
  };

  /** Da chiamare dentro un gestore di clic/tocco. */
  async start() {
    if (this.playing) return;
    if (!this.ctx) this.setup();
    const ctx = this.ctx!;
    await ctx.resume();
    const now = ctx.currentTime;
    this.nextChordAt = now + 0.1;
    this.nextBellAt = now + 1.5;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(this.volume, now + 2);
    this.timer = window.setInterval(this.schedule, 200);
    this.schedule();
    this.playing = true;
  }

  stop() {
    if (!this.playing || !this.ctx) return;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(0, now + 1.2);
    window.clearInterval(this.timer);
    this.playing = false;
    const ctx = this.ctx;
    window.setTimeout(() => {
      if (!this.playing) void ctx.suspend();
    }, 3500);
  }

  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.playing && this.ctx) this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.2);
  }
}

export const music = new AmbientMusic();
