import type { AmbientActivity } from '../sim/types';
import type { AmbientResidentState } from '../sim/types';
import type { AmbientArchetype } from '../data/ambient-crowd';
import { ambientStableHash } from './ambient-npc-style';

export type AmbientPresentationMode = 'standing' | 'seated' | 'swimming';

export interface AmbientSeatAnchor {
  /** Host-owned playfield point. Never rewritten by presentation smoothing. */
  position: { x: number; y: number };
  surfaceHeight: number;
  /** Root correction that puts authored seated feet on the surface. */
  rootHeight: number;
  /** Authored seated pelvis drop, retained as an explicit contract value. */
  pelvisDrop: number;
  /** Measured CM_PASSENGER seated bound before root correction. */
  footContactHeight: number;
  yawOffset: number;
}

export interface AmbientPresentationState {
  mode: AmbientPresentationMode;
  clip: string;
  rootHeight: number;
  rotationZ: number;
  yawOffset: number;
  seat?: AmbientSeatAnchor;
}

const seatedActivities = new Set<AmbientActivity>(['dining', 'sunbathing']);

const defaultClips: Record<AmbientActivity, string> = {
  strolling: 'walk',
  chatting: 'idle',
  dining: 'seat_idle',
  cooking: 'carry_walk',
  housekeeping: 'push_cart',
  sightseeing: 'idle',
  photography: 'idle',
  swimming: 'sprint',
  sunbathing: 'seat_idle',
  evacuating: 'sprint',
};

const seatedClips: Record<'dining' | 'sunbathing', readonly string[]> = {
  dining: ['seat_idle', 'seat_wave', 'seat_impatient'],
  sunbathing: ['seat_idle', 'seat_turbulence', 'seat_impatient'],
};

export const ambientActivityClip = (activity: AmbientActivity): string => defaultClips[activity];

export function ambientSeatAnchor(
  resident: AmbientResidentState,
  style: AmbientArchetype,
): AmbientSeatAnchor {
  const seat = style.seat;
  return {
    position: { ...resident.position },
    surfaceHeight: seat.surfaceHeight,
    rootHeight: seat.surfaceHeight - seat.footContactHeight * style.silhouette.height,
    pelvisDrop: seat.pelvisDrop,
    footContactHeight: seat.footContactHeight * style.silhouette.height,
    yawOffset: seat.yawOffset,
  };
}

function seatedClip(resident: AmbientResidentState): string {
  const clips = seatedClips[resident.activity as 'dining' | 'sunbathing'];
  return clips[ambientStableHash(`${resident.id}:${resident.activity}`) % clips.length]!;
}

/** Maps host activity to an authored looping GLB clip plus presentation state. */
export function ambientPresentationFor(
  resident: AmbientResidentState,
  style: AmbientArchetype,
): AmbientPresentationState {
  if (seatedActivities.has(resident.activity)) {
    const seat = ambientSeatAnchor(resident, style);
    return {
      mode: 'seated',
      clip: seatedClip(resident),
      rootHeight: seat.rootHeight,
      rotationZ: 0,
      yawOffset: seat.yawOffset,
      seat,
    };
  }

  if (resident.activity === 'swimming') {
    return {
      mode: 'swimming',
      clip: defaultClips.swimming,
      rootHeight: -0.55,
      rotationZ: Math.PI / 2,
      yawOffset: 0,
    };
  }

  return {
    mode: 'standing',
    clip: defaultClips[resident.activity],
    rootHeight: 0,
    rotationZ: 0,
    yawOffset: 0,
  };
}

export function isAmbientSeatedActivity(activity: AmbientActivity): boolean {
  return seatedActivities.has(activity);
}
