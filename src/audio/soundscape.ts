import type { MissionState, Vec2 } from '../sim/types';
import type { AudioPosition } from './mission-audio';
import { clampAudioVolume } from './audio-mix';

export type SoundscapeZone =
  | 'engine-room'
  | 'corridor'
  | 'galley'
  | 'atrium'
  | 'dining'
  | 'cabins'
  | 'promenade'
  | 'pool'
  | 'bridge'
  | 'stairwell'
  | 'exterior';

export interface SoundscapeProfile {
  zone: SoundscapeZone;
  filter: 'lowpass' | 'bandpass';
  frequency: number;
  quality: number;
  level: number;
  sourcePosition: AudioPosition;
  refDistance: number;
  maxDistance: number;
  rolloffFactor: number;
}

export interface SoundscapeFrame {
  zone: SoundscapeZone;
  profile: SoundscapeProfile;
  listenerPosition: AudioPosition;
  level: number;
}

export interface SoundscapeTransition {
  from: SoundscapeZone;
  to: SoundscapeZone;
}

const profiles: Record<SoundscapeZone, SoundscapeProfile> = {
  'engine-room': {
    zone: 'engine-room',
    filter: 'lowpass',
    frequency: 220,
    quality: 0.8,
    level: 0.18,
    sourcePosition: { x: 0, y: 1.4, z: -2 },
    refDistance: 2.5,
    maxDistance: 28,
    rolloffFactor: 1.15,
  },
  corridor: {
    zone: 'corridor',
    filter: 'bandpass',
    frequency: 460,
    quality: 0.55,
    level: 0.08,
    sourcePosition: { x: 0, y: 1.6, z: 6 },
    refDistance: 3,
    maxDistance: 32,
    rolloffFactor: 1.25,
  },
  galley: {
    zone: 'galley',
    filter: 'bandpass',
    frequency: 720,
    quality: 0.7,
    level: 0.13,
    sourcePosition: { x: 0, y: 1.5, z: 4 },
    refDistance: 3,
    maxDistance: 24,
    rolloffFactor: 1.1,
  },
  atrium: {
    zone: 'atrium',
    filter: 'bandpass',
    frequency: 520,
    quality: 0.45,
    level: 0.1,
    sourcePosition: { x: 0, y: 2.4, z: 0 },
    refDistance: 5,
    maxDistance: 42,
    rolloffFactor: 0.9,
  },
  dining: {
    zone: 'dining',
    filter: 'bandpass',
    frequency: 640,
    quality: 0.6,
    level: 0.12,
    sourcePosition: { x: 0, y: 1.8, z: 2 },
    refDistance: 4,
    maxDistance: 30,
    rolloffFactor: 1,
  },
  cabins: {
    zone: 'cabins',
    filter: 'lowpass',
    frequency: 330,
    quality: 0.5,
    level: 0.06,
    sourcePosition: { x: 0, y: 1.4, z: 0 },
    refDistance: 3,
    maxDistance: 22,
    rolloffFactor: 1.35,
  },
  promenade: {
    zone: 'promenade',
    filter: 'bandpass',
    frequency: 820,
    quality: 0.45,
    level: 0.11,
    sourcePosition: { x: -4, y: 1.8, z: 8 },
    refDistance: 5,
    maxDistance: 46,
    rolloffFactor: 0.85,
  },
  pool: {
    zone: 'pool',
    filter: 'bandpass',
    frequency: 1180,
    quality: 0.35,
    level: 0.14,
    sourcePosition: { x: 4, y: 1.8, z: 5 },
    refDistance: 5,
    maxDistance: 48,
    rolloffFactor: 0.8,
  },
  bridge: {
    zone: 'bridge',
    filter: 'bandpass',
    frequency: 980,
    quality: 0.65,
    level: 0.09,
    sourcePosition: { x: 0, y: 1.7, z: 2 },
    refDistance: 3,
    maxDistance: 26,
    rolloffFactor: 1.15,
  },
  stairwell: {
    zone: 'stairwell',
    filter: 'lowpass',
    frequency: 280,
    quality: 0.7,
    level: 0.07,
    sourcePosition: { x: 0, y: 2, z: 0 },
    refDistance: 3,
    maxDistance: 30,
    rolloffFactor: 1.2,
  },
  exterior: {
    zone: 'exterior',
    filter: 'bandpass',
    frequency: 1450,
    quality: 0.3,
    level: 0.16,
    sourcePosition: { x: 0, y: 2, z: 12 },
    refDistance: 6,
    maxDistance: 60,
    rolloffFactor: 0.7,
  },
};

const compartmentZones: Record<string, SoundscapeZone> = {
  'engine-room': 'engine-room',
  'crew-corridor': 'corridor',
  'main-galley': 'galley',
  atrium: 'atrium',
  'dining-room': 'dining',
  'cabin-deck-four': 'cabins',
  'cabin-deck-seven': 'cabins',
  promenade: 'promenade',
  'pool-deck': 'pool',
  'sun-deck': 'exterior',
  bridge: 'bridge',
  'stairwell-aft': 'stairwell',
  'stairwell-mid': 'stairwell',
  'stairwell-fwd': 'stairwell',
  'ship-exterior': 'exterior',
};

const publicZones = new Set<SoundscapeZone>([
  'galley',
  'atrium',
  'dining',
  'promenade',
  'pool',
  'exterior',
]);

export function zoneForCompartment(compartmentId: string | undefined): SoundscapeZone {
  if (!compartmentId) return 'atrium';
  return compartmentZones[compartmentId] ?? 'corridor';
}

export function soundscapeProfile(zone: SoundscapeZone): SoundscapeProfile {
  return profiles[zone];
}

export function audioPosition(position: Vec2): AudioPosition {
  return { x: position.x, y: 1.6, z: position.y };
}

export function soundscapeForState(state: MissionState, localPlayerId: string): SoundscapeFrame {
  const player = state.cabin.players[localPlayerId];
  const zone = zoneForCompartment(player?.compartmentId);
  const profile = soundscapeProfile(zone);
  const listenerPosition = audioPosition(player?.position ?? { x: 0, y: 0 });
  const voyageFactor = state.voyage.phase === 'foundered' ? 0.55 : 1;
  const crowdFactor = state.crowd.evacuating && publicZones.has(zone) ? 0.68 : 1;
  return {
    zone,
    profile,
    listenerPosition,
    level: clampAudioVolume(profile.level * voyageFactor * crowdFactor),
  };
}

export function soundscapeTransition(
  previous: MissionState | undefined,
  next: MissionState,
  localPlayerId: string,
): SoundscapeTransition | undefined {
  if (!previous) return undefined;
  const from = soundscapeForState(previous, localPlayerId).zone;
  const to = soundscapeForState(next, localPlayerId).zone;
  return from === to ? undefined : { from, to };
}
