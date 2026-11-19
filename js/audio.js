// Synthétiseur audio léger (Web Audio API) — aucun fichier externe requis
class SoundEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    return this.muted;
  }

  playTone(freq, duration = 0.08, type = 'sine', volume = 0.12, slideTo = null) {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slideTo) {
      osc.frequency.exponentialRampToValueAtTime(slideTo, now + duration);
    }

    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + duration);
  }

  move() {
    this.playTone(280, 0.04, 'triangle', 0.06, 320);
  }

  rotate() {
    this.playTone(390, 0.06, 'sine', 0.08, 520);
  }

  permute() {
    this.playTone(520, 0.05, 'triangle', 0.09, 680);
  }

  drop() {
    this.playTone(150, 0.11, 'sine', 0.16, 65);
  }

  lock() {
    this.playTone(200, 0.06, 'triangle', 0.1, 130);
  }

  wordClear(combo = 1, isSquare = false) {
    // Gamme pentatonique ascendante selon le combo
    const scale = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66];
    const baseIdx = Math.min(combo - 1, scale.length - 3);
    const notes = isSquare
      ? [scale[baseIdx], scale[baseIdx + 1], scale[baseIdx + 2], scale[baseIdx + 2] * 1.25]
      : [scale[baseIdx], scale[baseIdx + 1], scale[baseIdx + 2]];

    notes.forEach((freq, i) => {
      setTimeout(() => {
        this.playTone(freq, 0.18, isSquare ? 'triangle' : 'sine', 0.14);
      }, i * 55);
    });
  }

  fever() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      setTimeout(() => this.playTone(f, 0.25, 'triangle', 0.15), i * 70);
    });
  }

  gameOver() {
    [340, 290, 240, 170].forEach((f, i) => {
      setTimeout(() => this.playTone(f, 0.22, 'sawtooth', 0.09), i * 110);
    });
  }
}

export const sound = new SoundEngine();
