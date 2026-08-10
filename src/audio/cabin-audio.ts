import {
  audioBusLevel,
  audioBusNames,
  clampAudioVolume,
  defaultAudioBusVolumes,
  effectiveMasterGain,
  type AudioBusName,
  type AudioBusVolumes,
} from './audio-mix';
import { missionCues, type AudioCue, type AudioCueKind, type AudioPosition } from './mission-audio';
import { soundscapeForState } from './soundscape';
import type { MissionState } from '../sim/types';

type AudioContextConstructor = new () => AudioContext;

interface Voice {
  context: AudioContext;
  gain: GainNode;
  start: number;
  complete: () => void;
}

const maxCuesPerUpdate = 4;
const maxVoices = 14;

const cueCooldowns: Partial<Record<AudioCueKind, number>> = {
  'movement-start': 0.18,
  'movement-stop': 0.12,
  interaction: 0.08,
  door: 0.25,
  impact: 0.24,
  'air-pocket': 0.7,
  'serve-good': 0.1,
  'serve-bad': 0.15,
  'boarding-warning': 0.8,
  'boarding-approach': 0.8,
  'boarding-aboard': 0.8,
  'navigation-warning': 0.8,
};

function audioContextConstructor(): AudioContextConstructor | undefined {
  const scope = globalThis as typeof globalThis & {
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
  private ambienceDuck?: GainNode;
  private readonly buses = new Map<AudioBusName, GainNode>();
  private readonly busVolumes: AudioBusVolumes = { ...defaultAudioBusVolumes };
  private previous?: MissionState;
  private enabled = true;
  private masterVolume = 0.68;
  private failed = false;
  private alarmActive = false;
  private nextAlarmAt = 0;
  private ambienceDuckUntil = 0;
  private activeVoices = 0;
  private readonly cueLastPlayed = new Map<AudioCueKind, number>();

  /** Starts or resumes the graph. Must be called from a user gesture. */
  public resume(): void {
    if (this.failed || !this.enabled) return;
    if (!this.context) this.build();
    void this.context?.resume().catch(() => undefined);
  }

  public muted(): boolean {
    return !this.enabled;
  }

  public volume(): number {
    return this.masterVolume;
  }

  /** Ambient playback is intentionally empty; only short event voices exist. */
  public continuousSourceCount(): number {
    return 0;
  }

  /** Safe 0..1 master volume control. Does not create or resume audio. */
  public setVolume(volume: number): void {
    this.masterVolume = clampAudioVolume(volume);
    const context = this.context;
    if (!context || !this.master) return;
    this.master.gain.setTargetAtTime(
      effectiveMasterGain(this.masterVolume, this.enabled),
      context.currentTime,
      0.05,
    );
  }

  public busVolume(bus: AudioBusName): number {
    return this.busVolumes[bus];
  }

  /** Safe per-bus 0..1 control for effects, ambience, UI and events. */
  public setBusVolume(bus: AudioBusName, volume: number): void {
    this.busVolumes[bus] = clampAudioVolume(volume);
    const context = this.context;
    const node = this.buses.get(bus);
    if (!context || !node) return;
    node.gain.setTargetAtTime(audioBusLevel(bus, this.busVolumes[bus]), context.currentTime, 0.08);
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    const context = this.context;
    if (!context || !this.master) return;
    this.master.gain.setTargetAtTime(
      effectiveMasterGain(this.masterVolume, enabled),
      context.currentTime,
      0.05,
    );
    if (enabled) void context.resume().catch(() => undefined);
  }

  /** Feeds one snapshot. Safe to call before the graph exists. */
  public update(state: MissionState, localPlayerId: string): void {
    const cues = missionCues(this.previous, state, localPlayerId);
    this.previous = state;
    if (!this.context || !this.enabled) return;

    this.updateListener(soundscapeForState(state, localPlayerId).listenerPosition);
    const alarmActive =
      state.fire.status === 'active' ||
      state.repair.status === 'active' ||
      ['warning', 'impact', 'repair'].includes(state.navigation.phase) ||
      ['warning', 'approach', 'boarders-aboard'].includes(state.invasion.phase);
    this.syncAlarm(alarmActive ? 1 : 0);
    for (const cue of cues.slice(0, maxCuesPerUpdate)) this.playCue(cue);
  }

  public dispose(): void {
    this.previous = undefined;
    this.cueLastPlayed.clear();
    this.buses.clear();
    this.master = undefined;
    this.ambienceDuck = undefined;
    this.alarmActive = false;
    this.nextAlarmAt = 0;
    const context = this.context;
    this.context = undefined;
    void context?.close().catch(() => undefined);
  }

  private updateListener(position: AudioPosition): void {
    const context = this.context;
    if (!context) return;
    const listener = context.listener;
    if (typeof listener.positionX?.setTargetAtTime === 'function') {
      listener.positionX.setTargetAtTime(position.x, context.currentTime, 0.05);
      listener.positionY.setTargetAtTime(position.y, context.currentTime, 0.05);
      listener.positionZ.setTargetAtTime(position.z, context.currentTime, 0.05);
    } else {
      listener.setPosition(position.x, position.y, position.z);
    }
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
    master.gain.value = effectiveMasterGain(this.masterVolume, this.enabled);
    this.master = master;

    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 18;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.01;
    compressor.release.value = 0.2;
    master.connect(compressor);
    compressor.connect(context.destination);

    const ambienceDuck = context.createGain();
    ambienceDuck.gain.value = 1;
    ambienceDuck.connect(master);
    this.ambienceDuck = ambienceDuck;

    for (const bus of audioBusNames) {
      const gain = context.createGain();
      gain.gain.value = audioBusLevel(bus, this.busVolumes[bus]);
      gain.connect(bus === 'ambience' ? ambienceDuck : master);
      this.buses.set(bus, gain);
    }
  }

  private syncAlarm(level: number): void {
    const context = this.context;
    if (!context) return;
    const active = level > 0.01;
    if (!active) {
      this.alarmActive = false;
      this.nextAlarmAt = 0;
      return;
    }
    if (!this.alarmActive || context.currentTime >= this.nextAlarmAt) {
      this.alarmActive = true;
      this.playAlarmPulse();
      this.nextAlarmAt = context.currentTime + 1.45;
    }
  }

  private playAlarmPulse(): void {
    this.tone(660, 0.11, 'square', 0.055, 'events');
    this.tone(880, 0.12, 'square', 0.045, 'events', 0.14);
    this.duckAmbience(0.46, 0.38);
  }

  private setPannerPosition(
    panner: PannerNode,
    position: { x: number; y: number; z: number },
  ): void {
    const context = this.context;
    if (!context) return;
    if (typeof panner.positionX?.setTargetAtTime === 'function') {
      panner.positionX.setTargetAtTime(position.x, context.currentTime, 0.05);
      panner.positionY.setTargetAtTime(position.y, context.currentTime, 0.05);
      panner.positionZ.setTargetAtTime(position.z, context.currentTime, 0.05);
    } else {
      panner.setPosition(position.x, position.y, position.z);
    }
  }

  private playCue(cue: AudioCue): void {
    const context = this.context;
    if (!context || !this.canPlayCue(cue)) return;
    const position = cue.position;
    switch (cue.kind) {
      case 'phase':
        this.tone(523, 0.1, 'triangle', 0.055, 'ui');
        this.tone(784, 0.16, 'triangle', 0.05, 'ui', 0.09);
        break;
      case 'fire-start':
        this.sweep(420, 180, 0.26, 'sawtooth', 0.06, 'events', position);
        this.duckAmbience(0.52, 0.34);
        break;
      case 'fire-out':
        this.burst(0.32, 'lowpass', 1250, 0.06, 'events', position);
        break;
      case 'repair-start':
        this.tone(196, 0.1, 'square', 0.045, 'events', 0, position);
        this.tone(196, 0.1, 'square', 0.04, 'events', 0.15, position);
        break;
      case 'repair-fixed':
        this.tone(523, 0.1, 'triangle', 0.05, 'ui', 0, position);
        this.tone(659, 0.1, 'triangle', 0.045, 'ui', 0.1, position);
        this.tone(784, 0.16, 'triangle', 0.045, 'ui', 0.2, position);
        break;
      case 'serve-good':
        this.tone(880, 0.08, 'sine', 0.045, 'ui', 0, position);
        this.tone(1320, 0.1, 'sine', 0.04, 'ui', 0.08, position);
        break;
      case 'serve-bad':
        this.sweep(220, 145, 0.18, 'square', 0.05, 'ui', position);
        break;
      case 'impact':
        this.burst(0.14, 'lowpass', 190, 0.045 + cue.intensity * 0.09, 'effects', position);
        this.duckAmbience(0.55, 0.2);
        break;
      case 'air-pocket':
        this.sweep(360, 120, 0.38, 'sine', 0.04 + cue.intensity * 0.05, 'effects', position);
        break;
      case 'pickup':
        this.tone(620, 0.05, 'square', 0.035, 'effects', 0, position);
        break;
      case 'release':
        this.tone(390, 0.05, 'square', 0.03, 'effects', 0, position);
        break;
      case 'shift-success':
        [523, 659, 784].forEach((frequency, index) =>
          this.tone(frequency, 0.12, 'triangle', 0.045, 'ui', index * 0.1),
        );
        break;
      case 'shift-failed':
        [330, 247, 185].forEach((frequency, index) =>
          this.tone(frequency, 0.18, 'sawtooth', 0.04, 'ui', index * 0.13),
        );
        break;
      case 'movement-start':
        this.burst(0.045, 'highpass', 1100, 0.022, 'effects', position);
        break;
      case 'movement-stop':
        this.burst(0.06, 'lowpass', 260, 0.02, 'effects', position);
        break;
      case 'interaction':
        this.tone(760, 0.045, 'square', 0.025, 'effects', 0, position);
        break;
      case 'door':
        this.burst(0.18, 'bandpass', 250, 0.04, 'effects', position);
        this.tone(980, 0.05, 'triangle', 0.022, 'effects', 0.06, position);
        this.duckAmbience(0.78, 0.12);
        break;
      case 'boarding-warning':
        this.tone(330, 0.16, 'square', 0.05, 'events', 0, position);
        this.tone(330, 0.16, 'square', 0.05, 'events', 0.26, position);
        this.duckAmbience(0.42, 0.55);
        break;
      case 'boarding-approach':
        this.sweep(180, 320, 0.45, 'sawtooth', 0.05, 'events', position);
        this.duckAmbience(0.45, 0.55);
        break;
      case 'boarding-aboard':
        this.burst(0.3, 'lowpass', 120, 0.08, 'events', position);
        this.tone(260, 0.18, 'square', 0.04, 'events', 0.16, position);
        this.duckAmbience(0.35, 0.65);
        break;
      case 'boarding-repelled':
        this.sweep(240, 580, 0.3, 'triangle', 0.05, 'ui', position);
        break;
      case 'boarding-failed':
        this.sweep(460, 110, 0.55, 'sawtooth', 0.06, 'events', position);
        this.duckAmbience(0.34, 0.7);
        break;
      case 'navigation-warning':
        this.tone(740, 0.12, 'square', 0.045, 'events', 0, position);
        this.tone(740, 0.12, 'square', 0.045, 'events', 0.22, position);
        this.duckAmbience(0.38, 0.5);
        break;
      case 'navigation-avoided':
        this.sweep(300, 650, 0.34, 'triangle', 0.045, 'ui', position);
        break;
      case 'navigation-impact':
        this.burst(0.38, 'lowpass', 105, 0.1, 'events', position);
        this.duckAmbience(0.3, 0.7);
        break;
      case 'navigation-repair':
        this.tone(190, 0.18, 'square', 0.04, 'events', 0, position);
        break;
      case 'navigation-repaired':
        this.tone(440, 0.1, 'triangle', 0.045, 'ui', 0, position);
        this.tone(660, 0.14, 'triangle', 0.04, 'ui', 0.1, position);
        break;
    }
  }

  private canPlayCue(cue: AudioCue): boolean {
    const context = this.context;
    if (!context || this.activeVoices >= maxVoices) return false;
    const cooldown = cueCooldowns[cue.kind] ?? 0;
    const last = this.cueLastPlayed.get(cue.kind) ?? -Infinity;
    if (context.currentTime - last < cooldown) return false;
    this.cueLastPlayed.set(cue.kind, context.currentTime);
    return true;
  }

  private duckAmbience(level: number, duration: number): void {
    const context = this.context;
    const duck = this.ambienceDuck;
    if (!context || !duck) return;
    const now = context.currentTime;
    const until = Math.max(this.ambienceDuckUntil, now + duration);
    this.ambienceDuckUntil = until;
    duck.gain.setTargetAtTime(clampAudioVolume(level), now, 0.025);
    duck.gain.setTargetAtTime(1, until, 0.16);
  }

  private voice(
    delay: number,
    bus: AudioBusName,
    position?: AudioCue['position'],
  ): Voice | undefined {
    const context = this.context;
    const busNode = this.buses.get(bus);
    if (!context || !busNode || !this.enabled || this.activeVoices >= maxVoices) return undefined;
    const gain = context.createGain();
    if (position) {
      const panner = context.createPanner();
      panner.panningModel = 'equalpower';
      panner.distanceModel = 'inverse';
      panner.refDistance = 2.5;
      panner.maxDistance = 35;
      panner.rolloffFactor = 1.2;
      this.setPannerPosition(panner, position);
      gain.connect(panner);
      panner.connect(busNode);
    } else gain.connect(busNode);
    this.activeVoices += 1;
    let completed = false;
    const complete = (): void => {
      if (completed) return;
      completed = true;
      this.activeVoices = Math.max(0, this.activeVoices - 1);
    };
    return { context, gain, start: context.currentTime + delay, complete };
  }

  private envelope(gain: GainNode, start: number, duration: number, peak: number): void {
    const safePeak = Math.max(0.0001, Math.min(0.3, peak));
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(safePeak, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  }

  private tone(
    frequency: number,
    duration: number,
    type: OscillatorType,
    peak: number,
    bus: AudioBusName,
    delay = 0,
    position?: AudioCue['position'],
  ): void {
    const voice = this.voice(delay, bus, position);
    if (!voice) return;
    const oscillator = voice.context.createOscillator();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, voice.start);
    oscillator.connect(voice.gain);
    this.envelope(voice.gain, voice.start, duration, peak);
    oscillator.onended = voice.complete;
    oscillator.start(voice.start);
    oscillator.stop(voice.start + duration + 0.05);
  }

  private sweep(
    from: number,
    to: number,
    duration: number,
    type: OscillatorType,
    peak: number,
    bus: AudioBusName,
    position?: AudioCue['position'],
    delay = 0,
  ): void {
    const voice = this.voice(delay, bus, position);
    if (!voice) return;
    const oscillator = voice.context.createOscillator();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, voice.start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, to), voice.start + duration);
    oscillator.connect(voice.gain);
    this.envelope(voice.gain, voice.start, duration, peak);
    oscillator.onended = voice.complete;
    oscillator.start(voice.start);
    oscillator.stop(voice.start + duration + 0.05);
  }

  private burst(
    duration: number,
    _type: BiquadFilterType,
    frequency: number,
    peak: number,
    bus: AudioBusName,
    position?: AudioCue['position'],
    delay = 0,
  ): void {
    this.tone(frequency, duration, 'sine', peak, bus, delay, position);
  }
}
