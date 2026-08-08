import { clamp } from '../sim/math';
import type { MissionState } from '../sim/types';

export type AudioCueKind =
  | 'phase'
  | 'fire-start'
  | 'fire-out'
  | 'repair-start'
  | 'repair-fixed'
  | 'serve-good'
  | 'serve-bad'
  | 'impact'
  | 'air-pocket'
  | 'pickup'
  | 'release'
  | 'shift-success'
  | 'shift-failed';

export interface AudioCue {
  kind: AudioCueKind;
  /** 0..1 loudness hint; discrete cues that carry no force use 1. */
  intensity: number;
}

/** Continuous bed levels, all 0..1. */
export interface AudioMix {
  engine: number;
  wind: number;
  rumble: number;
  fire: number;
  alarm: number;
}

const unit = (value: number): number => clamp(value, 0, 1);

const phaseEngine: Record<MissionState['voyage']['phase'], number> = {
  moored: 0.12,
  preparation: 0.3,
  departure: 0.85,
  'open-sea': 0.55,
  approach: 0.45,
  docked: 0.18,
  foundered: 0,
};

/**
 * Continuous audio bed for a mission snapshot. Pure projection: a guest holding
 * only host snapshots derives exactly the same mix as the host.
 */
export function missionMix(state: MissionState): AudioMix {
  const { voyage, fire, repair } = state;
  const engineFloor = phaseEngine[voyage.phase];
  const engine = unit(
    engineFloor * 0.55 + unit(Math.abs(voyage.telegraph)) * 0.45 * (engineFloor > 0 ? 1 : 0),
  );
  const wind = unit(Math.abs(voyage.speed) / 22) * (voyage.phase === 'foundered' ? 0 : 1);
  const rumble = unit(voyage.turbulence * 0.8 + Math.abs(voyage.airPocket) * 0.5);
  const fireLevel = fire.status === 'active' ? unit(fire.intensity) : 0;
  const alarm = fire.status === 'active' || repair.status === 'active' ? 1 : 0;
  return { engine, wind, rumble, fire: fireLevel, alarm };
}

/**
 * Discrete cues implied by the step from `previous` to `next`. Derived from
 * authoritative state deltas rather than event text, so the cue stream survives
 * dropped snapshots and never depends on log wording.
 */
export function missionCues(
  previous: MissionState | undefined,
  next: MissionState,
  localPlayerId: string,
): AudioCue[] {
  if (!previous) return [];
  const cues: AudioCue[] = [];

  if (previous.voyage.phase !== next.voyage.phase) cues.push({ kind: 'phase', intensity: 1 });

  if (previous.fire.status !== 'active' && next.fire.status === 'active')
    cues.push({ kind: 'fire-start', intensity: 1 });
  if (previous.fire.status === 'active' && next.fire.status === 'suppressed')
    cues.push({ kind: 'fire-out', intensity: 1 });

  if (previous.repair.status === 'dormant' && next.repair.status === 'active')
    cues.push({ kind: 'repair-start', intensity: 1 });
  if (previous.repair.status !== 'fixed' && next.repair.status === 'fixed')
    cues.push({ kind: 'repair-fixed', intensity: 1 });

  const served = next.service.served - previous.service.served;
  for (let index = 0; index < served; index += 1) cues.push({ kind: 'serve-good', intensity: 1 });
  const missed = next.service.missed - previous.service.missed;
  for (let index = 0; index < missed; index += 1) cues.push({ kind: 'serve-bad', intensity: 1 });

  if (next.cabin.collisionCount > previous.cabin.collisionCount)
    cues.push({ kind: 'impact', intensity: unit(next.cabin.lastImpulse / 6) });

  if (Math.abs(next.voyage.airPocket) > 0.35 && Math.abs(previous.voyage.airPocket) <= 0.35)
    cues.push({ kind: 'air-pocket', intensity: unit(Math.abs(next.voyage.airPocket)) });

  const before = previous.cabin.players[localPlayerId]?.heldObjectId;
  const after = next.cabin.players[localPlayerId]?.heldObjectId;
  if (before !== after) cues.push({ kind: after ? 'pickup' : 'release', intensity: 1 });

  if (previous.service.outcome === 'active' && next.service.outcome !== 'active')
    cues.push({
      kind: next.service.outcome === 'success' ? 'shift-success' : 'shift-failed',
      intensity: 1,
    });

  return cues;
}
