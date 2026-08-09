export const audioBusNames = ['effects', 'ambience', 'ui', 'events'] as const;

export type AudioBusName = (typeof audioBusNames)[number];

export type AudioBusVolumes = Record<AudioBusName, number>;

/** Conservative defaults keep procedural voices below full-scale before compression. */
export const defaultAudioBusVolumes: Readonly<AudioBusVolumes> = {
  effects: 0.72,
  ambience: 0.52,
  ui: 0.78,
  events: 0.68,
};

/** Per-bus ceilings leave headroom for overlapping one-shots. */
export const audioBusCeilings: Readonly<AudioBusVolumes> = {
  effects: 0.78,
  ambience: 0.62,
  ui: 0.82,
  events: 0.72,
};

export function clampAudioVolume(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

export function effectiveMasterGain(volume: number, enabled: boolean): number {
  return enabled ? clampAudioVolume(volume) : 0;
}

export function audioBusLevel(bus: AudioBusName, value: number): number {
  return clampAudioVolume(value) * audioBusCeilings[bus];
}
