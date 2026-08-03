import { missionCues, missionMix, type AudioCue, type AudioMix } from './mission-audio';
import type { MissionState } from '../sim/types';

interface Bed {
  gain: GainNode;
  target: number;
}

type AudioContextConstructor = new () => AudioContext;

const maxCuesPerUpdate = 4;
const bedNames = ['engine', 'wind', 'rumble', 'fire', 'alarm'] as const;
type BedName = (typeof bedNames)[number];

const bedCeiling: Record<BedName, number> = {
  engine: 0.22,
  wind: 0.16,
  rumble: 0.3,
  fire: 0.24,
  alarm: 0.12,
};

function audioContextConstructor(): AudioContextConstructor | undefined {
  const scope = window as unknown as {
    AudioContext?: AudioContextConstructor;
    webkitAudioContext?: AudioContextConstructor;
  };
  return scope.AudioContext ?? scope.webkitAudioContext;
}

/**
 * Procedural cabin audio. Every sound is synthesised at runtime, so the game
 * ships no audio files and no third-party assets.
 *
 * Audio is a pure projection of mission state, exactly like the HUD and the
 * debrief: it reads snapshots, never writes to the simulation and never gates a
 * host outcome. Host, guest and solo all derive the same cues from the same
 * authoritative state.
 */
export class CabinAudio {
  private context?: AudioContext;
  private master?: GainNode;
  private noise?: AudioBuffer;
  private readonly beds = new Map<BedName, Bed>();
  private previous?: MissionState;
  private enabled = true;
  private failed = false;

  /** Starts or resumes the graph. Must be called from a user gesture. */
  public resume(): void {
    if (this.failed || !this.enabled) return;
    if (!this.context) this.build();
    void this.context?.resume().catch(() => undefined);
  }

  public muted(): boolean {
    return !this.enabled;
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!this.context || !this.master) return;
    this.master.gain.setTargetAtTime(enabled ? 1 : 0, this.context.currentTime, 0.05);
    if (enabled) void this.context.resume().catch(() => undefined);
  }

  /** Feeds one snapshot. Safe to call before the graph exists. */
  public update(state: MissionState, localPlayerId: string): void {
    const cues = missionCues(this.previous, state, localPlayerId);
    this.previous = state;
    if (!this.context || !this.enabled) return;
    this.applyMix(missionMix(state));
    for (const cue of cues.slice(0, maxCuesPerUpdate)) this.playCue(cue);
  }

  public dispose(): void {
    this.previous = undefined;
    this.beds.clear();
    this.master = undefined;
    const context = this.context;
    this.context = undefined;
    void context?.close().catch(() => undefined);
  }

  private build(): void {
    const Constructor = audioContextConstructor();
    if (!Constructor) {
      this.failed = true;
      return;
    }
    let context: AudioContext;
    try {
      context = new Constructor();
    } catch {
      this.failed = true;
      return;
    }
    this.context = context;

    const master = context.createGain();
    master.gain.value = this.enabled ? 1 : 0;
    master.connect(context.destination);
    this.master = master;

    this.noise = this.createNoise(context);
    for (const name of bedNames) {
      const gain = context.createGain();
      gain.gain.value = 0;
      gain.connect(master);
      this.beds.set(name, { gain, target: 0 });
    }

    this.buildEngine(context);
    this.buildNoiseBed(context, 'wind', 'bandpass', 820, 0.7);
    this.buildNoiseBed(context, 'rumble', 'lowpass', 130, 1);
    this.buildNoiseBed(context, 'fire', 'bandpass', 1700, 0.6);
    this.buildAlarm(context);
  }

  private createNoise(context: AudioContext): AudioBuffer {
    const frames = Math.floor(context.sampleRate * 2);
    const buffer = context.createBuffer(1, frames, context.sampleRate);
    const channel = buffer.getChannelData(0);
    let seed = 0x9e3779b9;
    for (let index = 0; index < frames; index += 1) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      channel[index] = (seed / 0xffffffff) * 2 - 1;
    }
    return buffer;
  }

  private buildEngine(context: AudioContext): void {
    const bed = this.beds.get('engine');
    if (!bed) return;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 340;
    filter.connect(bed.gain);
    for (const frequency of [58, 87.5, 116]) {
      const oscillator = context.createOscillator();
      oscillator.type = 'sawtooth';
      oscillator.frequency.value = frequency;
      oscillator.connect(filter);
      oscillator.start();
    }
  }

  private buildNoiseBed(
    context: AudioContext,
    name: BedName,
    type: BiquadFilterType,
    frequency: number,
    quality: number,
  ): void {
    const bed = this.beds.get(name);
    if (!bed || !this.noise) return;
    const source = context.createBufferSource();
    source.buffer = this.noise;
    source.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = quality;
    source.connect(filter);
    filter.connect(bed.gain);
    source.start();
  }

  private buildAlarm(context: AudioContext): void {
    const bed = this.beds.get('alarm');
    if (!bed) return;
    const chopper = context.createGain();
    chopper.gain.value = 0;
    chopper.connect(bed.gain);

    const oscillator = context.createOscillator();
    oscillator.type = 'square';
    oscillator.frequency.value = 660;
    oscillator.connect(chopper);
    oscillator.start();

    // A square LFO chops the tone into an intermittent cabin warning beep.
    const lfo = context.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = 1.7;
    const lfoDepth = context.createGain();
    lfoDepth.gain.value = 0.5;
    lfo.connect(lfoDepth);
    lfoDepth.connect(chopper.gain);
    lfo.start();
  }

  private applyMix(mix: AudioMix): void {
    const context = this.context;
    if (!context) return;
    for (const name of bedNames) {
      const bed = this.beds.get(name);
      if (!bed) continue;
      const target = mix[name] * bedCeiling[name];
      if (Math.abs(target - bed.target) < 0.002) continue;
      bed.target = target;
      bed.gain.gain.setTargetAtTime(target, context.currentTime, 0.18);
    }
  }

  private playCue(cue: AudioCue): void {
    switch (cue.kind) {
      case 'phase':
        this.tone(880, 0.14, 'triangle', 0.16);
        this.tone(1320, 0.22, 'triangle', 0.14, 0.1);
        break;
      case 'fire-start':
        this.sweep(920, 380, 0.28, 'sawtooth', 0.16);
        this.sweep(920, 380, 0.28, 'sawtooth', 0.16, 0.32);
        break;
      case 'fire-out':
        this.burst(0.5, 'lowpass', 1400, 0.18);
        break;
      case 'repair-start':
        this.tone(196, 0.12, 'square', 0.12);
        this.tone(196, 0.12, 'square', 0.12, 0.18);
        break;
      case 'repair-fixed':
        this.tone(523, 0.12, 'triangle', 0.13);
        this.tone(659, 0.12, 'triangle', 0.13, 0.1);
        this.tone(784, 0.2, 'triangle', 0.13, 0.2);
        break;
      case 'serve-good':
        this.tone(1046, 0.1, 'sine', 0.16);
        this.tone(1568, 0.16, 'sine', 0.12, 0.08);
        break;
      case 'serve-bad':
        this.sweep(220, 150, 0.24, 'square', 0.12);
        break;
      case 'impact':
        this.burst(0.18, 'lowpass', 220, 0.1 + cue.intensity * 0.25);
        break;
      case 'air-pocket':
        this.sweep(420, 120, 0.5, 'sine', 0.1 + cue.intensity * 0.12);
        break;
      case 'pickup':
        this.tone(660, 0.06, 'square', 0.07);
        break;
      case 'release':
        this.tone(440, 0.06, 'square', 0.06);
        break;
      case 'shift-success':
        [523, 659, 784, 1046].forEach((frequency, index) => {
          this.tone(frequency, 0.16, 'triangle', 0.14, index * 0.11);
        });
        break;
      case 'shift-failed':
        [392, 311, 233].forEach((frequency, index) => {
          this.tone(frequency, 0.28, 'sawtooth', 0.12, index * 0.16);
        });
        break;
    }
  }

  private voice(
    delay: number,
  ): { context: AudioContext; gain: GainNode; start: number } | undefined {
    const context = this.context;
    const master = this.master;
    if (!context || !master) return undefined;
    const gain = context.createGain();
    gain.connect(master);
    return { context, gain, start: context.currentTime + delay };
  }

  private envelope(gain: GainNode, start: number, duration: number, peak: number): void {
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  }

  private tone(
    frequency: number,
    duration: number,
    type: OscillatorType,
    peak: number,
    delay = 0,
  ): void {
    const voice = this.voice(delay);
    if (!voice) return;
    const oscillator = voice.context.createOscillator();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, voice.start);
    oscillator.connect(voice.gain);
    this.envelope(voice.gain, voice.start, duration, peak);
    oscillator.start(voice.start);
    oscillator.stop(voice.start + duration + 0.05);
  }

  private sweep(
    from: number,
    to: number,
    duration: number,
    type: OscillatorType,
    peak: number,
    delay = 0,
  ): void {
    const voice = this.voice(delay);
    if (!voice) return;
    const oscillator = voice.context.createOscillator();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, voice.start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, to), voice.start + duration);
    oscillator.connect(voice.gain);
    this.envelope(voice.gain, voice.start, duration, peak);
    oscillator.start(voice.start);
    oscillator.stop(voice.start + duration + 0.05);
  }

  private burst(
    duration: number,
    type: BiquadFilterType,
    frequency: number,
    peak: number,
    delay = 0,
  ): void {
    const voice = this.voice(delay);
    if (!voice || !this.noise) return;
    const source = voice.context.createBufferSource();
    source.buffer = this.noise;
    const filter = voice.context.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    source.connect(filter);
    filter.connect(voice.gain);
    this.envelope(voice.gain, voice.start, duration, peak);
    source.start(voice.start);
    source.stop(voice.start + duration + 0.05);
  }
}
