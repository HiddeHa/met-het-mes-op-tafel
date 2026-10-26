export type SoundName =
  | 'click'
  | 'lock'
  | 'coin'
  | 'correct'
  | 'wrong'
  | 'buzz'
  | 'sting'
  | 'fanfare'
  | 'whoosh';

let audioContext: AudioContext | null = null;
let muted = false;

function context(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;
  if (!audioContext) {
    try {
      audioContext = new Ctor();
    } catch {
      return null;
    }
  }
  if (audioContext.state === 'suspended') {
    void audioContext.resume().catch(() => undefined);
  }
  return audioContext;
}

export function setMuted(value: boolean): void {
  muted = value;
}

export function isMuted(): boolean {
  return muted;
}

interface ToneOptions {
  freq: number;
  duration: number;
  type?: OscillatorType;
  gain?: number;
  delay?: number;
  glideTo?: number;
}

function tone(ctx: AudioContext, options: ToneOptions): void {
  const {
    freq,
    duration,
    type = 'sine',
    gain = 0.09,
    delay = 0,
    glideTo,
  } = options;
  const start = ctx.currentTime + delay;
  const oscillator = ctx.createOscillator();
  const envelope = ctx.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(freq, start);
  if (glideTo) {
    oscillator.frequency.exponentialRampToValueAtTime(
      Math.max(20, glideTo),
      start + duration,
    );
  }

  envelope.gain.setValueAtTime(0.0001, start);
  envelope.gain.exponentialRampToValueAtTime(gain, start + 0.012);
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  oscillator.connect(envelope);
  envelope.connect(ctx.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

function noiseBurst(ctx: AudioContext, duration: number, gain = 0.05): void {
  const frames = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / frames) ** 2;
  }
  const source = ctx.createBufferSource();
  const envelope = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 1400;
  filter.Q.value = 0.7;
  envelope.gain.value = gain;
  source.buffer = buffer;
  source.connect(filter);
  filter.connect(envelope);
  envelope.connect(ctx.destination);
  source.start();
}

export function playSound(name: SoundName): void {
  if (muted) return;
  const ctx = context();
  if (!ctx) return;

  switch (name) {
    case 'click':
      tone(ctx, { freq: 620, duration: 0.045, type: 'triangle', gain: 0.035 });
      break;
    case 'lock':
      tone(ctx, { freq: 160, duration: 0.09, type: 'sine', gain: 0.11, glideTo: 90 });
      tone(ctx, { freq: 1200, duration: 0.035, type: 'square', gain: 0.02, delay: 0.05 });
      break;
    case 'coin':
      tone(ctx, { freq: 988, duration: 0.09, type: 'triangle', gain: 0.07 });
      tone(ctx, { freq: 1319, duration: 0.12, type: 'triangle', gain: 0.06, delay: 0.07 });
      noiseBurst(ctx, 0.06, 0.025);
      break;
    case 'correct':
      [523.25, 659.25, 783.99, 1046.5].forEach((freq, index) => {
        tone(ctx, {
          freq,
          duration: 0.16,
          type: 'triangle',
          gain: 0.075,
          delay: index * 0.09,
        });
      });
      break;
    case 'wrong':
      tone(ctx, { freq: 220, duration: 0.42, type: 'sawtooth', gain: 0.06, glideTo: 82 });
      tone(ctx, { freq: 155, duration: 0.4, type: 'square', gain: 0.03, delay: 0.05 });
      break;
    case 'buzz':
      tone(ctx, { freq: 180, duration: 0.2, type: 'square', gain: 0.08 });
      tone(ctx, { freq: 90, duration: 0.26, type: 'sawtooth', gain: 0.05 });
      break;
    case 'sting':
      tone(ctx, { freq: 98, duration: 0.7, type: 'sawtooth', gain: 0.05, glideTo: 196 });
      tone(ctx, { freq: 392, duration: 0.5, type: 'sine', gain: 0.045, delay: 0.12 });
      noiseBurst(ctx, 0.4, 0.02);
      break;
    case 'whoosh':
      tone(ctx, { freq: 900, duration: 0.35, type: 'sine', gain: 0.04, glideTo: 120 });
      noiseBurst(ctx, 0.25, 0.02);
      break;
    case 'fanfare':
      [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((freq, index) => {
        tone(ctx, {
          freq,
          duration: 0.28,
          type: 'triangle',
          gain: 0.075,
          delay: index * 0.11,
        });
        tone(ctx, {
          freq: freq / 2,
          duration: 0.3,
          type: 'sine',
          gain: 0.035,
          delay: index * 0.11,
        });
      });
      break;
    default:
      break;
  }
}
