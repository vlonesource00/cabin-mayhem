import { clamp } from '../sim/math';
import type { MissionState, PlayerState } from '../sim/types';

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
  | 'shift-failed'
  | 'movement-start'
  | 'movement-stop'
  | 'interaction'
  | 'door'
  | 'boarding-warning'
  | 'boarding-approach'
  | 'boarding-aboard'
  | 'boarding-repelled'
  | 'boarding-failed'
  | 'navigation-warning'
  | 'navigation-avoided'
  | 'navigation-impact'
  | 'navigation-repair'
  | 'navigation-repaired';

export interface AudioPosition {
  x: number;
  y: number;
  z: number;
}

export interface AudioCue {
  kind: AudioCueKind;
  /** 0..1 loudness hint; discrete cues that carry no force use 1. */
  intensity: number;
  /** Optional local ship-space position for a distance-aware one-shot. */
  position?: AudioPosition;
}

/** Continuous mission levels, all 0..1. */
export interface AudioMix {
  engine: number;
  wind: number;
  rumble: number;
  fire: number;
  alarm: number;
}

const unit = (value: number): number => clamp(value, 0, 1);

/**
 * Continuous audio is intentionally silent. The mix shape remains compatible
 * for callers and tests; meaningful sound is emitted only as short cues.
 */
export function missionMix(state: MissionState): AudioMix {
  void state;
  return { engine: 0, wind: 0, rumble: 0, fire: 0, alarm: 0 };
}

const positionOf = (player: PlayerState | undefined): AudioPosition | undefined =>
  player
    ? {
        x: player.position.x,
        y: 1.6,
        z: player.position.y,
      }
    : undefined;

const speedOf = (player: PlayerState | undefined): number =>
  player ? Math.hypot(player.velocity.x, player.velocity.y) : 0;

const audibleInteraction = (action: string): boolean => {
  const trimmed = action.trim();
  if (!trimmed) return false;
  return !/^(Teleported|Disconnected|Reconnected|Cart selection|Hold E on)/i.test(trimmed);
};

const navigationCue: Partial<Record<MissionState['navigation']['phase'], AudioCueKind>> = {
  warning: 'navigation-warning',
  avoided: 'navigation-avoided',
  impact: 'navigation-impact',
  repair: 'navigation-repair',
  repaired: 'navigation-repaired',
};

const boardingCue: Partial<Record<MissionState['invasion']['phase'], AudioCueKind>> = {
  warning: 'boarding-warning',
  approach: 'boarding-approach',
  'boarders-aboard': 'boarding-aboard',
  repelled: 'boarding-repelled',
  failed: 'boarding-failed',
};

const firstBoardingPosition = (state: MissionState): AudioPosition | undefined => {
  const link = Object.values(state.invasion.links)[0];
  return link
    ? {
        x: link.position.x,
        y: 1.4,
        z: link.position.y,
      }
    : undefined;
};

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
  const beforePlayer = previous.cabin.players[localPlayerId];
  const afterPlayer = next.cabin.players[localPlayerId];
  const playerPosition = positionOf(afterPlayer);

  if (previous.voyage.phase !== next.voyage.phase) cues.push({ kind: 'phase', intensity: 1 });

  if (previous.fire.status !== 'active' && next.fire.status === 'active')
    cues.push({ kind: 'fire-start', intensity: 1, position: playerPosition });
  if (previous.fire.status === 'active' && next.fire.status === 'suppressed')
    cues.push({ kind: 'fire-out', intensity: 1, position: playerPosition });

  if (previous.repair.status === 'dormant' && next.repair.status === 'active')
    cues.push({ kind: 'repair-start', intensity: 1, position: playerPosition });
  if (previous.repair.status !== 'fixed' && next.repair.status === 'fixed')
    cues.push({ kind: 'repair-fixed', intensity: 1, position: playerPosition });

  const served = Math.max(0, next.service.served - previous.service.served);
  for (let index = 0; index < Math.min(2, served); index += 1)
    cues.push({ kind: 'serve-good', intensity: 1, position: playerPosition });
  const missed = Math.max(0, next.service.missed - previous.service.missed);
  for (let index = 0; index < Math.min(2, missed); index += 1)
    cues.push({ kind: 'serve-bad', intensity: 1, position: playerPosition });

  if (next.cabin.collisionCount > previous.cabin.collisionCount)
    cues.push({
      kind: 'impact',
      intensity: unit(next.cabin.lastImpulse / 6),
      position: playerPosition,
    });

  if (Math.abs(next.voyage.airPocket) > 0.35 && Math.abs(previous.voyage.airPocket) <= 0.35)
    cues.push({
      kind: 'air-pocket',
      intensity: unit(Math.abs(next.voyage.airPocket)),
      position: playerPosition,
    });

  const beforeHeld = beforePlayer?.heldObjectId;
  const afterHeld = afterPlayer?.heldObjectId;
  if (beforeHeld !== afterHeld)
    cues.push({ kind: afterHeld ? 'pickup' : 'release', intensity: 1, position: playerPosition });

  if (previous.service.outcome === 'active' && next.service.outcome !== 'active')
    cues.push({
      kind: next.service.outcome === 'success' ? 'shift-success' : 'shift-failed',
      intensity: 1,
      position: playerPosition,
    });

  const beforeSpeed = speedOf(beforePlayer);
  const afterSpeed = speedOf(afterPlayer);
  if (beforeSpeed <= 0.15 && afterSpeed > 0.15)
    cues.push({
      kind: 'movement-start',
      intensity: unit(afterSpeed / 5),
      position: playerPosition,
    });
  if (beforeSpeed > 0.15 && afterSpeed <= 0.15)
    cues.push({ kind: 'movement-stop', intensity: 1, position: playerPosition });

  if (beforePlayer?.compartmentId !== afterPlayer?.compartmentId && afterPlayer)
    cues.push({ kind: 'door', intensity: 1, position: playerPosition });

  if (
    beforePlayer?.lastAction !== afterPlayer?.lastAction &&
    afterPlayer &&
    audibleInteraction(afterPlayer.lastAction)
  )
    cues.push({ kind: 'interaction', intensity: 1, position: playerPosition });

  if (previous.navigation.phase !== next.navigation.phase) {
    const kind = navigationCue[next.navigation.phase];
    if (kind) cues.push({ kind, intensity: 1, position: playerPosition });
  }

  if (previous.invasion.phase !== next.invasion.phase) {
    const kind = boardingCue[next.invasion.phase];
    if (kind)
      cues.push({
        kind,
        intensity: next.invasion.phase === 'boarders-aboard' ? 1 : 0.9,
        position: firstBoardingPosition(next) ?? playerPosition,
      });
  }

  return cues;
}
