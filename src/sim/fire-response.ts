import { galleyFireDefinition } from '../data/emergencies';
import { clamp, distance } from './math';
import type { CabinObject, FireState, Vec2 } from './types';

export interface FireActionResult {
  fire: FireState;
  accepted: boolean;
  message: string;
}

export function createFireState(): FireState {
  return {
    ...galleyFireDefinition,
    position: { ...galleyFireDefinition.position },
    status: 'dormant',
    intensity: 0,
  };
}

export function activateFire(current: FireState): FireActionResult {
  if (current.status === 'active')
    return { fire: current, accepted: false, message: 'Galley fire already active' };
  return {
    fire: { ...current, status: 'active', intensity: galleyFireDefinition.initialIntensity },
    accepted: true,
    message: 'GALLEY FIRE - grab extinguisher now',
  };
}

export function suppressFire(
  current: FireState,
  object: CabinObject | undefined,
  playerPosition: Vec2,
): FireActionResult {
  if (current.status === 'dormant')
    return { fire: current, accepted: false, message: 'No active fire to suppress' };
  if (current.status === 'suppressed')
    return { fire: current, accepted: false, message: 'Galley fire already suppressed' };
  if (!object || object.kind !== 'extinguisher')
    return { fire: current, accepted: false, message: 'Extinguisher required for galley fire' };
  if (distance(playerPosition, current.position) > current.radius + 2.25)
    return { fire: current, accepted: false, message: 'Move closer to spray the galley fire' };

  const intensity = clamp(current.intensity - 0.75, 0, 1);
  const suppressed = intensity <= 0.12;
  return {
    fire: { ...current, intensity, status: suppressed ? 'suppressed' : 'active' },
    accepted: true,
    message: suppressed
      ? 'Galley fire suppressed. Cabin stabilising.'
      : 'Foam landed. Keep spraying.',
  };
}

export function stepFire(current: FireState, deltaSeconds: number): FireState {
  if (current.status !== 'active') return current;
  return { ...current, intensity: clamp(current.intensity + deltaSeconds * 0.012, 0, 1) };
}
