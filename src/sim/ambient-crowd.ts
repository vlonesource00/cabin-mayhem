import {
  ambientColors,
  ambientCrowdZones,
  ambientNames,
  type AmbientActivity,
} from '../data/ambient-crowd';
import type { AmbientCrowdState, AmbientResidentState, BoardingInvasionPhase, Vec2 } from './types';

const movingActivities = new Set<AmbientActivity>([
  'strolling',
  'cooking',
  'housekeeping',
  'sightseeing',
  'photography',
  'swimming',
  'evacuating',
]);

function unit(seed: number): number {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function pointFor(
  width: number,
  length: number,
  index: number,
  seed: number,
  opposite = false,
): Vec2 {
  const margin = 2.4;
  const lane = (index * 5 + (opposite ? 3 : 0)) % 11;
  const row = (index * 7 + (opposite ? 5 : 0)) % 13;
  return {
    x: margin + (width - margin * 2) * ((lane + unit(seed + index)) / 12),
    y: margin + (length - margin * 2) * ((row + unit(seed + index + 77)) / 14),
  };
}

export function createAmbientCrowdState(seed: number): AmbientCrowdState {
  const residents: Record<string, AmbientResidentState> = {};
  let globalIndex = 0;
  for (const zone of ambientCrowdZones) {
    for (let index = 0; index < zone.count; index += 1) {
      const id = `guest-${String(globalIndex + 1).padStart(3, '0')}`;
      const activity = zone.activities[index % zone.activities.length]!;
      const route: [Vec2, Vec2] = [
        pointFor(zone.width, zone.length, index, seed + globalIndex),
        pointFor(zone.width, zone.length, index, seed + globalIndex, true),
      ];
      if (!movingActivities.has(activity)) route[1] = { ...route[0] };
      residents[id] = {
        id,
        name: ambientNames[globalIndex % ambientNames.length]!,
        color: ambientColors[globalIndex % ambientColors.length]!,
        compartmentId: zone.compartmentId,
        activity,
        homeActivity: activity,
        position: { ...route[0] },
        route,
        routeIndex: 1,
        facing: { x: 0, y: 1 },
        moving: movingActivities.has(activity),
        phase: unit(seed + globalIndex * 31),
      };
      globalIndex += 1;
    }
  }
  return { elapsed: 0, residents, evacuating: false };
}

function invasionRequiresEvacuation(phase: BoardingInvasionPhase): boolean {
  return phase === 'warning' || phase === 'approach' || phase === 'boarders-aboard';
}

export function stepAmbientCrowd(
  state: AmbientCrowdState,
  invasionPhase: BoardingInvasionPhase,
  deltaSeconds: number,
): AmbientCrowdState {
  const dt = Math.max(0, Math.min(0.05, deltaSeconds));
  if (dt === 0) return state;
  const evacuating = invasionRequiresEvacuation(invasionPhase);
  const residents: Record<string, AmbientResidentState> = {};
  for (const [id, resident] of Object.entries(state.residents)) {
    const activity = evacuating ? 'evacuating' : resident.homeActivity;
    const moving = movingActivities.has(activity);
    const target = evacuating
      ? { x: resident.route[0].x, y: resident.route[0].y }
      : resident.route[resident.routeIndex];
    const dx = target.x - resident.position.x;
    const dy = target.y - resident.position.y;
    const distance = Math.hypot(dx, dy);
    const speed = activity === 'evacuating' ? 3.2 : activity === 'swimming' ? 0.75 : 1.1;
    let routeIndex = resident.routeIndex;
    let position = { ...resident.position };
    let facing = { ...resident.facing };
    if (moving && distance > 0.001) {
      const travel = Math.min(distance, speed * dt);
      facing = { x: dx / distance, y: dy / distance };
      position = {
        x: resident.position.x + facing.x * travel,
        y: resident.position.y + facing.y * travel,
      };
      if (!evacuating && distance <= 0.18) routeIndex = routeIndex === 0 ? 1 : 0;
    }
    residents[id] = {
      ...resident,
      activity,
      position,
      facing,
      moving: moving && (evacuating ? distance > 0.18 : true),
      routeIndex,
    };
  }
  return { elapsed: state.elapsed + dt, residents, evacuating };
}
